'use client';
import { useEffect, useState } from 'react';

const STORE = 'qnt-portfolio';
const gbp = n => Number.isFinite(n) ? n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' }) : '—';
const local = (n, currency) => Number.isFinite(n) ? n.toLocaleString('en-GB', { style: 'currency', currency, maximumFractionDigits: n < 1 ? 4 : 2 }) : '—';
const day = value => new Date(value + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const parse = text => text.trim() !== '' && Number.isFinite(Number(text)) && Number(text) >= 0 ? Number(text) : null;

export default function Portfolio() {
  const [units, setUnits] = useState({});
  const [saved, setSaved] = useState(true);
  const [feed, setFeed] = useState({ data: null, error: '', loading: true });

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORE) || '{}');
      // The Overview tab's QNT quantity seeds the QNT row until one is entered here.
      if (stored.QNT === undefined) { const legacy = localStorage.getItem('qnt-holding'); if (legacy) stored.QNT = legacy; }
      setUnits(stored);
    } catch { setSaved(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function refresh() {
      if (busy) return;
      busy = true;
      try {
        const result = await (await fetch('/api/portfolio', { signal: controller.signal })).json();
        if (result.status !== 'ok') throw new Error(result.message);
        setFeed({ data: result.data, error: '', loading: false });
      } catch (e) { if (!controller.signal.aborted) setFeed(f => ({ ...f, loading: false, error: 'Prices unavailable right now. Any values shown are from the previous retrieval.' })); }
      finally { busy = false; }
    }
    refresh();
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, 60000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);

  function setUnit(id, text) {
    const next = { ...units, [id]: text };
    setUnits(next);
    try { localStorage.setItem(STORE, JSON.stringify(next)); setSaved(true); } catch { setSaved(false); }
  }

  const rows = (feed.data?.holdings || []).map(h => {
    const qty = parse(units[h.id] ?? '');
    const value = qty !== null && Number.isFinite(h.priceGBP) ? qty * h.priceGBP : null;
    const payout = qty !== null && h.dividend && Number.isFinite(h.dividend.amountGBP) ? qty * h.dividend.amountGBP : null;
    const yearly = qty !== null && h.dividend && Number.isFinite(h.dividend.trailingYearGBP) ? qty * h.dividend.trailingYearGBP : 0;
    return { h, qty, value, payout, yearly };
  });
  const total = rows.reduce((sum, r) => sum + (r.value || 0), 0);
  const yearly = rows.reduce((sum, r) => sum + r.yearly, 0);
  const upcoming = rows.filter(r => r.payout !== null).sort((a, b) => a.h.dividend.exDate.localeCompare(b.h.dividend.exDate))[0];

  return <section className="panel portfolio-checker" aria-labelledby="portfolio-title">
    <div className="section-title"><h2 id="portfolio-title">Portfolio checker</h2><span className="badge">VALUES IN GBP</span></div>
    <p className="section-description">Enter the number of units you hold in each asset. Values and dividend estimates are calculated here from public prices.</p>
    {feed.error && <p role="status" className="paper-notice">{feed.error}</p>}
    <div className="quality-grid">
      <div><strong>{gbp(total)}</strong><p>Total portfolio value</p></div>
      <div><strong>{yearly ? gbp(yearly) : '—'}</strong><p>Estimated dividends over 12 months (last year's payments × your units)</p></div>
      <div><strong>{upcoming ? day(upcoming.h.dividend.exDate) : '—'}</strong><p>{upcoming ? `Next ex-dividend: ${upcoming.h.id}, about ${gbp(upcoming.payout)}` : 'No upcoming dividend for the units entered'}</p></div>
    </div>
    <div className="table-scroll"><table className="backtest-table portfolio-table">
      <thead><tr><th>Asset</th><th>Price</th><th>Units held</th><th>Value (GBP)</th><th>Next dividend (est.)</th><th>Est. amount (GBP)</th></tr></thead>
      <tbody>
        {rows.map(({ h, value, payout }) => <tr key={h.id}>
          <th><strong>{h.id}</strong><small>{h.name}</small></th>
          <td>{h.status === 'unavailable' ? 'Unavailable' : <>{local(h.price, h.currency)}{Number.isFinite(h.change) && <small className={h.change >= 0 ? 'positive' : 'negative'}>{h.change >= 0 ? '+' : ''}{h.change.toFixed(2)}% on day</small>}</>}</td>
          <td><input aria-label={`Units of ${h.id}`} type="number" min="0" step="any" inputMode="decimal" placeholder="0" value={units[h.id] ?? ''} onChange={e => setUnit(h.id, e.target.value)} className="units-input" />{(units[h.id] ?? '') !== '' && parse(units[h.id]) === null && <small className="negative" role="alert">Enter a number, 0 or more</small>}</td>
          <td>{value === null ? '—' : gbp(value)}</td>
          <td>{h.dividend ? <>{day(h.dividend.exDate)}<small>{h.dividend.announced ? 'ex-date listed by provider' : `projected · last ex-date ${day(h.dividend.lastExDate)}`}</small></> : h.status === 'unavailable' ? '—' : <span className="muted">{h.kind === 'Crypto' ? 'None (no dividends)' : 'None found'}</span>}</td>
          <td>{h.dividend ? <>{payout === null ? '—' : gbp(payout)}<small>{local(h.dividend.amountLocal, h.currency)} per unit</small></> : '—'}</td>
        </tr>)}
        {!rows.length && <tr><td colSpan="6">{feed.loading ? 'Loading prices…' : 'No prices available.'}</td></tr>}
      </tbody>
    </table></div>
    <p className="portfolio-foot small"><span>{saved ? 'Units are saved in this browser only. They are never sent to the server.' : 'Browser storage unavailable; units will not persist.'}</span></p>
    <p className="small muted">Prices: Yahoo Finance (unofficial, may be delayed). GBP conversion: {feed.data?.fx ? `${feed.data.fx.source}, ${feed.data.fx.date}` : 'unavailable'}. Prices are last traded, not what you would receive after spreads, and eToro may quote slightly differently.</p>
    <p className="small muted">Dividend dates are the ex-dividend date, the last day before which you must hold the asset; the cash usually arrives days to weeks later, and the data source does not publish payment dates. Where a future ex-date is not listed, the date is projected from the pattern of past payments and the amount is the last payment per unit. Companies can change or cancel dividends. Tax, withholding and any eToro charges are ignored. If you hold these through CFDs rather than the real asset, dividend treatment differs.</p>
  </section>;
}
