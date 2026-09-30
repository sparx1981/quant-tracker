import test from 'node:test';
import assert from 'node:assert/strict';
import {channel,road,protectionComparison} from '../lib/road.js';
const series=(n,fn)=>Array.from({length:n},(_,i)=>({time:i*86400000,closeTime:(i+1)*86400000-1,open:fn(i),close:fn(i),high:fn(i),low:fn(i),volume:1}));
test('log channel recovers exponential trend and target intersection',()=>{const c=channel(series(365,i=>100*Math.exp(i*.001)),180,100*Math.exp(400*.001));assert.ok(Math.abs(c.slope-.001)<1e-10);assert.ok(Math.abs((c.crossings[1]-c.end)/86400000-36)<1e-7);assert.ok(c.residual<1e-10);});
test('declining channel has no future upward target date',()=>{assert.equal(channel(series(365,i=>100*Math.exp(-i*.001)),90,1000).crossings[1],null);assert.equal(road(series(365,()=>100),100,1000).unstable,true);});
test('target growth compounds correctly and reached targets are already hit',()=>{const d=road(series(365,()=>100),100,200);assert.ok(Math.abs((1+d.horizons[0].required)**3-2)<1e-10);assert.equal(road(series(365,()=>100),200,100).horizons[0].probability,1);});
test('exit fills after signal and gap losses can exceed threshold',()=>{const s=series(270,i=>i<220?100:i===220?79:50);const r=protectionComparison(s).find(x=>x.limit===.2);assert.equal(r.exits,1);assert.ok(r.drawdown>49);assert.ok(r.daysOut>0);});
test('flat price backtest pays both entry and exit costs without needless exits',()=>{for(const r of protectionComparison(series(300,()=>100))){assert.ok(r.returnPct<0&&r.returnPct>-.4);assert.equal(r.exits,0);}});
