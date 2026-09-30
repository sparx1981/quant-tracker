'use client';
import { useMemo } from 'react';

const pct = n => Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(1)}%` : '—';

export default function OutlookSummary({ price, change, analysis, forecasts, chain, historyStatus }) {
  const result = useMemo(() => {
    const stance = analysis?.stance || 'Neutral';
    const score = Number.isFinite(analysis?.score) ? analysis.score : 0;
    const exchange = chain?.transfers?.data;
    const coverage = chain?.covered && chain?.tracked ? chain.covered / chain.tracked : 0;
    const quality = [price > 0, Boolean(analysis), historyStatus === 'ok', coverage >= .66].filter(Boolean).length;
    const confidence = quality >= 4 && Math.abs(score) > .2 ? 'Medium' : 'Low';
    const tone = stance === 'Bullish' ? 'cautiously bullish' : stance === 'Bearish' ? 'cautiously bearish' : 'mixed';
    const reasons = [];
    if (analysis) reasons.push(`${analysis.counts.Bullish} bullish and ${analysis.counts.Bearish} bearish readings across the selected timeframe`);
    if (Number.isFinite(change)) reasons.push(`${pct(change)} over 24 hours`);
    if (exchange?.sampled) reasons.push(`${exchange.sampled} recent transfers sampled${exchange.partial ? ' with partial coverage' : ''}`);
    if (coverage < 1) reasons.push(`exchange balances cover ${chain?.covered || 0}/${chain?.tracked || 0} labelled wallets`);
    const target = forecasts?.levels?.at(-1)?.base;
    const growth = price > 0 && target > 0 ? (target / price) ** (1 / 12) - 1 : null;
    return { tone, confidence, reasons, growth };
  }, [analysis, chain, change, forecasts, historyStatus, price]);
  return <section className="outlook-summary panel" aria-label="Current outlook"><div className="section-title"><div><span className="eyebrow">RULE-BASED READOUT</span><h2>Current outlook</h2></div><span className={`badge ${result.confidence === 'Medium' ? 'neutral' : 'amber'}`}>{result.confidence} evidence quality</span></div><p className="outlook-copy"><strong>QNT looks {result.tone}.</strong> {result.growth != null ? `The model's 12-month base path implies approximately ${(result.growth * 100).toFixed(1)}% compounded monthly growth from the current price.` : 'The target path is unavailable until current price and history are available.'}</p><ul>{result.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul><p className="small muted">This is generated from dashboard rules and current source coverage. It is an expectation summary, not an instruction to buy or sell. No AI call is used.</p></section>;
}
