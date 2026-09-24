import { API_BASE } from "../lib/apiClient";
import type { Role } from "../types";

/**
 * SERVICES-LAG - AUTH & USERS
 * ===========================
 * Trinn 1 av refaktoreringen: alle fetch(`${API_BASE}/...`)-kall som
 * for lå spredt direkte inni fane-komponentene, samlet her per domene.
 * Endrer INGEN oppforsel - bare FLYTTER kode, sa hver fane senere kan
 * importere disse i stedet for a bygge sine egne fetch-kall.
 */

export type AuthSession = { token: string; username: string; role: Role };
export type UserAccount = { id: number; username: string; role: Role; created_at: string };
export type AccessToken = { id: number; label: string; token: string; status: "allowed" | "blocked"; last_used_at: string | null };

export async function getBootstrapStatus(): Promise<{ hasUsers: boolean }> {
  const res = await fetch(`${API_BASE}/auth/bootstrap-status`);
  return res.json();
}

export async function getCurrentSession(): Promise<{ username: string; role: Role } | null> {
  const res = await fetch(`${API_BASE}/auth/me`);
  if (!res.ok) return null;
  return res.json();
}

export async function login(username: string, password: string): Promise<{ ok: boolean; token?: string; username?: string; role?: Role; error?: string }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body.error || "Innlogging feilet." };
  return { ok: true, ...body };
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, { method: "POST" });
}

export async function listUsers(): Promise<UserAccount[]> {
  const res = await fetch(`${API_BASE}/users`);
  return res.json();
}

export async function createUser(username: string, password: string, role: Role): Promise<{ ok: boolean; error?: string; id?: number }> {
  const res = await fetch(`${API_BASE}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, role })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body.error };
  return { ok: true, ...body };
}

export async function deleteUser(id: number): Promise<void> {
  await fetch(`${API_BASE}/users/${id}`, { method: "DELETE" });
}

export async function setUserRole(id: number, role: Role): Promise<void> {
  await fetch(`${API_BASE}/users/${id}/role`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role })
  });
}

export async function setUserPassword(id: number, password: string): Promise<void> {
  await fetch(`${API_BASE}/users/${id}/password`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
}

export async function listAccessTokens(): Promise<AccessToken[]> {
  const res = await fetch(`${API_BASE}/access-tokens`);
  return res.json();
}

export async function createAccessToken(label: string): Promise<{ token: string }> {
  const res = await fetch(`${API_BASE}/access-tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label })
  });
  return res.json();
}

export async function setAccessTokenStatus(id: number, status: "allowed" | "blocked"): Promise<void> {
  await fetch(`${API_BASE}/access-tokens/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });
}

export async function deleteAccessToken(id: number): Promise<void> {
  await fetch(`${API_BASE}/access-tokens/${id}`, { method: "DELETE" });
}
