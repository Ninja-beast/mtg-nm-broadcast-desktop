import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import { autoUpdater } from "electron-updater";
import { startServer } from "../server/api";
import { getConnectionConfig, saveConnectionConfig, ConnectionConfig } from "./client-config";

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#0b1220",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true
    }
  });

  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
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
function readImageAsDataUri(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().replace(".", "");
  const mimeType = ext === "jpg" ? "jpeg" : ext; // "jpg" -> "jpeg" for et gyldig MIME-navn
  const buffer = fs.readFileSync(filePath);
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
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-downloaded", () => {
    dialog
      .showMessageBox({
        type: "info",
        title: "Oppdatering klar",
        message: "En ny versjon er lastet ned i bakgrunnen. Vil du starte appen pa nytt na for a installere den?",
        buttons: ["Start pa nytt na", "Senere (installeres neste gang appen lukkes)"]
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on("error", (err) => {
    // Stille feilhandtering - f.eks. ingen internettforbindelse skal
    // aldri krasje appen eller forstyrre bruk under en sending.
    console.error("[auto-update] feil:", err);
  });

  autoUpdater.checkForUpdates().catch((err) => {
    console.error("[auto-update] kunne ikke sjekke etter oppdatering:", err);
  });
}

app.whenReady().then(() => {
  const connectionConfig = getConnectionConfig();

  if (!connectionConfig.remoteAddress) {
    startServer();
  }

  createWindow();
  setupAutoUpdater();

  ipcMain.handle("get-connection-config", () => getConnectionConfig());

  ipcMain.handle("save-connection-config", (_event, config: ConnectionConfig) => {
    saveConnectionConfig(config);
    app.relaunch();
    app.exit(0);
  });

  // Apner Windows sin EKTE filutforsker, begrenset til bildefiler.
  // Returnerer null hvis brukeren avbryter i stedet for a velge noe.
  ipcMain.handle("pick-image-file", async () => {
    if (!mainWindow) return null;

    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Velg bilde",
      properties: ["openFile"],
      filters: [
        { name: "Bilder", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] },
        { name: "Alle filer", extensions: ["*"] }
      ]
    });

    if (result.canceled || !result.filePaths.length) return null;

    try {
      return readImageAsDataUri(result.filePaths[0]);
    } catch (err) {
      console.error("[pick-image-file] Klarte ikke lese valgt fil:", err);
      return null;
    }
  });

  // Samme prinsipp, men for en CSS-fil - leser den rett inn som ren
  // tekst (ikke base64) siden den skal settes rett inn i en <style>-
  // tag pa overlayene, ikke vises som et bilde.
  ipcMain.handle("pick-css-file", async () => {
    if (!mainWindow) return null;

    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Velg CSS-fil",
      properties: ["openFile"],
      filters: [{ name: "CSS-filer", extensions: ["css"] }]
    });

    if (result.canceled || !result.filePaths.length) return null;

    try {
      return fs.readFileSync(result.filePaths[0], "utf8");
    } catch (err) {
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
  ipcMain.handle("pick-theme-files", async () => {
    if (!mainWindow) return null;

    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Velg tema-filer (bakgrunn, logo, CSS - flere om gangen)",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Tema-filer", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "css"] },
        { name: "Alle filer", extensions: ["*"] }
      ]
    });

    if (result.canceled || !result.filePaths.length) return null;

    const picked: { bgImageUrl?: string; logoUrl?: string; customCss?: string } = {};

    // Forste passering: CSS-filer og filer med "logo" i navnet er
    // entydige - haandteres direkte. Bilder UTEN "logo" i navnet
    // samles i stedet opp i en egen liste, siden vi ikke vet enna om
    // det er ett eller flere av dem.
    const unlabeledImagePaths: string[] = [];

    for (const filePath of result.filePaths) {
      const fileName = path.basename(filePath).toLowerCase();
      const ext = path.extname(filePath).toLowerCase().replace(".", "");

      try {
        if (ext === "css") {
          picked.customCss = fs.readFileSync(filePath, "utf8");
        } else if (fileName.includes("logo")) {
          picked.logoUrl = readImageAsDataUri(filePath);
        } else {
          unlabeledImagePaths.push(filePath);
        }
      } catch (err) {
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
        } catch (err) {
          console.error("[pick-theme-files] Klarte ikke lese fil:", filePath, err);
        }
      }
    } else if (unlabeledImagePaths.length >= 2) {
      try {
        picked.bgImageUrl = readImageAsDataUri(unlabeledImagePaths[0]);
        picked.logoUrl = readImageAsDataUri(unlabeledImagePaths[1]);
      } catch (err) {
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
  ipcMain.handle("check-for-updates", async () => {
    if (!app.isPackaged) {
      return { ok: false, message: "Kun tilgjengelig i en pakket .exe, ikke i npm run dev.", currentVersion: app.getVersion() };
    }
    if (updateCheckInFlight) {
      return { ok: false, message: "En sjekk pagar allerede.", currentVersion: app.getVersion() };
    }
    updateCheckInFlight = true;
    try {
      const result = await autoUpdater.checkForUpdates();
      const latestVersion = result?.updateInfo?.version;
      const updateAvailable = !!latestVersion && latestVersion !== app.getVersion();
      return {
        ok: true,
        currentVersion: app.getVersion(),
        latestVersion: latestVersion || app.getVersion(),
        updateAvailable,
        releaseNotes: typeof result?.updateInfo?.releaseNotes === "string" ? result.updateInfo.releaseNotes : ""
      };
    } catch (err: any) {
      return { ok: false, message: err?.message || String(err), currentVersion: app.getVersion() };
    } finally {
      updateCheckInFlight = false;
    }
  });

  // Installerer en oppdatering som allerede er ferdig nedlastet i
  // bakgrunnen (autoDownload=true over) - lukker og restarter appen.
  // Feiler tydelig (i stedet for a gjore ingenting) hvis ingenting er
  // klart til installasjon enna.
  ipcMain.handle("quit-and-install-update", () => {
    if (!app.isPackaged) {
      return { ok: false, message: "Kun tilgjengelig i en pakket .exe." };
    }
    autoUpdater.quitAndInstall();
    return { ok: true };
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
