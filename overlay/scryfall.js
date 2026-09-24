// SCRYFALL LOOKUP (delt)
// =======================
// Tidligere skrevet tre nesten identiske ganger: fetchCardShowcaseImage
// i script.js (BO3), fetchCardShowcaseImage i bo5-scene.js, og
// fetchScryfallImage i meta-scene.js. Samme URL, samme cache-monster,
// samme feilhandtering - na ETT sted. Inkluderes med
// <script src="scryfall.js"></script> FOR de filene som bruker den.
window.scryfallLookup = (function () {
  const cache = new Map();

  function fetchImage(cardName) {
    const key = String(cardName || "").trim().toLowerCase();
    if (!key) return Promise.resolve(null);

    if (cache.has(key)) return cache.get(key);

    const promise = (async () => {
      try {
        const res = await fetch("https://api.scryfall.com/cards/named?fuzzy=" + encodeURIComponent(key));
        if (!res.ok) return null;
        const card = await res.json();
        return card?.image_uris?.normal || card?.card_faces?.[0]?.image_uris?.normal || null;
      } catch (err) {
        console.error("[SCRYFALL] Oppslag feilet for", cardName, err);
        return null;
      }
    })();

    cache.set(key, promise);
    return promise;
  }

  return { fetchImage };
})();
