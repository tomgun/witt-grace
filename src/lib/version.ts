// The version and build date the bundler writes in (vite.config.ts `define`), shown in the About dialog so a copy
// on a disk can be compared with the published site (owner 2026-11-20, S-15). Outside a build (unit tests) both
// read `dev`.
declare const __WITT_VERSION__: string | undefined;
declare const __WITT_BUILT__: string | undefined;

export const VERSION: string = typeof __WITT_VERSION__ === 'string' ? __WITT_VERSION__ : 'dev';
export const BUILT: string = typeof __WITT_BUILT__ === 'string' ? __WITT_BUILT__ : 'dev';

/** `version.json`, served beside the page: what the published site is running. */
export const versionJson = (version: string, built: string): string =>
  `${JSON.stringify({ name: 'WITT', version, built }, null, 2)}\n`;
