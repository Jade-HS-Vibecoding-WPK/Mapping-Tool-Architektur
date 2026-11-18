/* ============================================================
   SiteKick – Datei-Import

   Gelesen werden:
     GeoJSON (.geojson, .json): Flächen, Linien, Punkte. Länge/Breite (WGS84) oder UTM 32 (erkennt das Tool an den Zahlen).
     DXF (nur Text-DXF, .dxf): LINE, LWPOLYLINE, POLYLINE, CIRCLE, POINT, 3DFACE. Liegen die Koordinaten lokal (kein UTM), fragt das Tool nach dem
       Bezugspunkt (Ost und Nord in UTM 32), der dem Nullpunkt der Datei entspricht. Blöcke (INSERT), Texte, Bemaßungen und Schraffuren werden
       übersprungen. Das binäre DXF von topoexport kann der Browser nicht lesen (Anleitung in der Meldung).
     CityGML (.gml, .xml): LoD2-Gebäude (mit demselben Hintergrundprogramm wie beim LGLN). Sie ERSETZEN die LoD2-Gebäude vom LGLN; neu Analysieren stellt
       die LGLN-Daten wieder her. Quelle und Lizenz der eigenen Datei muss die Nutzerin / der Nutzer selbst prüfen.
   GeoJSON und DXF liegen als orange Überlagerung über allen Karten-Reitern und kommen in den Plan-Exporten mit (Ebene IMPORT_<Name>).
   Nicht gelesen: DWG (als DXF speichern), Shape-Dateien, 3D-DXF-Netze (MESH).
   ============================================================ */

"use strict";

const IMPORT_FARBE = "#f08a24";
let importDateien = [];                 // { id, name, art, features (lon/lat GeoJSON), an, dxfName }
let importNummer = 0;
const importEl = { zone: document.getElementById("import-zone"), datei: document.getElementById("import-datei"), liste: document.getElementById("import-liste"), status: document.getElementById("import-status") };

const importMeldung = (text, fehler) => { importEl.status.textContent = text; importEl.status.hidden = !text; importEl.status.classList.toggle("warning", !!fehler); };
const importAktive = () => importDateien.filter((d) => d.an && d.features).flatMap((d) => d.features.map((f) => ({ ...f, properties: { ...f.properties, datei: d.name, dxfName: d.dxfName } })));

// ---------- Karte ----------
function legeImportEbenenAn() {
  map.addSource("import", { type: "geojson", data: leer });
  const unsichtbar = { visibility: "none" };
  map.addLayer({ id: "import-flaeche", type: "fill", source: "import", layout: unsichtbar, filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]], paint: { "fill-color": IMPORT_FARBE, "fill-opacity": 0.3 } }, "gebiet-flaeche");
  map.addLayer({ id: "import-linie", type: "line", source: "import", layout: unsichtbar, filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon", "LineString", "MultiLineString"]]], paint: { "line-color": IMPORT_FARBE, "line-width": 1.6 } }, "gebiet-flaeche");
  map.addLayer({ id: "import-punkt", type: "circle", source: "import", layout: unsichtbar, filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]], paint: { "circle-radius": 5, "circle-color": IMPORT_FARBE, "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5 } }, "gebiet-flaeche");
}

function aktualisiereImport() {
  if (!kartenBereit || !map.getSource("import")) return;
  const sichtbar = KARTEN_REITER.includes(aktuelleAnsicht) && aktuelleAnsicht !== "luftbild";
  const aktive = importAktive();
  map.getSource("import").setData({ type: "FeatureCollection", features: aktive });
  for (const id of ["import-flaeche", "import-linie", "import-punkt"]) map.setLayoutProperty(id, "visibility", sichtbar && aktive.length ? "visible" : "none");
}

function zeichneImportListe() {
  importEl.liste.innerHTML = importDateien.map((d) => d.art === "CityGML"
    ? `<li><span>${htmlSicher(d.name)} <small>(CityGML: ersetzt die LoD2-Gebäude, ${zahl(d.anzahl)} Gebäude)</small></span></li>`
    : `<li><label><input type="checkbox" data-id="${d.id}" ${d.an ? "checked" : ""}> ${htmlSicher(d.name)} <small>(${d.art}, ${zahl(d.features.length)} Objekte)</small></label><button type="button" class="import-weg" data-id="${d.id}" aria-label="Entfernen">×</button></li>`).join("");
}

importEl.liste.addEventListener("change", (e) => {
  const d = importDateien.find((x) => String(x.id) === e.target.dataset.id);
  if (d) { d.an = e.target.checked; aktualisiereImport(); }
});
importEl.liste.addEventListener("click", (e) => {
  const b = e.target.closest(".import-weg");
  if (!b) return;
  importDateien = importDateien.filter((x) => String(x.id) !== b.dataset.id);
  zeichneImportListe(); aktualisiereImport(); importMeldung("");
});

// ---------- GeoJSON ----------
function importGeoJson(text) {
  const j = JSON.parse(text);
  let features = j.type === "FeatureCollection" ? j.features : j.type === "Feature" ? [j] : j.type && j.coordinates ? [{ type: "Feature", properties: {}, geometry: j }] : null;
  if (!features) throw new Error("Das ist kein GeoJSON (keine Features gefunden).");
  features = features.filter((f) => f && f.geometry && f.geometry.coordinates);
  // UTM statt Länge/Breite? Dann umrechnen
  const erste = (g) => { let c = g.coordinates; while (Array.isArray(c[0])) c = c[0]; return c; };
  if (features.length && Math.abs(erste(features[0].geometry)[0]) > 1000) {
    const wandle = (c) => (Array.isArray(c[0]) ? c.map(wandle) : utmWandler.inverse([c[0], c[1]]));
    features = features.map((f) => ({ ...f, geometry: { ...f.geometry, coordinates: wandle(f.geometry.coordinates) } }));
  }
  return features.map((f) => ({ type: "Feature", properties: f.properties || {}, geometry: f.geometry }));
}

// ---------- Text-DXF ----------
function importDxf(text, dateiName) {
  const zeilen = text.split(/\r?\n/);
  const paare = [];
  for (let i = 0; i + 1 < zeilen.length; i += 2) paare.push([parseInt(zeilen[i].trim(), 10), zeilen[i + 1].trim()]);
  let i = 0;
  while (i < paare.length && !(paare[i][0] === 2 && paare[i][1] === "ENTITIES")) i++;
  const objekte = [];
  let aktuell = null, offenePoly = null, uebersprungen = 0;
  const abschliessen = () => {
    if (!aktuell) return;
    const p = aktuell.p, zahlen = (code) => p.filter(([c]) => c === code).map(([, v]) => Number(v));
    const typ = aktuell.typ;
    if (typ === "LINE") objekte.push({ t: "linie", pts: [[zahlen(10)[0], zahlen(20)[0]], [zahlen(11)[0], zahlen(21)[0]]] });
    else if (typ === "LWPOLYLINE") {
      const xs = zahlen(10), ys = zahlen(20), flag = zahlen(70)[0] || 0;
      objekte.push({ t: flag & 1 ? "flaeche" : "linie", pts: xs.map((x, k) => [x, ys[k]]) });
    } else if (typ === "POLYLINE") { offenePoly = { t: (zahlen(70)[0] || 0) & 1 ? "flaeche" : "linie", pts: [] }; objekte.push(offenePoly); }
    else if (typ === "VERTEX" && offenePoly) { const x = zahlen(10)[0], y = zahlen(20)[0]; if (Number.isFinite(x) && Number.isFinite(y)) offenePoly.pts.push([x, y]); }
    else if (typ === "SEQEND") offenePoly = null;
    else if (typ === "CIRCLE") objekte.push({ t: "kreis", c: [zahlen(10)[0], zahlen(20)[0]], r: zahlen(40)[0] });
    else if (typ === "POINT") objekte.push({ t: "punkt", pts: [[zahlen(10)[0], zahlen(20)[0]]] });
    else if (typ === "3DFACE") objekte.push({ t: "flaeche", pts: [[10, 20], [11, 21], [12, 22], [13, 23]].map(([cx, cy]) => [zahlen(cx)[0], zahlen(cy)[0]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)) });
    else uebersprungen++;
    aktuell = null;
  };
  for (; i < paare.length; i++) {
    const [c, v] = paare[i];
    if (c === 0) { abschliessen(); if (v === "ENDSEC") break; aktuell = { typ: v, p: [] }; continue; }
    if (aktuell) aktuell.p.push([c, v]);
  }
  abschliessen();
  const alle = objekte.filter((o) => (o.pts ? o.pts.length : 1) && (o.pts ? o.pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)) : Number.isFinite(o.c[0])));
  if (!alle.length) throw new Error("In der DXF-Datei wurden keine lesbaren Linien oder Flächen gefunden.");
  // Georeferenz
  const probe = alle[0].pts ? alle[0].pts[0] : alle[0].c;
  const istUtm = probe[0] > 200000 && probe[0] < 900000 && probe[1] > 5e6 && probe[1] < 7e6;
  let E0 = 0, N0 = 0;
  if (!istUtm) {
    const [w, s, o, n] = turf.bbox(gebiet);
    const [ue, un] = utmWandler.forward([w, s]);
    const eingabe = window.prompt(`Die Datei „${dateiName}“ hat lokale Koordinaten (kein UTM).\\nGib den Bezugspunkt an, der dem Nullpunkt der Datei entspricht: Ost und Nord in UTM 32, durch Komma getrennt.\\n(Vorschlag: untere linke Ecke des Gebiets)`, `${Math.round(ue)}, ${Math.round(un)}`);
    if (eingabe == null) throw new Error("Import abgebrochen (kein Bezugspunkt).");
    const teile = eingabe.split(/[,;\s]+/).map((t) => Number(t.replace(",", "."))).filter((x) => Number.isFinite(x));
    if (teile.length < 2) throw new Error("Der Bezugspunkt wurde nicht verstanden (zwei Zahlen: Ost, Nord).");
    [E0, N0] = teile;
  }
  const ll = ([x, y]) => utmWandler.inverse([x + E0, y + N0]);
  const features = [];
  for (const o of alle.slice(0, 60000)) {
    if (o.t === "linie" && o.pts.length >= 2) features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: o.pts.map(ll) } });
    else if (o.t === "flaeche" && o.pts.length >= 3) { const r = o.pts.map(ll); r.push(r[0]); features.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [r] } }); }
    else if (o.t === "kreis" && o.r > 0) { const r = Array.from({ length: 49 }, (_, k) => ll([o.c[0] + o.r * Math.cos((k / 48) * 2 * Math.PI), o.c[1] + o.r * Math.sin((k / 48) * 2 * Math.PI)])); features.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [r] } }); }
    else if (o.t === "punkt") features.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: ll(o.pts[0]) } });
  }
  return { features, uebersprungen, istUtm };
}

// ---------- CityGML: über das LoD2-Hintergrundprogramm ----------
async function importCityGml(datei) {
  if (!gebiet) throw new Error("Erst ein Gebiet wählen und „Analysieren“ klicken, damit das Tool weiß, welche Gebäude gebraucht werden.");
  const ecken = gebiet.geometry.coordinates[0].slice(0, 4).map((e) => utmWandler.forward(e));
  const xs = ecken.map((e) => e[0]), ys = ecken.map((e) => e[1]);
  const utmBox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const url = URL.createObjectURL(datei);
  try {
    const gebaeude = await leseLod2([{ id: datei.name, url }], utmBox, (p) => { if (p && p.geladen != null && p.gesamt) importMeldung(`CityGML wird gelesen … ${Math.round((p.geladen / p.gesamt) * 100)} %`); });
    if (!gebaeude.length) throw new Error("In der CityGML-Datei liegen keine Gebäude (Gebäude mit Dachflächen) im gewählten Rechteck. Passt das Koordinatensystem (UTM 32)?");
    wendeLod2An({ gebaeude, jahr: "" });
    lod2Quelle = `LoD2: eigene Datei „${datei.name}“ (Quelle und Lizenz selbst prüfen)`;
    wendeAnsichtAn();
    return gebaeude.length;
  } finally { URL.revokeObjectURL(url); }
}

// ---------- Dateien aufnehmen ----------
async function importiere(dateien) {
  for (const datei of dateien) {
    const endung = (datei.name.split(".").pop() || "").toLowerCase();
    try {
      importMeldung(`„${datei.name}“ wird gelesen …`);
      if (endung === "dwg") throw new Error("DWG kann der Browser nicht lesen. Speichere die Datei in deinem CAD-Programm als DXF (Text-Format) und lade sie noch einmal.");
      if (endung === "geojson" || endung === "json") {
        const features = importGeoJson(await datei.text());
        importDateien.push({ id: ++importNummer, name: datei.name, art: "GeoJSON", features, an: true, dxfName: dxfName(datei.name) });
      } else if (endung === "dxf") {
        if ((await datei.slice(0, 40).text()).includes("Binary DXF")) throw new Error("Das ist ein binäres DXF (so speichert topoexport). Der Browser kann es nicht lesen. Öffne die Datei in AutoCAD, ArchiCAD, Allplan oder QCAD und speichere sie als „DXF“ im Text-Format (ASCII), dann noch einmal laden.");
        if (!gebiet) throw new Error("Erst ein Gebiet wählen, damit das Tool die DXF-Datei einordnen kann.");
        const { features, uebersprungen, istUtm } = importDxf(await datei.text(), datei.name);
        importDateien.push({ id: ++importNummer, name: datei.name, art: "DXF", features, an: true, dxfName: dxfName(datei.name) });
        importMeldung(`„${datei.name}“: ${zahl(features.length)} Objekte gelesen${istUtm ? " (UTM 32 erkannt)" : " (mit deinem Bezugspunkt)"}${uebersprungen ? `, ${zahl(uebersprungen)} Elemente übersprungen (Blöcke, Texte, Bemaßungen, Schraffuren)` : ""}.`);
        zeichneImportListe(); aktualisiereImport();
        continue;
      } else if (endung === "gml" || endung === "xml") {
        const n = await importCityGml(datei);
        importDateien.push({ id: ++importNummer, name: datei.name, art: "CityGML", features: null, an: true, anzahl: n, dxfName: "" });
        importMeldung(`„${datei.name}“: ${zahl(n)} Gebäude gelesen, sie ersetzen die LoD2-Gebäude vom LGLN.`);
        zeichneImportListe();
        continue;
      } else throw new Error(`Das Dateiformat „.${endung}“ kann das Tool nicht lesen. Möglich sind GeoJSON, Text-DXF und CityGML.`);
      importMeldung(`„${datei.name}“: ${zahl(importDateien[importDateien.length - 1].features.length)} Objekte gelesen.`);
      zeichneImportListe(); aktualisiereImport();
    } catch (fehler) {
      console.error(fehler);
      importMeldung(fehler.message, true);
    }
  }
}
const dxfName = (n) => n.replace(/\.[^.]+$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").toUpperCase().slice(0, 24) || "DATEI";

importEl.datei.addEventListener("change", () => { importiere([...importEl.datei.files]); importEl.datei.value = ""; });
for (const ereignis of ["dragenter", "dragover"]) importEl.zone.addEventListener(ereignis, (e) => { e.preventDefault(); importEl.zone.classList.add("is-over"); });
for (const ereignis of ["dragleave", "drop"]) importEl.zone.addEventListener(ereignis, (e) => { e.preventDefault(); importEl.zone.classList.remove("is-over"); });
importEl.zone.addEventListener("drop", (e) => importiere([...e.dataTransfer.files]));

// Neues Gebiet: CityGML-Einträge gelten nicht mehr (die LoD2-Daten werden verworfen); GeoJSON und DXF bleiben, sie sind Lage-Daten
function verwerfeImport() { importDateien = importDateien.filter((d) => d.art !== "CityGML"); zeichneImportListe(); }
