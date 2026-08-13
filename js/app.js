/**
 * Main app logic — handles data fetching, UI updates, and optimization.
 * Fetches market data via the built-in Cloudflare Worker CORS proxy.
 */

let currentCandles = [];
let equityChart = null;

// === DATA FETCHING ===

async function fetchData() {
  const symbol = document.getElementById("symbol").value;
  const interval = document.getElementById("interval").value;
  const range = document.getElementById("range").value;
  const status = document.getElementById("dataStatus");
  const btn = document.getElementById("fetchBtn");

  btn.disabled = true;
  btn.textContent = "Fetching...";
  status.textContent = `Fetching ${symbol} ${interval} data via proxy...`;

  try {
    // Call the built-in Cloudflare Worker CORS proxy (no CORS errors, 100% reliable)
    const proxyUrl = `/api/yahoo?sym=${encodeURIComponent(symbol)}&interval=${interval}&range=${range}`;
    const resp = await fetch(proxyUrl);
    if (!resp.ok) throw new Error(`Proxy HTTP ${resp.status}`);
    const data = await resp.json();

    if (!data.chart || !data.chart.result) throw new Error("No data returned");

    const r = data.chart.result[0];
    const ts = r.timestamp;
    const q = r.indicators.quote[0];

    currentCandles = [];
    for (let i = 0; i < ts.length; i++) {
      if (q.open[i] == null) continue;
      currentCandles.push({
        datetime: new Date(ts[i] * 1000),
        open: q.open[i], high: q.high[i], low: q.low[i],
        close: q.close[i], volume: q.volume[i],
      });
    }

    if (currentCandles.length === 0) throw new Error("No valid candles");

    status.innerHTML = `<span style="color:var(--green)">✓</span> Loaded ${currentCandles.length} bars | ${currentCandles[0].datetime.toLocaleDateString()} → ${currentCandles[currentCandles.length-1].datetime.toLocaleDateString()} | Price: ${currentCandles[0].close.toFixed(2)} → ${currentCandles[currentCandles.length-1].close.toFixed(2)}`;
    document.getElementById("opt-section").classList.remove("hidden");
  } catch (err) {
    status.innerHTML = `<span style="color:var(--red)">✗</span> Fetch failed: ${err.message}. Try uploading a CSV file instead.`;
  }
  btn.textContent = "Fetch Data";
  btn.disabled = false;
}

// === CSV UPLOAD ===

function handleCSVUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    const lines = text.trim().split("\n");
    const header = lines[0].toLowerCase().split(",").map(s => s.trim());

    const idx = {};
    ["datetime","open","high","low","close","volume"].forEach(col => {
      idx[col] = header.findIndex(h => h.includes(col));
    });

    currentCandles = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");
      if (parts.length < 5) continue;
      currentCandles.push({
        datetime: idx.datetime >= 0 ? new Date(parts[idx.datetime]) : new Date(i * 60000),
        open: parseFloat(parts[idx.open]),
        high: parseFloat(parts[idx.high]),
        low: parseFloat(parts[idx.low]),
        close: parseFloat(parts[idx.close]),
        volume: idx.volume >= 0 ? parseFloat(parts[idx.volume]) : 0,
      });
    }

    const status = document.getElementById("dataStatus");
    status.innerHTML = `<span style="color:var(--green)">✓</span> Loaded ${currentCandles.length} bars from CSV | ${currentCandles[0].datetime.toLocaleDateString()} → ${currentCandles[currentCandles.length-1].datetime.toLocaleDateString()}`;
    document.getElementById("opt-section").classList.remove("hidden");
  };
  reader.readAsText(file);
}

// === OPTIMIZATION ===

function runOptimization() {
  if (currentCandles.length === 0) {
    alert("Please fetch or upload data first.");
    return;
  }

  const method = document.getElementById("method").value;
  const nTrials = parseInt(document.getElementById("trials").value);
  const step = parseInt(document.getElementById("step").value);
  const minTrades = parseInt(document.getElementById("minTrades").value);
  const objective = document.getElementById("objective").value;

  const btn = document.getElementById("optimizeBtn");
  const status = document.getElementById("optStatus");
  const progressBar = document.getElementById("optProgress");
  const progressFill = document.getElementById("optProgressBar");

  btn.disabled = true;
  btn.textContent = "Running...";
  status.textContent = `Running ${method} optimization...`;
  progressBar.classList.remove("hidden");

  const worker = new Worker("js/worker.js");

  worker.onmessage = function(e) {
    if (e.data.type === "progress") {
      const pct = (e.data.count / e.data.total) * 100;
      progressFill.style.width = pct + "%";
      status.textContent = `Grid search: ${e.data.count}/${e.data.total} (${pct.toFixed(1)}%)`;
    } else if (e.data.type === "done") {
      const results = e.data.results;
      progressFill.style.width = "100%";
      status.innerHTML = `<span style="color:var(--green)">✓</span> Optimization complete — ${results.length} valid results found`;

      displayResults(results, objective);
      btn.textContent = "Run Optimization";
      btn.disabled = false;

      setTimeout(() => progressBar.classList.add("hidden"), 2000);
      worker.terminate();
    }
  };

  worker.postMessage({ candles: currentCandles, method, nTrials, step, minTrades, objective });
}

// === DISPLAY RESULTS — TOP 7 ===

function displayResults(results, objective) {
  const section = document.getElementById("results-section");
  section.classList.remove("hidden");

  const top7 = results.slice(0, 7);
  const top = top7[0];
  const metricsGrid = document.getElementById("topMetrics");
  const pf = top.profitFactor === 999.99 ? "∞" : top.profitFactor.toFixed(2);

  metricsGrid.innerHTML = `
    <div class="metric-box"><div class="label">Net P&L</div><div class="value green">${top.netPnl.toFixed(1)}</div></div>
    <div class="metric-box"><div class="label">Return %</div><div class="value green">${top.returnPct.toFixed(2)}%</div></div>
    <div class="metric-box"><div class="label">Total Trades</div><div class="value blue">${top.totalTrades}</div></div>
    <div class="metric-box"><div class="label">Win Rate</div><div class="value green">${top.winRate.toFixed(1)}%</div></div>
    <div class="metric-box"><div class="label">Profit Factor</div><div class="value yellow">${pf}</div></div>
    <div class="metric-box"><div class="label">Max Drawdown</div><div class="value red">${top.maxDrawdown.toFixed(2)}%</div></div>
    <div class="metric-box"><div class="label">Sharpe</div><div class="value blue">${top.sharpe.toFixed(2)}</div></div>
    <div class="metric-box"><div class="label">Avg Trade</div><div class="value">${top.avgTrade.toFixed(1)}</div></div>
  `;

  const p = top.params;
  metricsGrid.innerHTML += `
    <div class="metric-box"><div class="label">Engulfing Min</div><div class="value">${p.engulfing_min_body}</div></div>
    <div class="metric-box"><div class="label">Doji Max</div><div class="value">${p.doji_body_max}</div></div>
    <div class="metric-box"><div class="label">Activate At</div><div class="value">${p.activate_at}</div></div>
    <div class="metric-box"><div class="label">Lock Profit</div><div class="value">${p.lock_profit_at}</div></div>
    <div class="metric-box"><div class="label">Profit Step</div><div class="value">${p.increase_profit_by}</div></div>
    <div class="metric-box"><div class="label">TSL Step</div><div class="value">${p.increase_tsl_by}</div></div>
  `;

  if (top.equityCurve) {
    const ctx = document.getElementById("equityChart").getContext("2d");
    if (equityChart) equityChart.destroy();
    equityChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: top.equityCurve.map((_, i) => i),
        datasets: [{
          label: "Equity",
          data: top.equityCurve,
          borderColor: "#58a6ff",
          backgroundColor: "rgba(88,166,255,0.1)",
          fill: true,
          tension: 0.1,
          pointRadius: 0,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: "#30363d" }, ticks: { color: "#8b949e" } },
          x: { grid: { display: false }, ticks: { color: "#8b949e", maxTicksLimit: 10 } },
        },
      },
    });
  }

  const tbody = document.getElementById("resultsBody");
  tbody.innerHTML = top7.map((r, i) => {
    const rp = r.params;
    const rpf = r.profitFactor === 999.99 ? "∞" : r.profitFactor.toFixed(2);
    return `<tr ${i === 0 ? 'class="highlight"' : ""}>
      <td>${i + 1}</td>
      <td style="color:${r.netPnl >= 0 ? 'var(--green)' : 'var(--red)'}">${r.netPnl.toFixed(1)}</td>
      <td>${r.returnPct.toFixed(2)}%</td>
      <td>${r.totalTrades}</td>
      <td>${r.winRate.toFixed(1)}%</td>
      <td>${rpf}</td>
      <td>${r.maxDrawdown.toFixed(2)}%</td>
      <td>${r.sharpe.toFixed(2)}</td>
      <td>${rp.engulfing_min_body}</td>
      <td>${rp.doji_body_max}</td>
      <td>${rp.activate_at}</td>
      <td>${rp.lock_profit_at}</td>
      <td>${rp.increase_profit_by}</td>
      <td>${rp.increase_tsl_by}</td>
    </tr>`;
  }).join("");

  const tradesSection = document.getElementById("trades-section");
  const tradesBody = document.getElementById("tradesBody");
  if (top.trades && top.trades.length > 0) {
    tradesSection.classList.remove("hidden");
    tradesBody.innerHTML = top.trades.map((t, i) => {
      return `<tr>
        <td>${i + 1}</td>
        <td style="color:${t.direction === 'long' ? 'var(--green)' : 'var(--red)'}">${t.direction.toUpperCase()}</td>
        <td>${t.entryPrice.toFixed(2)}</td>
        <td>${t.exitPrice.toFixed(2)}</td>
        <td style="color:${t.pnl >= 0 ? 'var(--green)' : 'var(--red)'}">${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}</td>
      </tr>`;
    }).join("");
  }
}

// === EVENT LISTENERS ===

document.addEventListener("DOMContentLoaded", function() {
  document.getElementById("fetchBtn").addEventListener("click", fetchData);
  document.getElementById("csvFile").addEventListener("change", handleCSVUpload);
  document.getElementById("optimizeBtn").addEventListener("click", runOptimization);

  document.getElementById("method").addEventListener("change", function() {
    if (this.value === "grid") {
      document.getElementById("trialsGroup").classList.add("hidden");
      document.getElementById("stepGroup").classList.remove("hidden");
    } else {
      document.getElementById("trialsGroup").classList.remove("hidden");
      document.getElementById("stepGroup").classList.add("hidden");
    }
  });
});
