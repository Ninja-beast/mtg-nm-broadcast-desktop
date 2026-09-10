"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getObsStatus = getObsStatus;
exports.getObsSceneNameOverrides = getObsSceneNameOverrides;
exports.connectObs = connectObs;
exports.disconnectObs = disconnectObs;
exports.setObsScene = setObsScene;
exports.listObsScenes = listObsScenes;
exports.saveObsSettings = saveObsSettings;
exports.saveObsSceneNameOverride = saveObsSceneNameOverride;
const obs_websocket_js_1 = __importDefault(require("obs-websocket-js"));
const db_1 = require("./db");
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
let obs = null;
let connected = false;
let lastError = "";
function getObsStatus() {
    return { connected, lastError, host: (0, db_1.getSetting)("obs_host"), port: (0, db_1.getSetting)("obs_port") };
}
function getObsSceneNameOverrides(sceneKeys) {
    const result = {};
    sceneKeys.forEach((key) => {
        result[key] = (0, db_1.getSetting)("obs_scene_name_" + key);
    });
    return result;
}
async function connectObs() {
    const host = (0, db_1.getSetting)("obs_host") || "localhost";
    const port = (0, db_1.getSetting)("obs_port") || "4455";
    const password = (0, db_1.getSetting)("obs_password");
    try {
        if (obs) {
            try {
                await obs.disconnect();
            }
            catch {
                // ignorer - kobler uansett opp pa nytt under
            }
        }
        obs = new obs_websocket_js_1.default();
        await obs.connect(`ws://${host}:${port}`, password || undefined);
        connected = true;
        lastError = "";
        obs.on("ConnectionClosed", () => {
            connected = false;
        });
        return { ok: true, message: "Tilkoblet OBS." };
    }
    catch (err) {
        connected = false;
        lastError = err?.message || String(err);
        return { ok: false, message: "Klarte ikke koble til OBS: " + lastError };
    }
}
function disconnectObs() {
    if (obs) {
        obs.disconnect().catch(() => { });
    }
    connected = false;
}
function resolveObsSceneName(sceneKey) {
    const override = (0, db_1.getSetting)("obs_scene_name_" + sceneKey);
    return override || sceneKey;
}
/**
 * Bytter OBS sin LIVE program-scene. Feiler stille (logger, kaster
 * ikke) hvis OBS ikke er tilkoblet - resten av appen (intern
 * scene-state, WebSocket-push til overlayene) fungerer uansett som
 * for, dette er et TILLEGG, ikke en erstatning.
 */
async function setObsScene(sceneKey) {
    if (!obs || !connected)
        return;
    const sceneName = resolveObsSceneName(sceneKey);
    try {
        await obs.call("SetCurrentProgramScene", { sceneName });
    }
    catch (err) {
        lastError = err?.message || String(err);
        console.error(`[OBS] Klarte ikke bytte til scene "${sceneName}":`, lastError);
    }
}
async function listObsScenes() {
    if (!obs || !connected)
        return [];
    try {
        const result = await obs.call("GetSceneList");
        return result.scenes.map((s) => String(s.sceneName));
    }
    catch {
        return [];
    }
}
function saveObsSettings(host, port, password) {
    (0, db_1.setSetting)("obs_host", host);
    (0, db_1.setSetting)("obs_port", port);
    if (password)
        (0, db_1.setSetting)("obs_password", password);
}
function saveObsSceneNameOverride(sceneKey, obsSceneName) {
    (0, db_1.setSetting)("obs_scene_name_" + sceneKey, obsSceneName);
}
