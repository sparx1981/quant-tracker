'use client';

import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowDownLeft, ArrowUpRight, Bell, BookOpen, ChevronDown, CircleHelp, Coins, ExternalLink, Globe2, LayoutDashboard, LockKeyhole, Radio, RefreshCw, ShieldCheck, Wallet, Waves } from 'lucide-react';

const fmt = (value, digits = 0) => Number.isFinite(value) ? value.toLocaleString('en-GB', { maximumFractionDigits: digits }) : '—';
const compact = value => Number.isFinite(value) ? Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(value) : '—';
const money = (value, currency = 'USD') => Number.isFinite(value) ? Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value) : '—';
const date = value => value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }) : 'Unavailable';
const time = value => value ? new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : '—';
const short = value => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : 'Unknown';
const ageMinutes = value => value ? (Date.now() - Date.parse(value)) / 60000 : Infinity;

function useStored(key, initial) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(true);
  useEffect(() => { try { const v = localStorage.getItem(key); if (v !== null) setValue(v); } catch { setSaved(false); } }, [key]);
  return [value, v => { setValue(v); try { localStorage.setItem(key, v); setSaved(true); } catch { setSaved(false); } }, saved];
}

function useFeed(endpoint, interval) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const refreshRef = useRef(() => {});
  useEffect(() => {
    let live = true, busy = false, controller;
    async function refresh() {
      if (busy) return;
      busy = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 35000);
      if (live) setState(s => ({ ...s, loading: true }));
      try {
        const response = await fetch(endpoint, { signal: controller.signal });
        if (!response.ok) throw new Error('Refresh failed');
        const data = await response.json();
        if (live) setState({ data, loading: false, error: null });
      } catch { if (live) setState(s => ({ ...s, loading: false, error: 'Connection interrupted. Any displayed values are from the previous retrieval.' })); }
      finally { busy = false; clearTimeout(timeout); }
    }
    refreshRef.current = refresh;
    refresh();
    const id = setInterval(() => { if (!document.hidden) refresh(); }, interval);
    const visible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { live = false; controller?.abort(); clearInterval(id); document.removeEventListener('visibilitychange', visible); };
  }, [endpoint, interval]);
  return { ...state, refresh: () => refreshRef.current() };
}

function Badge({ children, kind = 'neutral' }) { return <span className={`badge ${kind.toLowerCase()}`}>{children}</span>; }
function OutLink({ href, children, className = '' }) { return <a className={className} href={href} target="_blank" rel="noopener noreferrer">{children}<ExternalLink size={12} aria-label="opens in a new tab" /></a>; }
function Empty({ children }) { return <div className="empty"><Radio size={22} /><p>{children}</p></div>; }
function SectionTitle({ eyebrow, title, children }) { return <div className="section-title"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{children}</div>; }
function SourceStamp({ feed, label }) {
  if (!feed) return <span className="source-stamp">Connecting to {label}…</span>;
  return <span className={`source-stamp ${feed.status !== 'ok' ? 'warning-text' : ''}`}>{label} · {feed.status === 'unavailable' ? 'unavailable' : `${feed.status === 'stale' ? 'stale · ' : ''}retrieved ${time(feed.fetchedAt)} London`}</span>;
}

function PriceChart({ candles }) {
  const [range, setRange] = useState(90), [hover, setHover] = useState(null);
  const data = (candles || []).slice(-range);
  const selected = data[hover] || data.at(-1);
  const width = 760, height = 220, left = 6, right = 70, top = 16, bottom = 28;
  const prices = data.map(c => c.close);
  const minimum = prices.length ? Math.min(...prices) : 0, maximum = prices.length ? Math.max(...prices) : 1;
  const pad = Math.max((maximum - minimum) * .12, maximum * .01);
  const min = minimum - pad, max = maximum + pad;
  const x = i => left + i / Math.max(1, data.length - 1) * (width - left - right);
  const y = p => top + (max - p) / (max - min) * (height - top - bottom);
  const path = data.map((c, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(c.close).toFixed(2)}`).join(' ');
  const change = data.length > 1 ? (data.at(-1).close / data[0].close - 1) * 100 : null;
  return <section className="panel chart-panel">
    <SectionTitle title="Price performance"><div className="segmented" aria-label="Chart period">{[[30, '1M'], [90, '3M'], [180, '6M'], [365, '1Y']].map(([n, label]) => <button key={n} aria-pressed={range === n} onClick={() => { setRange(n); setHover(null); }}>{label}</button>)}</div></SectionTitle>
    <div className="chart-caption"><span><strong>{selected ? fmt(selected.close, 2) : '—'}</strong> USDT <span className="muted">· {selected ? date(selected.time) : 'Completed daily candles'}</span></span>{change !== null && <span className={change >= 0 ? 'positive' : 'negative'}>{change >= 0 ? '+' : ''}{fmt(change, 2)}% <span className="muted">in view</span></span>}</div>
    {data.length ? <svg className="price-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`QNT/USDT closing prices over ${data.length} days; latest ${fmt(data.at(-1).close, 2)} USDT`} onMouseLeave={() => setHover(null)} onMouseMove={event => { const box = event.currentTarget.getBoundingClientRect(); const xpos = (event.clientX - box.left) / box.width * width; setHover(Math.max(0, Math.min(data.length - 1, Math.round((xpos - left) / (width - left - right) * (data.length - 1))))); }}>
      <defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#bce988" stopOpacity=".23"/><stop offset="100%" stopColor="#bce988" stopOpacity="0"/></linearGradient></defs>
      {[0, 1, 2, 3].map(i => { const v = min + (max - min) * i / 3; return <g key={i}><line x1={left} x2={width - right + 8} y1={y(v)} y2={y(v)} stroke="#2b352e" strokeDasharray="3 5"/><text x={width - right + 16} y={y(v) + 4}>{fmt(v, 1)}</text></g>; })}
      <path d={`${path} L${x(data.length - 1)},${height - bottom} L${left},${height - bottom} Z`} fill="url(#chart-fill)"/><path d={path} fill="none" stroke="#c4ef98" strokeWidth="2.5" strokeLinejoin="round"/>
      {[0, Math.floor((data.length - 1) / 2), data.length - 1].map((i, j) => <text key={j} x={x(i)} y={height - 4} textAnchor={j === 0 ? 'start' : j === 2 ? 'end' : 'middle'}>{new Date(data[i].time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</text>)}
      {hover !== null && <g><line x1={x(hover)} x2={x(hover)} y1={top} y2={height - bottom} stroke="#809772" strokeDasharray="4 4"/><circle cx={x(hover)} cy={y(data[hover].close)} r="4.5" fill="#c4ef98" stroke="#18211b" strokeWidth="2"/></g>}
    </svg> : <Empty>Waiting for trading history. No sample prices are displayed.</Empty>}
    <div className="panel-foot"><span><i className="legend-dot"/>QNT / USDT</span><span>Binance · daily closes · UTC</span></div>
  </section>;
}

export default function Dashboard() {
  const marketFeed = useFeed('/api/market', 60000), chainFeed = useFeed('/api/chain', 180000), newsFeed = useFeed('/api/news', 600000);
  const [currencyValue, setCurrency] = useStored('qnt-currency', 'USD');
  const currency = currencyValue === 'GBP' ? 'GBP' : 'USD';
  const [holding, setHolding, holdingSaved] = useStored('qnt-holding', '');
  const [threshold, setThreshold] = useStored('qnt-threshold', '1000');
  const [indicatorFilter, setIndicatorFilter] = useState('All'), [newsFilter, setNewsFilter] = useState('All news');
  const [activeNav, setActiveNav] = useState('overview');
  const market = marketFeed.data?.market?.data, history = marketFeed.data?.history?.data, fx = marketFeed.data?.fx?.data;
  const analysis = history?.analysis, forecasts = marketFeed.data?.forecasts, chain = chainFeed.data;
  const other = currency === 'USD' ? 'GBP' : 'USD';
  const converted = (value, c = currency) => Number.isFinite(value) ? c === 'USD' ? value : fx?.rate ? value * fx.rate : null : null;
  const cash = (value, c = currency) => money(converted(value, c), c);
  const quantity = holding.trim() !== '' && Number.isFinite(Number(holding)) && Number(holding) >= 0 ? Number(holding) : null;
  const holdingValue = quantity !== null && market ? quantity * market.price : null;
  const thresholdNumber = threshold.trim() !== '' && Number.isFinite(Number(threshold)) && Number(threshold) >= 0 ? Number(threshold) : null;
  const transfers = chain?.transfers?.data?.items || [];
  const largeTransfers = thresholdNumber === null ? [] : transfers.filter(t => t.amount >= thresholdNumber);
  const articles = newsFilter === 'Official' ? (newsFeed.data?.official?.data || []).slice().sort((a, b) => Date.parse(b.date) - Date.parse(a.date)) : (newsFeed.data?.items || []);
  const indicators = (analysis?.indicators || []).filter(item => indicatorFilter === 'All' || item.signal === indicatorFilter);
  const busy = marketFeed.loading || chainFeed.loading || newsFeed.loading;
  const marketStale = marketFeed.error || marketFeed.data?.market?.status !== 'ok' || ageMinutes(market?.updatedAt) > 15 || ageMinutes(marketFeed.data?.market?.fetchedAt) > 5;
  const change = market?.change24h;
  const issues = [marketFeed.error && 'Market connection interrupted', chainFeed.error && 'Blockchain connection interrupted', newsFeed.error && 'News connection interrupted', marketFeed.data?.market?.status === 'unavailable' && 'Market source unavailable', marketFeed.data?.history?.status === 'unavailable' && 'Trading history unavailable', marketFeed.data?.fx?.status === 'unavailable' && 'GBP conversion unavailable'].filter(Boolean);
  function refresh() { marketFeed.refresh(); chainFeed.refresh(); newsFeed.refresh(); }
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#overview"><span className="brand-symbol">q<span/></span><span>quant<span className="brand-sub">TRACKER</span></span></a>
      <div className="sidebar-label">YOUR WORKSPACE</div>
      <nav aria-label="Dashboard sections">{[['overview', LayoutDashboard, 'Overview'], ['momentum', Activity, 'Technical signals'], ['onchain', Waves, 'On-chain activity'], ['news', Bell, 'News & updates']].map(([id, Icon, label]) => <a key={id} href={`#${id}`} onClick={() => setActiveNav(id)} className={activeNav === id ? 'active' : ''}><Icon size={18}/>{label}{id === 'overview' && <span className="nav-dot"/>}</a>)}</nav>
      <div className="sidebar-bottom"><div className="network-card"><span className="network-icon"><Globe2 size={18}/></span><div>Ethereum mainnet<small>QNT · ERC-20</small></div><i className="status-dot"/></div><a href="#methodology" className="method-link"><BookOpen size={16}/>Sources & methodology<ArrowUpRight size={15}/></a><p>One token. A clearer picture.</p></div>
    </aside>

    <main>
      <header className="topbar"><span className="breadcrumb">Workspace <span>/</span> <strong>Overview</strong></span><div className="topbar-right"><span className="desktop-only"><LockKeyhole size={13}/>Holdings stored on this device</span><span className="avatar">Q</span></div></header>
      <div className="content">
        <section id="overview" className="page-heading"><div><div className="eyebrow">THE QUANT INTELLIGENCE DASHBOARD</div><h1>A closer look at QNT<span>.</span></h1><p>Your position, the market, and the signals that matter.</p></div><div className="heading-controls"><div className="segmented currency" aria-label="Primary display currency">{['USD', 'GBP'].map(c => <button key={c} onClick={() => setCurrency(c)} aria-pressed={currency === c}>{c}</button>)}</div><button className="icon-button refresh" aria-label="Refresh dashboard data" onClick={refresh} disabled={busy}><RefreshCw size={17} className={busy ? 'spinning' : ''}/></button></div></section>
        <div className="market-line"><span><i className={`status-dot ${marketStale ? 'amber' : ''}`}/>{market ? marketStale ? 'Market data delayed' : 'Market connected' : marketFeed.loading ? 'Connecting to market sources' : 'Market unavailable'}</span><span>{market?.updatedAt ? `Price as of ${date(market.updatedAt)}, ${time(market.updatedAt)} London` : 'Prices refresh every minute while open'}</span><span className="market-line-last">USD + GBP <span className="muted">/ both always visible</span></span></div>
        {issues.length > 0 && <div className="notice" role="status">{issues.join(' · ')}. Use refresh to retry; unavailable values are never replaced with sample data.</div>}

        <div className="metrics-grid">
          <article className="metric primary-metric"><div className="metric-label">QNT price <span className="token-pill">QNT</span></div><div className="metric-value">{cash(market?.price)}</div><div className="metric-bottom"><span>{cash(market?.price, other)} <small>{other}</small></span>{Number.isFinite(change) && <Badge kind={change >= 0 ? 'bullish' : 'bearish'}>{change >= 0 ? '↗ +' : '↘ '}{fmt(change, 2)}% <small>24h</small></Badge>}</div></article>
          <article className="metric"><div className="metric-label">Total supply <Coins size={17}/></div><div className="metric-value">{compact(market?.totalSupply)}<small>QNT</small></div><div className="metric-bottom"><span>{fmt(market?.totalSupply)} tokens</span><a href="#methodology" aria-label="Total supply methodology"><CircleHelp size={14}/></a></div></article>
          <article className="metric"><div className="metric-label">Circulating supply <Globe2 size={17}/></div><div className="metric-value">{compact(market?.circulatingSupply)}<small>QNT</small></div><div className="metric-bottom"><span>{market?.circulatingEstimated ? 'Estimated: market cap ÷ price' : market?.circulatingSupply && market?.totalSupply ? `${fmt(market.circulatingSupply / market.totalSupply * 100, 2)}% of reported total supply` : 'Provider-reported circulation'}</span></div></article>
          <article className="metric"><div className="metric-label">Tracked exchange balances <ArrowDownLeft size={17}/></div><div className="metric-value">{compact(chain?.total)}<small>QNT</small></div><div className="metric-bottom"><span>{chain ? `${chain.covered}/${chain.tracked} selected wallets` : 'Connecting to wallets'}</span><Badge kind="amber">Partial</Badge></div></article>
        </div>
        <div className="data-credit"><SourceStamp feed={marketFeed.data?.market} label={market?.source || 'Market data'}/><span>24h volume {cash(market?.volume)} <span className="divider">/</span> Market cap {cash(market?.marketCap)}</span></div>

        <div className="performance-grid"><PriceChart candles={history?.candles}/><section className="panel portfolio-panel"><div className="portfolio-heading"><span className="icon-tile"><Wallet size={20}/></span><Badge>My portfolio</Badge></div><h2>Your QNT, at a glance.</h2><p className="muted">Enter your balance to follow its current value.</p><label className="input-label" htmlFor="holding">QNT you hold</label><div className="input-shell"><input id="holding" type="number" min="0" step="any" inputMode="decimal" placeholder="0.00" value={holding} onChange={e => setHolding(e.target.value)}/><span>QNT</span></div>{holding !== '' && quantity === null && <p className="negative small" role="alert">Enter a valid, non-negative quantity.</p>}<div className="portfolio-value">{holdingValue === null ? '—' : cash(holdingValue)}<small>{currency}</small></div><div className="portfolio-secondary">{holdingValue === null ? '—' : cash(holdingValue, other)} <span>{other}</span></div><div className="portfolio-foot"><LockKeyhole size={13}/>{holdingSaved ? 'Saved in this browser. No wallet connection.' : 'Browser storage unavailable; this value will not persist.'}</div></section></div>

        <div className="analysis-grid" id="momentum">
          <section className="panel momentum-panel"><SectionTitle eyebrow="READ THE MARKET" title="Technical momentum"><Badge kind={analysis?.stance || 'neutral'}>{analysis?.stance || 'Awaiting data'}</Badge></SectionTitle><div className="momentum-summary"><div className="momentum-score">{analysis?.counts ? <><strong>{analysis.counts.Bullish}</strong><span>/ {analysis.indicators.length}<small>bullish signals</small></span></> : <strong>—</strong>}</div><div className="signal-breakdown"><div className="signal-bar">{['Bullish', 'Neutral', 'Bearish'].map(signal => <span className={signal.toLowerCase()} key={signal} style={{ width: `${(analysis?.counts?.[signal] || 0) / (analysis?.indicators?.length || 1) * 100}%` }}/>)}</div><div className="signal-legend"><span><i className="legend-dot"/>{analysis?.counts?.Bullish ?? '—'} Bullish</span><span><i className="legend-dot neutral"/>{analysis?.counts?.Neutral ?? '—'} Neutral</span><span><i className="legend-dot bearish"/>{analysis?.counts?.Bearish ?? '—'} Bearish</span></div></div></div><p className="section-description">Daily signals, each with a reason. A directional summary, not a probability of profit.</p><div className="filter-row">{['All', 'Bullish', 'Bearish', 'Neutral'].map(filter => <button key={filter} onClick={() => setIndicatorFilter(filter)} aria-pressed={indicatorFilter === filter}>{filter}</button>)}</div><div className="indicator-list">{indicators.length ? indicators.map(item => <details className="indicator" key={item.name}><summary><span><strong>{item.name}</strong><small>{item.category}</small></span><span className="indicator-reading">{item.value}</span><Badge kind={item.signal}>{item.signal}</Badge><ChevronDown size={14}/></summary><p>{item.explanation}</p></details>) : <Empty>{analysis?.indicators?.length ? `No ${indicatorFilter.toLowerCase()} indicators in this reading.` : 'Technical analysis will appear when sufficient daily history is available.'}</Empty>}</div><div className="panel-foot"><span>Binance · closed daily candles</span><span>{analysis?.asOf ? `Through ${date(analysis.asOf)} UTC` : 'Awaiting history'}</span></div><SourceStamp feed={marketFeed.data?.history} label="History"/></section>

          <section className="panel forecasts-panel"><SectionTitle eyebrow="LOOKING AHEAD" title="Price scenarios"><span className="icon-tile small-tile"><Activity size={17}/></span></SectionTitle><p className="section-description">Levels to watch across five horizons. These are model scenarios, not price promises.</p><div className="scenario-key"><span><i className="legend-dot bearish"/>Bear</span><span><i className="legend-dot neutral"/>Base</span><span><i className="legend-dot"/>Bull</span><span>{currency} / {other}</span></div><div className="table-scroll"><table className="forecast-table"><thead><tr><th>Horizon</th><th>Bear</th><th>Base</th><th>Bull</th></tr></thead><tbody>{forecasts?.levels.map(row => <tr key={row.days}><th>{row.horizon}<small>{row.days} days</small></th>{['bear', 'base', 'bull'].map(kind => <td className={kind} key={kind}>{cash(row[kind])}<small>{cash(row[kind], other)}</small></td>)}</tr>)}</tbody></table></div>{!forecasts && <Empty>Scenarios need a current price and at least 91 daily closes.</Empty>}<div className="model-note"><CircleHelp size={17}/><div><strong>Uncertainty grows with time</strong><p>90-day log-return volatility, with a reduced and capped trend assumption. Bear/bull are the model’s 10th/90th percentiles, not validated confidence limits.</p></div></div><details className="method-details"><summary>How these levels are calculated <ChevronDown size={14}/></summary><p>Using the latest 90 daily QNT/USDT log returns, we reduce mean daily drift to 25% of its observed value and cap it at ±ln(2)/365. Base = current USD price × exp(drift × days). Bear and bull multiply that base by exp(±1.28155 × daily volatility × √days).</p><p>Assumes independent, normally distributed log returns, constant volatility and stable USDT/USD. No news or fundamentals are included. The model is not backtested or calibrated; longer horizons are especially speculative. GBP uses the latest available daily FX rate, not a forecast exchange rate.</p></details></section>
        </div>

        <section id="onchain" className="onchain-section"><SectionTitle eyebrow="FOLLOW THE TOKENS" title="On-chain activity"><Badge kind="amber">Partial coverage</Badge></SectionTitle><div className="onchain-grid"><div className="panel exchange-panel"><SectionTitle title="Exchange wallets"><Coins size={18}/></SectionTitle><div className="exchange-total">{fmt(chain?.total, 2)} <small>QNT</small></div><p className="section-description">Sum of the selected wallets below. This is not the total QNT held on exchanges.</p><div className="exchange-list">{chain?.wallets?.map(w => <div className="exchange" key={w.wallet.address}><div><span className={`exchange-icon ${w.wallet.exchange.toLowerCase()}`}>{w.wallet.exchange[0]}</span><span><OutLink href={`https://etherscan.io/address/${w.wallet.address}`}>{w.wallet.name}</OutLink><small>{short(w.wallet.address)}</small></span></div><span className="exchange-balance">{w.data ? fmt(w.data.balance, 2) : 'Unavailable'}<small>{w.status === 'ok' ? 'QNT' : w.status}</small></span></div>)}</div><div className="exchange-note"><ShieldCheck size={15}/><span>Labels linked to Etherscan. Balances read from Blockscout.</span></div><div className="holder-count"><span>Indexed holder addresses</span><strong>{fmt(chain?.token?.data?.holders)}</strong></div><p className="small muted">Addresses ≠ people. Exchange custody combines many users. No average-user holding is inferred.</p><SourceStamp feed={chain?.token} label="Blockscout token data"/>{chain?.wallets?.map(w => <SourceStamp key={w.wallet.address} feed={w} label={w.wallet.name}/>)}</div>
          <div className="panel transfers-panel"><SectionTitle title="Large token movements"><span className="small muted">Latest transfer sample</span></SectionTitle><div className="threshold-row"><label htmlFor="threshold">Show transfers of at least</label><div className="input-shell compact-input"><input id="threshold" type="number" min="0" step="any" value={threshold} onChange={e => setThreshold(e.target.value)} aria-label="Minimum transfer quantity"/><span>QNT</span></div><span className="muted small">≈ {thresholdNumber !== null && market ? cash(thresholdNumber * market.price) : '—'}</span></div>{thresholdNumber === null && <p className="negative small" role="alert">Enter a valid, non-negative threshold.</p>}<div className="transfer-meta">{chain?.transfers?.data ? `${largeTransfers.length} matching transfers in the latest ${chain.transfers.data.sampled} indexed events` : 'Connecting to public transfer data'}<span>Values at current price</span></div><div className="table-scroll"><table className="transfers-table"><thead><tr><th>Movement</th><th>Amount</th><th>Time · London</th><th><span className="sr-only">Transaction</span></th></tr></thead><tbody>{largeTransfers.slice(0, 12).map(t => <tr key={`${t.hash}-${t.index}`}><td><div className="transfer-route"><span title={t.from}>{t.fromName || short(t.from)}</span><ArrowUpRight size={13}/><span title={t.to}>{t.toName || short(t.to)}</span></div><small>Block {fmt(t.block)}</small></td><td><strong>{fmt(t.amount, 2)} QNT</strong><small>{market ? cash(t.amount * market.price) : '—'}</small></td><td>{time(t.at)}<small>{date(t.at)}</small></td><td><OutLink href={`https://etherscan.io/tx/${t.hash}`}><span className="sr-only">View transaction {short(t.hash)}</span></OutLink></td></tr>)}</tbody></table></div>{largeTransfers.length === 0 && <Empty>{chain?.transfers?.status === 'unavailable' ? 'Transfer source unavailable. Try refreshing shortly.' : transfers.length ? 'No transfers in this sample meet your threshold. Lower it to see smaller movements.' : chainFeed.loading ? 'Loading recent QNT transfers…' : 'No indexed transfers available.'}</Empty>}<div className="transfer-foot"><p>Limited to one recent page of events; not a complete historical scan or real-time alert service. A transfer does not establish a purchase, sale, or change in ownership.</p>{chain?.transfers?.data?.oldest && <p>Sample window: {date(chain.transfers.data.oldest)}, {time(chain.transfers.data.oldest)} → {date(chain.transfers.data.newest)}, {time(chain.transfers.data.newest)} London.</p>}<SourceStamp feed={chain?.transfers} label="Blockscout transfers"/></div></div></div></section>

        <section id="news" className="news-section"><SectionTitle eyebrow="STAY IN THE LOOP" title="News & announcements"><div className="segmented">{['All news', 'Official'].map(filter => <button key={filter} aria-pressed={newsFilter === filter} onClick={() => setNewsFilter(filter)}>{filter}</button>)}</div></SectionTitle><div className="news-grid">{articles.slice(0, 6).map((item, index) => <a key={item.url} className="news-card" href={item.url} target="_blank" rel="noopener noreferrer"><div className="news-meta"><span className={item.official ? 'official-label' : ''}>{item.official && <ShieldCheck size={13}/>} {item.source}</span><ArrowUpRight size={18}/></div><h3>{item.title}</h3><div className="news-bottom"><span>{date(item.date)}</span><span>{item.official ? 'Announcement' : 'Media coverage'} <span className="news-index">0{index + 1}</span></span></div></a>)}</div>{!articles.length && <Empty>{newsFeed.loading ? 'Checking the latest feeds…' : 'No articles available in this view. You can visit Quant’s official news directly below.'}</Empty>}<div className="news-source-line"><div><SourceStamp feed={newsFeed.data?.official} label="Quant RSS"/><SourceStamp feed={newsFeed.data?.coverage} label="Google News RSS"/></div><OutLink href="https://quant.network/news/">Visit Quant news</OutLink></div><p className="small muted">Feeds checked every 10 minutes while open. Official company announcements and third-party reporting are labelled separately; inclusion does not verify a claim. Headlines link to their source.</p></section>

        <section className="methodology panel" id="methodology"><details><summary><span><BookOpen size={18}/><strong>Sources, definitions & methodology</strong></span><ChevronDown size={18}/></summary><div className="methodology-grid"><div><h3>Market & supply</h3><p><OutLink href={market?.url || 'https://www.coingecko.com/en/coins/quant'}>{market?.source || 'CoinGecko'}</OutLink> supplies USD spot prices, market cap and supply. CoinPaprika is a fallback and may use different supply definitions. An implied circulating supply is explicitly labelled when calculated from market cap ÷ price.</p><p>Blockscout’s raw contract supply{chain?.token?.data?.rawContractSupply ? ` (${fmt(chain.token.data.rawContractSupply)} QNT)` : ''} can include balances treated differently by market-data providers. It is not substituted for the reported total or circulating supply.</p><p>GBP uses <OutLink href="https://frankfurter.dev/">Frankfurter / ECB</OutLink> reference FX{fx ? ` dated ${fx.date}, $1 = £${fx.rate}` : ''}. FX is daily, not a live dealing rate. Values exclude fees and spreads.</p></div><div><h3>Signals & scenarios</h3><p><OutLink href="https://www.binance.com/en/trade/QNT_USDT">Binance QNT/USDT</OutLink> daily candles exclude the unfinished UTC day. USDT is not USD; the chart and indicator readings remain in USDT.</p><p>Each signal has one equal vote: bullish +1, bearish −1, neutral 0. A mean above +0.2 is bullish, below −0.2 bearish, otherwise neutral. Indicators overlap and are not independent evidence.</p><p>Scenarios use the current USD spot price and Binance return volatility, assuming a stable USDT/USD relationship. The forecasts are illustrative, not investment recommendations or validated price targets.</p></div><div><h3>Blockchain & privacy</h3><p><OutLink href={`https://eth.blockscout.com/token/${'0x4a220E6096B25EADb88358cb44068A3248254675'}`}>Blockscout</OutLink> provides balances, address counts and the latest page of ERC-20 transfer events. Only three explicitly listed wallets are tracked; deposit addresses, other hot/cold wallets and off-chain holdings are excluded.</p><p>The large-transfer threshold is your chosen QNT quantity. No average-person baseline is claimed. Balances refresh every 5 minutes; transfers every 3 minutes, subject to provider indexing and caching.</p><p>Your holdings and preferences are saved only in this browser and are never sent to the dashboard server. Clearing browser storage removes them; devices do not sync. Public source outages are labelled rather than replaced with invented data.</p></div></div></details></section>
        <footer><span>QUANT TRACKER <span className="footer-dot">·</span> Independent dashboard, not affiliated with Quant.</span><span>Built for a clearer view.</span></footer>
      </div>
    </main>
  </div>;
}

