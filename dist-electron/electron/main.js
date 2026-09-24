"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const electron_updater_1 = require("electron-updater");
const api_1 = require("../server/api");
const client_config_1 = require("./client-config");
let mainWindow = null;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        backgroundColor: "#0b1220",
        webPreferences: {
            preload: node_path_1.default.join(__dirname, "preload.js"),
            contextIsolation: true
        }
    });
    if (process.env.NODE_ENV === "development") {
        mainWindow.loadURL("http://localhost:5173");
        mainWindow.webContents.openDevTools({ mode: "detach" });
    }
    else {
        mainWindow.loadFile(node_path_1.default.join(__dirname, "../../dist/index.html"));
    }
    mainWindow.on("closed", () => {
        mainWindow = null;
    });
}
// Konverterer en valgt bildefil til en base64 data-URI ("data:image/
// png;base64,...."). Dette betyr Tema-fanen aldri trenger a kopiere
// filer inn i overlay-mappen eller bekymre seg om stier - bildet
// lagres direkte i databasen som tekst, og fungerer identisk i
// dev-modus, i den installerte .exe-en, og uansett hvilken PC som er
// vert, siden det ikke er avhengig av noen filsti i det hele tatt.
function readImageAsDataUri(filePath) {
    const ext = node_path_1.default.extname(filePath).toLowerCase().replace(".", "");
    const mimeType = ext === "jpg" ? "jpeg" : ext; // "jpg" -> "jpeg" for et gyldig MIME-navn
    const buffer = node_fs_1.default.readFileSync(filePath);
    return `data:image/${mimeType};base64,${buffer.toString("base64")}`;
}
// Trenger "denied"/"granted" a rapportere tilbake til UI-et om selve
// SJEKKEN (fant/fant ikke en ny versjon), atskilt fra selve NEDLASTING-
// status (som skjer i bakgrunnen via autoDownload=true, se under) - de
// to var tidligere sammenblandet, noe som gjorde at UI-et ikke kunne
// skille "ingen oppdatering funnet" fra "sjekker fortsatt".
let updateCheckInFlight = false;
function setupAutoUpdater() {
    // Auto-oppdatering fungerer kun i en pakket .exe (ikke i "npm run
    // dev"), siden den sjekker mot en ekte utgitt versjon pa GitHub
    // Releases - i dev-modus er det uansett ingen "utgitt versjon" a
    // sammenligne med.
    if (!electron_1.app.isPackaged)
        return;
    electron_updater_1.autoUpdater.autoDownload = true;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    electron_updater_1.autoUpdater.on("update-downloaded", () => {
        electron_1.dialog
            .showMessageBox({
            type: "info",
            title: "Oppdatering klar",
            message: "En ny versjon er lastet ned i bakgrunnen. Vil du starte appen pa nytt na for a installere den?",
            buttons: ["Start pa nytt na", "Senere (installeres neste gang appen lukkes)"]
        })
            .then((result) => {
            if (result.response === 0) {
                electron_updater_1.autoUpdater.quitAndInstall();
            }
        });
    });
    electron_updater_1.autoUpdater.on("error", (err) => {
        // Stille feilhandtering - f.eks. ingen internettforbindelse skal
        // aldri krasje appen eller forstyrre bruk under en sending.
        console.error("[auto-update] feil:", err);
    });
    electron_updater_1.autoUpdater.checkForUpdates().catch((err) => {
        console.error("[auto-update] kunne ikke sjekke etter oppdatering:", err);
    });
}
electron_1.app.whenReady().then(() => {
    const connectionConfig = (0, client_config_1.getConnectionConfig)();
    if (!connectionConfig.remoteAddress) {
        (0, api_1.startServer)();
    }
    createWindow();
    setupAutoUpdater();
    electron_1.ipcMain.handle("get-connection-config", () => (0, client_config_1.getConnectionConfig)());
    electron_1.ipcMain.handle("save-connection-config", (_event, config) => {
        (0, client_config_1.saveConnectionConfig)(config);
        electron_1.app.relaunch();
        electron_1.app.exit(0);
    });
    // Apner Windows sin EKTE filutforsker, begrenset til bildefiler.
    // Returnerer null hvis brukeren avbryter i stedet for a velge noe.
    electron_1.ipcMain.handle("pick-image-file", async () => {
        if (!mainWindow)
            return null;
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
            title: "Velg bilde",
            properties: ["openFile"],
            filters: [
                { name: "Bilder", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] },
                { name: "Alle filer", extensions: ["*"] }
            ]
        });
        if (result.canceled || !result.filePaths.length)
            return null;
        try {
            return readImageAsDataUri(result.filePaths[0]);
        }
        catch (err) {
            console.error("[pick-image-file] Klarte ikke lese valgt fil:", err);
            return null;
        }
    });
    // Samme prinsipp, men for en CSS-fil - leser den rett inn som ren
    // tekst (ikke base64) siden den skal settes rett inn i en <style>-
    // tag pa overlayene, ikke vises som et bilde.
    electron_1.ipcMain.handle("pick-css-file", async () => {
        if (!mainWindow)
            return null;
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
            title: "Velg CSS-fil",
            properties: ["openFile"],
            filters: [{ name: "CSS-filer", extensions: ["css"] }]
        });
        if (result.canceled || !result.filePaths.length)
            return null;
        try {
            return node_fs_1.default.readFileSync(result.filePaths[0], "utf8");
        }
        catch (err) {
            console.error("[pick-css-file] Klarte ikke lese valgt fil:", err);
            return null;
        }
    });
    // Lar brukeren velge FLERE filer i EN operasjon (f.eks. bakgrunn +
    // logo + egen CSS-fil samtidig) - kategoriserer hver fil automatisk
    // basert pa filnavn/filtype, sa de "legger seg riktig" uten at
    // brukeren ma velge tre ganger. Regel: .css-filer -> egendefinert
    // CSS, filnavn som inneholder "logo" -> logo, alt annet bilde ->
    // bakgrunnsbilde (siste treff vinner hvis flere bakgrunnskandidater
    // velges samtidig).
    electron_1.ipcMain.handle("pick-theme-files", async () => {
        if (!mainWindow)
            return null;
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
            title: "Velg tema-filer (bakgrunn, logo, CSS - flere om gangen)",
            properties: ["openFile", "multiSelections"],
            filters: [
                { name: "Tema-filer", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "css"] },
                { name: "Alle filer", extensions: ["*"] }
            ]
        });
        if (result.canceled || !result.filePaths.length)
            return null;
        const picked = {};
        // Forste passering: CSS-filer og filer med "logo" i navnet er
        // entydige - haandteres direkte. Bilder UTEN "logo" i navnet
        // samles i stedet opp i en egen liste, siden vi ikke vet enna om
        // det er ett eller flere av dem.
        const unlabeledImagePaths = [];
        for (const filePath of result.filePaths) {
            const fileName = node_path_1.default.basename(filePath).toLowerCase();
            const ext = node_path_1.default.extname(filePath).toLowerCase().replace(".", "");
            try {
                if (ext === "css") {
                    picked.customCss = node_fs_1.default.readFileSync(filePath, "utf8");
                }
                else if (fileName.includes("logo")) {
                    picked.logoUrl = readImageAsDataUri(filePath);
                }
                else {
                    unlabeledImagePaths.push(filePath);
                }
            }
            catch (err) {
                console.error("[pick-theme-files] Klarte ikke lese fil:", filePath, err);
            }
        }
        // Andre passering: bilder uten "logo" i navnet. Hvis en fil med
        // "logo" i navnet allerede ble funnet over, antas ALLE disse a
        // vaere bakgrunn (siste valgte vinner, som for). Er det derimot
        // INGEN eksplisitt logo-fil og TO ELLER FLERE navnlose bilder
        // valgt samtidig, antas det vanligste bruksmonsteret: forste fil
        // = bakgrunn, andre fil = logo (i stedet for at begge kjemper om
        // samme bakgrunns-felt og den ene stille overskriver den andre -
        // noe som var arsaken til at verken bakgrunn.png eller file.png
        // ble satt riktig forrige gang).
        if (unlabeledImagePaths.length === 1 || picked.logoUrl) {
            for (const filePath of unlabeledImagePaths) {
                try {
                    picked.bgImageUrl = readImageAsDataUri(filePath);
                }
                catch (err) {
                    console.error("[pick-theme-files] Klarte ikke lese fil:", filePath, err);
                }
            }
        }
        else if (unlabeledImagePaths.length >= 2) {
            try {
                picked.bgImageUrl = readImageAsDataUri(unlabeledImagePaths[0]);
                picked.logoUrl = readImageAsDataUri(unlabeledImagePaths[1]);
            }
            catch (err) {
                console.error("[pick-theme-files] Klarte ikke lese fil:", err);
            }
        }
        return picked;
    });
    // ---- Oppdateringer (GitHub Releases, via electron-updater) ----
    // Manuell sjekk - trigges fra Settings-fanen sin "Check for updates"-
    // knapp. Returnerer et rent JSON-svar UI-et kan vise direkte, i
    // stedet for a la UI-et matte lytte pa autoUpdater sine interne
    // events for a fa et konkret svar pa "er det en ny versjon?".
    electron_1.ipcMain.handle("check-for-updates", async () => {
        if (!electron_1.app.isPackaged) {
            return { ok: false, message: "Kun tilgjengelig i en pakket .exe, ikke i npm run dev.", currentVersion: electron_1.app.getVersion() };
        }
        if (updateCheckInFlight) {
            return { ok: false, message: "En sjekk pagar allerede.", currentVersion: electron_1.app.getVersion() };
        }
        updateCheckInFlight = true;
        try {
            const result = await electron_updater_1.autoUpdater.checkForUpdates();
            const latestVersion = result?.updateInfo?.version;
            const updateAvailable = !!latestVersion && latestVersion !== electron_1.app.getVersion();
            return {
                ok: true,
                currentVersion: electron_1.app.getVersion(),
                latestVersion: latestVersion || electron_1.app.getVersion(),
                updateAvailable,
                releaseNotes: typeof result?.updateInfo?.releaseNotes === "string" ? result.updateInfo.releaseNotes : ""
            };
        }
        catch (err) {
            return { ok: false, message: err?.message || String(err), currentVersion: electron_1.app.getVersion() };
        }
        finally {
            updateCheckInFlight = false;
        }
    });
    // Installerer en oppdatering som allerede er ferdig nedlastet i
    // bakgrunnen (autoDownload=true over) - lukker og restarter appen.
    // Feiler tydelig (i stedet for a gjore ingenting) hvis ingenting er
    // klart til installasjon enna.
    electron_1.ipcMain.handle("quit-and-install-update", () => {
        if (!electron_1.app.isPackaged) {
            return { ok: false, message: "Kun tilgjengelig i en pakket .exe." };
        }
        electron_updater_1.autoUpdater.quitAndInstall();
        return { ok: true };
    });
    electron_1.app.on("activate", () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
