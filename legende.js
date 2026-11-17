/* ============================================================
   Ortsanalyse – Legende
   In jedem Reiter mit Karte oder 3D gibt es eine Legende, die man ein- und ausblenden kann.
   Sie zeigt den Farbschlüssel der gerade sichtbaren Ebenen und ein paar Eckdaten (aus den Kennzahlen).
   Die Farben kommen aus der zentralen Palette FARBE (app.js), damit Legende und Plan immer zusammenpassen.
   ============================================================ */

"use strict";

const legendeKarte = document.getElementById("legende-karte");
const legende3d = document.getElementById("legende-3d");
// Start: offen, außer auf niedrigen Bildschirmen (dort würde sie viel von der Karte verdecken) oder wenn sie zuletzt zugeklappt wurde
let legendeOffen = window.innerHeight >= 700;
try {
  const gemerkt = localStorage.getItem("ortsanalyse-legende");
  if (gemerkt) legendeOffen = gemerkt === "offen";
} catch (_) { /* ohne Speicher: Standard gilt */ }
let legendeZeitgeber = null;
let kennzahlenMerker = { stand: "", k: null };

// ----- kleine Bausteine -----
const farbfeld = (farbe, rand) => `<span class="sw" style="background:${farbe};${rand ? `border-color:${rand}` : ""}"></span>`;
const linienfeld = (farbe, dicke = 3) => `<span class="sw sw-linie" style="background:${farbe};height:${dicke}px"></span>`;
const kreisfeld = (farbe, rand) => `<span class="sw sw-kreis" style="background:${farbe};border-color:${rand || farbe}"></span>`;
const verlauf = (dunkel, hell) => `<span class="sw" style="background:linear-gradient(90deg, rgb(${dunkel.join(",")}), rgb(${hell.join(",")}));border-color:${FARBE.dachKante}"></span>`;
const eintrag = (feld, text) => `<li>${feld}<span>${text}</span></li>`;

// ----- Farbschlüssel je Reiter -----
function farbschluessel(ansicht) {
  const e = [];
  const rahmenGebiet = `<span class="sw sw-gestrichelt"></span>`;
  switch (ansicht) {
    case "karte":
      e.push(eintrag(rahmenGebiet, "Untersuchungsgebiet"));
      break;
    case "schwarzplan":
      if (schwarzModus === "hoehe") e.push(hoehenLegendeEintraege()); else
      e.push(eintrag(farbfeld(FARBE.gebaeudeSchwarzplan), "Gebäude"));
      e.push(eintrag(farbfeld(FARBE.nebengebaeude), "Nebengebäude, Überdachung"));
      break;
    case "strassen":
      if (alkisVorhanden) {
        e.push(eintrag(farbfeld(FARBE.netz.fahrbahn), "Straßenraum (Fahrbahn)"));
        e.push(eintrag(farbfeld(FARBE.netz.weg, FARBE.netz.kante), "Wege und Gehwege"));
        e.push(eintrag(farbfeld(FARBE.netz.platz, FARBE.netz.kante), "Plätze, Fußgängerzonen"));
      } else {
        e.push(eintrag(linienfeld(FARBE.strasseSchwarz, 4), "Straße (Linienstärke nach Art)"));
      }
      e.push(eintrag(farbfeld(FARBE.kontext), "Gebäude (Orientierung)"));
      break;
    case "gruen":
      e.push(eintrag(farbfeld(FARBE.gruen), "Grünfläche"));
      e.push(eintrag(farbfeld(FARBE.wasser), "Wasser"));
      e.push(eintrag(kreisfeld(FARBE.krone, FARBE.kroneRand), "Baumkrone"));
      e.push(eintrag(kreisfeld(FARBE.kroneNadel, FARBE.kroneRand), "Nadelbaum"));
      e.push(eintrag(farbfeld(FARBE.kontext), "Gebäude (Orientierung)"));
      break;
    case "lageplan":
      if (lod2Vorhanden) e.push(eintrag(verlauf(FARBE.dachDunkel, FARBE.dachHell), "Dach (LoD2), nach Neigung schattiert"));
      e.push(eintrag(farbfeld(FARBE.gebaeudeLageplan, FARBE.umriss), lod2Vorhanden ? "Gebäude ohne LoD2 (OSM)" : "Gebäude (OSM)"));
      e.push(eintrag(farbfeld(FARBE.nebenLageplan, FARBE.umriss), "Nebengebäude"));
      if (alkisVorhanden) {
        e.push(eintrag(farbfeld(FARBE.plan.fahrbahn, FARBE.plan.kante), "Fahrbahn"));
        e.push(eintrag(farbfeld(FARBE.plan.weg, FARBE.plan.kante), "Weg, Gehweg"));
        e.push(eintrag(farbfeld(FARBE.plan.platz, FARBE.plan.kante), "Platz, Fußgängerzone"));
      } else {
        e.push(eintrag(linienfeld(FARBE.strasseLageplan, 3), "Straße (OSM-Linie)"));
      }
      e.push(eintrag(farbfeld(FARBE.gruen), "Grünfläche"));
      e.push(eintrag(farbfeld(FARBE.wasser), "Wasser"));
      e.push(eintrag(kreisfeld(FARBE.krone, FARBE.kroneRand), "Baumkrone"));
      break;
    case "flurstuecke":
      e.push(flurstueckeVorhanden ? flstLegendeEintraege() : eintrag(rahmenGebiet, "Untersuchungsgebiet"));
      break;
    case "schnitt":
      e.push(eintrag(rahmenGebiet, "Untersuchungsgebiet"), schnittLegendeEintraege());
      break;
    case "sonne":
      e.push(eintrag(rahmenGebiet, "Untersuchungsgebiet"), sonneLegendeEintraege());
      break;
    case "wirtschaft":
      e.push(flurstueckeVorhanden ? wirtLegendeEintraege() : eintrag(rahmenGebiet, "Untersuchungsgebiet"));
      break;
    case "luftbild":
      e.push(eintrag(rahmenGebiet, "Untersuchungsgebiet"));
      if (osmFeatures.length) e.push(eintrag(linienfeld("#ffd43b", 2), "Gebäudeumrisse (wenn an)"));
      if (flurstueckeVorhanden) e.push(eintrag(linienfeld("#5fd4ff", 2), "Flurstücksgrenzen (wenn an)"));
      if (alkisVorhanden) e.push(eintrag(linienfeld("#ff9ec0", 2), "Straßenflächen (wenn an)"));
      break;
    case "infos":
      e.push(eintrag(rahmenGebiet, "Untersuchungsgebiet"));
      e.push(eintrag(`<span class="sw" style="background:#7a4aa8"></span>`, "Schalter: Infofeld rechts"));
      break;
    case "mieten":
      e.push(mietVorhanden ? mietLegendeEintraege() : eintrag(rahmenGebiet, "Untersuchungsgebiet"));
      break;
    case "3d":
      e.push(eintrag(farbfeld(FARBE.d3.wand, "#b9b4aa"), "Wand (LoD2)"));
      e.push(eintrag(farbfeld(FARBE.d3.dach, "#6f6d6a"), "Dach (LoD2)"));
      e.push(eintrag(farbfeld(FARBE.d3.ersatzWand, "#8da2b5"), "Ersatzblock aus OSM (ohne LoD2)"));
      e.push(eintrag(farbfeld(FARBE.plan.fahrbahn), "Boden: Fahrbahn"));
      e.push(eintrag(farbfeld(FARBE.plan.weg), "Boden: Weg, Platz"));
      e.push(eintrag(farbfeld(FARBE.gruen), "Boden: Grün"));
      e.push(eintrag(farbfeld(FARBE.wasser), "Boden: Wasser"));
      e.push(eintrag(kreisfeld(FARBE.krone, FARBE.kroneRand), "Baum"));
      if (gelaende) e.push(eintrag(linienfeld("#8a6d4b", 2), `Höhenlinie (alle ${d3 && d3.boden ? d3.boden.abstand : 1} m)`));
      break;
  }
  return e.join("");
}

// ----- Eckdaten je Reiter (aus den Kennzahlen) -----
function kennzahlenMitMerker() {
  const stand = [turf.bbox(gebiet).join(","), osmFeatures.length, alkisFlaechen.length, lod2Meta.length, baumFeatures.length].join("|");
  if (kennzahlenMerker.stand !== stand) kennzahlenMerker = { stand, k: berechneKennzahlen() };
  return kennzahlenMerker.k;
}

function eckdaten(ansicht) {
  const zeilen = [];
  if (!gebiet) return zeilen;
  const flaeche = turf.area(gebiet);
  zeilen.push(["Gebiet", fm2(flaeche)]);
  if (!datenVorhanden) return zeilen;
  if (ansicht === "flurstuecke") return zeilen.concat(flstEckdaten());
  if (ansicht === "mieten") return zeilen.concat(mietEckdaten());
  if (ansicht === "infos") return zeilen.concat(infoEckdaten());
  if (ansicht === "wirtschaft") return zeilen.concat(wirtEckdaten());
  if (ansicht === "schnitt") return zeilen.concat(schnittEckdaten());
  if (ansicht === "luftbild") return zeilen;
  const k = kennzahlenMitMerker();
  const A = k.flaeche;
  if (ansicht === "schwarzplan" && k.hatOsm) {
    zeilen.push(["Gebäude", zahl(k.anzahlHaupt)], ["Bebaute Fläche", fm2(k.grundflaeche)], ["Bebauungsanteil", prozent(k.grundflaeche / A)]);
    if (k.anzahlNeben) zeilen.push(["Nebengebäude", zahl(k.anzahlNeben)]);
  } else if (ansicht === "strassen") {
    if (k.verkehrFlaeche != null) zeilen.push(["Verkehrsfläche", `${fm2(k.verkehrFlaeche)} · ${prozent(k.verkehrFlaeche / A)}`]);
    if (k.alkisTeile) zeilen.push(["Fahrbahn", fm2(k.alkisTeile.strasse)], ["Wege", fm2(k.alkisTeile.weg)], ["Plätze", fm2(k.alkisTeile.platz)]);
    if (k.laengeGesamt != null) zeilen.push(["Straßenlänge", `${zahl(k.laengeGesamt)} m`]);
  } else if (ansicht === "gruen" && k.hatOsm) {
    zeilen.push(["Grün + Wasser", prozent(k.gruenWasserFlaeche / A)], ["Einzelbäume", zahl(k.baeume)], ["Kronenüberdeckung", prozent(k.kronenFlaeche / A)]);
  } else if (ansicht === "lageplan" && k.hatOsm) {
    zeilen.push(["Gebäude", zahl(k.anzahlHaupt)], ["GRZ / GFZ brutto", `${zahl(k.grundflaeche / A, 2)} / ${zahl(k.geschossflaeche / A, 2)}`], ["Mittlere Geschosse", zahl(k.mittlereGeschosse, 1)]);
    if (k.verkehrFlaeche != null) zeilen.push(["Verkehr", prozent(k.verkehrFlaeche / A)]);
    zeilen.push(["Grün + Wasser", prozent(k.gruenWasserFlaeche / A)]);
  } else if (ansicht === "3d") {
    if (d3 && d3.lod2Anzahl) zeilen.push(["Gebäude aus LoD2", zahl(d3.lod2Anzahl)]);
    if (d3 && d3.ersatzAnzahl) zeilen.push(["Ersatzblöcke (OSM)", zahl(d3.ersatzAnzahl)]);
    const hoehen = lod2Meta.map((m) => m.hoehe).filter((h) => h > 0);
    if (hoehen.length) zeilen.push(["Höchstes Gebäude", `${zahl(Math.max(...hoehen), 1)} m`]);
    if (k.hatOsm) zeilen.push(["Bäume", zahl(k.baeume)]);
    zeilen.push(gelaende
      ? ["Gelände", `${zahl(gelaende.min, 1)} bis ${zahl(gelaende.max, 1)} m ü. NHN`]
      : ["Gelände", "flach angenommen"]);
    if (gelaende && d3 && d3.ueberhoehung > 1) zeilen.push(["Überhöhung", `${zahl(d3.ueberhoehung, 1)}×`]);
  }
  return zeilen;
}

function quellenzeile() {
  const q = ["© OpenStreetMap-Mitwirkende (ODbL)"];
  if (lod2Vorhanden) q.push(lod2Quelle.replace(/^LoD2: /, "Gebäude: "));
  if (alkisVorhanden) q.push(alkisQuelle);
  if (flurstueckeVorhanden && (aktuelleAnsicht === "flurstuecke" || aktuelleAnsicht === "wirtschaft")) q.push(flurstueckeQuelle);
  if (mietVorhanden && aktuelleAnsicht === "wirtschaft") q.push(mietQuelle);
  if (mietVorhanden && aktuelleAnsicht === "mieten") q.push(mietQuelle);
  if (aktuelleAnsicht === "luftbild") q.push(`Luftbild: LGLN (${luftJahr}), CC BY 4.0`);
  if (gelaende) q.push(gelaendeQuelle);
  return q.join(" · ");
}

// ----- Zusammenbauen -----
function legendeHtml(ansicht) {
  const daten = eckdaten(ansicht);
  const tabelle = daten.length
    ? `<dl class="legende-daten">${daten.map(([name, wert]) => `<div><dt>${name}</dt><dd>${wert}</dd></div>`).join("")}</dl>`
    : "";
  return `<ul class="legende-liste">${farbschluessel(ansicht)}</ul>${tabelle}` +
    (datenVorhanden && ansicht !== "karte" ? `<p class="legende-quelle">${quellenzeile()}</p>` : "");
}

function zeichneLegende(ziel, ansicht) {
  const knopf = `<button class="legende-knopf" type="button" aria-expanded="${legendeOffen}">Legende <span aria-hidden="true">${legendeOffen ? "▾" : "▸"}</span></button>`;
  ziel.innerHTML = knopf + (legendeOffen ? `<div class="legende-inhalt">${legendeHtml(ansicht)}</div>` : "");
  ziel.querySelector(".legende-knopf").addEventListener("click", () => {
    legendeOffen = !legendeOffen;
    try { localStorage.setItem("ortsanalyse-legende", legendeOffen ? "offen" : "zu"); } catch (_) { /* nicht schlimm */ }
    aktualisiereLegende();
  });
}

// Wird aus app.js und ansicht3d.js aufgerufen, wenn sich Reiter oder Daten ändern
function aktualisiereLegende() {
  clearTimeout(legendeZeitgeber);
  legendeZeitgeber = setTimeout(() => {   // kurz warten, falls mehrere Quellen fast gleichzeitig fertig werden
    const ansicht = aktuelleAnsicht;
    const istKartenReiter = KARTEN_REITER.includes(ansicht);
    legendeKarte.hidden = !istKartenReiter;
    legende3d.hidden = ansicht !== "3d";
    try {
      if (istKartenReiter) zeichneLegende(legendeKarte, ansicht);
      else if (ansicht === "3d") zeichneLegende(legende3d, "3d");
    } catch (fehler) {
      console.error(fehler);
    }
  }, 60);
}

aktualisiereLegende();
