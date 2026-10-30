import * as M from "./model.mjs";
import { texts } from "./i18n.mjs";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const stored = (() => {
  try { return JSON.parse(localStorage.getItem("zenith-disclosure-reader") || "{}") ?? {}; } catch { return {}; }
})();
const state = {
  lang: params.get("lang") === "en" || (!params.has("lang") && stored.lang === "en") ? "en" : "ja",
  theme: ["light", "dark"].includes(params.get("theme")) ? params.get("theme") : ["light", "dark"].includes(stored.theme) ? stored.theme : null,
  mode: "demo", view: "text", config: null, demo: null, demoSelected: [], live: [], data: null, retrievedAt: null,
  busy: false, status: { key: "", vars: {}, error: false },
  section: M.SECTIONS.includes(params.get("section")) ? params.get("section") : "risks",
  keyword: params.get("q") ?? "", active: null, prompt: null,
};
const t = (key) => texts[state.lang][key] ?? texts.en[key] ?? key;
const fill = (key, values) => t(key).replace(/\{(\w+)\}/g, (_, k) => values[k] ?? "");
function node(tag, text, attrs = {}) {
  const el = document.createElement(tag);
  if (text !== undefined && text !== null) el.textContent = text;
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? "" : v);
  return el;
}
// CSSOM writes are allowed under the strict CSP (no inline style attributes).
const place = (el, props) => { for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v); return el; };
const save = () => { try { localStorage.setItem("zenith-disclosure-reader", JSON.stringify({ lang: state.lang, theme: state.theme })); } catch { /* storage may be blocked */ } };
const nameOf = (c) => (state.lang === "ja" ? c?.profile?.nameJa || c?.profile?.nameEn : c?.profile?.nameEn || c?.profile?.nameJa) || c?.symbol || "—";
const bySymbol = (symbol) => state.data?.companies.find((c) => c.symbol === symbol);
const pct = (v, digits = 1) => M.percent(v, state.lang, digits);
const fy = (period) => (period ? fill("fy", { p: period }) : "—");
function date(value, withTime = false) {
  if (typeof value !== "string" || !value) return "—";
  const iso = value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const zoned = /(Z|[+-]\d{2}:\d{2})$/.test(iso);
  const d = new Date(zoned ? iso : iso + "+09:00"); // EDINET times without a zone are JST
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat(state.lang === "ja" ? "ja-JP" : "en-GB", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) }).format(d);
}
function link(url, label = t("openEdinet")) {
  const href = M.edinetUrl(url);
  return href ? node("a", label, { href, target: "_blank", rel: "noreferrer noopener" }) : node("span", "—", { class: "muted" });
}
function table(columns, rows, opts = {}) {
  const el = node("table", undefined, { class: "grid" + (opts.compact ? " compact" : "") });
  const head = node("tr");
  for (const c of columns) head.append(node("th", c.label, { scope: "col", class: c.num ? "num" : c.cls ?? null }));
  const thead = node("thead");
  thead.append(head);
  const tbody = node("tbody");
  for (const r of rows) {
    const tr = node("tr", undefined, { class: opts.rowClass ? opts.rowClass(r) : null });
    for (const c of columns) {
      const td = node("td", undefined, { class: [c.num ? "num" : "", c.cls ?? ""].join(" ").trim() || null });
      const value = c.render ? c.render(r) : r[c.key];
      if (value instanceof Node) td.append(value);
      else td.textContent = value ?? "—";
      tr.append(td);
    }
    tbody.append(tr);
  }
  el.append(thead, tbody);
  const wrap = node("div", undefined, { class: "table-wrap", tabindex: "0" });
  wrap.append(el);
  return wrap;
}
function panel(title, note, ...children) {
  const el = node("section", undefined, { class: "panel" });
  const head = node("header");
  head.append(node("h2", title));
  if (note) head.append(node("p", note, { class: "panel-note" }));
  el.append(head, ...children.filter(Boolean));
  return el;
}
function companyTitle(c, extra) {
  const el = node("div", undefined, { class: "co" });
  el.append(node("span", nameOf(c), { class: "co-name", title: nameOf(c) }), node("span", [c.symbol, extra].filter(Boolean).join(" · "), { class: "co-meta" }));
  return el;
}
function sourcesTable(rows) {
  return table([
    { label: "", render: (r) => companyTitle(r.company) },
    { label: t("period"), render: (r) => fy(r.report?.fiscalPeriod) },
    { label: t("docId"), cls: "mono", render: (r) => r.report?.docId ?? "—" },
    { label: t("submitted"), render: (r) => date(r.report?.submittedAt) },
    { label: "", render: (r) => link(r.report?.sourceUrl) },
  ], rows, { compact: true });
}
const notes = (keys) => {
  const ul = node("ul", undefined, { class: "notes" });
  for (const key of keys) ul.append(node("li", t(key)));
  return ul;
};
const badge = (text, cls) => node("span", text, { class: "badge " + cls });

// =====================================================================================
// View registry. Each view renders the normalized comparison into #view. Add a view by pushing
// one more entry (and its nav_/eyebrow_/lead_ texts in i18n.mjs).
// =====================================================================================
const VIEWS = [
  { id: "text", render: renderText },
  { id: "holders", render: renderHolders },
  { id: "cross", render: renderCross },
  { id: "audit", render: renderAudit },
];

// ---------- 1. Text blocks ----------
let textParts = null;
function renderText(host, data) {
  const controls = node("div", undefined, { class: "controls" });
  const sections = node("div", undefined, { class: "seg wrap", role: "group", "aria-label": t("sectionPick") });
  for (const tag of M.SECTIONS) {
    const b = node("button", t("sec_" + tag), { type: "button", "aria-pressed": String(state.section === tag) });
    b.addEventListener("click", () => { state.section = tag; state.active = null; state.prompt = null; render(); });
    sections.append(b);
  }
  const search = node("form", undefined, { class: "keyword", role: "search" });
  const label = node("label", t("keyword"), { for: "keywordInput" });
  const input = node("input", undefined, { id: "keywordInput", type: "search", autocomplete: "off", spellcheck: "false", maxlength: "40", placeholder: t("keywordPlaceholder") });
  input.value = state.keyword;
  input.addEventListener("input", () => { state.keyword = input.value; state.prompt = null; refreshText(data); });
  search.addEventListener("submit", (e) => e.preventDefault());
  const tries = node("span", undefined, { class: "tries" });
  tries.append(node("span", t("suggestions"), { class: "muted" }));
  for (const word of ["為替", "サイバー", "人材"]) {
    const b = node("button", word, { type: "button", class: "chip" });
    b.addEventListener("click", () => { input.value = word; state.keyword = word; state.prompt = null; refreshText(data); });
    tries.append(b);
  }
  search.append(label, input, tries);
  const copy = node("button", t("copyPrompt"), { type: "button", class: "primary" });
  copy.addEventListener("click", () => copyPrompt(data));
  controls.append(sections, search, copy);
  const summary = node("p", undefined, { class: "summary", "aria-live": "polite" });
  const layout = node("div", undefined, { class: "text-layout" });
  const columns = node("div", undefined, { class: "columns", tabindex: "0" });
  const reader = node("aside", undefined, { class: "reader", "aria-live": "polite" });
  layout.append(columns, reader);
  const preview = node("div");
  host.append(controls, summary, layout, preview, notes(["textRead1", "textRead2", "textRead3", "textRead4"]));
  textParts = { summary, columns, reader, preview, sources: node("div") };
  host.append(panel(t("sources"), t("sourcesNote"), textParts.sources));
  refreshText(data);
}
function outlines(data) {
  return data.companies.map((c) => ({ company: c, block: c.texts[state.section], outline: M.sectionOutline(c.texts[state.section], state.keyword) }));
}
function refreshText(data) {
  if (!textParts) return;
  const rows = outlines(data);
  place(textParts.columns, { "--cols": String(rows.length) });
  textParts.columns.replaceChildren(...rows.map(textColumn));
  const word = state.keyword.trim();
  if (word) {
    const hits = rows.flatMap((r) => (r.outline?.headings ?? []).filter((h) => h.hits).map((h) => `${nameOf(r.company)}「${h.title}」`));
    textParts.summary.textContent = hits.length ? fill("keywordSummary", { k: word, list: hits.slice(0, 8).join("、") + (hits.length > 8 ? " …" : "") }) : fill("keywordNone", { k: word });
  } else textParts.summary.textContent = "";
  renderReader(rows);
  textParts.preview.replaceChildren();
  if (state.prompt) {
    const details = node("details", undefined, { class: "prompt-preview", open: state.prompt.failed });
    details.append(node("summary", t("promptPreview")), node("pre", state.prompt.text));
    textParts.preview.append(details);
  }
  textParts.sources.replaceChildren(sourcesTable(rows.map((r) => ({ company: r.company, report: r.block }))));
}
function textColumn({ company, outline }) {
  const col = node("section", undefined, { class: "col" });
  const head = node("header");
  head.append(companyTitle(company, outline ? fy(outline.fiscalPeriod) : null));
  const meta = node("p", undefined, { class: "col-meta" });
  if (outline) {
    meta.append(node("span", fill("chars", { n: M.number(outline.chars, state.lang) })), node("span", fill("headingsCount", { n: outline.headings.length })));
    if (state.keyword.trim()) meta.append(badge(fill("hits", { n: outline.totalHits }), outline.totalHits ? "hit" : "zero"));
  }
  head.append(meta);
  col.append(head);
  if (!outline) {
    col.append(node("p", t("noSection"), { class: "muted small" }));
    return col;
  }
  if (outline.truncated) col.append(node("p", t("truncated"), { class: "warn small" }));
  const list = node("ol", undefined, { class: "headings" });
  const item = (index, title, level, hits, extra = "") => {
    const li = node("li", undefined, { class: `lv${Math.min(level, 4)}` });
    const active = state.active?.symbol === company.symbol && state.active?.index === index;
    const b = node("button", undefined, { type: "button", class: ["h", hits ? "has-hit" : "", active ? "active" : "", extra].join(" ").trim(), "aria-pressed": String(active) });
    b.append(node("span", title, { class: "h-title" }));
    if (hits) b.append(node("span", String(hits), { class: "h-hits", "aria-label": fill("hits", { n: hits }) }));
    b.addEventListener("click", () => { state.active = { symbol: company.symbol, index }; refreshText(state.data); });
    li.append(b);
    return li;
  };
  const preamble = M.headingText(outline.parsed, -1);
  if (!outline.headings.length) list.append(item(-1, t("wholeText"), 1, outline.preambleHits, "whole"));
  else if (outline.preambleHits) list.append(item(-1, t("preamble"), 1, outline.preambleHits, "whole"));
  for (const h of outline.headings) list.append(item(h.index, h.title, h.level, h.hits));
  col.append(list);
  if (!outline.headings.length && !preamble) col.append(node("p", t("noHeadings"), { class: "muted small" }));
  const foot = node("footer", undefined, { class: "col-foot" });
  foot.append(node("span", `${t("docId")} ${outline.docId ?? "—"} · ${date(outline.submittedAt)}`, { class: "mono" }), link(outline.sourceUrl));
  col.append(foot);
  return col;
}
function renderReader(rows) {
  const host = textParts.reader;
  host.replaceChildren();
  const row = state.active && rows.find((r) => r.company.symbol === state.active.symbol);
  if (!row?.outline) {
    host.append(node("p", t("readerEmpty"), { class: "muted" }));
    return;
  }
  const { outline, company } = row;
  const heading = outline.headings[state.active.index];
  const text = M.headingText(outline.parsed, heading ? heading.index : -1);
  host.append(node("p", fill("readerOf", { company: nameOf(company), section: t("sec_" + state.section) }), { class: "eyebrow" }));
  host.append(node("h3", heading ? heading.title : outline.headings.length ? t("preamble") : t("wholeText")));
  const body = node("div", undefined, { class: "reader-body", tabindex: "0" });
  for (const part of M.highlightParts(text, state.keyword)) body.append(part.match ? node("mark", part.text) : document.createTextNode(part.text));
  const foot = node("p", undefined, { class: "reader-foot" });
  foot.append(node("span", `${fy(outline.fiscalPeriod)} · ${t("docId")} ${outline.docId ?? "—"}`, { class: "mono" }), link(outline.sourceUrl, t("openEdinetLong")));
  host.append(body, foot);
}
async function copyPrompt(data) {
  const word = state.keyword.trim();
  const companies = outlines(data).map(({ company, block, outline }) => ({
    name: nameOf(company), symbol: company.symbol, missing: !block,
    fiscalPeriod: outline?.fiscalPeriod, docId: outline?.docId, submittedAt: outline?.submittedAt, sourceUrl: outline?.sourceUrl,
    headings: (outline?.headings ?? []).map((h) => ({ level: h.level, title: h.title, hits: h.hits })),
  }));
  const text = M.buildPrompt(texts[state.lang], { sectionLabel: t("sec_" + state.section), keyword: word, companies });
  let failed = false;
  try { await navigator.clipboard.writeText(text); } catch { failed = true; }
  state.prompt = { text, failed };
  notice(failed ? "copyFailed" : "copied", { n: M.number(M.charCount(text), state.lang) }, failed);
  refreshText(data);
}

// ---------- 2. Shareholders ----------
function renderHolders(host, data) {
  const companies = data.companies;
  const common = M.commonHolders(companies);
  const commonByKey = new Map(common.map((c) => [c.key, c.entries.length]));
  const peers = M.peerHolders(companies);
  const peerKeys = new Set(companies.map((c) => M.companyKey(c.profile.nameJa)));
  const commonTable = common.length ? table([
    { label: t("holder"), cls: "name", render: (r) => r.name },
    ...companies.map((c) => ({ label: nameOf(c), num: true, render: (r) => {
      const e = r.entries.find((x) => x.symbol === c.symbol);
      return e ? `${pct(e.ratio, 2)} ${fill("rankShort", { n: e.rank })}` : "—";
    } })),
  ], common) : node("p", t("commonNone"), { class: "muted" });
  const top = node("div", undefined, { class: "two-up" });
  top.append(panel(t("commonTitle"), t("commonNote"), commonTable));
  const peerList = node("ul", undefined, { class: "lines" });
  for (const p of peers) peerList.append(node("li", fill("peerLine", { holder: nameOf(bySymbol(p.holder)), issuer: nameOf(bySymbol(p.issuer)), rank: p.rank, ratio: pct(p.ratio, 2) })));
  if (!peers.length) peerList.append(node("li", "—", { class: "muted" }));
  top.append(panel(t("peerTitle"), null, peerList));
  host.append(top);

  // Shareholding by category: one 100% bar per company.
  const legend = node("ul", undefined, { class: "legend" });
  for (const [i, key] of M.CATEGORY_ORDER.entries()) {
    const li = node("li");
    li.append(node("i", undefined, { class: `sw k${i}` }), node("span", t("cat_" + key)));
    legend.append(li);
  }
  const bars = node("div", undefined, { class: "stacks" });
  for (const c of companies) {
    const shares = M.categoryShares(c.shareholderCategories);
    const row = node("div", undefined, { class: "stack-row" });
    row.append(companyTitle(c, shares ? fy(shares.fiscalPeriod) : null));
    if (!shares) row.append(node("p", "—", { class: "muted" }));
    else {
      const bar = node("div", undefined, { class: "stack", role: "img", "aria-label": shares.parts.map((p) => `${t("cat_" + p.category)} ${pct(p.share)}`).join(", ") });
      for (const p of shares.parts) {
        const k = M.CATEGORY_ORDER.indexOf(p.category);
        const part = place(node("span", undefined, { class: `part k${k < 0 ? 6 : k}`, title: `${t("cat_" + p.category)} ${pct(p.share)}` }), { "--w": (p.share / shares.sum) * 100 + "%" });
        if (p.share >= 0.08) part.append(node("span", pct(p.share, 0)));
        bar.append(part);
      }
      row.append(bar);
    }
    bars.append(row);
  }
  host.append(panel(t("categoriesTitle"), t("categoriesNote"), legend, bars));

  const cards = node("div", undefined, { class: "cards" });
  for (const c of companies) {
    const card = node("article", undefined, { class: "card" });
    const period = c.majorShareholders[0]?.fiscalPeriod;
    card.append(companyTitle(c, period ? fy(period) : null));
    const own = [...c.majorShareholders, ...c.largeHolders].some((r) => M.isOwnName(r.holderName, c.profile));
    if (own) card.append(node("p", t("selfNotice"), { class: "warn small" }));
    if (!c.majorShareholders.length) card.append(node("p", t("noMajor"), { class: "muted" }));
    else card.append(node("h3", t("majorTitle")), table([
      { label: t("rank"), num: true, render: (r) => r.rank ?? "—" },
      { label: t("holder"), cls: "name", render: (r) => {
        const cell = node("span", undefined, { class: "holder" });
        cell.append(node("span", r.holderName ?? "—"));
        const key = M.holderKey(r.holderName);
        if (commonByKey.has(key)) cell.append(badge(fill("commonBadge", { n: commonByKey.get(key) }), "common"));
        if (peerKeys.has(key) && key !== M.companyKey(c.profile.nameJa)) cell.append(badge(t("peerBadge"), "peer"));
        if (M.isOwnName(r.holderName, c.profile)) cell.append(badge(t("selfBadge"), "self"));
        return cell;
      } },
      { label: t("ratio"), num: true, render: (r) => pct(r.ratio, 2) },
      { label: t("sharesK"), num: true, render: (r) => M.thousands(r.shares, state.lang) },
      { label: t("region"), cls: "nowrap", render: (r) => (r.region === "overseas" ? t("overseas") : r.region ?? "—") },
    ], c.majorShareholders, { compact: true }), node("p", t("ratioNote"), { class: "muted small" }));
    card.append(node("h3", t("largeTitle")));
    const large = M.largeHolderRows(c.largeHolders, 5);
    if (!large.length) card.append(node("p", t("largeNone"), { class: "muted small" }));
    else card.append(table([
      { label: t("reportDate"), cls: "nowrap", render: (r) => date(r.submittedAt) },
      { label: t("holder"), cls: "name", render: (r) => {
        const cell = node("span", undefined, { class: "holder" });
        cell.append(node("span", r.holderName ?? "—"));
        if (M.isOwnName(r.holderName, c.profile)) cell.append(badge(t("selfBadge"), "self"));
        if (r.duplicates > 1) cell.append(node("small", fill("merged", { n: r.duplicates }), { class: "muted" }));
        return cell;
      } },
      { label: t("ratio"), num: true, render: (r) => pct(r.ratio, 2) },
      { label: t("sharesK"), num: true, render: (r) => M.thousands(r.shares, state.lang) },
      { label: "", render: (r) => link(r.sourceUrl) },
    ], large, { compact: true }));
    cards.append(card);
  }
  host.append(cards);
  host.append(panel(t("sources"), t("sourcesNote"), sourcesTable(companies.map((c) => ({ company: c, report: c.shareholderCategories ?? c.majorShareholders[0] })))));
}

// ---------- 3. Cross-shareholdings ----------
function renderCross(host, data) {
  const companies = data.companies;
  const summaries = new Map(companies.map((c) => [c.symbol, M.crossSummary(c.crossShareholdings)]));
  const issues = (row) => (row ? `${M.number(row.issues, state.lang)}` : "—");
  const prior = (row) => (row && M.finite(row.priorIssues) !== null ? M.number(row.priorIssues, state.lang) : "—");
  // Filings give prior-year counts for pure-investment holdings only, so the other prior columns
  // appear only when some company actually reports them.
  const hasPrior = (key) => companies.some((c) => M.finite(summaries.get(c.symbol)?.[key]?.priorIssues) !== null);
  host.append(panel(t("crossSummaryTitle"), t("priorNote"), table([
    { label: "", render: (c) => companyTitle(c, summaries.get(c.symbol) ? fy(summaries.get(c.symbol).fiscalPeriod) : null) },
    { label: t("listedIssues"), num: true, render: (c) => issues(summaries.get(c.symbol)?.listed) },
    ...(hasPrior("listed") ? [{ label: `${t("listedIssues")}・${t("priorIssues")}`, num: true, render: (c) => prior(summaries.get(c.symbol)?.listed) }] : []),
    { label: t("unlistedIssues"), num: true, render: (c) => issues(summaries.get(c.symbol)?.unlisted) },
    ...(hasPrior("unlisted") ? [{ label: `${t("unlistedIssues")}・${t("priorIssues")}`, num: true, render: (c) => prior(summaries.get(c.symbol)?.unlisted) }] : []),
    { label: t("heldRows"), num: true, render: (c) => {
      const s = summaries.get(c.symbol);
      if (!s) return "—";
      const cell = node("span", M.number(s.held.length, state.lang));
      if (s.detailPartial) cell.append(node("sup", "*", { title: t("detailPartial") }));
      return cell;
    } },
    { label: t("soldRows"), num: true, render: (c) => (summaries.get(c.symbol) ? M.number(summaries.get(c.symbol).soldOut.length, state.lang) : "—") },
    { label: t("deemedRows"), num: true, render: (c) => (summaries.get(c.symbol) ? M.number(summaries.get(c.symbol).deemed.length, state.lang) : "—") },
    { label: t("pureListed"), num: true, render: (c) => issues(summaries.get(c.symbol)?.pureListed) },
    { label: `${t("pureListed")}・${t("priorIssues")}`, num: true, render: (c) => prior(summaries.get(c.symbol)?.pureListed) },
  ], companies), node("p", t("crossRead2"), { class: "muted small" })));

  const { links, mutual } = M.crossLinks(companies);
  const list = node("ul", undefined, { class: "lines" });
  for (const [a, b] of mutual) {
    const li = node("li");
    const line = (l) => fill("linkLine", { from: nameOf(bySymbol(l.from)), to: nameOf(bySymbol(l.to)), shares: M.thousands(l.shares, state.lang) });
    li.append(badge(t("mutual"), "peer"), node("strong", `${nameOf(bySymbol(a.from))} ⇄ ${nameOf(bySymbol(a.to))}`), node("span", fill("mutualLine", { a: line(a), b: line(b) })));
    list.append(li);
  }
  for (const l of links) {
    if (mutual.some(([a, b]) => a === l || b === l)) continue;
    const li = node("li");
    li.append(badge(t("oneWay"), "zero"), node("span", l.current
      ? fill("linkLine", { from: nameOf(bySymbol(l.from)), to: nameOf(bySymbol(l.to)), shares: M.thousands(l.shares, state.lang) })
      : fill("linkSold", { from: nameOf(bySymbol(l.from)), to: nameOf(bySymbol(l.to)), prior: M.thousands(l.priorShares, state.lang) })));
    list.append(li);
  }
  if (!links.length) list.append(node("li", t("noLinks"), { class: "muted" }));
  host.append(panel(t("crossLinksTitle"), t("crossRead3"), list));

  const peerKeys = new Map(companies.map((c) => [M.companyKey(c.profile.nameJa), c]));
  const holdingTable = (rows, self, withChange = true) => table([
    { label: t("name"), cls: "name", render: (r) => {
      const cell = node("span", undefined, { class: "holder" });
      cell.append(node("span", r.name ?? "—"));
      const peer = peerKeys.get(M.companyKey(r.name));
      if (peer && peer !== self) cell.append(badge(t("peerBadge"), "peer"));
      return cell;
    } },
    { label: t("shares"), num: true, render: (r) => M.thousands(r.shares, state.lang) },
    { label: t("priorShares"), num: true, render: (r) => M.thousands(r.priorShares, state.lang) },
    ...(withChange ? [{ label: t("change"), num: true, render: (r) => (r.change === null ? "—" : M.signed(Math.round(r.change / 1000), state.lang)) }] : []),
    { label: t("issuerHolds"), render: (r) => (r.issuerHoldsOwnShares ? (/^有/.test(r.issuerHoldsOwnShares) ? t("issuerHoldsYes") : /^無/.test(r.issuerHoldsOwnShares) ? t("issuerHoldsNo") : r.issuerHoldsOwnShares) : "—") },
    { label: t("rationale"), cls: "rationale", render: (r) => {
      if (!r.rationale) return "—";
      const b = node("button", r.rationale, { type: "button", class: "clamp", "aria-expanded": "false" });
      b.addEventListener("click", () => { const open = b.classList.toggle("open"); b.setAttribute("aria-expanded", String(open)); });
      return b;
    } },
  ], rows, { compact: true });
  for (const c of companies) {
    const s = summaries.get(c.symbol);
    const section = node("section", undefined, { class: "panel" });
    const head = node("header");
    head.append(companyTitle(c, s ? fy(s.fiscalPeriod) : null));
    section.append(head);
    if (!s) {
      section.append(node("p", t("noCross"), { class: "muted" }));
      host.append(section);
      continue;
    }
    if (s.detailMatchesSummary !== null) section.append(node("p", s.detailPartial ? t("detailPartial") : s.detailMatchesSummary ? t("detailMatches") : t("detailPartial"), { class: "panel-note" }));
    section.append(node("h3", `${t("heldTitle")}（${s.held.length}）`), s.held.length ? holdingTable(s.held, c) : node("p", "—", { class: "muted" }));
    if (s.soldOut.length) section.append(node("h3", `${t("soldTitle")}（${s.soldOut.length}）`), holdingTable(s.soldOut, c, false));
    if (s.deemed.length) section.append(node("h3", `${t("deemedTitle")}（${s.deemed.length}）`), holdingTable(s.deemed, c, false));
    for (const sub of s.subsidiaries) {
      section.append(node("h3", fill("subsidiaryTitle", { holder: t("holder_" + sub.holder), name: sub.companyName ?? "—" })));
      const rows = [...sub.held, ...sub.soldOut, ...sub.deemed];
      section.append(rows.length ? holdingTable(rows, c) : node("p", "—", { class: "muted" }));
    }
    host.append(section);
  }
  host.append(notes(["crossRead1", "crossRead2", "crossRead3", "crossRead4"]));
  host.append(panel(t("sources"), t("sourcesNote"), sourcesTable(companies.map((c) => ({ company: c, report: c.crossShareholdings })))));
}

// ---------- 4. Audit fees and main customers ----------
function ratioCell(value) {
  const cell = node("span", undefined, { class: "ratio-cell" });
  cell.append(node("span", pct(value)));
  if (M.finite(value) !== null) {
    const bar = node("span", undefined, { class: "mini", "aria-hidden": "true" });
    bar.append(place(node("b"), { "--w": Math.min(100, value * 100) + "%" }));
    cell.append(bar);
  }
  return cell;
}
function renderAudit(host, data) {
  const companies = data.companies;
  const rows = companies.flatMap((c) => {
    const list = M.auditRows(c.auditFees);
    return list.length ? list.map((r, i) => ({ ...r, company: c, first: i === 0, count: list.length })) : [{ company: c, first: true, empty: true }];
  });
  const m = (v) => M.millions(v, state.lang);
  host.append(panel(t("auditTitle"), t("auditNote"), table([
    { label: "", render: (r) => (r.first ? companyTitle(r.company, r.company.auditFees ? fy(r.company.auditFees.fiscalPeriod) : null) : "") },
    { label: t("auditPeriod"), cls: "nowrap", render: (r) => (r.empty ? t("noAudit") : t(r.period === "prior" ? "prior" : "current")) },
    { label: t("auditReporting"), num: true, render: (r) => (r.empty ? "" : m(r.auditReporting)) },
    { label: t("auditSubsidiaries"), num: true, render: (r) => (r.empty ? "" : m(r.auditSubsidiaries)) },
    { label: t("auditTotal"), num: true, cls: "strong", render: (r) => (r.empty ? "" : m(r.audit)) },
    { label: t("nonAudit"), num: true, render: (r) => (r.empty ? "" : m(r.nonAudit)) },
    { label: t("networkAudit"), num: true, render: (r) => (r.empty ? "" : m(r.networkAudit)) },
    { label: t("networkNonAudit"), num: true, render: (r) => (r.empty ? "" : m(r.networkNonAudit)) },
    { label: t("nonAuditRatio"), render: (r) => (r.empty ? "" : ratioCell(r.nonAuditRatio)) },
  ], rows, { rowClass: (r) => (r.first ? "group-start" : null) })));

  const blocks = node("div", undefined, { class: "cards" });
  for (const c of companies) {
    const result = M.customerRows(c.mainCustomers, c.revenue);
    const card = node("article", undefined, { class: "card" });
    card.append(companyTitle(c, result.fiscalPeriod ? fy(result.fiscalPeriod) : null));
    if (result.status === "none") card.append(node("p", t("noCustomers"), { class: "muted" }));
    else card.append(table([
      { label: t("customer"), cls: "name", render: (r) => r.customer ?? "—" },
      { label: t("segment"), render: (r) => r.segment ?? "—" },
      { label: t("auditPeriod"), cls: "nowrap", render: (r) => t(r.period === "prior" ? "prior" : "current") },
      { label: t("revenueM"), num: true, render: (r) => (r.unitMismatch ? "—" : m(r.revenue)) },
      { label: t("shareOfRevenue"), render: (r) => (r.unitMismatch ? node("span", t("unitMismatch"), { class: "warn small" })
        : r.share === null ? node("span", t("noRevenue"), { class: "muted small" }) : ratioCell(r.share)) },
    ], result.rows, { compact: true }));
    blocks.append(card);
  }
  host.append(panel(t("customersTitle"), t("customersNote"), blocks));
  host.append(panel(t("sources"), t("sourcesNote"), sourcesTable(companies.map((c) => ({ company: c, report: c.auditFees ?? c.mainCustomers })))));
}

// ---------- Frame: navigation, picker, status ----------
function renderNav() {
  const nav = $("viewNav");
  nav.replaceChildren(...VIEWS.map((v, i) => {
    const b = node("button", undefined, { type: "button", class: "nav-item", "aria-current": state.view === v.id ? "page" : null });
    b.append(node("span", String(i + 1).padStart(2, "0"), { class: "nav-no" }), node("span", t("nav_" + v.id)));
    b.addEventListener("click", () => selectView(v.id));
    return b;
  }));
}
function selectView(id) {
  if (!VIEWS.some((v) => v.id === id)) return;
  state.view = id;
  history.replaceState(null, "", "#" + id);
  render();
  $("main").focus({ preventScroll: true });
}
function notice(key, vars = {}, error = false) {
  state.status = { key, vars, error };
  $("status").textContent = key ? fill(key, vars) : "";
  $("status").dataset.kind = error ? "error" : "";
}
const ERRORS = ["upstream_failed", "invalid_response", "invalid_request", "busy", "local_only", "setup_required"];
const selection = () => (state.mode === "demo" ? state.demoSelected : state.live);
function renderPicker() {
  const picks = $("picks");
  picks.replaceChildren();
  if (state.mode === "demo") {
    const all = state.demo?.companies ?? [];
    for (const c of all) {
      const li = node("li", undefined, { class: "pick" });
      const label = node("label");
      const box = node("input", undefined, { type: "checkbox" });
      box.checked = state.demoSelected.includes(c.symbol);
      box.disabled = !box.checked && state.demoSelected.length >= M.MAX_COMPANIES;
      box.addEventListener("change", () => {
        state.demoSelected = box.checked ? all.map((x) => x.symbol).filter((s) => s === c.symbol || state.demoSelected.includes(s))
          : state.demoSelected.filter((s) => s !== c.symbol);
        showDemo();
      });
      label.append(box, node("span", nameOf(c), { class: "pick-name" }), node("span", c.symbol, { class: "pick-code" }));
      li.append(label);
      picks.append(li);
    }
  } else {
    for (const symbol of state.live) {
      const li = node("li", undefined, { class: "pick chip-pick" });
      const known = state.data?.companies.find((c) => c.symbol === M.plainSymbol(symbol));
      li.append(node("span", known ? nameOf(known) : symbol, { class: "pick-name" }), node("span", symbol, { class: "pick-code" }));
      const x = node("button", "×", { type: "button", class: "remove", "aria-label": `${t("remove")} ${symbol}` });
      x.disabled = state.busy;
      x.addEventListener("click", () => { state.live = state.live.filter((s) => s !== symbol); renderPicker(); });
      li.append(x);
      picks.append(li);
    }
  }
  $("addForm").hidden = state.mode !== "live";
  $("addInput").disabled = state.busy || state.live.length >= M.MAX_COMPANIES;
  $("countHint").textContent = fill("countHint", { n: selection().length, max: M.MAX_COMPANIES });
  $("pickHint").textContent = state.mode === "demo" ? fill("pickHintDemo", { n: state.demo?.companies.length ?? 0 }) : t("pickHintLive");
  $("loadButton").hidden = state.mode === "demo";
  $("loadButton").textContent = state.busy ? t("loading") : t("fetch");
  $("loadButton").disabled = state.busy || !state.config?.liveEnabled;
  $("loadButton").setAttribute("aria-busy", String(state.busy));
  $("requestNote").textContent = state.mode === "demo" ? t("requestDemo") : fill("requestLive", { n: Math.max(M.MIN_COMPANIES, state.live.length) * 13 });
  $("setup").hidden = state.mode !== "live" || Boolean(state.config?.liveEnabled);
  $("demoMode").setAttribute("aria-pressed", String(state.mode === "demo"));
  $("liveMode").setAttribute("aria-pressed", String(state.mode === "live"));
  for (const id of ["demoMode", "liveMode"]) $(id).disabled = state.busy;
}
function addCode(event) {
  event.preventDefault();
  const symbol = $("addInput").value.normalize("NFKC").trim().toUpperCase();
  if (!M.SYMBOL.test(symbol)) return notice("errSymbol", {}, true);
  if (state.live.some((s) => M.plainSymbol(s) === M.plainSymbol(symbol))) return notice("errDuplicate", {}, true);
  if (state.live.length >= M.MAX_COMPANIES) return notice("errMax", {}, true);
  state.live.push(symbol);
  $("addInput").value = "";
  notice("");
  renderPicker();
}
function showDemo() {
  state.active = null;
  state.prompt = null;
  if (state.demoSelected.length < M.MIN_COMPANIES) {
    state.data = null;
    notice("errMin", {}, true);
  } else {
    // The saved snapshot goes through the same validation as a live fetch.
    try {
      state.data = M.normalizeBundle({ retrievedAt: state.demo.retrievedAt, companies: state.demo.companies.filter((c) => state.demoSelected.includes(c.symbol)) });
      state.retrievedAt = state.demo.retrievedAt;
      notice("demoNotice", { at: date(state.demo.retrievedAt) });
    } catch {
      state.data = null;
      notice("invalid_response", {}, true);
    }
  }
  render();
}
async function fetchLive() {
  if (state.live.length < M.MIN_COMPANIES) return notice("errMin", {}, true);
  state.busy = true;
  state.data = null; // a failed fetch never leaves the previous companies on screen
  state.active = null;
  state.prompt = null;
  notice("loadingLive", { n: state.live.length });
  render();
  try {
    const response = await fetch("/api/compare", { method: "POST", headers: { "Content-Type": "application/json", "X-Local-Token": state.config.requestToken },
      body: JSON.stringify({ symbols: state.live }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "network");
    state.data = M.normalizeBundle(result, state.live);
    state.retrievedAt = result.retrievedAt;
    notice("liveNotice", { at: date(result.retrievedAt, true) });
  } catch (error) {
    state.data = null;
    notice(ERRORS.includes(error.message) ? error.message : "network", {}, true);
  } finally {
    state.busy = false;
    render();
  }
}
function switchMode(mode) {
  if (state.busy) return;
  state.mode = mode;
  state.data = null;
  if (mode === "demo") return showDemo();
  notice(state.config?.liveEnabled ? "livePrompt" : "setup_required", {}, !state.config?.liveEnabled);
  render();
}

function applyTheme() {
  const dark = (state.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
  if (state.theme) document.documentElement.dataset.theme = state.theme;
  else delete document.documentElement.dataset.theme;
  $("themeToggle").setAttribute("aria-label", t(dark ? "toLight" : "toDark"));
  $("themeToggle").setAttribute("title", t(dark ? "toLight" : "toDark"));
  $("themeToggle").dataset.dark = String(dark);
}
function translateStatic() {
  document.documentElement.lang = state.lang;
  document.title = `${t("title")} · ZENITH Code`;
  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll("[data-i18n-label]")) el.setAttribute("aria-label", t(el.dataset.i18nLabel));
  for (const id of ["ja", "en"]) $(id).setAttribute("aria-pressed", String(state.lang === id));
  $("signupLink").href = `https://zenithcode.net${state.lang === "en" ? "/en" : ""}/sign-up`;
  $("termsLink").href = `https://zenithcode.net${state.lang === "en" ? "/en" : ""}/docs/display-rights`;
  if (state.status.key) $("status").textContent = fill(state.status.key, state.status.vars);
  applyTheme();
}
function render() {
  translateStatic();
  renderNav();
  renderPicker();
  const view = VIEWS.find((v) => v.id === state.view) ?? VIEWS[0];
  $("viewEyebrow").textContent = t("eyebrow_" + view.id);
  $("viewTitle").textContent = t("nav_" + view.id);
  $("viewLead").textContent = t("lead_" + view.id);
  const host = $("view");
  host.replaceChildren();
  host.dataset.view = view.id;
  textParts = null;
  const ready = Boolean(state.data && state.data.companies.length >= M.MIN_COMPANIES);
  $("emptyState").hidden = ready;
  $("attribution").textContent = ready ? fill("attribution", { at: date(state.retrievedAt, state.mode === "live") }) : "";
  if (ready) view.render(host, state.data);
}

async function start() {
  const hash = location.hash.slice(1) || params.get("view");
  if (VIEWS.some((v) => v.id === hash)) state.view = hash;
  $("ja").addEventListener("click", () => { state.lang = "ja"; save(); render(); });
  $("en").addEventListener("click", () => { state.lang = "en"; save(); render(); });
  $("themeToggle").addEventListener("click", () => { state.theme = $("themeToggle").dataset.dark === "true" ? "light" : "dark"; save(); applyTheme(); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
  $("demoMode").addEventListener("click", () => switchMode("demo"));
  $("liveMode").addEventListener("click", () => switchMode("live"));
  $("addForm").addEventListener("submit", addCode);
  $("loadButton").addEventListener("click", fetchLive);
  addEventListener("hashchange", () => selectView(location.hash.slice(1)));
  render();
  try {
    const [config, demo] = await Promise.all([fetch("/api/config").then((r) => r.json()), fetch("/api/demo").then((r) => r.json())]);
    state.config = config;
    state.demo = demo && Array.isArray(demo.companies) ? demo : { companies: [] };
    const wanted = (params.get("companies") ?? "").split(",").filter(Boolean);
    const codes = state.demo.companies.map((c) => c.symbol);
    state.demoSelected = wanted.length ? codes.filter((s) => wanted.includes(s)) : codes.slice(0, M.MAX_COMPANIES);
    showDemo();
  } catch {
    notice("network", {}, true);
    render();
  }
}
start();
