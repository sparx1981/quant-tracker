import json
import math
import tempfile
import unittest
from pathlib import Path
from engine import connect, step, export, validate_candles, indicators
from feeds import candles, number


def data(now, price=100, **kwargs):
    return dict(price=price,quote_fetched_at=now,liquidity_updated_at=now,liquidity_usd=600000,
                eligible=True,bullish=True,reason='Fixture bullish trend',**kwargs)


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.db = connect(':memory:')
        self.now = 1800000000

    def tearDown(self):
        self.db.close()

    def test_allocation_fee_and_no_pyramiding(self):
        step(self.db,self.now,data(self.now))
        p = self.db.execute('SELECT * FROM positions').fetchone()
        self.assertAlmostEqual(p['cost'],500)
        self.assertLess(p['qty'],5)
        for i in range(1,5):
            step(self.db,self.now+i*900,data(self.now+i*900))
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM positions').fetchone()[0],1)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM trades').fetchone()[0],1)
        self.assertEqual(self.db.execute('SELECT cash FROM state').fetchone()[0],9500)

    def test_idempotency_and_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'ledger.sqlite'
            first = connect(path)
            step(first,self.now,data(self.now))
            first.close()
            second = connect(path)
            step(second,self.now+1,data(self.now+1))
            self.assertEqual(second.execute('SELECT COUNT(*) FROM trades').fetchone()[0],1)
            second.close()

    def test_stop_gap_and_liquidity_outage_do_not_block_exit(self):
        step(self.db,self.now,data(self.now))
        step(self.db,self.now+900,dict(price=80,quote_fetched_at=self.now+900,eligible=False))
        trade = self.db.execute("SELECT * FROM trades WHERE side='SELL'").fetchone()
        self.assertLess(trade['price'],80)
        self.assertLess(trade['pnl'],-100)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM positions').fetchone()[0],0)

    def test_target(self):
        step(self.db,self.now,data(self.now))
        step(self.db,self.now+900,data(self.now+900,107))
        self.assertGreater(self.db.execute("SELECT pnl FROM trades WHERE side='SELL'").fetchone()[0],0)

    def test_missing_low_stale_liquidity_and_stale_quote_block_entry(self):
        for override in [dict(liquidity_usd=499999),dict(liquidity_usd=0),dict(liquidity_updated_at=0),dict(quote_fetched_at=0),dict(price=math.nan),dict(eligible=False)]:
            db = connect(':memory:')
            sample = data(self.now)
            sample.update(override)
            # Nonfinite values must be rejected without leaving partial ledger changes.
            if math.isnan(sample['price']):
                with self.assertRaises(ValueError): step(db,self.now,sample)
            else:
                step(db,self.now,sample)
                self.assertEqual(db.execute('SELECT COUNT(*) FROM trades').fetchone()[0],0)
            db.close()

    def test_failed_feed_carries_valuation_and_report(self):
        step(self.db,self.now,data(self.now))
        first = self.db.execute('SELECT equity FROM runs').fetchone()[0]
        step(self.db,self.now+1800,error='Feed unavailable')
        with tempfile.TemporaryDirectory() as directory:
            report = export(self.db,directory,self.now+1800)
            self.assertAlmostEqual(report['equity'],first)
            self.assertAlmostEqual(report['coverage'],200/3)
            self.assertIsNone(report['win_rate'])
            self.assertEqual(report['decisions'][0]['action'],'HOLD')
            self.assertTrue(list(Path(directory).glob('*.md')))
            self.assertEqual(json.loads((Path(directory)/'summary.json').read_text())['mode'],'PAPER')

    def test_parser_completed_bars_and_gaps(self):
        raw = 'Time: 2026-10-17 08:00:00\nOpen: 100.00000000\nHigh: 102.00000000\nLow: 99.00000000\nClose: 101.00000000\nVolume: 200.00\n---'
        self.assertEqual(candles(raw)[0][1:],[100,102,99,101,200])
        self.assertEqual(number('Last Price: 123.5','Last Price'),123.5)
        with self.assertRaises(ValueError): number('Last Price: NaN','Last Price')
        rows = [[self.now+i*3600,100,102,99,101,200] for i in range(60)]
        complete = validate_candles(rows,3600,self.now+59*3600+10)
        self.assertEqual(len(complete),59)
        self.assertEqual(indicators(complete)['rsi'],50)
        with self.assertRaises(ValueError): validate_candles(rows[:20]+rows[21:],3600,self.now+60*3600)
        with self.assertRaises(ValueError): validate_candles(rows,3600,self.now+65*3600)


if __name__=='__main__':
    unittest.main()
