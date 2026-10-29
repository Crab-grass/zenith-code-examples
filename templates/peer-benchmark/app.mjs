import {
  MAX_COMPANIES, SYMBOL, DEMO_SYMBOL, plainSymbol, normalizePeers, normalizeComparison, companyMetrics,
  segmentMix, domain, barGeometry, position, niceAxis, oku, percent, number, salary, comparisonCsv,
} from "./model.mjs";

const $ = (id) => document.getElementById(id);
const texts = {
  ja: {
    skip: "本文へ移動", title: "比較ボード", titleSub: "Peer benchmark board",
    lede: "自社と競合最大5社の収益性・成長・財務・事業構成・人材を、会議にそのまま出せる1枚に並べます。",
    displayOptions: "表示の設定", print: "印刷・PDF", exportCsv: "CSVで保存", themeDark: "ダーク表示", themeLight: "ライト表示",
    setupTitle: "比較する会社を選ぶ", dataMode: "データの種類", modeDemo: "デモ（保存データ）", modeLive: "実データ",
    noteDemo: (date, codes, placeholder) => `${placeholder ? "架空の仮データで動きを確認できます。" : `${date} に取得して保存した実データで動きを確認できます（最新ではありません）。`}APIは呼びません。使えるコード: ${codes}。`,
    noteLive: "証券コードは自社から入力します。取得はボタンを押したときだけ行い、APIキーはブラウザに送りません。",
    noteLiveOff: "実データを使うには、ターミナルで server.py --live を付けて起動し直してください。",
    stepTarget: "自社の証券コード", suggest: "競合候補を表示",
    suggestHint: "候補は同じ業種の会社を名前とコードだけ表示します。",
    suggestHintLive: "1リクエスト。候補は同じ業種の会社を名前とコードだけ表示します。",
    stepPeers: "比較する会社（最大6社）", addCode: "証券コードを追加", add: "追加",
    stepFetch: "比較データを取得", fetch: "比較データを取得",
    countHint: (n) => `${n} / ${MAX_COMPANIES} 社を選択中。候補にない会社はコードで追加できます。`,
    requestDemo: "デモではAPIを呼びません。", requestLive: (n, b) => `この操作で ${n} リクエスト（1社あたり6件${b ? "＋業種の分布1件" : ""}）。1社ずつ順番に取得します。`,
    self: "自社", remove: "外す", code: "コード",
    errSymbol: "証券コードの形式を確認してください（例: 7203、130A）。", errDemoSymbol: (codes) => `デモで使えるコードは ${codes} です。`,
    errDuplicate: "すでに選択しています。", errMax: `比較できるのは最大${MAX_COMPANIES}社です。`, errTarget: "先に自社の証券コードを入力してください。",
    loadingPeers: "競合候補を取得しています…", loadingCompare: (n) => `${n}社のデータを順番に取得しています…`,
    peersDone: (n) => `${n}社の候補を表示しました。比較する会社を選んでください。`,
    compareDone: (n) => `${n}社の比較を表示しました。`,
    errors: {
      busy: "別の取得が進んでいます。終わってから押してください。",
      upstream_failed: "APIから取得できませんでした。キー・利用枠・証券コードを確認してください。途中までの結果は表示しません。",
      invalid_response: "想定外の応答だったため、何も表示しません。",
      invalid_request: "入力内容を確認してください。", setup_required: "実データを使うには --live で起動し直してください。",
      local_only: "ページを再読み込みしてください。", failed: "取得できませんでした。",
    },
    eyebrow: "PEER BENCHMARK · 同業比較", reportTitle: (name, n) => n > 0 ? `${name} と比較対象 ${n} 社` : name,
    sectorLabel: "業種", latestFy: "各社の最新通期", retrieved: "取得", noSector: "業種の分布は未取得",
    fictional: "企業名・数値はすべて架空の仮データです。",
    attribution: (date) => `データ提供: ZENITH Code ・ ${date} 取得時点の保存データ`,
    sections: "セクション", navProfit: "収益性", navGrowth: "成長", navStrength: "財務", navMix: "事業構成", navPeople: "人材", navSources: "出典",
    emptyLive: "まだ比較していません。上で会社を選び「比較データを取得」を押してください。",
    profitTitle: "収益性と効率", profitLead: "最新通期の売上規模と利益率。ROE・ROA・成長率は業種の分布（中央50%の帯）と並べます。",
    profitFoot: "ROE・ROA はこの画面で期末の値から計算（平均残高ではありません）。3年成長率は連続4通期がそろう場合だけ表示します。",
    company: "会社", revenue: "売上高", operatingIncome: "営業利益", operatingMargin: "営業利益率", netMargin: "純利益率",
    roe: "ROE", roa: "ROA", revenueCagr3y: "売上高 3年成長率", unitOku: "億円", perYear: "年平均", calc: "期末値で計算",
    bandTitle: { roe: "ROE（自己資本利益率）", roa: "ROA（総資産利益率）", revenueCagr3y: "売上高 3年成長率（年平均）" },
    bandKeyBand: "業種の中央50%（Q1〜Q3）", bandKeyMedian: "業種の中央値", bandNone: "業種の分布なし",
    bandCaption: (b, n) => `業種 Q1 ${b.q1} ・中央値 ${b.median} ・Q3 ${b.q3}${n ? `（${n}社）` : ""}`,
    growthTitle: "業績の推移", growthLead: "直近3通期の売上高と営業利益。会社ごとに目盛りが異なります。",
    growthFoot: "棒の高さは各社の中での推移を見るためのもので、会社どうしの大きさの比較には上の表の数値を使ってください。赤字は0の線より下に描きます。",
    strengthTitle: "財務の健全性", strengthLead: "最新通期の自己資本比率・有利子負債・キャッシュフロー。",
    strengthFoot: "純有利子負債がマイナスなら、現預金が有利子負債を上回る（ネットキャッシュ）状態です。設備投資は支出なのでマイナスで表示します（APIの値のまま）。",
    equityRatio: "自己資本比率", netDebt: "純有利子負債", ocf: "営業CF", capex: "設備投資", fcf: "フリーCF", netCash: "ネットキャッシュ",
    mixTitle: "事業構成", mixLead: "最新の開示にある外部顧客への売上高の構成比。",
    mixCaution: "セグメントの区分は会社ごとに異なります（事業別・地域別など）。開示どおりに表示し、会社をまたいで合算や名寄せはしません。色は各社内の並び順を示すだけです。",
    mixBasis: "区分の基準", mixNone: "セグメント情報なし（単一セグメント、または未取得）",
    peopleTitle: "人材", peopleLead: "有価証券報告書の従業員と多様性の指標。",
    peopleFoot: "連結従業員数以外は提出会社（単体）の値です。男性育休取得率は会社により算定方法が異なり、100%を超えることがあります（† 育児目的休暇を含む）。男女の賃金の差異は男性の賃金に対する女性の賃金の割合です。",
    employees: "従業員数（単体）", consolidatedEmployees: "連結従業員数", averageAge: "平均年齢", averageTenure: "平均勤続年数",
    averageSalary: "平均年間給与", femaleManager: "女性管理職比率", maleLeave: "男性育休取得率", wageGap: "男女の賃金の差異",
    yearsOld: "歳", yearsTenure: "年", unitMan: "万円", unitPeople: "人", noPeople: "人的資本の開示データなし",
    sourcesTitle: "出典", sourcesLead: "各社の決算期・会計基準・書類ID。原本は EDINET で確認できます。",
    fiscalPeriod: "決算期", standard: "会計基準", days: "期間", source: "データ元", docId: "書類ID", link: "原本",
    segmentDoc: "セグメント", peopleDoc: "人材", openEdinet: "EDINET", synthetic: "架空データ", dayUnit: "日",
    standards: { jgaap: "日本基準", ifrs: "IFRS", usgaap: "米国基準" },
    notesTitle: "読み方",
    notes: [
      "数値は各社の最新通期（FY）です。決算月が違う会社（例：12月決算）も同じ列に並ぶため、会社名の下の決算期を確認してください。",
      "金額は億円で丸めて表示します。CSV は円単位・比率は小数のままです。",
      "ROE＝親会社株主に帰属する当期純利益÷親会社の所有者に帰属する持分、ROA＝当期純利益÷総資産。どちらも期末の値で、この画面が計算します。業種の分布の算定方法とは一致しないことがあります。",
      "売上高の3年成長率（年平均）は、連続する4通期がそろい、決算月と会計基準が同じで、各期が通常の1年（360〜366日）の場合だけ計算します。",
      "業種の帯は ZENITH Code の業種別ベンチマークです。自社の業種コードで1回だけ取得するため、他社が別の業種に属する場合もあります。",
      "会計基準（日本基準・IFRS・米国基準）が違う会社の数値には、定義の差が含まれます。",
      "未開示・未取得は「—」と表示し、0 としては扱いません。実際の0は0のままです。",
      "株価・時価総額やそれに基づく指標は扱いません。サーバーが応答から取り除いてからブラウザに渡します。",
    ],
    footDemo: (date, placeholder) => placeholder ? "架空の企業・数値による仮データです。実在の会社とは関係ありません。" : `データ提供: ZENITH Code。${date} に取得して保存したデータで、最新の開示を反映していない場合があります。`,
    footLive: (time) => `取得 ${time}。データの利用条件・表示ルールに従って社内で利用してください。`,
    chartLabel: (name, list) => `${name}の売上高と営業利益: ${list}`,
  },
  en: {
    skip: "Skip to content", title: "Peer benchmark board", titleSub: "比較ボード",
    lede: "Line up your company and up to five competitors on profitability, growth, financial strength, business mix and people — one page, ready for the meeting.",
    displayOptions: "Display options", print: "Print / PDF", exportCsv: "Export CSV", themeDark: "Dark", themeLight: "Light",
    setupTitle: "Choose the companies", dataMode: "Data source", modeDemo: "Demo (saved data)", modeLive: "Live data",
    noteDemo: (date, codes, placeholder) => `${placeholder ? "Fictional placeholder data shows how it works." : `Real data saved on ${date} shows how it works (not current).`} No API calls. Codes: ${codes}.`,
    noteLive: "Start with your own securities code. Fetches run only when you click; the API key never reaches the browser.",
    noteLiveOff: "To use live data, restart server.py with --live in your terminal.",
    stepTarget: "Your securities code", suggest: "Suggest competitors",
    suggestHint: "Suggestions show same-sector companies by name and code only.",
    suggestHintLive: "1 request. Suggestions show same-sector companies by name and code only.",
    stepPeers: "Companies to compare (max 6)", addCode: "Add a securities code", add: "Add",
    stepFetch: "Fetch the comparison", fetch: "Fetch comparison",
    countHint: (n) => `${n} / ${MAX_COMPANIES} selected. Add companies that are not suggested by code.`,
    requestDemo: "The demo makes no API calls.", requestLive: (n, b) => `This makes ${n} requests (6 per company${b ? " + 1 sector distribution" : ""}), one company at a time.`,
    self: "Yours", remove: "Remove", code: "Code",
    errSymbol: "Check the securities code format (e.g. 7203, 130A).", errDemoSymbol: (codes) => `The demo accepts ${codes}.`,
    errDuplicate: "Already selected.", errMax: `Compare up to ${MAX_COMPANIES} companies.`, errTarget: "Enter your own securities code first.",
    loadingPeers: "Fetching suggestions…", loadingCompare: (n) => `Fetching ${n} companies one by one…`,
    peersDone: (n) => `${n} suggestions shown. Choose the companies to compare.`,
    compareDone: (n) => `Showing ${n} companies.`,
    errors: {
      busy: "Another fetch is running. Try again when it finishes.",
      upstream_failed: "The API request failed. Check your key, quota and codes. Partial results are not shown.",
      invalid_response: "The response was not in the expected shape, so nothing is shown.",
      invalid_request: "Check your input.", setup_required: "Restart with --live to use live data.",
      local_only: "Reload the page.", failed: "The fetch failed.",
    },
    eyebrow: "PEER BENCHMARK · 同業比較", reportTitle: (name, n) => n > 0 ? `${name} vs ${n} peer${n > 1 ? "s" : ""}` : name,
    sectorLabel: "Sector", latestFy: "Latest fiscal year per company", retrieved: "Retrieved", noSector: "No sector distribution",
    fictional: "All company names and figures are fictional placeholders.",
    attribution: (date) => `Data provided by ZENITH Code · saved snapshot retrieved ${date}`,
    sections: "Sections", navProfit: "Profitability", navGrowth: "Growth", navStrength: "Strength", navMix: "Business mix", navPeople: "People", navSources: "Sources",
    emptyLive: "Nothing compared yet. Choose companies above and press Fetch comparison.",
    profitTitle: "Profitability and efficiency", profitLead: "Scale and margins for the latest fiscal year. ROE, ROA and growth are set against the sector's middle 50%.",
    profitFoot: "ROE and ROA are calculated here from period-end values (not averages). Three-year growth appears only when four consecutive fiscal years are available.",
    company: "Company", revenue: "Revenue", operatingIncome: "Operating income", operatingMargin: "Operating margin", netMargin: "Net margin",
    roe: "ROE", roa: "ROA", revenueCagr3y: "3-yr revenue growth", unitOku: "JPY 100m", perYear: "CAGR", calc: "period-end",
    bandTitle: { roe: "ROE (return on equity)", roa: "ROA (return on assets)", revenueCagr3y: "3-year revenue CAGR" },
    bandKeyBand: "Sector middle 50% (Q1–Q3)", bandKeyMedian: "Sector median", bandNone: "No sector distribution",
    bandCaption: (b, n) => `Sector Q1 ${b.q1} · median ${b.median} · Q3 ${b.q3}${n ? ` (n=${n})` : ""}`,
    growthTitle: "Growth trend", growthLead: "Revenue and operating income for the last three fiscal years. Each company has its own scale.",
    growthFoot: "Bar heights show each company's own trend; use the table above to compare size across companies. Losses are drawn below the zero line.",
    strengthTitle: "Financial strength", strengthLead: "Equity ratio, interest-bearing debt and cash flows for the latest fiscal year.",
    strengthFoot: "Negative net interest-bearing debt means cash exceeds interest-bearing debt (net cash). Capital expenditure is an outflow and is shown negative, as returned by the API.",
    equityRatio: "Equity ratio", netDebt: "Net interest-bearing debt", ocf: "Operating CF", capex: "Capex", fcf: "Free CF", netCash: "Net cash",
    mixTitle: "Business mix", mixLead: "Share of external sales by segment, from the latest filing.",
    mixCaution: "Segment definitions differ by company (business lines, regions…). They are shown as reported and never merged or matched across companies. Colours only follow each company's own order.",
    mixBasis: "Basis", mixNone: "No segment data (single segment, or not available)",
    peopleTitle: "People", peopleLead: "Workforce and diversity indicators from the annual securities report.",
    peopleFoot: "Except consolidated employees, values are for the reporting company (non-consolidated). Male childcare-leave methods differ by company and can exceed 100% († includes childcare-purpose leave). The gender wage gap is women's pay as a share of men's.",
    employees: "Employees (parent)", consolidatedEmployees: "Consolidated employees", averageAge: "Average age", averageTenure: "Average tenure",
    averageSalary: "Average salary", femaleManager: "Female managers", maleLeave: "Male childcare leave", wageGap: "Gender wage gap",
    yearsOld: "yrs", yearsTenure: "yrs", unitMan: "JPY m", unitPeople: "people", noPeople: "No workforce disclosure",
    sourcesTitle: "Sources", sourcesLead: "Fiscal period, accounting standard and document ID per company. Original filings are on EDINET.",
    fiscalPeriod: "Fiscal period", standard: "Standard", days: "Days", source: "Source", docId: "Document ID", link: "Filing",
    segmentDoc: "Segments", peopleDoc: "People", openEdinet: "EDINET", synthetic: "Fictional", dayUnit: "days",
    standards: { jgaap: "J-GAAP", ifrs: "IFRS", usgaap: "US GAAP" },
    notesTitle: "How to read this",
    notes: [
      "Figures are each company's latest fiscal year (FY). Companies with different year-ends (e.g. December) share a column — check the fiscal period under each name.",
      "Amounts are rounded to JPY 100 million. The CSV keeps full JPY and ratios as fractions.",
      "ROE = profit attributable to owners of the parent ÷ equity attributable to owners; ROA = net income ÷ total assets. Both use period-end values and are calculated here; the sector distribution may use a different method.",
      "Three-year revenue growth (CAGR) needs four consecutive ordinary fiscal years (360–366 days) with the same year-end month and the same accounting standard at both ends.",
      "The sector band is ZENITH Code's industry benchmark, fetched once for your company's sector code. Peers may belong to another sector.",
      "Figures under different accounting standards (J-GAAP, IFRS, US GAAP) include definitional differences.",
      "Missing or undisclosed values show “—” and are never treated as zero. An actual zero stays zero.",
      "No share prices, market capitalisation or price-based ratios. The server strips them before anything reaches the browser.",
    ],
    footDemo: (date, placeholder) => placeholder ? "Placeholder with fictional companies and figures. Not related to any real company." : `Data provided by ZENITH Code, saved on ${date}; it may not reflect the latest filings.`,
    footLive: (time) => `Retrieved ${time}. Use internally and follow the data-use and display conditions.`,
    chartLabel: (name, list) => `${name} revenue and operating income: ${list}`,
  },
};

let lang = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "ja";
const t = (key) => texts[lang][key] ?? key;
let config = { liveEnabled: false, requestToken: "" };
let demo = null;
let mode = "demo";
const state = { target: null, sector: null, suggestions: [], unticked: new Set(), manual: [], names: new Map(),
  report: null, busy: false };

function node(tag, text, attrs = {}) {
  const el = document.createElement(tag);
  if (text !== undefined && text !== null) el.textContent = text;
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? "" : v);
  return el;
}
const SVG = "http://www.w3.org/2000/svg";
function svg(tag, attrs = {}, text) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
}
// CSSOM writes are allowed under the strict CSP (no inline style attributes).
const place = (el, props) => { for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v); return el; };

const nameOf = (symbol) => {
  const entry = state.names.get(plainSymbol(symbol));
  const name = entry && (lang === "ja" ? entry.nameJa || entry.nameEn : entry.nameEn || entry.nameJa);
  return name || `${t("code")} ${symbol}`;
};
const normalizeInput = (value) => value.normalize("NFKC").trim().toUpperCase();
const validSymbol = (value) => (mode === "demo" ? (SYMBOL.test(value) || DEMO_SYMBOL.test(value)) && Boolean(demoCompany(value)) : SYMBOL.test(value));
const demoCodes = () => (demo?.comparison.companies ?? []).map((c) => c.symbol).join(", ");
const demoDate = () => fmtDate(demo?.comparison.retrievedAt);
const demoSymbolError = () => t("errDemoSymbol")(demoCodes());
const demoCompany = (symbol) => demo?.comparison.companies.find((c) => c.symbol === symbol) ?? null;

function selected() {
  if (!state.target) return [];
  return [state.target, ...state.suggestions.map((s) => s.symbol).filter((s) => !state.unticked.has(s)), ...state.manual];
}
const isSelected = (symbol) => selected().some((s) => plainSymbol(s) === plainSymbol(symbol));

function setStatus(message, kind = "") {
  const el = $("status");
  el.textContent = message || "";
  el.dataset.kind = kind;
}

// ---------- Setup panel ----------
function renderSetup() {
  $("modeLive").disabled = !config.liveEnabled;
  $("modeNote").textContent = mode === "demo" ? t("noteDemo")(demoDate(), demoCodes(), Boolean(demo?.placeholder)) + (config.liveEnabled ? "" : " " + t("noteLiveOff")) : t("noteLive");
  $("targetInput").placeholder = mode === "demo" ? "DEMO-A" : "7203";
  $("addInput").placeholder = mode === "demo" ? "DEMO-F" : "7267";
  document.querySelector("#targetForm .hint").textContent = mode === "live" ? t("suggestHintLive") : t("suggestHint");
  const picks = $("picks");
  picks.replaceChildren();
  const count = selected().length;
  if (state.target) {
    const li = node("li", undefined, { class: "pick self" });
    li.append(node("span", t("self"), { class: "tag" }), node("span", nameOf(state.target), { class: "pick-name" }),
      node("span", state.target, { class: "pick-code" }));
    picks.append(li);
  }
  for (const s of state.suggestions) {
    const li = node("li", undefined, { class: "pick" });
    const label = node("label");
    const box = node("input", undefined, { type: "checkbox" });
    box.checked = !state.unticked.has(s.symbol);
    box.disabled = state.busy || (!box.checked && count >= MAX_COMPANIES);
    box.addEventListener("change", () => {
      if (box.checked) state.unticked.delete(s.symbol); else state.unticked.add(s.symbol);
      renderSetup();
    });
    label.append(box, node("span", nameOf(s.symbol), { class: "pick-name" }), node("span", s.symbol, { class: "pick-code" }));
    li.append(label);
    picks.append(li);
  }
  for (const symbol of state.manual) {
    const li = node("li", undefined, { class: "pick manual" });
    const button = node("button", "×", { type: "button", class: "remove", "aria-label": `${t("remove")} ${symbol}` });
    button.disabled = state.busy;
    button.addEventListener("click", () => { state.manual = state.manual.filter((m) => m !== symbol); renderSetup(); });
    li.append(node("span", nameOf(symbol), { class: "pick-name" }), node("span", symbol, { class: "pick-code" }), button);
    picks.append(li);
  }
  $("countHint").textContent = t("countHint")(count);
  const sector = state.sector && state.target ? state.sector : null;
  $("requestHint").textContent = mode === "demo" ? t("requestDemo") : t("requestLive")(Math.max(1, count) * 6 + (sector ? 1 : 0), Boolean(sector));
  for (const id of ["suggestButton", "fetchButton", "targetInput", "addInput"]) $(id).disabled = state.busy;
  $("fetchButton").setAttribute("aria-busy", String(state.busy));
}

function resetSelection(target = null) {
  state.target = target; state.sector = null; state.suggestions = []; state.unticked = new Set(); state.manual = [];
}

async function post(path, body) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "X-Local-Token": config.requestToken },
    body: JSON.stringify(body) });
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "failed");
  return data;
}
const errorText = (error) => texts[lang].errors[error?.message] ?? texts[lang].errors.failed;

async function suggest(event) {
  event.preventDefault();
  const symbol = normalizeInput($("targetInput").value);
  $("targetInput").value = symbol;
  if (!validSymbol(symbol)) return setStatus(mode === "demo" ? demoSymbolError() : t("errSymbol"), "error");
  resetSelection(symbol);
  if (mode === "demo") {
    applyPeers(demo.peers.target.symbol === symbol ? demo.peers : { target: { symbol, ...nameEntry(symbol) }, peers: [] }, symbol);
    return;
  }
  state.busy = true; renderSetup(); setStatus(t("loadingPeers"));
  try {
    applyPeers(await post("/api/peers", { symbol }), symbol);
  } catch (error) {
    setStatus(error.message === "invalid_response" ? t("errors").invalid_response : errorText(error), "error");
  } finally {
    state.busy = false; renderSetup();
  }
}
const nameEntry = (symbol) => state.names.get(plainSymbol(symbol)) ?? {};

function applyPeers(result, symbol) {
  let peers;
  try { peers = normalizePeers(result, symbol); } catch { setStatus(t("errors").invalid_response, "error"); return; }
  for (const row of [peers.target, ...peers.peers])
    if (row.nameJa || row.nameEn) state.names.set(plainSymbol(row.symbol), { nameJa: row.nameJa, nameEn: row.nameEn });
  state.target = symbol;
  state.sector = peers.target.sector && /^\d{4}$/.test(peers.target.sector) ? peers.target.sector : null;
  state.suggestions = peers.peers.map((p) => ({ symbol: p.symbol }));
  state.unticked = new Set();
  renderSetup();
  setStatus(t("peersDone")(peers.peers.length), "ok");
}

function addCode(event) {
  event.preventDefault();
  const symbol = normalizeInput($("addInput").value);
  if (!state.target) {
    const target = normalizeInput($("targetInput").value);
    if (!validSymbol(target)) return setStatus(t("errTarget"), "error");
    resetSelection(target);
  }
  if (!validSymbol(symbol)) return setStatus(mode === "demo" ? demoSymbolError() : t("errSymbol"), "error");
  const suggestion = state.suggestions.find((s) => plainSymbol(s.symbol) === plainSymbol(symbol));
  if (isSelected(symbol)) return setStatus(t("errDuplicate"), "error");
  if (selected().length >= MAX_COMPANIES) return setStatus(t("errMax"), "error");
  if (suggestion) state.unticked.delete(suggestion.symbol); else state.manual.push(symbol);
  $("addInput").value = "";
  setStatus("");
  renderSetup();
}

async function fetchComparison() {
  const typed = normalizeInput($("targetInput").value);
  if (!state.target || typed !== state.target) {
    if (!validSymbol(typed)) return setStatus(state.target || typed ? (mode === "demo" ? demoSymbolError() : t("errSymbol")) : t("errTarget"), "error");
    resetSelection(typed);
  }
  const symbols = selected();
  if (mode === "demo") {
    // Same validation path as live data, fed from the saved snapshot in demo.json.
    const subset = { ...demo.comparison, companies: symbols.map((s) => demoCompany(s)) };
    return showReport(subset, symbols, demo.peers.target.symbol === state.target ? demo.peers.target.sector : null, "demo");
  }
  state.busy = true; renderSetup(); setStatus(t("loadingCompare")(symbols.length));
  // A failed or partial fetch never leaves the previous company set on screen.
  state.report = null; renderReport();
  try {
    const result = await post("/api/compare", { symbols, sector: state.sector });
    showReport(result, symbols, state.sector, "live");
  } catch (error) {
    setStatus(errorText(error), "error");
  } finally {
    state.busy = false; renderSetup();
  }
}

function showReport(result, symbols, sector, source) {
  try {
    const data = normalizeComparison(result, symbols, sector);
    state.report = { ...data, symbols, source, sector };
    setStatus(t("compareDone")(symbols.length), "ok");
  } catch {
    state.report = null;
    setStatus(t("errors").invalid_response, "error");
  }
  renderReport();
}

// ---------- Report ----------
function companyHead(row, i, extra) {
  const th = node("th", undefined, { scope: "row", class: "co" });
  const name = node("span", nameOf(row.symbol), { class: "co-name", title: nameOf(row.symbol) });
  if (i === 0) name.prepend(node("span", t("self"), { class: "tag" }));
  th.append(name, node("span", [row.symbol, extra].filter(Boolean).join(" · "), { class: "co-meta" }));
  return th;
}
const fyLabel = (row) => (row.fiscalPeriod ? `FY${row.fiscalPeriod}` : "");
const standardLabel = (value) => (value ? texts[lang].standards[String(value).toLowerCase()] ?? value : "—");

// Value with a thin bar on a shared zero baseline for the column.
function barCell(value, text, scale, extraClass = "", negClass = "neg") {
  const td = node("td", undefined, { class: "num " + extraClass });
  td.append(node("span", text, { class: "val" + (text === "—" ? " missing" : "") }));
  const geometry = barGeometry(value, scale);
  const track = node("span", undefined, { class: "bar" + (geometry ? "" : " bar-none"), "aria-hidden": "true" });
  if (geometry) {
    if (scale.min < 0) track.append(place(node("i", undefined, { class: "axis0" }), { "--x": geometry.zero + "%" }));
    track.append(place(node("b", undefined, { class: geometry.negative ? negClass : "" }), { "--l": geometry.left + "%", "--w": Math.max(geometry.width, 0.6) + "%" }));
  }
  td.append(track);
  return td;
}
function header(table, columns) {
  const thead = node("thead"), tr = node("tr");
  for (const [label, unit, cls] of columns) {
    const th = node("th", undefined, { scope: "col", class: cls ?? "num" });
    th.append(node("span", label));
    if (unit) th.append(node("small", unit));
    tr.append(th);
  }
  thead.append(tr);
  table.replaceChildren(thead);
  const tbody = node("tbody");
  table.append(tbody);
  return tbody;
}

function renderProfit(rows) {
  const tbody = header($("profitTable"), [[t("company"), "", "co"], [t("revenue"), t("unitOku")], [t("operatingMargin"), "%"],
    [t("netMargin"), "%"], [t("roe"), t("calc")], [t("roa"), t("calc")], [t("revenueCagr3y"), t("perYear")]]);
  const scale = (key) => domain(rows.map((r) => r[key]));
  const scales = Object.fromEntries(["revenue", "operatingMargin", "netMargin", "roe", "roa", "revenueCagr3y"].map((k) => [k, scale(k)]));
  rows.forEach((row, i) => {
    const tr = node("tr", undefined, { class: i === 0 ? "self" : "" });
    tr.append(companyHead(row, i, [fyLabel(row), standardLabel(row.accountingStandard)].filter((x) => x !== "—").join(" · ")),
      barCell(row.revenue, oku(row.revenue, lang), scales.revenue));
    for (const key of ["operatingMargin", "netMargin", "roe", "roa", "revenueCagr3y"])
      tr.append(barCell(row[key], percent(row[key], lang), scales[key]));
    tbody.append(tr);
  });
}

function renderBands(rows, benchmark) {
  const wrap = $("bands");
  wrap.replaceChildren();
  const key = node("p", undefined, { class: "key band-key" });
  for (const [cls, label] of [["sw-band", "bandKeyBand"], ["sw-median", "bandKeyMedian"], ["sw-self", "self"]]) {
    const item = node("span", undefined, { class: "key-item" });
    item.append(node("span", undefined, { class: "sw " + cls }), node("span", t(label)));
    key.append(item);
  }
  wrap.append(key);
  const grid = node("div", undefined, { class: "band-grid" });
  for (const metric of ["roe", "roa", "revenueCagr3y"]) {
    const band = benchmark?.[metric] ?? null;
    const axis = niceAxis([...rows.map((r) => r[metric]), band?.q1, band?.q3], 4);
    const panel = node("figure", undefined, { class: "band-panel" });
    panel.append(node("figcaption", t("bandTitle")[metric]));
    const list = node("div", undefined, { class: "band-rows" });
    rows.forEach((row, i) => {
      const line = node("div", undefined, { class: "band-row" + (i === 0 ? " self" : "") });
      const track = node("span", undefined, { class: "track", "aria-hidden": "true" });
      if (band) {
        const a = position(band.q1, axis), b = position(band.q3, axis);
        track.append(place(node("i", undefined, { class: "band" }), { "--l": a + "%", "--w": Math.max(b - a, 0.5) + "%" }),
          place(node("i", undefined, { class: "median" }), { "--x": position(band.median, axis) + "%" }));
      }
      if (axis.min < 0) track.append(place(node("i", undefined, { class: "zero" }), { "--x": position(0, axis) + "%" }));
      const at = position(row[metric], axis);
      if (at !== null) track.append(place(node("b", undefined, { class: "dot" }), { "--x": at + "%" }));
      line.append(node("span", nameOf(row.symbol), { class: "bn", title: nameOf(row.symbol) }), track,
        node("span", percent(row[metric], lang), { class: "bv" + (row[metric] === null ? " missing" : "") }));
      list.append(line);
    });
    const ticks = node("div", undefined, { class: "band-row axis", "aria-hidden": "true" });
    const scale = node("span", undefined, { class: "track" });
    // Up to one decimal so 2.5% is not rounded to 3%; odd ticks hide on narrow screens.
    const tickText = new Intl.NumberFormat(lang === "ja" ? "ja-JP" : "en-US", { style: "percent", maximumFractionDigits: 1 });
    const step = axis.ticks.length > 6 ? 2 : 1;
    axis.ticks.forEach((tick, i) => {
      if (i % step) return;
      scale.append(place(node("span", tickText.format(tick), { class: (i / step) % 2 ? "odd" : "" }), { "--x": position(tick, axis) + "%" }));
    });
    ticks.append(node("span"), scale, node("span"));
    list.append(ticks);
    panel.append(list);
    const fmt = band ? { q1: percent(band.q1, lang), median: percent(band.median, lang), q3: percent(band.q3, lang) } : null;
    panel.append(node("p", band ? t("bandCaption")(fmt, band.count) : t("bandNone"), { class: "band-cap" }));
    grid.append(panel);
  }
  wrap.append(grid);
}

function growthChart(company, label) {
  const years = company.years.slice(-3);
  const W = 320, H = 172, top = 22, bottom = 134, padX = 6;
  const values = years.flatMap((y) => [y.revenue, y.operatingIncome]);
  const axis = niceAxis(values, 3);
  const y = (v) => top + ((axis.max - v) / (axis.max - axis.min)) * (bottom - top);
  const chart = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", class: "growth-svg" });
  const summary = years.map((r) => `${r.fiscalPeriod} ${oku(r.revenue, lang)} / ${oku(r.operatingIncome, lang)}`).join(", ");
  chart.append(svg("title", {}, t("chartLabel")(label, summary + ` (${t("unitOku")})`)));
  for (const tick of axis.ticks)
    chart.append(svg("line", { x1: padX, x2: W - padX, y1: y(tick), y2: y(tick), class: tick === 0 ? "zero" : "grid" }));
  const group = (W - padX * 2) / 3, bar = 36;
  years.forEach((row, i) => {
    const cx = padX + group * i + group / 2;
    [["revenue", cx - bar - 2, "rev"], ["operatingIncome", cx + 2, "op"]].forEach(([field, x, cls]) => {
      const v = row[field] === null || row[field] === undefined ? null : Number(row[field]);
      const mid = x + bar / 2;
      if (!Number.isFinite(v)) {
        chart.append(svg("text", { x: mid, y: y(0) - 5, class: "v missing", "text-anchor": "middle" }, "—"));
        return;
      }
      const y0 = y(0), y1 = y(v);
      chart.append(svg("rect", { x, y: Math.min(y0, y1), width: bar, height: Math.max(Math.abs(y1 - y0), 1), class: cls + (v < 0 ? " neg" : "") }));
      chart.append(svg("text", { x: mid, y: v < 0 ? Math.max(y0, y1) + 12 : Math.min(y0, y1) - 5, "text-anchor": "middle",
        class: "v " + cls + (v < 0 ? " neg" : "") }, oku(v, lang)));
    });
    chart.append(svg("text", { x: cx, y: H - 14, "text-anchor": "middle", class: "fy" }, row.fiscalPeriod));
  });
  if (!years.length) chart.append(svg("text", { x: W / 2, y: H / 2, "text-anchor": "middle", class: "v missing" }, "—"));
  return chart;
}

function renderGrowth(companies, rows) {
  const wrap = $("multiples");
  wrap.replaceChildren();
  companies.forEach((company, i) => {
    const card = node("article", undefined, { class: "multiple" + (i === 0 ? " self" : "") });
    const head = node("header");
    const name = node("h4", nameOf(company.symbol), { title: nameOf(company.symbol) });
    if (i === 0) name.prepend(node("span", t("self"), { class: "tag" }));
    const row = rows[i];
    head.append(name, node("p", `${t("operatingMargin")} ${percent(row.operatingMargin, lang)} · ${t("revenueCagr3y")} ${percent(row.revenueCagr3y, lang)}`, { class: "co-meta" }));
    card.append(head, growthChart(company, nameOf(company.symbol)));
    wrap.append(card);
  });
}

function renderStrength(rows) {
  const tbody = header($("strengthTable"), [[t("company"), "", "co"], [t("equityRatio"), "%"], [t("netDebt"), t("unitOku")],
    [t("ocf"), t("unitOku")], [t("capex"), t("unitOku")], [t("fcf"), t("unitOku")]]);
  const keys = ["equityRatio", "netInterestBearingDebt", "operatingCashFlow", "capitalExpenditure", "freeCashFlow"];
  const scales = Object.fromEntries(keys.map((k) => [k, domain(rows.map((r) => r[k]))]));
  rows.forEach((row, i) => {
    const tr = node("tr", undefined, { class: i === 0 ? "self" : "" });
    tr.append(companyHead(row, i, row.balancePeriod ? `FY${row.balancePeriod}` : ""), barCell(row.equityRatio, percent(row.equityRatio, lang), scales.equityRatio));
    // Net cash (negative net debt) and capex outflows are not "bad" negatives, so they are not drawn in red.
    const debt = barCell(row.netInterestBearingDebt, oku(row.netInterestBearingDebt, lang), scales.netInterestBearingDebt, "", "cash");
    if (row.netInterestBearingDebt !== null && row.netInterestBearingDebt < 0) debt.querySelector(".val").append(node("small", t("netCash"), { class: "note" }));
    tr.append(debt);
    for (const key of keys.slice(2)) tr.append(barCell(row[key], oku(row[key], lang), scales[key], "", key === "capitalExpenditure" ? "out" : "neg"));
    tbody.append(tr);
  });
}

const MIX_COLORS = 6;
function renderMix(companies) {
  const wrap = $("mix");
  wrap.replaceChildren();
  companies.forEach((company, i) => {
    const mix = segmentMix(company.segments);
    const row = node("div", undefined, { class: "mix-row" + (i === 0 ? " self" : "") });
    const name = node("div", undefined, { class: "mix-name" });
    const title = node("span", nameOf(company.symbol), { class: "co-name", title: nameOf(company.symbol) });
    if (i === 0) title.prepend(node("span", t("self"), { class: "tag" }));
    name.append(title, node("span", [company.symbol, mix ? `FY${mix.fiscalPeriod}` : ""].filter(Boolean).join(" · "), { class: "co-meta" }));
    const body = node("div", undefined, { class: "mix-body" });
    if (!mix) {
      body.append(node("p", t("mixNone"), { class: "mix-none" }));
    } else {
      const bar = node("div", undefined, { class: "stack", role: "img",
        "aria-label": mix.items.map((s) => `${s.segment} ${percent(s.share, lang)}`).join(", ") });
      const legend = node("ul", undefined, { class: "mix-legend" });
      mix.items.forEach((s, k) => {
        const color = "c" + (k % MIX_COLORS);
        const part = place(node("span", undefined, { class: "part " + color, title: `${s.segment} ${percent(s.share, lang)}` }), { "--w": s.share * 100 + "%" });
        if (s.share >= 0.16) part.append(node("span", `${s.segment} ${percent(s.share, lang, 0)}`));
        bar.append(part);
        const li = node("li");
        li.append(node("i", undefined, { class: "sw " + color }), node("span", s.segment), node("b", percent(s.share, lang)));
        legend.append(li);
      });
      body.append(bar, legend, node("p", `${t("mixBasis")}: ${mix.basis || "—"}`, { class: "mix-basis" }));
    }
    row.append(name, body);
    wrap.append(row);
  });
}

function renderPeople(rows) {
  const tbody = header($("peopleTable"), [[t("company"), "", "co"], [t("employees"), t("unitPeople")], [t("consolidatedEmployees"), t("unitPeople")],
    [t("averageAge"), t("yearsOld")], [t("averageTenure"), t("yearsTenure")], [t("averageSalary"), t("unitMan")],
    [t("femaleManager"), "%"], [t("maleLeave"), "%"], [t("wageGap"), "%"]]);
  const ratioKeys = ["femaleManagerRatio", "maleChildcareLeaveRatio", "wageGapAll"];
  const scales = Object.fromEntries(ratioKeys.map((k) => [k, domain(rows.map((r) => r[k]))]));
  rows.forEach((row, i) => {
    const tr = node("tr", undefined, { class: i === 0 ? "self" : "" });
    const empty = ["employees", "consolidatedEmployees", "averageAge", "averageTenureYears", "averageAnnualSalary", ...ratioKeys].every((k) => row[k] === null);
    tr.append(companyHead(row, i, empty ? t("noPeople") : row.peoplePeriod ? `FY${row.peoplePeriod}` : ""));
    const plain = (text) => node("td", undefined, { class: "num" }).appendChild(node("span", text, { class: "val" + (text === "—" ? " missing" : "") })).parentNode;
    tr.append(plain(number(row.employees, lang)), plain(number(row.consolidatedEmployees, lang)), plain(number(row.averageAge, lang, 1)),
      plain(number(row.averageTenureYears, lang, 1)), plain(salary(row.averageAnnualSalary, lang)));
    tr.append(barCell(row.femaleManagerRatio, percent(row.femaleManagerRatio, lang), scales.femaleManagerRatio));
    const leave = barCell(row.maleChildcareLeaveRatio, percent(row.maleChildcareLeaveRatio, lang), scales.maleChildcareLeaveRatio);
    if (row.maleChildcareLeaveBasis === "childcare-leave-and-purpose-leave") leave.querySelector(".val").append(node("sup", "†"));
    tr.append(leave, barCell(row.wageGapAll, percent(row.wageGapAll, lang), scales.wageGapAll));
    tbody.append(tr);
  });
}

function renderSources(companies, rows) {
  const tbody = header($("sourcesTable"), [[t("company"), "", "co"], [t("fiscalPeriod"), "", "txt"], [t("standard"), "", "txt"],
    [t("days"), "", "num"], [t("source"), "", "txt"], [t("docId"), "", "txt"], [t("link"), "", "txt"], [t("segmentDoc"), "", "txt"], [t("peopleDoc"), "", "txt"]]);
  companies.forEach((company, i) => {
    const row = rows[i];
    const tr = node("tr", undefined, { class: i === 0 ? "self" : "" });
    const cell = (text, cls = "txt") => node("td", text ?? "—", { class: cls + (text ? "" : " missing") });
    const link = node("td", undefined, { class: "txt" });
    if (row.sourceUrl) link.append(node("a", t("openEdinet") + " ↗", { href: row.sourceUrl, target: "_blank", rel: "noreferrer noopener" }));
    else link.append(node("span", row.source === "synthetic" ? t("synthetic") : "—", { class: "missing" }));
    const filing = (r) => {
      const td = node("td", undefined, { class: "txt" + (r ? "" : " missing") });
      if (!r) return td.appendChild(document.createTextNode("—")).parentNode;
      td.append(node("span", `FY${r.fiscalPeriod}`, { class: "val" }), node("span", r.docId ?? "", { class: "co-meta mono" }));
      return td;
    };
    tr.append(companyHead(row, i, ""), cell(row.fiscalPeriod), cell(row.accountingStandard ? standardLabel(row.accountingStandard) : null),
      cell(row.fiscalPeriodDays === null ? null : `${row.fiscalPeriodDays} ${t("dayUnit")}`, "num"),
      cell(row.source === "synthetic" ? t("synthetic") : row.source ? row.source.toUpperCase() : null), cell(row.docId, "txt mono"), link,
      filing(company.segments), filing(company.workforce ?? company.diversity));
    tbody.append(tr);
  });
}

function fmtDate(value) {
  const date = value ? new Date(value) : null;
  return !date || Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(lang === "ja" ? "ja-JP" : "en-GB", { dateStyle: "medium" }).format(date);
}
function fmtTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(lang === "ja" ? "ja-JP" : "en-GB",
    { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function renderReport() {
  const report = state.report;
  const isDemo = report?.source === "demo";
  document.body.dataset.source = report ? report.source : "none";
  // Demo attribution: the saved snapshot date, or a clear placeholder label.
  $("fictional").hidden = !isDemo;
  $("fictional").classList.toggle("placeholder", Boolean(isDemo && demo?.placeholder));
  if (isDemo) $("fictional").textContent = demo?.placeholder ? t("fictional") : t("attribution")(fmtDate(report.retrievedAt));
  $("sections").hidden = !report;
  $("emptyState").hidden = Boolean(report);
  $("csvButton").disabled = !report;
  if (!report) {
    $("reportTitle").textContent = t("title");
    $("reportMeta").textContent = "";
    $("companyLegend").replaceChildren();
    $("emptyState").textContent = t("emptyLive");
    $("footText").textContent = "";
    return;
  }
  const rows = report.companies.map(companyMetrics);
  const b = report.benchmark;
  $("reportTitle").textContent = t("reportTitle")(nameOf(report.symbols[0]), report.symbols.length - 1);
  const sector = b ? `${t("sectorLabel")}: ${(lang === "ja" ? b.sectorJa : b.sectorEn) || b.sector} (${b.sector})` : t("noSector");
  $("reportMeta").textContent = [sector, t("latestFy"), `${t("retrieved")} ${fmtTime(report.retrievedAt)}`].join("  ·  ");
  const legend = $("companyLegend");
  legend.replaceChildren(...rows.map((row, i) => {
    const li = node("li", undefined, { class: i === 0 ? "self" : "" });
    li.append(node("span", nameOf(row.symbol), { class: "co-name" }), node("span", [row.symbol, fyLabel(row)].filter(Boolean).join(" · "), { class: "co-meta" }));
    return li;
  }));
  renderProfit(rows);
  renderBands(rows, b);
  renderGrowth(report.companies, rows);
  renderStrength(rows);
  renderMix(report.companies);
  renderPeople(rows);
  renderSources(report.companies, rows);
  $("notes").replaceChildren(...texts[lang].notes.map((n) => node("li", n)));
  $("footText").textContent = isDemo ? t("footDemo")(fmtDate(report.retrievedAt), Boolean(demo?.placeholder)) : t("footLive")(fmtTime(report.retrievedAt));
}

function exportCsv() {
  const report = state.report;
  if (!report) return;
  const rows = report.companies.map((c, i) => ({ ...companyMetrics(c), name: nameOf(c.symbol), role: i === 0 ? "self" : "peer" }));
  const blob = new Blob([comparisonCsv(rows, report.benchmark)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = node("a", undefined, { href: url, download: `peer-benchmark-${plainSymbol(report.symbols[0]).replace(/[^A-Z0-9-]/gi, "")}-${report.source}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ---------- Language, theme, mode ----------
function applyTexts() {
  document.documentElement.lang = lang;
  document.title = lang === "ja" ? "比較ボード · ZENITH Code" : "Peer Benchmark Board · ZENITH Code";
  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll("[data-i18n-label]")) el.setAttribute("aria-label", t(el.dataset.i18nLabel));
  $("langJa").setAttribute("aria-pressed", String(lang === "ja"));
  $("langEn").setAttribute("aria-pressed", String(lang === "en"));
  const dark = currentTheme() === "dark";
  $("themeToggle").textContent = dark ? t("themeLight") : t("themeDark");
  $("themeToggle").setAttribute("aria-pressed", String(dark));
  renderSetup();
  renderReport();
}
const currentTheme = () => document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
function setLang(next) {
  lang = next;
  applyTexts();
}

function setMode(next) {
  if (next === "live" && !config.liveEnabled) return;
  mode = next;
  resetSelection();
  state.report = null;
  setStatus("");
  if (mode === "demo") loadDemo(); else { $("targetInput").value = ""; renderSetup(); renderReport(); }
}

function loadDemo() {
  $("targetInput").value = demo.peers.target.symbol;
  applyPeers(demo.peers, demo.peers.target.symbol);
  fetchComparison();
  setStatus("");
}

async function start() {
  $("langJa").addEventListener("click", () => setLang("ja"));
  $("langEn").addEventListener("click", () => setLang("en"));
  $("themeToggle").addEventListener("click", () => {
    document.documentElement.dataset.theme = currentTheme() === "dark" ? "light" : "dark";
    applyTexts();
  });
  $("printButton").addEventListener("click", () => window.print());
  $("csvButton").addEventListener("click", exportCsv);
  $("targetForm").addEventListener("submit", suggest);
  $("addForm").addEventListener("submit", addCode);
  $("fetchButton").addEventListener("click", fetchComparison);
  for (const radio of document.querySelectorAll("input[name=mode]")) radio.addEventListener("change", () => setMode(radio.value));
  const [cfg, data] = await Promise.all([fetch("/api/config").then((r) => r.json()), fetch("/api/demo").then((r) => r.json())]);
  config = cfg;
  demo = data;
  for (const row of [demo.peers.target, ...demo.peers.peers]) state.names.set(row.symbol, { nameJa: row.nameJa, nameEn: row.nameEn });
  applyTexts();
  loadDemo();
}
start().catch(() => setStatus(texts[lang].errors.local_only, "error"));
