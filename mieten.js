/* ============================================================
   Ortsanalyse – Mietpreise (Zensus 2022, 100-m-Raster)

   Der Zensus 2022 (Volkszählung der Statistischen Ämter) hat für jede Rasterzelle von 100 × 100 m die durchschnittliche
   Nettokaltmiete je m² ermittelt, dazu Einwohner, Wohnungsgröße, Eigentümer- und Leerstandsquote. Die Daten stehen unter
   der Lizenz "Datenlizenz Deutschland – Namensnennung 2.0". Wir fragen sie über einen offenen Kartendienst von Esri
   Deutschland ab (eine Kopie der amtlichen Zensusdaten, kein amtlicher Dienst).

   Was bei den Zahlen zu beachten ist (steht auch im Infofeld):
     - Es sind Bestandsmieten (alle bestehenden Mietverhältnisse, Stichtag 15.05.2022), keine Angebotsmieten.
       Sie liegen meist unter den Mieten bei Neuvermietung und können vom Mietspiegel abweichen.
     - Das Raster ist grob (1 Hektar). Zellen mit sehr wenigen Wohnungen haben keinen Wert.
     - Es gibt keine Mieten je Flurstück. Im Reiter "Flurstücke" wird die Miete des Rasters auf das Flurstück übertragen
       (flächengewichtet) und daraus eine grobe Jahresmiete geschätzt (siehe mieteFuerFlurstueck).
   ============================================================ */

"use strict";

const MIET_DIENST = "https://services2.arcgis.com/jUpNdisbWqRpMo35/arcgis/rest/services/Zensus2022_grid_final/FeatureServer/0/query";
const MIET_FELDER = "GITTER_ID_100m,Einwohner,durchschnMieteQM,durchschnFlaechejeWohn,Eigentuemerquote,Leerstandsquote,Durchschnittsalter," +
  "Vor1919,a1919bis1948,a1949bis1978,a1979bis1990,a1991bis2000,a2001bis2010,a2011bis2019,a2020undspaeter";
// Gebäude nach Baujahr im Raster (Zensus): Feldname und Klassenmitte (für das Baujahr eines Flurstücks)
const BJ_KLASSEN = [["Vor1919", 1900], ["a1919bis1948", 1934], ["a1949bis1978", 1964], ["a1979bis1990", 1985],
  ["a1991bis2000", 1996], ["a2001bis2010", 2006], ["a2011bis2019", 2015], ["a2020undspaeter", 2022]];
const WOHNFLAECHE_FAKTOR = 0.75;       // Annahme: Wohnfläche = 75 % der Geschossfläche (Wände, Treppenhäuser)
const mietStatusFeld = document.getElementById("miet-status");
const mietInfoFeld = document.getElementById("miet-info");

let mietZellen = [];                   // { id, f, bbox, miete, einw, wfl, eig, leer, alter }
let mietVorhanden = false;
let mietQuelle = "";
let mietAuswahl = null;
let mietSumme = null;

function zeigeMietStatus(text) {
  mietStatusFeld.textContent = text;
  mietStatusFeld.hidden = !text;
}

// ---------- 1. Laden ----------
// Liefert { zellen, abgeschnitten } oder { fehler } oder { keine } oder { abgebrochen }. Wirft nie.
async function starteMieten(rahmen, nummer) {
  try {
    zeigeMietStatus("Mietdaten (Zensus 2022) werden geladen …");
    ladeSetze("mieten", "laedt", null, "wird abgefragt …");
    ladeUnter("mieten", "raster", "Zensus-Raster 100 m", "laedt", null, "");
    const [west, sued, ost, nord] = turf.bbox(rahmen);
    const abfrage = new URLSearchParams({
      where: "1=1", geometry: `${west},${sued},${ost},${nord}`, geometryType: "esriGeometryEnvelope", inSR: "4326",
      spatialRel: "esriSpatialRelIntersects", outFields: MIET_FELDER, outSR: "4326", f: "geojson", resultRecordCount: "2000"
    });
    let daten;
    try {
      const antwort = await fetch(`${MIET_DIENST}?${abfrage}`);
      if (!antwort.ok) throw new Error(`Der Dienst meldet Fehler ${antwort.status}`);
      daten = await antwort.json();
      if (daten.error) throw new Error(`Der Dienst meldet: ${String(daten.error.message || daten.error.code).slice(0, 100)}`);
    } catch (fehler) {
      ladeUnter("mieten", "raster", "Zensus-Raster 100 m", "fehler", 1, "Fehler");
      throw fehler;
    }
    if (nummer !== ladeNummer) return { abgebrochen: true };
    const zellen = [];
    for (const f of daten.features || []) {
      if (!f.geometry || !["Polygon", "MultiPolygon"].includes(f.geometry.type)) continue;
      const p = f.properties || {};
      const feature = { type: "Feature", properties: {}, geometry: f.geometry };
      zellen.push({
        id: zellen.length, f: feature, bbox: turf.bbox(feature), gitter: p.GITTER_ID_100m || "",
        miete: Number.isFinite(p.durchschnMieteQM) ? p.durchschnMieteQM : null,
        einw: Number.isFinite(p.Einwohner) ? p.Einwohner : null,
        wfl: Number.isFinite(p.durchschnFlaechejeWohn) ? p.durchschnFlaechejeWohn : null,
        eig: Number.isFinite(p.Eigentuemerquote) ? p.Eigentuemerquote : null,
        leer: Number.isFinite(p.Leerstandsquote) ? p.Leerstandsquote : null,
        alter: Number.isFinite(p.Durchschnittsalter) ? p.Durchschnittsalter : null,
        bj: BJ_KLASSEN.map(([feld]) => (Number.isFinite(p[feld]) ? p[feld] : 0))   // Anzahl Gebäude je Baujahrklasse
      });
    }
    const mitMiete = zellen.filter((z) => z.miete != null).length;
    ladeUnter("mieten", "raster", "Zensus-Raster 100 m", "fertig", 1, `${zahl(zellen.length)} Zellen, ${zahl(mitMiete)} mit Miete`);
    if (!mitMiete) return { keine: true };
    return { zellen, abgeschnitten: !!daten.exceededTransferLimit };
  } catch (fehler) {
    return { fehler: fehler.message };
  }
}

function wendeMietenAn(ergebnis) {
  if (ergebnis.abgebrochen) return;
  if (ergebnis.fehler) {
    zeigeMietStatus(`Mietdaten konnten nicht geladen werden (${ergebnis.fehler}). Der Reiter „Mietpreise“ bleibt leer.`);
    ladeSetze("mieten", "fehler", 1, "nicht geladen");
    aktualisiereMieten();
    return;
  }
  if (ergebnis.keine) {
    zeigeMietStatus("Mietdaten: Für dieses Gebiet gibt es im Zensus-Raster keine Mietwerte (zu wenige Mietwohnungen oder außerhalb Deutschlands).");
    ladeSetze("mieten", "keine", 1, "keine Mietwerte im Gebiet");
    aktualisiereMieten();
    return;
  }
  mietZellen = ergebnis.zellen;
  mietAuswahl = null;
  mietVorhanden = true;
  mietQuelle = "Mieten: © Statistische Ämter des Bundes und der Länder, Zensus 2022 (dl-de/by-2-0), Daten geändert";
  berechneMietSumme();
  const s = mietSumme;
  ladeSetze("mieten", "fertig", 1, `${zahl(s.mitMiete)} Zellen, ${zahl(s.min, 2)} bis ${zahl(s.max, 2)} €/m²`);
  zeigeMietStatus(`Mietdaten geladen: ${zahl(mietZellen.length)} Rasterzellen, davon ${zahl(s.mitMiete)} mit Miete (${zahl(s.min, 2)} bis ${zahl(s.max, 2)} €/m², Ø ${zahl(s.mittel, 2)} €/m²). ` +
    `Das sind Bestandsmieten von 2022, keine Angebotsmieten. Quelle: ${mietQuelle}.`);
  setzeMietenAufKarte();
  wendeAnsichtAn();
}

function berechneMietSumme() {
  const mit = mietZellen.filter((z) => z.miete != null);
  const werte = mit.map((z) => z.miete).sort((a, b) => a - b);
  let gew = 0, summe = 0;
  for (const z of mit) { const g = z.einw || 1; gew += g; summe += g * z.miete; }
  mietSumme = {
    zellen: mietZellen.length, mitMiete: mit.length,
    min: werte[0], max: werte[werte.length - 1], mittel: summe / gew,        // Ø nach Einwohnern gewichtet
    von: werte[Math.floor(werte.length * 0.05)], bis: werte[Math.min(werte.length - 1, Math.floor(werte.length * 0.95))],
    einwohner: mietZellen.reduce((s, z) => s + (z.einw || 0), 0)
  };
}

// ---------- 2. Karte ----------
function mietFarbausdruck() {
  const f = FARBE.miet;
  const s = mietSumme || { von: 0, bis: 1 };
  const von = s.von, bis = Math.max(s.bis, s.von + 0.1), mitte = (von + bis) / 2;
  return ["case", ["<", ["number", ["get", "miete"], -1], 0], f.keine,
    ["interpolate", ["linear"], ["number", ["get", "miete"], 0], von, f.rampe[0], mitte, f.rampe[1], bis, f.rampe[2]]];
}

function setzeMietenAufKarte() {
  if (!kartenBereit) return;
  map.getSource("mieten").setData({ type: "FeatureCollection", features: mietZellen.map((z) => (
    { type: "Feature", geometry: z.f.geometry, properties: { id: z.id, miete: z.miete } })) });
  map.setPaintProperty("miet-flaeche", "fill-color", mietFarbausdruck());
  map.setFilter("miet-auswahl", ["==", ["get", "id"], mietAuswahl == null ? -1 : mietAuswahl]);
}

function aktualisiereMieten() {
  const aktiv = aktuelleAnsicht === "mieten" && datenVorhanden;
  mietInfoFeld.hidden = !aktiv;
  if (aktiv) zeichneMietInfo();
}

// ---------- 3. Infofeld ----------
function zeichneMietInfo() {
  if (mietInfoFeld.hidden) return;
  if (!mietVorhanden) {
    const z = typeof ladeZustand !== "undefined" && ladeZustand.mieten ? ladeZustand.mieten.z : "";
    mietInfoFeld.innerHTML = `<p class="flst-leer">${z === "laedt" ? "Mietdaten werden geladen …"
      : z === "keine" ? "Für dieses Gebiet gibt es keine Mietwerte im Zensus-Raster."
      : z === "fehler" ? "Mietdaten konnten nicht geladen werden. Bitte „Analysieren“ nochmal drücken."
      : "Noch keine Mietdaten geladen."}</p>`;
    return;
  }
  const z = mietZellen.find((x) => x.id === mietAuswahl);
  if (!z) {
    mietInfoFeld.innerHTML = `<p class="flst-leer">Klicke auf eine Rasterzelle (100 × 100 m), um Miete, Wohnungsgröße und mehr zu sehen. ` +
      `Zensus 2022, Bestandsmieten. Für Mieten je Flurstück: Reiter „Flurstücke“.</p>`;
    return;
  }
  const s = mietSumme;
  let html = `<button type="button" class="flst-zu" aria-label="Schließen">×</button><h3>Rasterzelle 100 × 100 m</h3>` +
    `<p class="flst-sub">Zensus 2022 · Stichtag 15.05.2022</p>`;
  html += `<h4>Nettokaltmiete</h4>`;
  if (z.miete == null) {
    html += `<p class="flst-hinweis">Für diese Zelle gibt es keinen Mietwert (vermutlich zu wenige Mietwohnungen; der Zensus gibt dann aus Datenschutzgründen nichts an).</p>`;
  } else {
    const diff = (z.miete / s.mittel - 1) * 100;
    html += `<dl>${zeile("Miete (Bestand)", `<strong>${zahl(z.miete, 2)} €/m²</strong>`)}` +
      zeile("zum Gebietsdurchschnitt", `${diff >= 0 ? "+" : "−"}${zahl(Math.abs(diff), 0)} % (Ø ${zahl(s.mittel, 2)} €/m²)`) +
      (z.wfl != null ? zeile("Ø Wohnungsgröße", `${zahl(z.wfl, 0)} m²`) + zeile("Monatsmiete Ø-Wohnung", `ca. ${euro(z.miete * z.wfl)}`) : "") + `</dl>`;
  }
  html += `<h4>Wohnen in der Zelle</h4><dl>` +
    (z.einw != null ? zeile("Einwohner", zahl(z.einw)) : "") +
    (z.eig != null ? zeile("Eigentümerquote", `${zahl(z.eig)} %`) : "") +
    (z.leer != null ? zeile("Leerstandsquote", `${zahl(z.leer)} %`) : "") +
    (z.alter != null ? zeile("Ø Alter", `${zahl(z.alter, 1)} Jahre`) : "") + `</dl>`;
  html += `<p class="flst-klein">Bestandsmieten: alle bestehenden Mietverhältnisse im Mai 2022, keine Angebotsmieten. Sie liegen meist unter den Mieten bei Neuvermietung ` +
    `und können vom <a href="https://serviceportal.oldenburg.de/buergerservice/dienstleistungen/mietspiegel-900001660-36200.html" target="_blank" rel="noopener">Mietspiegel</a> der Stadt Oldenburg abweichen. ` +
    `Das Raster ist grob (1 Hektar). Quelle: ${htmlSicher(mietQuelle.replace(/^Mieten: /, ""))}.</p>`;
  mietInfoFeld.innerHTML = html;
}

// ---------- 4. Legende (wird von legende.js benutzt) ----------
function mietLegendeEintraege() {
  const f = FARBE.miet, s = mietSumme;
  const e = [];
  e.push(`<li><span class="sw sw-verlauf" style="background:linear-gradient(90deg, ${f.rampe.join(",")})"></span><span>${s ? `${zahl(s.von, 2)} bis ${zahl(s.bis, 2)} €/m²` : "Nettokaltmiete"}</span></li>`);
  e.push(`<li><span class="sw" style="background:${f.keine}"></span><span>kein Mietwert</span></li>`);
  e.push(`<li><span class="sw" style="background:${FARBE.flst.gebaeude};opacity:0.5"></span><span>Gebäude (OSM)</span></li>`);
  e.push(`<li><span class="sw sw-linie" style="background:${f.auswahl};height:3px"></span><span>gewählte Zelle</span></li>`);
  return e.join("");
}

function mietEckdaten() {
  const s = mietSumme;
  if (!mietVorhanden || !s) return [];
  return [["Rasterzellen", `${zahl(s.zellen)} (${zahl(s.mitMiete)} mit Miete)`],
    ["Miete (Bestand)", `${zahl(s.min, 2)} bis ${zahl(s.max, 2)} €/m²`],
    ["Ø Miete", `${zahl(s.mittel, 2)} €/m² (nach Einwohnern)`],
    ["Einwohner im Raster", zahl(s.einwohner)]];
}

// ---------- 5. Miete je Flurstück (wird von flurstuecke.js aufgerufen) ----------
// Die Miete des Rasters wird flächengewichtet auf das Flurstück übertragen (nur Zellen mit Mietwert).
// Dazu aus denselben Zellen: Ø Wohnungsgröße (flächengewichtet) und das Baujahr (mittlere Baujahrklasse aller Gebäude in den
// überlappten Zellen, gewichtet mit der Überlappung). Beides sind Raster-Werte, keine Werte des einzelnen Hauses.
function mieteFuerFlurstueck(p) {
  p.miete = null; p.mieteAnteil = 0; p.wflWohnung = null; p.baujahr = null;
  if (!mietVorhanden) return;
  let summe = 0, gewicht = 0, wflSumme = 0, wflGewicht = 0;
  const klassen = BJ_KLASSEN.map(() => 0);
  for (const z of mietZellen) {
    if (!bboxUeberlappt(z.bbox, p.bbox)) continue;
    const a = flaecheSchnitt(p.f, z.f);
    if (a <= 0.05) continue;
    if (z.miete != null) { summe += a * z.miete; gewicht += a; }
    if (z.wfl != null) { wflSumme += a * z.wfl; wflGewicht += a; }
    z.bj.forEach((n, i) => { klassen[i] += a * n; });
  }
  if (gewicht > 0) { p.miete = summe / gewicht; p.mieteAnteil = Math.min(1, gewicht / p.geomFlaeche); }
  if (wflGewicht > 0) p.wflWohnung = wflSumme / wflGewicht;
  const gesamt = klassen.reduce((s, x) => s + x, 0);
  if (gesamt > 0) {                                   // Median-Klasse
    let lauf = 0;
    for (let i = 0; i < klassen.length; i++) { lauf += klassen[i]; if (lauf >= gesamt / 2) { p.baujahr = BJ_KLASSEN[i][1]; break; } }
  }
}

// ---------- 6. Aufräumen und Bedienung ----------
function verwerfeMieten() {
  mietZellen = [];
  mietVorhanden = false;
  mietQuelle = "";
  mietAuswahl = null;
  mietSumme = null;
  zeigeMietStatus("");
  if (typeof kartenBereit !== "undefined" && kartenBereit) {
    map.getSource("mieten").setData(leer);
    map.setFilter("miet-auswahl", ["==", ["get", "id"], -1]);
  }
  mietInfoFeld.hidden = true;
}

function waehleMietzelle(id) {
  mietAuswahl = id;
  if (kartenBereit) map.setFilter("miet-auswahl", ["==", ["get", "id"], id == null ? -1 : id]);
  zeichneMietInfo();
}

map.on("click", (e) => {
  if (aktuelleAnsicht !== "mieten" || !mietVorhanden || !kartenBereit) return;
  if (!turf.booleanPointInPolygon([e.lngLat.lng, e.lngLat.lat], gebiet)) return;
  const treffer = map.queryRenderedFeatures(e.point, { layers: ["miet-flaeche"] });
  waehleMietzelle(treffer.length ? treffer[0].properties.id : null);
});

map.on("mousemove", (e) => {
  if (aktuelleAnsicht !== "mieten" || !kartenBereit || zeichnen) return;
  map.getCanvas().style.cursor = map.queryRenderedFeatures(e.point, { layers: ["miet-flaeche"] }).length ? "pointer" : "";
});

mietInfoFeld.addEventListener("click", (e) => { if (e.target.closest(".flst-zu")) waehleMietzelle(null); });
