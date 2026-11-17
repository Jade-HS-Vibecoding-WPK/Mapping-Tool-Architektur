/* ============================================================
   Ortsanalyse – DXF-Export für CAD (Allplan 2024, ArchiCAD 29)
   Format: DXF AutoCAD 2013 (AC1027), Einheit 1 m, jede Kategorie auf eigenem Layer
   (Namen ohne Umlaute und Leerzeichen), Farben als echte Farben (True Color) wie in der App.
   - 3D-Modell: genau die Geometrie des Reiters „3D“: Gelände (in Farben der Bodenkarte geteilt),
     LoD2-Wände und -Dächer 1:1, Ersatz-Klötze aus OSM, Bäume (Stamm und Krone), Gebietsrahmen, Nordpfeil.
     Flächen als 3DFACE; Hilfskanten (Dreiecksteilung, Gelände, Bäume) sind unsichtbar.
   - 2D-Pläne: die sichtbaren Ebenen des Plans (wie im PDF-Export), Flächen als Schraffur (SOLID),
     Linien als Polylinien (Breite nach dem gewählten Maßstab), Texte für Flurstücksnummern, Bodenrichtwerte, Orte.
   - Schnitt: Schnitt und Ansicht in Metern (x = Länge entlang der Linie, y = Höhe ü. NHN).
   Voreinstellung Allplan: echte Koordinaten UTM 32. ArchiCAD: lokaler Nullpunkt (Südwestecke des Gebiets),
   die Bezugskoordinaten stehen als Text im Layer BESCHRIFTUNG (dort auch die Quellen).
   ============================================================ */

const DXF_ZIELE = {
  allplan: { name: "Allplan 2024", text: "echte Koordinaten ETRS89 / UTM 32", lokal: false },
  archicad: { name: "ArchiCAD 29", text: "lokaler Nullpunkt (Südwestecke des Gebiets)", lokal: true }
};
let dxfZiel = "allplan";

// ---------- Farben ----------
const farbKontext = document.createElement("canvas").getContext("2d");
const farbSpeicher = new Map();
// beliebige Farbangabe (auch rgba, Namen) → "#rrggbb"; Deckkraft wird mit Weiß gemischt (CAD kennt keine Transparenz)
function dxfFarbe(farbe, deckkraft = 1) {
  const key = `${farbe}|${deckkraft}`;
  let ergebnis = farbSpeicher.get(key);
  if (ergebnis) return ergebnis;
  farbKontext.fillStyle = "#000000";
  farbKontext.fillStyle = typeof farbe === "number" ? `#${farbe.toString(16).padStart(6, "0")}` : String(farbe);
  const f = farbKontext.fillStyle; // "#rrggbb" oder "rgba(r, g, b, a)"
  let rgb, a = 1;
  if (f.startsWith("#")) rgb = [1, 3, 5].map((i) => parseInt(f.slice(i, i + 2), 16));
  else { const t = f.match(/[\d.]+/g).map(Number); rgb = t.slice(0, 3); if (t.length > 3) a = t[3]; }
  a *= deckkraft;
  ergebnis = `#${rgb.map((v) => Math.round(v * a + 255 * (1 - a)).toString(16).padStart(2, "0")).join("")}`;
  farbSpeicher.set(key, ergebnis);
  return ergebnis;
}
const rgbVon = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const farbZahl = (hex) => parseInt(hex.slice(1), 16); // Gruppencode 420

// AutoCAD-Farbindex (ACI) als Ersatz für Programme ohne echte Farben: nächstliegende der 255 Farben
const ACI_TABELLE = (() => {
  const t = [];
  [[1, [255, 0, 0]], [2, [255, 255, 0]], [3, [0, 255, 0]], [4, [0, 255, 255]], [5, [0, 0, 255]], [6, [255, 0, 255]],
    [8, [128, 128, 128]], [9, [192, 192, 192]]].forEach(([i, c]) => { t[i] = c; });
  const hell = [1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.3, 0.3];
  for (let aci = 10; aci < 250; aci++) {
    const h = (Math.floor((aci - 10) / 10) * 15) / 60, j = aci % 10;
    const k = (n) => { const x = (n + h) % 6; return 255 * (1 - Math.max(0, Math.min(x, 4 - x, 1))); };
    let c = [k(5), k(3), k(1)];
    if (j % 2) c = c.map((v) => v + (255 - v) * 0.5);
    t[aci] = c.map((v) => v * hell[j]);
  }
  [51, 91, 132, 173, 214, 255].forEach((v, i) => { t[250 + i] = [v, v, v]; });
  return t;
})();
const aciSpeicher = new Map();
function aciVon(hex) {
  if (aciSpeicher.has(hex)) return aciSpeicher.get(hex);
  const [r, g, b] = rgbVon(hex);
  let beste = 7, abstand = Infinity;
  if (r + g + b > 60) ACI_TABELLE.forEach((c, i) => {
    if (!c) return;
    const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
    if (d < abstand) { abstand = d; beste = i; }
  });
  aciSpeicher.set(hex, beste);
  return beste;
}

// ---------- Kleine Helfer ----------
const dxfName = (t) => String(t).toUpperCase().replace(/Ä/g, "AE").replace(/Ö/g, "OE").replace(/Ü/g, "UE").replace(/ß/g, "SS")
  .replace(/[^A-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "OHNE_NAME";
const dxfZahl = (v) => String(Math.round(v * 1000) / 1000); // auf den Millimeter
const dxfText = (t) => String(t).replace(/′/g, "'").replace(/−/g, "-").replace(/[\r\n]+/g, " ");
const DXF_MODELL = "17"; // Handle des Modellbereichs (*Model_Space)

// Strichstärken, die DXF kennt (1/100 mm)
const LINIENGEWICHTE = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];
const liniengewicht = (mm) => LINIENGEWICHTE.reduce((a, g) => (Math.abs(g - mm * 100) < Math.abs(a - mm * 100) ? g : a));

// ---------- Der DXF-Schreiber ----------
class DxfDatei {
  constructor(versatz = [0, 0]) {
    this.versatz = versatz;          // wird von allen x/y abgezogen (lokaler Nullpunkt)
    this.naechster = 0x100;          // nächster freier Handle (feste Tabellen-Handles liegen darunter)
    this.ebenen = new Map();         // Layername → Farbe
    this.linientypen = new Map();    // Muster → { name, muster }
    this.stuecke = []; this.puffer = [];
    this.min = [Infinity, Infinity, Infinity]; this.max = [-Infinity, -Infinity, -Infinity];
    this.anzahl = 0;
  }
  handle() { return (this.naechster++).toString(16).toUpperCase(); }
  ebene(name, farbe) {
    const n = dxfName(name);
    if (!this.ebenen.has(n)) this.ebenen.set(n, farbe ? dxfFarbe(farbe) : "#000000");
    return n;
  }
  linientyp(muster) { // muster in Metern: [Strich, Lücke, …]
    const key = muster.map(dxfZahl).join(",");
    let lt = this.linientypen.get(key);
    if (!lt) { lt = { name: `STRICH${this.linientypen.size + 1}`, muster }; this.linientypen.set(key, lt); }
    return lt.name;
  }
  schreib(s) {
    this.puffer.push(s);
    this.anzahl++;
    if (this.puffer.length >= 4000) { this.stuecke.push(this.puffer.join("")); this.puffer = []; }
  }
  ausdehnung(x, y, z) {
    if (x < this.min[0]) this.min[0] = x; if (x > this.max[0]) this.max[0] = x;
    if (y < this.min[1]) this.min[1] = y; if (y > this.max[1]) this.max[1] = y;
    if (z < this.min[2]) this.min[2] = z; if (z > this.max[2]) this.max[2] = z;
  }
  p(code, [x, y, z = 0]) { // Punkt (3 Gruppencodes), mit Versatz
    x -= this.versatz[0]; y -= this.versatz[1];
    this.ausdehnung(x, y, z);
    return `${code}\n${dxfZahl(x)}\n${code + 10}\n${dxfZahl(y)}\n${code + 20}\n${dxfZahl(z)}\n`;
  }
  xy([x, y], z = 0) { // nur x/y (LWPOLYLINE, HATCH)
    x -= this.versatz[0]; y -= this.versatz[1];
    this.ausdehnung(x, y, z);
    return `10\n${dxfZahl(x)}\n20\n${dxfZahl(y)}\n`;
  }
  // Kopf jedes Objekts: Typ, Handle, Besitzer, Layer, ggf. Linientyp, eigene Farbe, Strichstärke
  kopf(typ, o) {
    this.letzter = this.handle();
    let s = `0\n${typ}\n5\n${this.letzter}\n330\n${o.besitzer || DXF_MODELL}\n100\nAcDbEntity\n8\n${o.ebene}\n`;
    if (o.ltyp) s += `6\n${o.ltyp}\n`;
    if (o.farbe) {
      const f = dxfFarbe(o.farbe);
      if (f !== this.ebenen.get(o.ebene)) s += `62\n${aciVon(f)}\n420\n${farbZahl(f)}\n`;
    }
    if (o.gewicht != null) s += `370\n${o.gewicht}\n`;
    return s;
  }

  // 3D-Fläche mit 3 oder 4 Ecken; unsichtbar: Bits 1, 2, 4, 8 = Kante 1–2, 2–3, 3–4, 4–1 nicht zeichnen
  flaeche3d(a, b, c, d, o, unsichtbar = 0) {
    this.schreib(this.kopf("3DFACE", o) + "100\nAcDbFace\n" + this.p(10, a) + this.p(11, b) + this.p(12, c) + this.p(13, d || c)
      + (unsichtbar ? `70\n${unsichtbar}\n` : ""));
  }
  // 2D-Polylinie (Höhe o.z), optional Breite in m, Strichstärke, Linientyp
  polylinie(punkte, o) {
    if (punkte.length < 2) return;
    let s = this.kopf("LWPOLYLINE", o) + `100\nAcDbPolyline\n90\n${punkte.length}\n70\n${(o.geschlossen ? 1 : 0) + (o.ltyp ? 128 : 0)}\n`;
    if (o.breite) s += `43\n${dxfZahl(o.breite)}\n`;
    if (o.z) s += `38\n${dxfZahl(o.z)}\n`;
    for (const pt of punkte) s += this.xy(pt, o.z || 0);
    this.schreib(s);
  }
  // 3D-Polylinie (folgt dem Gelände)
  polylinie3d(punkte, o) {
    if (punkte.length < 2) return;
    let s = this.kopf("POLYLINE", o) + `100\nAcDb3dPolyline\n66\n1\n10\n0\n20\n0\n30\n0\n70\n${8 + (o.geschlossen ? 1 : 0)}\n`;
    const besitzer = this.letzter;
    for (const pt of punkte) s += this.kopf("VERTEX", { ebene: o.ebene, besitzer }) + "100\nAcDbVertex\n100\nAcDb3dPolylineVertex\n" + this.p(10, pt) + "70\n32\n";
    s += this.kopf("SEQEND", { ebene: o.ebene, besitzer });
    this.schreib(s);
  }
  kreis(m, r, o) {
    this.schreib(this.kopf("CIRCLE", o) + "100\nAcDbCircle\n" + this.p(10, [m[0], m[1], o.z || 0]) + `40\n${dxfZahl(r)}\n`);
  }
  // Text; o.mitte = mittig an den Punkt setzen
  text(pt, hoehe, inhalt, o) {
    const p3 = [pt[0], pt[1], pt[2] ?? o.z ?? 0];
    let s = this.kopf("TEXT", o) + "100\nAcDbText\n" + this.p(10, p3) + `40\n${dxfZahl(hoehe)}\n1\n${dxfText(inhalt)}\n`;
    if (o.drehung) s += `50\n${dxfZahl(o.drehung)}\n`;
    if (o.mitte) s += "72\n1\n" + this.p(11, p3);
    s += "100\nAcDbText\n";
    if (o.mitte) s += "73\n2\n";
    this.schreib(s);
  }
  // Gefüllte Fläche (Schraffur SOLID). polys: [[außen, loch, …], …], Ringe ohne doppelten Endpunkt
  schraffur(polys, o) {
    const ringe = [];
    for (const poly of polys) poly.forEach((r, i) => { if (r.length >= 3) ringe.push([r, i === 0]); });
    if (!ringe.length) return;
    let s = this.kopf("HATCH", o) + `100\nAcDbHatch\n10\n0\n20\n0\n30\n${dxfZahl(o.z || 0)}\n210\n0\n220\n0\n230\n1\n2\nSOLID\n70\n1\n71\n0\n91\n${ringe.length}\n`;
    for (const [r, aussen] of ringe) {
      s += `92\n${aussen ? 3 : 2}\n72\n0\n73\n1\n93\n${r.length}\n`;
      for (const pt of r) s += this.xy(pt, o.z || 0);
      s += "97\n0\n";
    }
    this.schreib(s + "75\n0\n76\n1\n98\n0\n");
  }

  // ---------- Datei zusammensetzen ----------
  blob() {
    if (this.puffer.length) { this.stuecke.push(this.puffer.join("")); this.puffer = []; }
    if (!(this.min[0] <= this.max[0])) { this.min = [0, 0, 0]; this.max = [1, 1, 0]; }
    const g = (...paare) => { let s = ""; for (let i = 0; i < paare.length; i += 2) s += `${paare[i]}\n${paare[i + 1]}\n`; return s; };
    const rec = (typ, handle, besitzer, klasse) => g(0, typ, 5, handle, 330, besitzer, 100, "AcDbSymbolTableRecord", 100, klasse);
    const tabelle = (name, handle, anzahl, extra = "") => g(0, "TABLE", 2, name, 5, handle, 330, 0, 100, "AcDbSymbolTable", 70, anzahl) + extra;

    // Layer und Linientypen bekommen jetzt ihre Handles
    const ebenen = [...this.ebenen].map(([name, farbe]) => rec("LAYER", this.handle(), 1, "AcDbLayerTableRecord")
      + g(2, name, 70, 0, 62, aciVon(farbe), 420, farbZahl(farbe), 6, "Continuous", 370, -3, 390, "13"));
    const ltypen = [...this.linientypen.values()].map((lt) => rec("LTYPE", this.handle(), 2, "AcDbLinetypeTableRecord")
      + g(2, lt.name, 70, 0, 3, "Strichlinie", 72, 65, 73, lt.muster.length, 40, dxfZahl(lt.muster.reduce((a, v) => a + Math.abs(v), 0)))
      + lt.muster.map((v, i) => g(49, dxfZahl(i % 2 ? -Math.abs(v) : Math.abs(v)), 74, 0)).join(""));
    const [x0, y0, z0] = this.min, [x1, y1, z1] = this.max;

    const kopf = g(0, "SECTION", 2, "HEADER", 9, "$ACADVER", 1, "AC1027", 9, "$ACADMAINTVER", 70, 105, 9, "$DWGCODEPAGE", 3, "ANSI_1252",
      9, "$INSBASE", 10, 0, 20, 0, 30, 0, 9, "$EXTMIN", 10, dxfZahl(x0), 20, dxfZahl(y0), 30, dxfZahl(z0),
      9, "$EXTMAX", 10, dxfZahl(x1), 20, dxfZahl(y1), 30, dxfZahl(z1), 9, "$LTSCALE", 40, 1, 9, "$INSUNITS", 70, 6,
      9, "$MEASUREMENT", 70, 1, 9, "$LUNITS", 70, 2, 9, "$LUPREC", 70, 3, 9, "$HANDSEED", 5, this.naechster.toString(16).toUpperCase(), 0, "ENDSEC")
      + g(0, "SECTION", 2, "CLASSES", 0, "ENDSEC");

    const tabellen = g(0, "SECTION", 2, "TABLES")
      + tabelle("VPORT", 8, 1) + rec("VPORT", "23", 8, "AcDbViewportTableRecord")
      + g(2, "*Active", 70, 0, 10, 0, 20, 0, 11, 1, 21, 1, 12, dxfZahl((x0 + x1) / 2), 22, dxfZahl((y0 + y1) / 2), 13, 0, 23, 0, 14, 0.5, 24, 0.5,
        15, 0.5, 25, 0.5, 16, 0, 26, 0, 36, 1, 17, 0, 27, 0, 37, 0, 40, dxfZahl(Math.max(10, (y1 - y0) * 1.1)), 41, 1.5, 42, 50, 43, 0, 44, 0,
        50, 0, 51, 0, 71, 0, 72, 1000, 73, 1, 74, 3, 75, 0, 76, 0, 77, 0, 78, 0, 281, 0, 65, 0, 146, 0) + g(0, "ENDTAB")
      + tabelle("LTYPE", 2, 3 + ltypen.length)
      + ["ByBlock", "ByLayer", "Continuous"].map((n, i) => rec("LTYPE", (0x24 + i).toString(16).toUpperCase(), 2, "AcDbLinetypeTableRecord")
        + g(2, n, 70, 0, 3, n === "Continuous" ? "Solid line" : "", 72, 65, 73, 0, 40, 0)).join("") + ltypen.join("") + g(0, "ENDTAB")
      + tabelle("LAYER", 1, 1 + ebenen.length) + rec("LAYER", "27", 1, "AcDbLayerTableRecord")
      + g(2, "0", 70, 0, 62, 7, 6, "Continuous", 370, -3, 390, "13") + ebenen.join("") + g(0, "ENDTAB")
      + tabelle("STYLE", 5, 1) + rec("STYLE", "29", 5, "AcDbTextStyleTableRecord")
      + g(2, "Standard", 70, 0, 40, 0, 41, 1, 50, 0, 71, 0, 42, 2.5, 3, "arial.ttf", 4, "") + g(0, "ENDTAB")
      + tabelle("VIEW", 7, 0) + g(0, "ENDTAB") + tabelle("UCS", 6, 0) + g(0, "ENDTAB")
      + tabelle("APPID", 3, 1) + rec("APPID", "2A", 3, "AcDbRegAppTableRecord") + g(2, "ACAD", 70, 0) + g(0, "ENDTAB")
      + tabelle("DIMSTYLE", 4, 1, g(100, "AcDbDimStyleTable"))
      + g(0, "DIMSTYLE", 105, "2B", 330, 4, 100, "AcDbSymbolTableRecord", 100, "AcDbDimStyleTableRecord", 2, "Standard", 70, 0) + g(0, "ENDTAB")
      + tabelle("BLOCK_RECORD", 9, 2)
      + rec("BLOCK_RECORD", "17", 9, "AcDbBlockTableRecord") + g(2, "*Model_Space", 340, "1A", 70, 0, 280, 1, 281, 0)
      + rec("BLOCK_RECORD", "1B", 9, "AcDbBlockTableRecord") + g(2, "*Paper_Space", 340, "1E", 70, 0, 280, 1, 281, 0)
      + g(0, "ENDTAB", 0, "ENDSEC");

    const block = (h1, h2, besitzer, name) => g(0, "BLOCK", 5, h1, 330, besitzer, 100, "AcDbEntity", 8, 0, 100, "AcDbBlockBegin", 2, name, 70, 0,
      10, 0, 20, 0, 30, 0, 3, name, 1, "") + g(0, "ENDBLK", 5, h2, 330, besitzer, 100, "AcDbEntity", 8, 0, 100, "AcDbBlockEnd");
    const bloecke = g(0, "SECTION", 2, "BLOCKS") + block("18", "19", "17", "*Model_Space") + block("1C", "1D", "1B", "*Paper_Space") + g(0, "ENDSEC");

    const layout = (handle, name, nr, block) => g(0, "LAYOUT", 5, handle, 330, "D", 100, "AcDbPlotSettings", 1, "", 4, "A3", 6, "",
      40, 7.5, 41, 20, 42, 7.5, 43, 20, 44, 420, 45, 297, 46, 0, 47, 0, 48, 0, 49, 0, 140, 0, 141, 0, 142, 1, 143, 1, 70, nr ? 0 : 1024,
      72, 1, 73, 0, 74, 5, 7, "", 75, 16, 76, 0, 77, 2, 78, 300, 147, 1, 148, 0, 149, 0, 100, "AcDbLayout", 1, name, 70, 1, 71, nr,
      10, 0, 20, 0, 11, 420, 21, 297, 12, 0, 22, 0, 32, 0, 14, 1e20, 24, 1e20, 34, 1e20, 15, -1e20, 25, -1e20, 35, -1e20, 146, 0,
      13, 0, 23, 0, 33, 0, 16, 1, 26, 0, 36, 0, 17, 0, 27, 1, 37, 0, 76, 1, 330, block);
    const objekte = g(0, "SECTION", 2, "OBJECTS",
      0, "DICTIONARY", 5, "A", 330, 0, 100, "AcDbDictionary", 281, 1, 3, "ACAD_GROUP", 350, "C", 3, "ACAD_LAYOUT", 350, "D", 3, "ACAD_PLOTSTYLENAME", 350, "12",
      0, "DICTIONARY", 5, "C", 330, "A", 100, "AcDbDictionary", 281, 1,
      0, "DICTIONARY", 5, "D", 330, "A", 100, "AcDbDictionary", 281, 1, 3, "Model", 350, "1A", 3, "Layout1", 350, "1E",
      0, "ACDBDICTIONARYWDFLT", 5, "12", 330, "A", 100, "AcDbDictionary", 281, 1, 3, "Normal", 350, "13", 100, "AcDbDictionaryWithDefault", 340, "13",
      0, "ACDBPLACEHOLDER", 5, "13", 330, "12")
      + layout("1A", "Model", 0, "17") + layout("1E", "Layout1", 1, "1B") + g(0, "ENDSEC");

    return new Blob([kopf, tabellen, bloecke, g(0, "SECTION", 2, "ENTITIES"), ...this.stuecke, g(0, "ENDSEC"), objekte, g(0, "EOF")],
      { type: "application/dxf" });
  }
}

// ---------- Gemeinsames ----------
// Nullpunkt: Allplan = UTM-Koordinaten (kein Versatz), ArchiCAD = Südwestecke des Gebiets (ganze Meter)
function dxfVersatz(ziel) {
  if (!DXF_ZIELE[ziel].lokal) return [0, 0];
  const [w, s, o, n] = analyseErgebnis.bbox;
  const ecken = [[w, s], [o, s], [o, n], [w, n]].map(([lon, lat]) => gradZuUtm(lon, lat));
  return [Math.floor(Math.min(...ecken.map((p) => p[0]))), Math.floor(Math.min(...ecken.map((p) => p[1])))];
}

function umbrechenZeichen(text, max) {
  const zeilen = [];
  let z = "";
  for (const w of String(text).split(/\s+/)) {
    if (z && (z + " " + w).length > max) { zeilen.push(z); z = w; } else z = z ? `${z} ${w}` : w;
  }
  if (z) zeilen.push(z);
  return zeilen;
}

// Schriftblock im Layer BESCHRIFTUNG: Titel, Koordinatenbezug, Höhenbezug, Quellen (Pflicht laut Lizenz)
function dxfBeschriftung(dxf, { x, y, z = 0, hoehe, titel, zeilen, quelle }) {
  const ebene = dxf.ebene("BESCHRIFTUNG", "#111111");
  const alle = [...zeilen, ...umbrechenZeichen(`Quellen: ${String(quelle).replace(/^\s*Quellen?:\s*/i, "")}`, 110),
    `Erstellt mit Ortsanalyse am ${new Date().toLocaleDateString("de-DE")} · Einheit 1 m · nicht vermessungsgenau`];
  dxf.text([x, y, z], hoehe * 1.6, titel, { ebene });
  alle.forEach((t, i) => dxf.text([x, y - hoehe * (3 + i * 1.6), z], hoehe, t, { ebene }));
}

function koordinatenText(dxf) {
  return dxf.versatz[0] || dxf.versatz[1]
    ? `Lokaler Nullpunkt 0/0 = ETRS89 / UTM 32N (EPSG:25832) E ${dxf.versatz[0]} / N ${dxf.versatz[1]}. In ArchiCAD: Projektnullpunkt = diese Bezugskoordinaten.`
    : "Koordinaten: ETRS89 / UTM 32N (EPSG:25832), Ost/Nord in Metern ohne Zonenkennziffer.";
}

// Ringe ohne doppelten Endpunkt
const ohneEndpunkt = (r) => (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]
  && (r[0][2] ?? 0) === (r[r.length - 1][2] ?? 0) ? r.slice(0, -1) : r);

// Ebene 3D-Fläche (Ring + Löcher) als 3DFACE: bis 4 Ecken direkt, sonst in Dreiecke geteilt (Teilungskanten unsichtbar)
function polygon3d(dxf, ringe, o) {
  ringe = ringe.map(ohneEndpunkt).filter((r) => r.length >= 3);
  if (!ringe.length) return;
  if (ringe.length === 1 && ringe[0].length <= 4) {
    const r = ringe[0];
    dxf.flaeche3d(r[0], r[1], r[2], r[3] || r[2], o, r.length === 3 ? 4 : 0);
    return;
  }
  const n = normale(ringe[0]);
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  const proj = az >= ax && az >= ay ? (p) => new THREE.Vector2(p[0], p[1]) : ax >= ay ? (p) => new THREE.Vector2(p[1], p[2]) : (p) => new THREE.Vector2(p[0], p[2]);
  let dreiecke;
  try { dreiecke = THREE.ShapeUtils.triangulateShape(ringe[0].map(proj), ringe.slice(1).map((r) => r.map(proj))); } catch (e) { return; }
  const alle = [].concat(...ringe);
  const ringVon = [], start = [];
  let i0 = 0;
  ringe.forEach((r, k) => { start.push(i0); r.forEach(() => ringVon.push(k)); i0 += r.length; });
  const kante = (a, b) => { // Kante des Originalrings?
    if (ringVon[a] !== ringVon[b]) return false;
    const k = ringVon[a], len = ringe[k].length, ia = a - start[k], ib = b - start[k];
    return Math.abs(ia - ib) === 1 || Math.abs(ia - ib) === len - 1;
  };
  for (const [a, b, c] of dreiecke) {
    const unsichtbar = (kante(a, b) ? 0 : 1) | (kante(b, c) ? 0 : 2) | 4 | (kante(c, a) ? 0 : 8);
    dxf.flaeche3d(alle[a], alle[b], alle[c], alle[c], o, unsichtbar);
  }
}

// ---------- 3D-Modell ----------
// Farben der Bodenkarte (dreid.js, bodenTextur) → Layer des Geländes
const GELAENDE_KLASSEN = [
  { ebene: "GELAENDE", farbe: "#ecebe6", auch: [] },
  { ebene: "GELAENDE_WIESE", farbe: "#dfe8d6", auch: [] },
  { ebene: "GELAENDE_PARK", farbe: "#c9d9bd", auch: [] },
  { ebene: "GELAENDE_WALD", farbe: "#a6c098", auch: [] },
  { ebene: "GELAENDE_WASSER", farbe: "#c3d3dc", auch: [] },
  { ebene: "GELAENDE_PLATZ", farbe: "#dcdcd8", auch: ["#b4b4b0"] },
  { ebene: "GELAENDE_STRASSE", farbe: "#d4d4d0", auch: ["#a8a8a4"] },
  { ebene: "GELAENDE_WEG", farbe: "#c2c2be", auch: [] },
  { ebene: "GELAENDE_BAHN", farbe: "#8a8a8a", auch: [] }
];
const GELAENDE_ZIELE = GELAENDE_KLASSEN.flatMap((k, i) => [k.farbe, ...k.auch].map((f) => [rgbVon(f), i]));
const GELAENDE_ZELLEN = 80000; // höchstens so viele Rasterzellen (Dateigröße)

function gelaendeDxf(dxf, m, P) {
  const [minX, minY, maxX, maxY] = m.rahmen;
  const schritt = Math.max(1, Math.ceil(Math.sqrt(((maxX - minX) * (maxY - minY)) / GELAENDE_ZELLEN) * 2) / 2);
  const teilung = (a, b) => { const n = Math.max(1, Math.round((b - a) / schritt)); return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n); };
  const xs = teilung(minX, maxX), ys = teilung(minY, maxY);
  // Farbe der Bodenkarte unter jedem Dreieck ablesen
  let bild = null, B = 0, H = 0, proM = 1;
  if (m.leinwand) {
    B = m.leinwand.width; H = m.leinwand.height; proM = B / (maxX - minX);
    bild = m.leinwand.getContext("2d").getImageData(0, 0, B, H).data;
  }
  const speicher = new Map();
  const klasse = (x, y) => {
    if (!bild) return 0;
    const px = Math.min(B - 1, Math.max(0, Math.floor((x - minX) * proM))), py = Math.min(H - 1, Math.max(0, Math.floor((maxY - y) * proM)));
    const i = (py * B + px) * 4, key = (bild[i] << 16) | (bild[i + 1] << 8) | bild[i + 2];
    let k = speicher.get(key);
    if (k === undefined) {
      let d = Infinity;
      for (const [[r, g, b], nr] of GELAENDE_ZIELE) {
        const e = (r - bild[i]) ** 2 + (g - bild[i + 1]) ** 2 + (b - bild[i + 2]) ** 2;
        if (e < d) { d = e; k = nr; }
      }
      speicher.set(key, k);
    }
    return k;
  };
  const ebenen = [];
  const ebene = (k) => ebenen[k] || (ebenen[k] = dxf.ebene(GELAENDE_KLASSEN[k].ebene, GELAENDE_KLASSEN[k].farbe));
  const z = ys.map((y) => xs.map((x) => m.hoehe(x, y)));
  for (let j = 0; j < ys.length - 1; j++) {
    for (let i = 0; i < xs.length - 1; i++) {
      const a = P(xs[i], ys[j], z[j][i]), b = P(xs[i + 1], ys[j], z[j][i + 1]);
      const c = P(xs[i], ys[j + 1], z[j + 1][i]), d = P(xs[i + 1], ys[j + 1], z[j + 1][i + 1]);
      // gleiche Teilung wie im 3D-Modell (a, b, d) und (a, d, c); Farbe in der Dreiecksmitte; Kanten unsichtbar
      const k1 = klasse((xs[i] + xs[i + 1] * 2) / 3, (ys[j] * 2 + ys[j + 1]) / 3);
      const k2 = klasse((xs[i] * 2 + xs[i + 1]) / 3, (ys[j] + ys[j + 1] * 2) / 3);
      dxf.flaeche3d(a, b, d, d, { ebene: ebene(k1) }, 15);
      dxf.flaeche3d(a, d, c, c, { ebene: ebene(k2) }, 15);
    }
  }
  return schritt;
}

const hexVon = (zahl) => `#${zahl.toString(16).padStart(6, "0")}`;

function modellAlsDxf(ziel) {
  const m = dreid && dreid.modell;
  if (!m) throw new Error("Kein 3D-Modell vorhanden");
  const dxf = new DxfDatei(dxfVersatz(ziel));
  const zB = m.mitGelaende ? m.z0 : 0; // lokale Höhen der App → m ü. NHN
  const P = (x, y, z) => [x + m.mitte[0], y + m.mitte[1], z + zB];

  // Gelände
  const raster = gelaendeDxf(dxf, m, P);

  // LoD2: Wände und Dächer, Punkt für Punkt wie im 3D-Modell
  const wand = dxf.ebene("LOD2_WAND", hexVon(DREID_FARBEN.wand)), dach = dxf.ebene("LOD2_DACH", hexVon(DREID_FARBEN.dach));
  const [vx, vy] = m.lod2Versatz;
  for (const g of m.lod2) {
    const dz = m.mitGelaende ? g.basis - m.z0 : 0;
    for (const f of g.flaechen) {
      polygon3d(dxf, f.ringe.map((r) => r.map(([x, y, z]) => P(x + vx, y + vy, z + dz))), { ebene: f.typ === "R" ? dach : wand });
    }
  }

  // Ersatz-Klötze aus OSM: Wände, Deckel, Boden
  if (m.ersatz.length) {
    const ersatz = dxf.ebene("ERSATZ_OSM_GESCHOSSE", hexVon(DREID_FARBEN.ersatz));
    for (const e of m.ersatz) {
      const unten = e.boden, oben = e.boden + e.hoehe;
      for (const ring of e.ringe) {
        ring.forEach((a, i) => {
          const b = ring[(i + 1) % ring.length];
          dxf.flaeche3d(P(a[0], a[1], unten), P(b[0], b[1], unten), P(b[0], b[1], oben), P(a[0], a[1], oben), { ebene: ersatz });
        });
      }
      polygon3d(dxf, e.ringe.map((r) => r.map(([x, y]) => P(x, y, oben))), { ebene: ersatz });
      polygon3d(dxf, e.ringe.map((r) => r.map(([x, y]) => P(x, y, unten))), { ebene: ersatz });
    }
  }

  // Bäume: Stamm (6-seitig) und Krone (Ikosaeder wie im 3D-Modell), ohne Kantenlinien
  if (m.baeume.length) {
    const stammE = dxf.ebene("BAUM_STAMM", hexVon(DREID_FARBEN.stamm)), kroneE = dxf.ebene("BAUM_KRONE", hexVon(DREID_FARBEN.krone));
    const kugel = new THREE.IcosahedronGeometry(1, 1);
    const kp = (kugel.index ? kugel.toNonIndexed() : kugel).attributes.position.array;
    for (const b of m.baeume) {
      const hs = b.h - b.r; // Stammhöhe bis zur Kronenmitte
      for (let k = 0; k < 6; k++) {
        const w1 = (k * Math.PI) / 3, w2 = ((k + 1) * Math.PI) / 3;
        dxf.flaeche3d(P(b.x + 0.3 * Math.cos(w1), b.y + 0.3 * Math.sin(w1), b.z), P(b.x + 0.3 * Math.cos(w2), b.y + 0.3 * Math.sin(w2), b.z),
          P(b.x + 0.25 * Math.cos(w2), b.y + 0.25 * Math.sin(w2), b.z + hs), P(b.x + 0.25 * Math.cos(w1), b.y + 0.25 * Math.sin(w1), b.z + hs), { ebene: stammE }, 15);
      }
      const pk = (i) => P(b.x + kp[i] * b.r, b.y + kp[i + 1] * b.r, b.z + hs + kp[i + 2] * b.r * 0.9);
      for (let i = 0; i < kp.length; i += 9) { const c = pk(i + 6); dxf.flaeche3d(pk(i), pk(i + 3), c, c, { ebene: kroneE }, 15); }
    }
    kugel.dispose();
  }

  // Gebietsrahmen (rot, folgt dem Gelände) und Nordpfeil
  const rahmenE = dxf.ebene("GEBIETSRAHMEN", hexVon(DREID_FARBEN.akzent));
  const rahmen = [];
  m.eckenLokal.forEach((p, i) => {
    const q = m.eckenLokal[(i + 1) % 4];
    const teile = Math.max(1, Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / 10));
    for (let k = 0; k < teile; k++) {
      const x = p[0] + ((q[0] - p[0]) * k) / teile, y = p[1] + ((q[1] - p[1]) * k) / teile;
      rahmen.push(P(x, y, m.hoehe(x, y) + 0.3));
    }
  });
  dxf.polylinie3d(rahmen, { ebene: rahmenE, geschlossen: true });
  const nordE = dxf.ebene("NORDPFEIL", hexVon(DREID_FARBEN.akzent));
  const nz = m.hoehe(0, m.nordY) + 0.1, np = (x, y) => P(x, m.nordY + y, nz);
  dxf.flaeche3d(np(0, 18), np(7, -6), np(0, 0), np(0, 0), { ebene: nordE });
  dxf.flaeche3d(np(0, 18), np(0, 0), np(-7, -6), np(-7, -6), { ebene: nordE });
  dxf.text(np(0, 24), 6, "N", { ebene: nordE, mitte: true });

  // Beschriftung südlich des Gebiets, auf Geländehöhe
  const [minX, minY] = m.rahmen;
  dxfBeschriftung(dxf, { ...(([x, y, z]) => ({ x, y, z }))(P(minX, minY - 12, m.hoehe(minX, minY))), hoehe: 3,
    titel: "Ortsanalyse – 3D-Modell",
    zeilen: [koordinatenText(dxf),
      m.mitGelaende ? "Höhen: m ü. NHN (DHHN2016), nicht überhöht." : "Höhen: relativ zum Boden (keine Geländedaten geladen).",
      `Gelände als Dreiecksnetz, Raster ${fmt(raster, 1)} m, Farben der Bodenkarte als Layer GELAENDE_… (Ränder rasterbedingt gestuft).`,
      "Gebäude: LoD2 (Layer LOD2_WAND, LOD2_DACH), Ersatz aus OSM-Geschossen x 3 m (ERSATZ_OSM_GESCHOSSE). Bäume: Höhe geschätzt."],
    quelle: m.quelle });
  return { blob: dxf.blob(), anzahl: dxf.anzahl };
}

// ---------- 2D-Pläne ----------
// Liest den Stil der Planansicht wie vektorplan.js und schreibt jede sichtbare Ebene auf einen eigenen Layer.
function planAlsDxf(plan, massstab, ziel) {
  const dxf = new DxfDatei(dxfVersatz(ziel));
  const stil = planKarte.getStyle();
  const sichtbar = sichtbareEbenen(plan);
  const [w, s, o, n] = analyseErgebnis.bbox;
  const mitteLL = [(w + o) / 2, (s + n) / 2];
  const z = Math.log2((40075016.686 * Math.cos((mitteLL[1] * Math.PI) / 180)) / (512 * ((massstab * 0.0254) / 96)));
  const mJePx = (PX_MM * massstab) / 1000; // Meter je Bildschirmpixel beim gewählten Maßstab
  const papierMm = (meter) => (meter * 1000) / massstab;
  const cache = new Map();
  const utm = (pt) => {
    const key = `${pt[0]},${pt[1]}`;
    let p = cache.get(key);
    if (!p) { p = gradZuUtm(pt[0], pt[1]); cache.set(key, p); }
    return p;
  };
  const polygone = (g) => (g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []);
  const linien = (g) => (g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates
    : g.type === "Polygon" ? g.coordinates : g.type === "MultiPolygon" ? g.coordinates.flat() : []);
  // Linie: breit (≥ 0,5 mm auf dem Papier) als Polylinie mit Breite in Metern, sonst als Strichstärke
  const linieSchreiben = (punkte, breiteM, opt) => {
    const mm = papierMm(breiteM);
    if (mm >= 0.5) dxf.polylinie(punkte, { ...opt, breite: breiteM });
    else dxf.polylinie(punkte, { ...opt, gewicht: liniengewicht(mm) });
  };

  for (const ebene of stil.layers) {
    if (ebene.type === "background" || !sichtbar.has(ebene.id)) continue;
    const quelle = stil.sources[ebene.source];
    const daten = quelle && quelle.data;
    const alle = !daten ? [] : daten.type === "Feature" ? [daten] : daten.features || [];
    let features = alle.filter((f) => f.geometry && (!ebene.filter || auswerten(ebene.filter, f, z)));
    if (!features.length) continue;
    const p = ebene.paint || {}, l = ebene.layout || {};
    const wert = (name, f, standard) => (p[name] === undefined ? standard : auswerten(p[name], f, z));
    if (l["line-sort-key"]) features = features.map((f) => [auswerten(l["line-sort-key"], f, z), f]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    let name = null;
    const layer = (farbe) => name || (name = dxf.ebene(ebene.id, farbe)); // Layerfarbe = Farbe des ersten Objekts

    if (ebene.type === "fill") {
      for (const f of features) {
        const polys = polygone(f.geometry);
        if (!polys.length) continue;
        const farbe = dxfFarbe(wert("fill-color", f, "#000"), wert("fill-opacity", f, 1));
        const ring = (r) => ohneEndpunkt(r).map(utm);
        dxf.schraffur(polys.map((poly) => poly.map(ring)), { ebene: layer(farbe), farbe });
        if (p["fill-outline-color"] !== undefined) {
          const rand = dxfFarbe(wert("fill-outline-color", f, "#000"));
          for (const poly of polys) for (const r of poly) dxf.polylinie(ring(r), { ebene: layer(farbe), farbe: rand, geschlossen: true, gewicht: 0 });
        }
      }
    } else if (ebene.type === "line") {
      for (const f of features) {
        const breite = wert("line-width", f, 1) * mJePx;
        if (!(breite > 0)) continue;
        const farbe = dxfFarbe(wert("line-color", f, "#000"), wert("line-opacity", f, 1));
        const strich = p["line-dasharray"] ? auswerten(p["line-dasharray"], f, z) : null;
        const ltyp = strich ? dxf.linientyp(strich.map((x) => x * Math.max(breite, 0.35 * massstab / 1000))) : null;
        for (const r of linien(f.geometry)) linieSchreiben(r.map(utm), breite, { ebene: layer(farbe), farbe, ltyp });
      }
    } else if (ebene.type === "circle") {
      for (const f of features) {
        if (f.geometry.type !== "Point") continue;
        const m = utm(f.geometry.coordinates);
        const r = wert("circle-radius", f, 5) * mJePx;
        const farbe = dxfFarbe(wert("circle-color", f, "#000"), wert("circle-opacity", f, 1));
        const kreisPunkte = Array.from({ length: 24 }, (_, i) => [m[0] + r * Math.cos((i * Math.PI) / 12), m[1] + r * Math.sin((i * Math.PI) / 12)]);
        dxf.schraffur([[kreisPunkte]], { ebene: layer(farbe), farbe });
        const sb = wert("circle-stroke-width", f, 0);
        if (sb > 0) dxf.kreis(m, r, { ebene: layer(farbe), farbe: dxfFarbe(wert("circle-stroke-color", f, "#000")), gewicht: liniengewicht(sb * PX_MM) });
      }
    } else if (ebene.type === "symbol") {
      // Orte der Infrastruktur: Kreis in der Farbe der Ebene, daneben Art und Name
      for (const f of features) {
        if (f.geometry.type !== "Point") continue;
        const art = INFRA_ART[f.properties.art];
        if (!art) continue;
        const m = utm(f.geometry.coordinates);
        const r = 9 * auswerten(l["icon-size"] ?? 1, f, z) * mJePx;
        const e = dxf.ebene(`INFRA_${art.ebene}`, INFRA_EBENEN[art.ebene].farbe);
        dxf.schraffur([[Array.from({ length: 24 }, (_, i) => [m[0] + r * Math.cos((i * Math.PI) / 12), m[1] + r * Math.sin((i * Math.PI) / 12)])]], { ebene: e });
        const th = 1.6 * massstab / 1000;
        dxf.text([m[0] + r * 1.3, m[1] - th / 2], th, f.properties.name ? `${art.name}: ${f.properties.name}` : art.name, { ebene: dxf.ebene(`INFRA_${art.ebene}_TEXT`, "#333333") });
      }
    }
  }

  // Texte: Flurstücksnummern, Bodenrichtwerte
  const th = 1.8 * massstab / 1000;
  if (plan === "flurstuecke" && mitParzellen) {
    const e = dxf.ebene("FLURSTUECK_NUMMER", "#2b2b2b");
    for (const f of stil.sources.parzellen.data.features || []) {
      if (!f.properties.nummer) continue;
      dxf.text(utm(turf.pointOnFeature(f).geometry.coordinates), th, f.properties.nummer, { ebene: e, mitte: true });
    }
  }
  if (plan === "boden" && brwDaten) {
    const e = dxf.ebene("BODENRICHTWERT_TEXT", "#111111");
    for (const f of brwDaten.zonen.features) {
      if (f.properties.zustand !== "B" || turf.area(f) < 1500) continue;
      dxf.text(utm(turf.pointOnFeature(f).geometry.coordinates), th * 1.2, `${fmt(f.properties.wert)} €/m²`, { ebene: e, mitte: true });
    }
  }

  const ecken = [[w, s], [o, s]].map((pt) => gradZuUtm(...pt));
  dxfBeschriftung(dxf, { x: Math.min(ecken[0][0], ecken[1][0]), y: Math.min(ecken[0][1], ecken[1][1]) - 8 * massstab / 1000, hoehe: 2 * massstab / 1000,
    titel: `Ortsanalyse – ${PLAN_TITEL[plan]}`,
    zeilen: [koordinatenText(dxf), `Linienbreiten und Schrift für M 1:${fmt(massstab)} angelegt. Flächen als Schraffur, je Ebene ein Layer.`],
    quelle: quellText() });
  return { blob: dxf.blob(), anzahl: dxf.anzahl };
}

// ---------- Schnitt ----------
// x = Meter entlang der Schnittlinie (A = 0), y = Höhe (m ü. NHN), wie im Reiter „Schnitt“
function schnittAlsDxf(massstab) {
  const erg = berechneSchnitt();
  if (!erg) throw new Error("Keine Schnittlinie");
  const { L, T, profil, horizont, elemente, schnittFlaechen, c } = erg;
  const dxf = new DxfDatei([0, 0]);
  const mm = massstab / 1000; // Meter je mm auf dem Papier
  const sockel = Math.floor(Math.min(...profil.map((p) => p[1]))) - 4;

  if (c.mitGelaende) {
    const e = dxf.ebene("ANSICHT_GELAENDE", "#ebebe8");
    const flaeche = [[0, sockel], ...horizont, [L, sockel]];
    dxf.schraffur([[flaeche]], { ebene: e });
    dxf.polylinie(flaeche, { ebene: e, farbe: "#c8c8c5", geschlossen: true, gewicht: 13 });
  }
  // Ansicht von hinten nach vorn (je weiter weg, desto heller)
  const dachE = dxf.ebene("ANSICHT_DACH", "#a0a09e"), wandE = dxf.ebene("ANSICHT_WAND", "#c4c4c2");
  const baumE = dxf.ebene("ANSICHT_BAUM", "#465541"), baumSE = dxf.ebene("SCHNITT_BAUM", "#1a1a1a");
  for (const el of elemente) {
    const f = Math.min(1, Math.max(0, el.tiefe / T));
    if (el.art === "flaeche") {
      const ton = Math.round((el.typ === "R" ? 160 : 196) + f * (el.typ === "R" ? 80 : 50)), linie = Math.round(60 + f * 130);
      const e = el.typ === "R" ? dachE : wandE;
      dxf.schraffur([[el.punkte]], { ebene: e, farbe: `rgb(${ton},${ton},${ton - 2})` });
      dxf.polylinie(el.punkte, { ebene: e, farbe: `rgb(${linie},${linie},${linie})`, geschlossen: true, gewicht: f > 0.5 ? 9 : 18 });
    } else {
      // Baum: lockerer Kronenrand, Stamm mit zwei Ästen (wie die Zeichnung im Reiter)
      const e = el.geschnitten ? baumSE : baumE;
      const farbe = el.geschnitten ? "#1a1a1a" : `rgb(${Math.round(70 + f * 120)},${Math.round(85 + f * 110)},${Math.round(65 + f * 120)})`;
      const mitteZ = el.z + el.h - el.r, rx = el.r, ry = el.r * 0.95;
      const p1 = zufall(el.saat) * 6.28, p2 = zufall(el.saat * 3.1) * 6.28, p3 = zufall(el.saat * 7.7) * 6.28;
      const krone = Array.from({ length: 40 }, (_, i) => {
        const w = (i / 40) * Math.PI * 2;
        const k = 1 + 0.08 * Math.sin(5 * w + p1) + 0.06 * Math.sin(9 * w + p2) + 0.04 * Math.sin(14 * w + p3);
        return [el.s + Math.cos(w) * rx * k, mitteZ + Math.sin(w) * ry * k];
      });
      dxf.polylinie(krone, { ebene: e, farbe, geschlossen: true, gewicht: 18 });
      const ansatz = mitteZ - el.r * 0.55;
      dxf.polylinie([[el.s, el.z], [el.s, ansatz]], { ebene: e, farbe, gewicht: 25 });
      for (const [dx, dy] of [[rx * 0.45, ry * 0.55], [-rx * 0.4, ry * 0.45]]) {
        dxf.polylinie(Array.from({ length: 7 }, (_, i) => {
          const t = i / 6, q = [el.s + dx * 0.3, ansatz + dy * 0.6], z1 = [el.s + dx, ansatz + dy];
          return [(1 - t) ** 2 * el.s + 2 * (1 - t) * t * q[0] + t * t * z1[0], (1 - t) ** 2 * ansatz + 2 * (1 - t) * t * q[1] + t * t * z1[1]];
        }), { ebene: e, farbe, gewicht: 18 });
      }
    }
  }
  // Geschnitten: Gelände und Gebäude schwarz
  const sgE = dxf.ebene("SCHNITT_GELAENDE", "#111111"), sbE = dxf.ebene("SCHNITT_GEBAEUDE", "#111111");
  dxf.schraffur([[[[0, sockel], ...profil, [L, sockel]]]], { ebene: sgE });
  const koten = dxf.ebene("HOEHENKOTEN", "#111111");
  const hoeheText = (z) => { const r = Math.round(z * 10) / 10 || 0; return `${c.nhn ? (r > 0 ? "+" : r < 0 ? "-" : "±") : r < 0 ? "-" : ""}${fmt(Math.abs(r), 1)}`; };
  const firste = [];
  for (const lauf of schnittFlaechen) {
    const umriss = [...lauf.oben, ...lauf.unten.slice().reverse()];
    dxf.schraffur([[umriss]], { ebene: sbE });
    const breite = lauf.oben[lauf.oben.length - 1][0] - lauf.oben[0][0];
    if (breite >= 6 * mm) firste.push(lauf.oben.reduce((a, p) => (p[1] > a[1] ? p : a)));
  }
  // Höhenkoten am First, nicht zu dicht nebeneinander (wie im Reiter „Schnitt“)
  let letzte = -Infinity;
  for (const first of firste.sort((a, b) => a[0] - b[0])) {
    if (first[0] - letzte < 15 * mm) continue;
    letzte = first[0];
    const d = 1.2 * mm;
    dxf.polylinie([[first[0] - d, first[1] + 2 * d], [first[0] + d, first[1] + 2 * d], [first[0], first[1] + 0.5 * d]], { ebene: koten, geschlossen: true, gewicht: 18 });
    dxf.text([first[0] + 1.6 * d, first[1] + 1.2 * d], 2 * mm, hoeheText(first[1]), { ebene: koten });
  }
  // Schnittlinie A–A′ an den Enden, Höhenskala links
  const linieE = dxf.ebene("SCHNITTLINIE", PLAN_FARBEN.akzent);
  let zMax = Math.max(...horizont.map((p) => p[1]));
  for (const el of elemente) zMax = Math.max(zMax, el.art === "flaeche" ? Math.max(...el.punkte.map((p) => p[1])) : el.z + el.h);
  zMax = Math.ceil(zMax) + 3;
  const ltyp = dxf.linientyp([6 * mm, 2 * mm, 1 * mm, 2 * mm]);
  for (const [x, t] of [[0, "A"], [L, "A'"]]) {
    dxf.polylinie([[x, sockel], [x, zMax]], { ebene: linieE, ltyp, gewicht: 25 });
    dxf.text([x, zMax + 2 * mm], 3.5 * mm, t, { ebene: linieE, mitte: true });
  }
  const skala = dxf.ebene("HOEHENSKALA", "#111111");
  const hs = [1, 2, 5, 10, 20, 50].find((v) => v / mm >= 7) || 50;
  dxf.polylinie([[-4 * mm, sockel], [-4 * mm, zMax]], { ebene: skala, gewicht: 18 });
  for (let zz = Math.ceil(sockel / hs) * hs; zz <= zMax; zz += hs) {
    dxf.polylinie([[-5.2 * mm, zz], [-4 * mm, zz]], { ebene: skala, gewicht: 18 });
    dxf.text([-6 * mm - String(hoeheText(zz)).length * 1.6 * mm, zz - 0.8 * mm], 1.8 * mm, hoeheText(zz), { ebene: skala });
  }
  const A = gradZuUtm(...schnitt.a), B = gradZuUtm(...schnitt.b);
  dxfBeschriftung(dxf, { x: 0, y: sockel - 8 * mm, hoehe: 2 * mm, titel: `Ortsanalyse – ${schnittTitel(erg).replace(/′/g, "'")}`,
    zeilen: [`x = Meter entlang der Schnittlinie ab A, y = ${c.nhn ? "Höhe in m ü. NHN (DHHN2016)" : "Höhe in m"}. Schwarz: geschnitten, grau: Ansicht.`,
      `Lage der Linie: A = E ${fmt(A[0], 1)} / N ${fmt(A[1], 1)}, A' = E ${fmt(B[0], 1)} / N ${fmt(B[1], 1)} (ETRS89 / UTM 32N). Schrift für M 1:${fmt(massstab)}.`],
    quelle: quellText() });
  return { blob: dxf.blob(), anzahl: dxf.anzahl };
}

// Eine DXF für einen Eintrag des Export-Reiters
function dxfErzeugen(id) {
  if (id === "3d") return modellAlsDxf(dxfZiel);
  if (id === "schnitt") return schnittAlsDxf(exportStand.schnitt.massstab);
  return planAlsDxf(id, exportStand[id].massstab, dxfZiel);
}
const dxfDateiname = (id) => `ortsanalyse_${id}_${dxfZiel}${id !== "3d" && exportStand[id].massstab ? `_1-${exportStand[id].massstab}` : ""}_${dateiDatum()}.dxf`;
