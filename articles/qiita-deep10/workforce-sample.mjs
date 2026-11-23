// workforce-sample.mjs (Node.js 18+, no dependencies)
// Code for the Qiita article "ZENITH Code Deep Dive #10" (Japanese): headcount of the reporting company
// (提出会社) vs. the consolidated group, consolidated headcount by segment, and average age / tenure / salary.
//
//   node workforce-sample.mjs --from-json ./data                  # saved responses, no network, no API key
//   node workforce-sample.mjs --from-json ./data --sort-by-share  # the "small change" in the article
//   ZENITH_API_KEY=... node workforce-sample.mjs --period 2026-03 [symbol ...]   # live API, 1 request per company
//
// Output labels are in Japanese because the article's output is.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = "https://api.zenithcode.net/stable";
const DEFAULT_SYMBOLS = ["6501", "6503", "6702", "6701", "6758"];
const REQUEST_GAP_MS = 6500; // stays under the Free plan's 10 requests per minute
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const jstDate = (iso) => (iso ? new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 10) : "—");
const fmtInt = (v, unit = "") => (v === null ? "—" : `${v.toLocaleString("en-US")}${unit}`);
const fmtNum = (v, unit = "") => (v === null ? "—" : `${v}${unit}`);
const pct = (x, forceCheck = false) =>
  x === null || x === undefined ? "—" : forceCheck || x > 1 ? "原文を確認" : `${(x * 100).toFixed(1)}%`;

// ---- fetching -------------------------------------------------------------------------------------
// HTTP 404 and "200 with an empty array" are different situations; null fields are handled later, per field.
export function classify(body) {
  if (body && !Array.isArray(body) && body.error === "not_found") return "http_404";
  const report = Array.isArray(body) ? body[0] : body;
  return report ? "ok" : "empty_rows";
}

export async function fetchWorkforce(symbol, { apiKey, fiscalPeriod, fetchImpl = fetch } = {}) {
  const params = fiscalPeriod ? { symbol, fiscalPeriod } : { symbol, limit: 1 }; // no period: the latest filing only
  const url = `${BASE_URL}/workforce?${new URLSearchParams(params)}`;
  const res = await fetchImpl(url, { headers: { "x-api-key": apiKey, Accept: "application/json" } });
  if (res.status === 404) return { symbol, status: "http_404", report: null };
  if (!res.ok) throw new Error(`/workforce ${res.status}`);
  const body = await res.json();
  const status = classify(body);
  return { symbol, status, report: status === "ok" ? (Array.isArray(body) ? body[0] : body) : null };
}

export async function loadSaved(symbol, dir) {
  const body = JSON.parse(await readFile(join(dir, `workforce_${symbol}.json`), "utf8"));
  const status = classify(body);
  return { symbol, status, report: status === "ok" ? (Array.isArray(body) ? body[0] : body) : null };
}

// ---- segments -------------------------------------------------------------------------------------
// Consolidated headcount by segment. Subtotal rows are left out of the sum; partial sums and sums above
// the total are reported as such instead of being shown as if they matched.
export function segmentBreakdown(rows, total) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { status: "empty", items: [], sum: null, diff: null, top: null, sumExceedsTotal: false };
  }
  // 小計行を除き、部分和では差・最大区分を "—"。和が総数を超える場合も各行を "原文を確認"
  const detail = rows.filter((s) => !s.isSubtotal);
  if (detail.length === 0) {
    return { status: "subtotal_only", items: [], sum: null, diff: null, top: null, sumExceedsTotal: false };
  }
  const numeric = detail.filter((s) => typeof s.employees === "number" && Number.isFinite(s.employees));
  if (numeric.length === 0) {
    return { status: "no_numeric_rows", items: [], sum: null, diff: null, top: null, sumExceedsTotal: false };
  }
  const partial = numeric.length < detail.length;
  const sum = numeric.reduce((a, s) => a + s.employees, 0);
  const sumExceedsTotal = total !== null && total > 0 && sum > total;
  const items = detail.map((s) => {
    const employees = num(s.employees);
    return {
      name: s.segment,
      employees,
      share: employees !== null && total !== null && total > 0 ? employees / total : null,
    };
  });
  const top = !partial ? [...items].sort((a, b) => b.employees - a.employees)[0] ?? null : null;
  return {
    status: partial ? "partial" : "complete",
    items,
    sum,
    diff: !partial && total !== null ? sum - total : null,
    top,
    sumExceedsTotal,
  };
}

export function segmentLabel(seg) {
  const ex = seg.sumExceedsTotal ? "・原文を確認" : "";
  if (seg.status === "complete") return `和 ${fmtInt(seg.sum)}（差 ${seg.diff ?? "—"}${ex}）`;
  if (seg.status === "partial") return `部分和 ${fmtInt(seg.sum)}（差 —${ex}）`;
  if (seg.status === "empty") return "区分なし（空配列）";
  if (seg.status === "subtotal_only") return "小計行のみ（和 —）";
  return "数値の無い行のみ（和 —）";
}

// ---- one company ----------------------------------------------------------------------------------
// employees / averageAge / averageTenureYears / averageAnnualSalary are the reporting company (single entity),
// not the group. Any of them can be null; null is shown as "—", never as 0.
export function summarize(report) {
  const p = num(report.employees);
  const c = num(report.consolidatedEmployees);
  const share = p !== null && c !== null && c > 0 ? p / c : null;
  return {
    symbol: report.symbol ?? "—",
    docId: report.docId ?? "—",
    fiscalPeriod: report.fiscalPeriod ?? "—",
    date: jstDate(report.submittedAt),
    p,
    c,
    outside: p !== null && c !== null && p <= c ? c - p : null,
    share,
    underFivePct: share !== null && share < 0.05, // the article's own display threshold, not an API or legal one
    age: num(report.averageAge),
    tenure: num(report.averageTenureYears),
    salary: num(report.averageAnnualSalary),
    segments: segmentBreakdown(report.segments, c),
    hasParentSegmentRows: Array.isArray(report.parentSegments) && report.parentSegments.length > 0,
  };
}

function printCompany(result) {
  if (result.status !== "ok") {
    console.log(`${result.symbol} このAPIで該当する従業員の情報を取得できなかった（${result.status}）`);
    return;
  }
  const s = summarize(result.report);
  const seg = s.segments;
  const top = seg.top
    ? `${seg.top.name} ${fmtInt(seg.top.employees, "人")}（${pct(seg.top.share, seg.sumExceedsTotal)}）`
    : "—";
  const noParent = s.hasParentSegmentRows ? "" : " ※APIの応答に提出会社の区分の行なし";
  const note = s.underFivePct ? " ※提出会社は連結の5%未満" : "";
  console.log(
    `${s.symbol} ${s.docId} ${s.fiscalPeriod} ${s.date} | 提出会社 ${fmtInt(s.p, "人")} / 連結 ${fmtInt(s.c, "人")} / 差 ${fmtInt(s.outside, "人")}（提出会社 ${pct(s.share)}）`
  );
  console.log(`  連結事業別: ${segmentLabel(seg)} / 最大区分: ${top}${noParent}`);
  console.log(`  提出会社属性: 年齢 ${fmtNum(s.age, "歳")} / 勤続 ${fmtNum(s.tenure, "年")} / 給与 ${fmtInt(s.salary, "円")}${note}`);
}

// Display-only change (--sort-by-share): same numbers, one line per company.
function printSortedByShare(results) {
  // 変更後: 提出会社の割合の降順に並べ、5%未満の前に区切り線を入れて出力
  const rows = results.filter((r) => r.status === "ok").map((r) => summarize(r.report))
    .sort((a, b) => (b.share ?? -1) - (a.share ?? -1));
  let separated = false;
  for (const s of rows) {
    if (s.underFivePct && !separated) { console.log("---"); separated = true; }
    const note = s.underFivePct ? " ※提出会社は連結の5%未満" : "";
    console.log(`${s.symbol} | 提出会社 ${fmtInt(s.p, "人")}（${pct(s.share)}） | 年齢 ${fmtNum(s.age, "歳")} / 勤続 ${fmtNum(s.tenure, "年")} / 給与 ${fmtInt(s.salary, "円")}${note}`);
  }
  for (const r of results.filter((x) => x.status !== "ok")) {
    console.log(`${r.symbol} このAPIで該当する従業員の情報を取得できなかった（${r.status}）`);
  }
}

// ---- command line ---------------------------------------------------------------------------------
export function parseArgs(argv) {
  const opts = { fromJson: null, period: null, sortByShare: false, symbols: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from-json" || a === "--period") {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) throw new Error(`${a} needs a value`);
      if (a === "--from-json") opts.fromJson = value; else opts.period = value;
    } else if (a === "--sort-by-share") opts.sortByShare = true;
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
      results.push(await fetchWorkforce(symbol, { apiKey: apiKey.trim(), fiscalPeriod: opts.period, fetchImpl }));
    }
  }
  if (opts.sortByShare) printSortedByShare(results);
  else results.forEach(printCompany);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
