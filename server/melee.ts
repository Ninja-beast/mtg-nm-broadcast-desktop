import { db, getSetting, setSetting, getActiveTournamentId } from "./db";

/**
 * MELEE-ADAPTER (Fase 3)
 * ======================
 * Direkte portering av logikken fra MeleeSync.gs/MeleeApi.gs til
 * TypeScript - samme autentisering (Basic Auth med client_id:client_
 * secret), samme paginering ("Content"/"RecordsTotal"), samme
 * arketype-uttrekk (hopper over Melee sin generiske "Decklist"-
 * placeholder). Forskjellen: skriver til SQLite-tabeller i stedet for
 * regneark-celler, og deler INGEN daglig UrlFetchApp-kvote lenger -
 * dette kjorer lokalt pa din egen maskin.
 */

const MELEE_BASE_URL = "https://melee.gg";
const MELEE_PAGE_SIZE = 100;

const GENERIC_DECKLIST_NAMES = ["decklist", "deck list", "untitled", "unnamed"];

function isGenericDecklistName(name: string): boolean {
  return GENERIC_DECKLIST_NAMES.includes(String(name || "").trim().toLowerCase());
}

/**
 * Godtar bade en rein turnerings-ID ("451486") OG en hel Melee-URL
 * ("https://melee.gg/Tournament/View/451486") - plukker ut de
 * avsluttende sifrene uansett hva som ble limt inn. Tilsvarer
 * extractMeleeTournamentId_ fra det gamle MeleeSync.gs.
 */
export function extractTournamentId(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  const match = text.match(/(\d+)\s*$/);
  return match ? match[1] : "";
}

function buildAuthHeader(): string {
  const clientId = getSetting("melee_client_id");
  const clientSecret = getSetting("melee_client_secret");

  if (!clientId || !clientSecret) {
    throw new Error("Melee client ID/secret mangler - sett dem under Innstillinger.");
  }

  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

async function meleeGet(path: string, params: Record<string, string | number> = {}): Promise<any> {
  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
  ).toString();

  const url = MELEE_BASE_URL + path + (query ? "?" + query : "");

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: buildAuthHeader() }
  });

  const bodyText = await res.text();

  if (!res.ok) {
    throw new Error(`Melee API-kall feilet (${path}), status ${res.status}: ${bodyText.substring(0, 300)}`);
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    throw new Error(`Klarte ikke tolke Melee-svar som JSON (${path}): ${bodyText.substring(0, 300)}`);
  }
}

async function meleeGetPaged(path: string): Promise<any[]> {
  const allItems: any[] = [];
  let page = 1;
  let recordsTotal = Infinity;

  while (allItems.length < recordsTotal) {
    const pageData = await meleeGet(path, { "variables.page": page, "variables.pageSize": MELEE_PAGE_SIZE });

    // DEBUG: viser et lite utdrag av hva Melee svarte, uten a bygge
    // hele JSON-strengen forst (som var tregt for store svar).
    console.log(`[melee] ${path} (side ${page}) svarte: RecordsTotal=${pageData?.RecordsTotal}, Content-lengde=${Array.isArray(pageData?.Content) ? pageData.Content.length : "?"}`);

    const items: any[] = Array.isArray(pageData?.Content) ? pageData.Content : [];
    if (!items.length) break;

    allItems.push(...items);
    recordsTotal = Number(pageData?.RecordsTotal);
    if (!Number.isFinite(recordsTotal)) recordsTotal = allItems.length;

    page += 1;
    if (page > 50) break; // sikkerhetsstopp, samme som i MeleeSync.gs
  }

  return allItems;
}

function buildFullName(player: any): string {
  const fullName = [player?.FirstName, player?.LastName].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;
  return player?.Name || player?.DisplayName || player?.Username || "PLAYER";
}

/**
 * Samme prioritet som extractMeleeArchetype_ i MeleeApi.gs: bruk
 * spillerens eget decklist-navn FORST, men hopp over det hvis det er
 * Melee sin generiske placeholder-tekst ("Decklist") - fall da tilbake
 * til den interne ARCHETYPE-attributt-tagen, og til slutt til det
 * generiske navnet uansett (bedre enn a droppe spilleren helt).
 */
function extractArchetype(entry: any): string {
  if (!entry) return "";

  const directName = entry.DecklistName || entry.Name;
  if (directName && !isGenericDecklistName(directName)) {
    return String(directName).trim();
  }

  const attributes: any[] = Array.isArray(entry.Attributes) ? entry.Attributes : [];
  const archetypeAttr = attributes.find((a) => a?.k === "ARCHETYPE");
  if (archetypeAttr?.v) return String(archetypeAttr.v).trim();

  if (directName) return String(directName).trim();
  return "";
}

// Spillere som er slettet lokalt (fra Kontroll-fanen) skal IKKE komme
// tilbake av seg selv neste gang auto-synken kjorer - uten dette ville
// upsertPlayer under bare funnet at Melee-spilleren "mangler" og
// opprettet dem pa nytt innen 30 sekunder. Lagres som en enkel
// JSON-liste over "tournamentId:meleeTeamId"-nokler i settings-
// tabellen (samme monster som round_options i api.ts).
function getExcludedPlayerKeys(): Set<string> {
  const raw = getSetting("melee_excluded_players");
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

export function excludePlayerFromMeleeSync(tournamentId: number, meleeTeamId: string): void {
  if (!meleeTeamId) return;
  const keys = getExcludedPlayerKeys();
  keys.add(`${tournamentId}:${meleeTeamId}`);
  setSetting("melee_excluded_players", JSON.stringify(Array.from(keys)));
}

function upsertPlayer(tournamentId: number, name: string, meleeTeamId: string): number | null {
  if (meleeTeamId && getExcludedPlayerKeys().has(`${tournamentId}:${meleeTeamId}`)) {
    return null;
  }

  const existing = db
    .prepare(`SELECT id FROM players WHERE tournament_id = ? AND (melee_team_id = ? OR name = ?)`)
    .get(tournamentId, meleeTeamId, name) as { id: number } | undefined;

  if (existing) {
    db.prepare(`UPDATE players SET name = ?, melee_team_id = ? WHERE id = ?`).run(name, meleeTeamId, existing.id);
    return existing.id;
  }

  const info = db
    .prepare(`INSERT INTO players (tournament_id, name, melee_team_id) VALUES (?, ?, ?)`)
    .run(tournamentId, name, meleeTeamId);
  return Number(info.lastInsertRowid);
}

function upsertDeck(playerId: number, archetype: string, decklistName: string, meleeDecklistId: string): void {
  const existing = db.prepare(`SELECT id FROM decks WHERE player_id = ? ORDER BY id DESC LIMIT 1`).get(playerId) as
    | { id: number }
    | undefined;

  if (existing) {
    db.prepare(`UPDATE decks SET archetype = ?, decklist_name = ?, melee_decklist_id = ? WHERE id = ?`).run(
      archetype,
      decklistName,
      meleeDecklistId,
      existing.id
    );
    return;
  }

  db.prepare(`INSERT INTO decks (player_id, archetype, decklist_name, melee_decklist_id) VALUES (?, ?, ?, ?)`).run(
    playerId,
    archetype,
    decklistName,
    meleeDecklistId
  );
}

/**
 * Henter standings og oppdaterer players + standings-tabellene.
 * Tilsvarer syncMeleeToTopp16 i MeleeSync.gs.
 */
export async function syncMeleeStandings(tournamentId: number, meleeTournamentId: string): Promise<number> {
  const standings = await meleeGetPaged(`/api/standing/list/current/${meleeTournamentId}`);

  standings.forEach((standing: any, index: number) => {
    const player = standing?.Team?.Players?.[0] || {};
    const name = buildFullName(player);
    const meleeTeamId = String(standing?.TeamId ?? standing?.Team?.ID ?? "");

    const playerId = upsertPlayer(tournamentId, name, meleeTeamId);
    if (playerId == null) return;

    const rank = Number(standing?.Rank ?? index + 1);
    const wins = Number(standing?.MatchWins ?? 0);
    const losses = Number(standing?.MatchLosses ?? 0);
    const draws = Number(standing?.MatchDraws ?? 0);

    db.prepare(
      `INSERT INTO standings (tournament_id, player_id, rank, wins, losses, draws)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(tournament_id, player_id) DO UPDATE SET rank = excluded.rank, wins = excluded.wins, losses = excluded.losses, draws = excluded.draws`
    ).run(tournamentId, playerId, rank, wins, losses, draws);
  });

  return standings.length;
}

/**
 * Henter pagaende kamper og oppretter/oppdaterer matches-tabellen.
 * Tilsvarer syncMeleeCurrentMatch i MeleeSync.gs, men uten den manuelle
 * bord-overstyringen enna (C10/C11-konseptet) - det kan legges til som
 * en settings-nokkel senere hvis det trengs (manual_table_bo3/bo5).
 */
export async function syncMeleeCurrentMatches(tournamentId: number, meleeTournamentId: string): Promise<number> {
  const matches = await meleeGetPaged(`/api/match/list/current/${meleeTournamentId}`);
  let written = 0;

  for (const match of matches) {
    if (!Array.isArray(match.Competitors) || match.Competitors.length < 2) continue;

    const c1 = match.Competitors[0];
    const c2 = match.Competitors[1];

    const p1 = c1?.Team?.Players?.[0] || {};
    const p2 = c2?.Team?.Players?.[0] || {};

    const p1Name = buildFullName(p1);
    const p2Name = buildFullName(p2);

    const p1TeamId = String(c1?.TeamId ?? c1?.Team?.ID ?? "");
    const p2TeamId = String(c2?.TeamId ?? c2?.Team?.ID ?? "");

    const player1Id = upsertPlayer(tournamentId, p1Name, p1TeamId);
    const player2Id = upsertPlayer(tournamentId, p2Name, p2TeamId);
    if (player1Id == null || player2Id == null) continue;

    const deck1 = c1?.Decklists?.[0];
    const deck2 = c2?.Decklists?.[0];

    if (deck1) upsertDeck(player1Id, extractArchetype(deck1), deck1.DecklistName || "", String(deck1.DecklistId ?? ""));
    if (deck2) upsertDeck(player2Id, extractArchetype(deck2), deck2.DecklistName || "", String(deck2.DecklistId ?? ""));

    const tableNumber = match.TableNumber ?? null;

    // Finner eksisterende BO3-match for dette bordet i denne turneringen
    // for a oppdatere i stedet for a lage en duplikat rad hver sync.
    const existing = db
      .prepare(`SELECT id FROM matches WHERE tournament_id = ? AND table_number = ? AND status = 'in_progress' ORDER BY id DESC LIMIT 1`)
      .get(tournamentId, tableNumber) as { id: number } | undefined;

    if (existing) {
      db.prepare(`UPDATE matches SET player1_id = ?, player2_id = ? WHERE id = ?`).run(player1Id, player2Id, existing.id);
    } else {
      db.prepare(
        `INSERT INTO matches (tournament_id, player1_id, player2_id, table_number) VALUES (?, ?, ?, ?)`
      ).run(tournamentId, player1Id, player2Id, tableNumber);
    }

    written += 1;
  }

  return written;
}

function logSyncResult(ok: boolean, message: string) {
  db.prepare(`INSERT INTO melee_sync_log (ok, message) VALUES (?, ?)`).run(ok ? 1 : 0, message);
}

/**
 * Klassifiserer en runde-beskrivelse fra Melee til quarter/semi/final -
 * tilsvarer classifyMeleeBracketRound_ i det gamle MeleeSync.gs.
 */
function classifyBracketRound(roundDescription: string): "quarter" | "semi" | "final" | "" {
  const text = String(roundDescription || "").toLowerCase();
  if (text.includes("quarter")) return "quarter";
  if (text.includes("semi")) return "semi";
  if (text.includes("final")) return "final";
  return "";
}

/**
 * Henter ALLE kamper (ikke bare pagaende) og skriver sluttspill-
 * kampene til bracket_matches. Tilsvarer syncMeleeBracket i det gamle
 * MeleeSync.gs.
 */
export async function syncMeleeBracket(tournamentId: number, meleeTournamentId: string): Promise<number> {
  const allMatches = await meleeGetPaged(`/api/match/list/${meleeTournamentId}`);

  const grouped: Record<"quarter" | "semi" | "final", any[]> = { quarter: [], semi: [], final: [] };
  allMatches.forEach((m: any) => {
    const stage = classifyBracketRound(m.RoundDescription);
    if (stage) grouped[stage].push(m);
  });

  let written = 0;

  (["quarter", "semi", "final"] as const).forEach((round) => {
    grouped[round].forEach((match: any, index: number) => {
      if (!Array.isArray(match.Competitors) || match.Competitors.length < 2) return;

      const c1 = match.Competitors[0];
      const c2 = match.Competitors[1];
      const p1 = c1?.Team?.Players?.[0] || {};
      const p2 = c2?.Team?.Players?.[0] || {};
      const deck1 = c1?.Decklists?.[0];
      const deck2 = c2?.Decklists?.[0];

      db.prepare(
        `INSERT INTO bracket_matches (tournament_id, round, position, p1_name, p1_deck, p1_score, p2_name, p2_deck, p2_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(tournament_id, round, position) DO UPDATE SET
           p1_name = excluded.p1_name, p1_deck = excluded.p1_deck, p1_score = excluded.p1_score,
           p2_name = excluded.p2_name, p2_deck = excluded.p2_deck, p2_score = excluded.p2_score`
      ).run(
        tournamentId,
        round,
        index,
        buildFullName(p1),
        deck1 ? extractArchetype(deck1) : "",
        String(c1?.GameWins ?? "0"),
        buildFullName(p2),
        deck2 ? extractArchetype(deck2) : "",
        String(c2?.GameWins ?? "0")
      );

      written += 1;
    });
  });

  return written;
}

const GENERIC_META_NAMES = ["decklist", "deck list", "untitled", "unnamed"];
function isGenericMetaName(name: string): boolean {
  return GENERIC_META_NAMES.includes(String(name || "").trim().toLowerCase());
}

const META_TOP_N = 10;
let metaCache: { tournamentMeleeId: string; rows: any[]; cachedAt: number } | null = null;
const META_CACHE_MS = 45_000;

/**
 * Henter og aggregerer meta breakdown - tilsvarer
 * getMeleeMetaBreakdown_ i det gamle MeleeApi.gs (samme logikk: hopper
 * over Melee sin generiske "Decklist"-placeholder, viser topp N
 * arketyper individuelt). Cachet i 45 sek for a unnga a hamre Melee
 * sitt decklist-endepunkt pa hvert eneste UI-kall.
 */
export async function getMeleeMetaBreakdown(meleeTournamentId: string): Promise<any[]> {
  if (metaCache && metaCache.tournamentMeleeId === meleeTournamentId && Date.now() - metaCache.cachedAt < META_CACHE_MS) {
    return metaCache.rows;
  }

  const decklists = await meleeGetPaged(`/api/decklist/list/${meleeTournamentId}`);

  const countByArchetype: Record<string, number> = {};
  let total = 0;

  decklists.forEach((entry: any) => {
    const archetype = extractArchetype(entry);
    if (!archetype) return;
    countByArchetype[archetype] = (countByArchetype[archetype] || 0) + 1;
    total += 1;
  });

  const allNames = Object.keys(countByArchetype);
  const genericNames = allNames.filter(isGenericMetaName);
  const namedNames = allNames.filter((n) => !isGenericMetaName(n));

  const sortedNames = namedNames.sort((a, b) => countByArchetype[b] - countByArchetype[a]);
  const topNames = sortedNames.slice(0, META_TOP_N);

  const rows = topNames.map((name) => {
    const count = countByArchetype[name];
    const share = total > 0 ? Math.round((count / total) * 100) : 0;
    return { archetype: name, count: String(count), share: share + "%" };
  });

  metaCache = { tournamentMeleeId: meleeTournamentId, rows, cachedAt: Date.now() };
  return rows;
}

/**
 * Full sync - tilsvarer syncMeleeAll. Respekterer samme PA/AV-prinsipp
 * som B19-bryteren hadde (settings-nokkel "melee_sync_enabled").
 */
export async function syncMeleeAll(): Promise<{ ok: boolean; message: string }> {
  const enabled = getSetting("melee_sync_enabled") !== "off";
  if (!enabled) {
    const message = "Melee-sync er skrudd av (Innstillinger).";
    logSyncResult(true, message);
    return { ok: true, message };
  }

  const meleeTournamentId = extractTournamentId(getSetting("melee_tournament_id"));
  const tournamentId = getActiveTournamentId();

  if (!meleeTournamentId || !tournamentId) {
    const message = "Mangler Melee turnerings-ID eller aktiv turnering - hopper over sync.";
    logSyncResult(false, message);
    return { ok: false, message };
  }

  try {
    const standingsCount = await syncMeleeStandings(tournamentId, meleeTournamentId);
    const matchesCount = await syncMeleeCurrentMatches(tournamentId, meleeTournamentId);
    const bracketCount = await syncMeleeBracket(tournamentId, meleeTournamentId);

    const message = `OK - ${standingsCount} standings, ${matchesCount} kamp(er), ${bracketCount} bracket-kamp(er) oppdatert.`;
    logSyncResult(true, message);
    return { ok: true, message };
  } catch (err: any) {
    const message = "Feil: " + (err?.message || String(err));
    logSyncResult(false, message);
    return { ok: false, message };
  }
}

let syncInterval: ReturnType<typeof setInterval> | null = null;
let syncInProgress = false;

/**
 * Starter automatisk sync hvert 30. sekund - MYE hyppigere enn det
 * gamle 1-minutts-triggeren kunne fa til, siden det ikke lenger finnes
 * noen daglig UrlFetchApp-kvote a bekymre seg for. Melee sitt eget API
 * kan fortsatt rate-limite ved for hoy frekvens - juster
 * SYNC_INTERVAL_MS hvis det blir et problem.
 *
 * VIKTIG: hopper over en runde hvis forrige synk fortsatt holder pa -
 * uten denne sjekken kunne flere overlappende synk-kjoringer hope seg
 * opp (hvis en runde tar lenger enn 30 sekunder) og til slutt kvele
 * serverens event loop helt, som gjorde at HELE API-et (ogsa
 * /api/tournament) sluttet a svare etter en stund.
 */
export function startMeleeAutoSync(onUpdate?: () => void) {
  const SYNC_INTERVAL_MS = 30_000;

  if (syncInterval) clearInterval(syncInterval);

  syncInterval = setInterval(async () => {
    if (syncInProgress) {
      console.log("[melee] Forrige synk holder fortsatt pa - hopper over denne runden.");
      return;
    }
    syncInProgress = true;
    try {
      const result = await syncMeleeAll();
      if (result.ok && onUpdate) onUpdate();
    } finally {
      syncInProgress = false;
    }
  }, SYNC_INTERVAL_MS);
}

export function stopMeleeAutoSync() {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = null;
}
