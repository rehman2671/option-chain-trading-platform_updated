import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPTURE_KEYS, collectAdaptiveOptionEvidence, captureSha256,
  verifyAdaptiveCapture, type CaptureInstrument
} from '../../server/engine/ema15m/adaptiveEvidenceCapture.js';

const at = new Date('2026-11-15T08:00:00.000Z');
const expiries = ['2026-11-23', '2026-11-30', '2026-12-14', '2027-01-11'];
const key = CAPTURE_KEYS.NIFTY;
const contracts = expiries.flatMap((expiry, i) => (['CE','PE'] as const).map((side, j) => ({
  underlying_symbol: 'NIFTY', underlying_key: key, segment: 'NSE_FO',
  instrument_type: side, strike_price: 25000, expiry,
  instrument_key: 'NSE_FO|' + (80000 + i * 2 + j),
  trading_symbol: 'TEST NIFTY 25000 ' + side + ' ' + expiry,
  lot_size: 65, tick_size: 0.05
})));
function side(contract: typeof contracts[number], delta: number) {
  return {
    instrument_key: contract.instrument_key,
    market_data: {
      bid_price: 199, ask_price: 200, bid_qty: 1000, ask_qty: 1000,
      volume: 20000, oi: 300000
    },
    option_greeks: { delta, theta: -4, iv: 18, gamma: 0.02, vega: 5 }
  };
}
function brokerTransport(config: {
  blockedExpiry?: string;
  invalidExpiry?: string;
  contractHttpStatus?: number;
} = {}, calls: string[] = []): (url: string, init: RequestInit) => Promise<Response> {
  return async (url, init) => {
    calls.push(url);
    assert.equal(init.method, 'GET');
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer MOCK_ONLY_TOKEN');
    assert.ok(url.startsWith('https://api.upstox.com/v2/option/'));
    assert.ok(!url.includes('/order/') && !url.includes('/portfolio/'));
    const isCatalog = url.includes('/option/contract');
    if (isCatalog && config.contractHttpStatus) return new Response('no', {
      status: config.contractHttpStatus
    });
    const expiry = new URL(url).searchParams.get('expiry_date');
    if (expiry === config.blockedExpiry) return new Response('unavailable', {status: 429});
    const i = expiries.indexOf(expiry || '');
    if (isCatalog) return Response.json({ status: 'success', data: contracts });
    const rows = i < 0 ? [] : [{
      expiry, underlying_key: key,
      underlying_spot_price: 25000, strike_price: 25000,
      call_options: side(contracts[i * 2], 0.62),
      put_options: side(contracts[i * 2 + 1], -0.59)
    }];
    if (expiry === config.invalidExpiry) rows[0].underlying_spot_price = -1;
    return Response.json({ status: 'success', data: rows });
  };
}
async function fakeCapture(settings: Parameters<typeof brokerTransport>[0] = {}, calls: string[] = []) {
  return collectAdaptiveOptionEvidence({
    instrument: 'NIFTY', accessToken: 'MOCK_ONLY_TOKEN',
    clock: () => at, transport: brokerTransport(settings, calls)
  });
}

describe('Adaptive evidence capture: non-executable, immutable, timestamp-honest', () => {
  it('captures both CE and PE across actual listed 1W/2W/4W/8W expiries', async () => {
    const calls: string[] = [];
    const record = await fakeCapture({}, calls);
    assert.equal(calls.length, 5); // one contract catalog and exactly 4 chain GETs
    assert.equal(record.payload.contracts.acceptedRowCount, 8);
    assert.equal(record.payload.chains.length, 4);
    assert.equal(record.payload.buckets.length, 8);
    assert.equal(record.payload.chains.every(c => c.status === 'CAPTURED'), true);
    assert.equal(record.payload.chains.every(c => c.validSidesWithL1AndGreeks === 2), true);
    assert.equal(record.payload.evidenceStatus, 'SNAPSHOT_CAPTURED_UNVERIFIED_TIME');
    assert.equal(record.payload.executionAuthorized, false);
    assert.equal(record.payload.historicalBacktestAuthorized, false);
    assert.equal(record.payload.exchangeTimeVerified, false);
    assert.equal(record.payload.marketSessionVerified, false);
    assert.equal(record.payload.quoteTimeQuality, 'RECEIPT_ONLY_EXCHANGE_TIME_UNVERIFIED');
    assert.equal(record.payload.chains[0].exchangeQuoteAt, null);
    assert.equal(record.payload.synthetic, true); // injected transport = mock
    assert.equal(record.payload.source, 'MOCK_HTTP_TEST');
    assert.equal(verifyAdaptiveCapture(record).valid, true);
    assert.equal(verifyAdaptiveCapture(record).researchUsable, false);
    assert.equal(record.sha256, captureSha256(record.payload));
    assert.equal(JSON.stringify(record).includes('MOCK_ONLY_TOKEN'), false);
  });
  it('fails closed when contract auth is rejected, never uses practice substitute', async () => {
    await assert.rejects(fakeCapture({contractHttpStatus: 401}), /UPSTOX_READ_ONLY_HTTP_401/);
  });
  it('records missing chain coverage instead of inventing data or filling zeros', async () => {
    const record = await fakeCapture({blockedExpiry: expiries[2]});
    assert.equal(record.payload.evidenceStatus, 'PARTIAL_SNAPSHOT');
    const missing = record.payload.chains.find(c => c.expiry === expiries[2]);
    assert.equal(missing?.status, 'UNAVAILABLE');
    assert.equal(missing?.rows.length, 0);
    assert.equal(missing?.reason, 'READ_ONLY_CHAIN_FETCH_FAILED');
  });
  it('flags a contradictory chain row rather than manufacturing spot/Greeks', async () => {
    const record = await fakeCapture({invalidExpiry: expiries[0]});
    assert.equal(record.payload.evidenceStatus, 'PARTIAL_SNAPSHOT');
    const invalid = record.payload.chains.find(c => c.expiry === expiries[0]);
    assert.equal(invalid?.status, 'INVALID_RESPONSE');
    assert.equal(invalid?.acceptedRowCount, 0);
  });
  it('detects tampering and malformed capture records', async () => {
    const record = await fakeCapture();
    const forged = structuredClone(record);
    forged.payload.chains[0].rows[0].call_options!.market_data.bid_price = 999;
    assert.equal(verifyAdaptiveCapture(forged).valid, false);
    assert.ok(verifyAdaptiveCapture(forged).errors.includes('CAPTURE_HASH_MISMATCH'));
    assert.equal(verifyAdaptiveCapture({}).valid, false);
    const shape = structuredClone(record);
    (shape.payload.chains[0] as any).rows = null;
    shape.sha256 = captureSha256(shape.payload);
    assert.equal(verifyAdaptiveCapture(shape).valid, false);
  });
  it('rejects unknown instruments and absent bearer token before touching HTTP', async () => {
    await assert.rejects(collectAdaptiveOptionEvidence({
      instrument: 'WRONG' as CaptureInstrument, accessToken: 'MOCK_ONLY_TOKEN',
      transport: brokerTransport()
    }), /INVALID_CAPTURE_INSTRUMENT/);
    await assert.rejects(collectAdaptiveOptionEvidence({
      instrument: 'NIFTY', accessToken: '', transport: brokerTransport()
    }), /UPSTOX_AUTH_REQUIRED/);
  });
});
