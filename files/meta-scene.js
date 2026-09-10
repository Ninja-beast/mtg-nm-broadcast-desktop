window.overlayScenes = window.overlayScenes || {}

window.overlayScenes.meta = (function(){
  let lastRenderSignature = ""

  // Antall rader per tabell (venstre/høyre) og totalt. Øk MAX_ROWS_PER_COLUMN
  // for å vise flere rader per side.
  const MAX_ROWS_PER_COLUMN = 8
  const MAX_TOTAL_ROWS = MAX_ROWS_PER_COLUMN * 2

  // ---- Scryfall lookup + caching ----
  // Maps lowercased card name -> Promise<string|null> (image URL or null on failure)
  const scryfallCache = new Map()

  function fetchScryfallImage(cardName){
    const key = String(cardName || "").trim().toLowerCase()
    if(!key) return Promise.resolve(null)

    if(scryfallCache.has(key)){
      return scryfallCache.get(key)
    }

    const promise = (async () => {
      try {
        const res = await fetch("https://api.scryfall.com/cards/named?fuzzy=" + encodeURIComponent(key))
        if(!res.ok) return null
        const card = await res.json()
        const url = card?.image_uris?.normal
          || card?.card_faces?.[0]?.image_uris?.normal
          || null
        return url
      } catch (err) {
        console.error("[META] scryfall lookup failed for", cardName, err)
        return null
      }
    })()

    scryfallCache.set(key, promise)
    return promise
  }

  function createKeyCardCrop(cardName){
    const wrap = document.createElement("div")
    wrap.className = "meta-keycard-crop"

    const img = document.createElement("img")
    img.className = "meta-keycard-crop-img"
    img.alt = cardName

    wrap.appendChild(img)

    fetchScryfallImage(cardName).then((url)=>{
      if(url){
        img.src = url
      } else {
        wrap.classList.add("meta-keycard-crop-error")
        wrap.innerText = cardName
      }
    })

    return wrap
  }

  function readSource(data){
    if(data?.meta) return data.meta
    if(data?.metagame) return data.metagame
    if(data?.sceneData?.meta) return data.sceneData.meta
    if(data?.sceneData?.metagame) return data.sceneData.metagame
    return data || {}
  }

  function readText(value, fallback){
    const text = String(value ?? "").trim()
    return text || fallback
  }

  function normalizeRow(row){
    return {
      archetype: readText(row?.archetype ?? row?.name ?? row?.deckName ?? row?.deck ?? row?.title ?? row?.["Deck Name"], ""),
      count: readText(row?.count ?? row?.decks ?? row?.antallDeck ?? row?.antall_decks ?? row?.total ?? row?.["Antall Decs"], ""),
      share: readText(row?.share ?? row?.percent ?? row?.percentage ?? row?.andel ?? row?.["Percentage"], ""),
      keyCard: readText(row?.keyCard ?? row?.keycard ?? row?.card ?? row?.nøkkelkort ?? row?.nokkelkort ?? row?.["Nøkkelkort 1"], ""),
      keyCard2: readText(row?.keyCard2 ?? row?.keycard2 ?? row?.nøkkelkort2 ?? row?.nokkelkort2 ?? row?.["Nøkkelkort 2"], ""),
      image: row?.image || row?.keyCardImage || row?.imageUrl || ""
    }
  }

  function buildRows(source){
    const directRows = Array.isArray(source.rows)
      ? source.rows
      : Array.isArray(source.items)
        ? source.items
        : Array.isArray(source.list)
          ? source.list
          : []

    if(directRows.length){
      return directRows.slice(0, MAX_TOTAL_ROWS).map((row)=> normalizeRow(row))
    }

    const hasIndexedRows = Array.from({ length: MAX_TOTAL_ROWS }).some((_, i)=>{
      const index = i + 1
      return [
        source[`row${index}Name`],
        source[`row${index}Archetype`],
        source[`deck${index}`],
        source[`deckName${index}`],
        source[`row${index}Count`],
        source[`count${index}`],
        source[`decks${index}`],
        source[`antallDeck${index}`],
        source[`row${index}Share`],
        source[`share${index}`],
        source[`percentage${index}`],
        source[`andel${index}`],
        source[`row${index}KeyCard`],
        source[`keyCard${index}`],
        source[`nøkkelkort${index}`],
        source[`nokkelkort${index}`],
        source[`row${index}KeyCard2`],
        source[`keyCardTwo${index}`],
        source[`nøkkelkort2_${index}`],
        source[`nokkelkort2_${index}`]
      ].some((value)=> String(value ?? "").trim() !== "")
    })

    if(!hasIndexedRows){
      return []
    }

    const rows = []
    for(let index = 1; index <= MAX_TOTAL_ROWS; index += 1){
      rows.push(normalizeRow({
        archetype: source[`row${index}Name`] ?? source[`row${index}Archetype`] ?? source[`deck${index}`] ?? source[`deckName${index}`],
        count: source[`row${index}Count`] ?? source[`count${index}`] ?? source[`decks${index}`] ?? source[`antallDeck${index}`],
        share: source[`row${index}Share`] ?? source[`share${index}`] ?? source[`percentage${index}`] ?? source[`andel${index}`],
        keyCard: source[`row${index}KeyCard`] ?? source[`keyCard${index}`] ?? source[`nøkkelkort${index}`] ?? source[`nokkelkort${index}`],
        keyCard2: source[`row${index}KeyCard2`] ?? source[`keyCardTwo${index}`] ?? source[`nøkkelkort2_${index}`] ?? source[`nokkelkort2_${index}`]
      }))
    }

    return rows
  }

  function createKeyCardContent(row){
    const hasImage = String(row.image || "").trim() !== ""

    if(hasImage){
      const img = document.createElement("img")
      img.className = "meta-keycard-image"
      img.alt = row.archetype ? row.archetype + " key card" : "key card"
      img.src = row.image
      return img
    }

    const container = document.createElement("div")
    container.className = "meta-keycard-container"

    const keyCard1 = String(row.keyCard || "").trim()
    const keyCard2 = String(row.keyCard2 || "").trim()

    // Hvis begge kort finnes og er ulike, vises begge
    if(keyCard1 || keyCard2){
      const uniqueCards = []
      if(keyCard1 && !uniqueCards.includes(keyCard1)){
        uniqueCards.push(keyCard1)
      }
      if(keyCard2 && keyCard2 !== keyCard1 && !uniqueCards.includes(keyCard2)){
        uniqueCards.push(keyCard2)
      }

      if(uniqueCards.length){
        uniqueCards.forEach((card)=>{
          container.appendChild(createKeyCardCrop(card))
        })
        return container
      }
    }

    // Fallback hvis ingen kort finnes
    const text = document.createElement("div")
    text.className = "meta-keycard-text"
    text.innerText = ""
    return text
  }

  function shrinkArchetypeToFit(el){
    if(!el) return
    let fontSize = parseFloat(window.getComputedStyle(el).fontSize)
    const minFontSize = fontSize * 0.25
    while(el.scrollWidth > el.clientWidth && fontSize > minFontSize){
      fontSize -= 1
      // Ma settes med "important"-prioritet - ellers taper denne
      // inline-stilen mot .meta-cell.meta-archetype sin egen
      // "font-size: 19px !important;" i stilarket, og skriften
      // krymper aldri visuelt uansett hvor lavt gulvet er satt.
      el.style.setProperty("font-size", fontSize + "px", "important")
    }
    // Siste utvei hvis navnet fortsatt ikke far plass selv ved 25% -
    // la det brekke til to linjer i stedet for a bare kutte med "..."
    if(el.scrollWidth > el.clientWidth){
      el.style.setProperty("white-space", "normal", "important")
      el.style.setProperty("line-height", "1.05", "important")
      el.style.setProperty("word-break", "break-word", "important")
    }
  }

  function renderRows(containerId, rows){
    const container = document.getElementById(containerId)
    if(!container) return

    container.innerHTML = ""

    if(!Array.isArray(rows) || rows.length === 0){
      const rowEl = document.createElement("div")
      rowEl.className = "meta-row"

      const archetypeEl = document.createElement("div")
      archetypeEl.className = "meta-cell meta-archetype"
      archetypeEl.innerText = "INGEN META-DATA FRA API"

      const countEl = document.createElement("div")
      countEl.className = "meta-cell meta-count"
      countEl.innerText = "-"

      const shareEl = document.createElement("div")
      shareEl.className = "meta-cell meta-share"
      shareEl.innerText = "-"

      const keyCardEl = document.createElement("div")
      keyCardEl.className = "meta-cell meta-keycard"
      keyCardEl.innerText = "Sjekk Apps Script deploy"

      rowEl.appendChild(archetypeEl)
      rowEl.appendChild(countEl)
      rowEl.appendChild(shareEl)
      rowEl.appendChild(keyCardEl)

      container.appendChild(rowEl)
      return
    }

    rows.forEach((row)=>{
      const rowEl = document.createElement("div")
      rowEl.className = "meta-row"

      const archetypeEl = document.createElement("div")
      archetypeEl.className = "meta-cell meta-archetype"
      archetypeEl.innerText = row.archetype

      const countEl = document.createElement("div")
      countEl.className = "meta-cell meta-count"
      countEl.innerText = row.count

      const shareEl = document.createElement("div")
      shareEl.className = "meta-cell meta-share"
      shareEl.innerText = row.share

      const keyCardEl = document.createElement("div")
      keyCardEl.className = "meta-cell meta-keycard"
      keyCardEl.appendChild(createKeyCardContent(row))

      rowEl.appendChild(archetypeEl)
      rowEl.appendChild(countEl)
      rowEl.appendChild(shareEl)
      rowEl.appendChild(keyCardEl)

      container.appendChild(rowEl)

      // Krymper skriften kun for DETTE arketype-navnet hvis det ikke
      // far plass pa en linje (i stedet for at det bryter til to
      // linjer og skaper ujevn radhoyde mellom kolonnene) - ma skje
      // ETTER at raden er lagt til i DOM-en, siden vi trenger den
      // ekte, gjengitte bredden.
      shrinkArchetypeToFit(archetypeEl)
    })
  }

  function render(data){
    const source = readSource(data)
    const rows = buildRows(source)
    const leftCount = Math.ceil(rows.length / 2)
    const leftRows = rows.slice(0, leftCount)
    const rightRows = rows.slice(leftCount)

    const titleText = readText(source.title ?? data?.sceneTitle, "META BREAKDOWN")
    const subtitleText = readText(source.subtitle ?? data?.sceneSubtitle, "DAY 1 - TOP 64")
    const yearText = readText(source.year ?? data?.sceneYear, "2026 NM")

    const renderSignature = JSON.stringify({
      title: titleText,
      subtitle: subtitleText,
      year: yearText,
      leftRows,
      rightRows
    })

    if(renderSignature === lastRenderSignature){
      return
    }
    lastRenderSignature = renderSignature

    const titleEl = document.getElementById("metaTitle")
    const subtitleEl = document.getElementById("metaSubtitle")
    const yearEl = document.getElementById("metaYear")

    if(titleEl) titleEl.innerText = titleText
    if(subtitleEl) subtitleEl.innerText = subtitleText
    if(yearEl) yearEl.innerText = yearText

    renderRows("metaLeftRows", leftRows)
    renderRows("metaRightRows", rightRows)
  }

  return { render }
})()