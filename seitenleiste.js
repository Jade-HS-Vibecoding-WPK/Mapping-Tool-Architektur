/* Seitenleiste ein- und ausklappen (Griff am Rand der linken Spalte).
   Der Zustand wird im Browser gemerkt (localStorage, falls erlaubt). Danach bekommen Karte, 3D-Ansicht und Schnitt die neue Breite. */
(function () {
  const app = document.querySelector(".app");
  const knopf = document.getElementById("sidebar-toggle");
  if (!app || !knopf) return;
  const SCHLUESSEL = "sitekick-seitenleiste-zu";

  function setze(zu, merken) {
    app.classList.toggle("sidebar-zu", zu);
    knopf.setAttribute("aria-expanded", String(!zu));
    knopf.setAttribute("aria-label", zu ? "Seitenleiste ausklappen" : "Seitenleiste einklappen");
    knopf.firstElementChild.textContent = zu ? "›" : "‹";
    if (merken) { try { localStorage.setItem(SCHLUESSEL, zu ? "1" : "0"); } catch (e) { /* ohne Speicher geht es trotzdem */ } }
    // nach der Animation (0,2 s): Karte neu ausmessen, 3D und Schnitt zeichnen sich über das Größen-Ereignis neu
    setTimeout(() => {
      if (typeof map !== "undefined" && map && map.resize) map.resize();
      window.dispatchEvent(new Event("resize"));
    }, 230);
  }

  knopf.addEventListener("click", () => setze(!app.classList.contains("sidebar-zu"), true));
  let gemerkt = false;
  try { gemerkt = localStorage.getItem(SCHLUESSEL) === "1"; } catch (e) { /* kein Speicher */ }
  if (gemerkt) setze(true, false);
})();
