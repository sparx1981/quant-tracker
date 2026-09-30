'use client';

const pct = n => Number.isFinite(n) ? `${n.toFixed(2)}%` : '—';
const status = ok => <span className={`quality-dot ${ok ? 'good' : 'warn'}`}>{ok == null ? 'Unknown' : ok ? 'OK' : 'Review'}</span>;

export default function DataQuality({ market, quote, history, chain, feeds = [] }) {
  const times = [market?.updatedAt, quote?.updatedAt].map(Date.parse);
  const comparable = times.every(Number.isFinite) && times.every(t => Math.abs(Date.now() - t) < 120000) && Math.abs(times[0] - times[1]) < 60000;
  const prices = comparable ? [market?.price, quote?.price].filter(p => Number.isFinite(p) && p > 0) : [];
  const spread = prices.length > 1 ? (Math.max(...prices) / Math.min(...prices) - 1) * 100 : null;
  const coverage = chain?.tracked ? chain.covered / chain.tracked : null;
  const transferWindow = chain?.transfers?.data?.oldest && chain?.transfers?.data?.newest ? (Date.parse(chain.transfers.data.newest) - Date.parse(chain.transfers.data.oldest)) / 3600000 : null;
  const fresh = feeds.filter(f => f?.status === 'ok').length;
  return <section className="panel quality-panel"><div className="section-title"><div><span className="eyebrow">TRUST THE INPUTS</span><h3>Data quality</h3></div><span className="badge neutral">{fresh}/{feeds.length || 1} retrievals successful</span></div><div className="quality-grid"><div><strong>{status(spread === null ? null : spread < 3)} Price agreement</strong><p>{spread === null ? 'Awaiting independent USD quotes under two minutes old and within one minute of each other' : `${pct(spread)} spread across independent USD quotes`}</p></div><div><strong>{status(coverage === null ? null : coverage === 1)} Wallet availability</strong><p>{chain ? `${chain.covered}/${chain.tracked} labelled wallets available` : 'Waiting for wallet data'}</p></div><div><strong>{status(transferWindow === null ? null : transferWindow >= 24 && !chain.transfers.data.partial)} Transfer window</strong><p>{transferWindow === null ? 'Waiting for transfer history' : `${transferWindow.toFixed(1)} hours represented; bounded sample`}</p></div><div><strong>{status(feeds.some(f => !f) ? null : feeds.every(f => f.status === 'ok'))} Retrieval status</strong><p>{fresh} successful source responses in the current refresh</p></div></div><p className="small muted">Confidence is reduced when sources disagree, exchange labels are incomplete or transfer history covers only a short window. Successful retrieval does not establish freshness. Check source timestamps below. Wallet availability does not measure all-exchange coverage.</p></section>;
}
