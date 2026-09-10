document.addEventListener("DOMContentLoaded", () => {

const WS_URL = "ws://localhost:4848/ws"
let socket = null

// Fase 6 (vinner-events): samme prinsipp som i script.js/BO3 - husker
// sist SETTE event_id lokalt, starter som null sa det aller forste
// svaret vi mottar aldri spilles av automatisk.
let lastSeenEventId = null

function log(...msg){
  console.log("[BO5 OVERLAY]", ...msg)
}

/**
 * bo5-scene.js (uendret fra den ekte overlay-designen) forventer data
 * pa den GAMLE Apps Script-formen: player.scoreWins/scoreLosses/
 * scoreDraw, player.points (navaerende spill-score, brukes til
 * score-segmentene), gameInfo.playoffFormat/timer/format. Den lokale
 * desktop-serveren sender derimot player.wins/losses/draws/gameWins
 * (se server/api.ts sin buildBroadcastPayload). I stedet for a endre
 * pa bo5-scene.js (som skal se noyaktig ut som originalen), oversetter
 * vi HER, pa samme mate som bo5-overlay.js sin doGet-mapping tidligere
 * gjorde mot regnearket.
 */
function formatSecondsAsClock(totalSecondsRaw){
  const totalSeconds = Math.max(0, Math.floor(Number(totalSecondsRaw) || 0))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return (minutes < 10 ? "0" + minutes : String(minutes)) + ":" + (seconds < 10 ? "0" + seconds : String(seconds))
}

function mapToLegacyShape(bo5, timer){
  if(!bo5) return defaultBo5Data_()

  // Draft-format: deck-navnet (arketype) gir ingen mening i draft -
  // samme prinsipp som isMeleeDraftFormat_ i det gamle MeleeSync.gs
  // og script.js/BO3 sin tilsvarende sjekk.
  const isDraft = /draft/i.test(bo5.format || "")

  function mapPlayer(p){
    return {
      name: p?.name ?? "PLAYER",
      life: p?.life ?? 20,
      points: p?.gameWins ?? 0,          // nåværende spill-score (segmentene)
      scoreWins: p?.wins ?? 0,           // turnerings-seire
      scoreLosses: p?.losses ?? 0,
      scoreDraw: p?.draws ?? 0,
      deck: isDraft ? "" : (p?.deck ?? ""),
      cardShowcase: p?.cardShowcase ?? "",   // Fase 4: navn sendes na, bo5-scene.js henter Scryfall-bildet
      uid: "",
      flag: p?.flag ?? ""
    }
  }

  return {
    player1: mapPlayer(bo5.player1),
    player2: mapPlayer(bo5.player2),
    gameInfo: {
      format: bo5.format || "",
      // Viser rundeteksten direkte (styrt fra dropdown i appen -
      // f.eks. "Runde 5" eller "Kvartfinale"), ikke lenger bordnummer.
      playoffFormat: bo5.round != null && bo5.round !== "" ? String(bo5.round).toUpperCase() : "",
      swissRound: "",
      timer: formatSecondsAsClock(timer?.seconds ?? 3000),
      timerStatus: timer?.status ?? "pause"
    },
    event: { id: "", type: "", player: "" }
  }
}

function defaultBo5Data_(){
  return {
    player1: { name: "PLAYER 1", life: 20, points: 0, scoreWins: 0, scoreLosses: 0, scoreDraw: 0, deck: "", cardShowcase: "", uid: "", flag: "" },
    player2: { name: "PLAYER 2", life: 20, points: 0, scoreWins: 0, scoreLosses: 0, scoreDraw: 0, deck: "", cardShowcase: "", uid: "", flag: "" },
    gameInfo: { format: "", playoffFormat: "", swissRound: "", timer: "", timerStatus: "" },
    event: { id: "", type: "", player: "" }
  }
}

function connect(){
  socket = new WebSocket(WS_URL)

  socket.onopen = () => log("Tilkoblet lokal server")

  socket.onclose = () => {
    log("Mistet forbindelse - prover igjen om 2 sek")
    setTimeout(connect, 2000)
  }

  socket.onerror = () => socket.close()

  socket.onmessage = (event) => {
    try{
      const msg = JSON.parse(event.data)
      if(msg.type !== "state") return

      // Ingen kamp satt pa BO5 enna (se Broadcast-fanen i appen) - lar
      // forrige visning sta urort i stedet for a blanke alt til tomt.
      if(!msg.data?.bo5) return

      const data = mapToLegacyShape(msg.data.bo5, msg.data.bo5Timer)
      window.currentBo5Data = data

      if(window.overlayScenes?.bo5){
        window.overlayScenes.bo5.render(data)
      }

      // Fase 6: spiller av vinner-animasjonen KUN nar event_id faktisk
      // har endret seg siden forrige gang. Bruker det RA (ikke oversatte)
      // event-feltet fra msg.data.bo5 - mapToLegacyShape sitt eget
      // "event"-felt er en ubrukt placeholder bo5-scene.js aldri leser.
      const rawEvent = msg.data.bo5.event
      const eventId = rawEvent?.id ?? 0
      if(lastSeenEventId === null){
        lastSeenEventId = eventId
      } else if(eventId !== lastSeenEventId){
        lastSeenEventId = eventId
        if(window.winLayer && rawEvent?.type){
          window.winLayer.handleEvent(
            { type: rawEvent.type, player: rawEvent.player },
            (data.player1.name || "PLAYER 1").toUpperCase(),
            (data.player2.name || "PLAYER 2").toUpperCase()
          )
        }
      }
    }
    catch(error){
      log("Klarte ikke tolke melding fra server", error)
    }
  }
}

connect()

})
