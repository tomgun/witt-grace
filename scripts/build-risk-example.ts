// Builds the synthetic risk tree example (WG-058, owner 2026-11-24/25) from domain commands, so it is a valid
// document by construction: a goal at the root, a supporting action for it, risks against it with their causes and
// mitigations, and a risk that the mitigation fails. Fictional people and data.
// Run: node scripts/build-risk-example.ts
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  applyCommand,
  createBlankProject,
  SCORING_VERSION,
  serializeProjectFile,
} from '../src/domain/index.ts';
import type { Command, Project } from '../src/domain/index.ts';
import { ratedAsBuilt } from './build-scoring-example.ts';

const NOW = '2026-11-25T09:00:00.000Z';
const USERS = ['u-aino', 'u-bertil', 'u-ceren'] as const;
let counter = 0;
const id = (prefix: string) => `${prefix}-${String(++counter).padStart(3, '0')}`;
const run = (p: Project, ...commands: Command[]) =>
  commands.reduce((acc, c) => applyCommand(acc, c, { now: NOW, actorId: USERS[0] }), p);
type Three = [number, number, number];
/** A node of the tree: its text, its relation to its parent, a credence (for a risk: how likely) and an influence
 * (for a risk: how badly it hurts the goal) from each assessor in USERS order, and its own children. */
interface Branch {
  title: string;
  relation: 'support' | 'oppose';
  credence: Three;
  influence: Three;
  children?: Branch[];
}

function rate(p: Project, nodeId: string, credence: Three, influence: Three): Project {
  USERS.forEach((userId, i) => {
    p = run(
      p,
      { type: 'review.credence', id: id('v'), nodeId, userId, credence: credence[i]! },
      {
        type: 'review.influence',
        id: id('a'),
        subjectType: 'primary',
        subjectId: nodeId,
        userId,
        influence: influence[i]!,
      }
    );
  });
  return p;
}
function grow(p: Project, parentId: string, branches: Branch[]): Project {
  for (const branch of branches) {
    const nodeId = id('n');
    p = run(p, {
      type: 'node.add',
      id: nodeId,
      parentId,
      relation: branch.relation,
      title: branch.title,
    });
    p = rate(p, nodeId, branch.credence, branch.influence);
    p = grow(p, nodeId, branch.children ?? []);
  }
  return p;
}

const TREE: Branch[] = [
  {
    title: 'Kokenut toimittaja rakentaa kassan ja maksut',
    relation: 'support',
    credence: [85, 80, 90],
    influence: [3, 3, 2],
  },
  {
    title: 'Testaus jää kesken',
    relation: 'oppose',
    credence: [50, 60, 45],
    influence: [-4, -4, -3],
    children: [
      {
        title: 'Kehitystyö venyy ja vie testausajan',
        relation: 'support',
        credence: [60, 70, 55],
        influence: [3, 4, 3],
        children: [
          {
            title: 'Laajuus lukitaan syyskuun lopussa',
            relation: 'oppose',
            credence: [70, 50, 60],
            influence: [-2, -2, -3],
          },
        ],
      },
      {
        title: 'Viikoittainen katsaus paljastaa viiveet ajoissa',
        relation: 'oppose',
        credence: [75, 65, 70],
        influence: [-3, -2, -3],
        children: [
          {
            title: 'Katsaus jää kiireessä pitämättä',
            relation: 'oppose',
            credence: [30, 40, 35],
            influence: [-2, -3, -2],
          },
        ],
      },
    ],
  },
  {
    title: 'Maksupalvelun sopimus viivästyy',
    relation: 'oppose',
    credence: [30, 25, 40],
    influence: [-5, -5, -4],
    children: [
      {
        title: 'Sopimusneuvottelut alkavat vasta lokakuussa',
        relation: 'support',
        credence: [80, 85, 75],
        influence: [3, 2, 3],
      },
      {
        title: 'Varamaksupalvelu on valmiina',
        relation: 'oppose',
        credence: [60, 70, 50],
        influence: [-3, -4, -3],
      },
    ],
  },
  {
    title: 'Joulusesongin kuorma kaataa palvelun',
    relation: 'oppose',
    credence: [25, 35, 20],
    influence: [-3, -4, -3],
    children: [
      {
        title: 'Kuormitustesti tehdään ennen avausta',
        relation: 'oppose',
        credence: [80, 70, 75],
        influence: [-3, -3, -2],
      },
    ],
  },
];

export function riskExample(): Project {
  counter = 0;
  let p = createBlankProject({
    mode: 'risk',
    projectId: 'ex-riskit-verkkokauppa',
    rootId: 'root',
    userId: USERS[0],
    now: NOW,
    scoring: SCORING_VERSION,
  });
  p = run(
    p,
    { type: 'user.rename', id: USERS[0], name: 'Aino · projektipäällikkö' },
    { type: 'user.add', id: USERS[1], name: 'Bertil · kehittäjä' },
    { type: 'user.add', id: USERS[2], name: 'Ceren · asiakaspalvelu' },
    { type: 'project.setTitle', title: 'Riskit: verkkokauppa aukeaa marraskuussa' },
    { type: 'node.edit', id: 'root', title: 'Verkkokauppa aukeaa marraskuussa' }
  );
  p = grow(p, 'root', TREE);
  return ratedAsBuilt(run(p, { type: 'layout.auto' }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = path.join(process.cwd(), 'public', 'examples');
  writeFileSync(path.join(out, 'riskit-verkkokauppa.witt.json'), serializeProjectFile(riskExample()));
  console.log('build-risk-example: 1 file written to public/examples/');
}
