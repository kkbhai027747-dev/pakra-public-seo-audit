import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const STRUCTURED_TYPES = new Set(['Product', 'Organization', 'OnlineStore', 'WebSite', 'BreadcrumbList', 'Article', 'BlogPosting']);
const META_NAMES = new Set(['description', 'robots', 'googlebot', 'og:title', 'og:site_name']);
const PRIVATE_PATH = /^\/(?:[a-z]{2,3}(?:-[a-z0-9]{2,8})*\/)?(?:account|admin|checkout|checkouts|orders|cart)(?:\/|$)/i;
const DEFAULTS = {
  paths: ['/', '/robots.txt', '/sitemap.xml'],
  concurrency: 4,
  maxChildSitemaps: 10,
  timeoutMs: 35000,
  pageSpeed: false,
  contentChecks: {}
};

export function cleanText(value) {
  return String(value ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

export function attributes(tag) {
  const pairs = [...tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)];
  return Object.fromEntries(pairs.map(match => [match[1].toLowerCase(), match[2] ?? match[3] ?? match[4]]));
}

export function structuredNodes(value, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) structuredNodes(item, result);
  } else if (value && typeof value === 'object') {
    const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
    if (types.some(type => STRUCTURED_TYPES.has(type))) {
      const item = {};
      for (const key of ['@type', 'name', 'legalName', 'url', 'sameAs', 'headline']) {
        if (value[key] !== undefined) item[key] = value[key];
      }
      if (types.includes('Product')) {
        item.brand = value.brand ?? null;
        item.seller = value.seller ?? null;
        item.offerCount = Array.isArray(value.offers) ? value.offers.length : Number(Boolean(value.offers));
      }
      result.push(item);
    }
    for (const [key, child] of Object.entries(value)) {
      if (!['review', 'reviews', 'author'].includes(key)) structuredNodes(child, result);
    }
  }
  return result;
}

export function parsePage(html, { url, baseUrl, contentType = '', contentChecks = {} }) {
  const pathname = new URL(url).pathname;
  if (pathname === '/robots.txt') return { robotsText: html };
  if (/\.xml$/i.test(pathname) || /\bxml\b/i.test(contentType)) {
    const xmlRoot = html.match(/<(sitemapindex|urlset)\b/i)?.[1].toLowerCase();
    const locations = [...html.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)].map(match => cleanText(match[1]));
    return {
      xmlRoot,
      locCount: locations.length,
      ...(xmlRoot === 'sitemapindex' ? { childSitemaps: locations } : { samplePublicPaths: locations.slice(0, 3) })
    };
  }

  const result = {
    title: cleanText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]),
    meta: {}, canonical: [], h1: [], h2: [], structuredNodes: []
  };
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = attributes(match[0]);
    const key = (tag.name ?? tag.property ?? '').toLowerCase();
    if (META_NAMES.has(key)) result.meta[key] = cleanText(tag.content);
    else if (['google-site-verification', 'msvalidate.01'].includes(key)) result.meta[key + '_present'] = true;
  }
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = attributes(match[0]);
    if (tag.rel?.toLowerCase().split(/\s+/).includes('canonical')) result.canonical.push(cleanText(tag.href));
  }
  for (const level of ['h1', 'h2']) {
    result[level] = [...html.matchAll(new RegExp('<' + level + '\\b[^>]*>([\\s\\S]*?)<\\/' + level + '>', 'gi'))]
      .map(match => cleanText(match[1]));
  }
  const links = [...html.matchAll(/<a\b[^>]*>/gi)].map(match => attributes(match[0]).href).filter(Boolean);
  result.internalLinkCount = links.filter(href => {
    try { return new URL(href, url).origin === new URL(baseUrl).origin; } catch { return false; }
  }).length;
  result.relevantLinks = [...new Set(links.filter(href => /\/(pages|collections|blogs)\//.test(href) && !href.includes('account')))].sort().slice(0, 80);
  const blocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => attributes(match[1]).type?.toLowerCase() === 'application/ld+json');
  result.jsonLdBlocks = blocks.length;
  result.jsonLdParseErrors = 0;
  for (const block of blocks) {
    try { structuredNodes(JSON.parse(block[2]), result.structuredNodes); } catch { result.jsonLdParseErrors++; }
  }
  result.hasImplementationCopy = /clear empty states|Add products in the theme editor|empty state/i.test(html);
  result.contentChecks = Object.fromEntries(Object.entries(contentChecks).map(([name, text]) => [name, html.includes(text)]));
  return result;
}

function publicUrl(value, baseUrl) {
  const url = new URL(value, baseUrl);
  if (url.protocol !== 'https:' || url.origin !== new URL(baseUrl).origin || url.username || url.password) {
    throw new Error('Only HTTPS URLs on the configured public origin are allowed.');
  }
  const decodedPath = decodeURIComponent(url.pathname).replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  if (PRIVATE_PATH.test(decodedPath)) throw new Error('Account, admin, order, cart and checkout paths are outside the audit scope.');
  url.hash = '';
  return url.href;
}

export function normalizeConfig(input) {
  const config = { ...DEFAULTS, ...input };
  if (!config.baseUrl) throw new Error('Set baseUrl to the public store origin.');
  const base = new URL(config.baseUrl);
  if (base.pathname !== '/' || base.search || base.hash) throw new Error('baseUrl must contain only an origin.');
  config.baseUrl = publicUrl(base.href, base.href);
  if (!Array.isArray(config.paths) || !config.paths.length) throw new Error('paths must be a nonempty array.');
  config.paths = [...new Set(config.paths.map(value => publicUrl(value, config.baseUrl)))];
  for (const [name, min, max] of [['concurrency', 1, 8], ['maxChildSitemaps', 0, 50], ['timeoutMs', 100, 120000]]) {
    if (!Number.isInteger(config[name]) || config[name] < min || config[name] > max) throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  }
  if (typeof config.pageSpeed !== 'boolean') throw new Error('pageSpeed must be true or false.');
  if (!config.contentChecks || typeof config.contentChecks !== 'object' || Array.isArray(config.contentChecks) || Object.values(config.contentChecks).some(value => typeof value !== 'string' || !value)) {
    throw new Error('contentChecks must map names to nonempty literal text.');
  }
  return config;
}

async function mapBatches(items, concurrency, callback) {
  const result = [];
  for (let index = 0; index < items.length; index += concurrency) {
    result.push(...await Promise.all(items.slice(index, index + concurrency).map(callback)));
  }
  return result;
}

async function fetchPage(url, config, fetchImpl, now) {
  const row = { url, checkedUtc: now().toISOString() };
  try {
    const response = await fetchImpl(url, {
      method: 'GET', credentials: 'omit', redirect: 'error',
      headers: { 'User-Agent': 'SiteReadOnlyAudit/1.0' },
      signal: AbortSignal.timeout(config.timeoutMs)
    });
    Object.assign(row, { status: response.status, finalUrl: response.url || url, contentType: response.headers.get('content-type'), xRobotsTag: response.headers.get('x-robots-tag') });
    const text = await response.text();
    row.bytes = Buffer.byteLength(text);
    Object.assign(row, parsePage(text, { url, baseUrl: config.baseUrl, contentType: row.contentType, contentChecks: config.contentChecks }));
  } catch (error) {
    row.error = `${error.name}: ${error.message}`;
  }
  return row;
}

async function fetchPageSpeed(baseUrl, fetchImpl, now) {
  const url = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  url.search = new URLSearchParams({ url: baseUrl, strategy: 'mobile', category: 'performance' }).toString();
  const row = { requestedUrl: baseUrl, strategy: 'mobile', checkedUtc: now().toISOString(), source: 'Google PageSpeed Insights unauthenticated API' };
  try {
    const response = await fetchImpl(url.href, { method: 'GET', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(45000) });
    row.httpStatus = response.status;
    const data = await response.json();
    if (!response.ok) return { ...row, errorCode: data.error?.code, errorStatus: data.error?.status };
    row.fieldData = data.loadingExperience ?? null;
    row.originFieldData = data.originLoadingExperience ?? null;
    const lab = data.lighthouseResult;
    row.lab = lab ? {
      fetchTime: lab.fetchTime, version: lab.lighthouseVersion, score: lab.categories?.performance?.score,
      metrics: Object.fromEntries(['largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'first-contentful-paint', 'speed-index'].map(key => [key, lab.audits?.[key]?.displayValue]))
    } : null;
  } catch (error) { row.error = `${error.name}: ${error.message}`; }
  return row;
}

export async function runAudit(input, { fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const config = normalizeConfig(input);
  const pages = await mapBatches(config.paths, config.concurrency, url => fetchPage(url, config, fetchImpl, now));
  const childUrls = [];
  const skippedSitemaps = [];
  for (const location of pages.flatMap(page => page.childSitemaps ?? [])) {
    try { childUrls.push(publicUrl(location, config.baseUrl)); }
    catch (error) { skippedSitemaps.push({ url: location, reason: error.message }); }
  }
  const sample = [...new Set(childUrls)].filter(url => !config.paths.includes(url)).slice(0, config.maxChildSitemaps);
  const sitemaps = await mapBatches(sample, Math.min(config.concurrency, 3), url => fetchPage(url, config, fetchImpl, now));
  return {
    date: now().toISOString().slice(0, 10),
    scope: 'Anonymous public SEO sample. No Admin API, customer or order access, theme changes, or authenticated requests.',
    pages, sitemaps, skippedSitemaps,
    pageSpeed: config.pageSpeed ? await fetchPageSpeed(config.baseUrl, fetchImpl, now) : { enabled: false }
  };
}

async function main(args) {
  if (args.length !== 4 || args[0] !== '--config' || args[2] !== '--output') {
    throw new Error('Usage: node src/audit.mjs --config config/example.json --output output/report.json');
  }
  const config = JSON.parse(await fs.readFile(args[1], 'utf8'));
  const outputPath = path.resolve(args[3]);
  try { await fs.access(outputPath); throw new Error('Output already exists; choose a new report filename.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const report = await runAudit(config);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ report: outputPath, pages: report.pages.length, childSitemaps: report.sitemaps.length, pageErrors: [...report.pages, ...report.sitemaps].filter(row => row.error).length }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
