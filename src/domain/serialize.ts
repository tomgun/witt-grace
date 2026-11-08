// The `.witt.json` bytes. Export is the prototype's: validated, two-space indented, trailing newline. Browser storage
// uses the compact form. Both read back through parseProject, so what goes out is exactly what comes in.
import { parseProject } from './parse.ts';
import type { Project } from './model.ts';

/** File form: `JSON.stringify(validated, null, 2) + '\n'`, byte-identical to the prototype's export. */
export const serializeProjectFile = (project: Project): string =>
  JSON.stringify(parseProject(project), null, 2) + '\n';
/** Storage form: compact JSON of the validated project. */
export const serializeProjectCompact = (project: Project): string => JSON.stringify(parseProject(project));

/** A filename for the export, derived like the prototype: ASCII-ish slug of the title, at most 45 characters. */
export function exportFilename(title: string): string {
  const safe =
    title
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9À-ɏ-]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 45) || 'witt';
  return `${safe}.witt.json`;
}
