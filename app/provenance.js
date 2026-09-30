'use client';

const timestamp = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('en-GB', { timeZone: 'Europe/London' }) : 'Not supplied';
export default function Provenance({ view, market, quote, chain, news }) {
  const rows = view === 'research' ? [
    ['Momentum, backtests and trend channels', market?.history, 'Binance QNT/USDT', 'Completed candles; daily history for backtests, selected interval for momentum.'],
    ['Price scenarios', market?.market, market?.market?.data?.source, 'Aggregate USD price + Binance daily returns; log-brownian-v1. Uncalibrated probabilities.'],
    ['Road to Target starting price', quote, 'Coinbase QNT/USD', 'Aggregate price fallback; personal target stays in this browser.']
  ] : [
    ['Live price and holdings value', quote, 'Coinbase QNT/USD', '15-second polling; aggregate market snapshot used if quote unavailable.'],
    ['Supply, volume and market cap', market?.market, market?.market?.data?.source || 'Market aggregate', 'CoinGecko → CoinMarketCap → CoinPaprika fallback.'],
    ['GBP conversion', market?.fx, 'Frankfurter / ECB', 'Daily reference rate; not an executable FX quote.'],
    ['Tracked exchange balances', null, 'Blockscout / Ethereum RPC', `${chain?.covered ?? 0}/${chain?.tracked ?? 3} selected wallets. Alchemy/Infura can supply fallback balances; this is not all exchange custody.`],
    ['Transfers and holder count', chain?.transfers, 'Blockscout', 'Bounded transfer sample; addresses are not people.'],
    ['Official news', news?.official, 'Quant RSS', 'Company announcements; retrieval time is not publication time.'],
    ['Media coverage', news?.coverage, 'Google News RSS', 'Third-party reporting. X watchlist links are not ingested.']
  ];
  return <section className="panel provenance"><details open={view === 'health'}><summary>Where does this data come from?</summary><div className="table-scroll"><table className="backtest-table"><thead><tr><th>Feature</th><th>Source / status</th><th>Timing and method</th></tr></thead><tbody>{rows.map(([label, feed, source, detail]) => <tr key={label}><th>{label}</th><td>{source}<small>{feed?.status || 'See individual wallet statuses'}</small></td><td><p>{detail}</p>{feed && <small>Retrieved: {timestamp(feed.fetchedAt)} London<br/>Source time: {timestamp(feed.data?.updatedAt || feed.data?.date || feed.data?.analysis?.asOf || feed.data?.newest)}</small>}</td></tr>)}</tbody></table></div></details></section>;
}
