/**
 * One-shot explicit read-only capture:
 *   UPSTOX_ACCESS_TOKEN=... npx tsx scripts/capture-adaptive-evidence.ts NIFTY
 * No daemon, timer, order API, token serialization or synthetic provider fallback.
 * Records written with O_EXCL semantics to git-ignored research-data/.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { collectAdaptiveOptionEvidence, verifyAdaptiveCapture,
  type CaptureInstrument } from '../src/server/engine/ema15m/adaptiveEvidenceCapture.js';

const root = resolve(process.cwd(), 'research-data', 'adaptive-v2');
const supported: CaptureInstrument[] = ['NIFTY', 'BANKNIFTY', 'SENSEX'];

async function main(): Promise<void> {
  const [command, argument, extra] = process.argv.slice(2);
  if (extra !== undefined || !command) throw new Error(
    'USAGE: npx tsx scripts/capture-adaptive-evidence.ts NIFTY|BANKNIFTY|SENSEX OR --verify <basename.json>'
  );
  if (command === '--verify') {
    // Restrict to local generated basenames inside the dedicated research directory.
    if (!argument || !/^(NIFTY|BANKNIFTY|SENSEX)-[0-9TZ-]+-[a-f0-9]{12}\.json$/.test(argument)) {
      throw new Error('INVALID_VERIFICATION_BASENAME');
    }
    const file = join(root, argument);
    const bytes = await readFile(file, 'utf8');
    const report = verifyAdaptiveCapture(JSON.parse(bytes));
    console.log(JSON.stringify({ file, ...report }));
    if (!report.valid) process.exitCode = 1;
    return;
  }
  if (argument !== undefined || !supported.includes(command as CaptureInstrument)) {
    throw new Error('INVALID_INSTRUMENT_OR_ARGUMENTS');
  }
  const token = process.env.UPSTOX_ACCESS_TOKEN || process.env.UPSTOX_TOKEN;
  if (!token) throw new Error('UPSTOX_AUTH_REQUIRED');
  const record = await collectAdaptiveOptionEvidence({
    instrument: command as CaptureInstrument, accessToken: token
  });
  const basename = command + '-' +
    record.payload.collectedAt.replace(/[:.]/g, '-') +
    '-' + record.sha256.slice(0, 12) + '.json';
  await mkdir(root, { recursive: true, mode: 0o700 });
  const file = join(root, basename);
  // Never overwrite a prior sample. Saved JSON contains only allowlisted market fields.
  await writeFile(file, JSON.stringify(record) + '\n', { flag: 'wx', mode: 0o600 });
  const verification = verifyAdaptiveCapture(record);
  if (!verification.valid) throw new Error('WRITTEN_CAPTURE_FAILED_VALIDATION');
  console.log(JSON.stringify({
    file, sha256: record.sha256,
    status: record.payload.evidenceStatus,
    contracts: record.payload.contracts.acceptedRowCount,
    chainExpiries: record.payload.chains.length,
    validQuotedSides: record.payload.chains.reduce(
      (n, c) => n + c.validSidesWithL1AndGreeks, 0),
    exchangeQuoteTimestampVerified: false,
    historicalBacktestAuthorized: false,
    executionAuthorized: false
  }));
}
main().catch(e => {
  // Error codes only, no HTTP body, token, headers, or broker PII.
  const message = e instanceof Error ? e.message : 'UNEXPECTED_CAPTURE_FAILURE';
  console.error('ADAPTIVE_EVIDENCE_CAPTURE_FAILED: ' + message);
  process.exitCode = 1;
});
