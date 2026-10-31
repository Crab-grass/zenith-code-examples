import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as M from "../templates/disclosure-reader/model.mjs";
import { texts } from "../templates/disclosure-reader/i18n.mjs";

const dir = new URL("../templates/disclosure-reader/", import.meta.url);
const EDINET = "https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?S100ABCD";
const titles = (content) => M.extractHeadings(content).headings.map((h) => [h.level, h.title]);

// ---- Fixtures in the exact shape server.py fetch_bundle() returns. ---------------------------
const doc = (symbol, extra = {}) => ({ symbol, fiscalPeriod: "2026-03", period: "FY", docTypeCode: "120", submittedAt: "2026-06-10 06:33:00",
  docId: "S100ABCD", sourceUrl: EDINET, ...extra });
function company(symbol, nameJa, extra = {}) {
  const texts = Object.fromEntries(M.SECTIONS.map((tag) => [tag, null]));
  return { symbol, profile: { symbol, nameJa, nameEn: null, isEtf: false, assetType: "EQUITY" }, texts, majorShareholders: [],
    shareholderCategories: null, largeHolders: [], crossShareholdings: null, auditFees: null, mainCustomers: null, revenue: [], ...extra };
}
const holding = (name, shares, priorShares, extra = {}) => ({ holder: "reporting", type: "specified", row: 1, name, shares, priorShares,
  issuerHoldsOwnShares: "有", rationale: "取引関係の維持", ...extra });

test("headings: markers, levels, the section title and the text before the first heading", () => {
  const content = ["３ 【事業等のリスク】", "以下は主なリスクです。為替の影響を含みます。", "", "（１）市場および事業に関するリスク", "",
    "①自動車市場の競争激化", "競争が激しくなっています。", "②為替および金利変動の影響", "為替相場の変動は業績に影響します。円高は為替差損を生みます。",
    "（２）政治・規制に関するリスク", "①法的手続", "訴訟の可能性があります。"].join("\n");
  assert.deepEqual(titles(content), [[1, "市場および事業に関するリスク"], [2, "自動車市場の競争激化"], [2, "為替および金利変動の影響"],
    [1, "政治・規制に関するリスク"], [2, "法的手続"]]);
  const parsed = M.extractHeadings(content);
  // A large heading's text runs to the next heading at the same level, so it includes its sub-headings.
  assert.equal(M.headingText(parsed, 0), ["（１）市場および事業に関するリスク", "", "①自動車市場の競争激化", "競争が激しくなっています。",
    "②為替および金利変動の影響", "為替相場の変動は業績に影響します。円高は為替差損を生みます。"].join("\n"));
  assert.equal(M.headingText(parsed, 2), "②為替および金利変動の影響\n為替相場の変動は業績に影響します。円高は為替差損を生みます。");
  assert.equal(M.headingText(parsed, 0, true), "（１）市場および事業に関するリスク"); // own text stops at the first sub-heading
  assert.equal(M.headingText(parsed, -1), "３ 【事業等のリスク】\n以下は主なリスクです。為替の影響を含みます。");
  assert.equal(M.headingText(parsed, 99), "");
});

test("headings: half-width markers, nesting by family, list items and sentences", () => {
  const content = ["(1) 事業環境に関するリスク", "①  経済状況", "ⅰ) 予期しない法律又は規制の変更", "ⅱ) 新技術への投資が成功する保証はありません。",
    "② 為替レートの変動", "(2) 財務戦略", "1. 中長期での資源配分", "2.5倍の水準を目標とします。", "a. 監査法人の名称", "■ 第１フェーズ（2022–2024年）",
    "■ 電池については、協業により半減できる見込みです。", "・不利な政治、経済要因", "(注) 研究開発費控除後の営業キャッシュ・フロー", "(3)", "その他のリスク"].join("\n");
  assert.deepEqual(titles(content), [[1, "事業環境に関するリスク"], [2, "経済状況"], [3, "予期しない法律又は規制の変更"], [2, "為替レートの変動"],
    [1, "財務戦略"], [2, "中長期での資源配分"], [3, "監査法人の名称"], [4, "第１フェーズ（2022–2024年）"], [1, "その他のリスク"]]);
});

test("headings: unmarked group titles, repeated labels and title-then-text lines", () => {
  const mazda = ["当社グループのリスクには、主として以下のようなものがあります。", "市場及び事業に関するリスク", "(1) 経済情勢", "本文です。",
    "(2) 市場競争力", "本文です。", "金融・経済に係るリスク", "(1) 為替レートの変動", "本文です。", "平岩 修一", "(3) 退任した会計士"].join("\n");
  assert.deepEqual(titles(mazda), [[1, "市場及び事業に関するリスク"], [2, "経済情勢"], [2, "市場競争力"], [1, "金融・経済に係るリスク"],
    [2, "為替レートの変動"], [2, "退任した会計士"]]);
  const honda = ["(1) 地政学的リスク", "＜リスク＞", "規制が強まっています。", "＜対応策＞", "(2) 購買・調達リスク", "＜リスク＞", "＜対応策＞",
    "(3) 情報セキュリティリスク", "＜リスク＞", "＜対応策＞"].join("\n");
  assert.deepEqual(titles(honda).map((h) => h[1]), ["地政学的リスク", "購買・調達リスク", "情報セキュリティリスク"]);
  assert.deepEqual(titles("①　経済状況　当社の業績は世界経済の影響を受けます。"), [[1, "経済状況"]]);
  assert.deepEqual(titles(""), []);
  assert.deepEqual(titles(null), []);
});

test("keywords match full- and half-width forms and are counted per heading", () => {
  assert.equal(M.countMatches("ＡＩとAIとai", "AI"), 3);
  assert.equal(M.countMatches("サイバー攻撃とサイバーリスク", "サイバー"), 2);
  assert.equal(M.countMatches("text", ""), 0);
  assert.equal(M.countMatches("a.b", "."), 1); // regex characters are literal
  assert.deepEqual(M.highlightParts("円高と為替差損", "為替"), [{ text: "円高と", match: false }, { text: "為替", match: true }, { text: "差損", match: false }]);
  assert.deepEqual(M.highlightParts("abc", ""), [{ text: "abc", match: false }]);
  const block = doc("7203", { content: "前文に為替。\n（１）為替のリスク\n為替と為替。\n（２）人材\n人材の確保。" });
  const outline = M.sectionOutline(block, "為替");
  assert.deepEqual(outline.headings.map((h) => h.hits), [3, 0]);
  assert.equal(outline.preambleHits, 1);
  assert.equal(outline.totalHits, 4);
  // Characters are counted from the text received (code points), never from the API's `chars`.
  assert.equal(outline.chars, Array.from(block.content).length);
  assert.equal(M.charCount("𠮷野家"), 3);
  assert.equal(M.sectionOutline(null, "為替"), null);
});

test("the AI prompt carries headings and sources but never the report text", () => {
  const block = doc("7203", { content: "（１）為替のリスク\n秘密ではないが長い本文。為替相場の変動は業績に影響します。\n（２）人材\n人材の確保。" });
  const outline = M.sectionOutline(block, "為替");
  const prompt = M.buildPrompt(texts.ja, { sectionLabel: texts.ja.sec_risks, keyword: "為替", companies: [
    { name: "トヨタ自動車", symbol: "7203", fiscalPeriod: outline.fiscalPeriod, docId: outline.docId, submittedAt: outline.submittedAt, sourceUrl: outline.sourceUrl,
      headings: outline.headings.map((h) => ({ level: h.level, title: h.title, hits: h.hits })) },
    { name: "デンソー", symbol: "6902", missing: true, headings: [] },
  ] });
  assert.match(prompt, /事業等のリスク/);
  assert.match(prompt, /- 為替のリスク ★/);
  assert.match(prompt, /- 人材\n/);
  assert.match(prompt, /S100ABCD/);
  assert.match(prompt, /2026-06-10/);
  assert.ok(prompt.includes(EDINET));
  assert.match(prompt, /この節はありません/);
  assert.match(prompt, /Data provided by ZENITH Code/);
  for (const body of ["秘密ではないが長い本文", "業績に影響します", "人材の確保"]) assert.ok(!prompt.includes(body), body);
  const english = M.buildPrompt(texts.en, { sectionLabel: texts.en.sec_rnd, keyword: "", companies: [{ name: "A", symbol: "1111", headings: [] }] });
  assert.match(english, /Research and development/);
  assert.ok(!english.includes("★"));
});

test("company and holder names are matched across notations", () => {
  assert.equal(M.companyKey("トヨタ自動車㈱"), M.companyKey("トヨタ自動車株式会社"));
  assert.equal(M.companyKey("トヨタ自動車"), M.companyKey("トヨタ自動車 株式会社"));
  assert.equal(M.companyKey("ルネサス エレクトロニクス㈱"), M.companyKey("ルネサスエレクトロニクス㈱"));
  assert.equal(M.companyKey("㈱モルフォ（注２）"), M.companyKey("株式会社モルフォ"));
  assert.equal(M.companyKey("ＫＤＤＩ㈱"), M.companyKey("KDDI株式会社"));
  assert.equal(M.holderKey("日本生命保険（相）"), M.holderKey("日本生命保険相互会社"));
  assert.equal(M.holderKey("株式会社日本カストディ銀行（信託口４）"), M.holderKey("㈱日本カストディ銀行"));
  assert.equal(M.holderKey("野村信託銀行株式会社(投信口)"), M.holderKey("野村信託銀行株式会社"));
  assert.notEqual(M.companyKey("マツダ"), M.companyKey("マツダ興業"));
  const profile = { nameJa: "テイン" };
  assert.ok(M.isOwnName("株式会社テイン", profile));
  assert.ok(M.isOwnName("自己株式", profile));
  assert.ok(!M.isOwnName("市野 諮", profile));
});

test("cross-holdings between compared companies: mutual and one-way", () => {
  const toyota = company("7203", "トヨタ自動車", { crossShareholdings: doc("7203", { holders: [], summary: [], holdings: [
    holding("マツダ㈱", 31928500, 31928500), holding("ＫＤＤＩ㈱", 363365900, 203294600)] }) });
  const mazda = company("7261", "マツダ", { crossShareholdings: doc("7261", { holders: [], summary: [], holdings: [holding("トヨタ自動車㈱", 41466500, 41466500)] }) });
  const denso = company("6902", "デンソー", { crossShareholdings: doc("6902", { holders: [], summary: [], holdings: [holding("トヨタ自動車株式会社", null, 100)] }) });
  const honda = company("7267", "本田技研工業"); // no cross-shareholding report
  const { links, mutual } = M.crossLinks([toyota, mazda, denso, honda]);
  assert.equal(mutual.length, 1);
  assert.deepEqual(mutual[0].map((l) => [l.from, l.to, l.shares]), [["7203", "7261", 31928500], ["7261", "7203", 41466500]]);
  const sold = links.find((l) => l.from === "6902");
  assert.deepEqual([sold.to, sold.current, sold.priorShares], ["7203", false, 100]);
  assert.equal(links.length, 3);
});

test("strategic holdings: sold-out rows, deemed holdings, subsidiaries and partial lists", () => {
  const report = doc("7203", {
    holders: [{ holder: "reporting", companyName: null }, { holder: "largest", companyName: "子会社A" }],
    summary: [{ holder: "reporting", purpose: "nonPureInvestment", listing: "listed", issues: 3, priorIssues: null },
      { holder: "reporting", purpose: "nonPureInvestment", listing: "unlisted", issues: 80, priorIssues: 82 },
      { holder: "reporting", purpose: "pureInvestment", listing: "listed", issues: 2, priorIssues: 2 },
      { holder: "largest", purpose: "nonPureInvestment", listing: "listed", issues: 1, priorIssues: 1 }],
    holdings: [holding("A㈱", 100, 80), holding("B㈱", 50, null), holding("C㈱", 10, 10), holding("D㈱", null, 300), holding("E㈱", null, null),
      holding("F㈱", null, 40, { type: "deemed" }), holding("G㈱", 5, 5, { holder: "largest" })],
  });
  const s = M.crossSummary(report);
  assert.deepEqual(s.held.map((h) => [h.name, h.change]), [["A㈱", 20], ["B㈱", null], ["C㈱", 0]]);
  assert.deepEqual(s.soldOut.map((h) => h.name), ["D㈱"]); // current shares missing, prior present
  assert.deepEqual(s.deemed.map((h) => h.name), ["F㈱"]);
  assert.equal(s.held.length, s.listed.issues); // rows still held = listed holdings in the summary
  assert.equal(s.detailMatchesSummary, true);
  assert.equal(s.detailPartial, false);
  assert.equal(s.unlisted.priorIssues, 82);
  assert.equal(s.pureListed.issues, 2);
  assert.deepEqual(s.subsidiaries.map((x) => [x.holder, x.companyName, x.held.length, x.listed.issues]), [["largest", "子会社A", 1, 1]]);
  // A bank listing only its largest 60 holdings: fewer rows than issues is flagged, not rejected.
  const partial = M.crossSummary({ ...report, summary: [{ ...report.summary[0], issues: 120 }] });
  assert.equal(partial.detailPartial, true);
  assert.equal(partial.detailMatchesSummary, false);
  assert.equal(M.crossSummary(null), null);
});

test("large-holding reports without a docId: identical rows are merged, newest five kept", () => {
  const row = (holderName, shares, ratio, submittedAt) => ({ symbol: "7203", holderName, shares, unit: "株", ratio, submittedAt, docId: null, sourceUrl: EDINET });
  const rows = M.largeHolderRows([
    row("株式会社豊田自動織機", 1442085035, 0.0913, "2026-05-08 07:08:00+00"),
    row("株式会社豊田自動織機", 1442085035, 0.0913, "2026-05-08 07:14:00+00"),
    row("株式会社豊田自動織機", 1192330920, 0.0755, "2025-06-09 06:20:00+00"),
    row("株式会社豊田自動織機", 1192330920, 0.0755, "2025-06-25 02:14:00+00"),
    row("株式会社豊田自動織機", 1192330920, 0.0755, "2025-06-30 02:14:00+00"),
    row("A", 1, 0.05, "2024-01-01 00:00:00+00"), row("B", 1, 0.05, "2023-01-01 00:00:00+00"),
    row("C", 1, 0.05, "2022-01-01 00:00:00+00"), row("D", 1, 0.05, "2021-01-01 00:00:00+00"),
  ]);
  assert.deepEqual(rows.map((r) => [r.holderName, r.duplicates, r.submittedAt.slice(0, 10)]), [
    ["株式会社豊田自動織機", 2, "2026-05-08"], ["株式会社豊田自動織機", 3, "2025-06-30"], ["A", 1, "2024-01-01"], ["B", 1, "2023-01-01"], ["C", 1, "2022-01-01"]]);
  assert.equal(rows[0].submittedAt, "2026-05-08 07:14:00+00"); // the newest of the duplicates
  assert.deepEqual(M.largeHolderRows([]), []);
});

test("large-holding reports: a joint report is one row with the joint ratio, largest holder first", () => {
  const row = (holderName, shares, ratio, docId, submittedAt, extra = {}) => ({ symbol: "7217", holderName, shares, unit: "株", ratio, submittedAt, docId, sourceUrl: EDINET,
    groupRatio: 0.5137, isJointReport: true, reportKind: "change", ...extra });
  const rows = M.largeHolderRows([
    row("市野 諮", 1375000, 0.1403, "S100Z93C", "2026-10-30 02:57:00+00"),
    row("株式会社イチノホールディングス", 3664000, 0.3734, "S100Z93C", "2026-10-30 02:57:00+00"),
    row("市野 諮", 5000000, 0.528, "S100V001", "2025-02-14 06:32:00+00", { groupRatio: 0.528, isJointReport: false, reportKind: "initial" }),
  ]);
  assert.deepEqual(rows.map((r) => [r.holderName, r.others, r.ratio, r.shares, r.reportKind, r.duplicates]), [
    ["株式会社イチノホールディングス", 1, 0.5137, 5039000, "change", 1], ["市野 諮", 0, 0.528, 5000000, "initial", 1]]);
  assert.deepEqual(rows[0].holders.map((h) => h.holderName), ["株式会社イチノホールディングス", "市野 諮"]);
  // Without groupRatio the joint ratio is the sum of the holders' ratios.
  const summed = M.largeHolderRows([row("A", 1, 0.03, "S100Z001", "2026-01-01", { groupRatio: null }), row("B", 2, 0.025, "S100Z001", "2026-01-01", { groupRatio: null })]);
  assert.equal(Math.round(summed[0].ratio * 1e4), 550);
  assert.equal(summed[0].shares, 3);
  // Two documents with the same content (an amendment filed minutes later) are shown once.
  const twice = M.largeHolderRows([row("株式会社豊田自動織機", 1442085035, 0.0913, "S100Y2HX", "2026-05-08 07:08:00+00", { groupRatio: null }),
    row("株式会社豊田自動織機", 1442085035, 0.0913, "S100Y2HY", "2026-05-08 07:14:00+00", { groupRatio: null })]);
  assert.deepEqual(twice.map((r) => [r.docId, r.duplicates]), [["S100Y2HY", 2]]);
});

test("common holders and compared companies among the top-10 shareholders", () => {
  const major = (symbol, rows) => rows.map(([rank, holderName, ratio]) => ({ symbol, fiscalPeriod: "2026-03", rank, holderName, shares: 1, unit: "株", ratio, region: "東京都" }));
  const toyota = company("7203", "トヨタ自動車", { majorShareholders: major("7203", [[1, "日本マスタートラスト信託銀行株式会社", 0.128], [7, "株式会社デンソー", 0.0345], [4, "日本生命保険（相）", 0.0486]]) });
  const denso = company("6902", "デンソー", { majorShareholders: major("6902", [[1, "トヨタ自動車株式会社", 0.2224], [2, "日本マスタートラスト信託銀行株式会社（信託口）", 0.1304], [6, "日本生命保険相互会社", 0.0321]]) });
  const mazda = company("7261", "マツダ", { majorShareholders: major("7261", [[1, "日本マスタートラスト信託銀行株式会社(信託口)", 0.1767], [3, "トヨタ自動車株式会社", 0.0506]]) });
  const common = M.commonHolders([toyota, denso, mazda]);
  assert.deepEqual(common.map((c) => [c.name, c.entries.map((e) => e.symbol)]), [
    ["日本マスタートラスト信託銀行株式会社", ["7203", "6902", "7261"]], ["トヨタ自動車株式会社", ["6902", "7261"]], ["日本生命保険（相）", ["7203", "6902"]]]);
  assert.deepEqual(M.peerHolders([toyota, denso, mazda]).map((p) => [p.holder, p.issuer, p.rank]), [["6902", "7203", 7], ["7203", "6902", 1], ["7203", "7261", 3]]);
});

test("shareholder categories become one 100% bar with foreign holders combined", () => {
  const cat = (category, ratio, units) => ({ category, labelJa: "", labelEn: "", shareholders: 1, units, ratio });
  const shares = M.categoryShares(doc("7203", { categories: [cat("nationalAndLocalGovernments", 0, 1431), cat("financialInstitutions", 0.2701, 1),
    cat("financialServiceProviders", 0.0147, 1), cat("otherCorporations", 0.2029, 1), cat("foreignInvestorsOtherThanIndividuals", 0.2279, 1),
    cat("foreignIndividualInvestors", 0.0001, 1), cat("individualsAndOthers", 0.2843, 1), cat("total", null, 157893678)] }));
  assert.deepEqual(shares.parts.map((p) => p.category), ["financialInstitutions", "financialServiceProviders", "otherCorporations", "foreign", "individualsAndOthers", "nationalAndLocalGovernments"]);
  assert.ok(Math.abs(shares.parts.find((p) => p.category === "foreign").share - 0.228) < 1e-9);
  assert.ok(Math.abs(shares.sum - 1) < 1e-9);
  // Ratio missing: fall back to units ÷ total units.
  const units = M.categoryShares({ categories: [cat("financialInstitutions", null, 25), cat("individualsAndOthers", null, 75), cat("total", null, 100)] });
  assert.deepEqual(units.parts.map((p) => p.share), [0.25, 0.75]);
  assert.equal(M.categoryShares(null), null);
});

test("audit fees: totals fall back to the reporting company and the non-audit share is calculated", () => {
  const scope = (reportingCompany, consolidatedSubsidiaries, total) => ({ reportingCompany, consolidatedSubsidiaries, total });
  const none = scope(null, null, null);
  const report = doc("3042", { fees: [
    { period: "prior", audit: scope(23000000, null, null), nonAudit: none, networkAudit: none, networkNonAudit: none, nonAuditRatio: null },
    { period: "current", audit: scope(25000000, null, null), nonAudit: scope(5000000, null, null), networkAudit: none, networkNonAudit: scope(2665000, null, null), nonAuditRatio: null },
  ] });
  const [current, prior] = M.auditRows(report);
  assert.equal(current.period, "current");
  assert.equal(current.audit, 25000000); // total null → reporting company is the total
  assert.equal(current.nonAudit, 5000000);
  assert.ok(Math.abs(current.nonAuditRatio - 5 / 30) < 1e-12);
  assert.equal(current.networkNonAudit, 2665000);
  assert.equal(current.networkAudit, null);
  assert.equal(prior.nonAudit, 0); // no non-audit work → 0, share 0
  assert.equal(prior.nonAuditRatio, 0);
  const toyota = M.auditRows(doc("7203", { fees: [{ period: "current", audit: scope(1107e6, 1279e6, 2386e6), nonAudit: scope(3e6, 18e6, 21e6),
    networkAudit: scope(null, 6394e6, 6394e6), networkNonAudit: scope(122e6, 512e6, 634e6), nonAuditRatio: 0.008725 }] }))[0];
  assert.ok(Math.abs(toyota.nonAuditRatio - toyota.apiNonAuditRatio) < 1e-6);
  assert.deepEqual(M.auditRows(null), []);
  assert.equal(M.auditRows(doc("1", { fees: [{ period: "current", audit: none, nonAudit: none }] }))[0].nonAuditRatio, null);
});

test("main customers: share of same-year revenue only, unit mismatches hidden, 404 explained", () => {
  const revenue = [{ symbol: "7217", fiscalPeriod: "2026-03", period: "FY", revenue: 5594277000 }, { symbol: "7217", fiscalPeriod: "2024-03", period: "FY", revenue: 4865893000 }];
  const report = doc("7217", { customers: [
    { period: "current", customer: "TURN 14 DISTRIBUTION INC.", revenue: 718808000, segment: "自動車用サスペンション" },
    { period: "prior", customer: "前期の販売先", revenue: 500000000, segment: "x" }, // 2025-03 revenue is missing → not divided
  ] });
  const result = M.customerRows(report, revenue);
  assert.equal(result.status, "ok");
  assert.ok(Math.abs(result.rows[0].share - 718808000 / 5594277000) < 1e-12);
  assert.equal(result.rows[0].revenuePeriod, "2026-03");
  assert.equal(result.rows[1].share, null);
  assert.equal(result.rows[1].revenue, 500000000);
  // Never divide by another year's revenue, even when only that year is available.
  assert.equal(M.customerRows(report, [{ fiscalPeriod: "2025-03", period: "FY", revenue: 1e9 }]).rows[0].share, null);
  // Some filings are parsed 1,000× too large (seen for 3042 and 4490): share > 100% hides share and amount.
  const scaled = M.customerRows(doc("3042", { customers: [{ period: "current", customer: "ＮＲＩセキュアテクノロジーズ 株式会社", revenue: 189950000000, segment: "x" }] }),
    [{ fiscalPeriod: "2026-03", period: "FY", revenue: 2500000000 }]);
  assert.deepEqual([scaled.rows[0].unitMismatch, scaled.rows[0].share, scaled.rows[0].revenue], [true, null, null]);
  assert.equal(M.customerRows(null, revenue).status, "none"); // 404: no customer above 10%
  assert.equal(M.customerRows(doc("1", { customers: [] }), revenue).status, "none");
});

test("normalization rejects other companies' rows and unknown sections", () => {
  const good = () => ({ retrievedAt: "2026-10-30T00:00:00Z", companies: [company("7203", "トヨタ自動車"), company("7261", "マツダ")] });
  assert.equal(M.normalizeBundle(good(), ["7203", "7261"]).companies.length, 2);
  const cases = [
    (d) => (d.companies[0].profile.symbol = "9999"),
    (d) => (d.companies[0].texts.officers = null),
    (d) => (d.companies[0].texts.risks = doc("9999", { content: "x" })),
    (d) => (d.companies[0].texts.risks = doc("7203", { content: 1 })),
    (d) => (d.companies[0].majorShareholders = [{ symbol: "9999" }]),
    (d) => (d.companies[1].crossShareholdings = doc("7261", { holdings: "x" })),
    (d) => (d.companies[1].symbol = "7203"),
    (d) => (d.companies = []),
    (d) => (d.companies[0].symbol = "../x"),
  ];
  for (const change of cases) {
    const d = good();
    change(d);
    assert.throws(() => M.normalizeBundle(d), /invalid_response/, change.toString());
  }
  assert.throws(() => M.normalizeBundle(good(), ["7261", "7203"]), /invalid_response/);
});

test("formatting shows missing as — and keeps real zero", () => {
  for (const v of [null, undefined, NaN, "1"]) {
    assert.equal(M.number(v), "—");
    assert.equal(M.percent(v), "—");
    assert.equal(M.millions(v), "—");
    assert.equal(M.thousands(v), "—");
  }
  assert.equal(M.number(0, "en"), "0");
  assert.equal(M.millions(2386000000, "en"), "2,386");
  assert.equal(M.thousands(31928500, "en"), "31,929");
  assert.equal(M.percent(0.128, "en", 2), "12.80%");
  assert.equal(M.signed(-35180, "en"), "−35,180");
  assert.equal(M.signed(0), "±0");
  assert.equal(M.addMonths("2026-03", -12), "2025-03");
  assert.ok(M.csvCell("=1+1").startsWith(`"'`));
  for (const bad of ["https://api.zenithcode.net/stable/filing-document?docId=S100ABCD&type=pdf", "https://www.release.tdnet.info/x.pdf",
    "https://edinet-fsa.go.jp.example.com/", "javascript:alert(1)", null]) assert.equal(M.edinetUrl(bad), null, String(bad));
});

test("saved demo.json normalizes and carries no prices, carrying amounts or TDnet links", () => {
  const demo = JSON.parse(fs.readFileSync(new URL("demo.json", dir), "utf8"));
  assert.equal(demo.placeholder, false);
  assert.ok(!Number.isNaN(Date.parse(demo.retrievedAt)));
  const banned = /^(price|priceDate|marketCap|beta|per|pbr|psr|dividendYield|archiveUrl|carryingAmount|priorCarryingAmount|chars|address|holderNameRaw|costOfRevenue|eps)$/;
  const walk = (value) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value && typeof value === "object") for (const [key, inner] of Object.entries(value)) { assert.doesNotMatch(key, banned, key); walk(inner); }
    if (typeof value === "string" && /^https?:/.test(value)) assert.ok(M.edinetUrl(value), value);
  };
  walk(demo);
  const data = M.normalizeBundle(demo);
  assert.ok(data.companies.length >= M.MIN_COMPANIES);
  for (const c of data.companies) {
    for (const tag of M.SECTIONS) if (c.texts[tag]) assert.equal(typeof c.texts[tag].content, "string");
    for (const r of c.revenue) assert.deepEqual(Object.keys(r).sort(), ["fiscalPeriod", "period", "revenue", "symbol"]);
    const s = M.crossSummary(c.crossShareholdings);
    if (s && s.listed) assert.ok(s.held.length <= s.listed.issues);
  }
  // The demo exercises every view: headings, a mutual holding and a main customer with a share of revenue.
  assert.ok(data.companies.every((c) => !c.texts.risks || M.sectionOutline(c.texts.risks, "").headings.length > 0));
  assert.ok(M.crossLinks(data.companies).mutual.length >= 1);
  assert.ok(data.companies.some((c) => M.customerRows(c.mainCustomers, c.revenue).rows.some((r) => r.share !== null)));
});

test("every interface text exists in both languages and avoids restricted wording", () => {
  assert.deepEqual(Object.keys(texts.ja).sort(), Object.keys(texts.en).sort());
  const app = fs.readFileSync(new URL("app.mjs", dir), "utf8");
  const html = fs.readFileSync(new URL("index.html", dir), "utf8");
  // Prefix-built keys ("sec_" + tag) are added explicitly below.
  const used = new Set([...app.matchAll(/\b(?:t|fill|notice)\("([A-Za-z_]+)"/g)].map((m) => m[1]).filter((k) => !k.endsWith("_")));
  for (const m of html.matchAll(/data-i18n(?:-label)?="([^"]+)"/g)) used.add(m[1]);
  for (const prefix of ["nav_", "lead_", "eyebrow_"]) for (const id of ["text", "holders", "cross", "audit"]) used.add(prefix + id);
  for (const tag of M.SECTIONS) used.add("sec_" + tag);
  for (const key of M.CATEGORY_ORDER) used.add("cat_" + key);
  for (const key of ["holder_largest", "holder_second-largest", "upstream_failed", "invalid_response", "invalid_request", "busy", "local_only", "setup_required"]) used.add(key);
  for (const key of used) {
    assert.ok(key in texts.ja, `ja missing ${key}`);
    assert.ok(key in texts.en, `en missing ${key}`);
  }
  // Disclosure names quoted as they appear in filings are the only exceptions.
  const ja = JSON.stringify(texts.ja).replaceAll("純投資目的", "").replaceAll("設備投資等の概要", "");
  for (const word of ["投資", "投資家", "銘柄", "割安"]) assert.ok(!ja.includes(word), word);
  const en = JSON.stringify(texts.en).toLowerCase().replaceAll("pure investment", "");
  for (const word of ["invest", "undervalued", "stock pick"]) assert.ok(!en.includes(word), word);
  for (const file of ["README.ja.md", "README.md"]) assert.ok(!fs.readFileSync(new URL(file, dir), "utf8").includes("投資・金融サービス"));
});
