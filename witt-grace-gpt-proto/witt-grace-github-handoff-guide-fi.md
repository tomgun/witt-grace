# WITT / GRACE: siirtopaketti GitHubiin ja Claude Codeen

Tämä on **nykyisen toimivan dev32-prototyypin kehityksen luovutus**, ei uusi ominaisuusversio eikä vielä P2P-julkaisu. Sovelluksen GRACE-laskenta, tiedostomalli ja visuaalinen toiminta on jätetty ennalleen. Handoffiin on lisätty tekniset dokumentit, testivarmistukset ja GitHub Actions -pohjat.

## Mitä on jo olemassa

- Kaksi tilaa, **Argumentointi** ja **Päätös**, sekä luettava puu ja taulukkonäkymä, suora arviointi ja valinnainen opastettu arviointikierros.
- GRACE: uskottavuus 0–100 %, suhteen merkitys −5…+5, rekursiivinen laskenta ja näkyvä perustelusaldo −100…+100. Laskettu tulos ei ole objektiivinen todennäköisyys.
- Eri ihmisille erilliset arviot, tasapainoinen tai osuuksilla painotettu keskiarvo, AI:n oma näkökulma ja erillinen päätösäänestys.
- Päätösvaihtoehtojen ryhmät, toistuvien perusteluiden kirjastokortit ja eri käyttökohteiden erilliset arviot. Lisäyhteydet ovat osa nykyistä pisteytystä; tarkoituksellisia rinnakkaisia vaikutusreittejä ei hävitetä.
- Paikalliset käyttäjät, kommentit, JSON-tuonti ja -vienti, usean käyttäjän ehdotusten siirto ja AI-tehtävän muodostaminen ilman automaattista tekoälypalvelukutsua.
- Ulkoasuteemat (myös **Bitberg**), siirrettävät Näkymäasetukset, ylä/ala/vasen/oikea paneelien pikanäppäimet, suuren puun PNG/SVG/PDF-vienti ja mobiiliin sovitettu käyttöliittymä.

**P2P-huoneita ei vielä voi perustaa verkossa.** Niiden suunnitelma on erillinen ja tietokannaton. Myöskään automaattisia pilvivarmistuksia tai palvelinkäyttäjätunnuksia ei ole.

## Millä tavalla Claude Code jatkaa

1. Avaa repossa `CLAUDE.md` ja `docs/HANDOFF_START_HERE.md`. Näissä erotetaan voimassa oleva speksi historiallisista kehitysmuistiinpanoista.
2. Tarkista `npm run check`, `npm run build` ja `node tools/verify-pages-build.cjs`.
3. Tee ensimmäinen PR vain toimivan dev32-prototyypin julkaisuun ja varmistamiseen GitHub Pagesissa.
4. Lisää seuraavissa PR:issä karakterisointitestit, moduulirajat, mahdollisesti TypeScript/Vite ja UI-arkkitehtuurin parannukset **yksi kerrallaan**. React tai muu käyttöliittymäkehys valitaan perustellulla ADR-päätöksellä, ei oletusarvoisesti.
5. Säilytä menetelmän laskenta, erilliset käyttäjä- ja AI-arviot ja tähän asti hiotut käyttöliittymän toiminnot, ellei käyttäjä päätä tarkoituksellisesta muutoksesta.

## GitHubin käyttöönotto

Luo itse repo ja vie ZIP:n `witt-grace/`-hakemiston sisältö repositorion juureen. Komennot ja Pages-asetukset löytyvät englanninkielisestä [GitHub-ohjeesta](docs/GITHUB_SETUP.md). `.github/workflows/ci.yml` tekee testit PR:issä ja `.github/workflows/pages.yml` julkaisee `main`-haarasta `dist/`-hakemiston staattisena sivustona, kun Pages on asetettu GitHub Actions -tilaan.

**Huomio:** Pagesin verkkosivu on julkinen. Selaimen paikallinen tallennus ei siirry automaattisesti paikalliselta `file://`-osoitteelta Pagesiin. Jos työt ovat arvokkaita, vie ne ensin JSON-tiedostoiksi. Sovellukseen pakatut esimerkkisisällöt näkyvät julkisessa `src/examples.js`-tiedostossa; tarkista ne ennen julkaisua. GitHub Pagesin projektisivut voivat jakaa saman origin-tallennustilan saman tilin muiden projektisivujen kanssa: yksityisiä päätöksiä varten harkitse omaa verkkotunnusta ja tietoturvakatselmusta.

## Sisällön hakemisto

- [Tässä handoffissa voimassa olevat sopimukset](docs/HANDOFF_START_HERE.md)
- [GRACE-laskennan ja tietomallin sopimus](docs/specifications/CURRENT_GRACE_AND_DATA.md)
- [Käyttöliittymän yksityiskohtainen sopimus](docs/specifications/UX_AND_WORKFLOWS.md)
- [Käyttäjät, AI ja äänestys](docs/specifications/IDENTITY_AI_AND_VOTING.md)
- [Vaatimusten tila ja testijäljitettävyys](docs/specifications/REQUIREMENTS_TRACEABILITY.md)
- [Arkkitehtuurikatselmus](docs/ARCHITECTURE_AUDIT_DEV32.md)
- [PR-refaktorointijärjestys](docs/REFACTOR_PR_ROADMAP.md)
- [P2P ilman tietokantaa](docs/P2P_NO_DATABASE_RFC_R1.md)
- [Testien ja julkaisun laatuportit](docs/TESTING_AND_RELEASE.md)

Vanhentuneet agenttiohjeet, aikaisemmat speksiversiot ja vanhat selainkokeet on siirretty **erilliseen historia-ZIPiin**. Ne eivät kuulu repositorion aktiivisiin Claude-ohjeisiin. Toteutuksen lähdekoodi on ensisijainen todiste nykyisestä toiminnasta.
