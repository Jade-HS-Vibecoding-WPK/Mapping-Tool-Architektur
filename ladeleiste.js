/* ============================================================
   Ortsanalyse – Ladestand
   Beim Klick auf "Analysieren" laden vier Quellen gleichzeitig: OpenStreetMap, LoD2-Gebäude, amtliche Straßenflächen
   und das Gelände. Der Ladestand in der Seitenleiste zeigt für jede Quelle, ob sie wartet, lädt, fertig ist oder
   fehlgeschlagen ist, und darunter, was genau geholt wird: welche LoD2- und Geländekacheln, welche Abfragen, welche Server.
   Hinter jeder Zeile steht ein kleiner Ladekreis (dreht sich, füllt sich bei bekanntem Fortschritt, dann Haken oder Kreuz).
   Ein dünner Gesamtstreifen über den Reitern zeigt den Fortschritt insgesamt.

   Ehrlich bleiben: OpenStreetMap meldet keinen Fortschritt, dort dreht sich nur der Kreis, bis die Antwort da ist.
   Beim LoD2-Download ist die Prozentzahl echt (geladene Bytes durch Gesamtgröße).
   ============================================================ */

"use strict";

const LADE_QUELLEN = {
  osm:   { name: "OpenStreetMap", gewicht: 40 },
  lod2:  { name: "LoD2-Gebäude (LGLN)", gewicht: 40 },
  alkis: { name: "Amtliche Straßenflächen (LGLN)", gewicht: 10 },
  dgm:   { name: "Gelände (LGLN)", gewicht: 10 },
  flst:  { name: "Flurstücke und Bodenrichtwerte (LGLN)", gewicht: 10 },
  mieten: { name: "Mieten (Zensus 2022)", gewicht: 5 }
};
const ladeFeld = document.getElementById("ladeleiste");
const ladeListe = document.getElementById("lade-liste");
const ladeStreifen = document.getElementById("lade-streifen");
const ladeStreifenBalken = document.getElementById("lade-streifen-balken");
let ladeZustand = {};
let ladeAusblenden = null;
let ladeZeichnenGeplant = false;

// Zustände: "laedt" (p = 0 bis 1 oder null, wenn unbekannt), "fertig", "keine" (keine Daten für das Gebiet), "fehler", "aus"
function ladeStart(mitLod2) {
  clearTimeout(ladeAusblenden);
  ladeZustand = {};
  for (const schluessel of Object.keys(LADE_QUELLEN)) ladeZustand[schluessel] = { z: "laedt", p: null, text: "wartet auf Antwort …", unter: new Map() };
  if (!mitLod2) ladeZustand.lod2 = { z: "aus", p: 1, text: "abgeschaltet (Haken)", unter: new Map() };
  ladeFeld.hidden = false;
  ladeStreifen.hidden = false;
  ladeZeichne();
}

function ladeSetze(schluessel, zustand, p, text) {
  const alt = ladeZustand[schluessel];
  if (!alt) return;
  ladeZustand[schluessel] = { z: zustand, p: p === undefined ? null : p, text: text || "", unter: alt.unter };
  ladeZeichnen();
}

// Eine einzelne Kachel, Abfrage oder ein Server unter einer Quelle (zustand: "laedt", "fertig", "fehler", "abgebrochen")
function ladeUnter(quelle, id, label, zustand, p, text) {
  const q = ladeZustand[quelle];
  if (!q) return;
  q.unter.set(id, { label, z: zustand, p: p == null ? null : p, text: text || "" });
  ladeZeichnen();
}

// Zeichnen höchstens etwa 8-mal pro Sekunde, damit viele Fortschrittsmeldungen die Seite nicht bremsen
function ladeZeichnen() {
  if (ladeZeichnenGeplant) return;
  ladeZeichnenGeplant = true;
  setTimeout(() => { ladeZeichnenGeplant = false; ladeZeichne(); }, 120);
}

// Der kleine Ladekreis hinter einer Zeile
function ladeKreis(zustand, p) {
  if (zustand === "laedt") {
    return p == null ? `<span class="kreis dreht" aria-label="lädt"></span>`
      : `<span class="kreis ring" style="--p:${Math.round(p * 100)}" aria-label="${Math.round(p * 100)} Prozent"></span>`;
  }
  if (zustand === "fertig") return `<span class="kreis ok" aria-label="fertig">✓</span>`;
  if (zustand === "fehler") return `<span class="kreis nein" aria-label="Fehler">✗</span>`;
  return `<span class="kreis aus" aria-label="nicht nötig">–</span>`;
}

function ladeZeichne() {
  const alle = Object.entries(ladeZustand);
  if (!alle.length) return;

  ladeListe.innerHTML = alle.map(([schluessel, q]) => {
    const quelle = LADE_QUELLEN[schluessel];
    const knopf = schluessel === "lod2" && q.z === "fehler" ? ` <button type="button" class="lade-nochmal" data-quelle="lod2">Nochmal versuchen</button>` : "";
    const unter = q.unter.size
      ? `<ul class="lade-unter">${[...q.unter.values()].map((u) =>
          `<li class="lade-${u.z}"><span class="lade-unter-name">${u.label}</span><span class="lade-text">${u.text}</span>${ladeKreis(u.z, u.p)}</li>`).join("")}</ul>`
      : "";
    return `<li class="lade-quelle lade-${q.z}"><div class="lade-kopf"><span class="lade-name">${quelle.name}</span>` +
      `<span class="lade-text">${q.text}${knopf}</span>${ladeKreis(q.z, q.p)}</div>${unter}</li>`;
  }).join("");

  // Gesamtstreifen: Anteil der Gewichte, bei laufenden Quellen mit bekanntem Fortschritt anteilig
  let summe = 0, erreicht = 0, unbestimmt = false, offen = false;
  for (const [schluessel, q] of alle) {
    if (q.z === "aus") continue;
    const gewicht = LADE_QUELLEN[schluessel].gewicht;
    summe += gewicht;
    if (q.z === "laedt") {
      offen = true;
      if (q.p == null) unbestimmt = true;
      else erreicht += gewicht * q.p;
    } else erreicht += gewicht;
  }
  const prozent = summe ? Math.round((erreicht / summe) * 100) : 100;
  ladeStreifenBalken.style.width = `${prozent}%`;
  ladeStreifen.classList.toggle("unbestimmt", unbestimmt);
  ladeStreifen.setAttribute("aria-valuenow", String(prozent));

  if (!offen) {
    // Alles durch: Streifen nach kurzer Zeit ausblenden, die Liste bleibt als Zusammenfassung stehen
    clearTimeout(ladeAusblenden);
    ladeAusblenden = setTimeout(() => { ladeStreifen.hidden = true; }, 1500);
  }
}

// "Nochmal versuchen" bei LoD2
ladeListe.addEventListener("click", (e) => {
  const knopf = e.target.closest(".lade-nochmal");
  if (knopf && typeof wiederholeLod2 === "function") wiederholeLod2();
});

// Wenn die Analyse gelöscht oder verworfen wird, den Ladestand wegräumen
function ladeLeeren() {
  clearTimeout(ladeAusblenden);
  ladeZustand = {};
  ladeFeld.hidden = true;
  ladeStreifen.hidden = true;
  ladeListe.innerHTML = "";
}

// Aus einer Kachel-ID wie "LoD2_32_447_5888_1_ni" einen lesbaren Namen machen: "Kachel 447 / 5888"
function kachelName(id) {
  const t = /_(\d{3})_(\d{4})_/.exec(id);
  return t ? `Kachel ${t[1]} / ${t[2]}` : id;
}
