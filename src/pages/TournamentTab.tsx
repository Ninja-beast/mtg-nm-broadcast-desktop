import React, { useState, useEffect } from "react";
import { API_BASE } from "../lib/apiClient";
import { useTournament, usePlayers } from "../hooks/useTournament";
import { useMatches } from "../hooks/useMatches";
import { useSystemStatus } from "../hooks/useSystem";
import { useBroadcastState } from "../hooks/useBroadcast";
import { useMeleeSettings } from "../hooks/useMelee";
import type { Tournament, Match, BroadcastStatePayload } from "../types";
import { Panel, InfoRow, QuickActionButton, AlertCard, RoundSelect, PlayerDeckInput } from "../components/shared";

export function phaseLabel(phase: string | undefined): string {
  switch (phase) {
    case "top8": return "Top 8";
    case "semifinal": return "Semifinal";
    case "final": return "Final";
    default: return "Swiss";
  }
}

export function nextPhase(phase: string | undefined): string {
  const order = ["swiss", "top8", "semifinal", "final"];
  const idx = order.indexOf(phase || "swiss");
  return order[Math.min(idx + 1, order.length - 1)];
}

// Kampene har ingen egen LIVE/PAUSED/READY-kolonne i databasen - status
// utledes her fra det vi FAKTISK vet: match.status (in_progress/finished)
// + om kampen na star i bo3- eller bo5-broadcast-slottet (og klokken der
// gar/er pauset). Ingen fiktiv data, kun en tolkning av ekte state.
export function deriveMatchStatus(match: Match, broadcastState: BroadcastStatePayload | null): "LIVE" | "PAUSED" | "FINISHED" | "READY" {
  if (match.status === "finished") return "FINISHED";
  const onBo3 = broadcastState?.bo3?.id === match.id;
  const onBo5 = broadcastState?.bo5?.id === match.id;
  if (onBo3 || onBo5) {
    const timerStatus = onBo3 ? broadcastState?.bo3Timer?.status : broadcastState?.bo5Timer?.status;
    return timerStatus === "start" ? "LIVE" : "PAUSED";
  }
  return "READY";
}

// Tournament Validation-fundamentet: sammenligner det lokalt
// registrerte resultatet mot det Melee selv rapporterer for samme
// kamp (se melee_player1_game_wins/melee_player2_game_wins - fylt av
// syncMeleeCurrentMatches i server/melee.ts, ALDRI av det lokale
// win-game/Enter Result-lopet). Kun en TOLKNING av data som na finnes
// - selve godkjenningssiden (Tournament Validation) bruker denne, men
// er ikke bygget enna.
export type ValidationStatus = "IN_PROGRESS" | "PENDING_SYNC" | "VALIDATED" | "CONFLICT" | "RESOLVED";

export function deriveValidationStatus(match: Match): ValidationStatus {
  if (match.status !== "finished") return "IN_PROGRESS";
  if (match.melee_player1_game_wins == null || match.melee_player2_game_wins == null) return "PENDING_SYNC";
  const matches = match.melee_player1_game_wins === match.player1_game_wins && match.melee_player2_game_wins === match.player2_game_wins;
  if (matches) return "VALIDATED";

  // Konflikt, MEN allerede gjennomgatt og bevisst avvist tidligere -
  // kun sa lenge Melee sitt tall ikke har endret seg siden den
  // bekreftelsen (se conflict_ack_* i server/db.ts) - endrer Melee
  // tallet igjen etterpa, teller det som en HELT NY, uavklart konflikt.
  const ackMatchesCurrentMelee =
    match.conflict_ack_at &&
    match.conflict_ack_melee_p1 === match.melee_player1_game_wins &&
    match.conflict_ack_melee_p2 === match.melee_player2_game_wins;

  return ackMatchesCurrentMelee ? "RESOLVED" : "CONFLICT";
}

export function MatchStatusBadge({ status }: { status: "LIVE" | "PAUSED" | "FINISHED" | "READY" }) {
  const styleMap: Record<string, { color: string; border: string; bg: string }> = {
    LIVE: { color: "var(--primary)", border: "var(--primary)", bg: "var(--popover)" },
    PAUSED: { color: "var(--warn)", border: "var(--warn)", bg: "var(--popover)" },
    FINISHED: { color: "var(--text-muted)", border: "var(--border)", bg: "transparent" },
    READY: { color: "var(--text-faint)", border: "var(--border)", bg: "transparent" }
  };
  const s = styleMap[status];
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 0.5,
        padding: "3px 8px",
        borderRadius: 5,
        border: `1px solid ${s.border}`,
        color: s.color,
        background: s.bg,
        whiteSpace: "nowrap"
      }}
    >
      {status}
    </span>
  );
}

export function TournamentTab() {
  const [tournament, reloadTournament] = useTournament();
  const [players, reloadPlayers] = usePlayers(tournament?.id);
  const [matches, reloadMatches] = useMatches(tournament?.id);
  const [status, reloadStatus] = useSystemStatus();
  const [broadcastState, reloadBroadcastState] = useBroadcastState();
  const [meleeSettings] = useMeleeSettings();
  const meleeSyncEnabled = meleeSettings?.enabled !== false;

  // Poller kamper/broadcast-state/status jevnlig sa LIVE/PAUSED-merkene
  // og MELEE DEGRADED-varselet ikke blir staende utdatert.
  useEffect(() => {
    const interval = setInterval(() => {
      reloadMatches();
      reloadBroadcastState();
      reloadStatus();
    }, 4000);
    return () => clearInterval(interval);
  }, [tournament?.id]);

  const [name, setName] = useState("");
  const [format, setFormat] = useState("Modern");
  const [totalRounds, setTotalRounds] = useState(9);

  const [editName, setEditName] = useState("");
  const [editFormat, setEditFormat] = useState("");
  const [editTotalRounds, setEditTotalRounds] = useState(0);

  const [newPlayerName, setNewPlayerName] = useState("");
  const [player1Id, setPlayer1Id] = useState<number | "">("");
  const [player2Id, setPlayer2Id] = useState<number | "">("");
  const [tableNumber, setTableNumber] = useState("");
  const [isBo5, setIsBo5] = useState(false);
  const [newMatchRound, setNewMatchRound] = useState("");
  const [bulkRound, setBulkRound] = useState("");
  const [pairRound, setPairRound] = useState("");

  const [activePanel, setActivePanel] = useState<"edit" | "match" | "players" | "result" | "advanced" | null>(null);
  const [resultMatchId, setResultMatchId] = useState<number | "">("");
  const [resultP1Wins, setResultP1Wins] = useState(0);
  const [resultP2Wins, setResultP2Wins] = useState(0);

  useEffect(() => {
    if (tournament) {
      setEditName(tournament.name);
      setEditFormat(tournament.format);
      setEditTotalRounds(tournament.total_rounds);
    }
  }, [tournament]);

  const resultMatch = (matches ?? []).find((m) => m.id === resultMatchId);
  useEffect(() => {
    if (resultMatch) {
      setResultP1Wins(resultMatch.player1_game_wins);
      setResultP2Wins(resultMatch.player2_game_wins);
    }
  }, [resultMatchId]);

  function togglePanel(panel: "edit" | "match" | "players" | "result" | "advanced") {
    setActivePanel((current) => (current === panel ? null : panel));
  }

  function playerName(id: number): string {
    return (players ?? []).find((p) => p.id === id)?.name ?? `Spiller #${id}`;
  }

  async function createTournament() {
    if (!name.trim()) return;
    await fetch(`${API_BASE}/tournament`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, format, totalRounds })
    });
    reloadTournament();
  }

  async function saveTournamentEdit() {
    if (!tournament) return;
    await fetch(`${API_BASE}/tournament/${tournament.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, format: editFormat, totalRounds: editTotalRounds })
    });
    reloadTournament();
  }

  async function deleteTournament() {
    if (!tournament) return;
    if (!window.confirm(`Slette "${tournament.name}" og ALT tilknyttet (spillere, kamper, standings)? Kan ikke angres.`)) return;
    await fetch(`${API_BASE}/tournament/${tournament.id}`, { method: "DELETE" });
    reloadTournament();
    reloadPlayers();
  }

  async function editRound() {
    if (!tournament) return;
    const input = window.prompt("Ny gjeldende runde:", String(tournament.current_round));
    if (input == null) return;
    const value = Number(input);
    if (!Number.isFinite(value) || value < 1) return;
    await fetch(`${API_BASE}/tournament/${tournament.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentRound: value })
    });
    reloadTournament();
  }

  async function advanceStage() {
    if (!tournament) return;
    const next = nextPhase(tournament.phase);
    if (next === tournament.phase) {
      window.alert("Turneringen er allerede i siste fase (Final).");
      return;
    }
    if (!window.confirm(`Ga videre fra ${phaseLabel(tournament.phase)} til ${phaseLabel(next)}?`)) return;
    await fetch(`${API_BASE}/tournament/${tournament.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase: next })
    });
    reloadTournament();
  }

  async function retryMelee() {
    await fetch(`${API_BASE}/melee/sync`, { method: "POST" });
    reloadStatus();
  }

  async function toggleFeature(matchId: number, current: boolean) {
    await fetch(`${API_BASE}/matches/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ featureMatch: current ? 0 : 1 })
    });
    reloadMatches();
  }

  async function deleteMatch(matchId: number, label: string) {
    if (!window.confirm(`Slette kampen "${label}"? Kan ikke angres.`)) return;
    await fetch(`${API_BASE}/matches/${matchId}`, { method: "DELETE" });
    reloadMatches();
  }

  async function saveResult(markFinished: boolean) {
    if (!resultMatch) return;
    const body: Record<string, unknown> = { player1GameWins: resultP1Wins, player2GameWins: resultP2Wins };
    if (markFinished) {
      body.status = "finished";
      const winnerPlayerId =
        resultP1Wins > resultP2Wins ? resultMatch.player1_id : resultP2Wins > resultP1Wins ? resultMatch.player2_id : null;
      if (winnerPlayerId) body.winnerPlayerId = winnerPlayerId;
    }
    await fetch(`${API_BASE}/matches/${resultMatch.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    reloadMatches();
    if (markFinished) setResultMatchId("");
  }

  async function addPlayer() {
    if (!tournament || !newPlayerName.trim()) return;
    await fetch(`${API_BASE}/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId: tournament.id, name: newPlayerName })
    });
    setNewPlayerName("");
    reloadPlayers();
  }

  async function deletePlayer(playerId: number, playerName_: string) {
    if (!window.confirm(`Slette "${playerName_}"?`)) return;
    const res = await fetch(`${API_BASE}/players/${playerId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data.error || "Klarte ikke slette spilleren.");
      return;
    }
    reloadPlayers();
  }

  async function setPlayerDeck(playerId: number, archetype: string) {
    await fetch(`${API_BASE}/players/${playerId}/deck`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archetype })
    });
    reloadPlayers();
  }

  async function createMatch() {
    if (!tournament || !player1Id || !player2Id) return;
    await fetch(`${API_BASE}/matches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournamentId: tournament.id,
        player1Id,
        player2Id,
        tableNumber: tableNumber ? Number(tableNumber) : null,
        isBo5,
        roundLabel: newMatchRound
      })
    });
    setPlayer1Id("");
    setPlayer2Id("");
    setTableNumber("");
    setIsBo5(false);
    setNewMatchRound("");
    reloadMatches();
  }

  async function applyBulkRound() {
    if (!tournament || !bulkRound) return;
    const res = await fetch(`${API_BASE}/tournament/${tournament.id}/set-round`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round: bulkRound })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      window.alert(data?.error || "Klarte ikke sette runde pa kampene.");
      return;
    }
    window.alert(`Oppdaterte ${data?.updated ?? 0} pagaende kamp(er) til "${bulkRound}".`);
    reloadMatches();
  }

  async function generatePairings() {
    if (!tournament) return;
    const res = await fetch(`${API_BASE}/tournament/${tournament.id}/generate-pairings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ round: pairRound })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      window.alert(data?.error || "Klarte ikke generere pairings.");
      return;
    }
    const lines = (data.pairs || []).map((p: any) => `${p.player1} vs ${p.player2}`).join("\n");
    const byeLine = data.bye ? `\n\nBye: ${data.bye}` : "";
    window.alert("Pairings generert:\n\n" + (lines || "Ingen kamper opprettet") + byeLine);
    reloadMatches();
  }

  const inputStyle = { width: "100%", padding: 8, marginBottom: 8, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", boxSizing: "border-box" as const };
  const panelBoxStyle = { background: "var(--raised)", padding: 16, borderRadius: 10, marginTop: 16 };

  if (!tournament) {
    return (
      <div>
        <h2>Turnering</h2>
        <div style={{ background: "var(--raised)", padding: 16, borderRadius: 10, maxWidth: 420 }}>
          <p style={{ marginTop: 0 }}>Ingen aktiv turnering enna. Opprett en:</p>
          <input placeholder="Turneringsnavn" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          <input placeholder="Format (f.eks. Modern)" value={format} onChange={(e) => setFormat(e.target.value)} style={inputStyle} />
          <input
            type="number"
            placeholder="Antall runder"
            value={totalRounds}
            onChange={(e) => setTotalRounds(Number(e.target.value))}
            style={inputStyle}
          />
          <button onClick={createTournament} style={{ padding: "10px 16px", borderRadius: 5, border: "none", background: "var(--rose)", color: "var(--text-heading)", fontWeight: 700 }}>
            Opprett turnering
          </button>
        </div>
      </div>
    );
  }

  const meleeDegraded = !!status?.melee.enabled && status?.melee.lastSyncOk === false;
  const backupMode = !meleeSyncEnabled || meleeDegraded;
  const activeMatchesCount = (matches ?? []).filter((m) => m.status !== "finished").length;
  const completedMatchesCount = (matches ?? []).filter((m) => m.status === "finished").length;
  const syncedAtLabel = status?.melee.lastSyncAt
    ? new Date(status.melee.lastSyncAt.replace(" ", "T") + "Z").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "-";
  const openMatches = (matches ?? []).filter((m) => m.status !== "finished");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>{meleeDegraded ? "Tournament — Fallback Control" : "Tournament"}</h2>
          {meleeDegraded && (
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
              Normally hidden from production users · active only when Melee cannot be reached
            </div>
          )}
        </div>
        {(meleeDegraded || backupMode) && (
          <div style={{ display: "flex", gap: 8 }}>
            {meleeDegraded && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, padding: "6px 12px", borderRadius: 20, border: "1px solid var(--warn)", color: "var(--warn)", background: "var(--popover)" }}>
                MELEE DEGRADED
              </span>
            )}
            {backupMode && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, padding: "6px 12px", borderRadius: 20, border: "1px solid var(--border)", color: "var(--text-muted)", background: "var(--popover)" }}>
                BACKUP MODE
              </span>
            )}
          </div>
        )}
      </div>

      {meleeDegraded && (
        <AlertCard
          alert={{
            level: "warn",
            title: "Tournament data is running from cache",
            message: `Rounds, pairings and results shown here were synced at ${syncedAtLabel}. Retry the Melee connection, or manage matches manually until it returns.`
          }}
          onRetry={retryMelee}
          detail={status?.melee.lastSyncMessage || "Ingen ytterligere detaljer fra siste synk-forsok."}
        />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 16, alignItems: "start" }}>
        <Panel title="TOURNAMENT">
          <InfoRow label="NAME" value={tournament.name} />
          <InfoRow label="FORMAT" value={tournament.format || "-"} />
          <InfoRow label="STAGE" value={phaseLabel(tournament.phase)} accent="var(--primary)" />
          <InfoRow label="ROUND" value={`${tournament.current_round} of ${tournament.total_rounds}`} mono />
          <InfoRow label="PLAYERS" value={(players ?? []).length} mono />
          <InfoRow label="ACTIVE MATCHES" value={activeMatchesCount} mono />
          <InfoRow label="COMPLETED" value={completedMatchesCount} mono />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
            <QuickActionButton label="EDIT ROUND" onClick={editRound} compact />
            <QuickActionButton label="ADVANCE STAGE" onClick={advanceStage} compact />
          </div>

          <button
            onClick={() => togglePanel("edit")}
            style={{ marginTop: 10, background: "none", border: "none", color: "var(--text-muted)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}
          >
            {activePanel === "edit" ? "Lukk rediger turnering" : "Rediger turneringsdetaljer..."}
          </button>
        </Panel>

        <Panel title="MATCHES">
          {(matches ?? []).length === 0 && <div style={{ fontSize: 13, opacity: 0.6 }}>Ingen kamper enna.</div>}
          {(matches ?? []).map((m) => {
            const st = deriveMatchStatus(m, broadcastState);
            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--hairline)",
                  background: st === "LIVE" ? "var(--raised)" : "transparent",
                  marginBottom: 6
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", width: 34, flexShrink: 0 }}>
                  T{m.table_number ?? m.id}
                </span>
                <span style={{ flex: 1, fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <b>{playerName(m.player1_id)}</b> <span style={{ opacity: 0.5 }}>vs</span> <b>{playerName(m.player2_id)}</b>
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13, width: 44, textAlign: "center", flexShrink: 0 }}>
                  {m.player1_game_wins} — {m.player2_game_wins}
                </span>
                <MatchStatusBadge status={st} />
                <button
                  onClick={() => toggleFeature(m.id, !!m.feature_match)}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "4px 8px",
                    borderRadius: 5,
                    border: `1px solid ${m.feature_match ? "var(--warn)" : "var(--border)"}`,
                    background: m.feature_match ? "var(--popover)" : "transparent",
                    color: m.feature_match ? "var(--warn)" : "var(--text-muted)",
                    cursor: "pointer",
                    flexShrink: 0
                  }}
                >
                  FEATURE
                </button>
                <button
                  onClick={() => deleteMatch(m.id, `T${m.table_number ?? m.id} - ${playerName(m.player1_id)} vs ${playerName(m.player2_id)}`)}
                  title="Slett kamp (f.eks. duplikat)"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "4px 8px",
                    borderRadius: 5,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text-faint)",
                    cursor: "pointer",
                    flexShrink: 0
                  }}
                >
                  ✕
                </button>
              </div>
            );
          })}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginTop: 14 }}>
            <QuickActionButton label="ADD MATCH" onClick={() => togglePanel("match")} compact />
            <QuickActionButton label="SELECT PLAYER MANUALLY" onClick={() => togglePanel("players")} compact />
            <QuickActionButton label="ENTER RESULT" onClick={() => togglePanel("result")} compact />
            <QuickActionButton label="REBUILD ROUND" onClick={() => togglePanel("advanced")} tone="warn" compact />
          </div>
        </Panel>
      </div>

      {activePanel === "edit" && (
        <div style={panelBoxStyle}>
          <h3 style={{ marginTop: 0 }}>Rediger turnering</h3>
          <p style={{ marginTop: 0, opacity: 0.7, fontSize: 13 }}>For lokal/privat bruk uten Melee - juster fritt:</p>
          <input style={inputStyle} value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Turneringsnavn" />
          <input style={inputStyle} value={editFormat} onChange={(e) => setEditFormat(e.target.value)} placeholder="Format" />
          <input
            style={inputStyle}
            type="number"
            value={editTotalRounds}
            onChange={(e) => setEditTotalRounds(Number(e.target.value))}
            placeholder="Antall runder"
          />
          <button onClick={saveTournamentEdit} style={{ padding: "8px 14px", borderRadius: 5, border: "none", background: "var(--rose)", color: "var(--text-heading)", fontWeight: 700, marginRight: 8 }}>
            Lagre endringer
          </button>
          <button onClick={deleteTournament} style={{ padding: "8px 14px", borderRadius: 5, border: "1px solid var(--rose)", background: "var(--popover)", color: "var(--rose)", fontWeight: 700 }}>
            Slett turnering
          </button>
        </div>
      )}

      {activePanel === "match" && (
        <div style={panelBoxStyle}>
          <h3 style={{ marginTop: 0 }}>Opprett kamp (lokalt, uten Melee)</h3>
          <select style={inputStyle} value={player1Id} onChange={(e) => setPlayer1Id(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Spiller 1...</option>
            {(players ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select style={inputStyle} value={player2Id} onChange={(e) => setPlayer2Id(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Spiller 2...</option>
            {(players ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input style={inputStyle} value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} placeholder="Bordnummer (valgfritt)" />
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: "var(--text-heading)", fontSize: 13 }}>
            <input type="checkbox" checked={isBo5} onChange={(e) => setIsBo5(e.target.checked)} />
            Best-of-5
          </label>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Runde (vises pa overlay)</div>
            <RoundSelect value={newMatchRound} onChange={setNewMatchRound} />
          </div>
          <button onClick={createMatch} style={{ padding: "8px 14px", borderRadius: 5, border: "none", background: "var(--rose)", color: "var(--text-heading)", fontWeight: 700 }}>
            Opprett kamp
          </button>
        </div>
      )}

      {activePanel === "players" && (
        <div style={panelBoxStyle}>
          <h3 style={{ marginTop: 0 }}>Spillere (lokalt, uten Melee)</h3>
          <input style={inputStyle} value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} placeholder="Spillernavn" />
          <button onClick={addPlayer} style={{ padding: "8px 14px", borderRadius: 5, border: "none", background: "var(--border)", color: "var(--text-heading)", fontWeight: 700 }}>
            Legg til
          </button>

          {(players ?? []).length > 0 && (
            <div style={{ marginTop: 12 }}>
              {(players ?? []).map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, opacity: 0.9, marginBottom: 6, gap: 6 }}>
                  <span style={{ minWidth: 110 }}>{p.name}</span>
                  <PlayerDeckInput playerId={p.id} currentValue={p.current_deck} onSave={setPlayerDeck} />
                  <button
                    onClick={() => deletePlayer(p.id, p.name)}
                    style={{ padding: "2px 8px", borderRadius: 5, border: "1px solid var(--rose)", background: "var(--popover)", color: "var(--rose)", fontSize: 11 }}
                  >
                    Slett
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activePanel === "result" && (
        <div style={panelBoxStyle}>
          <h3 style={{ marginTop: 0 }}>Registrer resultat</h3>
          <select
            style={inputStyle}
            value={resultMatchId}
            onChange={(e) => setResultMatchId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Velg kamp...</option>
            {openMatches.map((m) => (
              <option key={m.id} value={m.id}>
                T{m.table_number ?? m.id} · {playerName(m.player1_id)} vs {playerName(m.player2_id)}
              </option>
            ))}
          </select>

          {resultMatch && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{playerName(resultMatch.player1_id)}</div>
                  <input
                    type="number"
                    min={0}
                    value={resultP1Wins}
                    onChange={(e) => setResultP1Wins(Math.max(0, Number(e.target.value)))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{playerName(resultMatch.player2_id)}</div>
                  <input
                    type="number"
                    min={0}
                    value={resultP2Wins}
                    onChange={(e) => setResultP2Wins(Math.max(0, Number(e.target.value)))}
                    style={inputStyle}
                  />
                </div>
              </div>
              <button onClick={() => saveResult(false)} style={{ padding: "8px 14px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", fontWeight: 700, marginRight: 8 }}>
                Lagre score
              </button>
              <button onClick={() => saveResult(true)} style={{ padding: "8px 14px", borderRadius: 5, border: "none", background: "var(--rose)", color: "var(--text-heading)", fontWeight: 700 }}>
                Lagre og merk ferdig
              </button>
            </>
          )}
        </div>
      )}

      {activePanel === "advanced" && (
        <>
          <div style={panelBoxStyle}>
            <h3 style={{ marginTop: 0 }}>Ga videre til runde</h3>
            {meleeSyncEnabled ? (
              <p style={{ fontSize: 13, color: "var(--rose)" }}>
                Auto-sync mot Melee er PA - denne kontrollen er kun for lokalt kjorte turneringer. Sla av auto-sync under Settings-fanen for a bruke den.
              </p>
            ) : (
              <p style={{ fontSize: 13, opacity: 0.7 }}>Setter valgt runde pa ALLE pagaende kamper med en gang.</p>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <RoundSelect value={bulkRound} onChange={setBulkRound} />
              <button
                onClick={applyBulkRound}
                disabled={meleeSyncEnabled}
                style={{ padding: "8px 14px", borderRadius: 5, border: "none", background: "var(--rose)", color: "var(--text-heading)", fontWeight: 700, opacity: meleeSyncEnabled ? 0.4 : 1, cursor: meleeSyncEnabled ? "not-allowed" : "pointer" }}
              >
                Sett pa alle pagaende kamper
              </button>
            </div>
          </div>

          <div style={panelBoxStyle}>
            <h3 style={{ marginTop: 0 }}>Rebuild round - generer nye pairings</h3>
            {meleeSyncEnabled ? (
              <p style={{ fontSize: 13, color: "var(--rose)" }}>Auto-sync mot Melee er PA - sla av for a generere pairings lokalt.</p>
            ) : (
              <p style={{ fontSize: 13, opacity: 0.7 }}>Rangerer etter W-L, unngar rematcher der mulig, gir bye ved oddetall.</p>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <RoundSelect value={pairRound} onChange={setPairRound} />
              <button
                onClick={generatePairings}
                disabled={meleeSyncEnabled}
                style={{ padding: "8px 14px", borderRadius: 5, border: "none", background: "var(--rose)", color: "var(--text-heading)", fontWeight: 700, opacity: meleeSyncEnabled ? 0.4 : 1, cursor: meleeSyncEnabled ? "not-allowed" : "pointer" }}
              >
                Generer pairings
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

