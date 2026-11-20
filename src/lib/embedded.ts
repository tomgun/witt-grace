// What a supporter package carries inside its single HTML file (S-15, 2026-11-20): the edition's name and the
// example documents, in a JSON data block the page reads instead of fetching. The hosted site has no such block.

/** The supporter editions, smallest first (owner 2026-11-20). The same tool in each; the name is a thank-you. */
export const EDITIONS = ['thinker', 'thoughtful', 'professional', 'community', 'organisation'] as const;
export type Edition = (typeof EDITIONS)[number];
export interface Embedded {
  edition: Edition | null;
  /** Example documents by file name, as parsed JSON; still untrusted, parsed like a fetched example. */
  examples: Record<string, unknown>;
}
export const EMBEDDED_ID = 'wittEmbedded';
const NONE: Embedded = { edition: null, examples: {} };

/** Reads the block's text; anything missing or malformed gives the hosted site's defaults. */
export function parseEmbedded(text: string | null | undefined): Embedded {
  if (!text) return NONE;
  try {
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== 'object' || raw === null) return NONE;
    const { edition, examples } = raw as { edition?: unknown; examples?: unknown };
    return {
      edition: EDITIONS.find((name) => name === edition) ?? null,
      examples:
        typeof examples === 'object' && examples !== null && !Array.isArray(examples)
          ? (examples as Record<string, unknown>)
          : {},
    };
  } catch {
    return NONE;
  }
}

/** The block's text for a build: JSON that cannot end the script element it sits in. */
export function embeddedJson(value: { edition: Edition; examples: Record<string, unknown> }): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

let cached: Embedded | null = null;
/** This page's block, read once. */
export function embedded(): Embedded {
  cached ??= parseEmbedded(document.getElementById(EMBEDDED_ID)?.textContent);
  return cached;
}

/** Whether the page is served over the web; a page opened from a file has no address others could use. */
export function servedOverWeb(protocol: string): boolean {
  return protocol === 'https:' || protocol === 'http:';
}
