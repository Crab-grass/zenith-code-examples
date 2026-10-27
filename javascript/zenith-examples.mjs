// Local examples for Node.js 22+. No third-party dependencies.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BASE_URL = 'https://api.zenithcode.net/stable';
export const MODES = ['snapshot', 'history', 'financials', 'full', 'trend', 'compare', 'search', 'statements', 'metrics', 'peers'];
export const DEMO_MODES = ['search', 'trend', 'compare', 'statements', 'metrics', 'peers'];
export const CSV_MODES = ['trend', 'compare', 'statements', 'metrics', 'peers'];
const DEMO_FILE = fileURLToPath(new URL('../learning/demo-api.json', import.meta.url));
const SYMBOL = /^[0-9A-Z]{4,5}(?:\.T)?$/;
export const CSV_FIELDS = ['symbol', 'fiscalPeriod', 'period', 'accountingStandard', 'fiscalPeriodDays',
  'revenue', 'operatingIncome', 'calculatedMargin', 'apiMargin', 'marginCheck', 'source', 'docId'];
export const METRIC_FIELDS = ['symbol', 'fiscalPeriod', 'period', 'accountingStandard', 'roe', 'roa', 'roic',
  'operatingMargin', 'netMargin', 'equityRatio', 'financialLeverage', 'payoutRatio',
  'eps', 'bps', 'dividendPerShare', 'freeCashFlow', 'interestBearingDebt',
  'priceDate', 'closePrice', 'per', 'pbr', 'dividendYield', 'source', 'docId'];
export const PEER_FIELDS = ['role', 'symbol', 'nameEn', 'nameJa', 'sector', 'marketCap', 'per', 'pbr', 'psr',
  'evToEbitda', 'roe', 'roa', 'dividendYield', 'changePctYtd', 'marketCapRank', 'sectorCount'];
const STATEMENTS = [['incomeStatements', '/income-statement'], ['balanceSheets', '/balance-sheet-statement'], ['cashFlows', '/cash-flow-statement']];
const ROW_META = new Set(['symbol', 'fiscalPeriod', 'period', 'accountingStandard', 'updatedAt', 'provenance', 'fiscalPeriodDays']);

export async function requestRows(path, params, apiKey, fetchImpl = fetch) {
  if (!apiKey?.trim()) throw new Error('Set ZENITH_API_KEY in your environment.');
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { 'x-api-key': apiKey.trim(), Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
      redirect: 'error',
    });
  } catch {
    throw new Error('Network request failed, timed out, or attempted a redirect.');
  }
  if (!response.ok) {
    const hints = {
      401: 'Check your API key.',
      403: 'Check account permissions, key status and accepted data terms.',
      404: 'Check the symbol and available coverage.',
      429: 'Rate or quota limit reached. Check your dashboard before retrying.',
    };
    throw new Error(`HTTP ${response.status}. ${hints[response.status] ?? 'Check the API documentation; do not retry in a loop.'}`);
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error('The API did not return valid JSON.'); }
  if (!Array.isArray(data) || data.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('Unexpected response: expected an array of objects.');
  }
  return data;
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return NaN;
  const date = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === value ? date : NaN;
}

// Answer like the API from synthetic data. No network and no key.
export async function demoRequester(path, params) {
  const data = JSON.parse(readFileSync(DEMO_FILE, 'utf8'));
  if (path === '/search-name') {
    const query = params.query.toLowerCase();
    return data[path].filter(h => h.nameEn.toLowerCase().includes(query) || h.nameJa.toLowerCase().includes(query)).slice(0, params.limit);
  }
  if (!(path in data)) throw new Error(`Demo data covers ${DEMO_MODES.join(', ')} only.`);
  if (path === '/peers') {
    const rows = data[path][params.symbol] ?? [];
    return rows.length > params.limit + 2 ? [...rows.slice(0, 1 + params.limit), rows.at(-1)] : rows;
  }
  return (data[path][params.symbol] ?? []).slice(0, params.limit);
}

const isNumber = value => typeof value === 'number' && Number.isFinite(value);

function isClose(a, b) {
  return Math.abs(a - b) <= Math.max(1e-9 * Math.max(Math.abs(a), Math.abs(b)), 1e-12);
}

// Oldest first, with operating income / revenue recalculated from yen amounts.
// Missing values stay null; the API ratio is compared, never overwritten.
export function marginRows(rows) {
  return [...rows].sort((a, b) => String(a.fiscalPeriod ?? '').localeCompare(String(b.fiscalPeriod ?? ''))).map(row => {
    const { revenue = null, operatingIncome: income = null, operatingMargin: api = null } = row;
    const ratio = isNumber(revenue) && isNumber(income) && revenue > 0 ? income / revenue : null;
    let check;
    if (ratio === null) check = 'notCalculated';
    else if (api === null) check = 'apiMissing';
    else if (!isNumber(api)) check = 'apiInvalid';
    else check = isClose(ratio, api) ? 'match' : 'mismatch';
    const provenance = row.provenance && typeof row.provenance === 'object' ? row.provenance : {};
    return {
      symbol: row.symbol ?? null, fiscalPeriod: row.fiscalPeriod ?? null,
      period: row.period ?? null, accountingStandard: row.accountingStandard ?? null,
      fiscalPeriodDays: row.fiscalPeriodDays ?? null,
      revenue, operatingIncome: income,
      calculatedMargin: ratio, apiMargin: api, marginCheck: check,
      source: provenance.source ?? null, docId: provenance.docId ?? null,
    };
  });
}

// Explain why rows may not be comparable instead of silently pairing them.
export function comparisonNotes(companies) {
  const sets = Object.values(companies).map(rows => new Set(rows.map(r => r.fiscalPeriod)));
  const common = sets.length ? [...sets[0]].filter(p => sets.every(set => set.has(p))).sort() : [];
  const notes = [];
  if (!common.length) {
    notes.push('No fiscal period is shared by every company. Fiscal year ends may differ; state your own pairing rule before comparing.');
  }
  for (const period of common) {
    const rows = Object.values(companies).flat().filter(r => r.fiscalPeriod === period);
    const standards = [...new Set(rows.map(r => String(r.accountingStandard).toUpperCase()))].sort();
    if (standards.length > 1) notes.push(`${period}: accounting standards differ (${standards.join(', ')}).`);
    const days = rows.map(r => r.fiscalPeriodDays).filter(isNumber);
    if (days.length && Math.max(...days) - Math.min(...days) > 7) {
      notes.push(`${period}: period lengths differ (${days.map(d => Math.trunc(d)).join('/')} days); check for an irregular fiscal year.`);
    }
    if (rows.some(r => r.calculatedMargin === null)) notes.push(`${period}: at least one margin could not be calculated from the amounts.`);
  }
  return { common, notes };
}

export async function runExample(mode, symbol, apiKey, start, end, requester = requestRows, options = {}) {
  if (!MODES.includes(mode)) throw new Error(`Choose ${MODES.slice(0, -1).join(', ')} or ${MODES.at(-1)}.`);
  if (mode === 'search') {
    const query = (options.query ?? '').trim();
    if (query.length < 2 || query.length > 100) throw new Error('Search requires --query with 2 to 100 characters, e.g. --query Toyota.');
    return { query, retrievedAt: new Date().toISOString(), companies: await requester('/search-name', { query, limit: 10 }, apiKey) };
  }
  if (mode === 'compare') {
    const codes = (options.symbols ?? '').split(',').map(code => code.trim()).filter(Boolean);
    if (codes.length < 2 || codes.length > 4 || new Set(codes).size !== codes.length) {
      throw new Error('Compare requires 2 to 4 different codes, e.g. --symbols 7203,7267.');
    }
    if (!codes.every(code => SYMBOL.test(code))) throw new Error('Use securities codes such as 7203 or 130A.');
    const result = { symbols: codes, retrievedAt: new Date().toISOString(), companies: {} };
    for (const code of codes) {
      result.companies[code] = marginRows(await requester('/income-statement', { symbol: code, period: 'annual', limit: 3 }, apiKey));
    }
    const { common, notes } = comparisonNotes(result.companies);
    result.commonFiscalPeriods = common;
    result.notes = notes;
    return result;
  }
  if (!SYMBOL.test(symbol)) throw new Error('Use a securities code such as 7203 or 130A.');
  const result = { symbol, retrievedAt: new Date().toISOString() };
  if (mode === 'statements') {
    const years = options.years ?? 3;
    if (!Number.isInteger(years) || years < 1 || years > 10) throw new Error('Statements --years must be between 1 and 10.');
    for (const [key, path] of STATEMENTS) {
      result[key] = await requester(path, { symbol, period: 'annual', limit: years }, apiKey);
    }
  } else if (mode === 'metrics') {
    const years = options.years ?? 5;
    if (!Number.isInteger(years) || years < 1 || years > 10) throw new Error('Metrics --years must be between 1 and 10.');
    result.annualMetrics = await requester('/key-metrics', { symbol, period: 'annual', limit: years }, apiKey);
  } else if (mode === 'peers') {
    const limit = options.limit ?? 10;
    if (!Number.isInteger(limit) || limit < 1 || limit > 30) throw new Error('Peers --limit must be between 1 and 30.');
    result.peers = await requester('/peers', { symbol, limit }, apiKey);
  } else if (mode === 'trend') {
    const years = options.years ?? 5;
    if (!Number.isInteger(years) || years < 1 || years > 10) throw new Error('Trend --years must be between 1 and 10.');
    result.annualTrend = marginRows(await requester('/income-statement', { symbol, period: 'annual', limit: years }, apiKey));
  } else if (mode === 'history') {
    const first = parseDate(start), last = parseDate(end);
    if (!Number.isFinite(first) || !Number.isFinite(last)) throw new Error('History requires --from and --to as YYYY-MM-DD.');
    if (first > last || last - first > 365 * 86400000) throw new Error('For this example, choose an ordered range of at most 365 days.');
    result.dailyPrices = await requester('/historical-price-eod', { symbol, from: start, to: end }, apiKey);
  } else if (mode === 'full') {
    result.asReportedStatements = await requester('/financial-statement-full', { symbol, quarter: 'FY' }, apiKey);
  } else {
    if (mode === 'snapshot') result.latestClose = await requester('/quote', { symbol }, apiKey);
    result.annualFinancials = await requester('/income-statement', { symbol, period: 'annual', limit: 3 }, apiKey);
  }
  return result;
}

function flatten(row, fields) {
  const provenance = row.provenance && typeof row.provenance === 'object' ? row.provenance : {};
  const extra = { source: provenance.source ?? null, docId: provenance.docId ?? null };
  return Object.fromEntries(fields.map(f => [f, f in row ? row[f] : extra[f] ?? null]));
}

// Wide table: one row per line item, one column per fiscal period (oldest first).
export function statementsTable(result) {
  const periods = [...new Set(STATEMENTS.flatMap(([key]) => (result[key] ?? []).map(r => r.fiscalPeriod).filter(Boolean)))].sort();
  const rows = [];
  for (const [key] of STATEMENTS) {
    const list = result[key] ?? [];
    const byPeriod = new Map(list.map(r => [r.fiscalPeriod, r]));
    const items = [];
    for (const r of list) for (const k of Object.keys(r)) if (!ROW_META.has(k) && !items.includes(k)) items.push(k);
    const getters = [['accountingStandard', r => r.accountingStandard], ['docId', r => r.provenance?.docId], ...items.map(i => [i, r => r[i]])];
    for (const [item, get] of getters) {
      const row = { statement: key, item };
      for (const p of periods) row[p] = byPeriod.has(p) ? get(byPeriod.get(p)) ?? null : null;
      rows.push(row);
    }
  }
  return { fields: ['statement', 'item', ...periods], rows };
}

// { fields, rows } for --csv. retrievedAt is kept on every row.
export function tableRows(result) {
  let fields, rows;
  if (result.annualTrend) [fields, rows] = [CSV_FIELDS, result.annualTrend];
  else if (result.companies && result.symbols) [fields, rows] = [CSV_FIELDS, Object.values(result.companies).flat()];
  else if (result.annualMetrics) [fields, rows] = [METRIC_FIELDS, result.annualMetrics.map(r => flatten(r, METRIC_FIELDS))];
  else if (result.peers) [fields, rows] = [PEER_FIELDS, result.peers.map(r => flatten(r, PEER_FIELDS))];
  else if (result.incomeStatements) ({ fields, rows } = statementsTable(result));
  else throw new Error(`--csv is available for ${CSV_MODES.join(', ')}.`);
  return {
    fields: [...fields, 'retrievedAt'],
    rows: rows.map(row => ({ ...Object.fromEntries(fields.map(f => [f, row[f] ?? null])), retrievedAt: result.retrievedAt })),
  };
}

// UTF-8 with BOM so spreadsheet software detects it. Empty cells mean missing, not zero.
export function toCsv({ fields, rows }) {
  const cell = value => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return '\ufeff' + [fields, ...rows.map(row => fields.map(f => row[f]))].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

async function main(args) {
  if (!args.length || args.includes('--help')) {
    console.log(`node javascript/zenith-examples.mjs <${MODES.join('|')}> [--symbol 7203] [--from YYYY-MM-DD --to YYYY-MM-DD] [--years 5] [--symbols 7203,7267] [--query Toyota] [--limit 10] [--csv out.csv] [--demo]`);
    return;
  }
  const [mode, ...rest] = args;
  const demo = rest.includes('--demo');
  const pairs = rest.filter(arg => arg !== '--demo');
  const options = {};
  for (let i = 0; i < pairs.length; i += 2) {
    if (!['--symbol', '--symbols', '--query', '--years', '--limit', '--from', '--to', '--csv'].includes(pairs[i]) || !pairs[i + 1] || pairs[i + 1].startsWith('--') || pairs[i] in options) {
      throw new Error('Invalid arguments. Run with --help.');
    }
    options[pairs[i]] = pairs[i + 1];
  }
  if (options['--csv'] && !CSV_MODES.includes(mode)) throw new Error(`--csv is available for ${CSV_MODES.join(', ')}.`);
  if (demo && !DEMO_MODES.includes(mode)) throw new Error(`--demo is available for ${DEMO_MODES.join(', ')}.`);
  const years = options['--years'] === undefined ? undefined : Number(options['--years']);
  const limit = options['--limit'] === undefined ? undefined : Number(options['--limit']);
  let key = 'demo', requester = demoRequester;
  if (demo) {
    console.error('Demo mode: fictional companies and values. No API request is made.');
  } else {
    key = process.env.ZENITH_API_KEY;
    requester = requestRows;
    if (!key?.trim()) throw new Error('Set ZENITH_API_KEY in your environment. To try without a key, add --demo.');
    console.error('Local/private use: do not publish API responses or API keys.');
  }
  const data = await runExample(mode, options['--symbol'] ?? '7203', key, options['--from'], options['--to'], requester,
    { symbols: options['--symbols'], years, query: options['--query'], limit });
  if (demo) data.demo = true;
  if (options['--csv']) {
    mkdirSync(dirname(options['--csv']), { recursive: true });
    writeFileSync(options['--csv'], toCsv(tableRows(data)));
    console.error(`Wrote ${options['--csv']}. Keep it private.`);
  }
  console.log(JSON.stringify(data, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
