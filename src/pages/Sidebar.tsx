import React, { useState, useEffect } from "react";
import type { SidebarKey, Role, SystemStatus } from "../types";

export const ALL_ROLES: Role[] = ["ADMINISTRATOR", "EVENT", "JUDGE", "PRODUCER"];

// Rolletilgang - hvilke roller som har lov til a se hver side i
// sidemenyen (fra tilgangstabellen). "melee" (Settings) er synlig for
// alle roller siden Settings-siden selv skal begrense hva som vises
// der (Event/Personal/Production-scope per rolle) - det er ikke
// menyens jobb a skjule selve fanen. "stream" (Stream Content) star
// ikke i tilgangstabellen - satt til Admin + Producer siden den
// hoerer sammen med Broadcast/Graphics; si fra hvis den skal ha en
// annen tilgang.
export const ROLE_ACCESS: Record<SidebarKey, Role[]> = {
  dashboard: ["ADMINISTRATOR", "EVENT", "JUDGE", "PRODUCER"],
  match: ["ADMINISTRATOR", "EVENT"],
  broadcast: ["ADMINISTRATOR", "PRODUCER"],
  theme: ["ADMINISTRATOR", "PRODUCER"],
  tournament: ["ADMINISTRATOR", "EVENT"],
  judge: ["ADMINISTRATOR", "EVENT", "JUDGE"],
  system: ["ADMINISTRATOR"],
  access: ["ADMINISTRATOR"],
  remote: ["ADMINISTRATOR"],
  melee: ["ADMINISTRATOR", "EVENT", "JUDGE", "PRODUCER"],
  stream: ["ADMINISTRATOR", "PRODUCER"],
  configuration: ["ADMINISTRATOR", "PRODUCER"]
};

export const SIDEBAR_ITEMS: { key: SidebarKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "match", label: "Match Control" },
  { key: "broadcast", label: "Broadcast" },
  { key: "theme", label: "Graphics" },
  { key: "tournament", label: "Tournament" },
  { key: "judge", label: "Judge Workspace" },
  { key: "system", label: "System Status" },
  { key: "access", label: "Users & Access" },
  { key: "remote", label: "Remote Access" },
  { key: "melee", label: "Settings" },
  { key: "configuration", label: "Configuration" },
  { key: "stream", label: "Stream Content" }
];

export function itemsAllowedForRole(role: Role): { key: SidebarKey; label: string }[] {
  return SIDEBAR_ITEMS.filter((item) => ROLE_ACCESS[item.key].includes(role));
}

export function firstAllowedTab(role: Role): SidebarKey {
  return itemsAllowedForRole(role)[0]?.key ?? "dashboard";
}

export function Sidebar({
  active,
  onSelect,
  user,
  onLogout,
  status,
  liveSyncMs
}: {
  active: SidebarKey;
  onSelect: (key: SidebarKey) => void;
  user: { username: string; role: Role };
  onLogout: () => void;
  status: SystemStatus | null;
  liveSyncMs: number | null;
}) {
  // Kun Administrator kan forhandsvise menyen som en annen rolle -
  // egen (lokal) previewRole-state, starter alltid pa brukerens
  // FAKTISKE rolle. Alle andre roller styres 100% av user.role, som
  // kommer fra ekte innlogging (server/auth.ts) - de kan ikke bytte.
  const isAdmin = user.role === "ADMINISTRATOR";
  const [previewRole, setPreviewRole] = useState<Role>(user.role);
  const effectiveRole = isAdmin ? previewRole : user.role;

  const items = itemsAllowedForRole(effectiveRole);

  // Hvis forhandsvisningen (eller selve brukerens rolle) endrer seg
  // og siden som star aktiv na ikke lenger er i den tillatte listen -
  // hopp til forste tillatte side i stedet for a bli staende pa en
  // side rollen ikke skal se.
  useEffect(() => {
    if (!items.some((item) => item.key === active)) {
      onSelect(firstAllowedTab(effectiveRole));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRole]);

  return (
    <div style={{ width: 240, flexShrink: 0, borderRight: "1px solid var(--border)", padding: "20px 12px", display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box" }}>
      <div style={{ padding: "0 8px 20px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontFamily: "var(--font-mono)", width: 32, height: 32, borderRadius: 5, border: "1px solid var(--primary)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
          OB
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: 1 }}>OBSERVER</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-faint)", letterSpacing: 1 }}>PRE-ALPHA</div>
        </div>
      </div>

      <div style={{ padding: "0 8px 20px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-faint)", letterSpacing: 1, marginBottom: 4 }}>LOGGET INN SOM</div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{user.username}</div>
        <div style={{ fontFamily: "var(--font-mono)", display: "inline-block", marginTop: 4, padding: "3px 8px", borderRadius: 5, border: "1px solid var(--primary)", color: "var(--primary)", fontSize: 10, fontWeight: 700 }}>
          {user.role}
        </div>

        {isAdmin && (
          <>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-faint)", letterSpacing: 1, marginTop: 14, marginBottom: 6 }}>
              ACTIVE ROLE
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {ALL_ROLES.map((role) => (
                <button
                  key={role}
                  onClick={() => setPreviewRole(role)}
                  style={{
                    fontFamily: "var(--font-mono)",
                    padding: "8px 6px",
                    borderRadius: 6,
                    border: previewRole === role ? "1px solid var(--primary)" : "1px solid var(--border)",
                    background: previewRole === role ? "var(--raised)" : "transparent",
                    color: previewRole === role ? "var(--primary)" : "var(--text-muted)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    cursor: "pointer"
                  }}
                >
                  {role}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
        {items.map((item) => (
          <button
            key={item.key}
            onClick={() => onSelect(item.key)}
            style={{
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: 10,
              border: "none",
              background: active === item.key ? "var(--raised)" : "transparent",
              color: active === item.key ? "var(--primary)" : "var(--text-body)",
              fontWeight: active === item.key ? 700 : 500,
              fontSize: 14,
              cursor: "pointer"
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {status?.server.environment === "test" && (
        <div style={{ border: "1px solid var(--warn)", background: "var(--popover)", borderRadius: 10, padding: 10, marginBottom: 10 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--warn)" }}>TEST ENVIRONMENT</div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>Not connected to live production</div>
        </div>
      )}

      <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, marginBottom: 10, fontFamily: "var(--font-mono)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
          <span style={{ fontWeight: 700 }}>OBSERVER SERVER</span>
          <span style={{ color: status?.server.online ? "var(--primary)" : "var(--rose)", fontWeight: 700 }}>{status?.server.online ? "ONLINE" : "OFFLINE"}</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6, display: "flex", justifyContent: "space-between" }}>
          <span>Live sync</span><span>{liveSyncMs != null ? `${liveSyncMs} ms` : "-"}</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, display: "flex", justifyContent: "space-between" }}>
          <span>Connected clients</span><span>{status?.clients ?? "-"}</span>
        </div>
      </div>

      <button
        onClick={onLogout}
        style={{ fontSize: 12, opacity: 0.6, padding: "4px 8px", background: "none", border: "none", color: "var(--text-body)", textAlign: "left", cursor: "pointer" }}
      >
        LOG OUT &nbsp;-&nbsp; {user.role}
      </button>
    </div>
  );
}

