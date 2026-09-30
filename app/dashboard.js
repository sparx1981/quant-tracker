'use client';

import { useEffect, useRef, useState } from 'react';
import RoadToTarget, { SignalJournal } from './road';
import OutlookSummary from './summary';
import DataQuality from './quality';
import FeedHealth from './feeds';
import { Momentum, Scenarios, Backtests, SocialWatchlist } from './research';
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
  const [state, setState] = useState({ endpoint, data: null, loading: true, error: null });
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
        if (live) setState({ endpoint, data, loading: false, error: null });
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
  return { ...state, data: state.endpoint === endpoint ? state.data : null, refresh: () => refreshRef.current() };
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
  const [range, setRange] = useState('3M'), [hover, setHover] = useState(null);
  const config = { '1hr': ['1m', 60], '4hr': ['5m', 48], 'Daily': ['15m', 96], '1M': ['1d', 30], '3M': ['1d', 90], '6M': ['1d', 180], '1Y': ['1d', 365] };
  const [interval, bars] = config[range];
  const chartFeed = useFeed('/api/history?interval=' + interval, interval === '1d' ? 300000 : 30000);
  const sourceCandles = interval === '1d' ? (chartFeed.data?.data?.candles || candles) : chartFeed.data?.data?.candles;
  const data = (sourceCandles || []).slice(-bars);
  const intraday = interval !== '1d';
  const chartDate = value => intraday ? new Date(value).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', timeZone:'UTC' }) : date(value);
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
    <SectionTitle title="Price performance"><div className="segmented" aria-label="Chart period">{Object.keys(config).map(label => <button key={label} aria-pressed={range === label} onClick={() => { setRange(label); setHover(null); }}>{label}</button>)}</div></SectionTitle>
    <div className="chart-caption"><span><strong>{selected ? fmt(selected.close, 2) : '—'}</strong> USDT <span className="muted">· {selected ? chartDate(selected.time) : 'Completed candles'}</span></span>{change !== null && <span className={change >= 0 ? 'positive' : 'negative'}>{change >= 0 ? '+' : ''}{fmt(change, 2)}% <span className="muted">in view</span></span>}</div>
    {data.length ? <svg className="price-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`QNT/USDT closing prices over ${data.length} ${interval} candles; latest ${fmt(data.at(-1).close, 2)} USDT`} onMouseLeave={() => setHover(null)} onMouseMove={event => { const box = event.currentTarget.getBoundingClientRect(); const xpos = (event.clientX - box.left) / box.width * width; setHover(Math.max(0, Math.min(data.length - 1, Math.round((xpos - left) / (width - left - right) * (data.length - 1))))); }}>
      <defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#bce988" stopOpacity=".23"/><stop offset="100%" stopColor="#bce988" stopOpacity="0"/></linearGradient></defs>
      {[0, 1, 2, 3].map(i => { const v = min + (max - min) * i / 3; return <g key={i}><line x1={left} x2={width - right + 8} y1={y(v)} y2={y(v)} stroke="#2b352e" strokeDasharray="3 5"/><text x={width - right + 16} y={y(v) + 4}>{fmt(v, 1)}</text></g>; })}
      <path d={`${path} L${x(data.length - 1)},${height - bottom} L${left},${height - bottom} Z`} fill="url(#chart-fill)"/><path d={path} fill="none" stroke="#c4ef98" strokeWidth="2.5" strokeLinejoin="round"/>
      {[0, Math.floor((data.length - 1) / 2), data.length - 1].map((i, j) => <text key={j} x={x(i)} y={height - 4} textAnchor={j === 0 ? 'start' : j === 2 ? 'end' : 'middle'}>{chartDate(data[i].time)}</text>)}
      {hover !== null && data[hover] && <g><line x1={x(hover)} x2={x(hover)} y1={top} y2={height - bottom} stroke="#809772" strokeDasharray="4 4"/><circle cx={x(hover)} cy={y(data[hover].close)} r="4.5" fill="#c4ef98" stroke="#18211b" strokeWidth="2"/></g>}
    </svg> : <Empty>Waiting for trading history. No sample prices are displayed.</Empty>}
    <div className="panel-foot"><span><i className="legend-dot"/>QNT / USDT</span><span>Binance · {interval} closes · UTC</span></div>
  </section>;
}

export default function Dashboard() {
  const marketFeed = useFeed('/api/market', 60000), chainFeed = useFeed('/api/chain', 60000), newsFeed = useFeed('/api/news', 600000);
  const quoteFeed = useFeed('/api/quote', 15000);
  const backtestFeed = useFeed('/api/backtest', 300000);
  const [momentumTimeframe, setMomentumTimeframe] = useState('1d');
  const momentumFeed = useFeed('/api/history?interval=' + momentumTimeframe, 60000);
  const [transferView, setTransferView] = useState('large');
  const [currencyValue, setCurrency] = useStored('qnt-currency', 'USD');
  const currency = currencyValue === 'GBP' ? 'GBP' : 'USD';
  const [holding, setHolding, holdingSaved] = useStored('qnt-holding', '');
  const [threshold, setThreshold] = useStored('qnt-threshold', '1000');
  const [indicatorFilter, setIndicatorFilter] = useState('All'), [newsFilter, setNewsFilter] = useState('All news');
  const [activeNav, setActiveNav] = useState('overview');
  const snapshot = marketFeed.data?.market?.data;
  const quote = quoteFeed.data?.status === 'ok' && !quoteFeed.error && ageMinutes(quoteFeed.data?.fetchedAt) < 2 ? quoteFeed.data.data : null;
  const market = snapshot || quote ? { ...snapshot, ...(quote ? { price: quote.price, change24h: quote.change24h, updatedAt: quote.updatedAt } : {}) } : null;
  const history = marketFeed.data?.history?.data, fx = marketFeed.data?.fx?.data;
  const analysis = history?.analysis, forecasts = marketFeed.data?.forecasts, chain = chainFeed.data;
  const other = currency === 'USD' ? 'GBP' : 'USD';
  const converted = (value, c = currency) => Number.isFinite(value) ? c === 'USD' ? value : fx?.rate ? value * fx.rate : null : null;
  const cash = (value, c = currency) => money(converted(value, c), c);
  const quantity = holding.trim() !== '' && Number.isFinite(Number(holding)) && Number(holding) >= 0 ? Number(holding) : null;
  const holdingValue = quantity !== null && market ? quantity * market.price : null;
  const thresholdNumber = threshold.trim() !== '' && Number.isFinite(Number(threshold)) && Number(threshold) >= 0 ? Number(threshold) : null;
  const transfers = chain?.transfers?.data?.items || [];
  const largeTransfers = transferView === 'all' ? transfers : thresholdNumber === null ? [] : transfers.filter(t => t.amount >= thresholdNumber);
  const articles = newsFilter === 'Official' ? (newsFeed.data?.official?.data || []).slice().sort((a, b) => Date.parse(b.date) - Date.parse(a.date)) : (newsFeed.data?.items || []);
  const indicators = (analysis?.indicators || []).filter(item => indicatorFilter === 'All' || item.signal === indicatorFilter);
  const busy = marketFeed.loading || chainFeed.loading || newsFeed.loading;
  const marketStale = quote ? ageMinutes(quote.updatedAt) > 2 : true;
  const change = market?.change24h;
  const issues = [marketFeed.error && 'Market connection interrupted', chainFeed.error && 'Blockchain connection interrupted', newsFeed.error && 'News connection interrupted', marketFeed.data?.market?.status === 'unavailable' && 'Market source unavailable', marketFeed.data?.history?.status === 'unavailable' && 'Trading history unavailable', marketFeed.data?.fx?.status === 'unavailable' && 'GBP conversion unavailable'].filter(Boolean);
  function refresh() { marketFeed.refresh(); chainFeed.refresh(); newsFeed.refresh(); quoteFeed.refresh(); momentumFeed.refresh(); backtestFeed.refresh(); }
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#overview"><span className="quant-mark" role="img" aria-label="Official Quant mark"/><span>Quant<span className="brand-sub">TRACKER</span></span></a>
      <nav aria-label="Dashboard sections">{[['overview', LayoutDashboard, 'Overview'], ['feeds', Radio, 'Check feeds'], ['momentum', Activity, 'Technical signals'], ['backtest', Activity, 'Backtest lab'], ['onchain', Waves, 'On-chain activity'], ['news', Bell, 'News & updates']].map(([id, Icon, label]) => <a key={id} href={`#${id}`} onClick={() => setActiveNav(id)} className={activeNav === id ? 'active' : ''}><Icon size={18}/>{label}{id === 'overview' && <span className="nav-dot"/>}</a>)}</nav>
      <div className="sidebar-bottom"><a href="#methodology" className="method-link"><BookOpen size={16}/>Sources & methodology<ArrowUpRight size={15}/></a></div>
    </aside>

    <main>
      <div className="content">
        <section id="overview" className="page-heading"><div><div className="eyebrow">THE QUANT INTELLIGENCE DASHBOARD</div><h1>A closer look at QNT<span>.</span></h1><p>Your position, the market, and the signals that matter.</p></div><div className="heading-controls"><div className="segmented currency" aria-label="Primary display currency">{['USD', 'GBP'].map(c => <button key={c} onClick={() => setCurrency(c)} aria-pressed={currency === c}>{c}</button>)}</div><button className="icon-button refresh" aria-label="Refresh dashboard data" onClick={refresh} disabled={busy}><RefreshCw size={17} className={busy ? 'spinning' : ''}/></button></div></section>
        <div className="market-line"><span><i className={`status-dot ${marketStale ? 'amber' : ''}`}/>{market ? marketStale ? 'Market data delayed' : 'Market connected' : marketFeed.loading ? 'Connecting to market sources' : 'Market unavailable'}</span><span>{market?.updatedAt ? `Price as of ${date(market.updatedAt)}, ${time(market.updatedAt)} London` : 'USD prices refresh every 15 seconds while open'}</span><span className="market-line-last">{quote ? quote.source : "Snapshot fallback"} <span className="muted">/ polls every 15s</span></span></div>
        {issues.length > 0 && <div className="notice" role="status">{issues.join(' · ')}. Use refresh to retry; unavailable values are never replaced with sample data.</div>}

        <div className="metrics-grid">
          <article className="metric primary-metric"><div className="metric-label">QNT price <span className="token-pill">QNT</span></div><div className="metric-value">{cash(market?.price)}</div><div className="metric-bottom"><span>{cash(market?.price, other)} <small>{other}</small></span>{Number.isFinite(change) && <Badge kind={change >= 0 ? 'bullish' : 'bearish'}>{change >= 0 ? '↗ +' : '↘ '}{fmt(change, 2)}% <small>24h</small></Badge>}</div></article>
          <article className="metric"><div className="metric-label">Total supply <Coins size={17}/></div><div className="metric-value">{compact(market?.totalSupply)}<small>QNT</small></div><div className="metric-bottom"><span>{fmt(market?.totalSupply)} tokens</span><a href="#methodology" aria-label="Total supply methodology"><CircleHelp size={14}/></a></div></article>
          <article className="metric"><div className="metric-label">Circulating supply <Globe2 size={17}/></div><div className="metric-value">{compact(market?.circulatingSupply)}<small>QNT</small></div><div className="metric-bottom"><span>{market?.circulatingEstimated ? 'Estimated: market cap ÷ price' : market?.circulatingSupply && market?.totalSupply ? `${fmt(market.circulatingSupply / market.totalSupply * 100, 2)}% of reported total supply` : 'Provider-reported circulation'}</span></div></article>
          <article className="metric"><div className="metric-label">Tracked exchange balances <ArrowDownLeft size={17}/></div><div className="metric-value">{compact(chain?.total)}<small>QNT</small></div><div className="metric-bottom"><span>{chain ? `${chain.covered}/${chain.tracked} selected wallets` : 'Connecting to wallets'}</span><Badge kind="amber">Partial</Badge></div></article>
        </div>
        <div className="data-credit"><SourceStamp feed={marketFeed.data?.market} label={market?.source || 'Market data'}/><span>24h volume {cash(market?.volume)} <span className="divider">/</span> Market cap {cash(market?.marketCap)}</span></div>

        <div className="performance-grid"><PriceChart candles={history?.candles}/><section className="panel portfolio-panel"><div className="portfolio-heading"><span className="icon-tile"><Wallet size={20}/></span></div><h2>Your QNT, at a glance.</h2><label className="input-label" htmlFor="holding">QNT you hold</label><div className="input-shell"><input id="holding" type="number" min="0" step="any" inputMode="decimal" placeholder="0.00" value={holding} onChange={e => setHolding(e.target.value)}/><span>QNT</span></div>{holding !== '' && quantity === null && <p className="negative small" role="alert">Enter a valid, non-negative quantity.</p>}<div className="portfolio-value">{holdingValue === null ? '—' : cash(holdingValue)}<small>{currency}</small></div><div className="portfolio-secondary">{holdingValue === null ? '—' : cash(holdingValue, other)} <span>{other}</span></div><div className="portfolio-foot"><LockKeyhole size={13}/>{holdingSaved ? 'Saved in this browser. No wallet connection.' : 'Browser storage unavailable; this value will not persist.'}</div></section></div>

        <RoadToTarget candles={history?.candles} spot={market?.price} cash={cash} quantity={quantity} stale={marketStale || marketFeed.data?.history?.status !== 'ok'}/>
        <OutlookSummary price={market?.price} change={market?.change24h} analysis={momentumFeed.data?.data?.analysis} forecasts={forecasts} chain={chain} historyStatus={momentumFeed.data?.status}/>
        <DataQuality market={market} quote={quote} history={history} chain={chain} feeds={[marketFeed.data?.market, marketFeed.data?.history, marketFeed.data?.fx, quoteFeed.data, chainFeed.data?.transfers, newsFeed.data?.official]} />
        <FeedHealth />
        <SignalJournal stance={momentumFeed.data?.data?.analysis?.stance} price={market?.price} />
        <div className="analysis-grid" id="momentum">
          <Momentum feed={momentumFeed} timeframe={momentumTimeframe} setTimeframe={setMomentumTimeframe} refresh={momentumFeed.refresh}/>
          <Scenarios forecasts={forecasts} cash={cash} currency={currency} other={other} anchorPrice={snapshot?.price} anchorTime={snapshot?.updatedAt} stale={marketFeed.data?.market?.status !== 'ok' || marketFeed.data?.history?.status !== 'ok'}/>
        </div>
        <Backtests feed={backtestFeed} cash={cash} spot={market?.price}/>

        <section id="onchain" className="onchain-section"><SectionTitle title="On-chain activity"><Badge kind="amber">Partial coverage</Badge></SectionTitle><div className="onchain-grid"><div className="panel exchange-panel"><SectionTitle title="Exchange wallets"><Coins size={18}/></SectionTitle><div className="exchange-total">{fmt(chain?.total, 2)} <small>QNT</small></div><p className="section-description">Sum of the selected wallets below. This is not the total QNT held on exchanges.</p><div className="exchange-list">{chain?.wallets?.map(w => <div className="exchange" key={w.wallet.address}><div><span className={`exchange-icon ${w.wallet.exchange.toLowerCase()}`}>{w.wallet.exchange[0]}</span><span><OutLink href={`https://etherscan.io/address/${w.wallet.address}`}>{w.wallet.name}</OutLink><small>{short(w.wallet.address)}</small></span></div><span className="exchange-balance">{w.data ? fmt(w.data.balance, 2) : 'Unavailable'}<small>{w.status === 'ok' ? 'QNT' : w.status}</small></span></div>)}</div><div className="exchange-note"><ShieldCheck size={15}/><span>Labels linked to Etherscan. Balances read from Blockscout.</span></div><div className="holder-count"><span>Indexed holder addresses</span><strong>{fmt(chain?.token?.data?.holders)}</strong></div><p className="small muted">Addresses ≠ people. Exchange custody combines many users. No average-user holding is inferred.</p><SourceStamp feed={chain?.token} label="Blockscout token data"/>{chain?.wallets?.map(w => <SourceStamp key={w.wallet.address} feed={w} label={w.wallet.name}/>)}</div>
          <div className="panel transfers-panel"><SectionTitle title="Large token movements"><div className="segmented" aria-label="Transfer view"><button aria-pressed={transferView === 'large'} onClick={() => setTransferView('large')}>Large</button><button aria-pressed={transferView === 'all'} onClick={() => setTransferView('all')}>All transfers</button></div></SectionTitle><div className="threshold-row"><label htmlFor="threshold">Show transfers of at least</label><div className="input-shell compact-input"><input id="threshold" type="number" min="0" step="any" value={threshold} onChange={e => setThreshold(e.target.value)} aria-label="Minimum transfer quantity"/><span>QNT</span></div><span className="muted small">≈ {thresholdNumber !== null && market ? cash(thresholdNumber * market.price) : '—'}</span></div>{thresholdNumber === null && <p className="negative small" role="alert">Enter a valid, non-negative threshold.</p>}<div className="transfer-meta">{chain?.transfers?.data ? `${largeTransfers.length} matching transfers · ${chain.transfers.data.sampled} events fetched · ${chain.transfers.data.pages || 1} pages` : 'Connecting to public transfer data'}<span>Values at current price</span></div><div className="table-scroll"><table className="transfers-table"><thead><tr><th>Movement</th><th>Amount</th><th>Time · London</th><th><span className="sr-only">Transaction</span></th></tr></thead><tbody>{largeTransfers.slice(0, 12).map(t => <tr key={`${t.hash}-${t.index}`}><td><div className="transfer-route"><span title={t.from}>{t.fromName || short(t.from)}</span><ArrowUpRight size={13}/><span title={t.to}>{t.toName || short(t.to)}</span></div><small>Block {fmt(t.block)}</small></td><td><strong>{fmt(t.amount, 2)} QNT</strong><small>{market ? cash(t.amount * market.price) : '—'}</small></td><td>{time(t.at)}<small>{date(t.at)}</small></td><td><OutLink href={`https://etherscan.io/tx/${t.hash}`}><span className="sr-only">View transaction {short(t.hash)}</span></OutLink></td></tr>)}</tbody></table></div>{largeTransfers.length === 0 && <Empty>{chain?.transfers?.status === 'unavailable' ? 'Transfer source unavailable. Try refreshing shortly.' : transfers.length ? 'Transfers are loading successfully, but none meet your threshold. Select All transfers or lower the threshold.' : chainFeed.loading ? 'Loading recent QNT transfers…' : 'No indexed transfers available.'}</Empty>}<div className="transfer-foot">{chain?.transfers?.data?.partial && <p className="warning-text">Some pages could not be fetched; the available events are shown.</p>}<p>Scans up to 500 recent events across 10 pages, stopping at 24 hours or the time budget. Coverage may be much shorter during high activity. A transfer does not establish a purchase, sale, or change in ownership.</p>{chain?.transfers?.data?.oldest && <p>Sample window: {date(chain.transfers.data.oldest)}, {time(chain.transfers.data.oldest)} → {date(chain.transfers.data.newest)}, {time(chain.transfers.data.newest)} London.</p>}<SourceStamp feed={chain?.transfers} label="Blockscout transfers"/></div></div></div></section>

        <section id="news" className="news-section"><SectionTitle title="News & announcements"><div className="segmented">{['All news', 'Official'].map(filter => <button key={filter} aria-pressed={newsFilter === filter} onClick={() => setNewsFilter(filter)}>{filter}</button>)}</div></SectionTitle><SocialWatchlist/><div className="news-grid">{articles.slice(0, 6).map((item, index) => <a key={item.url} className="news-card" href={item.url} target="_blank" rel="noopener noreferrer"><div className="news-meta"><span className={item.official ? 'official-label' : ''}>{item.official && <ShieldCheck size={13}/>} {item.source}</span><ArrowUpRight size={18}/></div><h3>{item.title}</h3><div className="news-bottom"><span>{date(item.date)}</span><span>{item.official ? 'Announcement' : 'Media coverage'} <span className="news-index">0{index + 1}</span></span></div></a>)}</div>{!articles.length && <Empty>{newsFeed.loading ? 'Checking the latest feeds…' : 'No articles available in this view. You can visit Quant’s official news directly below.'}</Empty>}<div className="news-source-line"><div><SourceStamp feed={newsFeed.data?.official} label="Quant RSS"/><SourceStamp feed={newsFeed.data?.coverage} label="Google News RSS"/></div><OutLink href="https://quant.network/news/">Visit Quant news</OutLink></div><p className="small muted">Feeds checked every 10 minutes while open. Official company announcements and third-party reporting are labelled separately; inclusion does not verify a claim. Headlines link to their source.</p></section>

        <section className="methodology panel" id="methodology"><details><summary><span><BookOpen size={18}/><strong>Sources, definitions & methodology</strong></span><ChevronDown size={18}/></summary><div className="methodology-grid"><div><h3>Market & supply</h3><p><OutLink href={market?.url || 'https://www.coingecko.com/en/coins/quant'}>{market?.source || 'CoinGecko'}</OutLink> supplies USD spot prices, market cap and supply. CoinPaprika is a fallback and may use different supply definitions. An implied circulating supply is explicitly labelled when calculated from market cap ÷ price.</p><p>Blockscout’s raw contract supply{chain?.token?.data?.rawContractSupply ? ` (${fmt(chain.token.data.rawContractSupply)} QNT)` : ''} can include balances treated differently by market-data providers. It is not substituted for the reported total or circulating supply.</p><p>USD spot prices poll Coinbase QNT/USD every 15 seconds, with the market snapshot as fallback. Supply remains a separate source. GBP uses <OutLink href="https://frankfurter.dev/">Frankfurter / ECB</OutLink> reference FX{fx ? ` dated ${fx.date}, $1 = £${fx.rate}` : ''}. FX is daily, not a live dealing rate. Values exclude fees and spreads.</p></div><div><h3>Signals & scenarios</h3><p><OutLink href="https://www.binance.com/en/trade/QNT_USDT">Binance QNT/USDT</OutLink> candles exclude unfinished periods. Hourly, 4-hourly, daily, weekly and monthly indicators use their own completed candles. USDT is not USD; the chart and indicator readings remain in USDT.</p><p>Each available signal has one equal vote: bullish +1, bearish −1, neutral 0. A mean above +0.2 is bullish, below −0.2 bearish, otherwise neutral. Indicators overlap and are not independent evidence.</p><p>Scenarios use the current USD spot price and Binance return volatility, assuming a stable USDT/USD relationship. Touch probabilities are model-implied barrier-crossing estimates, not measured success rates. Backtests compare fixed strategies after costs and show a recent chronological validation slice.</p></div><div><h3>Blockchain & privacy</h3><p><OutLink href={`https://eth.blockscout.com/token/${'0x4a220E6096B25EADb88358cb44068A3248254675'}`}>Blockscout</OutLink> provides balances, address counts and up to 10 recent pages of ERC-20 transfer events. Only three explicitly listed wallets are tracked; deposit addresses, other hot/cold wallets and off-chain holdings are excluded.</p><p>The large-transfer threshold is your chosen QNT quantity. No average-person baseline is claimed. Balances refresh every 5 minutes; transfers every minute, subject to provider indexing and caching.</p><p>Your holdings and preferences are saved only in this browser and are never sent to the dashboard server. Clearing browser storage removes them; devices do not sync. Public source outages are labelled rather than replaced with invented data.</p></div></div></details></section>
        <footer><span>QUANT TRACKER <span className="footer-dot">·</span> Independent dashboard, not affiliated with Quant.</span><span>Built for a clearer view.</span></footer>
      </div>
    </main>
  </div>;
}
