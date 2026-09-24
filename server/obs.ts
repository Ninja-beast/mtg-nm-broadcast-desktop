import OBSWebSocket from "obs-websocket-js";
import { getSetting, setSetting, appLog } from "./db";

/**
 * OBS-INTEGRASJON
 * ===============
 * OBS 28+ har en innebygd WebSocket-server (Verktoy > WebSocket
 * Server Settings i OBS - husk a skru den PA og notere port/passord).
 * Denne modulen kobler til den og bytter faktisk hvilken Scene som er
 * LIVE nar du trykker en scene-knapp i Broadcast-fanen - i motsetning
 * til for, da knappene bare endret intern state i appen uten a
 * pavirke hva som faktisk vises pa streamen.
 *
 * Scene-navn: OBS-scenen din ma hete NOYAKTIG det samme som noklene
 * appen bruker (match/bo5/meta/top16/bracket/casterdesk), MED MINDRE
 * du setter opp en egen navn-oversettelse under (obs_scene_name_<key>
 * i settings - se resolveObsSceneName under).
 */

let obs: OBSWebSocket | null = null;
let connected = false;
let lastError = "";

export function getObsStatus() {
  return { connected, lastError, host: getSetting("obs_host"), port: getSetting("obs_port") };
}

export function getObsSceneNameOverrides(sceneKeys: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  sceneKeys.forEach((key) => {
    result[key] = getSetting("obs_scene_name_" + key);
  });
  return result;
}

export async function connectObs(): Promise<{ ok: boolean; message: string }> {
  const host = getSetting("obs_host") || "localhost";
  const port = getSetting("obs_port") || "4455";
  const password = getSetting("obs_password");

  try {
    if (obs) {
      try {
        await obs.disconnect();
      } catch {
        // ignorer - kobler uansett opp pa nytt under
      }
    }

    obs = new OBSWebSocket();
    await obs.connect(`ws://${host}:${port}`, password || undefined);

    connected = true;
    lastError = "";

    appLog("info", `OBS tilkoblet (${host}:${port}).`);

    obs.on("ConnectionClosed", () => {
      connected = false;
      appLog("warn", "OBS-tilkoblingen ble lukket.");
    });

    return { ok: true, message: "Tilkoblet OBS." };
  } catch (err: any) {
    connected = false;
    lastError = err?.message || String(err);
    appLog("error", `Klarte ikke koble til OBS: ${lastError}`);
    return { ok: false, message: "Klarte ikke koble til OBS: " + lastError };
  }
}

export function disconnectObs() {
  if (obs) {
    obs.disconnect().catch(() => {});
  }
  connected = false;
}

export function resolveObsSceneName(sceneKey: string): string {
  const override = getSetting("obs_scene_name_" + sceneKey);
  return override || sceneKey;
}

/**
 * Bytter OBS sin LIVE program-scene. Feiler stille (logger, kaster
 * ikke) hvis OBS ikke er tilkoblet - resten av appen (intern
 * scene-state, WebSocket-push til overlayene) fungerer uansett som
 * for, dette er et TILLEGG, ikke en erstatning.
 */
export async function setObsScene(sceneKey: string): Promise<void> {
  if (!obs || !connected) return;

  const sceneName = resolveObsSceneName(sceneKey);

  try {
    await obs.call("SetCurrentProgramScene", { sceneName });
  } catch (err: any) {
    lastError = err?.message || String(err);
    console.error(`[OBS] Klarte ikke bytte til scene "${sceneName}":`, lastError);
  }
}

export async function listObsScenes(): Promise<string[]> {
  if (!obs || !connected) return [];

  try {
    const result = await obs.call("GetSceneList");
    return (result.scenes as any[]).map((s) => String(s.sceneName));
  } catch {
    return [];
  }
}

/**
 * Ekte streaming-status fra OBS (GetStreamStatus - samme WebSocket-
 * tilkobling som scene-bytte bruker). outputDuration er millisekunder
 * siden streamen startet, outputBytes er totalt sendt - bitrate
 * regnes ut som et gjennomsnitt over hele streamens varighet (bits /
 * ms = kbps), ikke en live/momentan verdi, men gir et riktig bilde
 * uten a matte spore delta selv mellom polls.
 */
export async function getObsStreamStatus(): Promise<{
  active: boolean;
  kbps: number;
  droppedFrames: number;
  totalFrames: number;
  durationMs: number;
}> {
  if (!obs || !connected) return { active: false, kbps: 0, droppedFrames: 0, totalFrames: 0, durationMs: 0 };

  try {
    const result: any = await obs.call("GetStreamStatus");
    const durationMs = Number(result.outputDuration) || 0;
    const bytes = Number(result.outputBytes) || 0;
    const kbps = durationMs > 0 ? Math.round((bytes * 8) / durationMs) : 0;

    return {
      active: !!result.outputActive,
      kbps,
      droppedFrames: Number(result.outputSkippedFrames) || 0,
      totalFrames: Number(result.outputTotalFrames) || 0,
      durationMs
    };
  } catch (err: any) {
    return { active: false, kbps: 0, droppedFrames: 0, totalFrames: 0, durationMs: 0 };
  }
}

export async function getObsRecordStatus(): Promise<{ active: boolean }> {
  if (!obs || !connected) return { active: false };
  try {
    const result: any = await obs.call("GetRecordStatus");
    return { active: !!result.outputActive };
  } catch {
    return { active: false };
  }
}

export async function startObsStream(): Promise<{ ok: boolean; message: string }> {
  if (!obs || !connected) return { ok: false, message: "OBS er ikke tilkoblet." };
  try {
    await obs.call("StartStream");
    return { ok: true, message: "Stream startet." };
  } catch (err: any) {
    return { ok: false, message: err?.message || String(err) };
  }
}

/**
 * Stopper streamen umiddelbart (brukt av "End Match"-hurtighandlingen
 * i Observer-dashbordet - ikke lenger relatert til a markere en kamp
 * som ferdig, kun et hardt kutt av selve streamen).
 */
export async function stopObsStream(): Promise<{ ok: boolean; message: string }> {
  if (!obs || !connected) return { ok: false, message: "OBS er ikke tilkoblet." };

  try {
    await obs.call("StopStream");
    return { ok: true, message: "Stream stoppet." };
  } catch (err: any) {
    const message = err?.message || String(err);
    console.error("[OBS] Klarte ikke stoppe streamen:", message);
    return { ok: false, message };
  }
}

/**
 * OBS STUDIO MODE (Program/Preview) - ekte to-buss-styring, tilsvarer
 * en vanlig video-mikser. Skrur PA Studio Mode automatisk hvis den
 * ikke allerede er det (uten dette finnes ikke noe eget "preview"-
 * konsept i OBS i det hele tatt).
 */
export async function ensureStudioMode(): Promise<boolean> {
  if (!obs || !connected) return false;
  try {
    const result: any = await obs.call("GetStudioModeEnabled");
    if (!result.studioModeEnabled) {
      await obs.call("SetStudioModeEnabled", { studioModeEnabled: true });
    }
    return true;
  } catch (err: any) {
    console.error("[OBS] Klarte ikke sla pa Studio Mode:", err?.message || err);
    return false;
  }
}

export async function getObsStudioState(): Promise<{ enabled: boolean; program: string; preview: string }> {
  if (!obs || !connected) return { enabled: false, program: "", preview: "" };
  try {
    const studio: any = await obs.call("GetStudioModeEnabled");
    const enabled = !!studio.studioModeEnabled;

    const programResult: any = await obs.call("GetCurrentProgramScene");
    const program = programResult.currentProgramSceneName || programResult.sceneName || "";

    let preview = "";
    if (enabled) {
      try {
        const previewResult: any = await obs.call("GetCurrentPreviewScene");
        preview = previewResult.currentPreviewSceneName || previewResult.sceneName || "";
      } catch {
        preview = "";
      }
    }

    return { enabled, program, preview };
  } catch {
    return { enabled: false, program: "", preview: "" };
  }
}

export async function setObsPreviewScene(sceneName: string): Promise<{ ok: boolean; message: string }> {
  if (!obs || !connected) return { ok: false, message: "OBS er ikke tilkoblet." };
  try {
    await ensureStudioMode();

    // Sjekker at scenen FAKTISK finnes i OBS forst - uten dette
    // feilet SetCurrentPreviewScene stille (eller matchet ingenting),
    // og UI-et fortsatte a vise den GAMLE preview-scenen etter en
    // reload, noe som sa ut som at valget "spratt tilbake" uten noen
    // forklaring. Sammenligner uten hensyn til store/sma bokstaver,
    // siden OBS selv er case-sensitiv pa scenenavn men folk lett
    // skriver "placeholder" i stedet for "Placeholder" i Configuration.
    const availableScenes = await listObsScenes();
    const exactMatch = availableScenes.find((s) => s === sceneName);
    const caseInsensitiveMatch = exactMatch || availableScenes.find((s) => s.toLowerCase() === sceneName.toLowerCase());

    let targetScene = caseInsensitiveMatch;

    if (!targetScene) {
      // Fant ikke scenen med det navnet i det hele tatt - faller
      // tilbake til fallback-scenen som er satt under Configuration
      // (standard "Placeholder", men du kan endre navnet selv der),
      // i stedet for a bare gjore ingenting.
      const fallbackName = getSetting("obs_placeholder_scene") || "Placeholder";
      targetScene = availableScenes.find((s) => s.toLowerCase() === fallbackName.toLowerCase());
    }

    if (!targetScene) {
      const fallbackName = getSetting("obs_placeholder_scene") || "Placeholder";
      return {
        ok: false,
        message: `Fant ingen scene som heter "${sceneName}" i OBS, og ingen fallback-scene som heter "${fallbackName}". Sjekk scenenavnene under Configuration, eller lag en scene i OBS med det navnet.`
      };
    }

    await obs.call("SetCurrentPreviewScene", { sceneName: targetScene });

    const usedFallback = targetScene.toLowerCase() !== sceneName.toLowerCase();
    return {
      ok: true,
      message: usedFallback ? `Fant ingen scene som heter "${sceneName}" i OBS - viser "${targetScene}" i stedet.` : "Forhandsvisning satt."
    };
  } catch (err: any) {
    return { ok: false, message: err?.message || String(err) };
  }
}

/**
 * TAKE - trigger en overgang fra forhandsvisning til program med
 * OBS sin gjeldende overgangstype (f.eks. Fade). Krever Studio Mode.
 */
export async function takeObsTransition(): Promise<{ ok: boolean; message: string }> {
  if (!obs || !connected) return { ok: false, message: "OBS er ikke tilkoblet." };
  try {
    await obs.call("TriggerStudioModeTransition");
    return { ok: true, message: "Tatt live." };
  } catch (err: any) {
    return { ok: false, message: err?.message || String(err) };
  }
}

/**
 * CUT - umiddelbar hard overgang (ingen fade/animasjon), bytter
 * program-scenen direkte uansett hvilken overgangstype som er valgt
 * i OBS.
 */
export async function cutObsScene(sceneName: string): Promise<{ ok: boolean; message: string }> {
  if (!obs || !connected) return { ok: false, message: "OBS er ikke tilkoblet." };
  try {
    await obs.call("SetCurrentProgramScene", { sceneName });
    return { ok: true, message: "Kuttet direkte." };
  } catch (err: any) {
    return { ok: false, message: err?.message || String(err) };
  }
}

/**
 * STINGER - overgang til gitt scene med en overgang som heter
 * noyaktig "Stinger" i OBS (ma settes opp av deg selv i OBS sine
 * Scene Transitions forst). Feiler tydelig hvis den ikke finnes,
 * i stedet for a stille falle tilbake til noe annet.
 */
export async function stingerObsTransition(sceneName: string): Promise<{ ok: boolean; message: string }> {
  if (!obs || !connected) return { ok: false, message: "OBS er ikke tilkoblet." };
  try {
    await ensureStudioMode();
    await obs.call("SetCurrentPreviewScene", { sceneName });
    await obs.call("SetCurrentSceneTransition", { transitionName: "Stinger" });
    await obs.call("TriggerStudioModeTransition");
    return { ok: true, message: "Stinger kjort." };
  } catch (err: any) {
    return { ok: false, message: "Fant ingen overgang som heter 'Stinger' i OBS, eller noe annet feilet: " + (err?.message || err) };
  }
}

export function saveObsSettings(host: string, port: string, password: string) {
  setSetting("obs_host", host);
  setSetting("obs_port", port);
  if (password) setSetting("obs_password", password);
}

export function saveObsSceneNameOverride(sceneKey: string, obsSceneName: string) {
  setSetting("obs_scene_name_" + sceneKey, obsSceneName);
}

export function saveObsPlaceholderScene(sceneName: string) {
  setSetting("obs_placeholder_scene", sceneName);
}

/**
 * Henter et ferskt JPEG-skjermbilde av en gitt OBS-scene (base64
 * data-URI, klart til a settes direkte som <img src>). Brukes til
 * PROGRAM/PREVIEW-monitorene i Broadcast Control, slik at de viser
 * hva som faktisk star i OBS akkurat na - ikke bare tekst.
 */
export async function getObsSceneScreenshot(sceneName: string): Promise<string | null> {
  if (!obs || !connected || !sceneName) return null;
  try {
    const result: any = await obs.call("GetSourceScreenshot", {
      sourceName: sceneName,
      imageFormat: "jpg",
      imageWidth: 480,
      imageHeight: 270,
      imageCompressionQuality: 70
    });
    return result.imageData || null;
  } catch (err: any) {
    console.error("[OBS] Klarte ikke ta skjermbilde av scene", sceneName, err?.message || err);
    return null;
  }
}
