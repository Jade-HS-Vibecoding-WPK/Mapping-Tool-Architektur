/* ============================================================
   Ortsanalyse – amtliche Kataster- und Bodenwertdaten (Niedersachsen)
   Dieselben Grundlagen, die auch der Grundsteuer-Viewer zeigt, aus offenen Diensten des LGLN:
   - ALKIS vereinfacht (WFS): Flurstücke und tatsächliche Nutzung · LGLN, CC BY 4.0
   - BORIS-NI (WFS): Bodenrichtwertzonen · Datenlizenz Deutschland Namensnennung 2.0
   Bewusst NICHT übernommen: Lagebezeichnungen (Adressen). Eigentümer sind in den Diensten nicht enthalten.
   ============================================================ */

const ALKIS_WFS = "https://opendata.lgln.niedersachsen.de/doorman/noauth/alkis_wfs_einfach";
const BORIS_WFS = "https://opendata.lgln.niedersachsen.de/doorman/noauth/boris_wfs";

// Tatsächliche Nutzung (ALKIS) → Klassen für Brutto/Netto
const NUTZUNG_KLASSE = {
  "Straßenverkehr": "verkehr", "Weg": "verkehr", "Platz": "verkehr", "Flugverkehr": "verkehr", "Schiffsverkehr": "verkehr",
  "Bahnverkehr": "bahn",
  "Fließgewässer": "wasser", "Hafenbecken": "wasser", "Stehendes Gewässer": "wasser", "Meer": "wasser",
  "Sport-, Freizeit- und Erholungsfläche": "gruen", "Friedhof": "gruen", "Landwirtschaft": "gruen", "Wald": "gruen",
  "Gehölz": "gruen", "Heide": "gruen", "Moor": "gruen", "Sumpf": "gruen", "Unland/Vegetationslose Fläche": "gruen"
};
// alles andere (Wohnbau, Gewerbe, gemischte Nutzung, besondere funktionale Prägung …) = Bauland

// Alle Objekte eines Typs im Rechteck holen (seitenweise, falls es viele sind)
async function wfsHolen(dienst, typ, utmBox) {
  const teile = [];
  for (let start = 0; start < 50000; start += 5000) {
    const url = `${dienst}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=${typ}` +
      `&BBOX=${utmBox.join(",")},urn:ogc:def:crs:EPSG::25832&COUNT=5000&STARTINDEX=${start}`;
    const antwort = await fetch(url);
    if (!antwort.ok) throw new Error(`${typ}: Fehler ${antwort.status}`);
    const text = await antwort.text();
    const mitglieder = text.split(/<wfs:member>/).slice(1);
    teile.push(...mitglieder);
    if (mitglieder.length < 5000) break;
  }
  return teile;
}

// Flächen eines GML-Objekts (UTM 32) → GeoJSON-Geometrie in Grad
function gmlFlaeche(text) {
  const polys = [];
  for (const p of text.split(/<gml:Polygon[\s>]/).slice(1)) {
    const ringe = [];
    for (const teil of p.split(/<gml:(?=exterior|interior)/).slice(1)) {
      const pl = teil.match(/<gml:posList[^>]*>([^<]+)</);
      if (!pl) continue;
      const z = pl[1].trim().split(/\s+/).map(Number);
      const ring = [];
      for (let i = 0; i + 1 < z.length; i += 2) ring.push(utmZuGrad(z[i], z[i + 1]));
      if (ring.length >= 4) ringe.push(ring);
    }
    if (ringe.length) polys.push(ringe);
  }
  if (!polys.length) return null;
  return polys.length === 1 ? { type: "Polygon", coordinates: polys[0] } : { type: "MultiPolygon", coordinates: polys };
}
const gmlWert = (text, tag) => ((text.match(new RegExp(`<(?:\\w+:)?${tag}>([^<]*)<`)) || [])[1] || "").trim();

// Hauptfunktion: lädt alles für das Rechteck [W, S, O, N]. Gibt null zurück, wenn außerhalb Niedersachsens.
async function ladeKataster(bbox) {
  const [w, s, o, n] = bbox;
  const ecken = [[w, s], [o, s], [o, n], [w, n]].map(([lon, lat]) => gradZuUtm(lon, lat));
  const utmBox = [Math.min(...ecken.map((p) => p[0])), Math.min(...ecken.map((p) => p[1])),
    Math.max(...ecken.map((p) => p[0])), Math.max(...ecken.map((p) => p[1]))].map((v) => v.toFixed(1));

  const [flst, nutz, brw] = await Promise.all([
    wfsHolen(ALKIS_WFS, "ave:Flurstueck", utmBox),
    wfsHolen(ALKIS_WFS, "ave:Nutzung", utmBox),
    wfsHolen(BORIS_WFS, "boris:BR_BodenrichtwertZonal", utmBox).catch(() => [])
  ]);
  if (!flst.length && !nutz.length && !brw.length) return null;

  const sammlung = (liste) => ({ type: "FeatureCollection", features: liste.filter(Boolean) });
  const zuschneiden = (geometrie, properties) => {
    if (!geometrie) return null;
    const teil = schneide({ type: "Feature", geometry: geometrie, properties }, bbox);
    if (teil) teil.properties = properties;
    return teil;
  };

  // Flurstücke: Grenze, Kennzeichen (Gemarkung, Flur, Nummer) und amtliche Fläche – keine Lagebezeichnung
  const flurstuecke = flst.map((m, i) => {
    const geo = gmlFlaeche(m);
    const flaeche = parseFloat(gmlWert(m, "flaeche")) || 0;
    if (!geo) return null;
    const mitte = turf.pointOnFeature({ type: "Feature", geometry: geo }).geometry.coordinates;
    const imGebiet = mitte[0] >= w && mitte[0] <= o && mitte[1] >= s && mitte[1] <= n;
    const nenner = gmlWert(m, "flstnrnen");
    return zuschneiden(geo, {
      id: gmlWert(m, "idflurst") || `f${i}`, flaeche, imGebiet, mitte,
      gemarkung: gmlWert(m, "gemarkung"), flur: String(parseInt(gmlWert(m, "flur"), 10) || ""),
      nummer: `${parseInt(gmlWert(m, "flstnrzae"), 10) || ""}${nenner ? `/${parseInt(nenner, 10)}` : ""}`
    });
  });

  // Tatsächliche Nutzung (lückenlos, ohne Überlappung)
  const nutzung = nutz.map((m) => {
    const art = gmlWert(m, "nutzart");
    return zuschneiden(gmlFlaeche(m), { art, klasse: NUTZUNG_KLASSE[art] || "bauland" });
  });

  // Bodenrichtwerte: je Zone nur der neueste Stichtag
  const zonen = new Map();
  for (const m of brw) {
    const nr = gmlWert(m, "bodenrichtwertNummer"), stichtag = gmlWert(m, "stichtag");
    const alt = zonen.get(nr);
    if (!alt || stichtag > alt.stichtag) zonen.set(nr, { m, stichtag });
  }
  const bodenrichtwerte = [...zonen.values()].map(({ m, stichtag }) => {
    const gfz = m.match(/wertrelevanteGeschossflaechenzahl>[\s\S]*?<boris:wert>([^<]+)</);
    return zuschneiden(gmlFlaeche(m), {
      wert: parseFloat(gmlWert(m, "bodenrichtwert")) || 0,
      stichtag,
      zustand: gmlWert(m, "entwicklungszustand"), // B = baureifes Land
      art: (m.match(/<boris:nutzung>[\s\S]*?<boris:art>([^<]+)</) || [])[1] || "",
      gfz: gfz ? parseFloat(gfz[1]) : null,
      name: gmlWert(m, "bodenrichtwertzoneName")
    });
  });

  return {
    flurstuecke: sammlung(flurstuecke),
    nutzung: sammlung(nutzung),
    bodenrichtwerte: sammlung(bodenrichtwerte),
    quelle: `Flurstücke und tatsächliche Nutzung: LGLN (${new Date().getFullYear()}), CC BY 4.0` +
      (brw.length ? " · Bodenrichtwerte: Gutachterausschüsse für Grundstückswerte, BORIS-NI (dl-de/by-2-0)" : "")
  };
}
