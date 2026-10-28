// Standalone quarters from Japanese year-to-date figures. Synthetic rows only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoRequester, runExample, standaloneQuarters } from '../javascript/zenith-examples.mjs';

const DAYS = { Q1: 91, Q2: 182, Q3: 273, FY: 365 };
const row = (period, kind, revenue, income = 10, extra = {}) => ({
  symbol: 'DEMO', fiscalPeriod: period, period: kind, accountingStandard: 'jgaap', fiscalPeriodDays: DAYS[kind],
  revenue, operatingIncome: income, netIncome: 5, provenance: { docId: period + kind }, ...extra,
});

test('cumulative figures become standalone quarters', () => {
  const rows = [row('2026-03', 'FY', 460, 44), row('2025-12', 'Q3', 330, 30), row('2025-09', 'Q2', 210, 22), row('2025-06', 'Q1', 100, 10)];
  const result = standaloneQuarters(rows);
  assert.deepEqual(result.map(r => r.revenue), [100, 110, 120, 130]);
  assert.deepEqual(result.map(r => r.operatingIncome), [10, 12, 8, 14]);
  assert.ok(result.every(r => r.status === 'ok' && r.fiscalYearEnd === '2026-03'));
});

test('problems leave values empty with a reason', () => {
  const base = () => [row('2026-03', 'FY', 460), row('2025-12', 'Q3', 330), row('2025-09', 'Q2', 210), row('2025-06', 'Q1', 100)];
  const missing = standaloneQuarters(base().filter(r => r.period !== 'Q2')).find(r => r.quarter === 'Q3');
  assert.equal(missing.status, 'missingPrevious');
  const changed = base(); changed[0].accountingStandard = 'ifrs';
  assert.equal(standaloneQuarters(changed).find(r => r.quarter === 'Q4').status, 'standardChanged');
  const irregular = base(); irregular[0].fiscalPeriodDays = 450;
  const q4 = standaloneQuarters(irregular).find(r => r.quarter === 'Q4');
  assert.equal(q4.status, 'irregularPeriod');
  assert.equal(q4.revenue, null);
  assert.equal(q4.cumulativeRevenue, 460);
});

test('request has no period filter and demo shows a gap', async () => {
  const calls = [];
  await runExample('quarters', 'DEMO', 'k', undefined, undefined, async (...args) => { calls.push(args); return []; }, { years: 3 });
  assert.deepEqual(calls, [['/income-statement', { symbol: 'DEMO', limit: 12 }, 'k']]);
  const demo = await runExample('quarters', 'DEMOC', 'demo', undefined, undefined, demoRequester, { years: 1 });
  assert.deepEqual(demo.quarters.map(r => r.status), ['ok', 'missingValue', 'missingValue', 'ok']);
});
