import React, { useState } from "react";
import { API_BASE } from "../lib/apiClient";
import type { Role } from "../types";

export function LoginScreen({
  hasUsers,
  onLoggedIn
}: {
  hasUsers: boolean;
  onLoggedIn: (session: { token: string; username: string; roles: Role[] }) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!username.trim() || !password) {
      setError("Fyll ut bade brukernavn og passord.");
      return;
    }
    setBusy(true);
    setError("");

    try {
      if (!hasUsers) {
        // Forste gang appen tas i bruk - oppretter den forste kontoen
        // (blir alltid Administrator, siden noen ma kunne opprette
        // flere kontoer etterpa).
        const createRes = await fetch(`${API_BASE}/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, roles: ["ADMINISTRATOR"] })
        });
        if (!createRes.ok) {
          const body = await createRes.json().catch(() => ({}));
          setError(body.error || "Klarte ikke opprette konto.");
          setBusy(false);
          return;
        }
      }

      const loginRes = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      if (!loginRes.ok) {
        const body = await loginRes.json().catch(() => ({}));
        setError(body.error || "Feil brukernavn eller passord.");
        setBusy(false);
        return;
      }

      const data = await loginRes.json();
      onLoggedIn({ token: data.token, username: data.username, roles: data.roles });
    } catch (err) {
      setError("Klarte ikke na serveren.");
      setBusy(false);
    }
  }

  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 320, border: "1px solid var(--border)", borderRadius: 10, background: "var(--panel)", padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ width: 32, height: 32, borderRadius: 5, border: "1px solid var(--primary)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 12 }}>
            OB
          </div>
          <div style={{ fontWeight: 900, fontSize: 18, letterSpacing: 1 }}>OBSERVER</div>
        </div>

        <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 16 }}>
          {hasUsers ? "Logg inn for a fortsette." : "Opprett den forste kontoen (blir Administrator)."}
        </div>

        <label style={{ fontSize: 11, opacity: 0.6 }}>Brukernavn</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          style={{ width: "100%", padding: 8, marginTop: 4, marginBottom: 12, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", boxSizing: "border-box" }}
        />

        <label style={{ fontSize: 11, opacity: 0.6 }}>Passord</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          style={{ width: "100%", padding: 8, marginTop: 4, marginBottom: 16, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", boxSizing: "border-box" }}
        />

        {error && <div style={{ color: "var(--rose)", fontSize: 12, marginBottom: 12 }}>{error}</div>}

        <button
          onClick={submit}
          disabled={busy}
          style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--primary)", background: "var(--popover)", color: "var(--primary)", fontWeight: 800, cursor: busy ? "wait" : "pointer" }}
        >
          {busy ? "..." : hasUsers ? "LOGG INN" : "OPPRETT KONTO"}
        </button>
      </div>
    </div>
  );
}

