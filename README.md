# MTG NM Broadcast Desktop

Windows app: tournament engine + local API/WebSocket server for OBS overlays and mobile/client control of MTG NM tournaments.

## Features

- Tournament, player, and match management (the Observer dashboard)
- Live overlays for OBS (BO3, BO5, Caster Desk, Meta Breakdown, Top 8/16, Stream Starting)
- Melee.gg sync (players, standings, matches, decklists)
- Studio Mode-driven Broadcast Control (Program/Preview, Take/Cut/Stinger)
- Graphics Control (Player Name Tags, Card Showcase, etc.)
- Access-code-based remote control via Cloudflare Tunnel
- Login with user accounts and roles
- Theme tab for customizing overlay appearance (background/logo/CSS)
- Automatic updates via GitHub Releases

## Getting started (on your Windows machine)

Requires Node.js 20+ installed (https://nodejs.org).

```
npm install
npm run dev
```

This starts:
- The Vite dev server (the React UI) on http://localhost:5173
- The local API/WebSocket server on http://localhost:4848
- The Electron window, which loads the React UI

First time: create an Administrator account when the app asks, then a tournament under the Tournament tab. The SQLite file is created automatically (in Electron's userData folder).

To build a runnable .exe (no installer, fastest for testing):

```
npm run package:dev
```

The app ends up in `dist\win-unpacked`. Remember to close all running instances and check that port 4848 is free (`netstat -ano | findstr 4848`) before building again.

## Connecting OBS

In OBS: add a **Browser Source** per scene, e.g.:

```
http://localhost:4848/overlay/BO3.html
http://localhost:4848/overlay/BO5.html
```

Width 1920, height 1080. The overlays connect to the app's WebSocket automatically and update live - no polling, no external quota.

## Melee sync

The "Settings" tab in the app: set client ID/secret + tournament ID, an ON/OFF toggle, a manual "Sync now" button, and a log of the latest sync attempts. Runs automatically every 30 seconds.

```
GET  /api/settings/melee
POST /api/settings/melee            { clientId, clientSecret, tournamentId, enabled }
POST /api/melee/sync                (manual sync now)
GET  /api/melee/log                 (last 20 sync attempts)
```

## Data model (SQLite)

```
tournaments -> rounds -> matches -> players -> decks -> deck_cards
                                  -> standings
broadcast_state  (which match/scene is actually on-air right now)
users            (login accounts)
```

See `server/db.ts` for the full schema.

## API (core endpoints)

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

WS   ws://localhost:4848/ws          -> { type: "state", data: {...} } on every change (the overlays)
WS   ws://localhost:4848/ws-admin    -> only used to count connected Observer instances
```

See `server/api.ts` for the many additional endpoints (Studio Mode, phase timers, user accounts, system status, etc.) added along the way.

## Not built yet

- **Real camera-source control** in Broadcast Control - "Camera Source" currently only stores a selection, it doesn't switch any actual OBS source.
- **Real live video** in the Program/Preview monitors - shows frequently refreshed still images (OBS's screenshot API), not an actual video stream.
- Full role-based access restriction in the UI (roles exist and are stored, but don't yet enforce which pages/actions are allowed per role).

## Mobile app (Expo/React Native)

Lives in its own folder/project (`App.js`, `app.json`, `config.js`, etc.) - points to `http://<windows-machine-local-ip>:4848/api` (or a Cloudflare Tunnel address) instead of localhost. Reuses the same API endpoints as the rest of the app.
