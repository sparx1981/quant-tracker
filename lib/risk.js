export function drawdownStats(equity, capital = 10000) {
  let peak = capital, underwater = 0, longest = 0, total = 0;
  for (const point of equity) {
    peak = Math.max(peak, point.value);
    if (point.value < peak - 1e-8) { underwater++; total++; longest = Math.max(longest, underwater); }
    else underwater = 0;
  }
  return { longestUnderwaterBars: longest, currentUnderwaterBars: underwater, underwaterPct: equity.length ? total / equity.length * 100 : 0 };
}

export function journalOutcome(entry, candles = [], now = Date.now()) {
  const deadline = entry.created + entry.horizonDays * 86400000;
  if (now < deadline) return null;
  // The first completed daily close on/after the deadline; never today's moving quote.
  const candle = candles.find(c => c.closeTime >= deadline && c.closeTime < deadline + 86400000 && c.closeTime <= now);
  if (!candle || !(entry.price > 0)) return null;
  const change = candle.close / entry.price - 1;
  return { at: candle.closeTime, price: candle.close, aligned: entry.stance === 'Bullish' ? change > 0 : entry.stance === 'Bearish' ? change < 0 : Math.abs(change) < .05 };
}
