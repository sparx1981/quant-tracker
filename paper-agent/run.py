import argparse
import asyncio
import time
from pathlib import Path
from engine import connect, step, export
from feeds import collect


def run(directory):
    Path(directory).mkdir(parents=True, exist_ok=True)
    db = connect(Path(directory)/'ledger.sqlite')
    try:
        try:
            data = asyncio.run(asyncio.wait_for(collect(), 240))
            error = None
        except Exception as exc:
            data, error = None, f'Data collection failed ({type(exc).__name__}); no fills; last valuation carried forward.'
        now = time.time()
        step(db,now,data,error)
        result = export(db,directory,now)
        print(result['decisions'][0]['action'],result['decisions'][0]['reason'])
    finally:
        db.close()


if __name__=='__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--data',default=str(Path(__file__).resolve().parent/'data'))
    parser.add_argument('--loop',action='store_true')
    args = parser.parse_args()
    while True:
        run(args.data)
        if not args.loop:
            break
        time.sleep(900-time.time()%900)
