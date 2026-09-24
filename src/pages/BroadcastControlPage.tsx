import React, { useState, useEffect, useRef } from "react";
import { API_BASE } from "../lib/apiClient";
import { useObsStudioState, usePhases } from "../hooks/useBroadcast";
import { useSystemStatus } from "../hooks/useSystem";
import { useObsSettings } from "../hooks/useMelee";
import { SCENE_LABELS, SCENE_KEYS_ORDERED } from "../config/scenes";
import { Panel, InfoRow, QuickActionButton, formatUptime, formatCountdown } from "../components/shared";

function SceneOverrideButton({
  sceneKey,
  isProgram,
  isPreview,
  existsInObs,
  onClick
}: {
  sceneKey: string;
  isProgram: boolean;
  isPreview: boolean;
  existsInObs: boolean;
  onClick: () => void;
}) {
  // Scener OBS ikke finner blir na en TOM plassholder-knapp - ingen
  // scenenavn vist, siden den knappen uansett ikke gjor noe nyttig
  // for scenen faktisk er satt opp i OBS (Configuration-fanen).
  if (!existsInObs) {
    return (
      <button
        onClick={onClick}
        title={`Ingen scene med dette navnet funnet i OBS - sjekk Configuration`}
        style={{
          textAlign: "left", padding: "10px 12px", borderRadius: 10, minHeight: 58,
          border: "1px dashed var(--border)", background: "transparent", color: "var(--text-faint)"
        }}
      >
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>NOT SET UP</span>
      </button>
    );
  }

  const border = isProgram ? "var(--primary)" : isPreview ? "var(--accent-teal)" : "var(--border)";
  const bg = isProgram ? "var(--popover)" : isPreview ? "var(--popover)" : "var(--raised)";
  return (
    <button
      onClick={onClick}
      style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10, border: `1px solid ${border}`, background: bg, color: "var(--text-heading)", position: "relative" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>SCENE</span>
        {isProgram && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--primary)", fontWeight: 700 }}>LIVE</span>}
        {isPreview && !isProgram && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent-teal)", fontWeight: 700 }}>PREVIEW</span>}
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>{SCENE_LABELS[sceneKey] || sceneKey}</div>
    </button>
  );
}

function PhasePanel({
  title,
  phaseKey,
  phase,
  reload
}: {
  title: string;
  phaseKey: "starting" | "intermission" | "ending";
  phase: { status: string; remainingMs: number; thenScene: string } | undefined;
  reload: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  // Husker NAR (og hvilken verdi) vi sist mottok remainingMs fra
  // serveren - sa vi kan telle ned lokalt derfra hvert sekund i
  // stedet for at tallet star stille mellom hver 3-sekunders poll.
  const baseline = useRef<{ ms: number; at: number }>({ ms: phase?.remainingMs ?? 0, at: Date.now() });
  useEffect(() => {
    baseline.current = { ms: phase?.remainingMs ?? 0, at: Date.now() };
  }, [phase?.remainingMs, phase?.status]);

  async function post(action: string, body?: unknown) {
    await fetch(`${API_BASE}/broadcast/phases/${phaseKey}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {})
    });
    reload();
  }

  function arm() {
    const input = window.prompt("Nedtelling i minutter:", "5");
    if (input == null) return;
    const mins = Math.max(1, Number(input) || 1);
    let thenScene: string | undefined;
    if (phaseKey !== "ending") {
      thenScene = window.prompt("Scene etterpa (bo3/bo5/meta/top16/bracket/casterdesk/starting):", phase?.thenScene || "casterdesk") || phase?.thenScene;
    }
    post("arm", { minutes: mins, thenScene });
  }

  const status = phase?.status || "idle";
  const remaining = status === "running" ? Math.max(0, baseline.current.ms - (now - baseline.current.at)) : phase?.remainingMs || 0;

  // Klokkeslettet er utledet direkte fra selve nedtellingen (na +
  // gjenstaende tid) - ekte tall, ikke en separat lagret verdi. Viser
  // "-" nar det ikke er noen aktiv/pauset nedtelling a regne ut fra.
  const clockLabel = phaseKey === "starting" ? "STARTS AT" : phaseKey === "intermission" ? "RESUMES AT" : "ENDS AT";
  const targetClock = status !== "idle"
    ? new Date(now + remaining).toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" })
    : "-";

  return (
    <Panel title={title}>
      <InfoRow label={clockLabel} value={targetClock} mono />
      <InfoRow label="STATUS" value={status.toUpperCase()} mono accent={status === "running" ? "var(--warn)" : undefined} />
      <InfoRow label="COUNTDOWN" value={formatCountdown(remaining)} mono />
      {phaseKey !== "ending" && <InfoRow label={phaseKey === "starting" ? "THEN" : "RETURN TO"} value={SCENE_LABELS[phase?.thenScene || ""] || phase?.thenScene || "-"} />}
      {phaseKey === "ending" && <InfoRow label="AUTO TRANSITION" value={status === "running" ? "ON" : "OFF"} mono accent={status === "running" ? "var(--warn)" : undefined} />}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10 }}>
        <QuickActionButton compact label="PAUSE" onClick={() => post("pause")} />
        <QuickActionButton compact label="RESUME" onClick={() => post("resume")} />
      </div>
      {status === "idle" && (
        <button onClick={arm} style={{ width: "100%", marginTop: 6, padding: 8, borderRadius: 5, border: "1px solid var(--warn)", background: "var(--popover)", color: "var(--warn)", fontWeight: 700 }}>
          {phaseKey === "ending" ? "ARM ENDING" : phaseKey === "intermission" ? "ARM INTERMISSION!" : "ARM"}
        </button>
      )}
      <button
        onClick={() => post("force")}
        style={{ width: "100%", marginTop: 6, padding: 8, borderRadius: 5, border: "1px solid var(--rose)", background: "var(--popover)", color: "var(--rose)", fontWeight: 700 }}
      >
        {phaseKey === "starting" ? "FORCE START" : phaseKey === "ending" ? "FORCE END STREAM" : "END NOW"}
      </button>
    </Panel>
  );
}

export function BroadcastControlPage() {
  const [studio, reloadStudio] = useObsStudioState();
  const [status, reloadStatus] = useSystemStatus();
  const [phases, reloadPhases] = usePhases();
  const [obsSettings, reloadObsSettings] = useObsSettings();
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [programImage, setProgramImage] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  // OBS har ALLTID en eller annen scene teknisk satt som "preview" i
  // Studio Mode - den kan aldri egentlig vaere "tom" der. Sa i stedet
  // for a stole pa OBS sin egen preview-verdi for a avgjore om noe
  // faktisk er "valgt", holder appen na styr pa det SELV: false helt
  // til operatoren trykker en scene-knapp denne okten, og tilbake til
  // false igjen etter TAKE LIVE (som "bruker opp" valget) - sa den
  // gamle "Go Live"-scenen aldri bare henger igjen og ser ut som et
  // aktivt valg nar det egentlig ikke er et bevisst valg lenger.
  const [previewSelected, setPreviewSelected] = useState(false);
  const PLACEHOLDER_IMAGE_URL = `${API_BASE.replace(/\/api$/, "")}/overlay/Placeholder.png`;
  // Samme klokke-mønster som Dashboard - selvstendig her siden denne
  // siden ikke tar imot SharedDashboardData fra App().
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  function reloadAll() {
    reloadStudio();
    reloadStatus();
    reloadPhases();
    reloadObsSettings();
  }

  useEffect(() => {
    const i = setInterval(reloadAll, 3000);
    return () => clearInterval(i);
  }, []);

  // Egen, tregere poll (2 sek) for selve skjermbildene av Program/
  // Preview - ekte JPEG hentet fra OBS sitt GetSourceScreenshot, ikke
  // bare tekst-placeholder lenger.
  useEffect(() => {
    let stopped = false;
    async function pollScreenshots() {
      const [programRes, previewRes] = await Promise.all([
        fetch(`${API_BASE}/obs/screenshot?which=program`).then((r) => r.json()).catch(() => ({ image: null })),
        fetch(`${API_BASE}/obs/screenshot?which=preview`).then((r) => r.json()).catch(() => ({ image: null }))
      ]);
      if (!stopped) {
        setProgramImage(programRes.image || null);
        setPreviewImage(previewRes.image || null);
      }
    }
    pollScreenshots();
    const i = setInterval(pollScreenshots, 350);
    return () => {
      stopped = true;
      clearInterval(i);
    };
  }, []);

  async function setPreview(key: string) {
    const res = await fetch(`${API_BASE}/obs/preview-scene`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene: key })
    });
    const body = await res.json().catch(() => ({}));
    // Denne feilet FOR helt stille hvis scenen (f.eks. "Placeholder")
    // ikke fantes i OBS med det navnet - UI-et bare la om og viste
    // fortsatt den GAMLE preview-scenen, som sa ut som at valget
    // "spratt tilbake" uten noen forklaring. Na vises samme type
    // feilmelding som TAKE/CUT/STINGER allerede har hatt.
    if (!body.ok) {
      setBusyMessage(body.message || body.error || "Kunne ikke sette preview - sjekk at scenen finnes i OBS med riktig navn (Configuration-fanen).");
    } else {
      setBusyMessage(null);
      setPreviewSelected(true);
    }
    reloadAll();
  }

  async function runTransition(kind: "take" | "cut" | "stinger") {
    if (!previewSelected) return;
    const res = await fetch(`${API_BASE}/obs/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene: studio?.preview })
    });
    const body = await res.json().catch(() => ({}));
    if (!body.ok) {
      setBusyMessage(body.message || "Feilet");
    } else {
      setBusyMessage(null);
      // Preview "brukes opp" av a ga live - nullstilles sa den gamle
      // scenen aldri bare henger igjen og ser ut som et fortsatt
      // aktivt/bevisst valg for neste runde.
      if (kind === "take" || kind === "cut" || kind === "stinger") setPreviewSelected(false);
    }
    reloadAll();
  }

  async function setCamera(camera: string) {
    await fetch(`${API_BASE}/broadcast/camera`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ camera })
    });
    reloadStatus();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <h2 style={{ marginTop: 0 }}>Broadcast Control</h2>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 800, color: "var(--text-heading)" }}>
            {new Date(now).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
          <div style={{ fontSize: 11, opacity: 0.6, textTransform: "capitalize" }}>
            {new Date(now).toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>
      </div>
      <div style={{ opacity: 0.6, fontSize: 13, marginBottom: 20 }}>
        Program: {(SCENE_LABELS[studio?.program || ""] || studio?.program || "-")} · Preview: {(SCENE_LABELS[studio?.preview || ""] || studio?.preview || "-")} · {(status?.camera || "-").toUpperCase()}
      </div>

      {busyMessage && (
        <div style={{ border: "1px solid var(--warn)", background: "var(--popover)", color: "var(--warn)", borderRadius: 10, padding: 10, marginBottom: 16, fontSize: 13 }}>
          {busyMessage}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Panel title="SCENES OVERRIDE">
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
              LIVE TIMER: {formatUptime(Math.floor((status?.obs.stream.durationMs || 0) / 1000))}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            {SCENE_KEYS_ORDERED.map((key) => {
              // Faktisk OBS-scenenavn for denne knappen (respekterer
              // en eventuell override fra Configuration, ellers noklen
              // selv) - matches mot studio.program/preview (som ER
              // OBS sine EKTE scenenavn) i stedet for mot vare interne
              // nokler direkte, som feilet for alle med en override satt.
              const resolvedName = (obsSettings?.sceneNameOverrides?.[key] || key).toLowerCase();
              const existsInObs = !obsSettings ? true : (obsSettings.scenes || []).some((s) => s.toLowerCase() === resolvedName);
              return (
                <SceneOverrideButton
                  key={key}
                  sceneKey={key}
                  isProgram={(studio?.program || "").toLowerCase() === resolvedName}
                  isPreview={(studio?.preview || "").toLowerCase() === resolvedName}
                  existsInObs={existsInObs}
                  onClick={() => setPreview(key)}
                />
              );
            })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
            <button
              onClick={() => runTransition("take")}
              disabled={!previewSelected}
              style={{ padding: 10, borderRadius: 10, border: "1px solid var(--primary)", background: "var(--popover)", color: previewSelected ? "var(--primary)" : "var(--text-faint)", fontWeight: 700 }}
            >
              TAKE LIVE {previewSelected && studio?.preview ? `- ${SCENE_LABELS[studio.preview] || studio.preview}` : ""}
            </button>
            <button onClick={() => runTransition("cut")} disabled={!previewSelected} style={{ padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--raised)", color: "var(--text-heading)", fontWeight: 700 }}>
              CUT
            </button>
            <button onClick={() => runTransition("stinger")} disabled={!previewSelected} style={{ padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--raised)", color: "var(--text-heading)", fontWeight: 700 }}>
              STINGER
            </button>
          </div>
        </Panel>

        <Panel title="CAMERA SOURCE">
          {["main", "handheld", "cam3"].map((cam) => (
            <button
              key={cam}
              onClick={() => setCamera(cam)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${status?.camera === cam ? "var(--primary)" : "var(--border)"}`,
                background: status?.camera === cam ? "var(--popover)" : "var(--raised)",
                color: "var(--text-heading)",
                marginBottom: 8
              }}
            >
              <span style={{ color: status?.camera === cam ? "var(--primary)" : "var(--text-faint)", marginRight: 6 }}>●</span>
              {cam === "main" ? "Main Camera" : cam === "handheld" ? "Handheld Camera" : "Cam 3"}
            </button>
          ))}
          <div style={{ fontSize: 11, opacity: 0.5, marginTop: 8 }}>
            Lagrer kun et valg (ingen ekte OBS-kildebytte enna). Flere kilder legges til under Settings &gt; Broadcast.
          </div>
        </Panel>

        <Panel title="PROGRAM">
          <div style={{ border: "1px dashed var(--border)", borderRadius: 10, height: 220, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10, overflow: "hidden" }}>
            {programImage ? (
              <img src={programImage} alt="Program" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            ) : (
              <span style={{ opacity: 0.4, fontSize: 11, textAlign: "center" }}>PROGRAM - {(studio?.program || "-").toUpperCase()}</span>
            )}
          </div>
          <div style={{ border: "1px dashed var(--border)", borderRadius: 10, height: 110, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {!previewSelected ? (
              <img src={PLACEHOLDER_IMAGE_URL} alt="No preview selected" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            ) : previewImage ? (
              <img src={previewImage} alt="Preview" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            ) : (
              <span style={{ opacity: 0.4, fontSize: 11, textAlign: "center" }}>PREVIEW - {(studio?.preview || "-").toUpperCase()}</span>
            )}
          </div>
        </Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
        <PhasePanel title="STREAM STARTING" phaseKey="starting" phase={phases?.starting} reload={reloadAll} />
        <PhasePanel title="INTERMISSION" phaseKey="intermission" phase={phases?.intermission} reload={reloadAll} />
        <PhasePanel title="STREAM ENDING" phaseKey="ending" phase={phases?.ending} reload={reloadAll} />

        <Panel title="STREAM STATUS">
          <InfoRow label="STREAM" value={status?.obs.stream.active ? "STREAMING" : "OFFLINE"} accent={status?.obs.stream.active ? "var(--primary)" : "var(--text-faint)"} />
          <InfoRow label="RECORDING" value={status?.obs.recording ? "ACTIVE" : "OFF"} accent={status?.obs.recording ? "var(--primary)" : "var(--text-faint)"} />
          <InfoRow label="BITRATE" value={`${status?.obs.stream.kbps ?? 0} kbps`} mono />
          <InfoRow label="DROPPED" value={`${status?.obs.stream.droppedFrames ?? 0} frames`} mono />
          <InfoRow label="OBS" value={status?.obs.connected ? "CONNECTED" : "DISCONNECTED"} accent={status?.obs.connected ? "var(--primary)" : "var(--warn)"} />
        </Panel>
      </div>
    </div>
  );
}

