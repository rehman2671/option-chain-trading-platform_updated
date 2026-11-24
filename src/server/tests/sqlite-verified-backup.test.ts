import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const script = path.resolve('scripts/backup_sqlite_verified.mjs');
function run(source: string, destination: string) {
  return spawnSync(process.execPath, [script, '--source', source, '--destination', destination], {
    encoding: 'utf8', timeout: 20000
  });
}

test('verified SQLite backup includes committed WAL rows and never overwrites a snapshot', () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'sqlite-backup-test-')));
  const source = path.join(root, 'option_platform.sqlite');
  const out = path.join(root, 'private');
  mkdirSync(out, { mode: 0o700 });
  const dest = path.join(out, 'snapshot.sqlite');
  const db = new Database(source);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('wal_autocheckpoint = 0');
    db.exec('CREATE TABLE users(id TEXT); CREATE TABLE paper_positions(id TEXT);');
    db.prepare('INSERT INTO users VALUES (?)').run('fixture-user');
    db.prepare('INSERT INTO paper_positions VALUES (?)').run('fixture-position');
    assert.ok(existsSync(source + '-wal'));
    const result = run(source, dest);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, 'VERIFIED_SQLITE_SNAPSHOT');
    assert.equal(report.remoteDurabilityCertified, false);
    assert.equal(report.liveTradingAuthorized, false);
    const contents = readFileSync(dest);
    assert.equal(report.bytes, contents.length);
    assert.equal(report.sha256, createHash('sha256').update(contents).digest('hex'));
    if (process.platform !== 'win32') assert.equal(statSync(dest).mode & 0o777, 0o600);

    const snapshot = new Database(dest, { readonly: true, fileMustExist: true });
    try {
      assert.equal(snapshot.pragma('integrity_check', { simple: true }), 'ok');
      assert.deepEqual(snapshot.prepare('SELECT id FROM users').all(), [{ id: 'fixture-user' }]);
      assert.deepEqual(snapshot.prepare('SELECT id FROM paper_positions').all(), [{ id: 'fixture-position' }]);
    } finally { snapshot.close(); }

    db.prepare('INSERT INTO users VALUES (?)').run('post-backup-user');
    assert.notEqual(run(source, dest).status, 0);
    assert.deepEqual(readFileSync(dest), contents);
    assert.equal((db.prepare('SELECT count(*) AS n FROM users').get() as { n: number }).n, 2);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('backup rejects missing source, wrong schema, existing sidecars and symlink target', () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'sqlite-backup-invalid-')));
  const source = path.join(root, 'not-app.sqlite');
  const out = path.join(root, 'private');
  mkdirSync(out, { mode: 0o700 });
  const dest = path.join(out, 'snapshot.sqlite');
  const db = new Database(source);
  try {
    db.exec('CREATE TABLE irrelevant(id TEXT)');
    assert.notEqual(run(path.join(root, 'missing.sqlite'), dest).status, 0);
    assert.notEqual(run(source, dest).status, 0);
    assert.equal(existsSync(dest), false);
    db.exec('CREATE TABLE users(id TEXT); CREATE TABLE paper_positions(id TEXT)');
    const sidecar = dest + '-wal';
    const junk = new Database(sidecar);
    junk.close();
    assert.notEqual(run(source, dest).status, 0);
    rmSync(sidecar);
    if (process.platform !== 'win32') {
      symlinkSync(source, dest);
      assert.notEqual(run(source, dest).status, 0);
      rmSync(dest);
      const shared = path.join(root, 'shared');
      mkdirSync(shared, { mode: 0o755 });
      assert.notEqual(run(source, path.join(shared, 'snapshot.sqlite')).status, 0);
    }
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
