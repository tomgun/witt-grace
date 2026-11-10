// Builds the two synthetic scoring-comparison examples (owner requests 2026-11-10) from domain commands. The first has
// four options: one with some twenty small reasons on the 0.1 scale, one with a deep tree of medium reasons, two with
// only a few strong ones. The second is a debate with counter-claims 11–14 levels deep and parallel claims along the way under two options, against short strong ones. Switching
// Arviointi → Laskentatapa shows how the methods treat them. Fictional data, one assessor.
// Run: node scripts/build-scoring-example.ts (add --table to print each option's net under every method).
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  applyCommand,
  createBlankProject,
  evaluate,
  SCORING_LOGODDS,
  SCORING_SIGNED,
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

const depthOf = (reasons: Reason[] | undefined): number =>
  reasons?.length ? 1 + Math.max(...reasons.map((r) => depthOf(r[3]))) : 0;

/** Owner request 2026-11-10: a debate where claims meet counter-claims 10–14 levels deep, with parallel claims at many
 * levels. Each sign is relative to the parent: a counter-claim is negative, a claim backing the parent positive. */
const DEEP: [string, string, Reason[]][] = [
  [
    'd-maksu',
    'Otetaan käyttöön ruuhkamaksu',
    [
      [
        'Ruuhkamaksu vähentää autoliikennettä keskustassa',
        80,
        4,
        [
          [
            'Autoilijat vain siirtävät ajonsa maksuajan ulkopuolelle',
            60,
            -2,
            [
              [
                'Suurin osa ruuhka-ajan matkoista on työmatkoja, joiden ajankohtaa ei voi siirtää',
                70,
                -3,
                [
                  [
                    'Liukuva työaika on yleistynyt',
                    70,
                    -2,
                    [
                      [
                        'Liukuma koskee lähinnä toimistotyötä',
                        80,
                        -2,
                        [
                          [
                            'Keskustan työpaikoista valtaosa on toimistotyötä',
                            70,
                            -2,
                            [
                              [
                                'Kaupan ja palvelujen työpaikat kasvavat keskustassa nopeimmin',
                                50,
                                -1.5,
                                [
                                  [
                                    'Verkkokauppa vähentää kivijalkakaupan työpaikkoja',
                                    70,
                                    -1.5,
                                    [
                                      [
                                        'Keskustan kivijalkaliikkeiden määrä on pysynyt ennallaan',
                                        60,
                                        -1,
                                        [
                                          [
                                            'Tilasto kattaa vain kolme vuotta',
                                            100,
                                            -1,
                                            [
                                              [
                                                'Yksi vuosista oli poikkeuksellinen pandemiavuosi',
                                                100,
                                                1,
                                                [
                                                  [
                                                    'Pandemiavuosi on poistettu vertailusta',
                                                    40,
                                                    -1.5,
                                                    [
                                                      [
                                                        'Menetelmäkuvaus vahvistaa poiston',
                                                        70,
                                                        1,
                                                        [
                                                          [
                                                            'Menetelmäkuvausta on muokattu jälkikäteen',
                                                            50,
                                                            -0.5,
                                                          ],
                                                        ],
                                                      ],
                                                    ],
                                                  ],
                                                ],
                                              ],
                                            ],
                                          ],
                                          ['Liiketilojen vajaakäyttö on kasvanut', 60, -1],
                                        ],
                                      ],
                                    ],
                                  ],
                                  ['Uusi kauppakeskus tuo 400 työpaikkaa', 80, 1],
                                ],
                              ],
                              ['Toimistotyöntekijät ajavat keskustaan harvemmin kuin muut', 60, -1],
                            ],
                          ],
                        ],
                      ],
                      ['Kyselyssä 40 % voisi siirtää työaikaansa', 60, 1.5],
                    ],
                  ],
                  ['Etätyöpäivinä työmatka jää kokonaan pois', 70, -1.5],
                ],
              ],
              ['Navigaattorit ohjaavat jo nyt autoja ruuhkan ohi', 50, 1],
            ],
          ],
          [
            'Tukholmassa ja Lontoossa liikenne väheni noin viidenneksen',
            90,
            3,
            [
              [
                'Ne ovat paljon suurempia kaupunkeja',
                80,
                -1.5,
                [['Göteborgissa vaikutus oli samaa luokkaa', 80, -1.5]],
              ],
            ],
          ],
        ],
      ],
      [
        'Maksu rasittaa pienituloisia',
        80,
        -3,
        [
          [
            'Tuotot voidaan ohjata joukkoliikenteen hintoihin',
            70,
            -2,
            [
              [
                'Korvamerkintä ei sido tulevia valtuustoja',
                80,
                -2,
                [['Lontoossa korvamerkintä on pysynyt 20 vuotta', 70, 1.5]],
              ],
            ],
          ],
          ['Pienituloiset ajavat autolla keskustaan harvemmin', 70, -2],
        ],
      ],
      [
        'Järjestelmän rakentaminen maksaa 40 miljoonaa',
        100,
        -2,
        [['Tuotot kattavat kustannukset kolmessa vuodessa', 60, -2]],
      ],
    ],
  ],
  [
    'd-vuorot',
    'Lisätään joukkoliikenteen vuoroja',
    [
      [
        'Tiheämpi vuoroväli houkuttelee autoilijoita bussiin',
        70,
        3,
        [
          [
            'Autoilijat arvostavat matka-aikaa enemmän kuin vuoroväliä',
            60,
            -2,
            [
              [
                'Bussimatka kestää kaksi kertaa autoa kauemmin',
                80,
                2,
                [
                  [
                    'Bussikaistat lyhentävät matka-aikaa',
                    70,
                    -2,
                    [
                      [
                        'Bussikaistoja on vain kahdella pääväylällä',
                        100,
                        -1.5,
                        [
                          [
                            'Kolmas kaista on suunnitteilla',
                            60,
                            -1,
                            [
                              [
                                'Suunnitelma odottaa rahoitusta',
                                90,
                                -1,
                                [
                                  [
                                    'Rahoitus voidaan ottaa ruuhkamaksun tuotoista',
                                    40,
                                    -1.5,
                                    [
                                      [
                                        'Ruuhkamaksusta ei ole päätetty',
                                        100,
                                        -2,
                                        [
                                          [
                                            'Valtuuston enemmistö kallistuu maksun kannalle',
                                            40,
                                            -1,
                                            [['Arvio perustuu yhteen mielipidekyselyyn', 70, -1]],
                                          ],
                                        ],
                                      ],
                                    ],
                                  ],
                                  ['Valtionavustusta voi hakea keväällä', 50, -0.5],
                                ],
                              ],
                            ],
                          ],
                          ['Liikennevalojen etuudet nopeuttavat busseja muuallakin', 60, -1],
                        ],
                      ],
                    ],
                  ],
                ],
              ],
              ['Kyselyssä 30 % autoilijoista vaihtaisi bussiin tiheämmillä vuoroilla', 70, -2],
            ],
          ],
        ],
      ],
      [
        'Lisävuorot maksavat 3 miljoonaa vuodessa',
        100,
        -3,
        [['Valtio tukee joukkoliikennettä', 70, -1.5, [['Tuki on määräaikainen', 90, -1]]]],
      ],
      [
        'Päästöt vähenevät',
        70,
        2,
        [['Dieselbussit saastuttavat', 60, -1, [['Kalusto on jo puoliksi sähköistetty', 90, -1.5]]]],
      ],
    ],
  ],
  [
    'd-pysakointi',
    'Korotetaan pysäköintimaksuja',
    [
      ['Nopea ja halpa toteuttaa', 100, 4],
      ['Siirtää pysäköintiä asuinalueille', 80, -3],
    ],
  ],
  [
    'd-ei',
    'Ei uusia toimia nyt',
    [
      ['Ruuhkat kestävät alle tunnin päivässä', 70, 2],
      ['Ruuhkat kasvavat väestön myötä', 80, -3],
    ],
  ],
];

export function deepExample(): Project {
  counter = 0;
  let p = createBlankProject({
    mode: 'decision',
    projectId: 'ex-syva-vaittely',
    rootId: 'root',
    userId: USER,
    now: NOW,
    scoring: SCORING_VERSION,
  });
  p = run(
    p,
    { type: 'user.rename', id: USER, name: 'Arvioija' },
    { type: 'project.setTitle', title: 'Syvä väittely: keskustan ruuhkat' },
    { type: 'node.edit', id: 'root', title: 'Miten keskustan ruuhkia vähennetään?' }
  );
  for (const [oid, title, reasons] of DEEP) {
    p = run(p, { type: 'node.add', id: oid, parentId: 'root', relation: 'option', title });
    p = addReasons(p, oid, reasons, false);
  }
  return run(p, { type: 'layout.auto' });
}

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

function table(project: Project, options: [string, string, ...unknown[]][]): void {
  for (const [oid, title, ...rest] of options) {
    const nets = [SCORING_V4, SCORING_LOGODDS, SCORING_SIGNED, SCORING_V3].map((scoring) => {
      const score = evaluate({ ...project, settings: { ...project.settings, scoring } }).get(oid)?.score;
      return score == null ? '—' : (2 * score - 100).toFixed(1);
    });
    const reasons = rest.find(Array.isArray) as Reason[];
    console.log(
      `${title} (${depthOf(reasons)} levels): v4 ${nets[0]} · log-odds ${nets[1]} · signed ${nets[2]} · v3 ${nets[3]}`
    );
  }
}

if (process.argv[1]?.endsWith('build-scoring-example.ts')) {
  const dir = path.join(process.cwd(), 'public', 'examples');
  const files: [string, Project, [string, string, ...unknown[]][]][] = [
    ['laskentatapojen-vertailu.witt.json', scoringExample(), OPTIONS],
    ['syva-vaittely-ruuhkat.witt.json', deepExample(), DEEP],
  ];
  for (const [name, project, options] of files) {
    writeFileSync(path.join(dir, name), serializeProjectFile(project));
    console.log(`build-scoring-example: ${name}, ${project.nodes.length} nodes`);
    if (process.argv.includes('--table')) table(project, options);
  }
}
