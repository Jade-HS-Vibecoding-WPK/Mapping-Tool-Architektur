/* ============================================================
   Ortsanalyse – Export (Reiter „Export“)
   Alle Inhalte werden als Blätter in Vektorgrafik (SVG, Maße in mm) aufgebaut:
   - 2D-Pläne maßstäblich (vektorplan.js), je Plan eigener Maßstab und Format
   - Schnitt maßstäblich mit Lageplan
   - 3D-Ansicht (als Bild, der einzige Nicht-Vektor-Teil)
   - Kennzahlen und Diagramme
   - Übersichtsblatt (Pläne klein, Kennzahlen, Diagramme)
   Jedes Blatt hat ein Schriftfeld mit Titel, Legende, Maßstab, Nordpfeil, Maßstabsleiste und Quellen.
   Ausgabe: eine mehrseitige PDF (jsPDF + svg2pdf, Vektor), einzelne PDFs oder PNGs (aus demselben Blatt gerastert).
   ============================================================ */

const PAPIER = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189] }; // mm (kurz, lang)
const DPI_JE_FORMAT = { A4: 300, A3: 300, A2: 300, A1: 200, A0: 150 }; // PNG: große Blätter mit weniger dpi (Speicher im Browser)
const MASSSTAEBE = { plan: [500, 1000, 2000, 2500, 5000], schnitt: [200, 500, 1000, 2000] };
const EXPORT_PLAENE = ["schwarzplan", "strassen", "gruen", "lageplan", "flurstuecke", "boden", "wohnen", "infra"];
const SCHRIFT = "helvetica";

const mmZuPx = (mm, dpi) => (mm / 25.4) * dpi;
const z2 = (v) => (Math.round(v * 100) / 100).toString();
const dateiDatum = () => new Date().toISOString().slice(0, 10);

// Fertige Dateien: erscheinen im Reiter „Export“ mit einem Knopf „Herunterladen“ (nichts wird automatisch gespeichert)
let fertigeDateien = []; // { name, groesse, url }
const FERTIG_MAX = 8;    // so viele bleiben in der Liste, ältere werden freigegeben

function herunterladen(blob, name) {
  fertigeDateien.unshift({ name, groesse: blob.size, url: URL.createObjectURL(blob) });
  for (const alt of fertigeDateien.splice(FERTIG_MAX)) URL.revokeObjectURL(alt.url);
  zeigeFertigeDateien(true);
}

const groesseText = (bytes) => (bytes >= 1e6 ? `${fmt(bytes / 1e6, 1)} MB` : `${fmt(Math.max(1, Math.round(bytes / 1e3)))} kB`);

function zeigeFertigeDateien(hinscrollen) {
  const box = document.getElementById("export-fertig");
  if (!box) return;
  box.hidden = !fertigeDateien.length;
  box.innerHTML = `<h4>Fertige Dateien</h4><ul>${fertigeDateien.map((d, i) => `<li class="${i === 0 ? "ist-neu" : ""}">
      <span class="export-datei">${htmlSicher(d.name)}</span><span class="export-groesse">${groesseText(d.groesse)}</span>
      <a class="btn btn-klein${i === 0 ? " btn-primary" : ""}" href="${d.url}" download="${htmlSicher(d.name)}">Herunterladen</a></li>`).join("")}</ul>`;
  if (hinscrollen) box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
const canvasAlsPng = (canvas) => new Promise((ok) => canvas.toBlob(ok, "image/png"));

// Textbreite in mm (Helvetica), für Umbruch und Kürzen
const messKontext = document.createElement("canvas").getContext("2d");
function textBreite(text, groesseMm, fett) {
  messKontext.font = `${fett ? "bold " : ""}100px Helvetica, Arial, sans-serif`;
  return (messKontext.measureText(text).width / 100) * groesseMm;
}
function umbrechenMm(text, groesse, breite, fett) {
  const zeilen = [];
  let zeile = "";
  for (const wort of String(text).split(/\s+/)) {
    const test = zeile ? `${zeile} ${wort}` : wort;
    if (textBreite(test, groesse, fett) > breite && zeile) { zeilen.push(zeile); zeile = wort; } else zeile = test;
  }
  if (zeile) zeilen.push(zeile);
  return zeilen;
}
function kuerzenMm(text, groesse, breite, fett) {
  if (textBreite(text, groesse, fett) <= breite) return text;
  while (text.length > 3 && textBreite(`${text}…`, groesse, fett) > breite) text = text.slice(0, -1);
  return `${text}…`;
}
const txt = (x, y, text, groesse, extra = "") =>
  `<text x="${z2(x)}" y="${z2(y)}"${/font-family=/.test(extra) ? "" : ` font-family="${SCHRIFT}"`} font-size="${z2(groesse)}" ${extra}>${svgText(text)}</text>`;

// ---------- Blatt: Maße ----------
function blattMasse(einst) {
  const [kurz, lang] = PAPIER[einst.format];
  const W = einst.quer ? lang : kurz, H = einst.quer ? kurz : lang;
  const f = Math.sqrt(kurz / 210); // Schrift und Ränder wachsen mit dem Format (A4 = 1, A0 = 2)
  const rand = 10 * f, schriftfeld = 34 * f;
  return { W, H, f, rand, schriftfeld, dpi: DPI_JE_FORMAT[einst.format], format: einst.format, quer: einst.quer,
    rahmen: { x: rand, y: rand, w: W - 2 * rand, h: H - 2 * rand - schriftfeld - 3 * f } }; // Zeichenfeld in mm
}

// Wie groß wird das Gebiet bzw. der Schnitt beim Maßstab auf dem Papier?
function groesseAufPapier(art, massstab) {
  if (art === "schnitt") {
    const erg = berechneSchnitt();
    if (!erg) return null;
    const s = schnittSvg(erg, { k: mmZuPx(1000 / massstab, 96) });
    return [s.W * PX_MM, s.H * PX_MM];
  }
  const [w, s, o, n] = analyseErgebnis.bbox;
  const [e1, n1] = gradZuUtm(w, s), [e2, n2] = gradZuUtm(o, n);
  return [((e2 - e1) * 1000) / massstab, ((n2 - n1) * 1000) / massstab];
}
function passt(art, einst) {
  const g = groesseAufPapier(art, einst.massstab);
  if (!g) return null;
  const r = blattMasse(einst).rahmen;
  return g[0] <= r.w + 0.5 && g[1] <= r.h + 0.5;
}
// kleinstes Format (und Ausrichtung), auf das der Inhalt passt
function passendesFormat(art, massstab) {
  for (const format of Object.keys(PAPIER)) {
    for (const quer of [true, false]) if (passt(art, { massstab, format, quer })) return { format, quer };
  }
  return { format: "A0", quer: true };
}

// ---------- Schriftfeld (Vektor) ----------
// Legendeneinträge eines Plans: [{ art, farbe, text }]
function exportLegende(plan) {
  if (plan === "infra" && infraDaten) {
    const e = Object.entries(INFRA_EBENEN).filter(([key]) => infraSichtbar[key]).map(([key, d]) => ({ art: "kreis-voll", farbe: d.farbe,
      text: `${d.name} (${fmt(INFRA_ARTEN.filter(([art, eb]) => eb === key).reduce((s, [art]) => s + (infraDaten.anzahl[art] || 0), 0))})` }));
    for (const [key, r] of Object.entries(INFRA_RADIEN)) if (radienSichtbar[key]) e.push({ art: "flaeche", farbe: r.farbe, deckkraft: 0.2, text: `${r.radius} m um ${r.name}` });
    return e;
  }
  const liste = plan === "wohnen" ? legendeWohnen() : planLegenden[plan] || [];
  return liste.filter((e) => e[0] !== "text").map(([art, wert, text]) => ({
    art, text, farbe: typeof wert === "string" ? (wert.match(/#[0-9a-f]{3,6}/i) || [wert])[0] : "#111111", staerke: typeof wert === "number" ? wert : 1 }));
}

function schriftfeldSvg(b, { titel, untertitel, massstab, legende, quelle, mitNord }) {
  const f = b.f, y0 = b.H - b.rand - b.schriftfeld, x0 = b.rand, breite = b.W - 2 * b.rand;
  const quellenH = 7 * f, feldH = b.schriftfeld - quellenH;
  const sp1 = breite * 0.3, sp3 = breite * 0.24, sp2 = breite - sp1 - sp3, pad = 3 * f;
  const t = [];
  const linie = (x1, y1, x2, y2, st) => `<line x1="${z2(x1)}" y1="${z2(y1)}" x2="${z2(x2)}" y2="${z2(y2)}" stroke="#111111" stroke-width="${z2(st)}"/>`;
  // Blattrahmen und Feldteilung
  t.push(`<rect x="${z2(x0)}" y="${z2(b.rahmen.y)}" width="${z2(breite)}" height="${z2(b.H - b.rand - b.rahmen.y)}" fill="none" stroke="#111111" stroke-width="${z2(0.35 * f)}"/>`);
  t.push(linie(x0, y0, x0 + breite, y0, 0.35 * f), linie(x0, y0 + feldH, x0 + breite, y0 + feldH, 0.18 * f));
  t.push(linie(x0 + sp1, y0, x0 + sp1, y0 + feldH, 0.18 * f), linie(x0 + sp1 + sp2, y0, x0 + sp1 + sp2, y0 + feldH, 0.18 * f));
  // Titel
  t.push(txt(x0 + pad, y0 + pad + 2.2 * f, "ORTSANALYSE", 2.2 * f, `font-weight="bold" fill="${PLAN_FARBEN.akzent}"`));
  t.push(txt(x0 + pad, y0 + pad + 8.5 * f, kuerzenMm(titel, 5 * f, sp1 - 2 * pad, true), 5 * f, `font-weight="bold" fill="#111111"`));
  umbrechenMm(untertitel, 2.3 * f, sp1 - 2 * pad).slice(0, 4).forEach((z, i) => t.push(txt(x0 + pad, y0 + pad + 13 * f + i * 3.2 * f, z, 2.3 * f, `fill="#333333"`)));
  // Legende in Spalten
  const zeileH = 3.6 * f, proSpalteMax = Math.max(1, Math.floor((feldH - 2 * pad) / zeileH));
  const spalten = Math.max(1, Math.ceil(legende.length / proSpalteMax)), spB = (sp2 - 2 * pad) / spalten, proSpalte = Math.ceil(legende.length / spalten) || 1;
  legende.forEach((e, i) => {
    const x = x0 + sp1 + pad + Math.floor(i / proSpalte) * spB, y = y0 + pad + (i % proSpalte) * zeileH;
    const zw = 6 * f, zh = 2.6 * f;
    if (e.art === "flaeche") t.push(`<rect x="${z2(x)}" y="${z2(y)}" width="${z2(zw)}" height="${z2(zh)}" fill="${e.farbe}"${e.deckkraft ? ` fill-opacity="${e.deckkraft}"` : ""} stroke="#999999" stroke-width="${z2(0.1 * f)}"/>`);
    else if (e.art === "linie") t.push(linie(x, y + zh / 2, x + zw, y + zh / 2, (0.15 * (e.staerke || 1) + 0.1) * f));
    else if (e.art === "strich") t.push(`<line x1="${z2(x)}" y1="${z2(y + zh / 2)}" x2="${z2(x + zw)}" y2="${z2(y + zh / 2)}" stroke="${e.farbe}" stroke-width="${z2(0.4 * f)}" stroke-dasharray="${z2(1.2 * f)} ${z2(0.6 * f)}"/>`);
    else t.push(`<circle cx="${z2(x + zw / 2)}" cy="${z2(y + zh / 2)}" r="${z2(zh / 2)}" fill="${e.farbe}" fill-opacity="${e.art === "kreis-voll" ? 1 : 0.3}"${e.art === "kreis-voll" ? "" : ` stroke="${e.farbe}" stroke-width="${z2(0.15 * f)}"`}/>`);
    t.push(txt(x + zw + 1.5 * f, y + zh - 0.2 * f, kuerzenMm(e.text, 2.2 * f, spB - zw - 3 * f), 2.2 * f, `fill="#111111"`));
  });
  // Maßstab, Nordpfeil, Maßstabsleiste
  const mx = x0 + sp1 + sp2 + pad;
  t.push(txt(mx, y0 + pad + 4.2 * f, massstab ? `M 1:${fmt(massstab)}` : "ohne Maßstab", 4.2 * f, `font-weight="bold" fill="#111111"`));
  t.push(txt(mx, y0 + pad + 8 * f, `${b.format} ${b.quer ? "quer" : "hoch"}`, 2.1 * f, `fill="#555555"`));
  if (mitNord) {
    const nx = x0 + breite - pad - 4 * f, ny = y0 + pad + f, nh = 11 * f;
    t.push(txt(nx, ny + 2.4 * f, "N", 2.6 * f, `font-weight="bold" text-anchor="middle" fill="#111111"`));
    t.push(`<path d="M${z2(nx)} ${z2(ny + 3.4 * f)}L${z2(nx + 2.8 * f)} ${z2(ny + nh)}L${z2(nx)} ${z2(ny + nh - 2.2 * f)}Z" fill="#111111"/>`);
    t.push(`<path d="M${z2(nx)} ${z2(ny + 3.4 * f)}L${z2(nx - 2.8 * f)} ${z2(ny + nh)}L${z2(nx)} ${z2(ny + nh - 2.2 * f)}Z" fill="#ffffff" stroke="#111111" stroke-width="${z2(0.15 * f)}"/>`);
  }
  if (massstab) {
    const leisteMax = sp3 - 2 * pad - 4 * f;
    const meter = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].filter((m) => (m * 1000) / massstab <= leisteMax).pop() || 5;
    const lmm = (meter * 1000) / massstab, ly = y0 + feldH - pad - 4 * f;
    for (let i = 0; i < 4; i++) t.push(`<rect x="${z2(mx + (i * lmm) / 4)}" y="${z2(ly)}" width="${z2(lmm / 4)}" height="${z2(1.4 * f)}" fill="${i % 2 ? "#ffffff" : "#111111"}"/>`);
    t.push(`<rect x="${z2(mx)}" y="${z2(ly)}" width="${z2(lmm)}" height="${z2(1.4 * f)}" fill="none" stroke="#111111" stroke-width="${z2(0.15 * f)}"/>`);
    t.push(txt(mx - 0.5 * f, ly + 4.2 * f, "0", 2 * f, `fill="#111111"`), txt(mx + lmm + 2 * f, ly + 4.2 * f, `${fmt(meter)} m`, 2 * f, `text-anchor="end" fill="#111111"`));
  }
  // Quellen: so klein, dass alles in drei Zeilen passt (Pflicht laut Lizenz, nichts abschneiden)
  const qText = `${quelle} · Erstellt mit Ortsanalyse am ${new Date().toLocaleDateString("de-DE")} · nicht vermessungsgenau`;
  let g = 1.7, zeilen;
  do { zeilen = umbrechenMm(qText, g * f, breite - 2 * pad); g -= 0.1; } while (zeilen.length > 3 && g > 0.9);
  const abstand = Math.min(2.1, (quellenH - 1) / zeilen.length) * f;
  zeilen.forEach((z, i) => t.push(txt(x0 + pad, y0 + feldH + 2.4 * f + i * abstand, z, (g + 0.1) * f, `fill="#444444"`)));
  return t.join("");
}

const quellText = () => document.getElementById("plan").dataset.quelle || "© OpenStreetMap-Mitwirkende (ODbL)";

// Schriften der eingebetteten SVG-Teile (Schnitt, Diagramme) für PDF und PNG gleich festlegen
const BLATT_STIL = `<style>text{font-family:${SCHRIFT}}.sz-text{font-family:courier;font-size:10px;fill:#111111}.sz-klein{font-size:9px;fill:#555555}
  .sz-fett{font-family:${SCHRIFT};font-weight:bold;font-size:12px;fill:${PLAN_FARBEN.akzent}}.dg-name{font-size:12px;fill:#111111}
  .dg-wert{font-size:11px;fill:#333333}.dg-achse{font-size:10px;fill:#555555}.dg-titel{font-size:15px;font-weight:bold;fill:#111111}
  .dg-unter{font-size:11px;fill:#555555}.dg-quelle{font-size:9px;fill:#777777}</style>`;

const blattSvg = (b, inhalt) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${b.W}" height="${b.H}" viewBox="0 0 ${b.W} ${b.H}">`
  + `${BLATT_STIL}<rect width="${b.W}" height="${b.H}" fill="#ffffff"/>${inhalt}</svg>`;

// Inneres eines SVG (ohne äußeres <svg> und ohne eigene <style>-Angaben)
const svgInneres = (svg) => svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<style>[\s\S]*?<\/style>/g, "");

// ---------- Die Blätter ----------
let blattNr = 0;

function blattPlan(plan, einst) {
  const b = blattMasse(einst);
  const inhalt = vektorPlanSvg(plan, { rahmen: b.rahmen, massstab: einst.massstab, id: `plan${++blattNr}` });
  const unter = plan === "wohnen"
    ? `${ZENSUS_MERKMALE[zensusMerkmal].name}${zensusMerkmal === "vergleich" ? ` (${VERGLEICH_FELDER[vergleichFeld()].text})` : ""}, Zensus 2022`
    : "Untersuchungsgebiet rot gestrichelt";
  return { b, name: plan, svg: blattSvg(b, inhalt + schriftfeldSvg(b, { titel: PLAN_TITEL[plan], untertitel: unter, massstab: einst.massstab,
    legende: exportLegende(plan), quelle: quellText(), mitNord: true })) };
}

function blattSchnitt(einst) {
  const b = blattMasse(einst);
  const erg = berechneSchnitt();
  const s = schnittSvg(erg, { k: mmZuPx(1000 / einst.massstab, 96) });
  const bw = s.W * PX_MM, bh = s.H * PX_MM;
  const dx = b.rahmen.x + Math.max(0, (b.rahmen.w - bw) / 2), dy = b.rahmen.y + Math.max(0, (b.rahmen.h - bh) / 2);
  const id = `schnitt${++blattNr}`;
  const innen = svgInneres(s.svg).replace(/sz-streifen/g, `${id}s`).replace(/sz-pfeil/g, `${id}p`);
  // kleiner Lageplan oben rechts
  const lageB = 170, lageMm = 45 * b.f, lageS = lageMm / lageB;
  const lage = svgInneres(schnittLageSvg(lageB)).replace(/sz-pfeil/g, `${id}l`);
  const inhalt = `<defs><clipPath id="${id}"><rect x="${z2(b.rahmen.x)}" y="${z2(b.rahmen.y)}" width="${z2(b.rahmen.w)}" height="${z2(b.rahmen.h)}"/></clipPath></defs>`
    + `<g clip-path="url(#${id})"><g transform="translate(${z2(dx)} ${z2(dy)}) scale(${PX_MM.toFixed(5)})">${innen}</g></g>`
    + `<g transform="translate(${z2(b.rahmen.x + b.rahmen.w - lageMm - 2)} ${z2(b.rahmen.y + 2)}) scale(${lageS.toFixed(5)})">${lage}</g>`;
  return { b, name: "schnitt", svg: blattSvg(b, inhalt + schriftfeldSvg(b, { titel: "Schnitt A–A′", untertitel: `${schnittTitel(erg).replace("Schnitt A–A′ · ", "")}. Schwarz: geschnitten, grau: Ansicht.`,
    massstab: einst.massstab, legende: [{ art: "flaeche", farbe: "#111111", text: "Schnitt: Gelände und Gebäude" },
      { art: "flaeche", farbe: "#c3c3c1", text: "Ansicht, je weiter weg desto heller" }, { art: "kreis", farbe: "#4a5a44", text: "Bäume (Höhe geschätzt)" }],
    quelle: quellText(), mitNord: false })) };
}

// 3D: aktuelle Kamera in hoher Auflösung zeichnen (Seitenverhältnis des Zeichenfelds)
function dreidBild(breitePx, hoehePx) {
  if (!dreid) return null;
  const { renderer, scene, camera } = dreid;
  const groesse = renderer.getSize(new THREE.Vector2()), ratio = renderer.getPixelRatio(), aspekt = camera.aspect;
  renderer.setPixelRatio(1);
  renderer.setSize(breitePx, hoehePx, false);
  camera.aspect = breitePx / hoehePx; camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  renderer.setPixelRatio(ratio);
  renderer.setSize(groesse.x, groesse.y, false);
  camera.aspect = aspekt; camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  return url;
}

function blatt3d(einst) {
  const b = blattMasse(einst);
  const r = b.rahmen;
  const breitePx = Math.min(4000, Math.round(mmZuPx(r.w, 200))), hoehePx = Math.round((breitePx * r.h) / r.w);
  const url = dreidBild(breitePx, hoehePx);
  const inhalt = url ? `<image x="${z2(r.x)}" y="${z2(r.y)}" width="${z2(r.w)}" height="${z2(r.h)}" preserveAspectRatio="xMidYMid meet" href="${url}" xlink:href="${url}"/>` : "";
  return { b, name: "3d", svg: blattSvg(b, inhalt + schriftfeldSvg(b, { titel: "3D-Modell", untertitel: "Axonometrie der aktuellen Ansicht, nicht maßstäblich. Gebäude LoD2 bzw. OSM-Klötze, Bäume aus OSM.",
    massstab: null, legende: [{ art: "flaeche", farbe: "#f7f7f5", text: "Wand (LoD2)" }, { art: "flaeche", farbe: "#c9c6c1", text: "Dach (LoD2)" },
      { art: "flaeche", farbe: "#eac3b9", text: "Ersatz-Klotz (OSM-Geschosse)" }, { art: "kreis", farbe: "#5b7f4f", text: "Baum" }], quelle: quellText(), mitNord: false })) };
}

// Kennzahlen als Tabelle (Vektor-Text)
function kennzahlTabelle(k) {
  const z = k.zensus || {};
  const gruppen = [
    ["Gebiet", [["Gebietsfläche (brutto)", flaecheText(k.gebietM2)], ["Bauland (netto)", flaecheText(k.nettoM2)]]],
    ["Bebauung und Dichte", [["Gebäude", fmt(k.gebaeudeAnzahl)], ["GRZ brutto / netto", `${fmt(k.grzBrutto, 2)} / ${fmt(k.grzNetto, 2)}`],
      ["GFZ brutto / netto", `${fmt(k.gfzBrutto, 2)} / ${fmt(k.gfzNetto, 2)}`], ["Mittlere Geschosszahl", fmt(k.mittlereGeschosse, 1)]]],
    ["Freiraum und Straßen", [["Grünanteil", prozent(k.gruenAnteil)], ["Einzelbäume (OSM)", fmt(k.baeume)], ["Straßenlänge", `${fmt(k.strassenGesamt)} m`]]]
  ];
  if (k.parzellenAnzahl) gruppen.push(["Parzellen und Bodenwert", [["Flurstücke", fmt(k.parzellenAnzahl)], ["Mittlere Flurstücksgröße", `${fmt(k.parzellenMittel)} m²`],
    ...(k.brwMittel ? [["Mittlerer Bodenrichtwert", `${fmt(k.brwMittel)} €/m²`]] : [])]]);
  const wohnen = [];
  if (z.miete) wohnen.push(["Nettokaltmiete (Mittel)", `${fmt(z.miete.mittel, 2)} €/m²`]);
  if (z.leerstand) wohnen.push(["Leerstandsquote", `${fmt(z.leerstand.mittel, 1)} %`]);
  if (z.flaecheWohnung) wohnen.push(["Fläche je Wohnung", `${fmt(z.flaecheWohnung.mittel)} m²`]);
  if (z.eigentum) wohnen.push(["Eigentümerquote", `${fmt(z.eigentum.mittel)} %`]);
  if (wohnen.length) gruppen.push(["Wohnen (Zensus 2022)", wohnen]);
  if (k.infraAbdeckung) gruppen.push(["Infrastruktur (OSM)", Object.entries(INFRA_RADIEN).map(([key, r]) => [`${r.radius} m um ${r.name}`, prozent(k.infraAbdeckung[key], 0)])]);
  return gruppen;
}

function tabelleSvg(gruppen, x, y, breite, f) {
  const t = [];
  let yy = y;
  for (const [titel, zeilen] of gruppen) {
    t.push(txt(x, yy + 3 * f, titel.toUpperCase(), 2.3 * f, `font-weight="bold" fill="#111111"`));
    t.push(`<line x1="${z2(x)}" y1="${z2(yy + 4.2 * f)}" x2="${z2(x + breite)}" y2="${z2(yy + 4.2 * f)}" stroke="#111111" stroke-width="${z2(0.2 * f)}"/>`);
    yy += 5 * f;
    for (const [name, wert] of zeilen) {
      t.push(txt(x, yy + 3 * f, name, 2.3 * f, `fill="#333333"`), txt(x + breite, yy + 3 * f, wert, 2.3 * f, `text-anchor="end" font-family="courier" fill="#111111"`));
      t.push(`<line x1="${z2(x)}" y1="${z2(yy + 4.3 * f)}" x2="${z2(x + breite)}" y2="${z2(yy + 4.3 * f)}" stroke="#dddddd" stroke-width="${z2(0.1 * f)}"/>`);
      yy += 4.6 * f;
    }
    yy += 3 * f;
  }
  return { svg: t.join(""), hoehe: yy - y };
}

// Diagramme in ein Feld setzen (Raster, gleiche Größe)
function diagrammeSvg(liste, feld, spalten) {
  if (!liste.length) return "";
  const zeilen = Math.ceil(liste.length / spalten);
  const luecke = feld.w * 0.03;
  const zellB = (feld.w - luecke * (spalten - 1)) / spalten;
  const hoehen = liste.map((d) => +diagrammSvg(d, true).match(/height="([\d.]+)"/)[1]);
  let s = zellB / DG.breite;
  const zeilenH = [];
  for (let i = 0; i < zeilen; i++) zeilenH.push(Math.max(...hoehen.slice(i * spalten, i * spalten + spalten)));
  const gesamt = zeilenH.reduce((a, h) => a + h, 0);
  s = Math.min(s, (feld.h - luecke * (zeilen - 1)) / gesamt);
  let y = feld.y;
  return liste.map((d, i) => {
    const zeile = Math.floor(i / spalten), spalte = i % spalten;
    if (spalte === 0 && zeile > 0) y += zeilenH[zeile - 1] * s + luecke;
    const x = feld.x + spalte * (zellB + luecke);
    return `<g transform="translate(${z2(x)} ${z2(y)}) scale(${s.toFixed(5)})">${svgInneres(diagrammSvg(d, true)).replace(/<rect width="[^"]+" height="[^"]+" fill="#fff"\/>/, "")}</g>`;
  }).join("");
}

function blattKennzahlen(einst) {
  const b = blattMasse(einst);
  const k = analyseErgebnis.kennzahlen, r = b.rahmen, f = b.f;
  const tabB = Math.min(r.w * 0.3, 95 * f);
  const tab = tabelleSvg(kennzahlTabelle(k), r.x + 2 * f, r.y + 2 * f, tabB - 4 * f, f);
  const feld = { x: r.x + tabB + 6 * f, y: r.y + 2 * f, w: r.w - tabB - 8 * f, h: r.h - 4 * f };
  const spalten = feld.w / feld.h > 1.6 ? 4 : feld.w / feld.h > 0.9 ? 3 : 2;
  const inhalt = tab.svg + diagrammeSvg(diagrammListe, feld, spalten);
  return { b, name: "kennzahlen", svg: blattSvg(b, inhalt + schriftfeldSvg(b, { titel: "Kennzahlen und Diagramme",
    untertitel: "Werte des Untersuchungsgebiets. GRZ/GFZ brutto: bezogen auf die Gebietsfläche, netto: auf das Bauland.",
    massstab: null, legende: [], quelle: quellText(), mitNord: false })) };
}

// Übersicht: vier Pläne klein, Kennzahlen und drei Diagramme auf einem Blatt
function blattUebersicht(einst) {
  const b = blattMasse(einst);
  const r = b.rahmen, f = b.f, luecke = 5 * f;
  const planFeld = { x: r.x + luecke, y: r.y + luecke, w: r.w * 0.6 - 2 * luecke, h: r.h - 2 * luecke };
  const plaene = ["schwarzplan", "strassen", "gruen", "lageplan"];
  const zellB = (planFeld.w - luecke) / 2, zellH = (planFeld.h - luecke) / 2 - 5 * f;
  const [gw, gh] = groesseAufPapier("plan", 1000); // Gebiet in mm bei 1:1000
  // gemeinsamer, üblicher Maßstab, bei dem das Gebiet in die Felder passt
  const noetig = Math.max(gw / zellB, gh / zellH) * 1000;
  const massstab = [1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000, 15000, 20000, 25000].find((m) => m >= noetig) || Math.ceil(noetig / 5000) * 5000;
  const teile = plaene.map((p, i) => {
    const x = planFeld.x + (i % 2) * (zellB + luecke), y = planFeld.y + Math.floor(i / 2) * (zellH + 5 * f + luecke);
    const rahmen = { x, y: y + 5 * f, w: zellB, h: zellH };
    return txt(x, y + 3.5 * f, PLAN_TITEL[p], 3 * f, `font-weight="bold" fill="#111111"`)
      + vektorPlanSvg(p, { rahmen, massstab, id: `ueb${++blattNr}` })
      + `<rect x="${z2(rahmen.x)}" y="${z2(rahmen.y)}" width="${z2(rahmen.w)}" height="${z2(rahmen.h)}" fill="none" stroke="#cccccc" stroke-width="${z2(0.15 * f)}"/>`;
  }).join("");
  const rechtsX = r.x + r.w * 0.6 + luecke, rechtsB = r.w * 0.4 - 2 * luecke;
  const tab = tabelleSvg(kennzahlTabelle(analyseErgebnis.kennzahlen).slice(0, 4), rechtsX, r.y + luecke, rechtsB, f);
  const auswahl = diagrammListe.filter((d) => ["flaechen", "nutzung", "geschosse"].includes(d.id));
  const feld = { x: rechtsX, y: r.y + luecke + tab.hoehe + 2 * f, w: rechtsB, h: r.h - 2 * luecke - tab.hoehe - 2 * f };
  return { b, name: "uebersicht", svg: blattSvg(b, teile + tab.svg + diagrammeSvg(auswahl, feld, 1) + schriftfeldSvg(b, { titel: "Ortsanalyse – Übersicht",
    untertitel: `Schwarzplan, Straßennetz, Grün und Lageplan je M 1:${fmt(massstab)}, Kennzahlen und Diagramme.`,
    massstab, legende: [], quelle: quellText(), mitNord: true })) };
}

// ---------- Ausgabe ----------
function blattErzeugen(eintrag) {
  const e = exportStand[eintrag];
  if (EXPORT_PLAENE.includes(eintrag)) return [blattPlan(eintrag, e)];
  if (eintrag === "schnitt") return [blattSchnitt(e)];
  if (eintrag === "3d") return [blatt3d(e)];
  if (eintrag === "kennzahlen") return [blattKennzahlen(e)];
  if (eintrag === "uebersicht") return [blattUebersicht(e)];
  return [];
}

// Zeichen, die die PDF-Standardschrift nicht kennt, ersetzen
const pdfZeichen = (t) => t.replace(/′/g, "'").replace(/−/g, "-").replace(/≈/g, "ca.").replace(/[▽▼]/g, "");

async function blaetterAlsPdf(blaetter, meldung) {
  const { jsPDF } = window.jspdf;
  let doc = null;
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;left:-30000px;top:0;";
  document.body.appendChild(box);
  try {
    for (const [i, bl] of blaetter.entries()) {
      meldung(`PDF: Blatt ${i + 1} von ${blaetter.length} (${bl.name}) …`);
      await new Promise((r) => setTimeout(r, 20));
      const ausrichtung = bl.b.W > bl.b.H ? "l" : "p";
      if (!doc) doc = new jsPDF({ orientation: ausrichtung, unit: "mm", format: [bl.b.W, bl.b.H], compress: true });
      else doc.addPage([bl.b.W, bl.b.H], ausrichtung);
      box.innerHTML = bl.svg;
      const el = box.querySelector("svg");
      el.querySelectorAll("text").forEach((t) => { t.textContent = pdfZeichen(t.textContent); });
      await doc.svg(el, { x: 0, y: 0, width: bl.b.W, height: bl.b.H });
    }
  } finally { box.remove(); }
  doc.setProperties({ title: "Ortsanalyse", creator: "Ortsanalyse (Web-Tool)", subject: quellText() });
  return doc.output("blob");
}

async function blattAlsPng(bl) {
  const b = bl.b, breite = Math.round(mmZuPx(b.W, b.dpi)), hoehe = Math.round(mmZuPx(b.H, b.dpi));
  const svg = bl.svg.replace(`width="${b.W}" height="${b.H}"`, `width="${breite}" height="${hoehe}"`);
  const bild = new Image();
  bild.src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  await bild.decode();
  const c = document.createElement("canvas");
  c.width = breite; c.height = hoehe;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Bild zu groß für den Browser");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, breite, hoehe);
  ctx.drawImage(bild, 0, 0, breite, hoehe);
  URL.revokeObjectURL(bild.src);
  const blob = await canvasAlsPng(c);
  if (!blob) throw new Error("Bild zu groß für den Browser");
  return blob;
}

const dateiname = (eintrag, endung) => {
  const e = exportStand[eintrag];
  return `ortsanalyse_${eintrag}${e.massstab && !["3d", "kennzahlen"].includes(eintrag) ? `_1-${e.massstab}` : ""}_${e.format}_${dateiDatum()}.${endung}`;
};

// ---------- Reiter „Export“ ----------
const EXPORT_EINTRAEGE = [
  ...EXPORT_PLAENE.map((p) => ({ id: p, art: "plan" })),
  { id: "schnitt", art: "schnitt" },
  { id: "3d", art: "bild" },
  { id: "kennzahlen", art: "bild" },
  { id: "uebersicht", art: "bild" }
];
const EXPORT_NAMEN = { schnitt: "Schnitt A–A′", "3d": "3D-Ansicht", kennzahlen: "Kennzahlen und Diagramme", uebersicht: "Übersichtsblatt" };
let exportStand = {};      // je Eintrag { an, massstab, format, quer }
let exportFuerAnalyse = null;

// Welche Inhalte gibt es (mit Daten)?
function exportVerfuegbar(id) {
  if (!analyseErgebnis) return false;
  if (id === "flurstuecke") return mitParzellen;
  if (id === "boden") return !!brwDaten;
  if (id === "wohnen") return Object.keys(zensusKlassen).length > 0;
  if (id === "infra") return !!infraDaten;
  if (id === "schnitt") return !!(schnitt.a && schnitt.b);
  if (id === "3d") return !!dreid;
  return true;
}

// Schnitt: kleinste Maßstabszahl, bei der er auf A4–A1 passt (lange Schnitte sonst sehr groß)
function schnittVoreinstellung() {
  if (exportVerfuegbar("schnitt")) {
    for (const massstab of MASSSTAEBE.schnitt) {
      for (const format of ["A4", "A3", "A2", "A1"]) {
        for (const quer of [true, false]) if (passt("schnitt", { massstab, format, quer })) return { an: true, massstab, format, quer };
      }
    }
  }
  return { an: true, massstab: 500, format: "A3", quer: true };
}

function exportVoreinstellen() {
  if (exportFuerAnalyse === analyseErgebnis) return;
  exportFuerAnalyse = analyseErgebnis;
  exportStand = {};
  for (const e of EXPORT_EINTRAEGE) {
    if (e.art === "plan") exportStand[e.id] = { an: true, massstab: 2000, ...passendesFormat("plan", 2000) };
    else if (e.art === "schnitt") exportStand[e.id] = schnittVoreinstellung();
    else exportStand[e.id] = { an: true, format: e.id === "uebersicht" ? "A1" : "A3", quer: true };
  }
}

function zeigeExportReiter() {
  const ziel = document.getElementById("export-inhalt");
  if (!analyseErgebnis) {
    ziel.innerHTML = `<div class="placeholder-box"><div><h3>Export</h3><p>Erscheint nach „Analysieren“: Pläne, Schnitt, 3D-Ansicht, Kennzahlen und Übersichtsblatt als PDF (Vektor) oder PNG.</p></div></div>`;
    return;
  }
  exportVoreinstellen();
  const zeilen = EXPORT_EINTRAEGE.map((e) => {
    const st = exportStand[e.id], da = exportVerfuegbar(e.id);
    const name = PLAN_TITEL[e.id] && e.art === "plan" ? PLAN_TITEL[e.id] : EXPORT_NAMEN[e.id];
    const status = !da ? "keine Daten" : e.art === "bild" ? (e.id === "3d" ? "Bild (nicht Vektor)" : "Vektor")
      : passt(e.art, st) ? "passt aufs Blatt" : "<span class=\"export-warnung\">nur Ausschnitt</span>";
    return `<tr class="${da ? "" : "ist-leer"}" data-id="${e.id}">
      <td><input type="checkbox" data-feld="an" ${st.an && da ? "checked" : ""} ${da ? "" : "disabled"}></td>
      <td>${name}</td>
      <td>${e.art === "bild" ? "–" : `<select data-feld="massstab">${MASSSTAEBE[e.art].map((m) => `<option value="${m}" ${m === st.massstab ? "selected" : ""}>1:${fmt(m)}</option>`).join("")}</select>`}</td>
      <td><select data-feld="format">${Object.keys(PAPIER).map((p) => `<option ${p === st.format ? "selected" : ""}>${p}</option>`).join("")}</select></td>
      <td><select data-feld="quer"><option value="1" ${st.quer ? "selected" : ""}>quer</option><option value="0" ${st.quer ? "" : "selected"}>hoch</option></select></td>
      <td class="export-status-zelle">${status}</td>
      <td class="export-einzeln"><button class="btn btn-klein btn-ghost" data-aktion="pdf" ${da ? "" : "disabled"}>PDF</button>
        <button class="btn btn-klein btn-ghost" data-aktion="png" ${da ? "" : "disabled"}>PNG</button>
        ${mitDxf(e.id) ? `<button class="btn btn-klein btn-ghost" data-aktion="dxf" ${da ? "" : "disabled"}>DXF</button>` : ""}</td>
    </tr>`;
  }).join("");
  ziel.innerHTML = `
    <header class="kz-kopf"><h3>Export</h3>
      <p>Pläne, Schnitt, 3D-Ansicht, Kennzahlen und Übersichtsblatt. Die PDF enthält Vektorgrafik (Linien und Flächen, in Illustrator oder InDesign bearbeitbar),
      nur die 3D-Ansicht ist ein Bild. Jedes Blatt hat ein Schriftfeld mit Legende, Maßstab, Nordpfeil und Quellen.</p></header>
    <table class="export-tabelle">
      <thead><tr><th></th><th>Inhalt</th><th>Maßstab</th><th>Format</th><th>Ausrichtung</th><th>Prüfung</th><th>Einzeln</th></tr></thead>
      <tbody>${zeilen}</tbody>
    </table>
    <p class="hint">Gezeigt wird der Zustand der Reiter: eingeschaltete Ebenen, das gewählte Merkmal im Reiter „Wohnen“, die Schnittlinie und die aktuelle 3D-Ansicht.
      „Nur Ausschnitt“: Das Gebiet ist beim gewählten Maßstab größer als das Blatt, gezeigt wird die Mitte. PNG: 300 dpi bis A2, A1 200 dpi, A0 150 dpi.</p>
    <div class="row export-knoepfe">
      <button class="btn btn-primary" id="export-pdf">Ausgewählte als eine PDF</button>
      <button class="btn" id="export-png">Ausgewählte als PNG (ZIP)</button>
    </div>
    <p class="export-status" id="export-status"></p>
    <div class="export-fertig" id="export-fertig" hidden></div>
    <section class="export-dxf">
      <h4>DXF für CAD</h4>
      <p>Pläne, Schnitt und das komplette 3D-Modell als DXF (AutoCAD 2013, Einheit 1 m, je Kategorie ein Layer, Farben wie in der App).
        Das 3D-Modell enthält Gelände, LoD2-Wände und -Dächer, Ersatz-Klötze, Bäume, Gebietsrahmen und Nordpfeil als 3D-Flächen.</p>
      <div class="row">
        <label>Für <select id="dxf-ziel">${Object.entries(DXF_ZIELE).map(([key, z]) => `<option value="${key}" ${key === dxfZiel ? "selected" : ""}>${z.name} – ${z.text}</option>`).join("")}</select></label>
        <button class="btn" id="export-dxf">Ausgewählte als DXF (ZIP)</button>
      </div>
      <p class="hint">Allplan: Datei → Importieren → DXF, Einheit Meter, Koordinaten unverändert übernehmen. ArchiCAD: Datei → Interoperabilität → Zusammenführen
        (3D-Inhalt als Morph oder Objekt); der Bezugspunkt steht als Text im Layer BESCHRIFTUNG. Linienbreiten und Schrift der Pläne richten sich nach dem
        gewählten Maßstab. Das 3D-Modell kann je nach Gebiet 20–60 MB groß werden.</p>
    </section>`;

  zeigeFertigeDateien(false);

  // Einstellungen ändern
  ziel.querySelectorAll("tbody select, tbody input").forEach((el) => el.addEventListener("change", () => {
    const st = exportStand[el.closest("tr").dataset.id];
    const feld = el.dataset.feld;
    st[feld] = feld === "an" ? el.checked : feld === "quer" ? el.value === "1" : feld === "massstab" ? +el.value : el.value;
    zeigeExportReiter();
  }));
  const status = (t) => { document.getElementById("export-status").textContent = t; };
  const sperren = (an) => ziel.querySelectorAll("tbody button, tbody select, tbody input, .export-knoepfe button, .export-dxf button, .export-dxf select").forEach((el) => { if (an) el.dataset.war = el.disabled; el.disabled = an || el.dataset.war === "true"; });
  const ausfuehren = async (aufgabe) => {
    sperren(true);
    try { await aufgabe(); } catch (fehler) { console.error(fehler); status(`Export fehlgeschlagen: ${fehler.message}`); }
    finally { sperren(false); }
  };
  // Einzeln
  ziel.querySelectorAll("[data-aktion]").forEach((knopf) => knopf.addEventListener("click", () => ausfuehren(async () => {
    const id = knopf.closest("tr").dataset.id;
    status("Erzeuge das Blatt …");
    await new Promise((r) => setTimeout(r, 20));
    if (knopf.dataset.aktion === "dxf") {
      status("Erzeuge die DXF …");
      await new Promise((r) => setTimeout(r, 20));
      const { blob, anzahl } = dxfErzeugen(id);
      herunterladen(blob, dxfDateiname(id));
      status(`Fertig: ${fmt(anzahl)} Zeichnungselemente, ${fmt(blob.size / 1e6, 1)} MB.`);
      return;
    }
    const blaetter = blattErzeugen(id);
    if (knopf.dataset.aktion === "pdf") herunterladen(await blaetterAlsPdf(blaetter, status), dateiname(id, "pdf"));
    else { status("Erzeuge das PNG …"); herunterladen(await blattAlsPng(blaetter[0]), dateiname(id, "png")); }
    status("Fertig.");
  })));
  const ausgewaehlt = () => EXPORT_EINTRAEGE.map((e) => e.id).filter((id) => exportStand[id].an && exportVerfuegbar(id));
  // Alle in eine PDF
  document.getElementById("export-pdf").addEventListener("click", () => ausfuehren(async () => {
    const ids = ausgewaehlt();
    if (!ids.length) { status("Nichts ausgewählt."); return; }
    const blaetter = [];
    for (const id of ids) { status(`Erzeuge ${id} …`); await new Promise((r) => setTimeout(r, 20)); blaetter.push(...blattErzeugen(id)); }
    herunterladen(await blaetterAlsPdf(blaetter, status), `ortsanalyse_${dateiDatum()}.pdf`);
    status(`Fertig: ${blaetter.length} Blätter in einer PDF.`);
  }));
  // Alle als PNG in einer ZIP
  document.getElementById("export-png").addEventListener("click", () => ausfuehren(async () => {
    const ids = ausgewaehlt();
    if (!ids.length) { status("Nichts ausgewählt."); return; }
    const zip = new JSZip();
    for (const [i, id] of ids.entries()) {
      status(`PNG ${i + 1} von ${ids.length} (${id}) …`);
      await new Promise((r) => setTimeout(r, 20));
      zip.file(dateiname(id, "png"), await blattAlsPng(blattErzeugen(id)[0]));
    }
    status("Packe die ZIP …");
    herunterladen(await zip.generateAsync({ type: "blob" }), `ortsanalyse_png_${dateiDatum()}.zip`);
    status(`Fertig: ${ids.length} PNG in einer ZIP.`);
  }));
  // DXF: Zielprogramm und alle ausgewählten als ZIP
  document.getElementById("dxf-ziel").addEventListener("change", (e) => { dxfZiel = e.target.value; });
  document.getElementById("export-dxf").addEventListener("click", () => ausfuehren(async () => {
    const ids = ausgewaehlt().filter(mitDxf);
    if (!ids.length) { status("Nichts ausgewählt (DXF gibt es für Pläne, Schnitt und 3D)."); return; }
    const zip = new JSZip();
    for (const [i, id] of ids.entries()) {
      status(`DXF ${i + 1} von ${ids.length} (${id}) …`);
      await new Promise((r) => setTimeout(r, 20));
      zip.file(dxfDateiname(id), dxfErzeugen(id).blob);
    }
    status("Packe die ZIP …");
    herunterladen(await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }), `ortsanalyse_dxf_${dxfZiel}_${dateiDatum()}.zip`);
    status(`Fertig: ${ids.length} DXF in einer ZIP.`);
  }));
}

// DXF gibt es für die Pläne, den Schnitt und das 3D-Modell
const mitDxf = (id) => EXPORT_PLAENE.includes(id) || id === "schnitt" || id === "3d";
