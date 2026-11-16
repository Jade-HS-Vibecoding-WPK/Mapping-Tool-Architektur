/* ============================================================
   Ortsanalyse – 3D-Ansicht (three.js)

   Zeigt das gewählte Gebiet als drehbares 3D-Modell:
   - Gebäude aus den amtlichen LoD2-Daten mit echten Wänden und Dachflächen
   - Gebäude ohne LoD2 als Blöcke aus dem OpenStreetMap-Grundriss (Höhe = Geschosse mal 3 m), leicht bläulich
   - ein flacher Boden mit dem Lageplan als Bild (Straßen, Wege, Grün, Wasser)
   - Bäume als Stamm mit Krone in der Größe aus dem 2D-Plan

   Das Gelände ist flach angenommen. Alle Daten kommen aus app.js (osmFeatures, lod2Gebaeude, alkisFlaechen, baumFeatures).
   Koordinaten: Wir rechnen alles in Meter um den Mittelpunkt des Gebiets (UTM 32). In three.js zeigt X nach Osten,
   Y nach oben und -Z nach Norden.
   ============================================================ */

"use strict";

const D3_GESCHOSSHOEHE_M = 3;
const D3_FARBEN = {
  hintergrund: "#f6f5f2",
  wand: "#e8e6e1", dach: "#a9a39a",
  ersatzWand: "#d3d9df", ersatzDach: "#c2cbd3",
  stamm: "#6b5a46", krone: "#8fb67e", kroneNadel: "#6f9a7a"
};

const d3Buehne = document.getElementById("d3-buehne");
const d3Hinweis = document.getElementById("d3-hinweis");
const d3Info = document.getElementById("d3-info");
let d3 = null;   // { renderer, szene, kamera, steuerung, gruppe, stand, mass }

function d3ZeigeHinweis(text) {
  d3Hinweis.textContent = text;
  d3Hinweis.hidden = !text;
}

function d3Starte() {
  if (d3) return;
  if (typeof THREE === "undefined" || !THREE.OrbitControls) throw new Error("three.js konnte nicht geladen werden (Internetverbindung?)");
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });   // preserveDrawingBuffer: damit "Bild speichern" geht
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  d3Buehne.appendChild(renderer.domElement);

  const szene = new THREE.Scene();
  szene.background = new THREE.Color(D3_FARBEN.hintergrund);
  szene.add(new THREE.HemisphereLight(0xffffff, 0xb9b4a9, 0.85));
  const sonne = new THREE.DirectionalLight(0xffffff, 0.75);
  sonne.position.set(-300, 500, -300);   // Licht von Nordwesten, wie im 2D-Lageplan
  szene.add(sonne);

  const kamera = new THREE.PerspectiveCamera(40, 1, 1, 30000);
  const steuerung = new THREE.OrbitControls(kamera, renderer.domElement);
  steuerung.maxPolarAngle = Math.PI / 2 - 0.03;   // nicht unter den Boden schauen
  steuerung.addEventListener("change", d3Zeichne);

  d3 = { renderer, szene, kamera, steuerung, gruppe: null, stand: "", ausdehnung: 500 };
  new ResizeObserver(() => { d3PasseGroesseAn(); d3Zeichne(); }).observe(d3Buehne);

  document.getElementById("d3-reset").addEventListener("click", () => d3SetzeAnsicht("schraeg"));
  document.getElementById("d3-oben").addEventListener("click", () => d3SetzeAnsicht("oben"));
  document.getElementById("d3-baeume").addEventListener("change", (e) => { if (d3.baeume) d3.baeume.visible = e.target.checked; d3Zeichne(); });
  document.getElementById("d3-png").addEventListener("click", d3SpeichereBild);
}

function d3PasseGroesseAn() {
  if (!d3) return;
  const breite = d3Buehne.clientWidth, hoehe = d3Buehne.clientHeight;
  if (!breite || !hoehe) return;
  d3.renderer.setSize(breite, hoehe, false);
  d3.renderer.domElement.style.width = "100%";
  d3.renderer.domElement.style.height = "100%";
  d3.kamera.aspect = breite / hoehe;
  d3.kamera.updateProjectionMatrix();
}

function d3Zeichne() {
  if (d3) d3.renderer.render(d3.szene, d3.kamera);
}

function d3SetzeAnsicht(modus) {
  const D = d3.ausdehnung;
  d3.steuerung.target.set(0, 0, 0);
  if (modus === "oben") d3.kamera.position.set(0, D * 1.7, 1);
  else d3.kamera.position.set(0, D * 0.75, D * 0.85);
  d3.steuerung.update();
  d3Zeichne();
}

// ----- Aufräumen -----
function d3Raeume(gruppe) {
  gruppe.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (o.material.map) o.material.map.dispose();
      o.material.dispose();
    }
  });
}

// ----- Flächen in Dreiecke zerlegen -----
// Eine ebene Fläche im Raum (Wand, Dach) mit eventuellen Löchern: wir drücken sie auf die Ebene, in der sie am größten
// erscheint, zerlegen sie dort und heben die Dreiecke wieder in den Raum.
function d3Normale(punkte) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < punkte.length; i++) {
    const a = punkte[i], b = punkte[(i + 1) % punkte.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [Math.abs(nx), Math.abs(ny), Math.abs(nz)];
}
function d3OhneEndpunkt(flatRing) {
  const punkte = [];
  for (let i = 0; i + 2 < flatRing.length; i += 3) punkte.push([flatRing[i], flatRing[i + 1], flatRing[i + 2]]);
  const a = punkte[0], z = punkte[punkte.length - 1];
  if (punkte.length > 1 && a[0] === z[0] && a[1] === z[1] && a[2] === z[2]) punkte.pop();
  return punkte;
}
// ringe: [Außenring, Loch, Loch ...], jeder Ring als flache Liste [x, y, z, x, y, z ...] (UTM, Höhe über NHN)
function d3Triangulieren(ringe, ausgabe, umrechnen) {
  const aussen = d3OhneEndpunkt(ringe[0]);
  if (aussen.length < 3) return;
  const loecher = ringe.slice(1).map(d3OhneEndpunkt).filter((r) => r.length >= 3);
  const [ax, ay, az] = d3Normale(aussen);
  const weglassen = az >= ax && az >= ay ? 2 : ay >= ax ? 1 : 0;
  const auf2D = (p) => (weglassen === 2 ? new THREE.Vector2(p[0], p[1]) : weglassen === 1 ? new THREE.Vector2(p[0], p[2]) : new THREE.Vector2(p[1], p[2]));
  const alle = aussen.concat(...loecher);
  const dreiecke = THREE.ShapeUtils.triangulateShape(aussen.map(auf2D), loecher.map((l) => l.map(auf2D)));
  for (const t of dreiecke) {
    for (const index of t) ausgabe.push(...umrechnen(alle[index]));
  }
}

function d3Geometrie(positionen) {
  const geometrie = new THREE.BufferGeometry();
  geometrie.setAttribute("position", new THREE.Float32BufferAttribute(positionen, 3));
  geometrie.computeVertexNormals();
  return geometrie;
}
const d3Material = (farbe) => new THREE.MeshLambertMaterial({ color: farbe, side: THREE.DoubleSide });

// ----- Gebäude aus einem OSM-Grundriss als Block -----
function d3Block(polygon, hoehe, wandPos, dachPos, lokalXY) {
  const ringe = polygon.map((ring) => {
    const r = ring.map((p) => lokalXY(p));
    if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
    return r;
  }).filter((r) => r.length >= 3);
  if (!ringe.length) return;
  // Wände: je Kante ein Rechteck aus zwei Dreiecken
  for (const ring of ringe) {
    for (let i = 0; i < ring.length; i++) {
      const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % ring.length];
      wandPos.push(x0, 0, -y0, x1, 0, -y1, x1, hoehe, -y1,
                   x0, 0, -y0, x1, hoehe, -y1, x0, hoehe, -y0);
    }
  }
  // Dach: flach, in der Ebene zerlegt
  const aussen = ringe[0].map((p) => new THREE.Vector2(p[0], p[1]));
  const loecher = ringe.slice(1).map((r) => r.map((p) => new THREE.Vector2(p[0], p[1])));
  const alle = ringe[0].concat(...ringe.slice(1));
  for (const t of THREE.ShapeUtils.triangulateShape(aussen, loecher)) {
    for (const i of t) dachPos.push(alle[i][0], hoehe, -alle[i][1]);
  }
}

// ----- Boden mit dem Lageplan als Bild -----
function d3BodenMaterial(xmin, ymin, B, H, mass) {
  const leinwand = document.createElement("canvas");
  leinwand.width = Math.max(16, Math.round(B * mass));
  leinwand.height = Math.max(16, Math.round(H * mass));
  const ctx = leinwand.getContext("2d");
  ctx.fillStyle = "#eeece7";
  ctx.fillRect(0, 0, leinwand.width, leinwand.height);
  ctx.lineJoin = "round";
  const pt = (lonlat) => {
    const [x, y] = utmWandler.forward(lonlat);
    return [(x - xmin) * mass, (ymin + H - y) * mass];
  };
  const flaechen = (liste, farbe) => { ctx.fillStyle = farbe; liste.forEach((f) => zeichneFlaeche(ctx, pt, f.geometry)); };
  const osm = (kat) => osmFeatures.filter((f) => f.properties.kat === kat);
  const amtlich = (...arten) => alkisFlaechen.filter((f) => arten.includes(f.properties.kat));

  flaechen(osm("gruen").concat(amtlich("gehoelz", "wald")), "#cfe0c3");
  flaechen(osm("wasser"), "#bcd5e6");
  ctx.strokeStyle = "#bcd5e6";
  osm("wasserlinie").forEach((f) => { ctx.lineWidth = (WASSER_BREITE_SCHAETZUNG[f.properties.typ] || 2) * mass; zeichneLinie(ctx, pt, f.geometry); });
  if (alkisVorhanden) {
    flaechen(amtlich("strasse"), "#c4c4c4");
    flaechen(amtlich("weg"), "#e4e0d8");
    flaechen(amtlich("platz"), "#ece8e0");
  } else {
    ctx.strokeStyle = "#c4c4c4";
    osm("strasse").forEach((f) => { ctx.lineWidth = (STRASSENBREITE_SCHAETZUNG[f.properties.typ] || 4) * mass; zeichneLinie(ctx, pt, f.geometry); });
  }
  // Rahmen des gewählten Gebiets
  ctx.strokeStyle = "#111";
  ctx.lineWidth = Math.max(1.5, mass * 0.6);
  ctx.beginPath();
  gebiet.geometry.coordinates[0].forEach((p, i) => { const [x, y] = pt(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();

  const textur = new THREE.CanvasTexture(leinwand);
  textur.anisotropy = 4;
  return new THREE.MeshBasicMaterial({ map: textur });
}

// ----- Bäume -----
function d3Baeume(lokalLonLat) {
  const staemme = baumFeatures.filter((f) => f.properties.form === "stamm");
  if (!staemme.length) return null;
  const breit = [], nadel = [];
  staemme.forEach((f) => (f.properties.nadel ? nadel : breit).push(f));
  const gruppe = new THREE.Group();
  const farbe = new THREE.Color();

  const kugel = new THREE.SphereGeometry(0.5, 10, 8);
  const kegel = new THREE.ConeGeometry(0.5, 1, 9);
  const stammForm = new THREE.CylinderGeometry(0.15, 0.22, 1, 6);
  const krone = (liste, form, hex) => {
    const mesh = new THREE.InstancedMesh(form, new THREE.MeshLambertMaterial({ color: 0xffffff }), liste.length);
    const stamm = new THREE.InstancedMesh(stammForm, new THREE.MeshLambertMaterial({ color: D3_FARBEN.stamm }), liste.length);
    const m = new THREE.Matrix4();
    liste.forEach((f, i) => {
      const d = f.properties.d || 6;
      const gesamt = f.properties.hoehe > 2 ? f.properties.hoehe : Math.max(4, d * 1.5);   // Baumhöhe: OSM oder aus der Kronengröße geschätzt
      const kronenHoehe = f.properties.nadel ? Math.min(gesamt * 0.8, d * 2) : Math.min(gesamt * 0.65, d * 1.1);
      const stammHoehe = Math.max(1, gesamt - kronenHoehe);
      const [x, z] = lokalLonLat(f.geometry.coordinates);
      m.compose(new THREE.Vector3(x, stammHoehe + kronenHoehe / 2, z), new THREE.Quaternion(), new THREE.Vector3(d, kronenHoehe, d));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, farbe.set(hex).offsetHSL(0, 0, (((i * 37) % 11) - 5) * 0.008));   // kleine Farbunterschiede
      m.compose(new THREE.Vector3(x, stammHoehe / 2, z), new THREE.Quaternion(), new THREE.Vector3(1, stammHoehe, 1));
      stamm.setMatrixAt(i, m);
    });
    gruppe.add(mesh, stamm);
  };
  if (breit.length) krone(breit, kugel, D3_FARBEN.krone);
  if (nadel.length) krone(nadel, kegel, D3_FARBEN.kroneNadel);
  return gruppe;
}

// ----- Alles zusammenbauen -----
function d3Baue() {
  const bbox = turf.bbox(gebiet);
  const ecken = [[bbox[0], bbox[1]], [bbox[0], bbox[3]], [bbox[2], bbox[1]], [bbox[2], bbox[3]]].map((e) => utmWandler.forward(e));
  const xs = ecken.map((e) => e[0]), ys = ecken.map((e) => e[1]);
  const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
  const B = xmax - xmin, H = ymax - ymin;
  const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;

  // Höhe des (flachen) Bodens: Mittelwert der Geländehöhen der LoD2-Gebäude, sonst 0
  const boeden = lod2Gebaeude.map((g) => g.boden).filter((v) => v != null).sort((a, b) => a - b);
  const bodenHoehe = boeden.length ? boeden[boeden.length >> 1] : 0;

  const gruppe = new THREE.Group();

  // Boden
  const mass = 2048 / Math.max(B, H);   // Bildpunkte pro Meter
  const boden = new THREE.Mesh(new THREE.PlaneGeometry(B, H), d3BodenMaterial(xmin, ymin, B, H, mass));
  boden.rotation.x = -Math.PI / 2;
  boden.position.y = -0.05;
  gruppe.add(boden);

  // LoD2-Gebäude
  const wandPos = [], dachPos = [];
  const lokal3D = (p) => [p[0] - cx, p[2] - bodenHoehe, -(p[1] - cy)];
  for (const g of lod2Gebaeude) {
    g.waende.forEach((ringe) => d3Triangulieren(ringe, wandPos, lokal3D));
    g.flaechen.forEach((ringe) => d3Triangulieren(ringe, dachPos, lokal3D));
  }

  // Ersatz: OSM-Gebäude, für die es keine LoD2-Daten gibt, als Blöcke
  const ersatzWand = [], ersatzDach = [];
  const lokalXY = ([lon, lat]) => { const [x, y] = utmWandler.forward([lon, lat]); return [x - cx, y - cy]; };
  let ersatzAnzahl = 0;
  for (const f of osmFeatures) {
    const p = f.properties;
    if (p.kat !== "gebaeude" && p.kat !== "nebengebaeude") continue;
    if (lod2Vorhanden && p.lod2 === 1) continue;
    const b = turf.bbox(f);
    const mx = (b[0] + b[2]) / 2, my = (b[1] + b[3]) / 2;
    if (mx < bbox[0] || mx > bbox[2] || my < bbox[1] || my > bbox[3]) continue;
    const hoehe = p.kat === "nebengebaeude" ? 3 : geschosseVon(p).n * D3_GESCHOSSHOEHE_M;
    const polygone = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
    polygone.forEach((poly) => d3Block(poly, hoehe, ersatzWand, ersatzDach, lokalXY));
    ersatzAnzahl++;
  }

  const huelle = (pos, farbe) => { if (pos.length) gruppe.add(new THREE.Mesh(d3Geometrie(pos), d3Material(farbe))); };
  huelle(wandPos, D3_FARBEN.wand);
  huelle(dachPos, D3_FARBEN.dach);
  huelle(ersatzWand, D3_FARBEN.ersatzWand);
  huelle(ersatzDach, D3_FARBEN.ersatzDach);

  // Bäume
  const baeume = d3Baeume(([lon, lat]) => { const [x, y] = utmWandler.forward([lon, lat]); return [x - cx, -(y - cy)]; });
  if (baeume) { baeume.visible = document.getElementById("d3-baeume").checked; gruppe.add(baeume); }

  if (d3.gruppe) { d3.szene.remove(d3.gruppe); d3Raeume(d3.gruppe); }
  d3.gruppe = gruppe;
  d3.baeume = baeume;
  d3.szene.add(gruppe);
  d3.ausdehnung = Math.max(B, H) * 1.15;

  const lod2Anzahl = lod2Gebaeude.length;
  const baumAnzahl = baumFeatures.filter((f) => f.properties.form === "stamm").length;
  const teile = [];
  if (lod2Anzahl) teile.push(`${zahl(lod2Anzahl)} Gebäude aus LoD2`);
  if (ersatzAnzahl) teile.push(`${zahl(ersatzAnzahl)} Ersatz-Blöcke aus OpenStreetMap (bläulich)`);
  teile.push(`${zahl(baumAnzahl)} Bäume`, "Gelände flach angenommen");
  const quellen = ["© OpenStreetMap-Mitwirkende (ODbL)"];
  if (lod2Vorhanden) quellen.push(lod2Quelle.replace(/^LoD2: /, "Gebäude: "));
  if (alkisVorhanden) quellen.push(alkisQuelle);
  d3Info.textContent = teile.join(" · ") + " · " + quellen.join(" · ") + " · nicht vermessungsgenau";
  d3.quellenText = "Ortsanalyse 3D · " + quellen.join(" · ") + " · nicht vermessungsgenau";

  d3SetzeAnsicht("schraeg");
}

// ----- Aufruf aus app.js -----
function aktualisiere3D() {
  if (!gebiet || !datenVorhanden) {
    d3ZeigeHinweis("Noch keine Daten. Wähle im Reiter „Karte“ ein Gebiet und klicke auf „Analysieren“.");
    return;
  }
  try { d3Starte(); } catch (fehler) { d3ZeigeHinweis("3D nicht möglich: " + fehler.message); return; }
  d3ZeigeHinweis("");
  d3PasseGroesseAn();
  const stand = [turf.bbox(gebiet).join(","), osmFeatures.length, lod2Gebaeude.length, alkisFlaechen.length, baumFeatures.length].join("|");
  if (stand === d3.stand) { d3Zeichne(); return; }
  d3ZeigeHinweis("3D-Modell wird gebaut …");
  setTimeout(() => {   // erst die Meldung zeigen, dann rechnen
    try {
      d3Baue();
      d3.stand = stand;
      d3ZeigeHinweis(lod2Vorhanden ? "" : "Ohne LoD2-Daten: alle Gebäude sind einfache Blöcke aus OpenStreetMap (Geschosse mal 3 m).");
    } catch (fehler) {
      console.error(fehler);
      d3ZeigeHinweis("3D-Modell konnte nicht gebaut werden: " + fehler.message);
    }
    d3PasseGroesseAn();
    d3Zeichne();
  }, 30);
}

// ----- Bild speichern -----
function d3SpeichereBild() {
  if (!d3 || !d3.gruppe) return;
  d3Zeichne();
  const quelle = d3.renderer.domElement;
  const leiste = Math.round(26 * (window.devicePixelRatio || 1));
  const bild = document.createElement("canvas");
  bild.width = quelle.width;
  bild.height = quelle.height + leiste;
  const ctx = bild.getContext("2d");
  ctx.drawImage(quelle, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, quelle.height, bild.width, leiste);
  ctx.fillStyle = "#555555";
  ctx.font = `${Math.round(leiste * 0.46)}px sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(d3.quellenText, 10, quelle.height + leiste / 2, bild.width - 20);   // Quellenangabe ist Pflicht (Lizenzen)
  bild.toBlob((blob) => {
    const verweis = document.createElement("a");
    verweis.href = URL.createObjectURL(blob);
    verweis.download = "Ortsanalyse-3D.png";
    verweis.click();
    setTimeout(() => URL.revokeObjectURL(verweis.href), 2000);
  });
}
