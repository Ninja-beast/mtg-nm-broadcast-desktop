import { API_BASE } from "../lib/apiClient";
import type { BroadcastStatePayload } from "../types";

export type PhaseState = { status: string; remainingMs: number; thenScene: string };

export async function getBroadcastState(): Promise<BroadcastStatePayload | null> {
  const res = await fetch(`${API_BASE}/broadcast/state`);
  return res.json();
}

export async function getPhases(): Promise<Record<string, PhaseState>> {
  const res = await fetch(`${API_BASE}/broadcast/phases`);
  return res.json();
}

export async function armPhase(key: string, fields?: Record<string, unknown>): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/broadcast/phases/${key}/arm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields ?? {})
  });
  return res.json();
}

export async function cancelPhase(key: string): Promise<void> {
  await fetch(`${API_BASE}/broadcast/phases/${key}/cancel`, { method: "POST" });
}

export async function forcePhase(key: string): Promise<void> {
  await fetch(`${API_BASE}/broadcast/phases/${key}/force`, { method: "POST" });
}

export async function pausePhase(key: string): Promise<void> {
  await fetch(`${API_BASE}/broadcast/phases/${key}/pause`, { method: "POST" });
}

export async function resumePhase(key: string): Promise<void> {
  await fetch(`${API_BASE}/broadcast/phases/${key}/resume`, { method: "POST" });
}

export async function setCamera(camera: string): Promise<void> {
  await fetch(`${API_BASE}/broadcast/camera`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ camera })
  });
}

export async function setNameTagsVisible(show: boolean): Promise<void> {
  await fetch(`${API_BASE}/broadcast/name-tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ show })
  });
}

export async function setCardShowcaseVisible(show: boolean): Promise<void> {
  await fetch(`${API_BASE}/broadcast/card-showcase-visibility`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ show })
  });
}

export async function setActiveScene(scene: string): Promise<void> {
  await fetch(`${API_BASE}/broadcast/scene`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scene })
  });
}

export async function setBoardMatch(board: "bo3" | "bo5", matchId: number): Promise<void> {
  await fetch(`${API_BASE}/broadcast/set-match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ board, matchId })
  });
}

export async function stopStream(): Promise<void> {
  await fetch(`${API_BASE}/broadcast/stop-stream`, { method: "POST" });
}

export async function endMatch(fields?: Record<string, unknown>): Promise<void> {
  await fetch(`${API_BASE}/broadcast/end-match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields ?? {})
  });
}

export async function setTimer(fields: Record<string, unknown>): Promise<void> {
  await fetch(`${API_BASE}/broadcast/timer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields)
  });
}

export async function armIntermission(fields?: Record<string, unknown>): Promise<void> {
  await fetch(`${API_BASE}/broadcast/arm-intermission`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields ?? {})
  });
}

export async function cancelIntermission(): Promise<void> {
  await fetch(`${API_BASE}/broadcast/cancel-intermission`, { method: "POST" });
}

// ---- OBS runtime (Program/Preview/Studio Mode) ----

export async function getObsStudioState(): Promise<{ enabled: boolean; program: string; preview: string }> {
  const res = await fetch(`${API_BASE}/obs/studio-state`);
  return res.json();
}

export async function getObsScreenshot(which: "program" | "preview"): Promise<{ image: string | null }> {
  const res = await fetch(`${API_BASE}/obs/screenshot?which=${which}`);
  return res.json();
}

export async function setObsPreviewScene(scene: string): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/obs/preview-scene`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scene })
  });
  return res.json();
}

export async function takeObsLive(scene?: string): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/obs/take`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scene })
  });
  return res.json();
}

export async function cutObsScene(scene: string): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/obs/cut`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scene })
  });
  return res.json();
}

export async function stingerObsTransition(scene: string): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/obs/stinger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scene })
  });
  return res.json();
}

export async function enableObsStudioMode(): Promise<void> {
  await fetch(`${API_BASE}/obs/studio-mode/enable`, { method: "POST" });
}

export async function startObsStream(): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`${API_BASE}/obs/start-stream`, { method: "POST" });
  return res.json();
}
