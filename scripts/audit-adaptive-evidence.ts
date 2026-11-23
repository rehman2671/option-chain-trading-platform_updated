/**
 * Offline evidence coverage audit, never calls Upstox or dispatches orders.
 * Calendar JSON format:
 * {"calendarSource":"NSE_TRADING_SESSIONS_MANUALLY_VERIFIED",
 *  "expectedSessionDates":["2026-11-16"],"minimumCapturesPerSession":5}
 *
 * npx tsx scripts/audit-adaptive-evidence.ts NIFTY ./research-calendar.json
 */
import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { auditAdaptiveEvidence } from '../src/server/engine/ema15m/adaptiveEvidenceAudit.js';
import type { AdaptiveCaptureRecord, CaptureInstrument } from
  '../src/server/engine/ema15m/adaptiveEvidenceCapture.js';

async function main(): Promise<void> {
  const [instrument, calendarFilename, extra] = process.argv.slice(2);
  if (extra || !instrument || !['NIFTY','BANKNIFTY','SENSEX'].includes(instrument) ||
      !calendarFilename) {
    throw new Error('USAGE: npx tsx scripts/audit-adaptive-evidence.ts NIFTY <calendar.json>');
  }
  const calendar = JSON.parse(await readFile(resolve(calendarFilename), 'utf8'));
  const dir = resolve('research-data/adaptive-v2');
  const filenames = (await readdir(dir)).filter(f =>
    f.startsWith(instrument + '-') && f.endsWith('.json')).sort();
  const records: AdaptiveCaptureRecord[] = [];
  for (const name of filenames) {
    try {
      records.push(JSON.parse(await readFile(join(dir, name), 'utf8')));
    } catch {
      records.push({} as AdaptiveCaptureRecord); // audit reports the corrupt index
    }
  }
  const report = auditAdaptiveEvidence({
    instrument: instrument as CaptureInstrument,
    calendarSource: calendar.calendarSource,
    expectedSessionDates: calendar.expectedSessionDates,
    minimumCapturesPerSession: calendar.minimumCapturesPerSession,
    records
  });
  console.log(JSON.stringify({ discoveredFiles: filenames.length, ...report }, null, 2));
  // Status BLOCKED does not mean file verification failed; use nonzero for gaps.
  if (report.status !== 'CAPTURED_BUT_UNVERIFIED_EVENT_TIME') process.exitCode = 1;
}
main().catch(err => {
  console.error('ADAPTIVE_EVIDENCE_AUDIT_FAILED: ' +
    (err instanceof Error ? err.message : 'UNEXPECTED_FAILURE'));
  process.exitCode = 1;
});
