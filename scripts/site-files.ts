// What the published site carries for search engines and link previews besides the page (owner 2026-11-20, S-15):
// robots.txt, sitemap.xml and the head tags that need the site's address. Pure: the address and the languages are
// arguments. Each language has an address of its own, `<site>?lang=<code>`; the bare address is the default one.
const escapeXml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The address of the page in one language; the default language is the bare address. */
export const languageUrl = (siteUrl: string, language: string, defaultLanguage: string): string =>
  language === defaultLanguage ? siteUrl : `${siteUrl}?lang=${encodeURIComponent(language)}`;

/** Everything may be read except the frozen prototype; the sitemap is named when the address is known. */
export function robotsTxt(siteUrl: string): string {
  const lines = ['User-agent: *', 'Allow: /', 'Disallow: /proto/'];
  if (siteUrl) lines.push('', `Sitemap: ${siteUrl}sitemap.xml`);
  return `${lines.join('\n')}\n`;
}

/** One entry per language, each naming all the others as its alternates. */
export function sitemapXml(siteUrl: string, languages: readonly string[], defaultLanguage: string): string {
  const alternates = [
    ...languages.map(
      (l) =>
        `    <xhtml:link rel="alternate" hreflang="${escapeXml(l)}" href="${escapeXml(languageUrl(siteUrl, l, defaultLanguage))}"/>`
    ),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(siteUrl)}"/>`,
  ].join('\n');
  const entries = languages
    .map(
      (l) =>
        `  <url>\n    <loc>${escapeXml(languageUrl(siteUrl, l, defaultLanguage))}</loc>\n${alternates}\n  </url>`
    )
    .join('\n');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    `${entries}\n</urlset>\n`
  );
}

/** The head tags that need absolute addresses: the preview image and the language alternates. */
export function siteHeadTags(siteUrl: string, languages: readonly string[], defaultLanguage: string): string {
  if (!siteUrl) return '';
  return [
    `<meta property="og:url" content="${escapeXml(siteUrl)}" />`,
    `<meta property="og:image" content="${escapeXml(siteUrl)}og.png" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    ...languages.map(
      (l) =>
        `<link rel="alternate" hreflang="${escapeXml(l)}" href="${escapeXml(languageUrl(siteUrl, l, defaultLanguage))}" />`
    ),
    `<link rel="alternate" hreflang="x-default" href="${escapeXml(siteUrl)}" />`,
  ].join('\n    ');
}
