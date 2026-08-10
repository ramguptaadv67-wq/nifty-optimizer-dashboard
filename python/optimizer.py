"""
Parameter optimizer using Optuna Bayesian (TPE) and grid search.
Sweeps all 6 parameters 0-99.
"""

import json
import numpy as np
import pandas as pd
import optuna
from backtest_engine import run_backtest, BacktestResult

optuna.logging.set_verbosity(optuna.logging.WARNING)

PARAM_NAMES = [
    "engulfing_min_body", "doji_body_max", "activate_at",
    "lock_profit_at", "increase_profit_by", "increase_tsl_by",
]


def optimize_bayesian(df, n_trials=500, min_trades=5, objective="net_pnl", seed=42):
    def objective_fn(trial):
        params = {name: trial.suggest_int(name, 0, 99) for name in PARAM_NAMES}
        result = run_backtest(df, params)
        if result.total_trades < min_trades:
            return -1e9
        val = getattr(result, objective)
        if val == float('inf'):
            val = 1e9
        return val

    study = optuna.create_study(direction="maximize", sampler=optuna.samplers.TPESampler(seed=seed))
    study.optimize(objective_fn, n_trials=n_trials, show_progress_bar=False)

    completed = [t for t in study.trials if t.value is not None and t.value > -1e8]
    completed.sort(key=lambda t: t.value, reverse=True)

    results = []
    seen = set()
    for trial in completed:
        key = tuple(sorted(trial.params.items()))
        if key in seen:
            continue
        seen.add(key)
        params = {k: int(v) for k, v in trial.params.items()}
        result = run_backtest(df, params)
        results.append(result)
        if len(results) >= 20:
            break

    return results


def optimize_grid(df, step=10, min_trades=5, objective="net_pnl"):
    from itertools import product
    ranges = [list(range(0, 100, step)) for _ in PARAM_NAMES]
    total = 1
    for r in ranges:
        total *= len(r)
    print(f"Grid search: {total} combinations (step={step})")

    results = []
    count = 0
    for point in product(*ranges):
        params = dict(zip(PARAM_NAMES, point))
        result = run_backtest(df, params)
        count += 1
        if count % 1000 == 0:
            print(f"  Progress: {count}/{total} ({count*100//total}%)")
        if result.total_trades >= min_trades:
            results.append(result)

    reverse = objective not in ("max_drawdown",)
    results.sort(
        key=lambda r: getattr(r, objective) if getattr(r, objective) != float('inf') else 1e9,
        reverse=reverse,
    )
    return results


def optimize_random(df, n_trials=10000, min_trades=5, objective="net_pnl", seed=42):
    rng = np.random.RandomState(seed)
    results = []
    for i in range(n_trials):
        params = {name: int(rng.randint(0, 100)) for name in PARAM_NAMES}
        result = run_backtest(df, params)
        if i % 1000 == 0:
            print(f"  Random search: {i}/{n_trials}")
        if result.total_trades >= min_trades:
            results.append(result)

    results.sort(
        key=lambda r: getattr(r, objective) if getattr(r, objective) != float('inf') else 1e9,
        reverse=True,
    )
    return results


def results_to_json(results, filepath):
    output = []
    for r in results:
        output.append({
            "params": r.params,
            "net_pnl": round(r.net_pnl, 2),
            "trades": r.total_trades,
            "win_rate": round(r.win_rate, 2),
            "profit_factor": round(r.profit_factor, 2) if r.profit_factor != float('inf') else 999.99,
            "max_drawdown_pct": round(r.max_drawdown, 2),
            "return_pct": round(r.return_pct, 2),
            "sharpe": round(r.sharpe, 2),
            "avg_trade": round(r.avg_trade, 2),
        })
    with open(filepath, "w") as f:
        json.dump(output, f, indent=2)
    print(f"Saved {len(output)} results to {filepath}")


def results_to_csv(results, filepath):
    import csv
    with open(filepath, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=[
            "rank", "net_pnl", "return_pct", "trades", "win_rate",
            "profit_factor", "max_drawdown_pct", "sharpe", "avg_trade",
            "engulfing_min_body", "doji_body_max", "activate_at",
            "lock_profit_at", "increase_profit_by", "increase_tsl_by",
        ])
        w.writeheader()
        for rank, r in enumerate(results, 1):
            p = r.params
            pf = r.profit_factor if r.profit_factor != float('inf') else 999.99
            w.writerow({
                "rank": rank,
                "net_pnl": round(r.net_pnl, 2),
                "return_pct": round(r.return_pct, 2),
                "trades": r.total_trades,
                "win_rate": round(r.win_rate, 2),
                "profit_factor": round(pf, 2),
                "max_drawdown_pct": round(r.max_drawdown, 2),
                "sharpe": round(r.sharpe, 2),
                "avg_trade": round(r.avg_trade, 2),
                "engulfing_min_body": p["engulfing_min_body"],
                "doji_body_max": p["doji_body_max"],
                "activate_at": p["activate_at"],
                "lock_profit_at": p["lock_profit_at"],
                "increase_profit_by": p["increase_profit_by"],
                "increase_tsl_by": p["increase_tsl_by"],
            })
    print(f"Saved {len(results)} results to {filepath}")
