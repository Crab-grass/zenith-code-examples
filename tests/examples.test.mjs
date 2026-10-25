// Synthetic fixtures only. No requests to the real API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { requestRows, runExample } from '../javascript/zenith-examples.mjs';

test('snapshot preserves separate dates, nulls and provenance', async () => {
  const quote = [{ symbol: 'DEMO', price: 123, priceDate: '2000-02-01' }];
  const financials = [{ symbol: 'DEMO', fiscalPeriod: '1999-12', revenue: null, provenance: { PL: { source: 'synthetic' } } }];
  const calls = [];
  const requester = async (...args) => { calls.push(args); return calls.length === 1 ? quote : financials; };
  const result = await runExample('snapshot', 'DEMO', 'test-only', undefined, undefined, requester);
  assert.deepEqual(result.latestClose, quote);
  assert.deepEqual(result.annualFinancials, financials);
  assert.deepEqual(calls[1], ['/income-statement', { symbol: 'DEMO', period: 'annual', limit: 3 }, 'test-only']);
});

test('empty arrays remain empty', async () => {
  const result = await runExample('financials', 'DEMO', 'test-only', undefined, undefined, async () => []);
  assert.deepEqual(result.annualFinancials, []);
});

test('full statements request FY', async () => {
  await runExample('full', 'DEMO', 'test-only', undefined, undefined, async (path, params) => {
    assert.equal(path, '/financial-statement-full');
    assert.deepEqual(params, { symbol: 'DEMO', quarter: 'FY' });
    return [];
  });
});

test('history rejects invalid dates and unbounded ranges before requesting', async () => {
  for (const [start, end] of [[undefined, undefined], ['2026-02-30', '2026-03-01'], ['2026-03-02', '2026-03-01'], ['2024-01-01', '2026-01-01']]) {
    let called = false;
    await assert.rejects(runExample('history', 'DEMO', 'test-only', start, end, async () => { called = true; }));
    assert.equal(called, false);
  }
});

test('history preserves dates and alphanumeric securities code', async () => {
  await runExample('history', '130A', 'test-only', '2026-09-01', '2026-09-30', async (path, params) => {
    assert.equal(path, '/historical-price-eod');
    assert.deepEqual(params, { symbol: '130A', from: '2026-09-01', to: '2026-09-30' });
    return [];
  });
});

test('invalid symbol and mode make no requests', async () => {
  for (const [mode, symbol] of [['snapshot', '../key'], ['invalid', 'DEMO']]) {
    let called = false;
    await assert.rejects(runExample(mode, symbol, 'test-only', undefined, undefined, async () => { called = true; }));
    assert.equal(called, false);
  }
});

test('key is in header only, redirects blocked, timeout present', async () => {
  await requestRows('/quote', { symbol: 'DEMO' }, 'test-only', async (url, options) => {
    assert.equal(url.searchParams.get('symbol'), 'DEMO');
    assert.ok(!url.href.includes('test-only'));
    assert.equal(options.headers['x-api-key'], 'test-only');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    return new Response('[]');
  });
});

test('missing key makes no request', async () => {
  let called = false;
  await assert.rejects(requestRows('/quote', {}, '', async () => { called = true; }));
  assert.equal(called, false);
});

test('HTTP errors do not leak response bodies or retry', async () => {
  for (const status of [401, 403, 404, 429, 500, 302]) {
    let calls = 0;
    await assert.rejects(requestRows('/quote', {}, 'test-only', async () => {
      calls++; return new Response('synthetic-sensitive-text', { status });
    }), error => error.message.includes(`HTTP ${status}`) && !error.message.includes('synthetic-sensitive-text'));
    assert.equal(calls, 1);
  }
});

test('invalid JSON and non-object arrays are rejected', async () => {
  for (const payload of ['invalid', '{}', '[1]', '[null]', '[[]]']) {
    await assert.rejects(requestRows('/quote', {}, 'test-only', async () => new Response(payload)));
  }
});

test('network failure is sanitized', async () => {
  await assert.rejects(requestRows('/quote', {}, 'test-only', async () => { throw new Error('synthetic-sensitive-text'); }),
    /^Error: Network request failed, timed out, or attempted a redirect\.$/);
});
