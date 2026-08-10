"""
NIFTY Engulfing-Doji-TSL Strategy Backtester
Faithful Python port of the Pine Script v5 strategy.
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import List


@dataclass
class Trade:
    entry_bar: int
    entry_price: float
    exit_bar: int
    exit_price: float
    direction: str  # "long" or "short"
    pnl_points: float = 0.0


@dataclass
class BacktestResult:
    params: dict
    trades: List[Trade] = field(default_factory=list)
    net_pnl: float = 0.0
    total_trades: int = 0
    wins: int = 0
    losses: int = 0
    win_rate: float = 0.0
    profit_factor: float = 0.0
    max_drawdown: float = 0.0
    avg_trade: float = 0.0
    return_pct: float = 0.0
    sharpe: float = 0.0

    def compute_metrics(self, initial_capital=100000.0):
        self.total_trades = len(self.trades)
        if self.total_trades == 0:
            return
        pnls = [t.pnl_points for t in self.trades]
        gross_profit = sum(p for p in pnls if p > 0)
        gross_loss = abs(sum(p for p in pnls if p < 0))
        self.net_pnl = sum(pnls)
        self.wins = sum(1 for p in pnls if p > 0)
        self.losses = sum(1 for p in pnls if p <= 0)
        self.win_rate = self.wins / self.total_trades * 100
        self.profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf')
        self.avg_trade = self.net_pnl / self.total_trades
        self.return_pct = (self.net_pnl / initial_capital) * 100

        equity = [initial_capital]
        for p in pnls:
            equity.append(equity[-1] + p)
        peak = equity[0]
        max_dd = 0.0
        for e in equity:
            if e > peak:
                peak = e
            dd = (peak - e) / peak * 100 if peak > 0 else 0
            if dd > max_dd:
                max_dd = dd
        self.max_drawdown = max_dd

        if len(pnls) > 1 and np.std(pnls) > 0:
            self.sharpe = (np.mean(pnls) / np.std(pnls)) * np.sqrt(len(pnls))

    def summary(self) -> str:
        pf = f"{self.profit_factor:.2f}" if self.profit_factor != float('inf') else "inf"
        return (
            f"P&L={self.net_pnl:.1f} | Trades={self.total_trades} | "
            f"Win%={self.win_rate:.1f} | PF={pf} | DD={self.max_drawdown:.2f}% | "
            f"Ret={self.return_pct:.2f}% | Sharpe={self.sharpe:.2f}"
        )


def run_backtest(df: pd.DataFrame, params: dict, initial_capital=100000.0) -> BacktestResult:
    engulf_min = params["engulfing_min_body"]
    doji_body_max = params["doji_body_max"]
    activation_pts = params["activate_at"]
    lock_profit = params["lock_profit_at"]
    profit_step = params["increase_profit_by"]
    trail_step = params["increase_tsl_by"]

    o = df["open"].values
    h = df["high"].values
    l = df["low"].values
    c = df["close"].values
    n = len(df)

    body = np.abs(c - o)
    is_bull = c > o
    is_bear = c < o

    setup_line = np.nan
    position = 0
    entry_price = np.nan
    entry_bar = -1
    long_hh = np.nan
    short_ll = np.nan
    long_tsl = np.nan
    short_tsl = np.nan
    trades = []

    for i in range(1, n):
        bull_engulf = (
            is_bull[i] and is_bear[i - 1]
            and c[i] > o[i - 1] and o[i] < c[i - 1]
            and body[i] >= engulf_min
        )
        bear_engulf = (
            is_bear[i] and is_bull[i - 1]
            and c[i] < o[i - 1] and o[i] > c[i - 1]
            and body[i] >= engulf_min
        )

        if bull_engulf:
            setup_line = (o[i] + c[i]) / 2
        if bear_engulf:
            setup_line = (o[i] + c[i]) / 2

        valid = not np.isnan(setup_line)

        is_doji = body[i] <= doji_body_max and (h[i] - l[i]) >= body[i] * 2
        touches_line = valid and h[i] >= setup_line and l[i] <= setup_line
        green_doji = is_doji and c[i] > o[i]
        red_doji = is_doji and c[i] < o[i]

        ce_signal = touches_line and green_doji
        pe_signal = touches_line and red_doji
        flat = position == 0

        if position == 1 and not np.isnan(long_tsl) and l[i] <= long_tsl:
            trades.append(Trade(entry_bar, entry_price, i, long_tsl, "long", long_tsl - entry_price))
            position = 0
            entry_price = np.nan
            long_hh = np.nan
            long_tsl = np.nan

        if position == -1 and not np.isnan(short_tsl) and h[i] >= short_tsl:
            trades.append(Trade(entry_bar, entry_price, i, short_tsl, "short", entry_price - short_tsl))
            position = 0
            entry_price = np.nan
            short_ll = np.nan
            short_tsl = np.nan

        if ce_signal and flat:
            position = 1
            entry_price = c[i]
            entry_bar = i
            long_hh = h[i]

        if pe_signal and flat:
            position = -1
            entry_price = c[i]
            entry_bar = i
            short_ll = l[i]

        is_long = position == 1
        new_long = is_long and entry_bar == i
        if is_long and not new_long:
            if (h[i] - entry_price) >= activation_pts:
                long_hh = h[i] if np.isnan(long_hh) else max(long_hh, h[i])
                extra = max(0.0, long_hh - entry_price - activation_pts)
                tsl_move = np.floor(extra / profit_step) * trail_step if profit_step > 0 else 0
                long_tsl = entry_price + lock_profit + tsl_move
            else:
                long_tsl = np.nan
        if not is_long:
            long_hh = np.nan
            long_tsl = np.nan

        is_short = position == -1
        new_short = is_short and entry_bar == i
        if is_short and not new_short:
            if (entry_price - l[i]) >= activation_pts:
                short_ll = l[i] if np.isnan(short_ll) else min(short_ll, l[i])
                extra = max(0.0, entry_price - short_ll - activation_pts)
                tsl_move = np.floor(extra / profit_step) * trail_step if profit_step > 0 else 0
                short_tsl = entry_price - lock_profit - tsl_move
            else:
                short_tsl = np.nan
        if not is_short:
            short_ll = np.nan
            short_tsl = np.nan

    if position == 1:
        trades.append(Trade(entry_bar, entry_price, n - 1, c[-1], "long", c[-1] - entry_price))
    elif position == -1:
        trades.append(Trade(entry_bar, entry_price, n - 1, c[-1], "short", entry_price - c[-1]))

    result = BacktestResult(params=params, trades=trades)
    result.compute_metrics(initial_capital)
    return result


def load_data(path):
    df = pd.read_csv(path)
    df["datetime"] = pd.to_datetime(df["datetime"])
    return df
