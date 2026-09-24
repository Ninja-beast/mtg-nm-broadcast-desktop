import { API_BASE } from "../lib/apiClient";
import type { Tournament } from "../types";

export type Standing = { player_id: number; rank: number; wins: number; losses: number; draws: number };

export async function getTournament(): Promise<Tournament | null> {
  const res = await fetch(`${API_BASE}/tournament`);
  return res.json();
}

export async function createTournament(fields: Record<string, unknown>): Promise<{ id: number }> {
  const res = await fetch(`${API_BASE}/tournament`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields)
  });
  return res.json();
}

export async function updateTournament(id: number, fields: Record<string, unknown>): Promise<void> {
  await fetch(`${API_BASE}/tournament/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields)
  });
}

export async function deleteTournament(id: number): Promise<void> {
  await fetch(`${API_BASE}/tournament/${id}`, { method: "DELETE" });
}

export async function getStandings(tournamentId?: number): Promise<Standing[]> {
  const res = await fetch(`${API_BASE}/standings${tournamentId ? `?tournamentId=${tournamentId}` : ""}`);
  return res.json();
}

export async function generatePairings(tournamentId: number): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/tournament/${tournamentId}/generate-pairings`, { method: "POST" });
  return res.json();
}

export async function setRound(tournamentId: number, round: number | string): Promise<void> {
  await fetch(`${API_BASE}/tournament/${tournamentId}/set-round`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ round })
  });
}

export async function importTournamentCsv(tournamentId: number, csv: string): Promise<{ ok: boolean; playersCreated: number; matchesCreated: number; matchesUpdated: number; errors: string[] }> {
  const res = await fetch(`${API_BASE}/tournament/${tournamentId}/import-csv`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv })
  });
  return res.json();
}

export async function getRoundOptions(): Promise<{ rounds: string[] }> {
  const res = await fetch(`${API_BASE}/settings/rounds`);
  return res.json();
}

export async function saveRoundOptions(rounds: string[]): Promise<void> {
  await fetch(`${API_BASE}/settings/rounds`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rounds })
  });
}
