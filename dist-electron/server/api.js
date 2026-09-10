"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const node_http_1 = __importDefault(require("node:http"));
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const electron_1 = require("electron");
const ws_1 = require("ws");
const db_1 = require("./db");
const melee_1 = require("./melee");
const obs_1 = require("./obs");
/**
 * LOKAL SERVER
 * ============
 * Express (REST, for engangs-kommandoer som "sett kamp"/"registrer
 * resultat") + WebSocket (push, for at OBS-overlayet og mobilappen skal
 * fa oppdateringer UMIDDELBART uten a matte polle). Dette er "API/
 * WebSocket"-boksen fra arkitektur-planen.
 *
 * OBS peker en Browser Source mot http://localhost:PORT/overlay som
 * apner en WebSocket mot ws://localhost:PORT/ws for live data - samme
 * prinsipp som script.js/BO3.html gjorde mot Google Apps Script for,
 * bare lokalt og med push i stedet for polling.
 */
const PORT = Number(process.env.MTG_APP_PORT || 4848);
function startServer() {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    app.use(express_1.default.json({ limit: "25mb" }));
    // __dirname her peker pa dist-electron/server (kompilert output).
    // I dev-modus (npm run dev) er to nivaer opp derfra prosjektroten,
    // hvor selve overlay/-mappen ligger (den kompileres ikke av tsc,
    // den serveres direkte som statiske filer). I en pakket .exe
    // finnes ikke prosjektroten pa disk - da ligger overlay-mappen i
    // stedet under resources/ (se "extraResources" i package.json),
    // sa vi ma velge riktig sti avhengig av om appen er pakket eller ei.
    const overlayPath = electron_1.app.isPackaged
        ? node_path_1.default.join(process.resourcesPath, "overlay")
        : node_path_1.default.join(__dirname, "..", "..", "overlay");
    app.use("/overlay", express_1.default.static(overlayPath));
    // MIDLERTIDIG DIAGNOSE-ENDEPUNKT - fjernes igjen nar overlay-stien er
    // bekreftet riktig. Viser noyaktig hvilken sti serveren regner ut,
    // om mappen finnes der, og hva som faktisk ligger i den (hvis noe).
    app.get("/api/debug/overlay-path", (_req, res) => {
        let exists = false;
        let filesInFolder = null;
        let readError = null;
        try {
            exists = node_fs_1.default.existsSync(overlayPath);
            if (exists)
                filesInFolder = node_fs_1.default.readdirSync(overlayPath);
        }
        catch (err) {
            readError = err instanceof Error ? err.message : String(err);
        }
        res.json({
            isPackaged: electron_1.app.isPackaged,
            dirname: __dirname,
            resourcesPath: process.resourcesPath,
            overlayPath,
            exists,
            filesInFolder,
            readError
        });
    });
    const server = node_http_1.default.createServer(app);
    const wss = new ws_1.WebSocketServer({ server, path: "/ws" });
    function broadcast(payload) {
        const json = JSON.stringify(payload);
        wss.clients.forEach((client) => {
            if (client.readyState === ws_1.WebSocket.OPEN) {
                client.send(json);
            }
        });
    }
    function buildBroadcastPayload() {
        const state = db_1.db.prepare(`SELECT * FROM broadcast_state WHERE id = 1`).get();
        function loadMatch(matchId) {
            if (!matchId)
                return null;
            const match = db_1.db.prepare(`SELECT * FROM matches WHERE id = ?`).get(matchId);
            if (!match)
                return null;
            const p1 = db_1.db.prepare(`SELECT * FROM players WHERE id = ?`).get(match.player1_id);
            const p2 = db_1.db.prepare(`SELECT * FROM players WHERE id = ?`).get(match.player2_id);
            const deck1 = db_1.db.prepare(`SELECT * FROM decks WHERE player_id = ? ORDER BY id DESC LIMIT 1`).get(match.player1_id);
            const deck2 = db_1.db.prepare(`SELECT * FROM decks WHERE player_id = ? ORDER BY id DESC LIMIT 1`).get(match.player2_id);
            const standing1 = db_1.db.prepare(`SELECT * FROM standings WHERE player_id = ?`).get(match.player1_id);
            const standing2 = db_1.db.prepare(`SELECT * FROM standings WHERE player_id = ?`).get(match.player2_id);
            return {
                id: match.id,
                tableNumber: match.table_number,
                format: match.format ?? "",
                round: match.round_label ?? "",
                event: {
                    id: match.event_id ?? 0,
                    type: match.event_type ?? "",
                    player: match.event_player ?? 0
                },
                player1: {
                    name: p1?.name ?? "PLAYER 1",
                    flag: p1?.flag_code ?? "",
                    deck: deck1?.archetype ?? "",
                    life: match.player1_life,
                    gameWins: match.player1_game_wins,
                    wins: standing1?.wins ?? 0,
                    losses: standing1?.losses ?? 0,
                    draws: standing1?.draws ?? 0,
                    cardShowcase: match.player1_card_showcase ?? ""
                },
                player2: {
                    name: p2?.name ?? "PLAYER 2",
                    flag: p2?.flag_code ?? "",
                    deck: deck2?.archetype ?? "",
                    life: match.player2_life,
                    gameWins: match.player2_game_wins,
                    wins: standing2?.wins ?? 0,
                    losses: standing2?.losses ?? 0,
                    draws: standing2?.draws ?? 0,
                    cardShowcase: match.player2_card_showcase ?? ""
                },
                status: match.status,
                featureMatch: !!match.feature_match
            };
        }
        const tournamentId = (0, db_1.getActiveTournamentId)();
        // Top16.html leser data.standings direkte (se readSource i den
        // filen) - full rangeringsliste for aktiv turnering, nyeste
        // topp 16.
        const standings = tournamentId
            ? db_1.db
                .prepare(`SELECT s.rank, s.wins, s.losses, s.draws, p.name, p.flag_code
             FROM standings s
             JOIN players p ON p.id = s.player_id
             WHERE s.tournament_id = ?
             ORDER BY s.rank ASC
             LIMIT 16`)
                .all(tournamentId)
            : [];
        const standingsRows = standings.map((s) => ({
            rank: s.rank,
            name: s.name,
            record: `${s.wins ?? 0}-${s.losses ?? 0}-${s.draws ?? 0}`,
            flag: s.flag_code ?? ""
        }));
        // Top_8_Bracket.html leser data.bracket.quarter/semi/final (se
        // readRound i den filen) - hver kamp som {p1:{name,deck,score},
        // p2:{...}}, sortert pa posisjon innen runden.
        function loadBracketRound(round) {
            if (!tournamentId)
                return [];
            const rows = db_1.db
                .prepare(`SELECT * FROM bracket_matches WHERE tournament_id = ? AND round = ? ORDER BY position ASC`)
                .all(tournamentId, round);
            return rows.map((r) => ({
                p1: { name: r.p1_name ?? "", deck: r.p1_deck ?? "", score: r.p1_score ?? "0" },
                p2: { name: r.p2_name ?? "", deck: r.p2_deck ?? "", score: r.p2_score ?? "0" }
            }));
        }
        return {
            scene: state?.active_scene ?? "match",
            bo3: loadMatch(state?.bo3_match_id ?? null),
            bo5: loadMatch(state?.bo5_match_id ?? null),
            bo3Timer: {
                seconds: state?.bo3_timer_seconds ?? 3000,
                status: state?.bo3_timer_status ?? "pause"
            },
            bo5Timer: {
                seconds: state?.bo5_timer_seconds ?? 3000,
                status: state?.bo5_timer_status ?? "pause"
            },
            standings: standingsRows,
            bracket: {
                quarter: loadBracketRound("quarter"),
                semi: loadBracketRound("semi"),
                final: loadBracketRound("final")
            }
        };
    }
    function pushBroadcastUpdate() {
        broadcast({ type: "state", data: buildBroadcastPayload() });
    }
    wss.on("connection", (ws) => {
        ws.send(JSON.stringify({ type: "state", data: buildBroadcastPayload() }));
    });
    // ---- Stream-innhold (caster-navn, sponsor, ticker osv.) ----
    // Lagres som en enkelt JSON-blob under settings-noekkelen
    // "stream_content_json" - feltene er frie/dynamiske (se groups-
    // listen i StreamContentTab i App.tsx), sa vi trenger ingen egne
    // databasekolonner for hvert felt. Overlayets ticker-skript
    // (BO3.html/BO5.html) poller GET-endepunktet hvert 5. sekund.
    app.get("/api/settings/stream-content", (_req, res) => {
        const raw = (0, db_1.getSetting)("stream_content_json");
        let parsed = {};
        if (raw) {
            try {
                parsed = JSON.parse(raw);
            }
            catch {
                parsed = {};
            }
        }
        res.json(parsed);
    });
    app.post("/api/settings/stream-content", (req, res) => {
        const fields = req.body ?? {};
        (0, db_1.setSetting)("stream_content_json", JSON.stringify(fields));
        res.json({ ok: true });
    });
    // ---- Tema (bakgrunn/farger/logo/egendefinert CSS for overlayene) ----
    // Lar streamere endre utseendet uten a rore kode - theme-loader.js
    // (inkludert i hver overlay-HTML-fil) poller dette hvert 5. sekund
    // og setter verdiene som CSS-variabler live.
    // ---- Tema (fil-basert) ----
    // Et "tema" er en navngitt mappe under overlay/themes/<navn>/ med
    // bg.<ext>, logo.<ext> og custom.css. Nar et tema lagres/aktiveres,
    // kopieres disse filene inn i overlay/theme-assets/ - som allerede
    // er tilgjengelig via den eksisterende /overlay-static-ruten, sa
    // OBS/nettleseren laster ekte filer (theme-assets/bg.png) i stedet
    // for kjempestore base64-strenger over API-et hvert 5. sekund.
    const themesRootPath = node_path_1.default.join(overlayPath, "themes");
    const activeThemeAssetsPath = node_path_1.default.join(overlayPath, "theme-assets");
    function ensureDir(dir) {
        node_fs_1.default.mkdirSync(dir, { recursive: true });
    }
    function sanitizeThemeName(raw) {
        return String(raw || "")
            .trim()
            .replace(/[^a-zA-Z0-9 _-]/g, "")
            .slice(0, 60);
    }
    function extFromDataUri(dataUri) {
        const match = /^data:image\/(\w+);base64,/.exec(dataUri);
        if (!match)
            return null;
        const type = match[1].toLowerCase();
        return type === "jpeg" ? "jpg" : type;
    }
    function writeDataUriToDir(dir, baseName, dataUri, clear) {
        const isNewFile = !!dataUri && dataUri.startsWith("data:");
        if (!isNewFile && !clear) {
            // Verken ny fil eller eksplisitt fjerning bedt om - la eksisterende
            // fil vaere urort. Dette er fiksen for feilen der et vanlig lagre
            // (f.eks. bare for a endre avkrysningsboksene for scener) tidligere
            // slettet bakgrunn/logo-filer som ikke var ment a endres.
            return;
        }
        // Fjerner evt. gamle filer med andre filendelser forst, slik at vi
        // ikke sitter igjen med bade bg.png OG bg.jpg samtidig etter et
        // format-bytte.
        for (const ext of ["png", "jpg", "gif", "webp", "bmp", "svg"]) {
            const existing = node_path_1.default.join(dir, `${baseName}.${ext}`);
            if (node_fs_1.default.existsSync(existing))
                node_fs_1.default.unlinkSync(existing);
        }
        if (!isNewFile)
            return;
        const ext = extFromDataUri(dataUri);
        if (!ext)
            return;
        const base64 = dataUri.split(",")[1] || "";
        node_fs_1.default.writeFileSync(node_path_1.default.join(dir, `${baseName}.${ext}`), Buffer.from(base64, "base64"));
    }
    function writeCssToDir(dir, customCss) {
        const cssPath = node_path_1.default.join(dir, "custom.css");
        if (customCss) {
            node_fs_1.default.writeFileSync(cssPath, customCss, "utf8");
        }
        else if (node_fs_1.default.existsSync(cssPath)) {
            node_fs_1.default.unlinkSync(cssPath);
        }
    }
    function copyThemeDir(fromDir, toDir) {
        ensureDir(toDir);
        for (const name of ["bg.png", "bg.jpg", "bg.gif", "bg.webp", "bg.bmp", "bg.svg",
            "logo.png", "logo.jpg", "logo.gif", "logo.webp", "logo.bmp", "logo.svg",
            "custom.css", "logo-scenes.json"]) {
            const from = node_path_1.default.join(fromDir, name);
            const to = node_path_1.default.join(toDir, name);
            if (node_fs_1.default.existsSync(from)) {
                node_fs_1.default.copyFileSync(from, to);
            }
            else if (node_fs_1.default.existsSync(to)) {
                node_fs_1.default.unlinkSync(to);
            }
        }
    }
    function findAssetFile(dir, baseName) {
        for (const ext of ["png", "jpg", "gif", "webp", "bmp", "svg"]) {
            const fileName = `${baseName}.${ext}`;
            if (node_fs_1.default.existsSync(node_path_1.default.join(dir, fileName)))
                return fileName;
        }
        return null;
    }
    app.get("/api/themes", (_req, res) => {
        ensureDir(themesRootPath);
        const names = node_fs_1.default
            .readdirSync(themesRootPath, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();
        res.json({ names, activeName: (0, db_1.getSetting)("active_theme_name") || "" });
    });
    app.post("/api/themes/save", (req, res) => {
        const { name, bgImageUrl, logoUrl, customCss, hiddenLogoScenes, clearBg, clearLogo } = req.body ?? {};
        const cleanName = sanitizeThemeName(name);
        if (!cleanName)
            return res.status(400).json({ error: "Ugyldig temanavn" });
        const themeDir = node_path_1.default.join(themesRootPath, cleanName);
        ensureDir(themeDir);
        try {
            writeDataUriToDir(themeDir, "bg", bgImageUrl, !!clearBg);
            writeDataUriToDir(themeDir, "logo", logoUrl, !!clearLogo);
            if (customCss !== undefined)
                writeCssToDir(themeDir, customCss);
            if (hiddenLogoScenes !== undefined) {
                node_fs_1.default.writeFileSync(node_path_1.default.join(themeDir, "logo-scenes.json"), JSON.stringify(Array.isArray(hiddenLogoScenes) ? hiddenLogoScenes : []));
            }
        }
        catch (err) {
            return res.status(500).json({ error: err?.message || "Klarte ikke lagre temafiler" });
        }
        // Nylagret tema blir ogsa umiddelbart det aktive.
        copyThemeDir(themeDir, activeThemeAssetsPath);
        (0, db_1.setSetting)("active_theme_name", cleanName);
        res.json({ ok: true, name: cleanName });
    });
    app.post("/api/themes/activate", (req, res) => {
        const { name } = req.body ?? {};
        const cleanName = sanitizeThemeName(name);
        const themeDir = node_path_1.default.join(themesRootPath, cleanName);
        if (!cleanName || !node_fs_1.default.existsSync(themeDir)) {
            return res.status(404).json({ error: "Fant ikke temaet" });
        }
        copyThemeDir(themeDir, activeThemeAssetsPath);
        (0, db_1.setSetting)("active_theme_name", cleanName);
        res.json({ ok: true });
    });
    app.get("/api/themes/active", (_req, res) => {
        ensureDir(activeThemeAssetsPath);
        const bgFile = findAssetFile(activeThemeAssetsPath, "bg");
        const logoFile = findAssetFile(activeThemeAssetsPath, "logo");
        const cssPath = node_path_1.default.join(activeThemeAssetsPath, "custom.css");
        const scenesPath = node_path_1.default.join(activeThemeAssetsPath, "logo-scenes.json");
        function versionOf(fileName) {
            try {
                return node_fs_1.default.statSync(node_path_1.default.join(activeThemeAssetsPath, fileName)).mtimeMs;
            }
            catch {
                return 0;
            }
        }
        let hiddenLogoScenes = [];
        if (node_fs_1.default.existsSync(scenesPath)) {
            try {
                hiddenLogoScenes = JSON.parse(node_fs_1.default.readFileSync(scenesPath, "utf8"));
            }
            catch {
                hiddenLogoScenes = [];
            }
        }
        res.json({
            name: (0, db_1.getSetting)("active_theme_name") || "",
            bgImageUrl: bgFile ? `/overlay/theme-assets/${bgFile}?v=${versionOf(bgFile)}` : "",
            logoUrl: logoFile ? `/overlay/theme-assets/${logoFile}?v=${versionOf(logoFile)}` : "",
            customCss: node_fs_1.default.existsSync(cssPath) ? node_fs_1.default.readFileSync(cssPath, "utf8") : "",
            hiddenLogoScenes
        });
    });
    // ---- Tema (gammel base64-basert versjon - ikke lenger i bruk av
    // theme-loader.js, men star igjen uskadelig i tilfelle noe fortsatt
    // kaller den) ----
    app.get("/api/settings/theme", (_req, res) => {
        const raw = (0, db_1.getSetting)("theme_json");
        let theme = {};
        if (raw) {
            try {
                theme = JSON.parse(raw);
            }
            catch {
                theme = {};
            }
        }
        res.json({
            bgImageUrl: theme.bgImageUrl || "",
            logoUrl: theme.logoUrl || "",
            customCss: theme.customCss || ""
        });
    });
    app.post("/api/settings/theme", (req, res) => {
        const { bgImageUrl, logoUrl, customCss } = req.body ?? {};
        (0, db_1.setSetting)("theme_json", JSON.stringify({
            bgImageUrl: bgImageUrl || "",
            logoUrl: logoUrl || "",
            customCss: customCss || ""
        }));
        res.json({ ok: true });
    });
    // ---- Scene-data (Caster Desk / Top16-overlay) ----
    // CasterDesk.html henter ALT innhold sitt (caster-navn/tags,
    // sponsor, ticker, OG Top 16-listen) fra dette ene endepunktet -
    // det fantes ikke i det hele tatt fra for, sa siden viste bare
    // placeholder-tekst uansett hva som ble lagret i Stream-innhold.
    app.get("/api/scenes/casterdesk", (_req, res) => {
        const raw = (0, db_1.getSetting)("stream_content_json");
        let content = {};
        if (raw) {
            try {
                content = JSON.parse(raw);
            }
            catch {
                content = {};
            }
        }
        const tournamentId = (0, db_1.getActiveTournamentId)();
        const standings = tournamentId
            ? db_1.db
                .prepare(`SELECT s.rank, s.wins, s.losses, s.draws, p.name, p.flag_code
             FROM standings s
             JOIN players p ON p.id = s.player_id
             WHERE s.tournament_id = ?
             ORDER BY s.rank ASC
             LIMIT 16`)
                .all(tournamentId)
            : [];
        const rows = standings.map((s) => ({
            rank: s.rank,
            name: s.name,
            record: `${s.wins ?? 0}-${s.losses ?? 0}-${s.draws ?? 0}`,
            flag: s.flag_code ?? ""
        }));
        res.json({
            ...content,
            top16: { rows }
        });
    });
    // ---- StreamStartingWidget (samme top16-data som CasterDesk, uten caster-info) ----
    app.get("/api/scenes/streamwidget", (_req, res) => {
        const tournamentId = (0, db_1.getActiveTournamentId)();
        const standings = tournamentId
            ? db_1.db
                .prepare(`SELECT s.rank, s.wins, s.losses, s.draws, p.name, p.flag_code
             FROM standings s
             JOIN players p ON p.id = s.player_id
             WHERE s.tournament_id = ?
             ORDER BY s.rank ASC
             LIMIT 16`)
                .all(tournamentId)
            : [];
        const rows = standings.map((s) => ({
            rank: s.rank,
            name: s.name,
            record: `${s.wins ?? 0}-${s.losses ?? 0}-${s.draws ?? 0}`,
            flag: s.flag_code ?? ""
        }));
        res.json({ top16: { rows } });
    });
    // ---- Melee-innstillinger ----
    app.get("/api/settings/melee", (_req, res) => {
        res.json({
            clientId: (0, db_1.getSetting)("melee_client_id"),
            // Hemmelig - sender KUN om den finnes, aldri selve verdien tilbake
            // til UI-et etter forste lagring.
            hasClientSecret: !!(0, db_1.getSetting)("melee_client_secret"),
            tournamentId: (0, db_1.getSetting)("melee_tournament_id"),
            enabled: (0, db_1.getSetting)("melee_sync_enabled") !== "off"
        });
    });
    app.post("/api/settings/melee", (req, res) => {
        const { clientId, clientSecret, tournamentId, enabled } = req.body ?? {};
        if (clientId != null)
            (0, db_1.setSetting)("melee_client_id", String(clientId));
        if (clientSecret)
            (0, db_1.setSetting)("melee_client_secret", String(clientSecret));
        if (tournamentId != null)
            (0, db_1.setSetting)("melee_tournament_id", String(tournamentId));
        if (enabled != null)
            (0, db_1.setSetting)("melee_sync_enabled", enabled ? "on" : "off");
        res.json({ ok: true });
    });
    // ---- OBS-innstillinger/tilkobling ----
    // Disse rutene manglet tidligere - obs.ts fantes og hadde all logikken
    // (connectObs, saveObsSettings osv.), men var aldri koblet opp mot
    // Express her, sa "Koble til OBS"-knappen i UI-et kalte et endepunkt
    // som ikke fantes (404) og feilet stille.
    const sceneKeys = ["bo3", "bo5", "meta", "top16", "bracket", "casterdesk", "starting"];
    app.get("/api/settings/obs", async (_req, res) => {
        const status = (0, obs_1.getObsStatus)();
        const scenes = await (0, obs_1.listObsScenes)();
        res.json({
            ...status,
            scenes,
            sceneNameOverrides: (0, obs_1.getObsSceneNameOverrides)(sceneKeys)
        });
    });
    app.post("/api/settings/obs", (req, res) => {
        const { host, port, password } = req.body ?? {};
        (0, obs_1.saveObsSettings)(String(host ?? "localhost"), String(port ?? "4455"), String(password ?? ""));
        res.json({ ok: true });
    });
    app.post("/api/settings/obs/connect", async (_req, res) => {
        const result = await (0, obs_1.connectObs)();
        res.json(result);
    });
    app.post("/api/settings/obs/disconnect", (_req, res) => {
        (0, obs_1.disconnectObs)();
        res.json({ ok: true });
    });
    app.post("/api/settings/obs/scene-name", (req, res) => {
        const { sceneKey, obsSceneName } = req.body ?? {};
        if (!sceneKey)
            return res.status(400).json({ error: "sceneKey er pakrevd" });
        (0, obs_1.saveObsSceneNameOverride)(String(sceneKey), String(obsSceneName ?? ""));
        res.json({ ok: true });
    });
    // ---- Melee sync ----
    app.post("/api/melee/sync", async (_req, res) => {
        const result = await (0, melee_1.syncMeleeAll)();
        if (result.ok)
            pushBroadcastUpdate();
        res.json(result);
    });
    app.get("/api/melee/log", (_req, res) => {
        const rows = db_1.db.prepare(`SELECT * FROM melee_sync_log ORDER BY id DESC LIMIT 20`).all();
        res.json(rows);
    });
    // ---- Tournament ----
    app.get("/api/tournament", (_req, res) => {
        const id = (0, db_1.getActiveTournamentId)();
        if (!id)
            return res.json(null);
        const tournament = db_1.db.prepare(`SELECT * FROM tournaments WHERE id = ?`).get(id);
        res.json(tournament);
    });
    app.post("/api/tournament", (req, res) => {
        const { name, format, totalRounds } = req.body ?? {};
        if (!name)
            return res.status(400).json({ error: "name er pakrevd" });
        const info = db_1.db
            .prepare(`INSERT INTO tournaments (name, format, total_rounds) VALUES (?, ?, ?)`)
            .run(String(name), String(format ?? ""), Number(totalRounds ?? 0));
        res.json({ id: info.lastInsertRowid });
    });
    app.patch("/api/tournament/:id", (req, res) => {
        const id = Number(req.params.id);
        const { name, format, totalRounds } = req.body ?? {};
        db_1.db.prepare(`UPDATE tournaments SET name = ?, format = ?, total_rounds = ? WHERE id = ?`).run(String(name ?? ""), String(format ?? ""), Number(totalRounds ?? 0), id);
        res.json({ ok: true });
    });
    app.delete("/api/tournament/:id", (req, res) => {
        const id = Number(req.params.id);
        // ON DELETE CASCADE i schemaet tar seg av players/matches/standings.
        db_1.db.prepare(`DELETE FROM tournaments WHERE id = ?`).run(id);
        res.json({ ok: true });
    });
    // ---- Runde-alternativer (dropdown-listen brukt i RoundSelect) ----
    app.get("/api/settings/rounds", (_req, res) => {
        const raw = (0, db_1.getSetting)("round_options_json");
        let rounds = [];
        if (raw) {
            try {
                rounds = JSON.parse(raw);
            }
            catch {
                rounds = [];
            }
        }
        if (!Array.isArray(rounds) || rounds.length === 0) {
            // Ingen runder lagret enna (eller en tom liste ble lagret fra
            // for) - fyller inn en fornuftig standardliste (10 sveitsiske
            // runder + sluttspill) og lagrer den, slik at den blir en
            // vanlig, redigerbar liste via "Adm."-panelet etterpa.
            rounds = [
                "Runde 1", "Runde 2", "Runde 3", "Runde 4", "Runde 5",
                "Runde 6", "Runde 7", "Runde 8", "Runde 9", "Runde 10",
                "Kvartfinale", "Semifinale", "Finale"
            ];
            (0, db_1.setSetting)("round_options_json", JSON.stringify(rounds));
        }
        res.json({ rounds });
    });
    app.post("/api/settings/rounds", (req, res) => {
        const { rounds } = req.body ?? {};
        (0, db_1.setSetting)("round_options_json", JSON.stringify(Array.isArray(rounds) ? rounds : []));
        res.json({ ok: true });
    });
    // ---- Players ----
    app.get("/api/players", (req, res) => {
        const tournamentId = Number(req.query.tournamentId ?? (0, db_1.getActiveTournamentId)());
        const rows = db_1.db.prepare(`SELECT * FROM players WHERE tournament_id = ? ORDER BY name`).all(tournamentId);
        res.json(rows);
    });
    app.post("/api/players", (req, res) => {
        const { tournamentId, name, flagCode } = req.body ?? {};
        if (!tournamentId || !name)
            return res.status(400).json({ error: "tournamentId og name er pakrevd" });
        const info = db_1.db
            .prepare(`INSERT INTO players (tournament_id, name, flag_code) VALUES (?, ?, ?)`)
            .run(Number(tournamentId), String(name), String(flagCode ?? ""));
        res.json({ id: info.lastInsertRowid });
    });
    app.delete("/api/players/:id", (req, res) => {
        const id = Number(req.params.id);
        try {
            db_1.db.prepare(`DELETE FROM players WHERE id = ?`).run(id);
            res.json({ ok: true });
        }
        catch (err) {
            const message = String(err?.message || "");
            if (message.includes("FOREIGN KEY constraint failed")) {
                return res.status(400).json({
                    error: "Kan ikke slette - spilleren star fortsatt i en eller flere kamper. Fjern kampene forst."
                });
            }
            res.status(500).json({ error: message || "Ukjent feil" });
        }
    });
    app.patch("/api/players/:id/deck", (req, res) => {
        const id = Number(req.params.id);
        const { archetype } = req.body ?? {};
        // Legger til en NY deck-rad (samme prinsipp som resten av appen -
        // "gjeldende deck" er alltid den nyeste raden for spilleren, se
        // ORDER BY id DESC LIMIT 1 i buildBroadcastPayload).
        db_1.db.prepare(`INSERT INTO decks (player_id, archetype) VALUES (?, ?)`).run(id, String(archetype ?? ""));
        res.json({ ok: true });
    });
    app.patch("/api/players/:id/flag", (req, res) => {
        const id = Number(req.params.id);
        const { flag } = req.body ?? {};
        db_1.db.prepare(`UPDATE players SET flag_code = ? WHERE id = ?`).run(String(flag ?? ""), id);
        res.json({ ok: true });
    });
    // ---- Matches ----
    app.get("/api/matches", (req, res) => {
        const tournamentId = Number(req.query.tournamentId ?? (0, db_1.getActiveTournamentId)());
        const rows = db_1.db.prepare(`SELECT * FROM matches WHERE tournament_id = ? ORDER BY id DESC`).all(tournamentId);
        res.json(rows);
    });
    app.post("/api/matches", (req, res) => {
        const { tournamentId, player1Id, player2Id, tableNumber, isBo5 } = req.body ?? {};
        if (!tournamentId || !player1Id || !player2Id) {
            return res.status(400).json({ error: "tournamentId, player1Id, player2Id er pakrevd" });
        }
        const info = db_1.db
            .prepare(`INSERT INTO matches (tournament_id, player1_id, player2_id, table_number, is_bo5)
         VALUES (?, ?, ?, ?, ?)`)
            .run(Number(tournamentId), Number(player1Id), Number(player2Id), tableNumber ?? null, isBo5 ? 1 : 0);
        res.json({ id: info.lastInsertRowid });
    });
    // Delvis oppdatering av en kamp (liv, game-score, status osv.) - kalles
    // BADE fra Windows-UI-et og fra mobilappens Kontroll-fane. Etter enhver
    // endring pushes ny state til alle tilkoblede OBS/mobil-klienter
    // umiddelbart - "en handling -> hele systemet oppdateres" fra planen.
    app.patch("/api/matches/:id", (req, res) => {
        const id = Number(req.params.id);
        const fields = req.body ?? {};
        const allowed = {
            player1Life: "player1_life",
            player2Life: "player2_life",
            player1GameWins: "player1_game_wins",
            player2GameWins: "player2_game_wins",
            status: "status",
            winnerPlayerId: "winner_player_id",
            featureMatch: "feature_match",
            tableNumber: "table_number",
            format: "format",
            roundLabel: "round_label",
            player1CardShowcase: "player1_card_showcase",
            player2CardShowcase: "player2_card_showcase"
        };
        const setClauses = [];
        const values = [];
        for (const [key, column] of Object.entries(allowed)) {
            if (key in fields) {
                setClauses.push(`${column} = ?`);
                values.push(fields[key]);
            }
        }
        if (!setClauses.length)
            return res.status(400).json({ error: "ingen gyldige felt sendt" });
        values.push(id);
        db_1.db.prepare(`UPDATE matches SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);
        pushBroadcastUpdate();
        res.json({ ok: true });
    });
    app.post("/api/matches/:id/win-game", (req, res) => {
        const id = Number(req.params.id);
        const { player } = req.body ?? {};
        if (player !== 1 && player !== 2) {
            return res.status(400).json({ error: "player ma vaere 1 eller 2" });
        }
        const match = db_1.db.prepare(`SELECT * FROM matches WHERE id = ?`).get(id);
        if (!match)
            return res.status(404).json({ error: "kamp ikke funnet" });
        const winThreshold = match.is_bo5 ? 3 : 2;
        const column = player === 1 ? "player1_game_wins" : "player2_game_wins";
        const newGameWins = (player === 1 ? match.player1_game_wins : match.player2_game_wins) + 1;
        db_1.db.prepare(`UPDATE matches SET ${column} = ? WHERE id = ?`).run(newGameWins, id);
        const matchWon = newGameWins >= winThreshold;
        let eventType = "gameWin";
        if (matchWon) {
            eventType = "matchWin";
            const winnerPlayerId = player === 1 ? match.player1_id : match.player2_id;
            const loserPlayerId = player === 1 ? match.player2_id : match.player1_id;
            db_1.db.prepare(`UPDATE matches SET status = 'finished', winner_player_id = ? WHERE id = ?`).run(winnerPlayerId, id);
            // Standings-rad opprettes ved forste seier/tap hvis den ikke
            // allerede finnes (UNIQUE(tournament_id, player_id) i schemaet).
            db_1.db.prepare(`INSERT INTO standings (tournament_id, player_id, wins) VALUES (?, ?, 1)
         ON CONFLICT(tournament_id, player_id) DO UPDATE SET wins = wins + 1`).run(match.tournament_id, winnerPlayerId);
            db_1.db.prepare(`INSERT INTO standings (tournament_id, player_id, losses) VALUES (?, ?, 1)
         ON CONFLICT(tournament_id, player_id) DO UPDATE SET losses = losses + 1`).run(match.tournament_id, loserPlayerId);
        }
        // event_id teller opp for hver hendelse - overlayets vinner-
        // animasjon (script.js/bo5-overlay.js) spiller KUN av nar denne
        // faktisk endrer seg siden forrige melding.
        db_1.db.prepare(`UPDATE matches SET event_id = event_id + 1, event_type = ?, event_player = ? WHERE id = ?`).run(eventType, player, id);
        pushBroadcastUpdate();
        res.json({ ok: true, matchWon });
    });
    // ---- Broadcast control ----
    app.post("/api/broadcast/scene", async (req, res) => {
        const { scene } = req.body ?? {};
        if (!scene)
            return res.status(400).json({ error: "scene er pakrevd" });
        db_1.db.prepare(`UPDATE broadcast_state SET active_scene = ?, updated_at = datetime('now') WHERE id = 1`).run(String(scene));
        pushBroadcastUpdate();
        // Bytter ogsa selve LIVE-scenen i OBS hvis tilkoblet - feiler stille
        // (se setObsScene i obs.ts) hvis OBS ikke er tilkoblet.
        await (0, obs_1.setObsScene)(String(scene));
        res.json({ ok: true });
    });
    app.post("/api/broadcast/set-match", (req, res) => {
        const { board, matchId } = req.body ?? {};
        const column = board === "bo5" ? "bo5_match_id" : "bo3_match_id";
        db_1.db.prepare(`UPDATE broadcast_state SET ${column} = ?, updated_at = datetime('now') WHERE id = 1`).run(matchId ?? null);
        pushBroadcastUpdate();
        res.json({ ok: true });
    });
    app.post("/api/broadcast/timer", (req, res) => {
        const { board, action, seconds } = req.body ?? {};
        const prefix = board === "bo5" ? "bo5" : "bo3";
        const statusColumn = `${prefix}_timer_status`;
        const secondsColumn = `${prefix}_timer_seconds`;
        if (action === "reset") {
            db_1.db.prepare(`UPDATE broadcast_state SET ${statusColumn} = 'reset', ${secondsColumn} = ?, updated_at = datetime('now') WHERE id = 1`).run(Number(seconds ?? 3000));
        }
        else if (action === "start" || action === "pause") {
            const updates = [`${statusColumn} = ?`];
            const values = [action];
            if (seconds != null) {
                updates.push(`${secondsColumn} = ?`);
                values.push(Number(seconds));
            }
            db_1.db.prepare(`UPDATE broadcast_state SET ${updates.join(", ")}, updated_at = datetime('now') WHERE id = 1`).run(...values);
        }
        else {
            return res.status(400).json({ error: "action ma vaere start, pause eller reset" });
        }
        pushBroadcastUpdate();
        res.json({ ok: true });
    });
    app.get("/api/broadcast/state", (_req, res) => {
        res.json(buildBroadcastPayload());
    });
    // ---- Meta-keycards (nokkelkort per arketype, satt manuelt) ----
    app.get("/api/meta-keycards", (_req, res) => {
        const tournamentId = (0, db_1.getActiveTournamentId)();
        if (!tournamentId)
            return res.json([]);
        const rows = db_1.db
            .prepare(`SELECT * FROM meta_keycards WHERE tournament_id = ?`)
            .all(tournamentId);
        res.json(rows);
    });
    app.post("/api/meta-keycards", (req, res) => {
        const tournamentId = (0, db_1.getActiveTournamentId)();
        if (!tournamentId)
            return res.status(400).json({ error: "ingen aktiv turnering" });
        const { archetype, keyCard1, keyCard2 } = req.body ?? {};
        const archetypeLabel = String(archetype ?? "").trim();
        if (!archetypeLabel)
            return res.status(400).json({ error: "archetype er pakrevd" });
        const archetypeKey = archetypeLabel.toLowerCase().replace(/[^a-z0-9]/g, "");
        db_1.db.prepare(`INSERT INTO meta_keycards (tournament_id, archetype_key, archetype_label, key_card_1, key_card_2)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(tournament_id, archetype_key) DO UPDATE SET
         archetype_label = excluded.archetype_label,
         key_card_1 = excluded.key_card_1,
         key_card_2 = excluded.key_card_2`).run(tournamentId, archetypeKey, archetypeLabel, String(keyCard1 ?? ""), String(keyCard2 ?? ""));
        res.json({ ok: true });
    });
    // ---- Meta breakdown (arketype-fordeling) ----
    // MIDLERTIDIG: beregner fordelingen ut fra lokale decks-rader (siste
    // deck per spiller i aktiv turnering) i stedet for a hente fra Melee
    // sitt decklist-endepunkt (se getMeleeMetaBreakdown i melee.ts) -
    // den ekte Melee-baserte versjonen kobles inn nar melee.ts er
    // gjennomgatt.
    app.get("/api/scenes/meta", (_req, res) => {
        const tournamentId = (0, db_1.getActiveTournamentId)();
        if (!tournamentId)
            return res.json({ rows: [] });
        const decks = db_1.db
            .prepare(`SELECT d.archetype, COUNT(*) as count
         FROM decks d
         JOIN players p ON p.id = d.player_id
         WHERE p.tournament_id = ?
           AND d.id = (SELECT MAX(id) FROM decks WHERE player_id = d.player_id)
           AND d.archetype != ''
         GROUP BY d.archetype
         ORDER BY count DESC`)
            .all(tournamentId);
        const total = decks.reduce((sum, row) => sum + row.count, 0);
        const rows = decks.map((row) => ({
            archetype: row.archetype,
            count: String(row.count),
            share: total > 0 ? `${Math.round((row.count / total) * 100)}%` : "0%"
        }));
        res.json({ rows });
    });
    // ---- Tilgangskoder (ekstern tilkobling via Cloudflare Tunnel) ----
    app.get("/api/access-tokens", (_req, res) => {
        const rows = db_1.db.prepare(`SELECT * FROM access_tokens ORDER BY id DESC`).all();
        res.json(rows);
    });
    app.post("/api/access-tokens", (req, res) => {
        const { label } = req.body ?? {};
        const token = node_crypto_1.default.randomBytes(16).toString("hex");
        db_1.db.prepare(`INSERT INTO access_tokens (token, label, status) VALUES (?, ?, 'allowed')`).run(token, String(label ?? ""));
        res.json({ token });
    });
    app.patch("/api/access-tokens/:id", (req, res) => {
        const id = Number(req.params.id);
        const { status } = req.body ?? {};
        db_1.db.prepare(`UPDATE access_tokens SET status = ? WHERE id = ?`).run(String(status ?? "allowed"), id);
        res.json({ ok: true });
    });
    app.delete("/api/access-tokens/:id", (req, res) => {
        const id = Number(req.params.id);
        db_1.db.prepare(`DELETE FROM access_tokens WHERE id = ?`).run(id);
        res.json({ ok: true });
    });
    // ---- Bulk sett runde pa pagaende kamper ----
    app.post("/api/tournament/:id/set-round", (req, res) => {
        const tournamentId = Number(req.params.id);
        const { round } = req.body ?? {};
        if (!round)
            return res.status(400).json({ error: "round er pakrevd" });
        const info = db_1.db
            .prepare(`UPDATE matches SET round_label = ? WHERE tournament_id = ? AND status = 'in_progress'`)
            .run(String(round), tournamentId);
        pushBroadcastUpdate();
        res.json({ ok: true, updated: info.changes });
    });
    // ---- Generer pairings (enkel Swiss-lignende parring) ----
    // Sorterer etter antall seire (flest forst), unngar re-kamper der
    // det er mulig, og gir bye (automatisk seier) til siste spiller ved
    // oddetall antall. Dette er en forenklet algoritme - ikke full
    // Swiss-standard med tiebreakers, men dekker en vanlig kveld greit.
    app.post("/api/tournament/:id/generate-pairings", (req, res) => {
        const tournamentId = Number(req.params.id);
        const { round } = req.body ?? {};
        if (!round)
            return res.status(400).json({ error: "round er pakrevd" });
        const players = db_1.db
            .prepare(`SELECT id, name FROM players WHERE tournament_id = ?`)
            .all(tournamentId);
        if (players.length < 2) {
            return res.status(400).json({ error: "trenger minst 2 spillere for a generere pairings" });
        }
        const standings = db_1.db
            .prepare(`SELECT player_id, wins FROM standings WHERE tournament_id = ?`)
            .all(tournamentId);
        const winsByPlayer = new Map(standings.map((s) => [s.player_id, s.wins]));
        const priorMatches = db_1.db
            .prepare(`SELECT player1_id, player2_id FROM matches WHERE tournament_id = ?`)
            .all(tournamentId);
        const alreadyPlayed = new Set(priorMatches.map((m) => [m.player1_id, m.player2_id].sort().join("-")));
        const sortedPlayers = [...players].sort((a, b) => (winsByPlayer.get(b.id) ?? 0) - (winsByPlayer.get(a.id) ?? 0));
        const unpaired = [...sortedPlayers];
        const pairs = [];
        const newMatches = [];
        let byeName = null;
        while (unpaired.length > 0) {
            const current = unpaired.shift();
            if (unpaired.length === 0) {
                byeName = current.name;
                db_1.db.prepare(`INSERT INTO standings (tournament_id, player_id, wins) VALUES (?, ?, 1)
           ON CONFLICT(tournament_id, player_id) DO UPDATE SET wins = wins + 1`).run(tournamentId, current.id);
                break;
            }
            let opponentIndex = unpaired.findIndex((candidate) => !alreadyPlayed.has([current.id, candidate.id].sort().join("-")));
            if (opponentIndex === -1)
                opponentIndex = 0;
            const [opponent] = unpaired.splice(opponentIndex, 1);
            alreadyPlayed.add([current.id, opponent.id].sort().join("-"));
            pairs.push({ player1: current.name, player2: opponent.name });
            newMatches.push({ player1Id: current.id, player2Id: opponent.id });
        }
        const insertMatch = db_1.db.prepare(`INSERT INTO matches (tournament_id, player1_id, player2_id, table_number, is_bo5, round_label)
       VALUES (?, ?, ?, ?, 0, ?)`);
        newMatches.forEach((m, index) => {
            insertMatch.run(tournamentId, m.player1Id, m.player2Id, index + 1, String(round));
        });
        res.json({ pairs, bye: byeName });
    });
    server.listen(PORT, () => {
        console.log(`[server] Lokal API + WebSocket kjorer pa http://localhost:${PORT}`);
    });
    // Starter automatisk Melee-sync (hvert 30. sekund, se server/melee.ts)
    // - pusher oppdatert state til OBS/mobil hver gang en sync faktisk
    // endret noe.
    (0, melee_1.startMeleeAutoSync)(pushBroadcastUpdate);
    return { app, server, wss, port: PORT };
}
