/* ============================================================
   Ortsanalyse – Kennzahlen berechnen und anzeigen
   - Gebäude: Anzahl, bebaute Fläche, GRZ brutto/netto
   - Dichte: mittlere Geschosszahl, Geschossfläche, GFZ brutto/netto
   - Freiraum: Grünanteil, Einzelbäume
   - Verkehr: Straßenlänge nach Kategorie
   - Flächenanteile und Gebäude nach Nutzung
   ============================================================ */

// ---------- Flächenanteile über ein Raster ----------
// Idee: Wir „malen“ alle Flächen unsichtbar auf ein Bild, in dem 1 Pixel = 1 m² ist,
// und zählen danach die Pixel. Überlappende Flächen (z. B. Wiese im Park) werden so
// nicht doppelt gezählt. Die Reihenfolge legt fest, was „oben“ liegt: Gebäude zuletzt.
const RASTER_KLASSEN = ["leer", "gruen", "wasser", "verkehr", "bahn", "gebaeude", "neben"];

function flaechenAnteile(daten, bbox, gebietM2) {
  const [west, sued, ost, nord] = bbox;
  const breiteM = turf.distance([west, sued], [ost, sued], { units: "meters" });
  const hoeheM = turf.distance([west, sued], [west, nord], { units: "meters" });
  const B = Math.max(1, Math.round(breiteM)), H = Math.max(1, Math.round(hoeheM));

  const leinwand = document.createElement("canvas");
  leinwand.width = B; leinwand.height = H;
  const ctx = leinwand.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, B, H);

  const px = ([lon, lat]) => [(lon - west) / (ost - west) * B, (nord - lat) / (nord - sued) * H];
  const farbe = (klasse) => `rgb(${RASTER_KLASSEN.indexOf(klasse) * 36},0,0)`;

  function pfad(ringe) {
    for (const ring of ringe) {
      ring.forEach((p, i) => { const [x, y] = px(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath();
    }
  }
  function flaeche(feature, klasse) {
    const g = feature.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    ctx.fillStyle = farbe(klasse);
    for (const poly of polys) { ctx.beginPath(); pfad(poly); ctx.fill("evenodd"); }
  }
  function linie(feature, klasse, breiteM) {
    if (!breiteM) return;
    const g = feature.geometry;
    const linien = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
    ctx.strokeStyle = farbe(klasse);
    ctx.lineWidth = breiteM; // 1 Pixel = 1 m
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const l of linien) {
      ctx.beginPath();
      l.forEach((p, i) => { const [x, y] = px(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
  }

  // Reihenfolge: Grün → Wasser → Verkehr → Bahn → Gebäude
  daten.gruen.features.filter((f) => f.properties.kategorie !== "wasser").forEach((f) => flaeche(f, "gruen"));
  daten.gruen.features.filter((f) => f.properties.kategorie === "wasser").forEach((f) => flaeche(f, "wasser"));
  daten.wasserLinien.features.forEach((f) => linie(f, "wasser", f.properties.breite));
  daten.verkehrsflaechen.features.forEach((f) => flaeche(f, "verkehr"));
  daten.strassen.features.forEach((f) => linie(f, "verkehr", f.properties.breite));
  daten.bahn.features.forEach((f) => (f.properties.art === "bahnflaeche" ? flaeche(f, "bahn") : linie(f, "bahn", f.properties.breite)));
  daten.gebaeude.features.forEach((f) => flaeche(f, f.properties.art === "neben" ? "neben" : "gebaeude"));

  // Pixel zählen
  const pixel = ctx.getImageData(0, 0, B, H).data;
  const zaehler = Object.fromEntries(RASTER_KLASSEN.map((k) => [k, 0]));
  for (let i = 0; i < pixel.length; i += 4) {
    // Weiß (nichts gemalt) hat einen hohen Grünwert. Alles andere über den Rotwert zuordnen.
    // Randpixel sind mit Weiß gemischt: Den Weißanteil herausrechnen.
    const gruenwert = pixel[i + 1];
    if (gruenwert > 127) { zaehler.leer++; continue; }
    const rot = gruenwert ? (pixel[i] - gruenwert) / (1 - gruenwert / 255) : pixel[i];
    const k = Math.min(RASTER_KLASSEN.length - 1, Math.max(1, Math.round(rot / 36)));
    zaehler[RASTER_KLASSEN[k]]++;
  }
  // Pixel in m² umrechnen (auf die echte Gebietsfläche bezogen)
  const proPixel = gebietM2 / (B * H);
  const m2 = {};
  for (const k of RASTER_KLASSEN) m2[k] = zaehler[k] * proPixel;
  return m2;
}

// ---------- Alle Kennzahlen ----------
function berechneKennzahlen(daten, bbox) {
  const gebiet = turf.bboxPolygon(bbox);
  const gebietM2 = turf.area(gebiet);
  const [west, sued, ost, nord] = bbox;

  const haupt = daten.gebaeude.features.filter((f) => f.properties.art === "haupt");
  const neben = daten.gebaeude.features.filter((f) => f.properties.art === "neben");
  const summe = (liste, fn) => liste.reduce((s, x) => s + fn(x), 0);

  const bebaut = summe(haupt, (f) => f.properties.flaeche);
  const geschossflaeche = summe(haupt, (f) => f.properties.flaeche * f.properties.geschosse);
  const geschaetzt = haupt.filter((f) => f.properties.geschosseQuelle === "ersatz").length;
  const ausHoehe = haupt.filter((f) => f.properties.geschosseQuelle === "hoehe").length;

  const anteile = flaechenAnteile(daten, bbox, gebietM2);
  // Bauland (netto) = Gebiet ohne Straßen, Bahn, Grün und Wasser
  const nettoM2 = gebietM2 - anteile.gruen - anteile.wasser - anteile.verkehr - anteile.bahn;

  // Straßenlängen nach Kategorie
  const strassen = {};
  for (const k of Object.keys(STRASSEN_KATEGORIEN)) strassen[k] = 0;
  daten.strassen.features.forEach((f) => { strassen[f.properties.kategorie] += f.properties.laenge; });

  // Gebäude nach Nutzung (Anzahl und Grundfläche)
  const nutzungen = {};
  for (const k of Object.keys(NUTZUNGEN)) nutzungen[k] = { anzahl: 0, flaeche: 0 };
  haupt.forEach((f) => { const n = nutzungen[f.properties.nutzung]; n.anzahl++; n.flaeche += f.properties.flaeche; });

  return {
    gebietM2,
    breiteM: turf.distance([west, sued], [ost, sued], { units: "meters" }),
    hoeheM: turf.distance([west, sued], [west, nord], { units: "meters" }),
    nettoM2,
    gebaeudeAnzahl: haupt.length,
    bebaut,
    grzBrutto: bebaut / gebietM2,
    grzNetto: nettoM2 > 0 ? bebaut / nettoM2 : null,
    nebenAnzahl: neben.length,
    nebenFlaeche: summe(neben, (f) => f.properties.flaeche),
    mittlereGeschosse: haupt.length ? summe(haupt, (f) => f.properties.geschosse) / haupt.length : 0,
    geschaetzt, ausHoehe,
    geschossflaeche,
    gfzBrutto: geschossflaeche / gebietM2,
    gfzNetto: nettoM2 > 0 ? geschossflaeche / nettoM2 : null,
    gruenAnteil: (anteile.gruen + anteile.wasser) / gebietM2,
    wasserAnteil: anteile.wasser / gebietM2,
    baeume: daten.baeume.features.length,
    strassen,
    strassenGesamt: Object.values(strassen).reduce((a, b) => a + b, 0),
    anteile,
    nutzungen
  };
}

// ---------- Anzeige ----------
const fmt = (wert, stellen = 0) =>
  wert == null || isNaN(wert) ? "–" : wert.toLocaleString("de-DE", { maximumFractionDigits: stellen, minimumFractionDigits: stellen });
const prozent = (anteil, stellen = 1) => (anteil == null ? "–" : `${fmt(anteil * 100, stellen)} %`);
const flaecheText = (m2) => (m2 >= 10_000 ? `${fmt(m2 / 10_000, 2)} ha` : `${fmt(m2)} m²`);

function zeile(name, wert, erklaerung = "") {
  return `<div class="kz-zeile"><dt>${name}${erklaerung ? `<small>${erklaerung}</small>` : ""}</dt><dd>${wert}</dd></div>`;
}

function balken(eintraege, gesamt, einheit) {
  return `<div class="kz-balken">${eintraege.map(([name, wert, klasse]) => `
    <div class="kz-balken-zeile">
      <span class="kz-balken-name">${name}</span>
      <span class="kz-balken-spur"><span class="kz-balken-wert ${klasse || ""}" style="width:${gesamt ? (wert / gesamt) * 100 : 0}%"></span></span>
      <span class="kz-balken-zahl">${einheit(wert)}</span>
    </div>`).join("")}</div>`;
}

function zeigeKennzahlen(k, quelle) {
  const ziel = document.getElementById("kennzahlen-inhalt");
  const a = k.anteile;
  const sonstige = a.leer;
  const fa = [
    ["Gebäude", a.gebaeude, "f-gebaeude"],
    ["Nebengebäude", a.neben, "f-neben"],
    ["Grün", a.gruen, "f-gruen"],
    ["Wasser", a.wasser, "f-wasser"],
    ["Verkehr (geschätzt)", a.verkehr, "f-verkehr"],
    ["Bahn", a.bahn, "f-bahn"],
    ["Sonstige Freifläche", sonstige, "f-leer"]
  ];
  const nutzungsListe = Object.entries(NUTZUNGEN)
    .map(([key, name]) => [`${name} (${k.nutzungen[key].anzahl})`, k.nutzungen[key].flaeche, `f-n-${key}`])
    .filter(([, wert]) => wert > 0);

  ziel.innerHTML = `
    <header class="kz-kopf">
      <h3>Kennzahlen des Untersuchungsgebiets</h3>
      <p>${quelle}</p>
    </header>

    <section class="kz-block">
      <h4>Gebiet</h4>
      <dl>
        ${zeile("Gebietsfläche (brutto)", flaecheText(k.gebietM2), `${fmt(k.breiteM)} × ${fmt(k.hoeheM)} m`)}
        ${zeile("Bauland (netto)", flaecheText(k.nettoM2), "Gebiet ohne Straßen, Bahn, Grün und Wasser")}
      </dl>
    </section>

    <section class="kz-block">
      <h4>Bebauung</h4>
      <dl>
        ${zeile("Gebäude", fmt(k.gebaeudeAnzahl), "ohne Nebengebäude")}
        ${zeile("Bebaute Fläche", flaecheText(k.bebaut), "Summe der Grundflächen")}
        ${zeile("Bebauungsanteil („GRZ“) brutto", fmt(k.grzBrutto, 2), "bebaute Fläche ÷ Gebietsfläche")}
        ${zeile("Bebauungsanteil („GRZ“) netto", fmt(k.grzNetto, 2), "bebaute Fläche ÷ Bauland")}
        ${zeile("Nebengebäude, Überdachungen", `${fmt(k.nebenAnzahl)} · ${flaecheText(k.nebenFlaeche)}`, "Garagen, Carports, Schuppen …, nicht oben enthalten")}
      </dl>
    </section>

    <section class="kz-block">
      <h4>Dichte</h4>
      <dl>
        ${zeile("Mittlere Geschosszahl", fmt(k.mittlereGeschosse, 1),
          `${fmt(k.geschaetzt)} von ${fmt(k.gebaeudeAnzahl)} Gebäuden (${prozent(k.gebaeudeAnzahl ? k.geschaetzt / k.gebaeudeAnzahl : 0, 0)}) ohne Angabe: geschätzt mit ${ERSATZ_GESCHOSSE} Geschossen` +
          (k.ausHoehe ? `; ${fmt(k.ausHoehe)} aus der Höhe ÷ 3 m` : ""))}
        ${zeile("Geschossfläche (geschätzt)", flaecheText(k.geschossflaeche), "Grundfläche × Geschosse")}
        ${zeile("Dichte („GFZ“) brutto", fmt(k.gfzBrutto, 2), "Geschossfläche ÷ Gebietsfläche")}
        ${zeile("Dichte („GFZ“) netto", fmt(k.gfzNetto, 2), "Geschossfläche ÷ Bauland")}
      </dl>
    </section>

    <section class="kz-block">
      <h4>Freiraum</h4>
      <dl>
        ${zeile("Grünanteil", prozent(k.gruenAnteil), `Grün- und Wasserflächen, davon Wasser ${prozent(k.wasserAnteil)}`)}
        ${zeile("Einzelbäume", fmt(k.baeume), "in OSM erfasst, oft unvollständig")}
        ${zeile("Kronenüberdeckung", "folgt", "kommt mit dem topoexport-Import (Kronengrößen)")}
      </dl>
    </section>

    <section class="kz-block">
      <h4>Straßennetz</h4>
      <dl>
        ${zeile("Straßenlänge gesamt", `${fmt(k.strassenGesamt)} m`)}
        ${Object.entries(STRASSEN_KATEGORIEN).map(([key, name]) => zeile(name, `${fmt(k.strassen[key])} m`)).join("")}
      </dl>
    </section>

    <section class="kz-block kz-breit">
      <h4>Flächenanteile</h4>
      ${balken(fa, k.gebietM2, (w) => prozent(w / k.gebietM2))}
      <p class="kz-hinweis">Straßenflächen sind aus den OSM-Straßenlinien mit typischen Breiten geschätzt
        (z. B. Hauptstraße 16–18 m, Wohnstraße 10 m, Fußweg 2,5 m). „Sonstige Freifläche“ sind Höfe, Gärten
        und Plätze ohne eigene Kategorie.</p>
    </section>

    <section class="kz-block kz-breit">
      <h4>Gebäude nach Nutzung <small>(Grundfläche, Anzahl in Klammern)</small></h4>
      ${balken(nutzungsListe, k.bebaut, flaecheText)}
      <p class="kz-hinweis">Die Nutzung stammt aus den OSM-Gebäudeangaben. Viele Gebäude sind dort nur als
        „Gebäude“ ohne Nutzung erfasst. Genauere Werte kommen später aus den amtlichen LoD2-Daten (Gebäudefunktion).</p>
    </section>
  `;
}
