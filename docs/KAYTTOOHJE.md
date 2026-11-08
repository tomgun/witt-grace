# WITT – käyttöohje (uusi sovellus, versio 0.1)

Tämä ohje kuvaa sen, mitä uusi sovellus osaa tänään. Prototyyppi (dev32) on käytettävissä osoitteessa `proto/`, ja siinä on vielä enemmän ominaisuuksia; tämä ohje päivitetään jokaisen ominaisuuden mukana.

## Mikä WITT on

WITT on selaimessa toimiva työkalu, jolla piirretään argumenttipuu tai verrataan päätösvaihtoehtoja GRACE-menetelmällä. Kaikki tallentuu omaan selaimeesi; mitään ei lähetetä palvelimelle. Työn voi viedä `.witt.json`-tiedostoksi ja avata myöhemmin tai toisella laitteella.

Jokainen henkilö arvioi jokaisen perusteen kahdella asteikolla:

- **Uskottavuus** 0–100 %: kuinka todennäköisesti peruste pitää paikkansa tässä yhteydessä.
- **Vaikutus** −5…+5 (puolen pisteen askelin): kuinka voimakkaasti peruste puoltaa (+) tai vastustaa (−) ylempää väitettä tai vaihtoehtoa.

Niistä lasketaan **perustelutulos** −100…+100. Se on selittävä mittari, ei totuuden todennäköisyys eikä äänestystulos. Arvioimaton kohta näytetään viivana (—), ei nollana, ja keskeneräinen laskenta merkitään tähdellä.

## Näytön osat

- **Yläpalkki**: asiakirjan nimi, neljä paneelipainiketta (vasen, ylä, oikea, ala; myös `Alt+1`…`Alt+4`), kieli ja ulkoasuteema (Vaalea, Tumma, Paperi, Bitberg).
- **Työkalupalkki**: tila *Argumentointi* tai *Päätös*, käyttäjävalitsin (`+ Lisää käyttäjä` lisää paikallisen henkilön), näkökulma *Yhteinen* / *Oma arvio*, näkymä *Puu* / *Taulukko* sekä valikot Tiedosto, Muokkaa, Arviointi, Näkymä ja Apua.
- **Vasen paneeli**: puurakenne listana ja välilehti *Yhteydet ja perustelut* (toistuvien perustelujen kirjasto).
- **Keskellä**: puu kortteina. Vedä korttia siirtääksesi sen; vedä taustaa siirtääksesi näkymää; `Ctrl/Cmd` + rulla zoomaa; `0` sovittaa puun näkymään.
- **Oikea paneeli**: valitun solmun tiedot ja arviot.
- **Alapalkki** (`Alt+4`): rakenteen pikatoiminnot.

## Argumentointi

1. Kirjoita pääväite oikean paneelin kenttään *Väite / otsikko*.
2. Lisää perusteluja: paina `+` (puoltava) tai `−` (vastustava) kun puu on aktiivinen, tai käytä Muokkaa-valikkoa tai alapalkkia. Uusi kortti aukeaa heti muokattavaksi.
3. Arvioi peruste oikean paneelin kohdassa *Oma arvio*: säädä uskottavuus ja vaikutus ja paina *Vahvista*. Kortissa näkyy oma arviosi muodossa `75%/+5`.
4. Pääväitteen perustelutulos päivittyy heti. Yksi täysin uskottava +5-peruste antaa +50, kaksi +100, yksi −5-vastaväite −50.
5. Vastaväitteen vastaväite puoltaa alkuperäistä väitettä: arvio koskee aina suhdetta välittömään vanhempaan.

## Päätös

1. Valitse tila *Päätös*. Juuri on päätöskysymys, jolle ei anneta totuusarviota.
2. Lisää vaihtoehtoja (`+ Päätösvaihtoehto`) ja niiden alle puoltavia ja vastustavia perusteita.
3. Juuren tiedoissa näkyy *Vaihtoehtojen tarkastelu*: kelpoisuus (ehdottomat rajoitteet ja esiehdot), perustelutulos ja mahdollinen kannatus.
4. Reunaehto: valitse perusteen lajiksi *Ehdoton rajoite* tai *Esiehto* ja merkitse, täyttyykö se. Täyttymätön ehto estää vaihtoehdon riippumatta pisteistä.
5. Äänestys (Arviointi → Päätösäänestys): omistaja avaa kierroksen, jolloin äänipainot lukitaan. Jokainen antaa kannatuksen 0–100 vaihtoehdoille. Omistaja sulkee kierroksen, ja tulokset näytetään. Äänestys on paikallinen eikä salainen.

## Henkilöt ja näkökulmat

- Arviointi → *Käyttäjät*: nimet, äänimäärät ja yhteisen tuloksen painotus (tasapainoinen, osuuksilla painotettu tai asiakirjan lähtöarvot).
- Vaihda käyttäjää työkalupalkista. Jokaisen arviot pysyvät erillään; nimen voi vaihtaa, tunniste säilyy.
- *Oma arvio* -näkökulma laskee tuloksen vain omista arvioistasi. *Yhteinen* laskee ihmisten keskiarvon; AI-profiilit eivät kuulu siihen.

## Toistuvat perustelut

Sama perustelu voi vaikuttaa useaan vaihtoehtoon eri tavalla. Valitse peruste ja paina *Liitä myös muihin solmuihin…*, valitse kohde: syntyy uusi käyttökohta, jolla on omat arviot. Vasemman paneelin välilehti *Yhteydet ja perustelut* näyttää kirjaston: luo kortti, katso jokaisen käyttökohdan arviot, liitä kortti valittuun solmuun.

## Taulukko

*Taulukko*-näkymä listaa kaikki väitteet loogisessa järjestyksessä: suhde, asiayhteys, oma uskottavuus ja vaikutus sekä perustelutulos. Haku ja suodatin rajaavat listaa; väitteen nimi valitsee sen.

## Tiedostot ja tallennus

- Työ tallentuu automaattisesti selaimeen (*Tallennettu selaimeen*). Selaintallennus on laitekohtainen eikä varmuuskopio.
- Tiedosto → *Tallenna tiedosto* lataa `.witt.json`-tiedoston. *Avaa JSON* avaa sellaisen. Ennen korvaamista sovellus kertoo, mikä työ on auki.
- `Ctrl/Cmd+Z` kumoaa, `Ctrl/Cmd+Shift+Z` tekee uudelleen. `?` näyttää pikanäppäimet.

## Mitä ei vielä ole

Kuvan ja PDF:n vienti, asiakirjakirjasto, AI-tehtävän muodostus ja ehdotusten tuonti, lukitut yhteisperusteet, lisäyhteydet, opastettu harjoitus ja esimerkit. Ne löytyvät prototyypistä (`proto/`) ja tulevat tähän sovellukseen vaihe kerrallaan (`docs/ISSUE-PLAN.md`).
