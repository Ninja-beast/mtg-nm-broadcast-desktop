import { API_BASE } from "../lib/apiClient";

export type MeleeSettings = { hasClientId: boolean; hasClientSecret: boolean; tournamentId: string; enabled: boolean };
export type MeleeLogEntry = { id: number; ran_at: string; ok: number; message: string };

export async function getMeleeSettings(): Promise<MeleeSettings> {
  const res = await fetch(`${API_BASE}/settings/melee`);
  return res.json();
}

export async function saveMeleeSettings(fields: { clientId?: string; clientSecret?: string; tournamentId?: string; enabled?: boolean }): Promise<void> {
  await fetch(`${API_BASE}/settings/melee`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields)
  });
}

export async function getMeleeLog(): Promise<MeleeLogEntry[]> {
  const res = await fetch(`${API_BASE}/melee/log`);
  return res.json();
}

export async function syncMeleeNow(): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/melee/sync`, { method: "POST" });
  return res.json();
}
