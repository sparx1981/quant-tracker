'use client';
import { useEffect, useState } from 'react';

const money = n => Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '—';
const actions = 'https://github.com/sparx1981/quant-tracker/actions/workflows/qnt-paper.yml';
const reports = 'https://github.com/sparx1981/quant-tracker/tree/paper-ledger';

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
  return <section className="panel paper-research" aria-labelledby="paper-title">
    <div className="section-title"><h2 id="paper-title">QNT paper research</h2><span className="badge">PAPER ONLY · USD</span></div>
    <p className="section-description">A separate $10,000 experiment. Checks QNT every 15 minutes, records its reasoning and simulates trades. Your holdings are never used.</p>
    <p className="small">5% of cash per entry · one QNT position · 3% stop trigger · 6% profit trigger · no leverage.</p>
    {error && <p role="status" className="paper-notice">{error}</p>}
    {report && <>
      <p className="paper-notice">{stale ? 'STALE — scheduled observations are overdue.' : 'Latest observation: '+new Date(report.updated_at).toLocaleString('en-GB')}
        {' '}{report.days_observed < 14 ? `${report.days_observed.toFixed(1)} of 14 minimum observation days.` : 'Minimum observation window elapsed; results remain experimental.'}
      </p>
      <div className="quality-grid">
        <div><strong>{money(report.equity)}</strong><p>Paper equity · net of estimated exit costs</p></div>
        <div><strong>{money(report.pnl)}</strong><p>Total paper P&amp;L · realized {money(report.realized_pnl)}</p></div>
        <div><strong>{Number.isFinite(report.win_rate) ? report.win_rate.toFixed(1)+'%' : 'No closed trades'}</strong><p>Win rate · {report.closed_trades} closed trades</p></div>
        <div><strong>{report.max_drawdown.toFixed(2)}%</strong><p>Sampled maximum drawdown · {report.coverage.toFixed(1)}% schedule coverage</p></div>
      </div>
      <p className="paper-notice"><strong>{report.decisions[0]?.action}</strong> — {report.decisions[0]?.reason}</p>
      {report.positions.map(p => <p key={p.id} className="small">Open paper position: {p.qty.toFixed(4)} QNT · entry {money(p.entry)} · stop trigger {money(p.entry*.97)} · profit trigger {money(p.entry*1.06)}</p>)}
      <details><summary>Decision log and source evidence</summary><div className="table-scroll"><table className="backtest-table"><thead><tr><th>Observation</th><th>Decision</th><th>Reason / evidence</th></tr></thead><tbody>
        {report.decisions.map(d => <tr key={d.slot}><td>{new Date(d.at).toLocaleString('en-GB')}</td><td>{d.action}</td><td className="paper-reason">{d.reason}<details><summary>View inputs</summary><pre>{JSON.stringify(d.evidence, null, 2)}</pre></details></td></tr>)}
      </tbody></table></div></details>
    </>}
    <p className="small">Sources: CCXT MCP (Kraken QNT/USD price, volume and completed 1h/4h candles); DexPaprika MCP (Ethereum QNT liquidity). Missing data blocks entries. DEX liquidity is not Kraken order-book depth.</p>
    <p className="small">Stops are checked at observation time and can miss moves between runs. Losses can exceed 3%. Fees: 0.1% each side; slippage: 0.05% each side. Paper results are not predictive or equivalent to live trading.</p>
    <p className="paper-links"><a href={actions} target="_blank" rel="noreferrer">Worker status ↗</a><a href={reports} target="_blank" rel="noreferrer">Daily reports &amp; ledger ↗</a></p>
  </section>;
}
