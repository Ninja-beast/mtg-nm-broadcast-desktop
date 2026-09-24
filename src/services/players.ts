import { API_BASE } from "../lib/apiClient";
import type { Player } from "../types";

export async function listPlayers(tournamentId?: number): Promise<Player[]> {
  const res = await fetch(`${API_BASE}/players${tournamentId ? `?tournamentId=${tournamentId}` : ""}`);
  return res.json();
}

export async function createPlayer(tournamentId: number, name: string, flagCode?: string): Promise<{ id: number }> {
  const res = await fetch(`${API_BASE}/players`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tournamentId, name, flagCode })
  });
  return res.json();
}

export async function deletePlayer(id: number): Promise<void> {
  await fetch(`${API_BASE}/players/${id}`, { method: "DELETE" });
}

export async function setPlayerDeck(id: number, archetype: string): Promise<void> {
  await fetch(`${API_BASE}/players/${id}/deck`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archetype })
  });
}

export async function setPlayerFlag(id: number, flagCode: string): Promise<void> {
  await fetch(`${API_BASE}/players/${id}/flag`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flagCode })
  });
}

export async function getPlayerDeckCards(id: number): Promise<any> {
  const res = await fetch(`${API_BASE}/players/${id}/deck-cards`);
  return res.json();
}
