"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.getSetting = getSetting;
exports.setSetting = setSetting;
exports.getActiveTournamentId = getActiveTournamentId;
exports.getUserRoles = getUserRoles;
exports.setUserRoles = setUserRoles;
exports.dedupeMatches = dedupeMatches;
exports.runBackup = runBackup;
exports.listBackups = listBackups;
exports.getBackupStatus = getBackupStatus;
exports.getDbFilePath = getDbFilePath;
exports.restoreBackup = restoreBackup;
exports.getLogSettings = getLogSettings;
exports.setLogSettings = setLogSettings;
exports.appLog = appLog;
exports.getLogs = getLogs;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const electron_1 = require("electron");
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
function resolveDbPath() {
    // I dev (kjørt via "npm run dev:electron") er app.getPath ikke alltid
    // tilgjengelig før app er "ready" - faller da tilbake til en lokal fil
    // i prosjektmappen for enkel utvikling/testing.
    try {
        const dir = electron_1.app.getPath("userData");
        node_fs_1.default.mkdirSync(dir, { recursive: true });
        return node_path_1.default.join(dir, "tournament.db");
    }
    catch {
        return node_path_1.default.join(process.cwd(), "tournament.dev.db");
    }
}
const dbFilePath = resolveDbPath();
function resolveBackupsDir() {
    const dir = node_path_1.default.join(node_path_1.default.dirname(dbFilePath), "backups");
    node_fs_1.default.mkdirSync(dir, { recursive: true });
    return dir;
}
exports.db = new better_sqlite3_1.default(dbFilePath);
exports.db.pragma("journal_mode = WAL");
exports.db.pragma("foreign_keys = ON");
exports.db.exec(`
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

  -- Brukerkontoer for ekte innlogging (Logg ut-knappen i sidemenyen).
  -- Passord lagres ALDRI i klartekst - kun salt:hash (se
  -- server/auth.ts). role er en av ADMINISTRATOR/EVENT/JUDGE/PRODUCER.
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'EVENT',
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- EKTE kombinerte roller (en konto kan ha FLERE roller samtidig,
  -- f.eks. ADMIN + PRODUCER) - dette er den faktiske kilden til
  -- sannhet for tilgang na. users.role over BEHOLDES som "primaer-
  -- rolle" (satt nar kontoen opprettes, brukt som fornuftig standard
  -- og i visning), men INGEN tilgangssjekk i appen skal lenger lese
  -- users.role direkte - alle skal sla opp i user_roles i stedet.
  CREATE TABLE IF NOT EXISTS user_roles (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    PRIMARY KEY (user_id, role)
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

  -- Dommer-hendelser (Judge Workspace) - dekker bade frie notater,
  -- advarsler og loggforte resultatkorrigeringer. En rad kan vaere
  -- knyttet til en spesifikk kamp (match_id) eller vaere generell for
  -- turneringen (match_id = NULL). type er 'note' | 'warning' | 'correction'.
  CREATE TABLE IF NOT EXISTS app_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS judge_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    match_id INTEGER REFERENCES matches(id) ON DELETE SET NULL,
    type TEXT NOT NULL DEFAULT 'note',
    message TEXT DEFAULT '',
    judge_username TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);
// Sikker migrering for eksisterende databaser laget FOR
// timer-kolonnene ble lagt til over - CREATE TABLE IF NOT EXISTS
// endrer aldri en tabell som allerede finnes, sa disse ma legges til
// separat. Ignorerer feilen som oppstar hvis kolonnen allerede finnes
// (SQLite har ingen "ADD COLUMN IF NOT EXISTS").
function tryAddColumn(sql) {
    try {
        exports.db.exec(sql);
    }
    catch (err) {
        if (!String(err?.message || "").includes("duplicate column"))
            throw err;
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
tryAddColumn(`ALTER TABLE matches ADD COLUMN player1_life_override INTEGER DEFAULT 0`);
tryAddColumn(`ALTER TABLE matches ADD COLUMN player2_life_override INTEGER DEFAULT 0`);
// Stabil Melee-kamp-ID (match.ID fra /api/match/list/...) - brukes na til
// a finne IGJEN riktig rad ved hver synk (se syncMeleeCurrentMatches i
// melee.ts), i stedet for a lete etter en rad med status='in_progress'
// pa samme bordnummer. Den gamle metoden laget en NY duplikat-rad hver
// gang en kamp ble markert ferdig (via win-game/End Match/Enter Result)
// for Melee selv sluttet a vise den som "current" - ofte flere synk-
// sykluser senere - siden ingen 'in_progress'-rad lenger fantes a
// oppdatere.
tryAddColumn(`ALTER TABLE matches ADD COLUMN melee_match_id TEXT DEFAULT ''`);
// Migrerer eksisterende kontoer (fra FOR user_roles fantes) inn i den
// nye tabellen - hver bruker far sin daverende users.role som sin
// eneste rolle. INSERT OR IGNORE gjor dette trygt a kjore pa hver
// oppstart uten a lage duplikater eller overskrive roller noen
// allerede har lagt til manuelt via den nye multi-rolle-UI-en.
exports.db.exec(`
  INSERT OR IGNORE INTO user_roles (user_id, role)
  SELECT id, role FROM users
`);
// Tournament Validation-fundamentet: Melee sitt RAPPORTERTE resultat,
// lagret ATSKILT fra det lokale (player1_game_wins/player2_game_wins
// over, som dommere/operatorer redigerer direkte). Fram til na har
// Melee-synken alltid SKREVET RETT OVER lokale felt - det gjorde det
// umulig a noensinne oppdage et avvik mellom "det Melee sier" og "det
// som faktisk er registrert lokalt", siden den ene alltid overskrev
// den andre. NULL = Melee har ikke rapportert noe resultat for denne
// kampen enna (ikke det samme som 0-0).
tryAddColumn(`ALTER TABLE matches ADD COLUMN melee_player1_game_wins INTEGER DEFAULT NULL`);
tryAddColumn(`ALTER TABLE matches ADD COLUMN melee_player2_game_wins INTEGER DEFAULT NULL`);
tryAddColumn(`ALTER TABLE matches ADD COLUMN melee_result_synced_at TEXT DEFAULT ''`);
// "Keep local result" for en konflikt - lagrer HVILKE Melee-tall som
// ble avvist, sammen med hvem/nar. Hvis Melee sitt tall senere ENDRER
// SEG igjen, matcher det ikke lenger disse lagrede verdiene, og
// deriveValidationStatus() (i TournamentTab.tsx) faller automatisk
// tilbake til CONFLICT - en gammel bekreftelse "utloper" altsa av seg
// selv i stedet for a skjule en ny, uavklart uoverensstemmelse.
tryAddColumn(`ALTER TABLE matches ADD COLUMN conflict_ack_melee_p1 INTEGER DEFAULT NULL`);
tryAddColumn(`ALTER TABLE matches ADD COLUMN conflict_ack_melee_p2 INTEGER DEFAULT NULL`);
tryAddColumn(`ALTER TABLE matches ADD COLUMN conflict_ack_at TEXT DEFAULT ''`);
tryAddColumn(`ALTER TABLE matches ADD COLUMN conflict_ack_by TEXT DEFAULT ''`);
// "Updated"-kolonnen pa Tournament Validation - nar raden sist ble
// endret av NOEN (resultat, liv, override, osv), IKKE det samme som
// melee_result_synced_at (som kun gjelder nar Melee sitt tall sist
// ble hentet). Satt til opprettelsestidspunktet ved migrering, sa
// eksisterende rader ikke star med en tom/misvisende verdi.
tryAddColumn(`ALTER TABLE matches ADD COLUMN updated_at TEXT DEFAULT ''`);
exports.db.exec(`UPDATE matches SET updated_at = created_at WHERE updated_at = '' OR updated_at IS NULL`);
// Migrerer eksisterende rader som fortsatt har den gamle
// scene-nokkelen "match" (fra for den ble omdopt til "bo3").
exports.db.prepare(`UPDATE broadcast_state SET active_scene = 'bo3' WHERE active_scene = 'match'`).run();
// Migrerer en evt. tidligere lagret OBS-scenenavn-oversettelse for
// den gamle nokkelen "match" over til den nye "bo3".
const oldMatchOverride = exports.db.prepare(`SELECT value FROM settings WHERE key = 'obs_scene_name_match'`).get();
if (oldMatchOverride?.value) {
    exports.db.prepare(`INSERT INTO settings (key, value) VALUES ('obs_scene_name_bo3', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(oldMatchOverride.value);
    exports.db.prepare(`DELETE FROM settings WHERE key = 'obs_scene_name_match'`).run();
}
function getSetting(key) {
    const row = exports.db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
    return row ? row.value : "";
}
function setSetting(key, value) {
    exports.db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}
function getActiveTournamentId() {
    const row = exports.db.prepare(`SELECT id FROM tournaments ORDER BY id DESC LIMIT 1`).get();
    return row ? row.id : null;
}
/**
 * KOMBINERTE ROLLER
 * =================
 * Ekte kilde til sannhet for hvilke roller en konto har - ALDRI
 * users.role direkte (den kolonnen er kun "primaer-rolle" na, brukt
 * som standardvalg og i visning). getUserRoles returnerer alltid
 * MINST én rolle (faller tilbake til users.role hvis user_roles av en
 * eller annen grunn skulle vaere tom for brukeren - bor ikke skje
 * etter migreringen over, men er en trygg siste utvei).
 */
function getUserRoles(userId) {
    const rows = exports.db.prepare(`SELECT role FROM user_roles WHERE user_id = ? ORDER BY role`).all(userId);
    if (rows.length > 0)
        return rows.map((r) => r.role);
    const user = exports.db.prepare(`SELECT role FROM users WHERE id = ?`).get(userId);
    return user ? [user.role] : [];
}
/**
 * Erstatter HELE rollesettet for en konto (ikke legg-til/fjern-en -
 * enklere a resonnere om fra UI-siden, som alltid sender det komplette
 * onskede settet). Ma ha MINST én rolle - en konto uten noen rolle
 * ville vaert usynlig for seg selv i hele appen, med ingen mate a
 * rette det opp uten a ga via en annen administrator-konto.
 * Oppdaterer ogsa users.role (primaer-rolle) til den forste i settet,
 * sa gammel kode/visning som fortsatt leser users.role far en
 * fornuftig verdi i stedet for a bli staende pa noe utdatert.
 */
function setUserRoles(userId, roles) {
    const unique = Array.from(new Set(roles.filter(Boolean)));
    if (unique.length === 0)
        throw new Error("En konto ma ha minst en rolle.");
    const tx = exports.db.transaction(() => {
        exports.db.prepare(`DELETE FROM user_roles WHERE user_id = ?`).run(userId);
        const insert = exports.db.prepare(`INSERT INTO user_roles (user_id, role) VALUES (?, ?)`);
        unique.forEach((role) => insert.run(userId, role));
        exports.db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(unique[0], userId);
    });
    tx();
}
/**
 * Automatisk opprydding i duplikat-kamper. Fanger opp gamle duplikater
 * som allerede finnes (fra FOR melee_match_id-basert dedup-matching
 * ble innfort i syncMeleeCurrentMatches), OG fungerer som et ekstra
 * sikkerhetsnett fremover hvis noe skulle glippe der.
 *
 * To rader regnes som DUPLIKATER av hverandre kun nar de har SAMME
 * turnering, SAMME bordnummer, SAMME to spillere (uansett rekkefolge)
 * OG SAMME runde-merkelapp (eller begge tomme) - dette utelukker
 * bevisst en legitim reoppgjor mellom samme to spillere i en SENERE
 * runde (sjeldent i Sveitser-par, men skal aldri fjernes automatisk).
 *
 * Nar en gruppe med duplikater finnes, beholdes ETT eksemplar (den med
 * en ekte melee_match_id om noen har det, ellers den nyeste raden) -
 * de andre slettes, men FORST flyttes eventuelle referanser til dem
 * (broadcast_state sine bo3/bo5-felt, dommerlogg-oppforinger) over til
 * den som overlever, sa ingen historikk forsvinner stille.
 */
function dedupeMatches(tournamentId) {
    const rows = exports.db
        .prepare(`SELECT * FROM matches WHERE tournament_id = ?`)
        .all(tournamentId);
    const groups = new Map();
    for (const m of rows) {
        const pair = [m.player1_id, m.player2_id].sort((a, b) => a - b).join(",");
        const key = `${m.table_number ?? ""}|${m.round_label ?? ""}|${pair}`;
        const list = groups.get(key) ?? [];
        list.push(m);
        groups.set(key, list);
    }
    let removed = 0;
    for (const list of groups.values()) {
        if (list.length < 2)
            continue;
        const survivor = [...list].sort((a, b) => {
            const aHasMelee = a.melee_match_id ? 1 : 0;
            const bHasMelee = b.melee_match_id ? 1 : 0;
            if (aHasMelee !== bHasMelee)
                return bHasMelee - aHasMelee;
            return b.id - a.id;
        })[0];
        for (const loser of list) {
            if (loser.id === survivor.id)
                continue;
            exports.db.prepare(`UPDATE judge_entries SET match_id = ? WHERE match_id = ?`).run(survivor.id, loser.id);
            exports.db.prepare(`UPDATE broadcast_state SET bo3_match_id = ? WHERE bo3_match_id = ?`).run(survivor.id, loser.id);
            exports.db.prepare(`UPDATE broadcast_state SET bo5_match_id = ? WHERE bo5_match_id = ?`).run(survivor.id, loser.id);
            exports.db.prepare(`DELETE FROM matches WHERE id = ?`).run(loser.id);
            removed += 1;
        }
    }
    return removed;
}
/**
 * BACKUP
 * ======
 * Ekte backup av hele SQLite-databasen - bruker better-sqlite3 sin
 * innebygde .backup() (en trygg "online backup", tar en konsistent
 * kopi selv om databasen er i aktiv bruk akkurat na, i motsetning
 * til a bare kopiere .db-filen rått med fs.copyFile som kan gi en
 * korrupt kopi midt i en skriveoperasjon). Filnavnet er tidsstemplet,
 * sa gamle backups aldri overskrives ved et uhell.
 */
async function runBackup() {
    const dir = resolveBackupsDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `tournament-${timestamp}.db`;
    const destPath = node_path_1.default.join(dir, filename);
    await exports.db.backup(destPath);
    const stat = node_fs_1.default.statSync(destPath);
    const createdAt = new Date().toISOString();
    setSetting("last_backup_at", createdAt);
    setSetting("last_backup_path", destPath);
    return { filename, path: destPath, sizeBytes: stat.size, createdAt };
}
function listBackups() {
    const dir = resolveBackupsDir();
    return node_fs_1.default
        .readdirSync(dir)
        .filter((name) => name.endsWith(".db"))
        .map((name) => {
        const fullPath = node_path_1.default.join(dir, name);
        const stat = node_fs_1.default.statSync(fullPath);
        return { filename: name, path: fullPath, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
    })
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
function getBackupStatus() {
    return {
        lastBackupAt: getSetting("last_backup_at") || null,
        lastBackupPath: getSetting("last_backup_path") || null,
        backupsDir: resolveBackupsDir(),
        backups: listBackups()
    };
}
/**
 * Live databasesti - trengt av api.ts sin restore-funksjon (skriver
 * en valgt backup-fil TILBAKE over den ekte databasen). Restore krever
 * en app-restart etterpå (samme prinsipp som save-connection-config i
 * electron/main.ts) - selve prosessen har allerede denne db-filen apen
 * og WAL-modus, sa a bytte den ut mens appen kjorer ville ikke blitt
 * lest av den kjorende Database-instansen.
 */
function getDbFilePath() {
    return dbFilePath;
}
/**
 * Skriver en valgt backup-fil TILBAKE over den ekte databasen.
 * Ma lukke den apne SQLite-tilkoblingen forst - Windows later filen
 * mens den er i bruk (samme type feil som EBUSY-en du traff pa
 * dist-mappen under bygging), sa a bare kopiere over den mens appen
 * kjorer ville feile eller korrupte filen. Kaller selv IKKE
 * app.relaunch()/app.exit() - det er opp til den som kaller denne
 * (server/api.ts) a restarte appen rett etterpa, siden denne
 * databasetilkoblingen er ubrukelig etter et restore uansett.
 */
function restoreBackup(backupPath) {
    if (!node_fs_1.default.existsSync(backupPath)) {
        throw new Error("Fant ikke backup-filen: " + backupPath);
    }
    exports.db.close();
    node_fs_1.default.copyFileSync(backupPath, dbFilePath);
}
/**
 * DIAGNOSTIKK-LOGG
 * ================
 * Ekte, nivadelt logging lagret i databasen (samme monster som
 * melee_sync_log og judge_entries) - ikke bare console.log som
 * forsvinner nar appen lukkes. Nivarekkefolge: debug < info < warn <
 * error. Kun oppforinger pa eller over det VALGTE minimumsnivaet
 * (settings-nokkel "log_level", standard "info") lagres i det hele
 * tatt - resten kastes stille, akkurat som en vanlig logging-motor.
 * Oppbevaringstid ("log_retention_days", standard 14) rydder opp i
 * gamle rader automatisk ved hver skriving, sa tabellen aldri bare
 * vokser i det uendelige.
 */
const LOG_LEVEL_RANK = { debug: 0, info: 1, warn: 2, error: 3 };
function getLogSettings() {
    return {
        level: getSetting("log_level") || "info",
        retentionDays: Number(getSetting("log_retention_days")) || 14
    };
}
function setLogSettings(level, retentionDays) {
    setSetting("log_level", level);
    setSetting("log_retention_days", String(retentionDays));
}
function appLog(level, message) {
    const { level: minLevel, retentionDays } = getLogSettings();
    if ((LOG_LEVEL_RANK[level] ?? 1) < (LOG_LEVEL_RANK[minLevel] ?? 1))
        return;
    exports.db.prepare(`INSERT INTO app_logs (level, message) VALUES (?, ?)`).run(level, message);
    exports.db.prepare(`DELETE FROM app_logs WHERE created_at < datetime('now', ?)`).run(`-${retentionDays} days`);
    const consoleFn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    consoleFn(`[${level.toUpperCase()}] ${message}`);
}
function getLogs(minLevel, limit) {
    const threshold = LOG_LEVEL_RANK[minLevel] ?? 0;
    const allowedLevels = Object.keys(LOG_LEVEL_RANK).filter((l) => LOG_LEVEL_RANK[l] >= threshold);
    const placeholders = allowedLevels.map(() => "?").join(",");
    return exports.db
        .prepare(`SELECT * FROM app_logs WHERE level IN (${placeholders}) ORDER BY id DESC LIMIT ?`)
        .all(...allowedLevels, limit);
}
