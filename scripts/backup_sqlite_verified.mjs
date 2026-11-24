/**
 * Operator-invoked, WAL-aware SQLite snapshot. No broker calls, no server startup,
 * no automatic restore, no implicit source or target, and no destination overwrite.
 * A locally verified snapshot is not a durable/off-site backup certification.
 */
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import {
  chmodSync, closeSync, createReadStream, fsyncSync, linkSync, lstatSync,
  mkdtempSync, openSync, realpathSync, rmSync
} from 'node:fs';
import path from 'node:path';

function existsIncludingSymlink(file) {
  try { lstatSync(file); return true; }
  catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
}
function assertNoTargetArtifacts(file) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    if (existsIncludingSymlink(file + suffix)) throw new Error('BACKUP_DESTINATION_EXISTS');
  }
}
function checkIntegrity(db) {
  const result = db.pragma('integrity_check');
  if (result.length !== 1 || Object.values(result[0])[0] !== 'ok') {
    throw new Error('BACKUP_INTEGRITY_CHECK_FAILED');
  }
}
async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function createVerifiedSqliteBackup(source, destination) {
  if (typeof source !== 'string' || typeof destination !== 'string' ||
      !path.isAbsolute(source) || !path.isAbsolute(destination) ||
      path.extname(destination).toLowerCase() !== '.sqlite') {
    throw new Error('BACKUP_ABSOLUTE_SOURCE_AND_SQLITE_DESTINATION_REQUIRED');
  }
  const sourcePath = path.resolve(source);
  const destinationPath = path.resolve(destination);
  const src = lstatSync(sourcePath);
  if (!src.isFile() || src.isSymbolicLink() || realpathSync(sourcePath) !== sourcePath) {
    throw new Error('BACKUP_SOURCE_MUST_BE_REGULAR_CANONICAL_FILE');
  }
  const parent = path.dirname(destinationPath);
  const parentInfo = lstatSync(parent);
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink() || realpathSync(parent) !== parent) {
    throw new Error('BACKUP_DESTINATION_DIRECTORY_INVALID');
  }
  // Backups contain account and market data. Require a private directory on POSIX.
  if (process.platform !== 'win32' && (parentInfo.mode & 0o077) !== 0) {
    throw new Error('BACKUP_DESTINATION_DIRECTORY_NOT_PRIVATE');
  }
  if (sourcePath === destinationPath) throw new Error('BACKUP_SOURCE_EQUALS_DESTINATION');
  assertNoTargetArtifacts(destinationPath);

  const oldUmask = process.umask(0o077);
  let tempDir, sourceDb, snapshotDb;
  try {
    tempDir = mkdtempSync(path.join(parent, '.sqlite-snapshot-'));
    const snapshot = path.join(tempDir, 'snapshot.sqlite');
    sourceDb = new Database(sourcePath, { readonly: true, fileMustExist: true, timeout: 5000 });
    // SQLite's online backup API includes committed WAL content and avoids copying
    // a database/WAL pair independently during concurrent app writes.
    await sourceDb.backup(snapshot);
    sourceDb.close();
    sourceDb = undefined;

    snapshotDb = new Database(snapshot, { readonly: true, fileMustExist: true });
    checkIntegrity(snapshotDb);
    // Ensure an empty/non-app database cannot be reported as a platform backup.
    const tables = snapshotDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('users','paper_positions')").all();
    if (tables.length !== 2) throw new Error('BACKUP_PLATFORM_SCHEMA_MISSING');
    snapshotDb.close();
    snapshotDb = undefined;
    chmodSync(snapshot, 0o600);
    const digest = await sha256(snapshot);
    const bytes = lstatSync(snapshot).size;
    const fd = openSync(snapshot, 'r');
    try { fsyncSync(fd); } finally { closeSync(fd); }

    // Publish a completed file atomically, without overwriting an existing file.
    // The temporary file is on the same filesystem as the final destination.
    assertNoTargetArtifacts(destinationPath);
    linkSync(snapshot, destinationPath);
    return { status: 'VERIFIED_SQLITE_SNAPSHOT', sha256: digest, bytes,
      remoteDurabilityCertified: false, liveTradingAuthorized: false };
  } finally {
    try { snapshotDb?.close(); } catch {}
    try { sourceDb?.close(); } catch {}
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    process.umask(oldUmask);
  }
}

if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--source' || args[2] !== '--destination') {
    console.error('Usage: node scripts/backup_sqlite_verified.mjs --source /absolute/option_platform.sqlite --destination /private/backup/snapshot.sqlite');
    process.exitCode = 2;
  } else {
    try {
      const result = await createVerifiedSqliteBackup(args[1], args[3]);
      console.log(JSON.stringify(result));
    } catch {
      // Never emit filesystem paths, SQLite contents, or other account data.
      console.error('BACKUP_FAILED: no successful verified snapshot reported.');
      process.exitCode = 1;
    }
  }
}
