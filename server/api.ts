import express from "express";
import cors from "cors";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { app as electronApp } from "electron";
import { WebSocketServer, WebSocket } from "ws";
import { db, getActiveTournamentId, getSetting, setSetting, runBackup, getBackupStatus, restoreBackup, getDbFilePath, appLog, getLogSettings, setLogSettings, getLogs, getUserRoles, setUserRoles } from "./db";
import { hashPassword, verifyPassword } from "./auth";
import { syncMeleeAll, startMeleeAutoSync } from "./melee";
import {
  connectObs,
  disconnectObs,
  getObsStatus,
  getObsSceneNameOverrides,
  getObsStreamStatus,
  getObsRecordStatus,
  startObsStream,
  stopObsStream,
  listObsScenes,
  saveObsSettings,
  saveObsSceneNameOverride,
  saveObsPlaceholderScene,
  setObsScene,
  ensureStudioMode,
  getObsStudioState,
  setObsPreviewScene,
  takeObsTransition,
  cutObsScene,
  stingerObsTransition,
  resolveObsSceneName,
  getObsSceneScreenshot
} from "./obs";

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
const serverStartedAt = Date.now();

// De 7 nokkelene med ekte overlay-HTML-sider, pluss 5 rene OBS-scener
// uten noen tilhorende overlay-fil (f.eks. et kamera-only intervju-
// oppsett satt opp direkte i OBS). Studio Mode/scenebytte i OBS
// bryr seg ikke om en scene har en overlay-fil eller ikke - alle 12
// fungerer likt for Take/Cut/Stinger, sa lenge scenenavnet (eller en
// overstyring under Settings) matcher noe som faktisk finnes i OBS.
const ALL_SCENE_KEYS = [
  "bo3", "bo5", "meta", "top16", "bracket", "casterdesk", "starting",
  "day2bracket", "placeholder", "floor", "interview", "endstream"
];

// Arm Intermission-nedtelling - kun i minnet (samme prinsipp som OBS-
// tilkoblingen i obs.ts), siden den kun trenger a overleve sa lenge
// serveren kjorer under selve sendingen. Restart av appen nullstiller
// en eventuelt aktiv nedtelling.
let intermissionTimer: NodeJS.Timeout | null = null;
let intermissionEndsAt: number | null = null;

// Innloggingssesjoner - kun i minnet (samme prinsipp som resten av
// runtime-tilstanden i denne fila). Restart av appen krever ny
// innlogging - det er en fornuftig standard for et sendings-verktoy.
type Session = { userId: number; username: string; roles: string[] };
const sessions = new Map<string, Session>();

export function startServer() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "25mb" }));

  // Hindrer nettleseren (og evt. mellomledd) i a cache GET-svar fra
  // API-et - uten dette kan en vanlig F5-oppdatering vise et gammelt,
  // cachet JSON-svar i stedet for et ferskt fra serveren, selv om
  // verdien faktisk har endret seg pa server-siden. Statiske overlay-
  // filer under /overlay er IKKE rammet av dette (de settes opp
  // separat under, med sin egen express.static).
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    next();
  });
  // __dirname her peker pa dist-electron/server (kompilert output).
  // I dev-modus (npm run dev) er to nivaer opp derfra prosjektroten,
  // hvor selve overlay/-mappen ligger (den kompileres ikke av tsc,
  // den serveres direkte som statiske filer). I en pakket .exe
  // finnes ikke prosjektroten pa disk - da ligger overlay-mappen i
  // stedet under resources/ (se "extraResources" i package.json),
  // sa vi ma velge riktig sti avhengig av om appen er pakket eller ei.
  const overlayPath = electronApp.isPackaged
    ? path.join(process.resourcesPath, "overlay")
    : path.join(__dirname, "..", "..", "overlay");
  app.use("/overlay", express.static(overlayPath));

  // ---- Innlogging / brukerkontoer ----
  function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const token = String(req.headers["x-auth-token"] ?? "");
    const session = sessions.get(token);
    if (!session) return res.status(401).json({ error: "Ikke innlogget" });
    (req as any).session = session;
    next();
  }

  function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
    const session = (req as any).session as Session | undefined;
    if (!session || !session.roles.includes("ADMINISTRATOR")) {
      return res.status(403).json({ error: "Krever administrator-rolle" });
    }
    next();
  }

  app.get("/api/auth/bootstrap-status", (_req, res) => {
    const userCount = (db.prepare(`SELECT COUNT(*) as n FROM users`).get() as any).n;
    res.json({ hasUsers: userCount > 0 });
  });

  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body ?? {};
    const user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(String(username ?? "")) as any;

    if (!user || !verifyPassword(String(password ?? ""), user.password_hash)) {
      return res.status(401).json({ error: "Feil brukernavn eller passord" });
    }

    const token = crypto.randomBytes(24).toString("hex");
    const roles = getUserRoles(user.id);
    sessions.set(token, { userId: user.id, username: user.username, roles });
    res.json({ token, username: user.username, roles });
  });

  app.post("/api/auth/logout", (req, res) => {
    const { token } = req.body ?? {};
    sessions.delete(String(token ?? ""));
    res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json((req as any).session);
  });

  // Brukerstyring (Users & Access-siden). Unntak: hvis det IKKE finnes
  // noen brukere enna (forste gang appen tas i bruk), tillates aa
  // opprette den aller forste kontoen uten innlogging - ellers ville
  // ingen kunne logge inn i det hele tatt (hona-og-egget-problem).
  function requireAuthOrBootstrap(req: express.Request, res: express.Response, next: express.NextFunction) {
    const userCount = (db.prepare(`SELECT COUNT(*) as n FROM users`).get() as any).n;
    if (userCount === 0) return next();
    return requireAuth(req, res, next);
  }

  app.get("/api/users", requireAuth, (_req, res) => {
    const rows = db.prepare(`SELECT id, username, role, created_at FROM users ORDER BY username`).all() as any[];
    const withRoles = rows.map((u) => ({ ...u, roles: getUserRoles(u.id) }));
    res.json(withRoles);
  });

  app.post("/api/users", requireAuthOrBootstrap, (req, res) => {
    const { username, password, role, roles } = req.body ?? {};
    if (!username || !password) return res.status(400).json({ error: "username og password er pakrevd" });

    // Godtar bade det gamle "role" (enkelt streng) og det nye "roles"
    // (liste) - forste gang appen tas i bruk (bootstrap) sender
    // LoginScreen fortsatt roles: ["ADMINISTRATOR"], men gamle/eksterne
    // kall med kun "role" skal ikke plutselig knekke.
    const roleList: string[] = Array.isArray(roles) && roles.length > 0 ? roles : [String(role ?? "EVENT")];

    try {
      const info = db
        .prepare(`INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`)
        .run(String(username), hashPassword(String(password)), roleList[0]);
      setUserRoles(Number(info.lastInsertRowid), roleList);
      res.json({ id: info.lastInsertRowid });
    } catch (err: any) {
      res.status(400).json({ error: "Brukernavnet er allerede i bruk" });
    }
  });

  app.delete("/api/users/:id", requireAuth, requireAdmin, (req, res) => {
    db.prepare(`DELETE FROM users WHERE id = ?`).run(Number(req.params.id));
    res.json({ ok: true });
  });

  // Erstatter HELE rollesettet for kontoen (se setUserRoles i
  // server/db.ts) - UI-et sender alltid det komplette onskede settet,
  // ikke en enkelt legg-til/fjern-endring.
  app.patch("/api/users/:id/roles", requireAuth, requireAdmin, (req, res) => {
    const { roles } = req.body ?? {};
    if (!Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({ error: "roles ma vaere en liste med minst en rolle" });
    }
    try {
      setUserRoles(Number(req.params.id), roles.map(String));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || String(err) });
    }
  });

  app.patch("/api/users/:id/password", requireAuth, requireAdmin, (req, res) => {
    const { password } = req.body ?? {};
    if (!password) return res.status(400).json({ error: "password er pakrevd" });
    db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hashPassword(String(password)), Number(req.params.id));
    res.json({ ok: true });
  });

  // MIDLERTIDIG DIAGNOSE-ENDEPUNKT - fjernes igjen nar overlay-stien er
  // bekreftet riktig. Viser noyaktig hvilken sti serveren regner ut,
  // om mappen finnes der, og hva som faktisk ligger i den (hvis noe).
  app.get("/api/debug/overlay-path", (_req, res) => {
    let exists = false;
    let filesInFolder: string[] | null = null;
    let readError: string | null = null;
    try {
      exists = fs.existsSync(overlayPath);
      if (exists) filesInFolder = fs.readdirSync(overlayPath);
    } catch (err) {
      readError = err instanceof Error ? err.message : String(err);
    }
    res.json({
      isPackaged: electronApp.isPackaged,
      dirname: __dirname,
      resourcesPath: process.resourcesPath,
      overlayPath,
      exists,
      filesInFolder,
      readError
    });
  });

  const server = http.createServer(app);

  // VIKTIG: noServer:true + manuell "upgrade"-ruting under, i stedet
  // for a la begge WebSocketServer-instansene feste seg direkte til
  // "server" med hver sin "path"-innstilling. Nar flere ws-instanser
  // deler samme HTTP-server via automatisk path-matching, kan begge
  // i sjeldne tilfeller forsoke a handtere samme upgrade-forsporsel -
  // noe som odelegger selve WebSocket-handshaken/rammingen (viste seg
  // som "Invalid frame header" og en tilkobling som stadig ryker og
  // kobler til pa nytt). Eksplisitt ruting her garanterer at KUN riktig
  // server noensinne handterer en gitt tilkobling.
  const wss = new WebSocketServer({ noServer: true });
  const adminWss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(request.url || "", "http://localhost");

    if (pathname === "/ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else if (pathname === "/ws-admin") {
      adminWss.handleUpgrade(request, socket, head, (ws) => {
        adminWss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // Egen WebSocket-server KUN for Observer-appen selv (host/klient-
  // instanser) - helt atskilt fra "wss" over, som er overlayenes
  // (BO3.html/BO5.html osv.) tilkobling. Grunnen til at de ma vaere
  // to forskjellige: hver overlay-scene i OBS holder sin egen "wss"-
  // tilkobling apen i bakgrunnen (selv nar scenen ikke er synlig pa
  // streamen), sa CLIENTS-tallet i toppbaren viste antall overlay-
  // kilder i stedet for antall faktiske personer/enheter som
  // fjernstyrer appen. adminWss teller KUN det siste.
  adminWss.on("connection", (ws) => {
    ws.on("error", () => {});
  });

  function broadcast(payload: unknown) {
    const json = JSON.stringify(payload);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    });
  }

  function buildBroadcastPayload() {
    const state = db.prepare(`SELECT * FROM broadcast_state WHERE id = 1`).get() as any;

    function loadMatch(matchId: number | null) {
      if (!matchId) return null;
      const match = db.prepare(`SELECT * FROM matches WHERE id = ?`).get(matchId) as any;
      if (!match) return null;

      const p1 = db.prepare(`SELECT * FROM players WHERE id = ?`).get(match.player1_id) as any;
      const p2 = db.prepare(`SELECT * FROM players WHERE id = ?`).get(match.player2_id) as any;
      const deck1 = db.prepare(`SELECT * FROM decks WHERE player_id = ? ORDER BY id DESC LIMIT 1`).get(match.player1_id) as any;
      const deck2 = db.prepare(`SELECT * FROM decks WHERE player_id = ? ORDER BY id DESC LIMIT 1`).get(match.player2_id) as any;
      const standing1 = db.prepare(`SELECT * FROM standings WHERE player_id = ?`).get(match.player1_id) as any;
      const standing2 = db.prepare(`SELECT * FROM standings WHERE player_id = ?`).get(match.player2_id) as any;

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

    const tournamentId = getActiveTournamentId();

    // Top16.html leser data.standings direkte (se readSource i den
    // filen) - full rangeringsliste for aktiv turnering, nyeste
    // topp 16.
    const standings = tournamentId
      ? (db
          .prepare(
            `SELECT s.rank, s.wins, s.losses, s.draws, p.name, p.flag_code
             FROM standings s
             JOIN players p ON p.id = s.player_id
             WHERE s.tournament_id = ?
             ORDER BY s.rank ASC
             LIMIT 16`
          )
          .all(tournamentId) as any[])
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
    function loadBracketRound(round: string) {
      if (!tournamentId) return [];
      const rows = db
        .prepare(
          `SELECT * FROM bracket_matches WHERE tournament_id = ? AND round = ? ORDER BY position ASC`
        )
        .all(tournamentId, round) as any[];
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
      },
      cardShowcaseVisible: getSetting("card_showcase_visible") !== "off",
      showNameTags: getSetting("show_name_tags") !== "off"
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
    const raw = getSetting("stream_content_json");
    let parsed: Record<string, string> = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = {};
      }
    }
    res.json(parsed);
  });

  app.post("/api/settings/stream-content", (req, res) => {
    const fields = req.body ?? {};
    setSetting("stream_content_json", JSON.stringify(fields));
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
  const themesRootPath = path.join(overlayPath, "themes");
  const activeThemeAssetsPath = path.join(overlayPath, "theme-assets");

  function ensureDir(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }

  function sanitizeThemeName(raw: string) {
    return String(raw || "")
      .trim()
      .replace(/[^a-zA-Z0-9 _-]/g, "")
      .slice(0, 60);
  }

  function extFromDataUri(dataUri: string): string | null {
    const match = /^data:image\/(\w+);base64,/.exec(dataUri);
    if (!match) return null;
    const type = match[1].toLowerCase();
    return type === "jpeg" ? "jpg" : type;
  }

  function writeDataUriToDir(dir: string, baseName: "bg" | "logo", dataUri: string | undefined, clear: boolean) {
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
      const existing = path.join(dir, `${baseName}.${ext}`);
      if (fs.existsSync(existing)) fs.unlinkSync(existing);
    }
    if (!isNewFile) return;
    const ext = extFromDataUri(dataUri!);
    if (!ext) return;
    const base64 = dataUri!.split(",")[1] || "";
    fs.writeFileSync(path.join(dir, `${baseName}.${ext}`), Buffer.from(base64, "base64"));
  }

  function writeCssToDir(dir: string, customCss: string | undefined) {
    const cssPath = path.join(dir, "custom.css");
    if (customCss) {
      fs.writeFileSync(cssPath, customCss, "utf8");
    } else if (fs.existsSync(cssPath)) {
      fs.unlinkSync(cssPath);
    }
  }

  function copyThemeDir(fromDir: string, toDir: string) {
    ensureDir(toDir);
    for (const name of ["bg.png", "bg.jpg", "bg.gif", "bg.webp", "bg.bmp", "bg.svg",
                          "logo.png", "logo.jpg", "logo.gif", "logo.webp", "logo.bmp", "logo.svg",
                          "custom.css", "logo-scenes.json"]) {
      const from = path.join(fromDir, name);
      const to = path.join(toDir, name);
      if (fs.existsSync(from)) {
        fs.copyFileSync(from, to);
      } else if (fs.existsSync(to)) {
        fs.unlinkSync(to);
      }
    }
  }

  function findAssetFile(dir: string, baseName: "bg" | "logo"): string | null {
    for (const ext of ["png", "jpg", "gif", "webp", "bmp", "svg"]) {
      const fileName = `${baseName}.${ext}`;
      if (fs.existsSync(path.join(dir, fileName))) return fileName;
    }
    return null;
  }

  app.get("/api/themes", (_req, res) => {
    ensureDir(themesRootPath);
    const names = fs
      .readdirSync(themesRootPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    res.json({ names, activeName: getSetting("active_theme_name") || "" });
  });

  app.post("/api/themes/save", (req, res) => {
    const { name, bgImageUrl, logoUrl, customCss, hiddenLogoScenes, clearBg, clearLogo } = req.body ?? {};
    const cleanName = sanitizeThemeName(name);
    if (!cleanName) return res.status(400).json({ error: "Ugyldig temanavn" });

    const themeDir = path.join(themesRootPath, cleanName);
    ensureDir(themeDir);

    try {
      writeDataUriToDir(themeDir, "bg", bgImageUrl, !!clearBg);
      writeDataUriToDir(themeDir, "logo", logoUrl, !!clearLogo);
      if (customCss !== undefined) writeCssToDir(themeDir, customCss);
      if (hiddenLogoScenes !== undefined) {
        fs.writeFileSync(
          path.join(themeDir, "logo-scenes.json"),
          JSON.stringify(Array.isArray(hiddenLogoScenes) ? hiddenLogoScenes : [])
        );
      }
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Klarte ikke lagre temafiler" });
    }

    // Nylagret tema blir ogsa umiddelbart det aktive.
    copyThemeDir(themeDir, activeThemeAssetsPath);
    setSetting("active_theme_name", cleanName);

    res.json({ ok: true, name: cleanName });
  });

  app.post("/api/themes/activate", (req, res) => {
    const { name } = req.body ?? {};
    const cleanName = sanitizeThemeName(name);
    const themeDir = path.join(themesRootPath, cleanName);
    if (!cleanName || !fs.existsSync(themeDir)) {
      return res.status(404).json({ error: "Fant ikke temaet" });
    }

    copyThemeDir(themeDir, activeThemeAssetsPath);
    setSetting("active_theme_name", cleanName);
    res.json({ ok: true });
  });

  app.get("/api/themes/active", (_req, res) => {
    ensureDir(activeThemeAssetsPath);
    const bgFile = findAssetFile(activeThemeAssetsPath, "bg");
    const logoFile = findAssetFile(activeThemeAssetsPath, "logo");
    const cssPath = path.join(activeThemeAssetsPath, "custom.css");
    const scenesPath = path.join(activeThemeAssetsPath, "logo-scenes.json");

    function versionOf(fileName: string) {
      try {
        return fs.statSync(path.join(activeThemeAssetsPath, fileName)).mtimeMs;
      } catch {
        return 0;
      }
    }

    let hiddenLogoScenes: string[] = [];
    if (fs.existsSync(scenesPath)) {
      try {
        hiddenLogoScenes = JSON.parse(fs.readFileSync(scenesPath, "utf8"));
      } catch {
        hiddenLogoScenes = [];
      }
    }

    res.json({
      name: getSetting("active_theme_name") || "",
      bgImageUrl: bgFile ? `/overlay/theme-assets/${bgFile}?v=${versionOf(bgFile)}` : "",
      logoUrl: logoFile ? `/overlay/theme-assets/${logoFile}?v=${versionOf(logoFile)}` : "",
      customCss: fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf8") : "",
      hiddenLogoScenes
    });
  });

  // ---- Tema (gammel base64-basert versjon - ikke lenger i bruk av
  // theme-loader.js, men star igjen uskadelig i tilfelle noe fortsatt
  // kaller den) ----
  app.get("/api/settings/theme", (_req, res) => {
    const raw = getSetting("theme_json");
    let theme: Record<string, string> = {};
    if (raw) {
      try {
        theme = JSON.parse(raw);
      } catch {
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
    setSetting("theme_json", JSON.stringify({
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
    const raw = getSetting("stream_content_json");
    let content: Record<string, string> = {};
    if (raw) {
      try {
        content = JSON.parse(raw);
      } catch {
        content = {};
      }
    }

    const tournamentId = getActiveTournamentId();
    const standings = tournamentId
      ? (db
          .prepare(
            `SELECT s.rank, s.wins, s.losses, s.draws, p.name, p.flag_code
             FROM standings s
             JOIN players p ON p.id = s.player_id
             WHERE s.tournament_id = ?
             ORDER BY s.rank ASC
             LIMIT 16`
          )
          .all(tournamentId) as any[])
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
    const tournamentId = getActiveTournamentId();
    const standings = tournamentId
      ? (db
          .prepare(
            `SELECT s.rank, s.wins, s.losses, s.draws, p.name, p.flag_code
             FROM standings s
             JOIN players p ON p.id = s.player_id
             WHERE s.tournament_id = ?
             ORDER BY s.rank ASC
             LIMIT 16`
          )
          .all(tournamentId) as any[])
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
      clientId: getSetting("melee_client_id"),
      // Hemmelig - sender KUN om den finnes, aldri selve verdien tilbake
      // til UI-et etter forste lagring.
      hasClientSecret: !!getSetting("melee_client_secret"),
      tournamentId: getSetting("melee_tournament_id"),
      enabled: getSetting("melee_sync_enabled") !== "off"
    });
  });

  app.post("/api/settings/melee", (req, res) => {
    const { clientId, clientSecret, tournamentId, enabled } = req.body ?? {};

    if (clientId != null) setSetting("melee_client_id", String(clientId));
    if (clientSecret) setSetting("melee_client_secret", String(clientSecret));
    if (tournamentId != null) setSetting("melee_tournament_id", String(tournamentId));
    if (enabled != null) setSetting("melee_sync_enabled", enabled ? "on" : "off");

    res.json({ ok: true });
  });

  // ---- OBS-innstillinger/tilkobling ----
  // Disse rutene manglet tidligere - obs.ts fantes og hadde all logikken
  // (connectObs, saveObsSettings osv.), men var aldri koblet opp mot
  // Express her, sa "Koble til OBS"-knappen i UI-et kalte et endepunkt
  // som ikke fantes (404) og feilet stille.
  const sceneKeys = ALL_SCENE_KEYS;

  app.get("/api/settings/obs", async (_req, res) => {
    const status = getObsStatus();
    const scenes = await listObsScenes();
    res.json({
      ...status,
      scenes,
      sceneNameOverrides: getObsSceneNameOverrides(sceneKeys),
      placeholderScene: getSetting("obs_placeholder_scene") || "Placeholder"
    });
  });

  app.post("/api/settings/obs", (req, res) => {
    const { host, port, password, placeholderScene } = req.body ?? {};
    saveObsSettings(String(host ?? "localhost"), String(port ?? "4455"), String(password ?? ""));
    if (placeholderScene != null) saveObsPlaceholderScene(String(placeholderScene));
    res.json({ ok: true });
  });

  app.post("/api/settings/obs/connect", async (_req, res) => {
    const result = await connectObs();
    res.json(result);
  });

  app.post("/api/settings/obs/disconnect", (_req, res) => {
    disconnectObs();
    res.json({ ok: true });
  });

  app.post("/api/settings/obs/scene-name", (req, res) => {
    const { sceneKey, obsSceneName } = req.body ?? {};
    if (!sceneKey) return res.status(400).json({ error: "sceneKey er pakrevd" });
    saveObsSceneNameOverride(String(sceneKey), String(obsSceneName ?? ""));
    res.json({ ok: true });
  });

  // ---- Melee sync ----
  app.post("/api/melee/sync", async (_req, res) => {
    const result = await syncMeleeAll();
    if (result.ok) pushBroadcastUpdate();
    res.json(result);
  });

  app.get("/api/melee/log", (_req, res) => {
    const rows = db.prepare(`SELECT * FROM melee_sync_log ORDER BY id DESC LIMIT 20`).all();
    res.json(rows);
  });

  // ---- Tournament ----
  app.get("/api/tournament", (_req, res) => {
    const id = getActiveTournamentId();
    if (!id) return res.json(null);
    const tournament = db.prepare(`SELECT * FROM tournaments WHERE id = ?`).get(id);
    res.json(tournament);
  });

  app.post("/api/tournament", (req, res) => {
    const { name, format, totalRounds } = req.body ?? {};
    if (!name) return res.status(400).json({ error: "name er pakrevd" });

    const info = db
      .prepare(`INSERT INTO tournaments (name, format, total_rounds) VALUES (?, ?, ?)`)
      .run(String(name), String(format ?? ""), Number(totalRounds ?? 0));

    res.json({ id: info.lastInsertRowid });
  });

  // Delvis oppdatering - kun feltene som faktisk sendes med blir
  // endret (eksisterende verdi beholdes ellers). Utvidet med
  // currentRound/phase for "EDIT ROUND"/"ADVANCE STAGE" i Tournament-
  // fanen (Fallback Control) - tidligere overskrev denne ALLTID alle
  // tre feltene (name/format/totalRounds), selv nar de ikke ble sendt
  // med, noe som kunne nullstille dem ved en feil.
  app.patch("/api/tournament/:id", (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare(`SELECT * FROM tournaments WHERE id = ?`).get(id) as any;
    if (!existing) return res.status(404).json({ error: "turnering ikke funnet" });

    const { name, format, totalRounds, currentRound, phase } = req.body ?? {};

    db.prepare(`UPDATE tournaments SET name = ?, format = ?, total_rounds = ?, current_round = ?, phase = ? WHERE id = ?`).run(
      name != null ? String(name) : existing.name,
      format != null ? String(format) : existing.format,
      totalRounds != null ? Number(totalRounds) : existing.total_rounds,
      currentRound != null ? Number(currentRound) : existing.current_round,
      phase != null ? String(phase) : existing.phase,
      id
    );

    res.json({ ok: true });
  });

  app.delete("/api/tournament/:id", (req, res) => {
    const id = Number(req.params.id);
    // ON DELETE CASCADE i schemaet tar seg av players/matches/standings.
    db.prepare(`DELETE FROM tournaments WHERE id = ?`).run(id);
    res.json({ ok: true });
  });

  // ---- Runde-alternativer (dropdown-listen brukt i RoundSelect) ----
  app.get("/api/settings/rounds", (_req, res) => {
    const raw = getSetting("round_options_json");
    let rounds: string[] = [];
    if (raw) {
      try {
        rounds = JSON.parse(raw);
      } catch {
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
      setSetting("round_options_json", JSON.stringify(rounds));
    }
    res.json({ rounds });
  });

  app.post("/api/settings/rounds", (req, res) => {
    const { rounds } = req.body ?? {};
    setSetting("round_options_json", JSON.stringify(Array.isArray(rounds) ? rounds : []));
    res.json({ ok: true });
  });

  // ---- Players ----
  app.get("/api/players", (req, res) => {
    const tournamentId = Number(req.query.tournamentId ?? getActiveTournamentId());
    const rows = db.prepare(`SELECT * FROM players WHERE tournament_id = ? ORDER BY name`).all(tournamentId);
    res.json(rows);
  });

  // Full standings-liste (wins/losses/draws per spiller) for aktiv
  // turnering - brukes av Judge Workspace sitt RECORD-felt. De
  // eksisterende standings-uttrekkene andre steder (CasterDesk/
  // StreamWidget/broadcast-payload) er begrenset til topp 16 og
  // formatert som streng - dette er full liste, radata.
  app.get("/api/standings", (req, res) => {
    const tournamentId = Number(req.query.tournamentId ?? getActiveTournamentId());
    const rows = db.prepare(`SELECT player_id, rank, wins, losses, draws FROM standings WHERE tournament_id = ?`).all(tournamentId);
    res.json(rows);
  });

  app.post("/api/players", (req, res) => {
    const { tournamentId, name, flagCode } = req.body ?? {};
    if (!tournamentId || !name) return res.status(400).json({ error: "tournamentId og name er pakrevd" });

    const info = db
      .prepare(`INSERT INTO players (tournament_id, name, flag_code) VALUES (?, ?, ?)`)
      .run(Number(tournamentId), String(name), String(flagCode ?? ""));

    res.json({ id: info.lastInsertRowid });
  });

  app.delete("/api/players/:id", (req, res) => {
    const id = Number(req.params.id);
    try {
      db.prepare(`DELETE FROM players WHERE id = ?`).run(id);
      res.json({ ok: true });
    } catch (err: any) {
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
    db.prepare(`INSERT INTO decks (player_id, archetype) VALUES (?, ?)`).run(id, String(archetype ?? ""));
    res.json({ ok: true });
  });

  app.patch("/api/players/:id/flag", (req, res) => {
    const id = Number(req.params.id);
    const { flag } = req.body ?? {};
    db.prepare(`UPDATE players SET flag_code = ? WHERE id = ?`).run(String(flag ?? ""), id);
    res.json({ ok: true });
  });

  // ---- Matches ----
  // ---- CSV-import (motstykket til Export CSV pa validerings-siden) ----
  // Samme kolonneformat som selve eksporten lager: Table,Player1,
  // Player2,LocalResult,MeleeResult,Status,RoundLabel - MeleeResult og
  // Status ignoreres ved import (de er utledet/kommer fra Melee-synk,
  // aldri noe man skal skrive inn manuelt). Finner eksisterende
  // spillere pa navn (case-ufolsomt) i stedet for a lage duplikater,
  // og oppdaterer en eksisterende kamp pa samme bord+spillere hvis en
  // slik allerede finnes, i stedet for a alltid lage en ny.
  app.post("/api/tournament/:id/import-csv", (req, res) => {
    const tournamentId = Number(req.params.id);
    const { csv } = req.body ?? {};
    if (!csv || typeof csv !== "string") return res.status(400).json({ error: "csv (tekst) er pakrevd" });

    const tournament = db.prepare(`SELECT id FROM tournaments WHERE id = ?`).get(tournamentId);
    if (!tournament) return res.status(404).json({ error: "turnering ikke funnet" });

    function findOrCreatePlayer(name: string): number {
      const trimmed = name.trim();
      const existing = db
        .prepare(`SELECT id FROM players WHERE tournament_id = ? AND LOWER(name) = LOWER(?)`)
        .get(tournamentId, trimmed) as { id: number } | undefined;
      if (existing) return existing.id;
      const info = db.prepare(`INSERT INTO players (tournament_id, name) VALUES (?, ?)`).run(tournamentId, trimmed);
      playersCreated += 1;
      return Number(info.lastInsertRowid);
    }

    const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length < 2) return res.status(400).json({ error: "CSV-en har ingen datarader (kun header, eller tom)" });

    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const col = (name: string) => header.indexOf(name);
    const tableCol = col("table");
    const p1Col = col("player1");
    const p2Col = col("player2");
    const resultCol = col("localresult");
    const roundCol = col("roundlabel");

    if (p1Col === -1 || p2Col === -1) {
      return res.status(400).json({ error: 'CSV-header ma inneholde minst "Player1" og "Player2"' });
    }

    let playersCreated = 0;
    let matchesCreated = 0;
    let matchesUpdated = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i += 1) {
      const cells = lines[i].split(",");
      const p1Name = cells[p1Col]?.trim();
      const p2Name = cells[p2Col]?.trim();
      const tableNumber = tableCol !== -1 ? Number(cells[tableCol]) || null : null;
      const roundLabel = roundCol !== -1 ? (cells[roundCol] || "").trim() : "";
      const resultRaw = resultCol !== -1 ? (cells[resultCol] || "").trim() : "";

      if (!p1Name || !p2Name) {
        errors.push(`Rad ${i + 1}: mangler Player1 eller Player2`);
        continue;
      }

      let player1GameWins: number | null = null;
      let player2GameWins: number | null = null;
      if (resultRaw) {
        const parts = resultRaw.split("-").map((n) => Number(n.trim()));
        if (parts.length === 2 && parts.every((n) => Number.isFinite(n))) {
          [player1GameWins, player2GameWins] = parts;
        } else {
          errors.push(`Rad ${i + 1}: klarte ikke tolke resultatet "${resultRaw}" (forventet format "2-1")`);
        }
      }

      const player1Id = findOrCreatePlayer(p1Name);
      const player2Id = findOrCreatePlayer(p2Name);

      const existingMatch = db
        .prepare(
          `SELECT id FROM matches WHERE tournament_id = ? AND ((player1_id = ? AND player2_id = ?) OR (player1_id = ? AND player2_id = ?)) ORDER BY id DESC LIMIT 1`
        )
        .get(tournamentId, player1Id, player2Id, player2Id, player1Id) as { id: number } | undefined;

      if (existingMatch) {
        const updates: string[] = [];
        const params: unknown[] = [];
        if (tableNumber != null) {
          updates.push("table_number = ?");
          params.push(tableNumber);
        }
        if (roundLabel) {
          updates.push("round_label = ?");
          params.push(roundLabel);
        }
        if (player1GameWins != null && player2GameWins != null) {
          updates.push("player1_game_wins = ?, player2_game_wins = ?, status = 'finished'");
          params.push(player1GameWins, player2GameWins);
        }
        if (updates.length > 0) {
          params.push(existingMatch.id);
          db.prepare(`UPDATE matches SET ${updates.join(", ")} WHERE id = ?`).run(...(params as any[]));
          matchesUpdated += 1;
        }
      } else {
        const info = db
          .prepare(
            `INSERT INTO matches (tournament_id, player1_id, player2_id, table_number, round_label, player1_game_wins, player2_game_wins, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            tournamentId,
            player1Id,
            player2Id,
            tableNumber,
            roundLabel,
            player1GameWins ?? 0,
            player2GameWins ?? 0,
            player1GameWins != null ? "finished" : "in_progress"
          );
        if (info.lastInsertRowid) matchesCreated += 1;
      }
    }

    pushBroadcastUpdate();
    res.json({ ok: true, playersCreated, matchesCreated, matchesUpdated, errors });
  });

  app.get("/api/matches", (req, res) => {
    const tournamentId = Number(req.query.tournamentId ?? getActiveTournamentId());
    const rows = db.prepare(`SELECT * FROM matches WHERE tournament_id = ? ORDER BY id DESC`).all(tournamentId);
    res.json(rows);
  });

  app.post("/api/matches", (req, res) => {
    const { tournamentId, player1Id, player2Id, tableNumber, isBo5 } = req.body ?? {};
    if (!tournamentId || !player1Id || !player2Id) {
      return res.status(400).json({ error: "tournamentId, player1Id, player2Id er pakrevd" });
    }

    const info = db
      .prepare(
        `INSERT INTO matches (tournament_id, player1_id, player2_id, table_number, is_bo5)
         VALUES (?, ?, ?, ?, ?)`
      )
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

    const allowed: Record<string, string> = {
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
      player2CardShowcase: "player2_card_showcase",
      player1LifeOverride: "player1_life_override",
      player2LifeOverride: "player2_life_override"
    };

    const setClauses: string[] = [];
    const values: unknown[] = [];

    for (const [key, column] of Object.entries(allowed)) {
      if (key in fields) {
        setClauses.push(`${column} = ?`);
        values.push(fields[key]);
      }
    }

    // Enhver manuell liv-endring fra Kampkontroll-siden markeres
    // automatisk som "override" (LIFE OVERRIDE-merket) - operatoren
    // trenger ikke sette dette selv, det folger av a bruke -5/-1/+1/+5/
    // SET.. eller Reset 20-knappene.
    if ("player1Life" in fields && !("player1LifeOverride" in fields)) {
      setClauses.push("player1_life_override = 1");
    }
    if ("player2Life" in fields && !("player2LifeOverride" in fields)) {
      setClauses.push("player2_life_override = 1");
    }

    if (!setClauses.length) return res.status(400).json({ error: "ingen gyldige felt sendt" });

    setClauses.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE matches SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);

    pushBroadcastUpdate();
    res.json({ ok: true });
  });

  // ---- Judge Workspace: notater, advarsler og korrigeringer ----
  // GET er apen (samme monster som resten av API-et) - POST krever
  // innlogging siden meldingen skal logges med RIKTIG dommer (server-
  // sesjonen), ikke et brukernavn klienten selv kunne ha sendt inn.
  app.get("/api/judge/entries", (req, res) => {
    const tournamentId = Number(req.query.tournamentId ?? getActiveTournamentId());
    const matchId = req.query.matchId != null ? Number(req.query.matchId) : null;

    const rows = matchId
      ? db.prepare(`SELECT * FROM judge_entries WHERE tournament_id = ? AND match_id = ? ORDER BY id DESC`).all(tournamentId, matchId)
      : db.prepare(`SELECT * FROM judge_entries WHERE tournament_id = ? ORDER BY id DESC`).all(tournamentId);

    res.json(rows);
  });

  // Bekrefter en resultat-uoverensstemmelse som gjennomgatt og
  // beholder det LOKALE resultatet - i motsetning til "apply Melee's
  // result" over, som overskriver. Lagrer hvilke Melee-tall som ble
  // avvist (se kommentar i server/db.ts) sa en senere ENDRING i Melee
  // sitt tall automatisk vises som en NY konflikt i stedet for a
  // forbli stille skjult bak den gamle bekreftelsen.
  app.post("/api/matches/:id/acknowledge-conflict", requireAuth, (req, res) => {
    const session = (req as any).session as Session;
    const id = Number(req.params.id);
    const { reason } = req.body ?? {};

    const match = db.prepare(`SELECT * FROM matches WHERE id = ?`).get(id) as any;
    if (!match) return res.status(404).json({ error: "kamp ikke funnet" });
    if (match.melee_player1_game_wins == null || match.melee_player2_game_wins == null) {
      return res.status(400).json({ error: "Melee har ikke rapportert noe resultat for denne kampen enna" });
    }

    db.prepare(
      `UPDATE matches SET conflict_ack_melee_p1 = ?, conflict_ack_melee_p2 = ?, conflict_ack_at = datetime('now'), conflict_ack_by = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(match.melee_player1_game_wins, match.melee_player2_game_wins, session.username, id);

    db.prepare(
      `INSERT INTO judge_entries (tournament_id, match_id, type, message, judge_username) VALUES (?, ?, 'correction', ?, ?)`
    ).run(
      match.tournament_id,
      id,
      `Kept local result (${match.player1_game_wins}-${match.player2_game_wins}) despite Melee reporting ${match.melee_player1_game_wins}-${match.melee_player2_game_wins}.` +
        (reason ? ` Reason: ${String(reason)}` : ""),
      session.username
    );

    res.json({ ok: true });
  });

  app.post("/api/judge/entries", requireAuth, (req, res) => {
    const session = (req as any).session as Session;
    const { tournamentId, matchId, type, message } = req.body ?? {};
    const resolvedTournamentId = Number(tournamentId ?? getActiveTournamentId());
    if (!resolvedTournamentId) return res.status(400).json({ error: "ingen aktiv turnering" });

    const info = db
      .prepare(`INSERT INTO judge_entries (tournament_id, match_id, type, message, judge_username) VALUES (?, ?, ?, ?, ?)`)
      .run(resolvedTournamentId, matchId ?? null, String(type || "note"), String(message ?? ""), session.username);

    res.json({ id: info.lastInsertRowid });
  });

  // Sletter en kamp-rad (opprydding etter duplikater fra fore
  // melee_match_id-fiksen, eller en kamp opprettet ved en feil). Kobler
  // ogsa vekk raden fra broadcast_state hvis den star pa lufta na, slik
  // at en overlay ikke blir staende og peke pa en match-id som ikke
  // lenger finnes.
  app.delete("/api/matches/:id", (req, res) => {
    const id = Number(req.params.id);
    db.prepare(`UPDATE broadcast_state SET bo3_match_id = NULL WHERE id = 1 AND bo3_match_id = ?`).run(id);
    db.prepare(`UPDATE broadcast_state SET bo5_match_id = NULL WHERE id = 1 AND bo5_match_id = ?`).run(id);
    db.prepare(`DELETE FROM matches WHERE id = ?`).run(id);
    pushBroadcastUpdate();
    res.json({ ok: true });
  });

  // Bytter plass pa de to spillerne (navn/liv/score/kort-showcase
  // flyttes med) - selve bordet/kampen forblir den samme raden i
  // databasen, kun player1/player2-sidene sitt innhold speilvendes.
  app.post("/api/matches/:id/swap-sides", (req, res) => {
    const id = Number(req.params.id);
    const match = db.prepare(`SELECT * FROM matches WHERE id = ?`).get(id) as any;
    if (!match) return res.status(404).json({ error: "kamp ikke funnet" });

    db.prepare(
      `UPDATE matches SET
         player1_id = ?, player2_id = ?,
         player1_life = ?, player2_life = ?,
         player1_game_wins = ?, player2_game_wins = ?,
         player1_card_showcase = ?, player2_card_showcase = ?,
         player1_life_override = ?, player2_life_override = ?,
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      match.player2_id, match.player1_id,
      match.player2_life, match.player1_life,
      match.player2_game_wins, match.player1_game_wins,
      match.player2_card_showcase, match.player1_card_showcase,
      match.player2_life_override, match.player1_life_override,
      id
    );

    pushBroadcastUpdate();
    res.json({ ok: true });
  });

  // Henter alle kort i spillerens NAVAERENDE registrerte deck (nyeste
  // decks-rad) - brukes av kort-showcase-soket i Kampkontroll, slik at
  // man kun kan velge kort spilleren faktisk har i decket sitt, ikke
  // et hvilket som helst Magic-kort.
  app.get("/api/players/:id/deck-cards", (req, res) => {
    const playerId = Number(req.params.id);
    const deck = db.prepare(`SELECT id FROM decks WHERE player_id = ? ORDER BY id DESC LIMIT 1`).get(playerId) as any;
    if (!deck) return res.json([]);

    const rows = db
      .prepare(`SELECT card_name, image_url, is_sideboard FROM deck_cards WHERE deck_id = ? GROUP BY card_name ORDER BY card_name`)
      .all(deck.id);
    res.json(rows);
  });

  app.post("/api/matches/:id/win-game", (req, res) => {
    const id = Number(req.params.id);
    const { player } = req.body ?? {};
    if (player !== 1 && player !== 2) {
      return res.status(400).json({ error: "player ma vaere 1 eller 2" });
    }

    const match = db.prepare(`SELECT * FROM matches WHERE id = ?`).get(id) as any;
    if (!match) return res.status(404).json({ error: "kamp ikke funnet" });

    const winThreshold = match.is_bo5 ? 3 : 2;
    const column = player === 1 ? "player1_game_wins" : "player2_game_wins";
    const newGameWins = (player === 1 ? match.player1_game_wins : match.player2_game_wins) + 1;

    db.prepare(`UPDATE matches SET ${column} = ? WHERE id = ?`).run(newGameWins, id);

    const matchWon = newGameWins >= winThreshold;
    let eventType = "gameWin";

    if (matchWon) {
      eventType = "matchWin";
      const winnerPlayerId = player === 1 ? match.player1_id : match.player2_id;
      const loserPlayerId = player === 1 ? match.player2_id : match.player1_id;

      db.prepare(`UPDATE matches SET status = 'finished', winner_player_id = ? WHERE id = ?`).run(winnerPlayerId, id);

      // Standings-rad opprettes ved forste seier/tap hvis den ikke
      // allerede finnes (UNIQUE(tournament_id, player_id) i schemaet).
      db.prepare(
        `INSERT INTO standings (tournament_id, player_id, wins) VALUES (?, ?, 1)
         ON CONFLICT(tournament_id, player_id) DO UPDATE SET wins = wins + 1`
      ).run(match.tournament_id, winnerPlayerId);

      db.prepare(
        `INSERT INTO standings (tournament_id, player_id, losses) VALUES (?, ?, 1)
         ON CONFLICT(tournament_id, player_id) DO UPDATE SET losses = losses + 1`
      ).run(match.tournament_id, loserPlayerId);
    }

    // event_id teller opp for hver hendelse - overlayets vinner-
    // animasjon (script.js/bo5-overlay.js) spiller KUN av nar denne
    // faktisk endrer seg siden forrige melding.
    db.prepare(
      `UPDATE matches SET event_id = event_id + 1, event_type = ?, event_player = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(eventType, player, id);

    pushBroadcastUpdate();
    res.json({ ok: true, matchWon });
  });

  // ---- Broadcast control ----
  app.post("/api/broadcast/scene", async (req, res) => {
    const { scene } = req.body ?? {};
    if (!scene) return res.status(400).json({ error: "scene er pakrevd" });

    db.prepare(`UPDATE broadcast_state SET active_scene = ?, updated_at = datetime('now') WHERE id = 1`).run(String(scene));
    pushBroadcastUpdate();
    // Bytter ogsa selve LIVE-scenen i OBS hvis tilkoblet - feiler stille
    // (se setObsScene i obs.ts) hvis OBS ikke er tilkoblet.
    await setObsScene(String(scene));
    res.json({ ok: true });
  });

  app.post("/api/broadcast/set-match", (req, res) => {
    const { board, matchId } = req.body ?? {};
    const column = board === "bo5" ? "bo5_match_id" : "bo3_match_id";

    db.prepare(`UPDATE broadcast_state SET ${column} = ?, updated_at = datetime('now') WHERE id = 1`).run(matchId ?? null);
    pushBroadcastUpdate();
    res.json({ ok: true });
  });

  app.post("/api/broadcast/timer", (req, res) => {
    const { board, action, seconds } = req.body ?? {};
    const prefix = board === "bo5" ? "bo5" : "bo3";
    const statusColumn = `${prefix}_timer_status`;
    const secondsColumn = `${prefix}_timer_seconds`;

    if (action === "reset") {
      db.prepare(
        `UPDATE broadcast_state SET ${statusColumn} = 'reset', ${secondsColumn} = ?, updated_at = datetime('now') WHERE id = 1`
      ).run(Number(seconds ?? 3000));
    } else if (action === "start" || action === "pause") {
      const updates: string[] = [`${statusColumn} = ?`];
      const values: unknown[] = [action];
      if (seconds != null) {
        updates.push(`${secondsColumn} = ?`);
        values.push(Number(seconds));
      }
      db.prepare(`UPDATE broadcast_state SET ${updates.join(", ")}, updated_at = datetime('now') WHERE id = 1`).run(...values);
    } else {
      return res.status(400).json({ error: "action ma vaere start, pause eller reset" });
    }

    pushBroadcastUpdate();
    res.json({ ok: true });
  });

  app.get("/api/broadcast/state", (_req, res) => {
    res.json(buildBroadcastPayload());
  });

  // ---- System-status (Observer-dashbordet) ----
  // Enkel timeout-hjelper for utgaende helsesjekker (Scryfall,
  // internett) - AbortController stopper forespoerselen etter
  // timeoutMs i stedet for a henge til nettleseren/Node sin egen,
  // mye lengre standard-timeout.
  async function checkReachable(url: string, timeoutMs = 3000, method: "HEAD" | "GET" = "HEAD"): Promise<{ ok: boolean; ms: number }> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method, signal: controller.signal });
      return { ok: res.ok, ms: Date.now() - started };
    } catch {
      return { ok: false, ms: Date.now() - started };
    } finally {
      clearTimeout(timer);
    }
  }

  // Caches helsesjekkene et par sekunder - dashbordet vil trolig polle
  // dette ofte (samme prinsipp som resten av appen), og vi vil ikke
  // sende en ekte nettverksforesporsel til Scryfall/internett for
  // HVER eneste poll fra HVER eneste tilkoblet klient.
  let lastSystemCheck: { at: number; scryfall: { ok: boolean; ms: number }; internet: { ok: boolean; ms: number } } | null = null;
  const SYSTEM_CHECK_CACHE_MS = 5000;

  async function getCachedHealthChecks() {
    if (lastSystemCheck && Date.now() - lastSystemCheck.at < SYSTEM_CHECK_CACHE_MS) {
      return lastSystemCheck;
    }
    const [scryfall, internet] = await Promise.all([
      // GET, ikke HEAD - /cards/random er et dynamisk endepunkt (gir
      // et NYTT tilfeldig kort hver gang) og svarer upalitelig pa
      // HEAD-foresporsler selv nar Scryfall er helt oppe. Dette var
      // arsaken til at status kunne vise "UNAVAILABLE" feilaktig.
      checkReachable("https://api.scryfall.com/cards/random", 3000, "GET"),
      checkReachable("https://1.1.1.1")
    ]);
    lastSystemCheck = { at: Date.now(), scryfall, internet };
    return lastSystemCheck;
  }

  app.get("/api/system/status", async (_req, res) => {
    const obsStatus = getObsStatus();
    const streamStatus = await getObsStreamStatus();
    const recordStatus = await getObsRecordStatus();
    const health = await getCachedHealthChecks();

    const meleeEnabled = getSetting("melee_sync_enabled") !== "off";
    const lastMeleeLog = db.prepare(`SELECT * FROM melee_sync_log ORDER BY id DESC LIMIT 1`).get() as any;

    // Ekte database-sjekk (ikke bare antatt) - en enkel SELECT 1 mot
    // den samme SQLite-tilkoblingen resten av API-et bruker. Feiler
    // denne, feiler den fanges her i stedet for a velte hele endepunktet.
    let databaseOnline = true;
    try {
      db.prepare("SELECT 1").get();
    } catch {
      databaseOnline = false;
    }

    res.json({
      server: {
        online: true,
        uptimeSeconds: Math.floor((Date.now() - serverStartedAt) / 1000),
        environment: electronApp.isPackaged ? "production" : "test",
        version: electronApp.getVersion()
      },
      database: { online: databaseOnline },
      obs: {
        connected: obsStatus.connected,
        lastError: obsStatus.lastError,
        stream: streamStatus,
        recording: recordStatus.active
      },
      melee: {
        enabled: meleeEnabled,
        lastSyncOk: lastMeleeLog ? !!lastMeleeLog.ok : null,
        lastSyncAt: lastMeleeLog?.ran_at ?? null,
        lastSyncMessage: lastMeleeLog?.message ?? ""
      },
      scryfall: { available: health.scryfall.ok, latencyMs: health.scryfall.ms },
      internet: { online: health.internet.ok, latencyMs: health.internet.ms },
      clients: adminWss.clients.size,
      camera: getSetting("active_camera") || "main",
      showNameTags: getSetting("show_name_tags") !== "off",
      cardShowcaseVisible: getSetting("card_showcase_visible") !== "off",
      intermissionEndsAt
    });
  });

  // Beregnede varsler - ingen egen "alerts"-tabell, satt sammen live fra
  // samme statuser som /api/system/status over, sa de to alltid er
  // konsistente med hverandre.
  // ---- Advanced (ekte prosess-/database-diagnostikk) ----
  app.get("/api/system/advanced", (_req, res) => {
    const dbPath = getDbFilePath();
    let dbSizeBytes = 0;
    try {
      dbSizeBytes = fs.statSync(dbPath).size;
    } catch {
      dbSizeBytes = 0;
    }

    res.json({
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron || "",
      chromeVersion: process.versions.chrome || "",
      dbPath,
      dbSizeBytes,
      wsUrl: "ws://localhost:4848/ws",
      wsAdminUrl: "ws://localhost:4848/ws-admin"
    });
  });

  // ---- Backup ----
  app.get("/api/backup/status", (_req, res) => {
    res.json(getBackupStatus());
  });

  // Ekte nedlasting av en spesifikk backup-fil - matcher KUN mot
  // filnavn som faktisk finnes i backups-mappen (via listBackups()),
  // ikke en vilkarlig sti fra klienten, for a unnga at noen kan be om
  // en helt annen fil pa disken via denne ruten.
  app.get("/api/backup/download/:filename", (req, res) => {
    const status = getBackupStatus();
    const match = status.backups.find((b) => b.filename === req.params.filename);
    if (!match) return res.status(404).json({ error: "Fant ingen backup med det filnavnet." });
    res.download(match.path, match.filename);
  });

  app.post("/api/backup/run", async (_req, res) => {
    try {
      const result = await runBackup();
      appLog("info", `Backup opprettet: ${result.filename}`);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      appLog("error", `Backup feilet: ${err?.message || err}`);
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  // Skriver en valgt backup tilbake over den ekte databasen, deretter
  // restarter appen (samme monster som save-connection-config i
  // electron/main.ts) - den kjorende SQLite-tilkoblingen er stengt av
  // restoreBackup() over, sa appen MA restarte for a apne den
  // gjenopprettede filen pa nytt.
  app.post("/api/backup/restore", requireAuth, requireAdmin, (req, res) => {
    const { path: backupPath } = req.body ?? {};
    if (!backupPath) return res.status(400).json({ error: "path er pakrevd" });
    try {
      appLog("warn", `Database gjenopprettet fra backup: ${backupPath} - appen restarter.`);
      restoreBackup(String(backupPath));
      res.json({ ok: true });
      setTimeout(() => {
        electronApp.relaunch();
        electronApp.exit(0);
      }, 300);
    } catch (err: any) {
      appLog("error", `Restore feilet: ${err?.message || err}`);
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  // ---- Diagnostikk-logg (se appLog i server/db.ts) ----
  app.get("/api/logs/settings", (_req, res) => {
    res.json(getLogSettings());
  });

  app.post("/api/logs/settings", (req, res) => {
    const { level, retentionDays } = req.body ?? {};
    setLogSettings(String(level || "info"), Number(retentionDays) || 14);
    res.json({ ok: true });
  });

  app.get("/api/logs", (req, res) => {
    const minLevel = String(req.query.level || "debug");
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    res.json(getLogs(minLevel, limit));
  });

  app.get("/api/logs/export", (req, res) => {
    const minLevel = String(req.query.level || "debug");
    const rows = getLogs(minLevel, 5000);
    const text = rows
      .slice()
      .reverse()
      .map((r) => `${r.created_at} [${r.level.toUpperCase()}] ${r.message}`)
      .join("\n");
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", `attachment; filename="observer-log-${Date.now()}.txt"`);
    res.send(text);
  });

  app.get("/api/system/alerts", async (_req, res) => {
    const obsStatus = getObsStatus();
    const health = await getCachedHealthChecks();
    const meleeEnabled = getSetting("melee_sync_enabled") !== "off";
    const lastMeleeLog = db.prepare(`SELECT * FROM melee_sync_log ORDER BY id DESC LIMIT 1`).get() as any;

    const alerts: { level: "error" | "warn" | "info"; title: string; message: string }[] = [];

    if (meleeEnabled && lastMeleeLog && !lastMeleeLog.ok) {
      alerts.push({
        level: "warn",
        title: "Melee connection unstable",
        message: lastMeleeLog.message || "Player data cannot currently be updated. Existing broadcast data is still available."
      });
    }

    if (!obsStatus.connected) {
      alerts.push({
        level: "warn",
        title: "OBS not connected",
        message: "Scene switching and stream status will not work until OBS is reconnected under Settings > Broadcast."
      });
    }

    if (!health.scryfall.ok) {
      alerts.push({
        level: "warn",
        title: "Scryfall API unreachable",
        message: "Card images and key-card lookups may be unavailable until this recovers."
      });
    }

    if (!health.internet.ok) {
      alerts.push({
        level: "error",
        title: "No internet connection",
        message: "Melee sync and card image lookups require internet access."
      });
    }

    res.json(alerts);
  });

  // ---- Resterende Quick Actions (kamera, navnelapper, avslutt kamp) ----
  // ---- OBS Studio Mode (Program/Preview - ekte to-buss-styring) ----
  const BROADCAST_SCENE_KEYS = ALL_SCENE_KEYS;

  function sceneNameToKey(obsSceneName: string): string {
    for (const key of BROADCAST_SCENE_KEYS) {
      if (resolveObsSceneName(key) === obsSceneName) return key;
    }
    return "";
  }

  app.get("/api/obs/studio-state", async (_req, res) => {
    const state = await getObsStudioState();
    res.json({
      enabled: state.enabled,
      program: sceneNameToKey(state.program) || state.program,
      preview: sceneNameToKey(state.preview) || state.preview
    });
  });

  // which=program|preview - henter selve scenenavnet fra na-tilstanden
  // i OBS (ikke fra en scene-key sendt av klienten), sa bildet alltid
  // matcher det som faktisk star i Program/Preview akkurat na.
  app.get("/api/obs/screenshot", async (req, res) => {
    const which = req.query.which === "preview" ? "preview" : "program";
    const state = await getObsStudioState();
    const sceneName = which === "preview" ? state.preview : state.program;
    if (!sceneName) return res.json({ image: null });

    const image = await getObsSceneScreenshot(sceneName);
    res.json({ image });
  });

  app.post("/api/obs/studio-mode/enable", async (_req, res) => {
    const ok = await ensureStudioMode();
    res.json({ ok });
  });

  app.post("/api/obs/preview-scene", async (req, res) => {
    const { scene } = req.body ?? {};
    if (!scene) return res.status(400).json({ error: "scene er pakrevd" });
    const result = await setObsPreviewScene(resolveObsSceneName(String(scene)));
    res.json(result);
  });

  // TAKE/CUT/STINGER oppdaterer ogsa var egen broadcast_state.active_scene
  // til a matche det som na faktisk star pa PROGRAM i OBS, siden resten
  // av appen (Dashboard "SCENE", Match Control sitt aktive bord) leser
  // scenen derfra, ikke direkte fra OBS.
  function setActiveSceneInDb(sceneKey: string) {
    db.prepare(`UPDATE broadcast_state SET active_scene = ?, updated_at = datetime('now') WHERE id = 1`).run(sceneKey);
    pushBroadcastUpdate();
  }

  app.post("/api/obs/take", async (req, res) => {
    const { scene } = req.body ?? {};
    const result = await takeObsTransition();
    if (result.ok && scene) setActiveSceneInDb(String(scene));
    res.json(result);
  });

  app.post("/api/obs/cut", async (req, res) => {
    const { scene } = req.body ?? {};
    if (!scene) return res.status(400).json({ error: "scene er pakrevd" });
    const result = await cutObsScene(resolveObsSceneName(String(scene)));
    if (result.ok) setActiveSceneInDb(String(scene));
    res.json(result);
  });

  app.post("/api/obs/stinger", async (req, res) => {
    const { scene } = req.body ?? {};
    if (!scene) return res.status(400).json({ error: "scene er pakrevd" });
    const result = await stingerObsTransition(resolveObsSceneName(String(scene)));
    if (result.ok) setActiveSceneInDb(String(scene));
    res.json(result);
  });

  app.post("/api/obs/start-stream", async (_req, res) => {
    const result = await startObsStream();
    res.json(result);
  });

  // ---- Fase-timere (Stream Starting / Intermission / Stream Ending) ----
  // Samme prinsipp som Arm Intermission-nedtellingen fra Dashboard, men
  // generalisert til tre navngitte faser - hver med egen nedtelling og
  // egen handling nar den nar null.
  type PhaseKey = "starting" | "intermission" | "ending";
  type PhaseState = {
    endsAt: number | null;
    status: "idle" | "running" | "paused";
    remainingMs: number;
    thenScene: string;
  };
  const phaseState: Record<PhaseKey, PhaseState> = {
    starting: { endsAt: null, status: "idle", remainingMs: 0, thenScene: "casterdesk" },
    intermission: { endsAt: null, status: "idle", remainingMs: 0, thenScene: "casterdesk" },
    ending: { endsAt: null, status: "idle", remainingMs: 0, thenScene: "" }
  };
  const phaseTimers: Record<PhaseKey, NodeJS.Timeout | null> = { starting: null, intermission: null, ending: null };

  async function runPhaseAction(key: PhaseKey) {
    phaseState[key].status = "idle";
    phaseState[key].endsAt = null;
    if (key === "ending") {
      await stopObsStream();
      return;
    }
    const targetKey = phaseState[key].thenScene;
    if (targetKey) {
      await cutObsScene(resolveObsSceneName(targetKey));
      setActiveSceneInDb(targetKey);
    }
    if (key === "starting") {
      await startObsStream();
    }
  }

  function clearPhaseTimer(key: PhaseKey) {
    if (phaseTimers[key]) {
      clearTimeout(phaseTimers[key]!);
      phaseTimers[key] = null;
    }
  }

  function schedulePhaseTimer(key: PhaseKey, ms: number) {
    clearPhaseTimer(key);
    phaseTimers[key] = setTimeout(() => {
      runPhaseAction(key);
    }, ms);
  }

  app.get("/api/broadcast/phases", (_req, res) => {
    const now = Date.now();
    const withRemaining: Record<string, any> = {};
    (Object.keys(phaseState) as PhaseKey[]).forEach((key) => {
      const p = phaseState[key];
      const remainingMs = p.status === "running" && p.endsAt ? Math.max(0, p.endsAt - now) : p.remainingMs;
      withRemaining[key] = { status: p.status, remainingMs, thenScene: p.thenScene };
    });
    res.json(withRemaining);
  });

  app.post("/api/broadcast/phases/:key/arm", (req, res) => {
    const key = req.params.key as PhaseKey;
    if (!phaseState[key]) return res.status(400).json({ error: "ukjent fase" });
    const { minutes, thenScene } = req.body ?? {};
    const mins = Number(minutes);
    if (!mins || mins <= 0) return res.status(400).json({ error: "minutes ma vaere et positivt tall" });

    if (thenScene !== undefined) phaseState[key].thenScene = String(thenScene);
    const ms = Math.round(mins * 60 * 1000);
    phaseState[key].status = "running";
    phaseState[key].endsAt = Date.now() + ms;
    phaseState[key].remainingMs = ms;
    schedulePhaseTimer(key, ms);
    res.json({ ok: true });
  });

  app.post("/api/broadcast/phases/:key/pause", (req, res) => {
    const key = req.params.key as PhaseKey;
    if (!phaseState[key]) return res.status(400).json({ error: "ukjent fase" });
    if (phaseState[key].status === "running" && phaseState[key].endsAt) {
      phaseState[key].remainingMs = Math.max(0, phaseState[key].endsAt! - Date.now());
    }
    phaseState[key].status = "paused";
    phaseState[key].endsAt = null;
    clearPhaseTimer(key);
    res.json({ ok: true });
  });

  app.post("/api/broadcast/phases/:key/resume", (req, res) => {
    const key = req.params.key as PhaseKey;
    if (!phaseState[key]) return res.status(400).json({ error: "ukjent fase" });
    const ms = phaseState[key].remainingMs;
    if (!ms) return res.status(400).json({ error: "ingen nedtelling a fortsette" });
    phaseState[key].status = "running";
    phaseState[key].endsAt = Date.now() + ms;
    schedulePhaseTimer(key, ms);
    res.json({ ok: true });
  });

  app.post("/api/broadcast/phases/:key/force", async (req, res) => {
    const key = req.params.key as PhaseKey;
    if (!phaseState[key]) return res.status(400).json({ error: "ukjent fase" });
    clearPhaseTimer(key);
    await runPhaseAction(key);
    res.json({ ok: true });
  });

  app.post("/api/broadcast/phases/:key/cancel", (req, res) => {
    const key = req.params.key as PhaseKey;
    if (!phaseState[key]) return res.status(400).json({ error: "ukjent fase" });
    clearPhaseTimer(key);
    phaseState[key].status = "idle";
    phaseState[key].endsAt = null;
    phaseState[key].remainingMs = 0;
    res.json({ ok: true });
  });


  // OBS-scenebytte finnes fra for) - dette lagrer et ekte valg
  // ("main"/"handheld") som Observer-dashbordet og overlayene kan lese,
  // men bytter IKKE noe fysisk kamera-utstyr eller OBS-kilde selv. Gi
  // beskjed hvis "Main Camera"-knappen faktisk skal bytte en bestemt
  // OBS-kilde/scene-item - da kan dette utvides til a kalle OBS.
  app.post("/api/broadcast/camera", (req, res) => {
    const { camera } = req.body ?? {};
    if (!camera) return res.status(400).json({ error: "camera er pakrevd" });
    setSetting("active_camera", String(camera));
    pushBroadcastUpdate();
    res.json({ ok: true });
  });

  app.post("/api/broadcast/name-tags", (req, res) => {
    const { show } = req.body ?? {};
    setSetting("show_name_tags", show ? "on" : "off");
    pushBroadcastUpdate();
    res.json({ ok: true });
  });

  // Egen synlighets-bryter for kort-showcase, uavhengig av HVILKET kort
  // som er valgt (player1CardShowcase/player2CardShowcase i matches-
  // tabellen) - slik at "Hide" i Graphics Control skjuler kortet uten
  // a slette selve kortvalget, og "Show" kan vise det samme kortet
  // igjen etterpa i stedet for at valget er tapt for godt.
  app.post("/api/broadcast/card-showcase-visibility", (req, res) => {
    const { show } = req.body ?? {};
    setSetting("card_showcase_visible", show ? "on" : "off");
    pushBroadcastUpdate();
    res.json({ ok: true });
  });

  // Avslutter aktiv kamp pa gitt bord (bo3/bo5) uten a matte vinne et
  // siste spill forst - for tilfeller som scoop/DQ/teknisk avgjorelse.
  // Setter status til 'finished' pa selve kampen, men lar den fortsatt
  // sta koblet til broadcast_state (overlayet kan da fortsatt vise
  // sluttresultatet inntil neste kamp settes).
  app.post("/api/broadcast/end-match", (req, res) => {
    const { board } = req.body ?? {};
    const column = board === "bo5" ? "bo5_match_id" : "bo3_match_id";

    const state = db.prepare(`SELECT ${column} as matchId FROM broadcast_state WHERE id = 1`).get() as any;
    if (!state?.matchId) return res.status(400).json({ error: "ingen aktiv kamp pa dette bordet" });

    db.prepare(`UPDATE matches SET status = 'finished' WHERE id = ?`).run(state.matchId);
    pushBroadcastUpdate();
    res.json({ ok: true });
  });

  // Stopper streamen umiddelbart - dette er na "End Match"-knappens
  // faktiske jobb i Observer-dashbordet (et hardt kutt), IKKE lenger
  // knyttet til a markere en kamp som ferdig. Den gamle "marker kamp
  // ferdig"-oppforselen finnes fortsatt over (/api/broadcast/end-match)
  // for evt. bruk andre steder (f.eks. Kampkontroll-fanen).
  app.post("/api/broadcast/stop-stream", async (_req, res) => {
    if (intermissionTimer) {
      clearTimeout(intermissionTimer);
      intermissionTimer = null;
      intermissionEndsAt = null;
    }
    const result = await stopObsStream();
    res.json(result);
  });

  // Starter en nedtelling (lengde satt av brukeren hver gang, i
  // minutter) som stopper streamen automatisk nar den nar null - for
  // planlagte pauser. Bytter ogsa til intermission-scenen med en gang
  // (kan justeres senere om det ikke er onsket oppforsel).
  app.post("/api/broadcast/arm-intermission", async (req, res) => {
    const { minutes, switchScene } = req.body ?? {};
    const mins = Number(minutes);
    if (!mins || mins <= 0) return res.status(400).json({ error: "minutes ma vaere et positivt tall" });

    if (intermissionTimer) clearTimeout(intermissionTimer);

    const ms = Math.round(mins * 60 * 1000);
    intermissionEndsAt = Date.now() + ms;

    if (switchScene !== false) {
      db.prepare(`UPDATE broadcast_state SET active_scene = 'intermission', updated_at = datetime('now') WHERE id = 1`).run();
      pushBroadcastUpdate();
      await setObsScene("intermission");
    }

    intermissionTimer = setTimeout(async () => {
      intermissionTimer = null;
      intermissionEndsAt = null;
      await stopObsStream();
    }, ms);

    res.json({ ok: true, endsAt: intermissionEndsAt });
  });

  app.post("/api/broadcast/cancel-intermission", (_req, res) => {
    if (intermissionTimer) {
      clearTimeout(intermissionTimer);
      intermissionTimer = null;
    }
    intermissionEndsAt = null;
    res.json({ ok: true });
  });

  // ---- Meta-keycards (nokkelkort per arketype, satt manuelt) ----
  app.get("/api/meta-keycards", (_req, res) => {
    const tournamentId = getActiveTournamentId();
    if (!tournamentId) return res.json([]);
    const rows = db
      .prepare(`SELECT * FROM meta_keycards WHERE tournament_id = ?`)
      .all(tournamentId);
    res.json(rows);
  });

  app.post("/api/meta-keycards", (req, res) => {
    const tournamentId = getActiveTournamentId();
    if (!tournamentId) return res.status(400).json({ error: "ingen aktiv turnering" });

    const { archetype, keyCard1, keyCard2 } = req.body ?? {};
    const archetypeLabel = String(archetype ?? "").trim();
    if (!archetypeLabel) return res.status(400).json({ error: "archetype er pakrevd" });

    const archetypeKey = archetypeLabel.toLowerCase().replace(/[^a-z0-9]/g, "");

    db.prepare(
      `INSERT INTO meta_keycards (tournament_id, archetype_key, archetype_label, key_card_1, key_card_2)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(tournament_id, archetype_key) DO UPDATE SET
         archetype_label = excluded.archetype_label,
         key_card_1 = excluded.key_card_1,
         key_card_2 = excluded.key_card_2`
    ).run(tournamentId, archetypeKey, archetypeLabel, String(keyCard1 ?? ""), String(keyCard2 ?? ""));

    res.json({ ok: true });
  });

  // ---- Meta breakdown (arketype-fordeling) ----
  // MIDLERTIDIG: beregner fordelingen ut fra lokale decks-rader (siste
  // deck per spiller i aktiv turnering) i stedet for a hente fra Melee
  // sitt decklist-endepunkt (se getMeleeMetaBreakdown i melee.ts) -
  // den ekte Melee-baserte versjonen kobles inn nar melee.ts er
  // gjennomgatt.
  app.get("/api/scenes/meta", (_req, res) => {
    const tournamentId = getActiveTournamentId();
    if (!tournamentId) return res.json({ rows: [] });

    const decks = db
      .prepare(
        `SELECT d.archetype, COUNT(*) as count
         FROM decks d
         JOIN players p ON p.id = d.player_id
         WHERE p.tournament_id = ?
           AND d.id = (SELECT MAX(id) FROM decks WHERE player_id = d.player_id)
           AND d.archetype != ''
         GROUP BY d.archetype
         ORDER BY count DESC`
      )
      .all(tournamentId) as any[];

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
    const rows = db.prepare(`SELECT * FROM access_tokens ORDER BY id DESC`).all();
    res.json(rows);
  });

  app.post("/api/access-tokens", (req, res) => {
    const { label } = req.body ?? {};
    const token = crypto.randomBytes(16).toString("hex");

    db.prepare(`INSERT INTO access_tokens (token, label, status) VALUES (?, ?, 'allowed')`).run(
      token,
      String(label ?? "")
    );

    res.json({ token });
  });

  app.patch("/api/access-tokens/:id", (req, res) => {
    const id = Number(req.params.id);
    const { status } = req.body ?? {};
    db.prepare(`UPDATE access_tokens SET status = ? WHERE id = ?`).run(String(status ?? "allowed"), id);
    res.json({ ok: true });
  });

  app.delete("/api/access-tokens/:id", (req, res) => {
    const id = Number(req.params.id);
    db.prepare(`DELETE FROM access_tokens WHERE id = ?`).run(id);
    res.json({ ok: true });
  });

  // ---- Bulk sett runde pa pagaende kamper ----
  app.post("/api/tournament/:id/set-round", (req, res) => {
    const tournamentId = Number(req.params.id);
    const { round } = req.body ?? {};
    if (!round) return res.status(400).json({ error: "round er pakrevd" });

    const info = db
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
    if (!round) return res.status(400).json({ error: "round er pakrevd" });

    const players = db
      .prepare(`SELECT id, name FROM players WHERE tournament_id = ?`)
      .all(tournamentId) as { id: number; name: string }[];

    if (players.length < 2) {
      return res.status(400).json({ error: "trenger minst 2 spillere for a generere pairings" });
    }

    const standings = db
      .prepare(`SELECT player_id, wins FROM standings WHERE tournament_id = ?`)
      .all(tournamentId) as { player_id: number; wins: number }[];
    const winsByPlayer = new Map(standings.map((s) => [s.player_id, s.wins]));

    const priorMatches = db
      .prepare(`SELECT player1_id, player2_id FROM matches WHERE tournament_id = ?`)
      .all(tournamentId) as { player1_id: number; player2_id: number }[];
    const alreadyPlayed = new Set(
      priorMatches.map((m) => [m.player1_id, m.player2_id].sort().join("-"))
    );

    const sortedPlayers = [...players].sort(
      (a, b) => (winsByPlayer.get(b.id) ?? 0) - (winsByPlayer.get(a.id) ?? 0)
    );

    const unpaired = [...sortedPlayers];
    const pairs: { player1: string; player2: string }[] = [];
    const newMatches: { player1Id: number; player2Id: number }[] = [];
    let byeName: string | null = null;

    while (unpaired.length > 0) {
      const current = unpaired.shift()!;

      if (unpaired.length === 0) {
        byeName = current.name;
        db.prepare(
          `INSERT INTO standings (tournament_id, player_id, wins) VALUES (?, ?, 1)
           ON CONFLICT(tournament_id, player_id) DO UPDATE SET wins = wins + 1`
        ).run(tournamentId, current.id);
        break;
      }

      let opponentIndex = unpaired.findIndex(
        (candidate) => !alreadyPlayed.has([current.id, candidate.id].sort().join("-"))
      );
      if (opponentIndex === -1) opponentIndex = 0;

      const [opponent] = unpaired.splice(opponentIndex, 1);
      alreadyPlayed.add([current.id, opponent.id].sort().join("-"));

      pairs.push({ player1: current.name, player2: opponent.name });
      newMatches.push({ player1Id: current.id, player2Id: opponent.id });
    }

    const insertMatch = db.prepare(
      `INSERT INTO matches (tournament_id, player1_id, player2_id, table_number, is_bo5, round_label)
       VALUES (?, ?, ?, ?, 0, ?)`
    );

    newMatches.forEach((m, index) => {
      insertMatch.run(tournamentId, m.player1Id, m.player2Id, index + 1, String(round));
    });

    res.json({ pairs, bye: byeName });
  });

  server.listen(PORT, () => {
    console.log(`[server] Lokal API + WebSocket kjorer pa http://localhost:${PORT}`);
    appLog("info", `Server startet pa port ${PORT}.`);
  });

  // Starter automatisk Melee-sync (hvert 30. sekund, se server/melee.ts)
  // - pusher oppdatert state til OBS/mobil hver gang en sync faktisk
  // endret noe.
  startMeleeAutoSync(pushBroadcastUpdate);

  return { app, server, wss, port: PORT };
}
