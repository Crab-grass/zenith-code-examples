import * as M from "./model.mjs";
import { hBars, stackedColumns, waterfall, lineChart, columns, forecastPaths, meters, empty } from "./charts.mjs";
import { texts } from "./i18n.mjs";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const stored = (() => {
  try { return JSON.parse(localStorage.getItem("zenith-deep-dive") || "{}") ?? {}; } catch { return {}; }
})();
const state = {
  lang: params.get("lang") === "en" || (!params.has("lang") && stored.lang === "en") ? "en" : "ja",
  theme: ["light", "dark"].includes(params.get("theme")) ? params.get("theme") : stored.theme === "light" ? "light" : "dark",
  mode: "demo", view: "segments", bundles: [], placeholder: false, config: null, data: null,
  busy: false, status: "demoNotice", error: false, cashYear: null, planMetric: "operatingIncome", built: null,
};
const t = (key) => texts[state.lang][key] ?? texts.en[key] ?? key;
const fill = (key, values) => t(key).replace(/\{(\w+)\}/g, (_, k) => values[k] ?? "");
function node(tag, text, attrs = {}) {
  const el = document.createElement(tag);
  if (text !== undefined && text !== null) el.textContent = text;
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? "" : v);
  return el;
}
// Segment, subsidiary and other names are shown exactly as reported (Japanese in filings).
const label = (name) => name;
const amt = (v) => M.oku(v, state.lang);
const tick = (v) => M.oku(v, state.lang, 0);
const pct = (v) => M.percent(v, state.lang);
const fy = (period) => (period ? (state.lang === "ja" ? `${period.slice(0, 4)}年${Number(period.slice(5))}月期` : `FY ${period}`) : "—");
const shortFy = (period) => (period ? (state.lang === "ja" ? `${period.slice(2, 4)}/${period.slice(5)}期` : `FY${period.slice(2, 4)}/${period.slice(5)}`) : "—");
function date(value) {
  const d = new Date(value);
  return !value || Number.isNaN(d.getTime()) ? "—"
    : new Intl.DateTimeFormat(state.lang === "ja" ? "ja-JP" : "en-GB", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
const month = (period) => (state.lang === "ja" ? Number(period.slice(5))
  : new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, Number(period.slice(5)) - 1, 1))));
const arrow = (dir) => ({ up: "▲", down: "▼", unchanged: "＝", initial: "" }[dir] ?? "");
const sourceName = (s) => (s ? t("src_" + s) : "—");
// Segment, workforce and diversity data come from annual securities reports on EDINET.
const reportSource = () => (state.mode === "demo" && state.placeholder ? "synthetic" : "edinet");

// =====================================================================================
// View registry. Each view turns the normalized dossier into generic workspace parts:
//   build(data) → { kpis, callout?, panels: [{title, unit, wide, legend, controls, draw(host, width)}],
//                   table: {title, unit, columns, rows, csv: {name, columns}}, sources, notes }
// Add a view by pushing one more entry (and its texts in i18n.mjs). See README "Customize".
// =====================================================================================
const ICONS = {
  segments: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  cash: "M3 7h18v10H3zM7 12h.01M17 12h.01M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z",
  plan: "M3 17l5-5 4 3 8-8M15 7h5v5",
  people: "M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM20 19v-1a3 3 0 0 0-2-2.8M4 19v-1a3 3 0 0 1 2-2.8",
};
const legendItem = (key, color, shape = "box") => ({ text: t(key), color, shape });

const segmentsView = {
  id: "segments",
  build(d) {
    const cmp = M.segmentComparison(d.segments.current, d.segments.previous);
    const cur = d.segments.current, prev = d.segments.previous;
    const reported = cmp.current.filter((r) => r.kind === "segment");
    const known = reported.filter((r) => M.finite(r.revenue) !== null);
    const total = known.length === reported.length && known.length ? known.reduce((s, r) => s + r.revenue, 0) : null;
    const largest = [...known].sort((a, b) => b.revenue - a.revenue)[0];
    const best = reported.filter((r) => r.margin !== null).sort((a, b) => b.margin - a.margin)[0];
    const consolidated = cmp.current.find((r) => r.kind === "total");
    const capex = consolidated?.capex ?? null, dep = consolidated?.depreciation ?? null;
    const kpis = [
      { label: t("kpiSegments"), value: reported.length ? String(reported.length) : "—", note: fy(cur?.fiscalPeriod) },
      { label: t("kpiLargest"), value: largest ? label(largest.segment) : "—", small: true,
        note: largest && total ? fill("shareOfSales", { v: pct(largest.revenue / total) }) : t("noValue") },
      { label: t("kpiBestMargin"), value: best ? pct(best.margin) : "—", note: best ? label(best.segment) : t("noValue") },
      { label: t("kpiCapexDep"), value: capex !== null && dep > 0 ? M.count(capex / dep, state.lang, 2) + "×" : "—", note: t("kpiCapexDepNote") },
    ];
    let callout = null;
    if (cmp.reason === "names_differ") callout = { tone: "warn", text: fill("segNamesDiffer", { a: fy(cur.fiscalPeriod), b: fy(prev.fiscalPeriod) }) };
    else if (cmp.reason === "no_previous" && cur) callout = { tone: "info", text: t("segNoPrevious") };
    const order = [...reported].sort((a, b) => (M.finite(b.revenue) ?? -Infinity) - (M.finite(a.revenue) ?? -Infinity));
    const tipRows = (r, year) => ({ title: `${label(r.segment)} · ${shortFy(year)}`, rows: [
      { value: amt(r.revenue), label: t("revenue") + " · " + t("unitOku"), color: "c-1" },
      { value: amt(r.profit), label: t("segmentProfit"), color: "c-3" }, { value: pct(r.margin), label: t("margin") }] });
    const panels = [];
    if (cur) {
      panels.push({
        title: t("panelSegRevenue"), unit: `${t("unitOku")} · ${fy(cur.fiscalPeriod)}`,
        legend: cmp.comparable ? [legendItem("thisYear", "c-1"), legendItem("priorYear", "c-ghost")] : null,
        draw: (host, width) => order.length ? hBars(host, {
          width, label: t("panelSegRevenue"), format: tick, noteHeader: t("margin"),
          rows: order.map((r) => ({ label: label(r.segment), note: pct(r.margin), values: [
            { value: r.revenue, color: "c-1", valueLabel: amt(r.revenue), tip: tipRows(r, cur.fiscalPeriod) },
            ...(cmp.comparable ? [{ value: r.prior?.revenue, color: "c-ghost", tip: r.prior && tipRows(r.prior, prev.fiscalPeriod) }] : [])] })),
        }) : empty(host, t("noData")),
      }, {
        title: t("panelSegInvest"), unit: t("unitOku"),
        legend: [legendItem("segmentProfit", "c-3"), legendItem("capex", "c-2"), legendItem("depreciation", "c-7")],
        draw: (host, width) => order.length ? hBars(host, {
          width, label: t("panelSegInvest"), format: tick, noteWidth: 8,
          rows: order.map((r) => ({ label: label(r.segment), values: [
            { value: r.profit, color: "c-3", valueLabel: amt(r.profit), tip: { title: label(r.segment), rows: [{ value: amt(r.profit), label: t("segmentProfit"), color: "c-3" }] } },
            { value: r.capex, color: "c-2", tip: { title: label(r.segment), rows: [{ value: amt(r.capex), label: t("capex"), color: "c-2" }] } },
            { value: r.depreciation, color: "c-7", tip: { title: label(r.segment), rows: [{ value: amt(r.depreciation), label: t("depreciation"), color: "c-7" }] } }] })),
        }) : empty(host, t("noData")),
      });
    }
    if (prev && !cmp.comparable) {
      const prior = cmp.previous.filter((r) => r.kind === "segment").sort((a, b) => (M.finite(b.revenue) ?? -Infinity) - (M.finite(a.revenue) ?? -Infinity));
      panels.push({
        title: t("panelSegPrevious"), unit: `${t("unitOku")} · ${fy(prev.fiscalPeriod)}`, wide: true,
        draw: (host, width) => prior.length ? hBars(host, {
          width, label: t("panelSegPrevious"), format: tick, noteHeader: t("margin"),
          rows: prior.map((r) => ({ label: label(r.segment), note: pct(r.margin), values: [{ value: r.revenue, color: "c-ghost-solid", valueLabel: amt(r.revenue), tip: tipRows(r, prev.fiscalPeriod) }] })),
        }) : empty(host, t("noData")),
      });
    }
    const rows = [
      ...cmp.current.map((r) => ({ ...r, fiscalPeriod: cur.fiscalPeriod })),
      ...(cmp.comparable ? [] : cmp.previous.map((r) => ({ ...r, fiscalPeriod: prev.fiscalPeriod }))),
    ];
    const change = cmp.comparable;
    const columnsList = [
      { key: "fiscalPeriod", label: t("period"), format: (r) => shortFy(r.fiscalPeriod) },
      { key: "segment", label: t("segment"), format: (r) => label(r.segment) + (r.conflict ? " ⚠" : ""), cls: (r) => (r.kind === "segment" ? "" : "muted") },
      { key: "kind", label: t("rowKind"), format: (r) => t("kind_" + r.kind) },
      { key: "revenue", label: t("revenue"), num: true, format: (r) => amt(r.revenue) },
      ...(change ? [{ key: "revenueChange", label: t("yoy"), num: true, format: (r) => M.signedPercent(r.revenueChange, state.lang) }] : []),
      { key: "profit", label: t("segmentProfit"), num: true, format: (r) => amt(r.profit) },
      ...(change ? [{ key: "profitChange", label: t("yoy"), num: true, format: (r) => M.signedPercent(r.profitChange, state.lang) }] : []),
      { key: "margin", label: t("margin"), num: true, format: (r) => pct(r.margin) },
      ...(change ? [{ key: "marginChange", label: t("marginChange"), num: true, format: (r) => M.points(r.marginChange, state.lang) }] : []),
      { key: "capex", label: t("capex"), num: true, format: (r) => amt(r.capex) },
      { key: "depreciation", label: t("depreciation"), num: true, format: (r) => amt(r.depreciation) },
      { key: "intersegment", label: t("intersegment"), num: true, format: (r) => amt(r.intersegment) },
    ];
    return {
      kpis, callout, panels: panels.length ? panels : [{ title: t("panelSegRevenue"), wide: true, draw: (host) => empty(host, t("noSegments")) }],
      table: { title: t("tableSegments"), unit: t("tableUnitOku"), columns: columnsList, rows,
        csv: { name: "segments", columns: columnsList.map((c) => c.key) } },
      sources: [cur, prev].filter(Boolean).map((r) => ({ label: `${t("viewSegments")} · ${fy(r.fiscalPeriod)}`, period: r.fiscalPeriod,
        source: reportSource(), docId: r.docId, date: r.submittedAt, url: r.sourceUrl })),
      notes: ["segRead1", "segRead2", "segRead3", "segRead4"],
    };
  },
};

const CASH_ROWS = [
  ["equityRatio", "ratio"], ["interestBearingDebt", "money"], ["cash", "money"], ["netDebt", "money"],
  ["ocf", "money"], ["icf", "money"], ["capex", "money"], ["fcf", "money"], ["dividends", "money"],
  ["buybacks", "money"], ["shareholderReturns", "money"], ["afterReturns", "money"],
];
const cashView = {
  id: "cash",
  build(d) {
    const rows = d.years.map((y) => ({ ...M.cashAllocation(y), standard: y.bs?.accountingStandard ?? y.cf?.accountingStandard }));
    const latest = rows.at(-1), before = rows.at(-2);
    if (!rows.some((r) => r.fiscalPeriod === state.cashYear)) state.cashYear = latest?.fiscalPeriod ?? null;
    const selected = rows.find((r) => r.fiscalPeriod === state.cashYear);
    const kpis = [
      { label: t("equityRatio"), value: pct(latest?.equityRatio),
        note: latest && before && latest.equityRatio !== null && before.equityRatio !== null ? fill("vsPrior", { v: M.points(latest.equityRatio - before.equityRatio, state.lang) }) : fy(latest?.fiscalPeriod) },
      { label: t("netDebt"), value: amt(latest?.netDebt), unit: t("unitOku"), note: latest?.netDebt < 0 ? t("netCash") : fy(latest?.fiscalPeriod) },
      { label: t("fcf"), value: amt(latest?.fcf), unit: t("unitOku"), tone: latest?.fcf < 0 ? "neg" : null, note: t("fcfNote") },
      { label: t("shareholderReturns"), value: amt(latest?.shareholderReturns), unit: t("unitOku"),
        note: latest?.payoutOfFcf != null ? fill("ofFcf", { v: pct(latest.payoutOfFcf) }) : t("returnsUnknown") },
    ];
    const stepLabel = { operatingCashFlow: "ocf", capitalExpenditure: "capex", otherInvesting: "otherInvesting", investingCashFlow: "icf",
      freeCashFlow: "fcf", dividendsPaid: "dividends", purchaseOfTreasuryStock: "buybacks", afterReturns: "afterReturns" };
    const stepColor = { operatingCashFlow: "c-1", capitalExpenditure: "c-2", otherInvesting: "c-muted", investingCashFlow: "c-2",
      freeCashFlow: "c-3", dividendsPaid: "c-4", purchaseOfTreasuryStock: "c-5", afterReturns: "c-3" };
    const part = (r, key, value, color) => ({ value, color, tip: { title: fy(r.fiscalPeriod), rows: [{ value: amt(value), label: t(key), color }] } });
    return {
      kpis,
      panels: [
        {
          title: t("panelCashUses"), unit: t("unitOku"), wide: true,
          legend: [legendItem("ocf", "c-1"), legendItem("capex", "c-2"), legendItem("otherInvesting", "c-muted"),
            legendItem("dividends", "c-4"), legendItem("buybacks", "c-5"), legendItem("fcf", "c-3", "dot")],
          draw: (host, width) => rows.length ? stackedColumns(host, {
            width, label: t("panelCashUses"), format: tick,
            categories: rows.map((r) => ({
              label: shortFy(r.fiscalPeriod),
              parts: [part(r, "ocf", r.ocf, "c-1"),
                ...(r.capex !== null && r.otherInvesting !== null ? [part(r, "capex", r.capex, "c-2"), part(r, "otherInvesting", r.otherInvesting, "c-muted")] : [part(r, "icf", r.icf, "c-2")]),
                part(r, "dividends", r.dividends, "c-4"), part(r, "buybacks", r.buybacks, "c-5")],
              marker: { value: r.fcf, color: "c-3", tip: { title: fy(r.fiscalPeriod), rows: [{ value: amt(r.fcf), label: t("fcf"), color: "c-3" }] } },
            })),
          }) : empty(host, t("noData")),
        },
        {
          title: t("panelWaterfall"), unit: `${t("unitOku")} · ${fy(selected?.fiscalPeriod)}`,
          controls: rows.map((r) => ({ text: shortFy(r.fiscalPeriod), pressed: r.fiscalPeriod === state.cashYear, onClick: () => { state.cashYear = r.fiscalPeriod; render(); } })),
          draw: (host, width) => selected ? waterfall(host, {
            width, label: t("panelWaterfall"), format: tick,
            steps: selected.steps.map((s) => ({ ...s, label: t("wf_" + stepLabel[s.key]), color: stepColor[s.key], valueLabel: amt(s.value),
              tip: { title: fy(selected.fiscalPeriod), rows: [{ value: amt(s.value), label: t(stepLabel[s.key]), color: stepColor[s.key] }] } })),
          }) : empty(host, t("noData")),
        },
        {
          title: t("panelStrength"), unit: t("strengthNote"),
          draw: (host, width) => {
            const top = document.createElement("div"), bottom = document.createElement("div");
            host.replaceChildren(top, bottom);
            lineChart(top, { width, height: 150, label: t("equityRatio"), format: (v) => M.percent(v, state.lang, 0),
              points: rows.map((r) => ({ label: shortFy(r.fiscalPeriod), value: r.equityRatio, valueLabel: pct(r.equityRatio),
                tip: { title: fy(r.fiscalPeriod), rows: [{ value: pct(r.equityRatio), label: t("equityRatio"), color: "c-1" }] } })) });
            columns(bottom, { width, height: 150, label: t("netDebt"), format: tick,
              points: rows.map((r) => ({ label: shortFy(r.fiscalPeriod), value: r.netDebt, valueLabel: amt(r.netDebt),
                tip: { title: fy(r.fiscalPeriod), rows: [{ value: amt(r.netDebt), label: `${t("netDebt")} · ${t("unitOku")}`, color: "c-7" }] } })) });
          },
        },
      ],
      table: {
        title: t("tableCash"), unit: t("tableUnitMixed"),
        columns: [{ key: "metric", label: t("metric"), format: (r) => t(r.metric) },
          ...rows.map((y) => ({ key: y.fiscalPeriod, label: shortFy(y.fiscalPeriod), num: true, format: (r) => (r.kind === "ratio" ? pct(r[y.fiscalPeriod]) : amt(r[y.fiscalPeriod])) }))],
        rows: CASH_ROWS.map(([metric, kind]) => ({ metric, kind, ...Object.fromEntries(rows.map((y) => [y.fiscalPeriod, y[metric]])) })),
        csv: { name: "cash-allocation", columns: ["metric", "kind", ...rows.map((y) => y.fiscalPeriod)] },
      },
      sources: d.years.flatMap((y) => [["viewCashBs", y.bs], ["viewCashCf", y.cf]].filter(([, r]) => r).map(([key, r]) => ({
        label: `${t(key)} · ${fy(y.fiscalPeriod)}`, period: y.fiscalPeriod, standard: r.accountingStandard,
        source: r.provenance?.source, docId: r.provenance?.docId, date: r.provenance?.announcedAt, url: r.provenance?.sourceUrl })))
        .reverse(),
      notes: ["cashRead1", "cashRead2", "cashRead3", "cashRead4"],
    };
  },
};

const PLAN_METRICS = ["revenue", "operatingIncome", "netIncome"];
const planView = {
  id: "plan",
  build(d) {
    const { groups, skipped } = M.forecastGroups(d.forecasts, d.years);
    const metric = state.planMetric;
    const metricName = state.lang === "en" ? t(metric).toLowerCase() : t(metric);
    const done = groups.filter((g) => g.actual), open = groups.filter((g) => !g.actual);
    const lastDone = done.at(-1), current = open.at(-1);
    const rated = done.filter((g) => g.achievement[metric] !== null);
    const met = rated.filter((g) => g.achievement[metric] >= 1).length;
    const dirs = current ? current.entries.slice(1).map((e) => e.directions[metric]) : [];
    const kpis = [
      { label: fill("kpiAchievement", { m: metricName }), value: pct(lastDone?.achievement[metric]), note: lastDone ? fy(lastDone.target) : t("noValue") },
      { label: t("kpiTrack"), value: rated.length ? `${met} / ${rated.length}` : "—", note: t("kpiTrackNote") },
      { label: fill("kpiCurrentPlan", { m: metricName }), value: amt(current?.latest.values[metric]), unit: t("unitOku"),
        note: current ? `${fy(current.target)} · ${t("vsInitial")} ${M.signedPercent(M.growth(current.latest.values[metric], current.initial.values[metric]), state.lang)}` : t("noValue") },
      { label: t("kpiRevisions"), value: current ? String(current.revisions) : "—",
        note: current ? `▲ ${dirs.filter((x) => x === "up").length} · ▼ ${dirs.filter((x) => x === "down").length} · ＝ ${dirs.filter((x) => x === "unchanged").length}` : t("noValue") },
    ];
    const notes = [];
    if (skipped) notes.push(fill("planSkipped", { n: skipped }));
    if (groups.some((g) => g.standardMismatch)) notes.push(t("planStandardMismatch"));
    const basis = (row) => (row.period === "FY" ? fill("basisFy", { p: shortFy(row.fiscalPeriod) }) : fill("basisQ", { q: row.period, p: shortFy(row.fiscalPeriod) }));
    const tableRows = [];
    for (const g of [...groups].reverse()) {
      g.entries.forEach((e, i) => tableRows.push({ target: g.target, stage: e.stage, stageText: (i === 0 ? t("initial") : fill("revisionN", { n: i })) + (e.late ? ` · ${t("late")}` : ""),
        basis: basis(e.row), announcedAt: e.row.announcedAt, source: e.row.source, ...e.values,
        revenueDirection: e.directions.revenue, operatingIncomeDirection: e.directions.operatingIncome, netIncomeDirection: e.directions.netIncome }));
      if (g.actual) {
        tableRows.push({ target: g.target, stage: "actual", stageText: t("actual"), basis: fill("basisFy", { p: shortFy(g.target) }),
          announcedAt: g.income?.provenance?.announcedAt, source: g.income?.provenance?.source, ...g.actual });
        tableRows.push({ target: g.target, stage: "achievement", stageText: t("achievementRow"), ...g.achievement });
      }
    }
    const cell = (field) => (r) => r.stage === "achievement" ? pct(r[field])
      : `${r[field + "Direction"] ? arrow(r[field + "Direction"]) + " " : ""}${amt(r[field])}`;
    const dirClass = (field) => (r) => ({ up: "pos", down: "neg" }[r[field + "Direction"]] ?? (r.stage === "achievement" ? "strong" : ""));
    return {
      kpis, callout: notes.length ? { tone: "warn", text: notes.join(" ") } : null,
      panels: [{
        title: fill("panelPlan", { m: t(metric) }), unit: t("unitOku"), wide: true,
        controls: PLAN_METRICS.map((m) => ({ text: t(m), pressed: m === metric, onClick: () => { state.planMetric = m; render(); } })),
        legend: [legendItem("initial", "c-hollow", "dot"), legendItem("revision", "c-1", "dot"), legendItem("actual", "c-3", "diamond")],
        draw: (host, width) => groups.length ? forecastPaths(host, {
          width, label: t("panelPlan"), format: tick,
          groups: groups.slice(-(width < 560 ? 3 : 5)).map((g) => ({
            label: shortFy(g.target),
            sub: g.actual ? `${t("achievementShort")} ${pct(g.achievement[metric])}` : t("inProgress"),
            points: g.entries.map((e, i) => ({ value: e.values[metric], tip: { title: `${shortFy(g.target)} · ${i === 0 ? t("initial") : fill("revisionN", { n: i })}`,
              rows: [{ value: `${arrow(e.directions[metric])} ${amt(e.values[metric])}`, label: t(metric), color: "c-1" }, { value: date(e.row.announcedAt), label: basis(e.row) }] } })),
            actual: g.actual ? { value: g.actual[metric], tip: { title: `${shortFy(g.target)} · ${t("actual")}`,
              rows: [{ value: amt(g.actual[metric]), label: t(metric), color: "c-3" }, { value: pct(g.achievement[metric]), label: t("achievementShort") }] } } : null,
          })),
        }) : empty(host, t("noForecasts")),
      }],
      table: {
        title: t("tablePlan"), unit: t("tableUnitOku"),
        columns: [
          { key: "target", label: t("targetFy"), format: (r) => shortFy(r.target) },
          { key: "stage", label: t("stage"), format: (r) => r.stageText, cls: (r) => (r.stage === "actual" || r.stage === "achievement" ? "strong" : "") },
          { key: "basis", label: t("basis"), format: (r) => r.basis ?? "" },
          { key: "announcedAt", label: t("announced"), format: (r) => (r.announcedAt ? date(r.announcedAt) : "") },
          ...PLAN_METRICS.map((m) => ({ key: m, label: t(m), num: true, format: cell(m), cls: dirClass(m) })),
          { key: "source", label: t("source"), format: (r) => (r.source ? sourceName(r.source) : "") },
        ],
        rows: tableRows,
        csv: { name: "plan-vs-results", columns: ["target", "stage", "basis", "announcedAt", "source", "revenue", "revenueDirection",
          "operatingIncome", "operatingIncomeDirection", "netIncome", "netIncomeDirection"] },
      },
      sources: [...groups].reverse().flatMap((g) => [
        ...g.entries.map((e, i) => ({ label: `${t("forecastRow")} · ${shortFy(g.target)} · ${i === 0 ? t("initial") : fill("revisionN", { n: i })}`,
          period: e.row.fiscalPeriod + " " + e.row.period, standard: e.row.accountingStandard, source: e.row.source, docId: e.row.docId, date: e.row.announcedAt, url: e.row.sourceUrl })),
        ...(g.income ? [{ label: `${t("actual")} · ${fy(g.target)}`, period: g.target, standard: g.income.accountingStandard,
          source: g.income.provenance?.source, docId: g.income.provenance?.docId, date: g.income.provenance?.announcedAt, url: g.income.provenance?.sourceUrl }] : []),
      ]),
      notes: ["planRead1", "planRead2", "planRead3", "planRead4"],
    };
  },
};

const peopleView = {
  id: "people",
  build(d) {
    const p = M.peopleSummary(d.workforce, d.diversity), dv = p.diversity;
    const salary = p.averageAnnualSalary === null ? "—" : state.lang === "ja" ? M.count(p.averageAnnualSalary / 1e4, "ja") : M.count(p.averageAnnualSalary / 1e6, "en", 2);
    const kpis = [
      { label: t("consolidatedEmployees"), value: M.count(p.consolidatedEmployees, state.lang), unit: t("persons"), note: fy(d.workforce?.fiscalPeriod) },
      { label: t("employees"), value: M.count(p.employees, state.lang), unit: t("persons"), note: t("nonConsolidated") },
      { label: t("averageAge"), value: M.count(p.averageAge, state.lang, 1), unit: t("years"), note: t("nonConsolidated") },
      { label: t("averageTenure"), value: M.count(p.averageTenureYears, state.lang, 1), unit: t("years"), note: t("nonConsolidated") },
      { label: t("averageSalary"), value: salary, unit: t("salaryUnit"), note: t("nonConsolidated") },
    ];
    const meterRow = (key, value, color) => ({ label: t(key), value, color, tip: { title: t(key), rows: [{ value: pct(value), label: t("reportingCompany"), color }] } });
    const panels = [
      {
        title: t("panelEmployees"), unit: t("persons"),
        legend: [legendItem("consolidated", "c-1"), legendItem("nonConsolidated", "c-3")],
        draw: (host, width) => p.bySegment.length ? hBars(host, { width, label: t("panelEmployees"), format: (v) => M.count(v, state.lang), noteWidth: 8,
          rows: p.bySegment.map((s) => ({ label: label(s.segment), muted: /全社|共通/.test(s.segment), values: [
            { value: s.consolidated, color: "c-1", valueLabel: M.count(s.consolidated, state.lang), tip: { title: label(s.segment), rows: [{ value: M.count(s.consolidated, state.lang), label: t("consolidated"), color: "c-1" }] } },
            { value: s.parent, color: "c-3", tip: { title: label(s.segment), rows: [{ value: M.count(s.parent, state.lang), label: t("nonConsolidated"), color: "c-3" }] } }] })) })
          : empty(host, t("noWorkforce")),
      },
      {
        title: t("panelDiversity"), unit: `% · ${t("reportingCompany")}`,
        draw: (host, width) => d.diversity ? meters(host, { width, label: t("panelDiversity"), format: pct,
          rows: [meterRow("femaleManagerRatio", dv.femaleManagerRatio, "c-1"), meterRow("maleChildcareLeaveRatio", dv.maleChildcareLeaveRatio, "c-3")] })
          : empty(host, t("noDiversity")),
      },
      {
        title: t("panelWageGap"), unit: t("wageGapUnit"), wide: true,
        draw: (host, width) => d.diversity ? meters(host, { width, label: t("panelWageGap"), format: pct, reference: 1,
          rows: [meterRow("wageGapAll", dv.wageGapAll, "c-7"), meterRow("wageGapRegular", dv.wageGapRegular, "c-7"), meterRow("wageGapNonRegular", dv.wageGapNonRegular, "c-7")] })
          : empty(host, t("noDiversity")),
      },
    ];
    const rows = [
      ...[["consolidatedEmployees", "count"], ["employees", "count"], ["averageAge", "years"], ["averageTenureYears", "years"], ["averageAnnualSalary", "yen"]]
        .map(([key, kind]) => ({ section: "workforce", entity: "", item: key, kind, value: p[key] })),
      ...p.bySegment.flatMap((s) => [{ section: "bySegmentConsolidated", entity: s.segment, item: "consolidatedEmployees", kind: "count", value: s.consolidated },
        { section: "bySegmentParent", entity: s.segment, item: "employees", kind: "count", value: s.parent }]),
      ...["femaleManagerRatio", "maleChildcareLeaveRatio", "wageGapAll", "wageGapRegular", "wageGapNonRegular"]
        .map((key) => ({ section: "diversity", entity: "reportingCompany", item: key, kind: "ratio", value: dv[key] })),
      ...p.subsidiaries.flatMap((s) => ["femaleManagerRatio", "maleChildcareLeaveRatio", "wageGapAll", "wageGapRegular", "wageGapNonRegular"]
        .map((key) => ({ section: "subsidiary", entity: s.name, item: key, kind: "ratio", value: s[key] }))),
    ];
    const show = (r) => ({ count: M.count(r.value, state.lang), years: M.count(r.value, state.lang, 1), yen: M.count(r.value, state.lang), ratio: pct(r.value) }[r.kind]);
    const callout = dv.maleChildcareLeaveBasis ? { tone: "info", text: fill("childcareBasis", { b: t("basis_" + dv.maleChildcareLeaveBasis) }) } : null;
    return {
      kpis, panels, callout,
      table: { title: t("tablePeople"), unit: t("tableUnitPeople"),
        columns: [{ key: "section", label: t("section"), format: (r) => t("sec_" + r.section) },
          { key: "entity", label: t("entity"), format: (r) => (r.entity === "reportingCompany" ? t("reportingCompany") : label(r.entity)) },
          { key: "item", label: t("metric"), format: (r) => t(r.item === "averageTenureYears" ? "averageTenure" : r.item === "averageAnnualSalary" ? "averageSalaryYen" : r.item) },
          { key: "value", label: t("value"), num: true, format: show }],
        rows, csv: { name: "people", columns: ["section", "entity", "item", "kind", "value"] } },
      sources: [["viewPeopleWorkforce", d.workforce], ["viewPeopleDiversity", d.diversity]].filter(([, r]) => r).map(([key, r]) => ({
        label: `${t(key)} · ${fy(r.fiscalPeriod)}`, period: r.fiscalPeriod, source: reportSource(), docId: r.docId, date: r.submittedAt, url: r.sourceUrl })),
      notes: ["peopleRead1", "peopleRead2", "peopleRead3", "peopleRead4"],
    };
  },
};

export const VIEWS = [segmentsView, cashView, planView, peopleView];

// =====================================================================================
// Workspace shell (shared by every view)
// =====================================================================================
function save() {
  try { localStorage.setItem("zenith-deep-dive", JSON.stringify({ theme: state.theme, lang: state.lang })); } catch { /* Storage may be unavailable. */ }
}
const statusText = () => fill(state.status, { at: date(state.data?.retrievedAt) });
function notice(key, error = false) {
  state.status = key;
  state.error = error;
  $("status").textContent = statusText();
  $("status").classList.toggle("error", error);
  $("status").classList.toggle("live", !error && state.mode === "live");
  $("status").classList.toggle("placeholder", key === "placeholderNotice");
}
function renderNav() {
  $("viewNav").replaceChildren(...VIEWS.map((view) => {
    const button = node("button", undefined, { type: "button", "data-view": view.id, "aria-current": view.id === state.view ? "page" : null });
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", ICONS[view.id] ?? "M4 4h16v16H4z");
    icon.append(path);
    button.append(icon, node("span", t("nav_" + view.id), { class: "long" }), node("span", t("viewShort_" + view.id), { class: "short" }));
    button.addEventListener("click", () => selectView(view.id));
    return button;
  }));
}
function selectView(id) {
  if (!VIEWS.some((v) => v.id === id)) return;
  state.view = id;
  history.replaceState(null, "", "#" + id);
  renderNav();
  render();
  $("main").focus({ preventScroll: true });
}
function renderEntity() {
  const d = state.data, latest = d?.years.at(-1);
  $("entityName").textContent = d ? d.symbol : t("noCompany");
  $("entityMeta").textContent = d ? [latest ? fill("fyEnd", { m: month(latest.fiscalPeriod) }) : null,
    latest?.is?.accountingStandard ? String(latest.is.accountingStandard).toUpperCase() : null].filter(Boolean).join(" · ") : "—";
  $("entityProfile").textContent = d ? fill("provided", { at: date(d.retrievedAt) }) : "";
  const badge = state.mode === "live" ? "live" : state.placeholder ? "placeholder" : "demo";
  $("entityBadge").textContent = t("badge_" + badge);
  $("entityBadge").className = "badge " + badge;
}
function legend(items) {
  const list = node("ul", undefined, { class: "legend" });
  for (const item of items) {
    const li = node("li");
    li.append(node("span", undefined, { class: `swatch ${item.shape} ${item.color}`, "aria-hidden": "true" }), document.createTextNode(item.text));
    list.append(li);
  }
  return list;
}
function drawPanels() {
  for (const { panel, host } of state.drawn ?? []) panel.draw(host, Math.max(260, Math.floor(host.clientWidth)));
}
function render() {
  translateStatic();
  renderEntity();
  const view = VIEWS.find((v) => v.id === state.view);
  $("viewTitle").textContent = t("view_" + view.id);
  $("viewLead").textContent = t("lead_" + view.id);
  $("viewEyebrow").textContent = t("eyebrow_" + view.id);
  $("workspace").hidden = !state.data;
  $("emptyState").hidden = Boolean(state.data) || state.busy;
  $("exportCsv").disabled = !state.data;
  if (!state.data) { state.drawn = []; return; }
  const built = view.build(state.data);
  state.built = built;
  $("kpis").replaceChildren(...built.kpis.map((k) => {
    const card = node("article", undefined, { class: "kpi" + (k.tone ? " " + k.tone : "") });
    const value = node("div", undefined, { class: "kpi-value" + (k.small ? " small" : "") });
    value.append(document.createTextNode(k.value));
    if (k.unit && k.value !== "—") value.append(node("span", k.unit, { class: "unit" }));
    card.append(node("h3", k.label), value, node("p", k.note ?? ""));
    return card;
  }));
  $("callout").hidden = !built.callout;
  if (built.callout) { $("callout").textContent = built.callout.text; $("callout").className = "callout " + built.callout.tone; }
  state.drawn = [];
  $("panels").replaceChildren(...built.panels.map((panel) => {
    const section = node("section", undefined, { class: "panel" + (panel.wide ? " wide" : "") });
    const head = node("header");
    const titles = node("div");
    titles.append(node("h2", panel.title), node("span", panel.unit ?? "", { class: "unit-label" }));
    head.append(titles);
    if (panel.controls) {
      const group = node("div", undefined, { class: "chips", role: "group", "aria-label": panel.title });
      for (const c of panel.controls) {
        const b = node("button", c.text, { type: "button", "aria-pressed": String(c.pressed) });
        b.addEventListener("click", c.onClick);
        group.append(b);
      }
      head.append(group);
    }
    section.append(head);
    if (panel.legend) section.append(legend(panel.legend));
    const host = node("div", undefined, { class: "chart-host" });
    section.append(host);
    state.drawn.push({ panel, host });
    return section;
  }));
  requestAnimationFrame(drawPanels);
  // Table (formatted for reading; CSV keeps raw JPY and fractions).
  $("tableTitle").textContent = built.table.title;
  $("tableUnit").textContent = built.table.unit;
  const table = node("table");
  const thead = node("thead"), headRow = node("tr");
  for (const c of built.table.columns) headRow.append(node("th", c.label, { scope: "col", class: c.num ? "num" : null }));
  thead.append(headRow);
  const tbody = node("tbody");
  for (const r of built.table.rows) {
    const tr = node("tr", undefined, { class: r.stage === "actual" || r.stage === "achievement" ? "emph" : null });
    for (const c of built.table.columns) tr.append(node("td", c.format ? c.format(r) : r[c.key] ?? "—", { class: [c.num ? "num" : "", c.cls ? c.cls(r) : ""].join(" ").trim() || null }));
    tbody.append(tr);
  }
  if (!built.table.rows.length) tbody.append(node("tr").appendChild(node("td", t("noData"), { colspan: built.table.columns.length })).parentNode);
  table.append(thead, tbody);
  $("tableWrap").replaceChildren(table);
  $("notes").replaceChildren(...built.notes.map((key) => node("li", t(key))), node("li", t("missingNote")));
  renderSources(built.sources);
}
function renderSources(sources) {
  const list = node("ul", undefined, { class: "sources" });
  for (const s of sources) {
    const li = node("li");
    const head = node("div", undefined, { class: "source-head" });
    head.append(node("strong", s.label), node("span", sourceName(s.source), { class: "pill " + (s.source ?? "") }));
    const meta = node("dl");
    for (const [key, value] of [["period", s.period], ["standard", s.standard ? String(s.standard).toUpperCase() : null], ["docId", s.docId], ["published", s.date ? date(s.date) : null]]) {
      meta.append(node("dt", t(key)), node("dd", value ?? "—"));
    }
    li.append(head, meta);
    const url = M.edinetUrl(s.url);
    if (url) li.append(node("a", t("openEdinet"), { href: url, target: "_blank", rel: "noreferrer noopener" }));
    else if (s.source === "tdnet") li.append(node("p", t("tdnetNoLink"), { class: "muted" }));
    list.append(li);
  }
  if (!sources.length) list.append(node("li", t("noSources")));
  $("provenance").replaceChildren(list);
}
function exportCsv() {
  const built = state.built;
  if (!built || !state.data) return;
  const { columns: keys, name } = built.table.csv;
  const rows = [keys, ...built.table.rows.map((r) => keys.map((k) => r[k] ?? null))];
  const blob = new Blob(["﻿" + M.csvText(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = node("a", undefined, { href: url, download: `${state.mode}-${state.data.symbol.replace(/[^A-Z0-9.-]/gi, "")}-${name}.csv` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function translateStatic() {
  document.documentElement.lang = state.lang;
  document.documentElement.dataset.theme = state.theme;
  document.title = `${t("title")} · ZENITH Code`;
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  for (const id of ["ja", "en"]) $(id).setAttribute("aria-pressed", String(state.lang === id));
  $("themeToggle").setAttribute("aria-label", t(state.theme === "dark" ? "toLight" : "toDark"));
  $("themeToggle").setAttribute("title", t(state.theme === "dark" ? "toLight" : "toDark"));
  $("demoMode").setAttribute("aria-pressed", String(state.mode === "demo"));
  $("liveMode").setAttribute("aria-pressed", String(state.mode === "live"));
  $("demoField").hidden = state.mode !== "demo";
  $("liveField").hidden = state.mode !== "live";
  $("setup").hidden = state.mode !== "live" || Boolean(state.config?.liveEnabled);
  $("load").textContent = state.busy ? t("loading") : t(state.mode === "demo" ? "loadDemo" : "loadLive");
  $("load").disabled = state.busy || !state.config || (state.mode === "live" && !state.config.liveEnabled);
  for (const id of ["demoMode", "liveMode", "company", "symbol"]) $(id).disabled = state.busy;
  $("requestNote").textContent = t(state.mode === "demo" ? "demoRequest" : "liveRequest");
  $("signupLink").href = `https://zenithcode.net${state.lang === "en" ? "/en" : ""}/sign-up`;
  $("termsLink").href = `https://zenithcode.net${state.lang === "en" ? "/en" : ""}/docs/display-rights`;
  const selected = $("company").value || "0";
  $("company").replaceChildren(...state.bundles.map((b, i) => {
    const latest = (b.incomeStatements ?? []).map((r) => r.fiscalPeriod).sort().at(-1);
    return node("option", latest ? `${b.symbol} · ${fill("fyEnd", { m: month(latest) })}` : b.symbol, { value: String(i) });
  }));
  $("company").value = selected;
  $("status").textContent = statusText();
}
function loadDemo() {
  const bundle = state.bundles[Number($("company").value) || 0];
  if (!bundle) return;
  try {
    state.data = M.normalizeBundle(bundle);
    notice(state.placeholder ? "placeholderNotice" : "demoNotice");
  } catch {
    state.data = null;
    notice("invalid_response", true);
  }
  state.cashYear = null;
  render();
}
async function fetchLive() {
  const symbol = $("symbol").value.trim().toUpperCase();
  $("symbol").value = symbol;
  if (!/^[0-9A-Z]{4,5}(\.T)?$/.test(symbol)) return notice("invalid_symbol", true);
  state.busy = true;
  state.data = null;
  notice("loading");
  render();
  try {
    const response = await fetch("/api/bundle", { method: "POST", headers: { "Content-Type": "application/json", "X-Local-Token": state.config.requestToken }, body: JSON.stringify({ symbol }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    state.data = M.normalizeBundle(result); // Throws on malformed or mismatched rows: nothing partial is shown.
    state.cashYear = null;
    notice("liveNotice");
  } catch (error) {
    state.data = null;
    notice(texts.en[error.message] ? error.message : "network", true);
  } finally {
    state.busy = false;
    render();
  }
}
function switchMode(mode) {
  state.mode = mode;
  state.data = null;
  notice(mode === "demo" ? "demoNotice" : state.config?.liveEnabled ? "livePrompt" : "setup_required");
  if (mode === "demo") loadDemo();
  else render();
}

async function start() {
  const hash = location.hash.slice(1) || params.get("view");
  if (VIEWS.some((v) => v.id === hash)) state.view = hash;
  $("ja").addEventListener("click", () => { state.lang = "ja"; save(); renderNav(); render(); });
  $("en").addEventListener("click", () => { state.lang = "en"; save(); renderNav(); render(); });
  $("themeToggle").addEventListener("click", () => { state.theme = state.theme === "dark" ? "light" : "dark"; save(); render(); });
  $("demoMode").addEventListener("click", () => switchMode("demo"));
  $("liveMode").addEventListener("click", () => switchMode("live"));
  $("company").addEventListener("change", loadDemo);
  $("queryForm").addEventListener("submit", (event) => { event.preventDefault(); state.mode === "demo" ? loadDemo() : fetchLive(); });
  $("exportCsv").addEventListener("click", exportCsv);
  addEventListener("hashchange", () => selectView(location.hash.slice(1)));
  let pending;
  new ResizeObserver(() => { cancelAnimationFrame(pending); pending = requestAnimationFrame(drawPanels); }).observe($("panels"));
  renderNav();
  translateStatic();
  try {
    const [config, demo] = await Promise.all([fetch("/api/config").then((r) => r.json()), fetch("/api/demo").then((r) => r.json())]);
    state.config = config;
    state.bundles = Array.isArray(demo.bundles) ? demo.bundles : [];
    state.placeholder = demo.placeholder === true;
    translateStatic();
    const index = Number(params.get("company"));
    if (Number.isInteger(index) && state.bundles[index]) $("company").value = String(index);
    loadDemo();
  } catch {
    notice("network", true);
    render();
  }
}
start();
