import React, { useState, useEffect } from "react";
import { API_BASE } from "../lib/apiClient";
import { useObsStudioState } from "../hooks/useBroadcast";
import { useTournament } from "../hooks/useTournament";
import { useUsers } from "../hooks/useAuth";
import { useBackupStatus } from "../hooks/useBackup";
import { useAdvancedInfo } from "../hooks/useSystem";
import { useLogSettings, useLogs } from "../hooks/useLogs";
import type { SharedDashboardData, Tournament } from "../types";
import { Panel, InfoRow, QuickActionButton, formatUptime } from "../components/shared";

type CategoryKey = "general" | "broadcast" | "tournament" | "integrations" | "server" | "users" | "appearance" | "updates" | "backup" | "advanced";

const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: "general", label: "General" },
  { key: "broadcast", label: "Broadcast" },
  { key: "tournament", label: "Tournament" },
  { key: "integrations", label: "Integrations" },
  { key: "server", label: "Server" },
  { key: "users", label: "Users & Access" },
  { key: "appearance", label: "Appearance" },
  { key: "updates", label: "Updates" },
  { key: "backup", label: "Backup" },
  { key: "advanced", label: "Advanced" }
];

export function SettingsTab({ shared }: { shared: SharedDashboardData }) {
  const { status } = shared;
  const [category, setCategory] = useState<CategoryKey>("general");
  const [studio] = useObsStudioState();
  const [tournament] = useTournament();
  const [users] = useUsers();

  const rowStyle = { display: "flex" as const, justifyContent: "space-between" as const, alignItems: "center" as const, padding: "6px 0" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Settings</h2>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Nothing here is required during an active production</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, padding: "6px 12px", borderRadius: 20, border: "1px solid var(--border)", color: "var(--text-muted)", background: "var(--popover)" }}>
            v{status?.server.version ?? "?"}
          </span>
          {status?.server.environment === "test" && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, padding: "6px 12px", borderRadius: 20, border: "1px solid var(--warn)", color: "#2a1a00", background: "var(--warn)" }}>
              TEST ENV
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, alignItems: "start" }}>
        {/* CATEGORIES */}
        <Panel title="CATEGORIES" style={{ alignSelf: "start", height: "fit-content" }}>
          {CATEGORIES.map((c) => (
            <div
              key={c.key}
              onClick={() => setCategory(c.key)}
              style={{
                padding: "10px 10px",
                borderRadius: 6,
                marginBottom: 4,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: category === c.key ? 700 : 400,
                background: category === c.key ? "var(--raised)" : "transparent",
                color: category === c.key ? "var(--primary)" : "var(--text-body)"
              }}
            >
              {c.label}
            </div>
          ))}
        </Panel>

        {/* CONTENT */}
        <div style={{ alignSelf: "start" }}>
          {category === "general" && (
            <Panel title="GENERAL" style={{ alignSelf: "start", height: "fit-content" }}>
              <InfoRow label="ENVIRONMENT" value={(status?.server.environment || "-").toUpperCase()} accent={status?.server.environment === "test" ? "var(--warn)" : "var(--primary)"} />
              <InfoRow label="VERSION" value={status?.server.version ? `v${status.server.version}` : "-"} mono />
              <InfoRow label="UPTIME" value={status ? formatUptime(status.server.uptimeSeconds) : "-"} mono />
              <div style={{ fontSize: 12, opacity: 0.55, marginTop: 10 }}>
                More settings live in their own pages in the sidebar: Configuration (OBS/Melee/theme), Remote Access, and Users &amp; Access.
              </div>
            </Panel>
          )}

          {category === "broadcast" && (
            <Panel title="BROADCAST" style={{ alignSelf: "start", height: "fit-content" }}>
              <InfoRow label="ACTIVE CAMERA" value={(status?.camera || "-").toUpperCase()} mono />
              <InfoRow label="STUDIO MODE" value={studio?.enabled ? "ENABLED" : "DISABLED"} accent={studio?.enabled ? "var(--primary)" : "var(--text-faint)"} />
              <InfoRow label="PROGRAM SCENE" value={studio?.program || "-"} mono />
              <InfoRow label="PREVIEW SCENE" value={studio?.preview || "-"} mono />
              <div style={{ fontSize: 12, opacity: 0.55, marginTop: 10 }}>
                Camera/scene switching itself lives in the Broadcast tab. "Confirm before Take Live" and "require armed state to end stream" style safety toggles aren't built yet - flagging rather than faking them.
              </div>
            </Panel>
          )}

          {category === "tournament" && (
            <Panel title="TOURNAMENT" style={{ alignSelf: "start", height: "fit-content" }}>
              {tournament ? (
                <>
                  <InfoRow label="NAME" value={tournament.name} />
                  <InfoRow label="FORMAT" value={tournament.format || "-"} />
                  <InfoRow label="PHASE" value={(tournament.phase || "-").toUpperCase()} />
                  <InfoRow label="ROUND" value={`${tournament.current_round} of ${tournament.total_rounds}`} mono />
                </>
              ) : (
                <div style={{ fontSize: 13, opacity: 0.5 }}>No active tournament.</div>
              )}
              <div style={{ fontSize: 12, opacity: 0.55, marginTop: 10 }}>Editing lives in the Tournament tab - this is a read-only summary.</div>
            </Panel>
          )}

          {category === "integrations" && (
            <Panel title="INTEGRATIONS" style={{ alignSelf: "start", height: "fit-content" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", letterSpacing: 1, marginBottom: 4 }}>WEBSOCKET</div>
              <div style={rowStyle}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>OBS Studio</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800, color: status?.obs.connected ? "var(--primary)" : "var(--rose)" }}>
                  {status?.obs.connected ? "CONNECTED" : "DISCONNECTED"}
                </span>
              </div>
              <div style={rowStyle}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Observer Server (clients)</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800, color: status?.server.online ? "var(--primary)" : "var(--rose)" }}>
                  {status?.server.online ? "ONLINE" : "OFFLINE"}
                </span>
              </div>

              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", letterSpacing: 1, marginTop: 14, marginBottom: 4 }}>API</div>
              <div style={rowStyle}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Melee</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800, color: !status?.melee.enabled ? "var(--text-faint)" : status?.melee.lastSyncOk === false ? "var(--warn)" : "var(--primary)" }}>
                  {!status?.melee.enabled ? "OFF" : status?.melee.lastSyncOk === false ? "DEGRADED" : "OK"}
                </span>
              </div>
              <div style={rowStyle}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Scryfall</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800, color: status?.scryfall.available ? "var(--primary)" : "var(--rose)" }}>
                  {status?.scryfall.available ? "AVAILABLE" : "UNAVAILABLE"}
                </span>
              </div>
              <div style={{ fontSize: 12, opacity: 0.55, marginTop: 10 }}>
                Connection details (host/port/credentials) are managed in the Configuration tab. "Auto-reconnect", "use cached data on failure" and "write results back to Melee" aren't real toggles anywhere in the app yet - not shown here rather than faked.
              </div>
            </Panel>
          )}

          {category === "server" && (
            <Panel title="SERVER" style={{ alignSelf: "start", height: "fit-content" }}>
              <InfoRow label="STATUS" value={status?.server.online ? "ONLINE" : "OFFLINE"} accent={status?.server.online ? "var(--primary)" : "var(--rose)"} />
              <InfoRow label="VERSION" value={status?.server.version ? `v${status.server.version}` : "-"} mono />
              <InfoRow label="UPTIME" value={status ? formatUptime(status.server.uptimeSeconds) : "-"} mono />
              <InfoRow label="CONNECTED CLIENTS" value={status?.clients ?? 0} mono />
            </Panel>
          )}

          {category === "users" && (
            <Panel title="USERS & ACCESS" style={{ alignSelf: "start", height: "fit-content" }}>
              <InfoRow label="ACCOUNTS" value={(users ?? []).length} mono />
              <InfoRow label="CONNECTED CLIENTS" value={status?.clients ?? 0} mono />
              <div style={{ fontSize: 12, opacity: 0.55, marginTop: 10 }}>
                Full account management, roles, and the permission matrix live on the Users &amp; Access page.
              </div>
            </Panel>
          )}

          {category === "appearance" && (
            <Panel title="APPEARANCE & THEME" style={{ alignSelf: "start", height: "fit-content" }}>
              <InfoRow label="APP THEME" value="Observer (fixed)" />
              <InfoRow label="ACCENT COLOR" value="#4fdceb" mono />
              <InfoRow label="EVENT IDENTITY" value={tournament?.name || "-"} />
              <InfoRow label="BROADCAST PACKAGE" value="Handled in OBS" />
              <div style={{ fontSize: 12, opacity: 0.55, marginTop: 10 }}>
                This app's own UI theme isn't switchable - it's a fixed dark design. Overlay background/logo/CSS theming (what viewers actually see) is on the Configuration tab.
              </div>
            </Panel>
          )}

          {category === "updates" && <UpdatesPanel currentVersion={status?.server.version} />}

          {category === "backup" && <BackupPanel />}

          {category === "advanced" && <AdvancedPanel />}
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type UpdateCheckResult = { ok: boolean; message?: string; currentVersion: string; latestVersion?: string; updateAvailable?: boolean; releaseNotes?: string };

function UpdatesPanel({ currentVersion }: { currentVersion?: string }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [installing, setInstalling] = useState(false);

  async function checkNow() {
    setChecking(true);
    try {
      const res = await window.electronAPI.checkForUpdates();
      setResult(res);
    } finally {
      setChecking(false);
    }
  }

  async function installNow() {
    setInstalling(true);
    const res = await window.electronAPI.quitAndInstallUpdate();
    if (!res.ok) {
      window.alert(res.message || "Ingen oppdatering er klar til a installere enna - den lastes ned i bakgrunnen etter en sjekk finner en ny versjon.");
      setInstalling(false);
    }
    // Ved suksess lukker/restarter appen selv - ingen mer a gjore her.
  }

  return (
    <Panel title="UPDATES" style={{ alignSelf: "start", height: "fit-content" }}>
      <InfoRow label="INSTALLED VERSION" value={currentVersion ? `v${currentVersion}` : "-"} mono />
      <InfoRow label="SOURCE" value="GitHub Releases" />

      {result && (
        <>
          {!result.ok && <InfoRow label="LAST CHECK" value={result.message || "Failed"} accent="var(--rose)" />}
          {result.ok && (
            <InfoRow
              label="LAST CHECK"
              value={result.updateAvailable ? `v${result.latestVersion} available` : "Up to date"}
              accent={result.updateAvailable ? "var(--warn)" : "var(--primary)"}
            />
          )}
        </>
      )}

      {result?.ok && result.updateAvailable && result.releaseNotes && (
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8, whiteSpace: "pre-line" }}>{result.releaseNotes}</div>
      )}

      <div style={{ fontSize: 12, opacity: 0.55, marginTop: 10, marginBottom: 12 }}>
        Checks the real GitHub Releases feed configured in package.json. Only works in a packaged build (not in "npm run dev"). A found update downloads automatically in the background - "Install & Restart" only does something once that finishes.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <QuickActionButton label={checking ? "CHECKING..." : "CHECK FOR UPDATES"} onClick={checkNow} disabled={checking} compact />
        <QuickActionButton label={installing ? "INSTALLING..." : "INSTALL & RESTART"} onClick={installNow} disabled={installing} tone="warn" compact />
      </div>
    </Panel>
  );
}

type BackupEntry = { filename: string; path: string; sizeBytes: number; createdAt: string };

function BackupPanel() {
  const [status, reloadStatus] = useBackupStatus();
  const [running, setRunning] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  async function runBackupNow() {
    setRunning(true);
    try {
      const res = await fetch(`${API_BASE}/backup/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        window.alert(data.error || "Backup failed.");
        return;
      }
      reloadStatus();
    } finally {
      setRunning(false);
    }
  }

  async function restore(entry: BackupEntry) {
    if (!window.confirm(`Restore the database to the state from ${entry.createdAt}?\n\nThis replaces everything currently in the app (tournament, players, matches, settings) and restarts the app immediately. This cannot be undone.`)) {
      return;
    }
    setRestoring(entry.filename);
    const res = await fetch(`${API_BASE}/backup/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: entry.path })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      window.alert(data.error || "Restore failed.");
      setRestoring(null);
    }
    // Ved suksess restarter appen seg selv rett etter - ingen mer a gjore her.
  }

  return (
    <Panel title="BACKUP & ROLLBACK" style={{ alignSelf: "start", height: "fit-content" }}>
      <InfoRow label="LAST BACKUP" value={status?.lastBackupAt || "Never"} />
      <InfoRow label="BACKUP FOLDER" value={status?.backupsDir || "-"} mono />

      <div style={{ marginTop: 12, marginBottom: 14 }}>
        <QuickActionButton label={running ? "BACKING UP..." : "BACK UP NOW"} onClick={runBackupNow} disabled={running} />
      </div>

      <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-faint)", marginBottom: 6 }}>PREVIOUS BACKUPS</div>
      {(status?.backups ?? []).length === 0 && <div style={{ fontSize: 13, opacity: 0.5 }}>No backups yet.</div>}
      {(status?.backups ?? []).map((b) => (
        <div key={b.filename} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--hairline)" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{b.createdAt}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)" }}>{formatBytes(b.sizeBytes)}</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <a
              href={`${API_BASE}/backup/download/${encodeURIComponent(b.filename)}`}
              style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 11, fontWeight: 700, textDecoration: "none" }}
            >
              EXPORT
            </a>
            <button
              onClick={() => restore(b)}
              disabled={restoring === b.filename}
              style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--rose)", background: "transparent", color: "var(--rose)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >
              {restoring === b.filename ? "RESTORING..." : "RESTORE"}
            </button>
          </div>
        </div>
      ))}

      <div style={{ fontSize: 12, opacity: 0.55, marginTop: 10 }}>
        A backup is a real, safe snapshot of the whole database (tournament, players, matches, decks, settings, themes). Restoring replaces the live database and restarts the app.
      </div>
    </Panel>
  );
}


function AdvancedPanel() {
  const [info] = useAdvancedInfo();
  const [logSettings, reloadLogSettings] = useLogSettings();
  const [logFilter, setLogFilter] = useState("debug");
  const [logs, reloadLogs] = useLogs(logFilter, 100);

  const [levelDraft, setLevelDraft] = useState("info");
  const [retentionDraft, setRetentionDraft] = useState(14);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (logSettings) {
      setLevelDraft(logSettings.level);
      setRetentionDraft(logSettings.retentionDays);
    }
  }, [logSettings]);

  async function saveLogSettings() {
    setSaving(true);
    await fetch(`${API_BASE}/logs/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level: levelDraft, retentionDays: retentionDraft })
    });
    setSaving(false);
    reloadLogSettings();
  }

  const levelColor: Record<string, string> = { debug: "var(--text-faint)", info: "var(--primary)", warn: "var(--warn)", error: "var(--rose)" };

  return (
    <Panel title="ADVANCED" style={{ alignSelf: "start", height: "fit-content" }}>
      <InfoRow label="WEBSOCKET URL" value={info?.wsUrl || "-"} mono />
      <InfoRow label="ADMIN WEBSOCKET URL" value={info?.wsAdminUrl || "-"} mono />
      <InfoRow label="DATABASE FILE" value={info?.dbPath || "-"} mono />
      <InfoRow label="DATABASE SIZE" value={info ? formatBytes(info.dbSizeBytes) : "-"} mono />
      <InfoRow label="NODE VERSION" value={info?.nodeVersion || "-"} mono />
      <InfoRow label="ELECTRON VERSION" value={info?.electronVersion || "-"} mono />
      <InfoRow label="CHROMIUM VERSION" value={info?.chromeVersion || "-"} mono />

      <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--hairline)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", letterSpacing: 1, marginBottom: 10 }}>DIAGNOSTICS &amp; LOGGING</div>

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>Minimum log level</div>
            <select
              value={levelDraft}
              onChange={(e) => setLevelDraft(e.target.value)}
              style={{ padding: 6, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)" }}
            >
              <option value="debug">Debug (everything)</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error only</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>Retention (days)</div>
            <input
              type="number"
              min={1}
              value={retentionDraft}
              onChange={(e) => setRetentionDraft(Number(e.target.value))}
              style={{ width: 70, padding: 6, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)" }}
            />
          </div>
          <button
            onClick={saveLogSettings}
            disabled={saving}
            style={{ padding: "7px 14px", borderRadius: 5, border: "none", background: "var(--primary)", color: "#04222a", fontWeight: 800, fontSize: 12, cursor: "pointer" }}
          >
            {saving ? "SAVING..." : "SAVE"}
          </button>
        </div>
        <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 14 }}>
          Only events at or above the chosen level are recorded at all - lowering it later won't recover anything skipped while it was higher. Entries older than the retention window are deleted automatically on every write.
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <select
            value={logFilter}
            onChange={(e) => setLogFilter(e.target.value)}
            style={{ padding: 6, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", fontSize: 12 }}
          >
            <option value="debug">Show: all levels</option>
            <option value="info">Show: info and up</option>
            <option value="warn">Show: warnings and up</option>
            <option value="error">Show: errors only</option>
          </select>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => reloadLogs()} style={{ padding: "6px 12px", borderRadius: 5, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 11, cursor: "pointer" }}>
              REFRESH
            </button>
            <a
              href={`${API_BASE}/logs/export?level=${logFilter}`}
              style={{ padding: "6px 12px", borderRadius: 5, border: "1px solid var(--primary)", background: "transparent", color: "var(--primary)", fontSize: 11, fontWeight: 700, textDecoration: "none" }}
            >
              EXPORT
            </a>
          </div>
        </div>

        <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid var(--hairline)", borderRadius: 6 }}>
          {(logs ?? []).length === 0 && <div style={{ padding: 12, fontSize: 13, opacity: 0.5 }}>No log entries at this level yet.</div>}
          {(logs ?? []).map((entry) => (
            <div key={entry.id} style={{ display: "flex", gap: 10, padding: "6px 10px", borderBottom: "1px solid var(--hairline)", fontSize: 12 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-faint)", width: 130, flexShrink: 0 }}>{entry.created_at}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, color: levelColor[entry.level] || "var(--text-muted)", width: 45, flexShrink: 0 }}>
                {entry.level.toUpperCase()}
              </span>
              <span>{entry.message}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
