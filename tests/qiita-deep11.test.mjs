// Fixtures are synthetic values, not company records, except the saved snapshot in
// articles/qiita-deep11/data that the last two tests replay offline. No requests to the real API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { main, parseArgs, summarizeField, summarizeCompany, companyLines, classify, pct } from '../articles/qiita-deep11/diversity-sample.mjs';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'articles', 'qiita-deep11');

async function capture(fn) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try { await fn(); } finally { console.log = original; }
  return lines;
}

const sub = (name, over = {}) => ({
  name, femaleManagerRatio: 0.1, maleChildcareLeaveRatio: 0.5, maleChildcareLeaveBasis: null,
  wageGapAll: 0.7, wageGapRegular: 0.7, wageGapNonRegular: 0.6, ...over,
});
const report = (symbol, over = {}) => ({
  symbol, fiscalPeriod: '2000-03', period: 'FY', docId: `DOC${symbol}`, submittedAt: '2000-06-20T15:30:00Z',
  reportingCompany: { femaleManagerRatio: 0.1, maleChildcareLeaveRatio: 0.8, maleChildcareLeaveBasis: 'childcare-leave',
    wageGapAll: 0.7, wageGapRegular: 0.72, wageGapNonRegular: 0.6 },
  subsidiaries: [sub('A', { femaleManagerRatio: 0 }), sub('B', { femaleManagerRatio: 0.2 }), sub('C', { femaleManagerRatio: 0.05 })],
  ...over,
});
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('null is counted apart from the values and 0 stays a value', () => {
  const r = summarizeField([sub('A', { maleChildcareLeaveRatio: 0 }), sub('B', { maleChildcareLeaveRatio: null }),
    sub('C', { maleChildcareLeaveRatio: undefined }), sub('D', { maleChildcareLeaveRatio: 0.6 })], 'maleChildcareLeaveRatio', 0.5);
  assert.equal(r.total, 4);
  assert.equal(r.count, 2);
  assert.equal(r.nullCount, 2);
  assert.equal(r.count + r.nullCount, r.total);
  assert.equal(r.zeroCount, 1);
  assert.equal(r.min.name, 'A');
  assert.equal(r.median, 0.3);
  assert.equal(r.aboveParent, 1);
});

test('odd and even medians, values above 100% and a missing parent value', () => {
  const odd = summarizeField([sub('A', { wageGapAll: 0.9 }), sub('B', { wageGapAll: 1.2 }), sub('C', { wageGapAll: 0.5 })], 'wageGapAll', null);
  assert.equal(odd.median, 0.9);
  assert.equal(odd.max.name, 'B');
  assert.equal(odd.over100Count, 1);
  assert.equal(odd.aboveParent, null);
  const even = summarizeField([sub('A', { wageGapAll: 0.2 }), sub('B', { wageGapAll: 0.4 })], 'wageGapAll', 0.3);
  assert.equal(even.median, (0.2 + 0.4) / 2);
  assert.equal(pct(1.444), '144.4%');
  assert.equal(pct(null), '—');
});

test('a field with no values (or no subsidiaries) returns "—" instead of failing', () => {
  const none = summarizeField([sub('A', { femaleManagerRatio: null }), sub('B', { femaleManagerRatio: null })], 'femaleManagerRatio', 0.05);
  assert.deepEqual([none.count, none.nullCount, none.min, none.median, none.max, none.aboveParent], [0, 2, null, null, null, null]);
  assert.equal(summarizeField(undefined, 'femaleManagerRatio', 0.1).total, 0);
  const s = summarizeCompany(report('9001', { subsidiaries: [sub('A', { femaleManagerRatio: null }), sub('B', { femaleManagerRatio: null })] }));
  assert.equal(companyLines(s)[1], '  女性管理職: 親 10.0% / 子(0/2) 最小 — / 中央値 — / 最大 — / 0% 0社 / 親超 —');
});

test('summarizeCompany converts the UTC timestamp to the JST date and keeps a null basis as "—"', () => {
  const s = summarizeCompany(report('9002', { reportingCompany: { femaleManagerRatio: null, maleChildcareLeaveBasis: null } }));
  assert.equal(s.submittedDateJst, '2000-06-21');
  assert.equal(s.basis, '—');
  assert.equal(s.parent.femaleManager, null);
  assert.equal(s.femaleManager.aboveParent, null);
  assert.equal(summarizeCompany(report('9003', { submittedAt: null })).submittedDateJst, '—');
});

test('classify separates HTTP 404 body, empty array and a normal array', () => {
  assert.equal(classify({ error: 'not_found', message: 'x' }), 'http_404');
  assert.equal(classify([]), 'empty_rows');
  assert.equal(classify([report('1')]), 'ok');
});

test('parseArgs reads options and symbols and rejects unclear input', () => {
  assert.deepEqual(parseArgs(['--from-json', './data', '--sort-by-gap', '6501']),
    { fromJson: './data', period: null, sortByGap: true, symbols: ['6501'] });
  assert.equal(parseArgs(['--period', '2026-03']).period, '2026-03');
  assert.throws(() => parseArgs(['--period']), /needs a value/);
  assert.throws(() => parseArgs(['--from-json', '--sort-by-gap']), /needs a value/);
  assert.throws(() => parseArgs(['--nope']), /unknown option/);
  assert.throws(() => parseArgs(['--from-json', './data', '--period', '2026-03']), /only applies to live API calls/);
});

test('live mode needs a key and makes no request without one', async () => {
  let called = false;
  await assert.rejects(main([], { env: {}, fetchImpl: async () => { called = true; } }), /ZENITH_API_KEY/);
  assert.equal(called, false);
});

test('live mode makes one request per symbol, pauses between them and keeps going after 404 and an empty 200', async () => {
  const calls = [];
  let waits = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, key: init.headers['x-api-key'] });
    if (url.includes('symbol=8001')) return json({ error: 'not_found' }, 404);
    if (url.includes('symbol=8002')) return json([]);
    return json([report('1000')]);
  };
  const lines = await capture(() => main(['--period', '2000-03', '8001', '8002', '1000'], {
    env: { ZENITH_API_KEY: ' test-only ' }, fetchImpl, wait: async () => { waits++; },
  }));
  assert.equal(calls.length, 3);
  assert.equal(waits, 2);
  assert.ok(calls.every((c) => c.key === 'test-only'));
  assert.ok(calls[0].url.startsWith('https://api.zenithcode.net/stable/diversity?'));
  assert.ok(calls[0].url.includes('symbol=8001') && calls[0].url.includes('fiscalPeriod=2000-03'));
  assert.deepEqual(lines, [
    '8001 このAPIで該当する多様性の情報を取得できなかった（http_404）',
    '8002 このAPIで該当する多様性の情報を取得できなかった（empty_rows）',
    '1000 DOC1000 2000-03 2000-06-21 | 子会社 3社 | 育休基準 childcare-leave',
    '  女性管理職: 親 10.0% / 子(3/3) 最小 0.0% / 中央値 5.0% / 最大 20.0% / 0% 1社 / 親超 1社',
    '  男性育休  : 親 80.0% / 子(3/3, null 0) 最小 50.0% / 中央値 50.0% / 最大 50.0% / 100%超 0社',
    '  賃金差(全): 親 70.0% / 子(3/3, null 0) 最小 70.0% / 中央値 70.0% / 最大 70.0% / 100%超 0社',
  ]);
});

test('without --period only the latest filing is requested', async () => {
  const urls = [];
  await capture(() => main(['1000'], { env: { ZENITH_API_KEY: 'test-only' }, fetchImpl: async (url) => { urls.push(url); return json([report('1000')]); }, wait: async () => {} }));
  assert.equal(urls.length, 1);
  assert.ok(urls[0].includes('symbol=1000') && !urls[0].includes('fiscalPeriod'));
});

test('a rate-limit or server error stops the run instead of retrying', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return json({}, 429); };
  await assert.rejects(main(['1000', '1001'], { env: { ZENITH_API_KEY: 'test-only' }, fetchImpl, wait: async () => {} }), /\/diversity 429/);
  assert.equal(calls, 1);
});

test('--sort-by-gap orders by parent minus median, puts companies without a gap and unavailable symbols last', async () => {
  const fetchImpl = async (url) => {
    const sym = new URL(url).searchParams.get('symbol');
    if (sym === '8001') return json({ error: 'not_found' }, 404);
    const parent = { 1: 0.06, 2: 0.3, 3: null, 4: 0.1 }[sym];
    return json([report(sym, { reportingCompany: { femaleManagerRatio: parent } })]);
  };
  const lines = await capture(() => main(['--sort-by-gap', '1', '2', '3', '4', '8001'], {
    env: { ZENITH_API_KEY: 'test-only' }, fetchImpl, wait: async () => {},
  }));
  assert.deepEqual(lines.map((l) => l.split(' ')[0]), ['2', '4', '1', '3', '8001']);
  assert.match(lines[0], /（差 \+25\.0pt）/);
  assert.match(lines[2], /（差 \+1\.0pt）/);
  assert.match(lines[3], /（差 —） .*親超: —社/);
});

test('the saved snapshot reproduces the output printed in the article', async () => {
  const lines = await capture(() => main(['--from-json', join(dir, 'data')], { env: {} }));
  assert.equal(lines.join('\n') + '\n', await readFile(join(dir, 'expected-output.txt'), 'utf8'));
});

test('the saved snapshot reproduces the --sort-by-gap output printed in the article', async () => {
  const lines = await capture(() => main(['--from-json', join(dir, 'data'), '--sort-by-gap'], { env: {} }));
  assert.equal(lines.join('\n') + '\n', await readFile(join(dir, 'expected-output-sort-by-gap.txt'), 'utf8'));
});
