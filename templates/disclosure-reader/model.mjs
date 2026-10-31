// Pure functions shared by the browser and the offline Node tests.
// Amounts stay in JPY, share counts in shares, ratios as fractions (0.125 = 12.5%). Missing stays null, never 0.
export const SECTIONS = ["risks", "policy", "rnd", "capex", "audits"];
export const MIN_COMPANIES = 2;
export const MAX_COMPANIES = 5;
export const SYMBOL = /^[0-9A-Z]{4,5}(?:\.T)?$/;
export const finite = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
export const plainSymbol = (value) => String(value ?? "").replace(/\.T$/, "");
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
export const isPeriod = (value) => typeof value === "string" && PERIOD.test(value);
const fail = () => {
  throw new Error("invalid_response");
};
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const list = (value, limit) => {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || value.length > limit || value.some((row) => !isObject(row))) fail();
  return value;
};

export function addMonths(period, months) {
  if (!isPeriod(period)) return null;
  const total = Number(period.slice(0, 4)) * 12 + Number(period.slice(5)) - 1 + months;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function edinetUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === "edinet-fsa.go.jp" || host.endsWith(".edinet-fsa.go.jp")) ? url.href : null;
  } catch {
    return null;
  }
}

// ---------- Response validation -------------------------------------------------
// Validate the server's fetch_bundle output (live, or saved in demo.json). Anything malformed or
// belonging to another company stops the whole display: nothing partial is shown.
function sameCompany(row, symbol) {
  if (!isObject(row) || plainSymbol(row.symbol) !== symbol) fail();
  return row;
}
function single(row, symbol) {
  return row === null || row === undefined ? null : sameCompany(row, symbol);
}
function company(raw) {
  if (!isObject(raw) || typeof raw.symbol !== "string" || !SYMBOL.test(raw.symbol)) fail();
  const symbol = plainSymbol(raw.symbol);
  const profile = sameCompany(raw.profile, symbol);
  if (!isObject(raw.texts) || Object.keys(raw.texts).some((key) => !SECTIONS.includes(key))) fail();
  const texts = {};
  for (const tag of SECTIONS) {
    const block = single(raw.texts[tag], symbol);
    if (block && typeof block.content !== "string") fail();
    texts[tag] = block;
  }
  const categories = single(raw.shareholderCategories, symbol);
  if (categories) list(categories.categories, 20);
  const cross = single(raw.crossShareholdings, symbol);
  if (cross) for (const key of ["holders", "summary", "holdings"]) list(cross[key], 600);
  const audit = single(raw.auditFees, symbol);
  if (audit) list(audit.fees, 4);
  const customers = single(raw.mainCustomers, symbol);
  if (customers) list(customers.customers, 60);
  return {
    symbol, profile, texts,
    majorShareholders: list(raw.majorShareholders, 40).map((row) => sameCompany(row, symbol)),
    shareholderCategories: categories,
    largeHolders: list(raw.largeHolders, 60).map((row) => sameCompany(row, symbol)),
    crossShareholdings: cross,
    auditFees: audit,
    mainCustomers: customers,
    revenue: list(raw.revenue, 5).map((row) => sameCompany(row, symbol)),
  };
}
export function normalizeBundle(result, symbols) {
  if (!isObject(result) || !Array.isArray(result.companies) || !result.companies.length || result.companies.length > 8) fail();
  const companies = result.companies.map(company);
  if (new Set(companies.map((c) => c.symbol)).size !== companies.length) fail();
  if (symbols && companies.map((c) => c.symbol).join() !== symbols.map(plainSymbol).join()) fail();
  return { retrievedAt: typeof result.retrievedAt === "string" ? result.retrievedAt : null, companies };
}

// ---------- 1. Headings of annual-report sections ----------------------------------
// Marker families seen in Japanese annual reports: "（１）" "(1)" "①" "1." "ⅰ)" "ア." "a." "【…】" "＜…＞" "■".
const MARKERS = [
  ["paren-num", /^[（(]\s*([0-9０-９]{1,2})\s*[）)]\s*(.*)$/],
  ["circled", /^([①-⑳㉑-㉟])\s*(.*)$/],
  ["num-dot", /^([0-9０-９]{1,2})\s*[.．](?![0-9０-９])\s*(.*)$/],
  ["num-paren", /^([0-9０-９]{1,2})\s*[)）]\s*(.*)$/],
  ["roman", /^[（(]?\s*([ⅰ-ⅻⅠ-Ⅻ]{1,4})\s*[)）.．]\s*(.*)$/],
  ["paren-kana", /^[（(]\s*([ア-ン])\s*[）)]\s*(.*)$/],
  ["kana-dot", /^([ア-ン])\s*[.．、]\s*(.*)$/],
  ["paren-alpha", /^[（(]\s*([a-zａ-ｚ])\s*[）)]\s*(.*)$/],
  ["alpha-dot", /^([a-zａ-ｚ])\s*[.．]\s*(.*)$/],
  ["bracket", /^[【＜<〈《［[]([^】＞>〉》］\]]{1,60})[】＞>〉》］\]]\s*(.*)$/],
  ["bullet", /^([■□◆◇●○◎▼▽▶▷])\s*(.*)$/],
  ["paren-word", /^[（(]([^（()）]{4,24})[）)]$/],
];
const MAX_TITLE = 80;
const FIRST = new Set(["1", "i", "I", "ア", "a"]);
const length = (text) => Array.from(text).length;
const SECTION_TITLE = /【[^】]+】\s*$/;
const WORDLIKE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z]/u;
const cleanTitle = (text) => text.replace(/\s+/g, " ").trim().replace(/[：:]$/, "").trim();
const titleOk = (title) => Boolean(title) && length(title) <= MAX_TITLE && !/[。．]$/.test(title) && WORDLIKE.test(title);

function marked(line) {
  for (const [type, pattern] of MARKERS) {
    const match = line.match(pattern);
    if (!match) continue;
    if (type === "paren-word") {
      const inner = match[1].trim();
      return /^(注|※|単位)/.test(inner) ? null : { type, marker: "", rest: inner };
    }
    if (type === "bracket") return { type, marker: "", rest: [match[1].trim(), match[2].trim()].filter(Boolean).join(" ") };
    return { type, marker: match[1], rest: match[2] };
  }
  return null;
}

// Character count of the text the template received (code points), not the API's `chars`.
export const charCount = (text) => (typeof text === "string" ? length(text) : 0);

export function extractHeadings(content) {
  const lines = typeof content === "string" ? content.split(/\r?\n/) : [];
  const found = [];
  let seen = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    seen += 1;
    if (seen <= 2 && SECTION_TITLE.test(line)) continue; // "３ 【事業等のリスク】"
    const hit = marked(line);
    if (!hit) continue;
    let title = cleanTitle(hit.rest);
    let end = i;
    if (!title) {
      // A marker on its own line ("(1)") takes the next line as its title.
      const next = lines.findIndex((l, k) => k > i && l.trim());
      if (next < 0) continue;
      title = cleanTitle(lines[next]);
      end = next;
    } else if (!titleOk(title)) {
      // "①　経済状況　当社は…。": a title followed by text on the same line.
      const gap = hit.rest.indexOf("　", 2);
      title = gap > 0 && gap <= 40 ? cleanTitle(hit.rest.slice(0, gap)) : "";
    }
    if (!titleOk(title)) continue;
    found.push({ type: hit.type, marker: hit.marker, title, line: i, endLine: end });
  }
  // Repeated labels such as ＜リスク＞ ＜対応策＞ under every item are not headings.
  const counts = new Map();
  for (const h of found) counts.set(h.title, (counts.get(h.title) ?? 0) + 1);
  let headings = found.filter((h) => counts.get(h.title) < 3);
  // Unmarked short lines directly above the first item of a numbered list
  // ("市場及び事業に関するリスク" over "(1) …"). Lines above "(3)" or "b." are body text.
  const starts = new Set(headings.filter((h) => FIRST.has(h.marker.normalize("NFKC"))).map((h) => h.line));
  const taken = new Set(headings.flatMap((h) => [h.line, h.endLine]));
  const plain = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || taken.has(i) || marked(line) || SECTION_TITLE.test(line) || /^[・※]/.test(line)) continue;
    const next = lines.findIndex((l, k) => k > i && l.trim());
    if (next < 0 || !starts.has(next)) continue;
    const title = cleanTitle(line);
    if (titleOk(title) && length(title) <= 30 && !/[、，,]$/.test(title)) plain.push({ type: "plain", marker: "", title, line: i, endLine: i });
  }
  headings = [...headings, ...plain].sort((a, b) => a.line - b.line);
  // Levels follow the nesting of marker families: a family not open yet starts a deeper level,
  // a family already open closes everything below it ("(2)" after "①" goes back to level 1).
  const open = [];
  return { lines, headings: headings.map((h, index) => {
    const at = open.indexOf(h.type);
    if (at >= 0) open.length = at + 1;
    else open.push(h.type);
    return { ...h, index, level: open.length };
  }) };
}

// Text of one heading: from its line to the next heading at the same or a higher level
// (so a large heading includes its sub-headings). `own` stops at the next heading of any level.
export function headingText(parsed, index, own = false) {
  const { lines, headings } = parsed;
  if (index === -1) {
    const first = headings.length ? headings[0].line : lines.length;
    return lines.slice(0, first).join("\n").trim();
  }
  const h = headings[index];
  if (!h) return "";
  const next = headings.find((other) => other.index > index && (own || other.level <= h.level));
  return lines.slice(h.line, next ? next.line : lines.length).join("\n").trim();
}

// ---------- Keyword search -----------------------------------------------------------
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Half-width and full-width forms match each other (ＡＩ / AI, ＤＸ / DX).
export function keywordPattern(keyword) {
  const word = String(keyword ?? "").trim();
  if (!word) return null;
  const half = word.normalize("NFKC");
  const full = Array.from(half).map((ch) => {
    const code = ch.codePointAt(0);
    return code >= 0x21 && code <= 0x7e ? String.fromCodePoint(code + 0xfee0) : ch === " " ? "　" : ch;
  }).join("");
  const variants = [...new Set([word, half, full])].sort((a, b) => b.length - a.length);
  return new RegExp(variants.map(escape).join("|"), "giu");
}
export function countMatches(text, keyword) {
  const pattern = keyword instanceof RegExp ? keyword : keywordPattern(keyword);
  if (!pattern || typeof text !== "string") return 0;
  return (text.match(pattern) ?? []).length;
}
// [{text, match}] pieces for rendering highlights without innerHTML.
export function highlightParts(text, keyword) {
  const pattern = keywordPattern(keyword);
  if (!pattern || !text) return [{ text: text ?? "", match: false }];
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), match: false });
    parts.push({ text: m[0], match: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false });
  return parts;
}

// Per company: every heading with its own keyword hits, the text before the first heading,
// and the section total.
export function sectionOutline(block, keyword) {
  if (!block) return null;
  const parsed = extractHeadings(block.content);
  const pattern = keywordPattern(keyword);
  const headings = parsed.headings.map((h) => ({ ...h, hits: pattern ? countMatches(headingText(parsed, h.index, true), pattern) : 0 }));
  const preamble = headingText(parsed, -1);
  return {
    parsed, headings,
    chars: charCount(block.content),
    preambleHits: pattern ? countMatches(preamble, pattern) : 0,
    totalHits: pattern ? countMatches(block.content, pattern) : 0,
    fiscalPeriod: block.fiscalPeriod ?? null, docId: block.docId ?? null, submittedAt: block.submittedAt ?? null,
    sourceUrl: edinetUrl(block.sourceUrl), truncated: block.truncated === true,
  };
}

// The prompt to paste into an AI assistant: section, headings and sources only; the report text
// itself is never copied (the reader opens the filing on EDINET for that).
export function buildPrompt(words, { sectionLabel, keyword, companies }) {
  const out = [words.promptIntro.replace("{section}", sectionLabel)];
  if (keyword) out.push(words.promptKeyword.replace("{keyword}", keyword));
  out.push("", ...words.promptRules.map((rule) => `- ${rule}`), "");
  for (const c of companies) {
    out.push(`## ${c.name} (${c.symbol})`);
    const source = [c.fiscalPeriod && words.promptPeriod.replace("{period}", c.fiscalPeriod),
      c.docId && `${words.promptDoc} ${c.docId}`, c.submittedAt && `${words.promptSubmitted} ${String(c.submittedAt).slice(0, 10)}`,
      c.sourceUrl].filter(Boolean).join(" / ");
    out.push(`${words.promptSource}: ${source || words.promptNoSource}`);
    if (!c.headings.length) out.push(`- ${c.missing ? words.promptMissing : words.promptNoHeadings}`);
    for (const h of c.headings) out.push(`${"  ".repeat(Math.max(0, h.level - 1))}- ${h.title}${keyword && h.hits ? " ★" : ""}`);
    out.push("");
  }
  out.push(words.promptAttribution);
  return out.join("\n");
}

// ---------- 2. Shareholders ------------------------------------------------------------
// Names are compared after NFKC and without corporate suffixes and spaces:
// "トヨタ自動車㈱" = "トヨタ自動車株式会社" = "トヨタ自動車", "日本生命保険（相）" = "日本生命保険相互会社".
export function companyKey(name) {
  return String(name ?? "").normalize("NFKC")
    .replace(/\((?:注|※)[^)]*\)/g, "")
    .replace(/株式会社|有限会社|合同会社|相互会社|\((?:株|有|相)\)/g, "")
    .replace(/[\s・,.､、]/g, "")
    .toUpperCase();
}
// Holder names also drop the trust-account suffix: "（信託口）" "(信託口４)" "(投信口)".
export const holderKey = (name) => companyKey(String(name ?? "").normalize("NFKC").replace(/\((?:信託口|投信口)[0-9]*\)\s*$/, ""));

export function isOwnName(holderName, profile) {
  if (typeof holderName !== "string") return false;
  if (/自己株式|自己名義/.test(holderName)) return true;
  const own = companyKey(profile?.nameJa);
  return Boolean(own) && holderKey(holderName) === own;
}

// Holders that appear in the top-10 list of two or more of the compared companies.
export function commonHolders(companies) {
  const byKey = new Map();
  for (const c of companies) {
    for (const row of c.majorShareholders) {
      const key = holderKey(row.holderName);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, { key, name: row.holderName, entries: [] });
      const entry = byKey.get(key);
      if (!entry.entries.some((e) => e.symbol === c.symbol)) entry.entries.push({ symbol: c.symbol, rank: row.rank, ratio: finite(row.ratio) });
    }
  }
  return [...byKey.values()].filter((e) => e.entries.length >= 2)
    .sort((a, b) => b.entries.length - a.entries.length || a.name.localeCompare(b.name, "ja"));
}

// Compared companies that appear as a holder in another compared company's top-10 list.
export function peerHolders(companies) {
  const keys = new Map(companies.map((c) => [companyKey(c.profile.nameJa), c.symbol]));
  const out = [];
  for (const c of companies)
    for (const row of c.majorShareholders) {
      const holder = keys.get(holderKey(row.holderName));
      if (holder && holder !== c.symbol) out.push({ holder, issuer: c.symbol, rank: row.rank, ratio: finite(row.ratio), shares: finite(row.shares) });
    }
  return out;
}

// Large-shareholding reports: one row per report (docId). A joint report lists each joint holder
// as its own row with the same docId; the report's ratio is the joint total (groupRatio), and the
// largest holder leads. Reports with the same holder, shares and ratio (amendments, rows without a
// docId) are one filing reported more than once and are shown once. Newest first, at most `limit`.
export function largeHolderRows(rows, limit = 5) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.docId ? `doc|${row.docId}` : [String(row.holderName ?? "").trim(), finite(row.shares), finite(row.ratio)].join("|");
    const group = groups.get(key);
    if (!group) groups.set(key, { ...row, holders: [row], duplicates: 1 });
    else {
      group.holders.push(row);
      group.duplicates += 1;
      if (String(row.submittedAt ?? "") > String(group.submittedAt ?? "")) group.submittedAt = row.submittedAt;
    }
  }
  const reports = new Map();
  for (const group of groups.values()) {
    const holders = group.holders.slice().sort((a, b) => (finite(b.ratio) ?? -1) - (finite(a.ratio) ?? -1));
    const joint = Boolean(group.docId) && holders.length > 1;
    const sum = (key) => (holders.every((h) => finite(h[key]) !== null) ? holders.reduce((s, h) => s + h[key], 0) : null);
    const lead = holders[0];
    const report = { ...group, holderName: lead.holderName, holders: joint ? holders : [lead], others: joint ? holders.length - 1 : 0,
      ratio: joint ? finite(group.groupRatio) ?? sum("ratio") : finite(lead.ratio), shares: joint ? sum("shares") : finite(lead.shares),
      duplicates: joint ? 1 : group.duplicates };
    const same = [String(report.holderName ?? "").trim(), report.shares, report.ratio, report.others].join("|");
    const seen = reports.get(same);
    if (!seen) reports.set(same, report);
    else {
      const duplicates = seen.duplicates + report.duplicates;
      if (String(report.submittedAt ?? "") > String(seen.submittedAt ?? "")) reports.set(same, { ...report, duplicates });
      else seen.duplicates = duplicates;
    }
  }
  return [...reports.values()].sort((a, b) => String(b.submittedAt ?? "").localeCompare(String(a.submittedAt ?? ""))).slice(0, limit);
}

// Shareholder categories for the 100% bar. The two foreign categories are shown together.
export const CATEGORY_ORDER = ["financialInstitutions", "financialServiceProviders", "otherCorporations", "foreign",
  "individualsAndOthers", "nationalAndLocalGovernments"];
export function categoryShares(report) {
  if (!report || !Array.isArray(report.categories)) return null;
  const rows = report.categories;
  const total = rows.find((r) => r.category === "total");
  const share = (r) => finite(r.ratio) ?? (finite(r.units) !== null && finite(total?.units) > 0 ? r.units / total.units : null);
  const values = new Map();
  for (const r of rows) {
    if (r.category === "total") continue;
    const key = /^foreign/.test(r.category) ? "foreign" : r.category;
    const value = share(r);
    if (value === null) continue;
    values.set(key, (values.get(key) ?? 0) + value);
  }
  if (!values.size) return null;
  const parts = CATEGORY_ORDER.filter((k) => values.has(k)).map((k) => ({ category: k, share: values.get(k) }));
  for (const [k, v] of values) if (!CATEGORY_ORDER.includes(k)) parts.push({ category: k, share: v });
  return { fiscalPeriod: report.fiscalPeriod ?? null, parts, sum: parts.reduce((s, p) => s + p.share, 0) };
}

// ---------- 3. Cross-shareholdings -------------------------------------------------------
// Carrying amounts never reach the browser (they are market values for listed shares).
const shareChange = (row) => (finite(row.shares) !== null && finite(row.priorShares) !== null ? row.shares - row.priorShares : null);
export function crossSummary(report) {
  if (!report) return null;
  const summary = report.summary ?? [];
  const pick = (holder, purpose, listing) => summary.find((s) => s.holder === holder && s.purpose === purpose && s.listing === listing) ?? null;
  const split = (holder) => {
    const rows = (report.holdings ?? []).filter((h) => h.holder === holder).map((h) => ({ ...h, change: shareChange(h) }));
    const specified = rows.filter((h) => h.type !== "deemed");
    return {
      held: specified.filter((h) => finite(h.shares) !== null),
      soldOut: specified.filter((h) => finite(h.shares) === null && finite(h.priorShares) !== null),
      deemed: rows.filter((h) => h.type === "deemed"),
    };
  };
  const reporting = split("reporting");
  const listed = pick("reporting", "nonPureInvestment", "listed");
  const issues = finite(listed?.issues);
  const subsidiaries = (report.holders ?? []).filter((h) => h.holder !== "reporting").map((h) => ({
    holder: h.holder, companyName: h.companyName, ...split(h.holder),
    listed: pick(h.holder, "nonPureInvestment", "listed"), unlisted: pick(h.holder, "nonPureInvestment", "unlisted"),
  }));
  return {
    fiscalPeriod: report.fiscalPeriod ?? null,
    listed, unlisted: pick("reporting", "nonPureInvestment", "unlisted"),
    pureListed: pick("reporting", "pureInvestment", "listed"), pureUnlisted: pick("reporting", "pureInvestment", "unlisted"),
    ...reporting,
    deemedHeld: reporting.deemed.filter((h) => finite(h.shares) !== null).length,
    // Banks and some others list only their largest holdings, so fewer rows than issues is not an error.
    detailMatchesSummary: issues === null ? null : reporting.held.length === issues,
    detailPartial: issues !== null && reporting.held.length < issues,
    subsidiaries,
  };
}

// A holds B's shares and B holds A's: names matched with companyKey().
export function crossLinks(companies) {
  const links = [];
  for (const a of companies) {
    for (const b of companies) {
      if (a === b || !a.crossShareholdings) continue;
      const key = companyKey(b.profile.nameJa);
      const row = (a.crossShareholdings.holdings ?? []).find((h) => h.holder === "reporting" && companyKey(h.name) === key);
      if (row) links.push({ from: a.symbol, to: b.symbol, type: row.type, shares: finite(row.shares), priorShares: finite(row.priorShares),
        current: finite(row.shares) !== null, issuerHoldsOwnShares: row.issuerHoldsOwnShares ?? null });
    }
  }
  const mutual = [];
  for (const l of links) {
    const back = links.find((m) => m.from === l.to && m.to === l.from);
    if (l.current && back?.current && l.from < l.to) mutual.push([l, back]);
  }
  return { links, mutual };
}

// ---------- 4. Audit fees and main customers -------------------------------------------------
const sumParts = (part) => {
  if (!part) return null;
  if (finite(part.total) !== null) return part.total;
  const values = [part.reportingCompany, part.consolidatedSubsidiaries].map(finite).filter((v) => v !== null);
  // Companies without subsidiaries report total = null; the reporting company is then the total.
  return values.length ? values.reduce((s, v) => s + v, 0) : null;
};
export function auditRows(report) {
  if (!report) return [];
  return (report.fees ?? []).map((fee) => {
    const audit = sumParts(fee.audit);
    const nonAudit = sumParts(fee.nonAudit) ?? (audit === null ? null : 0); // no non-audit work = 0
    const base = audit === null ? null : audit + nonAudit;
    return {
      period: fee.period,
      auditReporting: finite(fee.audit?.reportingCompany), auditSubsidiaries: finite(fee.audit?.consolidatedSubsidiaries), audit,
      nonAudit, networkAudit: sumParts(fee.networkAudit), networkNonAudit: sumParts(fee.networkNonAudit),
      // Calculated here as non-audit ÷ (audit + non-audit); the API leaves it null without subsidiaries.
      nonAuditRatio: base ? nonAudit / base : null,
      apiNonAuditRatio: finite(fee.nonAuditRatio),
    };
  }).sort((a, b) => (a.period === "current" ? -1 : b.period === "current" ? 1 : 0));
}

// Each customer as a share of annual revenue for the same fiscal year. "prior" means the year
// 12 months before the report's fiscal period; if that year's revenue is not available, no share.
export function customerRows(report, revenueRows) {
  if (!report || !(report.customers ?? []).length) return { status: "none", rows: [], fiscalPeriod: report?.fiscalPeriod ?? null };
  const target = { current: report.fiscalPeriod, prior: addMonths(report.fiscalPeriod, -12) };
  const rows = report.customers.map((c) => {
    const period = target[c.period] ?? null;
    const revenueRow = period ? (revenueRows ?? []).find((r) => r.period === "FY" && r.fiscalPeriod === period) : null;
    const revenue = finite(revenueRow?.revenue);
    const amount = finite(c.revenue);
    const share = amount !== null && revenue > 0 ? amount / revenue : null;
    // Some filings are parsed at 1,000× the reported unit. A share above 100% cannot be right,
    // so neither the share nor the amount is shown.
    if (share !== null && share > 1) return { ...c, revenue: null, share: null, revenuePeriod: period, unitMismatch: true };
    return { ...c, revenue: amount, share, revenuePeriod: revenue !== null ? period : null, unitMismatch: false };
  });
  return { status: "ok", rows, fiscalPeriod: report.fiscalPeriod };
}

// ---------- Formatting ---------------------------------------------------------------------
const locale = (lang) => (lang === "en" ? "en-US" : "ja-JP");
export function number(value, lang = "ja", digits = 0) {
  const v = finite(value);
  return v === null ? "—" : new Intl.NumberFormat(locale(lang), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}
export const millions = (value, lang = "ja", digits = 0) => (finite(value) === null ? "—" : number(value / 1e6, lang, digits));
export const thousands = (value, lang = "ja") => (finite(value) === null ? "—" : number(value / 1e3, lang, 0));
export function percent(value, lang = "ja", digits = 1) {
  const v = finite(value);
  return v === null ? "—" : new Intl.NumberFormat(locale(lang), { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}
export function signed(value, lang = "ja") {
  const v = finite(value);
  if (v === null) return "—";
  if (v === 0) return "±0";
  return (v > 0 ? "+" : "−") + number(Math.abs(v), lang);
}
export function csvCell(value) {
  if (value === null || value === undefined || (typeof value === "number" && !Number.isFinite(value))) return "";
  if (typeof value === "number") return String(value);
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text; // never let a spreadsheet run a formula
  return /[",\r\n]/.test(text) || text.startsWith("'") ? `"${text.replace(/"/g, '""')}"` : text;
}
export const csvText = (rows) => "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
