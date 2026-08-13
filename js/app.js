/**
 * Main app logic — handles data fetching, UI updates, and optimization.
 * Uses Yahoo Finance for ≤60 day ranges, Twelve Data for >60 day ranges.
 */

let currentCandles = [];
let equityChart = null;

// === DEFAULT DATES (60 days — works with Yahoo, no API key needed) ===

function initDefaultDates() {
  const today = new Date();
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(today.getDate() - 60);

  document.getElementById("toDate").value = today.toISOString().split("T")[0];
  document.getElementById("fromDate").value = sixtyDaysAgo.toISOString().split("T")[0];
}

// === Convert From/To dates to Yahoo Finance range string ===

function dateRangeToYahooRange(fromDate, toDate) {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  const diffDays = Math.round((to - from) / (1000 * 60 * 60 * 24));

  if (diffDays <= 1) return "1d";
  if (diffDays <= 5) return "5d";
  if (diffDays <= 30) return "1mo";
  if (diffDays <= 60) return "3mo";
  return null; // Too long for Yahoo intraday — needs Twelve Data
}

// === Map Yahoo interval to Twelve Data interval ===

function yahooToTDInterval(yahooInterval) {
  const map = { "1m": "1min", "3m": "3min", "5m": "5min", "15m": "15min", "30m": "30min", "60m": "60min", "1d": "1day" };
  return map[yahooInterval] || "5min";
}

// === Map Yahoo symbol to Twelve Data symbol ===

function yahooToTDSymbol(yahooSym) {
  const map = {
    "^NSEI": "NIFTY 50",
    "^BSESN": "SENSEX",
    "BTC-USD": "BTC/USD",
    "ETH-USD": "ETH/USD",
    "AAPL": "AAPL",
    "TSLA": "TSLA",
    "RELIANCE.NS": "RELIANCE",
  };
  return map[yahooSym] || yahooSym;
}

// === DATA FETCHING ===

async function fetchData() {
  const symbol = document.getElementById("symbol").value;
  const interval = document.getElementById("interval").value;
  const fromDate = document.getElementById("fromDate").value;
  const toDate = document.getElementById("toDate").value;
  const tdKeyInput = document.getElementById("tdKey");
  const tdKey = tdKeyInput ? tdKeyInput.value.trim() : "";
  const status = document.getElementById("dataStatus");
  const btn = document.getElementById("fetchBtn");

  if (!fromDate || !toDate) {
    status.innerHTML = '<span style="color:var(--red)">✗</span> Please select both From and To dates.';
    return;
  }

  if (new Date(toDate) <= new Date(fromDate)) {
    status.innerHTML = '<span style="color:var(--red)">✗</span> To Date must be after From Date.';
    return;
  }

  const yahooRange = dateRangeToYahooRange(fromDate, toDate);

  btn.disabled = true;
  btn.textContent = "Fetching...";
  status.textContent = `Fetching ${symbol} ${interval} data...`;

  try {
    if (yahooRange) {
      // === Use Yahoo Finance (≤60 days, no API key needed) ===
      status.textContent = `Fetching from Yahoo Finance (range: ${yahooRange})...`;
      const proxyUrl = `/api/yahoo?sym=${encodeURIComponent(symbol)}&interval=${interval}&range=${yahooRange}`;
      const resp = await fetch(proxyUrl);
      if (!resp.ok) throw new Error(`Proxy HTTP ${resp.status}`);
      const data = await resp.json();

      if (!data.chart || !data.chart.result) {
        const errMsg = (data.chart && data.chart.error && data.chart.error.description) || "No data returned";
        throw new Error(errMsg);
      }

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

      // Filter to selected date range
      const fromMs = new Date(fromDate).getTime();
      const toMs = new Date(toDate).getTime() + 86400000;
      currentCandles = currentCandles.filter(c => c.datetime.getTime() >= fromMs && c.datetime.getTime() <= toMs);

      if (currentCandles.length === 0) throw new Error("No candles in selected date range");

      status.innerHTML = `<span style="color:var(--green)">✓</span> Loaded ${currentCandles.length} bars (Yahoo) | ${currentCandles[0].datetime.toLocaleDateString()} → ${currentCandles[currentCandles.length-1].datetime.toLocaleDateString()} | Price: ${currentCandles[0].close.toFixed(2)} → ${currentCandles[currentCandles.length-1].close.toFixed(2)}`;
      document.getElementById("opt-section").classList.remove("hidden");

    } else {
      // === Use Twelve Data (>60 days, needs free API key) ===
      if (!tdKey) {
        throw new Error("Date range is over 60 days. For longer history you need a free Twelve Data API key (30-second signup at twelvedata.com). Or select a date range within 60 days to use Yahoo Finance without a key.");
      }

      const tdSym = yahooToTDSymbol(symbol);
      const tdInterval = yahooToTDInterval(interval);
      status.textContent = `Fetching from Twelve Data (${tdSym}, ${tdInterval})...`;

      const proxyUrl = `/api/twelvedata?sym=${encodeURIComponent(tdSym)}&interval=${tdInterval}&start=${fromDate}&end=${toDate}&apikey=${encodeURIComponent(tdKey)}`;
      const resp = await fetch(proxyUrl);
      if (!resp.ok) throw new Error(`Proxy HTTP ${resp.status}`);
      const data = await resp.json();

      if (data.status === "error") {
        throw new Error(data.message || data.code || "Twelve Data API error");
      }

      if (!data.values || data.values.length === 0) {
        throw new Error("No data returned from Twelve Data");
      }

      // Twelve Data returns newest first — reverse to oldest first
      const values = data.values.reverse();
      currentCandles = values.map(v => ({
        datetime: new Date(v.datetime),
        open: parseFloat(v.open),
        high: parseFloat(v.high),
        low: parseFloat(v.low),
        close: parseFloat(v.close),
        volume: 0,
      }));

      status.innerHTML = `<span style="color:var(--green)">✓</span> Loaded ${currentCandles.length} bars (Twelve Data) | ${currentCandles[0].datetime.toLocaleDateString()} → ${currentCandles[currentCandles.length-1].datetime.toLocaleDateString()} | Price: ${currentCandles[0].close.toFixed(2)} → ${currentCandles[currentCandles.length-1].close.toFixed(2)}`;
      document.getElementById("opt-section").classList.remove("hidden");
    }

  } catch (err) {
    status.innerHTML = `<span style="color:var(--red)">✗</span> ${err.message}`;
    if (!yahooRange && !tdKey) {
      status.innerHTML += `<br><span style="color:var(--muted)">Option 1: Select dates within 60 days → uses Yahoo (no key needed)<br>Option 2: Get free key at twelvedata.com → supports years of data<br>Option 3: Upload a CSV file</span>`;
    }
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
  const band = document.getElementById("band").value;
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
      status.textContent = `Optimization: ${e.data.count}/${e.data.total} (${pct.toFixed(1)}%)`;
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

  worker.postMessage({ candles: currentCandles, method, nTrials, band, minTrades, objective });
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
  initDefaultDates();
  document.getElementById("fetchBtn").addEventListener("click", fetchData);
  document.getElementById("csvFile").addEventListener("change", handleCSVUpload);
  document.getElementById("optimizeBtn").addEventListener("click", runOptimization);

  document.getElementById("sampleData").addEventListener("change", async function() {
    const filename = this.value;
    if (!filename) return;
    const status = document.getElementById("dataStatus");
    status.textContent = "Loading sample data: " + filename + "...";
    try {
      const resp = await fetch("data/" + filename);
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const text = await resp.text();
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
      status.innerHTML = '<span style="color:var(--green)">✓</span> Loaded ' + currentCandles.length + ' bars from ' + filename + ' | ' + currentCandles[0].datetime.toLocaleDateString() + ' → ' + currentCandles[currentCandles.length-1].datetime.toLocaleDateString();
      document.getElementById("opt-section").classList.remove("hidden");
    } catch (err) {
      status.innerHTML = '<span style="color:var(--red)">✗</span> Failed: ' + err.message;
    }
  });

  document.getElementById("method").addEventListener("change", function() {
    if (this.value === "grid") {
      document.getElementById("trialsGroup").classList.add("hidden");
      document.getElementById("bandGroup").classList.remove("hidden");
    } else {
      document.getElementById("trialsGroup").classList.remove("hidden");
      document.getElementById("bandGroup").classList.add("hidden");
    }
  });
});
