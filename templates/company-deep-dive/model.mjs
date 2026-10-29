// Pure functions shared by the browser and the offline Node tests.
// Amounts stay in JPY; ratios stay as fractions (0.125 = 12.5%). Missing stays null, never 0.
export const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
export const isPeriod = (value) => typeof value === "string" && PERIOD.test(value);
const QUARTERS = { Q1: 9, Q2: 6, Q3: 3, Q4: 0, FY: 0 };
const TARGETS = new Set(["current-fiscal-year", "next-fiscal-year"]);
const bare = (symbol) => String(symbol ?? "").replace(/\.T$/, "");
const fail = () => {
  throw new Error("invalid_response");
};

export function addMonths(period, months) {
  if (!isPeriod(period)) return null;
  const total = Number(period.slice(0, 4)) * 12 + Number(period.slice(5)) - 1 + months;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`;
}

// ---------- Response validation -------------------------------------------------
function statementRows(rows, symbol) {
  if (!Array.isArray(rows) || rows.length > 5) fail();
  const seen = new Set();
  return rows.map((row) => {
    if (!row || typeof row !== "object" || row.period !== "FY" || !isPeriod(row.fiscalPeriod) ||
        bare(row.symbol) !== symbol || seen.has(row.fiscalPeriod)) fail();
    seen.add(row.fiscalPeriod);
    return row;
  });
}
function segmentReport(report, symbol, expectedPeriod) {
  if (report === null || report === undefined) return null;
  if (typeof report !== "object" || bare(report.symbol) !== symbol || report.period !== "FY" ||
      !isPeriod(report.fiscalPeriod) || !Array.isArray(report.items) || report.items.length > 400) fail();
  if (expectedPeriod !== undefined && report.fiscalPeriod !== expectedPeriod) fail();
  const multiplier = report.unitMultiplier ?? 1;
  if (!Number.isFinite(multiplier) || multiplier <= 0) fail();
  for (const item of report.items)
    if (!item || typeof item.segment !== "string" || !item.segment.trim() || typeof item.metric !== "string") fail();
  return { ...report, unitMultiplier: multiplier };
}
// The same announcement reported twice (e.g. by two sources) is kept once when the figures agree;
// conflicting figures for the same announcement stop the display.
function forecastRows(rows, symbol) {
  if (!Array.isArray(rows) || rows.length > 40) fail();
  const seen = new Map();
  const figures = (row) => FORECAST_FIELDS.map(([, source]) => finite(row[source])).join("|");
  return rows.filter((row) => {
    // A row without an announcement time cannot be placed on the revision timeline; skip it
    // rather than guessing when it was published.
    if (row && typeof row === "object" && row.announcedAt == null) return false;
    if (!row || typeof row !== "object" || bare(row.symbol) !== symbol || !isPeriod(row.fiscalPeriod) ||
        !(row.period in QUARTERS) || !TARGETS.has(row.forecastTarget) ||
        typeof row.announcedAt !== "string" || Number.isNaN(Date.parse(row.announcedAt)) ||
        (row.forecastFiscalPeriod != null && !isPeriod(row.forecastFiscalPeriod))) fail();
    const key = [row.fiscalPeriod, row.period, row.forecastTarget, row.announcedAt].join("|");
    if (seen.has(key)) {
      if (seen.get(key) !== figures(row)) fail();
      return false;
    }
    seen.set(key, figures(row));
    return true;
  });
}
function singleReport(report, symbol) {
  if (report === null || report === undefined) return null;
  if (typeof report !== "object" || bare(report.symbol) !== symbol ||
      (report.fiscalPeriod != null && !isPeriod(report.fiscalPeriod))) fail();
  return report;
}

// Validate one bundle (the server's fetch_bundle output, live or saved in demo.json) and
// merge annual statements by fiscal period.
export function normalizeBundle(dossier) {
  if (!dossier || typeof dossier !== "object" || typeof dossier.symbol !== "string" || !dossier.symbol ||
      !dossier.segments || typeof dossier.segments !== "object") fail();
  const symbol = bare(dossier.symbol);
  const income = statementRows(dossier.incomeStatements, symbol);
  const balance = statementRows(dossier.balanceSheets, symbol);
  const cash = statementRows(dossier.cashFlows, symbol);
  const byPeriod = new Map();
  for (const [key, rows] of [["is", income], ["bs", balance], ["cf", cash]])
    for (const row of rows) {
      const year = byPeriod.get(row.fiscalPeriod) ?? { fiscalPeriod: row.fiscalPeriod, is: null, bs: null, cf: null };
      year[key] = row;
      byPeriod.set(row.fiscalPeriod, year);
    }
  const years = [...byPeriod.values()].sort((a, b) => a.fiscalPeriod.localeCompare(b.fiscalPeriod));
  const current = segmentReport(dossier.segments.current, symbol);
  const requested = dossier.segments.previousRequested ?? null;
  if (requested !== null && (!isPeriod(requested) || !current || requested >= current.fiscalPeriod)) fail();
  const previous = requested === null ? (dossier.segments.previous == null ? null : fail())
    : segmentReport(dossier.segments.previous, symbol, requested);
  return {
    symbol: dossier.symbol,
    retrievedAt: dossier.retrievedAt ?? null,
    years,
    segments: { current, previous, previousRequested: requested },
    forecasts: forecastRows(dossier.forecasts, symbol),
    workforce: singleReport(dossier.workforce, symbol),
    diversity: singleReport(dossier.diversity, symbol),
  };
}

// ---------- Business segments ---------------------------------------------------
const METRICS = {
  net_sales_total: "revenue", net_sales_intersegment: "intersegment", segment_profit: "profit",
  depreciation: "depreciation", capital_expenditure: "capex", impairment_loss: "impairment",
};
export function segmentKind(name) {
  const n = String(name).replace(/\s/g, "");
  if (/^(連結|合計|計|総計|連結合計|total)$/i.test(n) || /計上額$/.test(n)) return "total";
  if (/(消去|調整|全社|セグメント間|adjust|eliminat|corporate)/i.test(n)) return "adjustment";
  return "segment";
}
// One row per reported segment name. Values are reported value × unitMultiplier (JPY).
// The same segment+metric reported twice with different values becomes null (ambiguous).
export function segmentRows(report) {
  if (!report) return [];
  const rows = new Map(), conflicts = new Set();
  for (const item of report.items) {
    const field = METRICS[item.metric];
    if (!field) continue;
    const name = item.segment.trim();
    const row = rows.get(name) ?? { segment: name, kind: segmentKind(name), labels: {} };
    const value = finite(item.value) === null ? null : item.value * report.unitMultiplier;
    if (field in row && row[field] !== value) conflicts.add(name + "|" + field);
    row[field] = value;
    if (typeof item.rawLabel === "string") row.labels[field] = item.rawLabel;
    rows.set(name, row);
  }
  for (const key of conflicts) {
    const [name, field] = key.split("|");
    rows.get(name)[field] = null;
    rows.get(name).conflict = true;
  }
  const order = { segment: 0, adjustment: 1, total: 2 };
  return [...rows.values()]
    .map((row) => {
      for (const field of Object.values(METRICS)) if (!(field in row)) row[field] = null;
      row.margin = row.revenue > 0 && row.profit !== null ? row.profit / row.revenue : null;
      return row;
    })
    .sort((a, b) => order[a.kind] - order[b.kind]);
}
export const segmentNames = (rows) =>
  rows.filter((r) => r.kind === "segment").map((r) => r.segment).sort();

// Changes are computed only when both years report exactly the same segment names.
export function segmentComparison(current, previous) {
  const now = segmentRows(current), before = segmentRows(previous);
  if (!current) return { comparable: false, reason: "no_segments", current: now, previous: before };
  if (!previous) return { comparable: false, reason: "no_previous", current: now, previous: before };
  const a = segmentNames(now), b = segmentNames(before);
  if (!a.length || a.length !== b.length || a.some((name, i) => name !== b[i]))
    return { comparable: false, reason: "names_differ", current: now, previous: before };
  const prior = new Map(before.map((r) => [r.segment, r]));
  return {
    comparable: true, reason: null, previous: before,
    current: now.map((row) => {
      const old = prior.get(row.segment) ?? null;
      return {
        ...row, prior: old,
        revenueChange: growth(row.revenue, old?.revenue),
        profitChange: growth(row.profit, old?.profit),
        marginChange: row.margin !== null && finite(old?.margin) !== null ? row.margin - old.margin : null,
      };
    }),
  };
}
// Growth rate only against a positive base: no rates from zero, negative or missing bases.
export function growth(current, previous) {
  const a = finite(current), b = finite(previous);
  return a === null || b === null || b <= 0 ? null : (a - b) / b;
}

// ---------- Financial strength & cash allocation ---------------------------------
// Cash-flow outflows are negative in the API (capex, dividends, treasury-stock purchases).
export function cashAllocation(year) {
  const cf = year?.cf ?? {}, bs = year?.bs ?? {};
  const ocf = finite(cf.operatingCashFlow), icf = finite(cf.investingCashFlow);
  const capex = finite(cf.capitalExpenditure), dividends = finite(cf.dividendsPaid);
  const buybacks = finite(cf.purchaseOfTreasuryStock);
  const fcf = finite(cf.freeCashFlow) ?? (ocf !== null && icf !== null ? ocf + icf : null);
  const otherInvesting = icf !== null && capex !== null ? icf - capex : null;
  const afterDividends = fcf !== null && dividends !== null ? fcf + dividends : null;
  const afterReturns = afterDividends !== null && buybacks !== null ? afterDividends + buybacks : null;
  const shareholderReturns = dividends !== null && buybacks !== null ? -(dividends + buybacks) : null;
  // Waterfall: deltas start from the running total; an unknown delta breaks the chain.
  const steps = [{ key: "operatingCashFlow", type: "start", value: ocf }];
  if (capex !== null && otherInvesting !== null)
    steps.push({ key: "capitalExpenditure", type: "delta", value: capex }, { key: "otherInvesting", type: "delta", value: otherInvesting });
  else steps.push({ key: "investingCashFlow", type: "delta", value: icf });
  steps.push({ key: "freeCashFlow", type: "subtotal", value: fcf },
    { key: "dividendsPaid", type: "delta", value: dividends },
    { key: "purchaseOfTreasuryStock", type: "delta", value: buybacks },
    { key: "afterReturns", type: "subtotal", value: afterReturns });
  let running = null;
  for (const step of steps) {
    if (step.type === "delta") {
      step.from = running;
      step.to = running !== null && step.value !== null ? running + step.value : null;
      running = step.to;
    } else {
      step.from = step.value === null ? null : 0;
      step.to = step.value;
      running = step.value;
    }
  }
  return {
    fiscalPeriod: year?.fiscalPeriod ?? null, ocf, icf, capex, otherInvesting, fcf, dividends, buybacks,
    afterDividends, afterReturns, shareholderReturns,
    equityRatio: finite(bs.equityRatio), netDebt: finite(bs.netInterestBearingDebt),
    interestBearingDebt: finite(bs.interestBearingDebt), cash: finite(bs.cashAndCashEquivalents),
    payoutOfFcf: shareholderReturns !== null && fcf > 0 ? shareholderReturns / fcf : null,
    steps,
  };
}

// ---------- Company plan vs results ---------------------------------------------
// forecastTarget is relative to the row's own fiscalPeriod/period:
//   FY row  + current  → that fiscal year        FY row + next → 12 months later
//   Qn row  + current  → quarter end + (4-n)×3   Qn row + next → that + 12 months
// An explicit forecastFiscalPeriod wins (it also covers fiscal-year-end changes).
export function forecastTargetPeriod(row) {
  if (isPeriod(row?.forecastFiscalPeriod)) return row.forecastFiscalPeriod;
  if (!row || !(row.period in QUARTERS) || !isPeriod(row.fiscalPeriod)) return null;
  const fiscalYearEnd = addMonths(row.fiscalPeriod, QUARTERS[row.period]);
  if (row.forecastTarget === "current-fiscal-year") return fiscalYearEnd;
  if (row.forecastTarget === "next-fiscal-year") return addMonths(fiscalYearEnd, 12);
  return null;
}
export const FORECAST_FIELDS = [
  ["revenue", "revenueForecast"], ["operatingIncome", "operatingIncomeForecast"], ["netIncome", "netIncomeForecast"],
];
export function direction(current, previous) {
  const a = finite(current), b = finite(previous);
  if (a === null || b === null) return null;
  return a > b ? "up" : a < b ? "down" : "unchanged";
}
const PERIOD_ORDER = { FY: 0, Q1: 1, Q2: 2, Q3: 3, Q4: 4 };
const standard = (value) => (typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null);
// Achievement = actual / latest forecast, only for a positive forecast and a matching (or unknown) standard.
export function achievement(actual, forecast) {
  const a = finite(actual), f = finite(forecast);
  return a === null || f === null || f <= 0 ? null : a / f;
}
export function forecastGroups(forecasts, years) {
  const groups = new Map();
  let skipped = 0;
  for (const row of forecasts) {
    const target = forecastTargetPeriod(row);
    if (!target) { skipped++; continue; }
    if (!groups.has(target)) groups.set(target, []);
    groups.get(target).push(row);
  }
  const result = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([target, rows]) => {
    rows.sort((a, b) => Date.parse(a.announcedAt) - Date.parse(b.announcedAt) ||
      a.fiscalPeriod.localeCompare(b.fiscalPeriod) || PERIOD_ORDER[a.period] - PERIOD_ORDER[b.period]);
    const entries = rows.map((row, index) => {
      const values = {}, directions = {};
      for (const [field, source] of FORECAST_FIELDS) {
        values[field] = finite(row[source]);
        directions[field] = index === 0 ? "initial" : direction(row[source], rows[index - 1][source]);
      }
      return { row, stage: index === 0 ? "initial" : "revision", values, directions };
    });
    // Rows announced after the target year ended are listed but not treated as the latest forecast.
    const yearEnd = Date.UTC(Number(target.slice(0, 4)), Number(target.slice(5)), 1);
    for (const e of entries) e.late = Date.parse(e.row.announcedAt) >= yearEnd;
    const initial = entries[0], latest = entries.filter((e) => !e.late).at(-1) ?? entries.at(-1);
    const income = years.find((y) => y.fiscalPeriod === target)?.is ?? null;
    const actual = income ? {
      revenue: finite(income.revenue), operatingIncome: finite(income.operatingIncome),
      netIncome: finite(income.netIncomeAttributableToOwners) ?? finite(income.netIncome),
    } : null;
    const a = standard(income?.accountingStandard), b = standard(latest.row.accountingStandard);
    const standardMismatch = Boolean(a && b && a !== b);
    const rates = {}, overall = {};
    for (const [field] of FORECAST_FIELDS) {
      rates[field] = actual && !standardMismatch ? achievement(actual[field], latest.values[field]) : null;
      overall[field] = latest !== initial ? direction(latest.values[field], initial.values[field]) : null;
    }
    return { target, entries, latest, initial, actual, achievement: rates, overall, standardMismatch,
      income, revisions: entries.length - 1 };
  });
  return { groups: result, skipped };
}

// ---------- People & organization -----------------------------------------------
export function peopleSummary(workforce, diversity) {
  const w = workforce ?? {}, rc = diversity?.reportingCompany ?? {};
  const consolidated = new Map(), parent = new Map();
  for (const [list, target] of [[w.segments, consolidated], [w.parentSegments, parent]])
    for (const s of Array.isArray(list) ? list : [])
      if (s && typeof s.segment === "string" && s.segment.trim()) target.set(s.segment.trim(), finite(s.employees));
  const names = [...new Set([...consolidated.keys(), ...parent.keys()])];
  return {
    employees: finite(w.employees), consolidatedEmployees: finite(w.consolidatedEmployees),
    averageAge: finite(w.averageAge), averageTenureYears: finite(w.averageTenureYears),
    averageAnnualSalary: finite(w.averageAnnualSalary),
    bySegment: names.map((segment) => ({
      segment, consolidated: consolidated.get(segment) ?? null, parent: parent.get(segment) ?? null,
    })),
    diversity: {
      femaleManagerRatio: finite(rc.femaleManagerRatio), maleChildcareLeaveRatio: finite(rc.maleChildcareLeaveRatio),
      maleChildcareLeaveBasis: typeof rc.maleChildcareLeaveBasis === "string" ? rc.maleChildcareLeaveBasis : null,
      wageGapAll: finite(rc.wageGapAll), wageGapRegular: finite(rc.wageGapRegular), wageGapNonRegular: finite(rc.wageGapNonRegular),
    },
    subsidiaries: (Array.isArray(diversity?.subsidiaries) ? diversity.subsidiaries : [])
      .filter((s) => s && typeof s.name === "string")
      .map((s) => ({ name: s.name, femaleManagerRatio: finite(s.femaleManagerRatio),
        maleChildcareLeaveRatio: finite(s.maleChildcareLeaveRatio), wageGapAll: finite(s.wageGapAll),
        wageGapRegular: finite(s.wageGapRegular), wageGapNonRegular: finite(s.wageGapNonRegular) })),
  };
}

// ---------- Provenance, formatting, CSV and chart scales -------------------------
// Only EDINET pages are linked. TDnet document links are removed by the server and never rendered.
export function edinetUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "edinet-fsa.go.jp" || url.hostname.endsWith(".edinet-fsa.go.jp"))
      ? url.href : null;
  } catch {
    return null;
  }
}
const locale = (lang) => (lang === "ja" ? "ja-JP" : "en-US");
export function oku(value, lang = "ja", digits = 1) {
  value = finite(value);
  if (value === null) return "—";
  return new Intl.NumberFormat(locale(lang), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value / 1e8);
}
export function percent(value, lang = "ja", digits = 1) {
  value = finite(value);
  return value === null ? "—" : new Intl.NumberFormat(locale(lang), { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}
export function points(value, lang = "ja") {
  value = finite(value);
  if (value === null) return "—";
  const text = new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 1, minimumFractionDigits: 1, signDisplay: "exceptZero" }).format(value * 100);
  return text + (lang === "ja" ? "pt" : " pp");
}
export function signedPercent(value, lang = "ja") {
  value = finite(value);
  return value === null ? "—" : new Intl.NumberFormat(locale(lang), { style: "percent", maximumFractionDigits: 1, minimumFractionDigits: 1, signDisplay: "exceptZero" }).format(value);
}
export function count(value, lang = "ja", digits = 0) {
  value = finite(value);
  return value === null ? "—" : new Intl.NumberFormat(locale(lang), { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}
const FORMULA = /^[=+\-@\t\r]/;
export function csvCell(value) {
  if (value === null || value === undefined) return "";
  let text = typeof value === "number" ? (Number.isFinite(value) ? String(value) : "") : String(value);
  // Spreadsheet formula injection guard for text cells; numbers stay numeric.
  if (typeof value === "string" && FORMULA.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) || text !== text.trim() || text.startsWith("'") ? `"${text.replaceAll('"', '""')}"` : text;
}
export const csvText = (rows) => rows.map((row) => row.map(csvCell).join(",")).join("\r\n");

export function axis(values) {
  const numbers = values.map(finite).filter((v) => v !== null);
  const min = Math.min(0, ...numbers), max = Math.max(0, ...numbers);
  if (min === max) return { min: 0, max: 1 };
  const span = max - min;
  return { min: min < 0 ? min - span * 0.08 : 0, max: max > 0 ? max + span * 0.1 : 0 };
}
export function chartAxis(values, tickCount = 4) {
  const { min, max } = axis(values);
  const raw = (max - min) / tickCount, power = 10 ** Math.floor(Math.log10(raw));
  const unit = [1, 2, 2.5, 5, 10].find((n) => n * power >= raw) * power;
  const lower = Math.floor(min / unit) * unit, upper = Math.ceil(max / unit) * unit;
  const ticks = Array.from({ length: Math.round((upper - lower) / unit) + 1 }, (_, i) => Number((lower + i * unit).toPrecision(12)));
  return { min: lower, max: upper, ticks };
}
