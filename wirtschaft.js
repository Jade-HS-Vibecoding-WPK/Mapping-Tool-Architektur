/* ============================================================
   Ortsanalyse – Wirtschaftlichkeit (Reiter "Wirtschaftlichkeit")

   Eine Flurstückskarte, in der man ein Flurstück anklickt und alles Wichtige kompakt sieht (Steckbrief mit Luftbild-Ausschnitt,
   Fläche, Bodenrichtwert, Bestand, Miete) und darunter eine Wirtschaftlichkeitsrechnung bekommt:

     A) BESTAND: Ertragswert nach dem Prinzip der Immobilienwertermittlung (ImmoWertV): Bodenwert + Gebäudeertragswert, mit Rendite.
     B) NEUBAU-POTENZIAL: Was wäre auf dem Grundstück möglich (Geschossfläche aus der Richtwert-GFZ, KEIN Bebauungsplan),
        was kostet es, was wäre es danach wert, bleibt ein Ergebnis, und was dürfte das Grundstück höchstens kosten (Residualwert).

   Woher die Zahlen kommen (jedes Eingabefeld zeigt seine Quelle):
     - Daten je Flurstück: Fläche und Bodenrichtwert (LGLN), Gebäude (OpenStreetMap, LoD2), Miete, Wohnungsgröße und Baujahr (Zensus 2022).
     - Amtliche Werte: Liegenschaftszins (Gutachterausschuss Niedersachsen), Gesamtnutzungsdauer, Bewirtschaftungskosten und
       Normalherstellungskosten (ImmoWertV), Umrechnung Wohnfläche zu Brutto-Grundfläche (BewG), Baupreisindex (Destatis),
       Mietspiegel Oldenburg 2025, Grunderwerbsteuer Niedersachsen.
     - Marktangaben ohne amtliche Quelle (Notar- und Grundbuchkosten, Abbruchkosten) und eigene Annahmen sind als solche gekennzeichnet.

   Grenzen: Überschlagsrechnung für das Studium: kein Gutachten, keine Bewertung, keine Anlageberatung. Die Geschossfläche aus der
   Richtwert-GFZ ersetzt keinen Bebauungsplan. Die Normalherstellungskosten (Preisstand 2010, mit Baupreisindex fortgeschrieben) liegen oft
   unter den tatsächlichen Marktpreisen für Neubau; wer bessere Zahlen hat (z. B. BKI), trägt sie ein.
   ============================================================ */

"use strict";

// ---------- 0. Feste Werte aus amtlichen Quellen ----------
const WIRT_JAHR = new Date().getFullYear();   // Stichtagsjahr für das Alter der Gebäude

// Normalherstellungskosten 2010 (ImmoWertV Anlage 4), € je m² Brutto-Grundfläche, Standardstufe 3, 4, 5.
// Enthalten: Kostengruppen 300 und 400, Umsatzsteuer und Baunebenkosten (19 %).
const NHK_2010 = { "4.1": [825, 985, 1190], "4.2": [765, 915, 1105], "4.3": [755, 900, 1090] };   // 4.1: bis 6 Wohnungen, 4.2: 7 bis 20, 4.3: mehr als 20
// Baupreisindex für Wohngebäude (Neubau, konventionell, inkl. USt, Destatis, 2021 = 100): August 2026 und Jahresdurchschnitt 2010.
const BPI_AKTUELL = 141.7, BPI_2010 = 70.8, BPI_STAND = "August 2026";
const NHK_FAKTOR = BPI_AKTUELL / BPI_2010;     // 2,0014: Preisstand 2010 auf heute

// Mietspiegel Oldenburg 2025, Tabelle 1: Basis-Nettokaltmiete in €/m² und Monat für 20 bis 200 m² Wohnfläche (ausgelesen aus der Broschüre)
const MIETSPIEGEL_BASIS = [12.98,12.61,12.27,11.97,11.70,11.43,11.21,11.00,10.80,10.62,10.45,10.30,10.16,10.03,9.91,9.79,9.69,9.58,9.50,9.41,9.32,9.25,9.18,9.11,9.05,8.99,8.93,8.89,8.83,8.79,8.74,8.70,8.67,8.62,8.59,8.56,8.54,8.50,8.48,8.45,8.43,8.41,8.38,8.37,8.35,8.33,8.32,8.31,8.29,8.28,8.27,8.25,8.24,8.23,8.22,8.22,8.21,8.20,8.20,8.19,8.19,8.19,8.18,8.18,8.18,8.17,8.17,8.17,8.17,8.17,8.17,8.17,8.17,8.17,8.17,8.17,8.17,8.17,8.18,8.18,8.18,8.18,8.19,8.19,8.19,8.19,8.20,8.20,8.21,8.21,8.21,8.22,8.22,8.22,8.23,8.23,8.24,8.24,8.25,8.25,8.27,8.27,8.28,8.28,8.29,8.29,8.30,8.30,8.31,8.31,8.32,8.32,8.33,8.34,8.34,8.35,8.35,8.36,8.36,8.37,8.37,8.38,8.38,8.40,8.41,8.41,8.42,8.42,8.43,8.43,8.44,8.44,8.45,8.46,8.46,8.47,8.47,8.48,8.48,8.49,8.49,8.50,8.50,8.52,8.52,8.53,8.53,8.54,8.54,8.55,8.55,8.56,8.56,8.57,8.57,8.58,8.58,8.59,8.59,8.59,8.60,8.60,8.61,8.61,8.62,8.62,8.62,8.64,8.64,8.65,8.65,8.65,8.66,8.66,8.66,8.67,8.67,8.67,8.68,8.68,8.68];
const mietspiegelBasis = (wohnflaeche) => MIETSPIEGEL_BASIS[Math.min(200, Math.max(20, Math.round(wohnflaeche))) - 20];

// ---------- 1. Annahmen mit Quelle ----------
// art: "amtlich" = Gesetz, Verordnung, Gutachterausschuss, Statistik; "markt" = Marktangabe ohne amtliche Quelle; "annahme" = eigene Annahme.
const U_GAG = "https://www.gag.niedersachsen.de/download/214752/Praesentation_der_Landesgrundstuecks-_marktdaten_2025.pdf";
const U_IMMO1 = "https://gesetze.legal/bund/immowertv/anlage_1";
const U_IMMO3 = "https://gesetze.legal/bund/immowertv/anlage_3";
const U_IMMO4 = "https://gesetze.legal/bund/immowertv/anlage_4";
const U_BEWG = "https://www.gesetze-im-internet.de/bewg/anlage_24.html";
const U_MIET = "https://serviceportal.oldenburg.de/buergerservice/dienstleistungen/mietspiegel-900001660-36200.html";
const U_BPI = "https://www.destatis.de/DE/Themen/Wirtschaft/Preise/Baupreise-Immobilienpreisindex/_inhalt.html";
const U_NK = "https://www.flurcheck.de/kaufnebenkosten/niedersachsen/";
const U_ABBR = "https://neu-west.com/abbruch-kosten/";

const WIRT_GRUPPEN = [
  { name: "Zins und Nutzungsdauer", felder: [
    { k: "lz", name: "Liegenschaftszins", einheit: "%", schritt: 0.1, std: 2.2, art: "amtlich", url: U_GAG,
      quelle: "Gutachterausschüsse Niedersachsen, Landesgrundstücksmarktdaten 2025 (27.01.2025), S. 20: Oldenburg, Mehrfamilienhäuser, bei 35 Jahren Restnutzungsdauer. Hier auch für den Neubau benutzt." },
    { k: "gnd", name: "Gesamtnutzungsdauer", einheit: "Jahre", schritt: 5, std: 80, art: "amtlich", url: U_IMMO1,
      quelle: "ImmoWertV Anlage 1: Mehrfamilienhäuser 80 Jahre. Ist auch die Nutzungsdauer des Neubaus." },
    { k: "rndMin", name: "Mindest-Restnutzungsdauer", einheit: "Jahre", schritt: 5, std: 20, art: "annahme", url: U_IMMO1,
      quelle: "Eigene Annahme. Gesamtnutzungsdauer minus Alter wird bei sehr alten Gebäuden null oder negativ; Modernisierungen verlängern die Restnutzungsdauer (ImmoWertV Anlage 2), die Modernisierung kennt das Tool nicht." }
  ] },
  { name: "Flächen", felder: [
    { k: "bgfFaktor", name: "Brutto-Grundfläche je m² Wohnfläche", einheit: "", schritt: 0.05, std: 1.55, art: "amtlich", url: U_BEWG,
      quelle: "Bewertungsgesetz Anlage 24: BGF = 1,55 × Wohnfläche (Wohnungseigentum in Mehrfamilienhäusern). Die Geschossfläche aus Grundfläche × Geschossen und aus der GFZ wird hier als BGF genommen." }
  ] },
  { name: "Bewirtschaftungskosten", felder: [
    { k: "verw", name: "Verwaltungskosten", einheit: "€/Wohnung und Jahr", schritt: 5, std: 367, art: "amtlich", url: U_IMMO3,
      quelle: "ImmoWertV Anlage 3: 298 € je Wohnung (Stand 01.01.2021), fortgeschrieben mit dem Verbraucherpreisindex Oktober 2025 (123,0) zu Oktober 2020 (99,9) = Faktor 1,231, ergibt 367 €. Die Fortschreibung habe ich selbst gerechnet." },
    { k: "inst", name: "Instandhaltungskosten", einheit: "€/m² Wohnfläche und Jahr", schritt: 0.1, std: 14.4, art: "amtlich", url: U_IMMO3,
      quelle: "ImmoWertV Anlage 3: 11,70 €/m² (Stand 01.01.2021, Mieter trägt Schönheitsreparaturen), mit demselben Faktor 1,231 fortgeschrieben: 14,40 €." },
    { k: "maw", name: "Mietausfallwagnis", einheit: "% vom Rohertrag", schritt: 0.5, std: 2, art: "amtlich", url: U_IMMO3,
      quelle: "ImmoWertV Anlage 3: 2 % des marktüblich erzielbaren Rohertrags bei Wohnnutzung." }
  ] },
  { name: "Erwerb des Grundstücks", felder: [
    { k: "grest", name: "Grunderwerbsteuer", einheit: "%", schritt: 0.5, std: 5, art: "amtlich", url: U_NK,
      quelle: "Niedersachsen: 5,0 % des Kaufpreises (seit 01.01.2014). Belegt über Ratgeberseiten, nicht über das Gesetz selbst." },
    { k: "notar", name: "Notar und Grundbuch", einheit: "%", schritt: 0.1, std: 1.5, art: "markt", url: U_NK,
      quelle: "Ratgeberseiten nennen 1,2 bis 2 % des Kaufpreises (Gebührenordnung GNotKG). Mittelwert der unteren Hälfte. Keine amtliche Zahl." },
    { k: "makler", name: "Maklerprovision", einheit: "%", schritt: 0.5, std: 0, art: "annahme", url: U_NK,
      quelle: "Eigene Annahme: kein Makler. Käuferanteil läge bei etwa 3,57 % (Ratgeberseiten), Ersatz: eintragen." }
  ] },
  { name: "Neubau: Kosten", felder: [
    { k: "stufe", name: "Standardstufe der Normalherstellungskosten", einheit: "3 bis 5", schritt: 1, std: 4, art: "annahme", url: U_IMMO4,
      quelle: "Eigene Annahme: Stufe 4 (gehobener Standard) für einen Neubau. Die Normalherstellungskosten 2010 stehen in ImmoWertV Anlage 4 (Typ 4.1 bis 4.3 nach Zahl der Wohnungen), Preisstand 2010 × Baupreisindex 2,0014 (" + BPI_STAND + ", Destatis), inkl. 19 % Baunebenkosten und Umsatzsteuer." },
    { k: "baukostenEig", name: "Eigene Baukosten (0 = Normalherstellungskosten)", einheit: "€/m² BGF", schritt: 50, std: 0, art: "annahme", url: U_BPI,
      quelle: "Wenn du bessere Zahlen hast (z. B. BKI oder ein Angebot), trage sie hier ein: €/m² Brutto-Grundfläche inkl. Baunebenkosten und Umsatzsteuer. Normalherstellungskosten liegen oft unter den Marktpreisen." },
    { k: "abbruch", name: "Abbruchkosten", einheit: "€/m³ umbauter Raum", schritt: 5, std: 45, art: "markt", url: U_ABBR,
      quelle: "Marktangabe: Abbruchfirmen und Ratgeber nennen 30 bis 60 €/m³ für massive Wohngebäude ohne Schadstoffe (hier Mitte). Keine amtliche Zahl. Umbauter Raum = Grundfläche × Gebäudehöhe aus LoD2 (höchster Punkt, überschätzt leicht)." }
  ] },
  { name: "Neubau: Miete", felder: [
    { k: "bjZuschlag", name: "Zuschlag Baujahr 2016 bis 2022", einheit: "%", schritt: 1, std: 10, art: "amtlich", url: U_MIET,
      quelle: "Mietspiegel Oldenburg 2025, Tabelle 2: Baujahr 2016 bis 2022 plus 10 %. Der Mietspiegel gilt nur bis Baujahr 2022; Neubauten ab 2023 sind darin nicht abgebildet." },
    { k: "wohnlage", name: "Zu- oder Abschlag Wohnlage", einheit: "%", schritt: 1, std: 0, art: "annahme", url: U_MIET,
      quelle: "Mietspiegel Oldenburg 2025, Tabelle 2 (Wohnlage nach Straße): A +7, B +6, C 0, D −4, E −6, F −7, G −10 %. Das Tool kennt die Straße nicht, Standard: Wohnlage C (0 %). Trage den Wert für deine Straße ein." },
    { k: "aufschlag", name: "Weiterer Aufschlag auf den Mietspiegelwert", einheit: "%", schritt: 1, std: 0, art: "annahme", url: U_MIET,
      quelle: "Eigene Annahme, Standard 0 %. Der Mietspiegel ist die ortsübliche Vergleichsmiete; erzielbare Neubaumieten können höher liegen. Belegte Zahl (z. B. Marktbericht) hier eintragen." }
  ] }
];
const WIRT_STANDARD = {};
WIRT_GRUPPEN.forEach((g2) => g2.felder.forEach((f) => { WIRT_STANDARD[f.k] = f.std; }));
const WIRT_SPEICHER = "ortsanalyse-wirtschaft-v2";    // v2: die frühere Version mit ungeprüften Standardwerten wird nicht mehr gelesen
let wirtAnn = { ...WIRT_STANDARD };
try { localStorage.removeItem("ortsanalyse-wirtschaft"); } catch (_) { /* alte Version mit ungeprüften Standardwerten wegräumen */ }
try {
  const gemerkt = JSON.parse(localStorage.getItem(WIRT_SPEICHER) || "null");
  if (gemerkt && typeof gemerkt === "object") for (const k of Object.keys(WIRT_STANDARD)) if (Number.isFinite(gemerkt[k])) wirtAnn[k] = gemerkt[k];
} catch (_) { /* ohne Speicher: Standard gilt */ }

const wirtPanel = document.getElementById("wirt-panel");
const wirtModusFeld = document.getElementById("wirt-modus");
let wirtModus = "ergebnis";     // Einfärbung: "ergebnis", "rendite" oder "ausnutzung"
let wirtAuswahl = null;
let wirtUeber = {};             // Eingaben je Flurstück: { id: { miete, wfl, bj, gfz, nmiete } }
let wirtErgebnisse = [];        // Rechenergebnisse je Flurstück (gleiche Reihenfolge wie "flurstuecke")
let wirtStand = "";
let wirtSumme = null;
let wirtZeitgeber = null;

// ---------- 2. Rechnung ----------
// Vervielfältiger: wie oft der Reinertrag über die Restdauer bei Zins lz (in %) zusammenkommt, abgezinst
const vervielfaeltiger = (lzProzent, jahre) => {
  const i = lzProzent / 100;
  return i > 0 ? (1 - Math.pow(1 + i, -jahre)) / i : jahre;
};

// Ø Wohnungsgröße im Gebiet (Zensus-Raster, nach Einwohnern gewichtet) als Ersatz, wenn für ein Flurstück kein Rasterwert da ist
function wirtWohnungMittel() {
  let s = 0, g2 = 0;
  for (const z of mietZellen) if (z.wfl != null) { const w = z.einw || 1; s += w * z.wfl; g2 += w; }
  return g2 ? s / g2 : null;
}

function rechneWirt(p) {
  const a = wirtAnn, ue = wirtUeber[p.id] || {};
  const r = { ok: false };
  if (p.verkehr) { r.grund = "Verkehrsfläche: keine Rechnung."; return r; }
  const A = p.flaeche;
  r.A = A;
  r.brw = p.zone ? p.zone.brw : null;
  r.bodenwert = r.brw != null ? A * r.brw : null;
  r.nk = (a.grest + a.notar + a.makler) / 100;
  r.mieteStd = p.miete;
  r.miete = ue.miete ?? p.miete;
  r.wg = p.wflWohnung ?? wirtWohnungMittel() ?? 70;         // Ø Wohnungsgröße (Raster), zuletzt 70 m² als Notwert
  r.wgQuelle = p.wflWohnung != null ? "Zensus-Raster" : wirtWohnungMittel() != null ? "Gebietsmittel (Zensus)" : "Notwert 70 m²";
  r.gfW = p.gfWohnen > 0 ? p.gfWohnen : p.gfWohnen + p.gfUnbekannt;
  r.wflStd = r.gfW / a.bgfFaktor;
  r.wfl = ue.wfl ?? r.wflStd;
  r.baujahrStd = p.baujahr;
  r.baujahr = ue.bj ?? p.baujahr;
  r.gfzStd = p.zone && p.zone.gfz ? p.zone.gfz : null;
  r.gfzNeu = ue.gfz ?? r.gfzStd;
  r.gfzBestand = p.gf / A;
  r.ausnutzung = r.gfzStd ? r.gfzBestand / r.gfzStd : null;
  r.fehlt = [];
  if (r.bodenwert == null) r.fehlt.push("Bodenrichtwert");
  if (r.miete == null) r.fehlt.push("Miete");

  // Bewirtschaftungskosten nach ImmoWertV Anlage 3: Verwaltung je Wohnung, Instandhaltung je m², Mietausfallwagnis in % vom Rohertrag
  const bewirtschaftung = (wfl, rohertrag) => {
    const we = wfl > 0 ? Math.max(1, Math.round(wfl / r.wg)) : 0;
    const verwaltung = we * a.verw, instandhaltung = wfl * a.inst, mietausfall = rohertrag * a.maw / 100;
    return { we, verwaltung, instandhaltung, mietausfall, summe: verwaltung + instandhaltung + mietausfall };
  };

  // A) Bestand: Ertragswert = Bodenwert + Gebäudeertragswert
  if (r.bodenwert != null && r.miete != null) {
    const b = {};
    b.rohertrag = r.wfl * r.miete * 12;
    b.bw = bewirtschaftung(r.wfl, b.rohertrag);
    b.reinertrag = b.rohertrag - b.bw.summe;
    b.bodenverzinsung = r.bodenwert * a.lz / 100;
    b.gebaeudereinertrag = b.reinertrag - b.bodenverzinsung;
    b.alter = r.baujahr != null ? WIRT_JAHR - r.baujahr : null;
    b.rndRoh = b.alter != null ? a.gnd - b.alter : a.gnd / 2;              // ohne Baujahr: halbe Gesamtnutzungsdauer
    b.rnd = Math.max(a.rndMin, b.rndRoh);
    b.vervielfaeltiger = vervielfaeltiger(a.lz, b.rnd);
    b.gebaeudeertragswert = Math.max(0, b.gebaeudereinertrag) * b.vervielfaeltiger;
    b.tragtBoden = b.gebaeudereinertrag > 0;      // false: das Gebäude erwirtschaftet nicht einmal die Bodenverzinsung
    b.ertragswert = b.gebaeudeertragswert + r.bodenwert;
    b.jeM2 = b.ertragswert / A;
    b.anschaffung = b.ertragswert * (1 + r.nk);
    b.rendite = b.reinertrag / b.anschaffung;     // Nettoanfangsrendite beim Kauf zum Ertragswert
    r.bestand = b;
  }

  // B) Neubau-Potenzial
  if (r.bodenwert != null && r.miete != null && r.gfzNeu != null) {
    const n = {};
    n.bgf = r.gfzNeu * A;                         // Geschossfläche wird als Brutto-Grundfläche genommen
    n.vermietbar = n.bgf / a.bgfFaktor;           // Wohnfläche
    n.we = Math.max(1, Math.round(n.vermietbar / r.wg));
    n.mieteStd = mietspiegelBasis(r.wg) * (1 + a.bjZuschlag / 100) * (1 + a.wohnlage / 100) * (1 + a.aufschlag / 100);
    n.miete = ue.nmiete ?? n.mieteStd;
    n.rohertrag = n.vermietbar * n.miete * 12;
    n.bw = bewirtschaftung(n.vermietbar, n.rohertrag);
    n.reinertrag = n.rohertrag - n.bw.summe;
    // Baukosten: Normalherstellungskosten 2010 (Typ nach Zahl der Wohnungen, Standardstufe) mal Baupreisindex, oder eigener Wert
    n.nhkTyp = n.we <= 6 ? "4.1" : n.we <= 20 ? "4.2" : "4.3";
    n.stufe = Math.min(5, Math.max(3, Math.round(a.stufe)));
    n.nhk = NHK_2010[n.nhkTyp][n.stufe - 3];
    n.baukostenM2 = a.baukostenEig > 0 ? a.baukostenEig : n.nhk * NHK_FAKTOR;
    n.baukostenEigen = a.baukostenEig > 0;
    n.kostenGrund = r.bodenwert * (1 + r.nk);
    n.kostenAbbruch = p.bri * a.abbruch;
    n.kostenBau = n.bgf * n.baukostenM2;
    n.kosten = n.kostenGrund + n.kostenAbbruch + n.kostenBau;
    n.bodenverzinsung = r.bodenwert * a.lz / 100;
    n.vervielfaeltiger = vervielfaeltiger(a.lz, a.gnd);
    n.ertragswert = Math.max(0, n.reinertrag - n.bodenverzinsung) * n.vervielfaeltiger + r.bodenwert;
    n.ergebnis = n.ertragswert - n.kosten;
    n.ergebnisProzent = n.ergebnis / n.kosten;
    n.ergebnisJeM2 = n.ergebnis / A;
    n.rendite = n.reinertrag / n.kosten;
    n.residual = (n.ertragswert - n.kostenAbbruch - n.kostenBau) / (1 + r.nk);   // höchster Grundstückspreis, bei dem das Projekt gerade aufgeht
    n.zuwachs = n.bgf - p.gf;
    r.neubau = n;
  }
  r.ok = !!(r.bestand || r.neubau);
  return r;
}

function rechneAlleWirt() {
  wirtErgebnisse = flurstuecke.map((p) => rechneWirt(p));
  const ok = wirtErgebnisse.filter((r) => r.ok);
  const proz = (liste, q) => { const s = [...liste].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))] : 0; };
  const erg = ok.filter((r) => r.neubau).map((r) => r.neubau.ergebnisJeM2);
  const ren = ok.filter((r) => r.bestand && r.wfl > 0).map((r) => r.bestand.rendite);
  wirtSumme = {
    gerechnet: ok.length, mitNeubau: erg.length,
    positiv: ok.filter((r) => r.neubau && r.neubau.ergebnis > 0).length,
    ergBis: Math.max(1, Math.abs(proz(erg, 0.05)), Math.abs(proz(erg, 0.95))),
    renBis: Math.max(0.01, proz(ren, 0.95)), renMittel: ren.length ? ren.reduce((s, x) => s + x, 0) / ren.length : null
  };
}

// ---------- 3. Karte ----------
function legeWirtEbenenAn() {
  map.addSource("wirt", { type: "geojson", data: leer });
  const unsichtbar = { visibility: "none" };
  map.addLayer({ id: "wirt-flaeche", type: "fill", source: "wirt", layout: unsichtbar, paint: { "fill-color": FARBE.flst.keine, "fill-opacity": 0.92 } }, "kontext-gebaeude");
  map.addLayer({ id: "wirt-linie", type: "line", source: "wirt", layout: unsichtbar, paint: { "line-color": FARBE.flst.linie, "line-width": 0.8 } }, "maske");
  map.addLayer({ id: "wirt-auswahl", type: "line", source: "wirt", layout: { visibility: "none", "line-join": "round" },
    filter: ["==", ["get", "id"], -1], paint: { "line-color": FARBE.flst.auswahl, "line-width": 3 } }, "maske");
}

function wirtFarbausdruck() {
  const s = wirtSumme || { ergBis: 1, renBis: 0.05 };
  const keine = FARBE.flst.keine;
  const zahlAus = (eig) => ["number", ["get", eig], -999];
  const gueltig = (eig) => ["<", zahlAus(eig), -900];
  if (wirtModus === "ergebnis") {
    return ["case", gueltig("ergebnis"), keine, ["interpolate", ["linear"], zahlAus("ergebnis"),
      -s.ergBis, "#c8362e", 0, "#f3f0ea", s.ergBis, "#1b7a52"]];
  }
  if (wirtModus === "rendite") {
    return ["case", gueltig("rendite"), keine, ["interpolate", ["linear"], zahlAus("rendite"),
      0, "#eaf2f8", s.renBis / 2, "#7fb0d4", s.renBis, "#1f5f94"]];
  }
  return ["case", gueltig("ausnutzung"), keine, ["interpolate", ["linear"], zahlAus("ausnutzung"),
    0, "#fbf3d5", 0.75, "#e0b04a", 1.5, "#8a5a00"]];
}

function setzeWirtAufKarte() {
  if (!kartenBereit) return;
  const features = flurstuecke.map((p, i) => {
    const r = wirtErgebnisse[i] || {};
    const n = r.neubau, b = r.bestand;
    return { type: "Feature", geometry: p.f.geometry, properties: {
      id: p.id, ergebnis: n ? n.ergebnisJeM2 : null, rendite: b && r.wfl > 0 ? b.rendite : null, ausnutzung: r.ausnutzung != null ? r.ausnutzung : null
    } };
  });
  map.getSource("wirt").setData({ type: "FeatureCollection", features });
  map.setPaintProperty("wirt-flaeche", "fill-color", wirtFarbausdruck());
  map.setFilter("wirt-auswahl", ["==", ["get", "id"], wirtAuswahl == null ? -1 : wirtAuswahl]);
}

// Wird am Ende von wendeAnsichtAn() aufgerufen
function aktualisiereWirtschaft() {
  const aktiv = aktuelleAnsicht === "wirtschaft" && datenVorhanden;
  wirtPanel.hidden = !aktiv;
  wirtModusFeld.hidden = !(aktiv && flurstueckeVorhanden);
  if (!aktiv) return;
  if (sorgeFuerBestand()) {
    const stand = flstStand + "|" + JSON.stringify(wirtAnn) + "|" + JSON.stringify(wirtUeber);
    if (stand !== wirtStand) {
      wirtStand = stand;
      rechneAlleWirt();
      setzeWirtAufKarte();
    }
    wirtModusFeld.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.modus === wirtModus));
  }
  zeichneWirtPanel();
}

// ---------- 4. Panel: Steckbrief, Anpassungen, Ergebnis ----------
const w$ = (id) => document.getElementById(id);
const eur = (x) => (x == null || !Number.isFinite(x) ? "–" : `${zahl(Math.round(x))} €`);
const eur2 = (x) => (x == null || !Number.isFinite(x) ? "–" : `${zahl(x, 2)} €`);
const proz1 = (x) => (x == null || !Number.isFinite(x) ? "–" : `${zahl(x * 100, 1)} %`);
const rz = (name, wert, klasse = "") => `<div class="${klasse}"><dt>${name}</dt><dd>${wert}</dd></div>`;

// Luftbild-Ausschnitt um das Flurstück (nur Niedersachsen) mit dem Umriss darüber
function wirtLuftbild(p) {
  const [west, sued, ost, nord] = p.bbox;
  const mx = (west + ost) / 2, my = (sued + nord) / 2;
  if (mx < NI_RAHMEN[0] || mx > NI_RAHMEN[2] || my < NI_RAHMEN[1] || my > NI_RAHMEN[3]) return "";
  const polygone = p.f.geometry.type === "Polygon" ? [p.f.geometry.coordinates] : p.f.geometry.coordinates;
  const utm = polygone.map((poly) => poly.map((ring) => ring.map((pt) => utmWandler.forward(pt))));
  const alle = utm.flat(2);
  const xs = alle.map((q) => q[0]), ys = alle.map((q) => q[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const seite = Math.max(40, Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.6);   // Quadrat mit Rand
  const x0 = cx - seite / 2, y0 = cy - seite / 2, S = 400;
  const pfad = utm.map((poly) => poly.map((ring) => "M" + ring.map(([x, y]) => `${(((x - x0) / seite) * S).toFixed(1)},${(((y0 + seite - y) / seite) * S).toFixed(1)}`).join("L") + "Z").join("")).join("");
  const url = `${DOP_WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ni_dop20&STYLES=&CRS=EPSG:25832&BBOX=${[x0, y0, x0 + seite, y0 + seite].map((z) => z.toFixed(2)).join(",")}&WIDTH=${S}&HEIGHT=${S}&FORMAT=image/jpeg`;
  return `<div class="wirt-bild"><img src="${url}" alt="Luftbild des Flurstücks" onerror="this.parentNode.hidden=true">` +
    `<svg viewBox="0 0 ${S} ${S}" aria-hidden="true"><path d="${pfad}" fill="rgba(0,113,227,0.12)" fill-rule="evenodd" stroke="#0071e3" stroke-width="2.5"/></svg>` +
    `<span class="wirt-bild-quelle">Luftbild: LGLN (${luftJahr}), CC BY 4.0</span></div>`;
}

function wirtSteckbrief(p) {
  const r = wirtErgebnisse[flurstuecke.indexOf(p)] || {};
  const z = p.zone;
  const gemarkung = (richtwertZonen.find((q) => q.gemarkungNr === p.gemarkungNr && q.gemarkungName) || {}).gemarkungName || `Gemarkung ${p.gemarkungNr}`;
  let html = `<h3>Flurstück ${htmlSicher(p.nr)}</h3><p class="flst-sub">${htmlSicher(gemarkung)} · Flur ${htmlSicher(p.flur)}</p>`;
  if (!p.verkehr) html += wirtLuftbild(p);
  html += `<h4>Steckbrief</h4><dl>${rz("Fläche (amtlich)", `${zahl(p.flaeche)} m²`)}`;
  if (p.verkehr) {
    html += `</dl><p class="flst-hinweis">Verkehrsfläche (Straße, Weg oder Platz): keine Bewertung.</p>`;
    return html;
  }
  html += z ? rz("Bodenrichtwert", `<strong>${euro(z.brw)}/m²</strong>`) + rz("Zone", `${htmlSicher(z.zone)}`) +
      rz("Nutzung", htmlSicher(BRW_NUTZUNG[z.nutzung] ? `${BRW_NUTZUNG[z.nutzung]} (${z.nutzung})` : z.nutzung || "–")) +
      (z.gfz ? rz("Richtwert-GFZ", zahl(z.gfz, 2)) : "") + rz("Bodenwert", `ca. ${eur(r.bodenwert)}`)
    : rz("Bodenrichtwert", "keine Zone gefunden");
  html += rz("Gebäude", `${zahl(p.nHaupt)}${p.nNeben ? ` + ${zahl(p.nNeben)} Neben` : ""}`) + rz("GRZ Bestand", zahl(p.fHaupt / p.flaeche, 2)) +
    rz("GFZ Bestand", zahl(p.gf / p.flaeche, 2)) + (p.nHaupt ? rz("Ø Geschosse", zahl(p.geschosseSumme / p.nHaupt, 1)) : "") +
    rz("Miete im Raster", p.miete != null ? `${zahl(p.miete, 2)} €/m²` : "–") +
    rz("Baujahr (Raster, Median)", p.baujahr != null ? `ca. ${p.baujahr}` : "–") +
    rz("Ø Wohnungsgröße (Raster)", p.wflWohnung != null ? `${zahl(p.wflWohnung, 0)} m²` : "–") + `</dl>`;
  if (p.rand) html += `<p class="flst-hinweis flst-warn">Randflurstück: ragt aus deinem Rechteck. Gebäude außerhalb fehlen, der Bestand ist unvollständig.</p>`;
  return html;
}

function wirtErgebnisHtml(p, r) {
  const a = wirtAnn;
  if (p.verkehr) return "";
  let html = "";
  if (r.fehlt && r.fehlt.length) html += `<p class="flst-hinweis flst-warn">Es fehlt: ${r.fehlt.join(", ")}. Die Rechnung läuft nur, wenn ${r.fehlt.length > 1 ? "diese Angaben" : "diese Angabe"} da ${r.fehlt.length > 1 ? "sind" : "ist"}` +
    `${r.fehlt.includes("Miete") ? " (Miete lässt sich oben von Hand eintragen)" : ""}.</p>`;
  const b = r.bestand;
  if (b) {
    const bw = b.bw;
    html += `<h4>A · Bestand: Ertragswert</h4><dl class="wirt-rechnung">` +
      rz("Vermietbare Fläche", `${zahl(r.wfl)} m²`) + rz("× Miete", `${zahl(r.miete, 2)} €/m²`) +
      rz("Jahresrohertrag", eur(b.rohertrag)) +
      rz(`− Verwaltung (${zahl(bw.we)} Whg. × ${zahl(a.verw)} €)`, eur(-bw.verwaltung)) +
      rz(`− Instandhaltung (${zahl(a.inst, 2)} €/m²)`, eur(-bw.instandhaltung)) +
      rz(`− Mietausfallwagnis (${zahl(a.maw, 1)} %)`, eur(-bw.mietausfall)) +
      rz("= Reinertrag", eur(b.reinertrag), "summe") +
      rz(`− Bodenwertverzinsung (${zahl(a.lz, 1)} %)`, eur(-b.bodenverzinsung)) +
      rz("= Gebäudereinertrag", eur(b.gebaeudereinertrag), "summe") +
      rz(`Restnutzungsdauer${r.baujahr != null ? ` (${zahl(a.gnd)} − ${zahl(b.alter)} J.)` : ` (ohne Baujahr: ${zahl(a.gnd)} / 2)`}`,
        `${zahl(b.rnd)} J.${b.rnd > b.rndRoh ? " (Mindestwert)" : ""}`) +
      rz(`× Vervielfältiger (${zahl(b.rnd)} J., ${zahl(a.lz, 1)} %)`, zahl(b.vervielfaeltiger, 2)) +
      rz("= Gebäudeertragswert", eur(b.gebaeudeertragswert), "summe") +
      rz("+ Bodenwert", eur(r.bodenwert)) +
      rz("= Ertragswert", `<strong>${eur(b.ertragswert)}</strong>`, "ergebnis") + `</dl>` +
      `<dl>${rz("je m² Grundstück", eur(b.jeM2))}${rz(`Rendite bei Kauf zum Ertragswert + ${zahl(r.nk * 100, 1)} % NK`, `<strong>${proz1(b.rendite)}</strong>`)}</dl>`;
    if (!b.tragtBoden) html += `<p class="flst-hinweis flst-warn">Der Reinertrag deckt nicht einmal die Verzinsung des Bodenwerts: Das Gebäude trägt sich nicht, der Wert ist der Bodenwert (Gebäude zählt nicht).</p>`;
    if (!r.wfl) html += `<p class="flst-hinweis">Keine Wohnfläche: Auf dem Flurstück steht laut LoD2/OSM kein Wohngebäude. Gewerbe wird nicht gerechnet; trage die Fläche oben ein, wenn du sie kennst.</p>`;
    html += `<p class="flst-hinweis">Wohnfläche = Geschossfläche der Wohngebäude / ${zahl(a.bgfFaktor, 2)}. Wohnungsgröße ${zahl(r.wg)} m² (${r.wgQuelle}). Das Baujahr ist der Median der Gebäude im Raster, nicht das des einzelnen Hauses; trage oben das echte ein.</p>`;
  }
  const n = r.neubau;
  if (n) {
    const nw = n.bw;
    html += `<h4>B · Neubau-Potenzial</h4><dl class="wirt-rechnung">` +
      rz(`Geschossfläche (GFZ ${zahl(r.gfzNeu, 2)} × ${zahl(r.A)} m²)`, `${zahl(n.bgf)} m²`) +
      rz("davon neu gegenüber Bestand", `${n.zuwachs >= 0 ? "+" : "−"}${zahl(Math.abs(n.zuwachs))} m²`) +
      rz(`Wohnfläche (BGF / ${zahl(a.bgfFaktor, 2)})`, `${zahl(n.vermietbar)} m²`) +
      rz(`Neubaumiete${n.miete === n.mieteStd ? " (Mietspiegel)" : " (eigener Wert)"}`, `${zahl(n.miete, 2)} €/m²`) +
      rz("Jahresrohertrag", eur(n.rohertrag)) +
      rz(`− Bewirtschaftung (${zahl(nw.we)} Whg.)`, eur(-nw.summe)) +
      rz("= Reinertrag", eur(n.reinertrag), "summe") +
      rz("Kosten Grundstück inkl. NK", eur(n.kostenGrund)) +
      rz(`Abbruch Bestand (${zahl(p.bri)} m³ × ${zahl(a.abbruch)} €)`, eur(n.kostenAbbruch)) +
      rz(`Bau (${zahl(n.bgf)} m² × ${zahl(n.baukostenM2)} €)`, eur(n.kostenBau)) +
      rz("= Gesamtkosten", eur(n.kosten), "summe") +
      rz(`Ertragswert nach Fertigstellung (${zahl(a.gnd)} J.)`, eur(n.ertragswert)) +
      rz("= Projektergebnis", `<strong class="${n.ergebnis < 0 ? "wirt-minus" : "wirt-plus"}">${eur(n.ergebnis)}</strong>`, "ergebnis") + `</dl>` +
      `<dl>${rz("in % der Gesamtkosten", proz1(n.ergebnisProzent))}${rz("Rendite auf die Kosten (netto)", proz1(n.rendite))}` +
      rz("Residualwert Grundstück", `${eur(n.residual)}`) + rz("zum Vergleich Bodenwert", eur(r.bodenwert)) + `</dl>` +
      `<p class="flst-hinweis">Baukosten: ${n.baukostenEigen ? "eigener Wert" : `Normalherstellungskosten 2010 Typ ${n.nhkTyp}, Standardstufe ${n.stufe}: ${zahl(n.nhk)} € × Baupreisindex ${zahl(NHK_FAKTOR, 4)} (${BPI_STAND}) = ${zahl(n.baukostenM2)} €/m² BGF inkl. Baunebenkosten und Umsatzsteuer`}. ` +
      `Neubaumiete: Mietspiegel Oldenburg 2025, Basismiete ${zahl(mietspiegelBasis(r.wg), 2)} €/m² bei ${zahl(r.wg)} m², Zuschläge Baujahr ${zahl(a.bjZuschlag)} %, Wohnlage ${zahl(a.wohnlage)} %, weiter ${zahl(a.aufschlag)} %. ` +
      `Der Mietspiegel gilt für Baujahre bis 2022; Neubaumieten ab 2023 können höher liegen.</p>` +
      `<p class="flst-hinweis">Residualwert = was das Grundstück höchstens kosten dürfte, damit das Projekt gerade aufgeht (Ertragswert minus Abbruch und Bau, geteilt durch 1 + Nebenkosten). ` +
      `${n.residual >= r.bodenwert ? "Er liegt über dem Bodenwert: die Entwicklung trägt den Grundstückspreis." : "Er liegt unter dem Bodenwert: bei diesen Annahmen trägt die Entwicklung den Grundstückspreis nicht."}</p>`;
    if (!r.gfzStd) html += `<p class="flst-hinweis">Für diese Zone gibt es keine Richtwert-GFZ; die GFZ für den Neubau stammt aus deiner Eingabe.</p>`;
  } else if (r.bodenwert != null && r.miete != null && r.gfzNeu == null) {
    html += `<h4>B · Neubau-Potenzial</h4><p class="flst-hinweis">Für diese Zone gibt es keine Richtwert-GFZ. Trage oben eine GFZ für den Neubau ein, dann rechnet das Tool weiter.</p>`;
  }
  html += `<p class="flst-klein">Überschlagsrechnung für das Studium: kein Gutachten, keine Bewertung, keine Anlageberatung. Quellen der Werte stehen bei den Annahmen unten. ` +
    `Daten: Fläche, Bodenrichtwert (LGLN), Gebäude (OpenStreetMap, LoD2), Miete, Baujahr und Wohnungsgröße (Zensus 2022, Raster). Die Geschossfläche aus der Richtwert-GFZ ersetzt keinen Bebauungsplan.</p>`;
  return html;
}

const WIRT_EINGABEN = { "wirt-in-miete": "miete", "wirt-in-wfl": "wfl", "wirt-in-bj": "bj", "wirt-in-gfz": "gfz", "wirt-in-nmiete": "nmiete" };

// Setzt die Eingabefelder für das Flurstück. Mit "werte" = false werden nur die grauen Platzhalter (Standardwerte) aktualisiert,
// damit ein Feld, in das gerade getippt wird, nicht überschrieben wird.
function setzeWirtEingaben(p, werte = true) {
  const r = wirtErgebnisse[flurstuecke.indexOf(p)] || {};
  const ue = wirtUeber[p.id] || {};
  const setze = (id, wert, std, stellen) => {
    const el = w$(id);
    if (werte) el.value = wert == null ? "" : String(wert);
    el.placeholder = std == null ? "–" : zahl(std, stellen);
  };
  setze("wirt-in-miete", ue.miete, r.mieteStd, 2);
  setze("wirt-in-wfl", ue.wfl, r.wflStd, 0);
  setze("wirt-in-bj", ue.bj, r.baujahrStd, 0);
  setze("wirt-in-gfz", ue.gfz, r.gfzStd, 2);
  setze("wirt-in-nmiete", ue.nmiete, r.neubau ? r.neubau.mieteStd : null, 2);
}

// Panel neu zeichnen (Steckbrief nur bei neuer Auswahl, damit das Luftbild nicht neu lädt)
let wirtSteckbriefFuer = null;
function zeichneWirtPanel() {
  if (wirtPanel.hidden) return;
  const p = flurstuecke.find((x) => x.id === wirtAuswahl);
  w$("wirt-leer").hidden = !!p;
  w$("wirt-detail").hidden = !p;
  if (!p) {
    wirtSteckbriefFuer = null;
    w$("wirt-leer").textContent = !flurstueckeVorhanden
      ? "Die Flurstücke werden noch geladen, oder es gibt keine (nur Niedersachsen). Dafür muss „Analysieren“ gelaufen sein."
      : "Klicke auf ein Flurstück: Du bekommst den Steckbrief und die Wirtschaftlichkeitsrechnung. Die Einfärbung wählst du unten.";
    return;
  }
  const r = wirtErgebnisse[flurstuecke.indexOf(p)] || {};
  if (wirtSteckbriefFuer !== `${p.id}|${flstStand}`) {
    wirtSteckbriefFuer = `${p.id}|${flstStand}`;
    w$("wirt-steckbrief").innerHTML = wirtSteckbrief(p);
    setzeWirtEingaben(p);
  } else {
    setzeWirtEingaben(p, false);
  }
  w$("wirt-ueber").hidden = !!p.verkehr;
  w$("wirt-ergebnis").innerHTML = wirtErgebnisHtml(p, r);
}

function waehleWirt(id) {
  wirtAuswahl = id;
  if (kartenBereit) map.setFilter("wirt-auswahl", ["==", ["get", "id"], id == null ? -1 : id]);
  wirtSteckbriefFuer = null;
  zeichneWirtPanel();
}

// ---------- 5. Eingaben ----------
const ART_NAME = { amtlich: "amtlich", markt: "Marktangabe", annahme: "Annahme" };
function baueAnnahmenFelder() {
  w$("wirt-annahmen-felder").innerHTML = WIRT_GRUPPEN.map((g2) =>
    `<h5>${g2.name}</h5>` + g2.felder.map((f) =>
      `<div class="wirt-annahme"><label class="wirt-feld"><span>${f.name}</span><input type="number" step="${f.schritt}" min="0" data-k="${f.k}" value="${wirtAnn[f.k]}">` +
      `<span class="wirt-einheit">${f.einheit}</span></label>` +
      `<p class="wirt-quelle"><span class="wirt-art wirt-art-${f.art}">${ART_NAME[f.art]}</span> ${htmlSicher(f.quelle)} ` +
      `<a href="${f.url}" target="_blank" rel="noopener">Quelle</a></p></div>`).join("")).join("") +
    `<button type="button" class="wirt-knopf" id="wirt-standard">Standardwerte</button>`;
}

function wirtNeuRechnen() {
  clearTimeout(wirtZeitgeber);
  wirtZeitgeber = setTimeout(() => { aktualisiereWirtschaft(); }, 150);
}

const speichereWirt = () => { try { localStorage.setItem(WIRT_SPEICHER, JSON.stringify(wirtAnn)); } catch (_) { /* nicht schlimm */ } };

w$("wirt-annahmen-felder").addEventListener("input", (e) => {
  const feld = e.target.closest("input[data-k]");
  if (!feld) return;
  const wert = parseFloat(feld.value);
  if (!Number.isFinite(wert) || wert < 0) return;
  wirtAnn[feld.dataset.k] = wert;
  speichereWirt();
  wirtNeuRechnen();
});

w$("wirt-annahmen-felder").addEventListener("click", (e) => {
  if (!e.target.closest("#wirt-standard")) return;
  wirtAnn = { ...WIRT_STANDARD };
  speichereWirt();
  baueAnnahmenFelder();
  wirtNeuRechnen();
});

// Eingaben für das gewählte Flurstück (leer = Standardwert aus den Daten)
w$("wirt-ueber").addEventListener("input", (e) => {
  const feld = e.target.closest("input");
  if (!feld || wirtAuswahl == null) return;
  const schluessel = WIRT_EINGABEN[feld.id];
  if (!schluessel) return;
  const wert = parseFloat(feld.value);
  const ue = (wirtUeber[wirtAuswahl] = wirtUeber[wirtAuswahl] || {});
  if (Number.isFinite(wert) && wert >= 0) ue[schluessel] = wert; else delete ue[schluessel];
  wirtNeuRechnen();
});
w$("wirt-zuruecksetzen").addEventListener("click", () => {
  if (wirtAuswahl == null) return;
  delete wirtUeber[wirtAuswahl];
  wirtSteckbriefFuer = null;
  wirtNeuRechnen();
});

w$("wirt-zu").addEventListener("click", () => waehleWirt(null));

wirtModusFeld.addEventListener("click", (e) => {
  const knopf = e.target.closest("button[data-modus]");
  if (!knopf) return;
  wirtModus = knopf.dataset.modus;
  wirtModusFeld.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b === knopf));
  if (kartenBereit && flurstueckeVorhanden) map.setPaintProperty("wirt-flaeche", "fill-color", wirtFarbausdruck());
  if (typeof aktualisiereLegende === "function") aktualisiereLegende();
});

map.on("click", (e) => {
  if (aktuelleAnsicht !== "wirtschaft" || !flurstueckeVorhanden || !kartenBereit) return;
  if (!turf.booleanPointInPolygon([e.lngLat.lng, e.lngLat.lat], gebiet)) return;
  const treffer = map.queryRenderedFeatures(e.point, { layers: ["wirt-flaeche"] });
  waehleWirt(treffer.length ? treffer[0].properties.id : null);
});

map.on("mousemove", (e) => {
  if (aktuelleAnsicht !== "wirtschaft" || !kartenBereit || zeichnen) return;
  map.getCanvas().style.cursor = map.queryRenderedFeatures(e.point, { layers: ["wirt-flaeche"] }).length ? "pointer" : "";
});

// ---------- 6. Legende (wird von legende.js benutzt) ----------
function wirtLegendeEintraege() {
  const s = wirtSumme, f = FARBE.flst;
  const verlauf = (c) => `<span class="sw sw-verlauf" style="background:linear-gradient(90deg, ${c.join(",")})"></span>`;
  const e = [];
  if (wirtModus === "ergebnis") e.push(`<li>${verlauf(["#c8362e", "#f3f0ea", "#1b7a52"])}<span>Neubau-Ergebnis je m² Grundstück: ${s ? `−${zahl(s.ergBis)} bis +${zahl(s.ergBis)} €` : ""}</span></li>`);
  if (wirtModus === "rendite") e.push(`<li>${verlauf(["#eaf2f8", "#7fb0d4", "#1f5f94"])}<span>Rendite Bestand: 0 bis ${s ? proz1(s.renBis) : ""}</span></li>`);
  if (wirtModus === "ausnutzung") e.push(`<li>${verlauf(["#fbf3d5", "#e0b04a", "#8a5a00"])}<span>Ausnutzung: GFZ Bestand zu Richtwert-GFZ, 0 bis 150 %</span></li>`);
  e.push(`<li><span class="sw" style="background:${f.keine}"></span><span>nicht gerechnet (Verkehr, keine Daten)</span></li>`);
  e.push(`<li><span class="sw" style="background:${f.gebaeude};opacity:0.5"></span><span>Gebäude (OSM)</span></li>`);
  e.push(`<li><span class="sw sw-linie" style="background:${f.auswahl};height:3px"></span><span>gewähltes Flurstück</span></li>`);
  return e.join("");
}

function wirtEckdaten() {
  const s = wirtSumme;
  if (!flurstueckeVorhanden || !s) return [];
  const z = [["Flurstücke gerechnet", zahl(s.gerechnet)]];
  if (s.mitNeubau) z.push(["Neubau-Ergebnis positiv", `${zahl(s.positiv)} von ${zahl(s.mitNeubau)}`]);
  if (s.renMittel != null) z.push(["Ø Rendite Bestand", proz1(s.renMittel)]);
  return z;
}

function verwerfeWirtschaft() {
  wirtErgebnisse = [];
  wirtAuswahl = null;
  wirtStand = "";
  wirtSumme = null;
  wirtUeber = {};
  wirtSteckbriefFuer = null;
  if (typeof kartenBereit !== "undefined" && kartenBereit) {
    map.getSource("wirt").setData(leer);
    map.setFilter("wirt-auswahl", ["==", ["get", "id"], -1]);
  }
  wirtPanel.hidden = true;
  wirtModusFeld.hidden = true;
}

baueAnnahmenFelder();
