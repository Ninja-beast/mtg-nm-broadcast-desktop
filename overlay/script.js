(function () {
  const WS_URL = "ws://localhost:4848/ws";
  let socket = null;
  let prevLife1 = null;
  let prevLife2 = null;

  // Fase 6 (vinner-events): husker sist SETTE event_id lokalt - starter
  // som null (ikke 0) sa det aller forste svaret vi mottar (uansett om
  // event_id der er 0 eller 12) BARE registreres, aldri spilles av.
  // Slik unngar vi at en gammel hendelse spilles av pa nytt hver gang
  // siden lastes/refreshes.
  let lastSeenEventId = null;

  const WIN_THRESHOLD = 2; // best-of-3: 2 game-wins tar matchen

  // ---- Klokke (samme prinsipp som handleTimer i bo5-scene.js) ----
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

  function handleTimer(seconds, status) {
    const display = document.getElementById("timerDisplay");
    if (!display) return;

    status = (status || "pause").toLowerCase().trim();
    if (status === currentTimerState && status !== "reset") return;

    const previousTimerState = currentTimerState;
    currentTimerState = status;

    if (status === "start") {
      timerSeconds = previousTimerState === "pause" && pausedSeconds >= 0 ? pausedSeconds : Number(seconds) || 0;
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
      timerSeconds = Number(seconds) || 0;
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      display.innerText = formatSecondsAsClock(timerSeconds);
    }
  }

  // ---- Card showcase (Scryfall, klient-side - se bo5-scene.js for samme prinsipp) ----
  const cardShowcaseCache = new Map();

  function fetchCardShowcaseImage(cardName) {
    const key = String(cardName || "").trim().toLowerCase();
    if (!key) return Promise.resolve(null);

    if (cardShowcaseCache.has(key)) return cardShowcaseCache.get(key);

    const promise = (async () => {
      try {
        const res = await fetch("https://api.scryfall.com/cards/named?fuzzy=" + encodeURIComponent(key));
        if (!res.ok) return null;
        const card = await res.json();
        return card?.image_uris?.normal || card?.card_faces?.[0]?.image_uris?.normal || null;
      } catch (err) {
        console.error("[OVERLAY] Scryfall-oppslag feilet for", cardName, err);
        return null;
      }
    })();

    cardShowcaseCache.set(key, promise);
    return promise;
  }

  function setCardShowcase(el, cardName) {
    if (!el) return;
    const name = String(cardName || "").trim();

    if (!name) {
      el.style.display = "none";
      el.removeAttribute("src");
      el.dataset.cardName = "";
      return;
    }

    if (el.dataset.cardName === name && el.getAttribute("src")) return;
    el.dataset.cardName = name;

    fetchCardShowcaseImage(name).then((url) => {
      if (el.dataset.cardName !== name) return;
      if (url) {
        el.src = url;
        el.style.display = "block";
      } else {
        el.style.display = "none";
        el.removeAttribute("src");
      }
    });
  }

  function connect() {
    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      console.log("[OVERLAY] Tilkoblet lokal server");
    };

    socket.onclose = () => {
      console.log("[OVERLAY] Mistet forbindelse - prover igjen om 2 sek");
      setTimeout(connect, 2000);
    };

    socket.onerror = () => {
      socket.close();
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "state") render(msg.data);
      } catch (err) {
        console.error("[OVERLAY] Klarte ikke tolke melding fra server", err);
      }
    };
  }

  function animateLifeChange(el) {
    if (!el) return;
    el.classList.remove("change");
    void el.offsetWidth;
    el.classList.add("change");
    setTimeout(() => el.classList.remove("change"), 420);
  }

  function buildRecord(player) {
    const wins = player?.wins ?? 0;
    const losses = player?.losses ?? 0;
    const draws = player?.draws ?? 0;
    return `${wins}-${losses}-${draws}`;
  }

  function updateScoreSegments(scoreId, score, opponentScore) {
    const container = document.getElementById(scoreId);
    if (!container) return;

    const segments = container.querySelectorAll(".segment");
    const numericScore = Number(score) || 0;
    const litCount = Math.min(Math.max(numericScore, 0), segments.length);
    const hasWonMatch = numericScore >= WIN_THRESHOLD;
    const opponentHasWon = (Number(opponentScore) || 0) >= WIN_THRESHOLD;

    segments.forEach((seg, index) => {
      seg.classList.remove("filled", "winner", "loser");

      if (opponentHasWon) {
        seg.classList.add("loser");
        return;
      }

      if (index < litCount) {
        seg.classList.add("filled");
        if (hasWonMatch) seg.classList.add("winner");
      }
    });
  }

  function render(state) {
    const bo3 = state?.bo3;

    // Ingen kamp satt pa BO3 enna (se Broadcast-fanen i appen) - lar
    // forrige visning sta urort i stedet for a blanke alt til tomt.
    if (!bo3) return;

    const p1 = bo3.player1 || {};
    const p2 = bo3.player2 || {};

    const elP1Life = document.getElementById("p1life");
    const elP2Life = document.getElementById("p2life");
    const elP1Name = document.getElementById("p1name");
    const elP2Name = document.getElementById("p2name");
    const elP1Deck = document.getElementById("p1deck");
    const elP2Deck = document.getElementById("p2deck");
    const elP1Record = document.getElementById("p1record");
    const elP2Record = document.getElementById("p2record");
    const elP1Flag = document.getElementById("p1flag");
    const elP2Flag = document.getElementById("p2flag");
    const elP1CardShowcase = document.getElementById("p1cardShowcase");
    const elP2CardShowcase = document.getElementById("p2cardShowcase");
    const elRound = document.getElementById("round");
    const elFormat = document.getElementById("format");

    const life1 = p1.life;
    const life2 = p2.life;

    if (elP1Life && life1 != null) {
      if (prevLife1 !== null && prevLife1 !== life1) animateLifeChange(elP1Life);
      elP1Life.innerText = life1;
      prevLife1 = life1;
    }

    if (elP2Life && life2 != null) {
      if (prevLife2 !== null && prevLife2 !== life2) animateLifeChange(elP2Life);
      elP2Life.innerText = life2;
      prevLife2 = life2;
    }

    if (elP1Name) elP1Name.innerText = (p1.name || "PLAYER 1").toUpperCase();
    if (elP2Name) elP2Name.innerText = (p2.name || "PLAYER 2").toUpperCase();

    // Draft-format: deck-navnet (arketype) gir ingen mening i draft
    // (ingen faste arketyper) - samme prinsipp som
    // isMeleeDraftFormat_ i det gamle MeleeSync.gs. Kun W-L-D star
    // igjen pa den nederste linjen.
    const isDraft = /draft/i.test(bo3.format || "");
    if (elP1Deck) elP1Deck.innerText = isDraft ? "" : (p1.deck || "").toUpperCase();
    if (elP2Deck) elP2Deck.innerText = isDraft ? "" : (p2.deck || "").toUpperCase();

    if (elP1Record) elP1Record.innerText = buildRecord(p1);
    if (elP2Record) elP2Record.innerText = buildRecord(p2);

    // Flagg: Melee-syncen (Fase 3) henter ikke nasjonalitet enna, sa
    // p1.flag/p2.flag er alltid tomme na. VIKTIG: bruker visibility
    // (ikke display:none) nar flagget mangler - siden flagg-elementet
    // er FORSTE grid-item i navnekolonnen for spiller1, ville
    // display:none fjernet det helt fra CSS grid-layouten og dyttet
    // resten av kolonneplasseringen feil (deck/record endte pa SAMME
    // rad som navnet i stedet for a stables under - kun spiller1
    // rammes, siden flagget star SIST i DOM-rekkefolgen for spiller2).
    if (elP1Flag) {
      elP1Flag.style.display = "inline-block";
      if (p1.flag) {
        elP1Flag.src = "images/flags/" + p1.flag + ".png";
        elP1Flag.style.visibility = "visible";
      } else {
        elP1Flag.style.visibility = "hidden";
      }
    }
    if (elP2Flag) {
      elP2Flag.style.display = "inline-block";
      if (p2.flag) {
        elP2Flag.src = "images/flags/" + p2.flag + ".png";
        elP2Flag.style.visibility = "visible";
      } else {
        elP2Flag.style.visibility = "hidden";
      }
    }

    // Card showcase: kortnavn settes manuelt fra Kampkontroll-fanen
    // (samme prinsipp som B11/B12 i det gamle regnearket) - hentes og
    // caches klient-side rett fra Scryfall (ingen kvote-bekymring).
    setCardShowcase(elP1CardShowcase, p1.cardShowcase);
    setCardShowcase(elP2CardShowcase, p2.cardShowcase);

    updateScoreSegments("p1score", p1.gameWins, p2.gameWins);
    updateScoreSegments("p2score", p2.gameWins, p1.gameWins);

    // Runde/format/timer er ikke modellert i backend enna (kun
    // bordnummer finnes pa en match) - viser bord-nummer i round-
    // feltet inntil videre, format/timer star tomme.
    if (elRound) {
      elRound.innerText = bo3.round != null && bo3.round !== "" ? String(bo3.round).toUpperCase() : "";
    }

    if (elFormat) {
      elFormat.innerText = (bo3.format || "").toUpperCase();
    }

    const timer = state?.bo3Timer;
    if (timer) handleTimer(timer.seconds, timer.status);

    // Fase 6: spiller av vinner-animasjonen KUN nar event_id faktisk
    // har endret seg siden forrige gang - se lastSeenEventId over.
    const eventId = bo3.event?.id ?? 0;
    if (lastSeenEventId === null) {
      lastSeenEventId = eventId;
    } else if (eventId !== lastSeenEventId) {
      lastSeenEventId = eventId;
      if (window.winLayer && bo3.event?.type) {
        window.winLayer.handleEvent(
          { type: bo3.event.type, player: bo3.event.player },
          (p1.name || "PLAYER 1").toUpperCase(),
          (p2.name || "PLAYER 2").toUpperCase()
        );
      }
    }
  }

  connect();
})();
