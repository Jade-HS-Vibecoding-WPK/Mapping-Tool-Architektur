/* ============================================================
   Ortsanalyse – Projekt im Browser merken

   Das Tool merkt sich automatisch den letzten Stand in diesem Browser (localStorage): das gewählte Gebiet, den offenen Reiter und die Einstellungen
   (Sonne, Einfärbungen, Luftbild, Gehzeit-Kreise, Schnittlinien, LoD2 an/aus). Die Geodaten selbst werden NICHT gespeichert, sie werden beim
   Wiederherstellen neu geladen. Orte der Umgebung, Werte der Wirtschaftlichkeit und die Export-Felder merken sich ihre Reiter selbst.
   Nur auf diesem Rechner und in diesem Browser; kein Weitergeben an andere (dafür müsste man eine Datei speichern, das gibt es nicht).
   ============================================================ */

"use strict";

const PROJEKT_KEY = "ortsanalyse-projekt";
const projektEl = { feld: document.getElementById("projekt-merk"), zeit: document.getElementById("projekt-zeit"), laden: document.getElementById("projekt-laden"), vergessen: document.getElementById("projekt-vergessen") };
let projektLetzter = "";

function projektZustand() {
  if (!gebiet) return null;
  const [west, sued, ost, nord] = turf.bbox(gebiet);
  return {
    bbox: [west, sued, ost, nord], tab: aktuelleAnsicht, lod2: chkLod2.checked,
    sonne: { ...sonneZustand, zelle: { ...sonneZustand.zelle } },
    schwarzModus, flstModus, wirtModus,
    luft: { deckkraft: luftEl.deckkraft.value, sw: luftEl.sw.checked, gebaeude: luftEl.gebaeude.checked, flst: luftEl.flst.checked, strassen: luftEl.strassen.checked },
    erreich: { mitte: erreichMitte, an: erreichEl.an.checked, r5: erreichEl.r5.checked, r10: erreichEl.r10.checked, r15: erreichEl.r15.checked },
    schnitt: { liste: schnittListe.map((l) => ({ name: l.name, a: l.a, b: l.b, seite: l.seite, tiefe: l.tiefe })), aktiv: schnittAktiv, modus: schnittModus }
  };
}

function projektSpeichern() {
  const z = projektZustand();
  if (!z) return;
  const text = JSON.stringify(z);
  if (text === projektLetzter) return;
  projektLetzter = text;
  try { localStorage.setItem(PROJEKT_KEY, JSON.stringify({ ...z, zeit: new Date().toISOString() })); } catch (_) { /* Speicher voll oder gesperrt: nicht schlimm */ }
}

function projektLesen() {
  try { return JSON.parse(localStorage.getItem(PROJEKT_KEY) || "null"); } catch (_) { return null; }
}

function projektMerkAnzeigen() {
  const z = projektLesen();
  const zeigen = !!z && !gebiet && z.bbox;
  projektEl.feld.hidden = !zeigen;
  if (zeigen) projektEl.zeit.textContent = new Date(z.zeit).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

function projektWiederherstellen() {
  const z = projektLesen();
  if (!z || !z.bbox || !kartenBereit) return;
  const [west, sued, ost, nord] = z.bbox;
  gebiet = rechteck({ lng: west, lat: sued }, { lng: ost, lat: nord });
  verwerfeDaten();
  zeigeRechteck(gebiet);
  aktualisiereAngaben(gebiet);
  map.fitBounds(turf.bbox(gebiet), { padding: 60, duration: 0 });
  // Einstellungen
  chkLod2.checked = z.lod2 !== false;
  if (z.sonne) { Object.assign(sonneZustand, z.sonne); sonneZustand.zelle = { schatten: 0.5, dauer: 1, ...(z.sonne.zelle || {}) }; }
  schwarzModus = z.schwarzModus || "schwarz";
  if (z.flstModus) flstModus = z.flstModus;
  if (z.wirtModus) wirtModus = z.wirtModus;
  document.querySelectorAll("#flst-modus button").forEach((b) => b.classList.toggle("is-active", b.dataset.modus === flstModus));
  document.querySelectorAll("#wirt-modus button").forEach((b) => b.classList.toggle("is-active", b.dataset.modus === wirtModus));
  if (z.luft) {
    luftEl.deckkraft.value = z.luft.deckkraft; luftEl.sw.checked = !!z.luft.sw;
    luftEl.gebaeude.checked = !!z.luft.gebaeude; luftEl.flst.checked = !!z.luft.flst; luftEl.strassen.checked = !!z.luft.strassen;
    luftEl.deckkraft.dispatchEvent(new Event("input"));
  }
  if (z.erreich) {
    erreichMitte = z.erreich.mitte || null; erreichEl.an.checked = !!z.erreich.an;
    erreichEl.r5.checked = !!z.erreich.r5; erreichEl.r10.checked = !!z.erreich.r10; erreichEl.r15.checked = !!z.erreich.r15;
  }
  if (z.schnitt && z.schnitt.liste && z.schnitt.liste.length) {
    schnittListe = z.schnitt.liste; schnittAktiv = Math.min(Math.max(0, z.schnitt.aktiv), schnittListe.length - 1);
    const l = schnittListe[schnittAktiv];
    schnittLinie = { a: l.a, b: l.b };
    sEl.seite.value = String(l.seite); sEl.tiefe.value = String(l.tiefe);
    schnittListeAnzeigen();
    sEl.neu.textContent = "Neue Linie ziehen";
  }
  projektMerkAnzeigen();
  projektEl.feld.hidden = true;
  zeigeAnsicht(z.tab && z.tab !== "karte" ? z.tab : "karte");
  btnAnalyse.click();                                   // Daten neu laden, danach füllen sich alle Reiter von selbst
}

projektEl.laden.addEventListener("click", projektWiederherstellen);
projektEl.vergessen.addEventListener("click", () => { try { localStorage.removeItem(PROJEKT_KEY); } catch (_) { /* nicht schlimm */ } projektMerkAnzeigen(); });
setInterval(() => { projektSpeichern(); if (!gebiet) projektMerkAnzeigen(); }, 3000);
projektMerkAnzeigen();
