import React from "react";
import type { SystemStatus, BroadcastStatePayload, Role } from "../types";
import { StatusDot } from "./shared";

export function TopBar({
  broadcastState,
  status,
  liveSyncMs,
  roles
}: {
  broadcastState: BroadcastStatePayload | null;
  status: SystemStatus | null;
  liveSyncMs: number | null;
  roles: Role[];
}) {
  const scene = broadcastState?.scene || "-";
  const activeBoard = broadcastState?.scene === "bo5" ? broadcastState?.bo5 : broadcastState?.scene === "bo3" ? broadcastState?.bo3 : null;

  return (
    <div style={{ borderBottom: "1px solid var(--border)", padding: "18px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "var(--font-mono)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <span style={{ color: status?.obs.stream.active ? "var(--rose)" : "var(--text-faint)", fontWeight: 700, fontSize: 16 }}>
          ● {status?.obs.stream.active ? "LIVE" : "OFFLINE"}
        </span>
        <span style={{ fontSize: 14, color: "var(--text-muted)" }}>SCENE <b style={{ color: "var(--primary)" }}>{scene.toUpperCase()}</b></span>
        <span style={{ fontSize: 14, color: "var(--text-muted)" }}>CAM <b style={{ color: "var(--text-heading)" }}>{(status?.camera || "-").toUpperCase()}</b></span>
        <span style={{ fontSize: 14, color: "var(--text-muted)" }}>TABLE <b style={{ color: "var(--text-heading)" }}>{activeBoard?.tableNumber ?? "-"}</b></span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <span style={{ fontSize: 14, color: "var(--text-muted)" }}>
          <StatusDot ok={!!status?.melee.lastSyncOk} color={status?.melee.lastSyncOk === false ? "var(--warn)" : undefined} />MELEE
        </span>
        <span style={{ fontSize: 14, color: "var(--text-muted)" }}><StatusDot ok={!!status?.obs.connected} color={status?.obs.connected ? undefined : "var(--warn)"} />OBS</span>
        <span style={{ fontSize: 14, color: "var(--text-muted)" }}><StatusDot ok={!!status?.scryfall.available} color={status?.scryfall.available ? undefined : "var(--warn)"} />SCRYFALL</span>
        <span style={{ fontSize: 14, color: "var(--text-muted)" }}><StatusDot ok={!!status?.server.online} />SERVER</span>
        <span style={{ fontSize: 14, color: "var(--text-muted)" }}>CLIENTS <b style={{ color: "var(--text-heading)" }}>{status?.clients ?? 0}</b></span>
        <span style={{ fontSize: 14, color: liveSyncMs != null ? "var(--primary)" : "var(--text-faint)" }}><StatusDot ok={liveSyncMs != null} blink />LIVE SYNC</span>
        <span style={{ fontSize: 13, color: "var(--text-muted)", letterSpacing: 1 }}>{roles.join(" + ")}</span>
        {/* Legg logo-filen i public/nm-logo.png (Vite serverer den fra rot) */}
        <img src="/nm-logo.png" alt="" style={{ height: 28, width: 28, objectFit: "contain" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      </div>
    </div>
  );
}

