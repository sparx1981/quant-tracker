# Quant Tracker

A personal QNT dashboard built with Next.js for Vercel. No market-data API keys, wallet connection, database, or paid services are required.

## Run locally

Requires Node.js 20.9 or newer.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. Verify with `npm test` and `npm run build`.

## Features

- USD and GBP prices and supply metrics, with provider attribution and retrieval times.
- Browser-local holdings calculator and currency preference. Holdings never leave the browser.
- Multiple QNT/USDT chart timeframes, 11 explained indicators and bullish/neutral/bearish filtering.
- Bear/base/bull statistical scenarios for 7, 30, 90, 180 and 365 days.
- Live balances for three explicitly labelled exchange wallets, and recent large-transfer filtering.
- Official Quant announcements and third-party QNT news, with dates and source links.
- A server-side Check feeds panel that verifies provider responses, latency, optional credentials and partial-data risks without exposing secrets.
- Responsive layout, keyboard-accessible controls, reduced-motion support and honest unavailable states.

## Data and limitations

| Data | Primary source | Refresh |
| --- | --- | --- |
| USD price | Coinbase QNT/USD; aggregate fallback | 15 seconds |
| Market cap, supply | CoinGecko keyless public endpoint; CoinPaprika fallback | 60 seconds |
| USD/GBP reference FX | Frankfurter / ECB | 1 hour; underlying rate is daily |
| Candles and indicators | Binance public QNT/USDT endpoint | 30–300 seconds depending on timeframe; unfinished candles excluded |
| Selected wallet balances, holder-address count | Ethereum Blockscout public API | 5 minutes |
| Up to ten pages of QNT transfer events | Ethereum Blockscout public API | 60 seconds |
| Official news and media headlines | Quant RSS and Google News RSS | 10 minutes |

Browser polling runs only while visible. Vercel CDN and short process-local source caches reduce load; process-local last-known-good data is not durable across cold starts. No unattended indexing, historical transfer archive or push alerts are implemented. Public sources may rate-limit, block a region, change their schema, or stop offering keyless access. Failed source calls are labelled unavailable or stale; they never generate sample values.

The Check feeds panel runs an on-demand, uncached health check across the active market, candle, FX, Ethereum, news and storage endpoints. It reports healthy, review, failed, not configured and configured-but-unused states. It does not display credentials. CryptoQuant is shown as configured but unused because the current dashboard does not call its plan-specific on-chain endpoints; Supabase is checked for connectivity but is not yet used for persistence.

QNT contract: `0x4a220E6096B25EADb88358cb44068A3248254675`.

`lib/sources.js` contains the explicit wallet allowlist: Binance 14, Kraken 4 and Coinbase 12. Each label links to its Etherscan record. This is a very small subset of exchange custody, not an estimate of total exchange supply. Unknown wallet balances are not silently counted as zero; the successful wallet count is shown. The scanned transfer window is a sample, not exhaustive whale tracking. The threshold is denominated in QNT and is not derived from an average user balance. Addresses do not map one-to-one to people.

Provider-reported market supply is distinct from raw ERC-20 contract supply. The latter is disclosed separately and never substituted for circulating supply. CoinPaprika fallback circulation may be implied from market cap/price and is labelled as such.

Indicators use equal votes and include correlated measures. The aggregate is a directional rule, not a probability. Forecasts use 90 daily log returns, sample standard deviation, and a mean drift reduced to 25% and capped at ±ln(2)/365. The bear/bull limits are model 10th/90th percentiles. The scenario probabilities are not validated confidence intervals or calibrated by the separate strategy backtests, and may become extremely wide after volatile periods. GBP scenarios use current reference FX; historical trading data is in USDT. No advice, news sentiment or fundamental valuation is inferred.

Google News RSS is used as a personal, non-commercial feed reader. Headlines link out; article bodies are not copied. Official company communications and third-party reports are clearly distinguished. Quant Tracker is not affiliated with Quant.

## Deploy to Vercel

```sh
npx vercel link
npx vercel deploy
```

Use Vercel Authentication deployment protection for personal access. A preview deployment can remain your private dashboard; production domains may have different protection under your plan. Do not assume `noindex` makes a deployment private. Keep protection enabled and verify access before sharing a link. No application-level login is implemented; access protection is supplied by Vercel.

No environment variables are required. Source files are the deployable artifact; build output and Vercel account metadata are ignored by Git.

## Optional provider configuration

The dashboard works with keyless public sources. For more reliable Ethereum reads, copy `.env.example` to a local environment file or add the same names as server-only Vercel environment variables: `ALCHEMY_ETHEREUM_URL`, `INFURA_ETHEREUM_URL` and optionally `BLOCKSCOUT_API_URL`. Optional `COINGECKO_API_KEY` and `COINMARKETCAP_API_KEY` values add authenticated market-data fallbacks; `ETHERSCAN_API_KEY` is reserved for address-label cross-checks, and `CRYPTOQUANT_API_KEY` is reserved for plans that include ERC-20 on-chain data. The RPC and API keys are used only by server routes and are never exposed to the browser. Supabase variables are reserved for future durable transfer, forecast and calibration storage; a Supabase URL by itself is not sufficient because a server-side secret key is also required. Prefer `SUPABASE_SECRET_KEY` for new Supabase projects; `SUPABASE_SERVICE_ROLE_KEY` is only the legacy fallback. Rotate any credential that has been pasted into a chat or committed file before using it.

## September dashboard update

Price quotes now use Coinbase QNT/USD, polled every 15 seconds while the page is visible (10-second source/CDN cache), with the aggregate market price as fallback. Supply/scenarios refresh every minute. GBP uses the daily reference FX rate, so it is not a live foreign-exchange quote.

Price performance includes 1hr (one-minute candles), 4hr (five-minute candles), Daily (15-minute candles), and 1M/3M/6M/1Y (daily candles). Technical momentum independently supports 1hr, 4hr, daily, weekly and monthly candles. Only completed candles are used; indicators without sufficient history are excluded from the score. Intraday chart polling is 30 seconds, momentum polling 60 seconds; daily/weekly/monthly source history is cached for five minutes.

Scenario percentages estimate touching each barrier before the deadline with the continuous log-Brownian first-passage formula. They are not terminal probabilities, do not sum to 100%, and have not been calibrated against actual future hits. The starting price/time and assumptions are shown.

The backtest lab compares buy-and-hold, SMA 20/50, EMA 12/26, MACD, RSI mean reversion and Donchian breakouts. It uses $10,000 initial capital, long-only positions, 0.1% fees and 0.05% slippage per side, prior-close signals filled at the next open, and final liquidation costs. Full history and a recent 30% chronological validation slice are available. Return, benchmark difference, drawdown, trades, win rate, exposure and equity are reported. Historical forward returns require at least 20 non-overlapping entry episodes before showing a median-based illustrative price; they are not calibrated predictions.

Transfers refresh every minute and scan up to ten pages (500 events), stopping at 24 hours or the request time budget. This remains a bounded sample, not complete coverage. Large/all-transfer controls and scan coverage explain empty filtered results. Exchange balances have a Blockscout v2 fallback when the legacy endpoint is rate-limited.

Official announcements come directly from Quant RSS. Twelve selected X accounts are linked in a watchlist; their posts are not automatically ingested without X API access. Follower counts are not used as a reliability score.

The logo uses Quant's official artwork, tinted through a CSS mask: https://quant.network/assets/uploads/2025/08/Quant-logo_300x200.png .

