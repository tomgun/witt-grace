// The home screen's backdrop (owner 2026-11-23: “hillitty, mutta sellainen joka tuo hiukan elävyyttä… voisiko se
// koostua jotenkin argumentaatiopuusta”): an argument tree as a wire mesh that turns slowly behind the page. A
// canvas under the content that never takes input. Still when the person asks for less motion, on a phone-width
// window and while the page is hidden; the colours are the theme's own.
import { useEffect, useRef } from 'react';
import { buildMesh, project } from './homeMesh.ts';
import type { MeshStance } from './homeMesh.ts';

/** One full turn takes about three minutes. */
const TURN_PER_MS = (Math.PI * 2) / 180_000;
const FRAME_MS = 1000 / 30;
const START_ANGLE = 0.6;

export function HomeBackdrop({ appearance }: { appearance: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const mesh = buildMesh();
    const tokens = getComputedStyle(document.body);
    const token = (name: string, fallback: string) => tokens.getPropertyValue(name).trim() || fallback;
    const colour: Record<MeshStance | 'tie', string> = {
      root: token('--accent', '#6b5cff'),
      support: token('--green', '#2f9c58'),
      oppose: token('--red', '#c2495a'),
      tie: token('--muted', '#8190a7'),
    };
    let width = 0;
    let height = 0;
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth || window.innerWidth;
      height = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = (angle: number) => {
      ctx.clearRect(0, 0, width, height);
      // To the right of the text on a wide window, centred on a narrow one.
      const wide = width >= 900;
      const unit = Math.min(width, height) * (wide ? 0.46 : 0.5);
      const points = mesh.nodes.map((node) =>
        project(node, angle, width * (wide ? 0.68 : 0.5), height * 0.5, unit)
      );
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
      for (const [a, b] of mesh.ties) line(a, b, colour.tie, 0.16, 1);
      mesh.nodes.forEach((node, i) => {
        if (node.parent >= 0) line(i, node.parent, colour[node.stance], 0.3, 1.2);
      });
      mesh.nodes.forEach((node, i) => {
        const p = points[i]!;
        ctx.globalAlpha = 0.25 + 0.4 * p.near;
        ctx.fillStyle = colour[node.stance];
        ctx.beginPath();
        ctx.arc(p.x, p.y, (node.depth === 0 ? 5 : 4 - node.depth * 0.7) * p.scale, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    };
    const calm = () =>
      window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.innerWidth < 700;
    let frame = 0;
    let last = 0;
    let angle = START_ANGLE;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (document.hidden || now - last < FRAME_MS) return;
      angle += Math.min(now - last, 100) * TURN_PER_MS;
      last = now;
      draw(angle);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      resize();
      draw(angle);
      const moving = !calm();
      canvas.dataset.animated = String(moving);
      if (moving) frame = requestAnimationFrame(tick);
    };
    start();
    // The canvas takes its size from the page: draw again whenever that size changes (the first layout too).
    const sized = new ResizeObserver(start);
    sized.observe(canvas);
    window.addEventListener('resize', start);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    motion.addEventListener('change', start);
    return () => {
      cancelAnimationFrame(frame);
      sized.disconnect();
      window.removeEventListener('resize', start);
      motion.removeEventListener('change', start);
    };
    // The colours are read from the theme: draw again when it changes.
  }, [appearance]);
  return <canvas ref={ref} id="homeBackdrop" className="home-backdrop" aria-hidden="true" />;
}
