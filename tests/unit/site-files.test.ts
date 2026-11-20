/**
 * must: the published site tells search engines what it is (owner 2026-11-20, S-15): index.html carries the Finnish
 *       title and description of the catalog, a text for readers without JavaScript and the place for the tags
 *       that need the site's address; robots.txt lets everything be read except the frozen prototype and names the
 *       sitemap only when the address is known; the sitemap lists one address per language, the default language
 *       on the bare address and the others as `?lang=<code>`, each with all nine alternates and x-default; the
 *       canonical address follows the language shown and a page opened from disk has none
 * test: tests/unit/site-files.test.ts
 * red-against: the description drifting from the catalog, the default language listed as `?lang=fi` (two addresses
 *              for one page), an `&` in the address written raw into XML, a sitemap line without the address,
 *              a canonical address written for a file:// page
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { languageUrl, robotsTxt, siteHeadTags, sitemapXml } from '../../scripts/site-files.ts';
import { DEFAULT_LANGUAGE, FI, LANGUAGES } from '../../src/lib/i18n/i18n.ts';
import { canonicalUrl, languageFromSearch } from '../../src/lib/pageHead.ts';

const SITE = 'https://example.org/witt/';

test('index.html carries the catalog’s Finnish title and description, and a text without JavaScript', () => {
  const html = readFileSync('index.html', 'utf8').replace(/\s+/g, ' ');
  assert.equal(FI.seoTitle, 'WITT – argumenttipuu ja päätöstyökalu · GRACE-menetelmä');
  assert.ok(html.includes(`<title>${FI.seoTitle}</title>`));
  assert.ok(html.includes(`name="description" content="${FI.seoDescription}"`));
  assert.ok(html.includes(`property="og:title" content="${FI.seoTitle}"`));
  assert.ok(html.includes(`property="og:description" content="${FI.seoDescription}"`));
  assert.ok(html.includes('<!-- site-head -->'));
  assert.match(
    html,
    /<noscript>.*argumenttipuille ja päätöksille.*<p lang="en">.*argument trees and decisions/
  );
});

test('robots.txt: everything but the prototype; the sitemap only with an address', () => {
  assert.equal(robotsTxt(''), 'User-agent: *\nAllow: /\nDisallow: /proto/\n');
  assert.equal(
    robotsTxt(SITE),
    'User-agent: *\nAllow: /\nDisallow: /proto/\n\nSitemap: https://example.org/witt/sitemap.xml\n'
  );
});

test('one address per language: the default bare, the others ?lang=', () => {
  assert.equal(languageUrl(SITE, 'fi', 'fi'), 'https://example.org/witt/');
  assert.equal(languageUrl(SITE, 'zh-Hans', 'fi'), 'https://example.org/witt/?lang=zh-Hans');
  const xml = sitemapXml(SITE, LANGUAGES, DEFAULT_LANGUAGE);
  assert.equal(xml.match(/<url>/g)?.length, 9);
  assert.ok(xml.includes('<loc>https://example.org/witt/</loc>'));
  assert.ok(xml.includes('<loc>https://example.org/witt/?lang=en</loc>'));
  assert.ok(!xml.includes('?lang=fi'));
  // Every entry names the nine languages and the default.
  assert.equal(xml.match(/hreflang="x-default"/g)?.length, 9);
  assert.equal(xml.match(/hreflang="ko"/g)?.length, 9);
  assert.ok(sitemapXml('https://example.org/?a=1&b=2/', ['fi'], 'fi').includes('?a=1&amp;b=2/'));
});

test('the head tags that need the address: none without it', () => {
  assert.equal(siteHeadTags('', LANGUAGES, DEFAULT_LANGUAGE), '');
  const tags = siteHeadTags(SITE, LANGUAGES, DEFAULT_LANGUAGE);
  assert.ok(tags.includes('<meta property="og:image" content="https://example.org/witt/og.png" />'));
  assert.ok(tags.includes('<link rel="alternate" hreflang="en" href="https://example.org/witt/?lang=en" />'));
  assert.ok(tags.includes('<link rel="alternate" hreflang="x-default" href="https://example.org/witt/" />'));
  assert.equal(tags.match(/rel="alternate"/g)?.length, 10);
});

test('the language of an address and the canonical address', () => {
  assert.equal(languageFromSearch('?lang=en'), 'en');
  assert.equal(languageFromSearch(''), null);
  const web = { protocol: 'https:', origin: 'https://example.org', pathname: '/witt/' };
  assert.equal(canonicalUrl(web, 'fi', 'fi'), 'https://example.org/witt/');
  assert.equal(canonicalUrl(web, 'de', 'fi'), 'https://example.org/witt/?lang=de');
  assert.equal(
    canonicalUrl({ protocol: 'file:', origin: 'null', pathname: '/x/witt.html' }, 'de', 'fi'),
    null
  );
});
