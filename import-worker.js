/* ============================================================
   Ortsanalyse – Dateien lesen (läuft als „Web Worker“ im Hintergrund,
   damit die Seite bei großen Dateien nicht einfriert)

   - CityGML (LoD2, z. B. vom LGLN): Gebäude mit Wand-, Dach- und Bodenflächen
   - DXF (binär oder Text), speziell topoexport (Layer TPX_…):
     2D: Grundrisse, Straßenränder, Rahmen · 3D: Gebäude (MESH), Gelände (MESH)

   Nachricht an den Worker:  { nr, art: "citygml" | "dxf", name, daten: ArrayBuffer }
   Antwort:                  { nr, ok: true, ergebnis } oder { nr, ok: false, fehler }
   ============================================================ */

self.onmessage = (e) => {
  const { nr, art, name, daten } = e.data;
  try {
    const melde = (text) => self.postMessage({ nr, fortschritt: text });
    const ergebnis = art === "citygml" ? leseCityGML(daten, name, melde) : art === "zensus" ? leseZensus(daten, melde) : leseDXF(daten, name, melde);
    const uebergabe = art === "zensus" ? [ergebnis.x.buffer, ergebnis.y.buffer, ergebnis.wert.buffer, ergebnis.unsicher.buffer] : [];
    self.postMessage({ nr, ok: true, ergebnis }, uebergabe);
  } catch (fehler) {
    self.postMessage({ nr, ok: false, fehler: fehler.message || String(fehler) });
  }
};

// =============================================================
// Zensus 2022: Nettokaltmiete im 100-m-Gitter (CSV mit „;“, Komma als Dezimalzeichen, EPSG:3035)
// GITTER_ID_100m;x_mp_100m;y_mp_100m;durchschnMieteQM;werterlaeuternde_Zeichen
// =============================================================
function leseZensus(puffer, melde) {
  melde("Lese die Zensus-Mietkarte …");
  const zeilen = new TextDecoder("latin1").decode(puffer).split("\n");
  const n = zeilen.length;
  const x = new Int32Array(n), y = new Int32Array(n), wert = new Float32Array(n), unsicher = new Uint8Array(n);
  let k = 0;
  for (let i = 1; i < n; i++) {
    const t = zeilen[i].split(";");
    if (t.length < 4 || !t[3]) continue;
    x[k] = +t[1]; y[k] = +t[2]; wert[k] = parseFloat(t[3].replace(",", ".")); unsicher[k] = t[4] && t[4].trim() ? 1 : 0;
    k++;
  }
  return { typ: "zensus-miete", anzahl: k, x: x.slice(0, k), y: y.slice(0, k), wert: wert.slice(0, k), unsicher: unsicher.slice(0, k) };
}

// =============================================================
// CityGML
// =============================================================
function leseCityGML(puffer, name, melde) {
  const text = new TextDecoder("utf-8").decode(puffer);
  // Koordinatensystem prüfen (erwartet: ETRS89 / UTM 32 = EPSG:25832)
  const srs = (text.slice(0, 20000).match(/srsName="([^"]+)"/) || [])[1] || "";
  // (Das LGLN schreibt z. B. „urn:adv:crs:ETRS89_UTM32*DE_DHHN2016_NH“, andere „EPSG:25832“)
  if (srs && !/25832|UTM_?32/i.test(srs)) throw new Error(`Koordinatensystem ${srs} wird noch nicht unterstützt (erwartet UTM 32, EPSG:25832)`);

  // Lage der Kachel: aus dem Dateinamen (LoD2_32_447_5888_…) oder aus dem Umgebungsrechteck der Datei
  let kachel = null;
  const m = name.match(/(\d{3})_(\d{4})/);
  if (m) kachel = { name: `${m[1]}_${m[2]}`, rechteck: [+m[1] * 1000, +m[2] * 1000, +m[1] * 1000 + 1000, +m[2] * 1000 + 1000] };
  else {
    const lo = (text.match(/<[\w-]*:?lowerCorner[^>]*>([^<]+)</) || [])[1];
    const hi = (text.match(/<[\w-]*:?upperCorner[^>]*>([^<]+)</) || [])[1];
    if (lo && hi) {
      const [x0, y0] = lo.trim().split(/\s+/).map(Number), [x1, y1] = hi.trim().split(/\s+/).map(Number);
      kachel = { name, rechteck: [x0, y0, x1, y1] };
    }
  }

  const gebaeude = [];
  const start = /<([\w-]+:)?Building[\s>]/g;
  let treffer;
  while ((treffer = start.exec(text))) {
    const ende = text.indexOf(`</${treffer[1] || ""}Building>`, treffer.index);
    if (ende < 0) break;
    const block = text.slice(treffer.index, ende);
    start.lastIndex = ende;
    const wert = (tag) => ((block.match(new RegExp(`<[\\w-]*:?${tag}[^>]*>([^<]+)<`)) || [])[1] || "").trim();
    const g = {
      id: (block.match(/gml:id="([^"]+)"/) || [])[1] || `g${gebaeude.length}`,
      funktion: wert("function"), dachform: wert("roofType"),
      hoehe: parseFloat(wert("measuredHeight")) || null,
      flaechen: []
    };
    const flStart = /<([\w-]+:)?(RoofSurface|WallSurface|GroundSurface)[\s>]/g;
    let f;
    while ((f = flStart.exec(block))) {
      const flEnde = block.indexOf(`</${f[1] || ""}${f[2]}>`, f.index);
      if (flEnde < 0) break;
      const fl = block.slice(f.index, flEnde);
      flStart.lastIndex = flEnde;
      const typ = f[2][0]; // R, W oder G
      for (const poly of fl.split(/<[\w-]*:?Polygon[\s>]/).slice(1)) {
        const ringe = [];
        const teile = poly.split(/<[\w-]*:?(?=exterior|interior)/).slice(1);
        for (const teil of teile) {
          const ring = ringAus(teil);
          if (ring.length >= 3) ringe.push(ring);
        }
        if (ringe.length) g.flaechen.push([typ, ringe]);
      }
    }
    if (g.flaechen.length) gebaeude.push(g);
    if (gebaeude.length % 500 === 0) melde(`${name}: ${gebaeude.length} Gebäude gelesen …`);
  }
  return { typ: "citygml", name, kachel, gebaeude };
}

// Punkte eines Rings aus <posList> (oder einzelnen <pos>) lesen, ohne doppelten Schlusspunkt
function ringAus(text) {
  let zahlen;
  const pl = text.match(/<[\w-]*:?posList[^>]*>([^<]+)</);
  if (pl) zahlen = pl[1].trim().split(/\s+/).map(Number);
  else zahlen = [...text.matchAll(/<[\w-]*:?pos[\s>][^>]*?>?([^<]+)</g)].flatMap((x) => x[1].trim().split(/\s+/).map(Number));
  const pts = [];
  for (let i = 0; i + 2 < zahlen.length; i += 3) pts.push([zahlen[i], zahlen[i + 1], zahlen[i + 2]]);
  const a = pts[0], b = pts[pts.length - 1];
  if (pts.length > 1 && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) pts.pop();
  return pts;
}

// =============================================================
// DXF: Zerlegen in „Gruppen“ (Code + Wert), binär oder Text
// =============================================================

// Welcher Wert-Typ gehört zu welchem Gruppencode? (nach der DXF-Spezifikation)
function wertTyp(c) {
  if ((c >= 10 && c <= 59) || (c >= 110 && c <= 149) || (c >= 210 && c <= 239) || (c >= 460 && c <= 469) || (c >= 1010 && c <= 1059)) return "f64";
  if ((c >= 60 && c <= 79) || (c >= 170 && c <= 179) || (c >= 270 && c <= 289) || (c >= 370 && c <= 389) || (c >= 400 && c <= 409) || (c >= 1060 && c <= 1070)) return "i16";
  if ((c >= 90 && c <= 99) || (c >= 420 && c <= 429) || (c >= 440 && c <= 459) || c === 1071) return "i32";
  if (c >= 160 && c <= 169) return "i64";
  if (c >= 290 && c <= 299) return "bool";
  if ((c >= 310 && c <= 319) || c === 1004) return "bin";
  return "text";
}

function* gruppenBinaer(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder("latin1");
  let i = 22; // nach der Kennung „AutoCAD Binary DXF“
  while (i < bytes.length - 1) {
    const code = dv.getUint16(i, true); i += 2;
    const typ = wertTyp(code);
    let wert;
    if (typ === "f64") { wert = dv.getFloat64(i, true); i += 8; }
    else if (typ === "i16") { wert = dv.getInt16(i, true); i += 2; }
    else if (typ === "i32") { wert = dv.getInt32(i, true); i += 4; }
    else if (typ === "i64") { wert = Number(dv.getBigInt64(i, true)); i += 8; }
    else if (typ === "bool") { wert = bytes[i]; i += 1; }
    else if (typ === "bin") { const n = bytes[i]; i += 1 + n; wert = null; }
    else { let j = i; while (j < bytes.length && bytes[j] !== 0) j++; wert = dec.decode(bytes.subarray(i, j)); i = j + 1; }
    yield [code, wert];
  }
}

function* gruppenText(text) {
  const zeilen = text.split(/\r?\n/);
  for (let i = 0; i + 1 < zeilen.length; i += 2) {
    const code = parseInt(zeilen[i], 10);
    if (isNaN(code)) continue;
    const roh = zeilen[i + 1];
    const typ = wertTyp(code);
    yield [code, typ === "text" || typ === "bin" ? roh.trim() : Number(roh)];
  }
}

// Alle Objekte im Abschnitt ENTITIES: { typ, layer, g: [[code, wert], …] }
function dxfObjekte(puffer) {
  const bytes = new Uint8Array(puffer);
  const kopf = new TextDecoder("latin1").decode(bytes.subarray(0, 18));
  const gruppen = kopf.startsWith("AutoCAD Binary DXF") ? gruppenBinaer(bytes) : gruppenText(new TextDecoder("latin1").decode(bytes));
  const objekte = [];
  let inEntities = false, vorher = null, aktuell = null;
  for (const [code, wert] of gruppen) {
    if (code === 0) {
      if (aktuell) objekte.push(aktuell);
      aktuell = null;
      if (wert === "ENDSEC") { if (inEntities) break; }
      else if (inEntities) aktuell = { typ: wert, layer: "", g: [] };
    } else if (code === 2 && vorher === "SECTION" && wert === "ENTITIES") {
      inEntities = true;
    } else if (aktuell) {
      if (code === 8) aktuell.layer = wert;
      aktuell.g.push([code, wert]);
    }
    vorher = code === 0 ? wert : vorher;
  }
  if (aktuell) objekte.push(aktuell);
  return objekte;
}

// LWPOLYLINE: Punkte [[x, y], …] und ob geschlossen
function lwpolyline(o) {
  const xs = o.g.filter(([c]) => c === 10).map(([, v]) => v);
  const ys = o.g.filter(([c]) => c === 20).map(([, v]) => v);
  const flags = (o.g.find(([c]) => c === 70) || [0, 0])[1];
  return { punkte: xs.map((x, i) => [x, ys[i]]), geschlossen: (flags & 1) === 1 };
}

// MESH: Punkte und Flächen (Flächen als Listen von Punktnummern)
function mesh(o) {
  const g = o.g;
  let i = g.findIndex(([c]) => c === 92);
  if (i < 0) return null;
  const n = g[i][1]; i++;
  const punkte = [];
  while (punkte.length < n && i + 2 < g.length) {
    if (g[i][0] === 10) { punkte.push([g[i][1], g[i + 1][1], g[i + 2][1]]); i += 3; } else i++;
  }
  while (i < g.length && g[i][0] !== 93) i++;
  const flaechen = [];
  if (i < g.length) {
    const laenge = g[i][1]; i++;
    const liste = [];
    while (liste.length < laenge && i < g.length && g[i][0] === 90) { liste.push(g[i][1]); i++; }
    for (let k = 0; k < liste.length;) { const m = liste[k]; flaechen.push(liste.slice(k + 1, k + 1 + m)); k += m + 1; }
  }
  return { punkte, flaechen };
}

// =============================================================
// topoexport auswerten
// =============================================================
function leseDXF(puffer, name, melde) {
  melde(`${name}: lese DXF …`);
  const objekte = dxfObjekte(puffer);
  const topo = objekte.some((o) => o.layer.startsWith("TPX_"));
  if (!topo) {
    const layer = [...new Set(objekte.map((o) => o.layer))].slice(0, 12);
    return { typ: "dxf-allgemein", name, anzahl: objekte.length, layer };
  }
  const meshes = objekte.filter((o) => o.typ === "MESH");
  const ist3D = meshes.some((o) => o.layer === "TPX_BUILDINGS");

  // Rahmen (TPX_FRAME_PROJECT): Rechteck aus allen Punkten des Layers
  const rahmenPunkte = [];
  for (const o of objekte.filter((o) => o.layer === "TPX_FRAME_PROJECT")) {
    o.g.forEach(([c, v], k) => { if (c === 10 && o.g[k + 1] && o.g[k + 1][0] === 20) rahmenPunkte.push([v, o.g[k + 1][1]]); });
  }
  const rahmen = rahmenPunkte.length ? [
    Math.min(...rahmenPunkte.map((p) => p[0])), Math.min(...rahmenPunkte.map((p) => p[1])),
    Math.max(...rahmenPunkte.map((p) => p[0])), Math.max(...rahmenPunkte.map((p) => p[1]))] : null;

  if (!ist3D) {
    melde(`${name}: Grundrisse und Straßen …`);
    // Gebäudegrundrisse (für die automatische Verortung)
    const grundrisse = [];
    for (const o of objekte) {
      if (o.typ !== "LWPOLYLINE" || o.layer !== "TPX_BUILDINGS") continue;
      const { punkte } = lwpolyline(o);
      const [a, c] = flaecheMitte(punkte);
      if (a > 30) grundrisse.push([a, c[0], c[1]]);
    }
    // Straßenränder (geschlossene Linien) zu Flächen mit Löchern zusammensetzen
    const ringe = objekte.filter((o) => o.typ === "LWPOLYLINE" && o.layer === "TPX_ROADS_CONTOURS")
      .map((o) => lwpolyline(o).punkte).filter((r) => r.length >= 3);
    const strassen = ringeZuFlaechen(ringe);
    return { typ: "topoexport-2d", name, rahmen, grundrisse, strassen };
  }

  // 3D: Gelände als Raster
  melde(`${name}: Gelände und Gebäude …`);
  let gelaende = null;
  const gm = meshes.find((o) => o.layer === "TPX_TERRAIN_TERRAIN_MESH");
  if (gm) {
    const { punkte } = mesh(gm);
    const xs = [...new Set(punkte.map((p) => p[0].toFixed(2)))].map(Number).sort((a, b) => a - b);
    const ys = [...new Set(punkte.map((p) => p[1].toFixed(2)))].map(Number).sort((a, b) => a - b);
    if (xs.length * ys.length === punkte.length) {
      const h = new Map(punkte.map((p) => [`${p[0].toFixed(2)}|${p[1].toFixed(2)}`, p[2]]));
      gelaende = { x0: xs[0], y0: ys[0], dx: (xs[xs.length - 1] - xs[0]) / (xs.length - 1), dy: (ys[ys.length - 1] - ys[0]) / (ys.length - 1),
        nx: xs.length, ny: ys.length, z: [] };
      for (const y of ys) for (const x of xs) gelaende.z.push(h.get(`${x.toFixed(2)}|${y.toFixed(2)}`));
    }
  }
  const bodenhoehe = (x, y) => {
    if (!gelaende) return null;
    const g = gelaende;
    const gx = Math.min(g.nx - 1.001, Math.max(0, (x - g.x0) / g.dx)), gy = Math.min(g.ny - 1.001, Math.max(0, (y - g.y0) / g.dy));
    const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j, z = (a, b) => g.z[b * g.nx + a];
    return z(i, j) * (1 - fx) * (1 - fy) + z(i + 1, j) * fx * (1 - fy) + z(i, j + 1) * (1 - fx) * fy + z(i + 1, j + 1) * fx * fy;
  };

  // Gebäude: Wände als Dreiecke, Dächer zu ganzen Dachflächen zusammengefasst
  const gebaeude = [];
  for (const o of meshes) {
    if (o.layer !== "TPX_BUILDINGS") continue;
    const m = mesh(o);
    if (!m || !m.punkte.length) continue;
    const cx = m.punkte.reduce((s, p) => s + p[0], 0) / m.punkte.length;
    const cy = m.punkte.reduce((s, p) => s + p[1], 0) / m.punkte.length;
    const minZ = Math.min(...m.punkte.map((p) => p[2]));
    const boden = bodenhoehe(cx, cy);
    const basis = boden == null ? minZ : Math.min(boden, minZ);
    const flaechen = [], dach = [];
    for (const f of m.flaechen) {
      for (let k = 1; k < f.length - 1; k++) {
        const a = m.punkte[f[0]], b = m.punkte[f[k]], c = m.punkte[f[k + 1]];
        if (!a || !b || !c) continue;
        const n = normale3(a, b, c);
        if (n[2] < -0.3) continue; // Unterseite
        if (Math.abs(n[2]) < 0.3) flaechen.push(["W", [[a, b, c]]]);
        else dach.push([a, b, c]);
      }
    }
    for (const fl of dachflaechenZusammenfassen(dach)) flaechen.push(["R", fl]);
    if (flaechen.length) gebaeude.push({ mitte: [cx, cy], basis, hoehe: Math.max(...m.punkte.map((p) => p[2])) - basis, flaechen });
  }
  return { typ: "topoexport-3d", name, rahmen, gelaende, gebaeude };
}

// ---------- Geometrie-Helfer ----------
function flaecheMitte(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    const c = x1 * y2 - x2 * y1;
    a += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c;
  }
  if (Math.abs(a) < 1e-9) return [0, [0, 0]];
  return [Math.abs(a) / 2, [cx / (3 * a), cy / (3 * a)]];
}

function imRing(x, y, ring) {
  let drin = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) drin = !drin;
  }
  return drin;
}

// Ringe zu Flächen: Ein Ring, der in einer ungeraden Zahl anderer Ringe liegt, ist ein Loch
function ringeZuFlaechen(ringe) {
  const tiefe = ringe.map((r, i) => ringe.reduce((s, t, j) => s + (j !== i && imRing(r[0][0], r[0][1], t) ? 1 : 0), 0));
  const flaechen = [];
  ringe.forEach((r, i) => {
    if (tiefe[i] % 2) return;
    const loecher = ringe.filter((t, j) => tiefe[j] === tiefe[i] + 1 && imRing(t[0][0], t[0][1], r));
    flaechen.push([r, ...loecher]);
  });
  return flaechen;
}

function normale3(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(...n) || 1;
  return n.map((x) => x / l);
}

// Dach-Dreiecke in derselben Ebene zu ganzen Dachflächen zusammenfassen (Rand = Kanten, die nur einmal vorkommen)
function dachflaechenZusammenfassen(dreiecke) {
  const gruppen = new Map();
  for (const t of dreiecke) {
    let n = normale3(...t);
    if (n[2] < 0) n = n.map((x) => -x);
    const d = n[0] * t[0][0] + n[1] * t[0][1] + n[2] * t[0][2];
    const k = [Math.round(n[0] * 40), Math.round(n[1] * 40), Math.round(n[2] * 40), Math.round(d * 4)].join();
    if (!gruppen.has(k)) gruppen.set(k, []);
    gruppen.get(k).push(t);
  }
  const ergebnis = [];
  for (const tris of gruppen.values()) {
    const schl = (p) => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
    const punkt = new Map(), kanten = new Map();
    for (const t of tris) for (const [p, q] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
      const a = schl(p), b = schl(q);
      if (a === b) continue;
      punkt.set(a, p); punkt.set(b, q);
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      kanten.set(k, (kanten.get(k) || 0) + 1);
    }
    const nachbarn = new Map();
    for (const [k, n] of kanten) {
      if (n !== 1) continue;
      const [a, b] = k.split("|");
      if (!nachbarn.has(a)) nachbarn.set(a, []);
      if (!nachbarn.has(b)) nachbarn.set(b, []);
      nachbarn.get(a).push(b); nachbarn.get(b).push(a);
    }
    const benutzt = new Set(), ringe = [];
    for (const start of nachbarn.keys()) for (const erstes of nachbarn.get(start)) {
      if (benutzt.has(`${start}>${erstes}`)) continue;
      const ring = [start];
      let vorher = start, jetzt = erstes;
      benutzt.add(`${start}>${erstes}`); benutzt.add(`${erstes}>${start}`);
      while (jetzt !== start && ring.length < 10000) {
        ring.push(jetzt);
        const weiter = nachbarn.get(jetzt).find((x) => x !== vorher && !benutzt.has(`${jetzt}>${x}`));
        if (!weiter) break;
        benutzt.add(`${jetzt}>${weiter}`); benutzt.add(`${weiter}>${jetzt}`);
        vorher = jetzt; jetzt = weiter;
      }
      if (jetzt === start && ring.length >= 3) ringe.push(ring.map((k) => punkt.get(k)));
    }
    if (!ringe.length) { tris.forEach((t) => ergebnis.push([t])); continue; }
    for (const f of ringeZuFlaechen(ringe)) ergebnis.push(f);
  }
  return ergebnis;
}
