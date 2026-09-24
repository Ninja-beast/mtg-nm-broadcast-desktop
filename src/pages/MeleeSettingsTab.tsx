import React, { useState, useEffect } from "react";
import { API_BASE, useJson } from "../lib/apiClient";
import { SCENE_LABELS, SCENE_KEYS_ORDERED } from "../lib/scenes";

function ObsConnectionSettings() {
  const [obsStatus, reloadObsStatus] = useJson<{
    connected: boolean;
    lastError: string;
    host: string;
    port: string;
  }>(`${API_BASE}/settings/obs`, []);

  const [obsHost, setObsHost] = useState("localhost");
  const [obsPort, setObsPort] = useState("4455");
  const [obsPassword, setObsPassword] = useState("");
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (obsStatus?.host) setObsHost(obsStatus.host);
    if (obsStatus?.port) setObsPort(obsStatus.port);
  }, [obsStatus?.host, obsStatus?.port]);

  async function saveObsSettings() {
    await fetch(`${API_BASE}/settings/obs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host: obsHost, port: obsPort, password: obsPassword })
    });
    setObsPassword("");
    reloadObsStatus();
  }

  async function connectToObs() {
    setConnecting(true);
    await saveObsSettings();
    await fetch(`${API_BASE}/settings/obs/connect`, { method: "POST" });
    setConnecting(false);
    reloadObsStatus();
  }

  const inputStyle = { padding: 6, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", marginRight: 8 };

  return (
    <div style={{ background: "var(--raised)", padding: 16, borderRadius: 10, maxWidth: 560, marginBottom: 20 }}>
      <h3 style={{ marginTop: 0 }}>OBS-tilkobling</h3>
      <div style={{ marginBottom: 8, fontWeight: 700 }}>
        Status: {obsStatus?.connected ? <span style={{ color: "var(--primary)" }}>Tilkoblet</span> : <span style={{ color: "var(--warn)" }}>Ikke tilkoblet</span>}
      </div>
      {obsStatus?.lastError && !obsStatus?.connected && (
        <div style={{ color: "var(--warn)", fontSize: 12, marginBottom: 8 }}>{obsStatus.lastError}</div>
      )}
      <div style={{ marginBottom: 8, opacity: 0.7, fontSize: 12 }}>
        Skru pa i OBS: Verktoy \u2192 WebSocket Server Settings \u2192 Enable WebSocket server. Noter port og passord.
      </div>
      <input style={{ ...inputStyle, width: 140 }} value={obsHost} onChange={(e) => setObsHost(e.target.value)} placeholder="Vert (localhost)" />
      <input style={{ ...inputStyle, width: 80 }} value={obsPort} onChange={(e) => setObsPort(e.target.value)} placeholder="Port (4455)" />
      <input style={{ ...inputStyle, width: 140 }} type="password" value={obsPassword} onChange={(e) => setObsPassword(e.target.value)} placeholder="Passord" />
      <button onClick={connectToObs} disabled={connecting} style={{ padding: "6px 14px", borderRadius: 5, border: "none", background: "var(--rose)", color: "var(--text-heading)", fontWeight: 700 }}>
        {connecting ? "Kobler..." : "Koble til OBS"}
      </button>
    </div>
  );
}

function ObsSceneNameOverrides() {
  const [settings, reloadSettings] = useJson<{ sceneNameOverrides: Record<string, string> }>(`${API_BASE}/settings/obs`, []);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settings?.sceneNameOverrides) setValues(settings.sceneNameOverrides);
  }, [settings?.sceneNameOverrides]);

  async function save(sceneKey: string) {
    await fetch(`${API_BASE}/settings/obs/scene-name`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneKey, obsSceneName: values[sceneKey] || "" })
    });
    reloadSettings();
  }

  return (
    <div style={{ background: "var(--raised)", padding: 16, borderRadius: 10, maxWidth: 560, marginBottom: 20 }}>
      <h3 style={{ marginTop: 0 }}>OBS-scenenavn per knapp (Broadcast)</h3>
      <p style={{ fontSize: 13, opacity: 0.7 }}>
        Hver knapp i Broadcast Control ma matche navnet pa en faktisk scene i OBS. Tom = bruker knappens nokkel direkte som scenenavn. De 5 siste (Day 2 bracket, Placeholder, Floor, Interview, End Stream) har ingen egen overlay-side - lag dem selv som vanlige OBS-scener (kamera, grafikk osv.) og sett riktig navn her.
      </p>
      {SCENE_KEYS_ORDERED.map((key) => (
        <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ width: 140, fontSize: 13 }}>{SCENE_LABELS[key]}</span>
          <input
            value={values[key] || ""}
            onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            placeholder={`OBS-scenenavn (default: "${key}")`}
            style={{ flex: 1, padding: 6, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)" }}
          />
          <button onClick={() => save(key)} style={{ padding: "6px 12px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--raised)", color: "var(--text-heading)" }}>
            Lagre
          </button>
        </div>
      ))}
    </div>
  );
}

function MetaKeycardsSection() {
  const [meta] = useJson<{ rows: { archetype: string; count: string; share: string }[] }>(`${API_BASE}/scenes/meta`, []);
  const [overrides, reloadOverrides] = useJson<{ archetype_key: string; archetype_label: string; key_card_1: string; key_card_2: string }[]>(
    `${API_BASE}/meta-keycards`,
    []
  );
  const [inputs, setInputs] = useState<Record<string, { keyCard1: string; keyCard2: string }>>({});

  function normalizeKey(name: string) {
    return String(name || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  useEffect(() => {
    if (!overrides) return;
    const next: Record<string, { keyCard1: string; keyCard2: string }> = {};
    overrides.forEach((o) => {
      next[o.archetype_key] = { keyCard1: o.key_card_1, keyCard2: o.key_card_2 };
    });
    setInputs((prev) => ({ ...next, ...prev }));
  }, [overrides]);

  async function saveKeycards(archetype: string) {
    const key = normalizeKey(archetype);
    const values = inputs[key] ?? { keyCard1: "", keyCard2: "" };
    await fetch(`${API_BASE}/meta-keycards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archetype, keyCard1: values.keyCard1, keyCard2: values.keyCard2 })
    });
    reloadOverrides();
  }

  const inputStyle = { width: 160, padding: 4, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", fontSize: 12, marginRight: 6 };

  return (
    <div style={{ marginTop: 20 }}>
      <h3>Nokkelkort per arketype (meta breakdown)</h3>
      <div style={{ background: "var(--raised)", padding: 12, borderRadius: 10 }}>
        {(!meta?.rows || meta.rows.length === 0) && <div style={{ opacity: 0.6 }}>Ingen arketyper funnet enna - synk Melee forst.</div>}
        {(meta?.rows ?? []).map((row) => {
          const key = normalizeKey(row.archetype);
          const values = inputs[key] ?? { keyCard1: "", keyCard2: "" };
          return (
            <div key={key} style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
              <span style={{ width: 200, fontSize: 13 }}>{row.archetype}</span>
              <input
                value={values.keyCard1}
                onChange={(e) => setInputs((f) => ({ ...f, [key]: { ...values, keyCard1: e.target.value } }))}
                placeholder="Nokkelkort 1"
                style={inputStyle}
              />
              <input
                value={values.keyCard2}
                onChange={(e) => setInputs((f) => ({ ...f, [key]: { ...values, keyCard2: e.target.value } }))}
                placeholder="Nokkelkort 2"
                style={inputStyle}
              />
              <button onClick={() => saveKeycards(row.archetype)} style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--border)", color: "var(--text-heading)", fontSize: 12 }}>
                Lagre
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MeleeSettingsTab() {
  const [settings, reloadSettings] = useJson<{ hasClientId: boolean; hasClientSecret: boolean; tournamentId: string; enabled: boolean }>(
    `${API_BASE}/settings/melee`,
    []
  );
  const [log, reloadLog] = useJson<{ id: number; ran_at: string; ok: number; message: string }[]>(`${API_BASE}/melee/log`, []);

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [tournamentId, setTournamentId] = useState("");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (settings) {
      setTournamentId(settings.tournamentId || "");
    }
  }, [settings]);

  async function saveSettings() {
    await fetch(`${API_BASE}/settings/melee`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: clientId || undefined,       // ikke overskriv med tomt hvis feltet star urort
        clientSecret: clientSecret || undefined, // ikke overskriv med tomt hvis feltet star urort
        tournamentId
      })
    });
    setClientId("");
    setClientSecret("");
    reloadSettings();
  }

  async function toggleEnabled() {
    await fetch(`${API_BASE}/settings/melee`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !settings?.enabled })
    });
    reloadSettings();
  }

  async function syncNow() {
    setSyncing(true);
    await fetch(`${API_BASE}/melee/sync`, { method: "POST" });
    setSyncing(false);
    reloadLog();
  }

  const inputStyle = { width: "100%", padding: 8, marginBottom: 8, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)" };

  return (
    <div>
      <h2>Melee-innstillinger</h2>

      <ObsConnectionSettings />
      <ObsSceneNameOverrides />

      <div style={{ background: "var(--raised)", padding: 16, borderRadius: 10, maxWidth: 480, marginBottom: 20 }}>
        <label>Melee Client ID {settings?.hasClientId && <span style={{ opacity: 0.6 }}>(allerede lagret - la sta tom for a beholde)</span>}</label>
        <input style={inputStyle} type="password" value={clientId} onChange={(e) => setClientId(e.target.value)} />

        <label>Melee Client Secret {settings?.hasClientSecret && <span style={{ opacity: 0.6 }}>(allerede lagret - la sta tom for a beholde)</span>}</label>
        <input style={inputStyle} type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />

        <label>Melee turnerings-ID</label>
        <input style={inputStyle} value={tournamentId} onChange={(e) => setTournamentId(e.target.value)} placeholder="f.eks. 448021" />

        <button onClick={saveSettings} style={{ padding: "8px 14px", borderRadius: 5, border: "none", background: "var(--rose)", color: "var(--text-heading)", fontWeight: 700, marginRight: 8 }}>
          Lagre
        </button>

        <button onClick={toggleEnabled} style={{ padding: "8px 14px", borderRadius: 5, border: "1px solid var(--border)", background: settings?.enabled ? "var(--border)" : "var(--raised)", color: "var(--text-heading)" }}>
          Melee-sync: {settings?.enabled ? "PA" : "AV"}
        </button>
      </div>

      <button onClick={syncNow} disabled={syncing} style={{ padding: "10px 16px", borderRadius: 5, border: "none", background: "var(--border)", color: "var(--text-heading)", fontWeight: 700, marginBottom: 16 }}>
        {syncing ? "Synker..." : "Synk na"}
      </button>

      <h3>Siste synk-forsok</h3>
      <div style={{ background: "var(--raised)", padding: 12, borderRadius: 10, maxHeight: 300, overflowY: "auto" }}>
        {(log ?? []).length === 0 && <div style={{ opacity: 0.6 }}>Ingen synk enna.</div>}
        {(log ?? []).map((entry) => (
          <div key={entry.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--border)", color: entry.ok ? "var(--primary)" : "var(--rose)" }}>
            <span style={{ opacity: 0.6, marginRight: 8 }}>{entry.ran_at}</span>
            {entry.message}
          </div>
        ))}
      </div>

      <MetaKeycardsSection />

      <div style={{ marginTop: 30, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
        <ThemeTab />
      </div>
    </div>
  );
}

function ThemeTab() {
  const [themesList, reloadThemesList] = useJson<{ names: string[]; activeName: string }>(`${API_BASE}/themes`, []);
  const [activeTheme] = useJson<{ hiddenLogoScenes?: string[] }>(`${API_BASE}/themes/active`, []);
  const [bgImageUrl, setBgImageUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [customCss, setCustomCss] = useState("");
  const [customCssFileName, setCustomCssFileName] = useState("");
  const [themeName, setThemeName] = useState("");
  const [hiddenLogoScenes, setHiddenLogoScenes] = useState<string[]>([]);
  const [scenesLoaded, setScenesLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);

  useEffect(() => {
    if (activeTheme && !scenesLoaded) {
      setHiddenLogoScenes(Array.isArray(activeTheme.hiddenLogoScenes) ? activeTheme.hiddenLogoScenes : []);
      setScenesLoaded(true);
    }
  }, [activeTheme, scenesLoaded]);

  const LOGO_SCENES: { key: string; label: string }[] = [
    { key: "bo3", label: "BO3 (kampsiden)" },
    { key: "bo5", label: "BO5 (kampsiden)" },
    { key: "meta", label: "Meta breakdown" },
    { key: "top16", label: "Top 16" },
    { key: "bracket", label: "Top 8-brakett" },
    { key: "casterdesk", label: "Casters Desk" },
    { key: "starting", label: "Stream Starting Widget" }
  ];

  function toggleLogoScene(key: string) {
    setHiddenLogoScenes((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function saveAsNewTheme() {
    const name = themeName.trim();
    if (!name) {
      window.alert("Skriv inn et navn pa temaet forst (f.eks. NM).");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/themes/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, bgImageUrl, logoUrl, customCss, hiddenLogoScenes })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || `Kunne ikke lagre tema (feil ${res.status}).`);
        return;
      }
      reloadThemesList();
      window.alert(`Tema "${name}" lagret og aktivert - overlayene oppdaterer seg innen noen sekunder.`);
    } catch (err) {
      window.alert("Kunne ikke na serveren - sjekk at appen kjorer.");
    } finally {
      setSaving(false);
    }
  }

  async function clearLogoNow() {
    const activeName = themesList?.activeName;
    if (!activeName) {
      window.alert("Ingen aktivt tema a fjerne logo fra.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/themes/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: activeName, clearLogo: true })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || `Kunne ikke fjerne logo (feil ${res.status}).`);
        return;
      }
      setLogoUrl("");
      window.alert("Logo fjernet fra det aktive temaet.");
    } catch (err) {
      window.alert("Kunne ikke na serveren - sjekk at appen kjorer.");
    }
  }

  async function activateTheme(name: string) {
    setActivating(name);
    try {
      const res = await fetch(`${API_BASE}/themes/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || `Kunne ikke bytte tema (feil ${res.status}).`);
        return;
      }
      reloadThemesList();
    } catch (err) {
      window.alert("Kunne ikke na serveren - sjekk at appen kjorer.");
    } finally {
      setActivating(null);
    }
  }

  async function pickBgImage() {
    const dataUri = await window.electronAPI.pickImageFile();
    if (dataUri) setBgImageUrl(dataUri);
  }

  async function pickLogo() {
    const dataUri = await window.electronAPI.pickImageFile();
    if (dataUri) setLogoUrl(dataUri);
  }

  async function pickCss() {
    const cssText = await window.electronAPI.pickCssFile();
    if (cssText != null) {
      setCustomCss(cssText);
      setCustomCssFileName("Fil valgt (" + cssText.length + " tegn)");
    }
  }

  async function pickThemeFiles() {
    const result = await window.electronAPI.pickThemeFiles();
    if (!result) return;
    if (result.bgImageUrl) setBgImageUrl(result.bgImageUrl);
    if (result.logoUrl) setLogoUrl(result.logoUrl);
    if (result.customCss != null) {
      setCustomCss(result.customCss);
      setCustomCssFileName("Fil valgt (" + result.customCss.length + " tegn)");
    }
  }

  const inputStyle = { width: "100%", padding: 8, borderRadius: 5, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-heading)", marginBottom: 10 };
  const pickerRowStyle = { display: "flex", gap: 8, marginBottom: 10 };
  const pickBtnStyle = { padding: "0 14px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--border)", color: "var(--text-heading)", whiteSpace: "nowrap" as const };

  return (
    <div style={{ background: "var(--raised)", padding: 16, borderRadius: 10, maxWidth: 560 }}>
      <h3 style={{ marginTop: 0 }}>Tema</h3>
      <p style={{ fontSize: 13, opacity: 0.7 }}>
        Et tema er en navngitt samling av bakgrunn/logo/CSS lagret som ekte filer i overlay-mappen.
        Endringer vises live på overlayene i OBS innen noen sekunder, ingen restart nødvendig.
      </p>

      {(themesList?.names?.length ?? 0) > 0 && (
        <>
          <label style={{ fontSize: 12, opacity: 0.7 }}>Lagrede temaer</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
            {themesList!.names.map((name) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, opacity: name === themesList!.activeName ? 1 : 0.7, fontWeight: name === themesList!.activeName ? 700 : 400 }}>
                  {name} {name === themesList!.activeName ? "(aktiv)" : ""}
                </span>
                <button
                  onClick={() => activateTheme(name)}
                  disabled={activating === name || name === themesList!.activeName}
                  style={pickBtnStyle}
                >
                  {activating === name ? "Bytter..." : "Bruk dette temaet"}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <p style={{ fontSize: 13, opacity: 0.85, marginBottom: 6 }}>
        Velg flere filer på én gang (bakgrunn, logo, CSS) - de sorteres automatisk: filer med «logo» i navnet blir logo, .css-filer blir egendefinert stil, alt annet bilde blir bakgrunn.
      </p>
      <button onClick={pickThemeFiles} style={{ ...pickBtnStyle, padding: "10px 16px", marginBottom: 16 }}>
        Velg filer...
      </button>

      <label style={{ fontSize: 12, opacity: 0.7 }}>Bakgrunnsbilde</label>
      <div style={pickerRowStyle}>
        <input value={bgImageUrl && bgImageUrl.startsWith("data:") ? "(valgt fil)" : bgImageUrl} readOnly style={{ ...inputStyle, marginBottom: 0, flex: 1, opacity: 0.7 }} />
        <button onClick={pickBgImage} style={pickBtnStyle}>Velg fil...</button>
      </div>

      <label style={{ fontSize: 12, opacity: 0.7 }}>Logo/vannmerke</label>
      <div style={pickerRowStyle}>
        <input value={logoUrl && logoUrl.startsWith("data:") ? "(valgt fil)" : logoUrl} readOnly style={{ ...inputStyle, marginBottom: 0, flex: 1, opacity: 0.7 }} />
        <button onClick={pickLogo} style={pickBtnStyle}>Velg fil...</button>
        <button onClick={clearLogoNow} style={{ ...pickBtnStyle, background: "var(--popover)" }}>Fjern logo</button>
      </div>

      <label style={{ fontSize: 12, opacity: 0.7 }}>Skjul logo på disse scenene</label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 16 }}>
        {LOGO_SCENES.map((scene) => (
          <label key={scene.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, opacity: 0.85 }}>
            <input
              type="checkbox"
              checked={hiddenLogoScenes.includes(scene.key)}
              onChange={() => toggleLogoScene(scene.key)}
            />
            {scene.label}
          </label>
        ))}
      </div>

      <label style={{ fontSize: 12, opacity: 0.7 }}>Egendefinert CSS (last opp din egen style.css-fil for helt eget design)</label>
      <div style={pickerRowStyle}>
        <input value={customCssFileName || (customCss ? `Lagret CSS (${customCss.length} tegn)` : "")} readOnly style={{ ...inputStyle, marginBottom: 0, flex: 1, opacity: 0.7 }} />
        <button onClick={pickCss} style={pickBtnStyle}>Velg fil...</button>
      </div>

      <label style={{ fontSize: 12, opacity: 0.7 }}>Navn på tema (f.eks. NM)</label>
      <input
        value={themeName}
        onChange={(e) => setThemeName(e.target.value)}
        placeholder="NM"
        style={inputStyle}
      />

      <button onClick={saveAsNewTheme} disabled={saving} style={{ padding: "8px 14px", borderRadius: 5, border: "none", background: "var(--rose)", color: "var(--text-heading)", fontWeight: 700 }}>
        {saving ? "Lagrer..." : "Lagre som nytt tema"}
      </button>
    </div>
  );
}

