import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  normalizePeers, normalizeCompany, normalizeComparison, normalizeBenchmark, companyMetrics, roe, roa,
  revenueCagr3y, segmentMix, domain, barGeometry, niceAxis, oku, percent, salary, csvCell, comparisonCsv, edinetUrl,
} from "../templates/peer-benchmark/model.mjs";

const demo = JSON.parse(fs.readFileSync(new URL("../templates/peer-benchmark/demo.json", import.meta.url), "utf8"));

// Test fixtures are independent of demo.json, which may be replaced by a saved real snapshot.
const OKU = 1e8;
function fixture(symbol, { revenue = [100, 110, 120, 130], op = [10, 11, -2, 13], std = "jgaap", month = "03",
  segments = [["A", 60], ["B", 40]], people = true } = {}) {
  const meta = (i) => ({ symbol, fiscalPeriod: `${2023 + i}-${month}`, period: "FY", accountingStandard: std,
    fiscalPeriodDays: 365, provenance: { source: "edinet", docId: `T${i}`, sourceUrl: "https://disclosure2.edinet-fsa.go.jp/x" } });
  const income = revenue.map((r, i) => ({ ...meta(i), revenue: r * OKU, operatingIncome: op[i] * OKU, netIncome: 6 * OKU,
    netIncomeAttributableToOwners: 5 * OKU, operatingMargin: op[i] / r, netMargin: 5 / r })).reverse();
  const filing = { symbol, fiscalPeriod: `2026-${month}`, period: "FY", docId: "T3" };
  return {
    symbol, income,
    balance: [{ ...meta(3), totalAssets: 200 * OKU, ownersEquity: 50 * OKU, equityRatio: 0.25, netInterestBearingDebt: -3 * OKU }],
    cashFlow: [{ ...meta(3), operatingCashFlow: 9 * OKU, capitalExpenditure: null, freeCashFlow: 4 * OKU }],
    segments: segments ? [{ ...filing, unitMultiplier: 1e6, items: segments.map(([segment, value]) =>
      ({ segment, metric: "net_sales_total", rawLabel: "外部顧客への売上高", value })) }] : [],
    workforce: people ? [{ ...filing, employees: 10, consolidatedEmployees: 30, averageAge: 40, averageTenureYears: 10, averageAnnualSalary: 6e6 }] : [],
    diversity: people ? [{ ...filing, reportingCompany: { femaleManagerRatio: 0.1, maleChildcareLeaveRatio: 1.2,
      maleChildcareLeaveBasis: "childcare-leave-and-purpose-leave", wageGapAll: 0.7 } }] : [],
  };
}
const bundle = {
  retrievedAt: "2026-10-27T00:00:00Z",
  benchmark: { sector: "3700", sectorJa: "業種", count: 9, roeQ1: 0.02, roeMedian: 0.05, roeQ3: 0.09, roeCount: 9,
    roaQ1: 0.01, roaMedian: 0.03, roaQ3: 0.02, revenueCagr3yQ1: null, revenueCagr3yMedian: 0.01, revenueCagr3yQ3: 0.02 },
  companies: [fixture("1111"), fixture("2222", { std: "ifrs", month: "12", segments: null }), fixture("3333", { people: false })],
};
const symbols = ["1111", "2222", "3333"];
const company = () => structuredClone(bundle.companies[0]);

test("a bundle normalizes, keeping losses, missing people data and missing segments", () => {
  const { companies, benchmark } = normalizeComparison(bundle, symbols, "3700");
  assert.deepEqual(companies[0].years.map((y) => y.fiscalPeriod), ["2023-03", "2024-03", "2025-03", "2026-03"]);
  assert.equal(companies[0].years[2].operatingIncome, -2 * OKU);
  const rows = companies.map(companyMetrics);
  assert.equal(rows[0].roe, 0.1);
  assert.equal(rows[0].capitalExpenditure, null);
  assert.equal(rows[2].employees, null);
  assert.equal(rows[2].femaleManagerRatio, null);
  assert.equal(segmentMix(companies[1].segments), null);
  // Quartiles that are incomplete or out of order draw no band.
  assert.deepEqual(benchmark.roe, { q1: 0.02, median: 0.05, q3: 0.09, count: 9 });
  assert.equal(benchmark.roa, null);
  assert.equal(benchmark.revenueCagr3y, null);
  assert.equal(normalizeComparison(bundle, symbols, null).benchmark, null);
});

test("demo.json has the live bundle shape, no price-derived fields and only EDINET links", () => {
  const demoSymbols = demo.comparison.companies.map((c) => c.symbol);
  assert.ok(demoSymbols.length >= 2 && demoSymbols.length <= 6);
  assert.equal(demo.peers.target.symbol, demoSymbols[0]);
  const { companies } = normalizeComparison(demo.comparison, demoSymbols, demo.comparison.benchmark?.sector ?? null);
  for (const c of companies) companyMetrics(c);
  normalizePeers(demo.peers, demoSymbols[0]);
  const banned = /^(price|marketCap\w*|per|perForecast|pbr|psr|evToEbitda|dividendYield|changePct\w*|archiveUrl|sectorCount)$/;
  const walk = (value) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { assert.ok(!banned.test(k), k); walk(v); }
    else if (typeof value === "string" && /^[a-z]+:/i.test(value)) assert.ok(edinetUrl(value), value);
  };
  walk(demo);
});

test("malformed or mismatched rows are rejected instead of shown", () => {
  for (const change of [
    (c) => (c.income[0].period = "Q3"),
    (c) => (c.income[0].symbol = "OTHER"),
    (c) => (c.income[0].fiscalPeriod = "2026-13"),
    (c) => c.income.push(c.income[0]),
    (c) => c.income.push({ ...c.income[0], fiscalPeriod: "2022-03" }),
    (c) => c.balance.push({ ...c.balance[0], fiscalPeriod: "2025-03" }),
    (c) => (c.cashFlow[0].symbol = "OTHER"),
    (c) => (c.segments[0].symbol = "OTHER"),
    (c) => (c.segments[0].items = null),
    (c) => (c.workforce[0].symbol = "OTHER"),
    (c) => (c.diversity = "x"),
  ]) {
    const c = company();
    change(c);
    assert.throws(() => normalizeCompany(c));
  }
  // The response must hold exactly the requested companies in order.
  assert.throws(() => normalizeComparison(bundle, symbols.slice(0, 2), "3700"));
  assert.throws(() => normalizeComparison(bundle, [...symbols].reverse(), "3700"));
  assert.throws(() => normalizeBenchmark({ sector: "3700" }, "9999"));
});

test("peer suggestions keep names and codes only and never repeat the target", () => {
  const result = normalizePeers({ target: { symbol: "7203", nameJa: "A", sector: "3700", price: 1 },
    peers: [{ symbol: "7203.T" }, { symbol: "7267", nameEn: "B", marketCap: 9 }, { symbol: "7267" }] }, "7203");
  assert.deepEqual(result.peers, [{ symbol: "7267", nameJa: null, nameEn: "B" }]);
  assert.equal(result.target.sector, "3700");
  assert.equal("price" in result.target, false);
  assert.throws(() => normalizePeers({ target: { symbol: "9999" }, peers: [] }, "7203"));
});

test("ROE and ROA use period-end values and give no ratio for missing or non-positive bases", () => {
  const income = { fiscalPeriod: "2026-03", netIncome: 120, netIncomeAttributableToOwners: 100 };
  const balance = { fiscalPeriod: "2026-03", ownersEquity: 1000, totalAssets: 4000 };
  assert.equal(roe(income, balance), 0.1);
  assert.equal(roa(income, balance), 0.03);
  assert.equal(roe(income, { ...balance, ownersEquity: null, shareholdersEquity: 500 }), 0.2);
  for (const patch of [{ ownersEquity: 0 }, { ownersEquity: -10 }, { ownersEquity: null }, { fiscalPeriod: "2025-03" }])
    assert.equal(roe(income, { ...balance, ...patch }), null);
  for (const patch of [{ totalAssets: 0 }, { totalAssets: -1 }, { totalAssets: null }])
    assert.equal(roa(income, { ...balance, ...patch }), null);
  assert.equal(roe({ ...income, netIncomeAttributableToOwners: null }, balance), null);
  assert.equal(roe({ ...income, netIncomeAttributableToOwners: -50 }, balance), -0.05);
  assert.equal(roe(null, balance), null);
});

test("three-year CAGR needs four consecutive ordinary years on one basis", () => {
  const years = normalizeCompany(company()).years;
  assert.ok(Math.abs(revenueCagr3y(years) - ((130 / 100) ** (1 / 3) - 1)) < 1e-12);
  assert.equal(revenueCagr3y(years.slice(1)), null);
  const variant = (i, patch) => years.map((y, k) => (k === i ? { ...y, ...patch } : y));
  for (const [i, patch] of [[0, { revenue: 0 }], [0, { revenue: -5 }], [0, { revenue: null }], [3, { revenue: null }],
    [3, { accountingStandard: "ifrs" }], [1, { fiscalPeriodDays: 270 }], [0, { fiscalPeriod: "2022-03" }], [2, { fiscalPeriod: "2025-12" }]])
    assert.equal(revenueCagr3y(variant(i, patch)), null);
});

test("segment shares exclude totals and eliminations and never mix bases", () => {
  const mix = segmentMix({ fiscalPeriod: "2026-03", unitMultiplier: 1e6, items: [
    { segment: "A", metric: "net_sales_intersegment", rawLabel: "セグメント間", value: 5 },
    { segment: "日本", metric: "net_sales_total", rawLabel: "所在地間の営業収益", value: 900 },
    { segment: "A", metric: "net_sales_total", rawLabel: "外部顧客への売上高", value: 60 },
    { segment: "B", metric: "net_sales_total", rawLabel: "外部顧客への売上高", value: 40 },
    { segment: "その他", metric: "net_sales_total", rawLabel: "外部顧客への売上高", value: null },
    { segment: "連結", metric: "net_sales_total", rawLabel: "外部顧客への売上高", value: 100 },
    { segment: "消去又は全社", metric: "net_sales_total", rawLabel: "外部顧客への売上高", value: -3 },
    { segment: "C", metric: "net_sales_total", rawLabel: "売上収益（所在地別）", value: 999 },
  ] });
  assert.equal(mix.basis, "外部顧客への売上高");
  assert.deepEqual(mix.items.map((i) => [i.segment, i.share]), [["A", 0.6], ["B", 0.4]]);
  assert.equal(mix.total, 100e6);
  assert.equal(segmentMix(null), null);
  assert.equal(segmentMix({ items: [] }), null);
  assert.equal(segmentMix({ items: [{ segment: "A", metric: "net_sales_total", rawLabel: "x", value: -1 }] }), null);
  assert.equal(segmentMix({ items: [{ segment: "計", metric: "net_sales_total", rawLabel: "x", value: 10 }] }), null);
});

test("bars share a zero baseline and missing values draw nothing", () => {
  const scale = domain([-0.05, 0.1, null]);
  assert.deepEqual(scale, { min: -0.05, max: 0.1 });
  const neg = barGeometry(-0.05, scale), pos = barGeometry(0.1, scale);
  assert.ok(neg.negative && Math.abs(neg.left) < 1e-9 && Math.abs(neg.width - 100 / 3) < 1e-9);
  assert.ok(Math.abs(pos.left - neg.zero) < 1e-9 && Math.abs(pos.left + pos.width - 100) < 1e-9);
  assert.equal(barGeometry(null, scale), null);
  assert.deepEqual(domain([null]), { min: 0, max: 1 });
  const axis = niceAxis([0.021, 0.057, -0.011]);
  assert.ok(axis.ticks.includes(0) && axis.min <= -0.011 && axis.max >= 0.057);
});

test("formats keep missing as a dash and actual zero as zero", () => {
  for (const v of [null, undefined, NaN, Infinity, "1"]) {
    assert.equal(oku(v), "—");
    assert.equal(percent(v), "—");
    assert.equal(salary(v), "—");
  }
  assert.equal(oku(0), "0");
  assert.equal(oku(150_600_000_000, "en"), "1,506");
  assert.equal(percent(0.125, "en"), "12.5%");
  assert.equal(salary(7_420_000, "ja"), "742");
  assert.equal(salary(7_420_000, "en"), "7.42");
});

test("CSV quotes every cell, guards formula prefixes and leaves missing values blank", () => {
  assert.equal(csvCell('a"b'), '"a""b"');
  for (const s of ["=1+1", "+cmd", "-2", "@SUM(A1)", "\tx", "\rx"]) assert.equal(csvCell(s), `"'${s}"`);
  assert.equal(csvCell(-0.25), '"-0.25"');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(NaN), '""');
  const { companies, benchmark } = normalizeComparison(bundle, symbols, "3700");
  const rows = companies.map((c, i) => ({ ...companyMetrics(c), name: "=Name", role: i ? "peer" : "self" }));
  const csv = comparisonCsv(rows, benchmark);
  const lines = csv.trim().split("\r\n");
  assert.ok(csv.startsWith("﻿"));
  assert.equal(lines.length, 1 + 3 + 3);
  assert.ok(lines[1].includes(`"'=Name"`));
  assert.ok(lines.at(-1).startsWith('"sector-3700"'));
  assert.ok(!/price|marketCap|per"|pbr/i.test(lines[0]));
});

test("only EDINET https links survive", () => {
  assert.equal(edinetUrl("https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?S100XXXX"), "https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?S100XXXX");
  for (const url of ["http://disclosure2.edinet-fsa.go.jp/x", "https://www.release.tdnet.info/x.pdf", "https://edinet-fsa.go.jp.evil.example/",
    "javascript:alert(1)", null, "not a url"]) assert.equal(edinetUrl(url), null);
});
