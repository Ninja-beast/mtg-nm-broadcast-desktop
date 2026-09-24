"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Eksponerer KUN de kallene UI-et faktisk trenger for vert/klient-
// modus, fil-velgeren for Tema-fanen, og oppdateringssjekk -
// contextIsolation er PA, sa renderer-siden (React-appen) kan ikke
// naa Node/Electron-API-er direkte, kun det som eksplisitt legges her.
electron_1.contextBridge.exposeInMainWorld("electronAPI", {
    getConnectionConfig: () => electron_1.ipcRenderer.invoke("get-connection-config"),
    saveConnectionConfig: (config) => electron_1.ipcRenderer.invoke("save-connection-config", config),
    pickImageFile: () => electron_1.ipcRenderer.invoke("pick-image-file"),
    pickCssFile: () => electron_1.ipcRenderer.invoke("pick-css-file"),
    pickThemeFiles: () => electron_1.ipcRenderer.invoke("pick-theme-files"),
    checkForUpdates: () => electron_1.ipcRenderer.invoke("check-for-updates"),
    quitAndInstallUpdate: () => electron_1.ipcRenderer.invoke("quit-and-install-update")
});
