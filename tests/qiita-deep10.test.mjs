// Fixtures are synthetic values, not company records, except the saved snapshot in
// articles/qiita-deep10/data that the last two tests replay offline. No requests to the real API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { main, parseArgs, segmentBreakdown, segmentLabel, summarize, classify } from '../articles/qiita-deep10/workforce-sample.mjs';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'articles', 'qiita-deep10');

async function capture(fn) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try { await fn(); } finally { console.log = original; }
  return lines;
}

const seg = (segment, employees, isSubtotal = false) => ({ segment, employees, isSubtotal, subtotalOf: null });
const report = (symbol, over = {}) => ({
  symbol, fiscalPeriod: '2000-03', docId: `DOC${symbol}`, submittedAt: '2000-06-20T00:30:00Z',
  employees: 100, consolidatedEmployees: 1000, averageAge: 40.5, averageTenureYears: 15, averageAnnualSalary: 6000000,
  segments: [seg('A', 700), seg('B', 300)], parentSegments: [seg('A', 100)], ...over,
});
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('segment sum excludes subtotal rows and matches the total', () => {
  const r = segmentBreakdown([seg('A', 600), seg('B', 400), seg('Sub', 1000, true)], 1000);
  assert.equal(r.status, 'complete');
  assert.equal(r.sum, 1000);
  assert.equal(r.diff, 0);
  assert.equal(r.top.name, 'A');
  assert.equal(segmentLabel(r), '和 1,000（差 0）');
});

test('empty, subtotal-only and no-number segment arrays do not become a sum of 0', () => {
  assert.equal(segmentBreakdown([], 10).status, 'empty');
  assert.equal(segmentBreakdown(undefined, 10).status, 'empty');
  const subtotalOnly = segmentBreakdown([seg('Sub', 10, true)], 10);
  assert.equal(subtotalOnly.status, 'subtotal_only');
  assert.equal(subtotalOnly.sum, null);
  const noNumbers = segmentBreakdown([seg('A', null), seg('B', null)], 10);
  assert.equal(noNumbers.status, 'no_numeric_rows');
  assert.equal(noNumbers.sum, null);
  assert.equal(segmentLabel(noNumbers), '数値の無い行のみ（和 —）');
});

test('a partial sum shows no difference and no largest segment', () => {
  const r = segmentBreakdown([seg('A', 6), seg('B', null)], 10);
  assert.equal(r.status, 'partial');
  assert.equal(r.sum, 6);
  assert.equal(r.diff, null);
  assert.equal(r.top, null);
  assert.equal(segmentLabel(r), '部分和 6（差 —）');
});

test('a segment sum above the total marks the filing as to be checked, even when no row is above 100%', () => {
  const r = segmentBreakdown([seg('A', 6), seg('B', 6)], 10);
  assert.equal(r.sumExceedsTotal, true);
  assert.equal(r.diff, 2);
  assert.equal(segmentLabel(r), '和 12（差 2・原文を確認）');
});

test('missing values stay "—", never 0, and a parent above the group is not turned into a share', () => {
  const s = summarize(report('9001', { employees: null, averageAge: null, averageAnnualSalary: undefined }));
  assert.equal(s.p, null);
  assert.equal(s.share, null);
  assert.equal(s.outside, null);
  assert.equal(s.age, null);
  assert.equal(s.salary, null);
  assert.equal(s.underFivePct, false);
  const over = summarize(report('9002', { employees: 1200 }));
  assert.equal(over.share, 1.2);
  assert.equal(over.outside, null);
});

test('the 5% note is a display threshold applied from the share', () => {
  assert.equal(summarize(report('1', { employees: 49 })).underFivePct, true);
  assert.equal(summarize(report('2', { employees: 50 })).underFivePct, false);
  assert.equal(summarize(report('3', { employees: 0 })).underFivePct, true);
});

test('classify separates HTTP 404 body, empty array and a normal array', () => {
  assert.equal(classify({ error: 'not_found', message: 'x' }), 'http_404');
  assert.equal(classify([]), 'empty_rows');
  assert.equal(classify([report('1')]), 'ok');
});

test('parseArgs reads options and symbols and rejects unclear input', () => {
  assert.deepEqual(parseArgs(['--from-json', './data', '--sort-by-share', '6501']),
    { fromJson: './data', period: null, sortByShare: true, symbols: ['6501'] });
  assert.equal(parseArgs(['--period', '2026-03']).period, '2026-03');
  assert.throws(() => parseArgs(['--period']), /needs a value/);
  assert.throws(() => parseArgs(['--from-json', '--sort-by-share']), /needs a value/);
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
  assert.ok(calls[0].url.startsWith('https://api.zenithcode.net/stable/workforce?'));
  assert.ok(calls[0].url.includes('symbol=8001') && calls[0].url.includes('fiscalPeriod=2000-03'));
  assert.equal(lines[0], '8001 このAPIで該当する従業員の情報を取得できなかった（http_404）');
  assert.equal(lines[1], '8002 このAPIで該当する従業員の情報を取得できなかった（empty_rows）');
  assert.equal(lines[2], '1000 DOC1000 2000-03 2000-06-20 | 提出会社 100人 / 連結 1,000人 / 差 900人（提出会社 10.0%）');
  assert.equal(lines[3], '  連結事業別: 和 1,000（差 0） / 最大区分: A 700人（70.0%）');
  assert.equal(lines[4], '  提出会社属性: 年齢 40.5歳 / 勤続 15年 / 給与 6,000,000円');
});

test('without --period only the latest filing is requested', async () => {
  const urls = [];
  await capture(() => main(['1000'], { env: { ZENITH_API_KEY: 'test-only' }, fetchImpl: async (url) => { urls.push(url); return json([report('1000')]); }, wait: async () => {} }));
  assert.equal(urls.length, 1);
  assert.ok(urls[0].includes('symbol=1000') && urls[0].includes('limit=1') && !urls[0].includes('fiscalPeriod'));
});

test('a rate-limit or server error stops the run instead of retrying', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return json({}, 429); };
  await assert.rejects(main(['1000', '1001'], { env: { ZENITH_API_KEY: 'test-only' }, fetchImpl, wait: async () => {} }), /\/workforce 429/);
  assert.equal(calls, 1);
});

test('--sort-by-share orders by share, puts one separator before the first row under 5%, keeps unavailable symbols last', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('symbol=8001')) return json({ error: 'not_found' }, 404);
    const sym = new URL(url).searchParams.get('symbol');
    const employees = { 1: 400, 2: 30, 3: 100, 4: null, 5: 20 }[sym];
    return json([report(sym, { employees })]);
  };
  const lines = await capture(() => main(['--sort-by-share', '1', '2', '3', '4', '5', '8001'], {
    env: { ZENITH_API_KEY: 'test-only' }, fetchImpl, wait: async () => {},
  }));
  assert.deepEqual(lines.map((l) => l.split(' ')[0]), ['1', '3', '---', '2', '5', '4', '8001']);
  assert.match(lines[4], /※提出会社は連結の5%未満$/);
  assert.match(lines[5], /提出会社 —（—）/);
  assert.equal(lines.filter((l) => l === '---').length, 1);
});

test('the saved snapshot reproduces the output printed in the article', async () => {
  const lines = await capture(() => main(['--from-json', join(dir, 'data')], { env: {} }));
  assert.equal(lines.join('\n') + '\n', await readFile(join(dir, 'expected-output.txt'), 'utf8'));
});

test('the saved snapshot reproduces the --sort-by-share output printed in the article', async () => {
  const lines = await capture(() => main(['--from-json', join(dir, 'data'), '--sort-by-share'], { env: {} }));
  assert.equal(lines.join('\n') + '\n', await readFile(join(dir, 'expected-output-sort-by-share.txt'), 'utf8'));
});

test('the saved snapshot has no keys or personal data and the five segment sums match the consolidated totals', async () => {
  for (const symbol of ['6501', '6503', '6701', '6702', '6758']) {
    const text = await readFile(join(dir, 'data', `workforce_${symbol}.json`), 'utf8');
    assert.doesNotMatch(text, /api[_-]?key|secret|token|password|@|tdnet/i);
    const s = summarize(JSON.parse(text)[0]);
    assert.equal(s.segments.diff, 0);
  }
});
