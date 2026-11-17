/* ============================================================
   Ortsanalyse – Schnitt mit Ansicht (Reiter „Schnitt“)
   Linie im Plan ziehen, Blickrichtung wählen, Tiefe einstellen. Daraus entsteht ein Geländeschnitt:
   - geschnitten (schwarz): Gelände und Gebäude genau auf der Linie
   - Ansicht (grau, je weiter weg desto heller): Gebäudeflächen, Bäume und Gelände dahinter
   Gebäude: LoD2 (echte Dächer), sonst OSM-Grundriss × Geschosse × 3 m. Gelände: DGM, sonst eben.
   Bäume: OSM-Standort und Kronengröße, Höhe grob geschätzt (wie im 3D-Modell).
   Alles in echten Metern, Höhe und Länge im gleichen Maßstab (unverzerrt).
   ============================================================ */

const schnitt = {
  a: null, b: null,     // Endpunkte der Linie [lon, lat]
  seite: 1,             // Blickrichtung: 1 = rechts der Linie A→B, -1 = links
  tiefe: 50,            // wie weit hinter die Linie geschaut wird (m)
  zeichnen: false,      // wartet auf Klicks im Plan
  erster: null,         // erster Klick beim Zeichnen
  cache: null,          // vorbereitete 3D-Daten der aktuellen Analyse
  marker: [],           // Beschriftungen A und A′ im Plan
  bbox: null
};

// ---------- Daten einmal je Analyse vorbereiten (alles in UTM 32, Höhen in m ü. NHN) ----------
function schnittDaten() {
  const erg = analyseErgebnis;
  if (!erg) return null;
  if (schnitt.cache && schnitt.cache.erg === erg) return schnitt.cache;
  const { daten, lod2, lod2Daten } = erg;
  const [e0, n0] = lod2Daten ? lod2Daten.nullpunkt : [0, 0];

  // Geländehöhe an einem Punkt: aus dem Höhenraster (bilinear), sonst eben
  const g = lod2Daten && lod2Daten.gelaende;
  let boden;
  if (g) {
    const zelle = (i, j) => g.z[Math.min(g.ny - 1, Math.max(0, j)) * g.nx + Math.min(g.nx - 1, Math.max(0, i))] / 10;
    boden = (E, N) => {
      const gx = Math.min(g.nx - 1.001, Math.max(0, (E - e0 - g.x0) / g.dx));
      const gy = Math.min(g.ny - 1.001, Math.max(0, (N - n0 - g.y0) / g.dy));
      const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
      return zelle(i, j) * (1 - fx) * (1 - fy) + zelle(i + 1, j) * fx * (1 - fy) + zelle(i, j + 1) * (1 - fx) * fy + zelle(i + 1, j + 1) * fx * fy;
    };
  } else {
    // ohne Gelände: Höhe der Gebäudesockel (Median), sonst 0
    const basen = lod2.map((b) => b.basis).filter(Number.isFinite).sort((x, y) => x - y);
    const eben = basen.length ? basen[Math.floor(basen.length / 2)] : 0;
    boden = () => eben;
  }

  const gebaeude = [];
  const neuesGebaeude = (art) => ({ art, flaechen: [], daecher: [], box: [Infinity, Infinity, -Infinity, -Infinity] });
  const erweitere = (geb, ring) => {
    for (const [E, N] of ring) {
      geb.box[0] = Math.min(geb.box[0], E); geb.box[1] = Math.min(geb.box[1], N);
      geb.box[2] = Math.max(geb.box[2], E); geb.box[3] = Math.max(geb.box[3], N);
    }
  };
  // LoD2: Wände und Dächer mit echter Höhe
  for (const b of lod2) {
    const geb = neuesGebaeude("lod2");
    geb.unten = b.basis;
    for (const f of b.flaechen) {
      if (f.typ !== "R" && f.typ !== "W") continue;
      const ringe = f.ringe.map((r) => r.map(([x, y, z]) => [e0 + x, n0 + y, b.basis + z]));
      if (ringe[0].length < 3) continue;
      const n = normale(ringe[0]);
      geb.flaechen.push({ typ: f.typ, ring: ringe[0] });
      erweitere(geb, ringe[0]);
      if (f.typ === "R" && Math.abs(n[2]) > 0.05) geb.daecher.push({ ringe, n, p: ringe[0][0] });
    }
    if (geb.flaechen.length) gebaeude.push(geb);
  }
  // Ersatz aus OSM (nur wo keine LoD2-Daten vorliegen): Klotz mit Flachdach
  let ersatz = 0;
  for (const f of daten.gebaeude.features) {
    const mitte = turf.centroid(f).geometry.coordinates;
    if (lod2Daten && inLod2Abdeckung(lod2Daten, ...mitte)) continue;
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      const ringe2 = poly.map((r) => r.slice(0, -1).map(([lon, lat]) => gradZuUtm(lon, lat)));
      if (ringe2[0].length < 3) continue;
      const unten = Math.min(...ringe2[0].map(([E, N]) => boden(E, N)));
      const oben = unten + (f.properties.art === "neben" ? 3 : f.properties.geschosse * 3);
      const geb = neuesGebaeude("osm");
      geb.unten = unten;
      const r = ringe2[0];
      for (let i = 0; i < r.length; i++) {
        const p = r[i], q = r[(i + 1) % r.length];
        geb.flaechen.push({ typ: "W", ring: [[p[0], p[1], unten], [q[0], q[1], unten], [q[0], q[1], oben], [p[0], p[1], oben]] });
      }
      const dach = ringe2.map((ring) => ring.map(([E, N]) => [E, N, oben]));
      geb.flaechen.push({ typ: "R", ring: dach[0] });
      geb.daecher.push({ ringe: dach, n: [0, 0, 1], p: dach[0][0] });
      erweitere(geb, r);
      gebaeude.push(geb);
    }
    ersatz++;
  }
  // Bäume: Höhe aus der Krone geschätzt (wie im 3D-Modell)
  const baeume = daten.baeume.features.map((b, i) => {
    const [E, N] = gradZuUtm(...b.geometry.coordinates);
    const r = Math.min(8, Math.max(2, b.properties.kronenradius || 3));
    return { E, N, r, h: Math.max(6, r * 2.4), z: boden(E, N), saat: i + 1 };
  });
  // Mini-Lageplan: OSM-Grundrisse in UTM
  const grundrisse = daten.gebaeude.features.flatMap((f) =>
    (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates)
      .map((poly) => poly[0].map(([lon, lat]) => gradZuUtm(lon, lat))));
  schnitt.cache = { erg, boden, gebaeude, baeume, grundrisse, mitGelaende: !!g, mitLod2: lod2.length > 0, ersatz,
    nhn: !!g || lod2.length > 0 };
  return schnitt.cache;
}

// ---------- Hilfsfunktionen ----------
function imRing(x, y, ring) {
  let drin = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) drin = !drin;
  }
  return drin;
}

// Polygon an einer Ebene abschneiden (Sutherland-Hodgman); Punkte [s, t, z]
function kappe(punkte, achse, grenze, behalteGroesser) {
  const aus = [];
  for (let i = 0; i < punkte.length; i++) {
    const p = punkte[i], q = punkte[(i + 1) % punkte.length];
    const pDrin = behalteGroesser ? p[achse] >= grenze : p[achse] <= grenze;
    const qDrin = behalteGroesser ? q[achse] >= grenze : q[achse] <= grenze;
    if (pDrin) aus.push(p);
    if (pDrin !== qDrin) {
      const f = (grenze - p[achse]) / (q[achse] - p[achse]);
      aus.push([p[0] + f * (q[0] - p[0]), p[1] + f * (q[1] - p[1]), p[2] + f * (q[2] - p[2])]);
    }
  }
  return aus;
}

// Gleichmäßiger Zufall aus einer Zahl (gleicher Baum = gleiche Form)
const zufall = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };

const HIMMELSRICHTUNGEN = ["Osten", "Nordosten", "Norden", "Nordwesten", "Westen", "Südwesten", "Süden", "Südosten"];
const richtungName = ([x, y]) => HIMMELSRICHTUNGEN[(Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8];

// ---------- Geometrie der Linie ----------
function schnittAchsen() {
  const A = gradZuUtm(...schnitt.a), B = gradZuUtm(...schnitt.b);
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
  const n = [u[1] * schnitt.seite, -u[0] * schnitt.seite]; // Blickrichtung (senkrecht zur Linie)
  const st = (E, N) => [(E - A[0]) * u[0] + (N - A[1]) * u[1], (E - A[0]) * n[0] + (N - A[1]) * n[1]];
  const punkt = (s, t) => [A[0] + s * u[0] + t * n[0], A[1] + s * u[1] + t * n[1]];
  return { A, B, L, u, n, st, punkt };
}

// ---------- Schnitt berechnen ----------
function berechneSchnitt() {
  const c = schnittDaten();
  if (!c || !schnitt.a) return null;
  const { L, n, st, punkt } = schnittAchsen();
  const T = schnitt.tiefe;
  const elemente = []; // Ansicht: { tiefe, art, ... } – wird von hinten nach vorn gezeichnet
  const schnittFlaechen = []; // geschnittene Gebäude: Läufe [{ s0, s1, oben: [[s, z]], unten: [[s, z]] }]

  const schritt = Math.min(1, Math.max(0.2, L / 2500));
  for (const geb of c.gebaeude) {
    // Lage des Gebäudes im Schnitt-System (alle Punkte)
    let sMin = Infinity, sMax = -Infinity, tMin = Infinity, tMax = -Infinity;
    const umgerechnet = geb.flaechen.map((f) => f.ring.map(([E, N, z]) => {
      const [s, t] = st(E, N);
      if (s < sMin) sMin = s; if (s > sMax) sMax = s; if (t < tMin) tMin = t; if (t > tMax) tMax = t;
      return [s, t, z];
    }));
    if (sMax < 0 || sMin > L || tMax < 0 || tMin > T) continue;

    // Ansicht: Flächen hinter der Linie, im Streifen 0…L und 0…Tiefe
    umgerechnet.forEach((pts, i) => {
      let p = kappe(pts, 1, 0, true);
      if (p.length >= 3) p = kappe(p, 1, T, false);
      if (p.length >= 3) p = kappe(p, 0, 0, true);
      if (p.length >= 3) p = kappe(p, 0, L, false);
      if (p.length < 3) return;
      const tiefe = p.reduce((a, q) => a + q[1], 0) / p.length;
      elemente.push({ art: "flaeche", typ: geb.flaechen[i].typ, punkte: p.map(([s, , z]) => [s, z]), tiefe });
    });

    // Schnitt: Gebäude, die die Linie kreuzen. Senkrecht abtasten: Oberkante = höchstes Dach über dem Punkt.
    if (tMin > 0 || tMax < 0) continue;
    let lauf = null;
    const s0 = Math.max(0, Math.ceil(sMin / schritt) * schritt), s1 = Math.min(L, sMax);
    for (let s = s0; s <= s1 + 1e-9; s += schritt) {
      const [E, N] = punkt(s, 0);
      let oben = -Infinity;
      if (E >= geb.box[0] && E <= geb.box[2] && N >= geb.box[1] && N <= geb.box[3]) {
        for (const d of geb.daecher) {
          if (!imRing(E, N, d.ringe[0]) || d.ringe.slice(1).some((loch) => imRing(E, N, loch))) continue;
          const z = d.p[2] - (d.n[0] * (E - d.p[0]) + d.n[1] * (N - d.p[1])) / d.n[2];
          if (z > oben) oben = z;
        }
      }
      if (oben > -Infinity) {
        const unten = Math.min(geb.unten, c.boden(E, N));
        if (!lauf) { lauf = { oben: [], unten: [] }; schnittFlaechen.push(lauf); }
        lauf.oben.push([s, oben]); lauf.unten.push([s, unten]);
      } else lauf = null;
    }
  }

  // Bäume (Ansicht und geschnitten, wenn die Krone die Linie berührt)
  for (const b of c.baeume) {
    const [s, t] = st(b.E, b.N);
    if (t < -b.r || t > T || s < -b.r || s > L + b.r) continue;
    elemente.push({ art: "baum", s, z: b.z, r: b.r, h: b.h, saat: b.saat, tiefe: Math.max(0, t), geschnitten: Math.abs(t) <= b.r });
  }

  // Gelände: Profil auf der Linie und höchste Linie dahinter (Horizont im Blickbereich)
  const gSchritt = Math.max(0.5, L / 600), tSchritt = Math.max(2, T / 25);
  const profil = [], horizont = [];
  for (let s = 0; s <= L + 1e-9; s += gSchritt) {
    const [E, N] = punkt(s, 0);
    const z = c.boden(E, N);
    profil.push([s, z]);
    let h = z;
    if (c.mitGelaende) for (let t = tSchritt; t <= T + 1e-9; t += tSchritt) h = Math.max(h, c.boden(...punkt(s, t)));
    horizont.push([s, h]);
  }
  if (profil[profil.length - 1][0] < L) { const [E, N] = punkt(L, 0); profil.push([L, c.boden(E, N)]); horizont.push([L, profil[profil.length - 1][1]]); }

  elemente.sort((x, y) => y.tiefe - x.tiefe);
  return { L, T, n, profil, horizont, elemente, schnittFlaechen, c };
}

// ---------- Zeichnen (SVG in Pixeln, Höhe und Länge im gleichen Maßstab) ----------
const SCHNITT_RAND = { links: 64, rechts: 18, oben: 30, unten: 46 };

function zeichneSchnitt() {
  const ziel = document.getElementById("schnitt-zeichnung");
  const titel = document.getElementById("schnitt-titel");
  if (!ziel) return;
  const erg = berechneSchnitt();
  if (!erg) {
    ziel.innerHTML = `<p class="schnitt-leer">Klicke in der Legende auf „Linie ziehen“ und dann zweimal in den Plan (Anfang und Ende der Schnittlinie).</p>`;
    titel.textContent = "Schnitt";
    return;
  }
  if (ziel.clientWidth < 50 || ziel.clientHeight < 50) return;
  ziel.innerHTML = schnittSvg(erg, { W: ziel.clientWidth, H: ziel.clientHeight }).svg;
  titel.textContent = schnittTitel(erg);
  zeichneSchnittLage();
}

const schnittTitel = (erg) => `Schnitt A–A′ · ${fmt(erg.L)} m lang · Blick nach ${richtungName(erg.n)} · Tiefe ${fmt(erg.T)} m`;

// SVG des Schnitts. vorgabe = { W, H } (in die Fläche einpassen) oder { k } (fester Maßstab: Pixel je Meter, für den Export)
function schnittSvg(erg, vorgabe) {
  const { L, T, profil, horizont, elemente, schnittFlaechen, c } = erg;

  // Höhenbereich
  let zMin = Math.min(...profil.map((p) => p[1])), zMax = Math.max(...horizont.map((p) => p[1]));
  for (const e of elemente) {
    if (e.art === "flaeche") for (const [, z] of e.punkte) zMax = Math.max(zMax, z);
    else zMax = Math.max(zMax, e.z + e.h);
  }
  for (const l of schnittFlaechen) for (const [, z] of l.oben) zMax = Math.max(zMax, z);
  const sockel = Math.floor(zMin) - 4; // Unterkante des geschnittenen Geländes
  zMax = Math.ceil(zMax) + 3;
  const R = SCHNITT_RAND;
  const k = vorgabe.k || Math.min((vorgabe.W - R.links - R.rechts) / L, (vorgabe.H - R.oben - R.unten) / (zMax - sockel)); // Pixel je Meter
  const W = vorgabe.k ? Math.ceil(R.links + R.rechts + L * k) : vorgabe.W;
  const H = vorgabe.k ? Math.ceil(R.oben + R.unten + (zMax - sockel) * k) : vorgabe.H;
  const X = (s) => R.links + s * k, Y = (z) => R.oben + (zMax - z) * k;
  const pfad = (pts) => pts.map(([s, z], i) => `${i ? "L" : "M"}${X(s).toFixed(1)},${Y(z).toFixed(1)}`).join("") + "Z";
  const unterkante = Y(sockel);

  const teile = [];
  // Gelände dahinter (Horizont), hellgrau
  if (c.mitGelaende) teile.push(`<path d="${pfad([[0, sockel], ...horizont, [L, sockel]])}" fill="#ebebe8" stroke="#c8c8c5" stroke-width="0.6"/>`);

  // Ansicht von hinten nach vorn
  for (const e of elemente) {
    const f = Math.min(1, Math.max(0, e.tiefe / T)); // 0 = vorn, 1 = hinten
    if (e.art === "flaeche") {
      const ton = Math.round((e.typ === "R" ? 160 : 196) + f * (e.typ === "R" ? 80 : 50));
      const linie = Math.round(60 + f * 130);
      teile.push(`<path d="${pfad(e.punkte)}" fill="rgb(${ton},${ton},${ton - 2})" stroke="rgb(${linie},${linie},${linie})" stroke-width="${(0.7 - f * 0.35).toFixed(2)}" stroke-linejoin="round"/>`);
    } else teile.push(baumSvg(e, X, Y, k, f));
  }

  // Geschnitten: Gelände und Gebäude schwarz
  teile.push(`<path d="${pfad([[0, sockel], ...profil, [L, sockel]])}" fill="#111"/>`);
  const beschriftung = [];
  for (const l of schnittFlaechen) {
    teile.push(`<path d="${pfad([...l.oben, ...l.unten.slice().reverse()])}" fill="#111" stroke="#111" stroke-width="0.6"/>`);
    // Höhen: First (höchster Punkt) und Traufe (tiefste Oberkante am Rand), nur bei breiteren Gebäuden
    const breite = l.oben[l.oben.length - 1][0] - l.oben[0][0];
    if (breite * k < 18) continue;
    const first = l.oben.reduce((a, p) => (p[1] > a[1] ? p : a));
    const traufe = Math.min(l.oben[0][1], l.oben[l.oben.length - 1][1]);
    beschriftung.push({ s: first[0], z: first[1], traufe: first[1] - traufe > 1 ? traufe : null });
  }

  // Höhenmaße der geschnittenen Gebäude (nicht zu dicht nebeneinander)
  const hoeheText = (z) => {
    const r = Math.round(z * 10) / 10 || 0; // „-0“ vermeiden
    return `${c.nhn ? (r > 0 ? "+" : r < 0 ? "−" : "±") : r < 0 ? "−" : ""}${fmt(Math.abs(r), 1)}`;
  };
  let letztesX = -Infinity;
  for (const b of beschriftung.sort((a, x) => a.s - x.s)) {
    const x = X(b.s);
    if (x - letztesX < 58) continue;
    letztesX = x;
    const y = Y(b.z);
    teile.push(`<path d="M${x - 4},${y - 8}L${x + 4},${y - 8}L${x},${y - 2}Z" fill="#fff" stroke="#111" stroke-width="0.8"/>`
      + `<text x="${x + 6}" y="${y - 4}" class="sz-text">${hoeheText(b.z)}</text>`);
    if (b.traufe != null && (Y(b.traufe) - y) > 14) teile.push(`<text x="${x + 6}" y="${Y(b.traufe) - 3}" class="sz-text sz-klein">Traufe ${hoeheText(b.traufe)}</text>`);
  }

  // Höhenskala links
  const schritte = [1, 2, 5, 10, 20, 50, 100];
  const hs = schritte.find((v) => v * k >= 26) || 100;
  const skala = [`<line x1="${R.links - 10}" y1="${Y(zMax)}" x2="${R.links - 10}" y2="${unterkante}" stroke="#111" stroke-width="0.8"/>`];
  for (let z = Math.ceil(sockel / hs) * hs; z <= zMax; z += hs) {
    skala.push(`<line x1="${R.links - 14}" y1="${Y(z)}" x2="${R.links - 10}" y2="${Y(z)}" stroke="#111" stroke-width="0.8"/>`
      + `<text x="${R.links - 17}" y="${Y(z) + 3.5}" class="sz-text" text-anchor="end">${hoeheText(z)}</text>`);
  }
  skala.push(`<text x="4" y="${R.oben - 12}" class="sz-text sz-klein">${c.nhn ? "m ü. NHN" : "m"}</text>`);

  // Maßstabsleiste unten links
  const laengen = [5, 10, 20, 50, 100, 200, 500];
  const ml = laengen.find((v) => v * k >= 80) || 500;
  const mx = R.links, my = Math.min(H - 16, unterkante + 24), mb = ml * k;
  const leiste = `<rect x="${mx}" y="${my - 5}" width="${mb / 2}" height="5" fill="#111"/><rect x="${mx + mb / 2}" y="${my - 5}" width="${mb / 2}" height="5" fill="#fff" stroke="#111" stroke-width="0.8"/>`
    + `<rect x="${mx}" y="${my - 5}" width="${mb}" height="5" fill="none" stroke="#111" stroke-width="0.8"/>`
    + `<text x="${mx}" y="${my + 10}" class="sz-text sz-klein">0</text><text x="${mx + mb / 2}" y="${my + 10}" class="sz-text sz-klein" text-anchor="middle">${fmt(ml / 2)}</text>`
    + `<text x="${mx + mb}" y="${my + 10}" class="sz-text sz-klein" text-anchor="middle">${fmt(ml)} m</text>`;

  // A und A′ an den Enden
  const ende = `<text x="${X(0)}" y="${R.oben - 12}" class="sz-text sz-fett" text-anchor="middle">A</text>`
    + `<text x="${X(L)}" y="${R.oben - 12}" class="sz-text sz-fett" text-anchor="middle">A′</text>`
    + `<line x1="${X(0)}" y1="${R.oben - 8}" x2="${X(0)}" y2="${unterkante}" stroke="${PLAN_FARBEN.akzent}" stroke-width="0.8" stroke-dasharray="6 2 1 2"/>`
    + `<line x1="${X(L)}" y1="${R.oben - 8}" x2="${X(L)}" y2="${unterkante}" stroke="${PLAN_FARBEN.akzent}" stroke-width="0.8" stroke-dasharray="6 2 1 2"/>`;

  // Schriften direkt im SVG festlegen (damit auch das exportierte Bild stimmt)
  const stil = `<style>.sz-text{font:10px Heros,Helvetica,Arial,sans-serif;fill:#111}.sz-klein{font-size:9px;fill:#555}
    .sz-fett{font:700 12px Heros,Helvetica,Arial,sans-serif;fill:${PLAN_FARBEN.akzent}}</style>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" class="schnitt-svg">${stil}
    <defs><clipPath id="sz-streifen"><rect x="${X(0)}" y="0" width="${X(L) - X(0)}" height="${H}"/></clipPath></defs>
    <rect width="${W}" height="${H}" fill="#fff"/><g clip-path="url(#sz-streifen)">${teile.join("")}</g>${skala.join("")}${leiste}${ende}</svg>`;
  return { svg, W, H };
}

// Baum als lockere Silhouette: unregelmäßiger Kronenrand, Stamm mit zwei Ästen
function baumSvg(b, X, Y, k, f) {
  const cx = X(b.s), mitteZ = b.z + b.h - b.r;
  const rx = b.r * k, ry = b.r * 0.95 * k, cy = Y(mitteZ);
  const p1 = zufall(b.saat) * 6.28, p2 = zufall(b.saat * 3.1) * 6.28, p3 = zufall(b.saat * 7.7) * 6.28;
  const pkt = [];
  const anzahl = 40;
  for (let i = 0; i <= anzahl; i++) {
    const w = (i / anzahl) * Math.PI * 2;
    const m = 1 + 0.08 * Math.sin(5 * w + p1) + 0.06 * Math.sin(9 * w + p2) + 0.04 * Math.sin(14 * w + p3);
    pkt.push(`${(cx + Math.cos(w) * rx * m).toFixed(1)},${(cy - Math.sin(w) * ry * m).toFixed(1)}`);
  }
  const fuss = Y(b.z), ansatz = Y(mitteZ - b.r * 0.55);
  const farbe = b.geschnitten ? "#1a1a1a" : `rgb(${Math.round(70 + f * 120)},${Math.round(85 + f * 110)},${Math.round(65 + f * 120)})`;
  const breite = b.geschnitten ? 1.1 : 0.9 - f * 0.4;
  const ast = (dx, dy) => `M${cx},${ansatz}Q${cx + dx * 0.3},${ansatz - dy * 0.6} ${cx + dx},${ansatz - dy}`;
  return `<g class="sz-baum">`
    + `<polygon points="${pkt.join(" ")}" fill="rgba(255,255,255,${(0.8 - f * 0.3).toFixed(2)})" stroke="${farbe}" stroke-width="${breite.toFixed(2)}" stroke-linejoin="round"/>`
    + `<path d="M${cx},${fuss}L${cx},${ansatz}${ast(rx * 0.45, ry * 0.55)}${ast(-rx * 0.4, ry * 0.45)}" fill="none" stroke="${farbe}" stroke-width="${(breite * 1.2).toFixed(2)}" stroke-linecap="round"/>`
    + `</g>`;
}

// Kleiner Lageplan: Grundrisse, Schnittlinie mit Blickpfeilen, Blickbereich
function zeichneSchnittLage() {
  const ziel = document.getElementById("schnitt-lage");
  const c = schnittDaten();
  // (auf schmalen Bildschirmen ist der Lageplan ausgeblendet: Breite 0)
  if (!ziel || !c || !schnitt.a || ziel.clientWidth < 40) { if (ziel) ziel.innerHTML = ""; return; }
  ziel.innerHTML = `${schnittLageSvg(ziel.clientWidth - 8)}<p class="schnitt-lage-text">Lage im Plan · Norden oben</p>`;
}

// Mini-Lageplan als SVG (Breite in Pixeln), auch für den Export
function schnittLageSvg(B) {
  const c = schnittDaten();
  const [w, s, o, n] = analyseErgebnis.bbox;
  const ecken = [[w, s], [o, s], [o, n], [w, n]].map(([lon, lat]) => gradZuUtm(lon, lat));
  const eMin = Math.min(...ecken.map((p) => p[0])), eMax = Math.max(...ecken.map((p) => p[0]));
  const nMin = Math.min(...ecken.map((p) => p[1])), nMax = Math.max(...ecken.map((p) => p[1]));
  const m = B / Math.max(eMax - eMin, nMax - nMin);
  const Hh = (nMax - nMin) * m;
  const px = ([E, N]) => `${((E - eMin) * m).toFixed(1)},${((nMax - N) * m).toFixed(1)}`;
  const { A, B: Bp, L, n: blick, punkt } = schnittAchsen();
  const grund = c.grundrisse.map((r) => `<polygon points="${r.map(px).join(" ")}"/>`).join("");
  const bereich = [punkt(0, 0), punkt(L, 0), punkt(L, schnitt.tiefe), punkt(0, schnitt.tiefe)];
  const pl = Math.max(12, L * 0.08);
  const pfeil = (p) => {
    const q = [p[0] + blick[0] * pl, p[1] + blick[1] * pl];
    return `<line x1="${px(p).split(",")[0]}" y1="${px(p).split(",")[1]}" x2="${px(q).split(",")[0]}" y2="${px(q).split(",")[1]}" marker-end="url(#sz-pfeil)"/>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${B}" height="${Hh}" viewBox="0 0 ${B} ${Hh}">
    <defs><marker id="sz-pfeil" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto">
      <path d="M0,0L10,5L0,10Z" fill="${PLAN_FARBEN.akzent}"/></marker></defs>
    <rect width="${B}" height="${Hh}" fill="#fff" stroke="#111" stroke-width="0.8"/>
    <g fill="#c9c9c6">${grund}</g>
    <polygon points="${bereich.map(px).join(" ")}" fill="${PLAN_FARBEN.akzent}" fill-opacity="0.12"/>
    <g stroke="${PLAN_FARBEN.akzent}" stroke-width="1.6">
      <line x1="${px(A).split(",")[0]}" y1="${px(A).split(",")[1]}" x2="${px(Bp).split(",")[0]}" y2="${px(Bp).split(",")[1]}" stroke-dasharray="6 2 1 2"/>
      ${pfeil(A)}${pfeil(Bp)}
    </g>
  </svg>`;
}

// ---------- Linie im Plan ----------
// Standard: waagerechte Linie durch die Mitte des Gebiets, Blick nach Norden
function schnittVoreinstellen(bbox) {
  const [w, s, o, n] = bbox;
  const gleich = schnitt.bbox && schnitt.bbox.every((v, i) => v === bbox[i]);
  schnitt.bbox = bbox;
  schnitt.cache = null;
  if (gleich && schnitt.a) return;
  const y = (s + n) / 2, rand = (o - w) * 0.1;
  schnitt.a = [w + rand, y];
  schnitt.b = [o - rand, y];
  schnitt.seite = -1; // links von West→Ost = Norden
  const [e1, n1] = gradZuUtm(w, s), [e2, n2] = gradZuUtm(o, n);
  schnitt.tiefe = Math.min(50, Math.round(Math.hypot(e2 - e1, n2 - n1) / 2));
}

// Linie, Blickbereich und Pfeile als GeoJSON für die Planansicht
function schnittPlanDaten(vorschauEnde) {
  if (!schnitt.a) return leereSammlung;
  const b = vorschauEnde || schnitt.b;
  if (!b) return leereSammlung;
  const grad = (p) => utmZuGrad(p[0], p[1]);
  const A = gradZuUtm(...schnitt.a), B = gradZuUtm(...b);
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  if (L < 1) return leereSammlung;
  const features = [turf.lineString([schnitt.a, b], { teil: "linie" })];
  if (!vorschauEnde) {
    const u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
    const n = [u[1] * schnitt.seite, -u[0] * schnitt.seite];
    const T = schnitt.tiefe, pl = Math.max(12, Math.min(40, L * 0.08));
    const p = (P, s, t) => [P[0] + s * u[0] + t * n[0], P[1] + s * u[1] + t * n[1]];
    features.push(turf.polygon([[A, B, p(B, 0, T), p(A, 0, T), A].map(grad)], { teil: "bereich" }));
    for (const P of [A, B]) {
      const spitze = p(P, 0, pl);
      features.push(turf.lineString([P, spitze].map(grad), { teil: "pfeil" }));
      features.push(turf.lineString([p(spitze, -pl * 0.25, -pl * 0.3), spitze, p(spitze, pl * 0.25, -pl * 0.3)].map(grad), { teil: "pfeil" }));
    }
  }
  return { type: "FeatureCollection", features };
}

function zeigeSchnittImPlan(vorschauEnde) {
  if (!planKarte || !planKarte.getSource("schnitt")) return;
  planKarte.getSource("schnitt").setData(schnittPlanDaten(vorschauEnde));
  schnitt.marker.forEach((m) => m.remove());
  schnitt.marker = [];
  if (aktuellerPlan !== "schnitt" || !schnitt.a) return;
  const ende = vorschauEnde || schnitt.b;
  [[schnitt.a, "A"], [ende, "A′"]].forEach(([p, text]) => {
    if (!p) return;
    const el = document.createElement("div");
    el.className = "schnitt-etikett";
    el.textContent = text;
    schnitt.marker.push(new maplibregl.Marker({ element: el, offset: [0, -14] }).setLngLat(p).addTo(planKarte));
  });
}

// Alles neu: Plan und Zeichnung
function aktualisiereSchnitt() {
  zeigeSchnittImPlan();
  zeichneSchnitt();
}

function starteSchnittZeichnen() {
  schnitt.zeichnen = true;
  schnitt.erster = null;
  planKarte.doubleClickZoom.disable();
  planKarte.getCanvas().style.cursor = "crosshair";
  zeigeLegende();
}

function beendeSchnittZeichnen() {
  schnitt.zeichnen = false;
  schnitt.erster = null;
  planKarte.doubleClickZoom.enable();
  planKarte.getCanvas().style.cursor = "";
}

// Klicks im Plan (einmal nach dem Anlegen der Planansicht)
function schnittAnmelden() {
  planKarte.on("click", (e) => {
    if (aktuellerPlan !== "schnitt" || !schnitt.zeichnen) return;
    const p = [e.lngLat.lng, e.lngLat.lat];
    if (!schnitt.erster) {
      schnitt.erster = p;
      schnitt.a = p; schnitt.b = null;
      zeigeSchnittImPlan(p);
      zeigeLegende(); // Knopf zeigt jetzt „Endpunkt A′ klicken …“
      return;
    }
    const A = gradZuUtm(...schnitt.erster), B = gradZuUtm(...p);
    if (Math.hypot(B[0] - A[0], B[1] - A[1]) < 10) return; // zu kurz
    schnitt.a = schnitt.erster; schnitt.b = p;
    beendeSchnittZeichnen();
    zeigeLegende();
    aktualisiereSchnitt();
  });
  planKarte.on("mousemove", (e) => {
    if (aktuellerPlan === "schnitt" && schnitt.zeichnen && schnitt.erster) zeigeSchnittImPlan([e.lngLat.lng, e.lngLat.lat]);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && schnitt.zeichnen) { beendeSchnittZeichnen(); schnittVoreinstellenFallsLeer(); zeigeLegende(); aktualisiereSchnitt(); }
  });
  // Zeichnung an die Größe anpassen
  const ziel = document.getElementById("schnitt-zeichnung");
  let warte = null;
  new ResizeObserver(() => {
    clearTimeout(warte);
    warte = setTimeout(() => { if (aktuellerPlan === "schnitt") zeichneSchnitt(); }, 120);
  }).observe(ziel);
}

// Nach abgebrochenem Zeichnen ohne zweite Ecke: wieder die Standardlinie
function schnittVoreinstellenFallsLeer() {
  if (!schnitt.b && schnitt.bbox) { const b = schnitt.bbox; schnitt.bbox = null; schnittVoreinstellen(b); }
}

// Bedienelemente in der Legende des Reiters „Schnitt“
function legendeSchnittHtml() {
  if (!analyseErgebnis) return "";
  const [w, s, o, n] = analyseErgebnis.bbox;
  const [e1, n1] = gradZuUtm(w, s), [e2, n2] = gradZuUtm(o, n);
  const maxT = Math.max(20, Math.round(Math.hypot(e2 - e1, n2 - n1) / 10) * 10);
  const c = schnittDaten();
  return `<div class="schnitt-knoepfe">
      <button class="btn btn-klein ${schnitt.zeichnen ? "" : "btn-ghost"}" id="schnitt-zeichnen">${schnitt.zeichnen ? (schnitt.erster ? "Endpunkt A′ klicken …" : "Anfang A klicken …") : "Linie ziehen"}</button>
      <button class="btn btn-klein btn-ghost" id="schnitt-drehen" ${schnitt.b ? "" : "disabled"}>Blickrichtung umdrehen</button>
    </div>
    <label class="schnitt-regler">Tiefe der Ansicht <strong id="schnitt-tiefe-wert">${fmt(schnitt.tiefe)} m</strong>
      <input type="range" id="schnitt-tiefe" min="10" max="${maxT}" step="5" value="${Math.min(schnitt.tiefe, maxT)}"></label>
    <ul>
      <li><span class="lz lz-strich" style="border-color:${PLAN_FARBEN.akzent}"></span><span>Schnittlinie A–A′, Pfeile = Blickrichtung</span></li>
      <li><span class="lz lz-flaeche" style="background:${PLAN_FARBEN.akzent}1f"></span><span>Blickbereich (Tiefe der Ansicht)</span></li>
      <li><span class="lz lz-flaeche" style="background:#111"></span><span>Schnitt: Gelände und Gebäude auf der Linie</span></li>
      <li><span class="lz lz-flaeche" style="background:linear-gradient(90deg,#b4b4b2,#efefed)"></span><span>Ansicht: Gebäude dahinter, je weiter weg desto heller</span></li>
    </ul>
    <p class="legende-hilfe">${c ? [
      c.mitLod2 ? "Gebäude aus LoD2 (echte Dächer)" : "",
      c.ersatz ? `${fmt(c.ersatz)} Gebäude ohne LoD2 als Klotz (OSM-Geschosse × 3 m)` : "",
      c.mitGelaende ? "Gelände aus dem DGM" : "kein Geländemodell: ebener Boden (mit „Fehlende Daten laden“ ergänzen)",
      "Bäume aus OSM, Höhe aus der Kronengröße geschätzt"].filter(Boolean).join(" · ") : ""}. Esc bricht das Zeichnen ab.</p>`;
}

function schnittLegendeAnmelden(box) {
  const zeichnen = box.querySelector("#schnitt-zeichnen");
  if (!zeichnen) return;
  zeichnen.addEventListener("click", () => {
    if (schnitt.zeichnen) { beendeSchnittZeichnen(); schnittVoreinstellenFallsLeer(); zeigeLegende(); aktualisiereSchnitt(); }
    else starteSchnittZeichnen();
  });
  box.querySelector("#schnitt-drehen").addEventListener("click", () => { schnitt.seite *= -1; aktualisiereSchnitt(); });
  const regler = box.querySelector("#schnitt-tiefe");
  let warte = null;
  regler.addEventListener("input", () => {
    schnitt.tiefe = +regler.value;
    box.querySelector("#schnitt-tiefe-wert").textContent = `${fmt(schnitt.tiefe)} m`;
    zeigeSchnittImPlan();
    clearTimeout(warte);
    warte = setTimeout(zeichneSchnitt, 80);
  });
}
