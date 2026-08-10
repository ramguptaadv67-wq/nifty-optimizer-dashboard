/**
 * NIFTY Engulfing-Doji-TSL Backtest Engine
 * JavaScript port of the Pine Script v5 strategy.
 * Runs fully client-side — no server needed.
 */

const PARAM_NAMES = [
  "engulfing_min_body", "doji_body_max", "activate_at",
  "lock_profit_at", "increase_profit_by", "increase_tsl_by",
];

function runBacktest(candles, params) {
  const engulfMin = params.engulfing_min_body;
  const dojiBodyMax = params.doji_body_max;
  const activationPts = params.activate_at;
  const lockProfit = params.lock_profit_at;
  const profitStep = params.increase_profit_by;
  const trailStep = params.increase_tsl_by;

  const n = candles.length;
  const o = candles.map(c => c.open);
  const h = candles.map(c => c.high);
  const l = candles.map(c => c.low);
  const cl = candles.map(c => c.close);

  const body = new Array(n);
  const isBull = new Array(n);
  const isBear = new Array(n);
  for (let i = 0; i < n; i++) {
    body[i] = Math.abs(cl[i] - o[i]);
    isBull[i] = cl[i] > o[i];
    isBear[i] = cl[i] < o[i];
  }

  let setupLine = NaN;
  let position = 0; // 0=flat, 1=long, -1=short
  let entryPrice = NaN;
  let entryBar = -1;
  let longHH = NaN, shortLL = NaN;
  let longTSL = NaN, shortTSL = NaN;
  const trades = [];
  const equityCurve = [];

  for (let i = 1; i < n; i++) {
    // === Engulfing Detection ===
    const bullEngulf = isBull[i] && isBear[i-1] && cl[i] > o[i-1] && o[i] < cl[i-1] && body[i] >= engulfMin;
    const bearEngulf = isBear[i] && isBull[i-1] && cl[i] < o[i-1] && o[i] > cl[i-1] && body[i] >= engulfMin;

    if (bullEngulf) setupLine = (o[i] + cl[i]) / 2;
    if (bearEngulf) setupLine = (o[i] + cl[i]) / 2;

    const valid = !isNaN(setupLine);

    // === Doji + Touch ===
    const isDoji = body[i] <= dojiBodyMax && (h[i] - l[i]) >= body[i] * 2;
    const touchesLine = valid && h[i] >= setupLine && l[i] <= setupLine;
    const greenDoji = isDoji && cl[i] > o[i];
    const redDoji = isDoji && cl[i] < o[i];
    const ceSignal = touchesLine && greenDoji;
    const peSignal = touchesLine && redDoji;
    const flat = position === 0;

    // === Check TSL Exit ===
    if (position === 1 && !isNaN(longTSL) && l[i] <= longTSL) {
      trades.push({ entryBar, entryPrice, exitBar: i, exitPrice: longTSL, direction: "long", pnl: longTSL - entryPrice });
      position = 0; entryPrice = NaN; longHH = NaN; longTSL = NaN;
    }
    if (position === -1 && !isNaN(shortTSL) && h[i] >= shortTSL) {
      trades.push({ entryBar, entryPrice, exitBar: i, exitPrice: shortTSL, direction: "short", pnl: entryPrice - shortTSL });
      position = 0; entryPrice = NaN; shortLL = NaN; shortTSL = NaN;
    }

    // === Entries ===
    if (ceSignal && flat) {
      position = 1; entryPrice = cl[i]; entryBar = i; longHH = h[i];
    }
    if (peSignal && flat) {
      position = -1; entryPrice = cl[i]; entryBar = i; shortLL = l[i];
    }

    // === Long TSL ===
    const isLong = position === 1;
    const newLong = isLong && entryBar === i;
    if (isLong && !newLong) {
      if (h[i] - entryPrice >= activationPts) {
        longHH = isNaN(longHH) ? h[i] : Math.max(longHH, h[i]);
        const extra = Math.max(0, longHH - entryPrice - activationPts);
        const tslMove = profitStep > 0 ? Math.floor(extra / profitStep) * trailStep : 0;
        longTSL = entryPrice + lockProfit + tslMove;
      } else {
        longTSL = NaN;
      }
    }
    if (!isLong) { longHH = NaN; longTSL = NaN; }

    // === Short TSL ===
    const isShort = position === -1;
    const newShort = isShort && entryBar === i;
    if (isShort && !newShort) {
      if (entryPrice - l[i] >= activationPts) {
        shortLL = isNaN(shortLL) ? l[i] : Math.min(shortLL, l[i]);
        const extra = Math.max(0, entryPrice - shortLL - activationPts);
        const tslMove = profitStep > 0 ? Math.floor(extra / profitStep) * trailStep : 0;
        shortTSL = entryPrice - lockProfit - tslMove;
      } else {
        shortTSL = NaN;
      }
    }
    if (!isShort) { shortLL = NaN; shortTSL = NaN; }
  }

  // Close open position
  if (position === 1) {
    trades.push({ entryBar, entryPrice, exitBar: n-1, exitPrice: cl[n-1], direction: "long", pnl: cl[n-1] - entryPrice });
  } else if (position === -1) {
    trades.push({ entryBar, entryPrice, exitBar: n-1, exitPrice: cl[n-1], direction: "short", pnl: entryPrice - cl[n-1] });
  }

  // === Compute Metrics ===
  const totalTrades = trades.length;
  if (totalTrades === 0) {
    return {
      params, trades: [], netPnl: 0, totalTrades: 0, wins: 0, losses: 0,
      winRate: 0, profitFactor: 0, maxDrawdown: 0, avgTrade: 0,
      returnPct: 0, sharpe: 0, equityCurve: [],
    };
  }

  const pnls = trades.map(t => t.pnl);
  const grossProfit = pnls.filter(p => p > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(pnls.filter(p => p < 0).reduce((a, b) => a + b, 0));
  const netPnl = pnls.reduce((a, b) => a + b, 0);
  const wins = pnls.filter(p => p > 0).length;
  const losses = totalTrades - wins;
  const winRate = (wins / totalTrades) * 100;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : Infinity;
  const avgTrade = netPnl / totalTrades;
  const initialCapital = 100000;
  const returnPct = (netPnl / initialCapital) * 100;

  // Equity curve + drawdown
  let equity = initialCapital;
  const eqCurve = [equity];
  for (const p of pnls) { equity += p; eqCurve.push(equity); }
  let peak = eqCurve[0], maxDD = 0;
  for (const e of eqCurve) {
    if (e > peak) peak = e;
    const dd = peak > 0 ? ((peak - e) / peak) * 100 : 0;
    if (dd > maxDD) maxDD = dd;
  }

  // Sharpe
  let sharpe = 0;
  if (pnls.length > 1) {
    const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
    const variance = pnls.reduce((a, b) => a + (b - mean) ** 2, 0) / pnls.length;
    const std = Math.sqrt(variance);
    if (std > 0) sharpe = (mean / std) * Math.sqrt(pnls.length);
  }

  return {
    params, trades, netPnl, totalTrades, wins, losses,
    winRate, profitFactor, maxDrawdown: maxDD, avgTrade,
    returnPct, sharpe, equityCurve: eqCurve,
  };
}

/**
 * Bayesian-style optimization using random sampling + refinement.
 * Pure JS, runs in browser via Web Worker for non-blocking UI.
 */
function optimizeRandom(candles, nTrials, minTrades, objective) {
  const results = [];
  for (let i = 0; i < nTrials; i++) {
    const params = {};
    for (const name of PARAM_NAMES) {
      params[name] = Math.floor(Math.random() * 100);
    }
    const result = runBacktest(candles, params);
    if (result.totalTrades >= minTrades) {
      let score = result[objective];
      if (score === Infinity) score = 1e9;
      result._score = score;
      results.push(result);
    }
  }
  results.sort((a, b) => b._score - a._score);
  return results;
}

/**
 * Grid search with step size.
 */
function optimizeGrid(candles, step, minTrades, objective) {
  const results = [];
  const range = [];
  for (let v = 0; v < 100; v += step) range.push(v);
  const total = Math.pow(range.length, 6);
  let count = 0;

  for (const p0 of range) {
    for (const p1 of range) {
      for (const p2 of range) {
        for (const p3 of range) {
          for (const p4 of range) {
            for (const p5 of range) {
              const params = {
                engulfing_min_body: p0, doji_body_max: p1, activate_at: p2,
                lock_profit_at: p3, increase_profit_by: p4, increase_tsl_by: p5,
              };
              const result = runBacktest(candles, params);
              count++;
              if (result.totalTrades >= minTrades) {
                let score = result[objective];
                if (score === Infinity) score = 1e9;
                result._score = score;
                results.push(result);
              }
              if (count % 1000 === 0) postMessage({ type: "progress", count, total });
            }
          }
        }
      }
    }
  }
  results.sort((a, b) => b._score - a._score);
  return results;
}
