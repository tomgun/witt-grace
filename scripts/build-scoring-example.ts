// Builds the synthetic scoring-comparison example (owner request 2026-11-10) from domain commands: four options, one
// with some twenty small reasons on the 0.1 scale, one with a deep tree of medium reasons, two with only a few strong
// ones, so switching Arviointi → Laskentatapa shows how the methods treat them. Fictional data, one assessor.
// Run: node scripts/build-scoring-example.ts (add --table to print each option's net under every method).
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  applyCommand,
  createBlankProject,
  evaluate,
  SCORING_LOGODDS,
  SCORING_V3,
  SCORING_V4,
  SCORING_VERSION,
  serializeProjectFile,
} from '../src/domain/index.ts';
import type { Command, Project } from '../src/domain/index.ts';

const NOW = '2026-11-10T09:00:00.000Z';
const USER = 'u-arvioija';
let counter = 0;
const id = (prefix: string) => `${prefix}-${String(++counter).padStart(3, '0')}`;
const run = (p: Project, ...commands: Command[]) =>
  commands.reduce((acc, c) => applyCommand(acc, c, { now: NOW, actorId: USER }), p);

/** [title, credence %, signed influence, reasons below]. */
type Reason = [string, number, number, Reason[]?];

function addReasons(p: Project, parentId: string, reasons: Reason[], fine: boolean): Project {
  for (const [title, credence, influence, below] of reasons) {
    const nid = id('r');
    p = run(
      p,
      { type: 'node.add', id: nid, parentId, relation: influence < 0 ? 'oppose' : 'support', title },
      {
        type: 'review.personal',
        voteId: id('v'),
        assessmentId: id('a'),
        nodeId: nid,
        userId: USER,
        credence,
        influence,
      }
    );
    if (fine) p = run(p, { type: 'node.edit', id: nid, fineInfluence: true });
    if (below) p = addReasons(p, nid, below, fine);
  }
  return p;
}

const OPTIONS: [string, string, boolean, Reason[]][] = [
  [
    'o-light',
    'Ostetaan kevyet kannettavat',
    true,
    [
      [
        'Akku kestää koko työpäivän',
        90,
        1,
        [
          ['Testissä 11 tuntia verkkoselailua', 100, 0.8],
          ['Videopalavereissa kesto putoaa noin seitsemään tuntiin', 80, -0.6],
        ],
      ],
      [
        'Kevyt kantaa asiakaskäynneille',
        90,
        1.5,
        [
          ['Paino 1,1 kg', 100, 0.7],
          ['Mahtuu pieneen reppuun', 100, 0.3],
        ],
      ],
      [
        'Näyttö riittää toimistotyöhön',
        80,
        0.8,
        [
          ['Kaikilla ei ole ulkoista näyttöä', 60, -0.4],
          ['Telakoita on jo kuusi', 100, 0.5],
        ],
      ],
      ['Hiljainen, ei tuuletinta', 100, 0.4],
      ['Toimittaja on tuttu', 90, 0.6],
      [
        '16 Gt muisti voi loppua raskaissa töissä',
        60,
        -1.2,
        [
          ['Kaksi kehittäjää ajaa paikallisia kontteja', 100, 0.9],
          ['Raskaat ajot voi siirtää pilveen', 70, -0.7],
        ],
      ],
      ['Korjattavuus heikko: akku on liimattu', 90, -0.8],
      ['Hinta 1 200 € koneelta mahtuu budjettiin', 100, 0.9],
      ['Kolmen vuoden takuu', 100, 0.5],
      ['Toimitusaika kuusi viikkoa', 80, -0.5],
      ['Käyttäjät pitävät näppäimistöstä', 70, 0.3],
      ['Energiatehokas', 100, 0.2],
    ],
  ],
  [
    'o-lease',
    'Vuokrataan koneet palveluna',
    false,
    [
      ['Ei isoa kertainvestointia', 100, 5],
      ['Rikkoutunut kone vaihdetaan seuraavana päivänä', 90, 5],
      ['Ylläpito ja päivitykset sisältyvät hintaan', 100, 4],
      ['Kolmen vuoden kokonaiskustannus noin 25 % suurempi', 90, -3],
    ],
  ],
  [
    'o-repair',
    'Korjataan nykyiset koneet',
    false,
    [
      ['Halvin: noin 300 € koneelta', 100, 5],
      ['Koneet ovat jo viisi vuotta vanhoja', 100, -2],
    ],
  ],
  [
    'o-power',
    'Ostetaan tehokkaat työasemat',
    false,
    [
      [
        'Raskaat ajot nopeutuvat',
        80,
        3,
        [
          ['Käännösajat puolittuivat testissä', 90, 3, [['Testi tehtiin vain yhdellä projektilla', 70, -2]]],
          ['Vain kaksi henkilöä tarvitsee tehoa', 100, -3],
        ],
      ],
      ['Painavia, eivät kulje asiakkaalle', 100, -3, [['Asiakaskäyntejä on vain 2–3 kuussa', 90, -2]]],
      [
        'Hinta 2 800 € koneelta ylittää budjetin',
        100,
        -4,
        [['Ensi vuoden budjettiin voi hakea lisää', 50, -2]],
      ],
      ['Riittävät vielä kuuden vuoden päästä', 60, 2],
      ['Iso näyttö tehostaa työtä', 70, 2, [['Isot näytöt on jo hankittu', 100, -1.5]]],
      ['Tuuletin kuuluu avotoimistossa', 70, -1.5],
      ['Tuki ja varaosat paikallisesti', 80, 1],
    ],
  ],
];

export function scoringExample(): Project {
  counter = 0;
  let p = createBlankProject({
    mode: 'decision',
    projectId: 'ex-laskentavertailu',
    rootId: 'root',
    userId: USER,
    now: NOW,
    scoring: SCORING_VERSION,
  });
  p = run(
    p,
    { type: 'user.rename', id: USER, name: 'Arvioija' },
    { type: 'project.setTitle', title: 'Laskentatapojen vertailu: tiimin tietokoneiden uusiminen' },
    { type: 'node.edit', id: 'root', title: 'Miten uusimme tiimin tietokoneet?' }
  );
  for (const [oid, title, fine, reasons] of OPTIONS) {
    p = run(p, { type: 'node.add', id: oid, parentId: 'root', relation: 'option', title });
    p = addReasons(p, oid, reasons, fine);
  }
  return run(p, { type: 'layout.auto' });
}

if (process.argv[1]?.endsWith('build-scoring-example.ts')) {
  const project = scoringExample();
  const out = path.join(process.cwd(), 'public', 'examples', 'laskentatapojen-vertailu.witt.json');
  writeFileSync(out, serializeProjectFile(project));
  console.log(`build-scoring-example: ${project.nodes.length} nodes written to ${out}`);
  if (process.argv.includes('--table'))
    for (const [oid, title] of OPTIONS) {
      const nets = [SCORING_V4, SCORING_LOGODDS, SCORING_V3].map((scoring) => {
        const score = evaluate({ ...project, settings: { ...project.settings, scoring } }).get(oid)?.score;
        return score == null ? '—' : (2 * score - 100).toFixed(1);
      });
      console.log(`${title}: v4 ${nets[0]} · log-odds ${nets[1]} · v3 ${nets[2]}`);
    }
}
