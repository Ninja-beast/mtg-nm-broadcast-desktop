import { API_BASE } from "../lib/apiClient";
import type { SystemStatus, SystemAlert } from "../types";

export type AdvancedInfo = {
  nodeVersion: string;
  electronVersion: string;
  chromeVersion: string;
  dbPath: string;
  dbSizeBytes: number;
  wsUrl: string;
  wsAdminUrl: string;
};

export async function getSystemStatus(): Promise<SystemStatus | null> {
  const res = await fetch(`${API_BASE}/system/status`);
  return res.json();
}

export async function getSystemAlerts(): Promise<SystemAlert[]> {
  const res = await fetch(`${API_BASE}/system/alerts`);
  return res.json();
}

export async function getAdvancedInfo(): Promise<AdvancedInfo> {
  const res = await fetch(`${API_BASE}/system/advanced`);
  return res.json();
}
