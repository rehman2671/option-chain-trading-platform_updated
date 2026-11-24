import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPasswordResetToken, hashPasswordResetToken, passwordResetDeliveryConfig } from '../release/passwordResetSecurity.js';

const valid = {
  NODE_ENV: 'production', APP_URL: 'https://example.com/',
  SMTP_HOST: 'mail.example.com', SMTP_USER: 'reset@example.com',
  SMTP_PASS: 'test-password', SMTP_FROM: 'reset@example.com'
};

test('reset delivery requires an explicit relay and valid HTTPS production origin', () => {
  assert.equal(passwordResetDeliveryConfig({}), null);
  for (const invalid of [
    { SMTP_HOST: '' }, { SMTP_PASS: '' }, { SMTP_PORT: '587oops' },
    { SMTP_PORT: '65536' }, { SMTP_FROM: 'sender\r\n@example.com' },
    { APP_URL: 'http://example.com' }, { APP_URL: 'https://localhost' },
    { APP_URL: 'https://example.com/other' }, { APP_URL: 'https://example.com/?token=secret' },
    { APP_URL: 'https://user:password@example.com' }, { APP_URL: 'MY_APP_URL' }
  ]) assert.equal(passwordResetDeliveryConfig({ ...valid, ...invalid }), null);
  const config = passwordResetDeliveryConfig(valid);
  assert.equal(config?.baseUrl, 'https://example.com');
  assert.equal(config?.port, 587);
  assert.equal(passwordResetDeliveryConfig({ ...valid, APP_BASE_URL: 'https://app.example.com', SMTP_PORT: '465' })?.baseUrl, 'https://app.example.com');
});

test('only canonical random tokens are accepted; stored digests differ from raw tokens', () => {
  const first = createPasswordResetToken();
  const second = createPasswordResetToken();
  assert.match(first.token, /^[a-f0-9]{64}$/);
  assert.notEqual(first.token, first.digest);
  assert.notEqual(first.token, second.token);
  assert.equal(hashPasswordResetToken(first.token), first.digest);
  assert.notEqual(hashPasswordResetToken(first.digest), first.digest);
  for (const invalid of [null, undefined, 123, {}, '', 'a'.repeat(63), 'A'.repeat(64), 'g'.repeat(64)]) {
    assert.equal(hashPasswordResetToken(invalid), null);
  }
});

test('SQLite reset token is consumed once and rejects expired, replaced or disabled identities', async () => {
  const { dbEngine } = await import('../db.js');
  await dbEngine.initialize();
  const db = dbEngine.getRawDatabase();
  const id = 'test-reset-' + createPasswordResetToken().token;
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 60000).toISOString();
  const past = new Date(Date.now() - 60000).toISOString();
  const a = createPasswordResetToken();
  const b = createPasswordResetToken();
  db.prepare('INSERT INTO users (id, email, name, role, is_active, password_hash, email_verified, created_at) VALUES (?, ?, ?, ?, 1, ?, 1, ?)').run(id, id + '@example.invalid', 'Test', 'OPERATOR', 'original-hash', now);
  try {
    dbEngine.setResetToken(id, a.digest, future);
    dbEngine.setResetToken(id, b.digest, future);
    dbEngine.clearResetTokenIfMatches(id, a.digest);
    assert.equal(dbEngine.consumeResetToken(id, a.digest, 'rejected', now), false);
    assert.equal(dbEngine.consumeResetToken(id, b.digest, 'new-hash', now), true);
    assert.equal(dbEngine.consumeResetToken(id, b.digest, 'replayed', now), false);
    assert.equal(dbEngine.findUserByEmail(id + '@example.invalid').password_hash, 'new-hash');
    dbEngine.setResetToken(id, a.digest, past);
    assert.equal(dbEngine.consumeResetToken(id, a.digest, 'expired', now), false);
    dbEngine.setResetToken(id, a.digest, future);
    dbEngine.setUserActiveStatus(id, false);
    assert.equal(dbEngine.consumeResetToken(id, a.digest, 'disabled', now), false);
    dbEngine.clearResetTokenIfMatches(id, a.digest);
    assert.equal(dbEngine.findUserByResetToken(a.digest), null);
  } finally {
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }
});
