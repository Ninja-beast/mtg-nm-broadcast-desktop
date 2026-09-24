import { API_BASE } from "../lib/apiClient";

export type BackupEntry = { filename: string; path: string; sizeBytes: number; createdAt: string };
export type BackupStatus = { lastBackupAt: string | null; lastBackupPath: string | null; backupsDir: string; backups: BackupEntry[] };

export async function getBackupStatus(): Promise<BackupStatus> {
  const res = await fetch(`${API_BASE}/backup/status`);
  return res.json();
}

export async function runBackup(): Promise<{ ok: boolean; error?: string; filename?: string; path?: string; sizeBytes?: number; createdAt?: string }> {
  const res = await fetch(`${API_BASE}/backup/run`, { method: "POST" });
  return res.json();
}

export async function restoreBackup(path: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/backup/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path })
  });
  return res.json();
}

export function backupDownloadUrl(filename: string): string {
  return `${API_BASE}/backup/download/${encodeURIComponent(filename)}`;
}
