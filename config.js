import AsyncStorage from "@react-native-async-storage/async-storage";

// Mobilen kan IKKE bruke "localhost" - det ville betydd telefonen selv,
// ikke PC-en. Stotter na TO typer adresser i samme felt:
//   1. Lokal IP pa samme WiFi, f.eks. "192.168.1.42" (eller
//      "192.168.1.42:4848" med eksplisitt port) - antar http:// og
//      legger til standardport 4848 hvis ingen port er skrevet.
//   2. Et ekte domene/tunnel-adresse, f.eks.
//      "portrait-epson-representatives-things.trycloudflare.com" eller
//      en fullstendig "https://..." - antar https:// og INGEN
//      portnummer (Cloudflare Tunnel handterer det selv), siden dette
//      brukes nar man kobler til hjemmeserveren utenfra internett i
//      stedet for lokalt WiFi.
const STORAGE_KEY = "mtg_server_address";
const TOKEN_STORAGE_KEY = "mtg_access_token";
const DEFAULT_PORT = "4848";

let cachedAddress = null;
let cachedToken = null;

export async function getServerAddress() {
  if (cachedAddress) return cachedAddress;
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  cachedAddress = stored || "";
  return cachedAddress;
}

export async function setServerAddress(address) {
  const cleaned = String(address || "").trim();
  cachedAddress = cleaned;
  await AsyncStorage.setItem(STORAGE_KEY, cleaned);
}

export async function getAccessToken() {
  if (cachedToken !== null) return cachedToken;
  const stored = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
  cachedToken = stored || "";
  return cachedToken;
}

export async function setAccessToken(token) {
  const cleaned = String(token || "").trim();
  cachedToken = cleaned;
  await AsyncStorage.setItem(TOKEN_STORAGE_KEY, cleaned);
}

// Patcher global fetch EN gang ved oppstart (kalt fra App.js) sa
// tilgangskoden automatisk sendes med pa alle kall mot serveren -
// uten dette matte HVERT eneste fetch-kall i hele appen endres manuelt
// for a legge til headeren. Legger KUN pa headeren nar URL-en faktisk
// peker mot den lagrede serveradressen, for sikkerhets skyld (unngar a
// lekke koden til andre tilfeldige kall appen skulle gjore).
let fetchPatched = false;

export function installAccessTokenFetch() {
  if (fetchPatched) return;
  fetchPatched = true;

  const originalFetch = global.fetch.bind(global);

  global.fetch = async (input, init) => {
    try {
      const address = await getServerAddress();
      const token = await getAccessToken();
      const urlStr = typeof input === "string" ? input : input?.url ?? "";

      if (address && token && urlStr.includes(String(address).replace(/^https?:\/\//i, ""))) {
        init = { ...(init || {}), headers: { ...((init && init.headers) || {}), "X-Access-Token": token } };
      }
    } catch (err) {
      // Stille - sender kallet uten header hvis noe feiler her.
    }

    return originalFetch(input, init);
  };
}

export async function getApiBase() {
  const raw = await getServerAddress();
  if (!raw) return null;

  let address = String(raw).trim();
  let protocol = "http";

  if (/^https:\/\//i.test(address)) {
    protocol = "https";
    address = address.replace(/^https:\/\//i, "");
  } else if (/^http:\/\//i.test(address)) {
    protocol = "http";
    address = address.replace(/^http:\/\//i, "");
  }

  // Fjerner en evt. avsluttende skrastrek ("/") sa vi ikke ender opp
  // med dobbel skrastrek foran "/api".
  address = address.replace(/\/+$/, "");

  const hasPort = /:\d+$/.test(address);
  const looksLikeLocalAddress = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(address) || /^localhost(:\d+)?$/i.test(address);

  // Et ekte domene (ikke en lokal IP/localhost) uten eksplisitt port
  // er nesten alltid en HTTPS-tjeneste (Cloudflare Tunnel, en ekte
  // server osv.) - anta https og ikke legg til noen port.
  if (!looksLikeLocalAddress && !hasPort) {
    protocol = "https";
  }

  const needsDefaultPort = looksLikeLocalAddress && !hasPort;
  return `${protocol}://${address}${needsDefaultPort ? ":" + DEFAULT_PORT : ""}/api`;
}
