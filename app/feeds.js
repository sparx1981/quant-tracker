'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, RefreshCw, XCircle } from 'lucide-react';

const STATUS_LABELS = {
  ok: 'Healthy',
  warning: 'Review',
  failed: 'Failed',
  not_configured: 'Not configured',
  not_used: 'Configured · not used'
};

const STATUS_ICON = {
  ok: CheckCircle2,
  warning: AlertTriangle,
  failed: XCircle,
  not_configured: CircleHelp,
  not_used: CircleHelp
};

const time = value => value ? new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/London' }) : '—';
const groups = checks => checks.reduce((result, check) => { (result[check.group] ||= []).push(check); return result; }, {});

function statusText(status) { return STATUS_LABELS[status] || status; }

export default function FeedHealth() {
  const [state, setState] = useState({ data: null, loading: false, error: null });
  const run = useCallback(async () => {
    setState(previous => ({ ...previous, loading: true, error: null }));
    try {
      const response = await fetch(`/api/feeds?run=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Feed check failed');
      const data = await response.json();
      setState({ data, loading: false, error: null });
    } catch {
      setState(previous => ({ ...previous, loading: false, error: 'The feed check could not complete. Try again shortly.' }));
    }
  }, []);
  useEffect(() => { run(); }, [run]);
  const grouped = useMemo(() => groups(state.data?.checks || []), [state.data]);
  const summary = state.data?.counts || {};
  return <section id="feeds" className="feed-health panel" aria-labelledby="feed-health-title">
    <div className="section-title">
      <div><span className="eyebrow">OPERATIONAL CHECK</span><h2 id="feed-health-title">Check feeds</h2></div>
      <div className="feed-health-actions"><span className={`badge ${state.data?.overall === 'healthy' ? 'bullish' : state.data?.overall === 'failed' ? 'bearish' : 'amber'}`}>{state.data ? `${state.data.overall} · ${time(state.data.checkedAt)}` : 'Not checked'}</span><button className="text-button feed-check-button" onClick={run} disabled={state.loading}><RefreshCw size={13} className={state.loading ? 'spinning' : ''}/> {state.loading ? 'Checking…' : 'Check now'}</button></div>
    </div>
    <p className="section-description">Tests the live providers used by the dashboard and separates missing optional credentials from provider errors. Secret values never leave the server.</p>
    {state.error && <p className="warning-text small" role="status">{state.error}</p>}
    {state.data && <>
      <div className="feed-summary" aria-label="Feed check summary"><span><strong>{summary.ok || 0}</strong> healthy</span><span><strong>{summary.warning || 0}</strong> review</span><span><strong>{summary.failed || 0}</strong> failed</span><span><strong>{(summary.not_configured || 0) + (summary.not_used || 0)}</strong> optional / unused</span></div>
      <div className="feed-groups">{Object.entries(grouped).map(([group, checks]) => <div className="feed-group" key={group}><h3>{group}</h3><div className="feed-list">{checks.map(check => { const Icon = STATUS_ICON[check.status] || CircleHelp; return <div className="feed-row" key={check.id}><Icon size={15} className={`feed-icon ${check.status}`}/><div className="feed-row-main"><strong>{check.label}</strong><span>{check.message}</span></div><div className="feed-row-meta"><span className={`feed-status ${check.status}`}>{statusText(check.status)}</span><small>{check.latencyMs != null ? `${check.latencyMs} ms` : '—'}</small></div></div>; })}</div></div>)}</div>
      <p className="small muted">Checked {state.data.checks?.length || 0} feeds in {state.data.durationMs || 0} ms. “Configured · not used” means a credential is present but that provider is intentionally reserved for a future feature.</p>
    </>}
    {!state.data && !state.loading && !state.error && <p className="small muted">Run a check to verify provider configuration and live responses.</p>}
  </section>;
}
