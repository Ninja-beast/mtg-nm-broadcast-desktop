import React, { useState, useEffect } from "react";
import { API_BASE } from "../lib/apiClient";
import { useTournament } from "../hooks/useTournament";
import { useMatches } from "../hooks/useMatches";
import type { SharedDashboardData, Tournament, Match } from "../types";
import { Panel, InfoRow, QuickActionButton, AlertCard, StatusDot, formatUptime, formatCountdown } from "../components/shared";

export function DashboardTab({ shared }: { shared: SharedDashboardData }) {
  const { status, alerts, broadcastState, reload, now } = shared;
  const [tournament] = useTournament();
  const [matches] = useMatches();
  const [intermissionMinutes, setIntermissionMinutes] = useState(5);

  async function postAction(url: string, body?: unknown) {
    await fetch(`${API_BASE}${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {})
    });
    reload();
  }

  const activeMatches = (matches || []).filter((m: any) => m.status === "in_progress").length;
  const activeBoard = broadcastState?.scene === "bo5" ? broadcastState?.bo5 : broadcastState?.scene === "bo3" ? broadcastState?.bo3 : null;
  const intermissionActive = !!status?.intermissionEndsAt && status.intermissionEndsAt > now;
  const intermissionRemainingMs = intermissionActive ? status!.intermissionEndsAt! - now : 0;

  return (
    <div>
      <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          {tournament ? (
            <>
              <h2 style={{ margin: 0 }}>
                {tournament.name} {tournament.current_round ? <span style={{ opacity: 0.6, fontWeight: 400 }}>- Round {tournament.current_round}</span> : null}
              </h2>
              <div style={{ opacity: 0.6, fontSize: 13, marginTop: 4 }}>
                {tournament.format} · {tournament.phase === "swiss" ? "Swiss" : tournament.phase} {tournament.current_round} of {tournament.total_rounds} · {activeMatches} active matches
              </div>
            </>
          ) : (
            <h2 style={{ margin: 0, opacity: 0.6 }}>No active tournament</h2>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 800, color: "var(--text-heading)" }}>
            {new Date(now).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
          <div style={{ fontSize: 12, opacity: 0.6, textTransform: "capitalize" }}>
            {new Date(now).toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Panel title="EVENT">
          <InfoRow label="EVENT" value={tournament?.name || "-"} />
          <InfoRow label="ROUND" value={tournament ? `${tournament.phase === "swiss" ? "Swiss" : tournament.phase} ${tournament.current_round} of ${tournament.total_rounds}` : "-"} />
          <InfoRow label="FORMAT" value={tournament?.format || "-"} />
          <InfoRow label="ACTIVE MATCHES" value={activeMatches} />
          <InfoRow label="FEATURED TABLE" value={activeBoard?.tableNumber ?? "-"} />
          <InfoRow label="STATE" value="LIVE" accent="var(--primary)" />
        </Panel>

        <Panel title="BROADCAST">
          <InfoRow
            label="STREAM"
            value={status?.obs.stream.active ? `STREAMING · ${status.obs.stream.kbps} kbps` : "OFFLINE"}
            accent={status?.obs.stream.active ? "var(--primary)" : "var(--rose)"}
          />
          <InfoRow label="SCENE" value={(broadcastState?.scene || "-").toUpperCase()} />
          <InfoRow label="CAMERA" value={(status?.camera || "-").toUpperCase()} />
          <InfoRow label="PLAYER 1" value={activeBoard?.player1?.name || "-"} />
          <InfoRow label="PLAYER 2" value={activeBoard?.player2?.name || "-"} />
          <InfoRow
            label="MATCH SCORE"
            value={activeBoard ? `${activeBoard.player1.gameWins} - ${activeBoard.player2.gameWins}` : "-"}
          />
        </Panel>

        <Panel title="SYSTEM">
          <InfoRow label={<><StatusDot ok={!!status?.server.online} />Observer Server</>} value={status?.server.online ? "ONLINE" : "OFFLINE"} accent={status?.server.online ? "var(--primary)" : "var(--rose)"} />
          <InfoRow label={<><StatusDot ok={!!status?.obs.connected} color={status?.obs.connected ? undefined : "var(--warn)"} />OBS WebSocket</>} value={status?.obs.connected ? "CONNECTED" : "DISCONNECTED"} accent={status?.obs.connected ? "var(--primary)" : "var(--warn)"} />
          <InfoRow label={<><StatusDot ok={status?.melee.lastSyncOk ?? null} />Melee</>} value={status?.melee.lastSyncOk === false ? "DEGRADED" : status?.melee.lastSyncOk ? "OK" : "UNKNOWN"} accent={status?.melee.lastSyncOk === false ? "var(--warn)" : "var(--primary)"} />
          <InfoRow label={<><StatusDot ok={!!status?.scryfall.available} color={status?.scryfall.available ? undefined : "var(--warn)"} />Scryfall API</>} value={status?.scryfall.available ? "AVAILABLE" : "UNAVAILABLE"} accent={status?.scryfall.available ? "var(--primary)" : "var(--warn)"} />
          <InfoRow label={<><StatusDot ok={!!status?.internet.online} />Internet</>} value={status?.internet.online ? `STABLE · ${status.internet.latencyMs}ms` : "OFFLINE"} accent={status?.internet.online ? "var(--primary)" : "var(--rose)"} />
        </Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <Panel title="ALERTS">
          {(!alerts || alerts.length === 0) && <div style={{ opacity: 0.5, fontSize: 13 }}>Ingen aktive varsler.</div>}
          {(alerts || []).map((a, i) => {
            let detail: React.ReactNode = null;
            if (a.title === "Melee connection unstable") detail = `Siste synk-forsok: ${status?.melee.lastSyncAt || "ukjent"}`;
            else if (a.title === "OBS not connected") detail = status?.obs.lastError ? `Siste feil fra OBS: ${status.obs.lastError}` : "Ingen tidligere feilmelding registrert.";
            else if (a.title === "Scryfall API unreachable") detail = `Malt responstid siste forsok: ${status?.scryfall.latencyMs ?? "-"}ms`;
            else if (a.title === "No internet connection") detail = `Malt responstid siste forsok: ${status?.internet.latencyMs ?? "-"}ms`;

            return (
              <AlertCard
                key={i}
                alert={a}
                detail={detail}
                onRetry={a.title === "Melee connection unstable" ? () => postAction("/melee/sync") : undefined}
              />
            );
          })}
        </Panel>

        <Panel title="QUICK ACTIONS">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <QuickActionButton label="TAKE BO3" onClick={() => postAction("/broadcast/scene", { scene: "bo3" })} />
            <QuickActionButton label="RELOAD PLAYERS" onClick={() => postAction("/melee/sync")} />
            <QuickActionButton label="SHOW NAME TAGS" onClick={() => postAction("/broadcast/name-tags", { show: !status?.showNameTags })} />
            <QuickActionButton label="MAIN CAMERA" onClick={() => postAction("/broadcast/camera", { camera: "main" })} />

            {intermissionActive ? (
              <div style={{ gridColumn: "span 1", borderRadius: 10, border: "1px solid var(--warn)", background: "var(--popover)", padding: "8px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <span style={{ color: "var(--warn)", fontWeight: 800, fontSize: 15 }}>{formatCountdown(intermissionRemainingMs)}</span>
                <button onClick={() => postAction("/broadcast/cancel-intermission")} style={{ background: "none", border: "none", color: "var(--warn)", fontSize: 11, textDecoration: "underline", cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            ) : (
              <QuickActionButton
                label="ARM INTERMISSION"
                tone="warn"
                onClick={() => {
                  const input = window.prompt("Nedtelling i minutter:", String(intermissionMinutes));
                  if (input == null) return;
                  const mins = Math.max(1, Number(input) || 1);
                  setIntermissionMinutes(mins);
                  postAction("/broadcast/arm-intermission", { minutes: mins });
                }}
              />
            )}

            <QuickActionButton
              label="END MATCH"
              tone="danger"
              onClick={() => postAction("/broadcast/stop-stream")}
            />
          </div>
          <InfoRow label="UPTIME" value={status ? formatUptime(status.server.uptimeSeconds) : "-"} mono />
          <InfoRow label="DROPPED FRAMES" value={status?.obs.stream.droppedFrames ?? "-"} mono />
          <InfoRow label="CONNECTED CLIENTS" value={status?.clients ?? "-"} mono />
          <InfoRow label="ENVIRONMENT" value={(status?.server.environment || "-").toUpperCase()} accent={status?.server.environment === "test" ? "var(--warn)" : "var(--primary)"} />
        </Panel>
      </div>
    </div>
  );
}

