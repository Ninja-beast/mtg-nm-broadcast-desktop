import { API_BASE } from "../lib/apiClient";

export type LogEntry = { id: number; level: string; message: string; created_at: string };
export type LogSettings = { level: string; retentionDays: number };

export async function getLogSettings(): Promise<LogSettings> {
  const res = await fetch(`${API_BASE}/logs/settings`);
  return res.json();
}

export async function saveLogSettings(level: string, retentionDays: number): Promise<void> {
  await fetch(`${API_BASE}/logs/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, retentionDays })
  });
}

export async function getLogs(level: string, limit = 200): Promise<LogEntry[]> {
  const res = await fetch(`${API_BASE}/logs?level=${level}&limit=${limit}`);
  return res.json();
}

export function logsExportUrl(level: string): string {
  return `${API_BASE}/logs/export?level=${level}`;
}
