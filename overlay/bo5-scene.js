window.overlayScenes = window.overlayScenes || {}

window.overlayScenes.bo5 = (function(){
	const FLAG_BASE_PATH = "images/flags/"
	const FORCE_SWAP_LOSS_DRAW = false

	let prevLife1 = null
	let prevLife2 = null

	let gameInfoPositionFrame = null
	const WIN_THRESHOLD = 3

	// Klokke, flagg-normalisering og liv-animasjon: se shared-utils.js
	// (delt med script.js/BO3 - var tidligere naesten identiske kopier
	// begge steder).
	const bo5Timer = window.createTimerController("bo5TimerDisplay")

	function firstFilled(...values){
		return values.find((val)=> val != null && String(val).trim() !== "")
	}

	function buildRecord(player){

		// MERK: leser KUN scoreWins (turnerings-seire fra MeleeSync.gs) -
		// samme prinsipp som i script.js sin buildRecord. Payload-en
		// sender aldri et eget .wins-felt, sa den gamle "player?.wins ??"
		// sjekken var en dod snarvei som i verste fall kunne maskere en
		// reell 0 hvis noe noensinne begynte a sette et slikt felt.
		const wins = player?.scoreWins ?? 0
		const hasStandardRecord = player?.losses != null || player?.draws != null
		const rawLosses = hasStandardRecord
			? (player?.losses ?? 0)
			: (player?.scoreLosses ?? player?.scoreLoss ?? player?.scoreLoses ?? 0)
		const rawDraws = hasStandardRecord
			? (player?.draws ?? 0)
			: (player?.scoreDraw ?? player?.scoreDraws ?? 0)

		const shouldSwapLossDraw = !hasStandardRecord && FORCE_SWAP_LOSS_DRAW
		const losses = shouldSwapLossDraw ? rawDraws : rawLosses
		const draws = shouldSwapLossDraw ? rawLosses : rawDraws

		return `${wins}-${losses}-${draws}`
	}


	function fitPlayerName(el, nameText){

		if(!el) return

		el.style.visibility = "hidden"

		const nameLength = String(nameText || "").trim().length

		let fontSize = 40
		if(nameLength > 15) fontSize = 34
		if(nameLength >= 20) fontSize = 30
		if(nameLength >= 24) fontSize = 26
		if(nameLength >= 28) fontSize = 22

		el.style.fontSize = fontSize + "px"
		while(el.scrollWidth > el.clientWidth && fontSize > 18){
			fontSize -= 1
			el.style.fontSize = fontSize + "px"
		}

		el.style.visibility = "visible"
	}

	function setPlayerFlag(el, flagCode){

		if(!el) return

		// VIKTIG: bruker visibility (ikke display:none) - display:none
		// fjerner elementet helt fra CSS grid-layouten i navnekolonnen.
		// For spiller1 er flagget FORSTE grid-item, sa a fjerne det
		// dytter navn/deck/record inn i feil kolonne (samme rad i
		// stedet for stablet under). Spiller2 rammes ikke siden flagget
		// star SIST i DOM-rekkefolgen der.
		el.style.display = "inline-block"

		if(!flagCode){
			el.style.visibility = "hidden"
			el.removeAttribute("src")
			el.dataset.flagCode = ""
			return
		}

		if(el.dataset.flagCode === flagCode){
			el.style.visibility = "visible"
			return
		}

		el.dataset.flagCode = flagCode

		el.onload = ()=>{
			el.style.visibility = "visible"
			scheduleGameInfoPosition()
		}

		el.onerror = ()=>{
			el.style.visibility = "hidden"
			scheduleGameInfoPosition()
		}

		el.src = FLAG_BASE_PATH + flagCode + ".png"
	}

	function positionGameInfo(){
		// CSS (left:50%; transform:translateX(-50%)) sentrerer allerede
		// game-info-boksen korrekt uansett skala - ingen JS-utregning
		// trengs lenger her (samme prinsipp som i hoved-overlayet).
	}

	function scheduleGameInfoPosition(){

		if(gameInfoPositionFrame != null) return

		gameInfoPositionFrame = requestAnimationFrame(()=>{
			gameInfoPositionFrame = null
			positionGameInfo()
		})
	}

	/* =============================
	   CARD SHOWCASE (Scryfall lookup - se scryfall.js)
	============================= */

	function setCardShowcase(el, cardName, visible){

		if(!el) return

		const name = String(cardName || "").trim()

		if(!name || visible === false){
			el.style.display = "none"
			if(!name){
				el.removeAttribute("src")
				el.dataset.cardName = ""
			}
			return
		}

		if(el.dataset.cardName === name && el.getAttribute("src")){
			el.style.display = "block"
			return
		}

		el.dataset.cardName = name

		window.scryfallLookup.fetchImage(name).then((url)=>{
			if(el.dataset.cardName !== name) return

			if(url){
				el.src = url
				el.style.display = "block"
			} else {
				el.style.display = "none"
				el.removeAttribute("src")
			}
		})
	}

	function updateScoreSegments(scoreId, score){
		const container = document.getElementById(scoreId)
		if(!container) return

		const segments = container.querySelectorAll('.segment')
		const numericScore = Number(score) || 0
		const litCount = Math.min(Math.max(numericScore, 0), segments.length)
		const hasWonMatch = numericScore >= WIN_THRESHOLD

		segments.forEach((seg, index)=>{
			seg.classList.remove('filled','winner','loser')

			if(index < litCount){
				seg.classList.add('filled')
			}

			if(hasWonMatch && index < litCount){
				seg.classList.add('winner')
			}
		})
	}

	function updateLoserSegments(scoreId, opponentScore){
		const container = document.getElementById(scoreId)
		if(!container) return

		const segments = container.querySelectorAll('.segment')
		const opponentHasWon = (Number(opponentScore) || 0) >= WIN_THRESHOLD

		segments.forEach((seg)=>{
			seg.classList.remove('loser')

			if(opponentHasWon){
				seg.classList.add('loser')
				seg.classList.remove('filled','winner')
			}
		})
	}


	function render(data){
		const p1 = data.player1 || {}
		const p2 = data.player2 || {}
		const game = data.gameInfo || {}

		// Merk: p1.life ?? 0 ville sluppet gjennom en tom streng ("") uendret,
		// siden ?? kun fanger opp null/undefined. En tom streng oppstår kort
		// når noen sletter det gamle tallet i arket før de skriver inn det
		// nye - akkurat i det øyeblikket ville tallet blitt blankt i ett
		// poll-intervall. Løsningen: behandle "" som "ingen ny verdi enda",
		// og behold forrige tall på skjermen i stedet for å blanke det.
		const life1raw = p1.life
		const life2raw = p2.life
		const life1 = (life1raw === "" || life1raw == null) ? null : life1raw
		const life2 = (life2raw === "" || life2raw == null) ? null : life2raw

		const score1 = p1.points ?? p1.score ?? 0
		const score2 = p2.points ?? p2.score ?? 0

		const name1 = (p1.name ?? 'PLAYER').toUpperCase()
		const name2 = (p2.name ?? 'PLAYER').toUpperCase()

		const p1FlagCode = window.normalizeFlagCode(firstFilled(
			p1.flagCode,
			p1.flag,
			p1.countryCode,
			p1.country,
			p1.nation,
			p1.nationality,
			p1.uid,
			data.player1Flag,
			data.p1Flag,
			data.player1Uid,
			data.p1Uid,
			game.player1Flag,
			game.p1Flag,
			data.b9,
			data.B9
		))

		const p2FlagCode = window.normalizeFlagCode(firstFilled(
			p2.flagCode,
			p2.flag,
			p2.countryCode,
			p2.country,
			p2.nation,
			p2.nationality,
			p2.uid,
			data.player2Flag,
			data.p2Flag,
			data.player2Uid,
			data.p2Uid,
			game.player2Flag,
			game.p2Flag,
			data.c9,
			data.C9
		))

		const deck1 = (p1.deck ?? 'DECK').toUpperCase()
		const deck2 = (p2.deck ?? 'DECK').toUpperCase()

		const record1 = buildRecord(p1)
		const record2 = buildRecord(p2)

		const cardShowcase1 = firstFilled(p1.cardShowcase, p1.cardShowCase, data.p1CardShowcase)
		const cardShowcase2 = firstFilled(p2.cardShowcase, p2.cardShowCase, data.p2CardShowcase)

		// Livet skrives IKKE lenger her - se kommentaren i BO5.html: den
		// direkte klient-hentingen der (hvert 1. sekund fra
		// lifecounter-appen) er na ALENE ansvarlig for a vise/animere
		// livet, akkurat som i hoved-overlayet (script.js). Denne
		// render()-funksjonen skrev tidligere OGSA til de samme
		// elementene ut fra data.player1.life/data.player2.life (som
		// kommer fra Apps Script-payloaden, og er langt tregere - opptil
		// 60 sek gammel pa grunn av server-side cache) - de to skriverne
		// kjempet dermed om samme element, som fikk livet til a
		// "blinke" mellom riktig og gammelt tall.
		const elP1Life = document.getElementById('bo5p1life')
		const elP2Life = document.getElementById('bo5p2life')
		const elP1Name = document.getElementById('bo5p1name')
		const elP2Name = document.getElementById('bo5p2name')
		const elP1Flag = document.getElementById('bo5p1flag')
		const elP2Flag = document.getElementById('bo5p2flag')
		const elP1Deck = document.getElementById('bo5p1deck')
		const elP2Deck = document.getElementById('bo5p2deck')
		const elP1Record = document.getElementById('bo5p1record')
		const elP2Record = document.getElementById('bo5p2record')
		const elP1CardShowcase = document.getElementById('bo5p1cardShowcase')
		const elP2CardShowcase = document.getElementById('bo5p2cardShowcase')

		if(elP1Name){
			elP1Name.innerText = name1
			fitPlayerName(elP1Name, name1)
		}

		if(elP2Name){
			elP2Name.innerText = name2
			fitPlayerName(elP2Name, name2)
		}

		setPlayerFlag(elP1Flag, p1FlagCode)
		setPlayerFlag(elP2Flag, p2FlagCode)

		if(elP1Deck) elP1Deck.innerText = deck1
		if(elP2Deck) elP2Deck.innerText = deck2

		if(elP1Record) elP1Record.innerText = record1
		if(elP2Record) elP2Record.innerText = record2

		// Player Name Tags-bryteren (Graphics Control) - satt DIREKTE pa
		// hvert enkelt element (ikke pa foreldre-elementet .name-column),
		// siden .name i style.css har sin egen eksplisitte
		// "visibility:visible"-regel som ellers overstyrer arven fra
		// foreldren.
		const nameTagsVisible = data.showNameTags !== false
		;[elP1Name, elP2Name, elP1Deck, elP2Deck, elP1Record, elP2Record].forEach((el) => {
			if(el) el.style.visibility = nameTagsVisible ? 'visible' : 'hidden'
		})

		setCardShowcase(elP1CardShowcase, cardShowcase1, data.cardShowcaseVisible !== false)
		setCardShowcase(elP2CardShowcase, cardShowcase2, data.cardShowcaseVisible !== false)

		scheduleGameInfoPosition()

		updateScoreSegments('bo5p1score', score1)
		updateScoreSegments('bo5p2score', score2)
		updateLoserSegments('bo5p1score', score2)
		updateLoserSegments('bo5p2score', score1)

		const roundEl = document.getElementById('bo5Round')
		const formatEl = document.getElementById('bo5Format')
		const levelEl = document.getElementById('bo5Level')

		const roundLabel = game.playoffFormat || (game.level ? String(game.level).toUpperCase() : '') || (game.round != null ? 'ROUND ' + game.round : '')

		if(roundEl) roundEl.innerText = roundLabel
		if(formatEl) formatEl.innerText = game.format || ''
		if(levelEl) levelEl.innerText = ''

		// Klokken drives na av broadcast_state i den lokale desktop-
		// appen (satt via Broadcast-fanen sine Start/Pause/Nullstill-
		// knapper) - ingen ekstern lifecounter-tjeneste involvert lenger,
		// sa den tidligere konflikten som gjorde at denne linjen matte
		// skrus av, finnes ikke i denne oppsettet.
		bo5Timer.handleTimer(game.timer ?? 3000, game.timerStatus || 'pause')
	}

	window.addEventListener('resize', scheduleGameInfoPosition)

	return { render }
})()