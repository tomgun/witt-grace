// The home screen's backdrop, the himmeli (owner 2026-11-23: “hillitty, mutta sellainen joka tuo hiukan elävyyttä…
// voisiko se koostua jotenkin argumentaatiopuusta”; “hiirellä/kosketuksella voisi tarrata noodeihin ja heiluttaa
// himmeliä… ikään kuin fysiikkamallinnettuna… ettei koko rakennelma liiku vaan dynaamisesti noodin viereisistä”):
// an argument tree as a wire mesh that hangs from its main claim at the right edge and turns slowly behind the
// page. A point of it can be taken hold of with the mouse or a finger wherever no control of the page is in the
// way: it follows the hand and pulls its neighbours with it (homeMesh.ts). The canvas itself never takes input.
// Still, and not to be held, when the person asks for less motion and on a phone-width window; paused while the
// page is hidden. The colours are the theme's own.
import { useEffect, useRef } from 'react';
import { bodyAtRest, bodyStep, buildMesh, nearestPoint, project, unproject } from './homeMesh.ts';
import type { Hold, MeshStance, Projected } from './homeMesh.ts';

/** One full turn takes about three minutes. */
const TURN_PER_MS = (Math.PI * 2) / 180_000;
const FRAME_MS = 1000 / 30;
const START_ANGLE = 0.6;
/** How near a point the pointer has to be to take hold of it, in pixels. */
const GRAB_REACH = 22;
/** What of the page is never grabbed through: its controls and the example card. */
const IN_THE_WAY = 'button, a, input, select, textarea, summary, label, dialog, .home-visual';

export function HomeBackdrop({ appearance }: { appearance: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    const page = canvas?.parentElement;
    if (!canvas || !ctx || !page) return;
    const mesh = buildMesh();
    let body = bodyAtRest(mesh);
    const tokens = getComputedStyle(document.body);
    const token = (name: string, fallback: string) => tokens.getPropertyValue(name).trim() || fallback;
    const colour: Record<MeshStance, string> = {
      root: token('--accent', '#6b5cff'),
      support: token('--green', '#2f9c58'),
      oppose: token('--red', '#c2495a'),
    };
    let width = 0;
    let height = 0;
    /** Where the model sits on the screen: hung from near the top, most of it at the right edge. */
    let frameBox = { cx: 0, cy: 0, unit: 1 };
    let points: Projected[] = [];
    let angle = START_ANGLE;
    let hold: (Hold & { depth: number }) | null = null;
    let hovering = false;
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth || window.innerWidth;
      height = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const wide = width >= 900;
      const unit = Math.min(width, height) * (wide ? 0.74 : 0.62);
      // The main claim is 0.78 above the model's centre: it hangs a little below the top edge.
      frameBox = { cx: width * (wide ? 0.9 : 0.5), cy: height * 0.07 + 0.74 * unit, unit };
    };
    const place = () => {
      points = mesh.nodes.map((_, i) =>
        project(
          { x: body.now[i * 3]!, y: body.now[i * 3 + 1]!, z: body.now[i * 3 + 2]! },
          angle,
          frameBox.cx,
          frameBox.cy,
          frameBox.unit
        )
      );
    };
    const draw = () => {
      place();
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = 'round';
      const line = (a: number, b: number, stroke: string, alpha: number, thickness: number) => {
        const from = points[a]!;
        const to = points[b]!;
        ctx.globalAlpha = alpha * (0.35 + 0.65 * Math.min(from.near, to.near));
        ctx.strokeStyle = stroke;
        ctx.lineWidth = thickness;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      };
      mesh.nodes.forEach((node, i) => {
        if (node.parent >= 0) line(i, node.parent, colour[node.stance], 0.26, 1.2);
      });
      mesh.nodes.forEach((node, i) => {
        const p = points[i]!;
        const held = hold?.index === i;
        ctx.globalAlpha = held ? 0.9 : 0.22 + 0.36 * p.near;
        ctx.fillStyle = colour[node.stance];
        ctx.beginPath();
        ctx.arc(
          p.x,
          p.y,
          (node.depth === 0 ? 5.5 : 4.4 - node.depth * 0.7) * p.scale * (held ? 1.5 : 1),
          0,
          Math.PI * 2
        );
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    };
    const calm = () =>
      window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.innerWidth < 700;
    let frame = 0;
    let last = 0;
    let moving = false;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (document.hidden || now - last < FRAME_MS) return;
      const elapsed = Math.min(now - last, 100);
      // Held, the tree does not turn under the hand.
      if (!hold) angle += elapsed * TURN_PER_MS;
      body = bodyStep(mesh, body, elapsed, hold);
      last = now;
      draw();
    };
    const start = () => {
      cancelAnimationFrame(frame);
      resize();
      moving = !calm();
      if (!moving) {
        hold = null;
        body = bodyAtRest(mesh);
        page.style.cursor = '';
      }
      draw();
      canvas.dataset.animated = String(moving);
      if (moving) frame = requestAnimationFrame(tick);
    };

    // Taking hold of a point. The canvas takes no input, so the page's own events are read: a press near a point
    // where nothing of the page is in the way holds it, and it follows the pointer until it is let go.
    const free = (target: EventTarget | null): boolean =>
      target instanceof Element && page.contains(target) && !target.closest(IN_THE_WAY);
    const at = (e: { clientX: number; clientY: number }): number =>
      nearestPoint(points, e.clientX, e.clientY, GRAB_REACH);
    const follow = (e: { clientX: number; clientY: number }) => {
      if (!hold) return;
      const to = unproject(e.clientX, e.clientY, hold.depth, angle, frameBox.cx, frameBox.cy, frameBox.unit);
      hold = { ...hold, ...to };
    };
    const onDown = (e: PointerEvent) => {
      if (!moving || e.button !== 0 || !free(e.target)) return;
      const index = at(e);
      // The main claim is what the tree hangs from: it is not taken.
      if (index <= 0) return;
      e.preventDefault();
      hold = { index, depth: points[index]!.z, x: 0, y: 0, z: 0 };
      follow(e);
      canvas.dataset.held = String(index);
      page.style.cursor = 'grabbing';
    };
    const onMove = (e: PointerEvent) => {
      if (hold) {
        follow(e);
        return;
      }
      if (!moving) return;
      const near = free(e.target) && at(e) > 0;
      if (near !== hovering) {
        hovering = near;
        page.style.cursor = near ? 'grab' : '';
      }
    };
    const onUp = () => {
      if (!hold) return;
      hold = null;
      delete canvas.dataset.held;
      page.style.cursor = '';
      hovering = false;
    };
    // A finger that holds a point must not scroll the page meanwhile.
    const onTouchMove = (e: TouchEvent) => {
      if (hold) e.preventDefault();
    };

    start();
    // The canvas takes its size from the page: draw again whenever that size changes (the first layout too).
    const sized = new ResizeObserver(start);
    sized.observe(canvas);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    motion.addEventListener('change', start);
    window.addEventListener('resize', start);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      sized.disconnect();
      motion.removeEventListener('change', start);
      window.removeEventListener('resize', start);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('touchmove', onTouchMove);
      page.style.cursor = '';
    };
    // The colours are read from the theme: draw again when it changes.
  }, [appearance]);
  return <canvas ref={ref} id="homeBackdrop" className="home-backdrop" aria-hidden="true" />;
}
