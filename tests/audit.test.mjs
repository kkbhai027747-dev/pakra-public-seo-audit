import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { normalizeConfig, parsePage, runAudit } from '../src/audit.mjs';

const baseUrl = 'https://example.test';
const fixedNow = () => new Date('2026-09-21T10:00:00Z');

test('module import performs no network requests', () => {
  const moduleUrl = new URL('../src/audit.mjs', import.meta.url).href;
  execFileSync(process.execPath, ['--input-type=module', '-e', `globalThis.fetch = () => { throw new Error('Import tried to fetch'); }; await import(${JSON.stringify(moduleUrl)});`]);
});

test('HTML sample preserves SEO fields without verification values or review nodes', () => {
  const html = `<title>Cards &amp; Collecting</title><meta name=description content="A sample">
    <meta name="google-site-verification" content="synthetic-hidden-marker"><meta name=robots content=noindex>
    <link rel=canonical href="https://example.test/pages/cards"><h1>Our <span>cards</span></h1><h2>Formats</h2>
    <a href="/pages/cards">Cards</a><a href="https://example.test.evil.test/pages/external">External</a>
    <script type="application/ld+json">{"@graph":[{"@type":["Product","Thing"],"name":"Card","offers":[{},{}],"review":{"@type":"Article","name":"Excluded"}},{"@type":"Organization","name":"Store"}]}</script>
    <script type="application/ld+json">invalid</script>Choose your format`;
  const row = parsePage(html, { url: baseUrl + '/pages/cards', baseUrl, contentChecks: { format: 'Choose your format' } });
  assert.equal(row.title, 'Cards & Collecting');
  assert.equal(row.meta.description, 'A sample');
  assert.equal(row.meta.robots, 'noindex');
  assert.equal(row.meta['google-site-verification_present'], true);
  assert.ok(!JSON.stringify(row).includes('synthetic-hidden-marker'));
  assert.deepEqual(row.canonical, [baseUrl + '/pages/cards']);
  assert.deepEqual(row.h1, ['Our cards']);
  assert.deepEqual(row.h2, ['Formats']);
  assert.equal(row.internalLinkCount, 1);
  assert.equal(row.structuredNodes.length, 2);
  assert.equal(row.structuredNodes[0].offerCount, 2);
  assert.equal(row.jsonLdBlocks, 2);
  assert.equal(row.jsonLdParseErrors, 1);
  assert.deepEqual(row.contentChecks, { format: true });
});

test('robots and sitemap samples preserve text, locations and CDATA', () => {
  assert.deepEqual(parsePage('User-agent: *\nDisallow: /account', { url: baseUrl + '/robots.txt', baseUrl }), { robotsText: 'User-agent: *\nDisallow: /account' });
  const row = parsePage('<sitemapindex><sitemap><loc><![CDATA[https://example.test/map.xml?a=1&b=2]]></loc></sitemap></sitemapindex>', { url: baseUrl + '/sitemap.xml', baseUrl });
  assert.equal(row.xmlRoot, 'sitemapindex');
  assert.deepEqual(row.childSitemaps, [baseUrl + '/map.xml?a=1&b=2']);
  const sample = parsePage('<urlset>' + [1, 2, 3, 4].map(id => `<url><loc>${baseUrl}/products/${id}</loc></url>`).join('') + '</urlset>', { url: baseUrl + '/map.xml', baseUrl });
  assert.equal(sample.locCount, 4);
  assert.equal(sample.samplePublicPaths.length, 3);
});

test('configuration rejects private paths, cross-origin requests and invalid bounds', () => {
  for (const paths of [['/account'], ['/admin/products'], ['/orders/1'], ['/checkout'], ['/zh-CN/account'], ['/en/admin'], ['/%61ccount'], ['/zh-CN/%61ccount'], ['/zh-CN/%2Faccount'], ['https://other.test/']]) {
    assert.throws(() => normalizeConfig({ baseUrl, paths }));
  }
  assert.throws(() => normalizeConfig({ baseUrl, concurrency: 0 }));
  assert.throws(() => normalizeConfig({ baseUrl, pageSpeed: 'false' }));
});

test('audit caps sitemap sampling, records errors and makes only anonymous GET requests', async () => {
  const calls = [];
  let active = 0;
  let maxActive = 0;
  const fetchImpl = async (url, options) => {
    calls.push(url);
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    if (url.endsWith('/bad')) throw new Error('Synthetic network failure');
    if (url.endsWith('/sitemap.xml')) return new Response('<sitemapindex>' + ['/a.xml', '/a.xml', '/b.xml', '/account', 'https://elsewhere.test/map.xml'].map(value => `<loc>${value}</loc>`).join('') + '</sitemapindex>');
    return new Response('<title>Sample</title>', { headers: { 'x-robots-tag': 'noindex' } });
  };
  const report = await runAudit({ baseUrl, paths: ['/', '/bad', '/sitemap.xml'], concurrency: 2, maxChildSitemaps: 1 }, { fetchImpl, now: fixedNow });
  assert.equal(maxActive, 2);
  assert.equal(report.date, '2026-09-21');
  assert.equal(report.pages[0].xRobotsTag, 'noindex');
  assert.match(report.pages[1].error, /Synthetic network failure/);
  assert.equal(report.sitemaps.length, 1);
  assert.equal(report.sitemaps[0].url, baseUrl + '/a.xml');
  assert.equal(report.skippedSitemaps.length, 2);
  assert.deepEqual(report.pageSpeed, { enabled: false });
  assert.equal(calls.length, 4);
  assert.ok(calls.every(url => url.startsWith(baseUrl + '/')));
});

test('redirect rejection is recorded without requesting its destination', async () => {
  const calls = [];
  const report = await runAudit({ baseUrl, paths: ['/pages/moved'] }, {
    now: fixedNow,
    fetchImpl: async (url, options) => {
      calls.push(url);
      assert.equal(options.redirect, 'error');
      throw new TypeError('Synthetic redirect blocked by fetch');
    }
  });
  assert.deepEqual(calls, [baseUrl + '/pages/moved']);
  assert.match(report.pages[0].error, /redirect blocked/);
});

test('PageSpeed runs only when explicitly enabled and retains API error status', async () => {
  const calls = [];
  const report = await runAudit({ baseUrl, paths: ['/'], pageSpeed: true }, {
    now: fixedNow,
    fetchImpl: async (url, options) => {
      calls.push(url);
      assert.equal(options.redirect, 'error');
      return url.includes('googleapis.com')
        ? new Response(JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED' } }), { status: 429 })
        : new Response('<title>Sample</title>');
    }
  });
  assert.equal(calls.length, 2);
  assert.equal(report.pageSpeed.httpStatus, 429);
  assert.equal(report.pageSpeed.errorStatus, 'RESOURCE_EXHAUSTED');
  assert.equal(new URL(calls[1]).searchParams.get('url'), baseUrl + '/');
});

test('PageSpeed successful response retains field data and selected lab metrics', async () => {
  const report = await runAudit({ baseUrl, paths: ['/'], pageSpeed: true }, {
    now: fixedNow,
    fetchImpl: async url => url.includes('googleapis.com')
      ? new Response(JSON.stringify({ loadingExperience: { overall_category: 'FAST' }, lighthouseResult: {
        fetchTime: '2026-09-21T10:00:00Z', lighthouseVersion: 'synthetic', categories: { performance: { score: 0.9 } },
        audits: { 'largest-contentful-paint': { displayValue: '1.2 s' } }
      } }))
      : new Response('<title>Sample</title>')
  });
  assert.equal(report.pageSpeed.lab.score, 0.9);
  assert.equal(report.pageSpeed.lab.metrics['largest-contentful-paint'], '1.2 s');
  assert.equal(report.pageSpeed.fieldData.overall_category, 'FAST');
});
