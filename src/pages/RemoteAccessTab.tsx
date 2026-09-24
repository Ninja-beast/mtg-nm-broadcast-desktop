import React, { useState } from "react";
import { API_BASE, CURRENT_REMOTE_ADDRESS, CURRENT_ACCESS_TOKEN } from "../lib/apiClient";
import { useAccessTokens } from "../hooks/useAuth";
import { Panel } from "../components/shared";

export function RemoteAccessTab() {
  const [tokens, reloadTokens] = useAccessTokens();
  const [label, setLabel] = useState("");
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [connAddress, setConnAddress] = useState(CURRENT_REMOTE_ADDRESS);
  const [connToken, setConnToken] = useState(CURRENT_ACCESS_TOKEN);

  async function saveConnection() {
    await window.electronAPI.saveConnectionConfig({ remoteAddress: connAddress, accessToken: connToken });
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
    if (!window.confirm("Remove this access code entirely?")) return;
    await fetch(`${API_BASE}/access-tokens/${id}`, { method: "DELETE" });
    reloadTokens();
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Remote Access</h2>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Host/client connection and access codes for controlling this app from another machine</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        <Panel title="THIS PC'S CONNECTION" style={{ alignSelf: "start", height: "fit-content" }}>
          <p style={{ fontSize: 13, opacity: 0.7, marginTop: 0 }}>
            Running the app on the HOST PC (same machine as OBS/the server)? Leave this blank - localhost is used automatically.
            Remote-controlling from ANOTHER PC? Fill in the host's address and an access code.
          </p>
          <input
            value={connAddress}
            onChange={(e) => setConnAddress(e.target.value)}
            placeholder="Blank = localhost, otherwise e.g. xxx.trycloudflare.com"
            style={{ width: "100%", padding: 8, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", marginBottom: 8, boxSizing: "border-box" }}
          />
          <input
            value={connToken}
            onChange={(e) => setConnToken(e.target.value)}
            placeholder="Access code (only needed if an address is filled in)"
            style={{ width: "100%", padding: 8, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", marginBottom: 8, boxSizing: "border-box" }}
          />
          <button onClick={saveConnection} style={{ padding: "8px 14px", borderRadius: 5, border: "none", background: "var(--primary)", color: "#04222a", fontWeight: 800 }}>
            Save and connect (restarts the app)
          </button>
        </Panel>

        <Panel title="ACCESS CODES" style={{ alignSelf: "start", height: "fit-content" }}>
          <p style={{ fontSize: 13, opacity: 0.7, marginTop: 0 }}>Only needed for connections coming from outside (via tunnel/internet) - local WiFi needs no code.</p>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={'Label (e.g. "Bob\'s phone")'}
            style={{ width: "100%", padding: 8, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", marginBottom: 10, boxSizing: "border-box" }}
          />
          <button onClick={createToken} style={{ padding: "8px 14px", borderRadius: 5, border: "none", background: "var(--primary)", color: "#04222a", fontWeight: 800, marginBottom: 12 }}>
            Generate new code
          </button>

          {justCreated && (
            <div style={{ marginBottom: 12, padding: 10, borderRadius: 5, background: "var(--bg)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Share this code with the person (shown once here, but can be seen again in the list below):</div>
              <code style={{ fontSize: 14, color: "var(--primary)" }}>{justCreated}</code>
            </div>
          )}

          {(tokens ?? []).length === 0 && <p style={{ fontSize: 13, opacity: 0.6 }}>No access codes created yet.</p>}
          {(tokens ?? []).map((t: any) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--hairline)", gap: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{t.label || "(no label)"}</div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>
                  <code>{t.token}</code> · {t.status === "blocked" ? "Blocked" : "Allowed"}
                  {t.last_used_at ? ` · Last used: ${t.last_used_at}` : " · Not used yet"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => toggleStatus(t.id, t.status)}
                  style={{
                    padding: "4px 10px", borderRadius: 5, border: "none", fontSize: 12, fontWeight: 700,
                    background: t.status === "blocked" ? "var(--border)" : "var(--popover)",
                    color: t.status === "blocked" ? "var(--primary)" : "var(--rose)"
                  }}
                >
                  {t.status === "blocked" ? "Restore" : "Block"}
                </button>
                <button onClick={() => deleteToken(t.id)} style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid var(--rose)", background: "transparent", color: "var(--rose)", fontSize: 12 }}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
