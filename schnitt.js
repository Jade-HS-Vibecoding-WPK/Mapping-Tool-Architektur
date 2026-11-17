/* ============================================================
   Ortsanalyse – Schnitt und Straßenansicht (Reiter "Schnitt")

   Man zieht eine gerade Linie über die Karte. Daraus entsteht eine Zeichnung entlang dieser Linie (Maße in Metern, 1:1):

     SCHNITT: senkrecht durch das Gelände (Höhenmodell DGM1, 1 m Raster), die Gebäude (LoD2: echte Dach- und Wandflächen,
       die Ebene der Linie wird mit jeder Fläche geschnitten), die Straße (amtliche Flächen Fahrbahn, Weg, Platz mit Breiten) und
       die Flurstücksgrenzen. Dahinter, in Blickrichtung, sieht man die Gebäude als graue Ansicht.
     ANSICHT: Blick auf die Fassaden und Dächer entlang der Linie (Straßenabwicklung), mit Tiefenstaffelung.

   Export: DXF (Linien, 1 Einheit = 1 m, X = Abstand entlang der Linie, Y = Höhe über NHN) für CAD.

   Wichtig und ehrlich:
     - LoD2 kennt keine Innenräume: geschnittene Gebäude sind Vollkörper (Poché). Durchfahrten, Höfe unter Dach und Keller fehlen.
     - Gebäude ohne LoD2 (z. B. wenn LoD2 abgeschaltet ist) erscheinen als Blöcke aus OpenStreetMap mit geschätzter Höhe (Geschosse mal 3 m).
     - Bäume stammen aus OpenStreetMap (Standort und, wenn eingetragen, Höhe und Kronendurchmesser); sonst sind Höhe und Krone geschätzt.
       Wasser: Gewässerflächen aus OpenStreetMap (Wasserlinien mit geschätzter Breite); die Tiefe des Gewässers ist unbekannt (Blau läuft aus).
       Gelände dahinter: Höhenprofile des Höhenmodells in sechs Abständen hinter der Linie.
     - Fenster, Türen, Vordächer und Möblierung fehlen. Die Zeichnung ist nicht vermessungsgenau.
     - Die Straßenansicht sortiert die Flächen nach Entfernung (Maleralgorithmus); bei sehr verschachtelten Dächern kann die Überdeckung abweichen.
     - Die DXF-Datei ist nicht in Allplan oder ArchiCAD getestet.
   ============================================================ */

"use strict";

// ---------- Zustand ----------
const schnittPanel = document.getElementById("schnitt-panel");
const schnittSvg = document.getElementById("schnitt-svg");
const schnittHinweis = document.getElementById("schnitt-hinweis");
const schnittInfo = document.getElementById("schnitt-info");
const sEl = {
  neu: document.getElementById("schnitt-linie-neu"), seite: document.getElementById("schnitt-seite"), tiefe: document.getElementById("schnitt-tiefe"),
  strasse: document.getElementById("schnitt-strasse"), grenzen: document.getElementById("schnitt-grenzen"), mass: document.getElementById("schnitt-mass"),
  dahinter: document.getElementById("schnitt-dahinter"), fit: document.getElementById("schnitt-fit"), dxf: document.getElementById("schnitt-dxf"),
  baeume: document.getElementById("schnitt-baeume"), wasser: document.getElementById("schnitt-wasser"), gelaende: document.getElementById("schnitt-gelaende")
};
const SCHNITT_EBENEN = ["schnitt-tiefe", "schnitt-tiefe-rand", "schnitt-rand", "schnitt-linie", "schnitt-punkte"];
let schnittLinie = null;          // { a: [Ost, Nord], b: [Ost, Nord] } in UTM 32
let schnittZeichnen = false;
let schnittStart = null;
let schnittModus = "schnitt";     // "schnitt" oder "ansicht"
let schnittDaten = null;          // Ergebnis der Rechnung (siehe rechneSchnitt)
let schnittStand = "";
let schnittBlick = null;          // sichtbarer Ausschnitt der Zeichnung { x, y, w, h } in Metern
let schnittPaddingGesetzt = false;
let schnittGebCache = { stand: "", liste: [] };

// ---------- 1. Linie auf der Karte ----------
function legeSchnittEbenenAn() {
  map.addSource("schnitt", { type: "geojson", data: leer });
  const unsichtbar = { visibility: "none" };
  // Band der Ansichtstiefe: so weit reicht die Zeichnung in Blickrichtung hinter die Linie
  map.addLayer({ id: "schnitt-tiefe", type: "fill", source: "schnitt", layout: unsichtbar, filter: ["==", ["get", "teil"], "tiefe"],
    paint: { "fill-color": FARBE.flst.auswahl, "fill-opacity": 0.14 } }, "gebiet-flaeche");
  map.addLayer({ id: "schnitt-tiefe-rand", type: "line", source: "schnitt", layout: unsichtbar, filter: ["==", ["get", "teil"], "tiefe"],
    paint: { "line-color": FARBE.flst.auswahl, "line-width": 1.4, "line-dasharray": [3, 2] } }, "gebiet-flaeche");
  map.addLayer({ id: "schnitt-rand", type: "line", source: "schnitt", layout: { ...unsichtbar, "line-cap": "round" },
    filter: ["in", ["get", "teil"], ["literal", ["linie", "pfeil"]]], paint: { "line-color": "#ffffff", "line-width": 7 } }, "gebiet-flaeche");
  map.addLayer({ id: "schnitt-linie", type: "line", source: "schnitt", layout: { ...unsichtbar, "line-cap": "round" },
    filter: ["in", ["get", "teil"], ["literal", ["linie", "pfeil"]]], paint: { "line-color": FARBE.flst.auswahl, "line-width": 3.5 } }, "gebiet-flaeche");
  map.addLayer({ id: "schnitt-punkte", type: "circle", source: "schnitt", layout: unsichtbar, filter: ["==", ["get", "teil"], "ende"],
    paint: { "circle-radius": 7, "circle-color": ["case", ["==", ["get", "ende"], "a"], "#ffffff", "#111111"], "circle-stroke-color": FARBE.flst.auswahl, "circle-stroke-width": 3 } }, "gebiet-flaeche");
}

// Koordinaten der Linie: s = Abstand entlang der Linie, d = Abstand quer dazu (positiv in Blickrichtung)
function schnittK(linie, seite) {
  const [ax, ay] = linie.a, [bx, by] = linie.b;
  const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L;
  return { ax, ay, L, ux, uy, nx: -uy, ny: ux, seite };
}

function setzeSchnittLinieKarte(linie) {
  if (!kartenBereit) return;
  const sichtbar = aktuelleAnsicht === "schnitt" && linie ? "visible" : "none";
  for (const id of SCHNITT_EBENEN) map.setLayoutProperty(id, "visibility", sichtbar);
  if (!linie) { map.getSource("schnitt").setData(leer); return; }
  const seite = Number(sEl.seite.value);
  const tiefe = Math.max(5, Math.min(300, Number(sEl.tiefe.value) || 30));
  const K = schnittK(linie, seite);
  const ll = (x, y) => utmWandler.inverse([x, y]);
  const feat = (teil, geometrie, eig = {}) => ({ type: "Feature", properties: { teil, ...eig }, geometry: geometrie });
  const mx = (linie.a[0] + linie.b[0]) / 2, my = (linie.a[1] + linie.b[1]) / 2;
  const vx = K.nx * seite, vy = K.ny * seite;                                    // Blickrichtung (quer zur Linie)
  const tx = mx + vx * 14, ty = my + vy * 14;                                    // Pfeilspitze, 14 m neben der Linie
  const kopf = (w) => [ll(tx, ty), ll(tx - vx * 4 + K.ux * w, ty - vy * 4 + K.uy * w)];
  const bandPunkt = ([x, y]) => ll(x + vx * tiefe, y + vy * tiefe);
  return map.getSource("schnitt").setData({ type: "FeatureCollection", features: [
    feat("tiefe", { type: "Polygon", coordinates: [[ll(...linie.a), ll(...linie.b), bandPunkt(linie.b), bandPunkt(linie.a), ll(...linie.a)]] }),
    feat("linie", { type: "LineString", coordinates: [ll(...linie.a), ll(...linie.b)] }),
    feat("pfeil", { type: "LineString", coordinates: [ll(mx, my), ll(tx, ty)] }),
    feat("pfeil", { type: "LineString", coordinates: kopf(2.8) }),
    feat("pfeil", { type: "LineString", coordinates: kopf(-2.8) }),
    feat("ende", { type: "Point", coordinates: ll(...linie.a) }, { ende: "a" }),
    feat("ende", { type: "Point", coordinates: ll(...linie.b) }, { ende: "b" })
  ] });
}

// Punkt in das Rechteck zwingen (Daten gibt es nur dort)
function schnittKlemmen(lngLat) {
  const [w, s, o, n] = turf.bbox(gebiet);
  return [Math.min(o, Math.max(w, lngLat.lng)), Math.min(n, Math.max(s, lngLat.lat))];
}

function schnittModusZeichnen(an) {
  schnittZeichnen = an;
  schnittStart = null;
  document.body.classList.toggle("is-drawing", an);
  if (an) { map.dragPan.disable(); map.boxZoom.disable(); } else { map.dragPan.enable(); map.boxZoom.enable(); }
  sEl.neu.classList.toggle("is-active", an);
  sEl.neu.textContent = an ? "Abbrechen (Esc)" : schnittLinie ? "Neue Linie ziehen" : "Linie ziehen";
  if (an) schnittHinweisSetzen("Drücke auf der Karte die Maustaste, ziehe die Linie und lass los. Sie liegt im gewählten Rechteck.");
}

function schnittBeginne(e) {
  if (!schnittZeichnen || aktuelleAnsicht !== "schnitt") return;
  e.preventDefault();
  schnittStart = utmWandler.forward(schnittKlemmen(e.lngLat));
}
function schnittZiehe(e) {
  if (!schnittZeichnen || !schnittStart) return;
  setzeSchnittLinieKarte({ a: schnittStart, b: utmWandler.forward(schnittKlemmen(e.lngLat)) });
}
function schnittBeende(e) {
  if (!schnittZeichnen || !schnittStart) return;
  const ende = utmWandler.forward(schnittKlemmen(e.lngLat));
  const a = schnittStart;
  schnittStart = null;
  if (Math.hypot(ende[0] - a[0], ende[1] - a[1]) < 5) { setzeSchnittLinieKarte(schnittLinie); return; }   // zu kurz: ignorieren
  schnittLinie = { a, b: ende };
  schnittModusZeichnen(false);
  setzeSchnittLinieKarte(schnittLinie);
  schnittNeuRechnen();
}
map.on("mousedown", schnittBeginne);
map.on("touchstart", (e) => { if (e.points.length === 1) schnittBeginne(e); });
map.on("mousemove", schnittZiehe);
map.on("touchmove", schnittZiehe);
map.on("mouseup", schnittBeende);
map.on("touchend", schnittBeende);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && schnittZeichnen) { schnittModusZeichnen(false); setzeSchnittLinieKarte(schnittLinie); }
});

// ---------- 2. Gebäude als 3D-Flächen sammeln ----------
// Jedes Gebäude: { art, boden, flaechen: [Ring ...] (Dächer), waende: [Ring ...] }, Ring = Liste [x, y, z] (UTM, Höhe über NHN), nicht geschlossen
const ringPunkte = (flach) => {
  const p = [];
  for (let i = 0; i + 2 < flach.length; i += 3) p.push([flach[i], flach[i + 1], flach[i + 2]]);
  if (p.length > 1) { const a = p[0], z = p[p.length - 1]; if (a[0] === z[0] && a[1] === z[1] && a[2] === z[2]) p.pop(); }
  return p;
};

function schnittGebaeudeListe() {
  const stand = [lod2Gebaeude.length, osmFeatures.length, gelaende ? gelaende.min : -1].join("|");
  if (schnittGebCache.stand === stand) return schnittGebCache.liste;
  const liste = [];
  const huelle = (g) => {
    const alle = [...g.flaechen, ...g.waende].map((r) => r[0]);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of alle) for (let i = 0; i + 2 < r.length; i += 3) { x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); y0 = Math.min(y0, r[i + 1]); y1 = Math.max(y1, r[i + 1]); }
    return [x0, y0, x1, y1];
  };
  for (const g of lod2Gebaeude) {
    liste.push({ art: "lod2", boden: g.boden, dach: g.flaechen.map((r) => ringPunkte(r[0])), waende: g.waende.map((r) => ringPunkte(r[0])), bb: huelle(g) });
  }
  // Ersatz: OSM-Gebäude ohne LoD2 als Blöcke (Höhe = Geschosse mal 3 m, geschätzt)
  for (const f of osmFeatures) {
    const p = f.properties;
    if ((p.kat !== "gebaeude" && p.kat !== "nebengebaeude") || (lod2Vorhanden && p.lod2 === 1)) continue;
    const polygone = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
    const hoehe = p.hoehe > 0 ? p.hoehe : geschosseVon(p).n * GESCHOSSHOEHE_M;
    for (const poly of polygone) {
      const ring = poly[0].map((pt) => utmWandler.forward(pt));
      if (ring.length > 1) ring.pop();
      if (ring.length < 3) continue;
      const mx = ring.reduce((s, q) => s + q[0], 0) / ring.length, my = ring.reduce((s, q) => s + q[1], 0) / ring.length;
      const z0 = gelaende ? gelaendeHoehe(mx, my) : 0;
      const dach = ring.map(([x, y]) => [x, y, z0 + hoehe]);
      const waende = ring.map((q, i) => { const r = ring[(i + 1) % ring.length]; return [[q[0], q[1], z0], [r[0], r[1], z0], [r[0], r[1], z0 + hoehe], [q[0], q[1], z0 + hoehe]]; });
      const xs = ring.map((q) => q[0]), ys = ring.map((q) => q[1]);
      liste.push({ art: "ersatz", boden: z0, dach: [dach], waende, bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
    }
  }
  schnittGebCache = { stand, liste };
  return liste;
}

// ---------- 3. Rechnung ----------
// Schnitt einer ebenen Fläche (Punktliste) mit der senkrechten Ebene durch die Linie: Liste von Strecken [[s0, z0], [s1, z1]]
function schnittMitEbene(pts, K) {
  const n = pts.length;
  const d = pts.map((p) => (p[0] - K.ax) * K.nx + (p[1] - K.ay) * K.ny);
  const kreuzungen = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if ((d[i] > 0) === (d[j] > 0)) continue;
    const t = d[i] / (d[i] - d[j]);
    const x = pts[i][0] + t * (pts[j][0] - pts[i][0]), y = pts[i][1] + t * (pts[j][1] - pts[i][1]), z = pts[i][2] + t * (pts[j][2] - pts[i][2]);
    kreuzungen.push([(x - K.ax) * K.ux + (y - K.ay) * K.uy, z]);
  }
  kreuzungen.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const strecken = [];
  for (let i = 0; i + 1 < kreuzungen.length; i += 2) strecken.push([kreuzungen[i], kreuzungen[i + 1]]);
  return strecken;
}

// Fläche an der Ebene d = 0 abschneiden (Sutherland-Hodgman); behalten wird der Teil in Blickrichtung (seite * d >= 0)
function kappeInBlickrichtung(pts, K) {
  const dd = pts.map((p) => K.seite * ((p[0] - K.ax) * K.nx + (p[1] - K.ay) * K.ny));
  const aus = [];
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    if (dd[i] >= 0) aus.push({ p: pts[i], d: dd[i] });
    if ((dd[i] >= 0) !== (dd[j] >= 0)) {
      const t = dd[i] / (dd[i] - dd[j]);
      aus.push({ p: [0, 1, 2].map((k) => pts[i][k] + t * (pts[j][k] - pts[i][k])), d: 0 });
    }
  }
  return aus;
}

// Schnittpunkte der Linie mit den Kanten eines Rings (2D, UTM): Liste der Abstände s entlang der Linie
function kantenKreuzungen2D(ring, K) {
  const s = [];
  const dq = ring.map((p) => (p[0] - K.ax) * K.nx + (p[1] - K.ay) * K.ny);
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    if ((dq[i] > 0) === (dq[j] > 0)) continue;
    const t = dq[i] / (dq[i] - dq[j]);
    const x = ring[i][0] + t * (ring[j][0] - ring[i][0]), y = ring[i][1] + t * (ring[j][1] - ring[i][1]);
    s.push((x - K.ax) * K.ux + (y - K.ay) * K.uy);
  }
  return s;
}

function rechneSchnitt() {
  if (!schnittLinie || !datenVorhanden) return null;
  const seite = Number(sEl.seite.value) || 1;
  const tiefe = Math.max(5, Math.min(300, Number(sEl.tiefe.value) || 30));
  const K = schnittK(schnittLinie, seite);
  const L = K.L;
  const xAnz = (s) => (seite > 0 ? s : L - s);       // Blick nach links: s wächst nach rechts, Blick nach rechts: gespiegelt
  const D = { K, L, seite, tiefe, xAnz };

  // Gelände entlang der Linie
  const schritt = Math.max(0.25, L / 2000);
  const gelaendeLinie = [];
  for (let s = 0; s <= L + 1e-6; s += schritt) {
    const sc = Math.min(s, L);
    const x = K.ax + K.ux * sc, y = K.ay + K.uy * sc;
    gelaendeLinie.push([sc, gelaende ? gelaendeHoehe(x, y) : null]);
  }
  D.hatGelaende = !!gelaende && gelaendeLinie.every((p) => p[1] != null && Number.isFinite(p[1]));
  const zOhneGelaende = (() => { const b = lod2Gebaeude.map((g) => g.boden).filter((v) => v != null).sort((p, q) => p - q); return b.length ? b[b.length >> 1] : 0; })();
  D.gelaende = gelaendeLinie.map(([s, z]) => [s, D.hatGelaende ? z : zOhneGelaende]);
  const zGelaende = (s) => {
    const i = Math.min(D.gelaende.length - 1, Math.max(0, Math.round(s / schritt)));
    return D.gelaende[i][1];
  };

  // Gebäude: Streifen (in Blickrichtung und Schnittebene) auswählen
  const gebaeude = schnittGebaeudeListe();
  D.ansicht = [];          // Flächen in Blickrichtung: { pts: [[x, z]], d, art, ersatz }
  D.geschnitten = [];      // Poché: { runs: [[ [s, z] ... ]], ersatz, firstZ, fussZ, sMitte }
  const randS = 2;         // Gebäude, die knapp außerhalb der Linie enden, tragen nichts bei
  for (const g of gebaeude) {
    const ecken = [[g.bb[0], g.bb[1]], [g.bb[0], g.bb[3]], [g.bb[2], g.bb[1]], [g.bb[2], g.bb[3]]].map(([x, y]) => ({
      s: (x - K.ax) * K.ux + (y - K.ay) * K.uy, d: (x - K.ax) * K.nx + (y - K.ay) * K.ny }));
    const sMin = Math.min(...ecken.map((e) => e.s)), sMax = Math.max(...ecken.map((e) => e.s));
    const dMin = Math.min(...ecken.map((e) => e.d)), dMax = Math.max(...ecken.map((e) => e.d));
    if (sMax < -randS || sMin > L + randS) continue;
    // in Blickrichtung (seite * d) von 0 bis tiefe, oder von der Ebene geschnitten
    const vonD = seite > 0 ? dMin : -dMax, bisD = seite > 0 ? dMax : -dMin;
    if (bisD < 0 || vonD > tiefe) continue;

    // Ansicht in Blickrichtung
    for (const [liste, art] of [[g.waende, "wand"], [g.dach, "dach"]]) {
      for (const pts of liste) {
        if (pts.length < 3) continue;
        const gekappt = kappeInBlickrichtung(pts, K);
        if (gekappt.length < 3) continue;
        const mittel = gekappt.reduce((q, e) => q + e.d, 0) / gekappt.length;
        if (Math.min(...gekappt.map((e) => e.d)) > tiefe) continue;
        const p2 = gekappt.map((e) => [xAnz((e.p[0] - K.ax) * K.ux + (e.p[1] - K.ay) * K.uy), e.p[2]]);
        const xs = p2.map((q) => q[0]);
        if (Math.max(...xs) < 0 || Math.min(...xs) > L) continue;
        D.ansicht.push({ pts: p2, d: mittel, art, ersatz: g.art === "ersatz" });
      }
    }

    // Schnitt: Dachflächen mit der Ebene schneiden und daraus den Vollkörper bilden
    if (dMin <= 0 && dMax >= 0) {
      const dachStrecken = [];
      for (const pts of g.dach) for (const st of schnittMitEbene(pts, K)) dachStrecken.push(st);
      // auf 0 bis L zuschneiden
      const zugeschnitten = [];
      for (const [p, q] of dachStrecken) {
        let [s0, z0] = p, [s1, z1] = q;
        if (s0 > s1) { [s0, z0, s1, z1] = [s1, z1, s0, z0]; }
        if (s1 < 0 || s0 > L || s1 - s0 < 1e-6) { if (!(s1 - s0 < 1e-6 && s0 >= 0 && s0 <= L)) continue; }
        const f = (s) => (s1 - s0 < 1e-9 ? z0 : z0 + ((s - s0) / (s1 - s0)) * (z1 - z0));
        const a0 = Math.max(0, s0), a1 = Math.min(L, s1);
        zugeschnitten.push([a0, f(a0), a1, f(a1)]);
      }
      if (!zugeschnitten.length) continue;
      // zusammenhängende Bereiche (Lücken bis 0,3 m gelten als zusammenhängend)
      zugeschnitten.sort((p, q) => p[0] - q[0]);
      const bereiche = [];
      for (const st of zugeschnitten) {
        const letzter = bereiche[bereiche.length - 1];
        if (letzter && st[0] <= letzter.s1 + 0.3) { letzter.s1 = Math.max(letzter.s1, st[2]); letzter.st.push(st); } else bereiche.push({ s0: st[0], s1: st[2], st: [st] });
      }
      const runs = [];
      let firstZ = -Infinity;
      for (const b of bereiche) {
        const hoehe = (s) => {
          let h = -Infinity;
          for (const [a0, z0, a1, z1] of b.st) {
            if (s < a0 - 1e-6 || s > a1 + 1e-6) continue;
            h = Math.max(h, a1 - a0 < 1e-9 ? Math.max(z0, z1) : z0 + ((s - a0) / (a1 - a0)) * (z1 - z0));
          }
          return h;
        };
        const oben = [];
        const n = Math.max(2, Math.ceil((b.s1 - b.s0) / 0.1));
        for (let i = 0; i <= n; i++) { const s = b.s0 + ((b.s1 - b.s0) * i) / n; const h = hoehe(s); if (h > -Infinity) oben.push([s, h]); }
        if (oben.length < 2) continue;
        const fuss = g.boden != null && Number.isFinite(g.boden) ? () => g.boden : zGelaende;
        // Fuß: Gebäudeboden (LoD2) oder Gelände; nie über dem Dach
        const poly = [[oben[0][0], Math.min(fuss(oben[0][0]), oben[0][1])]].concat(oben, [[oben[oben.length - 1][0], Math.min(fuss(oben[oben.length - 1][0]), oben[oben.length - 1][1])]]);
        runs.push(poly);
        for (const [, z] of oben) firstZ = Math.max(firstZ, z);
      }
      if (runs.length) {
        const sM = (bereiche[0].s0 + bereiche[bereiche.length - 1].s1) / 2;
        D.geschnitten.push({ runs, ersatz: g.art === "ersatz", firstZ, fussZ: g.boden != null && Number.isFinite(g.boden) ? g.boden : zGelaende(sM), sMitte: sM,
          sVon: bereiche[0].s0, sBis: bereiche[bereiche.length - 1].s1 });
      }
    }
  }
  D.ansicht.sort((p, q) => q.d - p.d);       // von hinten nach vorn malen

  // Straßenflächen entlang der Linie
  D.strassen = [];
  if (alkisVorhanden) {
    const la = utmWandler.inverse(schnittLinie.a), lb = utmWandler.inverse(schnittLinie.b);
    const rand = 0.0004;
    const bb = [Math.min(la[0], lb[0]) - rand, Math.min(la[1], lb[1]) - rand, Math.max(la[0], lb[0]) + rand, Math.max(la[1], lb[1]) + rand];
    for (const f of alkisFlaechen) {
      const kat = f.properties.kat;
      if (kat !== "strasse" && kat !== "weg" && kat !== "platz") continue;
      const fb = turf.bbox(f);
      if (fb[2] < bb[0] || fb[0] > bb[2] || fb[3] < bb[1] || fb[1] > bb[3]) continue;
      const polygone = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const poly of polygone) {
        const s = [];
        for (const ring of poly) s.push(...kantenKreuzungen2D(ring.map((pt) => utmWandler.forward(pt)), K));
        s.sort((p, q) => p - q);
        for (let i = 0; i + 1 < s.length; i += 2) {
          const s0 = Math.max(0, s[i]), s1 = Math.min(L, s[i + 1]);
          if (s1 - s0 > 0.05) D.strassen.push({ kat, s0, s1 });
        }
      }
    }
    D.strassen.sort((p, q) => p.s0 - q.s0);
    // Benachbarte Flächen derselben Art (z. B. zwei Fahrbahnstücke, die das Kataster getrennt führt) zu einer Breite zusammenfassen
    const zusammen = [];
    for (const st of D.strassen) {
      const letzter = zusammen[zusammen.length - 1];
      if (letzter && letzter.kat === st.kat && st.s0 - letzter.s1 < 0.3) letzter.s1 = Math.max(letzter.s1, st.s1);
      else zusammen.push({ ...st });
    }
    D.strassen = zusammen;
  }

  // Flurstücksgrenzen
  D.grenzen = [];
  if (flurstueckeVorhanden) {
    const la = utmWandler.inverse(schnittLinie.a), lb = utmWandler.inverse(schnittLinie.b);
    const rand = 0.0004;
    const bb = [Math.min(la[0], lb[0]) - rand, Math.min(la[1], lb[1]) - rand, Math.max(la[0], lb[0]) + rand, Math.max(la[1], lb[1]) + rand];
    const treffer = [];
    for (const p of flurstuecke) {
      if (p.bbox[2] < bb[0] || p.bbox[0] > bb[2] || p.bbox[3] < bb[1] || p.bbox[1] > bb[3]) continue;
      const polygone = p.f.geometry.type === "Polygon" ? [p.f.geometry.coordinates] : p.f.geometry.coordinates;
      for (const poly of polygone) for (const ring of poly) {
        const utm = ring.map((pt) => utmWandler.forward(pt));
        if (utm.length > 1) utm.pop();
        for (const s of kantenKreuzungen2D(utm, K)) if (s >= 0 && s <= L) treffer.push(s);
      }
    }
    treffer.sort((p, q) => p - q);
    for (const s of treffer) if (!D.grenzen.length || s - D.grenzen[D.grenzen.length - 1] > 0.2) D.grenzen.push(s);
  }

  // Bäume: Stämme aus OpenStreetMap mit der Kronengröße aus der Karte (Krone aus OSM, aus der Höhe oder geschätzt).
  // Höhe: OSM-Wert, sonst das Doppelte des Kronendurchmessers (so rechnet auch die Kronengröße in app.js aus der Höhe). Das ist eine Schätzung.
  D.baeume = [];
  for (const f of baumFeatures) {
    if (f.properties.form !== "stamm") continue;
    const [e, n] = utmWandler.forward(f.geometry.coordinates);
    const s = (e - K.ax) * K.ux + (n - K.ay) * K.uy;
    const d = seite * ((e - K.ax) * K.nx + (n - K.ay) * K.ny);
    const kd = f.properties.d, r = kd / 2;
    if (s < -r || s > L + r || d < -r || d > tiefe + r) continue;
    const hOsm = f.properties.hoehe >= 3 && f.properties.hoehe <= 45;
    const H = hOsm ? f.properties.hoehe : Math.min(35, Math.max(5, kd * 2));
    const kh = H * (f.properties.nadel ? 0.8 : 0.6);
    const z0 = gelaende && gelaendeImRaster(e, n) ? gelaendeHoehe(e, n) : zGelaende(Math.min(L, Math.max(0, s)));
    D.baeume.push({ s, d, r, H, kh, zBasis: z0 + H - kh, z0, nadel: !!f.properties.nadel, geschaetzt: !hOsm, geschnitten: Math.abs(d) < r });
  }

  // Wasser entlang der Linie: Flächen aus OpenStreetMap (genau) und Wasserlinien (Breite geschätzt)
  D.wasser = [];
  {
    const la = utmWandler.inverse(schnittLinie.a), lb = utmWandler.inverse(schnittLinie.b);
    const rand = 0.0004;
    const bb = [Math.min(la[0], lb[0]) - rand, Math.min(la[1], lb[1]) - rand, Math.max(la[0], lb[0]) + rand, Math.max(la[1], lb[1]) + rand];
    for (const f of osmFeatures) {
      const kat = f.properties.kat;
      if (kat !== "wasser" && kat !== "wasserlinie") continue;
      const fb = turf.bbox(f);
      if (fb[2] < bb[0] || fb[0] > bb[2] || fb[3] < bb[1] || fb[1] > bb[3]) continue;
      if (kat === "wasser") {
        const polygone = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
        for (const poly of polygone) {
          const s = [];
          for (const ring of poly) s.push(...kantenKreuzungen2D(ring.map((pt) => utmWandler.forward(pt)), K));
          s.sort((p, q) => p - q);
          for (let i = 0; i + 1 < s.length; i += 2) {
            const s0 = Math.max(0, s[i]), s1 = Math.min(L, s[i + 1]);
            if (s1 - s0 > 0.1) D.wasser.push({ s0, s1, geschaetzt: false });
          }
        }
      } else {
        const linien = f.geometry.type === "MultiLineString" ? f.geometry.coordinates : f.geometry.type === "LineString" ? [f.geometry.coordinates] : [];
        const breite = WASSER_BREITE_SCHAETZUNG[f.properties.typ] || 2;
        for (const koordinaten of linien) {
          const utm = koordinaten.map((pt) => utmWandler.forward(pt));
          for (let i = 0; i + 1 < utm.length; i++) {
            const d0 = (utm[i][0] - K.ax) * K.nx + (utm[i][1] - K.ay) * K.ny, d1 = (utm[i + 1][0] - K.ax) * K.nx + (utm[i + 1][1] - K.ay) * K.ny;
            if ((d0 > 0) === (d1 > 0)) continue;
            const t = d0 / (d0 - d1);
            const s = (utm[i][0] + t * (utm[i + 1][0] - utm[i][0]) - K.ax) * K.ux + (utm[i][1] + t * (utm[i + 1][1] - utm[i][1]) - K.ay) * K.uy;
            const s0 = Math.max(0, s - breite / 2), s1 = Math.min(L, s + breite / 2);
            if (s1 > s0) D.wasser.push({ s0, s1, geschaetzt: true });
          }
        }
      }
    }
    // Überlagerungen (z. B. Fluss als Fläche und als Linie) zusammenfassen; ein Stück gilt als genau, wenn eine Fläche beteiligt ist
    D.wasser.sort((p, q) => p.s0 - q.s0);
    const wz = [];
    for (const w of D.wasser) {
      const letzter = wz[wz.length - 1];
      if (letzter && w.s0 <= letzter.s1 + 0.2) { letzter.s1 = Math.max(letzter.s1, w.s1); letzter.geschaetzt = letzter.geschaetzt && w.geschaetzt; }
      else wz.push({ ...w });
    }
    D.wasser = wz;
  }

  // Gelände dahinter: Höhenprofile in sechs Abständen hinter der Linie. Die Hüllkurve (höchster Wert je Stelle) ist das Gelände, das man sieht.
  D.gelaendeHinten = null;
  if (D.hatGelaende) {
    const schrittH = Math.max(1, L / 400);
    const scheiben = [];
    for (let k = 1; k <= 6; k++) {
      const tiefeK = (tiefe * k) / 6, pts = [];
      for (let s = 0; s <= L + 1e-6; s += schrittH) {
        const sc = Math.min(s, L);
        const e = K.ax + K.ux * sc + K.nx * seite * tiefeK, n = K.ay + K.uy * sc + K.ny * seite * tiefeK;
        pts.push([sc, gelaendeImRaster(e, n) ? gelaendeHoehe(e, n) : null]);
      }
      scheiben.push({ tiefe: tiefeK, pts });
    }
    const huelle = D.gelaende.filter((_, i) => i % Math.max(1, Math.round(schrittH / schritt)) === 0).map(([s, z]) => {
      let h = z;
      for (const sch of scheiben) { const p = sch.pts[Math.min(sch.pts.length - 1, Math.round(s / schrittH))]; if (p && p[1] != null) h = Math.max(h, p[1]); }
      return [s, h];
    });
    D.gelaendeHinten = { scheiben, huelle };
  }

  const zs = D.gelaende.map((p) => p[1]);
  D.zMin = Math.min(...zs); D.zMax = Math.max(...zs);
  let oben = D.zMax;
  for (const g of D.geschnitten) oben = Math.max(oben, g.firstZ);
  for (const a of D.ansicht) for (const p of a.pts) oben = Math.max(oben, p[1]);
  for (const b of D.baeume) oben = Math.max(oben, b.z0 + b.H);
  D.zOben = oben;
  return D;
}

// Liegt ein Punkt (UTM) im Höhenraster? (Außerhalb gäbe gelaendeHoehe nur den Randwert zurück.)
function gelaendeImRaster(e, n) {
  return !!gelaende && e >= gelaende.x0 && e <= gelaende.x0 + gelaende.breite && n <= gelaende.yOben && n >= gelaende.yOben - gelaende.hoehe;
}

// ---------- 4. Zeichnung (SVG) ----------
const fmt = (x) => (Math.round(x * 100) / 100).toString();
// Tiefenstaffelung: nah (Anteil 0) dunkler, fern (Anteil 1) heller
const grau = (anteil) => { const g = Math.round(172 + Math.min(1.1, Math.max(-0.2, anteil)) * 66); return `rgb(${g},${g - 2},${g - 6})`; };
const ersatzFarbe = (anteil) => { const m = (v, w) => Math.round(v + (255 - v) * w); return `rgb(${m(160, anteil * 0.7)},${m(185, anteil * 0.7)},${m(210, anteil * 0.7)})`; };
// Feste Zufallszahlen je Baum (immer gleiches Aussehen bei jedem Neuzeichnen)
function zufallsFolge(seed) { let s = seed % 4294967296; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

// Form eines Baums als Punktlisten [Abstand, Höhe]; rx = Kronenradius an der Schnittebene.
// Architektur-Strichzeichnung, nur weiß mit dunkler Linie, ohne Flecken: unregelmäßige Kronenform, Astgabeln, Stamm mit Fuß und Rindenstrichen.
// Nadelbaum: gestufte Tannenform mit gezackten Stufen.
function baumGeometrie(b, x, rx) {
  const zuf = zufallsFolge(Math.floor(Math.abs(b.s * 977 + b.d * 131 + b.r * 17) * 1000) + 7);
  const w0 = Math.min(0.4, 0.14 + b.H * 0.009), w1 = w0 * 0.6;
  const g = { stamm: [], kronen: [], aeste: [], rinde: [] };
  const stammBis = b.zBasis + (b.nadel ? 0.4 : 0.8);
  g.stamm = [[x - w0 * 1.4, b.z0], [x - w0, b.z0 + 0.45], [x - w1, stammBis], [x + w1, stammBis], [x + w0, b.z0 + 0.45], [x + w0 * 1.4, b.z0]];
  for (let i = 0; i < 5; i++) {                                              // Rindenstriche
    const fx = -0.7 + i * 0.35, za = b.z0 + 0.5 + zuf() * 0.8, zb = za + (stammBis - b.z0) * (0.25 + zuf() * 0.4);
    const breiteBei = (z) => w0 + (w1 - w0) * Math.min(1, (z - b.z0) / Math.max(0.1, stammBis - b.z0));
    g.rinde.push([x + fx * breiteBei(za) * 0.8, za, x + fx * breiteBei(zb) * 0.8, Math.min(zb, stammBis - 0.1)]);
  }
  if (b.nadel) {
    const n = b.H >= 12 ? 4 : 3;
    const th = b.kh / (1 + (n - 1) * 0.55), step = th * 0.55;
    for (let i = n - 1; i >= 0; i--) {                                       // unten zuerst, die oberen Stufen überdecken die unteren
      const zA = b.z0 + b.H - i * step, zB = zA - th, w = rx * (0.5 + 0.5 * (i + 1) / n);
      const pts = [[x, zA], [x + w, zB]];
      for (let j = 1; j < 4; j++) pts.push([x + w - (2 * w * j) / 4, zB + (j % 2 ? th * 0.14 : 0)]);
      pts.push([x - w, zB]);
      g.kronen.push({ pts, ton: i });
    }
    return g;
  }
  // Laubbaum
  const ry = b.kh / 2, cz = b.zBasis + ry;
  const p1 = zuf() * 6.28, p2 = zuf() * 6.28, p3 = zuf() * 6.28;
  const f = (a) => 0.93 * (1 + 0.05 * Math.sin(3 * a + p1) + 0.04 * Math.sin(5 * a + p2) + 0.03 * Math.sin(8 * a + p3) + 0.025 * Math.sin(13 * a + p1));
  const pts = [];
  for (let i = 0; i < 72; i++) { const a = (2 * Math.PI * i) / 72; pts.push([x + rx * f(a) * Math.cos(a), cz + ry * f(a) * Math.sin(a)]); }
  g.kronen.push({ pts, ton: 0 });
  const streck = rx / ry;                                                     // Äste so strecken, dass sie in die Krone passen
  const ast = (x0, z0, ang, len, tief) => {
    const x1 = x0 + Math.cos(ang) * len * streck, z1 = z0 + Math.sin(ang) * len;
    g.aeste.push([x0, z0, x1, z1]);
    if (tief > 0) { ast(x1, z1, ang + 0.3 + zuf() * 0.3, len * 0.62, tief - 1); ast(x1, z1, ang - 0.3 - zuf() * 0.3, len * 0.62, tief - 1); }
  };
  for (const w of [-0.6, 0.02, 0.58]) ast(x, b.zBasis + 0.6, Math.PI / 2 + w + (zuf() - 0.5) * 0.2, ry * 0.5, 2);
  return g;
}

// Ein Baum für die Zeichnung. Geschnitten = die Krone wird an der Ebene gekappt (Sehne des Kronenkreises), dann kräftiger gezeichnet.
function baumSvg(b, D, geschnitten) {
  const x = D.xAnz(b.s);
  const rx = geschnitten ? Math.sqrt(Math.max(0.04, b.r * b.r - b.d * b.d)) : b.r;
  const g = baumGeometrie(b, x, rx);
  const punkte = (pts) => pts.map(([px, pz]) => `${fmt(px)},${fmt(-pz)}`).join(" ");
  const strich = "#1a1a1a";                                                       // einfarbig: immer dieselbe dunkle Linie, Fläche weiß
  const sw = geschnitten ? 0.9 : 0.55;
  const ne = 'vector-effect="non-scaling-stroke"';
  const pfad = (teile, breite, op = 1, extra = "") => teile ? `<path d="${teile}" fill="none" stroke="${strich}" stroke-width="${breite}" stroke-opacity="${op}" stroke-linecap="round" stroke-linejoin="round" ${ne}${extra}/>` : "";
  const m = (px, pz) => `M${fmt(px)},${fmt(-pz)}`;
  let s = `<polygon points="${punkte(g.stamm)}" fill="#fff" stroke="${strich}" stroke-width="${sw}" ${ne} stroke-linejoin="round"/>`;
  s += pfad(g.rinde.map(([x1, z1, x2, z2]) => `${m(x1, z1)}L${fmt(x2)},${fmt(-z2)}`).join(""), 0.4, 0.8);
  for (const k of g.kronen) s += `<polygon points="${punkte(k.pts)}" fill="#fff" stroke="${strich}" stroke-width="${sw}" ${ne} stroke-linejoin="round"/>`;
  s += pfad(g.aeste.map(([x1, z1, x2, z2]) => `${m(x1, z1)}L${fmt(x2)},${fmt(-z2)}`).join(""), 0.45, 0.6);
  return s;
}

function baueSchnittSvg(D) {
  const y = (z) => -z;
  const teile = [];
  const hell = sEl.dahinter.checked;
  // Gelände mit Erdreich darunter
  const bodenUnten = D.zMin - 3;
  const gl = D.gelaende.map(([s, z]) => `${fmt(D.xAnz(s))},${fmt(y(z))}`);
  const gelaendeLinie = D.seite > 0 ? gl : [...gl].reverse();
  teile.push(`<polygon points="${gelaendeLinie.join(" ")} ${fmt(D.L)},${fmt(y(bodenUnten))} 0,${fmt(y(bodenUnten))}" fill="url(#s-erde)" stroke="none"/>`);

  const dahinterAn = schnittModus === "ansicht" || hell;

  // Gelände dahinter: das Gelände, das hinter der Linie ansteigt, als Fläche bis zur Hüllkurve und als Höhenprofile in sechs Abständen
  if (dahinterAn && sEl.gelaende.checked && D.gelaendeHinten) {
    const gh = D.gelaendeHinten;
    const h = D.seite > 0 ? gh.huelle : [...gh.huelle].reverse();
    teile.push(`<polygon points="${h.map(([s, z]) => `${fmt(D.xAnz(s))},${fmt(y(z))}`).join(" ")} ${gelaendeLinie.slice().reverse().join(" ")}" fill="#ece5d3" fill-opacity="0.85" stroke="none"/>`);
    gh.scheiben.forEach((sch, i) => {
      const f = i / Math.max(1, gh.scheiben.length - 1);
      let lauf = [];
      const linien = [];
      for (const [s, z] of sch.pts) { if (z == null) { if (lauf.length > 1) linien.push(lauf); lauf = []; } else lauf.push(`${fmt(D.xAnz(s))},${fmt(y(z))}`); }
      if (lauf.length > 1) linien.push(lauf);
      const grauwert = Math.round(120 + f * 90);
      for (const l of linien) teile.push(`<polyline points="${l.join(" ")}" fill="none" stroke="rgb(${grauwert},${grauwert - 6},${grauwert - 20})" stroke-width="0.9" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`);
    });
  }

  // Ansicht in Blickrichtung (Straßenansicht, im Schnitt grau dahinter), Gebäude und Bäume gemeinsam nach Entfernung sortiert
  if (dahinterAn) {
    const posten = [];
    for (const f of D.ansicht) {
      const anteil = Math.min(1, f.d / D.tiefe);
      const farbe = f.ersatz ? ersatzFarbe(anteil) : f.art === "dach" ? grau(anteil * 0.6 - 0.1) : grau(anteil);
      posten.push({ d: f.d, svg: `<polygon points="${f.pts.map((p) => `${fmt(p[0])},${fmt(y(p[1]))}`).join(" ")}" fill="${farbe}" stroke="${anteil > 0.5 ? "#9a968d" : "#3a362f"}" stroke-width="${anteil > 0.5 ? 0.5 : 0.8}" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>` });
    }
    if (sEl.baeume.checked) {
      for (const b of D.baeume) {
        if (schnittModus === "schnitt" && b.geschnitten) continue;     // geschnittene Bäume kommen oben auf die Schnittebene
        posten.push({ d: Math.max(0, b.d), svg: baumSvg(b, D, false) });
      }
    }
    posten.sort((p, q) => q.d - p.d);                                  // von hinten nach vorn malen
    teile.push(`<g id="s-ansicht">${posten.map((p) => p.svg).join("")}</g>`);
  }

  // Straßenflächen auf dem Gelände
  if (sEl.strasse.checked) {
    const farben = { strasse: FARBE.plan.fahrbahn, weg: FARBE.plan.weg, platz: FARBE.plan.platz };
    for (const st of D.strassen) {
      const punkte = D.gelaende.filter(([s]) => s >= st.s0 && s <= st.s1);
      if (punkte.length < 2) continue;
      const pfad = (D.seite > 0 ? punkte : [...punkte].reverse()).map(([s, z]) => `${fmt(D.xAnz(s))},${fmt(y(z))}`);
      teile.push(`<polyline points="${pfad.join(" ")}" fill="none" stroke="${farben[st.kat]}" stroke-width="7" vector-effect="non-scaling-stroke" stroke-linecap="butt"/>`);
    }
  }

  // Wasser: Wasserfläche an der Schnittebene. Die Tiefe des Gewässers kennen wir nicht, deshalb läuft das Blau nach unten aus.
  if (sEl.wasser.checked) {
    for (const w of D.wasser) {
      const punkte = D.gelaende.filter(([s]) => s >= w.s0 && s <= w.s1);
      if (!punkte.length) continue;
      const zW = Math.min(...punkte.map((p) => p[1]));
      const xa = Math.min(D.xAnz(w.s0), D.xAnz(w.s1)), xb = Math.max(D.xAnz(w.s0), D.xAnz(w.s1));
      teile.push(`<rect x="${fmt(xa)}" y="${fmt(y(zW))}" width="${fmt(xb - xa)}" height="1.6" fill="url(#s-wasser)"${w.geschaetzt ? ' stroke="#2f7fc0" stroke-dasharray="4 3" stroke-width="0.8" vector-effect="non-scaling-stroke"' : ""}/>`);
    }
  }

  // Geländelinie
  teile.push(`<polyline points="${gelaendeLinie.join(" ")}" fill="none" stroke="#000" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`);
  if (sEl.wasser.checked) {
    for (const w of D.wasser) {
      const punkte = D.gelaende.filter(([s]) => s >= w.s0 && s <= w.s1);
      if (!punkte.length) continue;
      const zW = Math.min(...punkte.map((p) => p[1]));
      teile.push(`<line x1="${fmt(Math.min(D.xAnz(w.s0), D.xAnz(w.s1)))}" x2="${fmt(Math.max(D.xAnz(w.s0), D.xAnz(w.s1)))}" y1="${fmt(y(zW))}" y2="${fmt(y(zW))}" stroke="#2f7fc0" stroke-width="3" vector-effect="non-scaling-stroke"/>`);
    }
  }

  // Geschnittene Gebäude (Poché) im Schnitt
  if (schnittModus === "schnitt") {
    const buf = [];
    for (const g of D.geschnitten) {
      for (const run of g.runs) {
        const pts = (D.seite > 0 ? run : [...run].reverse()).map(([s, z]) => `${fmt(D.xAnz(s))},${fmt(y(z))}`).join(" ");
        buf.push(`<polygon points="${pts}" fill="${g.ersatz ? "#34495e" : "#111"}" stroke="#000" stroke-width="1.2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`);
      }
    }
    teile.push(`<g id="s-poche">${buf.join("")}</g>`);
    // Bäume, die die Schnittebene trifft
    if (sEl.baeume.checked) teile.push(`<g id="s-baeume-schnitt">${D.baeume.filter((b) => b.geschnitten).map((b) => baumSvg(b, D, true)).join("")}</g>`);
  }

  // Flurstücksgrenzen als gestrichelte senkrechte Linien
  if (sEl.grenzen.checked) {
    const buf = D.grenzen.map((s) => `<line x1="${fmt(D.xAnz(s))}" x2="${fmt(D.xAnz(s))}" y1="${fmt(y(D.zOben + 1))}" y2="${fmt(y(bodenUnten))}" stroke="#2a9bd6" stroke-width="1" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>`);
    teile.push(`<g id="s-grenzen">${buf.join("")}</g>`);
  }
  return teile.join("");
}

// Beschriftung: wird bei jeder Änderung des Ausschnitts neu gezeichnet, damit die Schrift gleich groß bleibt
function baueSchnittText(D, vb, pxBreite) {
  const ppm = pxBreite / vb.w;                      // Bildschirmpunkte je Meter
  const fs = 11 / ppm, fk = 9.5 / ppm;              // Schriftgrößen in Metern
  const y = (z) => -z;
  const t = [];
  const text = (x, yy, s, opt = {}) => t.push(`<text x="${fmt(x)}" y="${fmt(yy)}" font-size="${fmt(opt.klein ? fk : fs)}" fill="${opt.farbe || "#222"}" text-anchor="${opt.anker || "start"}"` +
    `${opt.fett ? ' font-weight="700"' : ""} font-family="Helvetica, Arial, sans-serif" paint-order="stroke" stroke="#fff" stroke-width="${fmt(3 / ppm)}">${s}</text>`);
  const linie = (x1, y1, x2, y2, farbe = "#555", breite = 1) => t.push(`<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="${farbe}" stroke-width="${breite}" vector-effect="non-scaling-stroke"/>`);
  const mass = sEl.mass.checked;

  // Höhenraster (Meter über NHN) am linken Rand des Ausschnitts
  const hoeheSchritt = [1, 2, 5, 10, 20, 50].find((s2) => s2 * ppm >= 38) || 100;
  const zVon = Math.floor(-(vb.y + vb.h) / hoeheSchritt) * hoeheSchritt, zBis = Math.ceil(-vb.y / hoeheSchritt) * hoeheSchritt;
  if (mass) {
    for (let z = zVon; z <= zBis; z += hoeheSchritt) {
      if (z < D.zMin - 3.2) continue;
      linie(vb.x, y(z), vb.x + vb.w, y(z), "#d6d6d6", 0.6);
      text(vb.x + 6 / ppm, y(z) - 2 / ppm, `${zahl(z, hoeheSchritt < 1 ? 1 : 0)} m`, { klein: true, farbe: "#777" });
    }
  }

  // Maßketten unter dem Gelände
  const zKette = D.zMin - 1.2, zGesamt = D.zMin - 2.4;
  if (mass) {
    if (sEl.strasse.checked) {
      const namen = { strasse: "Fahrbahn", weg: "Weg", platz: "Platz" };
      for (const st of D.strassen) {
        const x0 = D.xAnz(st.s0), x1 = D.xAnz(st.s1), xa = Math.min(x0, x1), xb = Math.max(x0, x1), b = st.s1 - st.s0;
        linie(xa, y(zKette), xb, y(zKette), "#111", 1);
        linie(xa, y(zKette) - 4 / ppm, xa, y(zKette) + 4 / ppm, "#111", 1);
        linie(xb, y(zKette) - 4 / ppm, xb, y(zKette) + 4 / ppm, "#111", 1);
        if (b * ppm > 26) text((xa + xb) / 2, y(zKette) - 4 / ppm, b * ppm > 80 ? `${namen[st.kat]} ${zahl(b, 2)} m` : `${zahl(b, 2)}`, { anker: "middle", klein: true });
      }
    }
    if (sEl.wasser.checked) {
      for (const w of D.wasser) {
        const x0 = D.xAnz(w.s0), x1 = D.xAnz(w.s1), xa = Math.min(x0, x1), xb = Math.max(x0, x1), b = w.s1 - w.s0;
        linie(xa, y(zKette), xb, y(zKette), "#2f7fc0", 1.5);
        linie(xa, y(zKette) - 4 / ppm, xa, y(zKette) + 4 / ppm, "#2f7fc0", 1.5);
        linie(xb, y(zKette) - 4 / ppm, xb, y(zKette) + 4 / ppm, "#2f7fc0", 1.5);
        if (b * ppm > 26) text((xa + xb) / 2, y(zKette) - 4 / ppm, b * ppm > 90 ? `Wasser ${w.geschaetzt ? "ca. " : ""}${zahl(b, 1)} m` : `${zahl(b, 1)}`, { anker: "middle", klein: true, farbe: "#1f5f94" });
      }
    }
    linie(0, y(zGesamt), D.L, y(zGesamt), "#111", 1);
    linie(0, y(zGesamt) - 4 / ppm, 0, y(zGesamt) + 4 / ppm, "#111", 1);
    linie(D.L, y(zGesamt) - 4 / ppm, D.L, y(zGesamt) + 4 / ppm, "#111", 1);
    text(D.L / 2, y(zGesamt) - 4 / ppm, `Länge ${zahl(D.L, 2)} m`, { anker: "middle", fett: true });
    // Teilung entlang der Linie
    const sSchritt = [1, 2, 5, 10, 20, 50, 100].find((s2) => s2 * ppm >= 60) || 200;
    for (let s = 0; s <= D.L + 1e-6; s += sSchritt) {
      const x = D.xAnz(s);
      linie(x, y(zGesamt) + 3 / ppm, x, y(zGesamt) + 8 / ppm, "#111", 1);
      text(x, y(zGesamt) + 20 / ppm, `${zahl(s)}`, { anker: "middle", klein: true, farbe: "#555" });
    }
    // Geländehöhen an Anfang und Ende (Blick nach links: A links, B rechts)
    const hoeheRand = (s, xAnker) => text(D.xAnz(s), y(D.gelaende[Math.min(D.gelaende.length - 1, Math.round(s / Math.max(0.25, D.L / 2000)))][1]) + 16 / ppm,
      `${zahl(D.gelaende[Math.min(D.gelaende.length - 1, Math.round(s / Math.max(0.25, D.L / 2000)))][1], 2)} m`, { anker: xAnker, klein: true, farbe: "#444" });
    hoeheRand(0, D.seite > 0 ? "start" : "end");
    hoeheRand(D.L, D.seite > 0 ? "end" : "start");
    // Gebäudehöhen
    if (schnittModus === "schnitt") {
      for (const g of D.geschnitten) {
        const x = D.xAnz(g.sMitte);
        const h = g.firstZ - g.fussZ;
        text(x, y(g.firstZ) - 5 / ppm, `${zahl(g.firstZ, 2)} m NHN`, { anker: "middle", klein: true });
        text(x, y(g.firstZ) - 5 / ppm - fk * 1.25, `Höhe ${zahl(h, 1)} m${g.ersatz ? " (geschätzt)" : ""}`, { anker: "middle", fett: true, klein: true });
      }
    }
  }
  // Beschriftung der Enden
  text(D.xAnz(0), y(D.zOben + 1.3), "A", { anker: "middle", fett: true });
  text(D.xAnz(D.L), y(D.zOben + 1.3), "B", { anker: "middle", fett: true });
  if (sEl.grenzen.checked && mass) for (const s of D.grenzen) text(D.xAnz(s), y(D.zOben + 1) + 12 / ppm, "Grenze", { anker: "middle", klein: true, farbe: "#2a9bd6" });

  // Tiefenskala unten links: so weit hinter der Schnittebene reicht die Ansicht, dunkel = nah, hell = fern
  if (schnittModus === "ansicht" || sEl.dahinter.checked) {
    const bw = 120 / ppm, bh = 9 / ppm, tx = vb.x + 12 / ppm, ty = vb.y + vb.h - 34 / ppm;
    t.push(`<rect x="${fmt(tx)}" y="${fmt(ty)}" width="${fmt(bw)}" height="${fmt(bh)}" fill="url(#s-tiefe)" stroke="#555" stroke-width="0.8" vector-effect="non-scaling-stroke"/>`);
    text(tx, ty - 4 / ppm, `Tiefe hinter der ${schnittModus === "schnitt" ? "Schnittebene" : "Linie"}`, { klein: true, fett: true });
    text(tx, ty + bh + 12 / ppm, "0 m", { klein: true });
    text(tx + bw, ty + bh + 12 / ppm, `${zahl(D.tiefe)} m`, { klein: true, anker: "end" });
  }
  // Maßstabsbalken unten rechts im Ausschnitt
  const balken = [1, 2, 5, 10, 20, 50, 100].find((m) => m * ppm >= 70) || 200;
  const bx = vb.x + vb.w - balken - 12 / ppm, by = vb.y + vb.h - 14 / ppm;
  linie(bx, by, bx + balken, by, "#111", 2.5);
  text(bx + balken / 2, by - 5 / ppm, `${balken} m`, { anker: "middle", klein: true, fett: true });
  return t.join("");
}

function zeichneSchnitt() {
  if (!schnittDaten) { schnittSvg.innerHTML = ""; return; }
  const D = schnittDaten;
  if (!schnittBlick) {
    const rand = Math.max(3, D.L * 0.04);
    const hoehe = D.zOben + 3 - (D.zMin - 3.2);
    const breite = D.L + 2 * rand;
    const verh = schnittSvg.clientWidth / Math.max(1, schnittSvg.clientHeight);
    // gesamte Zeichnung einpassen, 1:1 (keine Überhöhung)
    let w = breite, h = hoehe + 2 * rand * 0.6;
    if (w / h < verh) w = h * verh; else h = w / verh;
    schnittBlick = { x: D.L / 2 - w / 2, y: -(D.zOben + 3 + rand * 0.3) + (h - (hoehe + rand * 0.6)) * -0.5, w, h };
    schnittBlick.y = -((D.zOben + 3) + (h - hoehe) / 2);
  }
  schnittSvg.setAttribute("viewBox", `${fmt(schnittBlick.x)} ${fmt(schnittBlick.y)} ${fmt(schnittBlick.w)} ${fmt(schnittBlick.h)}`);
  schnittSvg.innerHTML =
    `<defs><pattern id="s-erde" width="0.8" height="0.8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="0.8" height="0.8" fill="#f1ece1"/>` +
    `<line x1="0" y1="0" x2="0" y2="0.8" stroke="#b9ae97" stroke-width="0.07"/></pattern>` +
    `<linearGradient id="s-wasser" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6aaedb" stop-opacity="0.95"/><stop offset="1" stop-color="#6aaedb" stop-opacity="0"/></linearGradient>` +
    `<linearGradient id="s-tiefe"x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${grau(0)}"/><stop offset="1" stop-color="${grau(1)}"/></linearGradient></defs>` +
    `<rect x="-100000" y="-100000" width="200000" height="200000" fill="#fff"/>` +
    `<g id="s-geo">${baueSchnittSvg(D)}</g><g id="s-text"></g>`;
  zeichneSchnittText();
}

function zeichneSchnittText() {
  const g = document.getElementById("s-text");
  if (!g || !schnittDaten) return;
  g.innerHTML = baueSchnittText(schnittDaten, schnittBlick, schnittSvg.clientWidth || 800);
}

function setzeBlick() {
  schnittSvg.setAttribute("viewBox", `${fmt(schnittBlick.x)} ${fmt(schnittBlick.y)} ${fmt(schnittBlick.w)} ${fmt(schnittBlick.h)}`);
  zeichneSchnittText();
}

// Zoomen mit dem Mausrad, verschieben durch Ziehen
schnittSvg.addEventListener("wheel", (e) => {
  if (!schnittBlick) return;
  e.preventDefault();
  const r = schnittSvg.getBoundingClientRect();
  const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
  const faktor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
  const w = schnittBlick.w * faktor, h = schnittBlick.h * faktor;
  schnittBlick = { x: schnittBlick.x + (schnittBlick.w - w) * fx, y: schnittBlick.y + (schnittBlick.h - h) * fy, w, h };
  setzeBlick();
}, { passive: false });
let schnittZiehPunkt = null;
schnittSvg.addEventListener("pointerdown", (e) => { schnittZiehPunkt = { x: e.clientX, y: e.clientY }; schnittSvg.setPointerCapture(e.pointerId); });
schnittSvg.addEventListener("pointermove", (e) => {
  if (!schnittZiehPunkt || !schnittBlick) return;
  const r = schnittSvg.getBoundingClientRect();
  schnittBlick = { ...schnittBlick, x: schnittBlick.x - ((e.clientX - schnittZiehPunkt.x) / r.width) * schnittBlick.w, y: schnittBlick.y - ((e.clientY - schnittZiehPunkt.y) / r.height) * schnittBlick.h };
  schnittZiehPunkt = { x: e.clientX, y: e.clientY };
  setzeBlick();
});
const schnittLoslassen = () => { schnittZiehPunkt = null; };
schnittSvg.addEventListener("pointerup", schnittLoslassen);
schnittSvg.addEventListener("pointercancel", schnittLoslassen);

// ---------- 5. Steuerung ----------
function schnittHinweisSetzen(text) {
  schnittHinweis.textContent = text || "";
  schnittHinweis.hidden = !text;
}

function schnittNeuRechnen() {
  schnittBlick = null;
  setzeSchnittLinieKarte(schnittLinie);
  const t0 = performance.now();
  schnittDaten = rechneSchnitt();
  if (!schnittDaten) {
    schnittSvg.innerHTML = "";
    schnittInfo.textContent = "";
    schnittHinweisSetzen(datenVorhanden ? "Ziehe eine Linie auf der Karte, dann entsteht hier die Zeichnung." : "Klicke zuerst links auf „Analysieren“, dann kannst du eine Linie ziehen.");
    return;
  }
  const D = schnittDaten;
  const hinweise = [];
  if (!D.hatGelaende) hinweise.push("Es gibt keine Höhendaten (nur Niedersachsen): das Gelände ist flach angenommen.");
  if (!lod2Vorhanden) hinweise.push("Ohne LoD2 sind die Gebäude Blöcke aus OpenStreetMap mit geschätzter Höhe.");
  if (schnittModus === "schnitt" && !D.geschnitten.length) hinweise.push("Die Linie schneidet kein Gebäude.");
  schnittHinweisSetzen(hinweise.join(" "));
  const zahlSchnitt = D.geschnitten.length;
  schnittInfo.textContent = `Länge ${zahl(D.L, 1)} m · Tiefe ${zahl(D.tiefe)} m · Gelände ${zahl(D.zMin, 1)} bis ${zahl(D.zMax, 1)} m NHN · ${zahl(zahlSchnitt)} Gebäude, ${zahl(D.baeume.length)} Bäume, ${zahl(D.wasser.length)} Gewässer`;
  zeichneSchnitt();
  console.info(`Schnitt: gerechnet in ${Math.round(performance.now() - t0)} ms, ${D.ansicht.length} Flächen in Blickrichtung, ${D.geschnitten.length} Gebäude geschnitten`);
}

// Wird am Ende von wendeAnsichtAn() aufgerufen
function aktualisiereSchnitt() {
  const aktiv = aktuelleAnsicht === "schnitt";
  schnittPanel.hidden = !aktiv;
  if (kartenBereit) {
    for (const id of SCHNITT_EBENEN) map.setLayoutProperty(id, "visibility", aktiv && schnittLinie ? "visible" : "none");
    // Die Zeichnung deckt den unteren Teil der Karte ab: Karte entsprechend nach oben rücken
    const gewollt = aktiv ? Math.round(schnittPanel.clientHeight) : 0;
    if (gewollt !== schnittPaddingGesetzt) { schnittPaddingGesetzt = gewollt; map.easeTo({ padding: { bottom: gewollt, top: 0, left: 0, right: 0 }, duration: 0 }); }
  }
  if (!aktiv) { if (schnittZeichnen) schnittModusZeichnen(false); return; }
  sEl.neu.disabled = !datenVorhanden;
  if (!schnittLinie) {
    schnittHinweisSetzen(datenVorhanden ? "Klicke auf „Linie ziehen“ und ziehe die Linie über die Karte (z. B. quer durch eine Straße)." : "Klicke zuerst links auf „Analysieren“, dann kannst du eine Linie ziehen.");
    return;
  }
  const stand = [lod2Gebaeude.length, osmFeatures.length, alkisFlaechen.length, flurstuecke.length, gelaende ? gelaende.min : -1].join("|");
  if (stand !== schnittStand) { schnittStand = stand; schnittNeuRechnen(); }
}

sEl.neu.addEventListener("click", () => schnittModusZeichnen(!schnittZeichnen));
for (const el of [sEl.seite, sEl.tiefe]) el.addEventListener("change", () => { if (schnittLinie) schnittNeuRechnen(); });
for (const el of [sEl.strasse, sEl.grenzen, sEl.mass, sEl.dahinter, sEl.baeume, sEl.wasser, sEl.gelaende]) el.addEventListener("change", () => { if (schnittDaten) zeichneSchnitt(); });
sEl.fit.addEventListener("click", () => { schnittBlick = null; zeichneSchnitt(); });
document.querySelectorAll("#schnitt-umschalter button").forEach((b) => b.addEventListener("click", () => {
  schnittModus = b.dataset.modus;
  document.querySelectorAll("#schnitt-umschalter button").forEach((x) => x.classList.toggle("is-active", x === b));
  sEl.dahinter.closest("label").hidden = schnittModus !== "schnitt";
  if (schnittDaten) zeichneSchnitt();
}));
window.addEventListener("resize", () => { if (aktuelleAnsicht === "schnitt" && schnittDaten) { schnittBlick = null; zeichneSchnitt(); } });

function verwerfeSchnitt() {
  schnittLinie = null; schnittDaten = null; schnittStand = ""; schnittBlick = null; schnittGebCache = { stand: "", liste: [] };
  if (schnittZeichnen) schnittModusZeichnen(false);
  schnittSvg.innerHTML = ""; schnittInfo.textContent = ""; schnittHinweisSetzen("");
  sEl.neu.textContent = "Linie ziehen";
  if (typeof kartenBereit !== "undefined" && kartenBereit) map.getSource("schnitt").setData(leer);
  schnittPanel.hidden = true;
}

// ---------- 6. Legende (wird von legende.js benutzt) ----------
function schnittLegendeEintraege() {
  const e = [`<li><span class="sw sw-linie" style="background:${FARBE.flst.auswahl};height:3px"></span><span>Schnittlinie (A weiß, B schwarz), Pfeil = Blickrichtung</span></li>`,
    `<li><span class="sw" style="background:rgba(226,72,45,0.14);border:1px dashed ${FARBE.flst.auswahl}"></span><span>Band = Tiefe der Ansicht hinter der Linie</span></li>`];
  return e.join("");
}
function schnittEckdaten() {
  const D = schnittDaten;
  if (!D) return [];
  return [["Länge", `${zahl(D.L, 1)} m`], ["Gelände", `${zahl(D.zMin, 1)} bis ${zahl(D.zMax, 1)} m NHN`], ["Gebäude geschnitten", zahl(D.geschnitten.length)]];
}

// ---------- 7. DXF-Export ----------
// DXF im Format AutoCAD R12 (AC1009): Linien, Polylinien und Text, 1 Einheit = 1 m. X = Abstand entlang der Linie (in Blickrichtung
// von links nach rechts), Y = Höhe über NHN. Keine Füllungen oder Schraffuren. Umlaute werden umschrieben (R12 kennt kein Unicode).
const dxfTxt = (s) => String(s).replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss").replace(/[^\x20-\x7e]/g, "?");
const dxfZ = (x) => (Math.round(x * 1000) / 1000).toFixed(3);

function baueDxf(D) {
  const ebenen = {
    GELAENDE: 7, GEBAEUDE_SCHNITT: 1, STRASSE_FAHRBAHN: 8, STRASSE_WEG: 40, STRASSE_PLATZ: 41, GRENZEN: 5,
    ANSICHT_NAH: 7, ANSICHT_MITTE: 8, ANSICHT_FERN: 9, BEMASSUNG: 3, BESCHRIFTUNG: 7,
    BAEUME: 3, WASSER: 5, GELAENDE_DAHINTER: 8
  };
  const e = [];
  const paar = (code, wert) => e.push(`${code}\n${wert}`);
  const linie = (l, x1, y1, x2, y2) => { paar(0, "LINE"); paar(8, l); paar(10, dxfZ(x1)); paar(20, dxfZ(y1)); paar(30, "0.0"); paar(11, dxfZ(x2)); paar(21, dxfZ(y2)); paar(31, "0.0"); };
  const poly = (l, pts, geschlossen) => {
    paar(0, "POLYLINE"); paar(8, l); paar(66, 1); paar(70, geschlossen ? 1 : 0);
    for (const [x, y] of pts) { paar(0, "VERTEX"); paar(8, l); paar(10, dxfZ(x)); paar(20, dxfZ(y)); paar(30, "0.0"); }
    paar(0, "SEQEND"); paar(8, l);
  };
  const text = (l, x, y, h, s) => { paar(0, "TEXT"); paar(8, l); paar(10, dxfZ(x)); paar(20, dxfZ(y)); paar(30, "0.0"); paar(40, dxfZ(h)); paar(1, dxfTxt(s)); };

  // Gelände
  poly("GELAENDE", D.gelaende.map(([s, z]) => [D.xAnz(s), z]).sort((p, q) => p[0] - q[0]), false);
  // Ansicht in Blickrichtung, nach Entfernung auf drei Ebenen verteilt (damit man die Strichstärken je Ebene wählen kann)
  const drittel = D.tiefe / 3;
  for (const f of D.ansicht) {
    const ebene = f.d < drittel ? "ANSICHT_NAH" : f.d < 2 * drittel ? "ANSICHT_MITTE" : "ANSICHT_FERN";
    poly(ebene, f.pts, true);
  }
  // Gelände dahinter (Höhenprofile in sechs Abständen)
  if (D.gelaendeHinten && sEl.gelaende.checked && (schnittModus === "ansicht" || sEl.dahinter.checked)) {
    for (const sch of D.gelaendeHinten.scheiben) {
      let lauf = [];
      const aus = () => { if (lauf.length > 1) poly("GELAENDE_DAHINTER", lauf.sort((p, q) => p[0] - q[0]), false); lauf = []; };
      for (const [s, z] of sch.pts) { if (z == null) aus(); else lauf.push([D.xAnz(s), z]); }
      aus();
    }
  }
  // Bäume: Stamm als Rechteck, Krone als Vieleck (Laubbaum Ellipse mit 24 Punkten, Nadelbaum Dreieck)
  if (sEl.baeume.checked) {
    for (const b of D.baeume) {
      const geschnitten = b.geschnitten && schnittModus === "schnitt";
      const x = D.xAnz(b.s), rx = geschnitten ? Math.sqrt(Math.max(0.04, b.r * b.r - b.d * b.d)) : b.r;
      const g = baumGeometrie(b, x, rx);
      poly("BAEUME", g.stamm, true);
      for (const k of g.kronen) poly("BAEUME", k.pts, true);
    }
  }
  // Wasserflächen an der Schnittebene (Tiefe unbekannt: 1,5 m darstellerisch)
  for (const w of D.wasser) {
    const punkte = D.gelaende.filter(([s]) => s >= w.s0 && s <= w.s1);
    if (!punkte.length) continue;
    const zW = Math.min(...punkte.map((p) => p[1]));
    const x0 = Math.min(D.xAnz(w.s0), D.xAnz(w.s1)), x1 = Math.max(D.xAnz(w.s0), D.xAnz(w.s1));
    poly("WASSER", [[x0, zW], [x1, zW], [x1, zW - 1.5], [x0, zW - 1.5]], true);
  }
  // Geschnittene Gebäude
  if (schnittModus === "schnitt") for (const g of D.geschnitten) for (const run of g.runs) poly("GEBAEUDE_SCHNITT", run.map(([s, z]) => [D.xAnz(s), z]), true);
  // Straßenflächen entlang des Geländes
  const namen = { strasse: "STRASSE_FAHRBAHN", weg: "STRASSE_WEG", platz: "STRASSE_PLATZ" };
  for (const st of D.strassen) {
    const punkte = D.gelaende.filter(([s]) => s >= st.s0 && s <= st.s1).map(([s, z]) => [D.xAnz(s), z]).sort((p, q) => p[0] - q[0]);
    if (punkte.length >= 2) poly(namen[st.kat], punkte, false);
  }
  // Flurstücksgrenzen
  for (const s of D.grenzen) linie("GRENZEN", D.xAnz(s), D.zMin - 3, D.xAnz(s), D.zOben + 1);
  // Bemaßung und Beschriftung (Text 0,5 m hoch)
  const zKette = D.zMin - 1.2;
  const bezeichnung = { strasse: "Fahrbahn", weg: "Weg", platz: "Platz" };
  for (const st of D.strassen) {
    const x0 = Math.min(D.xAnz(st.s0), D.xAnz(st.s1)), x1 = Math.max(D.xAnz(st.s0), D.xAnz(st.s1));
    linie("BEMASSUNG", x0, zKette, x1, zKette); linie("BEMASSUNG", x0, zKette - 0.2, x0, zKette + 0.2); linie("BEMASSUNG", x1, zKette - 0.2, x1, zKette + 0.2);
    text("BEMASSUNG", (x0 + x1) / 2 - 1, zKette + 0.3, 0.5, `${bezeichnung[st.kat]} ${zahl(st.s1 - st.s0, 2)} m`);
  }
  linie("BEMASSUNG", 0, D.zMin - 2.4, D.L, D.zMin - 2.4);
  text("BEMASSUNG", D.L / 2 - 4, D.zMin - 2.1, 0.6, `Laenge ${zahl(D.L, 2)} m`);
  if (schnittModus === "schnitt") for (const g of D.geschnitten) text("BESCHRIFTUNG", D.xAnz(g.sMitte) - 3, g.firstZ + 0.5, 0.5, `${zahl(g.firstZ, 2)} m NHN, Hoehe ${zahl(g.firstZ - g.fussZ, 1)} m${g.ersatz ? " (geschaetzt)" : ""}`);
  text("BESCHRIFTUNG", 0, D.zOben + 2.5, 0.6, `${schnittModus === "schnitt" ? "Schnitt" : "Strassenansicht"} A-B, Blick nach ${D.seite > 0 ? "links" : "rechts"}, Laenge ${zahl(D.L, 2)} m`);
  text("BESCHRIFTUNG", 0, D.zOben + 1.7, 0.4, `A: E ${zahl(schnittLinie.a[0], 1)} N ${zahl(schnittLinie.a[1], 1)}  B: E ${zahl(schnittLinie.b[0], 1)} N ${zahl(schnittLinie.b[1], 1)} (ETRS89 UTM 32, EPSG:25832)`);
  text("BESCHRIFTUNG", 0, D.zMin - 3.6, 0.4, "Einheit Meter. X = Abstand entlang der Linie, Y = Hoehe ueber NHN. Quellen: LGLN LoD2 und DGM1 (CC BY 4.0), (c) OpenStreetMap-Mitwirkende (ODbL). Nicht vermessungsgenau.");

  const kopf = ["0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC",
    `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLTYPE\n70\n1\n0\nLTYPE\n2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0.0\n0\nENDTAB\n` +
    `0\nTABLE\n2\nLAYER\n70\n${Object.keys(ebenen).length}\n` +
    Object.entries(ebenen).map(([n, farbe]) => `0\nLAYER\n2\n${n}\n70\n0\n62\n${farbe}\n6\nCONTINUOUS`).join("\n") + `\n0\nENDTAB\n0\nENDSEC`,
    "0\nSECTION\n2\nENTITIES"];
  return kopf.join("\n") + "\n" + e.join("\n") + "\n0\nENDSEC\n0\nEOF\n";
}

sEl.dxf.addEventListener("click", () => {
  if (!schnittDaten) return;
  const inhalt = baueDxf(schnittDaten);
  const blob = new Blob([inhalt], { type: "application/dxf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ortsanalyse-${schnittModus === "schnitt" ? "schnitt" : "ansicht"}.dxf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
