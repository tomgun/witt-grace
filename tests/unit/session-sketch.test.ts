/**
 * must: the session's shared sketchpad (owner 2026-11-21, WG-056): a person who joins gets the sketchpad as it is
 *       once they have agreed to join, and nothing of it before; a stroke drawn by anyone reaches everyone; strokes
 *       drawn at the same moment by different people all stay; when two change the same element, everyone ends with
 *       the same one; a lost change is healed by sending the whole sketchpad; a change too large to send, or one the
 *       host cannot apply, puts the sender's sketchpad back to the host's; a file the host opens replaces
 *       everyone's; a peer's malformed change is ignored; the person's own (private) sketchpad never travels
 * test: tests/unit/session-sketch.test.ts
 * red-against: the whole sketch sent on every change (the other person's stroke lost), a participant's echo skipped
 *              (two people left with different texts), the sketchpad sent with the welcome before the person
 *              agreed, a participant's change relayed without the host applying it (a newcomer gets an old sheet)
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommand, createBlankProject, diffSketch, parseInvite } from '../../src/domain/index.ts';
import type { Command, CommandContext, Project, Sketch } from '../../src/domain/index.ts';
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
/** A person's shared sketchpad, and how they change it: locally first, then told to the session. */
class Pad implements SketchPort {
  sketch: Sketch;
  constructor(frameId: string) {
    this.sketch = blankSketch(frameId);
  }
  current = () => this.sketch;
  set = (sketch: Sketch) => void (this.sketch = sketch);
  change(session: { sketched(ops: ReturnType<typeof diffSketch>): boolean }, to: (s: Sketch) => Sketch) {
    const next = to(this.sketch);
    const ops = diffSketch(this.sketch, next);
    this.sketch = next;
    return session.sketched(ops);
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
  const pad = new Pad('shared');
  const session = await startHost({
    port: new Doc('p-1'),
    sketch: pad,
    connect: async () => hub.join('H'),
    signal: { strategy: 'relay', urls: ['ws://127.0.0.1:8787'] },
    hostUserId: 'p-1-user',
    clock: makeClock('h'),
    passwordRounds: 1000,
  });
  const parsed = parseInvite(session.status().link as string);
  assert.ok(parsed.ok);
  return { hub, pad, session, invite: parsed.invite };
}
async function join(
  hub: LoopbackHub,
  invite: Parameters<typeof joinSession>[0]['invite'],
  peerId: string,
  name: string,
  accept = true
) {
  // Before joining, the shared sketchpad in this browser holds whatever an earlier session left there.
  const pad = new Pad(`old-${peerId}`);
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
  assert.deepEqual(a.pad.sketch, blankSketch('old-A'), 'nothing of the sketchpad before the person agrees');
  a.session.accept();
  await settle(hub);
  assert.deepEqual(a.pad.sketch, host.sketch);
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
  session.sketchReplaced();
  await settle(hub);
  assert.deepEqual(a.pad.sketch, host.sketch);
  a.pad.change(a.session, (s) => addElement(s, 0, pen('a1', 300)));
  await settle(hub);
  assert.deepEqual(ids(host), ['file', 'a1']);

  const before = host.sketch;
  const raw = hub.join('X');
  for (const message of [
    { t: 'sketch', ops: [{ op: 'drop', frame: 'opened', ids: ['file'] }] }, // not a seat
    { t: 'sketch', ops: [{ op: 'put', frame: 'opened', elements: [{ ...pen('bad', 1), color: 99 }] }] },
  ])
    raw.sendTo('H', JSON.stringify(message));
  await settle(hub);
  assert.equal(host.sketch, before);
});
