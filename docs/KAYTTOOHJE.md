# WITT – käyttöohje

Tämä ohje kuvaa uuden sovelluksen sellaisena kuin se nyt on. Sovellus toistaa jäädytetyn prototyypin (dev32, osoitteessa `proto/`) käyttöliittymän alue alueelta; prototyypin näkyvä käyttöliittymä on sopimus (`docs/spec/UI_INVENTORY.md`). Kolme AI-ikkunaa (uuden puun luonti AI:n avulla, muutosehdotus ja AI:n arviot) sekä JSON-tuonnin tarkistus rakennetaan parhaillaan; ne kuvataan tässä sellaisina kuin ne sopimuksen mukaan toimivat.

## 1. Mikä WITT on

WITT (Web Interactive Thinking Tool) on selaimessa toimiva työkalu GRACE-menetelmään (Günther's Reflective Argumentation & Collaborative Evaluation). Sillä piirretään argumenttipuu pääväitteen alle (**Argumentointi**) tai verrataan päätösvaihtoehtoja päätöskysymyksen alla (**Päätös**). Työ etenee kolmessa työvaiheessa: **Kartoita** (väitteet, vaihtoehdot ja perustelut esiin), **Punnitse** (uskottavuus ja vaikutus arvioidaan erikseen) ja päätöstilassa **Päätösäänestys**.

Jokainen käyttäjä arvioi jokaisen perustelun täsmälleen kahdella asteikolla:

- **Uskottavuus** 0–100 %: kuinka todennäköisesti peruste pitää paikkansa tai sen kuvaama asia toteutuu.
- **Vaikutus** −5…+5 puolen pisteen askelin: kuinka voimakkaasti ja mihin suuntaan peruste vaikuttaa välittömään vanhempaansa. Plus puoltaa, miinus vastustaa, 0 on neutraali.

Kolmatta asteikkoa (yleistä tärkeyttä tai hyötyä) ei ole, eikä sitä tule.

Niistä lasketaan **Perustelutulos −100…+100**, jossa 0 on neutraali. Sanallisesti: jokainen aliperustelu tuo vanhemmalleen 10 × arvioitu vaikutus × lapsen laskennallinen vahvuus / 100; vaikutukset etenevät lehdistä ylöspäin ja tulos rajataan välille −100…+100. Yksi täysin uskottava +5-puolto antaa +50, kaksi erillistä +100, yksi −5-vastaväite −50. Vastaväitteen vastaväite puoltaa alkuperäistä väitettä, koska arvio koskee aina suhdetta välittömään vanhempaan. Päätösvaihtoehto alkaa nollasta. Perustelutulos on selittävä tunnusluku: ei todennäköisyys, ei äänestystulos eikä päätössuositus.

**Puuttuva ei ole nolla.** Arvioimaton kohta näkyy viivana (`—`), ei koskaan lukuna 0. Jos laskentaan osallistuvista suhteista osa puuttuu tai on vanhentunut, tulos saa merkin **†** (keskeneräinen). Kortissa näkyvä tiivis merkintä `75%/+5` tarkoittaa uskottavuutta 75 % ja vaikutusta +5; kumpi tahansa puoli voi olla `—`.

## 2. Aloittaminen

**Aloitussivu** avautuu aina ensin (ja ⌂-painikkeesta yläpalkista). Siinä ovat kieli- ja ulkoasuvalinnat, **Tietoa menetelmästä** (lyhenteiden selitykset) ja painikkeet:

- **Jatka edellistä työtä** – näkyy, kun selaimessa on luettava tallennus; avaa sen työtilaan.
- **+ Luo uusi asiakirja** – avaa **Uusi työ** -ikkunan: *Tyhjä argumenttipuu*, *Tyhjä päätöspuu* tai *Luo uusi puu AI:n avulla*. Jos sinulla on työ auki, uuden aloittaminen kysyy vahvistuksen ja korvaa nykyisen työn.
- **Avaa tiedosto** – avaa `.witt.json`-tiedoston (ks. luku 7).
- **Kokeile esimerkkiä** – **Harjoitusesimerkit**: viisi kuvitteellista kolmen arvioijan keskustelua (mm. painonhallinta, etä- ja lähityö, pilvialustan valinta) sekä kaksi rekrytointiesimerkkiä: *Sopiiko kandidaatti K?* (kriteerit pääväitteen alla väitteinä; kriteerin vaikutus pääväitteeseen on sen painoarvo) ja *Kolme kandidaattia* (kandidaatit vaihtoehtoina, samat kriteerit toistuvina perusteluina kunkin alla). Niistä näkee myös nykyisen mallin rajan: alle neutraalin jäävä kriteeri (esim. −16.7) nostaa kokonaistulosta silti hieman, koska perustelun vahvuus on 0…1. Esimerkki avataan uudella tunnisteella, joten se ei koskaan korvaa kirjastoon tallennettua kopiota; monen arvioijan esimerkki avautuu suoraan Punnitse-vaiheeseen.
- **Opastettu harjoitus** – seitsemän askeleen harjoitus tuoreella asiakirjalla (ks. alla).
- **Muut toiminnot** – **Asiakirjakirjasto**, **Luo uusi puu AI:n avulla**, **AI:n tai toisen käyttäjän muutosehdotus**.

Kortti **Jatka keskeneräistä asiakirjaa** näyttää nykyisen työn nimen sekä ajat *Viimeisin selaintallennus*, *Viimeksi avattu JSON* ja *Viimeisin JSON-vienti* (”Tarkka aika ei tiedossa” / ”Ei vielä tietoa”, jos tietoa ei ole). Jos selaimessa on tallennus, jota ei voitu avata, siitä varoitetaan eikä sitä korvata. Jos selain estää tallennuksen, työ säilyy vain avoimessa istunnossa ja siitä varoitetaan.

**Automaattitallennus.** Jokainen muutos tallentuu heti selaimeen (Tiedosto-valikon tila *Tallennettu selaimeen*; *Vain tällä laitteella*, kun tallennusta ei vielä ole tai se ei ole pysyvä; *Selaintallennus epäonnistui – vie JSON-tiedosto*, jos tallennus ei onnistu). Selaintallennus on laite- ja selainkohtainen eikä varmuuskopio.

**Korvausikkuna ”Mitä tehdään nykyiselle työlle?”** avautuu, kun avaat tiedoston, esimerkin, kirjaston asiakirjan tai harjoituksen ja sinulla on jo työ auki. Se näyttää nykyisen työn nimen, tilan ja solmumäärän (*Solmuja: 12*), *Viimeksi muokattu* ja *Automaattitallennus selaimeen* -ajat sekä *Seuraava toiminto*. Vaihtoehdot: **Peruuta**, **Hylkää nykyinen ja jatka** tai **Tallenna kirjastoon ja jatka** (jatkaa vain, jos kirjastotallennus onnistui).

**Asiakirjakirjasto** (Tiedosto → Asiakirjakirjasto tai aloitussivun Muut toiminnot) säilyttää useita asiakirjoja selaimen tietokannassa (IndexedDB). Sinne tallennetaan vain nimenomaisesti: **Tallenna nykyinen kirjastoon**. Jokaisella kortilla on *Avaa*, *Nimeä uudelleen*, *Kopioi* ja *Poista* (ei avoinna olevalle). **Vie kaikki JSONina** lataa koko kirjaston varmuuskopion (`witt-library-backup.json`), **Tuo varmuuskopio** palauttaa sen kysymättä korvaamatta mitään (törmäävät tunnisteet tulevat kopioina), **Päivitä** lukee listan uudelleen. Selaintietojen tyhjennys poistaa kirjaston – vie tärkeät työt myös JSON-tiedostoksi.

**Opastettu harjoitus** (aloitussivu tai Apua → Opastettu harjoitus) luo harjoitusasiakirjan ja avaa siirrettävän paneelin ⠿ (*Harjoitellaan yhdessä*, vaihe 1/7). Askeleet: lisää puoltava peruste, kirjoita se, lisää vastaväite, kirjoita se, siirry Punnitse-tilaan ja arvioi, avaa Taulukko, järjestä tahallaan sekoitettu puu. Paneeli etenee itsestään, kun askel on tehty; **Näytä kohde** tekee tai kohdistaa askeleen, **Ohita vaihe** hyppää yli, × sulkee.

## 3. Kartoittaminen

Työtilassa on yläpalkki (asiakirjan nimi, ↶ Kumoa ja ↷ Tee uudelleen, neljä paneelipainiketta, ? ohje ja pikanäppäimet, kieli, ulkoasuteema), työkalurivi (Argumentointi/Päätös, TYÖVAIHE Kartoita/Punnitse, käyttäjävalitsin, Puu/Taulukko, Näkymäasetukset ja valikot **Tiedosto**, **Muokkaa**, **Arviointi**, **Näkymä**, **Apua**), vasen paneeli (TYÖTILA: välilehdet **Puurakenne** ja **Yhteydet ja perustelut** sekä LISÄÄ VALITTUUN SOLMUUN), keskellä puu kortteina ja oikealla VALITTU SOLMU / **Muokkaa argumenttia**. Alapalkki **Rakenne** (`Alt+4`) on oletuksena piilossa.

**Kortit.** Jokainen solmu on kortti: suhdemerkintä (PÄÄVÄITE, PUOLTAA, VASTUSTAA, VAIHTOEHTO, PÄÄTÖS), otsikko, Punnitse-vaiheessa perustelutulos ja `75%/+5`. Kortin otsikkorivillä ovat painikkeet **+** (puoltava), **−** (vastainen), päätöstilassa juurella ja ryhmillä **\*** (päätösvaihtoehto) ja **▦** (vaihtoehtoryhmä) sekä **▾/▸** (sulje tai avaa alipuu). Oikeassa reunassa on **×** (poista solmu), joka näkyy, kun kortti on valittu tai hiiri on sen päällä. Solmu, jolla ei ole alisolmuja, poistuu kysymättä (× tai `Del`) ja hiipuu pois sekunnissa; alipuun poisto kysyy vahvistuksen. Kumoa (↶ tai `Ctrl/Cmd+Z`) palauttaa poistetun. Valitse kortti napsauttamalla.

**Lisääminen.** Kohdistuu valittuun solmuun: kortin +/−, vasemman paneelin **+ Puoltava**, **− Vastainen** ja **0** (neutraali), Muokkaa-valikko, alapalkki tai näppäimet `+` ja `−`. Uusi kortti avautuu heti kirjoitettavaksi.

**Muokkaus paikan päällä.** `F2` tai `Enter` valitussa kortissa, kaksoisnapsautus tai Muokkaa → *Muokkaa argumenttia*. `Enter` tallentaa, `Shift+Enter` lisää rivin, `Esc` peruu. Oikean paneelin kentät **Väite / otsikko** ja **Perustelut, lähteet ja huomiot** tallentuvat, kun poistut kentästä. **Alustava suhde vanhempaan** (Puoltava/Vastustava/Neutraali) antaa vain aloitussuunnan: arvioijat voivat arvioida vaikutuksen toiseen suuntaan. **Vanhempi (siirrä alipuuta)** siirtää koko alipuun; sama onnistuu Muokkaa → *Siirrä alipuu*. *Poista alipuu* (`Del`) kysyy vahvistuksen ja on kumottavissa (`Ctrl/Cmd+Z`).

**Solmun valikko** (hiiren oikea painike tai `Shift+F10`): Muokkaa tekstiä, Liitä myös muihin solmuihin…, + Puoltava, − Vastainen, 0 Neutraali, päätöksen juurella + Päätösvaihtoehto, Sulje/Avaa alipuu (välilyönti), Siirrä alipuu, Poista alipuu, Järjestä puu. Toistuville ja lukituille perusteluille lisäksi irrotus käsitteestä tai yhteisperusteesta.

**Raahaus ja näkymä.** Vedä korttia otsikkorivistä tai tekstistä siirtääksesi sen; sijainti tallentuu asiakirjaan ja on kumottavissa. Vedä tyhjää taustaa siirtääksesi näkymää, rulla zoomaa, ⤢ sovittaa puun näkymään. Tiivistetyssä näkymässä kortteja ei voi raahata ennen kuin omat sijainnit palautetaan.

**Puurakenne** vasemmalla listaa solmut sisennettyinä: suhdepiste, otsikko, ▸N kertoo suljetun haaran lapsimäärän. Katkaistun otsikon koko teksti näkyy vihjeenä, kun osoitin tai kohdistus on rivillä.

**Päätöstila.** Valitse **Päätös**. Juuri on päätöskysymys (PÄÄTÖS), jolle ei anneta uskottavuutta. Lisää **+ Päätösvaihtoehto** ja tarvittaessa **+ Vaihtoehtoryhmä** (rakenteellinen ryhmä: ei omaa arviota, tulosta, reunaehtoa eikä ääntä; ryhmän alle lisätään konkreettiset vaihtoehdot). Vaihtoehtojen alle lisätään puoltavat ja vastustavat perusteet. Argumentointi-tilaan ei voi palata ennen kuin vaihtoehdot on poistettu, eikä vaihtoehtoja voi lisätä avoimen äänestyskierroksen aikana.

**Toistuvat perustelut.** Sama perustelu voi vaikuttaa useaan kohteeseen eri tavalla; jokainen käyttökohta arvioidaan erikseen. Vasemman paneelin välilehti **Yhteydet ja perustelut** (myös Muokkaa → *Toistuvat perustelut*):

- **Uusi perustelu kirjastoon** + **Luo kirjastoon** luo kortin (tyhjä otsikko → ”Uusi perustelu”). *Lisäasetukset*: **Perustelun luonne** (Tosiasia tai seuraus / Oletus / Arvostus) ja **Arviointien jakaminen**: *Arviot kohteittain* (suositus) tai *Sama lukittu arvio*, jolloin annetaan yksi kiinteä uskottavuus ja vaikutus kaikille käyttökohdille.
- **Kirjaston perustelut**: kortin voi vetää puun solmuun tai valita, jolloin oikea paneeli näyttää nimen, käyttökohdat omine `75%/+5`-arvioineen, **Liitä solmuun** -valitsimen ja **Liitä perustelu** -painikkeen. Käyttämättömän kortin voi poistaa.
- **Tee valitusta perustelusta toistuva** nostaa valitun väitteen kirjastoon; sama tapahtuu oikean paneelin **Liitä myös muihin solmuihin…** -painikkeella, joka avaa kortin kohteen valintaan.
- Käyttökohdan kortissa on merkki **Uudelleen käytetty** ja oikealla laatikko *Hallitse käsitettä* / *Irrota käsitteestä (säilytä arviot)*. Lukitulla yhteisperusteella merkki on **Yhteisperuste · lukittu**, ja sen arvot muutetaan kirjastossa.
- **Useaan kohteeseen vaikuttavat väitteet** ja **Aiemmat yhteysreitit** näyttävät vanhan mallin lisäyhteydet; yhteyden voi avata **Yhteydet**-ikkunaan (voimakkuus −5…+5, oma arvio, keskiarvo, poisto). Lisäyhteys vaikuttaa kohteen perustelutulokseen ja voi laskea saman näytön kahdesti – ikkuna varoittaa tästä.

**Väitteen luonne, lähteet ja tekijätiedot** (oikean paneelin avattava osio): **Väitteen laji** (Määrittelemätön, Tosiasiaväite, Oletus, Arvostus, Ehdoton rajoite, Esiehto), rajoitteille ja esiehdoille **Ehdon toteutuminen**, **Tekijän näyttäminen** (nimi tai anonyymi – tunniste säilyy tiedostossa), **Lähteet / evidenssi** (URL ja huomio) sekä huomautus samankaltaisista väitteistä tai jaetuista lähteistä.

**Kommentit** ovat solmukohtaisia huomioita, eivät argumentteja: *+ Lisää kommentti* oikean paneelin alaosassa. Kun Kommentit-kerros on pois päältä, ne piilotetaan poistamatta.

## 4. Punnitseminen

Valitse TYÖVAIHE **Punnitse**. Kartoita-vaiheessa oikea paneeli näyttää vain huomautuksen *Uskottavuus ja vaikutus arvioidaan Punnitse-tilassa* ja **Punnitse**-painikkeen; Punnitse vaihtaa samalla näkymäkerrokset Analyysi-esiasetukseen.

**Oma arvio paneelista.** Osiossa **Arviointiasetukset** (*Käyttäjänä: nimi*) ovat liukusäätimet **Oma uskottavuusarvio** (0–100 %) ja **Oma vaikutusarvio vanhempaan (−5…+5)**. Päätöksessä vaihtoehdon suoran perustelun säädin on **Oma arvio merkityksestä vaihtoehdolle (−5…+5)**: luku kertoo yhdellä kertaa suunnan, vahvuuden ja sen, kuinka tärkeä asia sinulle on (esim. *En ole treenannut moneen päivään* vaihtoehdon *Uimaan tänään* alla saa sitä suuremman luvun, mitä tärkeämpää säännöllinen treeni sinulle on). Syvemmät perustelut arvioivat edelleen vaikutustaan vanhempaansa. Laskenta on sama, vain sanamuoto eroaa. **Laskentatapa** (Arviointi-valikko, tallentuu asiakirjaan): **Perustelut ratkaisevat** on uusien asiakirjojen oletus. Silloin väitteen tulos tulee vain sen perusteluista, eikä väitteen omaa uskottavuusarviota lasketa; säädin näkyy nimellä *Oma tuntuma (ei vaikuta laskentaan)* ja arvio tallentuu vertailuksi. Jos yhtäkään perustelua ei ole arvioitu, väitteellä ei ole vielä tulosta (—). Lehtisolmun eli perustelun, jolla ei ole omia perusteluja, tulos on edelleen sen oma uskottavuus. **Oma arvio + perustelut (prototyyppi)** on prototyypin tapa: oma arvio on lähtötaso, jota perustelut siirtävät. Prototyypin esimerkit ja tiedostot käyttävät sitä.

**Oma tyyppinimi.** Solmun kentässä *Oma tyyppinimi* voi antaa tyypille oman nimen (valmiit ehdotukset Tosiasia, Kriteeri, Tavoite, Arvo, Periaate, Huomio tai vapaa teksti, enintään 40 merkkiä). Pääväitteessä, vaihtoehdossa ja ryhmässä nimi korvaa kortin tyyppimerkinnän (esim. VAIHTOEHTO → KRITEERI); perustelussa se näkyy omalla rivillään otsikon yläpuolella. Pitkä nimi katkeaa kolmeen pisteeseen, ja koko nimi näkyy hiiren alla. Uusi samantasoinen vaihtoehto, ryhmä tai arvostus saa saman nimen. Nimi ei vaikuta laskentaan; tyhjä kenttä palauttaa oletuksen.

Niin kauan kuin et ole arvioinut, säädin on harmaa ja arvona lukee *—*: kahva odottaa asiakirjan lähtöarvossa, jota laskenta ei käytä. Arvo tallentuu, kun painat tai siirrät säädintä ja päästät irti (myös näkyvään arvoon). Kun tallennat toisen säätimen, myös toinen tallentuu sellaisena kuin se näkyy, jos et ole vielä arvioinut sitä: esimerkiksi pelkkä vaikutuksen asettaminen +3:een tallentaa samalla uskottavuudeksi näkyvän 100 %. Molemmat tallentuvat yhtenä kumottavana askeleena; jos väite tai suhde on muuttunut arvion jälkeen, arvio merkitään vanhentuneeksi ja pyydetään arvioimaan uudelleen. Rivi *Arvioinnin mukaan: Puoltava (+3.7/5)* kertoo arvioidun suunnan; *Arviot henkilöittäin · n / m* listaa näkyvien arvioijien arviot. Arvostuksille, rajoitteille ja esiehdoille ei anneta uskottavuusprosenttia.

**Arviointikierros** (Arviointi → *◉ Arviointikierros*, näppäin `R`) käy väitteet läpi yksi kerrallaan: *Kohta 3/11*, *Arvioitu 2/11*, edistymispalkki, vanhemman asiayhteys, väite ja perustelut, molemmat asteikot. Painikkeet **← Edellinen**, **Ohita →**, **Tallenna ja seuraava →** (`Ctrl/Cmd+Enter`), **Aloita uusi kierros** ja lopussa **Jatka keskeneräisistä**. Edistyminen säilyy tässä selaimessa asiakirjaa ja käyttäjää kohden; arvioiduksi merkitty kohta vanhenee, jos väite, sen vanhempi tai omat arvot muuttuvat.

**Perustelutuloksen lohko** oikeassa paneelissa: tulos (esim. `+47.5 †`) otsikolla *Perustelutulos −100…+100 · 0 neutraali*; vertailu *Yhteinen perustelutulos* / *Arvioijan perustelutulos*; **Uskottavuuden perusarvio** (vaihtoehdolla *Vaihtoehdon neutraali lähtötaso* 0); **Aliperustelujen nettovaikutus**; avattava *Mitä perustelutulos tarkoittaa?* laskusääntöineen ja tämän solmun lukuineen; **Perustelukohtainen erittely**, jossa jokainen aliperustelu kertoo *Vaikutus +3/5 · lapsen laskennallinen vahvuus 80.0/100 · vaikutuspaino 2.40* tai että arvio puuttuu. Jos tulos saavutti rajan ±100, siitä kerrotaan. Lehtisolmulla ei ole johdettua tulosta; sen uskottavuus vaikuttaa ylöspäin.

**Korosta painavimmat ja Δ-luku.** Kun Näkymä-valikon **Korosta painavimmat** on päällä, osa korteista saa korostetun reunan ja merkin **Δ +28.0 p**. Luku vastaa kysymykseen: *kuinka paljon pääväitteen (tai vaihtoehdon) perustelutulos muuttuisi, jos juuri tämä perustelusuhde poistettaisiin ja kaikki muu pysyisi niin kuin on arvioitu?* Luku on aina siinä kortissa, jonka vaikutusta se kuvaa – ei vanhemmassa.

- *Miten se lasketaan.* Perustelutulos lasketaan alhaalta ylös: perustelun osuus vanhempaan on *vaikutus × perustelun oma vahvuus*, ja vanhemman sisäinen arvo on *lähtötaso + 5 × (puoltavat − vastustavat)*, rajattuna välille 0…100 (näkyvä tulos = 2 × sisäinen − 100). Δ poistaa yhden suhteen, laskee vanhemman uudelleen ja vie muutoksen ketjua pitkin ylimpään väitteeseen tai lähimpään vaihtoehtoon, jossa jokaisen välisolmun osuus lasketaan uudelleen.
- *Esimerkki 1.* Pääväite ← A (100 %, +5). Pääväite on +50. Ilman A:ta se olisi neutraalissa lähtötasossa 0, joten A:n kortissa lukee Δ +50.0 p.
- *Esimerkki 2.* Pääväite ← A (80 %, +4) ← B (100 %, −2). B heikentää A:ta: A on +40 (ilman B:tä +60, vaikutus vanhempaan −20). Pääväite on +28. B:n kortissa lukee Δ −4.0 p, koska B:n poistaminen vahvistaisi A:ta ja sen kautta pääväitettä vain 4 pistettä; A:n kortissa Δ +28.0 p.
- *Mihin lukua käytetään.* Se näyttää, mitkä perustelut kantavat tulosta eniten, eli mihin kannattaa keskittyä: mitkä arviot tarkistaa, mistä keskustella ja mitä tietoa hankkia. Se ei ole ääni eikä uusi arvio, eikä se muuta mitään laskentaa.
- *Miksi kaikilla korteilla ei ole lukua.* Merkki näkyy vain kunkin pääväitteen tai vaihtoehdon vahvimmalle viidennekselle (vähintään yhdelle). Kun arvioita muuttaa, merkki voi siirtyä toiseen korttiin.
- *Huomioita.* Eri perustelujen Δ-lukuja ei voi laskea yhteen, koska ylä- ja alarajat (±100) ja yhteinen lähtötaso vaikuttavat niihin. Jos tulos on jo rajalla, yksittäisen perustelun poistaminen voi muuttaa sitä vähän tai ei lainkaan. Arvioimatonta, nollavaikutteista tai ehdon, arvostuksen tai ryhmän kautta kulkevaa suhdetta ei lasketa. Luku seuraa valittua näkökulmaa (yhteinen tai yhden arvioijan). Hiiren alla näkyy tarkka selitys: nykyinen tulos, tulos ilman suhdetta ja erotus sekä sama suoraan vanhempaan.

**Käyttäjien arvioiden näkyminen** (Arviointi-valikko, taulukon painike tai Vain puu -tilan pikapainike) valitsee, keiden arviot näkyvät: **Kaikki**, **Vain nykyinen** tai valintaruudut henkilöittäin. Suodatus on katselutapa: se ei muuta asiakirjaa eikä ääniä, ja yhteinen perustelutulos piilotetaan, koska sitä ei lasketa osajoukolle. Ikkuna näyttää *Suurimmat arvioerot* (0 / ⇄ / ± -merkinnät) ja *Lähimmät arvioijaparit*; luvut kuvaavat arvioita, eivät ihmisiä.

**Yhteinen ja oma näkökulma.** Arviointi → **Perustelutulos**: **Yhteinen** (ihmisten arviot; *vain ihmiset*, kun mukana on AI-profiileja), **Oma arvio · nimi** tai toisen arvioijan näkökulma. Omassa näkökulmassa reunat värjäytyvät oman arvion mukaan ja arvioimaton suhde näkyy katkoviivana. Kun katselet toisen arvioijan tuloksia, työkalurivin alla lukee *Näytetään arvioijan X tulokset · muokkaat edelleen käyttäjänä Y* ja **Näytä omat arviot** palauttaa oman näkökulman; toisen arviot ovat vain luettavissa.

**Yhteisen tuloksen laskenta** valitaan Käyttäjät-ikkunassa (vain omistaja): *Rakenteellinen esikatselu (puun arvot)* käyttää puun kirjoitettuja arvoja, *Arvioijien arviot, sama paino kaikilla* ja *Arvioijien arviot, äänimäärillä painotettuna* käyttävät vain annettuja uskottavuus- ja ajantasaisia vaikutusarvioita. Puuttuva arvio ei ole nolla. Valinta tallentuu asiakirjaan.

**AI-näkökulmat pysyvät erillään.** AI-profiili (merkintä *· AI*) syntyy vain tuonnista (AI:n luoma puu tai muutosehdotus). Sen arviot eivät koskaan sekoitu ihmisten yhteiseen tulokseen eivätkä äänestykseen. Kun asiakirjassa on AI-profiili, työkaluriville ilmestyy **AI:n arviot**: ikkuna *AI:n arviot ja päätösvaihtoehdot* valitsee AI-arvioijan, näyttää sen arvioiden määrän ja *Vaihtoehtojen indeksit AI:n arvioilla*, tarjoaa valinnan *Korosta vahvimmat vaihtoehdot* ja painikkeen **Näytä AI:n näkökulma puussa**, joka vaihtaa perustelutuloksen kyseisen AI:n näkökulmaan.

## 5. Päättäminen

**Vaihtoehtojen tarkastelu.** Päätöstilassa Punnitse-vaiheessa juuren paneeli listaa vaihtoehdot järjestyksessä: ensin toteuttamiskelpoisuus, sitten arvioinnin täydellisyys, sitten perustelutulos. Estetty vaihtoehto näkyy ⛔, selvitettävä ?, muuten tulos. Rivillä lukee myös *Arvostuksia arvioitu 2/3*. Tulos ei ole päätössuositus eikä odotettu hyöty. Omassa näkökulmassa päätöstilassa Näkymä → *Korosta vahvimmat vaihtoehdot* merkitsee kärkivaihtoehdon.

**Reunaehdot.** Anna perusteelle laji **Ehdoton rajoite** tai **Esiehto** ja merkitse **Ehdon toteutuminen**: *Ei tiedossa*, *Täyttyy* tai *Ei täyty*. Vaihtoehdon **Toteuttamiskelpoisuus** on *Ei tiedossa olevia esteitä*, *Selvitettävä* (jokin ehto tuntematon) tai *Estetty* (jokin ehto ei täyty) – ehto estää pisteistä riippumatta eikä koskaan muutu negatiiviseksi painoksi. Vain vaihtoehdon oman alipuun ehdot lasketaan.

**Arvostukset.** Lajin **Arvostus** peruste ilmaisee mieltymyksen: sille ei anneta uskottavuusprosenttia, vain vaikutus −5…+5 tälle vaihtoehdolle. Vaihtoehdon paneelissa on **Vaihtoehdon arvostukset** (oma vaikutus ja ryhmän jakauma arvostuksittain) ja juuren paneelissa **Arvostusten vaikutus vaihtoehtoihin** -taulukko. Tämä ei ole uusi tärkeysasteikko.

**Päätösäänestys** (työkalurivin TYÖVAIHE-ryhmän painike tai juuren ja vaihtoehtojen paneelin painike) on erillinen, vapaaehtoinen kannatusäänestys, joka ei vaikuta perustelutulokseen:

- Ennen kierrosta: **Äänipainot** (*Yksi ääni per osallistuja* / *Osallistujakohtaiset äänimäärät*), *Piilota välitulokset kierroksen loppuun* (oletus päällä), *Nimetön tulosnäkymä*, **Käyttäjät**-painike äänimäärien asettamiseen. Jokaisen vaihtoehdon kohdalla näkyy *Arviointivaiheen perustelutulos*.
- Omistaja painaa **Aloita äänestyskierros**; painot lukitaan avattaessa. Vanhat kannatusäänet sisältyvät kierrokseen (siitä kysytään).
- Jokainen valitsee oman käyttäjänsä työkalurivistä, asettaa 0–100-säätimen vaihtoehdoittain ja painaa **Tallenna ääni** (tai **Peruuta ääni**). AI-profiili ja katselija eivät voi äänestää.
- Omistaja painaa **Sulje kierros ja näytä tulokset**. *Tulokset ja laskenta*: Kannatuspiste = summa(äänipaino × kannatus 0–100) / äänipainojen summa, äänestäjämäärä ja yhteispaino; *Äänet osallistujittain* (ellei nimetön); *Äänestystapahtumien kirjaus*; *Aiemmat äänestyskierrokset* arkistoituvat tuloksineen.
- Äänestys on paikallinen eikä salainen: nimetön esitystapa piilottaa nimet näytöstä, mutta tunnisteet ja äänet säilyvät JSONissa.

**Käyttäjät ja äänimäärät** (Arviointi → **Käyttäjät**): **Oma käyttäjänimi**, **Yhteisen arviointituloksen laskenta** (ks. luku 4) ja rivi jokaisesta käyttäjästä: *Nimi*, *Äänimäärä* (kokonaisluku; ei muutettavissa avoimen kierroksen aikana), arvioiden määrät (*11 uskottavuus · 10 vaikutus*), **Valittuna** / **Vaihda tähän** ja **Poista** (ei omistajaa). **+ Lisää käyttäjä** (vain omistaja, enintään 100) tai työkalurivin käyttäjävalitsimen *+ Lisää paikallinen käyttäjä…*. Nimen on oltava yksilöllinen; nimen voi vaihtaa, tunniste säilyy, eikä tuodun tekijän työtä koskaan nimetä uudelleen. Katselijaprofiili ei voi muokata. Tämä on paikallinen käyttäjävalinta ilman tunnistautumista.

## 6. Näkymät

**Puu / Taulukko** (työkalurivi, `T`). Taulukko (*Argumentit taulukkona*) listaa kaikki väitteet loogisessa järjestyksessä, myös suljettujen haarojen (merkki ◌): sarakkeet **Väite**, **Suhde** (suhde välittömään vanhempaan; *ketjun suunta* -huomautus, kun ketjun suunta pääväitteeseen nähden poikkeaa), **Asiayhteys** (vanhempi ja isovanhempi), Punnitse-vaiheessa **Uskottavuus**, **Vaikutus** ja **Perustelutulos** (esim. `85 % (3)` = kolmen arvioijan keskiarvo, `*` = asiakirjan lähtöarvo, `+47.5 †`, `—`) sekä **Tiedot**. **Etsi väitteistä**, suodatin *Kaikki suhteet* / Puoltava / Vastustava / Päätösvaihtoehto, **Käyttäjien arvioiden näkyminen** ja *Näytä kommentit*. *Avaa tarkemmin* avaa rivin alle kortit *Perustelut ja kommentit*, *Arviointi*, *Osallistujien arviot tiedostossa* ja *Lisäyhteydet* sekä painikkeen **Näytä puussa**, joka avaa suljetun polun ja keskittää solmun. Kapealla näytöllä taulukon tilalla on korttilista, jossa voi myös lisätä puoltavan tai vastaisen väitteen.

**Näkymäasetukset** (työkalurivin painike, Näkymä-valikko tai `Alt+V`) on kelluva paneeli: ⠿ siirtää (myös nuolinäppäimillä; kaksoisnapsautus palauttaa paikan), − pienentää, × sulkee. Paikka muistetaan selaimessa.

- **NÄKYMÄKERROKSET**: esiasetukset **Tiivis**, **Analyysi**, **Kaikki tiedot** ja **Omat valinnat**; **Säädä** avaa seitsemän kerrosta: Otsikkorivi ja argumenttityyppi, Perustelut / muistiinpanot, Perustelusaldo, Arviot tiiviisti (75%/+5 = uskottavuus / vaikutus), Kommentit, Alisolmujen määrä, Lisäyhteydet (katkoviivat); lisäksi *Näytä toistuvat perustelut myös puussa*. Väitteen teksti näkyy aina. Kartoita asettaa kerrokset Tiivis + Kommentit, Punnitse Analyysi + Kommentit.
- **Puun suunta**: → Vasemmalta oikealle, ↓ Ylhäältä alas, ✣ Neljä suuntaa (haarat juuren ympärille; omat siirrot tallentuvat poikkeamina). **Järjestä puu** (`Alt+A`) asettelee puun uudelleen (kumottavissa) tai tiivistää näkyvän puun, jos haaroja on suljettu; **Sovita näkymään** (`0`); **Tiivistä näkyvä puu** / *Palauta solmujen omat sijainnit*; päätöstilassa **Näytä vain päätösvaihtoehdot** / *Avaa vaihtoehtojen perustelut* (`Alt+Shift+O`).
- **Avaa puuta tasoittain**: liukusäädin *Vain juuri* … *Kaikki lehdet* näyttää puun valittuun syvyyteen asti muuttamatta asiakirjaa; *Omat avaukset* tarkoittaa käsin tehtyjä sulkemisia, **Palauta omat avaukset** palaa niihin. Tasorajan aikana haaran avaaminen tai sulkeminen on vain näkymän muutos.
- **HAARAN KOROSTUS**: **Kaikki**, **+ Puoltavat** tai **− Vastustavat** korostaa valitun suunnan perustelut ja himmentää muut; vastaväitteen vastaväite lasketaan puoltavaksi. **◎ Valittu haara** vaihtaa lähtökohdan (oletus *Koko puu*). Suljetuista haaroista osumat näytetään tilapäisesti; sulkemistila säilyy.

**Vain puu** (Näkymä → ⛶ Vain puu, `F`; `Esc` palaa) piilottaa paneelit ja näyttää puun päällä pikapainikkeet: Vain puu, puun suunta, Järjestä puu, Kumoa, käyttäjä, Arviointikierros, Muokkaa tekstiä, Käyttäjien arvioiden näkyminen, Pikanäppäimet.

**Paneelit** `Alt+1` vasen, `Alt+2` yläpalkki (työkalurivi), `Alt+3` oikea, `Alt+4` alapalkki; yläpalkin painikkeet ◧ ▤ ◨ ▥. Valinta muistetaan selaimessa. Kapealla ikkunalla (≤ 1000 px) vasen paneeli alkaa piilotettuna, ja ≤ 600 px ikkuna avautuu taulukkoon; 390 px leveydellä paneelit pinoutuvat.

**Ulkoasuteemat**: ☀ Vaalea, ☾ Tumma, ▤ Paperi, ✦ Tähtikartta, ◇ Hologrammi, ❧ Käsikirjoitus, ❧ Sulkakynä, ◆ Yövärit, ▮ Terminaali (vihreää tekstiä mustalla kuin vanhassa päätteessä), # ASCII (kortit ja puun viivat piirretään merkeistä) ja ✎ Sarjakuva (käsin piirretyn näköinen xkcd-tyyli). Kolme ensimmäistä tallentuvat asiakirjaan (ja kulkevat tiedoston mukana), muut ovat selainkohtaisia. **Kieli**: suomi, saksa, englanti, espanja, ranska, venäjä, kiina (yksinkertaistettu), japani ja korea; vaihtuu heti ja muistetaan selaimessa.

## 7. Tiedostot ja jakaminen

**Tiedosto-valikko**: **+ Uusi**, **Avaa JSON**, **↓ Tallenna tiedosto** (`Ctrl/Cmd+S`; lataa `<otsikko>.witt.json`, tallennus näkyy aloitussivun kortissa), **Vie kuva / PDF**, **Asiakirjakirjasto**, **AI:n tai toisen käyttäjän muutosehdotus** ja tallennustila.

**JSON-tiedosto.** `.witt.json` (skeema v8, laskenta `evidence-v3-links`) sisältää koko asiakirjan ja on sama tavu tavulta kuin prototyypin vienti. Avattaessa tiedosto tarkistetaan kokonaan ennen kuin se korvaa mitään: virheellinen tiedosto ei koske avoimeen työhön. **JSON-tuonnin tarkistus** kertoo tiedoston muodon ja jokaisen virheen polun, kuvauksen ja korjausohjeen; **Kopioi korjausraportti** (kielimallille tai itselle) ja **Lataa raportti .txt** (`witt-tuonnin-korjausraportti.txt`). Yli 5 Mt:n tiedosto hylätään. **Avaa JSON** tunnistaa muodon ja ohjaa sen oikeaan paikkaan: WITT-asiakirja (myös arvioimaton AI-luonnos `witt-ai-starter-v1`) korvaa työn korvausikkunan kautta, AI:n luoma puu avautuu esikatseluun, muutosehdotus muutosehdotusikkunaan ja kirjaston varmuuskopio palautetaan kirjastoon vahvistuksen jälkeen.

**Vie kuva / PDF** (*Vie puu kuvaksi tai PDF:ksi*) piirtää puun kuvaksi – ei kuvakaappausta: **Tiedostomuoto** PNG / SVG / PDF; **Vietävä alue** *Nykyinen puunäkymä* tai *Koko puu, myös suljetut haarat*; **Näkyvät tiedot** *Nykyiset näkymäkerrokset* / Tiivis / Analyysi / Kaikki tiedot; **Värimaailma** *Vaalea, tulostukseen* / *Tumma*; valinnat Korosta painavimmat, Lisäyhteydet (katkoviivat), Näytä toistuvat perustelut myös puussa, Tiivistä näkyvät solmut kuvassa. PNG: **PNG-tarkkuus** 1×/2×/3× ja **PNG-vientitapa** (*Yksi PNG, jos mahdollista (muuten ZIP)* / *Jaa PNG-laatoiksi (ZIP)*) sekä kokoarvio (”1816 × 3044 px · 5.5 MP · …”). PDF: **PDF-asettelu** A4 automaattisesti / pystyyn / vaakaan usealle sivulle tai *Yksi sivu (voi pienentyä)*. **Lataa tiedosto** tallentaa; asiakirja ei muutu.

**Luo uusi puu AI:n avulla** (aloitussivu, Uusi työ -ikkuna): *Luo uusi puu kielimallilla* kahdessa vaiheessa.

1. **Luo tehtävä AI:lle**: valitse **Puun tyyppi**, kirjoita **Aihe tai pääväite** ja halutessasi **Pohja-aineisto** (keskustelukatkelmat, muistiinpanot, ohjeet). **Kopioi AI-tehtävä** leikepöydälle tai **Lataa sama tehtävä (TXT)**; *Katso AI-tehtävän koko sisältö* näyttää tekstin, ja *Tekniset lisäasetukset* tarjoaa erillisen JSON-skeeman (se sisältyy jo tehtävään). Liitä teksti itse valitsemaasi kielimalliin – WITT ei lähetä mitään.
2. **Avaa AI:n vastaus**: **Liitä AI:n palauttama JSON** tai **Valitse AI:n vastaustiedosto** ja **Esikatsele ennen hyväksyntää**. Ikkuna *Tarkista uusi AI:n luoma työ* listaa sisällön ja valinnat **Tuo arvioinnit**, **Tuo kommentit**, **Tuo yhteisperusteet** (jos AI:n arvioinnit jätetään pois, myös sen lukitut yhteisperusteet jäävät pois). **Avaa uusi työ** luo asiakirjan, jossa AI on oma AI-profiilinsa – ihmisten yhteinen tulos ei muutu sen arvioista. Muoto on `witt-ai-draft-v2`.

**AI:n tai toisen käyttäjän muutosehdotus** (*Tuo tai vie muutoksia ja arviointeja*) täydentää nykyistä puuta:

1. **Pyydä AI:lta ehdotus nykyiseen puuhun**: **Pyydä kielimallilta** *Täydennä puuta ja ehdota korjauksia* tai *Tee vain oma arviointikierros*; kopioi tehtävä tai lataa TXT. Tehtävä sisältää nykyisen työn ja mahdollisesti henkilötietoja.
2. **Tarkista ja tuo saamasi muutokset ja arviot**: **Liitä muutosehdotus (AI tai toinen WITT)** tai **Valitse ehdotustiedosto** ja **Esikatsele ennen hyväksyntää**. Ikkuna *Valitse hyväksyttävät muutokset* kertoo lähteen (*Ihminen / WITT* nimimerkkeineen tai *Kielimalli / AI*; tiedosto ei todista henkilöllisyyttä), ja ryhmät **Uudet solmut**, **Nykyisten solmujen muokkaukset**, **Lisäyhteydet**, **Yhteisperusteet**, **Tuo arvioinnit**, **Tuo kommentit** sekä kohta kohdalta -valinnat. **Hyväksy ehdotukset** lisää vain valitut; muiden arviot ja päätösäänet eivät muutu, ja vanhentunutta (toiseen versioon tehtyä) ehdotusta ei yhdistetä.
3. **Vie käyttäjien muutokset ja arviot**: valitse alkuperäinen WITT-tiedosto ja vietävät paikalliset käyttäjät; jokaisen muutokset, arviot ja kommentit viedään omalla nimellä ja tunnisteella (`witt-contribution-v2`, usean käyttäjän nippu `witt-contribution-bundle-v1`). Näin kaksi WITT-käyttäjää vaihtaa työtä tiedostoina ilman palvelinta.

## 8. Pikanäppäimet

Pikanäppäimet eivät kaappaa näppäimiä tekstikentissä. Apua → **Pikanäppäimet** (`?`) avaa pikaohjeen, jonka osiossa *Muokattavat pikanäppäimet* yhdeksän komentoa voi sitoa uudelleen (valinnat mm. `+ − * Ctrl+Enter Alt+1…6 Alt+A F H R T ?`; näppäin voi olla vain yhdellä komennolla; *Palauta oletukset*). Asetus säilyy selaimessa.

| Näppäin | Toiminto |
| --- | --- |
| `+` / `−` | Lisää puoltava / vastainen peruste valittuun solmuun (muokattavissa) |
| `Ctrl/Cmd+Enter` / `Ctrl/Cmd+Shift+Enter` | Sama kuin edellä, aina käytössä |
| `,` | Lisää valittuun solmuun arvostus (esim. tavoite tai arvo; ei vaikuta perustelutulokseen, muokattavissa) |
| `*` | Lisää päätösvaihtoehto (päätöstila, muokattavissa) |
| `T` | Puu ⇄ Taulukko (muokattavissa) |
| `F` / `Esc` | Vain puu päälle tai pois / pois (muokattavissa) |
| `R` | Arviointikierros (muokattavissa) |
| `?` | Pikanäppäimet ja pikaohje (muokattavissa; toimii myös aloitussivulla) |
| `Alt+A` | Järjestä puu (muokattavissa) |
| `Alt+V` | Näkymäasetukset |
| `Alt+1` … `Alt+4` | Vasen sivupalkki, yläpalkki, oikea sivupalkki, alapalkki |
| `Alt+Shift+O` | Näytä vain päätösvaihtoehdot / avaa niiden perustelut |
| `Ctrl/Cmd+S` | Tallenna tiedosto (`.witt.json`) |
| `Ctrl/Cmd+Z` · `Ctrl/Cmd+Shift+Z` tai `Ctrl/Cmd+Y` | Kumoa · Tee uudelleen |
| `Del` / `Backspace` | Poista valittu solmu (alipuu kysyy vahvistuksen) |
| `F2` / `Enter` | Muokkaa valitun kortin tekstiä; `Enter` tallentaa, `Shift+Enter` rivinvaihto, `Esc` peruu |
| `Shift+F10` / valikkonäppäin | Solmun valikko |
| `G` | Kohdista puu (valittu kortti) |
| `Home` / `End` | Ensimmäinen / viimeinen näkyvä väite |
| Nuolet (sivupuu →) | ↑/↓ sisarsolmu; → avaa haara tai ensimmäinen lapsi; ← sulje haara tai vanhempi |
| Nuolet (pystypuu ↓) | ←/→ sisarsolmu; ↓ avaa tai ensimmäinen lapsi; ↑ sulje tai vanhempi |
| Nuolet (neljä suuntaa ✣) | Lähin näkyvä solmu painettuun suuntaan |
| Välilyönti | Avaa tai sulje valittu alipuu |
| `Ctrl/Cmd` + `+` / `−` | Lähennä / loitonna |
| `0` | Sovita puu näkymään |
| `Alt` + nuolet | Siirrä näkymää |
| `Ctrl/Cmd+Enter` (arviointikierros) | Tallenna ja seuraava |
| Nuolet (⠿-kahva) | Siirrä Näkymäasetukset- tai harjoituspaneelia 24 px |

## 9. Yksityisyys

- WITT on paikallinen: staattinen sivu, joka toimii selaimessa ilman kirjautumista, palvelinta ja tilejä. Selaimesta ei lähde mitään paitsi tiedostot, jotka itse tallennat, ja leikepöydälle kopioimasi teksti. Sovellus ei koskaan kutsu AI-palvelua – AI-tehtävä kopioidaan tai ladataan ja vastaus tuodaan käsin. Sivun sisältöturvakäytäntö (CSP) sallii vain sivun omat skriptit ja yhteydet.
- Selaimeen tallentuvat aktiivinen työ (`witt-project-v3`), sen tallennusmerkinnät, näkymä- ja paneeliasetukset, kieli, erikoisteema, pikanäppäimet, asiakirjakohtainen käyttäjävalinta, arvioijasuodatin ja arviointikierroksen edistyminen sekä asiakirjakirjasto (IndexedDB). Ne ovat laite- ja selainkohtaisia, eivät varmuuskopio: vie `.witt.json`.
- `.witt.json` sisältää kaiken, mitä asiakirjassa on: väitteet ja perustelut, lähteet, kommentit, käyttäjien nimet ja pysyvät tunnisteet, jokaisen arviot, äänimäärät, äänestyskierrokset ja äänet tapahtumakirjauksineen, sijainnit, perusteeman ja asetukset. *Näytä anonyyminä* piilottaa tekijän vain näytöltä – tunniste säilyy tiedostossa; se ei ole anonymisointia. Tuotu tekijyys säilyy sellaisenaan, ja tuntematon vanha tekijyys pysyy tuntemattomana.
- AI-tehtävä ja muutosehdotuksen vienti sisältävät nykyisen työn ja mahdollisesti henkilötietoja; tarkista teksti ennen kuin annat sen kielimallille.
- Päätösäänestys on paikallinen eikä salainen; nimetön tulosnäkymä on esitystapa, ei suoja. Perustelutulos ei ole totuuden todennäköisyys.
