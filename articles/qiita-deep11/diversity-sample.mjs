// diversity-sample.mjs (Node.js 18+, no dependencies)
// Code for the Qiita article "ZENITH Code Deep Dive #11" (Japanese): diversity metrics of the reporting company
// (提出会社) next to the spread across the subsidiaries listed in the same table of the annual report
// (female manager ratio, male childcare leave, gender pay gap).
//
//   node diversity-sample.mjs --from-json ./data                  # saved responses, no network, no API key
//   node diversity-sample.mjs --from-json ./data --sort-by-gap    # the "small change" in the article
//   ZENITH_API_KEY=... node diversity-sample.mjs --period 2026-03 [symbol ...]   # live API, 1 request per company
//
// Output labels are in Japanese because the article's output is.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = "https://api.zenithcode.net/stable";
const DEFAULT_SYMBOLS = ["6501", "6503", "6701", "6702", "6758"];
const REQUEST_GAP_MS = 6500; // stays under the Free plan's 10 requests per minute
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ratios come as fractions (0.089 = 8.9%). Values above 1 are valid (male leave, pay gap) and are printed as they are.
export const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
export const pct = (v) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(1)}%`);

// ---- fetching -------------------------------------------------------------------------------------
// HTTP 404 and "200 with an empty array" are different situations; null fields are handled later, per field.
export function classify(body) {
  if (body && !Array.isArray(body) && body.error === "not_found") return "http_404";
  const report = Array.isArray(body) ? body[0] : body;
  return report ? "ok" : "empty_rows";
}

export async function fetchDiversity(symbol, { apiKey, fiscalPeriod, fetchImpl = fetch } = {}) {
  const params = fiscalPeriod ? { symbol, fiscalPeriod, limit: "1" } : { symbol, limit: "1" }; // no period: the latest filing
  const url = `${BASE_URL}/diversity?${new URLSearchParams(params)}`;
  const res = await fetchImpl(url, { headers: { "x-api-key": apiKey, Accept: "application/json" } });
  if (res.status === 404) return { symbol, status: "http_404", report: null };
  if (!res.ok) throw new Error(`/diversity ${res.status}`);
  const body = await res.json();
  const status = classify(body);
  return { symbol, status, report: status === "ok" ? (Array.isArray(body) ? body[0] : body) : null };
}

export async function loadSaved(symbol, dir) {
  const body = JSON.parse(await readFile(join(dir, `diversity_${symbol}.json`), "utf8"));
  const status = classify(body);
  return { symbol, status, report: status === "ok" ? (Array.isArray(body) ? body[0] : body) : null };
}

// ---- one field across subsidiaries ----------------------------------------------------------------
// Summarize a single ratio field across subsidiaries.
// Null values are excluded from stats and counted separately so null is never treated as 0%.
export function summarizeField(subsidiaries, field, parentValue) {
  const rows = Array.isArray(subsidiaries) ? subsidiaries : [];
  const valid = [];
  let nullCount = 0;
  for (const s of rows) {
    const v = num(s?.[field]);
    if (v === null) { nullCount += 1; continue; }
    valid.push({ name: s.name ?? "—", value: v });
  }
  if (valid.length === 0) {
    return {
      total: rows.length, count: 0, nullCount, zeroCount: 0,
      min: null, median: null, max: null, aboveParent: null, over100Count: 0,
    };
  }
  valid.sort((a, b) => a.value - b.value);
  const mid = Math.floor(valid.length / 2);
  const median = valid.length % 2 === 1
    ? valid[mid].value
    : (valid[mid - 1].value + valid[mid].value) / 2;
  const p = num(parentValue);
  return {
    total: rows.length,
    count: valid.length,
    nullCount,
    zeroCount: valid.filter((x) => x.value === 0).length,
    min: valid[0],
    median,
    max: valid[valid.length - 1],
    aboveParent: p === null ? null : valid.filter((x) => x.value > p).length,
    over100Count: valid.filter((x) => x.value > 1).length,
  };
}

// ---- one company ----------------------------------------------------------------------------------
// reportingCompany is the filing parent (single entity). subsidiaries are the companies listed in the same
// table of the filing, not every consolidated subsidiary.
export function summarizeCompany(report) {
  const rc = report?.reportingCompany ?? {};
  const subs = Array.isArray(report?.subsidiaries) ? report.subsidiaries : [];
  return {
    symbol: report.symbol,
    fiscalPeriod: report.fiscalPeriod,
    docId: report.docId,
    submittedDateJst: report.submittedAt
      ? new Date(new Date(report.submittedAt).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
      : "—",
    basis: rc.maleChildcareLeaveBasis ?? "—",
    parent: {
      femaleManager: num(rc.femaleManagerRatio),
      maleLeave: num(rc.maleChildcareLeaveRatio),
      wageAll: num(rc.wageGapAll),
      wageRegular: num(rc.wageGapRegular),
      wageNonRegular: num(rc.wageGapNonRegular),
    },
    subCount: subs.length,
    femaleManager: summarizeField(subs, "femaleManagerRatio", rc.femaleManagerRatio),
    maleLeave: summarizeField(subs, "maleChildcareLeaveRatio", rc.maleChildcareLeaveRatio),
    wageAll: summarizeField(subs, "wageGapAll", rc.wageGapAll),
    wageRegular: summarizeField(subs, "wageGapRegular", rc.wageGapRegular),
    wageNonRegular: summarizeField(subs, "wageGapNonRegular", rc.wageGapNonRegular),
  };
}

const range = (f) => `最小 ${pct(f.min?.value)} / 中央値 ${pct(f.median)} / 最大 ${pct(f.max?.value)}`;
const unavailable = (r) => `${r.symbol} このAPIで該当する多様性の情報を取得できなかった（${r.status}）`;

export function companyLines(s) {
  const fm = s.femaleManager;
  const lines = [`${s.symbol} ${s.docId ?? "—"} ${s.fiscalPeriod ?? "—"} ${s.submittedDateJst} | 子会社 ${s.subCount}社 | 育休基準 ${s.basis}`];
  lines.push(
    `  女性管理職: 親 ${pct(s.parent.femaleManager)} / 子(${fm.count}/${fm.total}) ${range(fm)} / 0% ${fm.zeroCount}社 / 親超 ${fm.aboveParent === null ? "—" : `${fm.aboveParent}社`}`
  );
  for (const [label, parent, f] of [
    ["男性育休  ", s.parent.maleLeave, s.maleLeave],
    ["賃金差(全)", s.parent.wageAll, s.wageAll],
  ]) {
    lines.push(`  ${label}: 親 ${pct(parent)} / 子(${f.count}/${f.total}, null ${f.nullCount}) ${range(f)} / 100%超 ${f.over100Count}社`);
  }
  return lines;
}

function printCompany(result) {
  if (result.status !== "ok") {
    console.log(unavailable(result));
    return;
  }
  for (const line of companyLines(summarizeCompany(result.report))) console.log(line);
}

// Display-only change (--sort-by-gap): sort by parent minus subsidiary median female manager ratio.
function printSortedByGap(results) {
  const rows = results
    .filter((r) => r.status === "ok")
    .map((r) => {
      const s = summarizeCompany(r.report);
      const p = s.parent.femaleManager;
      const m = s.femaleManager.median;
      const diffPt = p !== null && m !== null ? (p - m) * 100 : null;
      return { s, diffPt };
    })
    .sort((a, b) => (b.diffPt ?? -999) - (a.diffPt ?? -999));
  for (const { s, diffPt } of rows) {
    const diffStr = diffPt === null ? "—" : `${diffPt >= 0 ? "+" : ""}${diffPt.toFixed(1)}pt`;
    console.log(
      `${s.symbol} | 親 ${pct(s.parent.femaleManager)} vs 子中央値 ${pct(s.femaleManager.median)}（差 ${diffStr}） | 子会社 ${s.femaleManager.count}/${s.subCount}社（0%: ${s.femaleManager.zeroCount}社 / 親超: ${s.femaleManager.aboveParent ?? "—"}社）`
    );
  }
  for (const r of results.filter((x) => x.status !== "ok")) {
    console.log(`${r.symbol} このAPIで該当する多様性の情報を取得できなかった（${r.status}）`);
  }
}

// ---- command line ---------------------------------------------------------------------------------
export function parseArgs(argv) {
  const opts = { fromJson: null, period: null, sortByGap: false, symbols: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from-json" || a === "--period") {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) throw new Error(`${a} needs a value`);
      if (a === "--from-json") opts.fromJson = value; else opts.period = value;
    } else if (a === "--sort-by-gap") opts.sortByGap = true;
    else if (a.startsWith("--")) throw new Error(`unknown option: ${a}`);
    else opts.symbols.push(a);
  }
  if (opts.fromJson && opts.period) throw new Error("--period only applies to live API calls; saved JSON files are read as they are");
  return opts;
}

export async function main(argv, { env = process.env, fetchImpl = fetch, wait = sleep } = {}) {
  const opts = parseArgs(argv);
  const targets = opts.symbols.length ? opts.symbols : DEFAULT_SYMBOLS;
  const apiKey = env.ZENITH_API_KEY;
  if (!opts.fromJson && !apiKey) throw new Error("環境変数 ZENITH_API_KEY に API キーを入れてください（保存済みの JSON なら --from-json ./data）");

  const results = [];
  for (const [i, symbol] of targets.entries()) {
    if (opts.fromJson) results.push(await loadSaved(symbol, opts.fromJson));
    else {
      if (i > 0) await wait(REQUEST_GAP_MS);
      results.push(await fetchDiversity(symbol, { apiKey: apiKey.trim(), fiscalPeriod: opts.period, fetchImpl }));
    }
  }
  if (opts.sortByGap) printSortedByGap(results);
  else results.forEach(printCompany);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
