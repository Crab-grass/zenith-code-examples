// Shared by the browser and offline Node tests. Financial amounts stay in JPY.
export const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
export function normalize(snapshot) {
  if (
    !snapshot ||
    typeof snapshot.symbol !== "string" ||
    !Array.isArray(snapshot.annualFinancials) ||
    !Array.isArray(snapshot.latestClose)
  )
    throw new Error("invalid_response");
  const seen = new Set();
  const years = snapshot.annualFinancials
    .map((row) => {
      if (
        !row ||
        row.period !== "FY" ||
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.fiscalPeriod) ||
        String(row.symbol).replace(/\.T$/, "") !==
          snapshot.symbol.replace(/\.T$/, "") ||
        seen.has(row.fiscalPeriod)
      )
        throw new Error("invalid_response");
      seen.add(row.fiscalPeriod);
      return {
        ...row,
        revenue: finite(row.revenue),
        operatingIncome: finite(row.operatingIncome),
        netIncome: finite(row.netIncome),
        operatingMargin: finite(row.operatingMargin),
      };
    })
    .sort((a, b) => a.fiscalPeriod.localeCompare(b.fiscalPeriod));
  if (years.length > 3 || snapshot.latestClose.length > 1)
    throw new Error("invalid_response");
  const quote = snapshot.latestClose[0] ?? null;
  if (
    quote &&
    String(quote.symbol).replace(/\.T$/, "") !==
      snapshot.symbol.replace(/\.T$/, "")
  )
    throw new Error("invalid_response");
  return { ...snapshot, years, quote };
}
export function axis(values) {
  const numbers = values.map(finite).filter((v) => v !== null);
  let min = Math.min(0, ...numbers),
    max = Math.max(0, ...numbers);
  if (min === max) return { min: 0, max: 1 };
  const span = max - min;
  return {
    min: min < 0 ? min - span * 0.12 : 0,
    max: max > 0 ? max + span * 0.18 : 0,
  };
}
export function money(value, lang = "ja", compact = false) {
  value = finite(value);
  if (value === null) return "—";
  return new Intl.NumberFormat(lang === "ja" ? "ja-JP" : "en-US", {
    maximumFractionDigits: compact ? 1 : 0,
  }).format(compact ? value / 1e8 : value);
}
export function percent(value, lang = "ja") {
  value = finite(value);
  return value === null
    ? "—"
    : new Intl.NumberFormat(lang === "ja" ? "ja-JP" : "en-US", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(value);
}

// Matching metadata is a necessary check, not evidence of economic comparability.
export function comparisonConditions(a, b) {
  return Boolean(a && b && a.period === "FY" && b.period === "FY" &&
    a.fiscalPeriod === b.fiscalPeriod && a.accountingStandard &&
    a.accountingStandard === b.accountingStandard &&
    Number.isFinite(a.fiscalPeriodDays) && a.fiscalPeriodDays > 0 &&
    a.fiscalPeriodDays === b.fiscalPeriodDays);
}
export function changeRate(current, previous, field) {
  if (!current || !previous || current.period !== "FY" || previous.period !== "FY" ||
      !current.accountingStandard || current.accountingStandard !== previous.accountingStandard ||
      current.fiscalPeriod.slice(5) !== previous.fiscalPeriod.slice(5) ||
      Number(current.fiscalPeriod.slice(0,4)) - Number(previous.fiscalPeriod.slice(0,4)) !== 1 ||
      !Number.isFinite(current.fiscalPeriodDays) || !Number.isFinite(previous.fiscalPeriodDays) ||
      current.fiscalPeriodDays < 360 || current.fiscalPeriodDays > 366 ||
      previous.fiscalPeriodDays < 360 || previous.fiscalPeriodDays > 366) return null;
  const a = finite(current[field]), b = finite(previous[field]);
  if (a === null || b === null) return null;
  if (field === "operatingMargin") return a-b;
  return b > 0 ? (a-b)/b : null;
}

export function chartAxis(values) {
  const {min, max} = axis(values);
  const raw=(max-min)/3, power=10**Math.floor(Math.log10(raw));
  const unit=[1,2,2.5,5,10].find(n=>n*power>=raw)*power;
  const lower=Math.floor(min/unit)*unit,upper=Math.ceil(max/unit)*unit;
  const ticks=Array.from({length:Math.round((upper-lower)/unit)+1},(_,i)=>Number((lower+i*unit).toPrecision(12)));
  return {min:lower,max:upper,ticks};
}
