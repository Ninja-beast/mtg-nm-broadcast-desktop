import { API_BASE } from "../lib/apiClient";
import type { Match } from "../types";

export async function listMatches(tournamentId?: number): Promise<Match[]> {
  const res = await fetch(`${API_BASE}/matches${tournamentId ? `?tournamentId=${tournamentId}` : ""}`);
  return res.json();
}

export async function createMatch(fields: Record<string, unknown>): Promise<{ id: number }> {
  const res = await fetch(`${API_BASE}/matches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields)
  });
  return res.json();
}

export async function patchMatch(id: number, fields: Record<string, unknown>): Promise<void> {
  await fetch(`${API_BASE}/matches/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields)
  });
}

export async function deleteMatch(id: number): Promise<void> {
  await fetch(`${API_BASE}/matches/${id}`, { method: "DELETE" });
}

export async function winGame(id: number, player: 1 | 2): Promise<void> {
  await fetch(`${API_BASE}/matches/${id}/win-game`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ player })
  });
}

export async function swapSides(id: number): Promise<void> {
  await fetch(`${API_BASE}/matches/${id}/swap-sides`, { method: "POST" });
}

export async function acknowledgeConflict(id: number, reason?: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/matches/${id}/acknowledge-conflict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason })
  });
  return res.json();
}
