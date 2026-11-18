/* ============================================================
   SiteKick – Sonne und Schatten (Reiter "Sonne & Schatten")

   Zwei Darstellungen auf der Karte, dazu Schatten im 3D-Modell (ansicht3d.js, gleiche Einstellung für Datum und Uhrzeit):

     SCHATTEN:        Schattenplan für ein Datum und eine Uhrzeit (Regler). Dunkel = kein direktes Sonnenlicht.
     BESONNUNGSDAUER: Wie viele Stunden direktes Sonnenlicht jeder Punkt am gewählten Tag bekommt (Karte mit Farbskala).

   So wird gerechnet:
     1. Aus den Gebäuden (LoD2-Dachflächen, sonst OSM-Blöcke mit geschätzter Höhe), den Bäumen und dem Gelände (DGM1) entsteht ein
        Höhenraster (Oberfläche, "DSM") mit wählbarer Zellgröße: Schatten 0,5 m, Besonnungsdauer 1 m, Regler ziehen 2 m (damit es flüssig bleibt). Bäume sind eine Krone mit Unterkante (unter der Krone kann Licht durch).
     2. Der Sonnenstand (Höhe und Himmelsrichtung) kommt aus der astronomischen Formel für Ort, Datum und Uhrzeit (Genauigkeit etwa 0,1 Grad).
        Uhrzeit = mitteleuropäische Zeit (MEZ) im Winter, Sommerzeit (MESZ) im Sommer.
     3. Für jede Zelle am Boden läuft ein Strahl zur Sonne. Trifft er auf ein Gebäude, einen Baum oder Gelände, liegt die Zelle im Schatten.
        Besonnungsdauer: das alle 15 Minuten, solange die Sonne mehr als 1 Grad über dem Horizont steht.

   Wichtig und ehrlich:
     - Nur Gebäude und Bäume im gewählten Rechteck werfen Schatten. Am Rand fehlen Schatten von außen, der Rand ist daher zu sonnig.
     - Baumhöhen sind meist geschätzt, Bäume zählen im Winter wie im Sommer als undurchsichtig (zu viel Schatten bei Laubbäumen im Winter).
       Mit dem Schalter "Bäume mitrechnen" lassen sie sich weglassen.
     - Dachüberstände, Balkone, Vordächer, Zäune und Mauern fehlen. Das Raster hat 0,5 bis 2 m Zellen, sehr schmale Gebäude (unter einer Zelle) können fehlen.
     - Besonnungsdauer gilt für den Boden (0,05 m über Gelände). Sie ist keine Besonnungsnachweis nach Norm und ersetzt kein Gutachten.
     - Wolken und Dunst bleiben unberücksichtigt: Es ist die mögliche Sonnenscheindauer bei klarem Himmel.
   ============================================================ */

"use strict";

const SONNE_ZELLE_GROB = 2;        // Rasterweite (m) beim Ziehen des Reglers, damit es flüssig bleibt
const SONNE_MAX_STRAHL_M = 500;    // länger wird ein Schattenstrahl nicht verfolgt (bei sehr tiefer Sonne)
const SONNE_SCHRITT_MIN = 15;      // Zeitabstand bei der Besonnungsdauer
const SONNE_MIN_HOEHE = 1;         // Grad: darunter zählt die Sonne als untergegangen
const SONNE_FARBE_SCHATTEN = [24, 44, 96];

const sonnePanel = document.getElementById("sonne-panel");
const sonneEl = {
  modus: document.getElementById("sonne-modus"), datum: document.getElementById("sonne-datum"), schnell: document.getElementById("sonne-schnell"),
  zeitFeld: document.getElementById("sonne-zeit-feld"), zeit: document.getElementById("sonne-zeit"), zeitWert: document.getElementById("sonne-zeit-wert"),
  baeume: document.getElementById("sonne-baeume"), info: document.getElementById("sonne-info"), hinweis: document.getElementById("sonne-hinweis"),
  skala: document.getElementById("sonne-skala"), punkt: document.getElementById("sonne-punkt"),
  genau: document.getElementById("sonne-genau"), genauHinweis: document.getElementById("sonne-genau-hinweis")
};

// Einstellung, auch vom 3D-Modell genutzt
const sonneZustand = { datum: `${new Date().getFullYear()}-06-21`, minuten: 13 * 60, modus: "schatten", baeume: true, zelle: { schatten: 0.5, dauer: 1 } };   // zelle = Rasterweite in m je Darstellung
let sonneDsm = { stand: "", r: {} };                       // Höhenraster je Rasterweite: r["0.5"] = { ohne, mit }, gerechnet pro Datenstand
let sonneErgebnis = null;                                  // { art: "schatten"|"dauer", werte, dsm, ... } für Karte und Klick
let sonneRechenNummer = 0;                                 // zum Abbrechen veralteter Rechnungen
let sonneBildStand = "";
let sonneLetztesBild = null;                               // { leinwand, x0, y1, nx, ny, c } für den Export (export.js)

// ---------- 1. Sonnenstand ----------
const GRAD = Math.PI / 180;

// Unterschied Ortszeit minus Weltzeit in Minuten für Deutschland (Sommerzeit von letztem Sonntag im März bis letztem Sonntag im Oktober)
function sonneZeitzone(jahr, monat, tag) {
  const letzterSonntag = (m) => { const d = new Date(Date.UTC(jahr, m, 31)); d.setUTCDate(31 - d.getUTCDay()); return d.getUTCDate(); };
  const m0 = monat - 1;
  const sommer = (m0 > 2 && m0 < 9) || (m0 === 2 && tag >= letzterSonntag(2)) || (m0 === 9 && tag < letzterSonntag(9));
  return sommer ? 120 : 60;
}

// Sonnenhöhe und -richtung (Grad, Richtung von Nord im Uhrzeigersinn) für Weltzeit in ms, geografische Breite und Länge
function sonnenstandUtc(utcMs, breite, laenge) {
  const tage = utcMs / 86400000 - 10957.5;                              // Tage seit J2000.0
  const L = (280.460 + 0.9856474 * tage) % 360;
  const g = ((357.528 + 0.9856003 * tage) % 360) * GRAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * GRAD;
  const eps = (23.439 - 0.0000004 * tage) * GRAD;
  const alpha = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const delta = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (280.46061837 + 360.98564736629 * tage) % 360;
  const H = (gmst + laenge) * GRAD - alpha;                             // Stundenwinkel
  const phi = breite * GRAD;
  const hoehe = Math.asin(Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(H));
  const azimut = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(delta) * Math.cos(phi)) + Math.PI;
  return { hoehe: hoehe / GRAD, azimut: (((azimut / GRAD) % 360) + 360) % 360 };
}

// datum "JJJJ-MM-TT", minuten = Ortszeit in Minuten seit Mitternacht
function sonnenstand(datum, minuten, breite, laenge) {
  const [j, m, t] = datum.split("-").map(Number);
  const versatz = sonneZeitzone(j, m, t);
  return { ...sonnenstandUtc(Date.UTC(j, m - 1, t, 0, 0) + (minuten - versatz) * 60000, breite, laenge), mez: versatz === 120 ? "MESZ" : "MEZ" };
}

function sonneMitte() {
  const [lon, lat] = turf.center(gebiet).geometry.coordinates;
  return { breite: lat, laenge: lon };
}

// Aktueller Sonnenstand für das Gebiet (auch aus ansicht3d.js aufgerufen)
function sonnenstandFuerGebiet() {
  const { breite, laenge } = sonneMitte();
  return sonnenstand(sonneZustand.datum, sonneZustand.minuten, breite, laenge);
}

const himmelsrichtung = (grad) => ["N", "NO", "O", "SO", "S", "SW", "W", "NW"][Math.round(grad / 45) % 8];
const uhrzeit = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

// ---------- 2. Höhenraster ----------
function sonneRahmenUtm() {
  const ecken = gebiet.geometry.coordinates[0].slice(0, 4).map((p) => utmWandler.forward(p));
  const xs = ecken.map((e) => e[0]), ys = ecken.map((e) => e[1]);
  return { ecken, xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: Math.min(...ys), ymax: Math.max(...ys) };
}

function punktImVieleck(x, y, ring) {
  let innen = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) innen = !innen;
  }
  return innen;
}

// Zeichnet eine geneigte Dachfläche (Ring aus [x, y, z]) in das Raster (höchster Wert gewinnt)
function sonneDach(dsm, ring) {
  const n = ring.length;
  if (n < 3) return;
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const laenge = Math.hypot(nx, ny, nz);
  if (!laenge || Math.abs(nz) < 0.02 * laenge) return;               // fast senkrecht: wird vom Grundriss anderer Flächen abgedeckt
  const { x0, y1, c, nx: breite, ny: hoehe } = dsm;
  let ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity;
  for (const p of ring) { ax = Math.min(ax, p[0]); bx = Math.max(bx, p[0]); ay = Math.min(ay, p[1]); by = Math.max(by, p[1]); }
  const c0 = Math.max(0, Math.floor((ax - x0) / c)), c1 = Math.min(breite - 1, Math.floor((bx - x0) / c));
  const r0 = Math.max(0, Math.floor((y1 - by) / c)), r1 = Math.min(hoehe - 1, Math.floor((y1 - ay) / c));
  const p0 = ring[0];
  for (let r = r0; r <= r1; r++) {
    const y = y1 - (r + 0.5) * c;
    for (let col = c0; col <= c1; col++) {
      const x = x0 + (col + 0.5) * c;
      if (!punktImVieleck(x, y, ring)) continue;
      const z = p0[2] - (nx * (x - p0[0]) + ny * (y - p0[1])) / nz;
      const i = r * breite + col;
      if (dsm.typ[i] !== 1 || z > dsm.top[i]) { dsm.top[i] = z; }
      dsm.typ[i] = 1;
      dsm.unten[i] = -1e9;
    }
  }
}

// Baumkrone: Ellipsoid (Laubbaum) oder Kegel (Nadelbaum) mit Unterkante
function sonneBaum(dsm, f) {
  const p = f.properties;
  const [e, n] = utmWandler.forward(f.geometry.coordinates);
  const kd = p.d || 6, r = kd / 2;
  const hOsm = p.hoehe >= 3 && p.hoehe <= 45;
  const H = hOsm ? p.hoehe : Math.min(35, Math.max(5, kd * 2));
  const kh = H * (p.nadel ? 0.8 : 0.6);
  const { x0, y1, c, nx: breite, ny: hoehe } = dsm;
  const col0 = Math.max(0, Math.floor((e - r - x0) / c)), col1 = Math.min(breite - 1, Math.floor((e + r - x0) / c));
  const r0 = Math.max(0, Math.floor((y1 - (n + r)) / c)), r1 = Math.min(hoehe - 1, Math.floor((y1 - (n - r)) / c));
  if (col1 < col0 || r1 < r0) return;
  const mi = Math.min(breite - 1, Math.max(0, Math.floor((e - x0) / c))), mr = Math.min(hoehe - 1, Math.max(0, Math.floor((y1 - n) / c)));
  const z0 = dsm.grund[mr * breite + mi];
  const zKopf = z0 + H, zFuss = z0 + H - kh;
  for (let rr = r0; rr <= r1; rr++) {
    const y = y1 - (rr + 0.5) * c;
    for (let col = col0; col <= col1; col++) {
      const x = x0 + (col + 0.5) * c;
      const d = Math.hypot(x - e, y - n);
      if (d > r) continue;
      const i = rr * breite + col;
      if (dsm.typ[i] === 1) continue;
      let oben, unten;
      if (p.nadel) { oben = zKopf - (zKopf - zFuss) * (d / r); unten = zFuss; }
      else { const w = Math.sqrt(1 - (d / r) * (d / r)); oben = zFuss + kh / 2 + (kh / 2) * w; unten = zFuss + kh / 2 - (kh / 2) * w; }
      if (dsm.typ[i] === 2) { dsm.top[i] = Math.max(dsm.top[i], oben); dsm.unten[i] = Math.min(dsm.unten[i], unten); }
      else { dsm.typ[i] = 2; dsm.top[i] = oben; dsm.unten[i] = unten; }
    }
  }
}

// Gebäude und Gelände: einmal pro Datenstand; Bäume werden bei Bedarf auf eine Kopie gelegt
function sonneDsmBauen(mitBaeumen, c) {
  const rahmen = sonneRahmenUtm();
  const stand = [turf.bbox(gebiet).join(","), lod2Gebaeude.length, osmFeatures.length, baumFeatures.length, gelaende ? gelaende.min : "flach"].join("|");
  if (sonneDsm.stand !== stand) sonneDsm = { stand, r: {} };
  const schluessel = String(c);
  if (!sonneDsm.r[schluessel]) {
    // Speicher sparen: neben dem groben Raster nur das zuletzt benutzte feine behalten
    for (const k of Object.keys(sonneDsm.r)) if (k !== String(SONNE_ZELLE_GROB)) delete sonneDsm.r[k];
    sonneDsm.r[schluessel] = { ohne: null, mit: null };
  }
  const ablage = sonneDsm.r[schluessel];
  const vorhanden = mitBaeumen ? ablage.mit : ablage.ohne;
  if (vorhanden) return vorhanden;

  let basis = ablage.ohne;
  if (!basis) {
    const nx = Math.ceil((rahmen.xmax - rahmen.xmin) / c), ny = Math.ceil((rahmen.ymax - rahmen.ymin) / c);
    const n = nx * ny;
    const b = lod2Gebaeude.map((g) => g.boden).filter((v) => v != null).sort((p, q) => p - q);
    const zFlach = b.length ? b[b.length >> 1] : 0;                       // ohne Höhenmodell: flacher Boden auf Höhe der LoD2-Gebäudefüße
    basis = { x0: rahmen.xmin, y1: rahmen.ymax, c, nx, ny, top: new Float32Array(n), unten: new Float32Array(n), grund: new Float32Array(n),
      typ: new Uint8Array(n), innen: new Uint8Array(n), zFlach, zMax: 0, rahmen };
    for (let r = 0; r < ny; r++) {
      const y = rahmen.ymax - (r + 0.5) * c;
      for (let col = 0; col < nx; col++) {
        const x = rahmen.xmin + (col + 0.5) * c, i = r * nx + col;
        const z = gelaende ? gelaendeHoehe(x, y) : zFlach;
        basis.grund[i] = z; basis.top[i] = z; basis.unten[i] = -1e9;
        basis.innen[i] = punktImVieleck(x, y, rahmen.ecken) ? 1 : 0;
      }
    }
    for (const g of schnittGebaeudeListe()) {
      const versatz = !gelaende && g.art === "ersatz" ? zFlach : 0;
      for (const dach of g.dach) sonneDach(basis, versatz ? dach.map((p) => [p[0], p[1], p[2] + versatz]) : dach);
    }
    let zMax = 0;
    for (let i = 0; i < n; i++) if (basis.top[i] > zMax) zMax = basis.top[i];
    basis.zMax = zMax;
    ablage.ohne = basis;
  }
  if (!mitBaeumen) return basis;

  const mit = { ...basis, top: Float32Array.from(basis.top), unten: Float32Array.from(basis.unten), typ: Uint8Array.from(basis.typ) };
  for (const f of baumFeatures) if (f.properties.form === "stamm") sonneBaum(mit, f);
  let zMax = 0;
  for (let i = 0; i < mit.top.length; i++) if (mit.top[i] > zMax) zMax = mit.top[i];
  mit.zMax = zMax;
  ablage.mit = mit;
  return mit;
}

// ---------- 3. Schattenstrahlen ----------
// ausgabe: 0 = Sonne, 1 = Schatten, 2 = Gebäude oder Baum (wird nicht bewertet)
function sonneSchatten(dsm, azimut, hoehe, ausgabe) {
  const { nx, ny, top, unten, grund, typ, zMax, c } = dsm;
  const az = azimut * GRAD, tanH = Math.tan(hoehe * GRAD);
  const pc = Math.sin(az) / c, pr = -Math.cos(az) / c;                   // Zellen je Meter Weg, Richtung zur Sonne
  const schritt0 = Math.max(c, 1);                                       // Schrittweite am Strahl: mindestens 1 m, auch bei feinem Raster
  for (let r = 0; r < ny; r++) {
    for (let col = 0; col < nx; col++) {
      const i = r * nx + col;
      if (typ[i] || !dsm.innen[i]) { ausgabe[i] = typ[i] ? 2 : 0; continue; }
      let z = grund[i] + 0.05, fc = col + 0.5, fr = r + 0.5, weg = 0, schatten = 0;
      while (weg < SONNE_MAX_STRAHL_M) {
        const s = weg > 120 ? schritt0 * 2 : schritt0;                  // weit weg genügt ein gröberer Schritt
        fc += pc * s; fr += pr * s; z += tanH * s; weg += s;
        if (z > zMax || fc < 0 || fr < 0 || fc >= nx || fr >= ny) break;
        const j = (fr | 0) * nx + (fc | 0);
        if (z < top[j] && z > unten[j]) { schatten = 1; break; }
      }
      ausgabe[i] = schatten;
    }
  }
}

// ---------- 4. Bild auf der Karte ----------
function sonneBildSetzen(dsm, farbeFuer) {
  const { nx, ny, c, x0, y1 } = dsm;
  const leinwand = document.createElement("canvas");
  leinwand.width = nx; leinwand.height = ny;
  const ctx = leinwand.getContext("2d");
  const bild = ctx.createImageData(nx, ny);
  for (let i = 0; i < nx * ny; i++) {
    const f = farbeFuer(i);
    if (!f) continue;
    bild.data[i * 4] = f[0]; bild.data[i * 4 + 1] = f[1]; bild.data[i * 4 + 2] = f[2]; bild.data[i * 4 + 3] = f[3];
  }
  ctx.putImageData(bild, 0, 0);
  const lonlat = (x, y) => utmWandler.inverse([x, y]);
  const coordinates = [lonlat(x0, y1), lonlat(x0 + nx * c, y1), lonlat(x0 + nx * c, y1 - ny * c), lonlat(x0, y1 - ny * c)];
  sonneLetztesBild = { leinwand, x0, y1, nx, ny, c };
  const url = leinwand.toDataURL("image/png");
  const quelle = map.getSource("sonne-bild");
  if (!quelle) {
    map.addSource("sonne-bild", { type: "image", url, coordinates });
    map.addLayer({ id: "sonne-bild", type: "raster", source: "sonne-bild", paint: { "raster-resampling": "linear", "raster-fade-duration": 0, "raster-opacity": 1 } }, "gebiet-flaeche");
  } else quelle.updateImage({ url, coordinates });
}

// Farbskala der Besonnungsdauer: Stunden -> Farbe
const SONNE_SKALA = [[0, [30, 40, 100]], [2, [60, 100, 170]], [4, [130, 190, 225]], [6, [245, 235, 160]], [8, [247, 200, 80]], [10, [240, 140, 40]], [14, [215, 80, 30]]];
function sonneDauerFarbe(stunden) {
  const s = SONNE_SKALA;
  if (stunden <= s[0][0]) return s[0][1];
  for (let i = 1; i < s.length; i++) {
    if (stunden <= s[i][0]) {
      const t = (stunden - s[i - 1][0]) / (s[i][0] - s[i - 1][0]);
      return s[i - 1][1].map((v, k) => Math.round(v + (s[i][1][k] - v) * t));
    }
  }
  return s[s.length - 1][1];
}
const sonneSkalaCss = () => `linear-gradient(90deg, ${SONNE_SKALA.map(([h, f]) => `rgb(${f.join(",")}) ${(h / 14) * 100}%`).join(", ")})`;

// ---------- 5. Rechnen und Zeigen ----------
const zahlDe = (v, n = 1) => (typeof zahl === "function" ? zahl(v, n) : v.toFixed(n).replace(".", ","));

function sonneSchattenplan(c) {
  const dsm = sonneDsmBauen(sonneZustand.baeume, c);
  const stand = sonnenstandFuerGebiet();
  const werte = new Uint8Array(dsm.nx * dsm.ny);
  let text;
  if (stand.hoehe < SONNE_MIN_HOEHE) {
    text = `${uhrzeit(sonneZustand.minuten)} ${stand.mez}: Die Sonne steht unter dem Horizont (Höhe ${zahlDe(stand.hoehe, 0)}°). Es gibt keine direkte Sonne.`;
    sonneBildSetzen(dsm, (i) => (dsm.innen[i] && !dsm.typ[i] ? [...SONNE_FARBE_SCHATTEN, 200] : null));
    sonneErgebnis = { art: "schatten", dsm, werte: werte.fill(1), nacht: true };
  } else {
    sonneSchatten(dsm, stand.azimut, stand.hoehe, werte);
    let schatten = 0, offen = 0;
    for (let i = 0; i < werte.length; i++) { if (werte[i] === 2 || !dsm.innen[i]) continue; offen++; if (werte[i] === 1) schatten++; }
    sonneBildSetzen(dsm, (i) => (werte[i] === 1 ? [...SONNE_FARBE_SCHATTEN, 165] : null));
    text = `${uhrzeit(sonneZustand.minuten)} ${stand.mez} · Sonnenhöhe ${zahlDe(stand.hoehe, 1)}° · Richtung ${zahlDe(stand.azimut, 0)}° (${himmelsrichtung(stand.azimut)}).<br>` +
      `Im Schatten: <strong>${zahlDe((schatten / Math.max(1, offen)) * 100, 0)} %</strong> der Freifläche (ohne Gebäude und Baumkronen).`;
    sonneErgebnis = { art: "schatten", dsm, werte };
  }
  sonneEl.info.innerHTML = text;
  sonneEl.punkt.textContent = "Klick auf die Karte: Sonne oder Schatten an dieser Stelle.";
}

async function sonneBesonnungsdauer() {
  const nummer = ++sonneRechenNummer;
  sonneEl.info.textContent = "Höhenraster wird gebaut …";
  await new Promise((r) => setTimeout(r, 0));
  const dsm = sonneDsmBauen(sonneZustand.baeume, sonneZustand.zelle.dauer);
  const { breite, laenge } = sonneMitte();
  const [j, m, t] = sonneZustand.datum.split("-").map(Number);
  const versatz = sonneZeitzone(j, m, t);
  const proben = [];
  for (let min = 0; min < 1440; min += SONNE_SCHRITT_MIN) {
    const s = sonnenstandUtc(Date.UTC(j, m - 1, t, 0, 0) + (min - versatz) * 60000, breite, laenge);
    if (s.hoehe >= SONNE_MIN_HOEHE) proben.push(s);
  }
  const n = dsm.nx * dsm.ny;
  const zaehler = new Uint16Array(n);
  const maske = new Uint8Array(n);
  const start = performance.now();
  for (let k = 0; k < proben.length; k++) {
    sonneSchatten(dsm, proben[k].azimut, proben[k].hoehe, maske);
    for (let i = 0; i < n; i++) if (maske[i] === 0) zaehler[i]++;
    sonneEl.info.textContent = `Berechnung läuft … ${k + 1} von ${proben.length} Zeitpunkten`;
    await new Promise((r) => setTimeout(r, 0));
    if (nummer !== sonneRechenNummer) return;                           // Einstellung wurde inzwischen geändert
  }
  const stunden = (i) => (zaehler[i] * SONNE_SCHRITT_MIN) / 60;
  let summe = 0, offen = 0, ab4 = 0, unter2 = 0;
  for (let i = 0; i < n; i++) {
    if (dsm.typ[i] || !dsm.innen[i]) continue;
    offen++; const h = stunden(i); summe += h; if (h >= 4) ab4++; if (h < 2) unter2++;
  }
  sonneBildSetzen(dsm, (i) => (dsm.typ[i] || !dsm.innen[i] ? null : [...sonneDauerFarbe(stunden(i)), 205]));
  const moeglich = (proben.length * SONNE_SCHRITT_MIN) / 60;
  sonneErgebnis = { art: "dauer", dsm, zaehler, stunden, moeglich };
  sonneEl.info.innerHTML = proben.length
    ? `Am ${sonneDatumText()} scheint die Sonne bei klarem Himmel höchstens <strong>${zahlDe(moeglich, 1)} h</strong> (Sonne über ${SONNE_MIN_HOEHE}° Höhe).<br>` +
      `Freifläche im Mittel: <strong>${zahlDe(summe / Math.max(1, offen), 1)} h</strong> · mindestens 4 h: <strong>${zahlDe((ab4 / Math.max(1, offen)) * 100, 0)} %</strong> · unter 2 h: <strong>${zahlDe((unter2 / Math.max(1, offen)) * 100, 0)} %</strong><br>` +
      `<small>Rechenzeit ${zahlDe((performance.now() - start) / 1000, 1)} s</small>`
    : "An diesem Tag geht die Sonne nicht auf.";
  sonneEl.punkt.textContent = "Klick auf die Karte: Stunden direkte Sonne an dieser Stelle.";
}

function sonneDatumText() {
  const [j, m, t] = sonneZustand.datum.split("-").map(Number);
  return `${t}.${m}.${j}`;
}

let sonneZeitgeber = null;
// grob = true: beim Ziehen des Reglers mit 2-m-Raster (flüssig), nach dem Loslassen mit der gewählten Rasterweite
function sonneNeuRechnen(verzoegert, grob) {
  clearTimeout(sonneZeitgeber);
  const los = async () => {
    if (aktuelleAnsicht !== "sonne" || !datenVorhanden || !gebiet) return;
    sonneEl.hinweis.hidden = true;
    try {
      if (sonneZustand.modus === "schatten") {
        sonneRechenNummer++;
        const c = grob ? Math.max(sonneZustand.zelle.schatten, SONNE_ZELLE_GROB) : sonneZustand.zelle.schatten;
        if (!(sonneDsm.r[String(c)] && sonneDsm.r[String(c)][sonneZustand.baeume ? "mit" : "ohne"])) {   // erstes Mal mit dieser Rasterweite: kurz Bescheid sagen, dann rechnen
          sonneEl.info.textContent = c < 1 ? "Feines Höhenraster wird gebaut, das dauert einige Sekunden …" : "Höhenraster wird gebaut …";
          await new Promise((r) => setTimeout(r, 20));
        }
        sonneSchattenplan(c);
      } else await sonneBesonnungsdauer();
    } catch (fehler) {
      console.error(fehler);
      sonneEl.info.textContent = "Berechnung nicht möglich: " + fehler.message;
    }
    sonneBildSichtbar();
    if (typeof aktualisiereExport === "function") aktualisiereExport();   // Exportknopf erscheint, sobald es ein Bild gibt
  };
  if (verzoegert) sonneZeitgeber = setTimeout(los, verzoegert); else los();
}

function sonneBildSichtbar() {
  if (!kartenBereit || !map.getLayer("sonne-bild")) return;
  const an = aktuelleAnsicht === "sonne" && datenVorhanden;
  map.setLayoutProperty("sonne-bild", "visibility", an ? "visible" : "none");
}

// ---------- 6. Bedienung ----------
function sonneBedienelementeAnzeigen() {
  sonneEl.datum.value = sonneZustand.datum;
  sonneEl.zeit.value = String(sonneZustand.minuten);
  sonneEl.zeitWert.textContent = uhrzeit(sonneZustand.minuten);
  sonneEl.baeume.checked = sonneZustand.baeume;
  sonneEl.modus.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.modus === sonneZustand.modus));
  sonneEl.genau.value = String(sonneZustand.zelle[sonneZustand.modus]);
  sonneEl.genauHinweis.hidden = !(sonneZustand.modus === "dauer" && sonneZustand.zelle.dauer < 1);
  sonneEl.zeitFeld.hidden = sonneZustand.modus !== "schatten";
  sonneEl.skala.hidden = sonneZustand.modus !== "dauer";
  sonneEl.schnell.querySelectorAll("button").forEach((b) => {
    const jahr = sonneZustand.datum.slice(0, 4);
    b.classList.toggle("is-active", sonneZustand.datum === `${jahr}-${b.dataset.tag}`);
  });
}

sonneEl.modus.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  sonneZustand.modus = b.dataset.modus;
  sonneBedienelementeAnzeigen();
  sonneNeuRechnen(0);
  aktualisiereLegende();
});
sonneEl.schnell.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  sonneZustand.datum = `${sonneZustand.datum.slice(0, 4)}-${b.dataset.tag}`;
  sonneBedienelementeAnzeigen();
  sonneNeuRechnen(sonneZustand.modus === "dauer" ? 200 : 0);
});
sonneEl.datum.addEventListener("change", () => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sonneEl.datum.value)) return;
  sonneZustand.datum = sonneEl.datum.value;
  sonneBedienelementeAnzeigen();
  sonneNeuRechnen(sonneZustand.modus === "dauer" ? 200 : 0);
});
sonneEl.zeit.addEventListener("input", () => {
  sonneZustand.minuten = Number(sonneEl.zeit.value);
  sonneEl.zeitWert.textContent = uhrzeit(sonneZustand.minuten);
  if (sonneZustand.modus === "schatten") sonneNeuRechnen(20, true);     // beim Ziehen grob und schnell
});
sonneEl.zeit.addEventListener("change", () => { if (sonneZustand.modus === "schatten") sonneNeuRechnen(0, false); });   // beim Loslassen in voller Genauigkeit
sonneEl.genau.addEventListener("change", () => {
  sonneZustand.zelle[sonneZustand.modus] = Number(sonneEl.genau.value);
  sonneBedienelementeAnzeigen();
  sonneNeuRechnen(0);
});
sonneEl.baeume.addEventListener("change", () => {
  sonneZustand.baeume = sonneEl.baeume.checked;
  sonneNeuRechnen(0);
});

// Klick auf die Karte: Wert an der Stelle
map.on("click", (e) => {
  if (aktuelleAnsicht !== "sonne" || !sonneErgebnis) return;
  const { dsm } = sonneErgebnis;
  const [x, y] = utmWandler.forward([e.lngLat.lng, e.lngLat.lat]);
  const col = Math.floor((x - dsm.x0) / dsm.c), r = Math.floor((dsm.y1 - y) / dsm.c);
  if (col < 0 || r < 0 || col >= dsm.nx || r >= dsm.ny) return;
  const i = r * dsm.nx + col;
  if (!dsm.innen[i]) return;
  if (dsm.typ[i]) { sonneEl.punkt.textContent = dsm.typ[i] === 1 ? "Hier steht ein Gebäude (Dach), der Boden wird nicht bewertet." : "Hier steht ein Baum (Krone), der Boden wird nicht bewertet."; return; }
  if (sonneErgebnis.art === "dauer") sonneEl.punkt.textContent = `An dieser Stelle: ${zahlDe(sonneErgebnis.stunden(i), 1)} h direkte Sonne am ${sonneDatumText()}.`;
  else sonneEl.punkt.textContent = sonneErgebnis.werte[i] === 1 ? (sonneErgebnis.nacht ? "Die Sonne ist untergegangen." : "An dieser Stelle liegt Schatten.") : "An dieser Stelle scheint die Sonne.";
});

// Wird bei jedem Reiterwechsel und jedem Datenstand aufgerufen (siehe wendeAnsichtAn)
function aktualisiereSonne() {
  const aktiv = aktuelleAnsicht === "sonne";
  sonnePanel.hidden = !aktiv;
  sonneBildSichtbar();
  if (!aktiv) return;
  sonneBedienelementeAnzeigen();
  if (!datenVorhanden || !gebiet) {
    sonneEl.hinweis.textContent = "Wähle im Reiter „Karte“ ein Gebiet und klicke auf „Analysieren“. Danach rechnet dieser Reiter.";
    sonneEl.hinweis.hidden = false;
    sonneEl.info.textContent = "";
    return;
  }
  const stand = [turf.bbox(gebiet).join(","), lod2Gebaeude.length, osmFeatures.length, baumFeatures.length, gelaende ? gelaende.min : "flach", sonneZustand.modus, sonneZustand.datum, sonneZustand.minuten, sonneZustand.baeume, sonneZustand.zelle.schatten, sonneZustand.zelle.dauer].join("|");
  if (stand === sonneBildStand) return;
  sonneBildStand = stand;
  sonneEl.info.textContent = "Wird berechnet …";
  sonneEl.hinweis.hidden = true;
  sonneNeuRechnen(40);
}

function verwerfeSonne() {
  sonneDsm = { stand: "", r: {} };
  sonneErgebnis = null;
  sonneLetztesBild = null;
  sonneBildStand = "";
  sonneRechenNummer++;
  if (kartenBereit && map.getLayer("sonne-bild")) map.setLayoutProperty("sonne-bild", "visibility", "none");
}

// Einträge der Legende (wird von legende.js aufgerufen)
function sonneLegendeEintraege() {
  if (sonneZustand.modus === "dauer") {
    return `<li><span class="sw sonne-skala-legende" style="background:${sonneSkalaCss()}"></span><span>Direkte Sonne: 0 bis 14 Stunden am Tag</span></li>` +
      `<li class="sonne-skala-zahlen"><span>0 h</span><span>4</span><span>8</span><span>14 h</span></li>`;
  }
  return eintrag(farbfeld(`rgba(${SONNE_FARBE_SCHATTEN.join(",")},0.65)`), "Schatten (Gebäude, Bäume, Gelände)") +
    eintrag(farbfeld("#ffffff", "#999"), "Sonne (kein Farbton)");
}
