// must: the workspace metadata (`witt-workspace-meta-v1`) is read, written and summarised exactly as the frozen
//       prototype's `src/workspace.js`, and the home-screen card formats the three timestamps as app.js
//       `renderHomeWorkspace` does: "Tarkka aika ei tiedossa" for an unknown time, "Ei vielä tietoa" for an
//       event never recorded, "<filename> · <locale time>" otherwise
// test: tests/unit/lib-workspace-meta.test.ts (parity through the prototype module on the same memory store)
// red-against: the draft written after the metadata (a failed draft save reported as success), the filename not
//              cut to 255 characters, an event recorded under a key the prototype does not read, a savedAt of
//              another document shown as this one's, the session-only label or the unreadable title dropped
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { createBlankProject } from '../../src/domain/index.ts';
import { FI, translator } from '../../src/lib/i18n/i18n.ts';
import { PROJECT_KEY, memoryStore } from '../../src/lib/storage.ts';
import * as Meta from '../../src/lib/workspaceMeta.ts';

const require = createRequire(import.meta.url);
const Proto = require(path.join(process.cwd(), 'witt-grace-gpt-proto', 'src', 'workspace.js'));

const NOW = '2026-11-08T10:00:00.000Z';
const LATER = '2026-11-08T11:30:00.000Z';
const t = translator(FI);
const project = createBlankProject({
  mode: 'argument',
  projectId: 'id-1',
  rootId: 'id-2',
  userId: 'id-3',
  now: NOW,
});
const locale = 'fi';
const intl = (value: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

test('readMeta, persist, recordEvent and hasSavedWork match the prototype byte for byte', () => {
  const ours = memoryStore();
  const theirs = memoryStore();
  assert.deepEqual(Meta.readMeta(ours), {});
  assert.deepEqual(Proto.readMeta(theirs), {});
  assert.equal(Meta.hasSavedWork(ours), false);
  assert.equal(Proto.hasSavedWork(theirs), false);

  assert.deepEqual(Meta.persist(ours, project, NOW), Proto.persist(theirs, project, NOW));
  assert.equal(ours.getItem(Meta.WORKSPACE_META_KEY), theirs.getItem(Proto.META_KEY));
  assert.equal(Meta.WORKSPACE_META_KEY, Proto.META_KEY);
  assert.equal(PROJECT_KEY, Proto.PROJECT_KEY);
  assert.equal(Meta.hasSavedWork(ours), true);
  assert.deepEqual(Meta.rawActive(ours), { key: 'witt-project-v3', raw: ours.getItem('witt-project-v3') });

  const longName = 'x'.repeat(300) + '.witt.json';
  assert.deepEqual(
    Meta.recordEvent(ours, 'lastOpenedJson', longName, project.id, LATER),
    Proto.recordEvent(theirs, 'lastOpenedJson', longName, project.id, LATER)
  );
  assert.deepEqual(
    Meta.recordEvent(ours, 'lastExportedJson', 'nimeton-pohdinta.witt.json', project.id, LATER),
    Proto.recordEvent(theirs, 'lastExportedJson', 'nimeton-pohdinta.witt.json', project.id, LATER)
  );
  assert.equal(ours.getItem(Meta.WORKSPACE_META_KEY), theirs.getItem(Proto.META_KEY));
  assert.deepEqual(Meta.readMeta(ours), {
    active: { id: project.id, title: 'Nimetön pohdinta', savedAt: NOW },
    lastOpenedJson: { filename: 'x'.repeat(255), projectId: project.id, at: LATER },
    lastExportedJson: { filename: 'nimeton-pohdinta.witt.json', projectId: project.id, at: LATER },
  });
  assert.throws(
    () => Meta.recordEvent(ours, 'other' as Meta.WorkspaceEventKind, 'f', project.id, NOW),
    /Invalid workspace event/
  );
  // Corrupt metadata reads as empty, as in the prototype.
  ours.setItem(Meta.WORKSPACE_META_KEY, '[1,2');
  theirs.setItem(Proto.META_KEY, '[1,2');
  assert.deepEqual(Meta.readMeta(ours), {});
  assert.deepEqual(Proto.readMeta(theirs), {});
  ours.setItem(Meta.WORKSPACE_META_KEY, '[1]');
  assert.deepEqual(Meta.readMeta(ours), {});
});

test('persist writes the draft first and throws instead of recording a failed save', () => {
  const broken = memoryStore();
  broken.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  assert.throws(() => Meta.persist(broken, project, NOW), /QuotaExceededError/);
  assert.equal(broken.getItem(Meta.WORKSPACE_META_KEY), null);
  const metaOnlyFails = memoryStore();
  const inner = metaOnlyFails.setItem;
  metaOnlyFails.setItem = (k, v) => {
    if (k === Meta.WORKSPACE_META_KEY) throw new Error('meta quota');
    inner(k, v);
  };
  assert.deepEqual(Meta.persist(metaOnlyFails, project, NOW), {
    id: project.id,
    title: 'Nimetön pohdinta',
    savedAt: NOW,
  });
  assert.equal(Meta.hasSavedWork(metaOnlyFails), true);
});

test('activeSummary matches the prototype for the saved, foreign, session-only and malformed cases', () => {
  const store = memoryStore();
  const cases: [unknown, boolean][] = [
    [project, false],
    [project, true],
    [{ ...project, id: 'other' }, false],
    [{ ...project, title: '   ', updatedAt: 'not a date', nodes: 'x' }, false],
    [{ ...project, mode: 'weird' }, false],
    [null, false],
    [[1], false],
  ];
  for (const [doc, temporary] of cases) {
    assert.deepEqual(Meta.activeSummary(store, doc, temporary), Proto.activeSummary(store, doc, temporary));
  }
  Meta.persist(store, project, NOW);
  for (const [doc, temporary] of cases) {
    assert.deepEqual(Meta.activeSummary(store, doc, temporary), Proto.activeSummary(store, doc, temporary));
  }
  assert.deepEqual(Meta.activeSummary(store, project, false), {
    id: project.id,
    title: 'Nimetön pohdinta',
    mode: 'argument',
    nodeCount: 1,
    editedAt: NOW,
    browserSavedAt: NOW,
    sessionOnly: false,
  });
  assert.equal(Meta.activeSummary(store, project, true).browserSavedAt, null);
  assert.equal(Meta.activeSummary(store, { ...project, id: 'other' }, false).browserSavedAt, null);
});

test('formatWorkspaceTime and formatWorkspaceEvent follow the home-screen rules', () => {
  assert.equal(Meta.formatWorkspaceTime(t, locale, null), 'Tarkka aika ei tiedossa');
  assert.equal(Meta.formatWorkspaceTime(t, locale, ''), 'Tarkka aika ei tiedossa');
  assert.equal(Meta.formatWorkspaceTime(t, locale, 'eilen'), 'Tarkka aika ei tiedossa');
  assert.equal(Meta.formatWorkspaceTime(t, locale, NOW), intl(NOW));
  // A locale Intl rejects: the raw value is shown rather than nothing.
  assert.equal(Meta.formatWorkspaceTime(t, 'not a locale!!', NOW), NOW);
  assert.equal(Meta.formatWorkspaceEvent(t, locale, undefined), 'Ei vielä tietoa');
  assert.equal(
    Meta.formatWorkspaceEvent(t, locale, { filename: '', projectId: 'p', at: NOW }),
    'Ei vielä tietoa'
  );
  assert.equal(
    Meta.formatWorkspaceEvent(t, locale, { filename: 'a.witt.json', projectId: 'p', at: NOW }),
    `a.witt.json · ${intl(NOW)}`
  );
  assert.equal(
    Meta.formatWorkspaceEvent(t, locale, { filename: 'a.witt.json', projectId: 'p', at: 'bad' }),
    'a.witt.json · Tarkka aika ei tiedossa'
  );
});

test('homeCard renders the current-work card as renderHomeWorkspace does', () => {
  const store = memoryStore();
  const base = { store, project, hydrationFailed: false, temporary: false, locale, t };
  assert.deepEqual(Meta.homeCard(base), {
    saved: false,
    canContinue: false,
    title: '',
    browserSaveLabel: 'Viimeisin selaintallennus',
    browserSave: '',
    latestOpen: 'Ei vielä tietoa',
    latestExport: 'Ei vielä tietoa',
    showUnreadableWarning: false,
    showSessionWarning: false,
  });
  Meta.persist(store, project, NOW);
  Meta.recordEvent(store, 'lastExportedJson', 'nimeton-pohdinta.witt.json', project.id, LATER);
  assert.deepEqual(Meta.homeCard(base), {
    saved: true,
    canContinue: true,
    title: 'Nimetön pohdinta',
    browserSaveLabel: 'Viimeisin selaintallennus',
    browserSave: intl(NOW),
    latestOpen: 'Ei vielä tietoa',
    latestExport: `nimeton-pohdinta.witt.json · ${intl(LATER)}`,
    showUnreadableWarning: false,
    showSessionWarning: false,
  });
  // The metadata names another document: the loaded title is shown and the save time is unknown.
  const other = { ...project, id: 'other-id', title: 'Toinen' };
  const foreign = Meta.homeCard({ ...base, project: other });
  assert.equal(foreign.title, 'Toinen');
  assert.equal(foreign.browserSave, 'Tarkka aika ei tiedossa');
  // Hydration failed: the fallback project is loaded, Continue is hidden, the title says the save is unreadable.
  const failed = Meta.homeCard({ ...base, project: other, hydrationFailed: true });
  assert.equal(failed.canContinue, false);
  assert.equal(failed.saved, true);
  assert.equal(failed.title, 'Tallennusta ei voitu lukea');
  assert.equal(failed.showUnreadableWarning, true);
  // Session-only storage: the label changes and the warning shows.
  const session = Meta.homeCard({ ...base, temporary: true });
  assert.equal(session.browserSaveLabel, 'Istunnon viimeisin tallennus');
  assert.equal(session.showSessionWarning, true);
  assert.equal(session.browserSave, intl(NOW));
  // A store that throws on read counts as no saved work.
  const throwing = memoryStore();
  throwing.getItem = () => {
    throw new Error('blocked');
  };
  assert.equal(Meta.homeCard({ ...base, store: throwing }).saved, false);
});

test('replaceDialogTexts formats the current-work block of the replace dialog', () => {
  const store = memoryStore();
  Meta.persist(store, project, NOW);
  assert.deepEqual(Meta.replaceDialogTexts(t, locale, Meta.activeSummary(store, project, false)), {
    currentName: 'Nimetön pohdinta',
    currentInfo: 'Argumentointi · Solmuja: 1',
    editedAt: intl(NOW),
    autosavedAt: intl(NOW),
  });
  assert.deepEqual(Meta.replaceDialogTexts(t, locale, Meta.activeSummary(store, project, true)), {
    currentName: 'Nimetön pohdinta',
    currentInfo: 'Argumentointi · Solmuja: 1',
    editedAt: intl(NOW),
    autosavedAt: 'Vain tässä istunnossa (ei pysyvää tallennusta)',
  });
  assert.deepEqual(Meta.replaceDialogTexts(t, locale, Meta.activeSummary(store, { title: ' ' }, false)), {
    currentName: 'Tarkka aika ei tiedossa',
    currentInfo: '',
    editedAt: 'Tarkka aika ei tiedossa',
    autosavedAt: 'Tarkka aika ei tiedossa',
  });
});
