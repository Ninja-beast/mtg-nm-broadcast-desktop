import type { SidebarKey } from "../types";

// Lokale app-preferanser for DENNE PC-en (localStorage) - ikke lagret pa
// serveren, sa hver maskin kan ha sitt eget oppsett. Brukes av Settings >
// General og av App.tsx (startside).

export type Language = "no" | "en";

export type Preferences = {
  language: Language;
  startTab: SidebarKey;
};

const STORAGE_KEY = "observer.preferences.v1";

export const DEFAULT_PREFERENCES: Preferences = {
  language: "no",
  startTab: "dashboard"
};

export function loadPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(prefs: Preferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Lagring er en bekvemmelighet - appen fungerer uten.
  }
}
