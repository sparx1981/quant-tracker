'use client';
import { useEffect, useMemo, useState } from 'react';
import { journalOutcome } from '../lib/risk';
import { road, protectionComparison } from '../lib/road';
const number = n => Number.isFinite(n) ? n.toLocaleString('en-GB',{maximumFractionDigits:1}) : '—';
const date = t => new Date(t).toLocaleDateString('en-GB',{month:'short',year:'numeric',timeZone:'UTC'});
const DAY=86400000;
export default function RoadToTarget({candles=[],spot,cash,quantity,stale}) {
  const [settings,setSettings]=useState({target:'1000',cost:'130',risk:'20'});
  const [tracking,setTracking]=useState(null),[ready,setReady]=useState(false),[saved,setSaved]=useState(true),[window,setWindow]=useState(180);
  useEffect(()=>{try{const s=JSON.parse(localStorage.getItem('qnt-road-settings')||'null');if(s) setSettings({target:String(s.target??1000),cost:String(s.cost??130),risk:String(s.risk??20)});const t=JSON.parse(localStorage.getItem('qnt-road-tracking')||'null');if(t?.peak>0 && Number.isFinite(t.start))setTracking(t);}catch{setSaved(false);}setReady(true);},[]);
  useEffect(()=>{if(ready)try{localStorage.setItem('qnt-road-settings',JSON.stringify(settings));}catch{setSaved(false);}},[settings,ready]);
  useEffect(()=>{
    if(!ready||!candles.length||stale)return;
    setTracking(old=>{
      const start=old?.start??candles.at(-1).closeTime;
      const rows=candles.filter(c=>c.closeTime>=start);
      const peak=Math.max(old?.peak||0,...rows.map(c=>c.close));
      if(!peak)return old;
      const t={start,peak};try{localStorage.setItem('qnt-road-tracking',JSON.stringify(t));}catch{setSaved(false);}return t;
    });
  },[candles,ready,stale]);
  const target=Number(settings.target),cost=Number(settings.cost),risk=Number(settings.risk);
  const valid=target>0&&cost>0&&risk>0&&risk<100&&[target,cost,risk].every(Number.isFinite);
  const data=useMemo(()=>valid?road(candles,spot,target):null,[candles,spot,target,valid]);
  const comparison=useMemo(()=>protectionComparison(candles),[candles]);
  const c=data?.channels.find(c=>c.window===window);
  const last=candles.at(-1), drawdown=tracking&&last?Math.max(0,1-last.close/tracking.peak)*100:null;
  const liveDrawdown=tracking&&spot>0?Math.max(0,1-spot/tracking.peak)*100:null;
  const status=drawdown===null?'Awaiting history':drawdown>=risk?'Risk budget breached':drawdown>=Math.min(15,risk)?'Review drawdown':'Within risk budget';
  const end=c?.end, future=180;
  const points=c?[...c.rows.map(r=>r.close),target,...[-2,0,2].map(k=>Math.exp(c.intercept+c.slope*future+k*c.residual))]:[];
  const low=points.length?Math.log(Math.min(...points))-.1:0,high=points.length?Math.log(Math.max(...points))+.1:1;
  const x=t=>45+(t-(end-(window-1)*DAY))/((window-1+future)*DAY)*670;
  const y=p=>230-(Math.log(p)-low)/(high-low)*200;
  const line=k=>`M${x(end-(window-1)*DAY)},${y(Math.exp(c.intercept-c.slope*(window-1)+k*c.residual))} L${x(end)},${y(Math.exp(c.intercept+k*c.residual))}`;
  return <section id="road" className="road-section"><div className="section-title"><div><span className="eyebrow">YOUR PLAN, IN PERSPECTIVE</span><h2>Road to Target</h2></div><span className="badge neutral">Scenarios · not a countdown</span></div>
    <div className="road-settings panel">{[['target','Target · USD'],['cost','Approx. cost basis · USD'],['risk','Risk budget · %']].map(([key,label])=><label key={key}>{label}<input type="number" min={key==='risk'?1:.01} max={key==='risk'?99:undefined} step="any" value={settings[key]} onChange={e=>setSettings(s=>({...s,[key]:e.target.value}))}/></label>)}<p className="small muted">{saved?'Preferences and peak tracking stay in this browser.':'Storage unavailable; settings may not persist.'}</p></div>
    {!valid?<p role="alert">Enter positive target/cost values and a risk budget between 0 and 100%.</p>:<>
    <div className="analysis-grid"><div className="panel"><div className="section-title"><h3>Trend channels</h3><div className="segmented">{[90,180,365].map(w=><button key={w} onClick={()=>setWindow(w)} aria-pressed={window===w}>{w===365?'1 year':`${w} days`}</button>)}</div></div><p className="section-description">{spot>0?spot>=target?'Target currently reached':`${number((target/spot-1)*100)}% gain required`:'Awaiting price'} · Target {cash(target)} · logarithmic scale</p>
    {c?<svg viewBox="0 0 760 275" className="road-chart" role="img" aria-label={`${window}-day log regression channel with six-month conditional projection and target line`}><defs><clipPath id="road-clip"><rect x="40" y="15" width="680" height="230"/></clipPath></defs><g clipPath="url(#road-clip)"><path d={c.rows.map((r,i)=>`${i?'L':'M'}${x(r.closeTime)},${y(r.close)}`).join(' ')} fill="none" stroke="#c4ef98" strokeWidth="2"/>{[-2,0,2].map(k=><g key={k}><path d={line(k)} fill="none" stroke="#8097c4" opacity={k===0?1:.6}/><path d={`M${x(end)},${y(Math.exp(c.intercept+k*c.residual))} L${x(end+future*DAY)},${y(Math.exp(c.intercept+c.slope*future+k*c.residual))}`} fill="none" stroke="#8097c4" strokeDasharray="5 5"/></g>)}<path d={`M40,${y(target)} H720`} stroke="#efc97c" strokeDasharray="8 4"/></g><text x="45" y={Math.max(15,y(target)-6)} fill="#efc97c" fontSize="11">Target ${number(target)}</text><text x="45" y="265" fill="#9daa94" fontSize="11">{date(c.rows[0].time)}</text><text x={x(end)-25} y="265" fill="#9daa94" fontSize="11">{date(end)}</text><text x="665" y="265" fill="#9daa94" fontSize="11">{date(end+future*DAY)}</text></svg>:<p className="empty">Insufficient history for this channel.</p>}
    <p className="small muted">Binance QNT/USDT, assuming USDT ≈ USD. Solid: fitted history; dashed: six-month extrapolation. Bands ±2 residual standard deviations are historical variation, not confidence bounds.</p>
    <div className="table-scroll"><table className="backtest-table"><thead><tr><th>Fit</th><th>Centre reaches target if trend persists</th></tr></thead><tbody>{data?.channels.map(ch=><tr key={ch.window}><th>{ch.window} days</th><td>{spot>=target?'Target currently reached':ch.slope<=0?'No upward intersection':ch.crossings[1]?date(ch.crossings[1]):'No future intersection within 24 months'}</td></tr>)}</tbody></table></div><p className="warning-text small">{data?.unstable?'Timing estimate unstable: fits disagree or lack a future intersection.':'Conditional intersections only; the trend may change.'}</p></div>
    <div className="panel"><h3>Capital protection</h3><p className="road-value">{number(drawdown)}% <small>daily-close drawdown</small></p><span className={`badge ${drawdown>=Math.min(15,risk)?'amber':'neutral'}`}>{status}</span><p className="section-description">Tracked peak close: {cash(tracking?.peak)} · tracking from {tracking?new Date(tracking.start).toLocaleDateString('en-GB'):'first available completed close'}.</p><p className="small muted">Live quote versus peak: {number(liveDrawdown)}% below. This compares Coinbase USD with Binance USDT closes; it is not the day's maximum intraday drawdown.</p><div className="road-stats"><p>Review level (15% or lower budget)<strong>{cash(tracking?.peak*(1-Math.min(15,risk)/100))}</strong></p><p>Your {number(risk)}% budget level<strong>{cash(tracking?.peak*(1-risk/100))}</strong></p><p>Return versus approximate cost<strong>{spot>0?number((spot/cost-1)*100):'—'}%</strong></p><p>Position at target, before costs<strong>{quantity===null?'Enter holdings above':cash(quantity*target)}</strong></p></div><p className="small muted">Alerts are on-screen only, evaluated while open. No automatic trades. A budget is not a guaranteed loss cap. Ordinary corrections and bear markets cannot be reliably distinguished in advance.</p><p className="small muted">Peak history is reconstructed from available daily candles since tracking began. Clearing browser storage resets tracking; long gaps beyond available history can miss peaks.</p></div></div>
    <div className="panel"><h3>What would it take?</h3><div className="table-scroll"><table className="backtest-table"><thead><tr><th>Horizon</th><th>Required compounded monthly growth</th><th>Model chance of touching target</th></tr></thead><tbody>{data?.horizons.map(h=><tr key={h.months}><th>{h.months} months</th><td>{spot>=target?'Already reached':h.required==null?'Unavailable':`${number(h.required*100)}%`}</td><td>{h.probability==null?'Unavailable':`${number(h.probability*100)}%`}</td></tr>)}</tbody></table></div><p className="small muted">Uncalibrated log-Brownian estimates using the existing 90-return volatility and shrunk drift model. Constant volatility and stable USDT/USD assumed. Events overlap; 24-month estimates are especially uncertain. Live starting quote: {cash(spot)}.</p></div>
    <div className="panel"><h3>Protective exit comparison</h3><p className="section-description">Same $10,000 start after 200 warm-up candles. Daily-close trailing exits, next-open execution; re-enter after two consecutive closes above SMA 50. 0.1% fee + 0.05% slippage per side; final liquidation included.</p><div className="table-scroll"><table className="backtest-table"><thead><tr><th>Rule</th><th>Net return</th><th>Max close drawdown</th><th>Protective exits</th><th>Days in cash</th></tr></thead><tbody>{comparison.map(r=><tr key={r.limit??'hold'}><th>{r.limit?`${r.limit*100}% trailing`:'Buy & hold'}</th><td>{number(r.returnPct)}%</td><td>{number(r.drawdown)}%</td><td>{r.exits}</td><td>{r.daysOut}</td></tr>)}</tbody></table></div><p className="small muted">{candles.length>=260?`${date(candles[200].time)}–${date(candles.at(-1).closeTime)}. `:'Insufficient history. '}Historical comparison, not walk-forward validation or a recommendation. Real losses can exceed thresholds. No $1,000 target sale is imposed in this comparison. Re-entry can buy back higher; use alongside the strategy lab, not as a winner-selection tool.</p></div>
    {stale&&<p className="warning-text">Source data is delayed; do not treat these readings as current alerts.</p>}</>}
  </section>;
}

export function SignalJournal({ stance, price, candles = [], target = 1000 }) {
  const [entries, setEntries] = useState([]);
  useEffect(() => {
    try { setEntries(JSON.parse(localStorage.getItem('qnt-signal-journal') || '[]')); } catch { setEntries([]); }
  }, []);
  useEffect(() => {
    if (!stance || !Number.isFinite(price) || !['Bullish', 'Bearish', 'Neutral'].includes(stance)) return;
    const now = Date.now(), key = `${stance}-${Math.round(price)}`;
    setEntries(old => {
      if (old.some(e => e.key === key && now - e.created < 86400000)) return old;
      const next = [{ key, stance, price, target, created: now, horizonDays: 30 }, ...old].slice(0, 100);
      try { localStorage.setItem('qnt-signal-journal', JSON.stringify(next)); } catch { /* local storage is optional */ }
      return next;
    });
  }, [stance, price, target]);
  const matured = entries.filter(e => journalOutcome(e, candles));
  const successful = matured.filter(e => journalOutcome(e, candles)?.aligned);
  return <section className="panel signal-journal"><div className="section-title"><div><span className="eyebrow">MEASURE THE EDGE</span><h3>Signal journal</h3></div><span className="badge neutral">Browser-only</span></div><p className="section-description">Momentum readings are saved when they change materially. Outcomes use the first completed daily close on or after the 30-day deadline. Missing history stays unscored. USD entries are compared with Binance USDT closes, assuming parity.</p><div className="journal-stats"><span><strong>{entries.length}</strong> logged</span><span><strong>{matured.length}</strong> matured</span><span><strong>{matured.length ? `${(successful.length / matured.length * 100).toFixed(0)}%` : '—'}</strong> directional hit rate</span></div><div className="table-scroll"><table className="backtest-table"><thead><tr><th>Signal</th><th>Price</th><th>Recorded</th><th>Outcome</th></tr></thead><tbody>{entries.slice(0, 8).map(e => { const outcome = journalOutcome(e, candles); const done = Boolean(outcome); const good = outcome?.aligned; return <tr key={`${e.key}-${e.created}`}><th>{e.stance}</th><td>{e.price.toFixed(2)}</td><td>{new Date(e.created).toLocaleDateString('en-GB')}</td><td>{done ? good ? 'Aligned' : 'Not aligned' : 'Waiting'}</td></tr>; })}</tbody></table></div><p className="small muted">This is an observational audit, not a retrained model. It needs enough matured observations before the hit rate means anything.</p></section>;
}
