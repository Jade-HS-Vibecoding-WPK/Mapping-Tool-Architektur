/* ============================================================
   SiteKick – Hinweis beim Laden der Seite

   Ein Fenster mit dem KI-Disclaimer und dem Spaß-Logo „Simon Ubben Bau GmbH“ (fiktive Firma, mit eigenem Hinweis). Es erscheint einmal je
   Browser-Sitzung (Tab), nicht bei jedem Neuladen. Schließen mit dem Knopf, mit Esc oder per Klick neben das Fenster.
   ============================================================ */

"use strict";

(function () {
  const dialog = document.getElementById("hinweis-dialog");
  if (!dialog || typeof dialog.showModal !== "function") return;
  const KEY = "sitekick-hinweis";
  let gesehen = false;
  try { gesehen = sessionStorage.getItem(KEY) === "1"; } catch (_) { /* nicht schlimm */ }
  dialog.addEventListener("close", () => { try { sessionStorage.setItem(KEY, "1"); } catch (_) { /* nicht schlimm */ } });
  document.getElementById("hinweis-ok").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });   // Klick neben das Fenster
  if (!gesehen) dialog.showModal();
})();
