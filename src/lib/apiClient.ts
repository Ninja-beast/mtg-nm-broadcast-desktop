import { useEffect, useState } from "react";

// Server-adresse og tilgangskode kommer na fra Electron sin
// hovedprosess (electron/client-config.ts) via preload-broen, IKKE
// localStorage - main.ts ma vite dette FOR den bestemmer om den skal
// starte en lokal server i det hele tatt (vert-modus) eller ikke
// (klient-modus, fjernstyrer en annen PC).
declare global {
  interface Window {
    electronAPI: {
      getConnectionConfig: () => Promise<{ remoteAddress: string; accessToken: string }>;
      saveConnectionConfig: (config: { remoteAddress: string; accessToken: string }) => Promise<void>;
      pickImageFile: () => Promise<string | null>;
      pickCssFile: () => Promise<string | null>;
      pickThemeFiles: () => Promise<{ bgImageUrl?: string; logoUrl?: string; customCss?: string } | null>;
      checkForUpdates: () => Promise<{ ok: boolean; message?: string; currentVersion: string; latestVersion?: string; updateAvailable?: boolean; releaseNotes?: string }>;
      quitAndInstallUpdate: () => Promise<{ ok: boolean; message?: string }>;
    };
  }
}

const DEFAULT_PORT = "4848";

export function resolveApiBase(rawAddress: string): string {
  const trimmed = String(rawAddress || "").trim();
  if (!trimmed) return `http://localhost:${DEFAULT_PORT}/api`;

  let address = trimmed;
  let protocol = "http";

  if (/^https:\/\//i.test(address)) {
    protocol = "https";
    address = address.replace(/^https:\/\//i, "");
  } else if (/^http:\/\//i.test(address)) {
    protocol = "http";
    address = address.replace(/^http:\/\//i, "");
  }

  address = address.replace(/\/+$/, "");

  const hasPort = /:\d+$/.test(address);
  const looksLikeLocalAddress = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(address) || /^localhost(:\d+)?$/i.test(address);

  if (!looksLikeLocalAddress && !hasPort) {
    protocol = "https";
  }

  const needsDefaultPort = looksLikeLocalAddress && !hasPort;
  return `${protocol}://${address}${needsDefaultPort ? ":" + DEFAULT_PORT : ""}/api`;
}

// Bygger ws(s)://-adressen til /ws-admin ut fra samme vert som
// API_BASE allerede peker mot (bytter kun http(s) -> ws(s) og
// "/api" -> "/ws-admin") - sa dette ogsa fungerer riktig i klient-
// modus (fjernstyrer en annen PC).
export function resolveAdminWsUrl(apiBase: string): string {
  return apiBase.replace(/^http/i, "ws").replace(/\/api$/, "/ws-admin");
}

// Trygge standardverdier for FORSTE rendering, mens vi venter pa svar
// fra hovedprosessen (asynkront, se App() sin "ready"-sjekk under).
export let API_BASE = `http://localhost:${DEFAULT_PORT}/api`;
export let CURRENT_REMOTE_ADDRESS = "";
export let CURRENT_ACCESS_TOKEN = "";

// Legger pa tilgangskoden automatisk pa ALLE fetch-kall - trengs kun
// nar denne installasjonen faktisk fjernstyrer en annen PC (klient-
// modus); serveren ignorerer headeren stille nar den ikke trengs.
// CURRENT_AUTH_TOKEN legges til pa samme mate - satt av App() etter
// vellykket innlogging (se LoginScreen/App under).
export let CURRENT_AUTH_TOKEN = "";

// ES-modul-importerte "let"-bindinger kan LESES fritt fra andre
// filer, men ikke tildeles direkte utenfra (kompilatorfeil) - disse
// setterne er den eneste lovlige mate a endre dem pa fra App.tsx
// (etter innlogging/tilkobling er satt opp) uten a matte skrive om
// alle stedene som fortsatt bare LESER API_BASE/CURRENT_* direkte.
export function setApiBase(value: string) {
  API_BASE = value;
}
export function setRemoteAddress(value: string) {
  CURRENT_REMOTE_ADDRESS = value;
}
export function setAccessToken(value: string) {
  CURRENT_ACCESS_TOKEN = value;
}
export function setAuthToken(value: string) {
  CURRENT_AUTH_TOKEN = value;
}

const originalFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const headers: Record<string, string> = { ...((init && (init.headers as any)) || {}) };
  if (CURRENT_ACCESS_TOKEN) headers["X-Access-Token"] = CURRENT_ACCESS_TOKEN;
  if (CURRENT_AUTH_TOKEN) headers["X-Auth-Token"] = CURRENT_AUTH_TOKEN;
  init = { ...(init || {}), headers };
  return originalFetch(input, init);
};
// Scryfall-oppslag delt av MatchControlTab (card showcase) og
// GraphicsControlTab (forhandsvisning av samme showcase-navn) - lag
// tidligere duplisert to steder i den ene store App.tsx-filen.
export async function fetchScryfallImageByName(name: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.scryfall.com/cards/named?fuzzy=" + encodeURIComponent(name));
    if (!res.ok) return null;
    const card = await res.json();
    return card?.image_uris?.normal || card?.card_faces?.[0]?.image_uris?.normal || null;
  } catch {
    return null;
  }
}

export function useJson<T>(url: string, deps: unknown[] = []): [T | null, () => void] {
  const [data, setData] = useState<T | null>(null);

  function reload() {
    fetch(url)
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData(null));
  }

  useEffect(reload, deps);
  return [data, reload];
}
