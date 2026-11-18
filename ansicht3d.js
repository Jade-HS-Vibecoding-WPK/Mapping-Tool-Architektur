/* ============================================================
   SiteKick – 3D-Ansicht (three.js)

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
  ...FARBE.d3,
  krone: FARBE.krone, kroneNadel: FARBE.kroneNadel
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
  const himmel = new THREE.HemisphereLight(0xffffff, 0xb9b4a9, 0.85);
  szene.add(himmel);
  const sonne = new THREE.DirectionalLight(0xffffff, 0.75);
  sonne.position.set(-300, 500, -300);   // Licht von Nordwesten, wie im 2D-Lageplan (ohne Sonnenstudie)
  szene.add(sonne);
  szene.add(sonne.target);
  renderer.shadowMap.enabled = true;     // Schatten gibt es nur, wenn "Sonne" angehakt ist (castShadow des Lichts)
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const kamera = new THREE.PerspectiveCamera(40, 1, 5, 20000);
  const steuerung = new THREE.OrbitControls(kamera, renderer.domElement);
  steuerung.maxPolarAngle = Math.PI / 2 - 0.03;   // nicht unter den Boden schauen
  steuerung.addEventListener("change", d3Zeichne);

  d3 = { renderer, szene, kamera, steuerung, gruppe: null, stand: "", ausdehnung: 500, sonneLicht: sonne, himmelLicht: himmel, fang: null, sonneAn: false };
  new ResizeObserver(() => { d3PasseGroesseAn(); d3Zeichne(); }).observe(d3Buehne);

  document.getElementById("d3-reset").addEventListener("click", () => d3SetzeAnsicht("schraeg"));
  document.getElementById("d3-oben").addEventListener("click", () => d3SetzeAnsicht("oben"));
  document.getElementById("d3-baeume").addEventListener("change", (e) => { if (d3.baeume) d3.baeume.visible = e.target.checked; d3Zeichne(); });
  document.getElementById("d3-png").addEventListener("click", d3SpeichereBild);
  // Sonne: Datum und Uhrzeit gelten auch im Reiter "Sonne & Schatten" (sonneZustand in sonne.js)
  document.getElementById("d3-sonne").addEventListener("change", () => d3SonneAnwenden());
  document.getElementById("d3-datum").addEventListener("change", (e) => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { sonneZustand.datum = e.target.value; d3SonneAnwenden(); } });
  document.getElementById("d3-zeit").addEventListener("input", (e) => { sonneZustand.minuten = Number(e.target.value); d3SonneAnwenden(); });
  document.getElementById("d3-hoehenlinien").addEventListener("change", (e) => { if (d3.boden) { d3.boden.zeichneAnzeige(e.target.checked); d3Zeichne(); } });
  // Überhöhung: erst beim Loslassen neu bauen (das Bauen dauert einen Moment)
  const regler = document.getElementById("d3-ueberhoehung");
  regler.addEventListener("input", () => { document.getElementById("d3-ueberhoehung-wert").textContent = `${zahl(Number(regler.value), 1)}×`; });
  regler.addEventListener("change", () => aktualisiere3D());
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
// unten/oben: Höhe des Fußes und des Daches (lokal, in Meter). Der Fuß liegt etwas unter dem Gelände, damit keine Lücke entsteht.
function d3Block(polygon, unten, oben, wandPos, dachPos, lokalXY) {
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
      wandPos.push(x0, unten, -y0, x1, unten, -y1, x1, oben, -y1,
                   x0, unten, -y0, x1, oben, -y1, x0, oben, -y0);
    }
  }
  // Dach: flach, in der Ebene zerlegt
  const aussen = ringe[0].map((p) => new THREE.Vector2(p[0], p[1]));
  const loecher = ringe.slice(1).map((r) => r.map((p) => new THREE.Vector2(p[0], p[1])));
  const alle = ringe[0].concat(...ringe.slice(1));
  for (const t of THREE.ShapeUtils.triangulateShape(aussen, loecher)) {
    for (const i of t) dachPos.push(alle[i][0], oben, -alle[i][1]);
  }
}

// ----- Gelände: Schummerung und Höhenlinien -----
// Schummerung (Hillshade): Wie stark ist ein Hang von Nordwesten beleuchtet? Wir verstärken die Neigung (Faktor 3),
// damit auch flaches Gelände lesbar wird. Das Ergebnis ist ein Graubild, das wir auf den Boden multiplizieren.
function d3Schummerung() {
  const g = gelaende;
  const bild = document.createElement("canvas");
  bild.width = g.breite; bild.height = g.hoehe;
  const ctx = bild.getContext("2d");
  const pixel = ctx.createImageData(g.breite, g.hoehe);
  const hoehe = (s, z) => g.daten[Math.min(g.hoehe - 1, Math.max(0, z)) * g.breite + Math.min(g.breite - 1, Math.max(0, s))];
  const Z_FAKTOR = 3;
  for (let z = 0; z < g.hoehe; z++) {
    for (let s = 0; s < g.breite; s++) {
      const dx = (hoehe(s + 1, z) - hoehe(s - 1, z)) / 2;      // Anstieg nach Osten je Meter
      const dy = (hoehe(s, z - 1) - hoehe(s, z + 1)) / 2;      // Anstieg nach Norden je Meter (Zeile 0 = Norden)
      const laenge = Math.hypot(Z_FAKTOR * dx, Z_FAKTOR * dy, 1);
      const licht = (-Z_FAKTOR * dx * -0.5 + -Z_FAKTOR * dy * 0.5 + 0.7071) / laenge;   // Licht aus Nordwesten, 45 Grad hoch
      const faktor = Math.min(1, Math.max(0.6, 0.96 + (licht - 0.7071) * 0.8));
      const grau = Math.round(faktor * 255);
      const i = (z * g.breite + s) * 4;
      pixel.data[i] = pixel.data[i + 1] = pixel.data[i + 2] = grau;
      pixel.data[i + 3] = 255;
    }
  }
  ctx.putImageData(pixel, 0, 0);
  return bild;
}

// Abstand der Höhenlinien je nach Höhenunterschied im Gebiet
function d3LinienAbstand(unterschied) {
  return unterschied <= 12 ? 1 : unterschied <= 40 ? 2 : unterschied <= 100 ? 5 : 10;
}

// Höhenlinien nach dem Verfahren "Marching Squares": Wir gehen durch Rasterfelder (alle 2 m) und zeichnen dort,
// wo die Höhe eine Linienhöhe überschreitet, ein kurzes Stück Linie.
function d3ZeichneHoehenlinien(ctx, abstand, mass, xmin, yObenPlatte) {
  const g = gelaende;
  const schritt = 2;
  const spalten = Math.floor((g.breite - 1) / schritt), zeilen = Math.floor((g.hoehe - 1) / schritt);
  const wert = (s, z) => g.daten[z * schritt * g.breite + s * schritt];
  const px = (s) => (g.x0 + s * schritt + 0.5 - xmin) * mass;
  const py = (z) => (yObenPlatte - (g.yOben - z * schritt - 0.5)) * mass;
  ctx.strokeStyle = "#8a6d4b";
  ctx.lineWidth = Math.max(0.8, mass * 0.3);
  ctx.lineJoin = "round";
  for (let stufe = Math.ceil(g.min / abstand) * abstand; stufe <= g.max; stufe += abstand) {
    ctx.beginPath();
    for (let z = 0; z < zeilen; z++) {
      for (let s = 0; s < spalten; s++) {
        const a = wert(s, z), b = wert(s + 1, z), c = wert(s + 1, z + 1), d = wert(s, z + 1);
        const fall = (a >= stufe ? 8 : 0) | (b >= stufe ? 4 : 0) | (c >= stufe ? 2 : 0) | (d >= stufe ? 1 : 0);
        if (fall === 0 || fall === 15) continue;
        const t = (v1, v2) => (v1 === v2 ? 0.5 : (stufe - v1) / (v2 - v1));
        const oben = [px(s) + t(a, b) * (px(s + 1) - px(s)), py(z)];
        const rechts = [px(s + 1), py(z) + t(b, c) * (py(z + 1) - py(z))];
        const unten = [px(s) + t(d, c) * (px(s + 1) - px(s)), py(z + 1)];
        const links = [px(s), py(z) + t(a, d) * (py(z + 1) - py(z))];
        const strecke = (p, q) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
        switch (fall) {
          case 1: case 14: strecke(links, unten); break;
          case 2: case 13: strecke(unten, rechts); break;
          case 3: case 12: strecke(links, rechts); break;
          case 4: case 11: strecke(oben, rechts); break;
          case 5: strecke(oben, links); strecke(unten, rechts); break;
          case 6: case 9: strecke(oben, unten); break;
          case 7: case 8: strecke(oben, links); break;
          case 10: strecke(oben, rechts); strecke(links, unten); break;
        }
      }
    }
    ctx.stroke();
  }
}

// ----- Boden: Lageplan als Bild (mit Schummerung), Form flach oder als Relief -----
function d3BodenTextur(xmin, ymin, B, H, mass) {
  const leinwand = document.createElement("canvas");
  leinwand.width = Math.max(16, Math.round(B * mass));
  leinwand.height = Math.max(16, Math.round(H * mass));
  const ctx = leinwand.getContext("2d");
  ctx.fillStyle = D3_FARBEN.boden;
  ctx.fillRect(0, 0, leinwand.width, leinwand.height);
  ctx.lineJoin = "round";
  const pt = (lonlat) => {
    const [x, y] = utmWandler.forward(lonlat);
    return [(x - xmin) * mass, (ymin + H - y) * mass];
  };
  const flaechen = (liste, farbe) => { ctx.fillStyle = farbe; liste.forEach((f) => zeichneFlaeche(ctx, pt, f.geometry)); };
  const osm = (kat) => osmFeatures.filter((f) => f.properties.kat === kat);
  const amtlich = (...arten) => alkisFlaechen.filter((f) => arten.includes(f.properties.kat));

  flaechen(osm("gruen").concat(amtlich("gehoelz", "wald")), FARBE.gruen);
  flaechen(osm("wasser"), FARBE.wasser);
  ctx.strokeStyle = FARBE.wasser;
  osm("wasserlinie").forEach((f) => { ctx.lineWidth = (WASSER_BREITE_SCHAETZUNG[f.properties.typ] || 2) * mass; zeichneLinie(ctx, pt, f.geometry); });
  if (alkisVorhanden) {
    flaechen(amtlich("strasse"), FARBE.plan.fahrbahn);
    flaechen(amtlich("weg"), FARBE.plan.weg);
    flaechen(amtlich("platz"), FARBE.plan.platz);
  } else {
    ctx.strokeStyle = FARBE.plan.fahrbahn;
    osm("strasse").forEach((f) => { ctx.lineWidth = (STRASSENBREITE_SCHAETZUNG[f.properties.typ] || 4) * mass; zeichneLinie(ctx, pt, f.geometry); });
  }

  // Schummerung des Geländes darüber multiplizieren
  if (gelaende) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(d3Schummerung(), (gelaende.x0 - xmin) * mass, (ymin + H - gelaende.yOben) * mass, gelaende.breite * mass, gelaende.hoehe * mass);
    ctx.restore();
  }

  // Rahmen des gewählten Gebiets
  ctx.strokeStyle = "#111";
  ctx.lineWidth = Math.max(1.5, mass * 0.6);
  ctx.beginPath();
  gebiet.geometry.coordinates[0].forEach((p, i) => { const [x, y] = pt(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();

  // Anzeige-Bild: Grundbild, auf Wunsch mit Höhenlinien darüber
  const anzeige = document.createElement("canvas");
  anzeige.width = leinwand.width; anzeige.height = leinwand.height;
  const textur = new THREE.CanvasTexture(anzeige);
  textur.anisotropy = 4;
  const abstand = gelaende ? d3LinienAbstand(gelaende.max - gelaende.min) : 0;
  const zeichneAnzeige = (mitLinien) => {
    const c = anzeige.getContext("2d");
    c.drawImage(leinwand, 0, 0);
    if (mitLinien && gelaende) d3ZeichneHoehenlinien(c, abstand, mass, xmin, ymin + H);
    textur.needsUpdate = true;
  };
  return { material: new THREE.MeshBasicMaterial({ map: textur }), zeichneAnzeige, abstand };
}

// Flache Platte oder Höhenrelief aus dem Höhenmodell (ca. 300 x 300 Punkte)
function d3BodenFormen(xmin, ymin, B, H, cx, cy, hoeheLokal, material) {
  if (!gelaende) {
    const platte = new THREE.Mesh(new THREE.PlaneGeometry(B, H), material);
    platte.rotation.x = -Math.PI / 2;
    platte.position.y = -0.05;
    return platte;
  }
  const spalten = Math.min(300, Math.ceil(B)), zeilen = Math.min(300, Math.ceil(H));
  const yMax = ymin + H;
  const pos = new Float32Array((spalten + 1) * (zeilen + 1) * 3);
  const uv = new Float32Array((spalten + 1) * (zeilen + 1) * 2);
  for (let j = 0; j <= zeilen; j++) {
    for (let i = 0; i <= spalten; i++) {
      const x = xmin + (i / spalten) * B, y = yMax - (j / zeilen) * H;
      const n = j * (spalten + 1) + i;
      pos.set([x - cx, hoeheLokal(x, y) - 0.05, -(y - cy)], n * 3);
      uv.set([i / spalten, 1 - j / zeilen], n * 2);
    }
  }
  const index = [];
  for (let j = 0; j < zeilen; j++) {
    for (let i = 0; i < spalten; i++) {
      const a = j * (spalten + 1) + i, b = a + 1, c = a + spalten + 1, d = c + 1;
      index.push(a, c, b, b, c, d);   // Reihenfolge so, dass die Fläche nach oben zeigt
    }
  }
  const geometrie = new THREE.BufferGeometry();
  geometrie.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometrie.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometrie.setIndex(index);
  material.side = THREE.DoubleSide;
  return new THREE.Mesh(geometrie, material);
}

// ----- Bäume -----
// lokalMitHoehe: ([Länge, Breite]) -> [x, z, Höhe des Geländes an dieser Stelle]
function d3Baeume(lokalMitHoehe) {
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
      const [x, z, fuss] = lokalMitHoehe(f.geometry.coordinates);
      m.compose(new THREE.Vector3(x, fuss + stammHoehe + kronenHoehe / 2, z), new THREE.Quaternion(), new THREE.Vector3(d, kronenHoehe, d));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, farbe.set(hex).offsetHSL(0, 0, (((i * 37) % 11) - 5) * 0.008));   // kleine Farbunterschiede
      m.compose(new THREE.Vector3(x, fuss + stammHoehe / 2, z), new THREE.Quaternion(), new THREE.Vector3(1, stammHoehe, 1));
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

  // Höhen: Mit Höhenmodell liegt der tiefste Punkt bei 0; ohne Höhenmodell ist der Boden flach auf Höhe der LoD2-Gebäudefüße.
  const ueberhoehung = gelaende ? Number(document.getElementById("d3-ueberhoehung").value) || 1 : 1;
  const boeden = lod2Gebaeude.map((g) => g.boden).filter((v) => v != null).sort((a, b) => a - b);
  const nullHoehe = gelaende ? gelaende.min : (boeden.length ? boeden[boeden.length >> 1] : 0);
  // Gelände lokal (mit Überhöhung) an einem Ort in UTM-Metern
  const hoeheLokal = (x, y) => (gelaende ? (gelaendeHoehe(x, y) - nullHoehe) * ueberhoehung : 0);
  const SOCKEL = 1;   // Wandfüße sitzen 1 m unter dem Boden, damit bei Hängen keine Lücke bleibt

  const gruppe = new THREE.Group();

  // Boden
  const mass = 2048 / Math.max(B, H);   // Bildpunkte pro Meter
  const textur = d3BodenTextur(xmin, ymin, B, H, mass);
  const boden = d3BodenFormen(xmin, ymin, B, H, cx, cy, hoeheLokal, textur.material);
  gruppe.add(boden);
  // Der Boden ist ein Bild ohne Lichtberechnung. Für die Schatten liegt eine durchsichtige Fläche mit gleicher Form knapp darüber, die nur Schatten zeigt.
  const fangForm = boden.geometry.clone();
  fangForm.computeVertexNormals();   // das Höhenrelief hat keine Normalen, ohne sie zeigt die Schattenfläche nichts
  const fang = new THREE.Mesh(fangForm, new THREE.ShadowMaterial({ opacity: 0.4, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  fang.rotation.copy(boden.rotation);
  fang.position.copy(boden.position);
  fang.position.y += 0.15;
  fang.receiveShadow = true;
  fang.visible = false;
  gruppe.add(fang);

  // LoD2-Gebäude: absolute Höhen (über NHN) minus Nullhöhe; bei Überhöhung wird das ganze Gebäude mit dem Gelände angehoben
  const wandPos = [], dachPos = [];
  for (const g of lod2Gebaeude) {
    const erster = g.flaechen[0] && g.flaechen[0][0];
    const anhebung = gelaende && erster && ueberhoehung !== 1 ? (ueberhoehung - 1) * (gelaendeHoehe(erster[0], erster[1]) - nullHoehe) : 0;
    const fussHoehe = g.boden != null ? g.boden : -Infinity;
    const wand = (p) => [p[0] - cx, p[2] - nullHoehe + anhebung - (p[2] <= fussHoehe + 0.05 ? SOCKEL : 0), -(p[1] - cy)];
    const dach = (p) => [p[0] - cx, p[2] - nullHoehe + anhebung, -(p[1] - cy)];
    g.waende.forEach((ringe) => d3Triangulieren(ringe, wandPos, wand));
    g.flaechen.forEach((ringe) => d3Triangulieren(ringe, dachPos, dach));
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
    polygone.forEach((poly) => {
      // Fuß: tiefster Geländepunkt am Grundriss; Dach: Geländehöhe in der Mitte plus Gebäudehöhe
      const randpunkte = poly[0].map((q) => utmWandler.forward(q));
      const tief = Math.min(...randpunkte.map(([x, y]) => hoeheLokal(x, y)));
      const [mxu, myu] = utmWandler.forward([mx, my]);
      d3Block(poly, tief - SOCKEL, hoeheLokal(mxu, myu) + hoehe, ersatzWand, ersatzDach, lokalXY);
    });
    ersatzAnzahl++;
  }

  const huelle = (pos, farbe) => { if (pos.length) gruppe.add(new THREE.Mesh(d3Geometrie(pos), d3Material(farbe))); };
  huelle(wandPos, D3_FARBEN.wand);
  huelle(dachPos, D3_FARBEN.dach);
  huelle(ersatzWand, D3_FARBEN.ersatzWand);
  huelle(ersatzDach, D3_FARBEN.ersatzDach);

  // Bäume (Fuß auf dem Gelände)
  const baeume = d3Baeume(([lon, lat]) => { const [x, y] = utmWandler.forward([lon, lat]); return [x - cx, -(y - cy), hoeheLokal(x, y)]; });
  if (baeume) { baeume.visible = document.getElementById("d3-baeume").checked; gruppe.add(baeume); }

  gruppe.traverse((o) => { if (o.isMesh && o !== boden && o !== fang) { o.castShadow = true; o.receiveShadow = true; } });
  if (d3.gruppe) { d3.szene.remove(d3.gruppe); d3Raeume(d3.gruppe); }
  d3.gruppe = gruppe;
  d3.fang = fang;
  d3.baeume = baeume;
  d3.boden = textur;
  d3.szene.add(gruppe);
  d3.ausdehnung = Math.max(B, H) * 1.15;
  d3.lod2Anzahl = lod2Gebaeude.length;
  d3.ersatzAnzahl = ersatzAnzahl;
  d3.ueberhoehung = ueberhoehung;

  // Bedienelemente für das Gelände nur zeigen, wenn es Gelände gibt
  document.getElementById("d3-ueberhoehung-feld").hidden = !gelaende;
  document.getElementById("d3-hoehenlinien-feld").hidden = !gelaende;
  document.getElementById("d3-ueberhoehung-wert").textContent = `${zahl(ueberhoehung, 1)}×`;
  textur.zeichneAnzeige(!!gelaende && document.getElementById("d3-hoehenlinien").checked);

  const lod2Anzahl = lod2Gebaeude.length;
  const baumAnzahl = baumFeatures.filter((f) => f.properties.form === "stamm").length;
  const teile = [];
  if (lod2Anzahl) teile.push(`${zahl(lod2Anzahl)} Gebäude aus LoD2`);
  if (ersatzAnzahl) teile.push(`${zahl(ersatzAnzahl)} Ersatz-Blöcke aus OpenStreetMap (bläulich)`);
  teile.push(`${zahl(baumAnzahl)} Bäume`);
  teile.push(gelaende
    ? `Gelände ${zahl(gelaende.min, 1)} bis ${zahl(gelaende.max, 1)} m ü. NHN${ueberhoehung !== 1 ? `, ${zahl(ueberhoehung, 1)}-fach überhöht` : ""}, Höhenlinien alle ${textur.abstand} m`
    : "Gelände flach angenommen");
  const quellen = ["© OpenStreetMap-Mitwirkende (ODbL)"];
  if (lod2Vorhanden) quellen.push(lod2Quelle.replace(/^LoD2: /, "Gebäude: "));
  if (alkisVorhanden) quellen.push(alkisQuelle);
  if (gelaende) quellen.push(gelaendeQuelle);
  d3Info.textContent = teile.join(" · ") + " · " + quellen.join(" · ") + " · nicht vermessungsgenau";
  d3.quellenText = "SiteKick 3D · " + quellen.join(" · ") + " · nicht vermessungsgenau";

  d3SetzeAnsicht("schraeg");
  d3SonneAnwenden();
  if (typeof aktualisiereExport === "function") aktualisiereExport();
  if (typeof aktualisiereLegende === "function") aktualisiereLegende();
}

// ----- Sonne und Schatten im 3D-Modell -----
// Sonnenstand aus sonne.js (sonnenstandFuerGebiet). Ohne Haken "Sonne" bleibt das Licht wie bisher (von Nordwesten, ohne Schatten).
function d3SonneAnwenden() {
  if (!d3) return;
  const an = document.getElementById("d3-sonne").checked;
  document.getElementById("d3-sonne-feld").hidden = !an;
  const licht = d3.sonneLicht;
  d3.sonneAn = false;
  if (!an || !d3.gruppe || !gebiet) {
    licht.castShadow = false;
    licht.position.set(-300, 500, -300);
    licht.intensity = 0.75;
    d3.himmelLicht.intensity = 0.85;
    if (d3.fang) d3.fang.visible = false;
    d3Zeichne();
    return;
  }
  document.getElementById("d3-datum").value = sonneZustand.datum;
  document.getElementById("d3-zeit").value = String(sonneZustand.minuten);
  const s = sonnenstandFuerGebiet();
  document.getElementById("d3-zeit-wert").textContent = `${uhrzeit(sonneZustand.minuten)} ${s.mez} · ${zahl(s.hoehe, 0)}°`;
  d3.fang.visible = true;
  if (s.hoehe < 1) {                                                       // Sonne unter dem Horizont: kein Schatten, dunkleres Licht
    licht.castShadow = false;
    licht.intensity = 0;
    d3.himmelLicht.intensity = 0.35;
    d3.sonneAn = true;
    d3.fang.visible = false;
    d3Zeichne();
    return;
  }
  const D = d3.ausdehnung;
  const az = s.azimut * Math.PI / 180, el = s.hoehe * Math.PI / 180;
  licht.position.set(Math.sin(az) * Math.cos(el) * D * 2, Math.sin(el) * D * 2, -Math.cos(az) * Math.cos(el) * D * 2);   // x = Ost, -z = Nord
  licht.target.position.set(0, 0, 0);
  licht.intensity = 1.1;
  d3.himmelLicht.intensity = 0.5;
  licht.castShadow = true;
  const k = licht.shadow.camera, halb = D * 0.8;
  k.left = -halb; k.right = halb; k.top = halb; k.bottom = -halb; k.near = 1; k.far = D * 5;
  k.updateProjectionMatrix();
  licht.shadow.mapSize.set(4096, 4096);
  licht.shadow.bias = -0.0006;
  licht.shadow.normalBias = 0.4;
  d3.sonneAn = true;
  d3Zeichne();
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
  if (d3.gruppe && document.getElementById("d3-sonne").checked) d3SonneAnwenden();   // Datum und Uhrzeit können im Reiter Sonne & Schatten geändert worden sein
  const stand = [turf.bbox(gebiet).join(","), osmFeatures.length, lod2Gebaeude.length, alkisFlaechen.length, baumFeatures.length,
    gelaende ? `${gelaende.min}-${gelaende.max}` : "flach", document.getElementById("d3-ueberhoehung").value].join("|");
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
  const sonnenText = d3.sonneAn ? ` · Sonnenstand ${sonneZustand.datum.split("-").reverse().join(".")} ${uhrzeit(sonneZustand.minuten)}` : "";
  ctx.fillText(d3.quellenText + sonnenText, 10, quelle.height + leiste / 2, bild.width - 20);   // Quellenangabe ist Pflicht (Lizenzen)
  bild.toBlob((blob) => {
    const verweis = document.createElement("a");
    verweis.href = URL.createObjectURL(blob);
    verweis.download = "SiteKick-3D.png";
    verweis.click();
    setTimeout(() => URL.revokeObjectURL(verweis.href), 2000);
  });
}
