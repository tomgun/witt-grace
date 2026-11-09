// Builds the two synthetic recruitment examples (owner request 2026-11-09) from domain commands, so they are valid
// documents by construction: one candidate judged against criteria in argument mode, and three candidates compared on
// the same criteria in decision mode. Fictional people and data. Run: node scripts/build-recruitment-examples.ts
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { applyCommand, createBlankProject, serializeProjectFile } from '../src/domain/index.ts';
import type { Command, Project } from '../src/domain/index.ts';

const NOW = '2026-11-09T09:00:00.000Z';
const USERS = ['u-aino', 'u-bertil', 'u-ceren'] as const;
let counter = 0;
const id = (prefix: string) => `${prefix}-${String(++counter).padStart(3, '0')}`;
const run = (p: Project, ...commands: Command[]) =>
  commands.reduce((acc, c) => applyCommand(acc, c, { now: NOW, actorId: USERS[0] }), p);
type Three = [number, number, number];
/** One credence and one influence per assessor, in USERS order. */
function rate(p: Project, nodeId: string, credence: Three | null, influence: Three | null): Project {
  USERS.forEach((userId, i) => {
    if (credence)
      p = run(p, { type: 'review.credence', id: id('v'), nodeId, userId, credence: credence[i]! });
    if (influence)
      p = run(p, {
        type: 'review.influence',
        id: id('a'),
        subjectType: 'primary',
        subjectId: nodeId,
        userId,
        influence: influence[i]!,
      });
  });
  return p;
}
function people(p: Project): Project {
  return run(
    p,
    { type: 'user.rename', id: USERS[0], name: 'Aino · myyntijohtaja' },
    { type: 'user.add', id: USERS[1], name: 'Bertil · HR' },
    { type: 'user.add', id: USERS[2], name: 'Ceren · tiimin myyjä' }
  );
}

function oneCandidate(): Project {
  let p = createBlankProject({ projectId: 'ex-rekry-yksi', rootId: 'root', userId: USERS[0], now: NOW });
  p = people(p);
  p = run(
    p,
    { type: 'project.setTitle', title: 'Rekrytointi: sopiiko kandidaatti K myyntitiimiin?' },
    { type: 'node.edit', id: 'root', title: 'Kandidaatti K sopii myyntitiimiimme' },
    {
      type: 'node.add',
      id: 'goal',
      parentId: 'root',
      relation: 'support',
      semanticType: 'value',
      title: 'Haluamme kasvattaa uusasiakasmyyntiä tänä vuonna',
    },
    { type: 'node.edit', id: 'goal', typeLabel: 'Tavoite' }
  );
  const criteria: [string, string, Three, Three, [string, 'support' | 'oppose', Three, Three][]][] = [
    [
      'c-sales',
      'K on myyvä',
      [70, 60, 65],
      [5, 4, 4],
      [
        ['Ylitti myyntitavoitteensa kahtena vuonna peräkkäin', 'support', [90, 80, 85], [4, 3, 4]],
        ['Haastattelun myyntiharjoitus jäi pinnalliseksi', 'oppose', [60, 70, 50], [-2, -3, -2]],
      ],
    ],
    [
      'c-culture',
      'K sopii tiimimme toimintakulttuuriin',
      [60, 50, 70],
      [3, 5, 4],
      [
        ['Kysyi paljon tiimin yhteisistä käytännöistä', 'support', [80, 85, 90], [2, 2, 3]],
        ['Kertoo viihtyvänsä parhaiten itsenäisessä työssä', 'oppose', [70, 80, 60], [-2, -3, -1]],
      ],
    ],
    [
      'c-experience',
      'K:n työkokemus riittää tehtävään',
      [80, 85, 75],
      [2, 3, 2],
      [['Viisi vuotta B2B-myyntiä ohjelmistoalalla', 'support', [100, 100, 100], [4, 4, 3]]],
    ],
  ];
  for (const [cid, title, credence, weight, evidence] of criteria) {
    p = run(
      p,
      { type: 'node.add', id: cid, parentId: 'root', relation: 'support', title },
      { type: 'node.edit', id: cid, typeLabel: 'Kriteeri' }
    );
    p = rate(p, cid, credence, weight);
    for (const [etitle, relation, ecred, einfl] of evidence) {
      const eid = id('e');
      p = run(p, { type: 'node.add', id: eid, parentId: cid, relation, title: etitle });
      p = rate(p, eid, ecred, einfl);
    }
  }
  return run(p, { type: 'layout.auto' });
}

function threeCandidates(): Project {
  let p = createBlankProject({
    mode: 'decision',
    projectId: 'ex-rekry-kolme',
    rootId: 'root',
    userId: USERS[0],
    now: NOW,
  });
  p = people(p);
  p = run(
    p,
    { type: 'project.setTitle', title: 'Rekrytointi: kolme kandidaattia samoilla kriteereillä' },
    { type: 'node.edit', id: 'root', title: 'Kenet palkkaamme myyntitiimiin?' }
  );
  const concepts: [string, string, Three][] = [
    ['k-sales', 'Myyntinäyttö on vahva', [5, 4, 4]],
    ['k-culture', 'Sopii tiimin toimintakulttuuriin', [3, 5, 4]],
    ['k-experience', 'Työkokemus riittää tehtävään', [2, 3, 2]],
  ];
  for (const [cid, title] of concepts) p = run(p, { type: 'concept.add', id: cid, title });
  const candidates: [string, string, Three[]][] = [
    [
      'o-a',
      'Kandidaatti A',
      [
        [85, 80, 90],
        [40, 35, 50],
        [90, 95, 85],
      ],
    ],
    [
      'o-b',
      'Kandidaatti B',
      [
        [55, 60, 50],
        [85, 90, 80],
        [60, 55, 65],
      ],
    ],
    [
      'o-c',
      'Kandidaatti C',
      [
        [70, 65, 75],
        [65, 70, 60],
        [30, 40, 35],
      ],
    ],
  ];
  for (const [oid, title, credences] of candidates) {
    p = run(p, { type: 'node.add', id: oid, parentId: 'root', relation: 'option', title });
    if (oid === 'o-a') p = run(p, { type: 'node.edit', id: oid, typeLabel: 'Kandidaatti' });
    concepts.forEach(([cid, , weight], i) => {
      const nid = `${oid}-${cid}`;
      p = run(p, { type: 'concept.attach', id: cid, parentId: oid, nodeId: nid });
      p = run(p, { type: 'node.edit', id: nid, typeLabel: 'Kriteeri' });
      p = rate(p, nid, credences[i]!, weight);
    });
  }
  return run(p, { type: 'layout.auto' });
}

const out = path.join(process.cwd(), 'public', 'examples');
writeFileSync(path.join(out, 'rekrytointi-yksi-kandidaatti.witt.json'), serializeProjectFile(oneCandidate()));
writeFileSync(
  path.join(out, 'rekrytointi-kolme-kandidaattia.witt.json'),
  serializeProjectFile(threeCandidates())
);
console.log('build-recruitment-examples: 2 files written to public/examples/');
