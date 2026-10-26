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
