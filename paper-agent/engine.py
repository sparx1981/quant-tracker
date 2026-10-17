"""Deterministic, long-only PAPER ledger. No exchange execution dependencies."""
import json
import math
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, pstdev

START = 10000.0
FEE = 0.001
SLIP = 0.0005
VERSION = 'qnt-trend-v1'


def utc(t):
    return datetime.fromtimestamp(t, timezone.utc).isoformat()


def validate_candles(rows, seconds, now):
    rows = sorted(rows, key=lambda r: r[0])
    rows = [r for r in rows if r[0] + seconds <= now]
    if len(rows) < 50 or now - (rows[-1][0] + seconds) > seconds + 120:
        raise ValueError('Insufficient or stale completed candles')
    for i, r in enumerate(rows):
        if len(r) != 6 or not all(math.isfinite(x) for x in r):
            raise ValueError('Invalid candle values')
        if min(r[1:5]) <= 0 or r[5] < 0 or r[2] < max(r[1], r[3], r[4]) or r[3] > min(r[1], r[4]):
            raise ValueError('Invalid OHLC range')
        if i and r[0] - rows[i-1][0] != seconds:
            raise ValueError('Missing or duplicate candles')
    return rows


def indicators(rows):
    closes = [r[4] for r in rows]
    changes = [b-a for a,b in zip(closes[-15:-1], closes[-14:])]
    gain, loss = mean([max(x, 0) for x in changes]), mean([max(-x, 0) for x in changes])
    rsi = 100 - 100/(1+gain/loss) if loss else (100 if gain else 50)
    returns = [math.log(b/a) for a,b in zip(closes[-21:-1], closes[-20:])]
    baseline = mean([r[5] for r in rows[-21:-1]])
    return dict(sma20=mean(closes[-20:]), sma50=mean(closes[-50:]), rsi=rsi,
                volatility=pstdev(returns)*100, volume_ratio=rows[-1][5]/baseline if baseline else 0,
                close=closes[-1], candle_at=rows[-1][0])


def connect(path):
    db = sqlite3.connect(path, timeout=30)
    db.row_factory = sqlite3.Row
    db.executescript('''
    CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1), cash REAL, peak REAL, drawdown REAL, started REAL, last_price REAL);
    CREATE TABLE IF NOT EXISTS positions(id INTEGER PRIMARY KEY CHECK(id=1), qty REAL, entry REAL, cost REAL, opened REAL);
    CREATE TABLE IF NOT EXISTS runs(slot INTEGER PRIMARY KEY, at REAL, action TEXT, reason TEXT, equity REAL, evidence TEXT);
    CREATE TABLE IF NOT EXISTS trades(id INTEGER PRIMARY KEY, at REAL, side TEXT, price REAL, qty REAL, fee REAL, pnl REAL, reason TEXT);
    ''')
    return db


def step(db, now, data=None, error=None):
    """One transaction per UTC 15m slot, safe to retry or run concurrently."""
    db.execute('BEGIN IMMEDIATE')
    try:
        slot = int(now // 900)
        if db.execute('SELECT 1 FROM runs WHERE slot=?', (slot,)).fetchone():
            db.rollback()
            return
        db.execute('INSERT OR IGNORE INTO state VALUES(1,?,?,?,?,?)', (START,START,0,now,None))
        s = dict(db.execute('SELECT * FROM state').fetchone())
        p = db.execute('SELECT * FROM positions').fetchone()
        action, reason, evidence = 'HOLD', error or 'Data unavailable; entries blocked.', data or {}
        price = data.get('price') if data else None
        if price is not None and (not math.isfinite(price) or price <= 0 or not 0 <= now-data.get('quote_fetched_at',0) <= 180):
            price = None
            reason = 'Invalid or expired quote; no fills; last valuation carried forward.'
        evidence['strategy'] = VERSION
        if price is not None:
            s['last_price'] = price
            sell = None
            if p:
                if price <= p['entry'] * .97:
                    sell = '3% stop threshold crossed at observation; fill may exceed stop loss.'
                elif price >= p['entry'] * 1.06:
                    sell = '6% take-profit threshold crossed at observation.'
                elif data.get('bearish'):
                    sell = 'Completed 1h and 4h trends both bearish.'
            if sell:
                fill = min(price, data.get('bid',price)) * (1-SLIP)
                gross = p['qty'] * fill
                fee = gross * FEE
                pnl = gross-fee-p['cost']
                s['cash'] += gross-fee
                db.execute('INSERT INTO trades(at,side,price,qty,fee,pnl,reason) VALUES(?,?,?,?,?,?,?)', (now,'SELL',fill,p['qty'],fee,pnl,sell))
                db.execute('DELETE FROM positions')
                p = None
                action, reason = 'SELL', sell
            elif not p and data.get('eligible') and data.get('bullish') and data.get('liquidity_usd',0)>=500000 and 0 <= now-data.get('liquidity_updated_at',0)<=600:
                # Includes entry fee, always at most 5% of unlevered cash. QNT has one position.
                budget = s['cash']*.05
                fill = max(price,data.get('ask',price))*(1+SLIP)
                qty = budget/(fill*(1+FEE))
                fee = qty*fill*FEE
                db.execute('INSERT INTO positions VALUES(1,?,?,?,?)', (qty,fill,budget,now))
                db.execute('INSERT INTO trades(at,side,price,qty,fee,pnl,reason) VALUES(?,?,?,?,?,?,?)', (now,'BUY',fill,qty,fee,None,data['reason']))
                s['cash'] -= budget
                p = db.execute('SELECT * FROM positions').fetchone()
                action, reason = 'BUY', data['reason']
            else:
                reason = data.get('reason', reason)
                if p:
                    reason += ' Existing QNT position retained; no pyramiding.'
        equity = s['cash'] + (p['qty'] * s['last_price'] * (1-SLIP)*(1-FEE) if p else 0)
        s['peak'] = max(s['peak'], equity)
        s['drawdown'] = max(s['drawdown'], (1-equity/s['peak'])*100)
        db.execute('UPDATE state SET cash=?,peak=?,drawdown=?,last_price=? WHERE id=1', (s['cash'],s['peak'],s['drawdown'],s['last_price']))
        db.execute('INSERT INTO runs VALUES(?,?,?,?,?,?)', (slot,now,action,reason,equity,json.dumps(evidence,allow_nan=False)))
        db.commit()
    except Exception:
        db.rollback()
        raise


def export(db, directory, now):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    s = dict(db.execute('SELECT * FROM state').fetchone())
    runs = [dict(r) for r in db.execute('SELECT * FROM runs ORDER BY slot DESC LIMIT 96')]
    trades = [dict(r) for r in db.execute('SELECT * FROM trades ORDER BY id DESC')]
    closed = [t for t in trades if t['side']=='SELL']
    positions = [dict(r) for r in db.execute('SELECT * FROM positions')]
    count = db.execute('SELECT COUNT(*) FROM runs').fetchone()[0]
    expected = max(1, int(now//900)-int(s['started']//900)+1)
    result = dict(schema=1, mode='PAPER', symbol='QNT/USD', strategy=VERSION, updated_at=utc(now),
                  started_at=utc(s['started']), days_observed=(now-s['started'])/86400, runs=count,
                  coverage=min(100,count/expected*100), cash=s['cash'], equity=runs[0]['equity'],
                  pnl=runs[0]['equity']-START, realized_pnl=sum(t['pnl'] for t in closed),
                  win_rate=sum(t['pnl']>0 for t in closed)/len(closed)*100 if closed else None,
                  closed_trades=len(closed), max_drawdown=s['drawdown'], positions=positions,
                  decisions=[{**r,'at':utc(r['at']),'evidence':json.loads(r['evidence'])} for r in runs[:24]],
                  trades=[{**t,'at':utc(t['at'])} for t in trades[:100]])
    target = directory/'summary.json'
    temporary = directory/'summary.tmp'
    temporary.write_text(json.dumps(result,indent=2,allow_nan=False), encoding='utf-8')
    temporary.replace(target)
    day = utc(now)[:10]
    daily_trades = [t for t in trades if utc(t['at'])[:10]==day]
    daily_runs = [r for r in runs if utc(r['at'])[:10]==day]
    losses = [t for t in daily_trades if t['pnl'] is not None and t['pnl']<0]
    report = [f'# QNT paper report — {day} UTC', '', 'Experimental paper results are not predictive and are not live results.',
              f"\nLifetime equity: ${result['equity']:.2f}; total P&L: ${result['pnl']:.2f}; realized: ${result['realized_pnl']:.2f}.",
              f"Lifetime win rate: {result['win_rate']}% ({len(closed)} exits); sampled max drawdown: {s['drawdown']:.2f}%.",
              f"Observed days: {result['days_observed']:.2f}; schedule coverage: {result['coverage']:.1f}%.",
              '\n## Trades today', '| Time | Side | Price | QNT | Net realized P&L | Reason |', '|---|---|---|---|---|---|']
    report += [f"| {utc(t['at'])} | {t['side']} | {t['price']:.4f} | {t['qty']:.6f} | {t['pnl']} | {t['reason']} |" for t in daily_trades]
    report += ['\n## What went wrong / limitations', f'{len(losses)} losing exits today.']
    report += [f"- Loss ${-t['pnl']:.2f}: {t['reason']}" for t in losses]
    report += ['- Stops are checked every run, not continuously. Intraperiod touches can be missed. Gaps and outages can exceed 3%.',
               '- 0.1% fees each side and 0.05% slippage are assumptions; no order-book fills are simulated.',
               '- DEX pool TVL is a liquidity proxy, not executable depth on Kraken.',
               '- Two weeks is a minimum observation window, not evidence of predictive accuracy.', '\n## Decision log']
    report += [f"- {utc(r['at'])} **{r['action']}**: {r['reason']}" for r in reversed(daily_runs)]
    (directory/f'{day}.md').write_text('\n'.join(report)+'\n',encoding='utf-8')
    return result
