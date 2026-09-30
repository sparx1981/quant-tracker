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
- Daily QNT/USDT chart, 11 explained indicators and bullish/neutral/bearish filtering.
- Bear/base/bull statistical scenarios for 7, 30, 90, 180 and 365 days.
- Live balances for three explicitly labelled exchange wallets, and recent large-transfer filtering.
- Official Quant announcements and third-party QNT news, with dates and source links.
- Responsive layout, keyboard-accessible controls, reduced-motion support and honest unavailable states.

## Data and limitations

| Data | Primary source | Refresh |
| --- | --- | --- |
| USD price, market cap, supply | CoinGecko keyless public endpoint; CoinPaprika fallback | 60 seconds |
| USD/GBP reference FX | Frankfurter / ECB | 1 hour; underlying rate is daily |
| Daily candles and indicators | Binance public QNT/USDT endpoint | 15 minutes; unfinished UTC day excluded |
| Selected wallet balances, holder-address count | Ethereum Blockscout public API | 5 minutes |
| Latest page of QNT transfer events | Ethereum Blockscout public API | 3 minutes |
| Official news and media headlines | Quant RSS and Google News RSS | 10 minutes |

Browser polling runs only while visible. Vercel CDN and short process-local source caches reduce load; process-local last-known-good data is not durable across cold starts. No unattended indexing, historical transfer archive or push alerts are implemented. Public sources may rate-limit, block a region, change their schema, or stop offering keyless access. Failed source calls are labelled unavailable or stale; they never generate sample values.

QNT contract: `0x4a220E6096B25EADb88358cb44068A3248254675`.

`lib/sources.js` contains the explicit wallet allowlist: Binance 14, Kraken 4 and Coinbase 12. Each label links to its Etherscan record. This is a very small subset of exchange custody, not an estimate of total exchange supply. Unknown wallet balances are not silently counted as zero; the successful wallet count is shown. The latest transfer page is a sample, not exhaustive whale tracking. The threshold is denominated in QNT and is not derived from an average user balance. Addresses do not map one-to-one to people.

Provider-reported market supply is distinct from raw ERC-20 contract supply. The latter is disclosed separately and never substituted for circulating supply. CoinPaprika fallback circulation may be implied from market cap/price and is labelled as such.

Indicators use equal votes and include correlated measures. The aggregate is a directional rule, not a probability. Forecasts use 90 daily log returns, sample standard deviation, and a mean drift reduced to 25% and capped at ±ln(2)/365. The bear/bull limits are model 10th/90th percentiles. They are not validated confidence intervals, are not backtested, and may become extremely wide after volatile periods. GBP scenarios use current reference FX; historical trading data is in USDT. No advice, news sentiment or fundamental valuation is inferred.

Google News RSS is used as a personal, non-commercial feed reader. Headlines link out; article bodies are not copied. Official company communications and third-party reports are clearly distinguished. Quant Tracker is not affiliated with Quant.

## Deploy to Vercel

```sh
npx vercel link
npx vercel deploy
```

Use Vercel Authentication deployment protection for personal access. A preview deployment can remain your private dashboard; production domains may have different protection under your plan. Do not assume `noindex` makes a deployment private. Keep protection enabled and verify access before sharing a link. No application-level login is implemented; access protection is supplied by Vercel.

No environment variables are required. Source files are the deployable artifact; build output and Vercel account metadata are ignored by Git.

