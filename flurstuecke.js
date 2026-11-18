/* ============================================================
   SiteKick – Flurstücke, Bodenrichtwerte und Bestandskennzahlen

   Ein Flurstück ist ein Grundstück im Liegenschaftskataster (ALKIS). Der LGLN stellt die Flurstücke
   und die Bodenrichtwerte (BORIS) frei bereit. Ein Bodenrichtwert ist der durchschnittliche Preis je m²
   Bauland in einer Zone (Stichtag 1. Januar), vom Gutachterausschuss festgelegt.

   Was dieser Reiter macht:
     1. Flurstücke (ALKIS, AX_Flurstueck) und Richtwertzonen (BORIS, BR_BodenrichtwertZonal) laden.
     2. Jedem Flurstück die Richtwertzone mit der größten Überlappung zuordnen.
     3. Die Gebäude (OpenStreetMap, mit Geschossen aus OSM oder LoD2) dem Flurstück zuordnen und daraus
        GRZ und GFZ des Bestands rechnen. Das ist der Bestand, nicht das, was ein Bebauungsplan erlaubt.
        Bebauungspläne sind nicht eingebunden (für Oldenburg gibt es nur die Umrisse, keine Zahlen).
     4. Beim Klick auf ein Flurstück alles in einem Infofeld zeigen.

   Reihenfolge der Rechnung: Zonen einmal beim Laden, Bestand jedes Mal, wenn sich die Datenlage ändert
   (z. B. wenn OpenStreetMap oder LoD2 später fertig werden).
   ============================================================ */

"use strict";

const BORIS_WFS = "https://opendata.lgln.niedersachsen.de/doorman/noauth/boris_wfs";
const FLST_MAX = 5000;                  // höchstens so viele Flurstücke je Abfrage
const flstStatusFeld = document.getElementById("flst-status");
const flstInfoFeld = document.getElementById("flst-info");
const flstModusFeld = document.getElementById("flst-modus");

let flurstuecke = [];                   // eigene Objekte, siehe baueFlurstueck()
let richtwertZonen = [];
let flurstueckeVorhanden = false;
let flurstueckeQuelle = "";
let flstModus = "brw";                  // Einfärbung: "brw", "grz" oder "gfz"
let flstAuswahl = null;                 // Nummer (id) des gewählten Flurstücks
let flstStand = "";                     // woran wir merken, ob neu gerechnet werden muss
let flstKarteStand = "";                // für welchen Stand die Karte des Reiters "Flurstücke" zuletzt gezeichnet wurde
let flstSumme = null;                   // Zusammenfassung für Legende und Infofeld

// Nutzungsarten und Zustände laut BORIS (gängige Schlüssel; nicht gegen die offizielle Liste geprüft)
const BRW_NUTZUNG = {
  W: "Wohnbaufläche", WS: "Kleinsiedlungsgebiet", WR: "reines Wohngebiet", WA: "allgemeines Wohngebiet", WB: "besonderes Wohngebiet",
  M: "gemischte Baufläche", MD: "Dorfgebiet", MI: "Mischgebiet", MK: "Kerngebiet", MU: "urbanes Gebiet",
  G: "gewerbliche Baufläche", GE: "Gewerbegebiet", GI: "Industriegebiet", S: "Sonderbaufläche", SO: "Sondergebiet"
};
const BRW_ZUSTAND = { B: "baureifes Land", R: "Rohbauland", E: "Bauerwartungsland", LF: "land- oder forstwirtschaftliche Fläche", SF: "sonstige Fläche" };
const BRW_BAUWEISE = { o: "offen", g: "geschlossen", a: "abweichend" };

const htmlSicher = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const euro = (x) => `${zahl(x)} €`;
const datumDe = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || ""); };

function zeigeFlstStatus(text) {
  flstStatusFeld.textContent = text;
  flstStatusFeld.hidden = !text;
}

// ---------- 1. Laden und lesen ----------
const gmlText = (el, name) => { const e = el.getElementsByTagNameNS("*", name)[0]; return e ? e.textContent.trim() : ""; };
// Wert aus einem Kästchen wie <wertrelevanteGeschossflaechenzahl><...><wert>2.4</wert>
const gmlWert = (el, name) => {
  const e = el.getElementsByTagNameNS("*", name)[0];
  if (!e) return "";
  const w = e.getElementsByTagNameNS("*", "wert")[0];
  return (w || e).textContent.trim();
};

// Fläche (Polygon oder mehrere) eines GML-Objekts, umgerechnet in Längen- und Breitengrad
function gmlFlaeche(objekt) {
  const polygone = [];
  for (const polygon of objekt.getElementsByTagNameNS("*", "Polygon")) {
    const ringe = [];
    const hinein = (element) => {
      const pos = element.getElementsByTagNameNS("*", "posList")[0];
      if (!pos) return;
      const z = pos.textContent.trim().split(/\s+/).map(Number);
      const ring = [];
      for (let i = 0; i + 1 < z.length; i += 2) ring.push(utmWandler.inverse([z[i], z[i + 1]]));
      if (ring.length >= 4) ringe.push(ring);
    };
    for (const e of polygon.getElementsByTagNameNS("*", "exterior")) hinein(e);
    for (const i of polygon.getElementsByTagNameNS("*", "interior")) hinein(i);
    if (ringe.length) polygone.push(ringe);
  }
  if (!polygone.length) return null;
  return polygone.length === 1 ? { type: "Polygon", coordinates: polygone[0] } : { type: "MultiPolygon", coordinates: polygone };
}

function leseXml(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Antwort des LGLN nicht lesbar");
  const meldung = doc.getElementsByTagNameNS("*", "ExceptionText")[0];
  if (meldung) throw new Error("LGLN meldet: " + meldung.textContent.trim().slice(0, 120));
  return doc;
}

function leseFlurstuecke(text) {
  const doc = leseXml(text);
  const liste = [];
  for (const o of doc.getElementsByTagNameNS("*", "AX_Flurstueck")) {
    const geometrie = gmlFlaeche(o);
    if (!geometrie) continue;
    const zaehler = gmlText(o, "zaehler"), nenner = gmlText(o, "nenner");
    liste.push({
      geometrie,
      kennzeichen: gmlText(o, "flurstueckskennzeichen"),
      nr: nenner ? `${zaehler}/${nenner}` : zaehler,
      flur: gmlText(o, "flurnummer"),
      gemarkungNr: gmlText(o, "gemarkungsnummer"),
      flaeche: parseFloat(gmlText(o, "amtlicheFlaeche")) || null,
      abweichend: gmlText(o, "abweichenderRechtszustand") === "true"
    });
  }
  const wurzel = doc.documentElement;
  return { liste, stand: (wurzel.getAttribute("timeStamp") || "").slice(0, 4), abgeschnitten: Number(wurzel.getAttribute("numberReturned")) >= FLST_MAX };
}

function leseRichtwertZonen(text) {
  const doc = leseXml(text);
  const liste = [];
  for (const o of doc.getElementsByTagNameNS("*", "BR_BodenrichtwertZonal")) {
    const geometrie = gmlFlaeche(o);
    const wert = parseFloat(gmlText(o, "bodenrichtwert"));
    if (!geometrie || !Number.isFinite(wert)) continue;
    const gem = o.getElementsByTagNameNS("*", "gemarkung")[0];
    liste.push({
      geometrie,
      brw: wert,
      stichtag: gmlText(o, "stichtag"),
      zone: gmlText(o, "bodenrichtwertzoneName"),
      nutzung: gmlText(o.getElementsByTagNameNS("*", "nutzung")[0] || o, "art"),
      bauweise: gmlText(o, "bauweise"),
      zustand: gmlText(o, "entwicklungszustand"),
      gfz: parseFloat(gmlWert(o, "wertrelevanteGeschossflaechenzahl")) || null,
      geschosse: gmlWert(o, "geschosszahl"),
      richtflaeche: parseFloat(gmlWert(o, "flaeche")) || null,
      ergaenzung: gmlText(o, "ergaenzung"),
      gemarkungNr: gem ? gmlText(gem, "nummer").slice(2) : "",      // "031905" = Land 03 + Gemarkung 1905
      gemarkungName: gem ? gmlText(gem, "name") : ""
    });
  }
  return { liste };
}

// Lädt Flurstücke und Richtwertzonen gleichzeitig. Liefert { flurstuecke, zonen, ... } oder { fehler } oder { keine } oder { abgebrochen }.
async function starteFlurstuecke(rahmen, nummer) {
  try {
    zeigeFlstStatus("Flurstücke und Bodenrichtwerte werden beim LGLN geladen …");
    ladeSetze("flst", "laedt", null, "wird abgefragt …");
    const [west, sued, ost, nord] = turf.bbox(rahmen);
    const ecken = [[west, sued], [west, nord], [ost, sued], [ost, nord]].map((e) => utmWandler.forward(e));
    const xs = ecken.map((e) => e[0]), ys = ecken.map((e) => e[1]);
    const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((z) => z.toFixed(1)).join(",") + ",urn:ogc:def:crs:EPSG::25832";

    const hole = async (id, name, url, leser, einheit) => {
      ladeUnter("flst", id, name, "laedt", null, "");
      try {
        const antwort = await fetch(url);
        if (!antwort.ok) throw new Error(`Der LGLN-Dienst meldet Fehler ${antwort.status}`);
        const teil = leser(await antwort.text());
        ladeUnter("flst", id, name, "fertig", 1, `${zahl(teil.liste.length)} ${einheit}`);
        return teil;
      } catch (fehler) {
        ladeUnter("flst", id, name, "fehler", 1, "Fehler");
        throw fehler;
      }
    };
    const kopf = "SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&SRSNAME=urn:ogc:def:crs:EPSG::25832";
    const [fl, zo] = await Promise.allSettled([
      hole("flurstuecke", "Flurstücke (ALKIS)", `${ALKIS_WFS}?${kopf}&TYPENAMES=adv:AX_Flurstueck&BBOX=${box}&COUNT=${FLST_MAX}`, leseFlurstuecke, "Flurstücke"),
      hole("richtwerte", "Bodenrichtwertzonen (BORIS)", `${BORIS_WFS}?${kopf}&TYPENAMES=boris:BR_BodenrichtwertZonal&BBOX=${box}&COUNT=1000`, leseRichtwertZonen, "Zonen")
    ]);
    if (nummer !== ladeNummer) return { abgebrochen: true };
    if (fl.status === "rejected") return { fehler: fl.reason.message };
    if (!fl.value.liste.length) return { keine: true };
    return {
      flurstuecke: fl.value.liste,
      jahr: fl.value.stand,
      abgeschnitten: fl.value.abgeschnitten,
      zonen: zo.status === "fulfilled" ? zo.value.liste : [],
      zonenFehler: zo.status === "rejected" ? zo.reason.message : ""
    };
  } catch (fehler) {
    return { fehler: fehler.message };
  }
}

// ---------- 2. Vorbereiten: Zonen zuordnen ----------
const bboxUeberlappt = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const bboxEnthaelt = (b, [x, y]) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

function flaecheSchnitt(a, b) {
  try {
    const s = turf.intersect(turf.featureCollection([a, b]));
    return s ? turf.area(s) : 0;
  } catch (_) { return 0; }
}

function baueFlurstueck(roh, id) {
  const f = { type: "Feature", properties: {}, geometry: roh.geometrie };
  return {
    id, f, bbox: turf.bbox(f),
    nr: roh.nr, flur: roh.flur, kennzeichen: roh.kennzeichen, gemarkungNr: roh.gemarkungNr, abweichend: roh.abweichend,
    flaeche: roh.flaeche || turf.area(f), flaecheAmtlich: !!roh.flaeche, geomFlaeche: turf.area(f),
    miete: null, mieteAnteil: 0, gfWohnen: 0, gfUnbekannt: 0, bri: 0, wflWohnung: null, baujahr: null,
    zone: null, zoneAnteil: 0, zoneKandidaten: 0,
    // Bestand (wird in berechneBestand gefüllt)
    verkehr: false, rand: false, nHaupt: 0, nNeben: 0, fHaupt: 0, fNeben: 0, gf: 0, ersatz: 0, geschosseSumme: 0
  };
}

// Welche Richtwertzone gilt für ein Flurstück? Die Zonen liegen teils übereinander: im Testgebiet liegt unter der
// Innenstadt eine Außenbereichszone (4.800 ha) und darunter je eine riesige Acker- und Grünlandzone. Regel:
//   1. Zonen, die mindestens die Hälfte des Flurstücks bedecken (sonst die mit der größten Überlappung).
//   2. Baulandzonen (Zustand B oder R) vor Landwirtschaft, Forst und Sonstigem.
//   3. Dann die kleinste Zone (die spezifischste).
// Damit es schnell geht, werden die Zonen vorher auf das Gebiet zugeschnitten (die großen haben sehr viele Eckpunkte).
function ordneZonenZu() {
  const gb = flurstuecke.reduce((b, p) => [Math.min(b[0], p.bbox[0]), Math.min(b[1], p.bbox[1]), Math.max(b[2], p.bbox[2]), Math.max(b[3], p.bbox[3])], [Infinity, Infinity, -Infinity, -Infinity])
    .map((x, i) => x + (i < 2 ? -0.0005 : 0.0005));
  const zonen = [];
  for (const z of richtwertZonen) {
    const voll = { type: "Feature", properties: {}, geometry: z.geometrie };
    const flaeche = turf.area(voll);
    let f = voll;
    try { f = turf.bboxClip(voll, gb); } catch (_) { /* dann ungeschnitten */ }
    if (!f.geometry.coordinates.length) continue;
    zonen.push({ z, f, b: turf.bbox(f), flaeche, bauland: z.zustand === "B" || z.zustand === "R" });
  }
  for (const p of flurstuecke) {
    const kandidaten = zonen.filter((e) => bboxUeberlappt(e.b, p.bbox));
    p.zoneKandidaten = kandidaten.length;
    if (!kandidaten.length) continue;
    const flurFlaeche = turf.area(p.f);
    const treffer = kandidaten.map((e) => ({ e, a: flaecheSchnitt(p.f, e.f) })).filter((t) => t.a > 0.05);
    if (!treffer.length) continue;
    const halb = treffer.filter((t) => t.a >= 0.5 * flurFlaeche);
    const liste = halb.length ? halb : treffer;
    liste.sort((x, y) => (y.e.bauland - x.e.bauland) || (halb.length ? x.e.flaeche - y.e.flaeche : y.a - x.a));
    p.zone = liste[0].e.z;
    p.zoneAnteil = Math.min(1, liste[0].a / flurFlaeche);
    p.zoneKandidaten = treffer.length;
  }
}

// ---------- 3. Bestand rechnen (Gebäude je Flurstück) ----------
function berechneBestand() {
  const [west, sued, ost, nord] = turf.bbox(gebiet);
  const hatGebaeude = osmFeatures.some((f) => f.properties.kat === "gebaeude" || f.properties.kat === "nebengebaeude");

  // Verkehrsflächen: liegt ein Punkt des Flurstücks in einer amtlichen Straßen-, Weg- oder Platzfläche?
  const verkehr = alkisFlaechen.filter((f) => ["strasse", "weg", "platz"].includes(f.properties.kat)).map((f) => ({ f, b: turf.bbox(f) }));
  for (const p of flurstuecke) {
    p.nHaupt = p.nNeben = p.fHaupt = p.fNeben = p.gf = p.ersatz = p.geschosseSumme = p.gfWohnen = p.gfUnbekannt = p.bri = 0;
    p.rand = p.bbox[0] < west || p.bbox[2] > ost || p.bbox[1] < sued || p.bbox[3] > nord;
    if (verkehr.length) {
      const pt = turf.pointOnFeature(p.f).geometry.coordinates;
      p.verkehr = verkehr.some((v) => bboxEnthaelt(v.b, pt) && turf.booleanPointInPolygon(pt, v.f));
    } else p.verkehr = false;
  }

  // Gebäude: Grundfläche anteilig auf die Flurstücke verteilen, gezählt wird beim Flurstück mit der größten Überlappung
  for (const g of osmFeatures) {
    const neben = g.properties.kat === "nebengebaeude";
    if (!neben && g.properties.kat !== "gebaeude") continue;
    const gb = turf.bbox(g);
    const gesch = geschosseVon(g.properties);
    // Nutzung (LoD2-Code, sonst OSM-Gebäudeart) für die Mietschätzung: nur Wohnen zählt sicher, "unbekannt" getrennt
    const nutzung = neben ? "" : ((g.properties.funktion && nutzungAusCode(g.properties.funktion)) || nutzungAusOsm(g.properties.bau));
    // Höhe für den umbauten Raum (Abbruchkosten): Gebäudehöhe aus LoD2 (höchster Punkt, überschätzt bei Dächern leicht), sonst Geschosse mal 3 m
    const hoehe = g.properties.hoehe > 0 ? g.properties.hoehe : gesch.n * GESCHOSSHOEHE_M;
    let bestes = null, besteFlaeche = 0;
    for (const p of flurstuecke) {
      if (!bboxUeberlappt(p.bbox, gb)) continue;
      const a = flaecheSchnitt(g, p.f);
      if (a < 0.05) continue;
      p.bri += a * hoehe;
      if (neben) p.fNeben += a;
      else {
        p.fHaupt += a; p.gf += a * gesch.n;
        if (nutzung === "Wohnen") p.gfWohnen += a * gesch.n;
        else if (nutzung === "Unbekannt") p.gfUnbekannt += a * gesch.n;
      }
      if (a > besteFlaeche) { besteFlaeche = a; bestes = p; }
    }
    if (!bestes) continue;
    if (neben) bestes.nNeben++;
    else {
      bestes.nHaupt++;
      bestes.geschosseSumme += gesch.n;
      if (gesch.quelle === "ersatz") bestes.ersatz++;
    }
  }

  // Miete des Zensus-Rasters je Flurstück (nur wenn Mietdaten geladen sind, siehe mieten.js)
  for (const p of flurstuecke) { if (p.verkehr) { p.miete = null; p.mieteAnteil = 0; } else mieteFuerFlurstueck(p); }

  // Zusammenfassung (netto: ohne Verkehrsflächen und ohne Randflurstücke)
  const s = { anzahl: flurstuecke.length, verkehr: 0, rand: 0, hatGebaeude, mitZone: 0, brwMin: Infinity, brwMax: -Infinity, brwSumme: 0, flaecheBrw: 0, flaecheNetto: 0, fHaupt: 0, gf: 0, grzMax: 0 };
  for (const p of flurstuecke) {
    if (p.verkehr) { s.verkehr++; continue; }
    if (p.rand) s.rand++;
    if (p.zone) {
      s.mitZone++;
      s.brwMin = Math.min(s.brwMin, p.zone.brw); s.brwMax = Math.max(s.brwMax, p.zone.brw);
      s.brwSumme += p.zone.brw * p.flaeche; s.flaecheBrw += p.flaeche;
    }
    if (!p.rand) { s.flaecheNetto += p.flaeche; s.fHaupt += p.fHaupt; s.gf += p.gf; }
  }
  if (!s.mitZone) { s.brwMin = 0; s.brwMax = 0; }
  // Farbskala: 5. bis 95. Perzentil der Richtwerte, damit einzelne Ausreißer (z. B. Acker im Park) die Skala nicht verzerren
  const werte = flurstuecke.filter((p) => !p.verkehr && p.zone).map((p) => p.zone.brw).sort((a, b) => a - b);
  s.brwVon = werte.length ? werte[Math.floor(werte.length * 0.05)] : 0;
  s.brwBis = werte.length ? werte[Math.min(werte.length - 1, Math.floor(werte.length * 0.95))] : 1;
  flstSumme = s;
}

const grzVon = (p) => p.fHaupt / p.flaeche;
const gfzVon = (p) => p.gf / p.flaeche;

// ---------- 4. Auf die Karte ----------
function flstMerkmale() {
  const hat = flstSumme && flstSumme.hatGebaeude;
  return flurstuecke.map((p) => ({
    type: "Feature", geometry: p.f.geometry,
    properties: {
      id: p.id,
      brw: !p.verkehr && p.zone ? p.zone.brw : null,
      grz: hat && !p.verkehr && !p.rand ? grzVon(p) : null,
      gfz: hat && !p.verkehr && !p.rand ? gfzVon(p) : null
    }
  }));
}

function flstFarbausdruck() {
  const f = FARBE.flst;
  const s = flstSumme || { brwVon: 0, brwBis: 1 };
  let von = 0, bis = 1, farben = f.brw, eigenschaft = "brw";
  if (flstModus === "brw") { von = s.brwVon; bis = Math.max(s.brwBis, s.brwVon + 1); }
  if (flstModus === "grz") { von = 0; bis = 1; farben = f.grz; eigenschaft = "grz"; }
  if (flstModus === "gfz") { von = 0; bis = 4; farben = f.gfz; eigenschaft = "gfz"; }
  const mitte = (von + bis) / 2;
  return ["case", ["<", ["number", ["get", eigenschaft], -1], 0], f.keine,
    ["interpolate", ["linear"], ["number", ["get", eigenschaft], 0], von, farben[0], mitte, farben[1], bis, farben[2]]];
}

function setzeFlurstueckeAufKarte() {
  if (!kartenBereit) return;
  map.getSource("flurstuecke").setData({ type: "FeatureCollection", features: flstMerkmale() });
  map.setPaintProperty("flst-flaeche", "fill-color", flstFarbausdruck());
  map.setFilter("flst-auswahl", ["==", ["get", "id"], flstAuswahl == null ? -1 : flstAuswahl]);
}

// Rechnet den Bestand (Gebäude, Verkehr, Miete je Flurstück) neu, wenn sich die Datenlage geändert hat. Auch der Reiter
// "Wirtschaftlichkeit" braucht diese Zahlen, deshalb ist das von der Karte des Reiters "Flurstücke" getrennt.
// Gibt true zurück, wenn es Flurstücke gibt.
function sorgeFuerBestand() {
  if (!flurstueckeVorhanden) return false;
  const stand = [turf.bbox(gebiet).join(","), flurstuecke.length, richtwertZonen.length, osmFeatures.length, alkisFlaechen.length, lod2Meta.length, mietZellen.length].join("|");
  if (stand !== flstStand) {
    flstStand = stand;
    const t0 = performance.now();
    berechneBestand();
    console.info(`Flurstücke: Bestand gerechnet in ${Math.round(performance.now() - t0)} ms`);
  }
  return true;
}

// Wird am Ende von wendeAnsichtAn() aufgerufen. Rechnet nur im Reiter "Flurstücke" und nur, wenn sich Daten geändert haben.
function aktualisiereFlurstuecke() {
  const aktiv = aktuelleAnsicht === "flurstuecke" && datenVorhanden;
  flstModusFeld.hidden = !(aktiv && flurstueckeVorhanden);
  flstInfoFeld.hidden = !aktiv;
  if (!aktiv) return;
  if (sorgeFuerBestand()) {
    if (flstKarteStand !== flstStand) { flstKarteStand = flstStand; setzeFlurstueckeAufKarte(); }
    flstModusFeld.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.modus === flstModus));
  }
  zeichneFlstInfo();
}

// ---------- 5. Infofeld ----------
const zeile = (name, wert) => `<div><dt>${name}</dt><dd>${wert}</dd></div>`;

function zeichneFlstInfo() {
  if (flstInfoFeld.hidden) return;
  if (!flurstueckeVorhanden) {
    const z = typeof ladeZustand !== "undefined" && ladeZustand.flst ? ladeZustand.flst.z : "";
    flstInfoFeld.innerHTML = `<p class="flst-leer">${z === "laedt" ? "Flurstücke und Bodenrichtwerte werden geladen …"
      : z === "keine" ? "Für dieses Gebiet gibt es keine Flurstücke (nur Niedersachsen)."
      : z === "fehler" ? "Flurstücke konnten nicht geladen werden. Bitte „Analysieren“ nochmal drücken."
      : "Noch keine Flurstücke geladen."}</p>`;
    return;
  }
  const p = flurstuecke.find((x) => x.id === flstAuswahl);
  if (!p) {
    flstInfoFeld.innerHTML = `<p class="flst-leer">Klicke auf ein Flurstück, um Fläche, Bodenrichtwert und Bestand zu sehen.</p>`;
    return;
  }
  const A = p.flaeche, z = p.zone, s = flstSumme;
  const gemarkung = (richtwertZonen.find((r) => r.gemarkungNr === p.gemarkungNr && r.gemarkungName) || {}).gemarkungName;
  let html = `<button type="button" class="flst-zu" aria-label="Schließen">×</button>` +
    `<h3>Flurstück ${htmlSicher(p.nr)}</h3><p class="flst-sub">${gemarkung ? `Gemarkung ${htmlSicher(gemarkung)}` : `Gemarkung ${htmlSicher(p.gemarkungNr)}`} · Flur ${htmlSicher(p.flur)}</p>` +
    `<dl>${zeile(p.flaecheAmtlich ? "Fläche (amtlich)" : "Fläche (gerechnet)", `${zahl(A)} m²`)}</dl>`;

  // Bodenrichtwert
  html += `<h4>Bodenrichtwert</h4>`;
  if (p.verkehr) {
    html += `<p class="flst-hinweis">Verkehrsfläche (Straße, Weg oder Platz). Dafür gibt es keinen Bodenrichtwert für Bauland.</p>`;
  } else if (!z) {
    html += `<p class="flst-hinweis">${richtwertZonen.length ? "Keine Richtwertzone für dieses Flurstück gefunden." : "Bodenrichtwerte konnten nicht geladen werden."}</p>`;
  } else {
    const nutzung = BRW_NUTZUNG[z.nutzung] ? `${BRW_NUTZUNG[z.nutzung]} (${z.nutzung})` : z.nutzung;
    html += `<dl>${zeile("Bodenrichtwert", `<strong>${euro(z.brw)}/m²</strong>`)}${zeile("Stichtag", datumDe(z.stichtag))}${zeile("Zone", htmlSicher(z.zone))}` +
      (nutzung ? zeile("Nutzung", htmlSicher(nutzung)) : "") +
      (z.bauweise ? zeile("Bauweise", htmlSicher(BRW_BAUWEISE[z.bauweise] || z.bauweise)) : "") +
      (z.zustand && z.zustand !== "B" ? zeile("Zustand", htmlSicher(BRW_ZUSTAND[z.zustand] || z.zustand)) : "") +
      (z.gfz ? zeile("Richtwert-GFZ", zahl(z.gfz, 2)) : "") +
      (z.geschosse ? zeile("Geschosse (Richtwert)", htmlSicher(z.geschosse)) : "") +
      (z.richtflaeche ? zeile("Richtgrundstück", `${zahl(z.richtflaeche)} m²`) : "") +
      (z.ergaenzung ? zeile("Ergänzung", htmlSicher(z.ergaenzung)) : "") +
      zeile("Bodenwert (Orientierung)", `ca. ${euro(A * z.brw)}`) + `</dl>`;
    if (p.zoneAnteil < 0.95) html += `<p class="flst-hinweis">Die Zone deckt nur ${zahl(p.zoneAnteil * 100)} % des Flurstücks ab; das Flurstück liegt an mehreren Zonen.</p>`;
    else if (p.zoneKandidaten > 1) html += `<p class="flst-hinweis">Hier liegen mehrere Zonen übereinander. Gezeigt ist die kleinste Baulandzone, die das Flurstück zur Hälfte oder mehr bedeckt.</p>`;
  }

  // Bestand
  html += `<h4>Bestand (aus den Gebäuden)</h4>`;
  if (!s.hatGebaeude) {
    html += `<p class="flst-hinweis">Der Bestand braucht die Gebäude aus OpenStreetMap. Sie sind noch nicht geladen.</p>`;
  } else if (p.verkehr) {
    html += `<p class="flst-hinweis">Für Verkehrsflächen wird kein Bestand gerechnet.</p>`;
  } else {
    const grz = grzVon(p), gfz = gfzVon(p);
    html += `<dl>${zeile("Gebäude", `${zahl(p.nHaupt)}${p.nNeben ? ` + ${zahl(p.nNeben)} Nebengebäude` : ""}`)}` +
      zeile("Bebaute Fläche", `${zahl(p.fHaupt)} m²`) +
      zeile("GRZ Bestand", `<strong>${zahl(grz, 2)}</strong>`) +
      (p.fNeben ? zeile("GRZ inkl. Nebengebäude", zahl((p.fHaupt + p.fNeben) / A, 2)) : "") +
      zeile("Geschossfläche", `${zahl(p.gf)} m²`) +
      zeile("GFZ Bestand", `<strong>${zahl(gfz, 2)}</strong>`) +
      (p.nHaupt ? zeile("Ø Geschosse", `${zahl(p.geschosseSumme / p.nHaupt, 1)}${p.ersatz ? ` (${zahl(p.ersatz)} geschätzt)` : ""}`) : "") +
      (z && z.gfz && p.nHaupt ? zeile("GFZ Bestand zu Richtwert-GFZ", `${zahl((gfz / z.gfz) * 100)} %`) : "") + `</dl>`;
    if (p.rand) html += `<p class="flst-hinweis flst-warn">Randflurstück: Es reicht über dein Rechteck hinaus. Gebäude außerhalb fehlen, die Werte sind unvollständig. Zieh das Rechteck größer, damit das Flurstück ganz drin liegt.</p>`;
    if (grz > 1) html += `<p class="flst-hinweis flst-warn">GRZ über 1 ist rechnerisch nicht möglich: Gebäude (OpenStreetMap) und Flurstück passen geometrisch nicht ganz zusammen. Gemeint ist: fast vollständig überbaut.</p>`;
    if (!p.nHaupt && !p.fNeben) html += `<p class="flst-hinweis">Auf diesem Flurstück liegt in den geladenen Daten kein Gebäude.</p>`;
  }
  // Miete (Schätzung aus dem Zensus-Raster, siehe mieten.js)
  if (mietVorhanden && !p.verkehr) {
    html += `<h4>Miete (grobe Schätzung)</h4>`;
    if (p.miete == null) {
      html += `<p class="flst-hinweis">Im Zensus-Raster gibt es für dieses Flurstück keinen Mietwert.</p>`;
    } else {
      const wohnNur = p.gfWohnen * WOHNFLAECHE_FAKTOR, wohnMax = (p.gfWohnen + p.gfUnbekannt) * WOHNFLAECHE_FAKTOR;
      const jahr = (wfl) => wfl * p.miete * 12;
      html += `<dl>${zeile("Miete im Raster", `<strong>${zahl(p.miete, 2)} €/m²</strong>`)}` +
        zeile("Wohnfläche (geschätzt)", wohnMax > wohnNur ? `${zahl(wohnNur)} bis ${zahl(wohnMax)} m²` : `${zahl(wohnNur)} m²`) +
        zeile("Jahresmiete (geschätzt)", wohnMax > wohnNur ? `${euro(jahr(wohnNur))} bis ${euro(jahr(wohnMax))}` : euro(jahr(wohnNur))) + `</dl>` +
        `<p class="flst-hinweis">Wohnfläche = ${zahl(WOHNFLAECHE_FAKTOR * 100)} % der Geschossfläche. Untere Zahl: nur Gebäude, die laut LoD2 oder OSM Wohngebäude sind. ` +
        `Obere Zahl: dazu Gebäude ohne Nutzungsangabe. Gewerbe zählt nicht.` +
        `${p.mieteAnteil < 0.5 ? " Das Raster hat für dieses Flurstück nur teilweise Werte." : ""} Bestandsmiete 2022, keine Angebotsmiete.</p>`;
    }
  }
  if (p.abweichend) html += `<p class="flst-hinweis">Für dieses Flurstück gilt ein abweichender Rechtszustand (laut Kataster).</p>`;

  html += `<p class="flst-klein">GFZ = Grundfläche × Geschosse (Näherung; die echte GFZ zählt Vollgeschosse nach Bebauungsplan). ` +
    `Festsetzungen des Bebauungsplans sind nicht enthalten, sie stehen im Geoportal der Stadt. ` +
    `Selbst nachsehen: <a href="https://grundsteuer-viewer.niedersachsen.de" target="_blank" rel="noopener">Grundsteuer-Viewer</a> · ` +
    `<a href="https://www.boris.niedersachsen.de" target="_blank" rel="noopener">BORIS.NI</a>. Kein Gutachten.</p>`;
  flstInfoFeld.innerHTML = html;
}

// ---------- 6. Legende (wird von legende.js benutzt) ----------
function flstLegendeEintraege() {
  const f = FARBE.flst;
  const s = flstSumme;
  const verlauf3 = (c) => `<span class="sw sw-verlauf" style="background:linear-gradient(90deg, ${c[0]}, ${c[1]}, ${c[2]})"></span>`;
  const e = [];
  if (flstModus === "brw") e.push(`<li>${verlauf3(f.brw)}<span>${s && s.mitZone ? `${zahl(s.brwVon)} bis ${zahl(s.brwBis)} €/m²` : "Bodenrichtwert"}</span></li>`);
  if (flstModus === "grz") e.push(`<li>${verlauf3(f.grz)}<span>GRZ Bestand: 0 bis 1 (darüber: Datenungenauigkeit)</span></li>`);
  if (flstModus === "gfz") e.push(`<li>${verlauf3(f.gfz)}<span>GFZ Bestand: 0 bis 4 und mehr</span></li>`);
  e.push(`<li><span class="sw" style="background:${f.keine}"></span><span>${flstModus === "brw" ? "Verkehrsfläche oder keine Zone" : "keine Angabe (Verkehr, Rand, keine Gebäude)"}</span></li>`);
  e.push(`<li><span class="sw" style="background:${f.gebaeude}"></span><span>Gebäude (OSM)</span></li>`);
  e.push(`<li><span class="sw sw-linie" style="background:${f.auswahl};height:3px"></span><span>gewähltes Flurstück</span></li>`);
  return e.join("");
}

function flstEckdaten() {
  const s = flstSumme;
  if (!flurstueckeVorhanden || !s) return [];
  const z = [["Flurstücke", `${zahl(s.anzahl)} (davon ${zahl(s.verkehr)} Verkehr)`]];
  if (s.mitZone) z.push(["Bodenrichtwert", `${euro(s.brwMin)} bis ${euro(s.brwMax)}/m²`], ["Ø Richtwert", `${euro(s.brwSumme / s.flaecheBrw)}/m²`]);
  if (s.hatGebaeude && s.flaecheNetto) z.push(["GRZ netto (Bestand)", zahl(s.fHaupt / s.flaecheNetto, 2)], ["GFZ netto (Bestand)", zahl(s.gf / s.flaecheNetto, 2)]);
  return z;
}

// ---------- 7. Ergebnis übernehmen und aufräumen ----------
function wendeFlurstueckeAn(ergebnis) {
  if (ergebnis.abgebrochen) return;
  if (ergebnis.fehler) {
    zeigeFlstStatus(`Flurstücke konnten nicht geladen werden (${ergebnis.fehler}). ` +
      (flurstueckeVorhanden ? "Der Reiter zeigt weiter die Flurstücke vom letzten Mal." : "Der Reiter „Flurstücke“ bleibt leer."));
    ladeSetze("flst", "fehler", 1, "nicht geladen");
    aktualisiereFlurstuecke();
    return;
  }
  if (ergebnis.keine) {
    zeigeFlstStatus("Flurstücke: Für dieses Gebiet gibt es keine Daten (nur Niedersachsen).");
    ladeSetze("flst", "keine", 1, "keine Daten (nur Niedersachsen)");
    aktualisiereFlurstuecke();
    return;
  }
  richtwertZonen = ergebnis.zonen;
  flurstuecke = ergebnis.flurstuecke.map((r, i) => baueFlurstueck(r, i));
  flstAuswahl = null;
  flstStand = "";
  flstKarteStand = "";
  const t0 = performance.now();
  ordneZonenZu();
  console.info(`Flurstücke: Zonen zugeordnet in ${Math.round(performance.now() - t0)} ms`);
  flurstueckeVorhanden = true;
  const jahrBrw = richtwertZonen.length ? (richtwertZonen[0].stichtag || "").slice(0, 4) : "";
  flurstueckeQuelle = `Flurstücke: © GeoBasis-DE/LGLN ${ergebnis.jahr}, Daten geändert` + (jahrBrw ? ` · Bodenrichtwerte: LGLN, Stichtag ${datumDe(richtwertZonen[0].stichtag)}` : "");
  ladeSetze("flst", ergebnis.zonenFehler ? "fehler" : "fertig", 1,
    `${zahl(flurstuecke.length)} Flurstücke, ${zahl(richtwertZonen.length)} Zonen` + (ergebnis.zonenFehler ? " (Richtwerte fehlen)" : ""));
  zeigeFlstStatus(`Flurstücke geladen: ${zahl(flurstuecke.length)} Flurstücke, ${zahl(richtwertZonen.length)} Bodenrichtwertzonen` +
    (ergebnis.abgeschnitten ? " (Achtung: Obergrenze erreicht, nicht alle Flurstücke geladen)" : "") +
    (ergebnis.zonenFehler ? `. Die Bodenrichtwerte konnten nicht geladen werden (${ergebnis.zonenFehler}).` : ". Der Bestand (GRZ, GFZ) wird aus den OpenStreetMap-Gebäuden gerechnet.") +
    ` Quelle: ${flurstueckeQuelle}.`);
  wendeAnsichtAn();
}

function verwerfeFlurstuecke() {
  flurstuecke = [];
  richtwertZonen = [];
  flurstueckeVorhanden = false;
  flurstueckeQuelle = "";
  flstAuswahl = null;
  flstStand = "";
  flstKarteStand = "";
  flstSumme = null;
  zeigeFlstStatus("");
  if (typeof kartenBereit !== "undefined" && kartenBereit) {
    map.getSource("flurstuecke").setData(leer);
    map.setFilter("flst-auswahl", ["==", ["get", "id"], -1]);
  }
  flstInfoFeld.hidden = true;
  flstModusFeld.hidden = true;
}

// ---------- 8. Bedienung ----------
function waehleFlurstueck(id) {
  flstAuswahl = id;
  if (kartenBereit) map.setFilter("flst-auswahl", ["==", ["get", "id"], id == null ? -1 : id]);
  zeichneFlstInfo();
}

map.on("click", (e) => {
  if (aktuelleAnsicht !== "flurstuecke" || !flurstueckeVorhanden || !kartenBereit) return;
  // Nur innerhalb des Rechtecks (außerhalb ist die Karte weiß abgedeckt)
  if (!turf.booleanPointInPolygon([e.lngLat.lng, e.lngLat.lat], gebiet)) return;
  const treffer = map.queryRenderedFeatures(e.point, { layers: ["flst-flaeche"] });
  waehleFlurstueck(treffer.length ? treffer[0].properties.id : null);
});

map.on("mousemove", (e) => {
  if (aktuelleAnsicht !== "flurstuecke" || !kartenBereit || zeichnen) return;
  map.getCanvas().style.cursor = map.queryRenderedFeatures(e.point, { layers: ["flst-flaeche"] }).length ? "pointer" : "";
});

flstInfoFeld.addEventListener("click", (e) => { if (e.target.closest(".flst-zu")) waehleFlurstueck(null); });

flstModusFeld.addEventListener("click", (e) => {
  const knopf = e.target.closest("button[data-modus]");
  if (!knopf) return;
  flstModus = knopf.dataset.modus;
  flstModusFeld.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b === knopf));
  if (kartenBereit && flurstueckeVorhanden) map.setPaintProperty("flst-flaeche", "fill-color", flstFarbausdruck());
  if (typeof aktualisiereLegende === "function") aktualisiereLegende();
});
