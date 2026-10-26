'use client';
import { useEffect, useState } from 'react';

const money = n => Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '—';
const actions = 'https://github.com/sparx1981/quant-tracker/actions/workflows/qnt-paper.yml';

function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) => part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part);
}
const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

// Renders the worker's fixed report format (headings, bullets, one table, paragraphs) as React text, never as HTML.
function Markdown({ source }) {
  const lines = source.split('\n'), blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      i--;
      const [head, , ...body] = rows;
      blocks.push(<div key={i} className="table-scroll"><table className="backtest-table"><thead><tr>{cells(head).map((c, j) => <th key={j}>{c}</th>)}</tr></thead><tbody>{body.map((r, j) => <tr key={j}>{cells(r).map((c, k) => <td key={k} className={k === cells(head).length - 1 ? 'paper-reason' : undefined}>{c}</td>)}</tr>)}</tbody></table></div>);
    } else if (line.startsWith('- ')) {
      const items = [];
      while (i < lines.length && lines[i].startsWith('- ')) items.push(lines[i++].slice(2));
      i--;
      blocks.push(<ul key={i} className="paper-list">{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>);
    } else if (line.startsWith('## ')) blocks.push(<h4 key={i}>{line.slice(3)}</h4>);
    else if (line.startsWith('# ')) blocks.push(<h3 key={i}>{line.slice(2)}</h3>);
    else blocks.push(<p key={i} className="small">{inline(line)}</p>);
  }
  return <div className="paper-report">{blocks}</div>;
}

export function DailyReports() {
  const [reports, setReports] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function refresh() {
      if (busy) return;
      busy = true;
      try {
        const response = await fetch('/api/paper/reports', { signal: controller.signal });
        const result = await response.json();
        if (result.status !== 'ok') throw new Error(result.message);
        setReports(result.data); setError('');
      } catch (e) { if (!controller.signal.aborted) setError(e.message || 'Daily reports unavailable.'); }
      finally { busy = false; }
    }
    refresh();
    const timer = setInterval(refresh, 300000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  return <section className="panel paper-research" aria-labelledby="reports-title">
    <div className="section-title"><h2 id="reports-title">Daily reports</h2><span className="badge">UTC days</span></div>
    <p className="section-description">One report per UTC day: trades, lifetime results, losing exits and the decision log. Today's report updates on every observation.</p>
    {error && <p role="status" className="paper-notice">{error}{reports ? ' Showing the last reports retrieved.' : ''}</p>}
    {!reports && !error && <p className="paper-notice">Loading daily reports…</p>}
    {reports?.length === 0 && <p className="paper-notice">No daily reports have been published yet.</p>}
    {reports?.map((r, i) => <details key={r.date} open={i === 0} className="paper-day"><summary><strong>{new Date(r.date + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</strong>{i === 0 && <span className="muted"> · latest</span>}</summary><Markdown source={r.markdown} /></details>)}
  </section>;
}

export default function PaperResearch() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function refresh() {
      if (busy) return;
      busy = true;
      try {
        const response = await fetch('/api/paper', { signal: controller.signal });
        const result = await response.json();
        if (result.status !== 'ok') throw new Error(result.message);
        setReport(result.data); setError('');
      } catch (e) { if (!controller.signal.aborted) setError(e.message || 'Paper report unavailable.'); }
      finally { busy = false; if (!controller.signal.aborted) setNow(Date.now()); }
    }
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  const stale = report && now - Date.parse(report.updated_at) > 35 * 60000;
  const sparse = report && Number.isFinite(report.recent_coverage) ? report.recent_coverage < 80 : report && report.coverage < 80;
  return <section className="panel paper-research" aria-labelledby="paper-title">
    <div className="section-title"><h2 id="paper-title">QNT paper research</h2><span className="badge">PAPER ONLY · USD</span></div>
    <p className="section-description">A separate $10,000 experiment. Checks QNT every 15 minutes, records its reasoning and simulates trades. Your holdings are never used.</p>
    <p className="small">5% of cash per entry · one QNT position · 3% stop trigger · 6% profit trigger · no leverage.</p>
    {error && <p role="status" className="paper-notice">{error}</p>}
    {report && <>
      <p className="paper-notice">{stale ? 'STALE — scheduled observations are overdue.' : 'Latest observation: '+new Date(report.updated_at).toLocaleString('en-GB')}
        {' '}{report.days_observed < 14 ? `${report.days_observed.toFixed(1)} of 14 minimum observation days.` : 'Minimum observation window elapsed; results remain experimental.'}
      </p>
      {sparse && <p className="paper-notice warning-text" role="status">Sparse sampling: {Number.isFinite(report.recent_coverage) ? `${report.recent_coverage.toFixed(0)}% of the last 24 hours' ` : `${report.coverage.toFixed(1)}% of `}scheduled 15-minute observations were recorded ({report.runs} runs since start). Entries and stop or profit triggers between observations may have been missed, so results understate what the rules would have done.</p>}
      <div className="quality-grid">
        <div><strong>{money(report.equity)}</strong><p>Paper equity · net of estimated exit costs</p></div>
        <div><strong>{money(report.pnl)}</strong><p>Total paper P&amp;L · realized {money(report.realized_pnl)}</p></div>
        <div><strong>{Number.isFinite(report.win_rate) ? report.win_rate.toFixed(1)+'%' : 'No closed trades'}</strong><p>Win rate · {report.closed_trades} closed trades</p></div>
        <div><strong>{report.max_drawdown.toFixed(2)}%</strong><p>Sampled maximum drawdown · {report.coverage.toFixed(1)}% lifetime schedule coverage{Number.isFinite(report.recent_coverage) ? `, ${report.recent_coverage.toFixed(0)}% last 24h` : ''}</p></div>
      </div>
      <p className="paper-notice"><strong>{report.decisions[0]?.action}</strong> — {report.decisions[0]?.reason}</p>
      {report.positions.map(p => <p key={p.id} className="small">Open paper position: {p.qty.toFixed(4)} QNT · entry {money(p.entry)} · stop trigger {money(p.entry*.97)} · profit trigger {money(p.entry*1.06)}</p>)}
      <details><summary>Decision log and source evidence</summary><div className="table-scroll"><table className="backtest-table"><thead><tr><th>Observation</th><th>Decision</th><th>Reason / evidence</th></tr></thead><tbody>
        {report.decisions.map(d => <tr key={d.slot}><td>{new Date(d.at).toLocaleString('en-GB')}</td><td>{d.action}</td><td className="paper-reason">{d.reason}<details><summary>View inputs</summary><pre>{JSON.stringify(d.evidence, null, 2)}</pre></details></td></tr>)}
      </tbody></table></div></details>
    </>}
    <p className="small">Sources: CCXT MCP (Kraken QNT/USD price, volume and completed 1h/4h candles); DexPaprika MCP (Ethereum QNT liquidity). Missing data blocks entries. DEX liquidity is not Kraken order-book depth.</p>
    <p className="small">Stops are checked at observation time and can miss moves between runs. Losses can exceed 3%. Fees: 0.1% each side; slippage: 0.05% each side. Paper results are not predictive or equivalent to live trading.</p>
    <p className="paper-links"><a href={actions} target="_blank" rel="noreferrer">Worker status ↗</a></p>
  </section>;
}
