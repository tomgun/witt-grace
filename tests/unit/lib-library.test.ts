// must: the document library stores, lists, saves with optimistic revisions, removes, backs up and restores exactly
//       as the frozen prototype's `src/document-library.js`: the same record shape, the same results and the same
//       error messages for every conflict, the same backup JSON and the same all-or-nothing restore with
//       " (imported)" copies for colliding ids
// test: tests/unit/lib-library.test.ts (both modules driven through the same in-memory IndexedDB fake, the clock fixed)
// red-against: a stale revision overwriting a newer save, a first save of identical content bumping the revision,
//              a delete without a known revision, a restore that overwrites or partially writes, a backup that
//              exports only the open document, a record missing nodeCount or savedAt
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { Project } from '../../src/domain/index.ts';
import * as Lib from '../../src/lib/library.ts';

const require = createRequire(import.meta.url);
const protoDir = path.join(process.cwd(), 'witt-grace-gpt-proto');
const Proto = require(path.join(protoDir, 'src', 'document-library.js'));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Core: any = require(path.join(protoDir, 'src', 'core.js'));
const example = (name: string): Project =>
  Core.validateProject(JSON.parse(readFileSync(path.join(protoDir, 'examples', name), 'utf8')));

const NOW = '2026-11-08T10:00:00.000Z';
/** The prototype reads the wall clock; pin it for byte-equal records. */
async function withFixedClock<T>(fn: () => Promise<T>): Promise<T> {
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(value?: string | number | Date) {
      super(value === undefined ? NOW : value);
    }
  }
  globalThis.Date = FixedDate as unknown as DateConstructor;
  try {
    return await fn();
  } finally {
    globalThis.Date = RealDate;
  }
}

// A minimal IndexedDB fake: one database, key-path stores, microtask-scheduled requests, transactions that commit
// when their last request has run and discard their writes when aborted. Only what the library uses.
interface FakeRequest {
  result: unknown;
  error: unknown;
  onsuccess: null | (() => void);
  onerror: null | (() => void);
}
function fakeIndexedDB(stores = new Map<string, Map<string, unknown>>()) {
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const db = {
    objectStoreNames: { contains: (name: string) => stores.has(name) },
    createObjectStore(name: string) {
      stores.set(name, new Map());
    },
    onversionchange: null as null | (() => void),
    close() {},
    transaction(name: string, mode: string) {
      const live = stores.get(name)!;
      const working = mode === 'readwrite' ? new Map(live) : live;
      let pending = 0;
      let settled = false;
      const tx = {
        error: null as unknown,
        oncomplete: null as null | (() => void),
        onerror: null as null | (() => void),
        onabort: null as null | (() => void),
        abort() {
          if (settled) throw new Error('InvalidStateError');
          settled = true;
          queueMicrotask(() => tx.onabort?.());
        },
        objectStore: () => store,
      };
      const schedule = (compute: () => unknown): FakeRequest => {
        const req: FakeRequest = { result: undefined, error: null, onsuccess: null, onerror: null };
        pending++;
        queueMicrotask(() => {
          if (settled) return;
          try {
            req.result = compute();
            req.onsuccess?.();
          } catch (error) {
            req.error = error;
            req.onerror?.();
          }
          pending--;
          if (pending === 0 && !settled) {
            settled = true;
            if (mode === 'readwrite') {
              live.clear();
              for (const [k, v] of working) live.set(k, v);
            }
            queueMicrotask(() => tx.oncomplete?.());
          }
        });
        return req;
      };
      const sortedKeys = () => [...working.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      const store = {
        get: (id: string) => schedule(() => (working.has(id) ? clone(working.get(id)) : undefined)),
        getAll: () => schedule(() => sortedKeys().map((k) => clone(working.get(k)))),
        put: (record: { id: string }) =>
          schedule(() => {
            working.set(record.id, clone(record));
            return record.id;
          }),
        delete: (id: string) =>
          schedule(() => {
            working.delete(id);
            return undefined;
          }),
      };
      return tx;
    },
  };
  return {
    stores,
    open(name: string, version: number) {
      assert.equal(name, 'witt-document-library');
      assert.equal(version, 1);
      const req = {
        result: db,
        error: null,
        onupgradeneeded: null as null | (() => void),
        onsuccess: null as null | (() => void),
        onerror: null as null | (() => void),
        onblocked: null as null | (() => void),
      };
      queueMicrotask(() => {
        if (!stores.size) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
}

type Step = (lib: Lib.Library) => Promise<unknown>;
const outcome = (p: Promise<unknown>) =>
  p.then(
    (value) => ({ ok: true, value }),
    (error: Error) => ({ ok: false, message: error.message })
  );
/** Run the same steps against both modules; every step's result or error message must agree. */
async function parity(steps: [string, Step][]) {
  const oursDb = fakeIndexedDB();
  const theirsDb = fakeIndexedDB();
  const ours = await Lib.createLibrary(oursDb as unknown as IDBFactory, () => NOW);
  const theirs: Lib.Library = await Proto.open(theirsDb);
  const results: Record<string, unknown> = {};
  for (const [label, step] of steps) {
    const a = await withFixedClock(() => outcome(step(ours)));
    const b = await withFixedClock(() => outcome(step(theirs)));
    assert.deepEqual(a, b, `step ${label}`);
    results[label] = a;
  }
  assert.deepEqual(
    [...oursDb.stores.get('documents')!.entries()],
    [...theirsDb.stores.get('documents')!.entries()]
  );
  return { results, ours, theirs, oursDb };
}

const docA = example('product-launch.witt.json');
const docB = example('debate-pilvialusta.witt.json');
const docC = example('four-way-tree.witt.json');
const ids = () => {
  let n = 0;
  return () => `imported-${++n}`;
};

test('createLibrary rejects without IndexedDB with the prototype message', async () => {
  await assert.rejects(Lib.createLibrary(null), /IndexedDB ei ole käytettävissä tässä selainympäristössä/);
  await assert.rejects(Proto.open(null), /IndexedDB ei ole käytettävissä tässä selainympäristössä/);
});

test('save, list, get, rename, delete: results, records and conflicts match the prototype', async () => {
  const { results, oursDb } = await parity([
    ['empty list', (lib) => lib.list()],
    ['missing get', (lib) => lib.get('nope')],
    ['first save', (lib) => lib.put(docA)],
    ['identical content without a known revision is reused', (lib) => lib.put(docA)],
    ['known revision saves again', (lib) => lib.put(docA, 1)],
    ['stale revision is refused', (lib) => lib.put(docA, 1)],
    ['changed content without a revision is refused', (lib) => lib.put({ ...docA, title: 'Uusi' })],
    ['expected revision for a document not stored', (lib) => lib.put(docB, 1)],
    ['bad revision', (lib) => lib.put(docB, 0)],
    ['invalid document', (lib) => lib.put({ ...docB, nodes: 'x' } as unknown as Project)],
    ['second document', (lib) => lib.put(docB)],
    ['rename with the right revision', (lib) => lib.put({ ...docB, title: 'Pilvi (uusi)' }, 1)],
    ['list', (lib) => lib.list()],
    ['get', (lib) => lib.get(docA.id)],
    ['remove needs a revision', (lib) => lib.remove(docA.id, undefined as unknown as number)],
    ['remove with a stale revision', (lib) => lib.remove(docA.id, 1)],
    ['remove', (lib) => lib.remove(docA.id, 2)],
    ['remove again', (lib) => lib.remove(docA.id, 2)],
    ['final list', (lib) => lib.list()],
  ]);
  assert.deepEqual(results['first save'], { ok: true, value: { id: docA.id, revision: 1, reused: false } });
  assert.deepEqual(results['identical content without a known revision is reused'], {
    ok: true,
    value: { id: docA.id, revision: 1, reused: true },
  });
  assert.deepEqual(results['known revision saves again'], {
    ok: true,
    value: { id: docA.id, revision: 2, reused: false },
  });
  assert.deepEqual(results['stale revision is refused'], {
    ok: false,
    message:
      'Ristiriitainen asiakirjaversio: vie paikallinen työ JSONiksi ja avaa kirjaston uusin versio. Tietoja ei korvattu.',
  });
  assert.deepEqual(results['expected revision for a document not stored'], {
    ok: false,
    message: 'Asiakirja on poistettu toisessa ikkunassa. Tallennus estettiin.',
  });
  assert.deepEqual(results['bad revision'], { ok: false, message: 'Virheellinen odotettu versio' });
  assert.deepEqual(results['invalid document'], {
    ok: false,
    message: 'Tallennettava asiakirja on virheellinen',
  });
  assert.deepEqual(results['remove needs a revision'], {
    ok: false,
    message: 'Poistoon vaaditaan asiakirjan tunnettu versio',
  });
  assert.deepEqual(results['remove with a stale revision'], {
    ok: false,
    message: 'Asiakirjaa on muokattu toisessa ikkunassa. Poisto estettiin.',
  });
  assert.deepEqual(results['remove'], { ok: true, value: { id: docA.id, deleted: true } });
  assert.deepEqual(results['remove again'], { ok: false, message: 'Asiakirjaa ei enää ole' });
  assert.deepEqual(results['final list'], {
    ok: true,
    value: [
      {
        id: docB.id,
        title: 'Pilvi (uusi)',
        updatedAt: docB.updatedAt,
        savedAt: NOW,
        revision: 2,
        nodeCount: docB.nodes.length,
      },
    ],
  });
  const stored = oursDb.stores.get('documents')!.get(docB.id) as Lib.LibraryRecord;
  assert.deepEqual(Object.keys(stored), [
    'id',
    'title',
    'updatedAt',
    'savedAt',
    'nodeCount',
    'revision',
    'document',
  ]);
  assert.deepEqual(stored.document, { ...docB, title: 'Pilvi (uusi)' });
});

test('backup export and restore match the prototype: every document, copies for colliding ids, all or nothing', async () => {
  const bundleOf = (docs: Project[]) => ({
    format: 'witt-document-library-v1',
    exportedAt: NOW,
    documents: docs,
  });
  const validate = (doc: unknown) => Core.validateProject(doc) as Project;
  const { results } = await parity([
    ['seed A', (lib) => lib.put(docA)],
    ['seed B', (lib) => lib.put(docB)],
    ['backup', (lib) => lib.exportBundle()],
    ['wrong format', (lib) => lib.importBundle({ format: 'x', documents: [] }, validate, ids())],
    ['no validators', (lib) => lib.importBundle(bundleOf([]), undefined as never, ids())],
    [
      'invalid document inside refuses the whole bundle',
      (lib) =>
        lib.importBundle(bundleOf([docC, { ...docA, nodes: 'x' } as unknown as Project]), validate, ids()),
    ],
    [
      'duplicate ids inside the bundle',
      (lib) => lib.importBundle(bundleOf([docC, { ...docC, title: 'twin' }]), validate, ids()),
    ],
    ['list unchanged', (lib) => lib.list()],
    ['restore with one collision', (lib) => lib.importBundle(bundleOf([docA, docC]), validate, ids())],
    ['list after restore', (lib) => lib.list()],
    ['backup after restore', (lib) => lib.exportBundle()],
    [
      'id generator that never clears the collision',
      (lib) => lib.importBundle(bundleOf([docB]), validate, () => docA.id),
    ],
    ['too many documents', (lib) => lib.importBundle(bundleOf(new Array(1001).fill(docC)), validate, ids())],
  ]);
  assert.deepEqual(results['backup'], {
    ok: true,
    value: bundleOf([docB, docA].sort((a, b) => (a.id < b.id ? -1 : 1))),
  });
  assert.deepEqual(results['wrong format'], { ok: false, message: 'Invalid WITT library bundle' });
  assert.deepEqual(results['no validators'], { ok: false, message: 'Import validators required' });
  assert.equal((results['invalid document inside refuses the whole bundle'] as { ok: boolean }).ok, false);
  assert.deepEqual(results['duplicate ids inside the bundle'], {
    ok: false,
    message: 'Duplicate document IDs in bundle',
  });
  assert.deepEqual(results['restore with one collision'], {
    ok: true,
    value: { imported: 2, duplicated: 1 },
  });
  const rows = (results['list after restore'] as { value: Lib.LibraryRow[] }).value;
  assert.deepEqual(
    rows.map((r) => [r.id, r.title, r.revision]).sort(),
    [
      [docA.id, docA.title, 1],
      [docB.id, docB.title, 1],
      [docC.id, docC.title, 1],
      ['imported-1', docA.title + ' (imported)', 1],
    ].sort()
  );
  assert.deepEqual(results['id generator that never clears the collision'], {
    ok: false,
    message: 'Could not generate collision-free document ID',
  });
  assert.deepEqual(results['too many documents'], { ok: false, message: 'Invalid WITT library bundle' });
});

test('the pure transforms pin the record, row, bundle and import plan shapes', () => {
  const record = Lib.libraryRecord(docA, 3, NOW);
  assert.deepEqual(record, {
    id: docA.id,
    title: docA.title,
    updatedAt: docA.updatedAt,
    savedAt: NOW,
    nodeCount: 7,
    revision: 3,
    document: docA,
  });
  const older = Lib.libraryRecord(docB, 1, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(
    Lib.libraryRows([older, record]).map((r) => r.id),
    [docA.id, docB.id]
  );
  assert.deepEqual(Lib.libraryBundle([record, older], NOW), {
    format: 'witt-document-library-v1',
    exportedAt: NOW,
    documents: [docA, docB],
  });
  const plan = Lib.planImport([docA, docC], [docA.id], ids(), NOW);
  assert.equal(plan.duplicated, 1);
  assert.deepEqual(
    plan.records.map((r) => [r.id, r.title, r.revision, r.savedAt, r.document.id]),
    [
      ['imported-1', docA.title + ' (imported)', 1, NOW, 'imported-1'],
      [docC.id, docC.title, 1, NOW, docC.id],
    ]
  );
  assert.throws(() => Lib.validateBundle({ format: 'witt-document-library-v1' }, (d) => d as Project), {
    message: 'Invalid WITT library bundle',
  });
});

test('a closed library refuses every operation', async () => {
  const lib = await Lib.createLibrary(fakeIndexedDB() as unknown as IDBFactory, () => NOW);
  lib.close();
  await assert.rejects(lib.list(), { message: 'Tietokantayhteys on suljettu' });
});
