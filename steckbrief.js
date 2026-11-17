/* ============================================================
   Ortsanalyse – Steckbrief eines Flurstücks (Reiter „Flurstücke“)
   Klick auf ein Flurstück → Kennzahlen nur für dieses Flurstück:
   Grunddaten, tatsächliche Nutzung, Bebauung (GRZ/GFZ), LoD2-Eigenschaften,
   Bodenrichtwert und grob geschätzter Bodenwert, Wohnen (Zensus-Zelle: Miete, Leerstand, Wohnfläche, Eigentum, Baujahr).
   ============================================================ */

const DACHFORMEN = {
  "1000": "Flachdach", "2100": "Pultdach", "2200": "Versetztes Pultdach", "3100": "Satteldach", "3200": "Walmdach",
  "3300": "Krüppelwalmdach", "3400": "Mansardendach", "3500": "Zeltdach", "3600": "Kegeldach", "3700": "Kuppeldach",
  "3800": "Sheddach", "3900": "Bogendach", "4000": "Turmdach", "5000": "Mischform", "9999": "Sonstige Dachform"
};
const BRW_NUTZUNGSART = {
  W: "Wohnbaufläche", WS: "Kleinsiedlungsgebiet", WR: "Reines Wohngebiet", WA: "Allgemeines Wohngebiet",
  WB: "Besonderes Wohngebiet", M: "Gemischte Baufläche", MD: "Dorfgebiet", MI: "Mischgebiet", MU: "Urbanes Gebiet",
  MK: "Kerngebiet", G: "Gewerbliche Baufläche", GE: "Gewerbegebiet", GI: "Industriegebiet", S: "Sonderbaufläche",
  SE: "Sondergebiet für Erholung", SO: "Sonstiges Sondergebiet", GB: "Gemeinbedarfsfläche", LW: "Landwirtschaft",
  A: "Acker", GR: "Grünland", F: "Forst"
};

const steckbriefBox = document.getElementById("flurstueck-info");

function schliesseSteckbrief() {
  steckbriefBox.hidden = true;
  if (planKarte && planKarte.getLayer("flst-auswahl")) markiereFlurstueck("");
}

// Fläche der Überschneidung zweier Flächen (0, wenn keine)
function ueberschneidung(a, b) {
  try {
    const teil = turf.intersect(turf.featureCollection([a, b]));
    return teil ? turf.area(teil) : 0;
  } catch (e) { return 0; }
}
const boxenBeruehren = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

function flurstueckKennzahlen(f, ergebnis) {
  const { daten, lod2 } = ergebnis;
  const box = turf.bbox(f);
  const flaeche = f.properties.flaeche || turf.area(f);
  const punkt = f.properties.mitte;

  // Tatsächliche Nutzung (ALKIS): Anteile der Nutzungsarten auf dem Flurstück
  const nutzung = new Map();
  for (const n of (daten.kataster ? daten.kataster.nutzung.features : [])) {
    if (!boxenBeruehren(box, turf.bbox(n))) continue;
    const a = ueberschneidung(f, n);
    if (a > 1) nutzung.set(n.properties.art, (nutzung.get(n.properties.art) || 0) + a);
  }

  // Gebäude (OSM-Grundrisse mit Geschossen aus LoD2 bzw. OSM): nur der Teil auf dem Flurstück zählt
  let grundflaeche = 0, geschossflaeche = 0, nebenflaeche = 0, anzahl = 0, maxGeschosse = 0, geschaetzt = false;
  for (const g of daten.gebaeude.features) {
    if (!boxenBeruehren(box, turf.bbox(g))) continue;
    const a = ueberschneidung(f, g);
    if (a < 1) continue;
    if (g.properties.art === "neben") { nebenflaeche += a; continue; }
    grundflaeche += a;
    geschossflaeche += a * g.properties.geschosse;
    if (a > 0.5 * g.properties.flaeche) anzahl++;
    maxGeschosse = Math.max(maxGeschosse, g.properties.geschosse);
    if (g.properties.geschosseQuelle === "ersatz") geschaetzt = true;
  }

  // LoD2-Gebäude, deren Mittelpunkt auf dem Flurstück liegt: Höhe, Dachform, Gebäudefunktion
  const amtlich = lod2.filter((g) => turf.booleanPointInPolygon(g.mitte, f));
  const hoehe = amtlich.length ? Math.max(...amtlich.map((g) => g.hoehe || 0)) : null;
  const dachformen = [...new Set(amtlich.map((g) => DACHFORMEN[g.dachform]).filter(Boolean))];
  const funktionen = [...new Set(amtlich.map((g) => NUTZUNGEN[alkisNutzung(g.funktion)] || (alkisNutzung(g.funktion) === "neben" ? "Überdachung" : null)).filter(Boolean))];

  // Bodenrichtwert: Bauland-Zone am Mittelpunkt des Flurstücks (sonst irgendeine Zone)
  const zonen = daten.kataster ? daten.kataster.bodenrichtwerte.features.filter((z) => turf.booleanPointInPolygon(punkt, z)) : [];
  const zone = zonen.find((z) => z.properties.zustand === "B") || zonen[0] || null;

  // Wohnen: Zensus-Zelle am Mittelpunkt
  const zelle = daten.zensus ? daten.zensus.features.find((z) => turf.booleanPointInPolygon(punkt, z)) : null;

  return { flaeche, nutzung, grundflaeche, geschossflaeche, nebenflaeche, anzahl, maxGeschosse, geschaetzt,
    hoehe, dachformen, funktionen, zone, zelle };
}

function zeigeSteckbrief(f) {
  if (!analyseErgebnis) return;
  const p = f.properties;
  const k = flurstueckKennzahlen(f, analyseErgebnis);
  const grz = k.grundflaeche / k.flaeche, gfz = k.geschossflaeche / k.flaeche;
  // Anteile auf die gezeichnete Fläche beziehen (die amtliche Fläche weicht oft leicht ab)
  const nutzungSumme = [...k.nutzung.values()].reduce((s, a) => s + a, 0);
  const nutzungen = [...k.nutzung].sort((a, b) => b[1] - a[1])
    .map(([art, a]) => `${art} ${prozent(a / nutzungSumme, 0)}`).join(", ");
  const z = k.zone && k.zone.properties;
  // Bodenwert nur für Bauland sinnvoll (nicht für Straßen, Plätze, Grün- und Wasserflächen)
  let bauland = 0;
  for (const [art, a] of k.nutzung) if (!NUTZUNG_KLASSE[art]) bauland += a;
  const istBauland = !k.nutzung.size || bauland > 0.5 * nutzungSumme;
  steckbriefBox.innerHTML = `
    <header>
      <h3>Flurstück ${p.nummer || "–"}</h3>
      <button class="btn btn-klein btn-ghost" id="steckbrief-zu" title="Schließen">✕</button>
    </header>
    <p class="steckbrief-unter">Gemarkung ${p.gemarkung || "–"}, Flur ${p.flur || "–"}</p>
    <section><h4>Grunddaten</h4><dl>
      ${zeile("Fläche (amtlich)", `${fmt(k.flaeche)} m²`)}
      ${zeile("Tatsächliche Nutzung", nutzungen || "–")}
    </dl></section>
    <section><h4>Bebauung</h4><dl>
      ${zeile("Gebäude", k.anzahl ? fmt(k.anzahl) : "keine", "überwiegend auf diesem Flurstück")}
      ${zeile("Grundfläche", `${fmt(k.grundflaeche)} m²`, k.nebenflaeche ? `dazu ${fmt(k.nebenflaeche)} m² Nebengebäude` : "")}
      ${zeile("GRZ (Flurstück)", fmt(grz, 2), "Grundfläche ÷ Flurstücksfläche")}
      ${zeile("GFZ (Flurstück)", fmt(gfz, 2), `Geschossfläche ÷ Flurstücksfläche${k.geschaetzt ? ", teils geschätzte Geschosse" : ""}`)}
      ${zeile("Geschosse (max.)", k.maxGeschosse ? fmt(k.maxGeschosse) : "–")}
      ${k.hoehe != null ? zeile("Gebäudehöhe (max., LoD2)", `${fmt(k.hoehe, 1)} m`) : ""}
      ${k.dachformen.length ? zeile("Dachform", k.dachformen.join(", ")) : ""}
      ${k.funktionen.length ? zeile("Gebäudefunktion (ALKIS)", k.funktionen.join(", ")) : ""}
    </dl></section>
    <section><h4>Bodenwert</h4><dl>
      ${z ? `
        ${zeile("Bodenrichtwert", `${fmt(z.wert)} €/m²`, `${BRW_NUTZUNGSART[z.art] || z.art || ""}${z.gfz ? `, wertrelevante GFZ ${fmt(z.gfz, 1)}` : ""}, Stichtag ${new Date(z.stichtag).toLocaleDateString("de-DE")}`)}
        ${istBauland
          ? zeile("Bodenwert (grob)", `ca. ${fmt(Math.round(z.wert * k.flaeche / 1000) * 1000)} €`, "Richtwert × Fläche, ohne Anpassung an Lage, Zuschnitt oder GFZ des Grundstücks")
          : zeile("Bodenwert", "–", "überwiegend Verkehrs-, Grün- oder Wasserfläche: der Richtwert gilt hier nicht sinnvoll")}`
        : zeile("Bodenrichtwert", "–", "keine Zone gefunden")}
    </dl></section>
    <section><h4>Wohnen (Zensus-Zelle)</h4><dl>
      ${k.zelle ? wohnenZeilen(k.zelle.properties) : zeile("Zensus 2022", "–", "keine Zelle mit Wohnungen")}
    </dl></section>`;
  steckbriefBox.hidden = false;
  document.getElementById("steckbrief-zu").addEventListener("click", schliesseSteckbrief);
  markiereFlurstueck(p.id);
}

// Werte der 100-m-Zensus-Zelle, in der der Mittelpunkt des Flurstücks liegt
function wohnenZeilen(p) {
  const zeilen = [];
  for (const [m, d] of Object.entries(ZENSUS_MERKMALE)) {
    if (m === "baujahr" || m === "vergleich" || p[m] == null) continue;
    zeilen.push(zeile(d.name, zensusWert(m, p[m]), p[`${m}Unsicher`] ? "unsicherer Wert (wenige Wohnungen)" : ""));
  }
  // Vergleichsmieten und Mietrechner
  const vergleich = Object.entries(VERGLEICH_FELDER).filter(([f]) => p[f] != null);
  if (vergleich.length) {
    zeilen.push(zeile("Miete vergleichbarer Wohnungen", "", vergleich.map(([f, v]) => `${v.text}: ${fmt(p[f], 2)} €/m²`).join(" · ")));
    const wahl = p[vergleichFeld()];
    zeilen.push(zeile(`Kaltmiete ${fmt(mietrechner.flaeche)} m², ${mietrechner.neu ? "ab" : "vor"} 1991`,
      wahl != null ? `ca. ${fmt(kaltmiete(wahl))} €` : "–",
      wahl != null ? `${fmt(wahl, 2)} €/m² × ${fmt(mietrechner.flaeche)} m² (einstellbar im Reiter „Wohnen“)` : "zu wenige vergleichbare Wohnungen in dieser Zelle"));
  }
  if (p.baujahr != null) {
    const liste = BAUJAHR_EPOCHEN.map(([name], i) => [name, p.baujahrEpochen[i]]).filter(([, a]) => a).map(([name, a]) => `${name}: ${a}`).join(", ");
    zeilen.push(zeile("Baualter", `überwiegend ${BAUJAHR_EPOCHEN[p.baujahr][0]}`, `Gebäude mit Wohnraum: ${liste}`));
  }
  zeilen.push(`<p class="steckbrief-unter">Durchschnitt der 100-m-Zelle am 15.05.2022, nicht nur dieses Flurstücks.</p>`);
  return zeilen.join("");
}

// Ausgewähltes Flurstück in der Akzentfarbe umranden ("" = keines)
function markiereFlurstueck(id) {
  try { planKarte.setFilter("flst-auswahl", ["==", ["get", "id"], id]); } catch (e) { /* Karte noch nicht fertig */ }
}

// Klick auf die Karte im Reiter „Flurstücke“ (wird nach dem Anlegen der Planansicht aufgerufen)
function steckbriefAnmelden() {
  planKarte.on("click", "flst-flaeche", (e) => {
    if (aktuellerPlan !== "flurstuecke" || !analyseErgebnis || !analyseErgebnis.daten.kataster) return;
    const id = e.features[0].properties.id;
    // das vollständige Flurstück (die Karte liefert nur Kachel-Ausschnitte)
    const f = analyseErgebnis.daten.kataster.flurstuecke.features.find((x) => x.properties.id === id);
    if (f) zeigeSteckbrief(f);
  });
  planKarte.on("mouseenter", "flst-flaeche", () => { if (aktuellerPlan === "flurstuecke") planKarte.getCanvas().style.cursor = "pointer"; });
  planKarte.on("mouseleave", "flst-flaeche", () => { planKarte.getCanvas().style.cursor = ""; });
}
