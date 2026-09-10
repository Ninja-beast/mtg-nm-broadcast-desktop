import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { app } from "electron";

/**
 * DATABASE
 * ========
 * En enkelt SQLite-fil, lagret i Electron sin userData-mappe (overlever
 * app-oppdateringer, ligger utenfor selve installasjonsmappen). Dette ER
 * "single source of truth" fra arkitektur-planen - OBS-overlayet,
 * mobilappen og selve Windows-UI-et leser og skriver ALLE mot denne ene
 * databasen via API-et i server/api.ts, aldri direkte mot filen fra
 * flere steder samtidig.
 */

function resolveDbPath(): string {
  // I dev (kjørt via "npm run dev:electron") er app.getPath ikke alltid
  // tilgjengelig før app er "ready" - faller da tilbake til en lokal fil
  // i prosjektmappen for enkel utvikling/testing.
  try {
    const dir = app.getPath("userData");
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, "tournament.db");
  } catch {
    return path.join(process.cwd(), "tournament.dev.db");
  }
}

export const db = new Database(resolveDbPath());
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    format TEXT DEFAULT '',
    current_round INTEGER DEFAULT 1,
    total_rounds INTEGER DEFAULT 0,
    phase TEXT DEFAULT 'swiss',           -- swiss | top8 | semifinal | final
    melee_tournament_id TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    flag_code TEXT DEFAULT '',
    melee_team_id TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS decks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    archetype TEXT DEFAULT '',
    decklist_name TEXT DEFAULT '',        -- raw navn spilleren selv skrev pa Melee
    melee_decklist_id TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS deck_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    card_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    is_sideboard INTEGER DEFAULT 0,       -- 0 = maindeck, 1 = sideboard
    scryfall_id TEXT DEFAULT '',
    image_url TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    round_label TEXT DEFAULT ''           -- "Runde 5" / "Kvartfinale" / "Semifinale" / "Finale"
  );

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round_id INTEGER REFERENCES rounds(id) ON DELETE SET NULL,
    table_number INTEGER,
    player1_id INTEGER NOT NULL REFERENCES players(id),
    player2_id INTEGER NOT NULL REFERENCES players(id),
    player1_game_wins INTEGER DEFAULT 0,
    player2_game_wins INTEGER DEFAULT 0,
    player1_life INTEGER DEFAULT 20,
    player2_life INTEGER DEFAULT 20,
    status TEXT DEFAULT 'in_progress',    -- in_progress | finished
    winner_player_id INTEGER,
    feature_match INTEGER DEFAULT 0,      -- 0/1
    is_bo5 INTEGER DEFAULT 0,             -- 0 = BO3-slot, 1 = BO5-slot (hvilken overlay-fane)
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS standings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    rank INTEGER,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    UNIQUE(tournament_id, player_id)
  );

  -- Broadcast-state: HVILKEN kamp/scene som faktisk vises pa stream akkurat
  -- na. Separat fra "matches" siden en kamp kan finnes uten a vaere on-air,
  -- og motsatt (en placeholder-scene kan vises uten noen aktiv kamp).
  -- Klokken er PER BORD (BO3/BO5 kan ha ulik tid) - timer_status er
  -- 'start'/'pause'/'reset', timer_seconds er sekundene igjen SIST
  -- klokken ble satt/pauset (klienten teller selv ned lokalt fra der
  -- nar status='start', samme prinsipp som handleTimer i bo5-scene.js).
  CREATE TABLE IF NOT EXISTS broadcast_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    active_scene TEXT DEFAULT 'bo3',      -- bo3 | bo5 | meta | top16 | bracket | casterdesk | starting
    bo3_match_id INTEGER REFERENCES matches(id),
    bo5_match_id INTEGER REFERENCES matches(id),
    bo3_timer_seconds INTEGER DEFAULT 3000,
    bo3_timer_status TEXT DEFAULT 'pause',
    bo5_timer_seconds INTEGER DEFAULT 3000,
    bo5_timer_status TEXT DEFAULT 'pause',
    updated_at TEXT DEFAULT (datetime('now'))
  );

  INSERT OR IGNORE INTO broadcast_state (id, active_scene) VALUES (1, 'bo3');

  -- Enkel nokkel-verdi-lagring for ting som IKKE hoerer hjemme i
  -- tournament-modellen: Melee client id/secret, hvilken turnerings-ID
  -- vi synker mot, og om Melee-sync er skrudd av/pa (samme prinsipp
  -- som B19-bryteren i det gamle MeleeSync.gs-arket).
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT DEFAULT ''
  );

  -- Tilgangskoder for ekstern tilkobling (via Cloudflare Tunnel e.l.).
  -- Trafikk pa samme WiFi/lokalt trenger IKKE dette - kun forespoersler
  -- som kommer utenfra (identifisert pa Cf-Connecting-Ip-headeren som
  -- Cloudflare legger pa) sjekkes mot denne tabellen. status er
  -- 'allowed' eller 'blocked' - admin styrer dette fra Tilgangsstyring-
  -- fanen i desktop-appen.
  CREATE TABLE IF NOT EXISTS access_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    label TEXT DEFAULT '',
    status TEXT DEFAULT 'allowed',
    created_at TEXT DEFAULT (datetime('now')),
    last_used_at TEXT DEFAULT ''
  );

  -- Logger siste synk-forsok - vises i UI-et sa man slipper a grave i
  -- konsollen for a se om/hvorfor Melee-sync feiler.
  CREATE TABLE IF NOT EXISTS melee_sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ran_at TEXT DEFAULT (datetime('now')),
    ok INTEGER DEFAULT 1,
    message TEXT DEFAULT ''
  );

  -- Sluttspill-bracket (Top 8). Lagrer navn/deck/score direkte som
  -- tekst (ikke FK til players) siden en spiller kan vaere med i
  -- bracketen uten a allerede finnes i den lokale players-tabellen -
  -- samme prinsipp som det gamle Top8Bracket-arket.
  CREATE TABLE IF NOT EXISTS bracket_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round TEXT NOT NULL,              -- quarter | semi | final
    position INTEGER NOT NULL,        -- 0-3 for quarter, 0-1 for semi, 0 for final
    p1_name TEXT DEFAULT '',
    p1_deck TEXT DEFAULT '',
    p1_score TEXT DEFAULT '0',
    p2_name TEXT DEFAULT '',
    p2_deck TEXT DEFAULT '',
    p2_score TEXT DEFAULT '0',
    UNIQUE(tournament_id, round, position)
  );

  -- Nokkelkort per arketype for meta breakdown - satt manuelt (samme
  -- prinsipp som "Nokkelkort 1"/"Nokkelkort 2"-kolonnene i det gamle
  -- Meta Breakdown-arket). Matches mot arketype-navnet Melee sender,
  -- normalisert (case-insensitiv/trimmet) i server/melee.ts.
  CREATE TABLE IF NOT EXISTS meta_keycards (
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    archetype_key TEXT NOT NULL,      -- normalisert arketype-navn
    archetype_label TEXT NOT NULL,    -- opprinnelig visningsnavn
    key_card_1 TEXT DEFAULT '',
    key_card_2 TEXT DEFAULT '',
    PRIMARY KEY (tournament_id, archetype_key)
  );
`);

// Sikker migrering for eksisterende databaser laget FOR
// timer-kolonnene ble lagt til over - CREATE TABLE IF NOT EXISTS
// endrer aldri en tabell som allerede finnes, sa disse ma legges til
// separat. Ignorerer feilen som oppstar hvis kolonnen allerede finnes
// (SQLite har ingen "ADD COLUMN IF NOT EXISTS").
function tryAddColumn(sql: string) {
  try {
    db.exec(sql);
  } catch (err: any) {
    if (!String(err?.message || "").includes("duplicate column")) throw err;
  }
}

tryAddColumn(`ALTER TABLE broadcast_state ADD COLUMN bo3_timer_seconds INTEGER DEFAULT 3000`);
tryAddColumn(`ALTER TABLE broadcast_state ADD COLUMN bo3_timer_status TEXT DEFAULT 'pause'`);
tryAddColumn(`ALTER TABLE broadcast_state ADD COLUMN bo5_timer_seconds INTEGER DEFAULT 3000`);
tryAddColumn(`ALTER TABLE broadcast_state ADD COLUMN bo5_timer_status TEXT DEFAULT 'pause'`);
tryAddColumn(`ALTER TABLE matches ADD COLUMN player1_card_showcase TEXT DEFAULT ''`);
tryAddColumn(`ALTER TABLE matches ADD COLUMN player2_card_showcase TEXT DEFAULT ''`);
tryAddColumn(`ALTER TABLE matches ADD COLUMN format TEXT DEFAULT 'Modern'`);
tryAddColumn(`ALTER TABLE matches ADD COLUMN event_type TEXT DEFAULT ''`);
tryAddColumn(`ALTER TABLE matches ADD COLUMN event_player INTEGER DEFAULT 0`);
tryAddColumn(`ALTER TABLE matches ADD COLUMN event_id INTEGER DEFAULT 0`);
tryAddColumn(`ALTER TABLE matches ADD COLUMN round_label TEXT DEFAULT ''`);

// Migrerer eksisterende rader som fortsatt har den gamle
// scene-nokkelen "match" (fra for den ble omdopt til "bo3").
db.prepare(`UPDATE broadcast_state SET active_scene = 'bo3' WHERE active_scene = 'match'`).run();

// Migrerer en evt. tidligere lagret OBS-scenenavn-oversettelse for
// den gamle nokkelen "match" over til den nye "bo3".
const oldMatchOverride = db.prepare(`SELECT value FROM settings WHERE key = 'obs_scene_name_match'`).get() as { value: string } | undefined;
if (oldMatchOverride?.value) {
  db.prepare(`INSERT INTO settings (key, value) VALUES ('obs_scene_name_bo3', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(oldMatchOverride.value);
  db.prepare(`DELETE FROM settings WHERE key = 'obs_scene_name_match'`).run();
}

export function getSetting(key: string): string {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined;
  return row ? row.value : "";
}

export function setSetting(key: string, value: string): void {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}

export function getActiveTournamentId(): number | null {
  const row = db.prepare(`SELECT id FROM tournaments ORDER BY id DESC LIMIT 1`).get() as { id: number } | undefined;
  return row ? row.id : null;
}
