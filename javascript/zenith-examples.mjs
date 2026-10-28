// Local examples for Node.js 22+. No third-party dependencies.
import { pathToFileURL } from 'node:url';

export const BASE_URL = 'https://api.zenithcode.net/stable';

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

export async function runExample(mode, symbol, apiKey, start, end, requester = requestRows) {
  if (!/^[0-9A-Z]{4,5}(?:\.T)?$/.test(symbol)) throw new Error('Use a securities code such as 7203 or 130A.');
  if (!['snapshot', 'history', 'financials', 'full'].includes(mode)) throw new Error('Choose snapshot, history, financials or full.');
  const result = { symbol, retrievedAt: new Date().toISOString() };
  if (mode === 'history') {
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

async function main(args) {
  if (!args.length || args.includes('--help')) {
    console.log('node javascript/zenith-examples.mjs <snapshot|history|financials|full> [--symbol 7203] [--from YYYY-MM-DD --to YYYY-MM-DD]');
    return;
  }
  const [mode, ...rest] = args;
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!['--symbol', '--from', '--to'].includes(rest[i]) || !rest[i + 1] || rest[i + 1].startsWith('--') || rest[i] in options) {
      throw new Error('Invalid arguments. Run with --help.');
    }
    options[rest[i]] = rest[i + 1];
  }
  const key = process.env.ZENITH_API_KEY;
  if (!key?.trim()) throw new Error('Set ZENITH_API_KEY in your environment.');
  console.error('Local/private use: do not publish API responses or API keys.');
  const data = await runExample(mode, options['--symbol'] ?? '7203', key, options['--from'], options['--to']);
  console.log(JSON.stringify(data, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
