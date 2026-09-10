<<<<<<< HEAD
<<<<<<< HEAD
# MTG NM Broadcast Desktop - Fase 1

Dette er fundamentet fra arkitektur-planen: en Windows-app (Electron +
React + TypeScript) med sin egen SQLite-database, som eksponerer live
data over en lokal API + WebSocket - til bade OBS (na) og mobilappen
(senere).

## Kom i gang (pa din Windows-maskin)

Forutsetter Node.js 20+ installert (https://nodejs.org).

```
cd desktop-app
npm install
npm run dev
```

Dette starter:
- Vite dev-server (React-UI-et) pa http://localhost:5173
- Den lokale API/WebSocket-serveren pa http://localhost:4848
- Electron-vinduet, som laster React-UI-et

Forste gang: opne "Turnering"-fanen og opprett en turnering. SQLite-
filen opprettes automatisk (i Electron sin userData-mappe).

## Koble OBS til

I OBS: legg til en **Browser Source**, URL:

```
http://localhost:4848/overlay
```

Bredde 1920, hoyde 1080. Overlayet kobler seg automatisk til appen sin
WebSocket og oppdaterer seg live - ingen polling, ingen ekstern kvote.

## Hva er IKKE bygget enna (bevisst, per fase-planen)

- **Scryfall-cache**: kortbilder/decklister er ikke koblet pa enna
  (Fase 4).
- **Mobilapp**: snakker med denne serveren over WiFi, samme /api-
  endepunkter som Windows-UI-et allerede bruker (Fase 5) - ikke bygget
  enna i dette laget.
- **Bracket/standings-synk fra Melee**: kun standings + pagaende
  kamper hentes na (matcher syncMeleeToTopp16 +
  syncMeleeCurrentMatch fra det gamle systemet). Sluttspill-bracket
  (syncMeleeBracket) og meta breakdown-aggregering
  (getMeleeMetaBreakdown_) er ikke portert enna.
- **Manuell bord-overstyring** (C10/C11-konseptet fra MeleeSync-
  arket) er ikke bygget inn i syncMeleeCurrentMatches enna - den
  velger automatisk basert pa bordnummer.
- **Autentisering**: serveren har INGEN tilgangskontroll enna - den er
  ment a kjore lokalt pa samme maskin/nettverk som du selv kontrollerer
  under sendingen. Ikke eksponer port 4848 til internett.
- **electron-builder-pakking** til en ferdig .exe er satt opp i
  package.json ("npm run package"), men ikke testet enna.

## Fase 3 - Melee-adapter (FERDIG)

`server/melee.ts` porter direkte fra MeleeSync.gs/MeleeApi.gs:

- Samme Basic Auth (client_id:client_secret)
- Samme paginering (Content/RecordsTotal)
- Samme arketype-uttrekk (hopper over Melee sin generiske "Decklist"-
  placeholder, faller tilbake til ARCHETYPE-attributt-taggen)
- Kjorer automatisk hvert 30. sekund (mye hyppigere enn det gamle
  1-minutts-triggeren kunne fa til, siden det ikke lenger finnes noen
  daglig UrlFetchApp-kvote a bekymre seg for)
- "Melee"-fanen i UI-et: sett client ID/secret + turnerings-ID, PA/AV-
  bryter (samme prinsipp som B19 i det gamle MeleeSync-arket), manuell
  "Synk na"-knapp, og en logg over siste synk-forsok

Nye API-endepunkter:

```
GET  /api/settings/melee
POST /api/settings/melee            { clientId, clientSecret, tournamentId, enabled }
POST /api/melee/sync                (manuell synk na)
GET  /api/melee/log                 (siste 20 synk-forsok)
```

## Datamodell (SQLite)

```
tournaments -> rounds -> matches -> players -> decks -> deck_cards
                                  -> standings
broadcast_state  (hvilken kamp/scene som faktisk er on-air na)
```

Se `server/db.ts` for full skjema.

## API (foreløpig)

```
GET  /api/tournament
POST /api/tournament                 { name, format, totalRounds }

GET  /api/players?tournamentId=1
POST /api/players                    { tournamentId, name, flagCode }

GET  /api/matches?tournamentId=1
POST /api/matches                    { tournamentId, player1Id, player2Id, tableNumber, isBo5 }
PATCH /api/matches/:id                { player1Life, player2Life, player1GameWins, player2GameWins, status, featureMatch, tableNumber }

POST /api/broadcast/scene            { scene }
POST /api/broadcast/set-match        { board: "bo3"|"bo5", matchId }
GET  /api/broadcast/state

WS   ws://localhost:4848/ws          -> { type: "state", data: {...} } pa hver endring
```

## Neste steg (anbefalt rekkefolge, matcher fase-planen)

1. Test Fase 1 na: opprett turnering, legg inn 2 spillere manuelt,
   opprett en kamp, koble OBS til overlayet, juster liv/score fra
   Kampkontroll-fanen og se det oppdatere seg live i OBS.
2. Fase 3: bygg Melee-adapteren (gjenbruk MYE av logikken fra det
   gamle MeleeSync.gs/MeleeApi.gs - samme API-kall, samme
   autentisering - bare skrevet om til TypeScript og lagret i SQLite
   i stedet for Google Sheets-celler).
3. Fase 4: Scryfall-cache (samme prinsipp som fetchScryfallImageUrl_
   hadde, bare lagret i deck_cards-tabellen i stedet for
   CacheService).
4. Fase 2 (utvid overlayet): gjenbruk designet/CSS-et fra de
   eksisterende BO3.html/BO5.html/style.css-filene - selve visuelle
   uttrykket kan flyttes rett over, det er kun DATAKILDEN som endrer
   seg (WebSocket i stedet for JSONP mot Apps Script).
5. Fase 5: mobilappen (Expo/React Native) - peker mot
   http://<windows-maskinens-lokale-ip>:4848/api i stedet for Apps
   Script-URL-en. Alt API-et allerede stotter over kan gjenbrukes rett
   av mobilappen uten endringer.
=======
=======
>>>>>>> origin/main
# MTG NM Broadcast Desktop

Windows-app: turnering-motor + lokal API/WebSocket-server for OBS-overlays og mobil/klient-kontroll av MTG NM-turneringer.

## Funksjoner
- Turnering-, spiller- og kampstyring
- Live overlays for OBS (BO3, BO5, Caster Desk, Meta Breakdown, Topp 8/16, Stream Starting)
- Melee.gg-synkronisering
- Tilgangskode-basert fjernstyring via Cloudflare Tunnel
- Tema-fane for tilpasning av overlay-utseende
- Automatiske oppdateringer via GitHub Releases
<<<<<<< HEAD
>>>>>>> origin/main
=======
>>>>>>> origin/main
