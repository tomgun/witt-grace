/**
 * must: a session draws on the project's sketchpads (owner 2026-11-21, 2026-11-23 “lehtiö on osa projektia… ei
 *       sessio tarvitse omaa”, WG-056, WG-063 part 4): a person who joins gets the host's sketchpads as they are
 *       once they have agreed to join, and nothing of them before; a stroke drawn by anyone reaches everyone, on
 *       the sketchpad it was drawn on and no other; strokes drawn at the same moment by different people all stay;
 *       when two change the same element, everyone ends with the same one; a lost change is healed by sending the
 *       sketchpads whole; a change too large to send, or one the host cannot apply, puts the sender's sketchpad
 *       back to the host's; a file the host opens replaces everyone's; a sketchpad the host adds, names or removes
 *       is added, named and removed for everyone; a participant asks the host for a new one and everyone gets it;
 *       a reader neither draws nor adds; a peer's malformed change is ignored
 * test: tests/unit/session-sketch.test.ts
 * red-against: the whole sketch sent on every change (the other person's stroke lost), a participant's echo skipped
 *              (two people left with different texts), the sketchpads sent with the welcome before the person
 *              agreed, a participant's change relayed without the host applying it (a newcomer gets an old sheet),
 *              a stroke applied to the first sketchpad whatever it was drawn on, a removed sketchpad left on the
 *              participants' screens, a reader's stroke taken
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommand, createBlankProject, diffSketch, parseInvite } from '../../src/domain/index.ts';
import type { Command, CommandContext, Project, ProjectSketch, Sketch } from '../../src/domain/index.ts';
import { SKETCH_LIMITS, addElement, blankSketch, setText } from '../../src/domain/sketch.ts';
import type { SketchElement } from '../../src/domain/sketch.ts';
import { LoopbackHub } from '../../src/lib/p2p/network.ts';
import { joinSession, startHost } from '../../src/lib/p2p/session.ts';
import type { CollabClock, DocumentPort, SketchPort } from '../../src/lib/p2p/session.ts';

class Doc implements DocumentPort {
  project: Project;
  constructor(id: string) {
    this.project = createBlankProject({
      projectId: id,
      rootId: `${id}-root`,
      userId: `${id}-user`,
      now: '2026-11-21T09:00:00.000Z',
      userName: 'Isäntä',
    });
  }
  current = () => this.project;
  documents = () => [this.project];
  document = (id: string) => (id === this.project.id ? this.project : null);
  add = () => false;
  drop = () => undefined;
  reorder = () => undefined;
  apply = (command: Command, ctx: CommandContext) =>
    (this.project = applyCommand(this.project, command, ctx));
  adopt = (project: Project) => void (this.project = project);
}
/** A person's project sketchpads, and how they change one: locally first, then told to the session. `sketch` is
 * the first sketchpad, the one most cases draw on. */
class Pad implements SketchPort {
  list: ProjectSketch[];
  constructor(entries: ProjectSketch[]) {
    this.list = entries;
  }
  pads = () => this.list;
  of = (id: string) => this.list.find((p) => p.id === id)?.sketch as Sketch;
  get sketch() {
    return (this.list[0] as ProjectSketch).sketch;
  }
  set sketch(sketch: Sketch) {
    this.draw((this.list[0] as ProjectSketch).id, sketch);
  }
  draw = (id: string, sketch: Sketch) =>
    void (this.list = this.list.map((p) => (p.id === id ? { ...p, sketch } : p)));
  put = (pad: ProjectSketch) => {
    if (this.list.length >= 3 && !this.list.some((p) => p.id === pad.id)) return false;
    this.list = this.list.some((p) => p.id === pad.id)
      ? this.list.map((p) => (p.id === pad.id ? pad : p))
      : [...this.list, pad];
    return true;
  };
  keep = (order: readonly string[]) =>
    void (this.list = order.flatMap((id) => this.list.filter((p) => p.id === id)));
  change(
    session: { sketched(pad: string, ops: ReturnType<typeof diffSketch>): boolean },
    to: (s: Sketch) => Sketch,
    id = (this.list[0] as ProjectSketch).id
  ) {
    const before = this.of(id);
    const next = to(before);
    this.draw(id, next);
    return session.sketched(id, diffSketch(before, next));
  }
}
function makeClock(prefix: string): CollabClock {
  let n = 0;
  return {
    nowIso: () => '2026-11-21T10:00:00.000Z',
    // A second apart: the rate bucket is never the reason here unless a test fills it at once.
    nowMs: () => n * 1000,
    newId: () => `${prefix}-${++n}`,
    schedule: () => () => undefined,
  };
}
async function settle(hub: LoopbackHub) {
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 0));
    if (hub.flush() === 0) {
      await new Promise((r) => setTimeout(r, 0));
      if (hub.queue.length === 0) return;
    }
  }
}
async function until(hub: LoopbackHub, done: () => boolean) {
  for (let i = 0; i < 5000 && !done(); i++) {
    hub.flush();
    await new Promise((r) => setTimeout(r, i < 50 ? 0 : 2));
  }
  await settle(hub);
}
async function setup() {
  const hub = new LoopbackHub();
  const pad = new Pad([{ id: 'pad-1', name: 'Lehtiö 1', sketch: blankSketch('shared') }]);
  const doc = new Doc('p-1');
  const session = await startHost({
    port: doc,
    sketch: pad,
    connect: async () => hub.join('H'),
    signal: { strategy: 'relay', urls: ['ws://127.0.0.1:8787'] },
    hostUserId: 'p-1-user',
    clock: makeClock('h'),
    passwordRounds: 1000,
  });
  const parsed = parseInvite(session.status().link as string);
  assert.ok(parsed.ok);
  return { hub, doc, pad, session, invite: parsed.invite };
}
async function join(
  hub: LoopbackHub,
  invite: Parameters<typeof joinSession>[0]['invite'],
  peerId: string,
  name: string,
  accept = true
) {
  // A joiner's project starts without sketchpads: their own project was put aside.
  const pad = new Pad([]);
  const session = await joinSession({
    port: new Doc(`own-${peerId}`),
    sketch: pad,
    connect: async () => hub.join(peerId),
    invite,
    name,
    clock: makeClock(peerId.toLowerCase()),
    passwordRounds: 1000,
  });
  await until(hub, () => session.status().phase !== 'connecting');
  if (accept) {
    session.accept();
    await settle(hub);
  }
  return { pad, session };
}
const pen = (id: string, x: number, color = 0): SketchElement => ({
  id,
  color,
  size: 4,
  type: 'pen',
  points: [x, 10, x + 5, 20],
});
const node = (id: string, text: string): SketchElement => ({
  id,
  color: 0,
  size: 4,
  type: 'node',
  x: 100,
  y: 100,
  text,
});
const ids = (pad: Pad) => pad.sketch.frames[0]!.elements.map((e) => e.id);

test('a newcomer gets the sketchpad after agreeing; strokes drawn at once by three people all stay', async () => {
  const { hub, pad: host, session, invite } = await setup();
  host.change(session, (s) => addElement(s, 0, pen('h1', 100)));
  const a = await join(hub, invite, 'A', 'Aino', false);
  assert.equal(a.session.status().phase, 'confirm');
  assert.deepEqual(a.pad.list, [], 'nothing of the sketchpads before the person agrees');
  a.session.accept();
  await settle(hub);
  assert.deepEqual(a.pad.list, host.list);
  const b = await join(hub, invite, 'B', 'Ben');
  assert.deepEqual(b.pad.sketch, host.sketch);

  // All three draw before any message has moved.
  host.change(session, (s) => addElement(s, 0, pen('h2', 200)));
  a.pad.change(a.session, (s) => addElement(s, 0, pen('a1', 300, 1)));
  b.pad.change(b.session, (s) => addElement(s, 0, pen('b1', 400, 2)));
  assert.deepEqual(ids(a.pad), ['h1', 'a1'], 'one’s own stroke is on one’s own sheet at once');
  await settle(hub);
  assert.deepEqual(ids(host), ['h1', 'h2', 'a1', 'b1']);
  assert.deepEqual([...ids(a.pad)].sort(), ['a1', 'b1', 'h1', 'h2']);
  assert.deepEqual([...ids(b.pad)].sort(), ['a1', 'b1', 'h1', 'h2']);

  // A third person joining now gets what the participants drew, from the host.
  const c = await join(hub, invite, 'C', 'Cia');
  assert.deepEqual(c.pad.sketch, host.sketch);
});

test('two people change the same node: everyone ends with the one that is later in the host’s order', async () => {
  const { hub, pad: host, session, invite } = await setup();
  host.change(session, (s) => addElement(s, 0, node('n', 'Aihe')));
  const a = await join(hub, invite, 'A', 'Aino');
  const b = await join(hub, invite, 'B', 'Ben');
  a.pad.change(a.session, (s) => setText(s, 0, 'n', 'Ainon'));
  b.pad.change(b.session, (s) => setText(s, 0, 'n', 'Benin'));
  await settle(hub);
  const text = (pad: Pad) => (pad.sketch.frames[0]!.elements[0] as { text: string }).text;
  assert.equal(text(host), 'Benin');
  assert.equal(text(a.pad), 'Benin');
  assert.equal(text(b.pad), 'Benin');
});

test('a lost change, a change too large and a change the host cannot apply are healed with the whole sketchpad', async () => {
  const { hub, pad: host, session, invite } = await setup();
  const a = await join(hub, invite, 'A', 'Aino');
  host.change(session, (s) => addElement(s, 0, pen('h1', 100)));
  hub.queue = []; // lost on the way
  host.change(session, (s) => addElement(s, 0, pen('h2', 200)));
  await settle(hub);
  assert.deepEqual(a.pad.sketch, host.sketch);

  // One stroke larger than a message a participant may send (a drawn stroke always fits; this one comes from a file
  // with far-away coordinates): refused here, and the sheet goes back to the host's.
  const huge: SketchElement = {
    id: 'huge',
    color: 0,
    size: 4,
    type: 'pen',
    points: Array.from({ length: SKETCH_LIMITS.points * 2 }, (_, i) => -99000.5 - (i % 200)),
  };
  assert.equal(
    a.pad.change(a.session, (s) => addElement(s, 0, huge)),
    false
  );
  await settle(hub);
  assert.deepEqual(a.pad.sketch, host.sketch);
  assert.deepEqual(ids(host), ['h1', 'h2']);

  // A change to a frame the host no longer has: nothing stands at the host, and the sender is put right.
  a.pad.sketch = { ...a.pad.sketch, frames: [...a.pad.sketch.frames, { id: 'ghost', elements: [] }] };
  a.pad.change(a.session, (s) => addElement(s, 1, pen('x', 1)));
  await settle(hub);
  assert.deepEqual(a.pad.sketch, host.sketch);
});

test('a file the host opens replaces everyone’s sketchpad; a malformed change from a peer is ignored', async () => {
  const { hub, pad: host, session, invite } = await setup();
  const a = await join(hub, invite, 'A', 'Aino');
  host.sketch = addElement(blankSketch('opened'), 0, pen('file', 50));
  session.sketchpadsChanged(['pad-1']);
  await settle(hub);
  assert.deepEqual(a.pad.sketch, host.sketch);
  a.pad.change(a.session, (s) => addElement(s, 0, pen('a1', 300)));
  await settle(hub);
  assert.deepEqual(ids(host), ['file', 'a1']);

  const before = host.sketch;
  const raw = hub.join('X');
  for (const message of [
    { t: 'sketch', pad: 'pad-1', ops: [{ op: 'drop', frame: 'opened', ids: ['file'] }] }, // not a seat
    {
      t: 'sketch',
      pad: 'pad-1',
      ops: [{ op: 'put', frame: 'opened', elements: [{ ...pen('bad', 1), color: 99 }] }],
    },
    { t: 'sketch', ops: [{ op: 'drop', frame: 'opened', ids: ['file'] }] }, // names no sketchpad
  ])
    raw.sendTo('H', JSON.stringify(message));
  await settle(hub);
  assert.equal(host.sketch, before);
  // The seat's own malformed change is ignored too.
  a.session.sketched('pad-1', [
    { op: 'put', frame: 'opened', elements: [{ ...pen('bad', 1), color: 99 }] },
  ] as never);
  await settle(hub);
  assert.equal(host.sketch, before);
});

test('each stroke lands on the sketchpad it was drawn on; the host adds, names and removes sketchpads for everyone', async () => {
  const { hub, pad: host, session, invite } = await setup();
  host.put({ id: 'pad-2', name: 'Toinen', sketch: blankSketch('f2') });
  const a = await join(hub, invite, 'A', 'Aino');
  assert.deepEqual(
    a.pad.list.map((p) => [p.id, p.name]),
    [
      ['pad-1', 'Lehtiö 1'],
      ['pad-2', 'Toinen'],
    ]
  );
  a.pad.change(a.session, (s) => addElement(s, 0, pen('a2', 10)), 'pad-2');
  host.change(session, (s) => addElement(s, 0, pen('h1', 20)), 'pad-1');
  await settle(hub);
  for (const pad of [host, a.pad]) {
    assert.deepEqual(
      pad.of('pad-1').frames[0]!.elements.map((e) => e.id),
      ['h1']
    );
    assert.deepEqual(
      pad.of('pad-2').frames[0]!.elements.map((e) => e.id),
      ['a2']
    );
  }

  // A new one at the host, a new name for the second, and the first removed.
  host.put({ id: 'pad-3', name: 'Kolmas', sketch: blankSketch('f3') });
  session.sketchpadsChanged(['pad-3']);
  host.put({ id: 'pad-2', name: 'Suunnitelma', sketch: host.of('pad-2') });
  session.sketchpadsChanged(['pad-2']);
  host.keep(['pad-2', 'pad-3']);
  session.sketchpadsChanged([]);
  await settle(hub);
  assert.deepEqual(a.pad.list, host.list);
  assert.deepEqual(
    a.pad.list.map((p) => p.name),
    ['Suunnitelma', 'Kolmas']
  );

  // A stroke for the removed sketchpad, drawn before the news came: nothing stands, and the sender is put right.
  a.pad.put({ id: 'pad-1', name: 'Lehtiö 1', sketch: blankSketch('shared') });
  a.pad.change(a.session, (s) => addElement(s, 0, pen('late', 5)), 'pad-1');
  await settle(hub);
  assert.deepEqual(a.pad.list, host.list);
});

test('a participant asks for a new sketchpad and everyone gets it; a reader neither adds nor draws', async () => {
  const { hub, doc, pad: host, session, invite } = await setup();
  // Ben is a reader of the document, invited by a link of his own.
  doc.apply(
    { type: 'user.add', id: 'ben', name: 'Ben', role: 'viewer' },
    { now: '2026-11-21T09:30:00.000Z', actorId: 'p-1-user' }
  );
  const own = parseInvite(await session.invite({ userId: 'ben' }, { mode: 'personal' }));
  assert.ok(own.ok);
  const a = await join(hub, invite, 'A', 'Aino');
  const b = await join(hub, own.invite, 'B', 'Ben');
  a.session.proposeSketchpad({ pad: 'pad-a', name: 'Ainon luonnos' });
  await settle(hub);
  for (const pad of [host, a.pad, b.pad])
    assert.deepEqual(
      pad.list.map((p) => [p.id, p.name]),
      [
        ['pad-1', 'Lehtiö 1'],
        ['pad-a', 'Ainon luonnos'],
      ]
    );
  assert.deepEqual(host.of('pad-a').frames.length, 1);
  a.pad.change(a.session, (s) => addElement(s, 0, pen('a1', 30)), 'pad-a');
  await settle(hub);
  assert.deepEqual(b.pad.of('pad-a'), host.of('pad-a'));
  assert.equal(host.of('pad-a').frames[0]!.elements.length, 1);

  // An id that is taken is not made again.
  const rejected: string[] = [];
  a.session.onNotice((n) => void (n.kind === 'rejected' && rejected.push(n.reason)));
  a.session.proposeSketchpad({ pad: 'pad-1', name: 'Sama' });
  await settle(hub);
  assert.deepEqual(rejected, ['refused']);
  assert.equal(host.list.length, 2);

  // What the reader draws does not stand, here or with anyone, and he gets no new sketchpad.
  const refusedB: string[] = [];
  b.session.onNotice((n) => void (n.kind === 'rejected' && refusedB.push(n.reason)));
  b.pad.change(b.session, (s) => addElement(s, 0, pen('b2', 40)), 'pad-a');
  b.session.proposeSketchpad({ pad: 'pad-b', name: 'Benin' });
  await settle(hub);
  assert.equal(host.of('pad-a').frames[0]!.elements.length, 1);
  assert.deepEqual(b.pad.of('pad-a'), host.of('pad-a'));
  assert.deepEqual(refusedB, ['forbidden']);
  assert.equal(host.list.length, 2);
});
