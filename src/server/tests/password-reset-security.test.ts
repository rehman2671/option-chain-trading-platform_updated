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
