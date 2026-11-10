/**
 * EMA15M / Quant security regression tests. Only in-process HTTP, no real broker calls.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import { quantRouter } from '../api/quantRouter.js';
import { dbEngine } from '../../server/db.js';
import { setAuthCookie } from '../../server/auth.js';

describe('EMA15M / Quant API authentication boundaries', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/quant', quantRouter);
  let server: Server;
  let base = '';
  let operatorToken = '';
  const originalLookup = dbEngine.findUserById;

  before(async () => {
    const operator = {
      id: 'test-ema-operator', email: 'ema-test-operator@example.invalid',
      role: 'OPERATOR', name: 'Test operator', isActive: true
    } as any;
    (dbEngine as any).findUserById = (id: string) =>
      id === operator.id ? operator : originalLookup.call(dbEngine, id);
    operatorToken = setAuthCookie({ cookie: () => undefined } as any, operator);
    server = await new Promise<Server>((resolve, reject) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
      instance.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Unexpected test server address');
    base = 'http://127.0.0.1:' + address.port;
  });

  after(async () => {
    (dbEngine as any).findUserById = originalLookup;
    if (server) await new Promise<void>((resolve, reject) =>
      server.close(err => err ? reject(err) : resolve()));
  });

  it('blocks anonymous quant live order and kill-switch reset requests', async () => {
    for (const endpoint of ['/order-submit', '/kill-switch/reset', '/decision-cycle/trigger']) {
      const res = await fetch(base + '/api/quant' + endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quantExecutionMode: 'LIVE_REAL', supervisorKey: 'RESET_RISK_AUTH' })
      });
      assert.equal(res.status, 401, endpoint + ' must require a real session');
    }
  });

  it('denies sensitive order, reset and config mutations for ordinary operators', async () => {
    for (const endpoint of ['/order-submit', '/kill-switch/reset', '/settings']) {
      const res = await fetch(base + '/api/quant' + endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + operatorToken },
        body: JSON.stringify({ quantExecutionMode: 'LIVE_REAL', confirmRiskAcknowledged: true })
      });
      assert.equal(res.status, 403, endpoint + ' must require SUPERADMIN');
    }
  });

  it('prevents ordinary operator from reading another account via userId', async () => {
    const res = await fetch(base + '/api/quant/settings?userId=someone-else', {
      headers: { authorization: 'Bearer ' + operatorToken }
    });
    assert.equal(res.status, 403);
  });

  it('permits an authenticated operator to read non-sensitive quant health', async () => {
    const res = await fetch(base + '/api/quant/health', {
      headers: { authorization: 'Bearer ' + operatorToken }
    });
    assert.equal(res.status, 200);
  });
});
