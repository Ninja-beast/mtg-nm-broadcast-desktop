import { contextBridge, ipcRenderer } from "electron";

// Eksponerer KUN de kallene UI-et faktisk trenger for vert/klient-
// modus, fil-velgeren for Tema-fanen, og oppdateringssjekk -
// contextIsolation er PA, sa renderer-siden (React-appen) kan ikke
// naa Node/Electron-API-er direkte, kun det som eksplisitt legges her.
contextBridge.exposeInMainWorld("electronAPI", {
  getConnectionConfig: () => ipcRenderer.invoke("get-connection-config"),
  saveConnectionConfig: (config: { remoteAddress: string; accessToken: string }) =>
    ipcRenderer.invoke("save-connection-config", config),
  pickImageFile: () => ipcRenderer.invoke("pick-image-file"),
  pickCssFile: () => ipcRenderer.invoke("pick-css-file"),
  pickThemeFiles: () => ipcRenderer.invoke("pick-theme-files"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  quitAndInstallUpdate: () => ipcRenderer.invoke("quit-and-install-update")
});
