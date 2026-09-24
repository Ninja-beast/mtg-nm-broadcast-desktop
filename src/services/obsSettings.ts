import { API_BASE } from "../lib/apiClient";

export type ObsSettings = {
  connected: boolean;
  lastError: string;
  host: string;
  port: string;
  scenes: string[];
  sceneNameOverrides: Record<string, string>;
  placeholderScene: string;
};

export async function getObsSettings(): Promise<ObsSettings> {
  const res = await fetch(`${API_BASE}/settings/obs`);
  return res.json();
}

export async function saveObsSettings(fields: { host?: string; port?: string; password?: string; placeholderScene?: string }): Promise<void> {
  await fetch(`${API_BASE}/settings/obs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields)
  });
}

export async function connectToObs(): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/settings/obs/connect`, { method: "POST" });
  return res.json();
}

export async function disconnectFromObs(): Promise<void> {
  await fetch(`${API_BASE}/settings/obs/disconnect`, { method: "POST" });
}

export async function saveObsSceneName(sceneKey: string, obsSceneName: string): Promise<void> {
  await fetch(`${API_BASE}/settings/obs/scene-name`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sceneKey, obsSceneName })
  });
}
