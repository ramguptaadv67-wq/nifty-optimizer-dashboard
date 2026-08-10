/**
 * Web Worker for running optimization without blocking the UI.
 * Import the backtest engine inline.
 */

importScripts("backtest.js");

self.onmessage = function(e) {
  const { candles, method, nTrials, step, minTrades, objective } = e.data;

  let results;
  if (method === "grid") {
    results = optimizeGrid(candles, step, minTrades, objective);
  } else {
    results = optimizeRandom(candles, nTrials, minTrades, objective);
  }

  // Strip equity curves from all but top 10 to save memory
  const top = results.slice(0, 50).map(r => {
    return {
      params: r.params,
      netPnl: r.netPnl,
      totalTrades: r.totalTrades,
      wins: r.wins,
      losses: r.losses,
      winRate: r.winRate,
      profitFactor: r.profitFactor === Infinity ? 999.99 : r.profitFactor,
      maxDrawdown: r.maxDrawdown,
      avgTrade: r.avgTrade,
      returnPct: r.returnPct,
      sharpe: r.sharpe,
      equityCurve: results.indexOf(r) < 10 ? r.equityCurve : null,
      trades: results.indexOf(r) < 10 ? r.trades : null,
    };
  });

  self.postMessage({ type: "done", results: top });
};
