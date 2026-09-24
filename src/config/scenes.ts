// Delt mellom BroadcastControlPage (scene-knapper, TAKE LIVE) og
// MeleeSettingsTab sin ObsSceneNameOverrides (samme scene-liste, satt
// opp med custom OBS-scenenavn) - lag tidligere duplisert begge steder
// i den ene store App.tsx-filen.
export const SCENE_LABELS: Record<string, string> = {
  bo3: "Best of 3",
  bo5: "Best of 5",
  meta: "Meta overview",
  top16: "Top 16 bracket",
  bracket: "Top 8",
  casterdesk: "Caster Desk",
  starting: "Stream Starting",
  day2bracket: "Day 2 bracket",
  placeholder: "Placeholder",
  floor: "Floor",
  interview: "Interview",
  endstream: "End Stream"
};

export const SCENE_KEYS_ORDERED = [
  "bo3", "bo5", "meta",
  "top16", "bracket", "casterdesk",
  "starting", "day2bracket", "placeholder",
  "floor", "interview", "endstream"
];
