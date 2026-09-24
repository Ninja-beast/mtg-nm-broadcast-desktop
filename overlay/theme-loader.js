// THEME-LOADER
// ============
// Inkluderes med <script src="theme-loader.js"></script> i HVER
// overlay-HTML-fil. Henter det AKTIVE temaet fra serveren
// (/api/themes/active - filer lagret i overlay/theme-assets/, satt
// via Tema-fanen i appen) og setter dem live - ingen omstart av
// OBS/nettleseren nodvendig.
(function () {
  const POLL_MS = 5000;
  let lastThemeJson = null;

  // Disse er de faste "tapet"-bildene som ligger i selve overlay-
  // HTML-filene fra for (AlphaMask.png pa BO3/BO5, Plain1080p_
  // background.png pa Top16/Bracket/Meta osv). De ma skjules nar et
  // egendefinert bakgrunnsbilde er aktivt, ellers ligger de alltid
  // oppa og skjuler det uansett hva som settes i CSS-variabelen.
  const DEFAULT_WALLPAPER_FILES = ["AlphaMask.png", "Plain1080p_background.png"];

  function setDefaultWallpaperVisible(visible) {
    document.querySelectorAll("img.bg").forEach((img) => {
      const src = (img.getAttribute("src") || "").split("/").pop();
      if (DEFAULT_WALLPAPER_FILES.includes(src)) {
        img.style.display = visible ? "" : "none";
      }
    });
  }

  // Disse to bildene er selve NM-turneringens egen faste grafikk
  // (rod/bla navneboks-bakgrunn og ticker-bakgrunnen med NM-logoen
  // bakt inn i hjornet) - skal KUN vises nar det aktive temaet
  // heter noyaktig "NM". Alle andre temaer (eller ingen valgt enna)
  // skal skjule dem, siden de ikke passer visuelt med et annet tema.
  const NM_ONLY_SELECTORS = [".bg-playerinfo", ".bottom-bar-image", ".bottom-bar-ticker"];

  function setNmBrandingVisible(visible) {
    NM_ONLY_SELECTORS.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        el.style.display = visible ? "" : "none";
      });
    });
  }

  // Gjenkjenner hvilken scene denne siden er, ut fra filnavnet - slik
  // at logoen kan skjules per scene (satt i Tema-fanen). Samme
  // scene-nokler som resten av appen bruker (SCENES-listen i api.ts/
  // App.tsx): bo3, bo5, meta, top16, bracket, casterdesk, starting.
  function detectCurrentScene() {
    const file = location.pathname.toLowerCase();
    if (file.includes("bo3")) return "bo3";
    if (file.includes("bo5")) return "bo5";
    if (file.includes("casterdesk")) return "casterdesk";
    if (file.includes("top_16") || file.includes("top16")) return "top16";
    if (file.includes("bracket")) return "bracket";
    if (file.includes("meta")) return "meta";
    if (file.includes("startingwidget") || file.includes("starting")) return "starting";
    return "";
  }
  const CURRENT_SCENE = detectCurrentScene();

  // Logoen skal vaere skjult som standard pa ALLE scener, uavhengig
  // av hva som er huket av i Tema-panelet i appen (theme.hiddenLogoScenes
  // fra serveren). Dette hindrer at et opplastet bilde i Tema-panelet
  // vises dobbelt (bade som full bakgrunn OG som sentrert logo).
  // Fjern en scene fra denne listen hvis logoen skal kunne vises der.
  const ALWAYS_HIDE_LOGO_SCENES = ["bo3", "bo5", "casterdesk", "top16", "bracket", "meta", "starting"];

  function applyTheme(theme) {
    document.documentElement.style.setProperty(
      "--bg-image",
      theme.bgImageUrl ? `url("${theme.bgImageUrl}")` : "none"
    );
    setDefaultWallpaperVisible(!theme.bgImageUrl);
    setNmBrandingVisible((theme.name || "").trim().toLowerCase() === "nm");

    const hiddenScenes = Array.isArray(theme.hiddenLogoScenes) ? theme.hiddenLogoScenes : [];
    const logoAllowedHere =
      theme.logoUrl &&
      !hiddenScenes.includes(CURRENT_SCENE) &&
      !ALWAYS_HIDE_LOGO_SCENES.includes(CURRENT_SCENE);

    let logoEl = document.getElementById("themeLogo");
    if (logoAllowedHere) {
      if (!logoEl) {
        logoEl = document.createElement("img");
        logoEl.id = "themeLogo";
        logoEl.className = "theme-logo";
        const overlay = document.querySelector(".overlay") || document.body;
        overlay.appendChild(logoEl);
      }
      logoEl.src = theme.logoUrl;
      logoEl.classList.add("is-visible");
    } else if (logoEl) {
      logoEl.classList.remove("is-visible");
    }

    let styleEl = document.getElementById("themeCustomCss");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "themeCustomCss";
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = theme.customCss || "";
  }

  async function loadTheme() {
    try {
      const res = await fetch("http://localhost:4848/api/themes/active", { cache: "no-store" });
      if (!res.ok) return;
      const theme = await res.json();
      const json = JSON.stringify(theme);
      if (json === lastThemeJson) return;
      lastThemeJson = json;
      applyTheme(theme);
    } catch (err) {
      console.error("[THEME-LOADER]", err);
    }
  }

  loadTheme();
  setInterval(loadTheme, POLL_MS);
})();
