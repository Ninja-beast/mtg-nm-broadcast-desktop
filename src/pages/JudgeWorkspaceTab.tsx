import React, { useState, useEffect } from "react";
import { API_BASE } from "../lib/apiClient";
import { useTournament, usePlayers, useStandings } from "../hooks/useTournament";
import { useMatches } from "../hooks/useMatches";
import { useBroadcastState } from "../hooks/useBroadcast";
import { useJudgeEntries } from "../hooks/useJudge";
import type { Player, Match } from "../types";
import { Panel, InfoRow, QuickActionButton } from "../components/shared";
import { phaseLabel, deriveMatchStatus } from "./TournamentTab";


type SearchMode = "PLAYER" | "TABLE" | "MATCH";

export function JudgeWorkspaceTab() {
  const [tournament] = useTournament();
  const [players] = usePlayers(tournament?.id);
  const [matches, reloadMatches] = useMatches(tournament?.id);
  const [standings] = useStandings(tournament?.id);
  const [broadcastState] = useBroadcastState();
  const [entries, reloadEntries] = useJudgeEntries({ tournamentId: tournament?.id });

  const [searchMode, setSearchMode] = useState<SearchMode>("PLAYER");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [showStats, setShowStats] = useState(false);

  const [resultP1, setResultP1] = useState(0);
  const [resultP2, setResultP2] = useState(0);

  const [docText, setDocText] = useState("");
  const [attachToMatch, setAttachToMatch] = useState(true);
  const [markAsWarning, setMarkAsWarning] = useState(false);
  const [saving, setSaving] = useState(false);

  const allMatches = matches ?? [];
  const allPlayers = players ?? [];
  const allStandings = standings ?? [];
  const allEntries = entries ?? [];

  const selectedMatch = allMatches.find((m) => m.id === selectedMatchId) || null;
  const selectedPlayer = allPlayers.find((p) => p.id === selectedPlayerId) || null;

  useEffect(() => {
    if (selectedMatch) {
      setResultP1(selectedMatch.player1_game_wins);
      setResultP2(selectedMatch.player2_game_wins);
    }
  }, [selectedMatchId]);

  function playerName(id: number | undefined): string {
    if (id == null) return "-";
    return allPlayers.find((p) => p.id === id)?.name ?? `Player #${id}`;
  }

  function playerRecord(id: number | undefined): string {
    if (id == null) return "-";
    const s = allStandings.find((row) => row.player_id === id);
    if (s) return `${s.wins}-${s.losses}-${s.draws}`;

    // Ingen standings-rad (typisk for lokale turneringer uten Melee-synk,
    // som er nettopp den standings-tabellen ellers avhenger av) -
    // regner rekorden ut direkte fra ferdige kamper i stedet for a
    // vise en tom "-" nar dataen faktisk finnes.
    let wins = 0;
    let losses = 0;
    let draws = 0;
    allMatches
      .filter((m) => m.status === "finished" && (m.player1_id === id || m.player2_id === id))
      .forEach((m) => {
        const isP1 = m.player1_id === id;
        const my = isP1 ? m.player1_game_wins : m.player2_game_wins;
        const opp = isP1 ? m.player2_game_wins : m.player1_game_wins;
        // Sjekker LIK SCORE forst (samme prioritering som WIN/LOSS/DRAW-
        // merket i PLAYER HISTORY under) - fanger opp uavgjorte kamper
        // korrekt selv om winner_player_id skulle vaere satt til en
        // "falsk" verdi (f.eks. 0 i stedet for tomt/NULL) i databasen.
        // Bruker ogsa en truthy-sjekk (ikke "!= null") pa winner_player_id,
        // slik at en lagret 0 aldri feiltolkes som en gyldig spiller-id.
        if (my === opp) {
          draws += 1;
        } else if (m.winner_player_id) {
          if (m.winner_player_id === id) wins += 1;
          else losses += 1;
        } else if (my > opp) {
          wins += 1;
        } else {
          losses += 1;
        }
      });
    return `${wins}-${losses}-${draws}`;
  }

  function activeMatchForPlayer(playerId: number): Match | undefined {
    return allMatches.find((m) => (m.player1_id === playerId || m.player2_id === playerId) && m.status !== "finished");
  }

  function selectPlayer(player: Player) {
    setSelectedPlayerId(player.id);
    const active = activeMatchForPlayer(player.id);
    setSelectedMatchId(active ? active.id : null);
  }

  function selectMatch(match: Match, historyPlayerId?: number) {
    setSelectedMatchId(match.id);
    setSelectedPlayerId(historyPlayerId ?? match.player1_id);
  }

  // ---- Search ----
  const query = searchQuery.trim().toLowerCase();
  type SearchResult = { key: string; label: string; onClick: () => void; active: boolean };
  let searchResults: SearchResult[] = [];

  if (searchMode === "PLAYER") {
    searchResults = allPlayers
      .filter((p) => !query || p.name.toLowerCase().includes(query))
      .slice(0, 12)
      .map((p) => {
        const active = activeMatchForPlayer(p.id);
        const label = active ? `${p.name} — T${active.table_number ?? active.id}` : `${p.name} — no active match`;
        return { key: `p${p.id}`, label, onClick: () => selectPlayer(p), active: selectedPlayerId === p.id };
      });
  } else if (searchMode === "TABLE") {
    searchResults = allMatches
      .filter((m) => !query || String(m.table_number ?? m.id).includes(query))
      .slice(0, 12)
      .map((m) => ({
        key: `t${m.id}`,
        label: `T${m.table_number ?? m.id} — ${playerName(m.player1_id)} vs ${playerName(m.player2_id)}`,
        onClick: () => selectMatch(m),
        active: selectedMatchId === m.id
      }));
  } else {
    searchResults = allMatches
      .filter((m) => !query || `${playerName(m.player1_id)} ${playerName(m.player2_id)}`.toLowerCase().includes(query))
      .slice(0, 12)
      .map((m) => ({
        key: `m${m.id}`,
        label: `${playerName(m.player1_id)} vs ${playerName(m.player2_id)} — T${m.table_number ?? m.id}`,
        onClick: () => selectMatch(m),
        active: selectedMatchId === m.id
      }));
  }

  // ---- Result entry ----
  async function submitResult() {
    if (!selectedMatch) return;
    const winnerPlayerId = resultP1 > resultP2 ? selectedMatch.player1_id : resultP2 > resultP1 ? selectedMatch.player2_id : null;
    await fetch(`${API_BASE}/matches/${selectedMatch.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player1GameWins: resultP1,
        player2GameWins: resultP2,
        status: "finished",
        ...(winnerPlayerId ? { winnerPlayerId } : {})
      })
    });
    reloadMatches();
  }

  async function submitDraw() {
    if (!selectedMatch) return;
    await fetch(`${API_BASE}/matches/${selectedMatch.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player1GameWins: resultP1, player2GameWins: resultP2, status: "finished" })
    });
    reloadMatches();
  }

  async function submitBye() {
    if (!selectedMatch) return;
    if (!window.confirm(`Award this match to ${playerName(selectedMatch.player1_id)} as a no-show/bye?`)) return;
    await fetch(`${API_BASE}/matches/${selectedMatch.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "finished", winnerPlayerId: selectedMatch.player1_id })
    });
    reloadMatches();
  }

  async function correctResult() {
    if (!selectedMatch) return;
    const reason = window.prompt("Reason for this correction (logged with your name and the time):");
    if (reason == null || !reason.trim()) return;

    const oldScore = `${selectedMatch.player1_game_wins}-${selectedMatch.player2_game_wins}`;
    const newScore = `${resultP1}-${resultP2}`;
    const winnerPlayerId = resultP1 > resultP2 ? selectedMatch.player1_id : resultP2 > resultP1 ? selectedMatch.player2_id : null;

    await fetch(`${API_BASE}/matches/${selectedMatch.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player1GameWins: resultP1,
        player2GameWins: resultP2,
        status: "finished",
        ...(winnerPlayerId ? { winnerPlayerId } : {})
      })
    });

    await fetch(`${API_BASE}/judge/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournamentId: tournament?.id,
        matchId: selectedMatch.id,
        type: "correction",
        message: `Result corrected from ${oldScore} to ${newScore} (T${selectedMatch.table_number ?? selectedMatch.id}). Reason: ${reason.trim()}`
      })
    });

    reloadMatches();
    reloadEntries();
  }

  async function saveDocumentation() {
    if (!docText.trim()) return;
    setSaving(true);
    try {
      await fetch(`${API_BASE}/judge/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId: tournament?.id,
          matchId: attachToMatch ? selectedMatchId : null,
          type: markAsWarning ? "warning" : "note",
          message: docText.trim()
        })
      });
      setDocText("");
      reloadEntries();
    } finally {
      setSaving(false);
    }
  }

  const pendingCount = allMatches.filter((m) => m.status !== "finished").length;
  const roundBadge = tournament
    ? (() => {
        const roundValue = tournament.current_round;
        const isPlainNumber = /^\d+$/.test(String(roundValue));
        if (tournament.phase !== "swiss") return phaseLabel(tournament.phase).toUpperCase();
        // current_round kan holde fritekst (samme runde-navn-system som
        // brukes pa enkeltkamper, f.eks. "Runde 2") i stedet for et rent
        // tall - "R" foran gir da rot ("RRunde 2"). Setter "R" foran KUN
        // nar verdien faktisk er et rent tall.
        return isPlainNumber ? `SWISS R${roundValue}` : `SWISS ${roundValue}`;
      })()
    : "";

  const status = selectedMatch ? deriveMatchStatus(selectedMatch, broadcastState) : null;

  const playerHistory = selectedPlayer
    ? allMatches
        .filter((m) => (m.player1_id === selectedPlayer.id || m.player2_id === selectedPlayer.id) && m.status === "finished")
        .slice()
        .reverse()
        .slice(0, 10)
    : [];

  const entriesThisEvent = allEntries.length;
  const warningsCount = allEntries.filter((e) => e.type === "warning").length;

  const inputStyle: React.CSSProperties = { width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", fontSize: 13, boxSizing: "border-box" };
  const rowStyle: React.CSSProperties = { padding: "8px 10px", borderRadius: 6, marginBottom: 4, cursor: "pointer", fontSize: 13 };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Judge Workspace</h2>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            What happened in the tournament — no broadcast controls in this role
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {tournament && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, padding: "6px 12px", borderRadius: 20, border: "1px solid var(--border)", color: "var(--text-muted)", background: "var(--popover)" }}>
              {roundBadge}
            </span>
          )}
          {pendingCount > 0 && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, padding: "6px 12px", borderRadius: 20, border: "1px solid var(--warn)", color: "#2a1a00", background: "var(--warn)" }}>
              {pendingCount} RESULTS PENDING
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, alignItems: "stretch", marginBottom: 16 }}>
        {/* SEARCH */}
        <Panel title="SEARCH" style={{ height: "100%" }}>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            style={{ ...inputStyle, marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {(["PLAYER", "TABLE", "MATCH"] as SearchMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setSearchMode(mode)}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: `1px solid ${searchMode === mode ? "var(--primary)" : "var(--border)"}`,
                  background: searchMode === mode ? "var(--primary)" : "transparent",
                  color: searchMode === mode ? "#04222a" : "var(--primary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                {mode}
              </button>
            ))}
          </div>
          <div>
            {searchResults.length === 0 && <div style={{ fontSize: 13, opacity: 0.5 }}>No matches found.</div>}
            {searchResults.map((r) => (
              <div
                key={r.key}
                onClick={r.onClick}
                style={{
                  ...rowStyle,
                  border: `1px solid ${r.active ? "var(--primary)" : "transparent"}`,
                  background: r.active ? "var(--primary)" : "transparent",
                  color: r.active ? "#04222a" : "var(--text-heading)",
                  fontWeight: r.active ? 700 : 400
                }}
              >
                {r.label}
              </div>
            ))}
          </div>
        </Panel>

        {/* MATCH STATE */}
        <Panel title="MATCH STATE" style={{ height: "100%" }}>
          {!selectedMatch ? (
            <div style={{ fontSize: 13, opacity: 0.5 }}>Select a player, table, or match to see its state.</div>
          ) : (
            <>
              <InfoRow label="TABLE" value={selectedMatch.table_number ?? selectedMatch.id} mono />
              <InfoRow label="ROUND" value={selectedMatch.round_label || (tournament ? `${phaseLabel(tournament.phase)} ${tournament.current_round}` : "-")} />
              <InfoRow label="PLAYER 1" value={playerName(selectedMatch.player1_id)} />
              <InfoRow label="PLAYER 2" value={playerName(selectedMatch.player2_id)} />
              <InfoRow label="SCORE" value={`${selectedMatch.player1_game_wins} — ${selectedMatch.player2_game_wins}`} mono />
              <InfoRow
                label="STATUS"
                value={
                  status ? (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontWeight: 800,
                        color:
                          status === "LIVE" ? "var(--primary)" : status === "PAUSED" ? "var(--warn)" : status === "FINISHED" ? "var(--text-muted)" : "var(--text-faint)"
                      }}
                    >
                      {status}
                    </span>
                  ) : (
                    "-"
                  )
                }
              />
              <InfoRow label="RECORD" value={`${playerRecord(selectedMatch.player1_id)} / ${playerRecord(selectedMatch.player2_id)}`} mono />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
                <QuickActionButton label="VIEW HISTORY" onClick={() => setSelectedPlayerId(selectedMatch.player1_id)} compact />
                <QuickActionButton label="VIEW STATS" onClick={() => setShowStats((v) => !v)} compact />
              </div>

              {showStats && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--hairline)" }}>
                  <InfoRow label={playerName(selectedMatch.player1_id)} value={`${playerHistoryCount(allMatches, selectedMatch.player1_id)} matches played`} />
                  <InfoRow label={playerName(selectedMatch.player2_id)} value={`${playerHistoryCount(allMatches, selectedMatch.player2_id)} matches played`} />
                </div>
              )}
            </>
          )}
        </Panel>

        {/* RESULT ENTRY */}
        <Panel title="RESULT ENTRY" style={{ height: "100%" }}>
          {!selectedMatch ? (
            <div style={{ fontSize: 13, opacity: 0.5 }}>Select a match to enter a result.</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-faint)", marginBottom: 6 }}>P1 GAMES</div>
                  <input
                    type="number"
                    min={0}
                    value={resultP1}
                    onChange={(e) => setResultP1(Math.max(0, Number(e.target.value)))}
                    style={{ width: "100%", border: "none", background: "transparent", color: "var(--text-heading)", fontSize: 34, fontWeight: 800, textAlign: "center" }}
                  />
                </div>
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-faint)", marginBottom: 6 }}>P2 GAMES</div>
                  <input
                    type="number"
                    min={0}
                    value={resultP2}
                    onChange={(e) => setResultP2(Math.max(0, Number(e.target.value)))}
                    style={{ width: "100%", border: "none", background: "transparent", color: "var(--text-heading)", fontSize: 34, fontWeight: 800, textAlign: "center" }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <button
                  onClick={submitDraw}
                  style={{ padding: "14px 10px", minHeight: 52, borderRadius: 10, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontWeight: 800, fontSize: 13, letterSpacing: 0.5, cursor: "pointer" }}
                >
                  DRAW
                </button>
                <button
                  onClick={submitBye}
                  style={{ padding: "14px 10px", minHeight: 52, borderRadius: 10, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontWeight: 800, fontSize: 13, letterSpacing: 0.5, cursor: "pointer" }}
                >
                  BYE
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button
                  onClick={submitResult}
                  style={{ padding: "14px 10px", minHeight: 52, borderRadius: 10, border: "1px solid var(--primary)", background: "var(--primary)", color: "#04222a", fontWeight: 800, fontSize: 13, letterSpacing: 0.5, cursor: "pointer" }}
                >
                  SUBMIT RESULT
                </button>
                <QuickActionButton label="CORRECT RESULT" onClick={correctResult} tone="warn" compact />
              </div>
              <div style={{ fontSize: 11, opacity: 0.55, marginTop: 8 }}>Corrections are logged with judge, time and reason.</div>
            </>
          )}
        </Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, alignItems: "start" }}>
        {/* PLAYER HISTORY */}
        <Panel title={selectedPlayer ? `PLAYER HISTORY — ${selectedPlayer.name.toUpperCase()}` : "PLAYER HISTORY"} style={{ alignSelf: "start", height: "fit-content" }}>
          {!selectedPlayer && <div style={{ fontSize: 13, opacity: 0.5 }}>Select a player to see their match history.</div>}
          {selectedPlayer && playerHistory.length === 0 && <div style={{ fontSize: 13, opacity: 0.5 }}>No finished matches yet.</div>}
          {playerHistory.map((m) => {
            const isP1 = m.player1_id === selectedPlayer!.id;
            const opponentId = isP1 ? m.player2_id : m.player1_id;
            const myScore = isP1 ? m.player1_game_wins : m.player2_game_wins;
            const oppScore = isP1 ? m.player2_game_wins : m.player1_game_wins;
            const won = m.winner_player_id ? m.winner_player_id === selectedPlayer!.id : myScore > oppScore;
            const isDraw = myScore === oppScore;
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", borderBottom: "1px solid var(--hairline)", fontSize: 13 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", width: 60 }}>{m.round_label || "—"}</span>
                <span style={{ flex: 1 }}>{playerName(opponentId)}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", width: 30 }}>T{m.table_number ?? m.id}</span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontWeight: 800,
                    fontSize: 12,
                    color: isDraw ? "var(--text-muted)" : won ? "var(--primary)" : "var(--rose)"
                  }}
                >
                  {myScore} — {oppScore} {isDraw ? "DRAW" : won ? "WIN" : "LOSS"}
                </span>
              </div>
            );
          })}
        </Panel>

        {/* DOCUMENTATION */}
        <Panel title="DOCUMENTATION" style={{ alignSelf: "start", height: "fit-content" }}>
          <textarea
            value={docText}
            onChange={(e) => setDocText(e.target.value)}
            placeholder="Note something that happened (slow play, a ruling, an observation)..."
            rows={5}
            style={{ ...inputStyle, resize: "vertical", marginBottom: 8 }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, opacity: 0.85, marginBottom: 10 }}>
            <input type="checkbox" checked={markAsWarning} onChange={(e) => setMarkAsWarning(e.target.checked)} />
            Mark as a warning
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <QuickActionButton
              label={attachToMatch && selectedMatch ? `MATCH ATTACHED (T${selectedMatch.table_number ?? selectedMatch.id})` : "ATTACH MATCH"}
              onClick={() => setAttachToMatch((v) => !v)}
              disabled={!selectedMatch}
              compact
            />
            <QuickActionButton label={saving ? "SAVING..." : "SAVE ENTRY"} onClick={saveDocumentation} disabled={saving || !docText.trim()} compact />
          </div>

          <InfoRow label="ENTRIES THIS EVENT" value={entriesThisEvent} mono />
          <InfoRow label="WARNINGS" value={warningsCount} mono />
          <InfoRow label="MELEE WRITE-BACK" value="NOT CONFIGURED" />
        </Panel>
      </div>
    </div>
  );
}

function playerHistoryCount(matches: Match[], playerId: number): number {
  return matches.filter((m) => (m.player1_id === playerId || m.player2_id === playerId) && m.status === "finished").length;
}
