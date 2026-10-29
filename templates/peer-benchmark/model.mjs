// Shared by the browser and offline Node tests. Amounts stay in JPY; ratios stay fractions.
export const MAX_COMPANIES = 6;
export const SYMBOL = /^[0-9A-Z]{4,5}(?:\.T)?$/;
export const DEMO_SYMBOL = /^DEMO-[A-Z]$/;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

export const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
export const plainSymbol = (value) => String(value ?? "").replace(/\.T$/, "");
export const sameSymbol = (a, b) =>
  typeof a === "string" && typeof b === "string" && plainSymbol(a) === plainSymbol(b);
const fail = () => {
  throw new Error("invalid_response");
};
const latestFirst = (a, b) => b.fiscalPeriod.localeCompare(a.fiscalPeriod);

// Suggestions are names and codes only. Anything else in a row is ignored.
export function normalizePeers(result, symbol) {
  const target = result?.target;
  if (!target || !sameSymbol(target.symbol, symbol) || !Array.isArray(result.peers)) fail();
  const seen = new Set([plainSymbol(symbol)]);
  const peers = [];
  for (const row of result.peers) {
    if (!row || typeof row.symbol !== "string") fail();
    if (seen.has(plainSymbol(row.symbol))) continue;
    seen.add(plainSymbol(row.symbol));
    peers.push(pickName(row));
  }
  return {
    target: { ...pickName(target), sector: typeof target.sector === "string" ? target.sector : null },
    peers: peers.slice(0, MAX_COMPANIES - 1),
  };
}
const pickName = (row) => ({
  symbol: row.symbol,
  nameJa: typeof row.nameJa === "string" ? row.nameJa : null,
  nameEn: typeof row.nameEn === "string" ? row.nameEn : null,
});

function annualRows(rows, symbol, limit) {
  if (!Array.isArray(rows) || rows.length > limit) fail();
  const seen = new Set();
  return rows
    .map((row) => {
      if (!row || row.period !== "FY" || !PERIOD.test(row.fiscalPeriod) ||
          !sameSymbol(row.symbol, symbol) || seen.has(row.fiscalPeriod)) fail();
      seen.add(row.fiscalPeriod);
      return row;
    })
    .sort((a, b) => a.fiscalPeriod.localeCompare(b.fiscalPeriod));
}

// Filing-based endpoints may hold several periods; keep the latest full year.
function latestFiling(rows, symbol) {
  if (!Array.isArray(rows) || rows.length > 12) fail();
  for (const row of rows)
    if (!row || !sameSymbol(row.symbol, symbol) || !PERIOD.test(row.fiscalPeriod)) fail();
  return rows.filter((row) => row.period === "FY").sort(latestFirst)[0] ?? null;
}

export function normalizeCompany(raw) {
  if (!raw || typeof raw.symbol !== "string") fail();
  const symbol = raw.symbol;
  const years = annualRows(raw.income, symbol, 4);
  const [balance = null] = annualRows(raw.balance, symbol, 1);
  const [cashFlow = null] = annualRows(raw.cashFlow, symbol, 1);
  const segments = latestFiling(raw.segments, symbol);
  if (segments && !Array.isArray(segments.items)) fail();
  return {
    symbol,
    years,
    balance,
    cashFlow,
    segments,
    workforce: latestFiling(raw.workforce, symbol),
    diversity: latestFiling(raw.diversity, symbol),
  };
}

const BENCHMARK_METRICS = ["roe", "roa", "revenueCagr3y"];
export function normalizeBenchmark(row, sector) {
  if (!row) return null;
  if (row.sector !== sector) fail();
  const out = { sector: row.sector, sectorJa: row.sectorJa ?? null, sectorEn: row.sectorEn ?? null,
    count: finite(row.count) };
  for (const metric of BENCHMARK_METRICS) {
    const q1 = finite(row[metric + "Q1"]), median = finite(row[metric + "Median"]), q3 = finite(row[metric + "Q3"]);
    // A band is drawn only when the quartiles are complete and ordered.
    out[metric] = q1 !== null && median !== null && q3 !== null && q1 <= median && median <= q3
      ? { q1, median, q3, count: finite(row[metric + "Count"]) } : null;
  }
  return out;
}

// The response must contain exactly the requested companies, in order.
export function normalizeComparison(result, symbols, sector) {
  if (!result || !Array.isArray(result.companies) || result.companies.length !== symbols.length) fail();
  const companies = result.companies.map((company, i) => {
    if (!sameSymbol(company?.symbol, symbols[i])) fail();
    return normalizeCompany(company);
  });
  return { companies, benchmark: sector ? normalizeBenchmark(result.benchmark, sector) : null,
    retrievedAt: typeof result.retrievedAt === "string" ? result.retrievedAt : null };
}

const latestYear = (company) => company.years.at(-1) ?? null;
const samePeriod = (a, b) => Boolean(a && b && a.fiscalPeriod === b.fiscalPeriod);

// Period-end values, not averages. Zero or negative denominators give no ratio.
export function roe(income, balance) {
  if (!samePeriod(income, balance)) return null;
  const top = finite(income.netIncomeAttributableToOwners);
  const equity = finite(balance.ownersEquity) ?? finite(balance.shareholdersEquity);
  return top === null || equity === null || equity <= 0 ? null : top / equity;
}
export function roa(income, balance) {
  if (!samePeriod(income, balance)) return null;
  const top = finite(income.netIncome), assets = finite(balance.totalAssets);
  return top === null || assets === null || assets <= 0 ? null : top / assets;
}

// Three-year CAGR needs four consecutive ordinary fiscal years with the same
// fiscal month and the same accounting standard at both ends.
export function revenueCagr3y(years) {
  if (!Array.isArray(years) || years.length < 4) return null;
  const rows = years.slice(-4);
  for (let i = 0; i < rows.length; i++) {
    const days = finite(rows[i].fiscalPeriodDays);
    if (days === null || days < 360 || days > 366) return null;
    if (i && (rows[i].fiscalPeriod.slice(5) !== rows[0].fiscalPeriod.slice(5) ||
        Number(rows[i].fiscalPeriod.slice(0, 4)) - Number(rows[i - 1].fiscalPeriod.slice(0, 4)) !== 1)) return null;
  }
  const [base, , , last] = rows;
  if (!base.accountingStandard || base.accountingStandard !== last.accountingStandard) return null;
  const a = finite(last.revenue), b = finite(base.revenue);
  return a === null || b === null || b <= 0 || a < 0 ? null : (a / b) ** (1 / 3) - 1;
}

const TOTAL_SEGMENT = /^(連結|計|合計|小計|総計|全社|消去|調整額|報告セグメント計|セグメント計|total|consolidated)$|消去|調整|全社|セグメント計/i;
const INTERNAL_SALES = /セグメント間|所在地間|inter-?segment/i;

// Shares of the segments a company reports, on the first external-sales basis
// it lists. Totals and eliminations are excluded; segments are never merged.
export function segmentMix(row) {
  if (!row || !Array.isArray(row.items)) return null;
  const multiplier = finite(row.unitMultiplier) ?? 1;
  if (multiplier <= 0) return null;
  const sales = row.items.filter((i) => i && i.metric === "net_sales_total" && typeof i.segment === "string");
  const basis = sales.map((i) => i.rawLabel ?? "").find((label) => !INTERNAL_SALES.test(label));
  if (basis === undefined) return null;
  const items = sales.filter((i) => (i.rawLabel ?? "") === basis && !TOTAL_SEGMENT.test(i.segment.trim()));
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const value = finite(item.value);
    if (value === null || seen.has(item.segment)) continue;
    if (value < 0) return null;
    seen.add(item.segment);
    out.push({ segment: item.segment, value: value * multiplier });
  }
  const total = out.reduce((sum, i) => sum + i.value, 0);
  if (!out.length || total <= 0) return null;
  return { basis, fiscalPeriod: row.fiscalPeriod, total,
    items: out.map((i) => ({ ...i, share: i.value / total })) };
}

// One flat record per company for tables and CSV.
export function companyMetrics(company) {
  const latest = latestYear(company);
  const b = company.balance, c = company.cashFlow, w = company.workforce;
  const d = company.diversity?.reportingCompany ?? null;
  const pick = (row, key) => (row ? finite(row[key]) : null);
  return {
    symbol: company.symbol,
    fiscalPeriod: latest?.fiscalPeriod ?? null,
    accountingStandard: latest?.accountingStandard ?? null,
    fiscalPeriodDays: pick(latest, "fiscalPeriodDays"),
    revenue: pick(latest, "revenue"),
    operatingIncome: pick(latest, "operatingIncome"),
    operatingMargin: pick(latest, "operatingMargin"),
    netMargin: pick(latest, "netMargin"),
    roe: roe(latest, b),
    roa: roa(latest, b),
    revenueCagr3y: revenueCagr3y(company.years),
    balancePeriod: b?.fiscalPeriod ?? null,
    equityRatio: pick(b, "equityRatio"),
    netInterestBearingDebt: pick(b, "netInterestBearingDebt"),
    operatingCashFlow: pick(c, "operatingCashFlow"),
    capitalExpenditure: pick(c, "capitalExpenditure"),
    freeCashFlow: pick(c, "freeCashFlow"),
    peoplePeriod: w?.fiscalPeriod ?? company.diversity?.fiscalPeriod ?? null,
    employees: pick(w, "employees"),
    consolidatedEmployees: pick(w, "consolidatedEmployees"),
    averageAge: pick(w, "averageAge"),
    averageTenureYears: pick(w, "averageTenureYears"),
    averageAnnualSalary: pick(w, "averageAnnualSalary"),
    femaleManagerRatio: pick(d, "femaleManagerRatio"),
    maleChildcareLeaveRatio: pick(d, "maleChildcareLeaveRatio"),
    maleChildcareLeaveBasis: typeof d?.maleChildcareLeaveBasis === "string" ? d.maleChildcareLeaveBasis : null,
    wageGapAll: pick(d, "wageGapAll"),
    docId: latest?.provenance?.docId ?? null,
    source: latest?.provenance?.source ?? null,
    sourceUrl: edinetUrl(latest?.provenance?.sourceUrl),
  };
}

// Defence in depth: the server already drops every non-EDINET link.
export function edinetUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)edinet-fsa\.go\.jp$/.test(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

// Domain for a column of values; always contains zero so bars share a baseline.
export function domain(values) {
  const numbers = values.map(finite).filter((v) => v !== null);
  const min = Math.min(0, ...numbers), max = Math.max(0, ...numbers);
  return min === max ? { min: 0, max: 1 } : { min, max };
}
// Left offset and width in percent of the track. Missing values draw nothing.
export function barGeometry(value, { min, max }) {
  value = finite(value);
  if (value === null || !(max > min)) return null;
  const at = (v) => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100;
  const zero = at(0), end = at(value);
  return { left: Math.min(zero, end), width: Math.abs(end - zero), zero, negative: value < 0 };
}
export const position = (value, { min, max }) =>
  finite(value) === null ? null : ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100;

// Readable ticks that include zero and every value, with a little headroom.
export function niceAxis(values, steps = 4) {
  const numbers = values.map(finite).filter((v) => v !== null);
  let min = Math.min(0, ...numbers), max = Math.max(0, ...numbers);
  if (min === max) max = min + 1;
  const raw = (max - min) / steps, power = 10 ** Math.floor(Math.log10(raw));
  const unit = [1, 2, 2.5, 5, 10].find((n) => n * power >= raw) * power;
  const lower = Math.floor(min / unit) * unit, upper = Math.ceil(max / unit) * unit;
  const ticks = Array.from({ length: Math.round((upper - lower) / unit) + 1 },
    (_, i) => Number((lower + i * unit).toPrecision(12)));
  return { min: lower, max: upper, ticks };
}

const locale = (lang) => (lang === "ja" ? "ja-JP" : "en-US");
export function oku(value, lang = "ja") {
  value = finite(value);
  if (value === null) return "—";
  const x = value / 1e8;
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: Math.abs(x) >= 100 ? 0 : 1 }).format(x);
}
export function percent(value, lang = "ja", digits = 1) {
  value = finite(value);
  return value === null ? "—" : new Intl.NumberFormat(locale(lang), {
    style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}
export function number(value, lang = "ja", digits = 0) {
  value = finite(value);
  return value === null ? "—" : new Intl.NumberFormat(locale(lang), {
    minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}
// Salary: 万円 in Japanese, JPY millions in English.
export function salary(value, lang = "ja") {
  value = finite(value);
  if (value === null) return "—";
  return lang === "ja" ? number(value / 1e4, lang, 0) : number(value / 1e6, lang, 2);
}

// CSV cells are always quoted; text that a spreadsheet would treat as a formula
// gets a leading apostrophe. Missing values are blank cells, never zero.
export function csvCell(value) {
  if (value === null || value === undefined || (typeof value === "number" && !Number.isFinite(value))) return '""';
  const text = typeof value === "string" ? value.replace(/^[=+\-@\t\r]/, "'$&") : String(value);
  return '"' + text.replaceAll('"', '""') + '"';
}
export const toCsv = (rows) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

export const CSV_FIELDS = ["symbol", "name", "role", "fiscalPeriod", "accountingStandard", "fiscalPeriodDays",
  "revenue", "operatingIncome", "operatingMargin", "netMargin", "roe", "roa", "revenueCagr3y",
  "equityRatio", "netInterestBearingDebt", "operatingCashFlow", "capitalExpenditure", "freeCashFlow",
  "peoplePeriod", "employees", "consolidatedEmployees", "averageAge", "averageTenureYears",
  "averageAnnualSalary", "femaleManagerRatio", "maleChildcareLeaveRatio", "maleChildcareLeaveBasis",
  "wageGapAll", "source", "docId", "sourceUrl"];
export function comparisonCsv(rows, benchmark) {
  const out = [CSV_FIELDS];
  for (const row of rows) out.push(CSV_FIELDS.map((f) => row[f] ?? null));
  for (const [role, key] of [["industry-q1", "q1"], ["industry-median", "median"], ["industry-q3", "q3"]]) {
    if (!benchmark) break;
    out.push(CSV_FIELDS.map((f) => f === "symbol" ? "sector-" + benchmark.sector : f === "role" ? role
      : ["roe", "roa", "revenueCagr3y"].includes(f) ? benchmark[f]?.[key] ?? null : null));
  }
  return toCsv(out);
}
