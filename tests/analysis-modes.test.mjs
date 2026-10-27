// trend / compare / CSV with synthetic rows only. No requests to the real API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runExample, tableRows, toCsv } from '../javascript/zenith-examples.mjs';

const row = (code, period, revenue, income, api, standard = 'JGAAP', days = 365) => ({
  symbol: code, fiscalPeriod: period, period: 'FY', accountingStandard: standard, fiscalPeriodDays: days,
  revenue, operatingIncome: income, operatingMargin: api, provenance: { source: 'synthetic', docId: `DEMO-${period}` },
});

test('trend sorts oldest first and keeps every check state', async () => {
  const rows = [row('DEMO', '2003-03', 200, 30, 0.2), row('DEMO', '2001-03', 100, 10, 0.1),
    row('DEMO', '2002-03', 100, 5, null), row('DEMO', '2000-03', null, 1, null),
    row('DEMO', '2004-03', 0, 1, 0.1), row('DEMO', '2005-03', 100, -5, 'x')];
  const calls = [];
  const result = await runExample('trend', 'DEMO', 'test-only', undefined, undefined,
    async (...args) => { calls.push(args); return rows; }, { years: 6 });
  assert.deepEqual(calls, [['/income-statement', { symbol: 'DEMO', period: 'annual', limit: 6 }, 'test-only']]);
  const trend = result.annualTrend;
  assert.deepEqual(trend.map(r => r.fiscalPeriod), ['2000-03', '2001-03', '2002-03', '2003-03', '2004-03', '2005-03']);
  assert.deepEqual(trend.map(r => r.marginCheck), ['notCalculated', 'match', 'apiMissing', 'mismatch', 'notCalculated', 'apiInvalid']);
  assert.equal(trend[0].revenue, null);
  assert.equal(trend[3].apiMargin, 0.2);
  assert.ok(Math.abs(trend[5].calculatedMargin + 0.05) < 1e-12);
  assert.equal(trend[1].docId, 'DEMO-2001-03');
});

test('trend rejects out-of-range years before requesting', async () => {
  for (const years of [0, 11, 2.5, Number.NaN]) {
    let called = false;
    await assert.rejects(runExample('trend', 'DEMO', 'test-only', undefined, undefined, async () => { called = true; return []; }, { years }));
    assert.equal(called, false);
  }
});

test('compare reports shared periods and condition differences', async () => {
  const data = {
    AAAA: [row('AAAA', '2001-03', 100, 10, 0.1, 'IFRS'), row('AAAA', '2002-03', 100, 10, 0.1, 'ifrs')],
    BBBB: [row('BBBB', '2002-03', 50, null, null, 'JGAAP', 300), row('BBBB', '2003-03', 50, 5, 0.1)],
  };
  const result = await runExample('compare', '', 'test-only', undefined, undefined,
    async (path, params) => data[params.symbol], { symbols: 'AAAA, BBBB' });
  assert.deepEqual(result.commonFiscalPeriods, ['2002-03']);
  const notes = result.notes.join(' ');
  assert.match(notes, /accounting standards differ \(IFRS, JGAAP\)/);
  assert.match(notes, /period lengths differ \(365\/300 days\)/);
  assert.match(notes, /could not be calculated/);
});

test('compare without a shared period says so', async () => {
  const data = { AAAA: [row('AAAA', '2002-03', 1, 1, 1)], BBBB: [row('BBBB', '2001-12', 1, 1, 1)] };
  const result = await runExample('compare', '', 'test-only', undefined, undefined,
    async (path, params) => data[params.symbol], { symbols: 'AAAA,BBBB' });
  assert.deepEqual(result.commonFiscalPeriods, []);
  assert.match(result.notes[0], /No fiscal period is shared/);
});

test('invalid compare lists do not request', async () => {
  for (const symbols of [undefined, 'AAAA', 'AAAA,AAAA', 'AAAA,BBBB,CCCC,DDDD,EEEE', 'AAAA,../x']) {
    let called = false;
    await assert.rejects(runExample('compare', '', 'test-only', undefined, undefined, async () => { called = true; return []; }, { symbols }));
    assert.equal(called, false);
  }
});

test('CSV keeps missing cells empty, quotes text and adds retrievedAt', async () => {
  const result = await runExample('trend', 'DEMO', 'test-only', undefined, undefined,
    async () => [row('DEMO', '2001-03', null, 1, null, 'A,"B"'), row('DEMO', '2002-03', 100, 10, 0.1)], { years: 2 });
  const text = toCsv(tableRows(result));
  assert.ok(text.startsWith('﻿symbol,fiscalPeriod'));
  const lines = text.trim().split('\r\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[1].includes(',"A,""B""",365,,1,,,notCalculated,'));
  assert.ok(lines[2].endsWith(`,match,synthetic,DEMO-2002-03,${result.retrievedAt}`));
  assert.throws(() => tableRows({ symbol: 'DEMO', retrievedAt: 'x', annualFinancials: [] }));
});
