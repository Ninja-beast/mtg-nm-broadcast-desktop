import React, { useState, useEffect } from "react";
import { API_BASE, useJson, fetchScryfallImageByName } from "../lib/apiClient";
import { useTournament, usePlayers } from "../hooks/useTournament";
import { useMatches } from "../hooks/useMatches";
import { useBroadcastState } from "../hooks/useBroadcast";
import type { Player, Match } from "../types";
import { Panel, QuickActionButton, formatUptime } from "../components/shared";

type DeckCard = { card_name: string; image_url: string; is_sideboard: number };

function LifeBox({
  side,
  match,
  onPatch
}: {
  side: 1 | 2;
  match: Match;
  onPatch: (fields: Record<string, unknown>) => void;
}) {
  const lifeKey = side === 1 ? "player1Life" : "player2Life";
  const life = side === 1 ? match.player1_life : match.player2_life;
  const override = side === 1 ? match.player1_life_override : match.player2_life_override;
  const [setOpen, setSetOpen] = useState(false);
  const [setValue, setSetValue] = useState(String(life));

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
      <div style={{ fontSize: 10, opacity: 0.5, letterSpacing: 1, marginBottom: 4 }}>LIFE</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 700 }}>{life}</div>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "3px 8px", borderRadius: 5,
            background: "rgba(251, 120, 139, 0.16)",
            border: "1px solid var(--rose)"
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--rose)", fontSize: 10, fontWeight: 700, letterSpacing: 0.5, whiteSpace: "nowrap" }}>
            ♥ LIFE OVERRIDE
          </span>
          {!!override && (
            <button
              onClick={() => onPatch({ [side === 1 ? "player1LifeOverride" : "player2LifeOverride"]: 0 })}
              title="Fjern override-merket uten a endre selve livstallet - brukes nar tallet er bekreftet riktig igjen."
              style={{ padding: "1px 6px", borderRadius: 4, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 9, fontWeight: 700, cursor: "pointer" }}
            >
              CLEAR
            </button>
          )}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, marginTop: 8 }}>
        {[-5, -1, 1, 5].map((delta) => (
          <button
            key={delta}
            onClick={() => onPatch({ [lifeKey]: life + delta })}
            style={{ padding: "6px 0", borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", fontSize: 12, fontWeight: 700 }}
          >
            {delta > 0 ? `+${delta}` : delta}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 6 }}>
        <button onClick={() => setSetOpen((v) => !v)} style={{ padding: "6px 0", borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", fontSize: 12 }}>
          SET..
        </button>
        <button onClick={() => onPatch({ [lifeKey]: 20 })} style={{ padding: "6px 0", borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", fontSize: 12 }}>
          RESET 20
        </button>
      </div>
      {setOpen && (
        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
          <input
            type="number"
            value={setValue}
            onChange={(e) => setSetValue(e.target.value)}
            style={{ width: 0, flex: 1, padding: 6, borderRadius: 5, border: "1px solid var(--primary)", background: "var(--bg)", color: "var(--text-heading)" }}
          />
          <button
            onClick={() => {
              onPatch({ [lifeKey]: Number(setValue) || 0 });
              setSetOpen(false);
            }}
            style={{ padding: "6px 10px", borderRadius: 5, border: "none", background: "var(--popover)", color: "var(--primary)", fontWeight: 700 }}
          >
            OK
          </button>
        </div>
      )}
    </div>
  );
}

function GameWinsBox({
  side,
  match,
  onWinGame,
  onPatch
}: {
  side: 1 | 2;
  match: Match;
  onWinGame: (side: 1 | 2) => void;
  onPatch: (fields: Record<string, unknown>) => void;
}) {
  const wins = side === 1 ? match.player1_game_wins : match.player2_game_wins;
  const winsKey = side === 1 ? "player1GameWins" : "player2GameWins";

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
      <div style={{ fontSize: 10, opacity: 0.5, letterSpacing: 1, marginBottom: 4 }}>GAME WINS</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 700 }}>{wins}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 8 }}>
        <button onClick={() => onPatch({ [winsKey]: Math.max(0, wins - 1) })} style={{ padding: "6px 0", borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", fontSize: 12, fontWeight: 700 }}>
          -1
        </button>
        <button onClick={() => onWinGame(side)} style={{ padding: "6px 0", borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", fontSize: 12, fontWeight: 700 }}>
          +1
        </button>
      </div>
      <button onClick={() => onPatch({ [winsKey]: 0 })} style={{ width: "100%", marginTop: 6, padding: "6px 0", borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", fontSize: 12 }}>
        RESET SCORE
      </button>
    </div>
  );
}

function PlayerPanel({
  side,
  match,
  playerName,
  playerRecord,
  playerDeck,
  onPatch,
  onWinGame
}: {
  side: 1 | 2;
  match: Match;
  playerName: string;
  playerRecord: string;
  playerDeck: string;
  onPatch: (fields: Record<string, unknown>) => void;
  onWinGame: (side: 1 | 2) => void;
}) {
  return (
    <Panel title={`PLAYER ${side}`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>{playerName}</div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, opacity: 0.5 }}>RECORD</div>
          <div style={{ fontWeight: 700 }}>{playerRecord}</div>
        </div>
      </div>
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 12 }}>{playerDeck}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <LifeBox side={side} match={match} onPatch={onPatch} />
        <GameWinsBox side={side} match={match} onWinGame={onWinGame} onPatch={onPatch} />
      </div>
    </Panel>
  );
}

function CardShowcasePanel({
  side,
  playerId,
  playerName,
  onPatch
}: {
  side: 1 | 2;
  playerId: number;
  playerName: string;
  onPatch: (fields: Record<string, unknown>) => void;
}) {
  const [deckCards] = useJson<DeckCard[]>(`${API_BASE}/players/${playerId}/deck-cards`, [playerId]);
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<{ name: string; imageUrl: string | null } | null>(null);
  const [shortcuts, setShortcuts] = useState<string[]>([]);
  const [changingIndex, setChangingIndex] = useState<number | null>(null);
  const [pushedName, setPushedName] = useState<string | null>(null);

  useEffect(() => {
    if (deckCards && deckCards.length && shortcuts.length === 0) {
      const firstFour = deckCards.slice(0, 4).map((c) => c.card_name);
      setShortcuts(firstFour);
      if (firstFour[0]) loadPreview(firstFour[0]);
    }
  }, [deckCards]);

  async function loadPreview(name: string) {
    const deckCard = (deckCards || []).find((c) => c.card_name.toLowerCase() === name.toLowerCase());
    let imageUrl = deckCard?.image_url || null;
    if (!imageUrl) imageUrl = await fetchScryfallImageByName(name);
    setPreview({ name, imageUrl });
  }

  function runSearch() {
    const match_ = (deckCards || []).find((c) => c.card_name.toLowerCase().includes(search.toLowerCase()));
    if (match_) loadPreview(match_.card_name);
  }

  function pushPreview() {
    if (!preview) return;
    onPatch({ [side === 1 ? "player1CardShowcase" : "player2CardShowcase"]: preview.name });
    setPushedName(preview.name);
    setTimeout(() => setPushedName((current) => (current === preview.name ? null : current)), 2500);
  }

  return (
    <Panel title={`CARD SHOWCASE ${playerName.toUpperCase()}`}>
      <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 12 }}>
        <div style={{ border: "1px dashed var(--border)", borderRadius: 10, height: 170, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {preview?.imageUrl ? (
            <img src={preview.imageUrl} alt={preview.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ opacity: 0.4, fontSize: 11, letterSpacing: 1 }}>PREVIEW</span>
          )}
        </div>

        <div>
          <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 3 }}>Pushable showcase</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Search..."
              style={{ flex: 1, padding: 6, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", fontSize: 12 }}
            />
            <button onClick={runSearch} style={{ padding: "6px 10px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", fontSize: 12 }}>
              Preview
            </button>
          </div>

          <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 3 }}>Showcase shortcut</div>
          {shortcuts.map((name, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "5px 10px",
                borderRadius: 5,
                border: `1px solid ${preview?.name === name ? "var(--primary)" : "var(--border)"}`,
                background: preview?.name === name ? "var(--popover)" : "var(--bg)",
                marginBottom: 4,
                cursor: "pointer",
                fontSize: 12
              }}
            >
              {changingIndex === i ? (
                <select
                  autoFocus
                  value={name}
                  onChange={(e) => {
                    const updated = [...shortcuts];
                    updated[i] = e.target.value;
                    setShortcuts(updated);
                    setChangingIndex(null);
                    loadPreview(e.target.value);
                  }}
                  onBlur={() => setChangingIndex(null)}
                  style={{ flex: 1, background: "var(--bg)", color: "var(--text-heading)", border: "none", fontSize: 12 }}
                >
                  {(deckCards || []).map((c) => (
                    <option key={c.card_name} value={c.card_name}>{c.card_name}</option>
                  ))}
                </select>
              ) : (
                <span onClick={() => loadPreview(name)} style={{ flex: 1, color: preview?.name === name ? "var(--primary)" : "var(--text-heading)" }}>
                  {name}
                </span>
              )}
              <button
                onClick={() => setChangingIndex(i)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 11, textDecoration: "underline", cursor: "pointer" }}
              >
                Change
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={pushPreview}
        disabled={!preview}
        style={{ width: "100%", marginTop: 10, padding: 8, borderRadius: 10, border: "1px solid var(--primary)", background: preview ? "var(--popover)" : "var(--raised)", color: preview ? "var(--primary)" : "var(--text-faint)", fontWeight: 800, fontSize: 13 }}
      >
        PUSH PREVIEW
      </button>
      {pushedName && (
        <div style={{ marginTop: 6, textAlign: "center", fontSize: 11, color: "var(--primary)" }}>
          ✓ Pushed "{pushedName}" to OBS
        </div>
      )}
    </Panel>
  );
}

export function MatchControlTab() {
  const [tournament] = useTournament();
  const [players, reloadPlayers] = usePlayers(tournament?.id);
  const [matches, reloadMatches] = useMatches(tournament?.id);
  const [broadcastState, reloadBroadcastState] = useBroadcastState();

  const activeBoard: "bo3" | "bo5" = broadcastState?.scene === "bo5" ? "bo5" : "bo3";
  const activeBoardData = broadcastState?.[activeBoard];
  const match = (matches || []).find((m) => m.id === activeBoardData?.id);

  function findPlayer(id: number) {
    return players?.find((p) => p.id === id);
  }

  async function patchMatch(fields: Record<string, unknown>) {
    if (!match) return;
    await fetch(`${API_BASE}/matches/${match.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields)
    });
    reloadMatches();
  }

  async function winGame(side: 1 | 2) {
    if (!match) return;
    await fetch(`${API_BASE}/matches/${match.id}/win-game`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player: side })
    });
    reloadMatches();
  }

  async function swapSides() {
    if (!match) return;
    await fetch(`${API_BASE}/matches/${match.id}/swap-sides`, { method: "POST" });
    reloadMatches();
  }

  async function reloadFromMelee() {
    await fetch(`${API_BASE}/melee/sync`, { method: "POST" });
    reloadPlayers();
    reloadMatches();
  }

  async function toggleTimer(action: "start" | "pause") {
    await fetch(`${API_BASE}/broadcast/timer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board: activeBoard, action })
    });
    reloadBroadcastState();
  }

  async function confirmFullReset() {
    await patchMatch({ player1Life: 20, player2Life: 20, player1GameWins: 0, player2GameWins: 0 });
  }

  if (!tournament) {
    return <p>Opprett en turnering forst (Turnering-fanen).</p>;
  }

  if (!match) {
    return <p>Ingen aktiv kamp pa {activeBoard.toUpperCase()} akkurat na. Sett en kamp i Broadcast-fanen forst.</p>;
  }

  const p1 = findPlayer(match.player1_id);
  const p2 = findPlayer(match.player2_id);
  const gameNumber = match.player1_game_wins + match.player2_game_wins + 1;
  const timerSeconds = activeBoard === "bo5" ? broadcastState?.bo5Timer?.seconds : broadcastState?.bo3Timer?.seconds;

  return (
    <div>
      <h2 style={{ margin: 0 }}>Match Control - Table {match.table_number ?? "?"}</h2>
      <div style={{ opacity: 0.6, fontSize: 13, marginBottom: 20 }}>
        {(match.round_label || "Round ?")} · {match.format || "Format ?"} · Best of {match.is_bo5 ? 5 : 3} · Game {gameNumber}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
        <PlayerPanel
          side={1}
          match={match}
          playerName={p1?.name || "PLAYER 1"}
          playerRecord={activeBoardData?.player1 ? `${activeBoardData.player1.wins}-${activeBoardData.player1.losses}-${activeBoardData.player1.draws}` : "-"}
          playerDeck={`${p1?.flag_code?.toUpperCase() || ""} · ${activeBoardData?.player1?.deck || ""}`}
          onPatch={patchMatch}
          onWinGame={winGame}
        />

        <Panel title="MATCH ACTIONS">
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
            TIMER: {formatUptime(timerSeconds ?? 0)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <QuickActionButton compact label="PAUSE" onClick={() => toggleTimer("pause")} />
            <QuickActionButton compact label="RESUME" onClick={() => toggleTimer("start")} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <QuickActionButton compact label="SWAP SIDES" onClick={swapSides} />
            <QuickActionButton compact label="RELOAD PLAYERS" onClick={reloadFromMelee} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <QuickActionButton compact label="RESET LIFE" onClick={confirmFullReset} />
            <QuickActionButton compact label="RESET SCORE" onClick={() => patchMatch({ player1GameWins: 0, player2GameWins: 0 })} />
          </div>

          <div style={{ border: "1px solid var(--rose)", background: "var(--popover)", borderRadius: 10, padding: 10, marginTop: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Reset life?</div>
            <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 8 }}>This will reset life totals and match score for both players.</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={confirmFullReset} style={{ padding: "6px 12px", borderRadius: 5, border: "1px solid var(--rose)", background: "var(--popover)", color: "var(--rose)", fontWeight: 700, fontSize: 12 }}>
                RESET LIFE
              </button>
            </div>
          </div>
        </Panel>

        <PlayerPanel
          side={2}
          match={match}
          playerName={p2?.name || "PLAYER 2"}
          playerRecord={activeBoardData?.player2 ? `${activeBoardData.player2.wins}-${activeBoardData.player2.losses}-${activeBoardData.player2.draws}` : "-"}
          playerDeck={`${p2?.flag_code?.toUpperCase() || ""} · ${activeBoardData?.player2?.deck || ""}`}
          onPatch={patchMatch}
          onWinGame={winGame}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <CardShowcasePanel side={1} playerId={match.player1_id} playerName={p1?.name || "Player 1"} onPatch={patchMatch} />
        <CardShowcasePanel side={2} playerId={match.player2_id} playerName={p2?.name || "Player 2"} onPatch={patchMatch} />
      </div>
    </div>
  );
}

