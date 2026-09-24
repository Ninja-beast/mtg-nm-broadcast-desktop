import { API_BASE } from "../lib/apiClient";

export type MetaKeycardOverride = { archetype_key: string; archetype_label: string; key_card_1: string; key_card_2: string };

export async function getCasterdeskScene(): Promise<any> {
  const res = await fetch(`${API_BASE}/scenes/casterdesk`);
  return res.json();
}

export async function getMetaScene(): Promise<{ rows: { archetype: string; count: string; share: string }[] }> {
  const res = await fetch(`${API_BASE}/scenes/meta`);
  return res.json();
}

export async function getStreamWidgetScene(): Promise<any> {
  const res = await fetch(`${API_BASE}/scenes/streamwidget`);
  return res.json();
}

export async function getMetaKeycards(): Promise<MetaKeycardOverride[]> {
  const res = await fetch(`${API_BASE}/meta-keycards`);
  return res.json();
}

export async function saveMetaKeycards(archetype: string, keyCard1: string, keyCard2: string): Promise<void> {
  await fetch(`${API_BASE}/meta-keycards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archetype, keyCard1, keyCard2 })
  });
}

export async function getStreamContentSettings(): Promise<any> {
  const res = await fetch(`${API_BASE}/settings/stream-content`);
  return res.json();
}

export async function saveStreamContentSettings(fields: Record<string, unknown>): Promise<void> {
  await fetch(`${API_BASE}/settings/stream-content`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields)
  });
}
