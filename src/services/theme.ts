import { API_BASE } from "../lib/apiClient";

export type ThemesList = { names: string[]; activeName: string };
export type ActiveTheme = { hiddenLogoScenes?: string[] };

export async function getThemesList(): Promise<ThemesList> {
  const res = await fetch(`${API_BASE}/themes`);
  return res.json();
}

export async function getActiveTheme(): Promise<ActiveTheme> {
  const res = await fetch(`${API_BASE}/themes/active`);
  return res.json();
}

export async function saveTheme(fields: {
  name: string;
  bgImageUrl?: string;
  logoUrl?: string;
  customCss?: string;
  hiddenLogoScenes?: string[];
  clearLogo?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/themes/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body.error };
  return { ok: true, ...body };
}

export async function activateTheme(name: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/themes/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body.error };
  return { ok: true, ...body };
}
