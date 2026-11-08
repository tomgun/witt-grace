// The import preflight: one deterministic, non-mutating report for any JSON a person opens or pastes. It names the
// file's format, walks the format's JSON Schema for precise paths, checks the draft and project graphs, and finally
// runs the real parser so that the report and the import agree. Ported from the prototype's
// `src/import-validation.js`; the issue codes, Finnish messages and fixes are what `#importReportDialog` shows and
// what the copyable report text (`witt-tuonnin-korjausraportti.txt`) contains.
import { SCHEMA_VERSION } from '../model.ts';
import { parseProject } from '../parse.ts';
import type { JsonSchema } from './jsonSchema.ts';
import { PROJECT_SCHEMA } from './projectSchema.ts';
import { DRAFT_SCHEMA, draftToProject, parseAiDraft } from './draft.ts';
import { STARTER_SCHEMA, parseStarter, starterToProject } from './starter.ts';
import {
  CONTRIBUTION_BUNDLE_FORMAT,
  CONTRIBUTION_BUNDLE_SCHEMA,
  CONTRIBUTION_SCHEMA,
  parseContribution,
  parseMultiAuthorBundle,
  projectFingerprint,
} from './contribution.ts';
import type { Clock } from './engine.ts';

export type ImportFormat =
  'project' | 'draft' | 'contribution' | 'starter' | 'library' | 'unknown' | 'invalid';
export interface ImportIssue {
  severity: 'error';
  code: string;
  /** A JSON path such as `$.claims[2].credence`. */
  path: string;
  message: string;
  fix: string;
  line?: number;
  column?: number;
}
export interface ImportReport {
  ok: boolean;
  format: ImportFormat;
  formatName: string;
  issues: ImportIssue[];
  parsed: unknown;
}
export interface InspectOptions {
  /** The format this entry point accepts; another format is a WRONG_IMPORT issue with the right route named. */
  expected?: ImportFormat;
  /** The open document, for the proposal's id and fingerprint checks. */
  currentProject?: unknown;
  maxBytes?: number;
  maxErrors?: number;
}

export const IMPORT_FORMAT_NAMES: Record<string, string> = {
  project: 'WITT-dokumentti v5',
  draft: 'AI:n arvioitu puu v2',
  contribution: 'WITT-/AI-muutosehdotus v2',
  starter: 'Vanha AI-runko v1',
  library: 'Asiakirjakirjaston varmuuskopio',
};

type Plain = Record<string, unknown>;
const isObject = (x: unknown): x is Plain => x !== null && typeof x === 'object' && !Array.isArray(x);
const issue = (
  code: string,
  path: string,
  message: string,
  fix: string,
  extra: { line?: number; column?: number } = {}
): ImportIssue => ({ severity: 'error', code, path, message, fix, ...extra });

export function importFormatOf(raw: unknown): ImportFormat {
  if (!isObject(raw)) return 'unknown';
  if (raw.format === 'witt-ai-draft-v2') return 'draft';
  if (raw.format === 'witt-contribution-v2' || raw.format === CONTRIBUTION_BUNDLE_FORMAT)
    return 'contribution';
  if (raw.format === 'witt-ai-starter-v1') return 'starter';
  if (raw.format === 'witt-document-library-v1') return 'library';
  if (Object.hasOwn(raw, 'schemaVersion')) return 'project';
  return 'unknown';
}

function syntaxPosition(message: string, input: string): { line?: number; column?: number } {
  let match = String(message).match(/position\s+(\d+)/i);
  let offset: number | null = match ? Number(match[1]) : null;
  if (offset === null) {
    match = String(message).match(/line\s+(\d+)\s+column\s+(\d+)/i);
    if (match) {
      const lines = input.split(/\r?\n/);
      offset =
        lines.slice(0, Number(match[1]) - 1).reduce((sum, line) => sum + line.length + 1, 0) +
        Number(match[2]) -
        1;
    }
  }
  if (offset === null) {
    // V8 may omit the position for errors such as "Unexpected token ']'".
    // Locate an illegal trailing comma outside JSON strings as a precise fallback.
    let inString = false;
    let escaped = false;
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === ',') {
        let j = i + 1;
        while (/\s/.test(input[j] || '')) j++;
        if (input[j] === ']' || input[j] === '}') {
          offset = j;
          break;
        }
      }
    }
  }
  if (offset === null && /unexpected end|end of json/i.test(message)) offset = input.length;
  if (offset === null) return {};
  offset = Math.min(Math.max(offset, 0), input.length);
  const before = input.slice(0, offset);
  const parts = before.split('\n');
  return { line: parts.length, column: (parts[parts.length - 1] as string).length + 1 };
}

const typeName = (value: unknown): string =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;

/** Walk `value` against `schema` (with `$ref`s resolved against `rootSchema`), appending at most `max` issues. */
export function checkSchema(
  value: unknown,
  schema: JsonSchema | undefined,
  rootSchema: JsonSchema,
  path: string,
  issues: ImportIssue[],
  max = 50
): void {
  if (issues.length >= max || !schema) return;
  if (schema.$ref) {
    const parts = schema.$ref
      .split('/')
      .slice(1)
      .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
    let target: unknown = rootSchema;
    for (const p of parts) target = isObject(target) ? target[p] : undefined;
    if (!target) {
      issues.push(
        issue(
          'SCHEMA',
          path,
          'Skeemaviite on virheellinen: ' + schema.$ref,
          'Korjaa WITTin validointiskeema.'
        )
      );
      return;
    }
    checkSchema(value, target as JsonSchema, rootSchema, path, issues, max);
    return;
  }
  if (schema.anyOf) {
    const candidates = schema.anyOf.map((branch) => {
      const tmp: ImportIssue[] = [];
      checkSchema(value, branch, rootSchema, path, tmp, max);
      return tmp;
    });
    if (candidates.every((c) => c.length)) {
      const names = schema.anyOf.map((b) => (b.required || []).join(' + ')).filter(Boolean);
      issues.push(
        issue(
          'ANY_OF',
          path,
          'Pakollinen vaihtoehtoinen kenttä puuttuu.',
          names.length
            ? 'Lisää vähintään jokin seuraavista: ' + names.join(' tai ')
            : 'Täydennä vaadittu rakenne.'
        )
      );
    }
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const valid = types.some((type) =>
      type === 'null'
        ? value === null
        : type === 'array'
          ? Array.isArray(value)
          : type === 'object'
            ? isObject(value)
            : type === 'integer'
              ? Number.isInteger(value)
              : type === 'number'
                ? typeof value === 'number' && Number.isFinite(value)
                : typeof value === type
    );
    if (!valid) {
      issues.push(
        issue(
          'TYPE',
          path,
          'Väärä tietotyyppi (nyt ' + typeName(value) + ').',
          'Odotettu tyyppi: ' + types.join(' tai ') + '.'
        )
      );
      return;
    }
  }
  if (Object.hasOwn(schema, 'const') && value !== schema.const) {
    issues.push(
      issue(
        'CONST',
        path,
        'Virheellinen vakioarvo: ' + String(value) + '.',
        'Arvon pitää olla ' + JSON.stringify(schema.const) + '.'
      )
    );
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    issues.push(
      issue(
        'ENUM',
        path,
        'Arvo ' + JSON.stringify(value) + ' ei ole sallittu.',
        'Sallitut arvot: ' + schema.enum.map((x) => JSON.stringify(x)).join(', ') + '.'
      )
    );
    return;
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      issues.push(
        issue(
          'MIN_LENGTH',
          path,
          'Teksti on liian lyhyt.',
          'Pituus vähintään ' + schema.minLength + ' merkkiä.'
        )
      );
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      issues.push(
        issue(
          'MAX_LENGTH',
          path,
          'Teksti on liian pitkä (' + value.length + ' merkkiä).',
          'Enintään ' + schema.maxLength + ' merkkiä.'
        )
      );
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      issues.push(
        issue(
          'PATTERN',
          path,
          'Tunniste tai tekstimuoto ei vastaa vaadittua mallia.',
          'Käytä mallia: ' + schema.pattern + '.'
        )
      );
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum)
      issues.push(
        issue(
          'MINIMUM',
          path,
          'Arvo ' + value + ' on liian pieni.',
          'Pienin sallittu arvo on ' + schema.minimum + '.'
        )
      );
    if (schema.maximum !== undefined && value > schema.maximum)
      issues.push(
        issue(
          'MAXIMUM',
          path,
          'Arvo ' + value + ' on liian suuri.',
          'Suurin sallittu arvo on ' + schema.maximum + '.'
        )
      );
    if (
      schema.multipleOf !== undefined &&
      Math.abs(value / schema.multipleOf - Math.round(value / schema.multipleOf)) > 1e-8
    )
      issues.push(
        issue(
          'STEP',
          path,
          'Arvon tarkkuus ei ole sallittu.',
          'Käytä ' + schema.multipleOf + ' askelta, esimerkiksi −3,5 tai +4.'
        )
      );
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      issues.push(
        issue(
          'MIN_ITEMS',
          path,
          'Taulukossa on liian vähän alkioita.',
          'Vähintään ' + schema.minItems + ' alkiota.'
        )
      );
    if (schema.maxItems !== undefined && value.length > schema.maxItems)
      issues.push(
        issue(
          'MAX_ITEMS',
          path,
          'Taulukossa on liian monta alkiota (' + value.length + ').',
          'Enintään ' + schema.maxItems + ' alkiota.'
        )
      );
    if (schema.items)
      for (let i = 0; i < value.length && issues.length < max; i++)
        checkSchema(value[i], schema.items, rootSchema, path + '[' + i + ']', issues, max);
  }
  if (isObject(value)) {
    for (const key of schema.required || [])
      if (!Object.hasOwn(value, key) && issues.length < max)
        issues.push(
          issue(
            'REQUIRED',
            path + '.' + key,
            'Pakollinen kenttä puuttuu.',
            'Lisää kenttä "' + key + '" oikealla tietotyypillä.'
          )
        );
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(value))
        if (!Object.hasOwn(schema.properties, key) && issues.length < max)
          issues.push(
            issue(
              'UNKNOWN_FIELD',
              path + '.' + key,
              'Tuntematon kenttä "' + key + '".',
              'Poista kenttä tai korjaa nimi. Tuonti ei hyväksy ylimääräisiä kenttiä.'
            )
          );
    }
    if (schema.properties)
      for (const key of Object.keys(schema.properties))
        if (Object.hasOwn(value, key) && issues.length < max)
          checkSchema(value[key], schema.properties[key], rootSchema, path + '.' + key, issues, max);
  }
}

function checkDraftGraph(raw: Plain, issues: ImportIssue[]): void {
  if (!isObject(raw.root) || !Array.isArray(raw.claims)) return;
  const root = raw.root;
  const claims = raw.claims as unknown[];
  if (raw.mode === 'decision' && root.credence !== undefined)
    issues.push(
      issue(
        'DECISION_CREDENCE',
        '$.root.credence',
        'Päätöskysymykselle ei anneta totuusprosenttia.',
        'Poista root.credence ja arvioi perustelujen uskottavuus.'
      )
    );
  const known = new Map<unknown, string>([[root.id, '$.root.id']]);
  claims.forEach((c, i) => {
    if (!isObject(c) || typeof c.id !== 'string') return;
    if (known.has(c.id))
      issues.push(
        issue(
          'DUPLICATE_ID',
          `$.claims[${i}].id`,
          'Sama solmutunniste on käytössä useasti.',
          'Anna jokaiselle solmulle yksilöllinen id. Edellinen: ' + known.get(c.id)
        )
      );
    else known.set(c.id, `$.claims[${i}].id`);
  });
  claims.forEach((c, i) => {
    if (!isObject(c)) return;
    const path = `$.claims[${i}]`;
    if (typeof c.parentId === 'string' && !known.has(c.parentId))
      issues.push(
        issue(
          'MISSING_PARENT',
          path + '.parentId',
          'Vanhempaa "' + c.parentId + '" ei löydy.',
          'Käytä olemassa olevan root- tai claim-solmun id:tä.'
        )
      );
    if (c.relation === 'option' && (raw.mode !== 'decision' || c.parentId !== root.id))
      issues.push(
        issue(
          'OPTION_PARENT',
          path + '.relation',
          'Päätösvaihtoehdon tulee olla päätösjuuren välitön lapsi.',
          'Siirrä option-suhde suoraan päätösjuureen.'
        )
      );
    if (
      (c.relation === 'option' ||
        ['value', 'constraint', 'prerequisite'].includes(c.semanticType as string)) &&
      c.credence !== undefined
    )
      issues.push(
        issue(
          'NON_FACTUAL_CREDENCE',
          path + '.credence',
          'Tähän solmutyyppiin ei kuulu uskottavuusprosenttia.',
          'Poista credence-kenttä; suhteelle voi jäädä vaikutusarvio.'
        )
      );
    if (c.relation === 'option' && c.influence !== undefined)
      issues.push(
        issue(
          'OPTION_INFLUENCE',
          path + '.influence',
          'Päätösvaihtoehdon suhdetta ei arvioida vaikutusarvolla.',
          'Poista influence-kenttä; arvioi vaihtoehdon perustelut.'
        )
      );
  });
  for (const [id, p] of known) {
    if (p === '$.root.id') continue;
    const seen = new Set<unknown>();
    let current = id;
    while (current !== root.id) {
      if (seen.has(current)) {
        issues.push(
          issue(
            'CYCLE',
            p,
            'Solmujen parentId-viitteet muodostavat syklin.',
            'Poista kehä ja viittaa lopulta juureen.'
          )
        );
        break;
      }
      seen.add(current);
      const c = claims.find((n) => isObject(n) && n.id === current) as Plain | undefined;
      if (!c || !known.has(c.parentId)) break;
      current = c.parentId;
    }
  }
  const shared = new Set(
    (Array.isArray(raw.sharedReasons) ? raw.sharedReasons : []).map((r) => (isObject(r) ? r.id : undefined))
  );
  (Array.isArray(raw.sharedAttachments) ? raw.sharedAttachments : []).forEach((a, i) => {
    if (!isObject(a)) return;
    if (!shared.has(a.reasonId))
      issues.push(
        issue(
          'MISSING_SHARED_REASON',
          `$.sharedAttachments[${i}].reasonId`,
          'Yhteisperustetta ei löydy.',
          'Käytä sharedReasons-listalla olevaa id:tä.'
        )
      );
    if (!known.has(a.parentId))
      issues.push(
        issue(
          'MISSING_PARENT',
          `$.sharedAttachments[${i}].parentId`,
          'Liitoksen vanhempaa ei löydy.',
          'Korjaa parentId.'
        )
      );
  });
  (Array.isArray(raw.links) ? raw.links : []).forEach((l, i) => {
    if (!isObject(l)) return;
    for (const field of ['sourceId', 'targetId'])
      if (!known.has(l[field]))
        issues.push(
          issue(
            'MISSING_LINK_ENDPOINT',
            `$.links[${i}].${field}`,
            'Lisäyhteyden solmua ei löydy.',
            'Käytä olemassa olevan solmun id:tä.'
          )
        );
  });
  (Array.isArray(raw.comments) ? raw.comments : []).forEach((c, i) => {
    if (isObject(c) && !known.has(c.nodeId))
      issues.push(
        issue(
          'MISSING_COMMENT_NODE',
          `$.comments[${i}].nodeId`,
          'Kommentin kohdesolmua ei löydy.',
          'Vaihda nodeId olemassa olevaan solmuun.'
        )
      );
  });
}

function checkProjectGraph(raw: Plain, issues: ImportIssue[]): void {
  if (!Array.isArray(raw.nodes)) return;
  const nodes = raw.nodes as unknown[];
  const known = new Map<string, number>();
  const users = new Set(
    (Array.isArray(raw.users) ? raw.users : []).map((u) => (isObject(u) ? u.id : undefined))
  );
  nodes.forEach((n, i) => {
    if (!isObject(n) || typeof n.id !== 'string') return;
    if (known.has(n.id))
      issues.push(
        issue('DUPLICATE_ID', `$.nodes[${i}].id`, 'Solmun tunniste on jo käytössä.', 'Anna eri id.')
      );
    else known.set(n.id, i);
  });
  nodes.forEach((n, i) => {
    if (!isObject(n)) return;
    if (n.parentId !== null && typeof n.parentId === 'string' && !known.has(n.parentId))
      issues.push(
        issue(
          'MISSING_PARENT',
          `$.nodes[${i}].parentId`,
          'Vanhempaa "' + n.parentId + '" ei löydy.',
          'Valitse olemassa oleva solmu.'
        )
      );
    if (typeof n.createdBy === 'string' && !users.has(n.createdBy))
      issues.push(
        issue(
          'MISSING_AUTHOR',
          `$.nodes[${i}].createdBy`,
          'Tekijää ei löydy käyttäjälistasta.',
          'Lisää käyttäjä users-taulukkoon tai korjaa createdBy.'
        )
      );
  });
  for (const [field, targetField] of [
    ['votes', 'nodeId'],
    ['edgeAssessments', 'subjectId'],
  ] as const) {
    const list = raw[field];
    if (!Array.isArray(list)) continue;
    list.forEach((r, i) => {
      if (!isObject(r)) return;
      if (field === 'edgeAssessments' && r.subjectType === 'secondary') return;
      const target = r[targetField];
      if (typeof target === 'string' && !known.has(target))
        issues.push(
          issue(
            'MISSING_TARGET',
            `$.${field}[${i}].${targetField}`,
            'Arvio viittaa olemattomaan solmuun.',
            'Korjaa viite tai lisää solmu.'
          )
        );
    });
  }
}

/** A deterministic clock for the conversions the preflight runs only to see whether they succeed. */
function probeClock(): Clock {
  let n = 0;
  return { now: '1970-01-01T00:00:00.000Z', newId: () => `probe-${++n}` };
}

/**
 * Inspect JSON text or a parsed value without changing either. The result names the format, lists every issue the
 * person can act on (schema paths first, then graph references, then the real parser's refusal) and carries the
 * parsed value for the caller to route: drafts to the draft preview, proposals to the contribution preview,
 * projects and starters to the replace flow, library backups to the library.
 */
export function inspectImport(input: unknown, opts: InspectOptions = {}): ImportReport {
  const errors: ImportIssue[] = [];
  let parsed: unknown = input;
  const maxErrors = opts.maxErrors || 60;
  if (typeof input === 'string') {
    if (input.length > (opts.maxBytes || 25_000_000))
      errors.push(issue('TOO_LARGE', '$', 'JSON-sisältö on liian suuri.', 'Pienennä tiedostoa.'));
    if (!errors.length) {
      const trimmed = input.trim();
      if (/^```/.test(trimmed))
        errors.push(
          issue(
            'MARKDOWN',
            '$',
            'Tiedosto sisältää Markdown-koodiaidan.',
            'Poista ```json- ja ```-rivit; tiedoston tulee sisältää pelkkä JSON-olio.'
          )
        );
      else {
        try {
          parsed = JSON.parse(input);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          errors.push(
            issue(
              'JSON_SYNTAX',
              '$',
              'JSON-syntaksivirhe: ' + message,
              'Korjaa pilkut, lainausmerkit, hakasulut tai puuttuva sulje.',
              syntaxPosition(message, input)
            )
          );
        }
      }
    }
  }
  if (errors.length)
    return { ok: false, format: 'invalid', formatName: 'JSON-syntaksi', issues: errors, parsed: null };
  if (!isObject(parsed))
    return {
      ok: false,
      format: 'unknown',
      formatName: 'Tuntematon',
      issues: [
        issue(
          'ROOT_TYPE',
          '$',
          'JSON:n ylimmän tason on oltava olio.',
          'Aloita tiedosto merkillä { ja lopeta merkillä }.'
        ),
      ],
      parsed,
    };
  const format = importFormatOf(parsed);
  const formatName = IMPORT_FORMAT_NAMES[format] || 'Tuntematon tiedostomuoto';
  if (format === 'unknown') {
    const request = typeof parsed.format === 'string' && /request|task/i.test(parsed.format);
    const old = parsed.format === 'witt-ai-review-v1';
    errors.push(
      issue(
        request ? 'REQUEST_NOT_RESPONSE' : old ? 'OBSOLETE_FORMAT' : 'FORMAT',
        parsed.format ? '$.format' : '$',
        request
          ? 'Tämä on AI:lle tarkoitettu tehtävätiedosto, ei WITTiin tuotava vastaus.'
          : old
            ? 'Tiedosto käyttää vanhaa AI-muutosehdotuksen muotoa.'
            : 'WITT ei tunnista JSON:n tiedostomuotoa.',
        request
          ? 'Anna tehtävätiedosto kielimallille ja tuo sen palauttama JSON-vastaus.'
          : old
            ? 'Pyydä AI:ta tuottamaan witt-contribution-v2 tai witt-ai-draft-v2.'
            : 'WITT-dokumentissa tarvitaan schemaVersion: 5; AI-puussa format: "witt-ai-draft-v2"; muutosehdotuksessa format: "witt-contribution-v2".'
      )
    );
  }
  if (opts.expected && format !== opts.expected)
    errors.push(
      issue(
        'WRONG_IMPORT',
        '$' + (parsed.format ? '.format' : '.schemaVersion'),
        'Tämä on ' +
          formatName +
          ', mutta tähän tuontiin odotetaan ' +
          (IMPORT_FORMAT_NAMES[opts.expected] || opts.expected) +
          '.',
        'Käytä Tiedosto → Avaa JSON -toimintoa tai valitse oikea tuonti.'
      )
    );
  if (format === 'project' && parsed.schemaVersion !== SCHEMA_VERSION)
    return {
      ok: false,
      format,
      formatName,
      parsed,
      issues: [
        issue(
          'VERSION',
          '$.schemaVersion',
          'Dokumentin schemaVersion ' +
            parsed.schemaVersion +
            ' ei vastaa nykyistä versiota ' +
            SCHEMA_VERSION +
            '.',
          'Käytä nykyisen version JSON-tiedostoa. Vanhojen dokumenttien automaattista migraatiota ei ole.'
        ),
      ],
    };
  let schema: JsonSchema | null = null;
  if (format === 'project') schema = PROJECT_SCHEMA;
  if (format === 'draft') schema = DRAFT_SCHEMA;
  if (format === 'contribution')
    schema = parsed.format === CONTRIBUTION_BUNDLE_FORMAT ? CONTRIBUTION_BUNDLE_SCHEMA : CONTRIBUTION_SCHEMA;
  if (format === 'starter') schema = STARTER_SCHEMA;
  if (format === 'library') {
    if (!Array.isArray(parsed.documents))
      errors.push(
        issue(
          'REQUIRED',
          '$.documents',
          'Varmuuskopiosta puuttuu documents-taulukko.',
          'Varmuuskopio on muodostettava WITTin Asiakirjakirjaston viennillä.'
        )
      );
    else if (parsed.documents.length > 1000)
      errors.push(
        issue('MAX_ITEMS', '$.documents', 'Liian monta asiakirjaa.', 'Vähennä asiakirjojen määrää.')
      );
    else
      (parsed.documents as unknown[]).forEach((doc, i) => {
        const inner: ImportIssue[] = [];
        checkSchema(
          doc,
          PROJECT_SCHEMA,
          PROJECT_SCHEMA,
          `$.documents[${i}]`,
          inner,
          Math.max(1, maxErrors - errors.length)
        );
        errors.push(...inner);
      });
  }
  if (schema && errors.length < maxErrors) checkSchema(parsed, schema, schema, '$', errors, maxErrors);
  if (errors.length < maxErrors && format === 'draft') checkDraftGraph(parsed, errors);
  if (errors.length < maxErrors && format === 'project') checkProjectGraph(parsed, errors);
  if (!errors.length) {
    try {
      if (format === 'project') parseProject(parsed);
      if (format === 'draft') {
        parseAiDraft(parsed);
        draftToProject(parsed, probeClock());
      }
      if (format === 'contribution') {
        if (parsed.format === CONTRIBUTION_BUNDLE_FORMAT) parseMultiAuthorBundle(parsed);
        else parseContribution(parsed);
        if (opts.currentProject) {
          const current = parseProject(opts.currentProject);
          if (parsed.projectId !== current.id)
            errors.push(
              issue(
                'WRONG_PROJECT',
                '$.projectId',
                'Ehdotus on tehty eri WITT-dokumenttiin.',
                'Luo ehdotus nykyisen dokumentin uudella AI-/WITT-tehtävätiedostolla.'
              )
            );
          else if (parsed.baseFingerprint !== projectFingerprint(current))
            errors.push(
              issue(
                'STALE_PROPOSAL',
                '$.baseFingerprint',
                'Ehdotus perustuu vanhaan dokumentin versioon.',
                'Luo uusi ehdotus nykyisestä dokumentista; vanhaa tiedostoa ei tuoda automaattisesti.'
              )
            );
        }
      }
      if (format === 'starter') {
        parseStarter(parsed);
        starterToProject(parsed, probeClock());
      }
      if (format === 'library') for (const doc of parsed.documents as unknown[]) parseProject(doc);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push(
        issue(
          'DOMAIN',
          '$',
          'WITTin rakennetarkistus hylkäsi tiedoston: ' + message,
          'Korjaa virhe ja tarkista solmujen, suhteiden ja arvioijien viittaukset.'
        )
      );
    }
  }
  return { ok: errors.length === 0, format, formatName, issues: errors.slice(0, maxErrors), parsed };
}

/** The copyable / downloadable report (`witt-tuonnin-korjausraportti.txt`), byte-identical to the prototype's. */
export function importReportText(
  report: Pick<ImportReport, 'ok' | 'formatName' | 'issues'>,
  filename = ''
): string {
  const lines: (string | null)[] = [
    'WITT JSON -tarkistusraportti',
    filename ? 'Tiedosto: ' + filename : null,
    'Muoto: ' + report.formatName,
    report.ok ? 'Tulos: hyväksytty' : 'Tulos: hylätty (' + report.issues.length + ' virhettä)',
    '',
  ];
  for (const [i, e] of report.issues.entries()) {
    lines.push(
      i +
        1 +
        '. [' +
        e.code +
        '] ' +
        e.path +
        (e.line ? ' (rivi ' + e.line + ', sarake ' + e.column + ')' : ''),
      e.message,
      'Korjaa: ' + e.fix,
      ''
    );
  }
  if (report.ok) lines.push('JSON on tarkistettu skeeman ja nykyisen WITT-tietomallin perusteella.');
  return lines.filter((x) => x !== null).join('\n');
}
