// The page's title, description and canonical address in the language shown (owner 2026-11-20, S-15): index.html
// carries the Finnish ones, and a search engine that renders the page reads these for `?lang=<code>`.
export interface PageHead {
  title: string;
  description: string;
  language: string;
  defaultLanguage: string;
}

/** The language an address asks for (`?lang=en`), or null. */
export const languageFromSearch = (search: string): string | null => new URLSearchParams(search).get('lang');

/** The canonical address of the page in a language, or null for a page that was not served over the web. */
export function canonicalUrl(
  location: { protocol: string; origin: string; pathname: string },
  language: string,
  defaultLanguage: string
): string | null {
  if (!/^https?:$/.test(location.protocol)) return null;
  const base = location.origin + location.pathname;
  return language === defaultLanguage ? base : `${base}?lang=${encodeURIComponent(language)}`;
}

export function applyPageHead(
  doc: Document,
  location: { protocol: string; origin: string; pathname: string },
  head: PageHead
): void {
  doc.title = head.title;
  const set = (selector: string, value: string) =>
    doc.head.querySelector(selector)?.setAttribute('content', value);
  set('meta[name="description"]', head.description);
  set('meta[property="og:title"]', head.title);
  set('meta[property="og:description"]', head.description);
  const href = canonicalUrl(location, head.language, head.defaultLanguage);
  if (!href) return;
  let canonical = doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = doc.createElement('link');
    canonical.rel = 'canonical';
    doc.head.append(canonical);
  }
  canonical.href = href;
}
