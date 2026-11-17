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

  if (daten.kataster && daten.kataster.nutzung.features.length) {
    // Amtliche tatsächliche Nutzung (ALKIS): lückenlos und ohne Überlappung, darum genauer als OSM
    for (const klasse of ["gruen", "wasser", "verkehr", "bahn"]) {
      daten.kataster.nutzung.features.filter((f) => f.properties.klasse === klasse).forEach((f) => flaeche(f, klasse));
    }
    daten.gebaeude.features.forEach((f) => flaeche(f, f.properties.art === "neben" ? "neben" : "gebaeude"));
    return zaehle();
  }

  // Reihenfolge: Grün → Wasser → Verkehr → Bahn → Gebäude
  daten.gruen.features.filter((f) => f.properties.kategorie !== "wasser").forEach((f) => flaeche(f, "gruen"));
  daten.gruen.features.filter((f) => f.properties.kategorie === "wasser").forEach((f) => flaeche(f, "wasser"));
  daten.wasserLinien.features.forEach((f) => linie(f, "wasser", f.properties.breite));
  daten.verkehrsflaechen.features.forEach((f) => flaeche(f, "verkehr"));
  if (daten.strassenAmtlich) {
    // Amtliche Straßenflächen; OSM-Straßen nur außerhalb davon, schmale Wege überall
    daten.strassenAmtlich.features.forEach((f) => flaeche(f, "verkehr"));
    daten.strassenAussen.features.filter((f) => f.properties.breite >= 5).forEach((f) => linie(f, "verkehr", f.properties.breite));
    daten.strassen.features.filter((f) => f.properties.breite < 5).forEach((f) => linie(f, "verkehr", f.properties.breite));
  } else {
    daten.strassen.features.forEach((f) => linie(f, "verkehr", f.properties.breite));
  }
  daten.bahn.features.forEach((f) => (f.properties.art === "bahnflaeche" ? flaeche(f, "bahn") : linie(f, "bahn", f.properties.breite)));
  daten.gebaeude.features.forEach((f) => flaeche(f, f.properties.art === "neben" ? "neben" : "gebaeude"));
  return zaehle();

  // Pixel zählen
  function zaehle() {
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
  const ausLod2 = haupt.filter((f) => f.properties.geschosseQuelle === "lod2").length;
  const nutzungAmtlich = haupt.filter((f) => f.properties.nutzungQuelle === "lod2").length;

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
    geschaetzt, ausHoehe, ausLod2, nutzungAmtlich,
    geschossflaeche,
    gfzBrutto: geschossflaeche / gebietM2,
    gfzNetto: nettoM2 > 0 ? geschossflaeche / nettoM2 : null,
    gruenAnteil: (anteile.gruen + anteile.wasser) / gebietM2,
    wasserAnteil: anteile.wasser / gebietM2,
    baeume: daten.baeume.features.length,
    strassen,
    strassenGesamt: Object.values(strassen).reduce((a, b) => a + b, 0),
    anteile,
    nutzungen,
    strassenAmtlich: !!daten.strassenAmtlich,
    nutzungAlkis: !!(daten.kataster && daten.kataster.nutzung.features.length),
    ...katasterKennzahlen(daten.kataster),
    ...zensusKennzahlen(daten.zensus),
    ...infraKennzahlen(daten.infra, bbox)
  };
}

// Flurstücke („Körnung“) und Bodenrichtwerte
function katasterKennzahlen(kataster) {
  if (!kataster) return {};
  const parzellen = kataster.flurstuecke.features.filter((f) => f.properties.imGebiet && f.properties.flaeche > 0)
    .map((f) => f.properties.flaeche).sort((a, b) => a - b);
  const zonen = kataster.bodenrichtwerte.features.filter((f) => f.properties.wert > 0);
  // Mittlerer Bodenrichtwert: nach Fläche gewichtet, nur baureifes Land (Entwicklungszustand B)
  const bauland = zonen.filter((f) => f.properties.zustand === "B");
  const flaechen = bauland.map((f) => turf.area(f));
  const summe = flaechen.reduce((a, b) => a + b, 0);
  const werte = bauland.map((f) => f.properties.wert);
  return {
    parzellenAnzahl: parzellen.length,
    parzellenMittel: parzellen.length ? parzellen.reduce((a, b) => a + b, 0) / parzellen.length : null,
    parzellenMedian: parzellen.length ? parzellen[Math.floor(parzellen.length / 2)] : null,
    brwZonen: zonen.length,
    brwMittel: summe ? bauland.reduce((s, f, i) => s + f.properties.wert * flaechen[i], 0) / summe : null,
    brwMin: werte.length ? Math.min(...werte) : null,
    brwMax: werte.length ? Math.max(...werte) : null,
    brwStichtag: zonen.length ? zonen.map((f) => f.properties.stichtag).sort().pop() : null
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

// Block „Wohnen (Zensus 2022)“: Miete ausführlich, die übrigen Merkmale als Mittelwert mit Spanne, Baualter als Balken
function wohnenBlock(z) {
  const zeilen = [];
  if (z.miete) {
    const m = z.miete;
    zeilen.push(zeile("Mittlere Nettokaltmiete", zensusWert("miete", m.mittel), "Durchschnitt der 100-m-Rasterzellen, Bestandsmieten"));
    zeilen.push(zeile("Typische Nettokaltmiete", zensusWert("miete", m.median), "Median der Rasterzellen"));
    zeilen.push(zeile("Spanne der Miete", `${fmt(m.min, 2)}–${zensusWert("miete", m.max)}`,
      `${fmt(m.zellen)} Zellen${m.unsicher ? `, davon ${fmt(m.unsicher)} mit unsicherem Wert (wenige Wohnungen)` : ""}`));
  }
  if (z.vergleich) {
    // Vergleichsmieten nach Baualter und Größe (Mittel der Zellen), dazu die Beispielwohnung aus dem Mietrechner
    for (const [feld, f] of Object.entries(VERGLEICH_FELDER)) {
      const m = z.vergleich[feld];
      if (m) zeilen.push(zeile(`Miete ${f.text}`, zensusWert("vergleich", m.mittel), `Mittel aus ${fmt(m.zellen)} Zellen, Spanne ${fmt(m.min, 2)}–${fmt(m.max, 2)} €/m²`));
    }
    const wahl = z.vergleich[vergleichFeld()];
    if (wahl) zeilen.push(zeile(`Beispielwohnung ${fmt(mietrechner.flaeche)} m², ${mietrechner.neu ? "ab" : "vor"} 1991`,
      `ca. ${fmt(kaltmiete(wahl.mittel))} € kalt`, "Mietrechner im Reiter „Wohnen“ (Knopf „Miete vergleichbar“)"));
  }
  for (const key of ["leerstand", "flaecheWohnung", "flaecheBewohner", "eigentum"]) {
    if (!z[key]) continue;
    const d = ZENSUS_MERKMALE[key], m = z[key];
    zeilen.push(zeile(d.name, zensusWert(key, m.mittel),
      `${d.erklaerung}; Mittel aus ${fmt(m.zellen)} Zellen, Spanne ${fmt(m.min, d.stellen)}–${zensusWert(key, m.max)}`));
  }
  const b = z.baujahr;
  return `
    <section class="kz-block">
      <h4>Wohnen (Zensus 2022)</h4>
      <dl>${zeilen.join("")}</dl>
      ${b ? `
        <p class="kz-hinweis">Baualter der ${fmt(b.gebaeude)} Gebäude mit Wohnraum, überwiegend ${BAUJAHR_EPOCHEN[b.ueberwiegend][0]}:</p>
        <div class="kz-balken kz-balken-schmal">${BAUJAHR_EPOCHEN.map(([name], i) => `
          <div class="kz-balken-zeile">
            <span class="kz-balken-name">${name}</span>
            <span class="kz-balken-spur"><span class="kz-balken-wert" style="width:${(b.epochen[i] / b.gebaeude) * 100}%;background:${BAUJAHR_FARBEN[i]}"></span></span>
            <span class="kz-balken-zahl">${prozent(b.epochen[i] / b.gebaeude, 0)}</span>
          </div>`).join("")}</div>` : ""}
      <p class="kz-hinweis">Stichtag 15.05.2022. Werte je 100-m-Rasterzelle; Mittelwerte sind ungewichtete Durchschnitte der Zellen.
        ${Object.values(z.quellen || {}).includes("destatis") ? "Vergleichsmieten, Baualter, Fläche je Wohnung und Eigentümerquote live von destatis („Mietvergleich“)." : ""}</p>
    </section>`;
}

// Block „Infrastruktur (OSM)“: Anzahl je Art (nur vorhandene), gruppiert nach Ebene, dazu die Abdeckung der Einzugsradien
function infraBlock(k) {
  const zeilen = Object.entries(INFRA_RADIEN).map(([key, r]) =>
    zeile(`Gebiet im ${r.radius}-m-Radius um ${r.name}`, prozent(k.infraAbdeckung[key], 0), "Luftlinie, Anteil der Gebietsfläche"));
  for (const [e, d] of Object.entries(INFRA_EBENEN)) {
    const arten = INFRA_ARTEN.filter(([art, ebene]) => ebene === e && k.infraAnzahl[art]);
    if (!arten.length) continue;
    zeilen.push(zeile(d.name, fmt(arten.reduce((s, [art]) => s + k.infraAnzahl[art], 0)),
      arten.map(([art, , name]) => `${name} ${fmt(k.infraAnzahl[art])}`).join(" · ")));
  }
  return `
    <section class="kz-block">
      <h4>Infrastruktur (OSM)</h4>
      <dl>${zeilen.join("")}</dl>
      <p class="kz-hinweis">Orte aus OpenStreetMap im Gebiet. OSM ist hier oft unvollständig, besonders bei Bänken und Mülleimern.</p>
    </section>`;
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
    [k.nutzungAlkis ? "Verkehr" : "Verkehr (geschätzt)", a.verkehr, "f-verkehr"],
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
          (k.ausLod2 ? `${fmt(k.ausLod2)} Gebäude aus der amtlichen Traufhöhe (LoD2) ÷ 3 m; ` : "") +
          `${fmt(k.geschaetzt)} von ${fmt(k.gebaeudeAnzahl)} Gebäuden (${prozent(k.gebaeudeAnzahl ? k.geschaetzt / k.gebaeudeAnzahl : 0, 0)}) ohne Angabe: geschätzt mit ${ERSATZ_GESCHOSSE} Geschossen` +
          (k.ausHoehe ? `; ${fmt(k.ausHoehe)} aus der OSM-Höhe ÷ 3 m` : ""))}
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

    ${k.parzellenAnzahl ? `
    <section class="kz-block">
      <h4>Parzellen (ALKIS)</h4>
      <dl>
        ${zeile("Flurstücke", fmt(k.parzellenAnzahl), "mit Mittelpunkt im Gebiet")}
        ${zeile("Mittlere Flurstücksgröße", `${fmt(k.parzellenMittel)} m²`, "Durchschnitt aller Flurstücke („Körnung“)")}
        ${zeile("Typische Flurstücksgröße", `${fmt(k.parzellenMedian)} m²`, "Median: die Hälfte ist kleiner, die Hälfte größer")}
      </dl>
    </section>` : ""}

    ${k.brwZonen ? `
    <section class="kz-block">
      <h4>Bodenrichtwerte (BORIS-NI)</h4>
      <dl>
        ${zeile("Mittlerer Bodenrichtwert", k.brwMittel ? `${fmt(k.brwMittel)} €/m²` : "–", "nach Fläche gewichtet, baureifes Land")}
        ${zeile("Spanne", k.brwMin != null ? `${fmt(k.brwMin)}–${fmt(k.brwMax)} €/m²` : "–", `${fmt(k.brwZonen)} Zonen im Gebiet`)}
        ${zeile("Stichtag", k.brwStichtag ? new Date(k.brwStichtag).toLocaleDateString("de-DE") : "–")}
      </dl>
    </section>` : ""}

    ${k.zensus && Object.keys(k.zensus).length ? wohnenBlock(k.zensus) : ""}

    ${k.infraAnzahl ? infraBlock(k) : ""}

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
      <p class="kz-hinweis">${k.nutzungAlkis
        ? "Grün-, Wasser-, Verkehrs- und Bahnflächen stammen aus der amtlichen tatsächlichen Nutzung (ALKIS, LGLN)."
        : k.strassenAmtlich
        ?"Straßenflächen stammen aus den amtlichen Daten (LGLN, über topoexport), schmale Wege und Bereiche außerhalb sind aus OSM geschätzt."
        : "Straßenflächen sind aus den OSM-Straßenlinien mit typischen Breiten geschätzt (z. B. Hauptstraße 16–18 m, Wohnstraße 10 m, Fußweg 2,5 m)."}
        „Sonstige Freifläche“ sind Höfe, Gärten und Plätze ohne eigene Kategorie.</p>
    </section>

    <section class="kz-block kz-breit">
      <h4>Gebäude nach Nutzung <small>(Grundfläche, Anzahl in Klammern)</small></h4>
      ${balken(nutzungsListe, k.bebaut, flaecheText)}
      <p class="kz-hinweis">${k.nutzungAmtlich
        ? `Bei ${fmt(k.nutzungAmtlich)} von ${fmt(k.gebaeudeAnzahl)} Gebäuden stammt die Nutzung aus der amtlichen Gebäudefunktion (ALKIS, über LoD2), sonst aus OSM.`
        : "Die Nutzung stammt aus den OSM-Gebäudeangaben. Viele Gebäude sind dort nur als „Gebäude“ ohne Nutzung erfasst. Genauere Werte liefern amtliche LoD2-Daten (Gebäudefunktion)."}</p>
    </section>

    ${diagrammeHtml(k)}
  `;
}
