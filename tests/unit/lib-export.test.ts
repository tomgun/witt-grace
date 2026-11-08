// must: the visual export reproduces the frozen prototype's `src/diagram-export.js` and app.js export flow: the SVG
//       string byte for byte for every prototype example, orientation, layer preset and palette; the PNG size plan,
//       tile grid and ZIP bytes; the PDF orientation, page grid, fit size and file bytes; the estimate line, the
//       dialog defaults and the download names
// test: tests/unit/lib-export.test.ts (parity through the prototype module; literal oracles for the app.js parts)
// red-against: a colour, radius, font size or offset changed in the drawing, chips wrapped at another width, the
//              pixel budget or tile edge changed, the 36 px page overlap dropped, a PDF offset table off by one,
//              a ZIP header field misplaced, the ZIP note shown for a single PNG, a filename losing its ä
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  ORIENTATIONS,
  childrenOf,
  evaluate,
  focusProjection,
  parseProject,
  signedInfluence,
} from '../../src/domain/index.ts';
import type { Node, Orientation, Project } from '../../src/domain/index.ts';
import { FI, translator } from '../../src/lib/i18n/i18n.ts';
import * as Diagram from '../../src/lib/export/diagram.ts';
import type { ExportLayers, SnapshotInput } from '../../src/lib/export/diagram.ts';

const require = createRequire(import.meta.url);
const protoDir = path.join(process.cwd(), 'witt-grace-gpt-proto');
const Proto = require(path.join(protoDir, 'src', 'diagram-export.js'));
const t = translator(FI);

const examples = readdirSync(path.join(protoDir, 'examples'))
  .filter((f) => f.endsWith('.witt.json') && !f.startsWith('ai-draft'))
  .map((f) => ({
    name: f,
    project: parseProject(JSON.parse(readFileSync(path.join(protoDir, 'examples', f), 'utf8'))),
  }));

const PRESETS: Record<'text' | 'analysis' | 'all', ExportLayers> = {
  text: {
    labels: false,
    details: false,
    index: false,
    assessments: false,
    confidence: false,
    impact: false,
    comments: false,
    counts: false,
    links: false,
  },
  analysis: {
    labels: true,
    details: true,
    index: true,
    assessments: true,
    confidence: false,
    impact: false,
    comments: true,
    counts: true,
    links: false,
  },
  all: {
    labels: true,
    details: true,
    index: true,
    assessments: false,
    confidence: true,
    impact: true,
    comments: true,
    counts: true,
    links: true,
  },
};
const LABELS: Record<string, string> = {
  group: 'Vaihtoehtoryhmä',
  option: 'VAIHTOEHTO',
  support: 'PUOLTAA',
  oppose: 'VASTUSTAA',
  neutral: 'Neutraali',
  root: 'PÄÄVÄITE',
};
/** Deterministic stand-ins for the app's label and chip formatting. */
function snapshotInput(
  project: Project,
  orientation: Orientation,
  layers: ExportLayers,
  options: Partial<SnapshotInput['options']> = {},
  extra: Partial<SnapshotInput> = {}
): SnapshotInput {
  const evaluated = evaluate(project);
  return {
    project,
    options: {
      scope: 'all',
      palette: 'light',
      highlights: true,
      links: true,
      shared: true,
      compact: false,
      ...options,
    },
    layers,
    projection: { nodes: project.nodes, matchIds: new Set(), anchorId: null, contextIds: new Set() },
    focusActive: false,
    orientation,
    fourWayOffsets: project.layout.fourWayOffsets,
    personal: false,
    lensFiltered: false,
    evaluated,
    leadingOptionIds: new Set(),
    relation: (n) => n.relation,
    typeLabel: (n) => LABELS[n.relation] ?? 'PÄÄVÄITE',
    chips: (n: Node, l: ExportLayers) => {
      const out: string[] = [];
      if (l.index) out.push(`netto: ${evaluated.get(n.id)?.score ?? '—'}`);
      if (l.assessments) out.push(`Arviot: 75%/+5 (keskiarvo)`);
      if (l.confidence) out.push(`arvio: ${n.confidence}%`);
      if (l.impact) out.push(`paino: +${n.impact}/5`);
      if (l.comments) out.push(`kommenttia: ${project.comments.filter((c) => c.nodeId === n.id).length}`);
      if (l.counts) {
        const count = childrenOf(project, n.id).length;
        if (count) out.push(`alisolmua: ${count}`);
      }
      if (l.links) {
        const count = project.links.filter((x) => x.sourceId === n.id || x.targetId === n.id).length;
        if (count) out.push(`Yhteydet: ${count}`);
      }
      return out;
    },
    shownInfluence: (n) => signedInfluence(n),
    title: project.title,
    subtitle: `WITT · GRACE · ${project.mode === 'decision' ? 'Päätös' : 'Argumentointi'} · Yhteinen`,
    ...extra,
  };
}

test('renderSvg is byte-equal to the prototype for every example, orientation, preset, palette and highlight', () => {
  let count = 0;
  for (const { name, project } of examples)
    for (const orientation of ORIENTATIONS)
      for (const preset of ['text', 'analysis', 'all'] as const)
        for (const palette of ['light', 'dark'] as const)
          for (const highlights of [true, false]) {
            const snapshot = Diagram.buildVisualSnapshot(
              snapshotInput(project, orientation, PRESETS[preset], { palette, highlights })
            );
            const ours = Diagram.renderSvg(snapshot);
            const theirs = Proto.renderSvg(snapshot);
            assert.equal(ours.width, theirs.width, `${name} ${orientation} ${preset}`);
            assert.equal(ours.height, theirs.height);
            assert.equal(ours.svg, theirs.svg, `${name} ${orientation} ${preset} ${palette} ${highlights}`);
            count++;
          }
  assert.equal(count, examples.length * 3 * 3 * 2 * 2);
});

test('personal mode, focus dimming, compact visible scope and hidden recurring reasons render as the prototype', () => {
  for (const { project } of examples) {
    const root = project.nodes.find((n) => n.parentId === null)!;
    const half = new Set(project.nodes.filter((n, i) => i % 2 === 0 || n.parentId === null).map((n) => n.id));
    const visible = project.nodes.filter((n) => half.has(n.id));
    const focus = focusProjection(project, root.id, 'support');
    for (const orientation of ORIENTATIONS)
      for (const compact of [true, false])
        for (const shared of [true, false]) {
          const input = snapshotInput(
            project,
            orientation,
            PRESETS.all,
            { scope: 'visible', compact, shared, highlights: true },
            {
              projection: {
                nodes: visible,
                matchIds: new Set(focus.matchIds),
                anchorId: root.id,
                contextIds: new Set(focus.contextIds),
              },
              focusActive: true,
              personal: true,
              lensFiltered: true,
            }
          );
          const snapshot = Diagram.buildVisualSnapshot(input);
          assert.equal(
            snapshot.highlight,
            true,
            'a filtered lens does not disable highlights in personal mode'
          );
          const ours = Diagram.renderSvg(snapshot);
          assert.equal(ours.svg, Proto.renderSvg(snapshot).svg);
          if (!shared) assert.ok(snapshot.nodes.every((n) => !n.shared));
        }
    // Shared mode with a filtered lens turns the highlights off.
    const filtered = Diagram.buildVisualSnapshot(
      snapshotInput(project, 'horizontal', PRESETS.text, { highlights: true }, { lensFiltered: true })
    );
    assert.equal(filtered.highlight, false);
  }
});

test('the snapshot builder pins the export card height, the empty error and the recurring-reason rule', () => {
  assert.equal(Diagram.exportLayoutHeight(PRESETS.text), 148);
  assert.equal(Diagram.exportLayoutHeight({ ...PRESETS.text, labels: true }), 148);
  assert.equal(Diagram.exportLayoutHeight({ ...PRESETS.text, details: true }), 176);
  assert.equal(Diagram.exportLayoutHeight({ ...PRESETS.text, counts: true }), 176);
  assert.equal(Diagram.exportCardHeight({ details: false, ratings: true }), 176);
  assert.equal(Diagram.exportCardHeight({ details: false, ratings: false }), 148);
  const recurring = examples.find((e) => e.name === 'toistuvat-perustelut-dev24.witt.json')!.project;
  const withShared = Diagram.buildVisualSnapshot(
    snapshotInput(recurring, 'horizontal', PRESETS.all, { shared: true })
  );
  const without = Diagram.buildVisualSnapshot(
    snapshotInput(recurring, 'horizontal', PRESETS.all, { shared: false })
  );
  assert.equal(withShared.nodes.length, recurring.nodes.length);
  assert.equal(without.nodes.length, recurring.nodes.length - 2);
  // The ↗ marker follows `sharedReasonId` only; a concept-linked node is hidden with the rest but not marked.
  assert.equal(
    withShared.nodes.filter((n) => n.shared).length,
    recurring.nodes.filter((n) => n.sharedReasonId).length
  );
  assert.equal(withShared.layers.ratings, true);
  assert.equal(
    Diagram.buildVisualSnapshot(snapshotInput(recurring, 'horizontal', PRESETS.text)).layers.ratings,
    false
  );
  assert.throws(
    () =>
      Diagram.buildVisualSnapshot(
        snapshotInput(
          recurring,
          'horizontal',
          PRESETS.all,
          { scope: 'visible' },
          {
            projection: { nodes: [], matchIds: new Set(), anchorId: null, contextIds: new Set() },
          }
        )
      ),
    { message: 'No nodes in the selected export' }
  );
  assert.deepEqual(Diagram.resolveExportLayers('current', PRESETS.text, PRESETS), PRESETS.text);
  assert.deepEqual(Diagram.resolveExportLayers('analysis', PRESETS.text, PRESETS), PRESETS.analysis);
  assert.throws(() => Diagram.renderSvg({ ...withShared, nodes: [] }), {
    message: 'No tree nodes to export',
  });
  assert.throws(() => Proto.renderSvg({ ...withShared, nodes: [] }), { message: 'No tree nodes to export' });
  const many = { ...withShared, nodes: new Array(2501).fill(withShared.nodes[0]) };
  assert.throws(() => Diagram.renderSvg(many), {
    message: 'Too many nodes for a visual export (2500 maximum)',
  });
  const far = { ...withShared, nodes: [withShared.nodes[0]!, { ...withShared.nodes[0]!, x: 50000, y: 0 }] };
  assert.throws(() => Diagram.renderSvg(far), {
    message: 'Tree is too large for raster export. Reduce visible branches.',
  });
  assert.throws(() => Proto.renderSvg(far), {
    message: 'Tree is too large for raster export. Reduce visible branches.',
  });
});

test('wrapLines matches the prototype lines() for short, long, unicode and over-long input', () => {
  const samples = [
    '',
    'yksi',
    'Milloin uusi tuote kannattaa julkaista?',
    'Supercalifragilisticexpialidocious-sanan-pituinen-sana ja lyhyt',
    'ä'.repeat(100),
    'a b c d e f g h i j k l m n o p q r s t u v w x y z aa bb cc dd ee ff gg hh ii jj kk ll mm nn oo pp',
    '   välilyönnit   alussa ja   lopussa   ',
    'Kolme neljä viisi kuusi seitsemän kahdeksan yhdeksän kymmenen yksitoista kaksitoista kolmetoista',
    null,
    undefined,
    42,
  ];
  for (const sample of samples)
    for (const [limit, max] of [
      [34, 3],
      [36, 3],
      [44, 1],
      [80, 1],
      [5, 2],
    ] as const) {
      assert.deepEqual(
        Diagram.wrapLines(sample, limit, max),
        Proto.lines(sample, limit, max),
        `${sample} ${limit}`
      );
    }
  assert.deepEqual(Diagram.wrapLines('Milloin uusi tuote kannattaa julkaista?', 36, 3), [
    'Milloin uusi tuote kannattaa',
    'julkaista?',
  ]);
});

test('pngPlan matches the prototype over sizes, scales, modes and device memory', () => {
  const sizes = [1, 100, 1000, 4096, 5000, 16384, 20000, 32767, 40000];
  for (const width of sizes)
    for (const height of sizes)
      for (const scale of [0.5, 1, 2, 3, 4, '2', 'x'] as const)
        for (const mode of ['auto', 'tiles', 'other'])
          for (const memory of [undefined, 0, 2, 4, 4.5, 8, NaN]) {
            assert.deepEqual(
              Diagram.pngPlan(width, height, Number(scale), mode, memory),
              Proto.pngPlan(width, height, scale, mode, memory),
              `${width} ${height} ${scale} ${mode} ${memory}`
            );
          }
  assert.throws(() => Diagram.pngPlan(0, 10), { message: 'Invalid PNG dimensions' });
  assert.throws(() => Proto.pngPlan(0, 10), { message: 'Invalid PNG dimensions' });
  assert.deepEqual(Diagram.pngPlan(1000, 500, 2), {
    width: 2000,
    height: 1000,
    pixels: 2000000,
    estimatedRGBABytes: 8000000,
    single: true,
  });
  assert.equal(Diagram.pngPlan(5000, 5000, 2, 'auto', 4).single, false);
  assert.equal(Diagram.pngPlan(5000, 5000, 2, 'auto', 8).single, true);
  assert.equal(Diagram.pngPlan(5000, 5000, 2, 'tiles', 8).single, false);
});

test('pngTilePlan and pngTileEntries pin the tile grid, names and README of the ZIP', () => {
  const plan = Diagram.pngTilePlan(8000, 4000, 2);
  assert.equal(plan.cols, 3);
  assert.equal(plan.rows, 2);
  assert.deepEqual(
    plan.tiles.map((x) => x.name),
    [
      'tile_r01_c01_x0_y0.png',
      'tile_r01_c02_x3584_y0.png',
      'tile_r01_c03_x7168_y0.png',
      'tile_r02_c01_x0_y3584.png',
      'tile_r02_c02_x3584_y3584.png',
      'tile_r02_c03_x7168_y3584.png',
    ]
  );
  assert.deepEqual(plan.tiles[5], {
    name: 'tile_r02_c03_x7168_y3584.png',
    x: 7168,
    y: 3584,
    width: 832,
    height: 416,
    col: 2,
    row: 1,
  });
  assert.deepEqual(plan.manifest, [
    'WITT high-resolution PNG tiles',
    '',
    'Complete image: 8000 x 4000 pixels',
    'Scale: 2x',
    'Grid: 3 columns x 2 rows',
    '',
    'Images are tiled without overlap. X and Y coordinates are in the complete image.',
    '',
    'tile_r01_c01_x0_y0.png: 3584 x 3584 pixels, x=0, y=0',
    'tile_r01_c02_x3584_y0.png: 3584 x 3584 pixels, x=3584, y=0',
    'tile_r01_c03_x7168_y0.png: 832 x 3584 pixels, x=7168, y=0',
    'tile_r02_c01_x0_y3584.png: 3584 x 416 pixels, x=0, y=3584',
    'tile_r02_c02_x3584_y3584.png: 3584 x 416 pixels, x=3584, y=3584',
    'tile_r02_c03_x7168_y3584.png: 832 x 416 pixels, x=7168, y=3584',
  ]);
  assert.throws(() => Diagram.pngTilePlan(3584 * 13, 3584 * 12, 3), {
    message: 'PNG requires too many tiles; try SVG or PDF',
  });
  const entries = Diagram.pngTileEntries(Diagram.pngTilePlan(4000, 100, 1), [
    new Uint8Array([1]),
    new Uint8Array([2]),
  ]);
  assert.deepEqual(
    entries.map((e) => e.name),
    ['README.txt', 'tile_r01_c01_x0_y0.png', 'tile_r01_c02_x3584_y0.png']
  );
  assert.equal(new TextDecoder().decode(entries[0]!.bytes).endsWith('x=3584, y=0\n'), true);
});

test('tileSvg and sizeSvg rewrite the root element exactly as the prototype', () => {
  const { svg } = Diagram.renderSvg(
    Diagram.buildVisualSnapshot(snapshotInput(examples[0]!.project, 'horizontal', PRESETS.all))
  );
  for (const [x, y, w, h, s] of [
    [0, 0, 3584, 3584, 2],
    [3584, 0, 100, 3584, 2],
    [10, 20, 30, 40, 1],
    [0, 0, 1020, 1450, 1],
    [7168, 3584, 832, 416, 3],
  ] as const) {
    assert.equal(Diagram.tileSvg(svg, x, y, w, h, s), Proto.tileSvg(svg, 0, 0, x, y, w, h, s));
  }
  assert.equal(Diagram.sizeSvg(svg, 640, 480), Proto.sizeSvg(svg, 640, 480));
  assert.ok(
    Diagram.sizeSvg(svg, 640, 480).startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ')
  );
  assert.throws(() => Diagram.tileSvg('<div>', 0, 0, 1, 1, 1), { message: 'Expected a WITT export SVG' });
  assert.throws(() => Diagram.sizeSvg('<svg ', 1, 1), { message: 'Invalid SVG export' });
});

test('zipStoredBytes and crc32 are byte-equal to the prototype ZIP', async () => {
  assert.equal(Diagram.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(Diagram.crc32(new Uint8Array()), 0);
  const entries = [
    { name: 'README.txt', bytes: new TextEncoder().encode('WITT high-resolution PNG tiles\n') },
    { name: 'tile_r01_c01_x0_y0.png', bytes: Uint8Array.from({ length: 300 }, (_, i) => (i * 7) & 255) },
    { name: 'ääkköset ✓.png', bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
    { name: 'empty.bin', bytes: new Uint8Array() },
  ];
  const ours = Diagram.zipStoredBytes(entries);
  const theirs = new Uint8Array(await (Proto.zipStored(entries) as Blob).arrayBuffer());
  assert.deepEqual([...ours], [...theirs]);
  assert.equal(ours.length, theirs.length);
  const mine = new Uint8Array(await Diagram.zipStored(entries).arrayBuffer());
  assert.deepEqual([...mine], [...theirs]);
  // Local header signature, central directory signature and the end record.
  assert.deepEqual([...ours.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.deepEqual([...ours.slice(-22, -18)], [0x50, 0x4b, 0x05, 0x06]);
  assert.equal(ours[ours.length - 22 + 8], 4);
  assert.throws(() => Diagram.zipStoredBytes([{ name: 'x'.repeat(65536), bytes: new Uint8Array() }]), {
    message: 'ZIP entry too large',
  });
});

test('PDF orientation, page grid, fit size and bytes match the prototype', () => {
  const sizes = [1, 100, 984, 985, 1020, 1021, 1244, 1245, 2000, 5000, 16000, 20000, 40000];
  for (const width of sizes)
    for (const height of sizes) {
      for (const orientation of ['portrait', 'landscape'] as const) {
        const ours = (() => {
          try {
            return Diagram.pdfTilePlan(width, height, orientation);
          } catch (error) {
            return (error as Error).message;
          }
        })();
        const theirs = (() => {
          try {
            return Proto.pdfTilePlan(width, height, orientation);
          } catch (error) {
            return (error as Error).message;
          }
        })();
        assert.deepEqual(ours, theirs, `${width} ${height} ${orientation}`);
      }
      assert.deepEqual(Diagram.pdfFitRasterSize(width, height), Proto.pdfFitRasterSize(width, height));
      for (const layout of ['pages-auto', 'pages-portrait', 'pages-landscape', 'fit']) {
        const expected =
          layout === 'pages-portrait'
            ? 'portrait'
            : layout === 'pages-landscape'
              ? 'landscape'
              : height > width * 1.15
                ? 'portrait'
                : 'landscape';
        assert.equal(Diagram.pdfOrientation(width, height, layout), expected);
      }
    }
  assert.deepEqual(Diagram.pdfTilePlan(1300, 900, 'landscape'), [
    { x: 0, y: 0, width: 1280, height: 880, col: 0, row: 0 },
    { x: 1244, y: 0, width: 56, height: 880, col: 1, row: 0 },
    { x: 0, y: 844, width: 1280, height: 56, col: 0, row: 1 },
    { x: 1244, y: 844, width: 56, height: 56, col: 1, row: 1 },
  ]);
  assert.throws(() => Diagram.pdfTilePlan(0, 10), { message: 'Invalid PDF export dimensions' });
  assert.throws(() => Diagram.pdfTilePlan(40000, 40000, 'portrait'), {
    message: 'PDF would exceed 150 pages; reduce visible branches or use SVG',
  });
  assert.deepEqual(Diagram.pdfFitRasterSize(40000, 40000), { width: 4242, height: 4242 });
  assert.deepEqual(Diagram.pdfFitRasterSize(100, 20000), { width: 80, height: 16000 });

  const jpeg = (seed: number) => Uint8Array.from({ length: 64 + seed }, (_, i) => (i * seed + 0xff) & 255);
  const pages = [
    { width: 1280, height: 880, pixelsX: 1280, pixelsY: 880, jpeg: jpeg(1) },
    { width: 1280, height: 56, pixelsX: 1280, pixelsY: 56, jpeg: jpeg(2) },
    { width: 333, height: 777, pixelsX: 333, pixelsY: 777, jpeg: jpeg(3) },
  ];
  for (const orientation of ['portrait', 'landscape'] as const)
    for (const subset of [pages.slice(0, 1), pages]) {
      const ours = Diagram.pdfBytes(subset, orientation);
      const theirs: Uint8Array = Proto.pdfBytes(subset, orientation);
      assert.equal(ours.length, theirs.length);
      assert.deepEqual([...ours], [...theirs], `${orientation} ${subset.length}`);
    }
  const text = new TextDecoder('latin1').decode(Diagram.pdfBytes(pages, 'portrait'));
  assert.ok(text.startsWith('%PDF-1.4\n%WITT\n'));
  assert.ok(text.includes('/MediaBox [0 0 595.276 841.89]'));
  assert.ok(text.includes('(Page 3/3) Tj'));
  assert.ok(text.endsWith('%%EOF\n'));
  assert.throws(() => Diagram.pdfBytes([], 'portrait'), { message: 'PDF needs pages' });
});

test('the estimate line, the dialog defaults and the file names follow app.js', () => {
  const estimate = (
    w: number,
    h: number,
    resolution: 1 | 2 | 3,
    pngMode: 'auto' | 'tiles',
    memory?: number
  ) => Diagram.pngEstimateText(t, { width: w, height: h }, { resolution, pngMode }, memory);
  assert.equal(
    estimate(1000, 500, 2, 'auto'),
    '2000 × 1000 px · 2.0 MP · raakamuisti vähintään 8 Mt · Yritetään yhtä PNG:tä'
  );
  assert.equal(
    estimate(1000, 500, 2, 'tiles'),
    '2000 × 1000 px · 2.0 MP · raakamuisti vähintään 8 Mt · Viedään osina ZIP-tiedostoon'
  );
  assert.equal(
    estimate(1234, 567, 3, 'auto'),
    '3702 × 1701 px · 6.3 MP · raakamuisti vähintään 26 Mt · Yritetään yhtä PNG:tä'
  );
  assert.equal(
    estimate(20000, 20000, 1, 'auto'),
    '20000 × 20000 px · 400.0 MP · raakamuisti vähintään 1600 Mt · Viedään osina ZIP-tiedostoon'
  );
  assert.equal(
    estimate(5000, 5000, 2, 'auto', 4),
    '10000 × 10000 px · 100.0 MP · raakamuisti vähintään 400 Mt · Viedään osina ZIP-tiedostoon'
  );
  assert.equal(
    estimate(5000, 5000, 2, 'auto', 8),
    '10000 × 10000 px · 100.0 MP · raakamuisti vähintään 400 Mt · Yritetään yhtä PNG:tä'
  );

  const project = examples[0]!.project;
  const input = snapshotInput(project, 'horizontal', PRESETS.all);
  const options = Diagram.defaultVisualExportOptions({
    appearance: 'bitberg',
    showImportance: false,
    highlightOptions: true,
    leadingOptionCount: 1,
    layers: PRESETS.analysis,
    showRecurringInTree: true,
    compactVisible: false,
    anyCollapsed: true,
  });
  assert.deepEqual(options, {
    format: 'png',
    scope: 'visible',
    detail: 'current',
    palette: 'dark',
    highlights: true,
    links: false,
    shared: true,
    compact: true,
    resolution: 2,
    pngMode: 'auto',
    pdfLayout: 'pages-auto',
  });
  assert.equal(Diagram.paletteForAppearance('paper'), 'light');
  assert.equal(Diagram.paletteForAppearance('cosmos'), 'dark');
  const rendered = Diagram.renderSvg(Diagram.buildVisualSnapshot(input));
  assert.equal(
    Diagram.visualExportEstimate(t, () => input, options),
    Diagram.pngEstimateText(t, rendered, options)
  );
  assert.equal(
    Diagram.visualExportEstimate(t, () => input, { ...options, format: 'svg' }),
    ''
  );
  assert.equal(
    Diagram.visualExportEstimate(
      t,
      () => ({
        ...input,
        projection: { ...input.projection, nodes: [] },
        options: { ...input.options, scope: 'visible' },
      }),
      options
    ),
    'No nodes in the selected export'
  );

  assert.equal(
    Diagram.visualExportBasename('Esimerkki: pilvialustan valinta'),
    'Esimerkki_pilvialustan_valinta'
  );
  assert.equal(
    Diagram.visualExportBasename('  Ääkköset & "lainaus" / kauttaviiva  '),
    'Ääkköset_lainaus_kauttaviiva'
  );
  assert.equal(Diagram.visualExportBasename(''), 'witt');
  assert.equal(Diagram.visualExportBasename('!!!'), 'witt');
  assert.equal(Diagram.visualExportBasename('x'.repeat(100)).length, 65);
});

test('visualExportFile and runVisualExport choose the blob, extension and status as downloadVisual', async () => {
  const project = examples[0]!.project;
  const input = snapshotInput(project, 'horizontal', PRESETS.all);
  const snapshot = Diagram.buildVisualSnapshot(input);
  const base = Diagram.defaultVisualExportOptions({
    appearance: 'light',
    showImportance: false,
    highlightOptions: false,
    leadingOptionCount: 0,
    layers: PRESETS.all,
    showRecurringInTree: false,
    compactVisible: false,
    anyCollapsed: false,
  });
  const calls: string[] = [];
  const deps = {
    pngExport: async (_svg: string, w: number, h: number, scale: number, mode: string) => {
      calls.push(`png ${w}x${h} ${scale} ${mode}`);
      return mode === 'tiles'
        ? {
            blob: new Blob(['zip']),
            tiled: true,
            tiles: 6,
            fallbackReason: 'Browser canvas size limit exceeded',
          }
        : { blob: new Blob(['png']), tiled: false, tiles: 1 };
    },
    pdfBlob: async (_svg: string, w: number, h: number, layout: string) => {
      calls.push(`pdf ${w}x${h} ${layout}`);
      return new Blob(['pdf']);
    },
  };
  const svg = await Diagram.visualExportFile(t, snapshot, { ...base, format: 'svg' }, project.title, deps);
  assert.equal(svg.filename, `${Diagram.visualExportBasename(project.title)}.svg`);
  assert.equal(svg.status, 'Tiedosto ladattu.');
  assert.equal(svg.blob.type, 'image/svg+xml;charset=utf-8');
  assert.equal(await svg.blob.text(), Diagram.renderSvg(snapshot).svg);
  const png = await Diagram.visualExportFile(
    t,
    snapshot,
    { ...base, format: 'png', resolution: 3 },
    'Otsikko',
    deps
  );
  assert.equal(png.filename, 'Otsikko.png');
  assert.equal(png.status, 'Tiedosto ladattu.');
  const zip = await Diagram.visualExportFile(
    t,
    snapshot,
    { ...base, format: 'png', pngMode: 'tiles' },
    'Otsikko',
    deps
  );
  assert.equal(zip.filename, 'Otsikko.zip');
  assert.equal(
    zip.status,
    'PNG ylitti yhden kuvan rajan: ladattiin 6 korkearesoluutioista kuvapalaa ZIP-tiedostossa. · Selaimen kokoraja tuli vastaan'
  );
  const pdf = await Diagram.visualExportFile(
    t,
    snapshot,
    { ...base, format: 'pdf', pdfLayout: 'fit' },
    'Otsikko',
    deps
  );
  assert.equal(pdf.filename, 'Otsikko.pdf');
  const rendered = Diagram.renderSvg(snapshot);
  assert.deepEqual(calls, [
    `png ${rendered.width}x${rendered.height} 3 auto`,
    `png ${rendered.width}x${rendered.height} 2 tiles`,
    `pdf ${rendered.width}x${rendered.height} fit`,
  ]);
  await assert.rejects(
    Diagram.visualExportFile(t, snapshot, { ...base, format: 'gif' as 'svg' }, 'x', deps),
    { message: 'Invalid format' }
  );

  const downloads: string[] = [];
  const run = (opts: Partial<Diagram.VisualExportOptions>, snapshotInputOverride = input) =>
    Diagram.runVisualExport(
      t,
      snapshotInputOverride,
      { ...base, ...opts },
      {
        ...deps,
        download: (_blob: Blob, name: string) => void downloads.push(name),
      }
    );
  assert.equal(await run({ format: 'svg' }), 'Tiedosto ladattu.');
  assert.deepEqual(downloads, [`${Diagram.visualExportBasename(project.title)}.svg`]);
  assert.equal(
    await run(
      { format: 'png' },
      {
        ...input,
        options: { ...input.options, scope: 'visible' },
        projection: { ...input.projection, nodes: [] },
      }
    ),
    'Toiminto epäonnistui.: No nodes in the selected export'
  );
  assert.equal(downloads.length, 1);
});
