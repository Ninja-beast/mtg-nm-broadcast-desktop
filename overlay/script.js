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

  // Klokke og Scryfall-oppslag: se shared-utils.js/scryfall.js (delt
  // med bo5-scene.js/meta-scene.js - var tidligere tre naesten
  // identiske kopier av begge deler).
  const bo3Timer = window.createTimerController("timerDisplay");

  function setCardShowcase(el, cardName, visible) {
    if (!el) return;
    const name = String(cardName || "").trim();

    if (!name || visible === false) {
      el.style.display = "none";
      if (!name) {
        el.removeAttribute("src");
        el.dataset.cardName = "";
      }
      return;
    }

    if (el.dataset.cardName === name && el.getAttribute("src")) {
      el.style.display = "block";
      return;
    }
    el.dataset.cardName = name;

    window.scryfallLookup.fetchImage(name).then((url) => {
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
        if (msg.type === "state") {
          console.log("[DEBUG-WS]", new Date().toLocaleTimeString(), "showNameTags =", msg.data?.showNameTags);
          render(msg.data);
        }
      } catch (err) {
        console.error("[OVERLAY] Klarte ikke tolke melding fra server", err);
      }
    };
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
      if (prevLife1 !== null && prevLife1 !== life1) window.animateLifeChange(elP1Life);
      elP1Life.innerText = life1;
      prevLife1 = life1;
    }

    if (elP2Life && life2 != null) {
      if (prevLife2 !== null && prevLife2 !== life2) window.animateLifeChange(elP2Life);
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

    // Player Name Tags-bryteren (Graphics Control) - satt DIREKTE pa
    // hvert enkelt element (ikke bare foreldre-elementet .name-column),
    // siden .name i style.css har sin egen eksplisitte
    // "visibility:visible"-regel som ellers overstyrer arven fra
    // foreldren og gjorde at navnet ble staende synlig uansett.
    const nameTagsVisible = state.showNameTags !== false;
    [elP1Name, elP2Name, elP1Deck, elP2Deck, elP1Record, elP2Record].forEach((el) => {
      if (el) el.style.visibility = nameTagsVisible ? "visible" : "hidden";
    });

    // Flagg: normaliseres na med samme funksjon som BO5 (window.
    // normalizeFlagCode, i shared-utils.js) - fikser en reell bug der
    // BO3 tidligere brukte p1.flag/p2.flag ra som filnavn uten noen
    // normalisering (f.eks. "Norway" ville aldri matchet
    // images/flags/no.png). VIKTIG: bruker visibility (ikke
    // display:none) nar flagget mangler - siden flagg-elementet er
    // FORSTE grid-item i navnekolonnen for spiller1, ville display:none
    // fjernet det helt fra CSS grid-layouten og dyttet resten av
    // kolonneplasseringen feil (deck/record endte pa SAMME rad som
    // navnet i stedet for a stables under - kun spiller1 rammes, siden
    // flagget star SIST i DOM-rekkefolgen for spiller2).
    const p1FlagCode = window.normalizeFlagCode(p1.flag);
    const p2FlagCode = window.normalizeFlagCode(p2.flag);

    if (elP1Flag) {
      elP1Flag.style.display = "inline-block";
      if (p1FlagCode) {
        elP1Flag.src = "images/flags/" + p1FlagCode + ".png";
        elP1Flag.style.visibility = "visible";
      } else {
        elP1Flag.style.visibility = "hidden";
      }
    }
    if (elP2Flag) {
      elP2Flag.style.display = "inline-block";
      if (p2FlagCode) {
        elP2Flag.src = "images/flags/" + p2FlagCode + ".png";
        elP2Flag.style.visibility = "visible";
      } else {
        elP2Flag.style.visibility = "hidden";
      }
    }

    // Card showcase: kortnavn settes manuelt fra Kampkontroll-fanen
    // (samme prinsipp som B11/B12 i det gamle regnearket) - hentes og
    // caches klient-side rett fra Scryfall (ingen kvote-bekymring).
    setCardShowcase(elP1CardShowcase, p1.cardShowcase, state.cardShowcaseVisible !== false);
    setCardShowcase(elP2CardShowcase, p2.cardShowcase, state.cardShowcaseVisible !== false);

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
    if (timer) bo3Timer.handleTimer(timer.seconds, timer.status);

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
