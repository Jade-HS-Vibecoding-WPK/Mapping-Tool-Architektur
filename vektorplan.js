/* ============================================================
   Ortsanalyse – 2D-Pläne als Vektorgrafik (für PDF und PNG-Export)
   Liest den Stil der Planansicht (Ebenen, Filter, Farben, Linienstärken) und zeichnet jede sichtbare
   Ebene als SVG in Millimetern auf dem Papier, maßstäblich in UTM 32 (Norden oben).
   So sehen die Pläne im Export genauso aus wie auf dem Bildschirm, bleiben aber Linien und Flächen
   (in Illustrator, InDesign usw. bearbeitbar).
   ============================================================ */

// ---------- Kleine Auswertung der MapLibre-Ausdrücke (nur, was die Pläne benutzen) ----------
function auswerten(e, f, z) {
  if (!Array.isArray(e)) return e;
  const [op, ...a] = e;
  const v = (x) => auswerten(x, f, z);
  switch (op) {
    case "get": return f.properties[a[0]];
    case "has": return f.properties[a[0]] !== undefined && f.properties[a[0]] !== null;
    case "zoom": return z;
    case "literal": return a[0];
    case "==": return v(a[0]) === v(a[1]);
    case "!=": return v(a[0]) !== v(a[1]);
    case ">=": return v(a[0]) >= v(a[1]);
    case "<=": return v(a[0]) <= v(a[1]);
    case ">": return v(a[0]) > v(a[1]);
    case "<": return v(a[0]) < v(a[1]);
    case "!": return !v(a[0]);
    case "all": return a.every((x) => v(x));
    case "any": return a.some((x) => v(x));
    case "+": return a.reduce((s, x) => s + v(x), 0);
    case "*": return a.reduce((s, x) => s * v(x), 1);
    case "-": return a.length === 1 ? -v(a[0]) : v(a[0]) - v(a[1]);
    case "/": return v(a[0]) / v(a[1]);
    case "coalesce": for (const x of a) { const w = v(x); if (w != null) return w; } return null;
    case "to-number": return +v(a[0]);
    case "match": {
      const x = v(a[0]);
      for (let i = 1; i < a.length - 1; i += 2) if (Array.isArray(a[i]) ? a[i].includes(x) : a[i] === x) return v(a[i + 1]);
      return v(a[a.length - 1]);
    }
    case "case": {
      for (let i = 0; i < a.length - 1; i += 2) if (v(a[i])) return v(a[i + 1]);
      return v(a[a.length - 1]);
    }
    case "step": {
      const x = v(a[0]);
      let r = v(a[1]);
      for (let i = 2; i < a.length; i += 2) { if (x >= v(a[i])) r = v(a[i + 1]); else break; }
      return r;
    }
    case "interpolate": {
      const [art, eingabe, ...stufen] = a;
      const x = v(eingabe), basis = art[0] === "exponential" ? art[1] : 1;
      if (x <= stufen[0]) return v(stufen[1]);
      for (let i = 0; i < stufen.length - 2; i += 2) {
        const z0 = stufen[i], z1 = stufen[i + 2];
        if (x <= z1) {
          const t = basis === 1 ? (x - z0) / (z1 - z0) : (basis ** (x - z0) - 1) / (basis ** (z1 - z0) - 1);
          const w0 = v(stufen[i + 1]), w1 = v(stufen[i + 3]);
          return w0 + t * (w1 - w0);
        }
      }
      return v(stufen[stufen.length - 1]);
    }
    default:
      console.warn("Ausdruck im Vektor-Export nicht unterstützt:", op);
      return null;
  }
}

// MapLibre-Farbangaben → SVG (Farbe und Deckkraft getrennt, damit PDF-Programme sie verstehen)
function svgFarbe(farbe) {
  if (typeof farbe !== "string") return { farbe: "#000", deckkraft: 1 };
  const m = farbe.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const t = m[1].split(",").map((s) => +s.trim());
    return { farbe: `rgb(${t[0]},${t[1]},${t[2]})`, deckkraft: t.length > 3 ? t[3] : 1 };
  }
  if (/^#[0-9a-f]{8}$/i.test(farbe)) return { farbe: farbe.slice(0, 7), deckkraft: parseInt(farbe.slice(7), 16) / 255 };
  return { farbe, deckkraft: 1 };
}

const PX_MM = 25.4 / 96; // ein Bildschirmpixel in mm (Linienstärken)

// ---------- Plan als SVG-Gruppe ----------
// rahmen: { x, y, w, h } in mm auf dem Blatt; massstab: z. B. 2000
function vektorPlanSvg(plan, { rahmen, massstab, id }) {
  const stil = planKarte.getStyle();
  const sichtbar = sichtbareEbenen(plan);
  const [w, s, o, n] = analyseErgebnis.bbox;
  const mitteLL = [(w + o) / 2, (s + n) / 2];
  const [E0, N0] = gradZuUtm(...mitteLL);
  const cx = rahmen.x + rahmen.w / 2, cy = rahmen.y + rahmen.h / 2;
  const k = 1000 / massstab; // mm je m
  // Zoomstufe, bei der der Bildschirmplan diesem Maßstab entspricht (für Linienstärken in Pixeln)
  const z = Math.log2((40075016.686 * Math.cos((mitteLL[1] * Math.PI) / 180)) / (512 * ((massstab * 0.0254) / 96)));
  const rand = 5; // mm Zugabe außerhalb des Rahmens
  const xMin = rahmen.x - rand, xMax = rahmen.x + rahmen.w + rand, yMin = rahmen.y - rand, yMax = rahmen.y + rahmen.h + rand;

  // Koordinaten umrechnen (mit Zwischenspeicher, viele Punkte kommen mehrfach vor)
  const cache = new Map();
  const papier = ([lon, lat]) => {
    const key = `${lon},${lat}`;
    let p = cache.get(key);
    if (!p) {
      const [E, N] = gradZuUtm(lon, lat);
      p = [cx + (E - E0) * k, cy - (N - N0) * k];
      cache.set(key, p);
    }
    return p;
  };
  const zahl = (v) => (Math.round(v * 100) / 100).toString();
  const ringPfad = (ring, schliessen) => {
    let d = "";
    ring.forEach((pt, i) => { const [x, y] = papier(pt); d += `${i ? "L" : "M"}${zahl(x)} ${zahl(y)}`; });
    return schliessen ? `${d}Z` : d;
  };
  const imRahmen = (coords) => {
    // grobe Prüfung über die Ausdehnung
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const lauf = (c) => { if (typeof c[0] === "number") { const [x, y] = papier(c); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } else c.forEach(lauf); };
    lauf(coords);
    return x1 >= xMin && x0 <= xMax && y1 >= yMin && y0 <= yMax;
  };
  const polygone = (g) => (g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []);
  const linien = (g) => (g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates
    : g.type === "Polygon" ? g.coordinates : g.type === "MultiPolygon" ? g.coordinates.flat() : []);

  const teile = [];
  for (const ebene of stil.layers) {
    if (ebene.type === "background" || !sichtbar.has(ebene.id)) continue;
    const quelle = stil.sources[ebene.source];
    const daten = quelle && quelle.data;
    const alle = !daten ? [] : daten.type === "Feature" ? [daten] : daten.features || []; // Einzelfläche (z. B. Gebietsrahmen) oder Sammlung
    let features = alle.filter((f) => f.geometry && (!ebene.filter || auswerten(ebene.filter, f, z)));
    const p = ebene.paint || {}, l = ebene.layout || {};
    const wert = (name, f, standard) => (p[name] === undefined ? standard : auswerten(p[name], f, z));
    if (l["line-sort-key"]) features = features.map((f) => [auswerten(l["line-sort-key"], f, z), f]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const gruppe = [];

    if (ebene.type === "fill") {
      for (const f of features) {
        const polys = polygone(f.geometry);
        if (!polys.length || !imRahmen(polys)) continue;
        const d = polys.map((poly) => poly.map((r) => ringPfad(r, true)).join("")).join("");
        const fc = svgFarbe(wert("fill-color", f, "#000"));
        const deck = fc.deckkraft * wert("fill-opacity", f, 1);
        const umriss = p["fill-outline-color"] !== undefined ? svgFarbe(wert("fill-outline-color", f)) : null;
        gruppe.push(`<path d="${d}" fill="${fc.farbe}"${deck < 1 ? ` fill-opacity="${zahl(deck)}"` : ""} fill-rule="evenodd"${umriss
          ? ` stroke="${umriss.farbe}" stroke-width="${zahl(PX_MM)}"` : ""}/>`);
      }
    } else if (ebene.type === "line") {
      for (const f of features) {
        const ls = linien(f.geometry);
        if (!ls.length || !imRahmen(ls)) continue;
        const breite = wert("line-width", f, 1) * PX_MM;
        if (!(breite > 0)) continue;
        const lc = svgFarbe(wert("line-color", f, "#000"));
        const deck = lc.deckkraft * wert("line-opacity", f, 1);
        const strich = p["line-dasharray"] ? auswerten(p["line-dasharray"], f, z) : null;
        const d = ls.map((r) => ringPfad(r, false)).join("");
        gruppe.push(`<path d="${d}" fill="none" stroke="${lc.farbe}" stroke-width="${zahl(breite)}"${deck < 1 ? ` stroke-opacity="${zahl(deck)}"` : ""}`
          + ` stroke-linecap="${l["line-cap"] || "butt"}" stroke-linejoin="${l["line-join"] || "miter"}"`
          + `${strich ? ` stroke-dasharray="${strich.map((x) => zahl(x * breite)).join(" ")}"` : ""}/>`);
      }
    } else if (ebene.type === "circle") {
      for (const f of features) {
        if (f.geometry.type !== "Point" || !imRahmen(f.geometry.coordinates)) continue;
        const [x, y] = papier(f.geometry.coordinates);
        const r = wert("circle-radius", f, 5) * PX_MM;
        const fc = svgFarbe(wert("circle-color", f, "#000"));
        const sc = svgFarbe(wert("circle-stroke-color", f, "#000"));
        const sb = wert("circle-stroke-width", f, 0) * PX_MM;
        gruppe.push(`<circle cx="${zahl(x)}" cy="${zahl(y)}" r="${zahl(r)}" fill="${fc.farbe}" fill-opacity="${zahl(fc.deckkraft * wert("circle-opacity", f, 1))}"`
          + `${sb > 0 ? ` stroke="${sc.farbe}" stroke-width="${zahl(sb)}"` : ""}/>`);
      }
    } else if (ebene.type === "symbol") {
      // Piktogramme der Infrastruktur: Kreis in der Ebenenfarbe mit Maki-Symbol (36 px Bild, 2-fach → 18 px)
      for (const f of features) {
        if (f.geometry.type !== "Point" || !imRahmen(f.geometry.coordinates)) continue;
        const art = INFRA_ART[f.properties.art];
        if (!art) continue;
        const [x, y] = papier(f.geometry.coordinates);
        const d = 18 * auswerten(l["icon-size"] ?? 1, f, z) * PX_MM; // Durchmesser in mm
        const s = d / 36;
        gruppe.push(`<g transform="translate(${zahl(x - d / 2)} ${zahl(y - d / 2)}) scale(${s.toFixed(4)})">`
          + `<circle cx="18" cy="18" r="16.5" fill="${INFRA_EBENEN[art.ebene].farbe}" stroke="#ffffff" stroke-width="2"/>`
          + `<g transform="translate(8.25 8.25) scale(1.3)" fill="#ffffff"><path d="${MAKI[art.symbol]}"/></g></g>`);
      }
    }
    if (gruppe.length) teile.push(`<g data-ebene="${ebene.id}">${gruppe.join("")}</g>`);
  }

  // Bodenrichtwerte: Werte als Text in den Bauland-Zonen (auf dem Bildschirm eigene Etiketten)
  if (plan === "boden" && brwDaten) {
    for (const f of brwDaten.zonen.features) {
      if (f.properties.zustand !== "B" || turf.area(f) < 1500) continue;
      const pt = turf.pointOnFeature(f).geometry.coordinates;
      if (!imRahmen(pt)) continue;
      const [x, y] = papier(pt);
      const text = `${fmt(f.properties.wert)} €`, hoehe = 11 * PX_MM, breite = text.length * hoehe * 0.62 + 1.2;
      teile.push(`<rect x="${zahl(x - breite / 2)}" y="${zahl(y - hoehe * 0.75)}" width="${zahl(breite)}" height="${zahl(hoehe * 1.25)}" fill="#ffffff" fill-opacity="0.85"/>`
        + `<text x="${zahl(x)}" y="${zahl(y + hoehe * 0.3)}" text-anchor="middle" font-family="courier" font-weight="bold" font-size="${zahl(hoehe)}" fill="#111111">${svgText(text)}</text>`);
    }
  }

  return `<defs><clipPath id="${id}"><rect x="${zahl(rahmen.x)}" y="${zahl(rahmen.y)}" width="${zahl(rahmen.w)}" height="${zahl(rahmen.h)}"/></clipPath></defs>`
    + `<g clip-path="url(#${id})">${teile.join("")}</g>`;
}
