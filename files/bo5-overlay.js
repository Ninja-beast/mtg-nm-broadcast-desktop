document.addEventListener("DOMContentLoaded", () => {

const query = new URLSearchParams(window.location.search)
const DATA_URL = (() => {
  const overrideUrl = String(query.get("dataUrl") || "").trim()
  if(overrideUrl) return overrideUrl

  const isLocalHost = ["127.0.0.1", "localhost"].includes(window.location.hostname)
  if(isLocalHost) return window.location.origin + "/api/overlay?t="

  return "https://script.google.com/macros/s/AKfycbz3aep17Ul9e_PVGFBr-bOE71WBlXND_QKne07_bSwGduC3rOm7ITSjD1T3-O3olduG/exec"
})()
const DEBUG = true

function log(...msg){
  if(DEBUG){
    console.log("[BO5 OVERLAY]", ...msg)
  }
}

// Google Apps Script blocks CORS requests from a "null" origin, which is
// exactly what file:// pages send. JSONP sidesteps this by loading the
// response as a <script> tag instead of a fetch/XHR call, which isn't
// subject to the same CORS restriction - so this still works when the
// file is opened directly instead of through a server.
function fetchJSONP(url){
  return new Promise((resolve, reject) => {
    const callbackName = "bo5Cb_" + Date.now() + "_" + Math.floor(Math.random() * 100000)
    const script = document.createElement("script")
    let settled = false

    function cleanup(){
      delete window[callbackName]
      if(script.parentNode) script.parentNode.removeChild(script)
    }

    window[callbackName] = (data) => {
      if(settled) return
      settled = true
      cleanup()
      resolve(data)
    }

    script.onerror = () => {
      if(settled) return
      settled = true
      cleanup()
      reject(new Error("JSONP request failed: " + url))
    }

    const separator = url.includes("?") ? "&" : "?"
    script.src = url + separator + "callback=" + callbackName
    document.head.appendChild(script)

    setTimeout(() => {
      if(settled) return
      settled = true
      cleanup()
      reject(new Error("JSONP request timed out: " + url))
    }, 20000)
  })
}

async function fetchOverlayData(url){
  if(window.location.protocol === "file:"){
    return fetchJSONP(url)
  }

  const res = await fetch(url)
  return res.json()
}

async function update(){

  try{
    const separator = DATA_URL.includes("?") ? "&" : "?";
    const raw = await fetchOverlayData(DATA_URL + separator + "t=" + Date.now());

    // bo5.html får sin egen, uavhengige del av JSON-en (data.bo5), hentet
    // fra det separate MatchKontrollBO5-arket - ikke samme
    // player1/player2/gameInfo som overlay.html bruker. Dette er det som
    // holder klokke/status på BO5-overlayen helt adskilt fra hovedmatchen.
    const data = raw?.bo5 ?? defaultBo5Data_()

    window.currentBo5Data = data

    if(window.overlayScenes?.bo5){
      window.overlayScenes.bo5.render(data)
    }

    if(data.event && window.winLayer){
      const name1 = (data.player1?.name ?? "PLAYER").toUpperCase()
      const name2 = (data.player2?.name ?? "PLAYER").toUpperCase()
      window.winLayer.handleEvent(data.event, name1, name2)
    }
  }
  catch(error){
    log("Update failed", error)
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

update()
setInterval(update, 2500)

})