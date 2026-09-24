import React, { useState, useRef } from "react";
import { API_BASE } from "../lib/apiClient";
import { useTournament, usePlayers, useStandings } from "../hooks/useTournament";
import { useMatches } from "../hooks/useMatches";
import { useMeleeSettings } from "../hooks/useMelee";
import { useSystemStatus } from "../hooks/useSystem";
import { useBackupStatus } from "../hooks/useBackup";
import { useJudgeEntries } from "../hooks/useJudge";
import type { Tournament, Player } from "../types";
import { Panel, InfoRow, QuickActionButton } from "../components/shared";
import { deriveValidationStatus, ValidationStatus } from "./TournamentTab";


const STATUS_META: Record<ValidationStatus, { label: string; color: string; icon: string }> = {
  VALIDATED: { label: "VALIDATED", color: "var(--primary)", icon: "✓" },
  PENDING_SYNC: { label: "PENDING SYNC", color: "var(--text-faint)", icon: "…" },
  CONFLICT: { label: "CONFLICT", color: "var(--rose)", icon: "!" },
  RESOLVED: { label: "RESOLVED", color: "var(--accent-teal)", icon: "✓" },
  IN_PROGRESS: { label: "PLAYING", color: "var(--warn)", icon: "•" }
};

function StatusBadge({ status }: { status: ValidationStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 5,
        border: `1px solid ${meta.color}`, color: meta.color, whiteSpace: "nowrap"
      }}
    >
      {meta.icon} {meta.label}
    </span>
  );
}

export function TournamentValidationTab() {
  const [tournament] = useTournament();
  const [players] = usePlayers(tournament?.id);
  const [standings] = useStandings(tournament?.id);
  const [matches, reloadMatches] = useMatches(tournament?.id);
  const [meleeSettings] = useMeleeSettings();
  const [status] = useSystemStatus();
  const [backupStatus] = useBackupStatus();
  const [entries] = useJudgeEntries({ tournamentId: tournament?.id });

  const [roundFilter, setRoundFilter] = useState("ALL");
  const [tableFilter, setTableFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ValidationStatus>("ALL");
  const [query, setQuery] = useState("");
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allMatches = matches ?? [];
  const allPlayers = players ?? [];

  function playerName(id: number | undefined): string {
    if (id == null) return "-";
    return allPlayers.find((p) => p.id === id)?.name ?? `#${id}`;
  }

  // Siste dommer som rorte akkurat DENNE kampen - ekte, hentet fra
  // dommerloggens nyeste oppforing for kampen (ikke en egen kolonne i
  // matches-tabellen, entries er allerede lastet for hele turneringen).
  function lastJudgeFor(matchId: number): string {
    const forMatch = (entries ?? []).filter((e) => e.match_id === matchId);
    if (forMatch.length === 0) return "-";
    return forMatch.reduce((latest, e) => (e.id > latest.id ? e : latest)).judge_username || "-";
  }

  const rounds = Array.from(new Set(allMatches.map((m) => m.round_label).filter((r): r is string => !!r))).sort();
  const tables = Array.from(new Set(allMatches.map((m) => m.table_number).filter((t): t is number => t != null))).sort((a, b) => a - b);

  const withStatus = allMatches.map((m) => ({ match: m, status: deriveValidationStatus(m) }));

  const counts = {
    VALIDATED: withStatus.filter((x) => x.status === "VALIDATED").length,
    PENDING_SYNC: withStatus.filter((x) => x.status === "PENDING_SYNC").length,
    CONFLICT: withStatus.filter((x) => x.status === "CONFLICT").length,
    RESOLVED: withStatus.filter((x) => x.status === "RESOLVED").length,
    IN_PROGRESS: withStatus.filter((x) => x.status === "IN_PROGRESS").length
  };

  const q = query.trim().toLowerCase();
  const filtered = withStatus.filter(({ match, status: st }) => {
    if (roundFilter !== "ALL" && match.round_label !== roundFilter) return false;
    if (tableFilter !== "ALL" && String(match.table_number) !== tableFilter) return false;
    if (statusFilter !== "ALL" && st !== statusFilter) return false;
    if (q && !`${playerName(match.player1_id)} ${playerName(match.player2_id)} ${match.table_number ?? match.id}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const selected = allMatches.find((m) => m.id === selectedMatchId) || null;
  const selectedStatus = selected ? deriveValidationStatus(selected) : null;
  const selectedEntries = (entries ?? []).filter((e) => e.match_id === selectedMatchId);

  const finishedCount = allMatches.filter((m) => m.status === "finished").length;
  const progressPct = allMatches.length ? Math.round((finishedCount / allMatches.length) * 100) : 0;

  async function syncNow() {
    setSyncing(true);
    await fetch(`${API_BASE}/melee/sync`, { method: "POST" });
    setSyncing(false);
    reloadMatches();
  }

  async function applyMeleeResult() {
    if (!selected || selected.melee_player1_game_wins == null || selected.melee_player2_game_wins == null) return;
    if (!window.confirm(`Overwrite the local result (${selected.player1_game_wins}-${selected.player2_game_wins}) with Melee's (${selected.melee_player1_game_wins}-${selected.melee_player2_game_wins})?`)) return;
    setApplying(true);
    const winnerPlayerId =
      selected.melee_player1_game_wins > selected.melee_player2_game_wins
        ? selected.player1_id
        : selected.melee_player2_game_wins > selected.melee_player1_game_wins
        ? selected.player2_id
        : null;
    await fetch(`${API_BASE}/matches/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player1GameWins: selected.melee_player1_game_wins,
        player2GameWins: selected.melee_player2_game_wins,
        ...(winnerPlayerId ? { winnerPlayerId } : {})
      })
    });
    await fetch(`${API_BASE}/judge/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournamentId: tournament?.id,
        matchId: selected.id,
        type: "correction",
        message: `Local result overwritten with Melee's reported result (${selected.melee_player1_game_wins}-${selected.melee_player2_game_wins}) via Tournament Validation.`
      })
    });
    setApplying(false);
    reloadMatches();
  }

  async function keepLocalResult() {
    if (!selected) return;
    const reason = window.prompt(
      `Keep the local result (${selected.player1_game_wins}-${selected.player2_game_wins}) and dismiss the conflict with Melee (${selected.melee_player1_game_wins}-${selected.melee_player2_game_wins})?\n\nOptional reason (logged with your name and the time):`
    );
    if (reason === null) return;
    setAcknowledging(true);
    await fetch(`${API_BASE}/matches/${selected.id}/acknowledge-conflict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason })
    });
    setAcknowledging(false);
    reloadMatches();
  }

  async function importCsvFile(file: File) {
    if (!tournament) {
      window.alert("No active tournament to import into.");
      return;
    }
    const text = await file.text();
    setImporting(true);
    try {
      const res = await fetch(`${API_BASE}/tournament/${tournament.id}/import-csv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text })
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error || "Import failed.");
        return;
      }
      let summary = `Imported: ${data.matchesCreated} match(es) created, ${data.matchesUpdated} updated, ${data.playersCreated} new player(s).`;
      if (data.errors?.length) {
        summary += `\n\n${data.errors.length} row(s) had problems:\n` + data.errors.slice(0, 10).join("\n");
        if (data.errors.length > 10) summary += `\n...and ${data.errors.length - 10} more.`;
      }
      window.alert(summary);
      reloadMatches();
    } finally {
      setImporting(false);
    }
  }

  function exportCsv() {
    const header = "Table,Player1,Player2,LocalResult,MeleeResult,Status,RoundLabel\n";
    const rows = filtered
      .map(({ match, status: st }) => {
        const local = `${match.player1_game_wins}-${match.player2_game_wins}`;
        const melee = match.melee_player1_game_wins != null ? `${match.melee_player1_game_wins}-${match.melee_player2_game_wins}` : "-";
        return [match.table_number ?? match.id, playerName(match.player1_id), playerName(match.player2_id), local, melee, STATUS_META[st].label, match.round_label || ""].join(",");
      })
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tournament?.name || "tournament"}-validation.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadCsv(filename: string, header: string, rows: string) {
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPlayersCsv() {
    const header = "Name,FlagCode\n";
    const rows = (players ?? []).map((p) => [p.name, p.flag_code || ""].join(",")).join("\n");
    downloadCsv(`${tournament?.name || "tournament"}-players.csv`, header, rows);
  }

  function exportStandingsCsv() {
    const header = "Rank,Player,Wins,Losses,Draws\n";
    const sorted = [...(standings ?? [])].sort((a, b) => a.rank - b.rank);
    const rows = sorted.map((s) => [s.rank, playerName(s.player_id), s.wins, s.losses, s.draws].join(",")).join("\n");
    downloadCsv(`${tournament?.name || "tournament"}-standings.csv`, header, rows);
  }

  function exportAll() {
    // Litt forskjove hver nedlasting - noen nettlesere/Electron kan
    // blokkere flere programmatiske nedlastinger som skjer i eksakt
    // samme oyeblikk.
    exportCsv();
    setTimeout(exportPlayersCsv, 200);
    setTimeout(exportStandingsCsv, 400);
  }

  const inputStyle: React.CSSProperties = { padding: 8, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", fontSize: 13 };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ margin: 0 }}>Tournament Validation</h2>
            {status?.obs.stream.active && (
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 20, border: "1px solid var(--rose)", color: "var(--rose)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--rose)" }} />
                LIVE
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            {tournament ? tournament.name : "No active tournament"} - compares Melee's reported result against what's recorded locally
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importCsvFile(file);
              e.target.value = "";
            }}
          />
          <QuickActionButton label={importing ? "IMPORTING..." : "IMPORT"} onClick={() => fileInputRef.current?.click()} disabled={importing} compact />
          <QuickActionButton label="EXPORT" onClick={exportAll} compact />
          <QuickActionButton label={syncing ? "SYNCING..." : "SYNC WITH MELEE"} onClick={syncNow} disabled={syncing} compact />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 16, alignItems: "stretch" }}>
        <Panel title="MELEE SYNC" style={{ height: "100%" }}>
          <InfoRow label="STATUS" value={meleeSettings?.enabled ? (status?.melee.lastSyncOk ? "CONNECTED" : "DEGRADED") : "OFF"} accent={meleeSettings?.enabled ? (status?.melee.lastSyncOk ? "var(--primary)" : "var(--warn)") : "var(--text-faint)"} />
          <InfoRow label="LAST SYNC" value={status?.melee.lastSyncAt || "Never"} />
        </Panel>

        <Panel title="TOURNAMENT STATUS" style={{ height: "100%" }}>
          <InfoRow label="ROUND" value={tournament ? `${tournament.current_round} / ${tournament.total_rounds}` : "-"} mono />
          <InfoRow label="PLAYERS" value={allPlayers.length} mono />
          <InfoRow label="MATCHES" value={allMatches.length} mono />
          <div style={{ marginTop: 8 }}>
            <div style={{ height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progressPct}%`, background: "var(--primary)" }} />
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>{progressPct}% finished</div>
          </div>
        </Panel>

        <Panel title="MATCH RESULTS" style={{ height: "100%" }}>
          <InfoRow label="VALIDATED" value={counts.VALIDATED} accent="var(--primary)" mono />
          <InfoRow label="PENDING SYNC" value={counts.PENDING_SYNC} accent="var(--text-faint)" mono />
          <InfoRow label="CONFLICT" value={counts.CONFLICT} accent={counts.CONFLICT > 0 ? "var(--rose)" : "var(--text-faint)"} mono />
          <InfoRow label="RESOLVED" value={counts.RESOLVED} accent="var(--accent-teal)" mono />
          <InfoRow label="PLAYING" value={counts.IN_PROGRESS} accent="var(--warn)" mono />
        </Panel>

        <Panel title="DATA HEALTH" style={{ height: "100%" }}>
          <InfoRow label="LOCAL DATABASE" value={status?.database.online ? "OK" : "OFFLINE"} accent={status?.database.online ? "var(--primary)" : "var(--rose)"} />
          <InfoRow label="LAST BACKUP" value={backupStatus?.lastBackupAt || "Never"} />
          <InfoRow label="JUDGE LOG" value={`${(entries ?? []).length} entries`} mono />
        </Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16, alignItems: "start" }}>
        <Panel title="MATCHES" style={{ alignSelf: "start", height: "fit-content" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => setRoundFilter("ALL")}
              style={{
                padding: "6px 12px", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, cursor: "pointer",
                border: `1px solid ${roundFilter === "ALL" ? "var(--primary)" : "var(--border)"}`,
                background: roundFilter === "ALL" ? "var(--primary)" : "transparent",
                color: roundFilter === "ALL" ? "#04222a" : "var(--text-muted)"
              }}
            >
              ALL
            </button>
            {rounds.map((r) => (
              <button
                key={r}
                onClick={() => setRoundFilter(r)}
                style={{
                  padding: "6px 12px", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, cursor: "pointer",
                  border: `1px solid ${roundFilter === r ? "var(--primary)" : "var(--border)"}`,
                  background: roundFilter === r ? "var(--primary)" : "transparent",
                  color: roundFilter === r ? "#04222a" : "var(--text-muted)"
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} style={inputStyle}>
              <option value="ALL">All tables</option>
              {tables.map((t) => (
                <option key={t} value={String(t)}>Table {t}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} style={inputStyle}>
              <option value="ALL">All statuses</option>
              <option value="VALIDATED">Validated</option>
              <option value="PENDING_SYNC">Pending sync</option>
              <option value="CONFLICT">Conflict</option>
              <option value="RESOLVED">Resolved</option>
              <option value="IN_PROGRESS">Playing</option>
            </select>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search players, table..." style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-faint)" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>TABLE</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>PLAYER 1</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>PLAYER 2</th>
                  <th style={{ textAlign: "center", padding: "6px 8px" }}>LOCAL</th>
                  <th style={{ textAlign: "center", padding: "6px 8px" }}>MELEE</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>STATUS</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>JUDGE</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>UPDATED</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ match, status: st }) => (
                  <tr
                    key={match.id}
                    onClick={() => setSelectedMatchId(match.id)}
                    style={{ cursor: "pointer", background: selectedMatchId === match.id ? "var(--raised)" : "transparent", borderTop: "1px solid var(--hairline)" }}
                  >
                    <td style={{ padding: "8px", fontFamily: "var(--font-mono)", color: "var(--text-faint)" }}>T{match.table_number ?? match.id}</td>
                    <td style={{ padding: "8px" }}>{playerName(match.player1_id)}</td>
                    <td style={{ padding: "8px" }}>{playerName(match.player2_id)}</td>
                    <td style={{ padding: "8px", textAlign: "center", fontFamily: "var(--font-mono)" }}>{match.player1_game_wins}-{match.player2_game_wins}</td>
                    <td style={{ padding: "8px", textAlign: "center", fontFamily: "var(--font-mono)", opacity: match.melee_player1_game_wins == null ? 0.4 : 1 }}>
                      {match.melee_player1_game_wins != null ? `${match.melee_player1_game_wins}-${match.melee_player2_game_wins}` : "-"}
                    </td>
                    <td style={{ padding: "8px" }}><StatusBadge status={st} /></td>
                    <td style={{ padding: "8px", fontSize: 12, opacity: 0.8 }}>{lastJudgeFor(match.id)}</td>
                    <td style={{ padding: "8px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)" }}>
                      {match.updated_at ? match.updated_at.slice(11, 16) || match.updated_at : "-"}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: 16, textAlign: "center", opacity: 0.5 }}>No matches match this filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title={selected ? (selected.round_label ? `${selected.round_label} · TABLE ${selected.table_number ?? selected.id}` : `TABLE ${selected.table_number ?? selected.id}`) : "MATCH DETAILS"}
          style={{ alignSelf: "start", height: "fit-content" }}
        >
          {!selected ? (
            <div style={{ fontSize: 13, opacity: 0.5 }}>Select a match from the list to see the comparison.</div>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>{selectedStatus && <StatusBadge status={selectedStatus} />}</div>
              <InfoRow label="PLAYER 1" value={playerName(selected.player1_id)} />
              <InfoRow label="PLAYER 2" value={playerName(selected.player2_id)} />
              <InfoRow label="ROUND" value={selected.round_label || "-"} />
              <InfoRow label="LOCAL RESULT" value={`${selected.player1_game_wins} — ${selected.player2_game_wins}`} mono />
              <InfoRow
                label="MELEE RESULT"
                value={selected.melee_player1_game_wins != null ? `${selected.melee_player1_game_wins} — ${selected.melee_player2_game_wins}` : "Not reported yet"}
                mono={selected.melee_player1_game_wins != null}
                accent={selected.melee_player1_game_wins == null ? "var(--text-faint)" : undefined}
              />
              <InfoRow label="MELEE LAST SYNCED" value={selected.melee_result_synced_at || "-"} />

              <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--hairline)" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", letterSpacing: 1, marginBottom: 6 }}>MATCH INFORMATION</div>
                <InfoRow label="FORMAT" value={tournament?.format || "-"} />
                <InfoRow label="MATCH ID" value={selected.melee_match_id || "Not synced"} mono={!!selected.melee_match_id} />
                <InfoRow label="CREATED" value={selected.created_at || "-"} mono />
                <InfoRow label="UPDATED" value={selected.updated_at || "-"} mono />
              </div>

              {selectedStatus === "CONFLICT" && (
                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <QuickActionButton label={applying ? "APPLYING..." : "APPLY MELEE'S RESULT"} onClick={applyMeleeResult} disabled={applying} tone="warn" compact />
                  <button
                    onClick={keepLocalResult}
                    disabled={acknowledging}
                    style={{ padding: "10px 8px", borderRadius: 6, border: "1px solid var(--accent-teal)", background: "transparent", color: "var(--accent-teal)", fontWeight: 700, fontSize: 12, cursor: acknowledging ? "not-allowed" : "pointer" }}
                  >
                    {acknowledging ? "SAVING..." : "KEEP LOCAL RESULT"}
                  </button>
                  <div style={{ gridColumn: "1 / -1", fontSize: 11, opacity: 0.55 }}>
                    "Keep local result" logs that this discrepancy was reviewed and dismissed without changing anything - if Melee's number changes again later, it re-flags as a new conflict.
                  </div>
                </div>
              )}

              {selectedStatus === "RESOLVED" && (
                <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
                  Reviewed by <strong>{selected.conflict_ack_by}</strong> on {selected.conflict_ack_at} - local result kept as final.
                </div>
              )}

              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--hairline)" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", marginBottom: 8 }}>JUDGE LOG</div>
                {selectedEntries.length === 0 && <div style={{ fontSize: 13, opacity: 0.5 }}>No judge entries for this match.</div>}
                {selectedEntries.map((e) => (
                  <div key={e.id} style={{ fontSize: 12, padding: "6px 0", borderBottom: "1px solid var(--hairline)" }}>
                    <div style={{ opacity: 0.6, fontFamily: "var(--font-mono)", fontSize: 10 }}>
                      {e.created_at} · {e.judge_username} · {e.type.toUpperCase()}
                    </div>
                    <div>{e.message}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
