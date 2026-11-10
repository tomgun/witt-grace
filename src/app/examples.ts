// The example manifest for #examplesDialog, apart from the dialog so unit tests can read it without JSX.
export interface ExampleEntry {
  id: string;
  title: string;
  description: string;
  filename: string;
  participants: string[];
  nodeCount: number;
}
/** The prototype's `Examples.list()` verbatim (fictional data; the files are byte-equal copies of its fixtures). */
export const EXAMPLES: readonly ExampleEntry[] = [
  {
    id: 'painonhallinta',
    title: 'Painonhallinta: mikä on kestävä tapa?',
    description: 'Liikunta, nälkä, ruoan mieluisuus, aika ja yksilöllinen sopivuus.',
    filename: 'debate-painonhallinta.witt.json',
    participants: ['Aada · aktiiviliikkuja', 'Beni · kiireinen arki', 'Caro · ruoan ilo ja terveys'],
    nodeCount: 13,
  },
  {
    id: 'etatyomalli',
    title: 'Etä- ja lähityö: yhteinen työskentelymalli',
    description: 'Kolmen toimistopäivän mallia arvioivat eri työtilanteissa olevat.',
    filename: 'debate-etatyomalli.witt.json',
    participants: ['Eeva · tiiminvetäjä', 'Oskari · keskittymistehtävät', 'Mira · pitkä työmatka'],
    nodeCount: 12,
  },
  {
    id: 'kaupunkiliikenne',
    title: 'Kaupunkiliikenne: keskustan läpiajo',
    description: 'Asukkaan, yrittäjän ja esteettömyyden näkökulmat.',
    filename: 'debate-kaupunkiliikenne.witt.json',
    participants: ['Leena · keskustan asukas', 'Joonas · yrittäjä', 'Sari · esteettömyys'],
    nodeCount: 11,
  },
  {
    id: 'tekoalykehitys',
    title: 'Tekoälyagentit ohjelmistokehityksessä',
    description: 'Tuottavuuden, tietoturvan ja toimitusvastuun vertailu.',
    filename: 'debate-tekoalykehitys.witt.json',
    participants: ['Noora · turvallisuus', 'Tuomas · kehittäjä', 'Veera · toimitus'],
    nodeCount: 11,
  },
  {
    id: 'pilvialusta',
    title: 'Päätöksenteko: pilvialustan valinta',
    description: 'Kolme arvioijaa, faktat ja arvostukset, erisuuntaiset vaikutukset sekä reunaehdot.',
    filename: 'debate-pilvialusta.witt.json',
    participants: ['Aino', 'Bertta', 'Caro'],
    nodeCount: 12,
  },
  // Added after the prototype (owner 2026-11-09): criteria-based evaluation two ways, built from domain commands by
  // scripts/build-recruitment-examples.ts. Fictional people and data.
  {
    id: 'rekry-yksi',
    title: 'Rekrytointi: sopiiko kandidaatti K?',
    description: 'Yksi kandidaatti, kriteerit väitteinä: kriteerin vaikutus pääväitteeseen on sen painoarvo.',
    filename: 'rekrytointi-yksi-kandidaatti.witt.json',
    participants: ['Aino · myyntijohtaja', 'Bertil · HR', 'Ceren · tiimin myyjä'],
    nodeCount: 10,
  },
  {
    id: 'rekry-kolme',
    title: 'Rekrytointi: kolme kandidaattia',
    description: 'Kandidaatit vaihtoehtoina, samat kriteerit toistuvina perusteluina kunkin alla.',
    filename: 'rekrytointi-kolme-kandidaattia.witt.json',
    participants: ['Aino · myyntijohtaja', 'Bertil · HR', 'Ceren · tiimin myyjä'],
    nodeCount: 13,
  },
  // Added 2026-11-10 (owner): the same decision under every calculation method, built by
  // scripts/build-scoring-example.ts. Fictional data.
  {
    id: 'laskentavertailu',
    title: 'Laskentatapojen vertailu: tietokoneiden uusiminen',
    description:
      'Neljä vaihtoehtoa: yhdellä parikymmentä pientä perustetta, yhdellä syvä puu, kahdella muutama vahva. Vaihda Arviointi → Laskentatapa ja vertaa nettoja.',
    filename: 'laskentatapojen-vertailu.witt.json',
    participants: ['Arvioija'],
    nodeCount: 44,
  },
];
