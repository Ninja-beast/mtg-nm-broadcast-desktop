import { API_BASE } from "../lib/apiClient";

export type JudgeEntry = { id: number; tournament_id: number; match_id: number | null; type: string; message: string; judge_username: string; created_at: string };

export async function getJudgeEntries(params: { tournamentId?: number; matchId?: number }): Promise<JudgeEntry[]> {
  const query = new URLSearchParams();
  if (params.tournamentId != null) query.set("tournamentId", String(params.tournamentId));
  if (params.matchId != null) query.set("matchId", String(params.matchId));
  const res = await fetch(`${API_BASE}/judge/entries?${query.toString()}`);
  return res.json();
}

export async function createJudgeEntry(fields: { tournamentId?: number; matchId?: number; type: string; message: string }): Promise<void> {
  await fetch(`${API_BASE}/judge/entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields)
  });
}
