import React, { useState } from "react";
import { API_BASE, useJson } from "../lib/apiClient";
import type { Role, SharedDashboardData } from "../types";
import { Panel, InfoRow, QuickActionButton } from "../components/shared";
import { ALL_ROLES, ROLE_ACCESS, SIDEBAR_ITEMS } from "../components/Sidebar";

type UserRow = { id: number; username: string; role: Role; roles: Role[]; created_at: string };
type PendingAction =
  | { type: "delete"; user: UserRow }
  | { type: "roles"; user: UserRow; newRoles: Role[] };

function roleLabel(role: Role): string {
  if (role === "ADMINISTRATOR") return "Administrator";
  if (role === "EVENT") return "Event Manager";
  if (role === "JUDGE") return "Judge";
  return "Producer";
}

// Ekte, utledet fra ROLE_ACCESS (samme kilde sidemenyen selv bruker) -
// ikke faste, oppdiktede etiketter som kan komme ut av sync med hva
// rollen faktisk har tilgang til.
function roleSummary(role: Role): string {
  const allowed = SIDEBAR_ITEMS.filter((item) => ROLE_ACCESS[item.key].includes(role));
  if (allowed.length === SIDEBAR_ITEMS.length) return "Full access";
  if (allowed.length === 0) return "No access";
  const labels = allowed.map((i) => i.label);
  return labels.length > 3 ? `${labels.slice(0, 3).join(", ")}…` : labels.join(", ");
}

function sameRoleSet(a: Role[], b: Role[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((r, i) => r === sortedB[i]);
}

function UserAccountsSection() {
  const [users, reloadUsers] = useJson<UserRow[]>(`${API_BASE}/users`, []);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRoles, setNewRoles] = useState<Role[]>(["EVENT"]);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftRoles, setDraftRoles] = useState<Role[]>([]);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const allUsers = users ?? [];

  function toggleNewRole(role: Role) {
    setNewRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  function toggleDraftRole(role: Role) {
    setDraftRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  function startEditing(u: UserRow) {
    setEditingId((id) => (id === u.id ? null : u.id));
    setDraftRoles(u.roles);
  }

  async function createUser() {
    setError("");
    if (!newUsername.trim() || !newPassword) {
      setError("Fill in a username and password.");
      return;
    }
    if (newRoles.length === 0) {
      setError("Pick at least one role.");
      return;
    }
    const res = await fetch(`${API_BASE}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: newUsername, password: newPassword, roles: newRoles })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Could not create the account.");
      return;
    }
    setNewUsername("");
    setNewPassword("");
    setNewRoles(["EVENT"]);
    setShowAddForm(false);
    reloadUsers();
  }

  function requestSaveRoles(u: UserRow) {
    if (draftRoles.length === 0) {
      setError("An account needs at least one role - can't save an empty set.");
      return;
    }
    if (sameRoleSet(draftRoles, u.roles)) {
      setEditingId(null);
      return;
    }
    setPending({ type: "roles", user: u, newRoles: draftRoles });
  }

  async function confirmPending() {
    if (!pending) return;
    if (pending.type === "delete") {
      await fetch(`${API_BASE}/users/${pending.user.id}`, { method: "DELETE" });
    } else {
      await fetch(`${API_BASE}/users/${pending.user.id}/roles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: pending.newRoles })
      });
    }
    setPending(null);
    setEditingId(null);
    reloadUsers();
  }

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, alignItems: "start", marginBottom: 16 }}>
        {/* USERS */}
        <Panel title="USERS" style={{ alignSelf: "start", height: "fit-content" }}>
          {allUsers.length === 0 && <div style={{ fontSize: 13, opacity: 0.5 }}>No accounts yet.</div>}
          {allUsers.map((u) => (
            <div key={u.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--hairline)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{u.username}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)" }}>Created {u.created_at}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 220 }}>
                    {u.roles.map((role) => (
                      <span
                        key={role}
                        style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 5, border: "1px solid var(--primary)", color: "var(--primary)" }}
                      >
                        {roleLabel(role).toUpperCase()}
                      </span>
                    ))}
                  </div>
                  <button
                    onClick={() => startEditing(u)}
                    style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 11, cursor: "pointer" }}
                  >
                    EDIT
                  </button>
                </div>
              </div>

              {editingId === u.id && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 6 }}>
                    Roles combine - check as many as this account should have (e.g. Judge + Producer for a caster-judge).
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                    {ALL_ROLES.map((role) => (
                      <label key={role} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                        <input type="checkbox" checked={draftRoles.includes(role)} onChange={() => toggleDraftRole(role)} />
                        {roleLabel(role)}
                      </label>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => requestSaveRoles(u)}
                      style={{ padding: "6px 12px", borderRadius: 5, border: "1px solid var(--primary)", background: "var(--popover)", color: "var(--primary)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                    >
                      SAVE ROLES
                    </button>
                    <button
                      onClick={() => setPending({ type: "delete", user: u })}
                      style={{ padding: "6px 10px", borderRadius: 5, border: "1px solid var(--rose)", background: "transparent", color: "var(--rose)", fontSize: 12, cursor: "pointer" }}
                    >
                      REVOKE ACCESS
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {error && <div style={{ color: "var(--rose)", fontSize: 12, marginTop: 10 }}>{error}</div>}

          {showAddForm ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <input
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="Username"
                  style={{ flex: 1, minWidth: 110, padding: 8, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)" }}
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Password"
                  style={{ flex: 1, minWidth: 110, padding: 8, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)" }}
                />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                {ALL_ROLES.map((role) => (
                  <label key={role} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={newRoles.includes(role)} onChange={() => toggleNewRole(role)} />
                    {roleLabel(role)}
                  </label>
                ))}
              </div>
              <button onClick={createUser} style={{ padding: "8px 14px", borderRadius: 5, border: "none", background: "var(--primary)", color: "#04222a", fontWeight: 800 }}>
                Create
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 14 }}>
              <QuickActionButton label="ADD USER" onClick={() => setShowAddForm(true)} compact />
              <QuickActionButton label="INVITE" onClick={() => window.alert("Email invites aren't built yet - create an account with a username/password above instead.")} compact />
              <button
                onClick={() => allUsers[0] && setPending({ type: "delete", user: allUsers[0] })}
                disabled={allUsers.length === 0}
                style={{ padding: "10px 8px", borderRadius: 6, border: "1px solid var(--rose)", background: "transparent", color: "var(--rose)", fontWeight: 800, fontSize: 12, cursor: allUsers.length === 0 ? "not-allowed" : "pointer", opacity: allUsers.length === 0 ? 0.4 : 1 }}
              >
                REVOKE ACCESS
              </button>
            </div>
          )}
        </Panel>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, alignSelf: "start" }}>
          {/* ROLE SUMMARY */}
          <Panel title="ROLE SUMMARY">
            {ALL_ROLES.map((r) => (
              <InfoRow key={r} label={roleLabel(r).toUpperCase()} value={roleSummary(r)} />
            ))}
            <div style={{ fontSize: 11, opacity: 0.55, marginTop: 8 }}>
              Example combinations: ADMINISTRATOR + PRODUCER, JUDGE + PRODUCER. Roles combine - an account with two roles gets the union of both, not a separate in-between access level.
            </div>
          </Panel>

          {/* DESTRUCTIVE ACTION */}
          {pending && (
            <Panel
              title={pending.type === "delete" ? "⚠ REVOKE ACCESS?" : "CONFIRM ROLE CHANGE"}
              style={pending.type === "delete" ? { border: "1px solid var(--rose)" } : undefined}
            >
              {pending.type === "delete" ? (
                <>
                  <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6, color: "var(--rose)" }}>
                    Permanently delete {pending.user.username}'s account?
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 12 }}>
                    This cannot be undone. They will immediately lose access on every connected client, and their account will be gone - not disabled, deleted.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                    Change {pending.user.username}'s roles from {pending.user.roles.map(roleLabel).join(" + ")} to {pending.newRoles.map(roleLabel).join(" + ")}?
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>
                    Their menu and page access will change immediately on next reload.
                  </div>
                </>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setPending(null)} style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}>
                  Cancel
                </button>
                <button
                  onClick={confirmPending}
                  style={{
                    padding: "8px 14px", borderRadius: 6, fontWeight: 800, fontSize: 12, cursor: "pointer",
                    border: `1px solid var(--rose)`,
                    background: pending.type === "delete" ? "var(--rose)" : "var(--popover)",
                    color: pending.type === "delete" ? "#3a0a12" : "var(--rose)"
                  }}
                >
                  {pending.type === "delete" ? "YES, DELETE ACCOUNT" : "SAVE ROLES"}
                </button>
              </div>
            </Panel>
          )}
        </div>
      </div>

      {/* PERMISSION MATRIX */}
      <Panel title="PERMISSION MATRIX">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 10px", fontFamily: "var(--font-mono)", color: "var(--text-faint)", fontSize: 11 }}>ROLE</th>
                {SIDEBAR_ITEMS.map((item) => (
                  <th key={item.key} style={{ textAlign: "center", padding: "6px 10px", fontFamily: "var(--font-mono)", color: "var(--text-faint)", fontSize: 11, whiteSpace: "nowrap" }}>
                    {item.label.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_ROLES.map((r) => (
                <tr key={r} style={{ borderTop: "1px solid var(--hairline)" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 700 }}>{roleLabel(r)}</td>
                  {SIDEBAR_ITEMS.map((item) => {
                    const allowed = ROLE_ACCESS[item.key].includes(r);
                    return (
                      <td key={item.key} style={{ textAlign: "center", padding: "8px 10px", color: allowed ? "var(--primary)" : "var(--text-faint)" }}>
                        {allowed ? "✓" : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, opacity: 0.55, marginTop: 8 }}>
          For an account with multiple roles, access is the union of every row that applies - having Judge + Producer means everything both rows check.
        </div>
      </Panel>
    </>
  );
}

export function AccessTab({ shared }: { shared?: SharedDashboardData }) {
  const [users] = useJson<UserRow[]>(`${API_BASE}/users`, []);
  const connectedClients = shared?.status?.clients ?? 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Users &amp; Access</h2>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>One application, roles combine instead of multiplying</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, padding: "6px 12px", borderRadius: 20, border: "1px solid var(--border)", color: "var(--text-muted)", background: "var(--popover)" }}>
            {(users ?? []).length} USERS
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, padding: "6px 12px", borderRadius: 20, border: "1px solid var(--primary)", color: "#04222a", background: "var(--primary)" }}>
            {connectedClients} CONNECTED
          </span>
        </div>
      </div>

      <UserAccountsSection />
    </div>
  );
}
