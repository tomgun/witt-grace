/**
 * must: while a collaboration is open the store keeps no undo history (and drops what it had), undo and redo do
 *       nothing, a host's local edit is broadcast, a participant's edit is only proposed, a participant cannot open
 *       another document, the host replacing the same document sends it to everyone, and a participant acts as their
 *       own seat (WG-030)
 *       a session shares every diagram of the host's project (WG-063): the joiner gets them all and is a person
 *       of each under one id, a change goes to the diagram it was made in whichever tab each person has open, a
 *       proposal for a diagram that is not shared is refused, looking at tabs is free; the host adds, removes
 *       and moves diagrams and everyone follows, the session's first diagram cannot be removed, a participant
 *       changes the structure only by asking the host for a new empty diagram (a reader is refused), a diagram
 *       the host leaves out is never sent and one that was shared leaves the participants, and the joiner's own
 *       project is put aside whole in the browser and comes back after the session
 * test: tests/unit/store-collab.test.ts (the real store over the loopback network)
 * red-against: a change applied to the tab that happens to be shown and not to the diagram it was made in,
 *              the joiner's own project replaced with nothing kept, a joiner who is a different person in each
 *              diagram, a participant writing into a diagram the host did not share, undo after leaving rewinding other people's edits; the participant's dispatch applying locally;
 *              store.load bypassing the session; the assessor switcher letting a participant act as the host
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createBlankProject, parseInvite } from '../../src/domain/index.ts';
import { memoryStore } from '../../src/lib/storage.ts';
import { LoopbackHub } from '../../src/lib/p2p/network.ts';
import { joinSession, startHost } from '../../src/lib/p2p/session.ts';
import type { CollabClock } from '../../src/lib/p2p/session.ts';
import { createStore } from '../../src/app/store.ts';

const clock = (prefix: string): CollabClock => {
  let n = 0;
  return {
    nowIso: () => '2026-11-11T10:00:00.000Z',
    nowMs: () => 0,
    newId: () => `${prefix}-${++n}`,
    schedule: () => () => undefined,
  };
};
async function settle(hub: LoopbackHub) {
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 0));
    if (hub.flush() === 0 && hub.queue.length === 0) {
      await new Promise((r) => setTimeout(r, 0));
      if (hub.queue.length === 0) return;
    }
  }
}
/**
 * Deliver until `done` holds. The host's signature and its check run on WebCrypto's thread pool, so a loaded test
 * process needs an unknown number of turns; bounded by the turn count, never by the clock.
 */
async function until(hub: LoopbackHub, done: () => boolean) {
  for (let i = 0; i < 5000 && !done(); i++) {
    hub.flush();
    await new Promise((r) => setTimeout(r, i < 50 ? 0 : 2));
  }
  await settle(hub);
}
const relay = { strategy: 'relay' as const, urls: ['ws://127.0.0.1:8787'] };

test('the host keeps no undo history in a session and broadcasts its edits; the participant only proposes', async () => {
  const hub = new LoopbackHub();
  const host = createStore({ store: memoryStore(), persistent: false, windowWidth: 1440 });
  host.load(
    createBlankProject({
      projectId: 'p-1',
      rootId: 'n-root',
      userId: 'u-host',
      now: '2026-11-11T09:00:00.000Z',
      userName: 'Isäntä',
    })
  );
  host.dispatch({ type: 'project.setTitle', title: 'Ennen' });
  assert.equal(host.get().canUndo, true);

  const hostSession = await startHost({
    port: host.collabPort(),
    connect: async () => hub.join('H'),
    signal: relay,
    hostUserId: 'u-host',
    clock: clock('h'),
  });
  host.attachCollab({ role: 'host', session: hostSession });
  assert.equal(host.get().canUndo, false, 'the history from before the session is dropped');

  const guest = createStore({ store: memoryStore(), persistent: false, windowWidth: 1440 });
  const parsed = parseInvite(hostSession.status().link as string);
  assert.ok(parsed.ok);
  const guestSession = await joinSession({
    port: guest.collabPort(),
    connect: async () => hub.join('G'),
    invite: parsed.invite,
    name: 'Aino',
    clock: clock('g'),
  });
  guest.attachCollab({ role: 'participant', session: guestSession });
  await until(hub, () => guestSession.status().phase === 'confirm');
  guestSession.accept();
  await settle(hub);
  assert.equal(guest.get().project.id, 'p-1');
  const aino = guest.get().project.users.find((u) => u.name === 'Aino');
  assert.ok(aino);
  assert.equal(guest.get().actorId, aino.id, 'the participant acts as their seat');
  guest.setActor('u-host');
  assert.equal(guest.get().actorId, aino.id, 'and cannot switch to the host');

  host.dispatch({ type: 'node.add', id: 'n-h', parentId: 'n-root', relation: 'support' });
  assert.equal(host.get().canUndo, false);
  host.undo();
  assert.equal(host.get().project.nodes.length, 2, 'undo does nothing in a session');

  assert.equal(guest.dispatch({ type: 'node.add', id: 'n-g', parentId: 'n-root', relation: 'oppose' }), true);
  assert.equal(
    guest.get().project.nodes.some((n) => n.id === 'n-g'),
    false,
    'proposed, not applied'
  );
  let selected = '';
  guest.afterNode('n-g', () => (selected = 'n-g'));
  await settle(hub);
  assert.equal(selected, 'n-g');
  assert.equal(JSON.stringify(guest.get().project), JSON.stringify(host.get().project));
  assert.equal(guest.get().collab?.pending, 0);

  // A participant cannot open another document; the host's whole-document change of the same one reaches them.
  guest.load(
    createBlankProject({ projectId: 'p-other', rootId: 'r', userId: 'u', now: '2026-11-11T09:00:00.000Z' })
  );
  assert.equal(guest.get().project.id, 'p-1');
  assert.equal(guest.get().notice?.text, 'Poistu ensin yhteistyöstä; sitten voit avata toisen asiakirjan.');
  host.load({ ...host.get().project, title: 'Yhdistetty' });
  await settle(hub);
  assert.equal(guest.get().project.title, 'Yhdistetty');

  // The host opening another document ends the session; the participant keeps the copy; history stays empty.
  host.load(
    createBlankProject({ projectId: 'p-2', rootId: 'r2', userId: 'u-host', now: '2026-11-11T09:00:00.000Z' })
  );
  await settle(hub);
  assert.equal(guest.get().collab?.phase, 'ended');
  assert.equal(guest.get().collab?.ended, 'ended');
  assert.equal(guest.get().project.title, 'Yhdistetty');
  assert.equal(guest.get().canUndo, false);
  guest.dispatch({ type: 'project.setTitle', title: 'Omani' });
  assert.equal(guest.get().project.title, 'Omani', 'after the session the copy is ordinary work');
  assert.equal(guest.get().canUndo, true);
});

const blank = (id: string, title: string, userId = 'u-host', userName = 'Isäntä') => ({
  ...createBlankProject({
    projectId: id,
    rootId: `${id}-root`,
    userId,
    now: '2026-11-11T09:00:00.000Z',
    userName,
  }),
  title,
});
/** A host with a project of two diagrams (the second one shown), and a guest with work of their own. */
async function projectSession() {
  const hub = new LoopbackHub();
  const host = createStore({ store: memoryStore(), persistent: false, windowWidth: 1440 });
  host.load(blank('p-1', 'Päätös'));
  host.attachTabs([blank('p-2', 'Riskit')]);
  host.selectTab(0);
  const hostSession = await startHost({
    port: host.collabPort(),
    connect: async () => hub.join('H'),
    signal: relay,
    hostUserId: 'u-host',
    clock: clock('h'),
  });
  host.attachCollab({ role: 'host', session: hostSession });
  const kv = memoryStore();
  const guest = createStore({ store: kv, persistent: true, windowWidth: 1440 });
  guest.load(blank('g-1', 'Oma työ', 'u-own', 'Minä'));
  guest.attachTabs([blank('g-2', 'Oma toinen', 'u-own', 'Minä')]);
  const parsed = parseInvite(hostSession.status().link as string);
  assert.ok(parsed.ok);
  const guestSession = await joinSession({
    port: guest.collabPort(),
    connect: async () => hub.join('G'),
    invite: parsed.invite,
    name: 'Aino',
    clock: clock('g'),
  });
  guest.attachCollab({ role: 'participant', session: guestSession });
  await until(hub, () => guestSession.status().phase === 'confirm');
  guestSession.accept();
  await settle(hub);
  const titles = (store: typeof host) => store.get().workbook.documents.map((d) => d.title);
  return { hub, host, guest, hostSession, guestSession, kv, titles };
}

test('a session shares every diagram of the project; the joiner is a person of each, under one id', async () => {
  const { host, guest, titles } = await projectSession();
  assert.deepEqual(titles(guest), ['Päätös', 'Riskit']);
  assert.equal(guest.get().project.id, 'p-1');
  const ids = guest.get().workbook.documents.map((d) => d.users.find((u) => u.name === 'Aino')?.id);
  assert.ok(ids[0]);
  assert.equal(ids[0], ids[1]);
  assert.equal(JSON.stringify(guest.get().workbook.documents), JSON.stringify(host.get().workbook.documents));
});

test('a change goes to the diagram it was made in, whichever tab each person has open', async () => {
  const { hub, host, guest, titles } = await projectSession();
  // The guest looks at the second diagram and adds a reason there; the host stays on the first.
  assert.equal(guest.selectTab(1), true);
  assert.equal(
    guest.dispatch({ type: 'node.add', id: 'n-g', parentId: 'p-2-root', relation: 'oppose' }),
    true
  );
  await settle(hub);
  const nodes = (store: typeof host) => store.get().workbook.documents.map((d) => d.nodes.length);
  assert.deepEqual(nodes(host), [1, 2]);
  assert.deepEqual(nodes(guest), [1, 2]);
  assert.equal(host.get().activeTab, 0, 'the host’s shown tab does not move');
  // The host edits the second diagram without the guest being there.
  guest.selectTab(0);
  host.selectTab(1);
  host.dispatch({ type: 'project.setTitle', title: 'Riskit 2' });
  await settle(hub);
  assert.deepEqual(titles(guest), ['Päätös', 'Riskit 2']);
  assert.equal(guest.get().activeTab, 0);
  assert.equal(JSON.stringify(guest.get().workbook.documents), JSON.stringify(host.get().workbook.documents));
  assert.equal(guest.get().collab?.pending, 0);
});

test('a proposal for a diagram the session does not share is refused', async () => {
  const { hub, host, guest, guestSession } = await projectSession();
  guestSession.propose({ type: 'project.setTitle', title: 'Kaapattu' }, 'no-such-diagram');
  await settle(hub);
  assert.equal(guest.get().collab?.pending, 0);
  assert.match(guest.get().notice?.text ?? '', /./);
  assert.equal(
    host.get().workbook.documents.some((d) => d.title === 'Kaapattu'),
    false
  );
});

test('the joiner’s own project is put aside whole and comes back after the session', async () => {
  const { hub, guest, hostSession, kv, titles } = await projectSession();
  assert.equal(guest.get().aside, true);
  assert.deepEqual(titles(guest), ['Päätös', 'Riskit']);
  // Kept in the browser: a reload in the middle of the session still knows of it.
  assert.equal(createStore({ store: kv, persistent: true, windowWidth: 1440 }).get().aside, true);
  // During the session it cannot be brought back over the shared project.
  assert.equal(guest.restoreOwnProject(), false);
  await hostSession.close();
  await settle(hub);
  assert.equal(guest.get().collab?.phase, 'ended');
  assert.equal(guest.get().notice?.ownProject, true);
  // What is open is the guest's copy of the session's project, to save if wanted.
  assert.deepEqual(titles(guest), ['Päätös', 'Riskit']);
  assert.equal(guest.restoreOwnProject(), true);
  assert.deepEqual(titles(guest), ['Oma työ', 'Oma toinen']);
  assert.equal(guest.get().activeTab, 1);
  assert.equal(guest.get().aside, false);
  // The copy of the session's project is one undo away.
  guest.undo();
  assert.deepEqual(titles(guest), ['Päätös', 'Riskit']);
});

test('tabs in a session: looking is free; the host changes the structure and everyone follows', async () => {
  const { hub, host, guest, titles } = await projectSession();
  assert.equal(guest.selectTab(1), true);
  // The host attaches a third diagram: the guest gets it, and is a person of it under the same id.
  assert.equal(host.attachTabs([blank('p-3', 'Kolmas')]), 1);
  await settle(hub);
  assert.deepEqual(titles(guest), ['Päätös', 'Riskit', 'Kolmas']);
  assert.equal(guest.get().activeTab, 1, 'the guest’s shown tab does not move');
  const aino = guest.get().workbook.documents[0]?.users.find((u) => u.name === 'Aino')?.id;
  assert.ok(aino);
  assert.equal(
    guest.get().workbook.documents[2]?.users.some((u) => u.id === aino),
    true
  );
  assert.equal(JSON.stringify(guest.get().workbook.documents), JSON.stringify(host.get().workbook.documents));
  // Moved by the host, the guest's tabs take the same order and the shown diagram stays shown.
  assert.equal(host.moveTab(2, 1), true);
  await settle(hub);
  assert.deepEqual(titles(guest), ['Päätös', 'Kolmas', 'Riskit']);
  assert.equal(guest.get().project.id, 'p-2');
  // Removed by the host, it leaves the guest's project; the session's first diagram cannot be removed.
  assert.equal(host.removeTab(1), true);
  await settle(hub);
  assert.deepEqual(titles(guest), ['Päätös', 'Riskit']);
  assert.equal(host.removeTab(0), false);
  assert.match(host.get().notice?.text ?? '', /Tästä kaaviosta yhteistyö alkoi/);
  // A participant does not change the structure by themselves.
  assert.equal(guest.attachTabs([blank('g-9', 'Oma')]), 0);
  assert.equal(guest.removeTab(1), false);
  assert.equal(guest.moveTab(0, 1), false);
  assert.deepEqual(titles(guest), ['Päätös', 'Riskit']);
});

test('a participant asks for a new diagram and the host makes it for everyone; a reader is refused', async () => {
  const { hub, host, guest, titles } = await projectSession();
  assert.equal(guest.askForDiagram('decision'), true);
  await settle(hub);
  assert.deepEqual(titles(host).length, 3);
  assert.equal(host.get().workbook.documents[2]?.mode, 'decision');
  assert.equal(JSON.stringify(guest.get().workbook.documents), JSON.stringify(host.get().workbook.documents));
  // The one who asked is shown the new diagram; the host stays where they were.
  assert.equal(guest.get().activeTab, 2);
  assert.equal(host.get().activeTab, 0);
  // The new diagram carries the session's people, the guest among them.
  const aino = guest.get().workbook.documents[0]?.users.find((u) => u.name === 'Aino')?.id;
  assert.equal(
    guest.get().project.users.some((u) => u.id === aino),
    true
  );
  // Made a reader by the host, the same person is refused.
  const index = host.get().workbook.documents[0]?.users.findIndex((u) => u.id === aino) as number;
  assert.ok(index > 0);
  const first = host.get().workbook.documents[0]!;
  host.load({
    ...first,
    users: first.users.map((u) => (u.id === aino ? { ...u, role: 'viewer' as const } : u)),
  });
  await settle(hub);
  assert.equal(guest.askForDiagram('argument'), true);
  await settle(hub);
  assert.equal(titles(host).length, 3);
  assert.match(guest.get().notice?.text ?? '', /./);
});

test('a diagram the host leaves out is never sent, and one that was shared leaves the participants', async () => {
  const hub = new LoopbackHub();
  const host = createStore({ store: memoryStore(), persistent: false, windowWidth: 1440 });
  host.load(blank('p-1', 'Päätös'));
  host.attachTabs([blank('p-2', 'Riskit'), blank('p-3', 'Oma muistio')]);
  host.selectTab(0);
  assert.equal(host.setDiagramShared('p-3', false), true);
  const hostSession = await startHost({
    port: host.collabPort(),
    connect: async () => hub.join('H'),
    signal: relay,
    hostUserId: 'u-host',
    clock: clock('h'),
  });
  host.attachCollab({ role: 'host', session: hostSession });
  assert.deepEqual(host.get().unsharedIds, ['p-3'], 'the choice made before the start holds');
  const guest = createStore({ store: memoryStore(), persistent: false, windowWidth: 1440 });
  const parsed = parseInvite(hostSession.status().link as string);
  assert.ok(parsed.ok);
  const guestSession = await joinSession({
    port: guest.collabPort(),
    connect: async () => hub.join('G'),
    invite: parsed.invite,
    name: 'Aino',
    clock: clock('g'),
  });
  guest.attachCollab({ role: 'participant', session: guestSession });
  await until(hub, () => guestSession.status().phase === 'confirm');
  guestSession.accept();
  await settle(hub);
  const titles = (store: typeof host) => store.get().workbook.documents.map((d) => d.title);
  assert.deepEqual(titles(guest), ['Päätös', 'Riskit']);
  // The joiner is not added to the diagram that is left out, and cannot write into it.
  assert.equal(
    host.get().workbook.documents[2]?.users.some((u) => u.name === 'Aino'),
    false
  );
  guestSession.propose({ type: 'project.setTitle', title: 'Kaapattu' }, 'p-3');
  await settle(hub);
  assert.deepEqual(titles(host), ['Päätös', 'Riskit', 'Oma muistio']);
  // Shared during the session, it arrives; left out again, it leaves. The first diagram is always shared.
  assert.equal(host.setDiagramShared('p-3', true), true);
  await settle(hub);
  assert.deepEqual(titles(guest), ['Päätös', 'Riskit', 'Oma muistio']);
  assert.equal(host.setDiagramShared('p-2', false), true);
  await settle(hub);
  assert.deepEqual(titles(guest), ['Päätös', 'Oma muistio']);
  assert.equal(host.setDiagramShared('p-1', false), false);
  // The choice lasts one session.
  await hostSession.close();
  await settle(hub);
  assert.deepEqual(host.get().unsharedIds, []);
});
