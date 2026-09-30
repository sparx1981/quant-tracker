'use client';

const pct = n => Number.isFinite(n) ? `${n.toFixed(2)}%` : '—';
const status = ok => <span className={`quality-dot ${ok ? 'good' : 'warn'}`}>{ok ? 'OK' : 'Review'}</span>;

export default function DataQuality({ market, quote, history, chain, feeds = [] }) {
  const prices = [market?.price, quote?.price, history?.candles?.at(-1)?.close].filter(Number.isFinite);
  const spread = prices.length > 1 ? (Math.max(...prices) / Math.min(...prices) - 1) * 100 : null;
  const coverage = chain?.tracked ? chain.covered / chain.tracked : null;
  const transferWindow = chain?.transfers?.data?.oldest && chain?.transfers?.data?.newest ? (Date.parse(chain.transfers.data.newest) - Date.parse(chain.transfers.data.oldest)) / 3600000 : null;
  const fresh = feeds.filter(f => f?.status === 'ok').length;
  return <section className="panel quality-panel"><div className="section-title"><div><span className="eyebrow">TRUST THE INPUTS</span><h3>Data quality</h3></div><span className="badge neutral">{fresh}/{feeds.length || 1} sources fresh</span></div><div className="quality-grid"><div><strong>{status(spread === null || spread < 3)} Price agreement</strong><p>{spread === null ? 'Waiting for multiple price sources' : `${pct(spread)} spread across quote, market and candle sources`}</p></div><div><strong>{status(coverage === 1)} Exchange coverage</strong><p>{chain ? `${chain.covered}/${chain.tracked} labelled wallets available` : 'Waiting for wallet data'}</p></div><div><strong>{status(transferWindow === null || transferWindow >= 12)} Transfer window</strong><p>{transferWindow === null ? 'Waiting for transfer history' : `${transferWindow.toFixed(1)} hours represented; bounded sample`}</p></div><div><strong>{status(feeds.every(f => !f || f.status === 'ok'))} Source freshness</strong><p>{fresh} successful source responses in the current refresh</p></div></div><p className="small muted">Confidence is reduced when sources disagree, exchange labels are incomplete or transfer history covers only a short window. Quality checks describe the data; they do not predict price direction.</p></section>;
}
