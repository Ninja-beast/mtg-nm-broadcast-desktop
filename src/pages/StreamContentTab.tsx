import React, { useState, useEffect } from "react";
import { API_BASE } from "../lib/apiClient";
import { useStreamContentSettings } from "../hooks/useContent";

export function StreamContentTab() {
  const [content, reloadContent] = useStreamContentSettings();
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    if (content) setFields(content);
  }, [content]);

  function setField(key: string, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    await fetch(`${API_BASE}/settings/stream-content`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields)
    });
    reloadContent();
  }

  const inputStyle = { width: "100%", padding: 8, marginBottom: 8, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)" };

  const groups: [string, string][] = [
    ["caster1Name", "Caster 1 - fornavn"],
    ["caster1LastName", "Caster 1 - etternavn"],
    ["caster1Tag", "Caster 1 - tag/kanal"],
    ["caster2Name", "Caster 2 - fornavn"],
    ["caster2LastName", "Caster 2 - etternavn"],
    ["caster2Tag", "Caster 2 - tag/kanal"],
    ["sponsorSlot", "Sponsor-tekst"],
    ["tickerText", "Rullende tekst (ticker)"],
    ["brollLabel", "B-roll-etikett"],
    ["logoYear", "Logo - ar"],
    ["logoName", "Logo - navn"],
    ["cornerNumber", "Hjorne-nummer"]
  ];

  return (
    <div>
      <h2>Stream-innhold</h2>
      <div style={{ background: "var(--raised)", padding: 16, borderRadius: 10, maxWidth: 480 }}>
        {groups.map(([key, label]) => (
          <div key={key}>
            <label style={{ fontSize: 12, opacity: 0.8 }}>{label}</label>
            <input style={inputStyle} value={fields[key] ?? ""} onChange={(e) => setField(key, e.target.value)} />
          </div>
        ))}
        <button onClick={save} style={{ padding: "8px 14px", borderRadius: 5, border: "none", background: "var(--rose)", color: "var(--text-heading)", fontWeight: 700 }}>
          Lagre
        </button>
      </div>
    </div>
  );
}

