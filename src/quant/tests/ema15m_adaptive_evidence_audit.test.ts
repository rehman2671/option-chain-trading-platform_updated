import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { auditAdaptiveEvidence } from '../../server/engine/ema15m/adaptiveEvidenceAudit.js';
import { captureSha256, verifyAdaptiveCapture, type AdaptiveCapturePayload,
  type AdaptiveCaptureRecord } from '../../server/engine/ema15m/adaptiveEvidenceCapture.js';
import { compareAdaptiveHistorical, type HistoricalComparisonInput } from
  '../../server/engine/ema15m/historicalAdaptiveComparison.js';

// This is MANUALLY CONSTRUCTED MOCK EVIDENCE, not a fetched market snapshot.
function evidence(at = '2026-11-16T06:00:00.000Z'): AdaptiveCaptureRecord {
  const buckets = (['CE', 'PE'] as const).flatMap(side =>
    (['1W','2W','4W','8W'] as const).map(horizon =>
      ({ side, horizon, expiry: '2026-12-15', daysToExpiry: 29 })));
  const payload: AdaptiveCapturePayload = {
    schemaVersion: 'ADAPTIVE_OPTION_EVIDENCE_V1', mode: 'RESEARCH_ONLY',
    executionAuthorized: false, synthetic: false, source: 'UPSTOX_V2_READ_ONLY_REST',
    instrument: 'NIFTY', underlyingKey: 'NSE_INDEX|Nifty 50',
    collectedAt: at, quoteTimeQuality: 'RECEIPT_ONLY_EXCHANGE_TIME_UNVERIFIED',
    exchangeTimeVerified: false, marketSessionVerified: false,
    historicalBacktestAuthorized: false,
    contracts: {
      requestedAt: at, receivedAt: at, source: 'UPSTOX_V2_OPTION_CONTRACTS_REST',
      providerRowCount: 0, acceptedRowCount: 0, rows: []
    },
    buckets,
    chains: [{
      expiry: '2026-12-15', requestedAt: at, receivedAt: at,
      source: 'UPSTOX_V2_OPTION_CHAIN_REST', exchangeQuoteAt: null,
      status: 'CAPTURED', reason: 'RECEIPT_TIMESTAMP_ONLY',
      providerRowCount: 1, acceptedRowCount: 1,
      validSidesWithL1AndGreeks: 2,
      rows: [{
        expiry: '2026-12-15', underlying_key: 'NSE_INDEX|Nifty 50',
        underlying_spot_price: 25000, strike_price: 25000,
        call_options: null, put_options: null
      }]
    }],
    evidenceStatus: 'SNAPSHOT_CAPTURED_UNVERIFIED_TIME', warnings: []
  };
  return { payload, sha256: captureSha256(payload) };
}
function audit(records: AdaptiveCaptureRecord[], dates = ['2026-11-16']) {
  return auditAdaptiveEvidence({
    instrument: 'NIFTY', calendarSource: 'TEST_EXPLICIT_EXCHANGE_CALENDAR',
    expectedSessionDates: dates, minimumCapturesPerSession: 1, records
  });
}
describe('Adaptive real-evidence audit refuses research promotion', () => {
  it('never treats complete REST receipts as sufficient historical option evidence', () => {
    const record = evidence();
    assert.equal(verifyAdaptiveCapture(record).valid, true);
    const report = audit([record]);
    assert.equal(report.status, 'CAPTURED_BUT_UNVERIFIED_EVENT_TIME');
    assert.equal(report.executionAuthorized, false);
    assert.equal(report.historicalComparisonAuthorized, false);
    assert.equal(report.actualCapturedSessions, 1);
    assert.deepEqual(report.missingSessions, []);
    assert.ok(report.warnings.includes('REST_CAPTURE_RECEIPT_TIME_NOT_VERIFIED_EXCHANGE_EVENT_TIME'));
    assert.equal(report.capturedByHorizon['4W'], 1);
  });
  it('flags missing dates, duplicate timestamps and corrupted receipts', () => {
    const duplicated = structuredClone(evidence());
    const damaged = structuredClone(evidence('2026-11-17T06:00:00.000Z'));
    damaged.payload.chains[0].rows[0].strike_price = 77777; // digest no longer matches
    const report = audit([evidence(), duplicated, damaged], ['2026-11-16','2026-11-17']);
    assert.deepEqual(report.missingSessions, ['2026-11-17']);
    assert.equal(report.duplicateCaptureTimes.length, 1);
    assert.deepEqual(report.corruptedRecords, [2]);
    assert.equal(report.status, 'COLLECTION_GAPS');
  });
  it('excludes mock-only records from any authentic coverage metric', () => {
    const fake = evidence();
    fake.payload.synthetic = true;
    fake.payload.source = 'MOCK_HTTP_TEST';
    fake.sha256 = captureSha256(fake.payload);
    const report = audit([fake]);
    assert.deepEqual(report.testOnlyRecords, [0]);
    assert.deepEqual(report.missingSessions, ['2026-11-16']);
    assert.equal(report.status, 'COLLECTION_GAPS');
  });
  it('reports invalid or unsorted supplied session calendars', () => {
    const report = audit([evidence()], ['2026-11-17','2026-11-16']);
    assert.equal(report.status, 'INVALID_AUDIT_INPUT');
    assert.equal(report.historicalComparisonAuthorized, false);
  });
  it('refuses unverified receipt-only NON-SYNTHETIC backtest provenance', () => {
    const input: HistoricalComparisonInput = {
      provenance: {
        datasetId: 'TEST-NON-SYNTHETIC-DECLARATION',
        source: 'TEST_VENDOR', calendarSource: 'TEST',
        expectedSessions: ['2026-11-16'],
        synthetic: false,
        quoteTimestampQuality: 'RECEIPT_ONLY_UNVERIFIED'
      },
      instrument: 'NIFTY', underlyingKey: 'NSE_INDEX|Nifty 50',
      decisions: [], executionQuotes: [],
      policy: {
        holdCalendarDays: {'1W':1, '2W':2, '4W':4, '8W':8},
        slippageBpsPerSide: 10, feesAndTaxesINRPerSide: 10,
        maxSnapshotAgeMinutes: 5, maxEntryDelayMinutes: 10,
        maxExitDelayDays: 1, minCalendarDaysBeforeExpiry: 2,
        folds: [{
          trainStart: '2026-11-01', trainEnd: '2026-11-02',
          testStart: '2026-11-16', testEnd: '2026-11-17'
        }]
      }
    };
    const report = compareAdaptiveHistorical(input);
    assert.equal(report.status, 'INVALID_DATASET');
    assert.ok(report.errors.includes('HISTORICAL_L1_EVENT_TIME_UNVERIFIED'));
    assert.equal(report.executionAuthorized, false);
    assert.equal(report.productionSafe, false);
  });
});
