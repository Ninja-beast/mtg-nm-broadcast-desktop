"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getObsStatus = getObsStatus;
exports.getObsSceneNameOverrides = getObsSceneNameOverrides;
exports.connectObs = connectObs;
exports.disconnectObs = disconnectObs;
exports.resolveObsSceneName = resolveObsSceneName;
exports.setObsScene = setObsScene;
exports.listObsScenes = listObsScenes;
exports.getObsStreamStatus = getObsStreamStatus;
exports.getObsRecordStatus = getObsRecordStatus;
exports.startObsStream = startObsStream;
exports.stopObsStream = stopObsStream;
exports.ensureStudioMode = ensureStudioMode;
exports.getObsStudioState = getObsStudioState;
exports.setObsPreviewScene = setObsPreviewScene;
exports.takeObsTransition = takeObsTransition;
exports.cutObsScene = cutObsScene;
exports.stingerObsTransition = stingerObsTransition;
exports.saveObsSettings = saveObsSettings;
exports.saveObsSceneNameOverride = saveObsSceneNameOverride;
exports.saveObsPlaceholderScene = saveObsPlaceholderScene;
exports.getObsSceneScreenshot = getObsSceneScreenshot;
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
        (0, db_1.appLog)("info", `OBS tilkoblet (${host}:${port}).`);
        obs.on("ConnectionClosed", () => {
            connected = false;
            (0, db_1.appLog)("warn", "OBS-tilkoblingen ble lukket.");
        });
        return { ok: true, message: "Tilkoblet OBS." };
    }
    catch (err) {
        connected = false;
        lastError = err?.message || String(err);
        (0, db_1.appLog)("error", `Klarte ikke koble til OBS: ${lastError}`);
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
/**
 * Ekte streaming-status fra OBS (GetStreamStatus - samme WebSocket-
 * tilkobling som scene-bytte bruker). outputDuration er millisekunder
 * siden streamen startet, outputBytes er totalt sendt - bitrate
 * regnes ut som et gjennomsnitt over hele streamens varighet (bits /
 * ms = kbps), ikke en live/momentan verdi, men gir et riktig bilde
 * uten a matte spore delta selv mellom polls.
 */
async function getObsStreamStatus() {
    if (!obs || !connected)
        return { active: false, kbps: 0, droppedFrames: 0, totalFrames: 0, durationMs: 0 };
    try {
        const result = await obs.call("GetStreamStatus");
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
    }
    catch (err) {
        return { active: false, kbps: 0, droppedFrames: 0, totalFrames: 0, durationMs: 0 };
    }
}
async function getObsRecordStatus() {
    if (!obs || !connected)
        return { active: false };
    try {
        const result = await obs.call("GetRecordStatus");
        return { active: !!result.outputActive };
    }
    catch {
        return { active: false };
    }
}
async function startObsStream() {
    if (!obs || !connected)
        return { ok: false, message: "OBS er ikke tilkoblet." };
    try {
        await obs.call("StartStream");
        return { ok: true, message: "Stream startet." };
    }
    catch (err) {
        return { ok: false, message: err?.message || String(err) };
    }
}
/**
 * Stopper streamen umiddelbart (brukt av "End Match"-hurtighandlingen
 * i Observer-dashbordet - ikke lenger relatert til a markere en kamp
 * som ferdig, kun et hardt kutt av selve streamen).
 */
async function stopObsStream() {
    if (!obs || !connected)
        return { ok: false, message: "OBS er ikke tilkoblet." };
    try {
        await obs.call("StopStream");
        return { ok: true, message: "Stream stoppet." };
    }
    catch (err) {
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
async function ensureStudioMode() {
    if (!obs || !connected)
        return false;
    try {
        const result = await obs.call("GetStudioModeEnabled");
        if (!result.studioModeEnabled) {
            await obs.call("SetStudioModeEnabled", { studioModeEnabled: true });
        }
        return true;
    }
    catch (err) {
        console.error("[OBS] Klarte ikke sla pa Studio Mode:", err?.message || err);
        return false;
    }
}
async function getObsStudioState() {
    if (!obs || !connected)
        return { enabled: false, program: "", preview: "" };
    try {
        const studio = await obs.call("GetStudioModeEnabled");
        const enabled = !!studio.studioModeEnabled;
        const programResult = await obs.call("GetCurrentProgramScene");
        const program = programResult.currentProgramSceneName || programResult.sceneName || "";
        let preview = "";
        if (enabled) {
            try {
                const previewResult = await obs.call("GetCurrentPreviewScene");
                preview = previewResult.currentPreviewSceneName || previewResult.sceneName || "";
            }
            catch {
                preview = "";
            }
        }
        return { enabled, program, preview };
    }
    catch {
        return { enabled: false, program: "", preview: "" };
    }
}
async function setObsPreviewScene(sceneName) {
    if (!obs || !connected)
        return { ok: false, message: "OBS er ikke tilkoblet." };
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
            const fallbackName = (0, db_1.getSetting)("obs_placeholder_scene") || "Placeholder";
            targetScene = availableScenes.find((s) => s.toLowerCase() === fallbackName.toLowerCase());
        }
        if (!targetScene) {
            const fallbackName = (0, db_1.getSetting)("obs_placeholder_scene") || "Placeholder";
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
    }
    catch (err) {
        return { ok: false, message: err?.message || String(err) };
    }
}
/**
 * TAKE - trigger en overgang fra forhandsvisning til program med
 * OBS sin gjeldende overgangstype (f.eks. Fade). Krever Studio Mode.
 */
async function takeObsTransition() {
    if (!obs || !connected)
        return { ok: false, message: "OBS er ikke tilkoblet." };
    try {
        await obs.call("TriggerStudioModeTransition");
        return { ok: true, message: "Tatt live." };
    }
    catch (err) {
        return { ok: false, message: err?.message || String(err) };
    }
}
/**
 * CUT - umiddelbar hard overgang (ingen fade/animasjon), bytter
 * program-scenen direkte uansett hvilken overgangstype som er valgt
 * i OBS.
 */
async function cutObsScene(sceneName) {
    if (!obs || !connected)
        return { ok: false, message: "OBS er ikke tilkoblet." };
    try {
        await obs.call("SetCurrentProgramScene", { sceneName });
        return { ok: true, message: "Kuttet direkte." };
    }
    catch (err) {
        return { ok: false, message: err?.message || String(err) };
    }
}
/**
 * STINGER - overgang til gitt scene med en overgang som heter
 * noyaktig "Stinger" i OBS (ma settes opp av deg selv i OBS sine
 * Scene Transitions forst). Feiler tydelig hvis den ikke finnes,
 * i stedet for a stille falle tilbake til noe annet.
 */
async function stingerObsTransition(sceneName) {
    if (!obs || !connected)
        return { ok: false, message: "OBS er ikke tilkoblet." };
    try {
        await ensureStudioMode();
        await obs.call("SetCurrentPreviewScene", { sceneName });
        await obs.call("SetCurrentSceneTransition", { transitionName: "Stinger" });
        await obs.call("TriggerStudioModeTransition");
        return { ok: true, message: "Stinger kjort." };
    }
    catch (err) {
        return { ok: false, message: "Fant ingen overgang som heter 'Stinger' i OBS, eller noe annet feilet: " + (err?.message || err) };
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
function saveObsPlaceholderScene(sceneName) {
    (0, db_1.setSetting)("obs_placeholder_scene", sceneName);
}
/**
 * Henter et ferskt JPEG-skjermbilde av en gitt OBS-scene (base64
 * data-URI, klart til a settes direkte som <img src>). Brukes til
 * PROGRAM/PREVIEW-monitorene i Broadcast Control, slik at de viser
 * hva som faktisk star i OBS akkurat na - ikke bare tekst.
 */
async function getObsSceneScreenshot(sceneName) {
    if (!obs || !connected || !sceneName)
        return null;
    try {
        const result = await obs.call("GetSourceScreenshot", {
            sourceName: sceneName,
            imageFormat: "jpg",
            imageWidth: 480,
            imageHeight: 270,
            imageCompressionQuality: 70
        });
        return result.imageData || null;
    }
    catch (err) {
        console.error("[OBS] Klarte ikke ta skjermbilde av scene", sceneName, err?.message || err);
        return null;
    }
}
