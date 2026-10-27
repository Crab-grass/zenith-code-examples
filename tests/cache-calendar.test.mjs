// --cache, earnings and dividends. Synthetic data only; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cacheKey, cached, demoRequester, runExample } from '../javascript/zenith-examples.mjs';

test('cache reuses identical requests, matches Python keys and stores no key', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'zenith-cache-'));
  try {
    let calls = 0;
    const stats = {};
    const get = cached(async () => { calls += 1; return [{ v: 1 }]; }, folder, 24, stats);
    await get('/quote', { symbol: 'DEMO' }, 'secret-key');
    assert.deepEqual(await get('/quote', { symbol: 'DEMO' }, 'secret-key'), [{ v: 1 }]);
    assert.equal(calls, 1);
    assert.deepEqual(stats, { requested: 1, reused: 1 });
    const saved = readdirSync(folder).map(f => readFileSync(join(folder, f), 'utf8')).join('');
    assert.ok(!saved.includes('secret-key'));
    assert.equal(cacheKey('/search-name', { query: 'トヨタ 自動車', limit: 10 }),
      '337feba986e4f77b26dc8cff0edb4af38df5e0cf0b34c2402d5da8f7e5087900');
    const failing = cached(async () => { throw new Error('HTTP 429.'); }, join(folder, 'errors'));
    await assert.rejects(failing('/quote', { symbol: 'X' }, 'k'));
    assert.ok(!readdirSync(folder).includes('errors'));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('earnings validates ranges and filters codes', async () => {
  const calls = [];
  const requester = async (...args) => { calls.push(args); return [{ symbol: 'AAAA' }, { symbol: 'BBBB' }]; };
  const result = await runExample('earnings', '', 'k', '2025-04-01', '2025-06-30', requester, { symbols: 'BBBB' });
  assert.deepEqual(calls[0], ['/earnings-calendar', { limit: 200, from: '2025-04-01', to: '2025-06-30' }, 'k']);
  assert.deepEqual(result.earnings, [{ symbol: 'BBBB' }]);
  for (const [start, end] of [['2025-01-01', '2025-12-31'], ['2025-04-01', undefined], ['2025-05-01', '2025-04-01']]) {
    await assert.rejects(runExample('earnings', '', 'k', start, end, requester));
  }
  const demo = await runExample('earnings', '', 'demo', '2025-04-01', '2025-06-30', demoRequester);
  assert.deepEqual(demo.earnings.map(r => r.symbol), ['DEMOB', 'DEMOA']);
});

test('dividends request and demo rows', async () => {
  const calls = [];
  await runExample('dividends', 'DEMO', 'k', undefined, undefined, async (...args) => { calls.push(args); return []; });
  assert.deepEqual(calls, [['/dividends', { symbol: 'DEMO', limit: 40 }, 'k']]);
  const rows = (await runExample('dividends', 'DEMOA', 'demo', undefined, undefined, demoRequester)).dividends;
  assert.equal(rows[0].forecastOrActual, 'forecast');
  assert.deepEqual([...new Set(rows.map(r => r.dividendType))].sort(), ['annual', 'final', 'interim']);
});
