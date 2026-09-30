import { forecast, targetProbability } from './analysis.js';
const DAY = 86400000;
export function channel(candles, window, target) {
  if (candles.length < window || !(target > 0)) return null;
  const rows = candles.slice(-window), end = rows.at(-1).closeTime;
  const xs = rows.map(c => (c.closeTime - end) / DAY), ys = rows.map(c => Math.log(c.close));
  const mx = xs.reduce((a,b)=>a+b,0)/window, my = ys.reduce((a,b)=>a+b,0)/window;
  const slope = xs.reduce((a,x,i)=>a+(x-mx)*(ys[i]-my),0)/xs.reduce((a,x)=>a+(x-mx)**2,0);
  const intercept = my-slope*mx;
  const residual = Math.sqrt(ys.reduce((a,y,i)=>a+(y-intercept-slope*xs[i])**2,0)/(window-2));
  const offsets = [-2*residual,0,2*residual];
  const crossings = offsets.map(offset => {
    if (slope <= 0) return null;
    const days = (Math.log(target)-intercept-offset)/slope;
    return days >= 0 && days <= 730 ? end + days*DAY : null;
  });
  return { window, end, slope, intercept, residual, crossings, rows };
}
export function road(candles, spot, target) {
  const model = forecast(candles,spot);
  const channels = [90,180,365].map(w=>channel(candles,w,target)).filter(Boolean);
  const dates = channels.map(c=>c.crossings[1]).filter(Number.isFinite);
  return { channels, unstable: dates.length !== 3 || Math.max(...dates)-Math.min(...dates)>180*DAY,
    horizons: [3,6,12,24].map(months=>({months, required:spot>0 && target>0 ? (target/spot)**(1/months)-1:null,
      probability:model ? spot>=target ? 1 : targetProbability(spot,target,months*365/12,model.dailyDrift,model.dailyVolatility)?.touch:null})) };
}
export function regime(candles) {
  if (candles.length < 60) return { label: 'Insufficient history', confidence: null, detail: 'Needs at least 60 completed daily candles.' };
  const recent = candles.slice(-20), prior = candles.slice(-60, -20);
  const avg = rows => rows.reduce((s, c) => s + c.close, 0) / rows.length;
  const change = avg(recent) / avg(prior) - 1;
  const tail = candles.slice(-30), returns = tail.slice(1).map((c, i) => Math.log(c.close / tail[i].close));
  const vol = Math.sqrt(returns.reduce((s, x) => s + x * x, 0) / Math.max(1, returns.length));
  const label = vol > .08 ? 'High-volatility transition' : change > .06 ? 'Rising trend' : change < -.06 ? 'Falling trend' : 'Accumulation / range';
  return { label, confidence: Math.min(1, Math.abs(change) / .12), detail: `20-day average is ${change >= 0 ? 'above' : 'below'} the preceding 40-day average; recent daily volatility is ${(vol * 100).toFixed(1)}%.` };
}
// Daily-close trailing exits: yesterday's decision fills at today's open.
export function protectionComparison(candles) {
  if(candles.length<260) return [];
  const start=200, fee=.001, slip=.0005;
  return [null,.15,.20,.25].map(limit=>{
    let cash=10000, units=0, peak=0, equityPeak=10000, drawdown=0, exits=0, pending=true, previousLong=false, daysOut=0;
    for(let i=start;i<candles.length;i++) {
      const c=candles[i];
      if(pending && !units){units=cash/(c.open*(1+slip)*(1+fee));cash=0;peak=c.open;}
      if(!pending && units){cash=units*c.open*(1-slip)*(1-fee);units=0;exits++;}
      if(!units) daysOut++;
      peak=units ? Math.max(peak,c.close):0;
      const sma=candles.slice(i-49,i+1).reduce((s,x)=>s+x.close,0)/50;
      const above=c.close>sma;
      pending=limit===null || (units ? c.close>peak*(1-limit) : above && previousLong);
      previousLong=above;
      let value=cash+units*c.close;
      if(i===candles.length-1 && units) value=units*c.close*(1-slip)*(1-fee);
      equityPeak=Math.max(equityPeak,value);drawdown=Math.max(drawdown,1-value/equityPeak);
      cash=units?cash:value;
      if(i===candles.length-1) cash=value;
    }
    return {limit,returnPct:(cash/10000-1)*100,drawdown:drawdown*100,exits,daysOut};
  });
}
