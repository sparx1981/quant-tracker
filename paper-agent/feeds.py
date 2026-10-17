"""Only allowlisted read tools from the two reviewed MCP servers."""
import asyncio
import json
import math
import os
import re
import sys
import time
from contextlib import AsyncExitStack
from datetime import datetime, timezone
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from engine import indicators, validate_candles

ROOT = Path(__file__).resolve().parent
ADDRESS = '0x4a220e6096b25eadb88358cb44068a3248254675'
ALLOWED = {'ccxt': {'get-market-summary', 'get-historical-ohlcv'}, 'dex': {'getTokenDetails'}}


def number(text, label):
    match = re.search(r'^'+re.escape(label)+r': ([^\n]+)', text, re.M)
    if not match:
        raise ValueError('Missing '+label)
    value = float(match[1])
    if not math.isfinite(value):
        raise ValueError('Nonfinite '+label)
    return value


def candles(text):
    rows = []
    for match in re.finditer(r'Time: ([\d\- :]+)\nOpen: ([^\n]+)\nHigh: ([^\n]+)\nLow: ([^\n]+)\nClose: ([^\n]+)\nVolume: ([^\n]+)', text):
        stamp = datetime.strptime(match[1], '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc).timestamp()
        rows.append([stamp]+[float(v) for v in match.groups()[1:]])
    return rows


async def call(session, source, tool, args):
    if tool not in ALLOWED[source]:
        raise ValueError('Tool is not read-allowlisted')
    if source == 'dex':
        args = dict(**args, rationale='Verify Ethereum QNT liquidity for a paper-only research observation.')
    result = await asyncio.wait_for(session.call_tool(tool, args), 50)
    text = '\n'.join(c.text for c in result.content if c.type=='text')
    if result.isError or not text or text.startswith('Error'):
        raise ValueError(source+' MCP tool failed')
    return text


async def collect():
    config = json.loads((ROOT/'watchlist.json').read_text())
    if config != [dict(symbol='QNT/USD',exchange='kraken',network='ethereum',address=ADDRESS)]:
        raise ValueError('Only the fixed QNT/USD Ethereum watchlist is supported')
    # Do not forward dashboard API credentials to either server.
    env = {key: os.environ[key] for key in ('PATH','SYSTEMROOT','WINDIR','TEMP','TMP','HOME') if key in os.environ}
    env['TZ'] = 'UTC'
    commands = {
        'ccxt': StdioServerParameters(command=sys.executable, args=[str(ROOT/'vendor/ccxt_server.py')], env=env),
        'dex': StdioServerParameters(command='node', args=[str(ROOT/'node_modules/dexpaprika-mcp/dist/bin.js')], env=env)
    }
    async with AsyncExitStack() as stack:
        sessions = {}
        async def start(name):
            command = commands[name]
            streams = await stack.enter_async_context(stdio_client(command))
            session = await stack.enter_async_context(ClientSession(*streams))
            await session.initialize()
            available = {t.name for t in (await session.list_tools()).tools}
            if not ALLOWED[name].issubset(available):
                raise ValueError(name+' MCP schema changed')
            sessions[name] = session
        await start('ccxt')
        args = dict(symbol='QNT/USD',exchange='kraken')
        ticker = await call(sessions['ccxt'],'ccxt','get-market-summary',args)
        if 'Symbol: QNT/USD' not in ticker:
            raise ValueError('Unexpected exchange symbol')
        price = number(ticker,'Last Price')
        bid, ask = number(ticker,'Bid'), number(ticker,'Ask')
        if price<=0 or bid<=0 or ask<bid:
            raise ValueError('Invalid quote')
        data = dict(price=price, bid=bid, ask=ask, volume_24h=number(ticker,'24h Volume'),
                    quote_fetched_at=time.time(), source='CCXT MCP / Kraken QNT/USD',
                    liquidity_source='DexPaprika MCP / Ethereum QNT pool TVL')
        # Preserve quote-based protective exits even if the secondary feed fails.
        try:
            frames = {}
            for frame, seconds in [('1h',3600),('4h',14400)]:
                text = await call(sessions['ccxt'],'ccxt','get-historical-ohlcv',dict(**args,timeframe=frame,days_back=14))
                frames[frame] = indicators(validate_candles(candles(text),seconds,time.time()))
            data['indicators'] = frames
            data['bearish'] = all(f['close'] < f['sma20'] < f['sma50'] for f in frames.values())
            await start('dex')
            dex = json.loads(await call(sessions['dex'],'dex','getTokenDetails',dict(network='ethereum',token_address=ADDRESS)))
            if str(dex.get('id','')).lower()!=ADDRESS or dex.get('chain')!='ethereum':
                raise ValueError('DexPaprika token identity mismatch')
            updated = datetime.fromisoformat(dex['last_updated'].replace('Z','+00:00')).timestamp()
            if not -60 <= time.time()-updated <= 600:
                raise ValueError('Stale DexPaprika liquidity')
            data['liquidity_updated_at'] = updated
            liquidity = float(dex['summary']['liquidity_usd'])
            if not math.isfinite(liquidity) or liquidity<0:
                raise ValueError('Invalid liquidity')
            data['liquidity_usd'] = liquidity
            data['volume_spike'] = frames['1h']['volume_ratio'] >= 2
            data['eligible'] = liquidity>=500000 and (ask-bid)/price<=.01 and time.time()-data['quote_fetched_at']<180
            data['bullish'] = all(f['close'] > f['sma20'] > f['sma50'] for f in frames.values()) and 50<=frames['1h']['rsi']<=70
            data['reason'] = (f"1h RSI {frames['1h']['rsi']:.1f}; 1h volatility {frames['1h']['volatility']:.2f}%; "
                              f"volume {frames['1h']['volume_ratio']:.2f}x prior 20 bars; DEX liquidity ${liquidity:,.0f}. "
                              + ('Both trends bullish, RSI 50–70. ' if data['bullish'] else 'Entry trend/RSI criteria not met. ')
                              + ('Liquidity and spread gates passed.' if data['eligible'] else 'Entry blocked by liquidity, spread or freshness gate.'))
        except Exception as exc:
            detail = str(exc)[:160] if isinstance(exc, ValueError) else type(exc).__name__
            data.update(eligible=False,reason=f'Entry blocked: {detail}; missing/invalid analysis or liquidity data.')
        if time.time()-data['quote_fetched_at']>180:
            raise ValueError('Quote expired during collection')
        return data
