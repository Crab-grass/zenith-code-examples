// search / statements / --demo. Synthetic data only; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoRequester, runExample } from '../javascript/zenith-examples.mjs';

test('search sends a trimmed query and keeps hits', async () => {
  const calls = [];
  const result = await runExample('search', '', 'test-only', undefined, undefined,
    async (...args) => { calls.push(args); return [{ symbol: 'DEMOA' }]; }, { query: ' Toyota ' });
  assert.deepEqual(calls, [['/search-name', { query: 'Toyota', limit: 10 }, 'test-only']]);
  assert.deepEqual(result.companies, [{ symbol: 'DEMOA' }]);
  for (const query of [undefined, '', 'a', 'x'.repeat(101)]) {
    await assert.rejects(runExample('search', '', 'test-only', undefined, undefined, async () => assert.fail('requested'), { query }));
  }
});

test('statements requests the three annual statements', async () => {
  const calls = [];
  await runExample('statements', 'DEMO', 'test-only', undefined, undefined,
    async (...args) => { calls.push(args); return []; });
  assert.deepEqual(calls.map(c => c[0]), ['/income-statement', '/balance-sheet-statement', '/cash-flow-statement']);
  for (const c of calls) assert.deepEqual(c[1], { symbol: 'DEMO', period: 'annual', limit: 3 });
  await assert.rejects(runExample('statements', 'DEMO', 'test-only', undefined, undefined, async () => [], { years: 0 }));
});

test('demo data answers every demo mode without a network', async () => {
  const search = await runExample('search', '', 'demo', undefined, undefined, demoRequester, { query: 'MOTORS' });
  assert.equal(search.companies[0].symbol, 'DEMOA');
  const trend = await runExample('trend', 'DEMOB', 'demo', undefined, undefined, demoRequester);
  assert.ok(trend.annualTrend.some(r => r.marginCheck === 'notCalculated'));
  const compared = await runExample('compare', '', 'demo', undefined, undefined, demoRequester, { symbols: 'DEMOA,DEMOC' });
  assert.deepEqual(compared.commonFiscalPeriods, []);
  const statements = await runExample('statements', 'DEMOC', 'demo', undefined, undefined, demoRequester, { years: 2 });
  assert.deepEqual(statements.cashFlows.map(r => r.fiscalPeriod), ['2025-12', '2024-12']);
  await assert.rejects(demoRequester('/quote', { symbol: 'DEMOA', limit: 1 }));
});
