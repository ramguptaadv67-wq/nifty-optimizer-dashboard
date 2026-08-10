"""
Data fetcher — downloads OHLCV data from Yahoo Finance (free, no API key).
Supports any Yahoo Finance symbol: ^NSEI (NIFTY), BTC-USD, AAPL, etc.
"""

import json
import urllib.request
import pandas as pd
import os


def fetch_yahoo(symbol: str, interval: str = "5m", range_: str = "60d") -> pd.DataFrame:
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
        f"?range={range_}&interval={interval}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    raw = urllib.request.urlopen(req, timeout=60).read()
    d = json.loads(raw)

    if "chart" not in d or not d["chart"]["result"]:
        raise ValueError(f"No data returned for {symbol}")

    r = d["chart"]["result"][0]
    ts = r["timestamp"]
    q = r["indicators"]["quote"][0]

    df = pd.DataFrame({
        "timestamp": ts,
        "open": q["open"],
        "high": q["high"],
        "low": q["low"],
        "close": q["close"],
        "volume": q["volume"],
    }).dropna()

    df["datetime"] = pd.to_datetime(df["timestamp"], unit="s", utc=True)
    df = df[["datetime", "open", "high", "low", "close", "volume"]].reset_index(drop=True)
    return df


def resample(df: pd.DataFrame, target_interval: str) -> pd.DataFrame:
    df_r = df.set_index("datetime")
    mapping = {
        "3m": "3min", "5m": "5min", "15m": "15min",
        "30m": "30min", "1h": "1h", "1d": "1D",
    }
    rule = mapping.get(target_interval, target_interval)
    df_r = df_r.resample(rule).agg({
        "open": "first", "high": "max", "low": "min",
        "close": "last", "volume": "sum",
    }).dropna().reset_index()
    return df_r


def fetch_and_save(symbol: str, interval: str, range_: str, output_dir: str = "data"):
    df = fetch_yahoo(symbol, interval, range_)
    safe_symbol = symbol.replace("^", "").replace("-", "_")
    filename = f"{safe_symbol}_{interval}.csv"
    filepath = os.path.join(output_dir, filename)
    os.makedirs(output_dir, exist_ok=True)
    df.to_csv(filepath, index=False)
    print(f"Saved {len(df)} bars to {filepath}")
    print(f"Range: {df['datetime'].iloc[0]} → {df['datetime'].iloc[-1]}")
    print(f"Price: {df['close'].iloc[0]:.2f} → {df['close'].iloc[-1]:.2f}")
    return df
