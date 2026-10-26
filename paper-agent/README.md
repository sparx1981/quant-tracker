# QNT research and paper trading

This experiment uses only **DexPaprika MCP** and the **Nayshins CCXT MCP** read tools. It cannot submit orders, connect a wallet, or use your actual holdings. It uses deterministic rules and written templates, so there are no AI model calls or exchange API keys. Existing dashboard data providers are unchanged.

## Hosted operation

`.github/workflows/qnt-paper.yml` runs on main when this worker changes, manually from Actions, and at minute 7 of every second UTC hour. GitHub Actions must be enabled and allowed to write repository contents. No secrets need adding to Vercel or GitHub. GitHub's built-in token is used only to persist files; it is not forwarded to the MCP servers.

Each job restores `ledger.sqlite` from the separate `paper-ledger` branch, then loops for about 4.5 hours: one observation at each 15-minute slot, each committed back to that branch with `summary.json`, `reports.json` (all recent daily reports bundled for the dashboard) and the daily Markdown report. GitHub's scheduler dropped most of the earlier every-15-minute starts (6.8% coverage after 8.7 days), so a long-running job keeps the cadence and the two-hourly starts only need one of them to arrive per ~4.5 hours; later starts queue behind the running job. GitHub concurrency serializes jobs; SQLite transactions and unique 15-minute slots prevent duplicate fills. An existing branch with a missing ledger fails rather than silently starting another $10,000 account. Push conflicts fail without force-pushing.

The Vercel Paper Research page reads the public summary through `/api/paper` every minute and the daily reports through `/api/paper/reports` every five minutes. No database credentials are needed. The ledger, decisions and reports are **public**, like this repository, and contain only simulated trades and public market data. The data branch disables Vercel deployments. It does not change main or redeploy the app every 15 minutes.

GitHub schedules are best-effort: jobs can be delayed/dropped, and schedules on inactive public repositories can be disabled after 60 days. Observe the worker link and schedule coverage; the page shows lifetime and last-24-hour coverage and warns when under 80%. A report more than 35 minutes old is marked stale. This is an inexpensive observation experiment, not an execution service with an uptime guarantee. GitHub-hosted standard runners are free for public repositories subject to platform policy; private repositories have account quotas, and a long-running job uses about 4.5 hours of runner time per cycle. Git history grows with the SQLite ledger, now one commit per observation (about 96 a day); review storage after the initial two-week trial.

## Local operation

Use Python 3.12+ and Node 24. From the repository root (PowerShell):

```powershell
python -m venv .paper-venv
.paper-venv/Scripts/python -m pip install -r paper-agent/requirements.txt
npm ci --prefix paper-agent --ignore-scripts
.paper-venv/Scripts/python -m unittest discover -s paper-agent -p 'test_*.py'
.paper-venv/Scripts/python paper-agent/run.py
# Or stay running while this machine is awake:
.paper-venv/Scripts/python paper-agent/run.py --loop
```

On Linux use `.paper-venv/bin/python`. Local data stays in ignored `paper-agent/data/`; it does not publish to the dashboard. Use the hosted workflow as the single authoritative experiment. Never point a second running worker at its ledger. Stop the loop with Ctrl+C. Pause hosted collection by disabling the workflow in GitHub Actions; existing paper positions remain in the ledger. Resume uses that ledger. Do not delete the data branch to restart history casually.

## Rules and execution assumptions

- Watchlist is fixed to Kraken **QNT/USD**, Ethereum contract `0x4a220e6096b25eadb88358cb44068a3248254675`. Changes to another asset are rejected.
- Start with $10,000. One open QNT position (stricter than the three-position ceiling), no pyramiding, leverage, shorting or real orders.
- Entry budget is 5% of available paper cash, including entry fees.
- BUY when completed 1h and 4h closes are above their SMA20, both SMA20s exceed SMA50, and 1h simple 14-period RSI is between 50 and 70.
- Entry requires at least $500,000 DexPaprika QNT pool liquidity, provider liquidity timestamp no older than 10 minutes, and quoted spread no wider than 1%. Pool TVL is not executable Kraken order-book depth.
- Missing, invalid, gapped or stale candles block entries. Require at least 50 completed bars in each timeframe. Incomplete candles are excluded. Upstream exchange history truncation is rejected when it leaves stale history.
- SELL at the next observed price at/below 97% or at/above 106% of entry fill, or when both completed trends turn bearish (close < SMA20 < SMA50). No same-observation re-entry. Protective quote exits still operate if liquidity/analysis fails.
- Stops/targets are **sampled triggers, not resting orders**. There is no claim that intraperiod touches are captured. During downtime there are no fills. The next observed gap can exceed the stop; we do not invent fills at the stop price.
- Buys use the worse of ask/last plus 0.05% slippage; sells the worse of bid/last minus 0.05%; 0.1% fees on each side. Quantities are simulated fractions, not exchange-valid lot sizes. Fees, depth, latency and fills can differ in live markets.
- Mark-to-market equity deducts estimated exit fee/slippage. If price is unavailable, the last valuation is carried forward and the reason states this. Drawdown is observed equity drawdown, not intraperiod worst drawdown. Win rate uses closed positions only, after fees.
- Reasons include SMA/RSI trend conditions, volatility (20-period standard deviation of log returns, unannualized), volume ratio to the previous 20 bars, and liquidity. Volume spike means at least 2x. These measures are not optimized to maximize historical performance.

Daily UTC Markdown files include trades, lifetime P&L, win rate, observed maximum drawdown, failed observations, losing exits and limitations. The current day's report updates every run. Days with no runs have no report. At least two weeks of observation is required before evaluating anything; even two weeks, or a high win rate from a handful of trades, does not establish predictive accuracy. No profitability or target-date claims are made.

## Review of suggested projects

- [DexPaprika MCP](https://github.com/coinpaprika/dexpaprika-mcp): installed at npm 2.9.0 with lockfile; only `getTokenDetails` is allowed. We use token identity, timestamp and liquidity, not its token-supply fields. Keyless token-wide OHLCV is restricted, so candles come from CCXT. The current tool contract also requires a rationale.
- [Nayshins CCXT MCP](https://github.com/Nayshins/mcp-server-ccxt): MIT server vendored at commit `f7ddee5eb4a335e42541e0c45c6785aa6c88591b`, license alongside it. Local compatibility changes: explicit UTC candle formatting; renamed CCXT Huobi class to `htx`. Only `get-market-summary` and `get-historical-ohlcv` are callable by the worker. Formatted responses are parsed strictly; upstream errors fail closed. The server supplies no exchange quote timestamp, so request receipt and candle freshness are checked; that cannot prove the last trade itself was recent.
- [Crypto Claude Desk](https://github.com/hugoguerrap/crypto-claude-desk): reviewed as an optional reference. Its current architecture depends on Claude Code and additional tools. It was not installed: the QNT experiment needs neither AI inference costs nor a general multi-agent trading desk.

MCP processes receive a minimal OS environment, not the dashboard's API secrets. No `.env` files are loaded. Only read tools are allowlisted; the portfolio engine has no network or exchange execution dependencies. MCP upstream contents are treated as data, never instructions.

The lockfiles pin runtime dependencies; periodically review updates. Run unit tests and a live MCP observation after updates. Inspect the first hosted workflow before treating the schedule as operational.
