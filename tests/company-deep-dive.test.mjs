import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as M from "../templates/company-deep-dive/model.mjs";
import { texts } from "../templates/company-deep-dive/i18n.mjs";

const dir = new URL("../templates/company-deep-dive/", import.meta.url);
const OKU = 1e8;
const yen = (v) => (v === null ? null : Math.round(v * OKU));

// ---- Test fixtures: one bundle in the exact shape server.py fetch_bundle() returns. --------------
function statements(symbol, periods, values) {
  const meta = (fp) => ({ symbol, fiscalPeriod: fp, period: "FY", accountingStandard: "JGAAP", fiscalPeriodDays: 365, updatedAt: null,
    provenance: { source: "edinet", announcedAt: `${fp}-28T06:00:00Z`, docId: null, sourceUrl: null } });
  const v = (key, i) => values[key][i];
  return {
    incomeStatements: periods.map((fp, i) => ({ ...meta(fp), revenue: yen(v("rev", i)), operatingIncome: yen(v("oi", i)), netIncome: yen(v("ni", i) + 0.5),
      netIncomeAttributableToOwners: yen(v("ni", i)), operatingMargin: v("oi", i) / v("rev", i), netMargin: v("ni", i) / v("rev", i) })),
    balanceSheets: periods.map((fp, i) => ({ ...meta(fp), totalAssets: yen(v("ta", i)), ownersEquity: yen(v("eq", i)), equityRatio: v("eq", i) / v("ta", i),
      interestBearingDebt: yen(v("debt", i)), netInterestBearingDebt: yen(v("debt", i) - v("cash", i)), cashAndCashEquivalents: yen(v("cash", i)) })),
    cashFlows: periods.map((fp, i) => {
      const icf = v("capex", i) + v("other", i);
      return { ...meta(fp), operatingCashFlow: yen(v("ocf", i)), investingCashFlow: yen(icf), financingCashFlow: null, capitalExpenditure: yen(v("capex", i)),
        freeCashFlow: yen(v("ocf", i) + icf), dividendsPaid: yen(v("div", i)), purchaseOfTreasuryStock: yen(v("buy", i)), depreciationAndAmortization: null };
    }),
  };
}
function segmentReport(symbol, fiscalPeriod, rows) {
  const metrics = ["net_sales_total", "segment_profit", "capital_expenditure", "depreciation"];
  return { symbol, fiscalPeriod, period: "FY", docTypeCode: "120", submittedAt: null, unitMultiplier: 1e6, note: null, docId: null, sourceUrl: null,
    items: Object.entries(rows).flatMap(([segment, values]) => values.map((value, i) => ({ segment, metric: metrics[i], rawLabel: null, value, periodEnd: null }))
      .filter((item) => item.value !== undefined)) };
}
const forecast = (symbol, fiscalPeriod, period, forecastTarget, announcedAt, rev, oi, ni, forecastFiscalPeriod = null) => ({
  symbol, fiscalPeriod, period, forecastTarget, forecastFiscalPeriod, accountingStandard: "jgaap", announcedAt, source: "edinet",
  revenueForecast: yen(rev), operatingIncomeForecast: yen(oi), netIncomeForecast: yen(ni), epsForecast: null, operatingMarginForecast: null,
  netMarginForecast: null, payoutRatioForecast: null, roeForecast: null, docId: null, sourceUrl: null });
function marchBundle() {
  const s = "1111";
  return {
    symbol: s, retrievedAt: "2026-10-01T00:00:00Z",
    ...statements(s, ["2026-03", "2025-03", "2024-03", "2023-03", "2022-03"], {
      rev: [140, 130, 120, 110, 100], oi: [14, -3, 12, 11, 10], ni: [9, -5, 8, 7, 6], ta: [250, 240, 230, 220, 210], eq: [125, 110, 115, 105, 100],
      debt: [40, 50, 45, 42, 41], cash: [45, 30, 35, 33, 30], ocf: [30, 5, 24, 22, 20], capex: [-12, -6, -10, -9, -8], other: [-3, -1, 2, -1, -1],
      div: [-4, -2, -3, -3, -3], buy: [-2, null, -1, 0, null] }),
    segments: {
      current: segmentReport(s, "2026-03", { Alpha: [9000, 1100, 700, 500], Beta: [5000, 450, 500, 300], 調整額: [undefined, -150, 0, 0], 連結: [14000, 1400, 1200, 800] }),
      previous: segmentReport(s, "2025-03", { Alpha: [8000, -100, 400, 450], Beta: [5000, -150, 200, 250], 調整額: [undefined, -50], 連結: [13000, -300, 600, 700] }),
      previousRequested: "2025-03",
    },
    forecasts: [
      forecast(s, "2026-03", "FY", "next-fiscal-year", "2026-05-10T06:00:00Z", 150, 15, 10, "2027-03"),
      forecast(s, "2025-12", "Q3", "current-fiscal-year", "2026-02-06T06:00:00Z", 139, 14.5, 9),
      forecast(s, "2025-09", "Q2", "current-fiscal-year", "2025-11-10T06:00:00Z", 138, 13.5, 8.5),
      forecast(s, "2025-06", "Q1", "current-fiscal-year", "2025-08-05T06:00:00Z", 135, 13, 8),
      forecast(s, "2025-03", "FY", "next-fiscal-year", "2025-05-10T06:00:00Z", 135, 13, 8, "2026-03"),
      forecast(s, "2024-12", "Q3", "current-fiscal-year", "2025-02-06T06:00:00Z", 125, -2, -6),
      forecast(s, "2024-09", "Q2", "current-fiscal-year", "2024-11-10T06:00:00Z", 126, 6, 2),
      forecast(s, "2024-03", "FY", "next-fiscal-year", "2024-05-10T06:00:00Z", 128, 12, 7, "2025-03"),
    ],
    workforce: { symbol: s, fiscalPeriod: "2026-03", period: "FY", docTypeCode: "120", submittedAt: null, docId: null, sourceUrl: null, employees: 500,
      consolidatedEmployees: 1200, averageAge: 40.5, averageTenureYears: null, averageAnnualSalary: 6000000,
      segments: [{ segment: "Alpha", employees: 800 }, { segment: "Beta", employees: 400 }], parentSegments: [{ segment: "Alpha", employees: 500 }] },
    diversity: { symbol: s, fiscalPeriod: "2026-03", period: "FY", docTypeCode: "120", submittedAt: null, docId: null, sourceUrl: null,
      reportingCompany: { femaleManagerRatio: 0.1, maleChildcareLeaveRatio: 1.2, maleChildcareLeaveBasis: "childcare-leave", wageGapAll: 0.7, wageGapRegular: 0.75, wageGapNonRegular: null },
      subsidiaries: [{ name: "Sub", femaleManagerRatio: null, maleChildcareLeaveRatio: 0.5, maleChildcareLeaveBasis: null, wageGapAll: 0.8, wageGapRegular: null, wageGapNonRegular: null }] },
  };
}
const base = () => M.normalizeBundle(marchBundle());

test("normalization merges statements by fiscal period and keeps nulls", () => {
  const d = base();
  assert.deepEqual(d.years.map((y) => y.fiscalPeriod), ["2022-03", "2023-03", "2024-03", "2025-03", "2026-03"]);
  assert.equal(d.years[0].cf.purchaseOfTreasuryStock, null);
  assert.equal(d.years[3].is.operatingIncome, -3 * OKU);
  const suffixed = marchBundle();
  suffixed.symbol = "1111.T";
  assert.equal(M.normalizeBundle(suffixed).years.length, 5);
});

test("a forecast row without an announcement time is skipped, not guessed", () => {
  const d = marchBundle();
  const before = M.normalizeBundle(structuredClone(d)).forecasts.length;
  d.forecasts.unshift({ ...d.forecasts[0], fiscalPeriod: "2027-03", forecastFiscalPeriod: "2028-03", announcedAt: null });
  assert.equal(M.normalizeBundle(d).forecasts.length, before);
});

test("normalization rejects malformed or mismatched rows", () => {
  const cases = [
    (d) => (d.incomeStatements[0].symbol = "2222"),
    (d) => (d.balanceSheets[0].period = "Q3"),
    (d) => d.cashFlows.push(structuredClone(d.cashFlows[0])),
    (d) => (d.incomeStatements[1].fiscalPeriod = "2025-13"),
    (d) => d.incomeStatements.push({ ...d.incomeStatements[0], fiscalPeriod: "2021-03" }),
    (d) => (d.incomeStatements = null),
    (d) => (d.forecasts[0].symbol = "2222"),
    (d) => (d.forecasts[0].forecastTarget = "two-years-out"),
    (d) => (d.forecasts[0].period = "H1"),
    (d) => (d.forecasts[0].announcedAt = "not a date"),
    (d) => d.forecasts.push({ ...d.forecasts[0], revenueForecast: 1 }),
    (d) => (d.segments.current.symbol = "2222"),
    (d) => (d.segments.current.unitMultiplier = 0),
    (d) => (d.segments.current.items[0].segment = ""),
    (d) => (d.segments.previous.fiscalPeriod = "2024-03"),
    (d) => (d.segments.previousRequested = "2026-03"),
    (d) => (d.segments.previousRequested = null),
    (d) => (d.segments = null),
    (d) => (d.workforce.symbol = "2222"),
    (d) => (d.diversity.fiscalPeriod = "March"),
    (d) => (d.symbol = ""),
  ];
  for (const [index, change] of cases.entries()) {
    const d = marchBundle();
    change(d);
    assert.throws(() => M.normalizeBundle(d), /invalid_response/, `case ${index}`);
  }
});

test("optional reports may be missing; an identical repeated forecast is kept once", () => {
  const d = marchBundle();
  d.workforce = null;
  d.diversity = null;
  d.segments.previous = null;
  d.forecasts.push(structuredClone(d.forecasts[1]));
  const result = M.normalizeBundle(d);
  assert.equal(result.forecasts.length, 8);
  assert.equal(M.segmentComparison(result.segments.current, null).reason, "no_previous");
  const none = M.normalizeBundle({ ...marchBundle(), segments: { current: null, previous: null, previousRequested: null } });
  assert.equal(M.segmentComparison(none.segments.current, none.segments.previous).reason, "no_segments");
});

test("forecast target fiscal year is derived from the row's own period", () => {
  const row = (fiscalPeriod, period, forecastTarget, forecastFiscalPeriod = null) => ({ fiscalPeriod, period, forecastTarget, forecastFiscalPeriod });
  const cases = [
    // March year-end
    [row("2026-03", "FY", "next-fiscal-year"), "2027-03"],
    [row("2026-03", "FY", "current-fiscal-year"), "2026-03"],
    [row("2026-06", "Q1", "current-fiscal-year"), "2027-03"],
    [row("2025-09", "Q2", "current-fiscal-year"), "2026-03"],
    [row("2025-12", "Q3", "current-fiscal-year"), "2026-03"],
    [row("2025-12", "Q3", "next-fiscal-year"), "2027-03"],
    [row("2026-03", "Q4", "current-fiscal-year"), "2026-03"],
    // August year-end (quarters end in November, February and May)
    [row("2025-08", "FY", "next-fiscal-year"), "2026-08"],
    [row("2025-11", "Q1", "current-fiscal-year"), "2026-08"],
    [row("2026-02", "Q2", "current-fiscal-year"), "2026-08"],
    [row("2026-05", "Q3", "current-fiscal-year"), "2026-08"],
    [row("2026-05", "Q3", "next-fiscal-year"), "2027-08"],
    // December year-end
    [row("2025-12", "FY", "next-fiscal-year"), "2026-12"],
    [row("2026-03", "Q1", "current-fiscal-year"), "2026-12"],
    [row("2026-06", "Q2", "current-fiscal-year"), "2026-12"],
    [row("2026-09", "Q3", "next-fiscal-year"), "2027-12"],
    // June and September year-ends
    [row("2025-09", "Q1", "current-fiscal-year"), "2026-06"],
    [row("2025-12", "Q1", "current-fiscal-year"), "2026-09"],
    // An explicit target wins, e.g. after a change of fiscal year-end.
    [row("2026-03", "FY", "next-fiscal-year", "2026-12"), "2026-12"],
  ];
  for (const [input, expected] of cases) assert.equal(M.forecastTargetPeriod(input), expected, JSON.stringify(input));
  for (const bad of [row("2026-13", "Q1", "current-fiscal-year"), row("2026-03", "H1", "current-fiscal-year"), row("2026-03", "FY", "other"), null])
    assert.equal(M.forecastTargetPeriod(bad), null);
  assert.equal(M.addMonths("2025-12", 3), "2026-03");
  assert.equal(M.addMonths("2026-01", -1), "2025-12");
});

test("forecasts are grouped by target year with initial, revisions, direction and achievement", () => {
  const d = base();
  const { groups, skipped } = M.forecastGroups(d.forecasts, d.years);
  assert.equal(skipped, 0);
  assert.deepEqual(groups.map((g) => [g.target, g.entries.length, Boolean(g.actual)]), [["2025-03", 3, true], ["2026-03", 4, true], ["2027-03", 1, false]]);
  const fy26 = groups[1];
  assert.deepEqual(fy26.entries.map((e) => `${e.row.period} ${e.row.fiscalPeriod}`), ["FY 2025-03", "Q1 2025-06", "Q2 2025-09", "Q3 2025-12"]);
  assert.deepEqual(fy26.entries.map((e) => e.directions.operatingIncome), ["initial", "unchanged", "up", "up"]);
  assert.ok(Math.abs(fy26.achievement.operatingIncome - 14 / 14.5) < 1e-12);
  assert.ok(Math.abs(fy26.achievement.revenue - 140 / 139) < 1e-12);
  assert.equal(fy26.overall.operatingIncome, "up");
  assert.equal(fy26.revisions, 3);
  // Downward revisions to a loss forecast: no achievement rate against a negative forecast.
  const fy25 = groups[0];
  assert.deepEqual(fy25.entries.map((e) => e.directions.operatingIncome), ["initial", "down", "down"]);
  assert.equal(fy25.achievement.operatingIncome, null);
  assert.ok(Math.abs(fy25.achievement.revenue - 130 / 125) < 1e-12);
  assert.equal(groups[2].achievement.revenue, null);
  assert.equal(groups[2].overall.revenue, null);
});

test("non-March calendars group quarter rows with the right fiscal year", () => {
  // August year-end: the FY row has no forecastFiscalPeriod, so the target is derived.
  const s = "9999";
  const august = M.forecastGroups([
    forecast(s, "2026-05", "Q3", "current-fiscal-year", "2026-07-10T06:00:00Z", 30, 5, 3),
    forecast(s, "2025-08", "FY", "next-fiscal-year", "2025-10-09T06:00:00Z", 28, 4, 2.5),
    forecast(s, "2026-02", "Q2", "current-fiscal-year", "2026-04-09T06:00:00Z", 29, 4.5, 2.8),
    forecast(s, "2025-11", "Q1", "current-fiscal-year", "2026-01-08T06:00:00Z", 28, 4, 2.5),
    forecast(s, "2024-08", "FY", "next-fiscal-year", "2024-10-10T06:00:00Z", 26, 3.5, 2.2),
  ], [{ fiscalPeriod: "2025-08", is: { revenue: 27 * OKU, operatingIncome: 3.6 * OKU, netIncome: 2.3 * OKU, accountingStandard: "JGAAP" } }]).groups;
  assert.deepEqual(august.map((g) => [g.target, g.entries.map((e) => e.row.period).join(",")]), [["2025-08", "FY"], ["2026-08", "FY,Q1,Q2,Q3"]]);
  assert.ok(Math.abs(august[0].achievement.operatingIncome - 3.6 / 3.5) < 1e-12);
  // December year-end
  const december = M.forecastGroups([
    forecast(s, "2025-12", "FY", "next-fiscal-year", "2026-02-10T06:00:00Z", 10, 1, 0.5),
    forecast(s, "2026-03", "Q1", "current-fiscal-year", "2026-05-10T06:00:00Z", 10, 1.1, 0.6),
    forecast(s, "2026-06", "Q2", "current-fiscal-year", "2026-08-10T06:00:00Z", 11, 1.2, 0.7),
  ], []).groups;
  assert.deepEqual(december.map((g) => [g.target, g.entries.length]), [["2026-12", 3]]);
  assert.deepEqual(december[0].entries.map((e) => e.directions.revenue), ["initial", "unchanged", "up"]);
});

test("rows announced after year-end are listed but never used as the latest forecast", () => {
  const d = base();
  const late = forecast("1111", "2026-03", "FY", "current-fiscal-year", "2026-05-10T06:00:00Z", 141, 14, 9);
  const group = M.forecastGroups([...d.forecasts, late], d.years).groups.find((g) => g.target === "2026-03");
  assert.equal(group.entries.length, 5);
  assert.equal(group.entries.at(-1).late, true);
  assert.equal(group.latest.row.period, "Q3");
  assert.ok(Math.abs(group.achievement.operatingIncome - 14 / 14.5) < 1e-12);
});

test("forecast ordering, skipped rows and accounting-standard mismatch", () => {
  const d = base();
  const odd = { ...d.forecasts[0], period: "H1", forecastFiscalPeriod: null };
  const { groups, skipped } = M.forecastGroups([...d.forecasts].reverse().concat(odd), d.years);
  assert.equal(skipped, 1);
  for (const g of groups) {
    const dates = g.entries.map((e) => Date.parse(e.row.announcedAt));
    assert.deepEqual(dates, [...dates].sort((a, b) => a - b));
  }
  const years = d.years.map((y) => ({ ...y, is: { ...y.is, accountingStandard: "IFRS" } }));
  const mismatch = M.forecastGroups(d.forecasts, years).groups.find((g) => g.target === "2026-03");
  assert.equal(mismatch.standardMismatch, true);
  assert.equal(mismatch.achievement.revenue, null);
  // Case differences are not a mismatch ("jgaap" forecasts vs "JGAAP" statements).
  assert.ok(M.forecastGroups(d.forecasts, d.years).groups.every((g) => !g.standardMismatch));
  assert.equal(M.achievement(50, 0), null);
  assert.equal(M.achievement(null, 10), null);
  assert.equal(M.direction(1, null), null);
});

test("segment changes are computed only when segment names match", () => {
  const d = base();
  const same = M.segmentComparison(d.segments.current, d.segments.previous);
  assert.equal(same.comparable, true);
  assert.deepEqual(same.current.map((r) => r.kind), ["segment", "segment", "adjustment", "total"]);
  const alpha = same.current.find((r) => r.segment === "Alpha");
  assert.equal(alpha.revenue, 9000 * 1e6);
  assert.ok(Math.abs(alpha.revenueChange - 0.125) < 1e-12);
  assert.equal(alpha.profitChange, null); // previous segment profit was a loss
  assert.ok(Math.abs(alpha.marginChange - (1100 / 9000 - -100 / 8000)) < 1e-12);
  assert.equal(same.current.find((r) => r.segment === "Beta").revenueChange, 0);

  const renamed = marchBundle();
  renamed.segments.previous = segmentReport("1111", "2025-03", { Alpha: [8000, 900], Gamma: [5000, 400], 連結: [13000, 1300] });
  const differ = M.normalizeBundle(renamed);
  const result = M.segmentComparison(differ.segments.current, differ.segments.previous);
  assert.equal(result.comparable, false);
  assert.equal(result.reason, "names_differ");
  assert.ok(result.current.every((r) => !("revenueChange" in r)));
  assert.deepEqual(M.segmentNames(result.previous), ["Alpha", "Gamma"]);
});

test("segment rows classify totals/adjustments and blank out conflicting duplicates", () => {
  for (const [name, kind] of [["連結", "total"], ["計", "total"], ["合計", "total"], ["連結財務諸表計上額", "total"],
    ["消去又は全社", "adjustment"], ["調整額", "adjustment"], ["全社（共通）", "adjustment"], ["自動車", "segment"], ["その他", "segment"]])
    assert.equal(M.segmentKind(name), kind, name);
  const report = { unitMultiplier: 1000, items: [
    { segment: "X", metric: "net_sales_total", value: 10 }, { segment: "X", metric: "net_sales_total", value: 12 },
    { segment: "X", metric: "segment_profit", value: 2 }, { segment: "Y", metric: "net_sales_total", value: 0 },
    { segment: "Y", metric: "segment_profit", value: 1 }, { segment: "Z", metric: "unknown_metric", value: 5 },
    { segment: "W", metric: "segment_profit", value: null }, { segment: "V", metric: "net_sales_total", value: 4 },
    { segment: "V", metric: "net_sales_total", value: 4 }] };
  const rows = M.segmentRows(report);
  const x = rows.find((r) => r.segment === "X");
  assert.equal(x.revenue, null);
  assert.equal(x.conflict, true);
  assert.equal(x.profit, 2000);
  assert.equal(x.margin, null);
  assert.equal(rows.find((r) => r.segment === "V").revenue, 4000);
  assert.equal(rows.find((r) => r.segment === "Y").margin, null);
  assert.equal(rows.find((r) => r.segment === "W").profit, null);
  assert.ok(!rows.some((r) => r.segment === "Z"));
});

test("cash allocation math keeps signs and breaks the chain on unknown values", () => {
  const d = base();
  const latest = M.cashAllocation(d.years.at(-1));
  assert.equal(latest.fcf, 15 * OKU);
  assert.equal(latest.otherInvesting, -3 * OKU);
  assert.equal(latest.afterDividends, 11 * OKU);
  assert.equal(latest.afterReturns, 9 * OKU);
  assert.equal(latest.shareholderReturns, 6 * OKU);
  assert.ok(Math.abs(latest.payoutOfFcf - 6 / 15) < 1e-12);
  assert.equal(latest.netDebt, -5 * OKU);
  assert.ok(Math.abs(latest.equityRatio - 0.5) < 1e-12);
  const capexStep = latest.steps.find((s) => s.key === "capitalExpenditure");
  assert.deepEqual([capexStep.from, capexStep.to], [30 * OKU, 18 * OKU]);
  assert.equal(latest.steps.at(-1).to, 9 * OKU);

  // Unknown buybacks: shareholder returns and the remainder stay unknown (never treated as 0).
  const loss = M.cashAllocation(d.years[3]);
  assert.equal(loss.buybacks, null);
  assert.equal(loss.shareholderReturns, null);
  assert.equal(loss.afterReturns, null);
  assert.equal(loss.steps.find((s) => s.key === "purchaseOfTreasuryStock").to, null);
  assert.equal(M.cashAllocation(d.years[1]).shareholderReturns, 3 * OKU); // a real 0 buyback is kept

  // Missing capex falls back to investing CF as one step; FCF falls back to OCF + ICF.
  const year = { fiscalPeriod: "2026-03", cf: { operatingCashFlow: 100, investingCashFlow: -40, capitalExpenditure: null, freeCashFlow: null, dividendsPaid: -10, purchaseOfTreasuryStock: 0 }, bs: null };
  const fallback = M.cashAllocation(year);
  assert.deepEqual(fallback.steps.map((s) => s.key), ["operatingCashFlow", "investingCashFlow", "freeCashFlow", "dividendsPaid", "purchaseOfTreasuryStock", "afterReturns"]);
  assert.equal(fallback.fcf, 60);
  assert.equal(fallback.afterReturns, 50);
  assert.equal(fallback.equityRatio, null);
  assert.equal(M.cashAllocation({ cf: { operatingCashFlow: 10 } }).fcf, null);
});

test("people summary keeps missing values as null", () => {
  const d = base();
  const p = M.peopleSummary(d.workforce, d.diversity);
  assert.equal(p.averageTenureYears, null);
  assert.deepEqual(p.bySegment, [{ segment: "Alpha", consolidated: 800, parent: 500 }, { segment: "Beta", consolidated: 400, parent: null }]);
  assert.equal(p.diversity.maleChildcareLeaveRatio, 1.2);
  assert.equal(p.diversity.wageGapNonRegular, null);
  assert.equal(p.subsidiaries[0].femaleManagerRatio, null);
  const none = M.peopleSummary(null, null);
  assert.equal(none.employees, null);
  assert.deepEqual(none.bySegment, []);
  assert.deepEqual(none.subsidiaries, []);
});

test("CSV escapes quotes, separators and spreadsheet formulas but keeps numbers numeric", () => {
  assert.equal(M.csvText([["a", "b,c", 'say "hi"', "line\nbreak"]]), 'a,"b,c","say ""hi""","line\nbreak"');
  for (const value of ["=SUM(A1)", "+1", "-1", "@cmd", "\tx"]) assert.ok(M.csvCell(value).startsWith(`"'`), value);
  assert.equal(M.csvCell(-12.5), "-12.5");
  assert.equal(M.csvCell(null), "");
  assert.equal(M.csvCell(NaN), "");
  assert.equal(M.csvCell(0), "0");
});

test("only EDINET pages are linkable", () => {
  assert.ok(M.edinetUrl("https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?S100TEST"));
  for (const bad of ["http://disclosure2.edinet-fsa.go.jp/x", "https://api.zenithcode.net/stable/filing-document?docId=1", "https://www.release.tdnet.info/x.pdf",
    "https://edinet-fsa.go.jp.example.com/", "javascript:alert(1)", null, ""])
    assert.equal(M.edinetUrl(bad), null, String(bad));
});

test("formatting shows missing as — and keeps real zero", () => {
  for (const v of [null, undefined, NaN, Infinity, "1"]) {
    assert.equal(M.oku(v), "—");
    assert.equal(M.percent(v), "—");
    assert.equal(M.points(v), "—");
    assert.equal(M.count(v), "—");
  }
  assert.equal(M.oku(0, "en"), "0.0");
  assert.equal(M.oku(1234.5 * OKU, "en"), "1,234.5");
  assert.equal(M.percent(0.125, "en"), "12.5%");
  assert.equal(M.points(0.004, "en"), "+0.4 pp");
  assert.equal(M.growth(10, 0), null);
  assert.equal(M.growth(10, -5), null);
  const axis = M.chartAxis([-36 * OKU, 98 * OKU]);
  assert.ok(axis.ticks.includes(0) && axis.min <= -36 * OKU && axis.max >= 98 * OKU);
});

test("saved demo.json is a list of bundles that normalize and carry no prices or TDnet links", () => {
  const demo = JSON.parse(fs.readFileSync(new URL("demo.json", dir), "utf8"));
  assert.equal(typeof demo.placeholder, "boolean");
  assert.ok(Array.isArray(demo.bundles) && demo.bundles.length >= 1);
  const banned = /^(price|marketCap|per|pbr|psr|evToEbitda|dividendYield|perForecast|psrForecast|pegRatioForecast|archiveUrl|changePct.*|closePrice|.*GrowthVsActual)$/;
  const walk = (value) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value && typeof value === "object") for (const [key, inner] of Object.entries(value)) { assert.doesNotMatch(key, banned, key); walk(inner); }
    if (typeof value === "string" && /^https?:/.test(value)) assert.ok(M.edinetUrl(value), value);
  };
  walk(demo);
  for (const bundle of demo.bundles) {
    assert.ok(typeof bundle.retrievedAt === "string" && !Number.isNaN(Date.parse(bundle.retrievedAt)));
    const d = M.normalizeBundle(bundle);
    for (const row of d.forecasts) if (row.source === "tdnet") assert.equal(row.docId ?? null, null);
  }
});

test("every interface text exists in both languages and avoids restricted wording", () => {
  assert.deepEqual(Object.keys(texts.ja).sort(), Object.keys(texts.en).sort());
  const app = fs.readFileSync(new URL("app.mjs", dir), "utf8");
  const html = fs.readFileSync(new URL("index.html", dir), "utf8");
  const used = new Set([...app.matchAll(/\b(?:t|fill|legendItem)\("([A-Za-z]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) used.add(m[1]);
  for (const prefix of ["view_", "viewShort_", "nav_", "lead_", "eyebrow_"])
    for (const id of ["segments", "cash", "plan", "people"]) used.add(prefix + id);
  for (const key of ["badge_demo", "badge_placeholder", "badge_live", "demoNotice", "placeholderNotice", "liveNotice", "livePrompt"]) used.add(key);
  for (const key of used) {
    assert.ok(key in texts.ja, `ja missing ${key}`);
    assert.ok(key in texts.en, `en missing ${key}`);
  }
  const readme = fs.readFileSync(new URL("README.ja.md", dir), "utf8");
  for (const text of [JSON.stringify(texts.ja), readme]) assert.ok(!text.includes("投資・金融サービス"));
});
