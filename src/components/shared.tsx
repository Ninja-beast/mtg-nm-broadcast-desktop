import React, { useState, useEffect } from "react";
import { API_BASE, useJson } from "../lib/apiClient";
import type { SystemAlert } from "../types";

export function PlayerDeckInput({ playerId, currentValue, onSave }: { playerId: number; currentValue: string; onSave: (playerId: number, archetype: string) => void }) {
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
      style={{ flex: 1, padding: 4, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", fontSize: 12 }}
    />
  );
}
export function RoundSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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

  const selectStyle = { width: 160, padding: 4, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", fontSize: 12, marginRight: 6 };

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        <select style={selectStyle} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">Velg runde...</option>
          {rounds.map((r: string) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <button onClick={() => setShowManage((v) => !v)} style={{ padding: "4px 8px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--border)", color: "var(--text-heading)", fontSize: 11 }}>
          Adm.
        </button>
      </span>

      {showManage && (
        <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 5, padding: 8, maxWidth: 260 }}>
          {rounds.map((r: string, index: number) => (
            <div key={r + index} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, marginBottom: 4, gap: 4 }}>
              <span>{r}</span>
              <span style={{ display: "flex", gap: 2 }}>
                <button onClick={() => moveRound(index, -1)} style={{ padding: "2px 6px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--border)", color: "var(--primary)", fontSize: 11 }}>↑</button>
                <button onClick={() => moveRound(index, 1)} style={{ padding: "2px 6px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--border)", color: "var(--primary)", fontSize: 11 }}>↓</button>
                <button onClick={() => deleteRound(index)} style={{ padding: "2px 6px", borderRadius: 5, border: "1px solid var(--rose)", background: "var(--popover)", color: "var(--rose)", fontSize: 11 }}>✕</button>
              </span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            <input
              value={newRound}
              onChange={(e) => setNewRound(e.target.value)}
              placeholder="Nytt valg"
              style={{ flex: 1, padding: 4, borderRadius: 5, border: "1px solid var(--border)", background: "var(--raised)", color: "var(--text-heading)", fontSize: 12 }}
            />
            <button onClick={addRound} style={{ padding: "4px 8px", borderRadius: 5, border: "none", background: "var(--rose)", color: "var(--text-heading)", fontSize: 11 }}>
              Legg til
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
export function formatUptime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function StatusDot({ ok, blink, color: colorOverride }: { ok: boolean | null; blink?: boolean; color?: string }) {
  const color = colorOverride || (ok === null ? "var(--text-faint)" : ok ? "var(--primary)" : "var(--rose)");
  return (
    <span
      style={{
        display: "inline-block",
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: color,
        marginRight: 8,
        animation: blink && ok ? "pulse-blink 1.4s ease-in-out infinite" : undefined
      }}
    />
  );
}

export function Panel({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, background: "var(--panel)", padding: 16, ...style }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "var(--text-muted)", marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

export function InfoRow({ label, value, accent, mono }: { label: React.ReactNode; value: React.ReactNode; accent?: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--hairline)", fontSize: 13 }}>
      <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", letterSpacing: 0.5, display: "flex", alignItems: "center" }}>{label}</span>
      <span style={{ fontFamily: mono ? "var(--font-mono)" : undefined, fontWeight: 700, color: accent || "var(--text-heading)" }}>{value}</span>
    </div>
  );
}

export function QuickActionButton({ label, onClick, tone, disabled, compact }: { label: string; onClick: () => void; tone?: "warn" | "danger"; disabled?: boolean; compact?: boolean }) {
  const bg = disabled ? "var(--raised)" : tone === "danger" ? "var(--popover)" : tone === "warn" ? "var(--popover)" : "var(--popover)";
  const color = disabled ? "var(--text-faint)" : tone === "danger" ? "var(--rose)" : tone === "warn" ? "var(--warn)" : "var(--primary)";
  const border = disabled ? "var(--border)" : tone === "danger" ? "var(--rose)" : tone === "warn" ? "var(--warn)" : "var(--primary)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: compact ? "8px 10px" : "14px 10px",
        minHeight: compact ? 36 : 52,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        borderRadius: 10,
        border: `1px solid ${border}`,
        background: bg,
        color,
        fontWeight: 800,
        fontSize: compact ? 12 : 13,
        letterSpacing: 0.5,
        cursor: disabled ? "not-allowed" : "pointer"
      }}
    >
      {label}
    </button>
  );
}

export function AlertCard({ alert, onRetry, detail }: { alert: SystemAlert; onRetry?: () => void; detail?: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const bg = alert.level === "error" ? "var(--popover)" : alert.level === "warn" ? "var(--popover)" : "var(--popover)";
  const border = alert.level === "error" ? "var(--rose)" : alert.level === "warn" ? "var(--warn)" : "var(--primary)";
  const labelColor = alert.level === "error" ? "var(--rose)" : alert.level === "warn" ? "var(--warn)" : "var(--primary)";

  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: labelColor, letterSpacing: 1 }}>{alert.level.toUpperCase()} &nbsp; {alert.title}</div>
      <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{alert.message}</div>
      <div style={{ marginTop: 8, display: "flex", gap: 14, alignItems: "center" }}>
        {onRetry && (
          <button onClick={onRetry} style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${border}`, background: "transparent", color: labelColor, fontSize: 12 }}>
            Retry
          </button>
        )}
        {detail && (
          <button onClick={() => setExpanded((v) => !v)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
            Details
          </button>
        )}
      </div>
      {expanded && detail && (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7, borderTop: "1px solid " + border, paddingTop: 8 }}>
          {detail}
        </div>
      )}
    </div>
  );
}

