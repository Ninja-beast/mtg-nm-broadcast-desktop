import React, { useState, useEffect } from "react";
import { API_BASE } from "../lib/apiClient";
import { useTournament, usePlayers } from "../hooks/useTournament";
import { useMatches } from "../hooks/useMatches";
import { useJudgeEntries } from "../hooks/useJudge";
import type { SharedDashboardData } from "../types";
import { Panel, InfoRow } from "../components/shared";

type SearchMode = "PLAYER" | "TABLE" | "MATCH";

function PhoneCard({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ alignSelf: "start", height: "fit-content" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", letterSpacing: 1, marginBottom: 8 }}>{title}</div>
      <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 18, padding: 16, maxWidth: 360 }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--border)", margin: "0 auto 14px" }} />
        {children}
      </div>
    </div>
  );
}

export function CompanionTab({ shared }: { shared: SharedDashboardData }) {
  const { status, broadcastState, reload } = shared;
  const [largeTouch, setLargeTouch] = useState(false);

  const [tournament] = useTournament();
  const [matches, reloadMatches] = useMatches(tournament?.id);
  const [players] = usePlayers(tournament?.id);
  const [entries] = useJudgeEntries({ tournamentId: tournament?.id });

  const allMatches = matches ?? [];
  const featuredMatchId = broadcastState?.bo3?.id;
  const featuredMatch = allMatches.find((m) => m.id === featuredMatchId);

  const [searchMode, setSearchMode] = useState<SearchMode>("PLAYER");
  const [query, setQuery] = useState("");
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedMatchId && featuredMatchId) setSelectedMatchId(featuredMatchId);
  }, [featuredMatchId]);

  const selectedMatch = allMatches.find((m) => m.id === selectedMatchId) || null;

  function playerName(id: number | undefined): string {
    if (id == null) return "-";
    return (players ?? []).find((p) => p.id === id)?.name ?? `#${id}`;
  }

  async function patchMatch(matchId: number, fields: Record<string, unknown>) {
    await fetch(`${API_BASE}/matches/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields)
    });
    reloadMatches();
    reload();
  }

  async function nudgeLife(side: 1 | 2, delta: number) {
    if (!featuredMatch) return;
    const key = side === 1 ? "player1Life" : "player2Life";
    const current = side === 1 ? featuredMatch.player1_life : featuredMatch.player2_life;
    await patchMatch(featuredMatch.id, { [key]: current + delta });
  }

  async function setCamera(camera: string) {
    await fetch(`${API_BASE}/broadcast/camera`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ camera })
    });
    reload();
  }

  async function setNameTags(show: boolean) {
    await fetch(`${API_BASE}/broadcast/name-tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ show })
    });
    reload();
  }

  async function setCardShowcaseVisible(show: boolean) {
    await fetch(`${API_BASE}/broadcast/card-showcase-visibility`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ show })
    });
    reload();
  }

  async function setScene(scene: string) {
    await fetch(`${API_BASE}/broadcast/scene`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene })
    });
    reload();
  }

  async function winGame(player: 1 | 2) {
    if (!selectedMatch) return;
    await fetch(`${API_BASE}/matches/${selectedMatch.id}/win-game`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player })
    });
    reloadMatches();
  }

  async function draw() {
    if (!selectedMatch) return;
    await patchMatch(selectedMatch.id, { status: "finished" });
  }

  async function correctResult() {
    if (!selectedMatch) return;
    const reason = window.prompt("Reason for this correction:");
    if (reason == null || !reason.trim()) return;
    await fetch(`${API_BASE}/judge/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId: tournament?.id, matchId: selectedMatch.id, type: "correction", message: `Corrected via Companion. Reason: ${reason.trim()}` })
    });
  }

  async function submitResult() {
    if (!selectedMatch) return;
    const winnerPlayerId =
      selectedMatch.player1_game_wins > selectedMatch.player2_game_wins
        ? selectedMatch.player1_id
        : selectedMatch.player2_game_wins > selectedMatch.player1_game_wins
        ? selectedMatch.player2_id
        : null;
    await patchMatch(selectedMatch.id, { status: "finished", ...(winnerPlayerId ? { winnerPlayerId } : {}) });
  }

  let searchResults: { key: string; label: string; onClick: () => void }[] = [];
  const q = query.trim().toLowerCase();
  if (searchMode === "PLAYER") {
    searchResults = (players ?? [])
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .slice(0, 6)
      .map((p) => {
        const active = allMatches.find((m) => (m.player1_id === p.id || m.player2_id === p.id) && m.status !== "finished");
        return { key: `p${p.id}`, label: active ? `${p.name} — T${active.table_number ?? active.id}` : `${p.name} — no active match`, onClick: () => active && setSelectedMatchId(active.id) };
      });
  } else if (searchMode === "TABLE") {
    searchResults = allMatches
      .filter((m) => !q || String(m.table_number ?? m.id).includes(q))
      .slice(0, 6)
      .map((m) => ({ key: `t${m.id}`, label: `T${m.table_number ?? m.id} — ${playerName(m.player1_id)} vs ${playerName(m.player2_id)}`, onClick: () => setSelectedMatchId(m.id) }));
  } else {
    searchResults = allMatches
      .filter((m) => !q || `${playerName(m.player1_id)} ${playerName(m.player2_id)}`.toLowerCase().includes(q))
      .slice(0, 6)
      .map((m) => ({ key: `m${m.id}`, label: `${playerName(m.player1_id)} vs ${playerName(m.player2_id)} — T${m.table_number ?? m.id}`, onClick: () => setSelectedMatchId(m.id) }));
  }

  const pendingCount = allMatches.filter((m) => m.status !== "finished").length;
  const gameNumber = featuredMatch ? featuredMatch.player1_game_wins + featuredMatch.player2_game_wins + 1 : 1;

  const btn = (active: boolean): React.CSSProperties => ({
    padding: largeTouch ? "16px 10px" : "10px 10px",
    minHeight: largeTouch ? 56 : 40,
    borderRadius: 10,
    border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
    background: active ? "var(--raised)" : "var(--raised)",
    color: active ? "var(--primary)" : "var(--text-body)",
    fontFamily: "var(--font-mono)",
    fontWeight: 700,
    fontSize: largeTouch ? 13 : 12,
    cursor: "pointer"
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Companion (Mobile)</h2>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Same data, same roles — a mobile interface to Observer, not a separate product</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setLargeTouch((v) => !v)}
            style={{
              fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, padding: "6px 12px", borderRadius: 20, cursor: "pointer",
              border: `1px solid ${largeTouch ? "var(--primary)" : "var(--border)"}`,
              color: largeTouch ? "#04222a" : "var(--text-muted)",
              background: largeTouch ? "var(--primary)" : "var(--popover)"
            }}
          >
            LARGE TOUCH TARGETS
          </button>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, padding: "6px 12px", borderRadius: 20, border: "1px solid var(--primary)", color: "#04222a", background: "var(--primary)" }}>
            LIVE SYNC
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "auto auto 1fr", gap: 24, alignItems: "start" }}>
        {/* PRODUCER MOBILE */}
        <PhoneCard title="PRODUCER MOBILE">
          {!featuredMatch ? (
            <div style={{ fontSize: 13, opacity: 0.5, padding: "20px 0" }}>No match is live on BO3 right now.</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800, color: "var(--primary)" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--primary)" }} />
                  LIVE · BO3
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)" }}>{(status?.camera || "-").toUpperCase()} CAM</span>
              </div>

              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", marginBottom: 10 }}>
                TABLE {featuredMatch.table_number ?? featuredMatch.id} · GAME {gameNumber}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{playerName(featuredMatch.player1_id)}</div>
                  <div style={{ fontSize: 34, fontWeight: 800, margin: "4px 0" }}>{featuredMatch.player1_life}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    <button onClick={() => nudgeLife(1, -1)} style={btn(false)}>−</button>
                    <button onClick={() => nudgeLife(1, 1)} style={btn(false)}>+</button>
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{playerName(featuredMatch.player2_id)}</div>
                  <div style={{ fontSize: 34, fontWeight: 800, margin: "4px 0" }}>{featuredMatch.player2_life}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    <button onClick={() => nudgeLife(2, -1)} style={btn(false)}>−</button>
                    <button onClick={() => nudgeLife(2, 1)} style={btn(false)}>+</button>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <button onClick={() => setCamera("main")} style={btn(status?.camera === "main")}>MAIN CAM</button>
                <button onClick={() => setCamera("handheld")} style={btn(status?.camera === "handheld")}>HANDHELD</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <button onClick={() => setNameTags(!status?.showNameTags)} style={btn(!!status?.showNameTags)}>NAME TAGS</button>
                <button onClick={() => setCardShowcaseVisible(!status?.cardShowcaseVisible)} style={btn(!!status?.cardShowcaseVisible)}>CARD</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                <button onClick={() => setScene("bo3")} style={btn(broadcastState?.scene === "bo3")}>BO3</button>
                <button onClick={() => setScene("casterdesk")} style={btn(broadcastState?.scene === "casterdesk")}>CASTER</button>
              </div>

              <InfoRow label="STREAM" value={status?.obs.stream.active ? "STREAMING" : "OFFLINE"} accent={status?.obs.stream.active ? "var(--primary)" : "var(--text-faint)"} />
              <InfoRow label="SCORE" value={`${featuredMatch.player1_game_wins} — ${featuredMatch.player2_game_wins}`} mono />
            </>
          )}
        </PhoneCard>

        {/* JUDGE MOBILE */}
        <PhoneCard title="JUDGE MOBILE">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800, color: "var(--primary)" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--primary)" }} />
              SWISS R{tournament?.current_round ?? "-"}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 12, border: "1px solid var(--warn)", color: "var(--warn)" }}>
              {pendingCount} PENDING
            </span>
          </div>

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search player / table"
            style={{ width: "100%", padding: 8, marginBottom: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", boxSizing: "border-box", fontSize: 13 }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
            {(["PLAYER", "TABLE", "MATCH"] as SearchMode[]).map((m) => (
              <button key={m} onClick={() => setSearchMode(m)} style={btn(searchMode === m)}>{m}</button>
            ))}
          </div>
          {query && (
            <div style={{ marginBottom: 8 }}>
              {searchResults.map((r) => (
                <div key={r.key} onClick={r.onClick} style={{ padding: "6px 8px", fontSize: 12, cursor: "pointer", borderRadius: 6, color: "var(--text-body)" }}>
                  {r.label}
                </div>
              ))}
            </div>
          )}

          {!selectedMatch ? (
            <div style={{ fontSize: 13, opacity: 0.5, padding: "12px 0" }}>No match selected.</div>
          ) : (
            <>
              <div style={{ background: "var(--raised)", borderRadius: 10, padding: 10, marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Table {selectedMatch.table_number ?? selectedMatch.id}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  {playerName(selectedMatch.player1_id)} vs {playerName(selectedMatch.player2_id)} · {selectedMatch.player1_game_wins} — {selectedMatch.player2_game_wins}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <button onClick={() => winGame(1)} style={btn(false)}>P1 WINS</button>
                <button onClick={() => winGame(2)} style={btn(false)}>P2 WINS</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <button onClick={draw} style={btn(false)}>DRAW</button>
                <button onClick={correctResult} style={{ ...btn(false), borderColor: "var(--warn)", color: "var(--warn)" }}>CORRECT</button>
              </div>
              <button
                onClick={submitResult}
                style={{ width: "100%", padding: largeTouch ? 18 : 12, borderRadius: 10, border: "1px solid var(--primary)", background: "var(--raised)", color: "var(--primary)", fontWeight: 800, fontFamily: "var(--font-mono)", fontSize: 13, cursor: "pointer", marginBottom: 12 }}
              >
                SUBMIT RESULT
              </button>
            </>
          )}

          <InfoRow label="TOURNAMENT" value={tournament ? `Round ${tournament.current_round} of ${tournament.total_rounds}` : "-"} />
          <InfoRow label="DOCUMENTATION" value={`${(entries ?? []).length} entries`} mono />
        </PhoneCard>

        {/* COMPANION PRINCIPLES */}
        <Panel title="COMPANION PRINCIPLES" style={{ alignSelf: "start", height: "fit-content" }}>
          <InfoRow label="DATA SOURCE" value="Shared with desktop" accent="var(--primary)" />
          <InfoRow label="WORKSPACE" value="Chosen by role" />
          <InfoRow label="TOUCH TARGET" value="48 px minimum" mono />
          <InfoRow label="DESTRUCTIVE" value="Confirmation required" />
          <InfoRow label="OFFLINE" value="Read-only + reconnect" />
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 12, lineHeight: 1.5 }}>
            The two panels on the left are a live, working preview - they call the exact same API this desktop app uses, so actions taken here show up everywhere instantly. There isn't a separate mobile app screen that looks like this yet though: the real Expo companion app (in mtg-nm-companion-mobile) is currently just a simple life counter for players, not a role-specific Producer/Judge interface. Building that as an actual phone app would mean adding these same screens over there.
          </div>
        </Panel>
      </div>
    </div>
  );
}
