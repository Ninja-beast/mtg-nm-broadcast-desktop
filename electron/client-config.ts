import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

/**
 * KLIENT-KONFIGURASJON
 * =====================
 * Bestemmer om DENNE installasjonen av appen skal vaere VERT (kjorer
 * sin egen lokale server + OBS-tilkobling, slik appen alltid har
 * gjort) eller KLIENT (peker mot en annen PC sin server over
 * internett/tunnel, og starter ALDRI noen egen lokal server).
 *
 * Ma leses FOR noe vindu apnes (i main.ts sin app.whenReady()), sa
 * dette kan IKKE ligge i localStorage - det finnes bare inne i selve
 * nettside-vinduet (renderer-prosessen), som ikke er lastet enna pa
 * det tidspunktet. Lagres derfor som en enkel JSON-fil i Electron sin
 * egen userData-mappe i stedet, tilsvarende prinsipp som tournament.db
 * i server/db.ts.
 */
export interface ConnectionConfig {
  remoteAddress: string;
  accessToken: string;
}

const EMPTY_CONFIG: ConnectionConfig = { remoteAddress: "", accessToken: "" };

function resolveConfigPath(): string {
  try {
    const dir = app.getPath("userData");
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, "client-config.json");
  } catch {
    return path.join(process.cwd(), "client-config.dev.json");
  }
}

export function getConnectionConfig(): ConnectionConfig {
  try {
    const raw = fs.readFileSync(resolveConfigPath(), "utf8");
    const parsed = JSON.parse(raw);
    return {
      remoteAddress: String(parsed?.remoteAddress ?? ""),
      accessToken: String(parsed?.accessToken ?? "")
    };
  } catch {
    return EMPTY_CONFIG;
  }
}

export function saveConnectionConfig(config: ConnectionConfig): void {
  fs.writeFileSync(resolveConfigPath(), JSON.stringify(config, null, 2));
}
