/* ============================================================
   Ortsanalyse – Diagramme (Reiter „Kennzahlen“)
   Eigene SVG-Diagramme im Stil der Pläne (Schwarz-Weiß, eine Akzentfarbe, feine Linien).
   Jedes Diagramm lässt sich als PNG speichern (export.js).
   Diagramme: Flächenanteile, Nutzung, Geschosse, Dachlandschaft, Baualter, Mieten,
   Flurstücksgrößen, Infrastruktur.
   ============================================================ */

const DG = { breite: 460, namenSpalte: 168, wertSpalte: 70, zeile: 24, balken: 12, schrift: "Helvetica Neue, Helvetica, Arial, sans-serif" };
const DG_FARBEN = { ink: "#111111", grau: "#9a9a9a", hell: "#cfcfcc", leer: "#ececea", gruen: "#a9c29b", wasser: "#9fb4c1", akzent: "#e2482d" };

let diagrammListe = []; // die zuletzt gezeichneten Diagramme (für den PNG-Export)

// Text sicher ins SVG schreiben
const svgText = (t) => String(t).replace(/[&<>"]/g, (z) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[z]);

// Waagerechte Balken: ein Balken je Eintrag, Wert rechts daneben.
// eintraege: [{ name, wert, farbe?, text? }]; max: Länge des längsten möglichen Balkens
function balkenSvg(eintraege, max) {
  const { breite, namenSpalte, wertSpalte, zeile, balken } = DG;
  const spur = breite - namenSpalte - wertSpalte - 8;
  const hoehe = eintraege.length * zeile + 6;
  const teile = eintraege.map((e, i) => {
    const y = 4 + i * zeile;
    const l = max > 0 ? Math.max(e.wert > 0 ? 1.5 : 0, (e.wert / max) * spur) : 0;
    const r = Math.min(4, l / 2);
    const by = y + (zeile - balken) / 2;
    // Balken an der Grundlinie (links) gerade, am Ende 4 px gerundet
    const form = l > 0 ? `M${namenSpalte},${by}h${l - r}a${r},${r} 0 0 1 ${r},${r}v${balken - 2 * r}a${r},${r} 0 0 1 -${r},${r}h-${l - r}Z` : "";
    return `<g><title>${svgText(e.name)}: ${svgText(e.text)}</title>
      <rect x="0" y="${y}" width="${breite}" height="${zeile}" fill="transparent"/>
      <text x="${namenSpalte - 8}" y="${y + zeile / 2 + 4}" text-anchor="end" class="dg-name">${svgText(e.name)}</text>
      <line x1="${namenSpalte}" y1="${by + balken / 2}" x2="${namenSpalte + spur}" y2="${by + balken / 2}" stroke="#ececea" stroke-width="${balken}"/>
      ${form ? `<path d="${form}" fill="${e.farbe || DG_FARBEN.ink}"${e.farbe === DG_FARBEN.leer || e.farbe === "#ffffff" ? ` stroke="#c8c8c5" stroke-width="0.6"` : ""}/>` : ""}
      <text x="${namenSpalte + spur + 8}" y="${y + zeile / 2 + 4}" class="dg-wert">${svgText(e.text)}</text></g>`;
  }).join("");
  return { svg: teile, breite, hoehe };
}

// Senkrechte Säulen, gestapelt aus mehreren Reihen (z. B. Geschosse: amtlich / geschätzt)
// klassen: Namen unter den Säulen; reihen: [{ name, farbe, werte[] }]
function saeulenSvg(klassen, reihen) {
  const breite = DG.breite, hoehe = 190, unten = 30, oben = 16, links = 34;
  const summen = klassen.map((_, i) => reihen.reduce((s, r) => s + r.werte[i], 0));
  const max = Math.max(1, ...summen);
  const schritt = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((s) => max / s <= 5) || 1000;
  const oberkante = Math.ceil(max / schritt) * schritt;
  const feld = (breite - links - 8) / klassen.length;
  const sb = Math.min(34, feld - 8);
  const Y = (v) => oben + (hoehe - oben - unten) * (1 - v / oberkante);
  const teile = [];
  for (let v = 0; v <= oberkante; v += schritt) {
    teile.push(`<line x1="${links}" y1="${Y(v)}" x2="${breite - 4}" y2="${Y(v)}" stroke="${v ? "#ececea" : "#111"}" stroke-width="${v ? 1 : 0.8}"/>`
      + `<text x="${links - 6}" y="${Y(v) + 3.5}" text-anchor="end" class="dg-achse">${fmt(v)}</text>`);
  }
  klassen.forEach((name, i) => {
    const x = links + i * feld + (feld - sb) / 2;
    let basis = 0;
    const stapel = reihen.map((r, j) => {
      const w = r.werte[i];
      if (!w) return "";
      const y0 = Y(basis), y1 = Y(basis + w);
      basis += w;
      const letzte = !reihen.slice(j + 1).some((q) => q.werte[i]);
      const h = y0 - y1 - (letzte ? 0 : 2); // 2 px Lücke zwischen gestapelten Teilen
      const r4 = letzte ? Math.min(4, h / 2, sb / 2) : 0;
      return `<path d="M${x},${y0}v-${h - r4}a${r4},${r4} 0 0 1 ${r4},-${r4}h${sb - 2 * r4}a${r4},${r4} 0 0 1 ${r4},${r4}v${h - r4}Z" fill="${r.farbe}"/>`;
    }).join("");
    const tipp = reihen.map((r) => `${r.name}: ${fmt(r.werte[i])}`).join(", ");
    teile.push(`<g><title>${svgText(name)}: ${svgText(tipp)}</title><rect x="${links + i * feld}" y="${oben}" width="${feld}" height="${hoehe - oben}" fill="transparent"/>${stapel}
      <text x="${x + sb / 2}" y="${hoehe - unten + 16}" text-anchor="middle" class="dg-achse">${svgText(name)}</text>
      ${summen[i] ? `<text x="${x + sb / 2}" y="${Y(summen[i]) - 5}" text-anchor="middle" class="dg-wert">${fmt(summen[i])}</text>` : ""}</g>`);
  });
  return { svg: teile.join(""), breite, hoehe };
}

// Legende für Diagramme mit mehreren Reihen
const dgLegende = (reihen) => `<div class="dg-legende">${reihen.map((r) =>
  `<span><i style="background:${r.farbe}"></i>${svgText(r.name)}</span>`).join("")}</div>`;

// ---------- Die einzelnen Diagramme ----------
function diagrammDaten(k) {
  const erg = analyseErgebnis;
  const daten = erg ? erg.daten : null;
  const liste = [];

  // 1. Flächenanteile
  const a = k.anteile;
  liste.push({ id: "flaechen", titel: "Flächenanteile", unter: "Anteil an der Gebietsfläche",
    quelle: k.nutzungAlkis ? "ALKIS (LGLN), OSM" : "OSM", ...balkenSvg([
      ["Gebäude", a.gebaeude, DG_FARBEN.ink], ["Nebengebäude", a.neben, DG_FARBEN.grau], ["Grün", a.gruen, DG_FARBEN.gruen],
      ["Wasser", a.wasser, DG_FARBEN.wasser], ["Verkehr", a.verkehr, DG_FARBEN.hell], ["Bahn", a.bahn, "#8a8a8a"],
      ["Sonstige Freifläche", a.leer, DG_FARBEN.leer]
    ].map(([name, wert, farbe]) => ({ name, wert, farbe, text: prozent(wert / k.gebietM2) })), k.gebietM2) });

  // 2. Gebäude nach Nutzung (Grundfläche)
  const NUTZ_FARBEN = { wohnen: DG_FARBEN.ink, gewerbe: DG_FARBEN.akzent, oeffentlich: "#555", kirche: "#888", sonstige: "#b5b5b5", unbekannt: "#dcdcdc" };
  const nutzung = Object.entries(NUTZUNGEN).map(([key, name]) => ({ name, wert: k.nutzungen[key].flaeche, farbe: NUTZ_FARBEN[key],
    text: `${prozent(k.bebaut ? k.nutzungen[key].flaeche / k.bebaut : 0, 0)} · ${fmt(k.nutzungen[key].anzahl)}` })).filter((e) => e.wert > 0);
  if (nutzung.length) liste.push({ id: "nutzung", titel: "Gebäude nach Nutzung", unter: "Anteil an der Grundfläche · Anzahl Gebäude",
    quelle: k.nutzungAmtlich ? "ALKIS-Gebäudefunktion (LoD2), OSM" : "OSM", ...balkenSvg(nutzung, k.bebaut) });

  // 3. Geschosse (Höhenverteilung): amtlich bzw. aus OSM-Angaben, geschätzt
  if (daten) {
    const klassen = ["1", "2", "3", "4", "5", "6", "7", "8+"];
    const gemessen = klassen.map(() => 0), geschaetzt = klassen.map(() => 0);
    for (const f of daten.gebaeude.features) {
      if (f.properties.art !== "haupt") continue;
      const i = Math.min(7, Math.max(1, f.properties.geschosse) - 1);
      (f.properties.geschosseQuelle === "ersatz" ? geschaetzt : gemessen)[i]++;
    }
    const reihen = [{ name: "aus LoD2-Höhe bzw. OSM-Angabe", farbe: DG_FARBEN.ink, werte: gemessen },
      { name: `geschätzt (${ERSATZ_GESCHOSSE} Geschosse)`, farbe: DG_FARBEN.hell, werte: geschaetzt }];
    liste.push({ id: "geschosse", titel: "Geschosse", unter: "Anzahl Gebäude je Geschosszahl", quelle: "LGLN LoD2, OSM",
      reihen, legende: dgLegende(reihen), ...saeulenSvg(klassen, reihen) });
  }

  // 4. Dachlandschaft (LoD2)
  if (erg && erg.lod2.length) {
    const zaehler = new Map();
    for (const g of erg.lod2) {
      const name = DACHFORMEN[g.dachform] || (g.quelle === "topoexport" ? "ohne Angabe (topoexport)" : "ohne Angabe");
      zaehler.set(name, (zaehler.get(name) || 0) + 1);
    }
    let formen = [...zaehler].sort((x, y) => y[1] - x[1]);
    if (formen.length > 8) formen = [...formen.slice(0, 7), ["Weitere", formen.slice(7).reduce((s, f) => s + f[1], 0)]];
    const summe = erg.lod2.length;
    liste.push({ id: "daecher", titel: "Dachlandschaft", unter: "Dachformen der LoD2-Gebäude (auch Gebäudeteile)", quelle: "LGLN, 3D-Gebäudemodell LoD2",
      ...balkenSvg(formen.map(([name, wert], i) => ({ name, wert, farbe: i ? "#6b6b6b" : DG_FARBEN.ink, text: `${fmt(wert)} · ${prozent(wert / summe, 0)}` })), formen[0][1]) });
  }

  // 5. Baualter (Zensus)
  const z = k.zensus || {};
  if (z.baujahr) {
    liste.push({ id: "baualter", titel: "Baualter", unter: `Gebäude mit Wohnraum (${fmt(z.baujahr.gebaeude)})`, quelle: "Zensus 2022",
      ...balkenSvg(BAUJAHR_EPOCHEN.map(([name], i) => ({ name, wert: z.baujahr.epochen[i], farbe: BAUJAHR_FARBEN[i],
        text: prozent(z.baujahr.epochen[i] / z.baujahr.gebaeude, 0) })), Math.max(...z.baujahr.epochen)) });
  }

  // 6. Mieten (Zensus): Durchschnitt und die vier Vergleichsmieten
  const mieten = [];
  if (z.miete) mieten.push({ name: "alle Wohnungen", wert: z.miete.mittel, farbe: DG_FARBEN.ink, text: `${fmt(z.miete.mittel, 2)} €/m²` });
  if (z.vergleich) for (const [feld, f] of Object.entries(VERGLEICH_FELDER)) {
    if (z.vergleich[feld]) mieten.push({ name: f.text, wert: z.vergleich[feld].mittel, farbe: "#6b6b6b", text: `${fmt(z.vergleich[feld].mittel, 2)} €/m²` });
  }
  if (mieten.length) liste.push({ id: "mieten", titel: "Nettokaltmiete", unter: "Mittel der 100-m-Zellen, Bestandsmieten 2022", quelle: "Zensus 2022 (destatis)",
    ...balkenSvg(mieten, Math.max(...mieten.map((m) => m.wert)) * 1.05) });

  // 7. Flurstücksgrößen („Körnung“)
  if (daten && daten.kataster) {
    const grenzen = [100, 250, 500, 1000, 2500, 5000];
    const namen = ["unter 100", "100–250", "250–500", "500–1.000", "1.000–2.500", "2.500–5.000", "ab 5.000"];
    const anzahl = namen.map(() => 0);
    for (const f of daten.kataster.flurstuecke.features) {
      if (!f.properties.imGebiet || !(f.properties.flaeche > 0)) continue;
      let i = grenzen.findIndex((g) => f.properties.flaeche < g);
      if (i < 0) i = grenzen.length;
      anzahl[i]++;
    }
    const summe = anzahl.reduce((s, x) => s + x, 0);
    if (summe) liste.push({ id: "flurstuecke", titel: "Flurstücksgrößen", unter: `Anzahl Flurstücke je Größe in m² (${fmt(summe)})`, quelle: "ALKIS (LGLN)",
      ...balkenSvg(namen.map((name, i) => ({ name: `${name} m²`, wert: anzahl[i], farbe: DG_FARBEN.ink, text: `${fmt(anzahl[i])} · ${prozent(anzahl[i] / summe, 0)}` })), Math.max(...anzahl)) });
  }

  // 8. Infrastruktur je Ebene
  if (k.infraAnzahl) {
    const ebenen = Object.entries(INFRA_EBENEN).map(([e, d]) => ({ name: d.name, farbe: d.farbe,
      wert: INFRA_ARTEN.filter(([art, eb]) => eb === e).reduce((s, [art]) => s + (k.infraAnzahl[art] || 0), 0) }));
    ebenen.forEach((e) => { e.text = fmt(e.wert); });
    liste.push({ id: "infrastruktur", titel: "Infrastruktur", unter: "Anzahl Orte je Ebene", quelle: "© OpenStreetMap-Mitwirkende (ODbL)",
      ...balkenSvg(ebenen, Math.max(1, ...ebenen.map((e) => e.wert))) });
  }
  return liste;
}

// Vollständiges SVG eines Diagramms (für Anzeige und Export)
function diagrammSvg(d, mitKopf) {
  const kopf = mitKopf ? 44 : 0, fuss = mitKopf ? 22 + (d.legende ? 18 : 0) : 0;
  const H = d.hoehe + kopf + fuss;
  const stil = `<style>text{font-family:${DG.schrift};fill:#111}.dg-name{font-size:12px}.dg-wert{font-size:11px;fill:#333}
    .dg-achse{font-size:10px;fill:#555}.dg-titel{font-size:15px;font-weight:600}.dg-unter{font-size:11px;fill:#555}.dg-quelle{font-size:9px;fill:#777}</style>`;
  const legende = mitKopf && d.reihen
    ? d.reihen.map((r, i) => `<rect x="${i * 220}" y="${kopf + d.hoehe + 6}" width="10" height="10" fill="${r.farbe}"/>`
      + `<text x="${i * 220 + 15}" y="${kopf + d.hoehe + 15}" class="dg-achse">${svgText(r.name)}</text>`).join("") : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${d.breite}" height="${H}" viewBox="0 0 ${d.breite} ${H}">${stil}
    ${mitKopf ? `<rect width="${d.breite}" height="${H}" fill="#fff"/><text x="0" y="16" class="dg-titel">${svgText(d.titel)}</text>
      <text x="0" y="33" class="dg-unter">${svgText(d.unter)}</text>` : ""}
    <g transform="translate(0,${kopf})">${d.svg}</g>${legende}
    ${mitKopf ? `<text x="0" y="${H - 4}" class="dg-quelle">Quelle: ${svgText(d.quelle)} · Ortsanalyse</text>` : ""}</svg>`;
}

// Abschnitt „Diagramme“ für die Kennzahlen-Tafel
function diagrammeHtml(k) {
  diagrammListe = diagrammDaten(k);
  if (!diagrammListe.length) return "";
  return `<section class="kz-block kz-breit dg-bereich">
      <h4>Diagramme</h4>
      <div class="dg-raster">${diagrammListe.map((d) => `
        <figure class="dg-karte">
          <figcaption><strong>${d.titel}</strong><small>${d.unter}</small></figcaption>
          ${diagrammSvg(d, false)}
          ${d.legende || ""}
          <footer><span>Quelle: ${d.quelle}</span></footer>
        </figure>`).join("")}</div>
    </section>`;
}
