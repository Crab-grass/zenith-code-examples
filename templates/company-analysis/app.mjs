import { normalize, finite, axis, money, percent, comparisonConditions, changeRate, chartAxis } from "./model.mjs";
const $ = (id) => document.getElementById(id);
const texts = {
  ja: {
    customize: "表示をカスタマイズ",
    close: "閉じる",
    reviewPeriod: "対象決算期",
    comparison: "企業比較",
    peerCompany: "比較する企業",
    compareLoad: "比較データを取得",
    comparePeriod: "共通の決算期",
    compareCaution: "決算期・会計基準・期間日数を確認。業種や事業構成の違いを調整した比較ではありません。",
    exportCsv: "表をCSVで保存",
    showComparison: "企業比較を表示",
    showHelp: "各カードにAPIの説明を表示",
    compactView: "コンパクト表示",
    preferencesNote: "表示設定だけをこのブラウザに保存します。企業データやAPIキーは保存しません。",
    yearChange: "前期比",
    notComparable: "前期比較なし",
    conditionsMatch: "決算期・会計基準・期間日数が一致",
    conditionsDiffer: "比較条件に差異・不明点あり",
    noCommonPeriod: "共通の決算期がありません。",
    peerPrompt: "比較する証券コードを入力して取得してください。1回につき最大2リクエスト。",
    sameCompany: "別の企業を指定してください。",
    peerLoading: "比較データを取得しています…",
    sampleComparison: "架空企業の比較例",
    currentCompany: "選択中の企業",
    noValue: "未開示・未取得",
    apiCaption: "取得するデータと、グラフになるまでの流れを確認。",
    apiQuoteTitle: "株価データ",
    apiQuotePurpose: "直近終値と、その株価が属する日付。",
    apiFinancialTitle: "財務データ",
    apiFinancialPurpose: "最新3通期までの業績・利益率と、データの出典。",
    apiInput: "リクエスト条件",
    apiBase: "共通の接続先",
    flowFetchNote: "株価と損益計算書の2つのAPI。",
    flowShapeNote: "期間順に並べ、円・億円・%を使い分け。",
    flowDisplayNote: "同じデータから、数値・推移・出典を表示。",

    themeTitle: "見た目を選ぶ",
    themeNote: "数字はそのまま。自分の用途に合うスタイルへ。",
    cool: "クール",
    pop: "ポップ",
    dark: "ダーク",
    coolNote: "端正な分析画面",
    popNote: "大きな数字と彩り",
    darkNote: "暗い背景、鮮明な数字",
    apiOverview: "この画面は、どのAPIで作れる？",
    apiIntro:
      "実データ接続では、株価と損益計算書の2つのAPIを使います。今のデモは同じ構造の架空データです。",
    flowFetch: "APIから取得",
    flowShape: "期間・単位を整える",
    flowDisplay: "画面へ表示",
    apiExample:
      "上の条件は証券コード7203のリクエスト例です。この説明を開いても通信は発生しません。デモの企業とは対応しません。",
    apiPrivacy:
      "実データは取得ボタンを押したときだけ最大2リクエスト。APIキーはローカルサーバーが保持します。スタイル・言語・グラフの切り替えでは再取得しません。",
    apiDetail: "使っているAPI",
    apiFields: "使う項目",
    apiTransform: "画面への変換",
    apiDemo: "デモでは架空データを使用。以下は実データ接続時の対応です。",
    apiMoney:
      "fiscalPeriodで決算期を並べ、金額を1億で割って表示。欠損は「—」、赤字は負の値のまま表示します。",
    apiMargin:
      "APIの比率を100倍して%表示（0.125 → 12.5%）。欠損部分の線はつなぎません。",
    apiQuote:
      "priceを円、priceDateを株価の日付として表示。リアルタイム株価ではなく直近終値です。",
    apiTable:
      "最新3通期までを取得し、古い期から並べます。金額は円、利益率は%。会計基準・期間日数も併記します。",
    apiProvenance:
      "各期のprovenanceをそのまま表示。訂正情報・項目別出典が返る場合も確認できます。独自のXBRL解析はこの画面では行いません。",

    overview: "企業の概要",
    financials: "財務データ",
    sources: "データの出典",
    yourWorkspace: "自分だけの分析ツールへ",
    templateNote: "この画面を出発点に、自分の用途に合わせた分析ツールへ。",
    viewCode: "GitHubでコードを見る ↗",
    breadcrumb: "ワークスペース / 企業分析",
    guide: "解析ガイド ↗",
    title: "企業・決算分析",
    lead: "業績の推移と、その出典をひとつの画面で。",
    private: "ローカル環境",
    demo: "サンプルで試す",
    live: "実データに接続",
    company: "サンプル企業",
    symbol: "証券コード",
    loadDemo: "表示する",
    loadLive: "データを取得",
    setupTitle: "ZENITH Codeの実データを使う",
    setupBody:
      "会員登録と必要なデータ利用条件への同意後、APIキーを作成してください。このプログラムを終了し、次のコマンドで起動し直すと接続できます。",
    setupKey:
      "APIキーは端末の非表示入力で設定します。チャットやブラウザの入力欄へ貼り付ける必要はありません。",
    signup: "会員登録・APIキーの取得 ↗",
    revenue: "売上高",
    operatingIncome: "営業利益",
    netIncome: "純利益",
    operatingMargin: "営業利益率",
    reportedMargin: "APIの営業利益率を表示",
    price: "直近終値",
    performance: "BUSINESS PERFORMANCE",
    trend: "業績の推移",
    metric: "表示する指標",
    amountUnit: "単位：億円",
    fullYen: "金額：円 / 利益率：%",
    periodNote:
      "FY（通期）のみを表示。決算期間の日数・会計基準も確認してください。期間変更などの比較調整はしていません。",
    readCarefully: "数字を読む前に",
    readingNote: "まず期間・単位・出典を確認する。それが分析の出発点です。",
    missingNote: "「—」は未取得・未開示です。0に置き換えません。",
    datesNote:
      "株価の日付と決算期は別です。最新株価と過去決算から独自のPER等は計算しません。",
    amendmentNote: "訂正後の数値は、過去の時点で知り得た数値とは限りません。",
    dataTerms: "データの表示・利用条件 ↗",
    demoNotice:
      "デモ表示：企業名・株価・財務数値はすべて架空です。実際の企業データではありません。",
    liveNotice:
      "実データ表示：ご自身の非公開環境で利用してください。株価・制限対象の書類等の公開はできません。",
    demoRequest:
      "登録不要・API通信なし。企業を切り替えて、グラフと表の動きを試せます。",
    liveRequest:
      "取得ボタン1回につき最大2リクエスト / 2 APIトークン。最新の利用枠が適用されます。自動更新・自動購入は行いません。",
    loading: "データを取得しています…",
    unavailable: "—",
    missing: "未取得",
    noData: "この銘柄・期間の財務データはありません。",
    noQuote: "株価未取得",
    period: "決算期",
    days: "決算期間（日）",
    basis: "会計基準",
    fy: "通期",
    obtained: "取得日時",
    updated: "行の更新日時",
    sourceDetail: "出典情報を確認",
    synthetic: "架空の学習用データ",
    amended: "訂正あり",
    unknown: "情報なし",
    priceOn: "株価日付",
    yen: "円",
    hundredMillion: "億円",
    invalid_symbol: "証券コードを確認してください（例：7203 / 130A）。",
    upstream_failed:
      "取得できませんでした。キー・利用条件への同意・利用枠・接続状態を確認してください。自動再試行はしません。",
    invalid_response: "想定外のデータ形式のため、表示を停止しました。",
    busy: "別の取得が進行中です。少し待ってから再度操作してください。",
    local_only: "ローカル接続を確認し、ページを開き直してください。",
    setup_required: "実データ接続の設定が必要です。",
    network:
      "接続できませんでした。ローカルサーバーが起動しているか確認してください。",
    noRows: "データなし",
    field: "項目",
    companyLabel: "銘柄",
    demoAsOf: "サンプルの固定日時",
    range: "収録期間",
    mixed: "複数の出典",
  },
  en: {
    customize: "Customize view",
    close: "Close",
    reviewPeriod: "Reporting period",
    comparison: "Company comparison",
    peerCompany: "Compare with",
    compareLoad: "Load comparison",
    comparePeriod: "Common period",
    compareCaution: "Check reporting periods, standards and duration. Sector and business mix differences are not adjusted.",
    exportCsv: "Export table CSV",
    showComparison: "Show company comparison",
    showHelp: "Show API details on each card",
    compactView: "Compact layout",
    preferencesNote: "Only display preferences are saved in this browser. Company data and API keys are not stored.",
    yearChange: "vs. prior year",
    notComparable: "No prior-period comparison",
    conditionsMatch: "Period, standard and duration match",
    conditionsDiffer: "Comparison conditions differ or are unknown",
    noCommonPeriod: "No common reporting period.",
    peerPrompt: "Enter a comparison symbol and load. Up to 2 requests per load.",
    sameCompany: "Choose a different company.",
    peerLoading: "Loading comparison…",
    sampleComparison: "Synthetic comparison",
    currentCompany: "Selected company",
    noValue: "Not disclosed / unavailable",
    apiCaption: "Explore the data sources and how they become this dashboard.",
    apiQuoteTitle: "Stock price data",
    apiQuotePurpose: "The latest closing price and its trading date.",
    apiFinancialTitle: "Financial data",
    apiFinancialPurpose:
      "Up to three full fiscal years, margins and source information.",
    apiInput: "Request parameters",
    apiBase: "API base URL",
    flowFetchNote: "Two APIs: quotes and income statements.",
    flowShapeNote: "Sort periods and format JPY, JPY 100 million and percentages.",
    flowDisplayNote: "One dataset for figures, trends and sources.",

    themeTitle: "Choose your style",
    themeNote: "Same numbers. A workspace that feels like yours.",
    cool: "Cool",
    pop: "Pop",
    dark: "Dark",
    coolNote: "Focused & precise",
    popNote: "Bold & colorful",
    darkNote: "Dark & clear",
    apiOverview: "Which APIs build this page?",
    apiIntro:
      "Live mode uses two APIs: stock quotes and income statements. The demo uses fictional data with the same structure.",
    flowFetch: "Fetch API data",
    flowShape: "Format periods & units",
    flowDisplay: "Build the view",
    apiExample:
      "These are example requests for securities code 7203, not the fictional demo companies. Opening this explanation sends no request.",
    apiPrivacy:
      "Only the fetch button sends up to two live requests. Your local server holds the API key. Changing styles, language or chart metrics never refetches data.",
    apiDetail: "API behind this view",
    apiFields: "Response fields",
    apiTransform: "How it becomes this view",
    apiDemo:
      "Demo uses fictional data. This mapping applies when connecting live data.",
    apiMoney:
      "Order by fiscalPeriod and divide JPY amounts by 100 million. Missing values stay unavailable; losses remain negative.",
    apiMargin:
      "Multiply the API ratio by 100 for percent (0.125 → 12.5%). Do not connect lines across missing values.",
    apiQuote:
      "Show price in JPY and priceDate as its date. This is the latest closing price, not a real-time quote.",
    apiTable:
      "Fetch up to three latest full fiscal years and sort oldest first. Amounts are JPY; margins are %. Include accounting basis and period length.",
    apiProvenance:
      "Display each period’s provenance as returned, including amendments and field sources when provided. This page does not parse XBRL itself.",

    overview: "Company overview",
    financials: "Financial data",
    sources: "Data sources",
    yourWorkspace: "Make it your workspace.",
    templateNote:
      "Start with this template. Build an analysis tool around your own questions.",
    viewCode: "View code on GitHub ↗",
    breadcrumb: "Workspace / Company analysis",
    guide: "Analysis guide ↗",
    title: "Company analysis",
    lead: "Financial performance and its sources, in one workspace.",
    private: "Local workspace",
    demo: "Try sample data",
    live: "Connect live data",
    company: "Sample company",
    symbol: "Securities code",
    loadDemo: "View company",
    loadLive: "Fetch data",
    setupTitle: "Connect to ZENITH Code",
    setupBody:
      "Create an account, accept the applicable data terms, and create an API key. Stop this program and restart with the command below to enable live access.",
    setupKey:
      "Enter the API key privately in your terminal. Do not paste it into chat or the browser.",
    signup: "Create an account / get an API key ↗",
    revenue: "Revenue",
    operatingIncome: "Operating profit",
    netIncome: "Net income",
    operatingMargin: "Operating margin",
    reportedMargin: "Operating margin returned by the API",
    price: "Latest close",
    performance: "BUSINESS PERFORMANCE",
    trend: "Performance over time",
    metric: "Chart metric",
    amountUnit: "JPY 100 million",
    fullYen: "Amounts: JPY / Margins: %",
    periodNote:
      "Full fiscal years (FY) only. Check period lengths and accounting standards; no adjustments for changes in periods or comparability are applied.",
    readCarefully: "Before reading the numbers",
    readingNote:
      "Check the period, units and source first. This is where analysis begins.",
    missingNote:
      "“—” means unavailable or undisclosed. It is never replaced with zero.",
    datesNote:
      "The price date and financial period differ. No valuation ratios are derived from mismatched dates.",
    amendmentNote:
      "Revised financials may not represent what was known at an earlier point in time.",
    dataTerms: "Data display and usage terms ↗",
    demoNotice:
      "Demo: all company names, stock prices and financial figures are fictional. These are not actual company records.",
    liveNotice:
      "Live data: use in your private environment. Do not publish stock prices or restricted filing material.",
    demoRequest:
      "No account or API requests. Switch companies to explore the charts and table.",
    liveRequest:
      "Each fetch makes up to 2 requests / 2 API tokens. Current quota rules apply. No automatic refreshes or purchases.",
    loading: "Fetching data…",
    unavailable: "—",
    missing: "N/A",
    noData: "No financial data for this company and period.",
    noQuote: "Price unavailable",
    period: "Fiscal period",
    days: "Period length (days)",
    basis: "Accounting basis",
    fy: "FY",
    obtained: "Retrieved",
    updated: "Row updated",
    sourceDetail: "Inspect provenance",
    synthetic: "Synthetic learning data",
    amended: "Amended",
    unknown: "Not provided",
    priceOn: "Price date",
    yen: "JPY",
    hundredMillion: "× JPY 100m",
    invalid_symbol: "Check the securities code (e.g. 7203 or 130A).",
    upstream_failed:
      "Fetch failed. Check the API key, accepted data terms, quota and connection. No automatic retry was made.",
    invalid_response: "Unexpected data format. Display stopped.",
    busy: "Another request is in progress. Try again after it finishes.",
    local_only: "Check the local connection and reopen this page.",
    setup_required: "Live access needs setup.",
    network: "Connection failed. Check that the local server is running.",
    noRows: "No data",
    field: "Metric",
    companyLabel: "Company",
    demoAsOf: "Fixed sample timestamp",
    range: "Available periods",
    mixed: "Multiple sources",
  },
};
let lang =
  new URLSearchParams(location.search).get("lang") === "en" ? "en" : "ja";
let mode = "demo",
  companies = [],
  config = null,
  current = null,
  currentName = null,
  busy = false,
  statusKey = "demoNotice";
let peer = null, selectedPeriod = "", peerBusy = false;
const t = (key) => texts[lang][key] ?? key;
function node(tag, text, attrs = {}) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}
function notice(key, error = false) {
  statusKey = key;
  $("status").textContent = t(key);
  $("status").classList.toggle("error", error);
}
function setText(id, text) {
  $(id).textContent = text;
}
function kpi(id, value, unit) {
  $(id).replaceChildren(
    document.createTextNode(value),
    node("span", unit, { class: "suffix" }),
  );
}
function fmtDate(value) {
  if (!value) return t("unknown");
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? t("unknown")
    : new Intl.DateTimeFormat(lang === "ja" ? "ja-JP" : "en-GB", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d) + " JST";
}
function translate() {
  document.documentElement.lang = lang;
  document.title = `${t("title")} · ZENITH Code`;
  document
    .querySelectorAll("[data-i18n]")
    .forEach((el) => (el.textContent = t(el.dataset.i18n)));
  $("ja").setAttribute("aria-pressed", String(lang === "ja"));
  $("en").setAttribute("aria-pressed", String(lang === "en"));
  $("guideLink").href =
    lang === "ja"
      ? "https://zenithcode.net/learn/tdnet-xbrl"
      : "https://zenithcode.net/en/docs";
  $("signupLink").href =
    `https://zenithcode.net${lang === "en" ? "/en" : ""}/sign-up`;
  const selection = $("company").value;
  $("company").replaceChildren(
    ...companies.map((item, index) =>
      node("option", item.name[lang], { value: String(index) }),
    ),
  );
  $("company").value = selection || "0";
  renderApiHelp();
  controls();
  notice(statusKey, $("status").classList.contains("error"));
  if (current) render();
}
function controls() {
  document.body.dataset.mode = mode;
  $("demoMode").setAttribute("aria-pressed", String(mode === "demo"));
  $("liveMode").setAttribute("aria-pressed", String(mode === "live"));
  $("demoField").hidden = mode !== "demo";
  $("liveField").hidden = mode !== "live";
  $("setup").hidden = mode !== "live" || Boolean(config?.liveEnabled);
  $("load").textContent = busy
    ? t("loading")
    : t(mode === "demo" ? "loadDemo" : "loadLive");
  $("load").disabled =
    busy || peerBusy || (mode === "live" && !config?.liveEnabled) || !config;
  for (const id of ["demoMode", "liveMode", "company", "symbol"])
    $(id).disabled = busy || peerBusy;
  $("compareLoad").disabled = busy || peerBusy || !config?.liveEnabled;
  $("peerSymbol").disabled = busy || peerBusy;
  $("requestNote").textContent = t(
    mode === "demo" ? "demoRequest" : "liveRequest",
  );
}
function switchMode(next) {
  mode = next;
  peer = null; selectedPeriod = "";
  current = null;
  currentName = null;
  $("dashboard").hidden = true;
  notice(
    next === "demo"
      ? "demoNotice"
      : config?.liveEnabled
        ? "liveNotice"
        : "setup_required",
  );
  controls();
  if (next === "demo" && companies.length) loadDemo();
}
function loadDemo() {
  const company = companies[Number($("company").value) || 0];
  current = normalize(company.snapshot);
  currentName = company.name;
  notice("demoNotice");
  render();
}
async function fetchLive() {
  const symbol = $("symbol").value.trim().toUpperCase();
  $("symbol").value = symbol;
  if (!/^[0-9A-Z]{4,5}(\.T)?$/.test(symbol)) {
    notice("invalid_symbol", true);
    return;
  }
  busy = true;
  current = null;
  $("dashboard").hidden = true;
  notice("loading");
  controls();
  try {
    const response = await fetch("/api/snapshot", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Local-Token": config.requestToken,
      },
      body: JSON.stringify({ symbol }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    peer = null;
    current = normalize(result.snapshot);
    currentName = null;
    notice("liveNotice");
    render();
  } catch (error) {
    notice(texts.en[error.message] ? error.message : "network", true);
  } finally {
    busy = false;
    controls();
  }
}
// Explanations are local UI only; never fetch data here.
function renderApiHelp() {
  document.querySelectorAll("[data-api]").forEach((host) => {
    const open = host.querySelector("details")?.open ?? false;
    const kind = host.dataset.api;
    const field = kind === "metric" ? $("metric").value : kind;
    const quote = kind === "quote";
    const fields = quote
      ? "price · priceDate"
      : kind === "table"
        ? "fiscalPeriod · revenue · operatingIncome · netIncome · operatingMargin · fiscalPeriodDays · accountingStandard"
        : kind === "provenance"
          ? "fiscalPeriod · provenance · updatedAt"
          : `fiscalPeriod · ${field}`;
    const detail = node("details", undefined, { class: "api-help" });
    detail.open = open;
    detail.append(node("summary", t("apiDetail")));
    const body = node("div", undefined, { class: "api-help-body" });
    body.append(
      node("p", t("apiDemo")),
      node(
        "code",
        quote
          ? "GET /stable/quote?symbol={symbol}"
          : "GET /stable/income-statement?symbol={symbol}&period=annual&limit=3",
      ),
      node("h4", t("apiFields")),
      node("code", fields),
      node("h4", t("apiTransform")),
      node(
        "p",
        t(
          quote
            ? "apiQuote"
            : kind === "table"
              ? "apiTable"
              : kind === "provenance"
                ? "apiProvenance"
                : field === "operatingMargin"
                  ? "apiMargin"
                  : "apiMoney",
        ),
      ),
    );
    detail.append(body);
    host.replaceChildren(detail);
  });
}
function setTheme(theme) {
  document.body.dataset.theme = theme;
  document
    .querySelectorAll("[data-theme-choice]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.themeChoice === theme),
      ),
    );
  // Layout widths change between themes; redraw using the existing snapshot.
  if (current) {
    chart("barChart", $("metric").value);
    chart("marginChart", "operatingMargin", true);
  }
}
document
  .querySelectorAll("[data-theme-choice]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      setTheme(button.dataset.themeChoice),
    ),
  );
function svgElement(tag, attrs = {}, text) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
}
function chart(target, field, line = false) {
  const box = $(target);
  box.replaceChildren();
  const rows = current.years,
    values = rows.map((r) => finite(r[field]));
  if (!rows.length || values.every((v) => v === null)) {
    box.append(node("div", t("noData"), { class: "chart-empty" }));
    return;
  }
  const w = Math.max(300, Math.min(line ? 410 : 580, box.clientWidth - 32)),
    h = 218,
    left = 42,
    right = w - 12,
    top = 28,
    bottom = 180;
  const scaled = values.map((v) =>
      v === null ? null : v * (line ? 100 : 1e-8),
    ),
    bounds = chartAxis(scaled),
    y = (v) =>
      bottom - ((v - bounds.min) / (bounds.max - bounds.min)) * (bottom - top),
    x = (i) => left + ((right - left) * (i + 0.5)) / rows.length;
  const svg = svgElement("svg", {
    viewBox: `0 0 ${w} ${h}`,
    role: "img",
    "aria-label": `${t(field)} · ${line ? "%" : t("amountUnit")}`,
  });
  svg.append(
    svgElement(
      "title",
      {},
      `${t(field)}: ${rows.map((r, i) => `${r.fiscalPeriod} ${scaled[i] === null ? t("missing") : line ? percent(values[i], lang) : money(values[i], lang, true)}`).join(", ")} (${line ? "%" : t("amountUnit")})`,
    ),
  );
  for (const tick of bounds.ticks) {
    const yy = y(tick);
    svg.append(
      svgElement("line", {
        x1: left,
        x2: right,
        y1: yy,
        y2: yy,
        stroke: "var(--chart-grid)",
        "stroke-dasharray": "3 4",
      }),
    );
    svg.append(
      svgElement(
        "text",
        {
          x: 0,
          y: yy + 4,
          "text-anchor": "start",
          fill: "var(--muted)",
          "font-size": 11,
        },
        new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(tick),
      ),
    );
  }
  svg.append(
    svgElement("line", {
      x1: left,
      x2: right,
      y1: y(0),
      y2: y(0),
      stroke: "var(--chart-zero)",
    }),
  );
  if (line) {
    for (let i = 1; i < rows.length; i++) {
      if (scaled[i] !== null && scaled[i - 1] !== null)
        svg.append(
          svgElement("line", {
            x1: x(i - 1),
            x2: x(i),
            y1: y(scaled[i - 1]),
            y2: y(scaled[i]),
            stroke: "var(--accent)",
            "stroke-width": 3,
          }),
        );
    }
  }
  rows.forEach((row, i) => {
    const v = scaled[i],
      xx = x(i);
    if (v !== null) {
      if (line)
        svg.append(
          svgElement("circle", {
            cx: xx,
            cy: y(v),
            r: 5,
            fill: "var(--chart-dot)",
            stroke: "var(--accent)",
            "stroke-width": 3,
          }),
        );
      else {
        const bw = Math.min(66, ((right - left) / rows.length) * 0.43);
        svg.append(
          svgElement("rect", {
            x: xx - bw / 2,
            y: Math.min(y(0), y(v)),
            width: bw,
            height: Math.max(0, Math.abs(y(v) - y(0))),
            rx: 4,
            fill:
              v < 0
                ? "#e3a8ad"
                : row.fiscalPeriod === selectedPeriod
                  ? "var(--accent)"
                  : "var(--bar-soft)",
          }),
        );
      }
      svg.append(
        svgElement(
          "text",
          {
            x: xx,
            y: Math.max(top - 10, !line && v < 0 ? y(0) - 12 : y(v) - 12),
            "text-anchor": "middle",
            fill: v < 0 ? "var(--negative-text)" : "var(--ink)",
            "font-size": 12,
            "font-weight": 650,
          },
          line ? percent(values[i], lang) : money(values[i], lang, true),
        ),
      );
    } else
      svg.append(
        svgElement(
          "text",
          {
            x: xx,
            y: bottom - 12,
            "text-anchor": "middle",
            fill: "var(--muted)",
            "font-size": 12,
          },
          t("missing"),
        ),
      );
    svg.append(
      svgElement(
        "text",
        {
          x: xx,
          y: bottom + 26,
          "text-anchor": "middle",
          fill: "var(--muted)",
          "font-size": 12,
        },
        row.fiscalPeriod,
      ),
    );
  });
  box.append(svg);
}
function render() {
  $("dashboard").hidden = false;
  if (!current.years.some(r => r.fiscalPeriod === selectedPeriod)) selectedPeriod = current.years.at(-1)?.fiscalPeriod ?? "";
  $("reviewPeriod").replaceChildren(...[...current.years].reverse().map(r => node("option", `${r.fiscalPeriod} FY`, {value:r.fiscalPeriod})));
  $("reviewPeriod").value = selectedPeriod;
  const years = current.years,
    latest = years.find(r => r.fiscalPeriod === selectedPeriod) ?? years.at(-1),
    quote = current.quote;
  setText(
    "companyName",
    currentName ? currentName[lang] : `${t("companyLabel")} ${current.symbol}`,
  );
  setText("companyCode", current.symbol);
  setText(
    "periodBadge",
    latest ? `${t("fy")} ${latest.fiscalPeriod}` : t("noRows"),
  );
  setText("standardBadge", latest?.accountingStandard || t("unknown"));
  setText(
    "asOf",
    `${t(mode === "demo" ? "demoAsOf" : "obtained")}\n${fmtDate(current.retrievedAt)}`,
  );
  for (const field of ["revenue", "operatingIncome"])
    kpi(field, money(latest?.[field], lang, true), t("hundredMillion"));
  setText(
    "revenuePeriod",
    latest ? `${t("fy")} ${latest.fiscalPeriod}` : t("noData"),
  );
  setText(
    "operatingPeriod",
    latest ? `${t("fy")} ${latest.fiscalPeriod}` : t("noData"),
  );
  setText("operatingMargin", percent(latest?.operatingMargin, lang));
  kpi("price", money(quote?.price, lang), t("yen"));
  setText(
    "priceDate",
    quote?.priceDate ? `${t("priceOn")} ${quote.priceDate}` : t("noQuote"),
  );
  chart("barChart", $("metric").value);
  chart("marginChart", "operatingMargin", true);
  const table = $("financialTable");
  table.replaceChildren();
  const head = node("thead"),
    headRow = node("tr");
  headRow.append(node("th", t("field"), { scope: "col" }));
  years.forEach((r) =>
    headRow.append(node("th", `${r.fiscalPeriod} FY`, { scope: "col" })),
  );
  head.append(headRow);
  table.append(head);
  const body = node("tbody");
  for (const field of [
    "revenue",
    "operatingIncome",
    "netIncome",
    "operatingMargin",
    "fiscalPeriodDays",
    "accountingStandard",
  ]) {
    const row = node("tr");
    row.append(
      node(
        "th",
        t(
          field === "fiscalPeriodDays"
            ? "days"
            : field === "accountingStandard"
              ? "basis"
              : field,
        ),
        { scope: "row" },
      ),
    );
    years.forEach((r) =>
      row.append(
        node(
          "td",
          field === "operatingMargin"
            ? percent(r[field], lang)
            : field === "accountingStandard"
              ? r[field] || "—"
              : money(r[field], lang),
        ),
      ),
    );
    body.append(row);
  }
  table.append(body);
  table.querySelectorAll("tr").forEach(row => [...row.children].forEach((cell,i)=>cell.classList.toggle("selected-period",i > 0 && years[i-1]?.fiscalPeriod===selectedPeriod)));
  if (!years.length) {
    const row = node("tr");
    row.append(node("td", t("noData")));
    body.replaceChildren(row);
  }
  for (const field of ["revenue", "operatingIncome", "operatingMargin"]) {
    const host = $(field).closest(".kpi");
    host.querySelector(".kpi-change")?.remove();
    const previous = years[years.indexOf(latest)-1];
    const rate = changeRate(latest, previous, field);
    const change = node("div", rate === null ? t("notComparable") : `${rate > 0 ? "+" : ""}${field === "operatingMargin" ? (rate*100).toFixed(1) + " pt" : percent(rate,lang)} ${t("yearChange")}`, {class:"kpi-change"});
    host.append(change);
  }
  const list = $("sourceList");
  list.replaceChildren();
  [...years].reverse().forEach((row) => {
    const prov = row.provenance,
      el = node("div", undefined, { class: "source-row" }),
      heading = node("div", undefined, { class: "source-top" });
    heading.append(
      node("strong", `${row.fiscalPeriod} FY${row.fiscalPeriod === selectedPeriod ? " •" : ""}`),
      node(
        "span",
        prov?.source === "synthetic"
          ? t("synthetic")
          : prov?.source === "mixed"
            ? t("mixed")
            : prov?.source?.toUpperCase() || t("unknown"),
      ),
    );
    el.append(
      heading,
      node(
        "p",
        `${t("updated")}: ${fmtDate(row.updatedAt)}${prov?.amended ? " · " + t("amended") : ""}`,
      ),
    );
    const sourceMeta = node("dl", undefined, {class:"source-meta"});
    for (const [label, value] of [[lang === "ja" ? "書類ID" : "Document ID", prov?.docId], [lang === "ja" ? "発表日時" : "Announced", prov?.announcedAt ? fmtDate(prov.announcedAt) : null]]) {
      const group = node("div"); group.append(node("dt",label),node("dd",value || "—")); sourceMeta.append(group);
    }
    el.append(sourceMeta);
    const details = node("details");
    details.append(
      node("summary", t("sourceDetail")),
      node("pre", JSON.stringify(prov ?? null, null, 2)),
    );
    el.append(details);
    list.append(el);
  });
  if (!years.length)
    list.append(node("p", t("noData"), { class: "source-row" }));
  renderComparison();
}
$("ja").addEventListener("click", () => {
  lang = "ja";
  translate();
});
$("en").addEventListener("click", () => {
  lang = "en";
  translate();
});
$("demoMode").addEventListener("click", () => switchMode("demo"));
$("liveMode").addEventListener("click", () => switchMode("live"));
$("metric").addEventListener("change", () => {
  if (current) chart("barChart", $("metric").value);
  renderApiHelp();
});
window.addEventListener("resize", () => {
  if (current) {
    chart("barChart", $("metric").value);
    chart("marginChart", "operatingMargin", true);
  }
});
$("queryForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!busy && !peerBusy && config) {
    if (mode === "demo") loadDemo();
    else if (config.liveEnabled) fetchLive();
  }
});
document.querySelectorAll("nav a").forEach((a) =>
  a.addEventListener("click", () => {
    document
      .querySelectorAll("nav a")
      .forEach((link) => link.classList.toggle("selected", link === a));
  }),
);
initializeWorkspace();
translate();
try {
  const [configResponse, demoResponse] = await Promise.all([
    fetch("/api/config"),
    fetch("/api/demo"),
  ]);
  if (!configResponse.ok || !demoResponse.ok) throw new Error();
  config = await configResponse.json();
  companies = await demoResponse.json();
  translate();
  loadDemo();
} catch {
  notice("network", true);
}

function renderComparison() {
  const demo = mode === "demo";
  $("peerDemoField").hidden = !demo;
  $("peerSymbol").hidden = demo;
  $("compareLoad").hidden = demo;
  let other, otherName;
  if (demo) {
    const old = $("peerCompany").value;
    const available = companies.map((c,i)=>({c,i})).filter(({c})=>c.snapshot.symbol!==current.symbol);
    $("peerCompany").replaceChildren(...available.map(({c,i})=>node("option",c.name[lang],{value:String(i)})));
    if (available.some(({i})=>String(i)===old)) $("peerCompany").value=old;
    const c = companies[Number($("peerCompany").value)];
    other = c ? normalize(c.snapshot) : null;
    otherName = c?.name[lang];
  } else { other=peer; otherName=peer?.symbol; }
  const common = other ? current.years.filter(a=>other.years.some(b=>b.fiscalPeriod===a.fiscalPeriod)) : [];
  const oldPeriod = $("compareYear").value;
  $("compareYear").replaceChildren(...[...common].reverse().map(r=>node("option",`${r.fiscalPeriod} FY`,{value:r.fiscalPeriod})));
  if (common.some(r=>r.fiscalPeriod===oldPeriod)) $("compareYear").value=oldPeriod;
  $("compareYear").disabled=!common.length;
  const host=$("comparisonCards"); host.replaceChildren();
  if (!other || !common.length) { setText("compareStatus", t(other?"noCommonPeriod":"peerPrompt")); return; }
  const a=current.years.find(r=>r.fiscalPeriod===$("compareYear").value),b=other.years.find(r=>r.fiscalPeriod===$("compareYear").value);
  const match=comparisonConditions(a,b);
  setText("compareStatus",`${match ? "✓ " : "! "}${t(match?"conditionsMatch":"conditionsDiffer")} · ${a.accountingStandard||"—"} / ${b.accountingStandard||"—"} · ${a.fiscalPeriodDays??"—"} / ${b.fiscalPeriodDays??"—"} ${lang === "ja" ? "日" : "days"}${demo ? " · "+t("sampleComparison") : ""}`);
  $("compareStatus").classList.toggle("mismatch",!match);
  for(const field of ["revenue","operatingIncome","operatingMargin"]) {
    const card=node("article",undefined,{class:"comparison-card"});
    card.append(node("h4",t(field)));
    const values=[finite(a[field]),finite(b[field])],bounds=axis(values),zero=(0-bounds.min)/(bounds.max-bounds.min)*260;
    [a,b].forEach((row,i)=>{
      const val=finite(row[field]);
      const heading=node("div",undefined,{class:"compare-value"});
      heading.append(node("span",i===0?(currentName?.[lang]??current.symbol):otherName),node("strong",field==="operatingMargin"?percent(val,lang):money(val,lang,true)+ (val===null?"":" "+t("hundredMillion"))));
      card.append(heading);
      const bar=svgElement("svg",{viewBox:"0 0 260 12",preserveAspectRatio:"none",class:"comparison-bar","aria-hidden":"true"});
      bar.append(svgElement("rect",{x:0,y:0,width:260,height:12,rx:2,fill:"var(--inset-surface)"}));
      if(val!==null) {const end=(val-bounds.min)/(bounds.max-bounds.min)*260;bar.append(svgElement("rect",{x:Math.min(zero,end),y:1,width:Math.abs(end-zero),height:10,rx:2,fill:i===0?"var(--accent)":"var(--peer)"}));}
      bar.append(svgElement("line",{x1:zero,x2:zero,y1:0,y2:12,stroke:"var(--muted)"})); card.append(bar);
    });
    host.append(card);
  }
}
async function fetchPeer() {
  if(busy||peerBusy||!config?.liveEnabled||!current) return;
  const symbol=$("peerSymbol").value.trim().toUpperCase();
  if(!/^[0-9A-Z]{4,5}(\.T)?$/.test(symbol)){setText("compareStatus",t("invalid_symbol"));return;}
  if(symbol.replace(/\.T$/,"")===current.symbol.replace(/\.T$/,"")){setText("compareStatus",t("sameCompany"));return;}
  peer=null;peerBusy=true;controls();setText("compareStatus",t("peerLoading"));$("comparisonCards").replaceChildren();
  try {
    const response=await fetch("/api/snapshot",{method:"POST",headers:{"Content-Type":"application/json","X-Local-Token":config.requestToken},body:JSON.stringify({symbol})});
    const result=await response.json();if(!response.ok)throw Error(result.error);
    peer=normalize(result.snapshot);renderComparison();
  } catch(error) {peer=null;setText("compareStatus",texts.en[error.message]?t(error.message):t("network"));}
  finally{peerBusy=false;controls();}
}
function initializeWorkspace() {
  // Keep API guidance accessible without pushing the analytical content below it.
  const guide=document.querySelector(".api-overview");
  document.querySelector("footer").before(guide);
  $("themeSlot").append(document.querySelector(".theme-picker"));
  document.querySelectorAll(".analysis-tabs a").forEach((link,index)=>{
    if(index===0)link.setAttribute("aria-current","location");
    link.addEventListener("click",()=>document.querySelectorAll(".analysis-tabs a").forEach(a=>a===link?a.setAttribute("aria-current","location"):a.removeAttribute("aria-current")));
  });
  $("customize").addEventListener("click",()=>$("preferences").showModal());
  $("closePreferences").addEventListener("click",()=>$("preferences").close());
  $("reviewPeriod").addEventListener("change",()=>{selectedPeriod=$("reviewPeriod").value;render();});
  $("peerCompany").addEventListener("change",renderComparison);
  $("compareYear").addEventListener("change",renderComparison);
  $("compareLoad").addEventListener("click",fetchPeer);
  const apply = () => {
    $("comparison").hidden=!$("showComparison").checked;
    document.querySelector('a[href="#comparison"]').hidden=!$("showComparison").checked;
    document.body.classList.toggle("show-api-help",$("showHelp").checked);
    document.body.classList.toggle("compact",$("compactView").checked);
    if(current){chart("barChart",$("metric").value);chart("marginChart","operatingMargin",true);}
  };
  const save=()=>{try{localStorage.setItem("zenith-research-display",JSON.stringify({theme:document.body.dataset.theme,comparison:$("showComparison").checked,help:$("showHelp").checked,compact:$("compactView").checked}));}catch{/* Storage may be unavailable in private mode. */}};
  try{const pref=JSON.parse(localStorage.getItem("zenith-research-display")||"null");if(pref){if(["cool","pop","dark"].includes(pref.theme))setTheme(pref.theme);for(const [id,key]of [["showComparison","comparison"],["showHelp","help"],["compactView","compact"]])if(typeof pref[key]==="boolean")$(id).checked=pref[key];}}catch{/* Use defaults when saved preferences are invalid. */}
  for(const id of ["showComparison","showHelp","compactView"])$(id).addEventListener("change",()=>{apply();save();});
  document.querySelectorAll("[data-theme-choice]").forEach(b=>b.addEventListener("click",save));
  apply();
  $("exportCsv").addEventListener("click",()=>{
    if(!current)return;
    const fields=["symbol","fiscalPeriod","period","revenue","operatingIncome","netIncome","operatingMargin","fiscalPeriodDays","accountingStandard"];
    const escape=value=>'"'+(typeof value === "string" ? value.replace(/^[=+@\t\r-]/,"'$&") : String(value??"")).replaceAll('"','""')+'"';
    const rows=[fields,...current.years.map(r=>fields.map(f=>r[f]))];
    const blob=new Blob(["\uFEFF"+rows.map(r=>r.map(escape).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob),a=node("a",undefined,{href:url,download:`${mode}-${current.symbol.replace(/[^A-Z0-9.-]/gi,"")}-annual.csv`});
    a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
}
