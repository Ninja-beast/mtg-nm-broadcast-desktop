// DELTE OVERLAY-HJELPERE
// ======================
// Tre sma biter som fantes duplisert (eller, for flagg-normalisering,
// MANGLET helt ett sted) pa tvers av script.js (BO3) og bo5-scene.js
// (BO5). Inkluderes med <script src="shared-utils.js"></script> FOR
// de filene som bruker dem.

// ---- FLAGG-NORMALISERING ----
// Fantes FOR KUN i bo5-scene.js - BO3 (script.js) brukte p1.flag/
// p2.flag radt som filnavn uten noen normalisering. Det betyr at hvis
// Melee (eller en operator) noen gang skriver "Norway" i stedet for
// "no" for en BO3-kamp, ville flagget blitt riktig pa BO5 men BRUTT
// pa BO3 (fant aldri images/flags/Norway.png). Na delt, sa begge
// scenene oppforer seg likt.
window.normalizeFlagCode = function (value) {
  if (value == null) return "";

  const aliases = {
    norge: "no",
    norway: "no",
    sverige: "se",
    sweden: "se",
    danmark: "dk",
    denmark: "dk",
    finland: "fi",
    england: "gb-eng",
    scotland: "gb-sct",
    wales: "gb-wls",
    northernireland: "gb-nir",
    uk: "gb",
    unitedkingdom: "gb",
    usa: "us",
    unitedstates: "us"
  };

  const cleaned = String(value)
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9-]/g, "");

  if (!cleaned) return "";

  return aliases[cleaned] || cleaned;
};

// ---- LIV-PULS-ANIMASJON ----
// Identisk i script.js (animateLifeChange) og bo5-scene.js (animateLife).
window.animateLifeChange = function (el) {
  if (!el) return;
  el.classList.remove("change");
  void el.offsetWidth;
  el.classList.add("change");
  setTimeout(() => el.classList.remove("change"), 420);
};

// ---- KLOKKE-KONTROLLER ----
// script.js og bo5-scene.js hadde hver sin nesten identiske kopi av
// start/pause/reset-logikken (og bo5-overlay.js hadde i tillegg en
// TREDJE kopi av formatSecondsAsClock). Denne factory-funksjonen
// lager en UAVHENGIG klokke-instans per displayElementId, sa BO3 og
// BO5 fortsatt har hver sin egen klokke-state (de kjorer jo ofte
// samtidig som separate scener).
//
// Godtar BADE et rent sekundtall (som script.js sender) OG en
// "MM:SS"-streng (som bo5-scene.js sender, via bo5-overlay.js sin
// oversettelse) - begge kall-mate fungerer uendret.
//
// MERK - liten oppforsel-retting: den gamle bo5-scene.js sin reset
// satte alltid den interne timerSeconds til 0 uansett hva som ble
// sendt inn, men viste likevel den rastekst-verdien som kom inn (et
// lite avvik fra script.js sin reset, som satte OG viste samme tall).
// Denne delte versjonen bruker script.js sin oppforsel begge steder
// (tolker input konsekvent bade for start og reset) - et bevisst
// llite fix, ikke bare en ren kopi av det gamle avviket.
window.createTimerController = function (displayElementId) {
  let timerSeconds = 0;
  let pausedSeconds = -1;
  let timerInterval = null;
  let currentTimerState = "pause";

  function formatSecondsAsClock(totalSecondsRaw) {
    const totalSeconds = Math.max(0, Math.floor(Number(totalSecondsRaw) || 0));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return (minutes < 10 ? "0" + minutes : String(minutes)) + ":" + (seconds < 10 ? "0" + seconds : String(seconds));
  }

  function parseInput(value) {
    if (typeof value === "string" && value.includes(":")) {
      const parts = value.split(":");
      return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
    }
    return Number(value) || 0;
  }

  function handleTimer(rawValue, status) {
    const display = document.getElementById(displayElementId);
    if (!display) return;

    status = (status || "pause").toLowerCase().trim();
    if (status === currentTimerState && status !== "reset") return;

    const previousTimerState = currentTimerState;
    currentTimerState = status;

    if (status === "start") {
      timerSeconds = previousTimerState === "pause" && pausedSeconds >= 0 ? pausedSeconds : parseInput(rawValue);
      pausedSeconds = -1;

      if (timerInterval) clearInterval(timerInterval);
      timerInterval = setInterval(() => {
        if (timerSeconds <= 0) {
          clearInterval(timerInterval);
          timerInterval = null;
          display.innerText = "00:00";
          return;
        }
        timerSeconds -= 1;
        display.innerText = formatSecondsAsClock(timerSeconds);
      }, 1000);
    }

    if (status === "pause") {
      pausedSeconds = timerSeconds;
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    }

    if (status === "reset") {
      pausedSeconds = -1;
      timerSeconds = parseInput(rawValue);
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      display.innerText = formatSecondsAsClock(timerSeconds);
    }
  }

  return { handleTimer, formatSecondsAsClock };
};
