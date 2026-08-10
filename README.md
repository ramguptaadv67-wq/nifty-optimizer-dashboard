# NIFTY Strategy Optimizer Dashboard

A browser-based dashboard for backtesting and optimizing the NIFTY Engulfing-Doji-TSL Pine Script strategy. Runs fully client-side — no server, no API keys. Deploy on Cloudflare Pages for free.

## Features

- Fetch real market data (NIFTY, BTC, stocks) from Yahoo Finance directly in browser
- Upload your own CSV OHLCV data
- Sweep all 6 parameters 0-99 with Random or Grid search
- Interactive equity curve chart
- Top 50 results table with all metrics
- Full trade log for the best result
- Runs in Web Worker — UI never freezes during optimization
- Works on any symbol, any timeframe

## Quick Deploy on Cloudflare Pages

### Option A: Drag & Drop (easiest)

1. Download/extract this repo
2. Go to [Cloudflare Pages](https://pages.cloudflare.com)
3. Click "Create a project" → "Direct Upload"
4. Drag the folder containing `index.html` into the uploader
5. Done — your dashboard is live

### Option B: Git Connect (auto-deploy)

1. Push this repo to GitHub
2. Go to [Cloudflare Pages](https://pages.cloudflare.com)
3. Click "Create a project" → "Connect to Git"
4. Select your repository
5. Build settings:
   - **Framework preset:** None
   - **Build command:** (leave empty)
   - **Build output directory:** / (root)
6. Click "Save and Deploy"
7. Every `git push` auto-deploys

### Option C: Wrangler CLI

```bash
npm install -g wrangler
wrangler pages deploy . --project-name nifty-optimizer
```

## Run locally

No build step needed. Just open `index.html` in a browser, or use any static server:

```bash
# Python
python -m http.server 8000

# Node
npx serve .
```

Then open `http://localhost:8000`.

## How to use

1. **Load Data** — Select a symbol (NIFTY, BTC, etc.), timeframe (1m, 5m, 1h), and range (7d, 60d, 1y). Click "Fetch Data". Or upload a CSV with columns: datetime, open, high, low, close, volume.

2. **Optimize** — Choose method (Random or Grid), set trials/step, pick objective (Net P&L, Sharpe, etc.), click "Run Optimization". Results appear in seconds.

3. **Review** — Top 50 results shown in a sortable table with all metrics. Equity curve chart shows the best config. Trade log shows every trade for the top result.

## Architecture

```
nifty-optimizer/
  index.html          ← Dashboard UI
  css/style.css       ← Dark theme styling
  js/
    backtest.js       ← Strategy engine (JS port of Pine Script)
    worker.js         ← Web Worker for non-blocking optimization
    app.js            ← UI logic, data fetching, chart rendering
  strategies/
    nifty_engulfing_doji_tsl.pine   ← Original Pine Script
  python/              ← Python version (for local CLI use)
    backtest_engine.py
    data_fetcher.py
    optimizer.py
    cli.py
  wrangler.toml        ← Cloudflare Pages config
  README.md
  requirements.txt     ← For Python version
```

## The 6 parameters

| Parameter | Description |
|---|---|
| Engulfing Min Body | Minimum candle body size for engulfing detection |
| Max Doji Body | Maximum body size for doji classification |
| Activate At | Profit threshold to activate trailing stop |
| Lock Profit At | Points locked once TSL activates |
| Increase Profit By | Profit interval for TSL ratchet |
| Increase TSL By | Points to trail per profit step |

## Strategy logic

1. Detect bullish/bearish engulfing candle (body >= engulf_min)
2. Mark setup line at midpoint of engulfing body
3. Wait for doji (body <= doji_max) touching setup line
4. Green doji → Long entry | Red doji → Short entry
5. Tradetron-style trailing stop-loss activates at activation_pts, locks lock_profit, ratchets by trail_step per profit_step

## Disclaimer

For educational/research purposes only. Not financial advice. Past performance does not guarantee future results.
