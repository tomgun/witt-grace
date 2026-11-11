/**
 * must: while a collaboration is open the store keeps no undo history (and drops what it had), undo and redo do
 *       nothing, a host's local edit is broadcast, a participant's edit is only proposed, a participant cannot open
 *       another document, the host replacing the same document sends it to everyone, and a participant acts as their
 *       own seat (WG-030)
 * test: tests/unit/store-collab.test.ts (the real store over the loopback network)
 * red-against: undo after leaving rewinding other people's edits; the participant's dispatch applying locally;
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
