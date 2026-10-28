// health and benchmark. Synthetic data only; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkRows, demoRequester, healthRows, runExample } from '../javascript/zenith-examples.mjs';

test('health recalculates ratios and describes cash flow', () => {
  const rows = healthRows(
    [{ fiscalPeriod: '2002-03', totalAssets: 100, ownersEquity: 40, equityRatio: 0.4, interestBearingDebt: 20 },
      { fiscalPeriod: '2001-03', totalAssets: 100, ownersEquity: 50, equityRatio: 0.6 }],
    [{ fiscalPeriod: '2001-03', operatingCashFlow: -3, investingCashFlow: -2, freeCashFlow: null }]);
  assert.deepEqual(rows.map(r => r.fiscalPeriod), ['2001-03', '2002-03']);
  assert.equal(rows[0].equityRatioCheck, 'mismatch');
  assert.equal(rows[0].freeCashFlow, -5);
  assert.equal(rows[0].flags, 'negativeOperatingCashFlow;negativeFreeCashFlow');
  assert.equal(rows[1].debtToEquity, 0.5);
  assert.equal(rows[1].flags, 'cashFlowMissing');
});

test('benchmark positions and requests', async () => {
  const bench = [{ sector: '0001', perQ1: 10, perMedian: 14, perQ3: 19 }];
  const at = per => benchmarkRows('DEMO', { sector: '0001', per }, {}, {}, bench).find(r => r.metric === 'per').position;
  assert.deepEqual([9, 10, 14, 19, 20, -3, null].map(at),
    ['belowQ1', 'Q1toMedian', 'medianToQ3', 'medianToQ3', 'aboveQ3', 'excludedLikeBenchmark', 'noValue']);
  const calls = [];
  await runExample('benchmark', 'DEMO', 'k', undefined, undefined, async path => {
    calls.push(path);
    return path === '/profile' ? [{ sector: '0001' }] : [];
  });
  assert.deepEqual(calls, ['/profile', '/key-metrics', '/key-metrics-latest', '/industry-benchmarks']);
  await assert.rejects(runExample('benchmark', 'DEMO', 'k', undefined, undefined, async () => [{ sector: null }]));
  const demo = await runExample('benchmark', 'DEMOA', 'demo', undefined, undefined, demoRequester);
  assert.equal(demo.benchmark.length, 8);
});
