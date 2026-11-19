/* ============================================================
   SiteKick – Export der Pläne (Reiter Schwarzplan, Straßennetz, Grün & Wasser, Lageplan)

   Ein Klick auf „Exportieren …“ öffnet ein Fenster mit Vorschau. Dort wählt man Format (A4 bis A0), Maßstab und Beschriftung des Plankopfs
   und speichert den Plan als PDF (Vektor), PNG (Pixel, 150 oder 300 dpi), SVG (Vektor) oder DXF für CAD (Allplan 2024, ArchiCAD 29).

   So ist es gebaut:
     - Aus den Daten (OpenStreetMap, ALKIS, LoD2, Bäume) entsteht eine Liste von Zeichenbefehlen in UTM-Metern (expSzene), gleiche Reihenfolge
       und Farben wie auf der Karte.
     - Ein "Zeichner" malt diese Befehle auf Papier-Millimeter. Es gibt vier Zeichner mit derselben Schnittstelle: SVG, Leinwand (PNG),
       jsPDF (PDF). DXF wird direkt aus den Befehlen geschrieben (Weltkoordinaten in Metern, keine Füllungen).
     - Alles wird am Rechteck des Gebiets abgeschnitten (turf.bboxClip in Länge/Breite, damit der Plan genau dort endet).

   Wichtig und ehrlich:
     - DXF: Version R12 (AC1009), Einheit Meter, Flächen als geschlossene Polylinien ohne Füllung (Füllungen kennt dieses DXF-Format nicht).
       Mit dem Prüfprogramm ezdxf auf Gültigkeit getestet, von den Studierenden in Allplan und ArchiCAD getestet.
     - Der Nordpfeil zeigt zum Gitternorden von UTM 32 (bei Oldenburg etwa 0,6 Grad neben dem geografischen Norden).
     - Der Maßstab stimmt auf dem Papier nur, wenn beim Drucken „tatsächliche Größe“ (100 %) gewählt wird.
   ============================================================ */

"use strict";

const EXP_FORMATE = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189] };
const EXP_MASSSTAEBE = [500, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000];
const PL = ["pdf", "png", "svg", "dxf-allplan", "dxf-archicad", "geojson"];
const EXP_PLAENE = {
  schwarzplan: { name: "Schwarzplan", datei: "Schwarzplan", art: "plan", knoepfe: PL },
  strassen: { name: "Straßennetz", datei: "Strassennetz", art: "plan", knoepfe: PL },
  gruen: { name: "Grün und Wasser", datei: "Gruen-Wasser", art: "plan", knoepfe: PL },
  lageplan: { name: "Lageplan", datei: "Lageplan", art: "plan", knoepfe: PL },
  sonne: { name: "Sonne und Schatten", datei: "Sonne-Schatten", art: "plan", knoepfe: ["pdf", "png", "svg", "dxf-allplan", "dxf-archicad"] },
  flurstuecke: { name: "Flurstücke", datei: "Flurstuecke", art: "plan", knoepfe: [...PL, "csv"] },
  mieten: { name: "Mietpreise", datei: "Mietpreise", art: "plan", knoepfe: [...PL, "csv"] },
  wirtschaft: { name: "Wirtschaftlichkeit", datei: "Wirtschaftlichkeit", art: "plan", knoepfe: [...PL, "csv"] },
  infos: { name: "Umgebung", datei: "Umgebung", art: "plan", knoepfe: [...PL, "csv"] },
  luftbild: { name: "Luftbild", datei: "Luftbild", art: "luft", knoepfe: ["pdf", "png", "svg"] },
  schnitt: { name: "Schnitt und Ansicht", datei: "Schnitt", art: "schnitt", knoepfe: ["pdf", "png", "svg", "dxf-schnitt"] },
  "3d": { name: "3D-Modell", datei: "3D", art: "bild3d", knoepfe: ["pdf", "png", "svg", "dxf3d-allplan", "dxf3d-archicad"] },
  kennzahlen: { name: "Kennzahlen", datei: "Kennzahlen", art: "text", knoepfe: ["kz-pdf", "kz-csv"] }
};
const EXP_KNOPF_NAMEN = { pdf: "PDF", png: "PNG", svg: "SVG", "dxf-allplan": "DXF Allplan", "dxf-archicad": "DXF ArchiCAD", "dxf-schnitt": "DXF", "dxf3d-allplan": "3D-DXF Allplan", "dxf3d-archicad": "3D-DXF ArchiCAD", geojson: "GeoJSON", csv: "CSV", "kz-pdf": "PDF", "kz-csv": "CSV" };

// Zusätzliche Ansichten nur für den Export: Umgebung bekommt eine helle Grundlage, damit die bunten Symbole auffallen
const EXP_ANSICHT = {
  infos: { ebenen: ["kontext", "gruen", "wasser", "alkis", "strassen"], kontextFarbe: "#d9d9d9", kontextOpacity: 1, gruenFarbe: "#e1ebd8", wasserFarbe: "#d0e1ef",
    alkis: { strasse: "#ffffff", weg: "#f7f7f7", platz: "#f7f7f7", kante: "#c2c2c2" }, strasse: "#b9b9b9" },
  luftbild: { ebenen: [] }
};

// Farbverlauf mit mehreren Stützstellen: stops = [[Wert, Farbe], ...] aufsteigend
function expStufen(w, stops) {
  if (w <= stops[0][0]) return expHex(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    if (w <= stops[i][0]) {
      const t = (w - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
      const a = expFarbe(stops[i - 1][1]), b = expFarbe(stops[i][1]);
      return a.map((v, k) => Math.round(v + (b[k] - v) * t));
    }
  }
  return expHex(stops[stops.length - 1][1]);
}
const PT_MM = 25.4 / 72;   // 1 Punkt in Millimetern

const exEl = {
  knopf: document.getElementById("export-knopf"), dialog: document.getElementById("export-dialog"),
  format: document.getElementById("ex-format"), richtung: document.getElementById("ex-richtung"), massstab: document.getElementById("ex-massstab"),
  titel: document.getElementById("ex-titel"), untertitel: document.getElementById("ex-untertitel"), verfasser: document.getElementById("ex-verfasser"),
  kurs: document.getElementById("ex-kurs"), datum: document.getElementById("ex-datum"), legende: document.getElementById("ex-legende"),
  dpi: document.getElementById("ex-dpi"), info: document.getElementById("ex-info"), vorschau: document.getElementById("ex-vorschau"),
  passend: document.getElementById("ex-passend"), vx: document.getElementById("ex-vx"), vy: document.getElementById("ex-vy"), versatz: document.getElementById("ex-versatz"), dxfHinweis: document.getElementById("ex-dxf-hinweis"), zu: document.getElementById("ex-zu"), status: document.getElementById("ex-status")
};
let exSzene = null;      // { ansicht, befehle, rahmen, ... } für das geöffnete Fenster
let exZeitgeber = null;

// ---------- 1. Farben und Text ----------
function expFarbe(f) {
  if (Array.isArray(f)) return f;
  let m = /^#([0-9a-f]{6})$/i.exec(f);
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  m = /^#([0-9a-f]{3})$/i.exec(f);
  if (m) return m[1].split("").map((c) => parseInt(c + c, 16));
  m = /rgba?\(([^)]+)\)/.exec(f);
  if (m) return m[1].split(",").slice(0, 3).map((v) => Math.round(Number(v)));
  return [0, 0, 0];
}
const expHex = (f) => { const [r, g, b] = expFarbe(f); return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join(""); };
const expXml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

let expMessLeinwand = null;
// Textbreite in Millimetern (für alle Ausgaben gleich, damit der Umbruch überall gleich ausfällt)
function expTextBreite(text, pt, fett) {
  if (!expMessLeinwand) expMessLeinwand = document.createElement("canvas").getContext("2d");
  expMessLeinwand.font = `${fett ? "bold " : ""}100px Helvetica, Arial, sans-serif`;
  return (expMessLeinwand.measureText(text).width / 100) * pt * PT_MM;
}
// Text in Zeilen umbrechen, die höchstens "breite" mm lang sind
// Text auf höchstens "max" mm kürzen (mit …)
function expKuerzen(text, pt, max) {
  if (expTextBreite(text, pt, false) <= max) return text;
  let t = String(text);
  while (t.length > 1 && expTextBreite(t + "…", pt, false) > max) t = t.slice(0, -1);
  return t + "…";
}
function expUmbruch(text, pt, fett, breite) {
  const zeilen = [];
  for (const absatz of String(text).split("\n")) {
    let zeile = "";
    for (const wort of absatz.split(/\s+/).filter(Boolean)) {
      const probe = zeile ? zeile + " " + wort : wort;
      if (expTextBreite(probe, pt, fett) <= breite || !zeile) zeile = probe; else { zeilen.push(zeile); zeile = wort; }
    }
    zeilen.push(zeile);
  }
  return zeilen;
}

// ---------- 2. Zeichner (alles in Papier-Millimetern, Ursprung links oben) ----------
// Schnittstelle: flaeche(ringe, stil), linie(punkte, stil), kreis(x, y, r, stil), rechteck(x, y, b, h, stil), text(s, x, y, stil)
// stil: { fill, fo (Deckkraft), stroke, sw (Linienbreite mm), cap, dash:[a,b] }; text: { pt, fett, anker:"l"|"m"|"r", farbe }
function expSvg(w, h) {
  const t = [];
  let klemmNr = 0;
  const f = (v) => Math.round(v * 100) / 100;
  const pfad = (ringe) => ringe.map((r) => "M" + r.map((p) => `${f(p[0])},${f(p[1])}`).join("L") + "Z").join("");
  const mal = (s) => `fill="${s.fill ? expHex(s.fill) : "none"}"${s.fill && s.fo != null && s.fo < 1 ? ` fill-opacity="${s.fo}"` : ""} stroke="${s.stroke ? expHex(s.stroke) : "none"}"${s.stroke ? ` stroke-width="${f(s.sw || 0.1)}"` : ""}${s.dash ? ` stroke-dasharray="${s.dash.join(" ")}"` : ""}`;
  return {
    art: "svg",
    flaeche(ringe, s) { t.push(`<path d="${pfad(ringe)}" ${mal(s)} fill-rule="evenodd" stroke-linejoin="round"/>`); },
    linie(pts, s) { t.push(`<polyline points="${pts.map((p) => `${f(p[0])},${f(p[1])}`).join(" ")}" fill="none" stroke="${expHex(s.stroke)}" stroke-width="${f(s.sw)}" stroke-linecap="${s.cap || "round"}" stroke-linejoin="round"${s.dash ? ` stroke-dasharray="${s.dash.join(" ")}"` : ""}/>`); },
    kreis(x, y, r, s) { t.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" ${mal(s)}/>`); },
    rechteck(x, y, bw, bh, s) { t.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(bw)}" height="${f(bh)}" ${mal(s)}/>`); },
    text(str, x, y, s) { t.push(`<text x="${f(x)}" y="${f(y)}" font-family="Helvetica, Arial, sans-serif" font-size="${f(s.pt * PT_MM)}"${s.fett ? ' font-weight="bold"' : ""} fill="${expHex(s.farbe || "#000")}" text-anchor="${{ l: "start", m: "middle", r: "end" }[s.anker || "l"]}">${expXml(str)}</text>`); },
    bild(url, x, y, bw, bh) { t.push(`<image x="${f(x)}" y="${f(y)}" width="${f(bw)}" height="${f(bh)}" href="${url}" preserveAspectRatio="none"/>`); },
    klemme(x, y, bw, bh) { klemmNr++; t.push(`<clipPath id="kl${klemmNr}"><rect x="${f(x)}" y="${f(y)}" width="${f(bw)}" height="${f(bh)}"/></clipPath><g clip-path="url(#kl${klemmNr})"><g class="ex-inhalt">`); },
    klemmeEnde() { t.push("</g></g>"); },
    ergebnis(vorschau) {
      return `<svg xmlns="http://www.w3.org/2000/svg" ${vorschau ? 'style="width:100%;height:auto;display:block;background:#fff"' : `width="${w}mm" height="${h}mm"`} viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#fff"/>${t.join("")}</svg>`;
    }
  };
}

function expLeinwand(w, h, dpi) {
  const k = dpi / 25.4;
  const lw = document.createElement("canvas");
  lw.width = Math.round(w * k); lw.height = Math.round(h * k);
  const c = lw.getContext("2d");
  c.scale(k, k);
  c.fillStyle = "#fff"; c.fillRect(0, 0, w, h);
  c.lineJoin = "round";
  const alpha = (s) => { c.globalAlpha = s.fill && s.fo != null ? s.fo : 1; };
  return {
    art: "png", leinwand: lw,
    flaeche(ringe, s) {
      c.beginPath();
      for (const r of ringe) { c.moveTo(r[0][0], r[0][1]); for (let i = 1; i < r.length; i++) c.lineTo(r[i][0], r[i][1]); c.closePath(); }
      if (s.fill) { alpha(s); c.fillStyle = expHex(s.fill); c.fill("evenodd"); }
      if (s.stroke) { c.globalAlpha = 1; c.strokeStyle = expHex(s.stroke); c.lineWidth = s.sw || 0.1; c.stroke(); }
      c.globalAlpha = 1;
    },
    linie(pts, s) {
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
      c.strokeStyle = expHex(s.stroke); c.lineWidth = s.sw; c.lineCap = s.cap || "round"; c.setLineDash(s.dash || []); c.stroke(); c.setLineDash([]);
    },
    kreis(x, y, r, s) {
      c.beginPath(); c.arc(x, y, r, 0, 2 * Math.PI);
      if (s.fill) { alpha(s); c.fillStyle = expHex(s.fill); c.fill(); }
      if (s.stroke) { c.globalAlpha = 1; c.strokeStyle = expHex(s.stroke); c.lineWidth = s.sw || 0.1; c.stroke(); }
      c.globalAlpha = 1;
    },
    rechteck(x, y, bw, bh, s) {
      if (s.fill) { alpha(s); c.fillStyle = expHex(s.fill); c.fillRect(x, y, bw, bh); }
      if (s.stroke) { c.globalAlpha = 1; c.strokeStyle = expHex(s.stroke); c.lineWidth = s.sw || 0.1; c.strokeRect(x, y, bw, bh); }
      c.globalAlpha = 1;
    },
    text(str, x, y, s) {
      c.font = `${s.fett ? "bold " : ""}${s.pt * PT_MM}px Helvetica, Arial, sans-serif`;
      c.fillStyle = expHex(s.farbe || "#000"); c.textAlign = { l: "left", m: "center", r: "right" }[s.anker || "l"]; c.textBaseline = "alphabetic";
      c.fillText(str, x, y);
    },
    bild(bildObj, x, y, bw, bh) { c.imageSmoothingEnabled = true; c.drawImage(bildObj, x, y, bw, bh); },
    klemme(x, y, bw, bh) { c.save(); c.beginPath(); c.rect(x, y, bw, bh); c.clip(); },
    klemmeEnde() { c.restore(); },
    ergebnis() { return lw; }
  };
}

function expPdf(w, h) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: w > h ? "landscape" : "portrait", unit: "mm", format: [Math.min(w, h), Math.max(w, h)], compress: true });
  const mitDeckkraft = (op, tun) => {
    if (op != null && op < 1) { doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity: op })); tun(); doc.restoreGraphicsState(); } else tun();
  };
  return {
    art: "pdf",
    flaeche(ringe, s) {
      const tun = () => {
        for (const r of ringe) { doc.moveTo(r[0][0], r[0][1]); for (let i = 1; i < r.length; i++) doc.lineTo(r[i][0], r[i][1]); doc.close(); }
        if (s.fill) { doc.setFillColor(...expFarbe(s.fill)); }
        if (s.stroke) { doc.setDrawColor(...expFarbe(s.stroke)); doc.setLineWidth(s.sw || 0.1); }
        if (s.fill && s.stroke) doc.fillStrokeEvenOdd(); else if (s.fill) doc.fillEvenOdd(); else doc.stroke();
      };
      mitDeckkraft(s.fill ? s.fo : null, tun);
    },
    linie(pts, s) {
      doc.setDrawColor(...expFarbe(s.stroke)); doc.setLineWidth(s.sw); doc.setLineCap(s.cap === "butt" ? "butt" : "round"); doc.setLineJoin("round");
      if (s.dash) doc.setLineDashPattern(s.dash, 0);
      doc.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) doc.lineTo(pts[i][0], pts[i][1]);
      doc.stroke();
      if (s.dash) doc.setLineDashPattern([], 0);
    },
    kreis(x, y, r, s) {
      mitDeckkraft(s.fill ? s.fo : null, () => {
        if (s.fill) doc.setFillColor(...expFarbe(s.fill));
        if (s.stroke) { doc.setDrawColor(...expFarbe(s.stroke)); doc.setLineWidth(s.sw || 0.1); }
        doc.circle(x, y, r, s.fill && s.stroke ? "FD" : s.fill ? "F" : "S");
      });
    },
    rechteck(x, y, bw, bh, s) {
      mitDeckkraft(s.fill ? s.fo : null, () => {
        if (s.fill) doc.setFillColor(...expFarbe(s.fill));
        if (s.stroke) { doc.setDrawColor(...expFarbe(s.stroke)); doc.setLineWidth(s.sw || 0.1); }
        doc.rect(x, y, bw, bh, s.fill && s.stroke ? "FD" : s.fill ? "F" : "S");
      });
    },
    text(str, x, y, s) {
      doc.setFont("helvetica", s.fett ? "bold" : "normal"); doc.setFontSize(s.pt); doc.setTextColor(...expFarbe(s.farbe || "#000"));
      doc.text(String(str), x, y, { align: { l: "left", m: "center", r: "right" }[s.anker || "l"], baseline: "alphabetic" });
    },
    bild(url, x, y, bw, bh) { doc.addImage(url, String(url).startsWith("data:image/jpeg") ? "JPEG" : "PNG", x, y, bw, bh); },
    klemme(x, y, bw, bh) { doc.saveGraphicsState(); doc.rect(x, y, bw, bh, null); doc.clip(); doc.discardPath(); },
    klemmeEnde() { doc.restoreGraphicsState(); },
    ergebnis() { return doc.output("blob"); }
  };
}

// ---------- 3. Zeichenbefehle aus den Daten (UTM-Meter) ----------
// Befehl: { t: "flaeche" | "linie" | "kreis", dxf: Ebenenname, ringe | pts | c, r, stil }
// Linienbreiten: stil.sw in mm Papier, stil.swM in Metern in der Natur (echte Breite, z. B. Straßen)
function expUtm(p) { return utmWandler.forward(p); }

function expTeile(geom, bbox) {
  // schneidet an der Gebietsgrenze (Länge/Breite) und gibt eine Liste einfacher Geometrien zurück
  const b = turf.bbox({ type: "Feature", properties: {}, geometry: geom });
  const innen = b[0] >= bbox[0] && b[1] >= bbox[1] && b[2] <= bbox[2] && b[3] <= bbox[3];
  if (!innen && (b[2] < bbox[0] || b[0] > bbox[2] || b[3] < bbox[1] || b[1] > bbox[3])) return [];
  const g = innen ? geom : turf.bboxClip({ type: "Feature", properties: {}, geometry: geom }, bbox).geometry;
  if (!g || !g.coordinates || !g.coordinates.length) return [];
  switch (g.type) {
    case "Polygon": return [g];
    case "MultiPolygon": return g.coordinates.map((c) => ({ type: "Polygon", coordinates: c }));
    case "LineString": return [g];
    case "MultiLineString": return g.coordinates.map((c) => ({ type: "LineString", coordinates: c }));
    default: return [];
  }
}

// Wert eines Flurstücks für die gewählte Einfärbung (wie flstMerkmale in flurstuecke.js)
function expFlstWert(p) {
  const hat = flstSumme && flstSumme.hatGebaeude;
  if (flstModus === "brw") return !p.verkehr && p.zone ? p.zone.brw : null;
  if (!hat || p.verkehr || p.rand) return null;
  return flstModus === "grz" ? grzVon(p) : gfzVon(p);
}
function expFlstStufen() {
  const f = FARBE.flst, s = flstSumme || { brwVon: 0, brwBis: 1 };
  let von = 0, bis = 1, farben = f.brw;
  if (flstModus === "brw") { von = s.brwVon; bis = Math.max(s.brwBis, s.brwVon + 1); }
  if (flstModus === "grz") { farben = f.grz; }
  if (flstModus === "gfz") { bis = 4; farben = f.gfz; }
  return [[von, farben[0]], [(von + bis) / 2, farben[1]], [bis, farben[2]]];
}
// Wirtschaftlichkeit: Wert je Flurstück und Farbverlauf (wie setzeWirtAufKarte und wirtFarbausdruck in wirtschaft.js)
function expWirtWert(i) {
  const r = wirtErgebnisse[i] || {}, n = r.neubau, b = r.bestand;
  if (wirtModus === "ergebnis") return n ? n.ergebnisJeM2 : null;
  if (wirtModus === "rendite") return b && r.wfl > 0 ? b.rendite : null;
  return r.ausnutzung != null ? r.ausnutzung : null;
}
function expWirtStufen() {
  const s = wirtSumme || { ergBis: 1, renBis: 0.05 };
  if (wirtModus === "ergebnis") return [[-s.ergBis, "#c8362e"], [0, "#f3f0ea"], [s.ergBis, "#1b7a52"]];
  if (wirtModus === "rendite") return [[0, "#eaf2f8"], [s.renBis / 2, "#7fb0d4"], [s.renBis, "#1f5f94"]];
  return [[0, "#fbf3d5"], [0.75, "#e0b04a"], [1.5, "#8a5a00"]];
}

function expSzene(ansicht) {
  const e = EXP_ANSICHT[ansicht] || ANSICHTEN[ansicht];
  const hat = (g) => e.ebenen.includes(g);
  const bbox = turf.bbox(gebiet);
  const befehle = [];
  const geo = [];   // dieselben Objekte als GeoJSON (Länge/Breite) für den GeoJSON-Export
  const flaechen = (liste, dxf, stilFn, nur) => {
    for (const f of liste) {
      if (nur && !nur(f)) continue;
      const stil = typeof stilFn === "function" ? stilFn(f) : stilFn;
      const ebene = typeof dxf === "function" ? dxf(f) : dxf;
      for (const g of expTeile(f.geometry, bbox)) {
        if (g.type !== "Polygon") continue;
        const ringe = g.coordinates.map((r) => r.map(expUtm)).filter((r) => r.length >= 4);
        const nurBild = !!(stil && !stil.fill && stil.stroke);
        if (ringe.length) befehle.push({ t: "flaeche", dxf: ebene, ringe, stil, nurBild });
        if (ringe.length && !nurBild) geo.push({ type: "Feature", properties: { ebene, ...(f.wert != null ? { wert: f.wert } : {}), ...(f.properties && f.properties.kat ? { kat: f.properties.kat } : {}) }, geometry: g });
      }
    }
  };
  const linien = (liste, dxf, stilFn, nur) => {
    for (const f of liste) {
      if (nur && !nur(f)) continue;
      const stil = typeof stilFn === "function" ? stilFn(f) : stilFn;
      for (const g of expTeile(f.geometry, bbox)) {
        if (g.type !== "LineString" || g.coordinates.length < 2) continue;
        const ebene = typeof dxf === "function" ? dxf(f) : dxf;
        befehle.push({ t: "linie", dxf: ebene, pts: g.coordinates.map(expUtm), stil });
        geo.push({ type: "Feature", properties: { ebene, ...(f.properties && f.properties.typ ? { typ: f.properties.typ } : {}) }, geometry: g });
      }
    }
  };
  const osm = (...kat) => osmFeatures.filter((f) => kat.includes(f.properties.kat));
  const lodAus = (ansicht === "lageplan" || ansicht === "schnitt" || ansicht === "sonne") && lod2Vorhanden;
  const gebaeudeSatz = () => osm("gebaeude", "nebengebaeude").filter((f) => !lodAus || !(f.properties.lod2 === 1));
  const haarlinie = 0.1;

  // Flächen unter den Gebäuden (wie auf der Karte): Flurstücke, Mietraster, Wirtschaftlichkeit
  let rahmenLinien = null;
  if (hat("flurstuecke") && flurstueckeVorhanden) {
    const stops = expFlstStufen();
    const objekte = flurstuecke.map((p) => ({ geometry: p.f.geometry, wert: expFlstWert(p) }));
    flaechen(objekte, "FLURSTUECKE", (f) => ({ fill: f.wert == null ? FARBE.flst.keine : expStufen(f.wert, stops), fo: 0.92 }));
    rahmenLinien = { liste: objekte, dxf: "FLURSTUECKE_GRENZE", stil: { stroke: FARBE.flst.linie, sw: 0.1 } };
  }
  if (hat("wirtschaft") && flurstueckeVorhanden) {
    const objekte = flurstuecke.map((p, i) => ({ geometry: p.f.geometry, wert: expWirtWert(i) }));
    flaechen(objekte, "FLURSTUECKE_WIRTSCHAFT", (f) => ({ fill: f.wert == null ? FARBE.flst.keine : expStufen(f.wert, expWirtStufen()), fo: 0.92 }));
    rahmenLinien = { liste: objekte, dxf: "FLURSTUECKE_GRENZE", stil: { stroke: FARBE.flst.linie, sw: 0.1 } };
  }
  if (hat("mieten") && mietVorhanden) {
    const s = mietSumme || { von: 0, bis: 1 };
    const stops = [[s.von, FARBE.miet.rampe[0]], [(s.von + s.bis) / 2, FARBE.miet.rampe[1]], [Math.max(s.bis, s.von + 0.1), FARBE.miet.rampe[2]]];
    const objekte = mietZellen.map((z) => ({ geometry: z.f.geometry, wert: z.miete != null && z.miete >= 0 ? z.miete : null }));
    flaechen(objekte, "MIETRASTER", (f) => ({ fill: f.wert == null ? FARBE.miet.keine : expStufen(f.wert, stops), fo: 0.92 }));
    rahmenLinien = { liste: objekte, dxf: "MIETRASTER_GRENZE", stil: { stroke: FARBE.miet.linie, sw: 0.1 } };
  }
  if (hat("kontext")) flaechen(osm("gebaeude", "nebengebaeude"), (f) => (f.properties.kat === "nebengebaeude" ? "NEBENGEBAEUDE" : "GEBAEUDE"), { fill: e.kontextFarbe || FARBE.kontext, fo: e.kontextOpacity || 1 });
  if (hat("gruen")) {
    flaechen(osm("gruen"), "GRUEN", { fill: e.gruenFarbe || FARBE.gruen });
    flaechen(alkisFlaechen, "GRUEN", { fill: e.gruenFarbe || FARBE.gruen }, (f) => f.properties.kat === "gehoelz" || f.properties.kat === "wald");
  }
  if (hat("wasser")) {
    flaechen(osm("wasser"), "WASSER", { fill: e.wasserFarbe || FARBE.wasser });
    const wb = { river: 8, canal: 8, stream: 2.5 };
    linien(osm("wasserlinie"), "WASSER_LINIE", (f) => ({ stroke: e.wasserFarbe || FARBE.wasser, swM: wb[f.properties.typ] || 1.5, cap: "butt" }));
  }
  if (hat("alkis") && alkisVorhanden) {
    const a = e.alkis || {};
    flaechen(alkisFlaechen, "STRASSE_FAHRBAHN", { fill: a.strasse || "#cccccc" }, (f) => f.properties.kat === "strasse");
    flaechen(alkisFlaechen, "STRASSE_WEG", { fill: a.weg || "#cccccc" }, (f) => f.properties.kat === "weg");
    flaechen(alkisFlaechen, "STRASSE_PLATZ", { fill: a.platz || "#cccccc" }, (f) => f.properties.kat === "platz");
    flaechen(alkisFlaechen, "STRASSE_KANTE", { stroke: a.kante || "#8a8a8a", sw: haarlinie }, (f) => ["strasse", "weg", "platz"].includes(f.properties.kat));
  }
  if (hat("strassen") && !alkisVorhanden) {
    const sb = { haupt: 12, sammel: 9, wohn: 6, service: 4 };
    linien(osm("strasse"), "STRASSE_ACHSE", (f) => ({ stroke: e.strasse || FARBE.strasseSchwarz, swM: sb[f.properties.typ] || 2, cap: "butt" }));
  }
  if (hat("gebaeude")) {
    const nachHoehe = ansicht === "schwarzplan" && schwarzModus === "hoehe";
    flaechen(gebaeudeSatz(), (f) => (f.properties.kat === "nebengebaeude" ? "NEBENGEBAEUDE" : nachHoehe ? "GEBAEUDE_H_" + hoehenKlasse(gebaeudeHoehe(f.properties)).kurz : "GEBAEUDE"),
      (f) => ({ fill: f.properties.kat === "nebengebaeude" && ansicht !== "schwarzplan" ? e.neben || FARBE.nebengebaeude : nachHoehe ? hoehenKlasse(gebaeudeHoehe(f.properties)).farbe : e.gebaeude || FARBE.gebaeudeSchwarzplan, ...(nachHoehe ? { stroke: "#6a6a6a", sw: 0.06 } : {}) }));
  }
  if (hat("umriss")) flaechen(gebaeudeSatz(), "GEBAEUDE_UMRISS", { stroke: FARBE.umriss, sw: haarlinie });
  if (hat("dach") && lod2Vorhanden) {
    flaechen(lod2DachFeatures, "DACH_LOD2", (f) => ({ fill: f.properties.farbe, stroke: FARBE.dachKante, sw: 0.06 }));
  }
  if (hat("baeume")) {
    flaechen(baumFeatures, "BAUM_KRONE", (f) => ({ fill: f.properties.nadel ? FARBE.kroneNadel : FARBE.krone, fo: 0.8, stroke: FARBE.kroneRand, sw: 0.1 }), (f) => f.properties.form === "krone");
    for (const f of baumFeatures) {
      if (f.properties.form !== "stamm") continue;
      const [lon, lat] = f.geometry.coordinates;
      if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue;
      befehle.push({ t: "kreis", dxf: "BAUM_STAMM", c: expUtm([lon, lat]), r: 0.35, stil: { fill: FARBE.stamm } });
      geo.push({ type: "Feature", properties: { ebene: "BAUM_STAMM", kronendurchmesser_m: f.properties.d }, geometry: f.geometry });
    }
  }
  // Importierte Dateien (GeoJSON, DXF) als orange Ebene "IMPORT_<Name>"
  if (EXP_PLAENE[ansicht].art === "plan") {
    for (const f of importAktive()) {
      const ebene = "IMPORT_" + f.properties.dxfName, t = f.geometry.type;
      if (t === "Polygon" || t === "MultiPolygon") flaechen([f], ebene, { fill: IMPORT_FARBE, fo: 0.3, stroke: IMPORT_FARBE, sw: 0.15 });
      else if (t === "LineString" || t === "MultiLineString") linien([f], ebene, { stroke: IMPORT_FARBE, sw: 0.25 });
      else if (t === "Point") {
        const [lon, lat] = f.geometry.coordinates;
        if (lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3]) befehle.push({ t: "marke", dxf: ebene, c: expUtm([lon, lat]), fill: IMPORT_FARBE, kurz: "" });
      }
    }
  }
  // Umgebung: Gleise und Orte (nur die Gruppen, die im Reiter angehakt sind)
  if (ansicht === "infos" && infoVorhanden) {
    const an = (f) => infoAn.has(f.properties.g);
    linien(infoFeatures.filter((f) => f.geometry.type === "LineString" && an(f)), (f) => "INFO_" + f.properties.g.toUpperCase(),
      (f) => (f.properties.g === "bahnstrecke" ? { stroke: infoGruppe.bahnstrecke.farbe, sw: 0.6 } : { stroke: infoGruppe.tramstrecke.farbe, sw: 0.4 }));
    for (const f of infoFeatures) {
      if (f.geometry.type !== "Point" || !an(f)) continue;
      const [lon, lat] = f.geometry.coordinates;
      if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue;
      const gr = infoGruppe[f.properties.g];
      befehle.push({ t: "marke", dxf: "INFO_" + gr.id.toUpperCase(), c: expUtm([lon, lat]), fill: farbeVon(gr), kurz: gr.kurz });
      geo.push({ type: "Feature", properties: { ebene: "INFO_" + gr.id.toUpperCase(), gruppe: gr.name, name: f.properties.name, adresse: f.properties.adr }, geometry: f.geometry });
    }
  }
  // Umgebung: Gehzeit-Kreise (wenn im Reiter angehakt und ein Mittelpunkt gewählt ist)
  if (ansicht === "infos" && erreichMitte && erreichEl.an.checked) {
    linien(erreichRinge(), "ERREICHBARKEIT", { stroke: ERREICH_FARBE, sw: 0.35, dash: [2, 1.4] });
    befehle.push({ t: "marke", dxf: "ERREICHBARKEIT_MITTE", c: expUtm(erreichMitte), fill: ERREICH_FARBE, kurz: "" });
    for (const ring of erreichRinge()) {
      const spitze = turf.destination(erreichMitte, ring.properties.meter / 1000, 0, { units: "kilometers" }).geometry.coordinates;
      if (spitze[0] < bbox[0] || spitze[0] > bbox[2] || spitze[1] < bbox[1] || spitze[1] > bbox[3]) continue;
      befehle.push({ t: "text", dxf: "ERREICHBARKEIT_TEXT", c: expUtm(spitze), text: `${ring.properties.min} min` });
    }
  }
  // Luftbild: Linien über dem Foto, wie im Reiter angehakt (Gebäudeumrisse gelb, Flurstücksgrenzen hellblau, Straßen rosa)
  if (ansicht === "luftbild") {
    if (luftEl.gebaeude.checked && !luftEl.gebaeude.disabled) flaechen(osm("gebaeude", "nebengebaeude"), "GEBAEUDE_UMRISS", { stroke: "#ffd43b", sw: 0.12 });
    if (luftEl.flst.checked && !luftEl.flst.disabled) flaechen(flurstuecke.map((p) => ({ geometry: p.f.geometry })), "FLURSTUECKE_GRENZE", { stroke: "#5fd4ff", sw: 0.1 });
    if (luftEl.strassen.checked && !luftEl.strassen.disabled) flaechen(alkisFlaechen, "STRASSE_KANTE", { stroke: "#ff9ec0", sw: 0.1 }, (f) => ["strasse", "weg", "platz"].includes(f.properties.kat));
  }
  // Linien über den Gebäuden (Flurstücksgrenzen, Rasterlinien)
  if (rahmenLinien) {
    for (const f of rahmenLinien.liste) {
      for (const g of expTeile(f.geometry, bbox)) {
        if (g.type !== "Polygon") continue;
        const ringe = g.coordinates.map((r) => r.map(expUtm)).filter((r) => r.length >= 4);
        if (ringe.length) befehle.push({ t: "flaeche", dxf: rahmenLinien.dxf, ringe, stil: rahmenLinien.stil, nurBild: true });
      }
    }
  }
  const ecken = gebiet.geometry.coordinates[0].slice(0, 4).map(expUtm);
  const xs = ecken.map((p) => p[0]), ys = ecken.map((p) => p[1]);
  // Sonne und Schatten: das Bild (Schatten oder Besonnungsdauer) kommt als Pixelbild über den Plan
  const raster = ansicht === "sonne" && sonneLetztesBild ? sonneLetztesBild : null;
  return { ansicht, befehle, geo, raster, ecken, xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: Math.min(...ys), ymax: Math.max(...ys) };
}

// ---------- 4. Legende für den Plankopf ----------
function expLegende(ansicht) {
  const L = [];
  const fl = (fill, rand, text) => L.push({ art: "flaeche", fill, rand, text });
  const kr = (fill, rand, text) => L.push({ art: "kreis", fill, rand, text });
  const mk = (fill, kurz, text) => L.push({ art: "marke", fill, kurz, text });
  const vl = (stops, von, bis, text) => L.push({ art: "verlauf", stops, von, bis, text });
  const gebaeudeOrientierung = (farbe) => fl(farbe, null, "Gebäude (Orientierung)");
  const li = (farbe, text) => L.push({ art: "linie", fill: farbe, text });
  const a = ANSICHTEN[ansicht];
  switch (ansicht) {
    case "schwarzplan":
      if (schwarzModus === "hoehe") { for (const k of HOEHEN_KLASSEN) fl(k.farbe, "#666", `Gebäude ${k.name}`); }
      else { fl(FARBE.gebaeudeSchwarzplan, null, "Gebäude"); }
      break;
    case "strassen":
      if (alkisVorhanden) { fl(FARBE.netz.fahrbahn, null, "Straßenraum (Fahrbahn)"); fl(FARBE.netz.weg, FARBE.netz.kante, "Wege und Gehwege"); fl(FARBE.netz.platz, FARBE.netz.kante, "Plätze, Fußgängerzonen"); }
      else li(FARBE.strasseSchwarz, "Straße (Breite nach Art)");
      fl(FARBE.kontext, null, "Gebäude (Orientierung)");
      break;
    case "gruen":
      fl(FARBE.gruen, null, "Grünfläche"); fl(FARBE.wasser, null, "Wasser"); kr(FARBE.krone, FARBE.kroneRand, "Baumkrone"); kr(FARBE.kroneNadel, FARBE.kroneRand, "Nadelbaum");
      fl(FARBE.kontext, null, "Gebäude (Orientierung)");
      break;
    case "lageplan":
      if (lod2Vorhanden) fl("rgb(150,144,136)", FARBE.dachKante, "Dach (LoD2), nach Neigung schattiert");
      fl(FARBE.gebaeudeLageplan, FARBE.umriss, lod2Vorhanden ? "Gebäude ohne LoD2 (OSM)" : "Gebäude (OSM)");
      fl(FARBE.nebenLageplan, FARBE.umriss, "Nebengebäude");
      if (alkisVorhanden) { fl(FARBE.plan.fahrbahn, FARBE.plan.kante, "Fahrbahn"); fl(FARBE.plan.weg, FARBE.plan.kante, "Weg, Gehweg"); fl(FARBE.plan.platz, FARBE.plan.kante, "Platz, Fußgängerzone"); }
      else li(FARBE.strasseLageplan, "Straße (OSM-Linie)");
      fl(FARBE.gruen, null, "Grünfläche"); fl(FARBE.wasser, null, "Wasser"); kr(FARBE.krone, FARBE.kroneRand, "Baumkrone");
      break;
    case "infos":
      for (const gr of INFO_GRUPPEN) {
        if (!infoAn.has(gr.id) || !(infoZaehler[gr.id] > 0)) continue;
        if (gr.linie) li(gr.farbe, `${gr.name} (${infoZaehler[gr.id]})`); else mk(farbeVon(gr), gr.kurz, `${gr.name} (${infoZaehler[gr.id]})`);
      }
      if (erreichMitte && erreichEl.an.checked) for (const min of erreichRadien()) li(ERREICH_FARBE, `Gehzeit ${min} min = ${zahl(min * ERREICH_M_PRO_MIN)} m (Luftlinie)`);
      fl(FARBE.kontext, null, "Gebäude (Orientierung)");
      break;
    case "luftbild":
      if (luftEl.gebaeude.checked && !luftEl.gebaeude.disabled) li("#ffd43b", "Gebäudeumrisse (OSM)");
      if (luftEl.flst.checked && !luftEl.flst.disabled) li("#5fd4ff", "Flurstücksgrenzen (LGLN)");
      if (luftEl.strassen.checked && !luftEl.strassen.disabled) li("#ff9ec0", "Straßen, Wege, Plätze (LGLN)");
      break;
    case "3d":
      fl(FARBE.d3.dach, null, "Dach (LoD2)"); fl(FARBE.d3.wand, "#bbb", "Wand (LoD2)"); fl(FARBE.d3.ersatzDach, null, "Gebäude ohne LoD2 (OSM-Block)"); kr(FARBE.krone, FARBE.kroneRand, "Baum");
      break;
    case "sonne":
      if (sonneZustand.modus === "dauer") vl(SONNE_SKALA.map(([h, f]) => [h, f]), 0, 14, "Direkte Sonne in Stunden am Tag");
      else fl(`rgb(${SONNE_FARBE_SCHATTEN.join(",")})`, null, "Schatten (Gebäude, Bäume, Gelände)");
      fl(FARBE.gebaeudeLageplan, FARBE.umriss, "Gebäude"); fl(FARBE.plan.fahrbahn, FARBE.plan.kante, "Fahrbahn"); fl(FARBE.gruen, null, "Grünfläche"); fl(FARBE.wasser, null, "Wasser");
      break;
    case "flurstuecke": {
      const st = expFlstStufen();
      const eh = { brw: "Bodenrichtwert in €/m²", grz: "GRZ Bestand", gfz: "GFZ Bestand" }[flstModus];
      vl(st, st[0][0], st[2][0], eh);
      fl(FARBE.flst.keine, null, "keine Angabe (z. B. Verkehrsfläche)"); fl(FARBE.flst.gebaeude, null, "Gebäude (Orientierung)");
      break;
    }
    case "mieten": {
      const s = mietSumme || { von: 0, bis: 1 };
      vl([[s.von, FARBE.miet.rampe[0]], [(s.von + s.bis) / 2, FARBE.miet.rampe[1]], [s.bis, FARBE.miet.rampe[2]]], s.von, s.bis, "Nettokaltmiete Bestand in €/m² (Zensus 2022)");
      fl(FARBE.miet.keine, null, "keine Angabe"); fl(FARBE.flst.gebaeude, null, "Gebäude (Orientierung)");
      break;
    }
    case "wirtschaft": {
      const st = expWirtStufen();
      const eh = { ergebnis: "Neubau-Ergebnis in €/m² (rot Verlust, grün Gewinn)", rendite: "Rendite Bestand", ausnutzung: "Ausnutzung (Bestand zu Richtwert-GFZ)" }[wirtModus];
      vl(st, st[0][0], st[2][0], eh);
      fl(FARBE.flst.keine, null, "keine Angabe"); fl(FARBE.flst.gebaeude, null, "Gebäude (Orientierung)");
      break;
    }
  }
  if (EXP_PLAENE[ansicht].art === "plan") for (const d of importDateien) if (d.an && d.features) fl(IMPORT_FARBE, null, `Import: ${d.name}`);
  return L;
}

// ---------- Logo im Plankopf (schwarze Version, passt zu den strengen Plänen) ----------
// Wird einmal beim Start geladen. Klappt das nicht (z. B. beim Öffnen der Datei ohne Server), fehlt nur das Logo im Plankopf.
const EXP_LOGO = { url: null, bild: null, verhaeltnis: 392 / 2000 };
const expLogoBereit = (async () => {
  try {
    const blob = await (await fetch("logo/png/sitekick-logo-horizontal-schwarz.png")).blob();
    const url = await new Promise((fertig, fehler) => { const f = new FileReader(); f.onload = () => fertig(f.result); f.onerror = fehler; f.readAsDataURL(blob); });
    const bild = new Image();
    bild.src = url;
    await bild.decode();
    EXP_LOGO.url = url; EXP_LOGO.bild = bild;
  } catch (_) { /* nicht schlimm */ }
})();

// ---------- 5. Blatt: Aufteilung, Plankopf, Zeichnen ----------
function expEinstellungen() {
  return {
    format: exEl.format.value, richtung: exEl.richtung.value, massstab: Math.max(1, Math.round(Number(exEl.massstab.value) || 2000)),
    versatzX: Number(exEl.vx.value) || 0, versatzY: Number(exEl.vy.value) || 0,
    titel: exEl.titel.value.trim(), untertitel: exEl.untertitel.value.trim(), verfasser: exEl.verfasser.value.trim(), kurs: exEl.kurs.value.trim(),
    datum: exEl.datum.value.trim(), legende: exEl.legende.checked, dpi: Number(exEl.dpi.value)
  };
}

// Berechnet Blattgröße, Plankopf und Planfeld. Gibt auch an, ob das Gebiet im Maßstab auf das Planfeld passt.
const expZahlText = (v) => (Math.abs(v) >= 100 ? zahl(Math.round(v)) : Math.abs(v) >= 10 ? zahl(v, 0) : zahl(v, 1));

function expLayout(opt, szene) {
  const [fa, fb] = EXP_FORMATE[opt.format];
  const sf = { A4: 0.8, A3: 1, A2: 1.3, A1: 1.6, A0: 2 }[opt.format];     // Schriftfaktor je Blattgröße
  const gw = (szene.xmax - szene.xmin) * 1000 / opt.massstab, gh = (szene.ymax - szene.ymin) * 1000 / opt.massstab;   // Gebiet auf Papier in mm
  const versuch = (quer) => {
    const w = quer ? Math.max(fa, fb) : Math.min(fa, fb), h = quer ? Math.min(fa, fb) : Math.max(fa, fb);
    const rand = 10;
    const legende = opt.legende ? expLegende(szene.ansicht) : [];
    const innenB = w - 2 * rand;
    // Plankopf: Zeile 1 Titel, Mitte Legende und Nordpfeil/Leiste, unten Quellen
    const zeile1 = 15 * sf;
    const legBreite = innenB - 62 * sf;
    const spalten = Math.max(1, Math.floor(legBreite / (58 * sf)));
    const legZeilen = Math.ceil(legende.length / spalten) + (legende.some((e) => e.art === "verlauf") ? 1 : 0);
    const mitte = Math.max(legZeilen * 5.2 * sf + 8 * sf, 28 * sf);
    const quellen = expUmbruch(expQuellen(), 6 * sf, false, innenB - 6 * sf - 34 * sf);   // rechts unten bleibt Platz für das Logo
    const unten = quellen.length * 2.6 * sf + 4 * sf;
    const kopfH = zeile1 + mitte + unten;
    const feld = { x: rand, y: rand, w: innenB, h: h - 2 * rand - kopfH };
    return { w, h, rand, sf, kopfH, zeile1, mitte, unten, spalten, legende, quellen, feld, gw, gh };
  };
  const quer = versuch(true), hoch = versuch(false);
  // Anteil des Gebiets, der auf dem Blatt zu sehen ist (1 = alles)
  const sicht = (l) => (Math.min(gw, l.feld.w) * Math.min(gh, l.feld.h)) / (gw * gh);
  quer.sicht = sicht(quer); hoch.sicht = sicht(hoch);
  for (const l of [quer, hoch]) { l.ueberB = Math.max(0, gw - l.feld.w); l.ueberH = Math.max(0, gh - l.feld.h); l.passt = l.ueberB <= 0.5 && l.ueberH <= 0.5; }
  if (opt.richtung === "quer") return quer;
  if (opt.richtung === "hoch") return hoch;
  if (Math.abs(quer.sicht - hoch.sicht) > 0.001) return quer.sicht > hoch.sicht ? quer : hoch;
  return (gw >= gh) === (quer.feld.w / quer.feld.h >= 1) ? quer : hoch;   // gleich viel sichtbar: Blatt mit passender Form
}

function expQuellen() {
  return `${quellenzeile()} · Nicht vermessungsgenau. Koordinaten: ETRS89 / UTM 32 (EPSG:25832).`;
}

// Runde Länge für die Maßstabsleiste
// Größte runde Länge (1, 2, 5, 10 ... m), deren Leiste höchstens "maxMm" breit ist. So ragt sie nie aus dem Plankopf.
function expLeiste(k, maxMm) {
  let best = null;
  for (let zehner = 0.1; zehner <= 1e5; zehner *= 10) {
    for (const f of [1, 2, 5]) { const l = f * zehner; if (l * k <= maxMm && (best === null || l > best)) best = l; }
  }
  return best || 1;
}

function expZeichne(b, opt, szene, lay) {
  const k = 1000 / opt.massstab;                     // Millimeter je Meter in der Natur
  const sf = lay.sf, { w, h, rand, feld } = lay;
  // Ist das Gebiet größer als das Planfeld, zeigt das Blatt nur einen Ausschnitt. Mit dem Versatz (-100 bis 100 %) verschiebt man ihn bis an den Rand des Gebiets.
  // Versatz in Prozent (Export-Fenster) oder in Metern (Sammel-Export: derselbe Ausschnitt auf allen Blättern, höchstens bis zum Rand des Gebiets)
  let mx = (szene.xmin + szene.xmax) / 2 + ((opt.versatzX || 0) / 100) * (lay.ueberB / 2) / k;
  let my = (szene.ymin + szene.ymax) / 2 - ((opt.versatzY || 0) / 100) * (lay.ueberH / 2) / k;
  if (opt.versatzMeter) {
    const maxE = lay.ueberB > 0 ? lay.ueberB / 2 / k : 0, maxN = lay.ueberH > 0 ? lay.ueberH / 2 / k : 0;
    mx = (szene.xmin + szene.xmax) / 2 + Math.max(-maxE, Math.min(maxE, opt.versatzMeter[0]));
    my = (szene.ymin + szene.ymax) / 2 + Math.max(-maxN, Math.min(maxN, opt.versatzMeter[1]));
  }
  const cx = feld.x + feld.w / 2, cy = feld.y + feld.h / 2;
  const tr = ([E, N]) => [cx + (E - mx) * k, cy - (N - my) * k];
  const dunkel = "#111111";

  b.klemme(feld.x, feld.y, feld.w, feld.h);          // nichts ragt über das Planfeld hinaus
  // Pixelbild: bei Sonne und Schatten über dem Plan, beim Luftbild darunter (die Linien liegen dann auf dem Foto)
  const rasterZeichnen = () => {
    const r = szene.raster, [x0, y0] = tr([r.x0, r.y1]), [x1, y1] = tr([r.x0 + r.nx * r.c, r.y1 - r.ny * r.c]);
    b.bild(b.art === "png" ? r.leinwand : b.art === "svg" && r.svgUrl ? r.svgUrl : r.leinwand.toDataURL(r.format === "jpeg" ? "image/jpeg" : "image/png", 0.9), x0, y0, x1 - x0, y1 - y0);
  };
  if (szene.raster && szene.raster.unten) rasterZeichnen();
  // Plan
  for (const c of szene.befehle) {
    const s = c.stil;
    if (c.t === "flaeche") b.flaeche(c.ringe.map((r) => r.map(tr)), { ...s, sw: s.sw });
    else if (c.t === "linie") b.linie(c.pts.map(tr), { stroke: s.stroke, sw: s.swM ? s.swM * k : s.sw, cap: s.cap });
    else if (c.t === "kreis") { const [x, y] = tr(c.c); b.kreis(x, y, c.r * k, s); }
    else if (c.t === "text") { const [x, y] = tr(c.c); b.text(c.text, x, y - 0.9, { pt: 6.5 * sf, fett: true, anker: "m", farbe: ERREICH_FARBE }); }
    else if (c.t === "marke") {                                   // Symbol der Umgebung: Kreis mit Kürzel, feste Größe auf dem Papier
      const [x, y] = tr(c.c), rr = 1.7 * sf;
      b.kreis(x, y, rr, { fill: c.fill, stroke: "#ffffff", sw: 0.25 });
      b.text(c.kurz, x, y + rr * 0.34, { pt: (c.kurz.length > 1 ? 4.4 : 5.6) * sf, fett: true, anker: "m", farbe: "#ffffff" });
    }
  }
  if (szene.raster && !szene.raster.unten) rasterZeichnen();
  // Rahmen des Gebiets
  b.flaeche([szene.ecken.map(tr)], { stroke: dunkel, sw: 0.25 });
  b.klemmeEnde();
  b.rechteck(feld.x, feld.y, feld.w, feld.h, { stroke: dunkel, sw: 0.35 });
  b.rechteck(rand - 3, rand - 3, w - 2 * (rand - 3), h - 2 * (rand - 3), { stroke: dunkel, sw: 0.12 });

  // Plankopf
  const ky = feld.y + feld.h, kx = rand, kb = w - 2 * rand;
  b.rechteck(kx, ky, kb, lay.kopfH, { stroke: dunkel, sw: 0.35 });
  const z1 = ky + lay.zeile1, z2 = z1 + lay.mitte;
  b.linie([[kx, z1], [kx + kb, z1]], { stroke: dunkel, sw: 0.2 });
  b.linie([[kx, z2], [kx + kb, z2]], { stroke: dunkel, sw: 0.2 });
  // Zeile 1: Titel | Maßstab, Datum | Verfasser
  const sp1 = kx + kb * 0.46, sp2 = kx + kb * 0.7;
  b.linie([[sp1, ky], [sp1, z1]], { stroke: dunkel, sw: 0.2 });
  b.linie([[sp2, ky], [sp2, z1]], { stroke: dunkel, sw: 0.2 });
  b.text(opt.titel || EXP_PLAENE[szene.ansicht].name, kx + 3 * sf, ky + 7.2 * sf, { pt: 15 * sf, fett: true });
  if (opt.untertitel) b.text(opt.untertitel, kx + 3 * sf, ky + 12.2 * sf, { pt: 8 * sf, farbe: "#444" });
  b.text(szene.ohneMassstab ? "ohne Maßstab" : `Maßstab 1:${zahl(opt.massstab)}`, sp1 + 3 * sf, ky + 6.5 * sf, { pt: 10 * sf, fett: true });
  b.text(`${opt.datum}  ·  ${opt.format} ${lay.w > lay.h ? "quer" : "hoch"}`, sp1 + 3 * sf, ky + 12 * sf, { pt: 7.5 * sf, farbe: "#444" });
  b.text(opt.verfasser || "Verfasser: ________________", sp2 + 3 * sf, ky + 6.5 * sf, { pt: 8.5 * sf, fett: !!opt.verfasser });
  b.text(opt.kurs || "Kurs / Dozent: ________________", sp2 + 3 * sf, ky + 12 * sf, { pt: 7.5 * sf, farbe: "#444" });
  // Mitte: Legende links, Nordpfeil und Maßstabsleiste rechts
  const rechtsB = 62 * sf, spR = kx + kb - rechtsB;
  b.linie([[spR, z1], [spR, z2]], { stroke: dunkel, sw: 0.2 });
  if (lay.legende.length) {
    b.text("Legende", kx + 3 * sf, z1 + 4.6 * sf, { pt: 7 * sf, fett: true });
    const bz = 58 * sf;
    lay.legende.forEach((eintrag, i) => {
      const sp = Math.floor(i / Math.ceil(lay.legende.length / lay.spalten)), ze = i % Math.ceil(lay.legende.length / lay.spalten);
      const x = kx + 3 * sf + sp * bz, y = z1 + 10 * sf + ze * 5.2 * sf, s = 3.6 * sf;
      if (eintrag.art === "verlauf") {
        const stufen = 10, br = 2.6 * sf, hh = 3.2 * sf;
        for (let i = 0; i < stufen; i++) {
          const w = eintrag.von + ((eintrag.bis - eintrag.von) * i) / (stufen - 1);
          b.rechteck(x + i * br, y - hh + 0.4, br + 0.05, hh, { fill: expStufen(w, eintrag.stops) });
        }
        b.text(`${expZahlText(eintrag.von)} bis ${expZahlText(eintrag.bis)}`, x + stufen * br + 2 * sf, y - 0.2, { pt: 6.8 * sf });
        b.text(eintrag.text, x, y + 3.2 * sf, { pt: 6 * sf, farbe: "#444" });
        return;
      }
      const textBreite = bz - s - 5 * sf;                          // Platz für den Text in der Spalte
      if (eintrag.art === "marke") {
        b.kreis(x + s / 2, y - s / 2 + 0.3, s / 2, { fill: eintrag.fill, stroke: "#ffffff", sw: 0.2 });
        b.text(eintrag.kurz, x + s / 2, y - s / 2 + 0.3 + s * 0.17, { pt: (eintrag.kurz.length > 1 ? 4.2 : 5.2) * sf, fett: true, anker: "m", farbe: "#ffffff" });
        b.text(expKuerzen(eintrag.text, 6.8 * sf, textBreite), x + s + 2 * sf, y, { pt: 6.8 * sf });
        return;
      }
      if (eintrag.art === "kreis") b.kreis(x + s / 2, y - s / 2 + 0.3, s / 2, { fill: eintrag.fill, stroke: eintrag.rand, sw: 0.12 });
      else if (eintrag.art === "linie") b.rechteck(x, y - s / 2 - 0.3, s, 1.0 * sf, { fill: eintrag.fill });
      else b.rechteck(x, y - s + 0.4, s, s - 0.4, { fill: eintrag.fill, stroke: eintrag.rand || "#888", sw: 0.12 });
      b.text(expKuerzen(eintrag.text, 6.8 * sf, textBreite), x + s + 2 * sf, y, { pt: 6.8 * sf });
    });
  }
  if (szene.ohneMassstab) { b.text("Perspektivische Ansicht", spR + 4 * sf, z1 + 8 * sf, { pt: 7 * sf, farbe: "#444" }); b.text("ohne Nordpfeil und Maßstabsleiste", spR + 4 * sf, z1 + 12 * sf, { pt: 6 * sf, farbe: "#444" }); }
  // Nordpfeil (nur bei Plänen)
  if (!szene.ohneNord && !szene.ohneMassstab) {
  const nx = spR + 8 * sf, ny = z1 + 4 * sf, nh = 14 * sf;
  b.flaeche([[[nx, ny], [nx + 3 * sf, ny + nh], [nx, ny + nh * 0.72], [nx - 3 * sf, ny + nh]]], { fill: "#111", stroke: "#111", sw: 0.1 });
  b.text("N", nx, ny - 1 * sf, { pt: 9 * sf, fett: true, anker: "m" });
  // Maßstabsleiste
  const L = expLeiste(k, 34 * sf), lx = spR + 17 * sf, ly = z1 + 9 * sf, lb = L * k;
  for (let i = 0; i < 4; i++) b.rechteck(lx + (i * lb) / 4, ly, lb / 4, 1.8 * sf, { fill: i % 2 ? "#ffffff" : "#111111", stroke: "#111", sw: 0.15 });
  b.text("0", lx, ly - 1.2 * sf, { pt: 6.5 * sf, anker: "m" });
  b.text(`${zahl(L / 2)}`, lx + lb / 2, ly - 1.2 * sf, { pt: 6.5 * sf, anker: "m" });
  b.text(`${zahl(L)} m`, lx + lb, ly - 1.2 * sf, { pt: 6.5 * sf, anker: "m" });
  b.text(`M 1:${zahl(opt.massstab)}`, lx, ly + 7 * sf, { pt: 7 * sf });
  } else if (szene.ohneNord && !szene.ohneMassstab) {
    const L = expLeiste(k, 40 * sf), lx = spR + 10 * sf, ly = z1 + 9 * sf, lb = L * k;
    for (let i = 0; i < 4; i++) b.rechteck(lx + (i * lb) / 4, ly, lb / 4, 1.8 * sf, { fill: i % 2 ? "#ffffff" : "#111111", stroke: "#111", sw: 0.15 });
    b.text("0", lx, ly - 1.2 * sf, { pt: 6.5 * sf, anker: "m" });
    b.text(`${zahl(L)} m`, lx + lb, ly - 1.2 * sf, { pt: 6.5 * sf, anker: "m" });
    b.text(`M 1:${zahl(opt.massstab)}`, lx, ly + 7 * sf, { pt: 7 * sf });
  }
  // Unten: Quellen
  lay.quellen.forEach((zeile, i) => b.text(zeile, kx + 3 * sf, z2 + 4 * sf + i * 2.6 * sf, { pt: 6 * sf, farbe: "#333" }));
  // Logo rechts unten im Plankopf
  if (EXP_LOGO.url) {
    const lw = 28 * sf, lh = lw * EXP_LOGO.verhaeltnis;
    b.bild(b.art === "png" ? EXP_LOGO.bild : EXP_LOGO.url, kx + kb - 3 * sf - lw, z2 + (lay.unten - lh) / 2, lw, lh);
  }
  return { tr };
}

// ---------- 6. DXF ----------
const EXP_DXF_FARBEN = {
  GEBAEUDE: 7, GEBAEUDE_H_00_06: 9, GEBAEUDE_H_06_12: 8, GEBAEUDE_H_12_18: 253, GEBAEUDE_H_18_25: 251, GEBAEUDE_H_25_PLUS: 250, NEBENGEBAEUDE: 8, GEBAEUDE_UMRISS: 7, DACH_LOD2: 9, STRASSE_FAHRBAHN: 8, STRASSE_WEG: 40, STRASSE_PLATZ: 41, STRASSE_KANTE: 253, STRASSE_ACHSE: 8,
  FLURSTUECKE: 30, FLURSTUECKE_WIRTSCHAFT: 30, FLURSTUECKE_GRENZE: 8, MIETRASTER: 3, MIETRASTER_GRENZE: 8, GRUEN: 3, WASSER: 5, WASSER_LINIE: 5, BAUM_KRONE: 82, BAUM_STAMM: 34, GEBIETSRAHMEN: 1, ERREICHBARKEIT: 1, ERREICHBARKEIT_MITTE: 1, ERREICHBARKEIT_TEXT: 1, BESCHRIFTUNG: 7
};

// Text in Zeilen mit höchstens n Zeichen umbrechen (für DXF-Texte)
function expUmbruchZeichen(text, n) {
  const zeilen = [];
  let zeile = "";
  for (const wort of String(text).split(/\s+/).filter(Boolean)) {
    if (zeile && (zeile + " " + wort).length > n) { zeilen.push(zeile); zeile = wort; } else zeile = zeile ? zeile + " " + wort : wort;
  }
  if (zeile) zeilen.push(zeile);
  return zeilen;
}

// voreinstellung: "allplan" = absolute UTM-Koordinaten, "archicad" = lokaler Nullpunkt (UTM minus Bezugspunkt, Bezugskoordinaten als Text)
function expDxf(szene, opt, voreinstellung) {
  const archicad = voreinstellung === "archicad";
  const E0 = archicad ? Math.floor(szene.xmin / 100) * 100 : 0, N0 = archicad ? Math.floor(szene.ymin / 100) * 100 : 0;
  const verwendet = new Set(["GEBIETSRAHMEN", "BESCHRIFTUNG"]);
  const e = [];
  const paar = (c, w) => e.push(`${c}\n${w}`);
  const X = (v) => dxfZ(v - E0), Y = (v) => dxfZ(v - N0);
  const poly = (l, pts, zu) => {
    verwendet.add(l);
    paar(0, "POLYLINE"); paar(8, l); paar(66, 1); paar(70, zu ? 1 : 0);
    for (const [x, y] of pts) { paar(0, "VERTEX"); paar(8, l); paar(10, X(x)); paar(20, Y(y)); paar(30, "0.0"); }
    paar(0, "SEQEND"); paar(8, l);
  };
  const text = (l, x, y, hoehe, s) => { paar(0, "TEXT"); paar(8, l); paar(10, X(x)); paar(20, Y(y)); paar(30, "0.0"); paar(40, dxfZ(hoehe)); paar(1, dxfTxt(s)); };
  for (const c of szene.befehle) {
    if (c.nurBild) continue;                                              // Kanten und Umrisse liegen schon als Flächenränder vor
    if (c.t === "flaeche") for (const r of c.ringe) { const pts = r.slice(); if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop(); if (pts.length >= 3) poly(c.dxf, pts, true); }
    else if (c.t === "linie") poly(c.dxf, c.pts, false);
    else if (c.t === "text") { verwendet.add(c.dxf); text(c.dxf, c.c[0], c.c[1], Math.max(0.5, 2 * opt.massstab / 1000), c.text); }
    else if (c.t === "marke") {
      verwendet.add(c.dxf);
      const rM = 1.7 * opt.massstab / 1000;                              // Symbol: 3,4 mm Durchmesser im gewählten Maßstab
      paar(0, "CIRCLE"); paar(8, c.dxf); paar(10, X(c.c[0])); paar(20, Y(c.c[1])); paar(30, "0.0"); paar(40, dxfZ(rM));
      text(c.dxf, c.c[0] + rM * 1.3, c.c[1] - rM * 0.4, rM * 1.1, c.kurz);
    }
    else if (c.t === "kreis") { verwendet.add(c.dxf); paar(0, "CIRCLE"); paar(8, c.dxf); paar(10, X(c.c[0])); paar(20, Y(c.c[1])); paar(30, "0.0"); paar(40, dxfZ(c.r)); }
  }
  poly("GEBIETSRAHMEN", szene.ecken, true);
  const th = Math.max(0.5, 2 * opt.massstab / 1000);   // Texthöhe: 2 mm Schrift im gewählten Maßstab
  const y0 = szene.ymin - 4 * th;
  const einfach = (s) => s.replace(/©/g, "(c)").replace(/·/g, "-");
  const breiteZeichen = Math.max(40, Math.floor((szene.xmax - szene.xmin) / (th * 0.62)));   // Zeilenlänge so, dass der Text nicht breiter als der Plan wird
  const zeilen = [
    ...expUmbruch(`${opt.titel || EXP_PLAENE[szene.ansicht].name} - SiteKick, Stand ${opt.datum}` + (szene.ansicht === "sonne" ? " (Schatten und Besonnung nur in PDF, PNG und SVG)" : ""), 10, false, 1e6),
    ...expUmbruch(`Einheit Meter, 1 Einheit = 1 m. ETRS89 / UTM 32 (EPSG:25832).` + (archicad ? ` Lokaler Nullpunkt = E ${E0} N ${N0} (Bezugskoordinaten, UTM minus Nullpunkt).` : " Absolute UTM-Koordinaten."), 10, false, 1e6),
    ...expUmbruchZeichen(einfach(`Quellen: ${expQuellen()}`), breiteZeichen)
  ];
  zeilen.forEach((z, i) => text("BESCHRIFTUNG", szene.xmin, y0 - i * 1.6 * th, th, z));
  const namen = [...verwendet];
  const kopf = ["0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC",
    `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLTYPE\n70\n1\n0\nLTYPE\n2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0.0\n0\nENDTAB\n` +
    `0\nTABLE\n2\nLAYER\n70\n${namen.length}\n` + namen.map((n) => `0\nLAYER\n2\n${n}\n70\n0\n62\n${EXP_DXF_FARBEN[n] || 7}\n6\nCONTINUOUS`).join("\n") + `\n0\nENDTAB\n0\nENDSEC`,
    "0\nSECTION\n2\nENTITIES"];
  return kopf.join("\n") + "\n" + e.join("\n") + "\n0\nENDSEC\n0\nEOF\n";
}

// ---------- 7. Fenster ----------
function expDateiname(ansicht, opt, ende) {
  return `SiteKick-${EXP_PLAENE[ansicht].datei}-1zu${opt.massstab}.${ende}`;
}
function expHerunterladen(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function expSpeichereEinstellungen() {
  try { localStorage.setItem("ortsanalyse-export", JSON.stringify({ verfasser: exEl.verfasser.value, kurs: exEl.kurs.value, format: exEl.format.value, dpi: exEl.dpi.value })); } catch (_) { /* nicht schlimm */ }
}

// Vorschau und Hinweis neu zeichnen
function expAktualisiere() {
  if (!exSzene || EXP_PLAENE[exSzene.ansicht].art === "text") return;
  // Schnitt: Beschriftung hängt vom Maßstab ab, deshalb Zeichnung bei neuem Maßstab neu umwandeln
  const gewuenscht = Math.max(1, Math.round(Number(exEl.massstab.value) || 400));
  if (exSzene.ansicht === "schnitt" && exSzene.massstabText !== gewuenscht && !exSzene.wirdNeuGebaut) {
    exSzene.wirdNeuGebaut = true;
    expSzeneSchnitt(gewuenscht).then((s) => { if (exEl.dialog.open) { exSzene = s; expAktualisiere(); } }).catch(() => { exSzene.wirdNeuGebaut = false; });
  }
  const opt = expEinstellungen();
  const lay = expLayout(opt, exSzene);
  exSzene.lay = lay;
  const b = expSvg(lay.w, lay.h);
  expZeichne(b, opt, exSzene, lay);
  exEl.vorschau.innerHTML = b.ergebnis(true);
  const text = `${opt.format} ${lay.w > lay.h ? "quer" : "hoch"} (${lay.w} × ${lay.h} mm), Gebiet im Maßstab 1:${zahl(opt.massstab)}: ${zahl(lay.gw)} × ${zahl(lay.gh)} mm, Planfeld ${zahl(lay.feld.w)} × ${zahl(lay.feld.h)} mm.`;
  exEl.info.textContent = lay.passt ? text : `${text} Sichtbar sind ${zahl(lay.sicht * 100)} % des Gebiets, der Rest liegt außerhalb des Blatts.`;
  exEl.info.classList.remove("ex-warnung");
  // Ausschnitt-Regler nur zeigen, wenn das Gebiet nicht ganz aufs Blatt passt
  exEl.versatz.hidden = lay.passt;
  const svg = exEl.vorschau.firstElementChild;
  if (svg) svg.classList.toggle("ex-schiebbar", !lay.passt);
  exEl.dxfHinweis.hidden = exSzene.ansicht !== "sonne";
}
function expVerzoegert() { clearTimeout(exZeitgeber); exZeitgeber = setTimeout(expAktualisiere, 150); }

// Kleinster runder Maßstab-Nenner, bei dem das ganze Gebiet auf das Blatt passt (Ausrichtung automatisch oder wie gewählt)
function expPassenderNenner(opt, szene) {
  const breiteM = szene.xmax - szene.xmin, hoeheM = szene.ymax - szene.ymin;
  let besterNenner = Infinity;
  for (const quer of opt.richtung === "auto" ? [true, false] : [opt.richtung === "quer"]) {
    const l = expLayout({ ...opt, massstab: 5000, richtung: quer ? "quer" : "hoch" }, szene);
    const nenner = Math.max((breiteM * 1000) / (l.feld.w - 4), (hoeheM * 1000) / (l.feld.h - 4));
    besterNenner = Math.min(besterNenner, nenner);
  }
  const schritt = besterNenner < 1000 ? 50 : besterNenner < 5000 ? 100 : 500;
  return Math.max(10, Math.ceil(besterNenner / schritt) * schritt);
}

function expPassendWaehlen() {
  const opt = expEinstellungen();
  exEl.massstab.value = String(expPassenderNenner(opt, exSzene));
  exEl.vx.value = "0"; exEl.vy.value = "0";
  expAktualisiere();
  return true;
}

// ---------- 8. Reiter mit Bild statt Plan: 3D-Modell und Schnitt ----------
// Sie werden als Pixelbild (3D) oder als Zeichnung (Schnitt) auf das Blatt gesetzt. Dazu wird ein virtuelles "Gebiet" in Metern angelegt,
// damit Maßstab, Rahmen und Plankopf wie bei den Plänen funktionieren.
function expRasterSzene(ansicht, leinwand, x0, y1, breiteM, hoeheM, extra) {
  const ecken = [[x0, y1], [x0 + breiteM, y1], [x0 + breiteM, y1 - hoeheM], [x0, y1 - hoeheM]];
  return {
    ansicht, befehle: [], geo: [], ecken, xmin: x0, xmax: x0 + breiteM, ymin: y1 - hoeheM, ymax: y1,
    raster: { leinwand, x0, y1, nx: leinwand.width, ny: leinwand.height, c: breiteM / leinwand.width, ...(extra || {}) }, ohneNord: true
  };
}

function expSzene3d() {
  if (typeof d3 === "undefined" || !d3 || !d3.gruppe) throw new Error("Das 3D-Modell ist noch nicht gebaut.");
  d3Zeichne();
  const q = d3.renderer.domElement;
  const lw = document.createElement("canvas");
  lw.width = q.width; lw.height = q.height;
  lw.getContext("2d").drawImage(q, 0, 0);
  const s = expRasterSzene("3d", lw, 0, 1000, (1000 * q.width) / q.height, 1000);
  s.ohneMassstab = true;
  return s;
}

async function expSzeneSchnitt(massstab = 400) {
  if (!schnittDaten) throw new Error("Zuerst im Reiter „Schnitt & Ansicht“ eine Linie ziehen.");
  schnittBlick = null; zeichneSchnitt();                                       // ganze Zeichnung einpassen
  const vb = schnittSvg.getAttribute("viewBox").split(/\s+/).map(Number);
  const kopie = schnittSvg.cloneNode(true);
  kopie.querySelectorAll("text").forEach((x) => x.removeAttribute("style"));
  // Beschriftung: auf dem Papier etwa 2,2 mm hoch (6 Punkt), egal in welchem Maßstab
  const texte = [...kopie.querySelectorAll("text")];
  const groessen = texte.map((x) => parseFloat(x.getAttribute("font-size"))).filter((v) => v > 0);
  if (groessen.length) {
    const f = (2.2 * massstab / 1000) / Math.min(...groessen);
    texte.forEach((x) => { const fs = parseFloat(x.getAttribute("font-size")); if (fs > 0) x.setAttribute("font-size", fs * f); const sw = parseFloat(x.getAttribute("stroke-width")); if (sw > 0) x.setAttribute("stroke-width", sw * f); });
  }
  kopie.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  kopie.removeAttribute("style"); kopie.removeAttribute("id");
  const pxB = 4800, pxH = Math.round((pxB * vb[3]) / vb[2]);
  kopie.setAttribute("width", pxB); kopie.setAttribute("height", pxH);
  kopie.setAttribute("viewBox", vb.join(" "));
  const text = new XMLSerializer().serializeToString(kopie);
  const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(text);
  const bild = await new Promise((ok, fehl) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fehl(new Error("Schnittzeichnung konnte nicht umgewandelt werden")); i.src = svgUrl; });
  const lw = document.createElement("canvas");
  lw.width = pxB; lw.height = pxH;
  const c = lw.getContext("2d");
  c.fillStyle = "#fff"; c.fillRect(0, 0, pxB, pxH);
  c.drawImage(bild, 0, 0, pxB, pxH);
  // x = Abstand entlang der Linie (m), y = -z (Höhe)
  const s = expRasterSzene("schnitt", lw, vb[0], -vb[1], vb[2], vb[3], { svgUrl });
  s.massstabText = massstab;
  return s;
}

// ---------- 8b. Luftbild: Foto vom WMS des LGLN (UTM 32, 25 cm je Pixel) plus die angehakten Linien ----------
async function expLuftbildHolen(r, mProPixel) {
  const B = r.xmax - r.xmin, H = r.ymax - r.ymin;
  if (Math.max(B, H) / mProPixel > 5000) mProPixel = Math.max(B, H) / 5000;       // höchstens 5000 Pixel Kantenlänge
  const nx = Math.ceil(B / mProPixel), ny = Math.ceil(H / mProPixel);
  const lw = document.createElement("canvas");
  lw.width = nx; lw.height = ny;
  const c = lw.getContext("2d");
  const kachel = 1500, aufgaben = [];
  for (let px = 0; px < nx; px += kachel) {
    for (let py = 0; py < ny; py += kachel) {
      const w = Math.min(kachel, nx - px), h = Math.min(kachel, ny - py);
      const x0 = r.xmin + px * mProPixel, y1 = r.ymax - py * mProPixel;
      const url = `${DOP_WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ni_dop20&STYLES=&CRS=EPSG:25832&BBOX=${x0},${y1 - h * mProPixel},${x0 + w * mProPixel},${y1}&WIDTH=${w}&HEIGHT=${h}&FORMAT=image/jpeg`;
      aufgaben.push(fetch(url).then((a) => { if (!a.ok) throw new Error(`Luftbild-Dienst antwortet mit Fehler ${a.status}`); return a.blob(); })
        .then((blob) => createImageBitmap(blob).catch(() => { throw new Error("Für dieses Gebiet gibt es kein Luftbild (nur Niedersachsen)."); }))
        .then((bild) => c.drawImage(bild, px, py, w, h)));
    }
  }
  await Promise.all(aufgaben);
  return { lw, nx, ny, mProPixel };
}

async function expSzeneLuft() {
  const s = expSzene("luftbild");                                                  // Linien über dem Foto
  const r = sonneRahmenUtm();
  const { lw, nx, ny, mProPixel } = await expLuftbildHolen(r, 0.25);
  // Foto zuschneiden auf das Rechteck des Gebiets, mit Deckkraft und Schwarz-Weiß wie im Reiter
  const aus = document.createElement("canvas");
  aus.width = nx; aus.height = ny;
  const c = aus.getContext("2d");
  c.fillStyle = "#ffffff"; c.fillRect(0, 0, nx, ny);
  c.beginPath();
  r.ecken.forEach(([E, N], i) => { const x = (E - r.xmin) / mProPixel, y = (r.ymax - N) / mProPixel; if (i) c.lineTo(x, y); else c.moveTo(x, y); });
  c.closePath(); c.clip();
  if (luftEl.sw.checked) c.filter = "grayscale(1)";
  c.globalAlpha = Number(luftEl.deckkraft.value) || 1;
  c.drawImage(lw, 0, 0);
  s.raster = { leinwand: aus, x0: r.xmin, y1: r.ymax, nx, ny, c: mProPixel, format: "jpeg", unten: true };
  return s;
}

// ---------- 9. DXF in 3D (3D-Modell): LoD2-Flächen als 3DFACE, Gelände als Netz ----------
function expDxf3d(opt, voreinstellung) {
  const archicad = voreinstellung === "archicad";
  const r = sonneRahmenUtm();
  const E0 = archicad ? Math.floor(r.xmin / 100) * 100 : 0, N0 = archicad ? Math.floor(r.ymin / 100) * 100 : 0;
  const e = [];
  const paar = (c, w) => e.push(`${c}\n${w}`);
  const ebenen = { LOD2_WAND: 8, LOD2_DACH: 9, GEBAEUDE_OSM_ERSATZ: 150, GELAENDE: 3, GEBIETSRAHMEN: 1, BESCHRIFTUNG: 7 };
  const punkt = (c0, p) => { paar(c0, dxfZ(p[0] - E0)); paar(c0 + 10, dxfZ(p[1] - N0)); paar(c0 + 20, dxfZ(p[2])); };
  const flaeche = (l, a, b2, c2, d) => { paar(0, "3DFACE"); paar(8, l); punkt(10, a); punkt(11, b2); punkt(12, c2); punkt(13, d || c2); };
  const dreiecke = (l, ringe) => {
    const out = [];
    d3Triangulieren(ringe, out, (p) => p);                                       // flache Liste x, y, z je Ecke
    for (let i = 0; i + 8 < out.length; i += 9) flaeche(l, out.slice(i, i + 3), out.slice(i + 3, i + 6), out.slice(i + 6, i + 9));
  };
  for (const g of lod2Gebaeude) {
    g.waende.forEach((ringe) => dreiecke("LOD2_WAND", ringe));
    g.flaechen.forEach((ringe) => dreiecke("LOD2_DACH", ringe));
  }
  if (!lod2Vorhanden || osmFeatures.some((f) => (f.properties.kat === "gebaeude" || f.properties.kat === "nebengebaeude") && f.properties.lod2 !== 1)) {
    for (const gb of schnittGebaeudeListe()) {
      if (gb.art !== "ersatz") continue;
      gb.waende.forEach((w) => dreiecke("GEBAEUDE_OSM_ERSATZ", [w.flatMap((p) => p)]));
      gb.dach.forEach((d) => dreiecke("GEBAEUDE_OSM_ERSATZ", [d.flatMap((p) => p)]));
    }
  }
  if (gelaende) {
    const raster = 5;                                                           // 5-m-Netz aus dem Höhenmodell
    const nx = Math.ceil((r.xmax - r.xmin) / raster), ny = Math.ceil((r.ymax - r.ymin) / raster);
    const z = (i, j) => gelaendeHoehe(r.xmin + i * raster, r.ymin + j * raster) - 0.05;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = [r.xmin + i * raster, r.ymin + j * raster, z(i, j)], b2 = [a[0] + raster, a[1], z(i + 1, j)], c2 = [a[0] + raster, a[1] + raster, z(i + 1, j + 1)], d = [a[0], a[1] + raster, z(i, j + 1)];
      flaeche("GELAENDE", a, b2, c2, d);
    }
  }
  paar(0, "POLYLINE"); paar(8, "GEBIETSRAHMEN"); paar(66, 1); paar(70, 1);
  for (const p of r.ecken) { paar(0, "VERTEX"); paar(8, "GEBIETSRAHMEN"); paar(10, dxfZ(p[0] - E0)); paar(20, dxfZ(p[1] - N0)); paar(30, "0.0"); }
  paar(0, "SEQEND"); paar(8, "GEBIETSRAHMEN");
  const zeilen = [`3D-Modell - SiteKick, Stand ${opt.datum}`, `Einheit Meter. ETRS89 / UTM 32 (EPSG:25832), Hoehen ueber NHN.` + (archicad ? ` Lokaler Nullpunkt = E ${E0} N ${N0} (nur Lage, Hoehen unveraendert).` : " Absolute UTM-Koordinaten."),
    ...expUmbruchZeichen(`Quellen: ${expQuellen()}`.replace(/©/g, "(c)").replace(/·/g, "-"), 110)];
  zeilen.forEach((s, i) => { paar(0, "TEXT"); paar(8, "BESCHRIFTUNG"); paar(10, dxfZ(r.xmin - E0)); paar(20, dxfZ(r.ymin - N0 - 12 - i * 5)); paar(30, "0.0"); paar(40, "3.0"); paar(1, dxfTxt(s)); });
  const kopf = ["0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC",
    `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLTYPE\n70\n1\n0\nLTYPE\n2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0.0\n0\nENDTAB\n` +
    `0\nTABLE\n2\nLAYER\n70\n${Object.keys(ebenen).length}\n` + Object.entries(ebenen).map(([n, f]) => `0\nLAYER\n2\n${n}\n70\n0\n62\n${f}\n6\nCONTINUOUS`).join("\n") + `\n0\nENDTAB\n0\nENDSEC`,
    "0\nSECTION\n2\nENTITIES"];
  return kopf.join("\n") + "\n" + e.join("\n") + "\n0\nENDSEC\n0\nEOF\n";
}

// ---------- 10. Kennzahlen: PDF-Seiten und CSV ----------
function expKennzahlenZeilen() {
  if (typeof kennzahlenLetzte === "undefined" || !kennzahlenLetzte) throw new Error("Kennzahlen sind noch nicht berechnet.");
  const sauber = (s) => String(s).replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const reihen = [];
  for (const a of kennzahlenLetzte.abschnitte) {
    for (const z of a.zeilen || []) reihen.push({ abschnitt: sauber(a.titel), name: sauber(z[0]), wert: sauber(z[1]), hinweis: sauber(z[2] || "") });
    for (const bz of a.balken || []) reihen.push({ abschnitt: sauber(a.titel), name: sauber(bz.label), wert: sauber(bz.text), hinweis: "" });
  }
  return { reihen, hinweise: (kennzahlenLetzte.k.hinweise || []).map(sauber) };
}
function expKennzahlenCsv() {
  const { reihen } = expKennzahlenZeilen();
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return "﻿" + ["Abschnitt;Kennzahl;Wert;Hinweis", ...reihen.map((r) => [r.abschnitt, r.name, r.wert, r.hinweis].map(q).join(";")),
    "", q("Quellen") + ";" + q(expQuellen())].join("\r\n");
}
function expKennzahlenPdf(opt) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const { reihen, hinweise } = expKennzahlenZeilen();
  let y = 20;
  const seite = () => { doc.addPage(); y = 20; };
  const zeile = (text, pt, fett, farbe, einzug = 0, abstand = 5) => {
    doc.setFont("helvetica", fett ? "bold" : "normal"); doc.setFontSize(pt); doc.setTextColor(...expFarbe(farbe || "#000"));
    for (const z of doc.splitTextToSize(text, 170 - einzug)) { if (y > 277) seite(); doc.text(z, 20 + einzug, y); y += abstand; }
  };
  if (EXP_LOGO.url) doc.addImage(EXP_LOGO.url, "PNG", 150, 10, 40, 40 * EXP_LOGO.verhaeltnis);   // Logo oben rechts auf der ersten Seite
  zeile(`Kennzahlen – ${opt.titel || "SiteKick"}`, 16, true, "#000", 0, 8);
  zeile(`${opt.untertitel}   ·   Stand ${opt.datum}${opt.verfasser ? "   ·   " + opt.verfasser : ""}${opt.kurs ? "   ·   " + opt.kurs : ""}`, 8.5, false, "#444", 0, 7);
  let letzter = null;
  for (const r of reihen) {
    if (r.abschnitt !== letzter) { y += 3; zeile(r.abschnitt.toUpperCase(), 10, true, "#000", 0, 6); letzter = r.abschnitt; }
    if (y > 277) seite();
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(0, 0, 0);
    const teile = doc.splitTextToSize(r.name, 95);
    doc.text(teile, 20, y);
    doc.setFont("helvetica", "bold"); doc.text(String(r.wert), 190, y, { align: "right" });
    y += 4.6 * teile.length;
  }
  y += 4;
  zeile("Hinweise zur Genauigkeit", 10, true, "#000", 0, 6);
  for (const h of hinweise) zeile("• " + h, 8.5, false, "#222", 2, 4.2);
  y += 3;
  zeile(`Quellen: ${expQuellen()}`, 7.5, false, "#444", 0, 3.6);
  return doc.output("blob");
}

// ---------- 11. GeoJSON und CSV der Tabellen ----------
function expCsvTabelle(ansicht) {
  const q = (s) => (s == null ? "" : `"${String(s).replace(/"/g, '""')}"`);
  const n = (v, st = 2) => (v == null || Number.isNaN(v) ? "" : Number(v).toFixed(st).replace(".", ","));
  const kopf = [], zeilen = [];
  if (ansicht === "infos") {
    kopf.push("Gruppe", "Name", "Art", "Adresse", "Öffnungszeiten", "Betreiber", "Länge", "Breite");
    for (const f of infoFeatures) {
      if (f.geometry.type !== "Point" || !infoAn.has(f.properties.g)) continue;
      const p = f.properties;
      zeilen.push([q(infoGruppe[p.g].name), q(p.name), q(p.art), q(p.adr), q(p.zeiten), q(p.betreiber), n(f.geometry.coordinates[0], 6), n(f.geometry.coordinates[1], 6)]);
    }
  } else if (ansicht === "mieten") {
    kopf.push("Zelle", "Nettokaltmiete Bestand €/m²");
    for (const z of mietZellen) zeilen.push([q(z.id), n(z.miete)]);
  } else {
    kopf.push("Flurstück", "Flur", "Fläche m²", "Verkehrsfläche", "Bodenrichtwert €/m²", "Zone", "GRZ Bestand", "GFZ Bestand", "Miete Raster €/m²", "Baujahr (Raster)");
    if (ansicht === "wirtschaft") kopf.push("Neubau-Ergebnis €/m²", "Rendite Bestand", "Ausnutzung");
    flurstuecke.forEach((p, i) => {
      const hat = flstSumme && flstSumme.hatGebaeude && !p.verkehr && !p.rand;
      const z = [q(p.nr), q(p.flur), n(p.flaeche, 0), p.verkehr ? "ja" : "nein", p.zone ? n(p.zone.brw, 0) : "", q(p.zone ? p.zone.name || p.zone.bezeichnung || "" : ""), hat ? n(grzVon(p)) : "", hat ? n(gfzVon(p)) : "", n(p.miete), q(p.baujahr || "")];
      if (ansicht === "wirtschaft") { const r = wirtErgebnisse[i] || {}; z.push(n(r.neubau ? r.neubau.ergebnisJeM2 : null, 0), n(r.bestand && r.wfl > 0 ? r.bestand.rendite * 100 : null, 2), n(r.ausnutzung)); }
      zeilen.push(z);
    });
  }
  return "﻿" + [kopf.map(q).join(";"), ...zeilen.map((z) => z.join(";")), "", q("Quellen") + ";" + q(expQuellen())].join("\r\n");
}

// ---------- 12. Fenster öffnen ----------
const EXP_FORM_AUS = ["format", "richtung", "massstab", "legende"];

function expOeffne() {
  const ansicht = aktuelleAnsicht;
  const def = EXP_PLAENE[ansicht];
  if (!def || !gebiet || (!datenVorhanden && ansicht !== "luftbild")) return;
  exEl.status.textContent = ansicht === "luftbild" ? "Luftbild wird geladen …" : "Daten werden vorbereitet …";
  exEl.dialog.dataset.art = def.art;
  document.getElementById("ex-kopf-titel").textContent = `${def.name} exportieren`;
  document.querySelectorAll("#export-dialog [data-ziel]").forEach((k) => { k.hidden = !def.knoepfe.includes(k.dataset.ziel); });
  document.getElementById("ex-massstab-feld").hidden = def.art === "bild3d";
  exEl.passend.textContent = def.art === "bild3d" ? "Ganzes Bild aufs Blatt" : "Ganzes Gebiet aufs Blatt";
  exEl.dialog.showModal();
  setTimeout(async () => {
    try {
      exSzene = def.art === "luft" ? await expSzeneLuft() : def.art === "schnitt" ? await expSzeneSchnitt() : def.art === "bild3d" ? expSzene3d() : def.art === "plan" ? expSzene(ansicht) : { ansicht, befehle: [], geo: [] };
      let gespeichert = {};
      try { gespeichert = JSON.parse(localStorage.getItem("ortsanalyse-export") || "{}"); } catch (_) { /* nicht schlimm */ }
      exEl.titel.value = ansicht === "sonne"
        ? (sonneZustand.modus === "dauer" ? `Besonnungsdauer am ${sonneDatumText()}` : `Schattenplan ${sonneDatumText()}, ${uhrzeit(sonneZustand.minuten)} Uhr`)
        : def.name;
      const [west, sued, ost, nord] = turf.bbox(gebiet);
      const b = turf.distance([west, sued], [ost, sued]) * 1000, hh = turf.distance([west, sued], [west, nord]) * 1000;
      exEl.untertitel.value = `Untersuchungsgebiet ${zahl(b)} × ${zahl(hh)} m (${zahl(turf.area(gebiet) / 10000, 1)} ha)`;
      exEl.verfasser.value = gespeichert.verfasser || "";
      exEl.kurs.value = gespeichert.kurs || "";
      if (gespeichert.format && EXP_FORMATE[gespeichert.format]) exEl.format.value = gespeichert.format;
      if (gespeichert.dpi) exEl.dpi.value = gespeichert.dpi;
      exEl.datum.value = new Date().toLocaleDateString("de-DE");
      if (def.art !== "text") expPassendWaehlen();
      exEl.status.textContent = "";
    } catch (fehler) {
      console.error(fehler);
      exEl.status.textContent = "Export nicht möglich: " + fehler.message;
    }
  }, 30);
}

// Erzeugt eine Datei und gibt { blob, name, hinweis } zurück. Wird vom Export-Fenster und vom Sammel-Export benutzt.
async function expErzeuge(ziel, ansicht, szene, opt, lay) {
  const art = EXP_PLAENE[ansicht].art;
  const name = (ende, zusatz = "") => `SiteKick-${EXP_PLAENE[ansicht].datei}${art === "bild3d" || art === "text" ? "" : "-1zu" + opt.massstab}${zusatz}.${ende}`;
  const ohneMassstab = (n) => n.replace(/-1zu\d+/, "");
  if (ziel === "svg") {
    const b = expSvg(lay.w, lay.h); expZeichne(b, opt, szene, lay);
    return { blob: new Blob([b.ergebnis(false)], { type: "image/svg+xml" }), name: name("svg") };
  }
  if (ziel === "pdf") {
    if (!window.jspdf) throw new Error("PDF-Bibliothek nicht geladen (Internetverbindung?)");
    const b = expPdf(lay.w, lay.h); expZeichne(b, opt, szene, lay);
    return { blob: b.ergebnis(), name: name("pdf") };
  }
  if (ziel === "png") {
    let dpi = opt.dpi;
    const pixel = (lay.w / 25.4) * dpi * (lay.h / 25.4) * dpi;
    let hinweis = "";
    if (pixel > 120e6) { dpi = Math.floor(dpi * Math.sqrt(120e6 / pixel)); hinweis = ` (Auflösung auf ${dpi} dpi verringert, das Blatt ist sehr groß)`; }
    const b = expLeinwand(lay.w, lay.h, dpi); expZeichne(b, opt, szene, lay);
    const blob = await new Promise((r) => b.leinwand.toBlob(r, "image/png"));
    b.leinwand.width = 1; b.leinwand.height = 1;                       // Speicher der großen Leinwand freigeben
    return { blob, name: name("png"), hinweis: `PNG mit ${dpi} dpi${hinweis}` };
  }
  if (ziel === "dxf-allplan" || ziel === "dxf-archicad") {
    return { blob: new Blob([expDxf(szene, opt, ziel === "dxf-archicad" ? "archicad" : "allplan")], { type: "application/dxf" }), name: name("dxf", ziel === "dxf-archicad" ? "-ArchiCAD" : "-Allplan") };
  }
  if (ziel === "dxf3d-allplan" || ziel === "dxf3d-archicad") {
    return { blob: new Blob([expDxf3d(opt, ziel === "dxf3d-archicad" ? "archicad" : "allplan")], { type: "application/dxf" }), name: name("dxf", ziel === "dxf3d-archicad" ? "-ArchiCAD" : "-Allplan") };
  }
  if (ziel === "dxf-schnitt") return { blob: new Blob([baueDxf(schnittDaten)], { type: "application/dxf" }), name: ohneMassstab(name("dxf", "-CAD")) };
  if (ziel === "geojson") {
    const fc = { type: "FeatureCollection", name: `SiteKick ${EXP_PLAENE[ansicht].name}`, quellen: expQuellen(), features: szene.geo };
    return { blob: new Blob([JSON.stringify(fc)], { type: "application/geo+json" }), name: ohneMassstab(name("geojson")) };
  }
  if (ziel === "csv") return { blob: new Blob([expCsvTabelle(ansicht)], { type: "text/csv;charset=utf-8" }), name: ohneMassstab(name("csv")) };
  if (ziel === "kz-pdf") {
    if (!window.jspdf) throw new Error("PDF-Bibliothek nicht geladen (Internetverbindung?)");
    return { blob: expKennzahlenPdf(opt), name: name("pdf") };
  }
  if (ziel === "kz-csv") return { blob: new Blob([expKennzahlenCsv()], { type: "text/csv;charset=utf-8" }), name: name("csv") };
  throw new Error("Unbekanntes Format: " + ziel);
}

async function expSpeichern(ziel) {
  if (!exSzene) return;
  const opt = expEinstellungen();
  expSpeichereEinstellungen();
  exEl.status.textContent = "Wird erstellt …";
  await expLogoBereit;
  await new Promise((r) => setTimeout(r, 30));
  try {
    const d = await expErzeuge(ziel, exSzene.ansicht, exSzene, opt, exSzene.lay);
    expHerunterladen(d.blob, d.name);
    exEl.status.textContent = d.hinweis ? `${d.hinweis} gespeichert.` : "Gespeichert.";
  } catch (fehler) {
    console.error(fehler);
    exEl.status.textContent = "Speichern nicht möglich: " + fehler.message;
  }
}

// Knopf in der Seitenleiste: in den Reitern mit Export einschaltbar, sonst ausgegraut mit Erklärung
function aktualisiereExport() {
  const hinweis = { set textContent(v) { exEl.knopf.title = v; } };   // der Hinweis steht als Tooltip am Knopf
  exEl.knopf.hidden = aktuelleAnsicht === "sammel";   // im Sammel-Export gibt es den eigenen Knopf
  const hatExport = !!EXP_PLAENE[aktuelleAnsicht];
  const bereit = hatExport && (datenVorhanden || (aktuelleAnsicht === "luftbild" && !!gebiet)) && (aktuelleAnsicht !== "sonne" || !!sonneLetztesBild) && (aktuelleAnsicht !== "kennzahlen" || !!kennzahlenLetzte)
    && (aktuelleAnsicht !== "schnitt" || !!schnittDaten) && (aktuelleAnsicht !== "3d" || !!(d3 && d3.gruppe));
  exEl.knopf.disabled = !bereit;
  hinweis.textContent = !hatExport ? "In diesem Reiter gibt es keinen Export."
    : !datenVorhanden && aktuelleAnsicht !== "luftbild" ? "Erst ein Gebiet wählen und „Analysieren“ klicken."
    : !gebiet ? "Erst ein Gebiet wählen."
    : !bereit ? "Noch nicht bereit: " + ({ schnitt: "erst eine Linie ziehen.", "3d": "das 3D-Modell wird noch gebaut.", kennzahlen: "die Kennzahlen werden noch berechnet.", sonne: "die Berechnung läuft noch." }[aktuelleAnsicht] || "bitte kurz warten.")
    : `Exportiert „${EXP_PLAENE[aktuelleAnsicht].name}“ als ${[...new Set(EXP_PLAENE[aktuelleAnsicht].knoepfe.map((k) => EXP_KNOPF_NAMEN[k] || k))].join(", ")}.`;
}

exEl.knopf.addEventListener("click", expOeffne);
exEl.zu.addEventListener("click", () => exEl.dialog.close());
exEl.dialog.addEventListener("close", () => { exSzene = null; exEl.vorschau.innerHTML = ""; });
[exEl.format, exEl.richtung, exEl.legende].forEach((el) => el.addEventListener("change", expAktualisiere));
[exEl.massstab, exEl.vx, exEl.vy].forEach((el) => el.addEventListener("input", expVerzoegert));
[exEl.titel, exEl.untertitel, exEl.verfasser, exEl.kurs, exEl.datum].forEach((el) => el.addEventListener("input", expVerzoegert));
exEl.passend.addEventListener("click", expPassendWaehlen);
document.getElementById("ex-mitte").addEventListener("click", () => { exEl.vx.value = "0"; exEl.vy.value = "0"; expAktualisiere(); });

// Ausschnitt mit der Maus im Vorschaubild verschieben (Ziehen). Beim Ziehen wandert nur der Planinhalt (schnell), beim Loslassen wird neu gezeichnet.
let exZug = null;
exEl.vorschau.addEventListener("pointerdown", (e) => {
  const svg = e.target.closest("svg");
  if (!svg || !exSzene || !exSzene.lay || exSzene.lay.passt) return;
  const lay = exSzene.lay;
  exZug = { svg, x: e.clientX, y: e.clientY, vx0: Number(exEl.vx.value) || 0, vy0: Number(exEl.vy.value) || 0, mm: lay.w / svg.getBoundingClientRect().width, inhalt: svg.querySelector(".ex-inhalt") };
  try { svg.setPointerCapture(e.pointerId); } catch (_) { /* nicht schlimm */ }
  svg.classList.add("ex-zieht");
  e.preventDefault();
});
exEl.vorschau.addEventListener("pointermove", (e) => {
  if (!exZug) return;
  const lay = exSzene.lay;
  const dxMm = (e.clientX - exZug.x) * exZug.mm, dyMm = (e.clientY - exZug.y) * exZug.mm;
  const klemme = (v) => Math.max(-100, Math.min(100, v));
  const vx = lay.ueberB > 0.5 ? klemme(exZug.vx0 - (dxMm * 100) / (lay.ueberB / 2)) : exZug.vx0;
  const vy = lay.ueberH > 0.5 ? klemme(exZug.vy0 - (dyMm * 100) / (lay.ueberH / 2)) : exZug.vy0;
  exZug.vx = vx; exZug.vy = vy;
  const tx = lay.ueberB > 0.5 ? -((vx - exZug.vx0) * (lay.ueberB / 2)) / 100 : 0, ty = lay.ueberH > 0.5 ? -((vy - exZug.vy0) * (lay.ueberH / 2)) / 100 : 0;
  if (exZug.inhalt) exZug.inhalt.setAttribute("transform", `translate(${tx} ${ty})`);
});
const exZugEnde = () => {
  if (!exZug) return;
  const z = exZug; exZug = null;
  if (z.vx != null) { exEl.vx.value = String(Math.round(z.vx * 10) / 10); exEl.vy.value = String(Math.round(z.vy * 10) / 10); }
  expAktualisiere();
};
exEl.vorschau.addEventListener("pointerup", exZugEnde);
exEl.vorschau.addEventListener("pointercancel", exZugEnde);
document.querySelectorAll("#export-dialog [data-ziel]").forEach((k) => k.addEventListener("click", () => expSpeichern(k.dataset.ziel)));
