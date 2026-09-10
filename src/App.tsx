import React, { useEffect, useState } from "react";

// Server-adresse og tilgangskode kommer na fra Electron sin
// hovedprosess (electron/client-config.ts) via preload-broen, IKKE
// localStorage - main.ts ma vite dette FOR den bestemmer om den skal
// starte en lokal server i det hele tatt (vert-modus) eller ikke
// (klient-modus, fjernstyrer en annen PC).
declare global {
  interface Window {
    electronAPI: {
      getConnectionConfig: () => Promise<{ remoteAddress: string; accessToken: string }>;
      saveConnectionConfig: (config: { remoteAddress: string; accessToken: string }) => Promise<void>;
      pickImageFile: () => Promise<string | null>;
      pickCssFile: () => Promise<string | null>;
      pickThemeFiles: () => Promise<{ bgImageUrl?: string; logoUrl?: string; customCss?: string } | null>;
    };
  }
}

const DEFAULT_PORT = "4848";

function resolveApiBase(rawAddress: string): string {
  const trimmed = String(rawAddress || "").trim();
  if (!trimmed) return `http://localhost:${DEFAULT_PORT}/api`;

  let address = trimmed;
  let protocol = "http";

  if (/^https:\/\//i.test(address)) {
    protocol = "https";
    address = address.replace(/^https:\/\//i, "");
  } else if (/^http:\/\//i.test(address)) {
    protocol = "http";
    address = address.replace(/^http:\/\//i, "");
  }

  address = address.replace(/\/+$/, "");

  const hasPort = /:\d+$/.test(address);
  const looksLikeLocalAddress = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(address) || /^localhost(:\d+)?$/i.test(address);

  if (!looksLikeLocalAddress && !hasPort) {
    protocol = "https";
  }

  const needsDefaultPort = looksLikeLocalAddress && !hasPort;
  return `${protocol}://${address}${needsDefaultPort ? ":" + DEFAULT_PORT : ""}/api`;
}

// Trygge standardverdier for FORSTE rendering, mens vi venter pa svar
// fra hovedprosessen (asynkront, se App() sin "ready"-sjekk under).
let API_BASE = `http://localhost:${DEFAULT_PORT}/api`;
let CURRENT_REMOTE_ADDRESS = "";
let CURRENT_ACCESS_TOKEN = "";

// Legger pa tilgangskoden automatisk pa ALLE fetch-kall - trengs kun
// nar denne installasjonen faktisk fjernstyrer en annen PC (klient-
// modus); serveren ignorerer headeren stille nar den ikke trengs.
const originalFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  if (CURRENT_ACCESS_TOKEN) {
    init = { ...(init || {}), headers: { ...((init && init.headers) || {}), "X-Access-Token": CURRENT_ACCESS_TOKEN } };
  }
  return originalFetch(input, init);
};

type Tournament = {
  id: number;
  name: string;
  format: string;
  current_round: number;
  total_rounds: number;
  phase: string;
} | null;

type Player = { id: number; name: string; flag_code: string };

type Match = {
  id: number;
  player1_id: number;
  player2_id: number;
  player1_life: number;
  player2_life: number;
  player1_game_wins: number;
  player2_game_wins: number;
  table_number: number | null;
  status: string;
  is_bo5: number;
  player1_card_showcase: string;
  player2_card_showcase: string;
  format: string;
};

function useJson<T>(url: string, deps: unknown[] = []): [T | null, () => void] {
  const [data, setData] = useState<T | null>(null);

  function reload() {
    fetch(url)
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData(null));
  }

  useEffect(reload, deps);
  return [data, reload];
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 18px",
        borderRadius: 8,
        border: "1px solid #1c2740",
        background: active ? "#e11d48" : "#111a2e",
        color: "#fff",
        fontWeight: 700,
        marginRight: 8
      }}
    >
      {children}
    </button>
  );
}

function PlayerDeckInput({ playerId, currentValue, onSave }: { playerId: number; currentValue: string; onSave: (playerId: number, archetype: string) => void }) {
  const [value, setValue] = useState(currentValue ?? "");

  useEffect(() => {
    setValue(currentValue ?? "");
  }, [currentValue]);

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onSave(playerId, value)}
      placeholder="Deck (f.eks. Boros Aggro)"
      style={{ flex: 1, padding: 4, borderRadius: 4, border: "1px solid #1c2740", background: "#0b1220", color: "#fff", fontSize: 12 }}
    />
  );
}

function RoundSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [options, reloadOptions] = useJson<{ rounds: string[] }>(`${API_BASE}/settings/rounds`, []);
  const [showManage, setShowManage] = useState(false);
  const [newRound, setNewRound] = useState("");

  const rounds = options?.rounds ?? [];

  async function saveOptions(next: string[]) {
    await fetch(`${API_BASE}/settings/rounds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rounds: next })
    });
    reloadOptions();
  }

  function addRound() {
    const trimmed = newRound.trim();
    if (!trimmed) return;
    saveOptions([...rounds, trimmed]);
    setNewRound("");
  }

  function deleteRound(index: number) {
    saveOptions(rounds.filter((_: string, i: number) => i !== index));
  }

  function moveRound(index: number, direction: number) {
    const target = index + direction;
    if (target < 0 || target >= rounds.length) return;
    const next = [...rounds];
    const tmp = next[index];
    next[index] = next[target];
    next[target] = tmp;
    saveOptions(next);
  }

  const selectStyle = { width: 160, padding: 4, borderRadius: 4, border: "1px solid #1c2740", background: "#0b1220", color: "#fff", fontSize: 12, marginRight: 6 };

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        <select style={selectStyle} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">Velg runde...</option>
          {rounds.map((r: string) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <button onClick={() => setShowManage((v) => !v)} style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #1c2740", background: "#1c2740", color: "#fff", fontSize: 11 }}>
          Adm.
        </button>
      </span>

      {showManage && (
        <div style={{ background: "#0b1220", border: "1px solid #1c2740", borderRadius: 6, padding: 8, maxWidth: 260 }}>
          {rounds.map((r: string, index: number) => (
            <div key={r + index} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, marginBottom: 4, gap: 4 }}>
              <span>{r}</span>
              <span style={{ display: "flex", gap: 2 }}>
                <button onClick={() => moveRound(index, -1)} style={{ padding: "2px 6px", borderRadius: 4, border: "1px solid #1c2740", background: "#1c2740", color: "#8ab4ff", fontSize: 11 }}>↑</button>
                <button onClick={() => moveRound(index, 1)} style={{ padding: "2px 6px", borderRadius: 4, border: "1px solid #1c2740", background: "#1c2740", color: "#8ab4ff", fontSize: 11 }}>↓</button>
                <button onClick={() => deleteRound(index)} style={{ padding: "2px 6px", borderRadius: 4, border: "1px solid #7a1c2e", background: "#3a1420", color: "#ff6b8a", fontSize: 11 }}>✕</button>
              </span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            <input
              value={newRound}
              onChange={(e) => setNewRound(e.target.value)}
              placeholder="Nytt valg"
              style={{ flex: 1, padding: 4, borderRadius: 4, border: "1px solid #1c2740", background: "#111a2e", color: "#fff", fontSize: 12 }}
            />
            <button onClick={addRound} style={{ padding: "4px 8px", borderRadius: 4, border: "none", background: "#e11d48", color: "#fff", fontSize: 11 }}>
              Legg til
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

function TournamentTab() {
  const [tournament, reloadTournament] = useJson<Tournament>(`${API_BASE}/tournament`, []);
  const [players, reloadPlayers] = useJson<{ id: number; name: string; flag_code: string; current_deck: string }[]>(
    tournament ? `${API_BASE}/players?tournamentId=${tournament.id}` : `${API_BASE}/players`,
    [tournament?.id]
  );

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
  const [meleeSettings] = useJson<{ enabled: boolean }>(`${API_BASE}/settings/melee`, []);
  const meleeSyncEnabled = meleeSettings?.enabled !== false;

  useEffect(() => {
    if (tournament) {
      setEditName(tournament.name);
      setEditFormat(tournament.format);
      setEditTotalRounds(tournament.total_rounds);
    }
  }, [tournament]);

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

  async function deletePlayer(playerId: number, playerName: string) {
    if (!window.confirm(`Slette "${playerName}"?`)) return;
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
      window.alert(data?.error || "Klarte ikke sette runde på kampene.");
      return;
    }
    window.alert(`Oppdaterte ${data?.updated ?? 0} pågående kamp(er) til "${bulkRound}".`);
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
  }

  const inputStyle = { width: "100%", padding: 8, marginBottom: 8, borderRadius: 6, border: "1px solid #1c2740", background: "#0b1220", color: "#fff" };

  return (
    <div>
      <h2>Turnering</h2>

      {tournament ? (
        <>
          <div style={{ background: "#111a2e", padding: 16, borderRadius: 10, maxWidth: 420, marginBottom: 20 }}>
            <p style={{ marginTop: 0, opacity: 0.7, fontSize: 13 }}>
              Rediger turneringen (for lokal/privat bruk uten Melee - juster fritt):
            </p>
            <input style={inputStyle} value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Turneringsnavn" />
            <input style={inputStyle} value={editFormat} onChange={(e) => setEditFormat(e.target.value)} placeholder="Format" />
            <input
              style={inputStyle}
              type="number"
              value={editTotalRounds}
              onChange={(e) => setEditTotalRounds(Number(e.target.value))}
              placeholder="Antall runder"
            />
            <button onClick={saveTournamentEdit} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "#e11d48", color: "#fff", fontWeight: 700, marginRight: 8 }}>
              Lagre endringer
            </button>
            <button onClick={deleteTournament} style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid #7a1c2e", background: "#3a1420", color: "#ff8080", fontWeight: 700 }}>
              Slett turnering
            </button>
          </div>

          <div style={{ background: "#111a2e", padding: 16, borderRadius: 10, maxWidth: 420, marginBottom: 20 }}>
            <h3 style={{ marginTop: 0 }}>Legg til spiller (lokalt, uten Melee)</h3>
            <input style={inputStyle} value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} placeholder="Spillernavn" />
            <button onClick={addPlayer} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "#1c2740", color: "#fff", fontWeight: 700 }}>
              Legg til
            </button>

            {(players ?? []).length > 0 && (
              <div style={{ marginTop: 12 }}>
                {(players ?? []).map((p: any) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, opacity: 0.9, marginBottom: 6, gap: 6 }}>
                    <span style={{ minWidth: 110 }}>{p.name} · {p.wins ?? 0}-{p.losses ?? 0}-{p.draws ?? 0}</span>
                    <PlayerDeckInput playerId={p.id} currentValue={p.current_deck} onSave={setPlayerDeck} />
                    <button
                      onClick={() => deletePlayer(p.id, p.name)}
                      style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid #7a1c2e", background: "#3a1420", color: "#ff8080", fontSize: 11 }}
                    >
                      Slett
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: "#111a2e", padding: 16, borderRadius: 10, maxWidth: 420 }}>
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
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: "#fff", fontSize: 13 }}>
              <input type="checkbox" checked={isBo5} onChange={(e) => setIsBo5(e.target.checked)} />
              Best-of-5
            </label>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Runde (vises på overlay)</div>
              <RoundSelect value={newMatchRound} onChange={setNewMatchRound} />
            </div>
            <button onClick={createMatch} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "#e11d48", color: "#fff", fontWeight: 700 }}>
              Opprett kamp
            </button>
          </div>

          <div style={{ background: "#111a2e", padding: 16, borderRadius: 10, maxWidth: 420, marginTop: 20 }}>
            <h3 style={{ marginTop: 0 }}>Gå videre til runde</h3>
            {meleeSyncEnabled ? (
              <p style={{ fontSize: 13, color: "#ff8080" }}>
                Auto-sync mot Melee er PÅ - denne kontrollen er kun for lokalt kjørte turneringer. Slå av auto-sync under Melee-fanen for å bruke den.
              </p>
            ) : (
              <p style={{ fontSize: 13, opacity: 0.7 }}>Setter valgt runde på ALLE pågående kamper med én gang.</p>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <RoundSelect value={bulkRound} onChange={setBulkRound} />
              <button
                onClick={applyBulkRound}
                disabled={meleeSyncEnabled}
                style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "#e11d48", color: "#fff", fontWeight: 700, opacity: meleeSyncEnabled ? 0.4 : 1, cursor: meleeSyncEnabled ? "not-allowed" : "pointer" }}
              >
                Sett på alle pågående kamper
              </button>
            </div>
          </div>

          <div style={{ background: "#111a2e", padding: 16, borderRadius: 10, maxWidth: 420, marginTop: 20 }}>
            <h3 style={{ marginTop: 0 }}>Generer nye pairings</h3>
            {meleeSyncEnabled ? (
              <p style={{ fontSize: 13, color: "#ff8080" }}>Auto-sync mot Melee er PÅ - slå av for å generere pairings lokalt.</p>
            ) : (
              <p style={{ fontSize: 13, opacity: 0.7 }}>Rangerer etter W-L, unngår rematcher der mulig, gir bye ved oddetall.</p>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <RoundSelect value={pairRound} onChange={setPairRound} />
              <button
                onClick={generatePairings}
                disabled={meleeSyncEnabled}
                style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "#e11d48", color: "#fff", fontWeight: 700, opacity: meleeSyncEnabled ? 0.4 : 1, cursor: meleeSyncEnabled ? "not-allowed" : "pointer" }}
              >
                Generer pairings
              </button>
            </div>
          </div>
        </>
      ) : (
        <div style={{ background: "#111a2e", padding: 16, borderRadius: 10, maxWidth: 420 }}>
          <p style={{ marginTop: 0 }}>Ingen aktiv turnering enna. Opprett en:</p>
          <input
            placeholder="Turneringsnavn"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
          <input
            placeholder="Format (f.eks. Modern)"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            style={inputStyle}
          />
          <input
            type="number"
            placeholder="Antall runder"
            value={totalRounds}
            onChange={(e) => setTotalRounds(Number(e.target.value))}
            style={inputStyle}
          />
          <button onClick={createTournament} style={{ padding: "10px 16px", borderRadius: 6, border: "none", background: "#e11d48", color: "#fff", fontWeight: 700 }}>
            Opprett turnering
          </button>
        </div>
      )}
    </div>
  );
}

function FormatEditor({ matchId, currentValue, reloadMatches }: { matchId: number; currentValue: string; reloadMatches: () => void }) {
  const [value, setValue] = useState(currentValue ?? "");

  useEffect(() => {
    setValue(currentValue ?? "");
  }, [currentValue]);

  async function save() {
    await fetch(`${API_BASE}/matches/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: value })
    });
    reloadMatches();
  }

  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Format (f.eks. Modern)"
        style={{ width: 130, padding: 4, borderRadius: 4, border: "1px solid #1c2740", background: "#0b1220", color: "#fff", fontSize: 12 }}
      />
      <button onClick={save} style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #1c2740", background: "#1c2740", color: "#fff", fontSize: 12 }}>
        Sett
      </button>
    </span>
  );
}

function CardShowcaseEditor({
  matchId,
  currentValue,
  player,
  reloadMatches
}: {
  matchId: number;
  currentValue: string;
  player: 1 | 2;
  reloadMatches: () => void;
}) {
  const [value, setValue] = useState(currentValue ?? "");

  useEffect(() => {
    setValue(currentValue ?? "");
  }, [currentValue]);

  async function save() {
    const field = player === 1 ? "player1CardShowcase" : "player2CardShowcase";
    await fetch(`${API_BASE}/matches/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value })
    });
    reloadMatches();
  }

  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", marginLeft: 8 }}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Kort a vise (f.eks. Lightning Bolt)"
        style={{ width: 200, padding: 4, borderRadius: 4, border: "1px solid #1c2740", background: "#0b1220", color: "#fff", fontSize: 12 }}
      />
      <button onClick={save} style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #1c2740", background: "#1c2740", color: "#fff", fontSize: 12 }}>
        Vis kort
      </button>
    </span>
  );
}

function FlagEditor({ player, reloadPlayers }: { player: Player | undefined; reloadPlayers: () => void }) {
  const [value, setValue] = useState(player?.flag_code ?? "");

  useEffect(() => {
    setValue(player?.flag_code ?? "");
  }, [player?.flag_code]);

  async function save() {
    if (!player) return;
    await fetch(`${API_BASE}/players/${player.id}/flag`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flag: value })
    });
    reloadPlayers();
  }

  if (!player) return null;

  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", marginLeft: 8 }}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Flagg (f.eks. no / Norge)"
        style={{ width: 130, padding: 4, borderRadius: 4, border: "1px solid #1c2740", background: "#0b1220", color: "#fff", fontSize: 12 }}
      />
      <button onClick={save} style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #1c2740", background: "#1c2740", color: "#fff", fontSize: 12 }}>
        Sett
      </button>
    </span>
  );
}

function MatchControlTab() {
  const [tournament] = useJson<Tournament>(`${API_BASE}/tournament`, []);
  const [players, reloadPlayers] = useJson<Player[]>(
    tournament ? `${API_BASE}/players?tournamentId=${tournament.id}` : `${API_BASE}/players`,
    [tournament?.id]
  );
  const [matches, reloadMatches] = useJson<Match[]>(
    tournament ? `${API_BASE}/matches?tournamentId=${tournament.id}` : `${API_BASE}/matches`,
    [tournament?.id]
  );

  async function patchMatch(id: number, fields: Record<string, unknown>) {
    await fetch(`${API_BASE}/matches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields)
    });
    reloadMatches();
  }

  async function resetLife(id: number) {
    await patchMatch(id, { player1Life: 20, player2Life: 20 });
  }

  async function resetScore(id: number) {
    await patchMatch(id, { player1GameWins: 0, player2GameWins: 0 });
  }

  async function winGame(id: number, player: 1 | 2) {
    await fetch(`${API_BASE}/matches/${id}/win-game`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player })
    });
    reloadMatches();
  }

  function playerName(id: number) {
    return players?.find((p) => p.id === id)?.name ?? "?";
  }

  function findPlayer(id: number) {
    return players?.find((p) => p.id === id);
  }

  if (!tournament) {
    return <p>Opprett en turnering forst (Turnering-fanen).</p>;
  }

  return (
    <div>
      <h2>Kampkontroll</h2>
      {(matches ?? []).length === 0 && <p>Ingen kamper registrert enna.</p>}
      {(matches ?? []).map((m) => (
        <div key={m.id} style={{ background: "#111a2e", padding: 16, borderRadius: 10, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <b>{playerName(m.player1_id)}</b>
                <FlagEditor player={findPlayer(m.player1_id)} reloadPlayers={reloadPlayers} />
                <CardShowcaseEditor matchId={m.id} currentValue={m.player1_card_showcase} player={1} reloadMatches={reloadMatches} />
              </div>
              <div style={{ display: "flex", alignItems: "center", marginTop: 4 }}>
                <b>{playerName(m.player2_id)}</b>
                <FlagEditor player={findPlayer(m.player2_id)} reloadPlayers={reloadPlayers} />
                <CardShowcaseEditor matchId={m.id} currentValue={m.player2_card_showcase} player={2} reloadMatches={reloadMatches} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>{m.is_bo5 ? "BO5" : "BO3"} - bord {m.table_number ?? "?"}</span>
              <FormatEditor matchId={m.id} currentValue={m.format} reloadMatches={reloadMatches} />
              <RoundSelect
                value={(m as any).round_label ?? ""}
                onChange={(v) =>
                  fetch(`${API_BASE}/matches/${m.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ roundLabel: v })
                  }).then(reloadMatches)
                }
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
            <div>
              <div>Liv P1: {m.player1_life}</div>
              <button onClick={() => patchMatch(m.id, { player1Life: m.player1_life - 1 })}>-1</button>
              <button onClick={() => patchMatch(m.id, { player1Life: m.player1_life + 1 })}>+1</button>
            </div>
            <div>
              <div>Liv P2: {m.player2_life}</div>
              <button onClick={() => patchMatch(m.id, { player2Life: m.player2_life - 1 })}>-1</button>
              <button onClick={() => patchMatch(m.id, { player2Life: m.player2_life + 1 })}>+1</button>
            </div>
            <div>
              <div>Game-score: {m.player1_game_wins} - {m.player2_game_wins}</div>
              <button onClick={() => winGame(m.id, 1)}>P1 vinner spill</button>
              <button onClick={() => winGame(m.id, 2)}>P2 vinner spill</button>
            </div>
            <button
              onClick={() => resetLife(m.id)}
              style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid #1c2740", background: "#333", color: "#fff", fontWeight: 700 }}
            >
              Nullstill liv
            </button>
            <button
              onClick={() => resetScore(m.id)}
              style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid #1c2740", background: "#333", color: "#fff", fontWeight: 700 }}
            >
              Nullstill score
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function BroadcastControlTab() {
  const [matches] = useJson<Match[]>(`${API_BASE}/matches`, []);
  const [broadcastState, reloadBroadcastState] = useJson<{ scene: string }>(`${API_BASE}/broadcast/state`, []);
  const [obsStatus, reloadObsStatus] = useJson<{
    connected: boolean;
    lastError: string;
    host: string;
    port: string;
    scenes: string[];
    sceneNameOverrides: Record<string, string>;
  }>(`${API_BASE}/settings/obs`, []);

  const [sceneNameInputs, setSceneNameInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (obsStatus?.sceneNameOverrides) setSceneNameInputs(obsStatus.sceneNameOverrides);
  }, [obsStatus?.sceneNameOverrides]);

  async function saveSceneName(sceneKey: string) {
    await fetch(`${API_BASE}/settings/obs/scene-name`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneKey, obsSceneName: sceneNameInputs[sceneKey] ?? "" })
    });
    reloadObsStatus();
  }

  const [obsHost, setObsHost] = useState("localhost");
  const [obsPort, setObsPort] = useState("4455");
  const [obsPassword, setObsPassword] = useState("");
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (obsStatus?.host) setObsHost(obsStatus.host);
    if (obsStatus?.port) setObsPort(obsStatus.port);
  }, [obsStatus?.host, obsStatus?.port]);

  async function setScene(scene: string) {
    await fetch(`${API_BASE}/broadcast/scene`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene })
    });
    reloadBroadcastState();
  }

  async function setMatch(board: "bo3" | "bo5", matchId: number) {
    await fetch(`${API_BASE}/broadcast/set-match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board, matchId })
    });
  }

  async function timerAction(board: "bo3" | "bo5", action: "start" | "pause" | "reset", seconds?: number) {
    await fetch(`${API_BASE}/broadcast/timer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board, action, seconds })
    });
  }

  async function saveObsSettings() {
    await fetch(`${API_BASE}/settings/obs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: obsHost, port: obsPort, password: obsPassword })
    });
    setObsPassword("");
    reloadObsStatus();
  }

  async function connectToObs() {
    setConnecting(true);
    await saveObsSettings();
    await fetch(`${API_BASE}/settings/obs/connect`, { method: "POST" });
    setConnecting(false);
    reloadObsStatus();
  }

  const scenes = ["bo3", "bo5", "meta", "top16", "bracket", "casterdesk", "starting"];
  const inputStyle = { padding: 6, borderRadius: 6, border: "1px solid #1c2740", background: "#0b1220", color: "#fff", marginRight: 8 };

  return (
    <div>
      <h2>Broadcast-kontroll</h2>

      <div style={{ background: "#111a2e", padding: 16, borderRadius: 10, maxWidth: 560, marginBottom: 20 }}>
        <div style={{ marginBottom: 8, fontWeight: 700 }}>
          OBS-tilkobling: {obsStatus?.connected ? <span style={{ color: "#8fe3a0" }}>Tilkoblet</span> : <span style={{ color: "#ff8080" }}>Ikke tilkoblet</span>}
        </div>
        {obsStatus?.lastError && !obsStatus?.connected && (
          <div style={{ color: "#ff8080", fontSize: 12, marginBottom: 8 }}>{obsStatus.lastError}</div>
        )}
        <div style={{ marginBottom: 8, opacity: 0.7, fontSize: 12 }}>
          Skru pa i OBS: Verktoy → WebSocket Server Settings → Enable WebSocket server. Noter port og passord.
        </div>
        <input style={{ ...inputStyle, width: 140 }} value={obsHost} onChange={(e) => setObsHost(e.target.value)} placeholder="Vert (localhost)" />
        <input style={{ ...inputStyle, width: 80 }} value={obsPort} onChange={(e) => setObsPort(e.target.value)} placeholder="Port (4455)" />
        <input style={{ ...inputStyle, width: 140 }} type="password" value={obsPassword} onChange={(e) => setObsPassword(e.target.value)} placeholder="Passord" />
        <button onClick={connectToObs} disabled={connecting} style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#e11d48", color: "#fff", fontWeight: 700 }}>
          {connecting ? "Kobler..." : "Koble til OBS"}
        </button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ marginBottom: 6 }}>
          Aktiv scene: {obsStatus?.connected ? "" : <span style={{ opacity: 0.6, fontSize: 12 }}>(koble til OBS over for at knappene faktisk bytter LIVE-scenen)</span>}
        </div>
        {scenes.map((s) => (
          <TabButton key={s} active={broadcastState?.scene === s} onClick={() => setScene(s)}>{s}</TabButton>
        ))}

        <div style={{ marginTop: 12, background: "#111a2e", padding: 12, borderRadius: 10, maxWidth: 480 }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
            Har OBS-scenene dine et annet navn enn knappene over? Sett riktig OBS-scenenavn per knapp her - trenger ikke matche eksakt lenger.
          </div>
          {scenes.map((s) => (
            <div key={s} style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
              <span style={{ width: 90, fontSize: 12, opacity: 0.8 }}>{s}</span>
              <input
                value={sceneNameInputs[s] ?? ""}
                onChange={(e) => setSceneNameInputs((f) => ({ ...f, [s]: e.target.value }))}
                placeholder={`OBS-scenenavn (default: "${s}")`}
                style={{ flex: 1, padding: 4, borderRadius: 4, border: "1px solid #1c2740", background: "#0b1220", color: "#fff", fontSize: 12, marginRight: 6 }}
              />
              <button onClick={() => saveSceneName(s)} style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid #1c2740", background: "#1c2740", color: "#fff", fontSize: 12 }}>
                Lagre
              </button>
            </div>
          ))}
        </div>

        {obsStatus?.scenes && obsStatus.scenes.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
            OBS-scener funnet: {obsStatus.scenes.join(", ")}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ marginBottom: 6 }}>Klokke:</div>
        {(["bo3", "bo5"] as const).map((board) => (
          <div key={board} style={{ marginBottom: 8 }}>
            <span style={{ marginRight: 8, textTransform: "uppercase", fontWeight: 700 }}>{board}</span>
            <button onClick={() => timerAction(board, "start")} style={{ marginRight: 6 }}>Start</button>
            <button onClick={() => timerAction(board, "pause")} style={{ marginRight: 6 }}>Pause</button>
            <button onClick={() => timerAction(board, "reset", 3000)}>Nullstill (50:00)</button>
          </div>
        ))}
      </div>

      <div>
        <div style={{ marginBottom: 6 }}>Sett kamp pa BO3/BO5:</div>
        {(matches ?? []).map((m) => (
          <div key={m.id} style={{ marginBottom: 6 }}>
            <span style={{ marginRight: 8 }}>Kamp #{m.id} (bord {m.table_number ?? "?"})</span>
            <button onClick={() => setMatch("bo3", m.id)} style={{ marginRight: 6 }}>Vis pa BO3</button>
            <button onClick={() => setMatch("bo5", m.id)}>Vis pa BO5</button>
          </div>
        ))}
      </div>

      <p style={{ marginTop: 20, opacity: 0.7 }}>
        OBS Browser Source-URLer: <code>http://localhost:4848/overlay/BO3.html</code>, <code>.../BO5.html</code>, <code>.../Top_16.html</code>, <code>.../Top_8_Bracket.html</code>, <code>.../Meta_Breakdown.html</code>
      </p>
    </div>
  );
}

function MetaKeycardsSection() {
  const [meta] = useJson<{ rows: { archetype: string; count: string; share: string }[] }>(`${API_BASE}/scenes/meta`, []);
  const [overrides, reloadOverrides] = useJson<{ archetype_key: string; archetype_label: string; key_card_1: string; key_card_2: string }[]>(
    `${API_BASE}/meta-keycards`,
    []
  );
  const [inputs, setInputs] = useState<Record<string, { keyCard1: string; keyCard2: string }>>({});

  function normalizeKey(name: string) {
    return String(name || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  useEffect(() => {
    if (!overrides) return;
    const next: Record<string, { keyCard1: string; keyCard2: string }> = {};
    overrides.forEach((o) => {
      next[o.archetype_key] = { keyCard1: o.key_card_1, keyCard2: o.key_card_2 };
    });
    setInputs((prev) => ({ ...next, ...prev }));
  }, [overrides]);

  async function saveKeycards(archetype: string) {
    const key = normalizeKey(archetype);
    const values = inputs[key] ?? { keyCard1: "", keyCard2: "" };
    await fetch(`${API_BASE}/meta-keycards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archetype, keyCard1: values.keyCard1, keyCard2: values.keyCard2 })
    });
    reloadOverrides();
  }

  const inputStyle = { width: 160, padding: 4, borderRadius: 4, border: "1px solid #1c2740", background: "#0b1220", color: "#fff", fontSize: 12, marginRight: 6 };

  return (
    <div style={{ marginTop: 20 }}>
      <h3>Nokkelkort per arketype (meta breakdown)</h3>
      <div style={{ background: "#111a2e", padding: 12, borderRadius: 10 }}>
        {(!meta?.rows || meta.rows.length === 0) && <div style={{ opacity: 0.6 }}>Ingen arketyper funnet enna - synk Melee forst.</div>}
        {(meta?.rows ?? []).map((row) => {
          const key = normalizeKey(row.archetype);
          const values = inputs[key] ?? { keyCard1: "", keyCard2: "" };
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
              <span style={{ width: 200, fontSize: 13 }}>{row.archetype}</span>
              <input
                value={values.keyCard1}
                onChange={(e) => setInputs((f) => ({ ...f, [key]: { ...values, keyCard1: e.target.value } }))}
                placeholder="Nokkelkort 1"
                style={inputStyle}
              />
              <input
                value={values.keyCard2}
                onChange={(e) => setInputs((f) => ({ ...f, [key]: { ...values, keyCard2: e.target.value } }))}
                placeholder="Nokkelkort 2"
                style={inputStyle}
              />
              <button onClick={() => saveKeycards(row.archetype)} style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid #1c2740", background: "#1c2740", color: "#fff", fontSize: 12 }}>
                Lagre
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MeleeSettingsTab() {
  const [settings, reloadSettings] = useJson<{ hasClientId: boolean; hasClientSecret: boolean; tournamentId: string; enabled: boolean }>(
    `${API_BASE}/settings/melee`,
    []
  );
  const [log, reloadLog] = useJson<{ id: number; ran_at: string; ok: number; message: string }[]>(`${API_BASE}/melee/log`, []);

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [tournamentId, setTournamentId] = useState("");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (settings) {
      setTournamentId(settings.tournamentId || "");
    }
  }, [settings]);

  async function saveSettings() {
    await fetch(`${API_BASE}/settings/melee`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: clientId || undefined,       // ikke overskriv med tomt hvis feltet star urort
        clientSecret: clientSecret || undefined, // ikke overskriv med tomt hvis feltet star urort
        tournamentId
      })
    });
    setClientId("");
    setClientSecret("");
    reloadSettings();
  }

  async function toggleEnabled() {
    await fetch(`${API_BASE}/settings/melee`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !settings?.enabled })
    });
    reloadSettings();
  }

  async function syncNow() {
    setSyncing(true);
    await fetch(`${API_BASE}/melee/sync`, { method: "POST" });
    setSyncing(false);
    reloadLog();
  }

  const inputStyle = { width: "100%", padding: 8, marginBottom: 8, borderRadius: 6, border: "1px solid #1c2740", background: "#0b1220", color: "#fff" };

  return (
    <div>
      <h2>Melee-innstillinger</h2>

      <div style={{ background: "#111a2e", padding: 16, borderRadius: 10, maxWidth: 480, marginBottom: 20 }}>
        <label>Melee Client ID {settings?.hasClientId && <span style={{ opacity: 0.6 }}>(allerede lagret - la sta tom for a beholde)</span>}</label>
        <input style={inputStyle} type="password" value={clientId} onChange={(e) => setClientId(e.target.value)} />

        <label>Melee Client Secret {settings?.hasClientSecret && <span style={{ opacity: 0.6 }}>(allerede lagret - la sta tom for a beholde)</span>}</label>
        <input style={inputStyle} type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />

        <label>Melee turnerings-ID</label>
        <input style={inputStyle} value={tournamentId} onChange={(e) => setTournamentId(e.target.value)} placeholder="f.eks. 448021" />

        <button onClick={saveSettings} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "#e11d48", color: "#fff", fontWeight: 700, marginRight: 8 }}>
          Lagre
        </button>

        <button onClick={toggleEnabled} style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid #1c2740", background: settings?.enabled ? "#1c2740" : "#333", color: "#fff" }}>
          Melee-sync: {settings?.enabled ? "PA" : "AV"}
        </button>
      </div>

      <button onClick={syncNow} disabled={syncing} style={{ padding: "10px 16px", borderRadius: 6, border: "none", background: "#1c2740", color: "#fff", fontWeight: 700, marginBottom: 16 }}>
        {syncing ? "Synker..." : "Synk na"}
      </button>

      <h3>Siste synk-forsok</h3>
      <div style={{ background: "#111a2e", padding: 12, borderRadius: 10, maxHeight: 300, overflowY: "auto" }}>
        {(log ?? []).length === 0 && <div style={{ opacity: 0.6 }}>Ingen synk enna.</div>}
        {(log ?? []).map((entry) => (
          <div key={entry.id} style={{ padding: "6px 0", borderBottom: "1px solid #1c2740", color: entry.ok ? "#8fe3a0" : "#ff8080" }}>
            <span style={{ opacity: 0.6, marginRight: 8 }}>{entry.ran_at}</span>
            {entry.message}
          </div>
        ))}
      </div>

      <MetaKeycardsSection />
    </div>
  );
}

function StreamContentTab() {
  const [content, reloadContent] = useJson<Record<string, string>>(`${API_BASE}/settings/stream-content`, []);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    if (content) setFields(content);
  }, [content]);

  function setField(key: string, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    await fetch(`${API_BASE}/settings/stream-content`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields)
    });
    reloadContent();
  }

  const inputStyle = { width: "100%", padding: 8, marginBottom: 8, borderRadius: 6, border: "1px solid #1c2740", background: "#0b1220", color: "#fff" };

  const groups: [string, string][] = [
    ["caster1Name", "Caster 1 - fornavn"],
    ["caster1LastName", "Caster 1 - etternavn"],
    ["caster1Tag", "Caster 1 - tag/kanal"],
    ["caster2Name", "Caster 2 - fornavn"],
    ["caster2LastName", "Caster 2 - etternavn"],
    ["caster2Tag", "Caster 2 - tag/kanal"],
    ["sponsorSlot", "Sponsor-tekst"],
    ["tickerText", "Rullende tekst (ticker)"],
    ["brollLabel", "B-roll-etikett"],
    ["logoYear", "Logo - ar"],
    ["logoName", "Logo - navn"],
    ["cornerNumber", "Hjorne-nummer"]
  ];

  return (
    <div>
      <h2>Stream-innhold</h2>
      <div style={{ background: "#111a2e", padding: 16, borderRadius: 10, maxWidth: 480 }}>
        {groups.map(([key, label]) => (
          <div key={key}>
            <label style={{ fontSize: 12, opacity: 0.8 }}>{label}</label>
            <input style={inputStyle} value={fields[key] ?? ""} onChange={(e) => setField(key, e.target.value)} />
          </div>
        ))}
        <button onClick={save} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "#e11d48", color: "#fff", fontWeight: 700 }}>
          Lagre
        </button>
      </div>
    </div>
  );
}

function ThemeTab() {
  const [themesList, reloadThemesList] = useJson<{ names: string[]; activeName: string }>(`${API_BASE}/themes`, []);
  const [activeTheme] = useJson<{ hiddenLogoScenes?: string[] }>(`${API_BASE}/themes/active`, []);
  const [bgImageUrl, setBgImageUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [customCss, setCustomCss] = useState("");
  const [customCssFileName, setCustomCssFileName] = useState("");
  const [themeName, setThemeName] = useState("");
  const [hiddenLogoScenes, setHiddenLogoScenes] = useState<string[]>([]);
  const [scenesLoaded, setScenesLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);

  useEffect(() => {
    if (activeTheme && !scenesLoaded) {
      setHiddenLogoScenes(Array.isArray(activeTheme.hiddenLogoScenes) ? activeTheme.hiddenLogoScenes : []);
      setScenesLoaded(true);
    }
  }, [activeTheme, scenesLoaded]);

  const LOGO_SCENES: { key: string; label: string }[] = [
    { key: "bo3", label: "BO3 (kampsiden)" },
    { key: "bo5", label: "BO5 (kampsiden)" },
    { key: "meta", label: "Meta breakdown" },
    { key: "top16", label: "Top 16" },
    { key: "bracket", label: "Top 8-brakett" },
    { key: "casterdesk", label: "Casters Desk" },
    { key: "starting", label: "Stream Starting Widget" }
  ];

  function toggleLogoScene(key: string) {
    setHiddenLogoScenes((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function saveAsNewTheme() {
    const name = themeName.trim();
    if (!name) {
      window.alert("Skriv inn et navn pa temaet forst (f.eks. NM).");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/themes/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, bgImageUrl, logoUrl, customCss, hiddenLogoScenes })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || `Kunne ikke lagre tema (feil ${res.status}).`);
        return;
      }
      reloadThemesList();
      window.alert(`Tema "${name}" lagret og aktivert - overlayene oppdaterer seg innen noen sekunder.`);
    } catch (err) {
      window.alert("Kunne ikke na serveren - sjekk at appen kjorer.");
    } finally {
      setSaving(false);
    }
  }

  async function clearLogoNow() {
    const activeName = themesList?.activeName;
    if (!activeName) {
      window.alert("Ingen aktivt tema a fjerne logo fra.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/themes/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: activeName, clearLogo: true })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || `Kunne ikke fjerne logo (feil ${res.status}).`);
        return;
      }
      setLogoUrl("");
      window.alert("Logo fjernet fra det aktive temaet.");
    } catch (err) {
      window.alert("Kunne ikke na serveren - sjekk at appen kjorer.");
    }
  }

  async function activateTheme(name: string) {
    setActivating(name);
    try {
      const res = await fetch(`${API_BASE}/themes/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || `Kunne ikke bytte tema (feil ${res.status}).`);
        return;
      }
      reloadThemesList();
    } catch (err) {
      window.alert("Kunne ikke na serveren - sjekk at appen kjorer.");
    } finally {
      setActivating(null);
    }
  }

  async function pickBgImage() {
    const dataUri = await window.electronAPI.pickImageFile();
    if (dataUri) setBgImageUrl(dataUri);
  }

  async function pickLogo() {
    const dataUri = await window.electronAPI.pickImageFile();
    if (dataUri) setLogoUrl(dataUri);
  }

  async function pickCss() {
    const cssText = await window.electronAPI.pickCssFile();
    if (cssText != null) {
      setCustomCss(cssText);
      setCustomCssFileName("Fil valgt (" + cssText.length + " tegn)");
    }
  }

  async function pickThemeFiles() {
    const result = await window.electronAPI.pickThemeFiles();
    if (!result) return;
    if (result.bgImageUrl) setBgImageUrl(result.bgImageUrl);
    if (result.logoUrl) setLogoUrl(result.logoUrl);
    if (result.customCss != null) {
      setCustomCss(result.customCss);
      setCustomCssFileName("Fil valgt (" + result.customCss.length + " tegn)");
    }
  }

  const inputStyle = { width: "100%", padding: 8, borderRadius: 6, border: "1px solid #1c2740", background: "#0b1220", color: "#fff", marginBottom: 10 };
  const pickerRowStyle = { display: "flex", gap: 8, marginBottom: 10 };
  const pickBtnStyle = { padding: "0 14px", borderRadius: 6, border: "1px solid #1c2740", background: "#1c2740", color: "#fff", whiteSpace: "nowrap" as const };

  return (
    <div style={{ background: "#111a2e", padding: 16, borderRadius: 10, maxWidth: 560 }}>
      <h3 style={{ marginTop: 0 }}>Tema</h3>
      <p style={{ fontSize: 13, opacity: 0.7 }}>
        Et tema er en navngitt samling av bakgrunn/logo/CSS lagret som ekte filer i overlay-mappen.
        Endringer vises live på overlayene i OBS innen noen sekunder, ingen restart nødvendig.
      </p>

      {(themesList?.names?.length ?? 0) > 0 && (
        <>
          <label style={{ fontSize: 12, opacity: 0.7 }}>Lagrede temaer</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            {themesList!.names.map((name) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, opacity: name === themesList!.activeName ? 1 : 0.7, fontWeight: name === themesList!.activeName ? 700 : 400 }}>
                  {name} {name === themesList!.activeName ? "(aktiv)" : ""}
                </span>
                <button
                  onClick={() => activateTheme(name)}
                  disabled={activating === name || name === themesList!.activeName}
                  style={pickBtnStyle}
                >
                  {activating === name ? "Bytter..." : "Bruk dette temaet"}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <p style={{ fontSize: 13, opacity: 0.85, marginBottom: 6 }}>
        Velg flere filer på én gang (bakgrunn, logo, CSS) - de sorteres automatisk: filer med «logo» i navnet blir logo, .css-filer blir egendefinert stil, alt annet bilde blir bakgrunn.
      </p>
      <button onClick={pickThemeFiles} style={{ ...pickBtnStyle, padding: "10px 16px", marginBottom: 16 }}>
        Velg filer...
      </button>

      <label style={{ fontSize: 12, opacity: 0.7 }}>Bakgrunnsbilde</label>
      <div style={pickerRowStyle}>
        <input value={bgImageUrl && bgImageUrl.startsWith("data:") ? "(valgt fil)" : bgImageUrl} readOnly style={{ ...inputStyle, marginBottom: 0, flex: 1, opacity: 0.7 }} />
        <button onClick={pickBgImage} style={pickBtnStyle}>Velg fil...</button>
      </div>

      <label style={{ fontSize: 12, opacity: 0.7 }}>Logo/vannmerke</label>
      <div style={pickerRowStyle}>
        <input value={logoUrl && logoUrl.startsWith("data:") ? "(valgt fil)" : logoUrl} readOnly style={{ ...inputStyle, marginBottom: 0, flex: 1, opacity: 0.7 }} />
        <button onClick={pickLogo} style={pickBtnStyle}>Velg fil...</button>
        <button onClick={clearLogoNow} style={{ ...pickBtnStyle, background: "#3a1c1c" }}>Fjern logo</button>
      </div>

      <label style={{ fontSize: 12, opacity: 0.7 }}>Egendefinert CSS (last opp din egen style.css-fil for helt eget design)</label>
      <div style={pickerRowStyle}>
        <input value={customCssFileName || (customCss ? `Lagret CSS (${customCss.length} tegn)` : "")} readOnly style={{ ...inputStyle, marginBottom: 0, flex: 1, opacity: 0.7 }} />
        <button onClick={pickCss} style={pickBtnStyle}>Velg fil...</button>
      </div>

      <label style={{ fontSize: 12, opacity: 0.7 }}>Skjul logo på disse scenene</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
        {LOGO_SCENES.map(({ key, label }) => (
          <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={hiddenLogoScenes.includes(key)}
              onChange={() => toggleLogoScene(key)}
            />
            {label}
          </label>
        ))}
      </div>

      <label style={{ fontSize: 12, opacity: 0.7 }}>Navn på tema (f.eks. NM)</label>
      <input
        value={themeName}
        onChange={(e) => setThemeName(e.target.value)}
        placeholder="NM"
        style={inputStyle}
      />

      <button onClick={saveAsNewTheme} disabled={saving} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "#e11d48", color: "#fff", fontWeight: 700 }}>
        {saving ? "Lagrer..." : "Lagre som nytt tema"}
      </button>
    </div>
  );
}

function AccessTab() {
  const [tokens, reloadTokens] = useJson<any[]>(`${API_BASE}/access-tokens`, []);
  const [label, setLabel] = useState("");
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [connAddress, setConnAddress] = useState(CURRENT_REMOTE_ADDRESS);
  const [connToken, setConnToken] = useState(CURRENT_ACCESS_TOKEN);

  async function saveConnection() {
    await window.electronAPI.saveConnectionConfig({ remoteAddress: connAddress, accessToken: connToken });
    // Appen restarter seg selv fra hovedprosessen etter dette - ingen
    // videre handling trengs her.
  }

  async function createToken() {
    const res = await fetch(`${API_BASE}/access-tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label })
    });
    const data = await res.json();
    setJustCreated(data.token);
    setLabel("");
    reloadTokens();
  }

  async function toggleStatus(id: number, current: string) {
    await fetch(`${API_BASE}/access-tokens/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: current === "blocked" ? "allowed" : "blocked" })
    });
    reloadTokens();
  }

  async function deleteToken(id: number) {
    if (!window.confirm("Fjerne denne tilgangskoden helt?")) return;
    await fetch(`${API_BASE}/access-tokens/${id}`, { method: "DELETE" });
    reloadTokens();
  }

  return (
    <div>
      <div style={{ background: "#111a2e", padding: 16, borderRadius: 10, maxWidth: 480, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Denne PC-ens tilkobling</h3>
        <p style={{ fontSize: 13, opacity: 0.7 }}>
          Kjører du appen på VERTENS PC (samme maskin som OBS/serveren), la dette stå tomt - da brukes localhost automatisk.
          Fjernstyrer du fra en ANNEN PC, fyll inn vertens adresse og en tilgangskode.
        </p>
        <input
          value={connAddress}
          onChange={(e) => setConnAddress(e.target.value)}
          placeholder="Tom = localhost, ellers f.eks. xxx.trycloudflare.com"
          style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #1c2740", background: "#0b1220", color: "#fff", marginBottom: 8 }}
        />
        <input
          value={connToken}
          onChange={(e) => setConnToken(e.target.value)}
          placeholder="Tilgangskode (kun nødvendig hvis adresse er fylt inn)"
          style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #1c2740", background: "#0b1220", color: "#fff", marginBottom: 8 }}
        />
        <button
          onClick={saveConnection}
          style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "#e11d48", color: "#fff", fontWeight: 700 }}
        >
          Lagre og koble til (restarter appen)
        </button>
      </div>

      <div style={{ background: "#111a2e", padding: 16, borderRadius: 10, maxWidth: 480, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Ny tilgangskode</h3>
        <p style={{ fontSize: 13, opacity: 0.7 }}>
          Kun nødvendig for tilkoblinger som kommer utenfra (via tunnel/internett) - lokalt WiFi trenger ingen kode.
        </p>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Merkelapp (f.eks. «Bob sin telefon»)"
          style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #1c2740", background: "#0b1220", color: "#fff", marginBottom: 10 }}
        />
        <button onClick={createToken} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "#e11d48", color: "#fff", fontWeight: 700 }}>
          Generer ny kode
        </button>

        {justCreated && (
          <div style={{ marginTop: 12, padding: 10, borderRadius: 6, background: "#0b1220", border: "1px solid #1c2740" }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Del denne koden med personen (vises kun én gang her, men kan ses igjen i listen under):</div>
            <code style={{ fontSize: 14, color: "#8ab4ff" }}>{justCreated}</code>
          </div>
        )}
      </div>

      <div style={{ background: "#111a2e", padding: 16, borderRadius: 10, maxWidth: 640 }}>
        <h3 style={{ marginTop: 0 }}>Aktive tilgangskoder</h3>
        {(tokens ?? []).length === 0 && <p style={{ fontSize: 13, opacity: 0.6 }}>Ingen tilgangskoder opprettet ennå.</p>}
        {(tokens ?? []).map((t: any) => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1c2740", gap: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{t.label || "(uten merkelapp)"}</div>
              <div style={{ fontSize: 11, opacity: 0.6 }}>
                <code>{t.token}</code> · {t.status === "blocked" ? "Sperret" : "Tillatt"}
                {t.last_used_at ? ` · Sist brukt: ${t.last_used_at}` : " · Ikke brukt ennå"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => toggleStatus(t.id, t.status)}
                style={{
                  padding: "4px 10px", borderRadius: 4, border: "none", fontSize: 12, fontWeight: 700,
                  background: t.status === "blocked" ? "#1c2740" : "#3a1420",
                  color: t.status === "blocked" ? "#8ab4ff" : "#ff8080"
                }}
              >
                {t.status === "blocked" ? "Gjenopprett" : "Sperr"}
              </button>
              <button onClick={() => deleteToken(t.id)} style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid #7a1c2e", background: "transparent", color: "#ff6b8a", fontSize: 12 }}>
                Slett
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<"tournament" | "match" | "broadcast" | "melee" | "stream" | "theme" | "access">("tournament");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    window.electronAPI.getConnectionConfig().then((config) => {
      CURRENT_REMOTE_ADDRESS = config.remoteAddress;
      CURRENT_ACCESS_TOKEN = config.accessToken;
      API_BASE = resolveApiBase(config.remoteAddress);
      setReady(true);
    });
  }, []);

  if (!ready) {
    return (
      <div style={{ padding: 24, color: "#fff" }}>
        <p>Kobler til...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>
        MTG NM Broadcast Desktop {CURRENT_REMOTE_ADDRESS && <span style={{ fontSize: 14, color: "#8ab4ff" }}>(klient-modus - fjernstyrer {CURRENT_REMOTE_ADDRESS})</span>}
      </h1>

      <div style={{ marginBottom: 20 }}>
        <TabButton active={tab === "tournament"} onClick={() => setTab("tournament")}>Turnering</TabButton>
        <TabButton active={tab === "match"} onClick={() => setTab("match")}>Kampkontroll</TabButton>
        <TabButton active={tab === "broadcast"} onClick={() => setTab("broadcast")}>Broadcast</TabButton>
        <TabButton active={tab === "melee"} onClick={() => setTab("melee")}>Melee</TabButton>
        <TabButton active={tab === "stream"} onClick={() => setTab("stream")}>Stream</TabButton>
        <TabButton active={tab === "theme"} onClick={() => setTab("theme")}>Tema</TabButton>
        <TabButton active={tab === "access"} onClick={() => setTab("access")}>Tilgangsstyring</TabButton>
      </div>

      {tab === "tournament" && <TournamentTab />}
      {tab === "match" && <MatchControlTab />}
      {tab === "broadcast" && <BroadcastControlTab />}
      {tab === "melee" && <MeleeSettingsTab />}
      {tab === "stream" && <StreamContentTab />}
      {tab === "theme" && <ThemeTab />}
      {tab === "access" && <AccessTab />}
    </div>
  );
}
