/**
 * Web Worker for running optimization without blocking the UI.
 * Import the backtest engine inline.
 */

importScripts("backtest.js");

self.onmessage = function(e) {
  const { candles, method, nTrials, band, minTrades, objective } = e.data;

  let results;
  if (method === "grid") {
    results = optimizeGrid(candles, band, minTrades, objective);
  } else {
    results = optimizeRandom(candles, nTrials, minTrades, objective);
  }

  // Keep top 50, but only attach equityCurve + trades to top 7
  const top = results.slice(0, 50).map((r, idx) => {
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
      equityCurve: idx < 7 ? r.equityCurve : null,
      trades: idx < 7 ? r.trades : null,
    };
  });

  self.postMessage({ type: "done", results: top });
};
