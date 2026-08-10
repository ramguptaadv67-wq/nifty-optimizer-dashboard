#!/usr/bin/env python3
"""
CLI entry point for NIFTY Strategy Optimizer.

Usage:
  python cli.py fetch --symbol ^NSEI --interval 5m --range 60d
  python cli.py optimize --data data/NSEI_5m.csv --method bayesian --trials 500
  python cli.py optimize --data data/NSEI_5m.csv --method grid --step 25
  python cli.py optimize --data data/NSEI_5m.csv --method random --trials 10000
  python cli.py backtest --data data/NSEI_5m.csv --params 6,63,0,33,1,97
"""

import argparse
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backtest_engine import run_backtest, load_data
from data_fetcher import fetch_and_save, resample
from optimizer import (
    optimize_bayesian, optimize_grid, optimize_random,
    results_to_json, results_to_csv, PARAM_NAMES,
)


def cmd_fetch(args):
    df = fetch_and_save(args.symbol, args.interval, args.range, output_dir="data")
    if args.resample:
        df_r = resample(df, args.resample)
        safe = args.symbol.replace("^", "").replace("-", "_")
        path = os.path.join("data", f"{safe}_{args.resample}.csv")
        df_r.to_csv(path, index=False)
        print(f"Resampled to {args.resample}: {len(df_r)} bars -> {path}")


def cmd_optimize(args):
    df = load_data(args.data)
    print(f"Loaded {len(df)} bars from {args.data}")
    print(f"Range: {df['datetime'].iloc[0]} -> {df['datetime'].iloc[-1]}")
    print(f"Method: {args.method} | Objective: {args.objective} | Min trades: {args.min_trades}")
    print()

    if args.method == "bayesian":
        results = optimize_bayesian(
            df, n_trials=args.trials, min_trades=args.min_trades,
            objective=args.objective, seed=args.seed)
    elif args.method == "grid":
        results = optimize_grid(
            df, step=args.step, min_trades=args.min_trades,
            objective=args.objective)
    elif args.method == "random":
        results = optimize_random(
            df, n_trials=args.trials, min_trades=args.min_trades,
            objective=args.objective, seed=args.seed)

    if not results:
        print("No valid results (try lowering --min-trades)")
        sys.exit(1)

    print(f"\n{'='*70}")
    print(f"  TOP {args.top} RESULTS")
    print(f"{'='*70}")
    for i, r in enumerate(results[:args.top]):
        p = r.params
        pf = f"{r.profit_factor:.2f}" if r.profit_factor != float('inf') else "inf"
        print(f"\n  Rank #{i+1}")
        print(f"  P&L:       {r.net_pnl:>12.2f} pts")
        print(f"  Return:    {r.return_pct:>12.2f}%")
        print(f"  Trades:    {r.total_trades:>12d}")
        print(f"  Win Rate:  {r.win_rate:>12.2f}%")
        print(f"  Profit Fac:{pf:>12}")
        print(f"  Max DD:    {r.max_drawdown:>12.2f}%")
        print(f"  Sharpe:    {r.sharpe:>12.2f}")
        print(f"  Params: engulf={p['engulfing_min_body']}, doji={p['doji_body_max']}, "
              f"act={p['activate_at']}, lock={p['lock_profit_at']}, "
              f"step={p['increase_profit_by']}, tsl={p['increase_tsl_by']}")

    os.makedirs("results", exist_ok=True)
    base = os.path.splitext(os.path.basename(args.data))[0]
    results_to_json(results[:50], os.path.join("results", f"{base}_{args.method}_top50.json"))
    results_to_csv(results[:50], os.path.join("results", f"{base}_{args.method}_top50.csv"))


def cmd_backtest(args):
    df = load_data(args.data)
    values = [int(x) for x in args.params.split(",")]
    if len(values) != 6:
        print("Error: --params needs 6 values: engulf,doji,activate,lock,profit,tsl")
        sys.exit(1)
    params = dict(zip(PARAM_NAMES, values))
    result = run_backtest(df, params)
    print(f"\n{result.summary()}")
    for i, t in enumerate(result.trades[:20]):
        print(f"  #{i+1:>3} {t.direction:>5} entry={t.entry_price:.2f} "
              f"exit={t.exit_price:.2f} pnl={t.pnl_points:+.2f}")


def main():
    parser = argparse.ArgumentParser(description="NIFTY Strategy Optimizer")
    sub = parser.add_subparsers(dest="command")

    p = sub.add_parser("fetch", help="Fetch data from Yahoo Finance")
    p.add_argument("--symbol", default="^NSEI")
    p.add_argument("--interval", default="5m")
    p.add_argument("--range", default="60d")
    p.add_argument("--resample", default=None)
    p.set_defaults(func=cmd_fetch)

    p = sub.add_parser("optimize", help="Run 0-99 parameter optimization")
    p.add_argument("--data", required=True)
    p.add_argument("--method", default="bayesian", choices=["bayesian", "grid", "random"])
    p.add_argument("--trials", type=int, default=500)
    p.add_argument("--step", type=int, default=25, help="Grid step (25=4096 combos, 10=1M)")
    p.add_argument("--objective", default="net_pnl",
                   choices=["net_pnl", "sharpe", "profit_factor", "return_pct"])
    p.add_argument("--min-trades", type=int, default=5)
    p.add_argument("--top", type=int, default=10)
    p.add_argument("--seed", type=int, default=42)
    p.set_defaults(func=cmd_optimize)

    p = sub.add_parser("backtest", help="Single backtest with specific params")
    p.add_argument("--data", required=True)
    p.add_argument("--params", required=True, help="6 values: 6,63,0,33,1,97")
    p.set_defaults(func=cmd_backtest)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)
    args.func(args)


if __name__ == "__main__":
    main()
