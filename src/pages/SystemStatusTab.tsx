import React, { useState } from "react";
import { API_BASE } from "../lib/apiClient";
import { useMeleeLog } from "../hooks/useMelee";
import type { SharedDashboardData } from "../types";
import { Panel, InfoRow, QuickActionButton, StatusDot, AlertCard, formatUptime } from "../components/shared";

export function SystemStatusTab({ shared }: { shared: SharedDashboardData }) {
  const { status, alerts, reload } = shared;
  const [showClientNote, setShowClientNote] = useState(false);
  const [eventLogExpanded, setEventLogExpanded] = useState(false);
  const [meleeLog, reloadMeleeLog] = useMeleeLog();

  async function retryAlert(title: string) {
    if (title.toLowerCase().includes("melee")) {
      await fetch(`${API_BASE}/melee/sync`, { method: "POST" });
      reloadMeleeLog();
    }
    reload();
  }

  async function recheckAll() {
    reload();
    reloadMeleeLog();
  }

  const degradedCount = (alerts ?? []).length;
  const clientsCount = status?.clients ?? 0;

  const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--hairline)" };
  const nameStyle: React.CSSProperties = { display: "flex", alignItems: "center", fontWeight: 700, fontSize: 14 };
  const subStyle: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", marginLeft: 18, marginTop: 2 };

  function ServiceRow({ ok, blink, name, sub, valueLabel, valueColor }: { ok: boolean | null; blink?: boolean; name: string; sub: string; valueLabel: string; valueColor?: string }) {
    return (
      <div style={rowStyle}>
        <div>
          <div style={nameStyle}>
            <StatusDot ok={ok} blink={blink} />
            {name}
          </div>
          <div style={subStyle}>{sub}</div>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800, color: valueColor || (ok === null ? "var(--text-faint)" : ok ? "var(--primary)" : "var(--rose)") }}>{valueLabel}</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>System Status</h2>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            One status language across the whole application · {clientsCount} connected client{clientsCount === 1 ? "" : "s"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {degradedCount > 0 && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, padding: "6px 12px", borderRadius: 20, border: "1px solid var(--warn)", color: "#2a1a00", background: "var(--warn)" }}>
              {degradedCount} DEGRADED
            </span>
          )}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, padding: "6px 12px", borderRadius: 20, border: "1px solid var(--primary)", color: "#04222a", background: "var(--primary)" }}>
            LIVE SYNC
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, alignItems: "stretch", marginBottom: 16 }}>
        {/* SERVICES */}
        <Panel title="SERVICES" style={{ height: "100%" }}>
          <ServiceRow ok={!!status?.server.online} name="Observer Server" sub={`v${status?.server.version ?? "?"} · ${status ? formatUptime(status.server.uptimeSeconds) : "-"}`} valueLabel={status?.server.online ? "ONLINE" : "OFFLINE"} />
          <ServiceRow ok={!!status?.database.online} name="Database" sub="SQLite" valueLabel={status?.database.online ? "ONLINE" : "OFFLINE"} />
          <ServiceRow ok={!!status?.obs.connected} name="OBS" sub="WebSocket v5" valueLabel={status?.obs.connected ? "CONNECTED" : "DISCONNECTED"} />
          <ServiceRow
            ok={status?.melee.enabled ? status?.melee.lastSyncOk : null}
            name="Melee"
            sub={status?.melee.lastSyncAt ? `Last synced ${status.melee.lastSyncAt}` : "No sync yet"}
            valueLabel={!status?.melee.enabled ? "OFF" : status?.melee.lastSyncOk === false ? "DEGRADED" : status?.melee.lastSyncOk ? "OK" : "UNKNOWN"}
            valueColor={!status?.melee.enabled ? "var(--text-faint)" : status?.melee.lastSyncOk === false ? "var(--warn)" : undefined}
          />
          <ServiceRow ok={!!status?.scryfall.available} name="Scryfall" sub={`${status?.scryfall.latencyMs ?? "-"} ms`} valueLabel={status?.scryfall.available ? "AVAILABLE" : "UNAVAILABLE"} />
          <ServiceRow ok={!!status?.internet.online} name="Internet" sub={`${status?.internet.latencyMs ?? "-"} ms`} valueLabel={status?.internet.online ? "STABLE" : "OFFLINE"} />
          <ServiceRow ok={null} name="Backup target" sub="No backup destination set up" valueLabel="NOT CONFIGURED" valueColor="var(--text-faint)" />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
            <QuickActionButton label="RECHECK ALL" onClick={recheckAll} compact />
            <QuickActionButton
              label="OPEN LOGS"
              onClick={() => {
                setEventLogExpanded(true);
                document.getElementById("system-event-log")?.scrollIntoView({ behavior: "smooth" });
              }}
              compact
            />
          </div>
        </Panel>

        {/* CONNECTED CLIENTS */}
        <Panel title="CONNECTED CLIENTS" style={{ height: "100%" }}>
          <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "var(--font-mono)" }}>{clientsCount}</div>
          <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 10 }}>client{clientsCount === 1 ? "" : "s"} connected right now</div>

          <InfoRow
            label="SYNC STATE"
            value={clientsCount === 0 ? "IDLE" : status?.obs.connected ? "SYNCHRONISED" : "DEGRADED"}
            accent={clientsCount === 0 ? undefined : status?.obs.connected ? "var(--primary)" : "var(--warn)"}
          />
          <InfoRow label="TRANSPORT" value="WebSocket" />

          <button
            onClick={() => setShowClientNote((v) => !v)}
            style={{ marginTop: 10, background: "none", border: "none", color: "var(--text-muted)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}
          >
            {showClientNote ? "Hide note" : "Why no per-client list?"}
          </button>
          {showClientNote && (
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7, borderTop: "1px solid var(--hairline)", paddingTop: 8 }}>
              The server currently only counts connected clients - it doesn't yet track each one's machine name, user, role or device type. That would need a small identification handshake added to the WebSocket connection.
            </div>
          )}
        </Panel>

        {/* ACTIVE ERRORS + ENVIRONMENT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, alignSelf: "start" }}>
          <Panel title="ACTIVE ERRORS">
            {(!alerts || alerts.length === 0) && <div style={{ fontSize: 13, opacity: 0.5 }}>No active errors.</div>}
            {(alerts || []).map((a, i) => (
              <AlertCard key={i} alert={a} onRetry={() => retryAlert(a.title)} />
            ))}
          </Panel>

          <Panel title="ENVIRONMENT">
            <InfoRow label="ENVIRONMENT" value={(status?.server.environment || "-").toUpperCase()} accent={status?.server.environment === "test" ? "var(--warn)" : "var(--primary)"} />
            <InfoRow label="VERSION" value={status?.server.version ? `v${status.server.version}` : "-"} mono />
            <InfoRow label="UPTIME" value={status ? formatUptime(status.server.uptimeSeconds) : "-"} mono />
          </Panel>
        </div>
      </div>

      <Panel title="EVENT LOG">
        <div id="system-event-log" />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: eventLogExpanded ? 10 : 0 }}>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            {(meleeLog || []).length === 0 ? "No events logged yet." : `${meleeLog!.length} event${meleeLog!.length === 1 ? "" : "s"} logged`}
          </div>
          <button
            onClick={() => setEventLogExpanded((v) => !v)}
            style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
          >
            {eventLogExpanded ? "COLLAPSE" : "EXPAND"}
          </button>
        </div>
        {eventLogExpanded && (
          <>
            {(meleeLog || []).map((row) => (
              <div key={row.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--hairline)", fontSize: 13 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", width: 140 }}>{row.ran_at}</span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 800,
                    padding: "2px 6px",
                    borderRadius: 4,
                    color: row.ok ? "var(--primary)" : "var(--warn)",
                    border: `1px solid ${row.ok ? "var(--primary)" : "var(--warn)"}`,
                    width: 40,
                    textAlign: "center"
                  }}
                >
                  {row.ok ? "OK" : "WARN"}
                </span>
                <span>{row.ok ? "Melee sync completed" : "Melee sync failed"}{row.message ? ` — ${row.message}` : ""}</span>
              </div>
            ))}
            <div style={{ fontSize: 11, opacity: 0.5, marginTop: 10 }}>
              Showing the last {meleeLog?.length ?? 0} Melee sync attempts. The server doesn't yet log other event types (scene changes, client connects/disconnects, etc.) - this log is Melee-sync-only for now.
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
