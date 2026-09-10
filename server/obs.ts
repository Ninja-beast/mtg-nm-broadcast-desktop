import OBSWebSocket from "obs-websocket-js";
import { getSetting, setSetting } from "./db";

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

    obs.on("ConnectionClosed", () => {
      connected = false;
    });

    return { ok: true, message: "Tilkoblet OBS." };
  } catch (err: any) {
    connected = false;
    lastError = err?.message || String(err);
    return { ok: false, message: "Klarte ikke koble til OBS: " + lastError };
  }
}

export function disconnectObs() {
  if (obs) {
    obs.disconnect().catch(() => {});
  }
  connected = false;
}

function resolveObsSceneName(sceneKey: string): string {
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

export function saveObsSettings(host: string, port: string, password: string) {
  setSetting("obs_host", host);
  setSetting("obs_port", port);
  if (password) setSetting("obs_password", password);
}

export function saveObsSceneNameOverride(sceneKey: string, obsSceneName: string) {
  setSetting("obs_scene_name_" + sceneKey, obsSceneName);
}
