/* ============================================================
   Ortsanalyse – 3D-Modell (three.js)
   - LoD2-Gebäude mit echten Dachformen (Wände weiß, Dächer hellgrau)
   - Ersatz-Klötze aus OSM, wo keine LoD2-Daten vorliegen (Geschosse × 3 m)
   - Einzelbäume aus OSM als Stamm und Krone
   Maus: linke Taste drehen, rechte Taste verschieben, Rad zoomen.
   ============================================================ */

const DREID_FARBEN = {
  hintergrund: 0xffffff, boden: 0xf4f4f2, wand: 0xf7f7f5, dach: 0xc9c6c1,
  ersatz: 0xeac3b9, kante: 0x8c8c8c, krone: 0x9fbf8f, stamm: 0x7d6e5d, akzent: 0xe2482d
};

let dreid = null; // { renderer, scene, camera, controls, gruppe }

function dreidStarten() {
  if (dreid) return dreid;
  const box = document.getElementById("dreid");
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(DREID_FARBEN.hintergrund);
  box.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
  camera.up.set(0, 0, 1); // z zeigt nach oben (wie im CAD)
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49; // nicht unter den Boden schauen
  controls.screenSpacePanning = false;

  // Licht: Himmel + Sonne von Nordwesten (passend zum Lageplan)
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d8d8, 0.75));
  const sonne = new THREE.DirectionalLight(0xffffff, 0.55);
  sonne.position.set(-1, 1, 1.4);
  scene.add(sonne);

  const gruppe = new THREE.Group();
  scene.add(gruppe);

  function groesse() {
    const b = box.clientWidth, h = box.clientHeight;
    if (!b || !h) return;
    renderer.setSize(b, h, false);
    camera.aspect = b / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(groesse).observe(box);
  groesse();
  (function schleife() {
    requestAnimationFrame(schleife);
    if (!box.offsetParent) return; // unsichtbar: nicht rechnen
    controls.update();
    renderer.render(scene, camera);
  })();

  dreid = { renderer, scene, camera, controls, gruppe };
  return dreid;
}

// Eine ebene Fläche (Ring + Löcher, Punkte [x,y,z]) in Dreiecke zerlegen
function flaecheInDreiecke(ringe, ziel) {
  const n = normale(ringe[0]);
  // Auf die Ebene projizieren, in der die Fläche am größten erscheint
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  const proj = az >= ax && az >= ay ? (p) => new THREE.Vector2(p[0], p[1])
    : ax >= ay ? (p) => new THREE.Vector2(p[1], p[2]) : (p) => new THREE.Vector2(p[0], p[2]);
  const aussen = ringe[0], loecher = ringe.slice(1).filter((r) => r.length >= 3);
  let dreiecke;
  try {
    dreiecke = THREE.ShapeUtils.triangulateShape(aussen.map(proj), loecher.map((r) => r.map(proj)));
  } catch (e) { return; }
  const alle = aussen.concat(...loecher);
  for (const [a, b, c] of dreiecke) {
    for (const i of [a, b, c]) ziel.push(alle[i][0], alle[i][1], alle[i][2]);
  }
}

function geometrieAus(punkte) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(punkte, 3));
  g.computeVertexNormals(); // nicht indiziert = jede Fläche eben schattiert
  return g;
}

function leeren(gruppe) {
  while (gruppe.children.length) {
    const o = gruppe.children.pop();
    o.geometry && o.geometry.dispose();
    if (o.material) { o.material.map && o.material.map.dispose(); o.material.dispose(); }
  }
}

// Grün, Wasser, Straßen und Plätze als Bild malen, das auf Gelände bzw. Boden gelegt wird (Textur).
// So liegen sie genau auf dem Gelände. rahmen = [minX, minY, maxX, maxY] in Metern.
function bodenTextur(plan, lokal, [minX, minY, maxX, maxY], renderer) {
  const B = 2048, H = Math.round(2048 * (maxY - minY) / (maxX - minX)) || 2048;
  const leinwand = document.createElement("canvas");
  leinwand.width = B; leinwand.height = H;
  const ctx = leinwand.getContext("2d");
  const proMeter = B / (maxX - minX);
  const px = ([lon, lat]) => {
    const [x, y] = lokal(...gradZuUtm(lon, lat));
    return [(x - minX) * proMeter, (maxY - y) * proMeter];
  };
  ctx.fillStyle = "#ecebe6";
  ctx.fillRect(0, 0, B, H);
  const flaeche = (f, farbe, rand) => {
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const poly of polys) {
      ctx.beginPath();
      for (const ring of poly) ring.forEach((p, i) => { const [x, y] = px(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.fillStyle = farbe; ctx.fill("evenodd");
      if (rand) { ctx.strokeStyle = rand; ctx.lineWidth = 1; ctx.stroke(); }
    }
  };
  const linie = (f, farbe, breiteM, strich) => {
    const g = f.geometry;
    const linien = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
    ctx.strokeStyle = farbe; ctx.lineWidth = Math.max(1, breiteM * proMeter);
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.setLineDash(strich || []);
    for (const l of linien) { ctx.beginPath(); l.forEach((p, i) => { const [x, y] = px(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); }
    ctx.setLineDash([]);
  };
  const gruenFarbe = { wiese: "#dfe8d6", park: "#c9d9bd", wald: "#a6c098", wasser: "#c3d3dc" };
  for (const kat of ["wiese", "park", "wald", "wasser"]) plan.gruen.features.filter((f) => f.properties.kategorie === kat).forEach((f) => flaeche(f, gruenFarbe[kat]));
  plan.wasserLinien.features.forEach((f) => linie(f, "#c3d3dc", f.properties.breite));
  plan.verkehrsflaechen.features.forEach((f) => flaeche(f, "#dcdcd8", "#b4b4b0"));
  plan.bahn.features.forEach((f) => f.properties.art === "bahnflaeche" ? flaeche(f, "#dcdcd8") : linie(f, "#8a8a8a", 1.4, [12, 6]));
  // Straßen: erst der Rand (etwas breiter), dann die Fläche, wie im Lageplan
  const autos = plan.strassen.features.filter((f) => f.properties.breite >= 5);
  autos.forEach((f) => linie(f, "#a8a8a4", f.properties.breite * 0.75 + 0.8));
  autos.forEach((f) => linie(f, "#d4d4d0", f.properties.breite * 0.75));
  plan.strassen.features.filter((f) => f.properties.breite < 5).forEach((f) => linie(f, "#c2c2be", 1.6));
  const textur = new THREE.CanvasTexture(leinwand);
  textur.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return textur;
}

// Baut die Szene neu. Koordinaten: Meter, x = Ost, y = Nord, z = Höhe.
// ursprung = [Ost, Nord] in UTM 32 (Mitte des Gebiets)
function zeichne3D({ bbox, lod2, lod2Daten, osmGebaeude, baeume, plan, quelleText }) {
  const d = dreidStarten();
  leeren(d.gruppe);
  document.getElementById("dreid-leer").hidden = true;
  const [w, s, o, n] = bbox;
  const ecken = [[w, s], [o, s], [o, n], [w, n]].map(([lon, lat]) => gradZuUtm(lon, lat));
  const mitte = gradZuUtm((w + o) / 2, (s + n) / 2);
  const lokal = (e, nn) => [e - mitte[0], nn - mitte[1]];
  const eckenLokal = ecken.map(([e, nn]) => lokal(e, nn));
  const minX = Math.min(...eckenLokal.map((p) => p[0])), maxX = Math.max(...eckenLokal.map((p) => p[0]));
  const minY = Math.min(...eckenLokal.map((p) => p[1])), maxY = Math.max(...eckenLokal.map((p) => p[1]));

  // Bodenbild mit Grün, Wasser, Straßen und Plätzen; Bildkoordinaten (UV) aus der Lage im Gebiet
  const textur = plan ? bodenTextur(plan, lokal, [minX, minY, maxX, maxY], d.renderer) : null;
  const bodenMaterial = new THREE.MeshLambertMaterial({ color: textur ? 0xffffff : 0xecebe6, map: textur, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
  const mitUV = (geo) => {
    const pos = geo.attributes.position, uv = [];
    for (let i = 0; i < pos.count; i++) uv.push((pos.getX(i) - minX) / (maxX - minX), (pos.getY(i) - minY) / (maxY - minY));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    return geo;
  };

  // Gelände (wenn vorhanden): Höhe an jedem Punkt, bezogen auf den tiefsten Geländepunkt (z0)
  const gelaende = lod2Daten && lod2Daten.gelaende;
  let hoehe = () => 0, z0 = 0, gelaendeSpanne = null;
  if (gelaende) {
    const [vx, vy] = lokal(lod2Daten.nullpunkt[0], lod2Daten.nullpunkt[1]);
    const g = gelaende;
    // tiefster und höchster Punkt (Schleife statt Math.min(...), weil das Raster sehr groß sein kann)
    let zMin = Infinity, zMax = -Infinity;
    for (const z of g.z) { if (z < zMin) zMin = z; if (z > zMax) zMax = z; }
    z0 = zMin / 10;
    gelaendeSpanne = [zMin / 10, zMax / 10];
    const zelle = (i, j) => g.z[Math.min(g.ny - 1, Math.max(0, j)) * g.nx + Math.min(g.nx - 1, Math.max(0, i))] / 10;
    hoehe = (x, y) => { // bilineare Interpolation im Raster
      const gx = Math.min(g.nx - 1.001, Math.max(0, (x - vx - g.x0) / g.dx));
      const gy = Math.min(g.ny - 1.001, Math.max(0, (y - vy - g.y0) / g.dy));
      const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
      const h = zelle(i, j) * (1 - fx) * (1 - fy) + zelle(i + 1, j) * fx * (1 - fy)
        + zelle(i, j + 1) * (1 - fx) * fy + zelle(i + 1, j + 1) * fx * fy;
      return h - z0;
    };
    // Geländefläche als Dreiecksnetz, genau auf das Gebiet zugeschnitten
    const schritte = (a, b, start, d) => {
      const werte = [a];
      for (let v = start + Math.ceil((a - start) / d) * d; v < b; v += d) if (v > a) werte.push(v);
      werte.push(b);
      return werte;
    };
    const xs = schritte(minX, maxX, vx + g.x0, g.dx), ys = schritte(minY, maxY, vy + g.y0, g.dy);
    const punkte = [], index = [];
    for (const y of ys) for (const x of xs) punkte.push(x, y, hoehe(x, y));
    for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
      const a = j * xs.length + i, b = a + 1, c = a + xs.length, dd = c + 1;
      index.push(a, b, dd, a, dd, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(punkte, 3));
    geo.setIndex(index);
    geo.computeVertexNormals();
    d.gruppe.add(new THREE.Mesh(mitUV(geo), bodenMaterial));
  } else {
    // Ohne Geländedaten: flacher Boden
    const bodenForm = new THREE.Shape(eckenLokal.map((p) => new THREE.Vector2(...p)));
    const boden = new THREE.Mesh(mitUV(new THREE.ShapeGeometry(bodenForm)), bodenMaterial);
    boden.position.z = -0.05;
    d.gruppe.add(boden);
  }

  // Roter Gebietsrahmen, auf das Gelände gelegt (alle 10 m ein Punkt)
  const rahmenPunkte = [];
  eckenLokal.forEach((p, i) => {
    const q = eckenLokal[(i + 1) % 4];
    const teile = Math.max(1, Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / 10));
    for (let k = 0; k <= teile; k++) {
      const x = p[0] + (q[0] - p[0]) * k / teile, y = p[1] + (q[1] - p[1]) * k / teile;
      rahmenPunkte.push(new THREE.Vector3(x, y, hoehe(x, y) + 0.3));
    }
  });
  d.gruppe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rahmenPunkte),
    new THREE.LineBasicMaterial({ color: DREID_FARBEN.akzent })));

  // LoD2-Gebäude: Wände und Dächer getrennt sammeln (mit Gelände: auf echter Höhe über NHN)
  const waende = [], daecher = [];
  if (lod2) {
    const [dx, dy] = lokal(lod2Daten.nullpunkt[0], lod2Daten.nullpunkt[1]);
    for (const g of lod2) {
      const dz = gelaende ? g.basis - z0 : 0;
      for (const f of g.flaechen) {
        const ringe = f.ringe.map((r) => r.map(([x, y, z]) => [x + dx, y + dy, z + dz]));
        flaecheInDreiecke(ringe, f.typ === "R" ? daecher : waende);
      }
    }
  }

  // Ersatz-Klötze aus OSM (nur wo keine LoD2-Kachel vorliegt)
  const ersatz = [];
  let ersatzAnzahl = 0;
  for (const f of osmGebaeude) {
    const mittelpunkt = turf.centroid(f).geometry.coordinates;
    if (lod2Daten && inLod2Abdeckung(lod2Daten, ...mittelpunkt)) continue;
    const klotzHoehe = f.properties.art === "neben" ? 3 : f.properties.geschosse * 3;
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      const ringe = poly.map((r) => r.slice(0, -1).map(([lon, lat]) => lokal(...gradZuUtm(lon, lat))));
      if (ringe[0].length < 3) continue;
      const boden = Math.min(...ringe[0].map((p) => hoehe(...p))); // tiefster Geländepunkt unter dem Klotz
      const form = new THREE.Shape(ringe[0].map((p) => new THREE.Vector2(...p)));
      form.holes = ringe.slice(1).map((r) => new THREE.Path(r.map((p) => new THREE.Vector2(...p))));
      const geo = new THREE.ExtrudeGeometry(form, { depth: klotzHoehe, bevelEnabled: false });
      const pos = geo.toNonIndexed().attributes.position.array;
      for (let i = 0; i < pos.length; i++) ersatz.push(i % 3 === 2 ? pos[i] + boden : pos[i]);
      geo.dispose();
    }
    ersatzAnzahl++;
  }

  const kantenMat = new THREE.LineBasicMaterial({ color: DREID_FARBEN.kante, transparent: true, opacity: 0.45 });
  const versatz = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
  for (const [punkte, farbe] of [[waende, DREID_FARBEN.wand], [daecher, DREID_FARBEN.dach], [ersatz, DREID_FARBEN.ersatz]]) {
    if (!punkte.length) continue;
    const geo = geometrieAus(punkte);
    d.gruppe.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: farbe, side: THREE.DoubleSide, ...versatz })));
    d.gruppe.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), kantenMat.clone()));
  }

  // Bäume: Stamm (Zylinder) und Krone (Kugel), als „Instanzen“ für gute Geschwindigkeit
  const liste = baeume.features;
  if (liste.length) {
    const stammGeo = new THREE.CylinderGeometry(0.25, 0.3, 1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    const kroneGeo = new THREE.IcosahedronGeometry(1, 1);
    const staemme = new THREE.InstancedMesh(stammGeo, new THREE.MeshLambertMaterial({ color: DREID_FARBEN.stamm }), liste.length);
    const kronen = new THREE.InstancedMesh(kroneGeo, new THREE.MeshLambertMaterial({ color: DREID_FARBEN.krone, transparent: true, opacity: 0.88 }), liste.length);
    const m = new THREE.Matrix4();
    liste.forEach((b, i) => {
      const [x, y] = lokal(...gradZuUtm(...b.geometry.coordinates));
      const r = Math.min(8, Math.max(2, b.properties.kronenradius));
      const h = Math.max(6, r * 2.4); // Baumhöhe grob aus der Krone geschätzt
      const z = hoehe(x, y);          // Geländehöhe am Stamm
      staemme.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, h - r)));
      kronen.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z + h - r), new THREE.Quaternion(), new THREE.Vector3(r, r, r * 0.9)));
    });
    d.gruppe.add(staemme, kronen);
  }

  // Nordpfeil auf dem Boden, am Nordrand des Gebiets
  const nordY = Math.max(...ecken.map(([e, nn]) => lokal(e, nn)[1])) + 25;
  const pfeil = new THREE.Shape([new THREE.Vector2(0, 18), new THREE.Vector2(7, -6), new THREE.Vector2(0, 0), new THREE.Vector2(-7, -6)]);
  const nord = new THREE.Mesh(new THREE.ShapeGeometry(pfeil), new THREE.MeshBasicMaterial({ color: DREID_FARBEN.akzent }));
  nord.position.set(0, nordY, hoehe(0, nordY) + 0.1);
  d.gruppe.add(nord);

  // Kamera: schräg von Südwesten auf die Mitte
  const groesse = Math.max(...ecken.map(([e, nn]) => Math.hypot(...lokal(e, nn)))) * 2;
  d.controls.target.set(0, 0, 0);
  d.camera.position.set(-groesse * 0.38, -groesse * 0.52, groesse * 0.4);
  d.controls.maxDistance = groesse * 3;
  d.controls.update();
  d.startAnsicht = d.camera.position.clone();

  // Legende
  const lod2Anzahl = lod2 ? lod2.filter((g) => g.quelle === "citygml").length : 0;
  const topoAnzahl = lod2 ? lod2.filter((g) => g.quelle === "topoexport").length : 0;
  document.getElementById("dreid-legende").innerHTML = `
    <h3>3D-Modell</h3>
    <ul>
      ${lod2Anzahl ? `<li><span class="lz lz-flaeche" style="background:#c9c6c1"></span><span>Gebäude LoD2 aus CityGML, echte Dachformen (${fmt(lod2Anzahl)})</span></li>` : ""}
      ${topoAnzahl ? `<li><span class="lz lz-flaeche" style="background:#c9c6c1"></span><span>Gebäudeteile LoD2 aus topoexport, Westrand (${fmt(topoAnzahl)})</span></li>` : ""}
      ${ersatzAnzahl ? `<li><span class="lz lz-flaeche" style="background:#eac3b9"></span><span>Ersatz aus OSM, Geschosse × 3 m (${fmt(ersatzAnzahl)})</span></li>` : ""}
      ${plan ? `<li><span class="lz lz-flaeche" style="background:linear-gradient(90deg,#c9d9bd 0 50%,#d4d4d0 50%)"></span><span>Grün, Wasser, Straßen und Plätze auf dem Boden</span></li>` : ""}
      ${liste.length ? `<li><span class="lz lz-kreis"></span><span>Einzelbaum, Höhe geschätzt (${fmt(liste.length)})</span></li>` : ""}
      ${gelaende ? `<li><span class="lz lz-flaeche" style="background:#ecebe6"></span><span>Gelände (${gelaende.dx < 5 ? "DGM1, LGLN bzw. Geobasis NRW" : "LGLN über topoexport"}), ${fmt(gelaendeSpanne[0], 1)} bis ${fmt(gelaendeSpanne[1], 1)} m ü. NHN, nicht überhöht</span></li>`
        : `<li><span class="lz lz-flaeche" style="background:#f4f4f2"></span><span>Boden flach (keine Geländedaten)</span></li>`}
    </ul>
    <p class="legende-hilfe">Ziehen: drehen · Rechte Maustaste: verschieben · Rad: zoomen</p>
    <button class="btn btn-klein" id="dreid-zurueck">Ansicht zurücksetzen</button>
    <p class="legende-quelle">${quelleText}</p>`;
  document.getElementById("dreid-zurueck").addEventListener("click", () => {
    d.camera.position.copy(d.startAnsicht);
    d.controls.target.set(0, 0, 0);
    d.controls.update();
  });
}
