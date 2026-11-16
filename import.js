/* ============================================================
   Ortsanalyse – Datei-Import
   - Ablagefeld (Drag & Drop oder Klick): CityGML (.gml/.xml), topoexport (.dxf), ZIP
   - Liste der geladenen Daten, Anzeige der benötigten LoD2-Kacheln
   - Verortung der topoexport-Dateien (keine echten Koordinaten):
     automatisch über Gebäudevergleich, Korrektur durch Verschieben oder Eingabe
   - fasst alles im selben Format zusammen wie die Beispieldaten (lod2.js),
     damit Pläne, 3D und Kennzahlen die Importe direkt nutzen
   Das Lesen der Dateien übernimmt import-worker.js im Hintergrund.
   ============================================================ */

const importDaten = {
  citygml: [],      // je Kachel: { name, kachel, gebaeude }
  topo2d: null,     // { rahmen, grundrisse, strassen }
  topo3d: null,     // { rahmen, gelaende, gebaeude }
  dgm: [],          // Geländemodell-Kacheln: { name, jahr, rechteck [O0,N0,O1,N1], nx, ny, werte (Zeile 0 = Norden) }
  verortung: null,  // [Ost, Nord] des topoexport-Nullpunkts in UTM 32
  kombi: null,      // zusammengefasste LoD2-Daten (Format wie data/beispiel-oldenburg-lod2.js, Einheit 1 m)
  strassen: null,   // amtliche Straßenflächen (Format wie data/beispiel-oldenburg-strassen.js)
  ausdehnung: null  // [West, Süd, Ost, Nord] aller Importe in Grad
};

const importStatus = document.getElementById("import-status");
const importListe = document.getElementById("import-liste");
const kachelBox = document.getElementById("kachel-status");
const dropzone = document.getElementById("dropzone");
const dateiWahl = document.getElementById("datei-wahl");
const meldeImport = (text) => { importStatus.textContent = text; importStatus.hidden = !text; };

// ---------- Worker (liest die Dateien im Hintergrund) ----------
let importWorker = null, auftragNr = 0;
const auftraege = new Map();
function workerAuftrag(art, name, puffer) {
  if (!importWorker) {
    try { importWorker = new Worker("import-worker.js"); }
    catch (e) { return Promise.reject(new Error("Der Import braucht einen Webserver (Seite nicht per Doppelklick öffnen).")); }
    importWorker.onmessage = (e) => {
      const { nr, fortschritt, ok, ergebnis, fehler } = e.data;
      if (fortschritt) { meldeImport(fortschritt); return; }
      const a = auftraege.get(nr);
      auftraege.delete(nr);
      ok ? a.ok(ergebnis) : a.fehler(new Error(fehler));
    };
    importWorker.onerror = (e) => { for (const a of auftraege.values()) a.fehler(new Error(e.message || "Fehler beim Lesen")); auftraege.clear(); };
  }
  return new Promise((ok, fehler) => {
    const nr = ++auftragNr;
    auftraege.set(nr, { ok, fehler });
    importWorker.postMessage({ nr, art, name, daten: puffer }, [puffer]);
  });
}

// ---------- Dateien annehmen ----------
async function dateienAnnehmen(dateien) {
  const liste = []; // [Name, () => Promise<ArrayBuffer>]
  const hinweise = [];
  for (const datei of dateien) {
    const name = datei.name.toLowerCase();
    if (name.endsWith(".zip")) {
      meldeImport(`Packe ${datei.name} aus …`);
      const zip = await JSZip.loadAsync(datei);
      zip.forEach((pfad, eintrag) => {
        if (!eintrag.dir) liste.push([pfad.split("/").pop(), () => eintrag.async("arraybuffer")]);
      });
    } else liste.push([datei.name, () => datei.arrayBuffer()]);
  }
  for (const [name, holen] of liste) {
    const n = name.toLowerCase();
    try {
      if (n.endsWith(".gml") || n.endsWith(".xml")) {
        meldeImport(`Lese ${name} …`);
        const erg = await workerAuftrag("citygml", name, await holen());
        importDaten.citygml = importDaten.citygml.filter((c) => !(c.kachel && erg.kachel && c.kachel.name === erg.kachel.name));
        importDaten.citygml.push(erg);
      } else if (n.endsWith(".dxf")) {
        meldeImport(`Lese ${name} …`);
        const erg = await workerAuftrag("dxf", name, await holen());
        if (erg.typ === "topoexport-2d") importDaten.topo2d = erg;
        else if (erg.typ === "topoexport-3d") importDaten.topo3d = erg;
        else hinweise.push(`${name}: keine topoexport-Datei (Layer ${erg.layer.join(", ")}). Allgemeine DXF folgen später.`);
      } else if (n.endsWith(".tif") || n.endsWith(".tiff")) {
        meldeImport(`Lese Geländemodell ${name} …`);
        await dgmEinlesen(await holen(), name);
      } else if (n.endsWith(".rar")) hinweise.push(`${name}: RAR wird noch nicht unterstützt. Bitte als ZIP packen.`);
      else if (n.endsWith(".dwg")) hinweise.push(`${name}: DWG folgt später. Bitte im CAD-Programm als DXF speichern.`);
      else if (!n.endsWith(".txt") && !n.endsWith(".pdf")) hinweise.push(`${name}: Format nicht erkannt.`);
    } catch (fehler) {
      console.error(fehler);
      hinweise.push(`${name}: ${fehler.message}`);
    }
  }
  kombiniere();
  zeigeDatenliste();
  zeigeKachelStatus();
  meldeImport(hinweise.join(" · "));
  if ((importDaten.topo2d || importDaten.topo3d) && !importDaten.verortung) starteVerortung();
}

// Ablagefeld: Ziehen und Ablegen oder Klicken
["dragenter", "dragover"].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add("ist-ueber"); }));
["dragleave", "drop"].forEach((ev) => dropzone.addEventListener(ev, () => dropzone.classList.remove("ist-ueber")));
dropzone.addEventListener("drop", (e) => { e.preventDefault(); dateienAnnehmen([...e.dataTransfer.files]); });
dropzone.addEventListener("click", () => dateiWahl.click());
dropzone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); dateiWahl.click(); } });
dateiWahl.addEventListener("change", () => { dateienAnnehmen([...dateiWahl.files]); dateiWahl.value = ""; });

// ---------- Geländemodell (GeoTIFF, z. B. DGM1 der Länder) ----------
// Wird auf ein 2-m-Raster verkleinert (für das 3D-Modell genau genug, viermal weniger Daten)
const DGM_RASTER = 2;
async function dgmEinlesen(puffer, name) {
  const tiff = await GeoTIFF.fromArrayBuffer(puffer);
  const bild = await tiff.getImage();
  const rechteck = bild.getBoundingBox(); // in UTM 32 (Meter)
  const nx = Math.max(2, Math.round((rechteck[2] - rechteck[0]) / DGM_RASTER));
  const ny = Math.max(2, Math.round((rechteck[3] - rechteck[1]) / DGM_RASTER));
  const [werte] = await bild.readRasters({ width: nx, height: ny, resampleMethod: "bilinear" });
  const keinWert = bild.getGDALNoData();
  const m = name.match(/(\d{3})_(\d{4})/), jahr = (name.match(/_(\d{4})\.tiff?$/i) || [])[1] || "";
  const kachel = m ? `${m[1]}_${m[2]}` : name;
  if (rechteck[0] < 100000 || rechteck[0] > 900000) throw new Error("Das Geländemodell liegt nicht in UTM 32");
  importDaten.dgm = importDaten.dgm.filter((d) => d.name !== kachel);
  importDaten.dgm.push({ name: kachel, jahr, rechteck, nx, ny, werte: Float32Array.from(werte, (z) => (z === keinWert || z < -1000 ? NaN : z)) });
}

// Alle DGM-Kacheln zu einem Raster zusammensetzen (Höhen in dm, Zeilen von Süd nach Nord)
function dgmMosaik(e0, n0) {
  const d = importDaten.dgm;
  const a = Math.min(...d.map((k) => k.rechteck[0])), b = Math.min(...d.map((k) => k.rechteck[1]));
  const c = Math.max(...d.map((k) => k.rechteck[2])), e = Math.max(...d.map((k) => k.rechteck[3]));
  const nx = Math.round((c - a) / DGM_RASTER), ny = Math.round((e - b) / DGM_RASTER);
  const z = new Int16Array(nx * ny);
  let letzter = 0;
  for (let j = 0; j < ny; j++) {
    const y = b + (j + 0.5) * DGM_RASTER;
    for (let i = 0; i < nx; i++) {
      const x = a + (i + 0.5) * DGM_RASTER;
      let wert = NaN;
      for (const k of d) {
        const [x0, y0, x1, y1] = k.rechteck;
        if (x < x0 || x >= x1 || y < y0 || y >= y1) continue;
        const spalte = Math.min(k.nx - 1, Math.floor((x - x0) / (x1 - x0) * k.nx));
        const zeile = Math.min(k.ny - 1, Math.floor((y1 - y) / (y1 - y0) * k.ny));
        wert = k.werte[zeile * k.nx + spalte];
        break;
      }
      if (!isNaN(wert)) letzter = Math.round(wert * 10);
      z[j * nx + i] = letzter; // Lücken mit dem letzten Wert füllen
    }
  }
  return { x0: a - e0 + DGM_RASTER / 2, y0: b - n0 + DGM_RASTER / 2, dx: DGM_RASTER, dy: DGM_RASTER, nx, ny, z };
}

// ---------- Zusammenfassen (wie die Beispieldaten) ----------
function kombiniere() {
  const cg = importDaten.citygml, t3 = importDaten.topo3d, t2 = importDaten.topo2d, v = importDaten.verortung, dgm = importDaten.dgm;
  importDaten.kombi = null; importDaten.strassen = null; importDaten.ausdehnung = null;
  const topoDa = (t2 || t3) && v;
  if (!cg.length && !topoDa && !dgm.length) { zeigeTopoRahmen(); return; }

  const nullpunkt = topoDa ? v : cg.length && cg[0].kachel ? cg[0].kachel.rechteck.slice(0, 2)
    : dgm.length ? dgm[0].rechteck.slice(0, 2) : [0, 0];
  const [e0, n0] = nullpunkt;
  const kacheln = cg.filter((c) => c.kachel).map((c) => { const [a, b, x, y] = c.kachel.rechteck; return [a - e0, b - n0, x - e0, y - n0]; });
  const gebaeude = [], ids = new Set(), grundrisse = [];
  const flach = (ring, basis) => ring.flatMap((p) => [p[0] - e0, p[1] - n0, p[2] - basis]);

  // 1. CityGML (Rang 1): doppelte Gebäude auf Kachelgrenzen nur einmal
  for (const c of cg) for (const g of c.gebaeude) {
    if (ids.has(g.id)) continue;
    ids.add(g.id);
    const boden = g.flaechen.filter((f) => f[0] === "G").flatMap((f) => f[1][0]);
    const alle = g.flaechen.flatMap((f) => f[1][0]);
    const basis = Math.min(...(boden.length ? boden : alle).map((p) => p[2]));
    const flaechen = g.flaechen.filter((f) => f[0] !== "G").map(([typ, ringe]) => [typ, ...ringe.map((r) => flach(r, basis))]);
    const grund = g.flaechen.filter((f) => f[0] === "G").map((f) => f[1][0].map((p) => [p[0] - e0, p[1] - n0]));
    grund.forEach((r) => grundrisse.push(r));
    gebaeude.push([g.id.slice(-8), g.funktion, g.dachform, g.hoehe, basis, flaechen, "C", grund]);
  }

  // 2. topoexport 3D (Rang 2): nur wo kein CityGML-Gebäude steht und keine Kachel geladen ist
  let rahmen = null, gelaende = null;
  if (topoDa) {
    const [tx, ty] = [v[0] - e0, v[1] - n0]; // = 0, weil der Nullpunkt der topoexport-Nullpunkt ist
    const r = (t3 || t2).rahmen;
    if (r) rahmen = [r[0] + tx, r[1] + ty, r[2] + tx, r[3] + ty];
    const boxen = grundrisse.map((ring) => [Math.min(...ring.map((p) => p[0])), Math.min(...ring.map((p) => p[1])),
      Math.max(...ring.map((p) => p[0])), Math.max(...ring.map((p) => p[1])), ring]);
    const inKachel = (x, y) => kacheln.some(([a, b, c, d]) => x >= a && x < c && y >= b && y < d);
    const unterCityGML = (x, y) => boxen.some(([a, b, c, d, ring]) => x >= a && x <= c && y >= b && y <= d && punktImRing(x, y, ring));
    if (t3) {
      let nr = 0;
      for (const g of t3.gebaeude) {
        const x = g.mitte[0] + tx, y = g.mitte[1] + ty;
        if (inKachel(x, y) || unterCityGML(x, y)) continue;
        const flaechen = g.flaechen.map(([typ, ringe]) => [typ, ...ringe.map((ring) => ring.flatMap((p) => [p[0] + tx, p[1] + ty, p[2] - g.basis]))]);
        gebaeude.push([`T${++nr}`, "", "", Math.round(g.hoehe * 10) / 10, g.basis, flaechen, "T"]);
      }
      if (t3.gelaende) gelaende = { ...t3.gelaende, x0: t3.gelaende.x0 + tx, y0: t3.gelaende.y0 + ty, z: t3.gelaende.z.map((z) => Math.round(z * 10)) };
    }
    if (t2 && t2.strassen.length) {
      importDaten.strassen = { nullpunkt, einheit: 1, rahmen,
        flaechen: t2.strassen.map((poly) => poly.map((ring) => ring.flatMap((p) => [p[0] + tx, p[1] + ty]))) };
    }
  }
  // Gelände: DGM1 (genauer, 2 m) vor topoexport (ca. 20 m)
  if (dgm.length) gelaende = dgmMosaik(e0, n0);
  importDaten.kombi = { nullpunkt, epsg: 25832, einheit: 1, kacheln, gebaeude,
    topoexport: rahmen ? { rahmen } : undefined, gelaende: gelaende || undefined };

  // Ausdehnung in Grad (für „berührt das Gebiet die Importe?“)
  const rechtecke = kacheln.concat(rahmen ? [rahmen] : [], dgm.map((k) => [k.rechteck[0] - e0, k.rechteck[1] - n0, k.rechteck[2] - e0, k.rechteck[3] - n0]));
  const ecken = rechtecke.flatMap(([a, b, c, d]) => [[a, b], [c, b], [c, d], [a, d]]).map(([x, y]) => utmZuGrad(e0 + x, n0 + y));
  if (ecken.length) importDaten.ausdehnung = [Math.min(...ecken.map((p) => p[0])), Math.min(...ecken.map((p) => p[1])),
    Math.max(...ecken.map((p) => p[0])), Math.max(...ecken.map((p) => p[1]))];
  zeigeTopoRahmen();
}

function punktImRing(x, y, ring) {
  let drin = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) drin = !drin;
  }
  return drin;
}

function importBeruehrt([w, s, o, n]) {
  const a = importDaten.ausdehnung;
  return !!(importDaten.kombi && a && w < a[2] && o > a[0] && s < a[3] && n > a[1]);
}

// Welche amtlichen Daten gelten für das Gebiet? Import und Beispiel werden zusammengeführt;
// wo beide etwas haben, gewinnt der Import (Detailstufen-Regel).
async function amtlicheDaten(bbox, nurBeispiel) {
  const imp = !nurBeispiel && importBeruehrt(bbox);
  const bsp = beruehrtBeispielgebiet(bbox);
  if (!imp && !bsp) return null;
  let beispiel = null, beispielStrassen = null;
  if (bsp) [beispiel, beispielStrassen] = await Promise.all([ladeBeispielLod2().catch(() => null), ladeBeispielStrassen().catch(() => null)]);
  if (!imp) return { lod2Daten: beispiel, strassenDaten: beispielStrassen, herkunft: "Beispiel" };
  if (!beispiel) return { lod2Daten: importDaten.kombi, strassenDaten: importDaten.strassen, herkunft: "Import" };
  return { lod2Daten: zusammenfuehren(beispiel, importDaten.kombi), strassenDaten: importDaten.strassen || beispielStrassen, herkunft: "Import + Beispiel" };
}

// Beispiel- und Importdaten in einem gemeinsamen Format (Meter, Nullpunkt des Beispiels) vereinen
function zusammenfuehren(bsp, imp) {
  const [e0, n0] = bsp.nullpunkt, k = bsp.einheit;
  const dx = imp.nullpunkt[0] - e0, dy = imp.nullpunkt[1] - n0;
  const verschiebe = (r) => r.map((v, i) => (i % 3 === 0 ? v + dx : i % 3 === 1 ? v + dy : v));
  const impKacheln = imp.kacheln.map(([a, b, c, d]) => [a + dx, b + dy, c + dx, d + dy]);
  const inImportKachel = (x, y) => impKacheln.some(([a, b, c, d]) => x >= a && x < c && y >= b && y < d);
  const impIds = new Set(imp.gebaeude.map((g) => g[0]));
  const gebaeude = [];
  for (const g of bsp.gebaeude) {
    if (impIds.has(g[0])) continue; // dasselbe Gebäude ist importiert
    const flaechen = g[5].map(([typ, ...ringe]) => [typ, ...ringe.map((r) => r.map((v) => v * k))]);
    const dach = flaechen.find((f) => f[0] === "R") || flaechen[0];
    const r = dach[1];
    let sx = 0, sy = 0;
    for (let i = 0; i < r.length; i += 3) { sx += r[i]; sy += r[i + 1]; }
    if (inImportKachel(sx / (r.length / 3), sy / (r.length / 3))) continue; // dort gilt die importierte Kachel
    gebaeude.push([g[0], g[1], g[2], g[3], g[4], flaechen, g[6]]);
  }
  for (const g of imp.gebaeude) {
    gebaeude.push([g[0], g[1], g[2], g[3], g[4], g[5].map(([typ, ...ringe]) => [typ, ...ringe.map(verschiebe)]), g[6],
      g[7] ? g[7].map((ring) => ring.map(([x, y]) => [x + dx, y + dy])) : undefined]);
  }
  const gelaende = imp.gelaende ? { ...imp.gelaende, x0: imp.gelaende.x0 + dx, y0: imp.gelaende.y0 + dy } : bsp.gelaende;
  return { nullpunkt: bsp.nullpunkt, epsg: 25832, einheit: 1, kacheln: bsp.kacheln.concat(impKacheln), // (Kachelgrenzen sind schon in Metern gespeichert)
    gebaeude, topoexport: bsp.topoexport, gelaende };
}

// ---------- Datenliste ----------
function zeigeDatenliste() {
  const eintraege = [];
  importDaten.citygml.forEach((c, i) => eintraege.push([`LoD2 ${c.kachel ? c.kachel.name : c.name}`,
    `${fmt(c.gebaeude.length)} Gebäude`, () => { importDaten.citygml.splice(i, 1); }]));
  if (importDaten.topo2d) eintraege.push(["topoexport 2D", `${fmt(importDaten.topo2d.grundrisse.length)} Grundrisse, ${fmt(importDaten.topo2d.strassen.length)} Straßenflächen`,
    () => { importDaten.topo2d = null; }]);
  if (importDaten.topo3d) eintraege.push(["topoexport 3D", `${fmt(importDaten.topo3d.gebaeude.length)} Gebäudeteile${importDaten.topo3d.gelaende ? ", Gelände" : ""}`,
    () => { importDaten.topo3d = null; }]);
  if (importDaten.dgm.length) eintraege.push(["Gelände DGM1", `${importDaten.dgm.length} Kachel(n), 2-m-Raster${importDaten.dgm[0].jahr ? `, Stand ${[...new Set(importDaten.dgm.map((d) => d.jahr))].join("/")}` : ""}`,
    () => { importDaten.dgm = []; }]);
  if (!importDaten.topo2d && !importDaten.topo3d) importDaten.verortung = null;
  importListe.innerHTML = eintraege.map(([titel, info], i) =>
    `<li><span><strong>${titel}</strong><small>${info}</small></span><button class="btn btn-klein btn-ghost" data-nr="${i}" title="Entfernen">✕</button></li>`).join("");
  importListe.hidden = !eintraege.length;
  importListe.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    eintraege[+b.dataset.nr][2]();
    if (!importDaten.topo2d && !importDaten.topo3d) { importDaten.verortung = null; beendeVerortung(); }
    kombiniere(); zeigeDatenliste(); zeigeKachelStatus();
  }));
  const topo = importDaten.topo2d || importDaten.topo3d;
  document.getElementById("verortung-oeffnen").hidden = !(topo && importDaten.verortung && !verortungAktiv);
}

// ---------- Benötigte LoD2-Kacheln ----------
// Namen der 1-km-Kacheln (UTM 32, „Ost-km_Nord-km“), die das Gebiet berührt
function benoetigteKacheln() {
  const [w, s, o, n] = turf.bbox(gebiet);
  const ecken = [[w, s], [o, s], [o, n], [w, n]].map(([lon, lat]) => gradZuUtm(lon, lat));
  const e0 = Math.floor(Math.min(...ecken.map((p) => p[0])) / 1000), e1 = Math.floor((Math.max(...ecken.map((p) => p[0])) - 0.01) / 1000);
  const n0 = Math.floor(Math.min(...ecken.map((p) => p[1])) / 1000), n1 = Math.floor((Math.max(...ecken.map((p) => p[1])) - 0.01) / 1000);
  const noetig = [];
  for (let e = e0; e <= e1; e++) for (let nn = n0; nn <= n1; nn++) noetig.push(`${e}_${nn}`);
  return noetig;
}

function zeigeKachelStatus() {
  if (!gebiet) { kachelBox.hidden = true; return; }
  const noetig = benoetigteKacheln();
  const geladen = importDaten.citygml.filter((c) => c.kachel).map((c) => c.kachel.name);
  const gelaende = importDaten.dgm.map((d) => d.name);
  const fehlend = noetig.filter((k) => !geladen.includes(k));
  const fehlendDgm = noetig.filter((k) => !gelaende.includes(k));
  const unnoetig = geladen.filter((k) => !noetig.includes(k));
  const zeichen = (ok) => (ok ? "✓" : "–");
  kachelBox.innerHTML = `
    <p><strong>Kacheln für dieses Gebiet</strong> (1 × 1 km): 3D-Gebäude LoD2 · Gelände DGM1</p>
    <ul>${noetig.map((k) => `<li class="${geladen.includes(k) && gelaende.includes(k) ? "ok" : "fehlt"}">${k} &nbsp;
      LoD2 ${zeichen(geladen.includes(k))} · Gelände ${zeichen(gelaende.includes(k))}</li>`).join("")}</ul>
    ${fehlend.length || fehlendDgm.length ? `<p class="kachel-hinweis">${fehlend.length ? `Es fehlen ${fehlend.length} LoD2-Kachel(n). ` : ""}${fehlendDgm.length ? `Es fehlen ${fehlendDgm.length} Gelände-Kachel(n).` : ""}
      ${importDaten.topo3d && fehlend.length ? "Bis dahin nimmt das Tool die Gebäude aus topoexport 3D." : ""}</p>
      <button class="btn btn-klein" id="kacheln-laden">Fehlende Daten laden</button>
      <p class="kachel-hinweis">Automatisch aus Niedersachsen (LGLN) und NRW (Geobasis NRW). LoD2 bis ca. 60 MB, Gelände ca. 2–4 MB je Kachel.
        Andere Länder: Dateien selbst herunterladen und hier ablegen.</p>`
      : `<p class="kachel-hinweis">Alle benötigten Kacheln sind geladen.</p>`}
    ${unnoetig.length ? `<p class="kachel-hinweis">LoD2 nicht nötig für dieses Gebiet: ${unnoetig.join(", ")}</p>` : ""}`;
  kachelBox.hidden = false;
  const knopf = document.getElementById("kacheln-laden");
  if (knopf) knopf.addEventListener("click", () => ladeFehlendeKacheln(fehlend, knopf, fehlendDgm));
}

// ---------- LoD2-Kacheln selbst abholen (offene Daten der Länder) ----------
// Niedersachsen: Kachelverzeichnis als ArcGIS-Dienst des LGLN, Dateien als GML (CC BY 4.0)
// NRW: Verzeichnis index.json der Geobasis NRW, Dateien als GML (Datenlizenz Deutschland – Zero 2.0)
const LGLN_KACHELN = "https://services-eu1.arcgis.com/4v3xxN52w88W065F/arcgis/rest/services/lgln_opengeodata_lod2/FeatureServer/0/query";
const NRW_ORDNER = "https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/lod2_gml/";
let nrwVerzeichnis = null;

async function sucheKachelLinks(namen) {
  const links = new Map(); // Name → { url, land }
  // 1. Niedersachsen (tile_id = „2“ + Ost-km + Nord-km)
  try {
    const ids = namen.map((k) => `2${k.replace("_", "")}`).join(",");
    const antwort = await fetch(`${LGLN_KACHELN}?f=json&where=tile_id+IN+(${ids})&outFields=tile_id,xml&returnGeometry=false`);
    const json = await antwort.json();
    for (const f of json.features || []) {
      const id = String(f.attributes.tile_id).slice(1);
      links.set(`${id.slice(0, 3)}_${id.slice(3)}`, { url: f.attributes.xml, land: "Niedersachsen (LGLN, CC BY 4.0)" });
    }
  } catch (e) { console.warn("LGLN-Verzeichnis nicht erreichbar", e); }
  // 2. NRW (nur für Kacheln, die in Niedersachsen nicht gefunden wurden)
  const rest = namen.filter((k) => !links.has(k));
  if (rest.length) {
    try {
      if (!nrwVerzeichnis) {
        meldeImport("Lade das Kachelverzeichnis NRW …");
        const json = await (await fetch(`${NRW_ORDNER}index.json`)).json();
        nrwVerzeichnis = new Set(json.datasets.flatMap((d) => d.files.map((f) => f.name)));
      }
      for (const k of rest) {
        const datei = `LoD2_32_${k}_1_NW.gml`;
        if (nrwVerzeichnis.has(datei)) links.set(k, { url: NRW_ORDNER + datei, land: "NRW (Geobasis NRW, dl-de/zero-2-0)" });
      }
    } catch (e) { console.warn("NRW-Verzeichnis nicht erreichbar", e); }
  }
  return links;
}

// Geländemodell DGM1 (GeoTIFF): Niedersachsen (LGLN, tile_id = „32“ + Ost-km + Nord-km), sonst NRW; je Kachel der neueste Jahrgang
const LGLN_DGM = "https://services-eu1.arcgis.com/4v3xxN52w88W065F/arcgis/rest/services/lgln_opengeodata_dgm1/FeatureServer/0/query";
const NRW_DGM_ORDNER = "https://www.opengeodata.nrw.de/produkte/geobasis/hm/dgm1_tiff/dgm1_tiff/";
let nrwDgmVerzeichnis = null;

async function sucheDgmLinks(namen) {
  const links = new Map();
  if (!namen.length) return links;
  try {
    const ids = namen.map((k) => `32${k.replace("_", "")}`).join(",");
    const json = await (await fetch(`${LGLN_DGM}?f=json&where=tile_id+IN+(${ids})&outFields=tile_id,dgm1,Aktualitaet&returnGeometry=false`)).json();
    for (const f of json.features || []) {
      const id = String(f.attributes.tile_id).slice(2), name = `${id.slice(0, 3)}_${id.slice(3)}`;
      const alt = links.get(name);
      if (!alt || f.attributes.Aktualitaet > alt.stand) links.set(name, { url: f.attributes.dgm1, stand: f.attributes.Aktualitaet, land: "Niedersachsen (LGLN, CC BY 4.0)" });
    }
  } catch (e) { console.warn("LGLN-DGM-Verzeichnis nicht erreichbar", e); }
  const rest = namen.filter((k) => !links.has(k));
  if (rest.length) {
    try {
      if (!nrwDgmVerzeichnis) {
        meldeImport("Lade das Gelände-Verzeichnis NRW …");
        const json = await (await fetch(`${NRW_DGM_ORDNER}index.json`)).json();
        nrwDgmVerzeichnis = json.datasets.flatMap((d) => d.files.map((f) => f.name));
      }
      for (const k of rest) {
        const treffer = nrwDgmVerzeichnis.filter((n) => n.startsWith(`dgm1_32_${k}_1_nw`)).sort();
        if (treffer.length) links.set(k, { url: NRW_DGM_ORDNER + treffer.pop(), land: "NRW (Geobasis NRW, dl-de/zero-2-0)" });
      }
    } catch (e) { console.warn("NRW-DGM-Verzeichnis nicht erreichbar", e); }
  }
  return links;
}

// Eine Datei mit Fortschrittsanzeige herunterladen
async function ladeMitFortschritt(url, text) {
  const antwort = await fetch(url);
  if (!antwort.ok) throw new Error(`Download fehlgeschlagen (${antwort.status})`);
  const gesamt = +antwort.headers.get("content-length") || 0;
  const leser = antwort.body.getReader();
  const teile = [];
  let geladen = 0;
  for (;;) {
    const { done, value } = await leser.read();
    if (done) break;
    teile.push(value);
    geladen += value.length;
    meldeImport(`${text}: ${fmt(geladen / 1e6, 1)}${gesamt ? ` von ${fmt(gesamt / 1e6, 1)}` : ""} MB …`);
  }
  return new Blob(teile);
}

async function ladeFehlendeKacheln(fehlend, knopf, fehlendDgm = []) {
  knopf.disabled = true;
  try {
    meldeImport("Suche die Kacheln bei den Landesämtern …");
    const [links, dgmLinks] = await Promise.all([sucheKachelLinks(fehlend), sucheDgmLinks(fehlendDgm)]);
    const nichtGefunden = fehlend.filter((k) => !links.has(k)).map((k) => `LoD2 ${k}`)
      .concat(fehlendDgm.filter((k) => !dgmLinks.has(k)).map((k) => `Gelände ${k}`));
    const dateien = [];
    const alle = [...[...links].map(([n, l]) => ["LoD2", n, l]), ...[...dgmLinks].map(([n, l]) => ["Gelände", n, l])];
    let nr = 0;
    for (const [art, name, { url }] of alle) {
      nr++;
      const blob = await ladeMitFortschritt(url, `${art} ${name} (${nr} von ${alle.length})`);
      dateien.push(new File([blob], url.split("/").pop()));
    }
    if (dateien.length) await dateienAnnehmen(dateien);
    const laender = [...new Set(alle.map(([, , l]) => l.land))];
    meldeImport((dateien.length ? `${dateien.length} Datei(en) geladen. Quelle: ${laender.join(", ")}. ` : "") +
      (nichtGefunden.length ? `Nicht gefunden: ${nichtGefunden.join(", ")} ` +
        "(außerhalb von Niedersachsen und NRW – bitte beim jeweiligen Landesamt herunterladen und hier ablegen)." : ""));
  } catch (fehler) {
    console.error(fehler);
    meldeImport(`Kacheln konnten nicht geladen werden: ${fehler.message}`);
  } finally {
    if (knopf.isConnected) knopf.disabled = false;
  }
}

// =============================================================
// Verortung der topoexport-Dateien
// =============================================================
let verortungAktiv = false;
let verortungVorschlag = null; // [Ost, Nord] während des Verschiebens
const verortungBox = document.getElementById("verortung");
const verortungText = document.getElementById("verortung-text");
const feldOst = document.getElementById("verortung-ost");
const feldNord = document.getElementById("verortung-nord");

function topoRahmenLokal() {
  const r = (importDaten.topo3d || importDaten.topo2d || {}).rahmen;
  return r || [0, 0, 1000, 1000];
}

// Rahmen des topoexport-Ausschnitts auf der Karte zeigen (rot gestrichelt, beim Verorten verschiebbar)
function zeigeTopoRahmen() {
  if (!map.getSource("topo-rahmen")) return;
  const lage = verortungAktiv ? verortungVorschlag : importDaten.verortung;
  if (!lage || !(importDaten.topo2d || importDaten.topo3d)) { map.getSource("topo-rahmen").setData({ type: "FeatureCollection", features: [] }); return; }
  const [x0, y0, x1, y1] = topoRahmenLokal();
  const ring = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => utmZuGrad(lage[0] + x, lage[1] + y));
  map.getSource("topo-rahmen").setData(turf.polygon([ring], { aktiv: verortungAktiv }));
}

map.on("load", () => {
  map.addSource("topo-rahmen", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({ id: "topo-rahmen-flaeche", type: "fill", source: "topo-rahmen",
    paint: { "fill-color": "#111111", "fill-opacity": ["case", ["get", "aktiv"], 0.12, 0.03] } });
  map.addLayer({ id: "topo-rahmen-linie", type: "line", source: "topo-rahmen",
    paint: { "line-color": "#111111", "line-width": 1.5, "line-dasharray": [2, 2] } });
  zeigeTopoRahmen();
});

function zeigeVerortungsFelder() {
  if (!verortungVorschlag) return;
  feldOst.value = verortungVorschlag[0].toFixed(1);
  feldNord.value = verortungVorschlag[1].toFixed(1);
}

async function starteVerortung() {
  verortungAktiv = true;
  verortungBox.hidden = false;
  document.getElementById("verortung-oeffnen").hidden = true;
  // Startlage: bisherige Verortung, sonst Kartenmitte
  if (importDaten.verortung) verortungVorschlag = importDaten.verortung.slice();
  else {
    const [x0, y0, x1, y1] = topoRahmenLokal();
    const [e, n] = gradZuUtm(map.getCenter().lng, map.getCenter().lat);
    verortungVorschlag = [e - (x0 + x1) / 2, n - (y0 + y1) / 2];
  }
  zeigeVerortungsFelder();
  zeigeTopoRahmen();
  zeigeAnsicht("karte");
  // Mit CityGML gelingt die automatische Verortung ohne Vorarbeit
  if (importDaten.citygml.length) await automatischEinpassen(true);
  else verortungText.textContent = "Die topoexport-Dateien enthalten keine echten Koordinaten. Ziehe den grauen Rahmen auf der Karte " +
    "ungefähr an die richtige Stelle und klicke dann auf „Automatisch einpassen“. Oder gib die Koordinate der linken unteren Ecke ein (UTM 32).";
  fitTopoRahmen();
}

function fitTopoRahmen() {
  const [x0, y0, x1, y1] = topoRahmenLokal();
  const v = verortungVorschlag || importDaten.verortung;
  if (!v) return;
  const a = utmZuGrad(v[0] + x0, v[1] + y0), b = utmZuGrad(v[0] + x1, v[1] + y1);
  map.fitBounds([a, b], { padding: 60, duration: 500 });
}

// Grundrisse des topoexport (Fläche, Mittelpunkt) – aus der 2D-Datei, sonst aus den 3D-Dächern
function topoGrundrisse() {
  if (importDaten.topo2d && importDaten.topo2d.grundrisse.length) return importDaten.topo2d.grundrisse;
  return (importDaten.topo3d ? importDaten.topo3d.gebaeude : []).map((g) => {
    let a = 0;
    for (const [typ, ringe] of g.flaechen) if (typ === "R") a += Math.abs(flaeche2d(ringe[0]));
    return [a, g.mitte[0], g.mitte[1]];
  }).filter((x) => x[0] > 30);
}
function flaeche2d(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}

// Ziel-Grundrisse mit echten Koordinaten: CityGML-Bodenflächen oder OSM-Gebäude
async function zielGrundrisse() {
  if (importDaten.citygml.length) {
    const ziel = [];
    for (const c of importDaten.citygml) for (const g of c.gebaeude) {
      let A = 0, X = 0, Y = 0;
      for (const [typ, ringe] of g.flaechen) {
        if (typ !== "G") continue;
        const r = ringe[0].map((p) => [p[0], p[1]]);
        const a = Math.abs(flaeche2d(r));
        const cx = r.reduce((s, p) => s + p[0], 0) / r.length, cy = r.reduce((s, p) => s + p[1], 0) / r.length;
        A += a; X += a * cx; Y += a * cy;
      }
      if (A > 30) ziel.push([A, X / A, Y / A]);
    }
    return { ziel, quelle: "CityGML" };
  }
  // OSM: Gebäude im Bereich des Rahmens (+ 400 m Rand)
  const [x0, y0, x1, y1] = topoRahmenLokal();
  const v = verortungVorschlag;
  const a = utmZuGrad(v[0] + x0 - 400, v[1] + y0 - 400), b = utmZuGrad(v[0] + x1 + 400, v[1] + y1 + 400);
  const bbox = [a[0], a[1], b[0], b[1]];
  let elemente;
  // Liegt die Mitte des Rahmens im Oldenburger Beispiel, reichen die eingebauten OSM-Daten (schnell, offline)
  const mitte = utmZuGrad(v[0] + (x0 + x1) / 2, v[1] + (y0 + y1) / 2);
  if (liegtImBeispielgebiet([mitte[0], mitte[1], mitte[0], mitte[1]])) {
    const roh = await ladeBeispielOsm();
    const knoten = new Map(roh.elements.filter((e) => e.type === "node").map((e) => [e.id, [e.lon, e.lat]]));
    elemente = roh.elements.filter((e) => e.type === "way" && e.tags && e.tags.building).map((e) => e.nodes.map((k) => knoten.get(k)).filter(Boolean));
  } else {
    verortungText.textContent = "Lade OSM-Gebäude zum Vergleich …";
    const abfrage = `[out:json][timeout:60];way["building"](${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]});out geom;`;
    let json = null;
    for (const server of OVERPASS_SERVER) {
      try {
        const antwort = await fetch(server, { method: "POST", body: new URLSearchParams({ data: abfrage }) });
        if (antwort.ok) { json = await antwort.json(); break; }
      } catch (e) { /* nächster Server */ }
    }
    if (!json) throw new Error("OSM-Dienst nicht erreichbar");
    elemente = json.elements.filter((e) => e.geometry).map((e) => e.geometry.map((p) => [p.lon, p.lat]));
  }
  const ziel = [];
  for (const pts of elemente) {
    const utm = pts.map(([lon, lat]) => gradZuUtm(lon, lat));
    const A = Math.abs(flaeche2d(utm));
    if (A > 30) ziel.push([A, utm.reduce((s, p) => s + p[0], 0) / utm.length, utm.reduce((s, p) => s + p[1], 0) / utm.length]);
  }
  return { ziel, quelle: "OSM" };
}

// Verschiebung suchen: Gebäude gleicher Größe vergleichen, die häufigste Verschiebung gewinnt
function sucheVerschiebung(quelle, ziel, fenster) {
  const sortiert = ziel.slice().sort((a, b) => a[0] - b[0]);
  const flaechen = sortiert.map((z) => z[0]);
  const suche = (wert) => { let lo = 0, hi = flaechen.length; while (lo < hi) { const m = (lo + hi) >> 1; flaechen[m] < wert ? lo = m + 1 : hi = m; } return lo; };
  const stimmen = new Map();
  const gross = quelle.slice().sort((a, b) => b[0] - a[0]).slice(0, 400);
  for (const [a, x, y] of gross) {
    for (let i = suche(a * 0.9); i < sortiert.length && sortiert[i][0] <= a * 1.1; i++) {
      const dx = sortiert[i][1] - x, dy = sortiert[i][2] - y;
      if (fenster && Math.hypot(dx - fenster[0], dy - fenster[1]) > fenster[2]) continue;
      const k = `${Math.round(dx / 3)},${Math.round(dy / 3)}`;
      stimmen.set(k, (stimmen.get(k) || 0) + 1);
    }
  }
  let besterSchluessel = null, beste = 0;
  for (const [k, n] of stimmen) {
    // Nachbarfelder mitzählen, damit eine Verschiebung auf der Feldgrenze nicht verloren geht
    const [i, j] = k.split(",").map(Number);
    let summe = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) summe += stimmen.get(`${i + a},${j + b}`) || 0;
    if (summe > beste) { beste = summe; besterSchluessel = [i * 3, j * 3]; }
  }
  if (!besterSchluessel) return null;
  // Feinabgleich: Mittelwert der Verschiebungen nahe der besten
  const nah = [];
  for (const [a, x, y] of gross) for (let i = suche(a * 0.9); i < sortiert.length && sortiert[i][0] <= a * 1.1; i++) {
    const dx = sortiert[i][1] - x, dy = sortiert[i][2] - y;
    if (Math.hypot(dx - besterSchluessel[0], dy - besterSchluessel[1]) < 4.5) nah.push([dx, dy]);
  }
  const median = (werte) => { const s = werte.slice().sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
  const ergebnis = [median(nah.map((p) => p[0])), median(nah.map((p) => p[1]))];
  // Prüfung: Wie viele Gebäude liegen nach dem Verschieben auf weniger als 3 m genau?
  const raster = new Map();
  for (const z of ziel) { const k = `${Math.floor(z[1] / 10)},${Math.floor(z[2] / 10)}`; if (!raster.has(k)) raster.set(k, []); raster.get(k).push(z); }
  let treffer = 0;
  for (const [, x, y] of quelle) {
    const X = x + ergebnis[0], Y = y + ergebnis[1], gx = Math.floor(X / 10), gy = Math.floor(Y / 10);
    let ok = false;
    for (let a = -1; a <= 1 && !ok; a++) for (let b = -1; b <= 1 && !ok; b++)
      for (const z of raster.get(`${gx + a},${gy + b}`) || []) if (Math.hypot(z[1] - X, z[2] - Y) < 3) { ok = true; break; }
    if (ok) treffer++;
  }
  return { verschiebung: ergebnis, treffer, anzahl: quelle.length };
}

async function automatischEinpassen(ohneFenster = false) {
  verortungText.textContent = "Vergleiche Gebäudegrundrisse …";
  try {
    const quelle = topoGrundrisse();
    const { ziel, quelle: art } = await zielGrundrisse();
    // Ohne CityGML nur in der Nähe der jetzigen Lage suchen (± 500 m)
    const fenster = ohneFenster || art === "CityGML" ? null : [verortungVorschlag[0], verortungVorschlag[1], 500];
    const erg = sucheVerschiebung(quelle, ziel, fenster);
    if (!erg || erg.treffer < 15) {
      verortungText.textContent = `Keine sichere Übereinstimmung mit ${art} gefunden (${erg ? erg.treffer : 0} Gebäude). ` +
        "Schiebe den Rahmen näher an die richtige Stelle und versuche es noch einmal, oder gib die Koordinate ein.";
      return;
    }
    verortungVorschlag = erg.verschiebung;
    zeigeVerortungsFelder();
    zeigeTopoRahmen();
    verortungText.textContent = `Gefunden: ${fmt(erg.treffer)} von ${fmt(erg.anzahl)} Gebäuden passen auf weniger als 3 m genau zu ${art}. ` +
      "Prüfe die Lage auf der Karte und klicke auf „Lage bestätigen“.";
  } catch (fehler) {
    console.error(fehler);
    verortungText.textContent = `Automatische Verortung nicht möglich: ${fehler.message}. Bitte von Hand verschieben oder Koordinate eingeben.`;
  }
}

function beendeVerortung() {
  verortungAktiv = false;
  verortungBox.hidden = true;
  zeigeTopoRahmen();
  zeigeDatenliste();
}

function bestaetigeVerortung() {
  importDaten.verortung = verortungVorschlag.slice();
  beendeVerortung();
  kombiniere();
  zeigeDatenliste();
  // Der topoexport-Ausschnitt wird als Untersuchungsgebiet voreingestellt (darin kann man kleiner wählen)
  const [x0, y0, x1, y1] = topoRahmenLokal();
  const v = importDaten.verortung;
  const ecken = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => utmZuGrad(v[0] + x, v[1] + y));
  setzeGebiet([Math.min(...ecken.map((p) => p[0])), Math.min(...ecken.map((p) => p[1])),
    Math.max(...ecken.map((p) => p[0])), Math.max(...ecken.map((p) => p[1]))]);
  meldeImport("Verortet. Das Gebiet ist auf den topoexport-Ausschnitt gesetzt. Klicke auf „Analysieren“ oder ziehe ein kleineres Rechteck auf.");
}

document.getElementById("verortung-auto").addEventListener("click", () => automatischEinpassen(false));
document.getElementById("verortung-uebernehmen").addEventListener("click", () => {
  const e = parseFloat(feldOst.value.replace(",", ".")), n = parseFloat(feldNord.value.replace(",", "."));
  if (!(e > 100000 && e < 900000 && n > 5000000 && n < 6200000)) { verortungText.textContent = "Bitte gültige UTM-32-Koordinaten eingeben (Ost ca. 300 000–900 000, Nord ca. 5 200 000–6 100 000)."; return; }
  verortungVorschlag = [e, n];
  zeigeTopoRahmen();
  fitTopoRahmen();
});
document.getElementById("verortung-ok").addEventListener("click", bestaetigeVerortung);
document.getElementById("verortung-oeffnen").addEventListener("click", () => starteVerortung());

// Rahmen mit der Maus (oder dem Finger) verschieben
let ziehen = null;
map.on("mousedown", "topo-rahmen-flaeche", (e) => {
  if (!verortungAktiv || zeichnen) return;
  e.preventDefault();
  map.dragPan.disable();
  ziehen = { start: gradZuUtm(e.lngLat.lng, e.lngLat.lat), lage: verortungVorschlag.slice() };
});
map.on("mousemove", (e) => {
  if (!ziehen) return;
  const jetzt = gradZuUtm(e.lngLat.lng, e.lngLat.lat);
  verortungVorschlag = [ziehen.lage[0] + jetzt[0] - ziehen.start[0], ziehen.lage[1] + jetzt[1] - ziehen.start[1]];
  zeigeTopoRahmen();
  zeigeVerortungsFelder();
});
map.on("mouseup", () => { if (ziehen) { ziehen = null; map.dragPan.enable(); } });
map.on("mouseenter", "topo-rahmen-flaeche", () => { if (verortungAktiv) map.getCanvas().style.cursor = "move"; });
map.on("mouseleave", "topo-rahmen-flaeche", () => { map.getCanvas().style.cursor = ""; });
