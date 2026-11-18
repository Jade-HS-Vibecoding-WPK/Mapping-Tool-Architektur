/* ============================================================
   SiteKick – Gelände (Höhenmodell DGM1 des LGLN)

   Das Digitale Geländemodell des LGLN gibt die Höhe des Erdbodens in einem 1-m-Raster an (ohne Gebäude und Bäume).
   Es liegt als "Cloud Optimized GeoTIFF" auf einem offenen Server. Mit Teil-Anfragen laden wir nur das Stück,
   das zu unserem Rechteck gehört (meist unter 2 MB), und setzen es bei Bedarf aus mehreren Kacheln zusammen.

   Ergebnis (globale Variable "gelaende"):
     { x0, yOben, breite, hoehe, daten, min, max, jahr }
     daten: Float32Array, Zeile 0 = Norden. Der Mittelpunkt des Bildpunkts (Spalte s, Zeile z) liegt bei
     Ost = x0 + s + 0,5 und Nord = yOben - z - 0,5 (UTM 32, Meter). Höhen in Meter über NHN.
   ============================================================ */

"use strict";

const DGM_SUCHE = "https://dgm.stac.lgln.niedersachsen.de/search";
const dgmStatusFeld = document.getElementById("dgm-status");
let gelaende = null;
let gelaendeQuelle = "";

function zeigeGelaendeStatus(text) {
  dgmStatusFeld.textContent = text;
  dgmStatusFeld.hidden = !text;
}

// Die Kacheln, die unser Rechteck berühren: pro Kachel die neueste Ausgabe
async function sucheDgmKacheln([west, sued, ost, nord]) {
  const bbox = [west, sued, ost, nord].map((z) => z.toFixed(6)).join(",");
  const antwort = await fetch(`${DGM_SUCHE}?collections=dgm1&limit=40&bbox=${bbox}`);
  if (!antwort.ok) throw new Error(`Die Suche beim LGLN meldet Fehler ${antwort.status}`);
  const daten = await antwort.json();
  const neueste = new Map();
  for (const f of daten.features || []) {
    const treffer = /dgm1_32_(\d+)_(\d+)_/.exec(f.id);
    const url = f.assets && f.assets["dgm1-tif"] && f.assets["dgm1-tif"].href;
    if (!treffer || !url) continue;
    const schluessel = `${treffer[1]}_${treffer[2]}`;
    const datum = (f.properties && f.properties.datetime) || "";
    if (!neueste.has(schluessel) || datum > neueste.get(schluessel).datum) {
      neueste.set(schluessel, { ost: Number(treffer[1]) * 1000, nord: Number(treffer[2]) * 1000, url, datum, jahr: datum.slice(0, 4) });
    }
  }
  return [...neueste.values()];
}

// Lädt das Gelände für das Rechteck. Liefert { gelaende } oder { keine } oder { fehler } oder { abgebrochen }. Wirft nie.
async function starteGelaende(rahmen, nummer) {
  try {
    if (typeof GeoTIFF === "undefined") throw new Error("GeoTIFF-Bibliothek nicht geladen");
    zeigeGelaendeStatus("Gelände wird beim LGLN geladen …");
    ladeSetze("dgm", "laedt", null, "wird geladen …");
    const [west, sued, ost, nord] = turf.bbox(rahmen);
    const kacheln = await sucheDgmKacheln([west, sued, ost, nord]);
    if (nummer !== ladeNummer) return { abgebrochen: true };
    if (!kacheln.length) return { keine: true };
    const dgmName = (k) => `${kachelName("_" + k.ost / 1000 + "_" + k.nord / 1000 + "_")}${k.jahr ? ` (${k.jahr})` : ""}`;
    kacheln.forEach((k) => ladeUnter("dgm", `${k.ost}_${k.nord}`, dgmName(k), "laedt", null, "wartet …"));

    const ecken = [[west, sued], [west, nord], [ost, sued], [ost, nord]].map((e) => utmWandler.forward(e));
    const xs = ecken.map((e) => e[0]), ys = ecken.map((e) => e[1]);
    // Kleiner Rand von 2 m, damit auch die Randpunkte der Fläche sicher im Raster liegen
    const x0 = Math.floor(Math.min(...xs)) - 2, xEnde = Math.ceil(Math.max(...xs)) + 2;
    const yUnten = Math.floor(Math.min(...ys)) - 2, yOben = Math.ceil(Math.max(...ys)) + 2;
    const breite = xEnde - x0, hoehe = yOben - yUnten;
    if (breite * hoehe > 4_000_000) throw new Error("Gebiet für das Gelände zu groß");
    const daten = new Float32Array(breite * hoehe).fill(NaN);

    await Promise.all(kacheln.map(async (k) => {
      // Teil der Kachel, der in unser Raster fällt (Pixelgrenzen in der Kachel, Zeile 0 = Norden der Kachel)
      const ax = Math.max(x0, k.ost), bx = Math.min(xEnde, k.ost + 1000);
      const ayOben = Math.min(yOben, k.nord + 1000), ayUnten = Math.max(yUnten, k.nord);
      if (bx <= ax || ayOben <= ayUnten) { ladeUnter("dgm", `${k.ost}_${k.nord}`, dgmName(k), "abgebrochen", 1, "nicht nötig"); return; }
      const schluessel = `${k.ost}_${k.nord}`;
      try {
      const bild = await (await GeoTIFF.fromUrl(k.url)).getImage();
      const fenster = [ax - k.ost, k.nord + 1000 - ayOben, bx - k.ost, k.nord + 1000 - ayUnten];
      const werte = (await bild.readRasters({ window: fenster, samples: [0] }))[0];
      const w = fenster[2] - fenster[0], h = fenster[3] - fenster[1];
      const spalte0 = ax - x0, zeile0 = yOben - ayOben;
      for (let z = 0; z < h; z++) {
        for (let s = 0; s < w; s++) {
          const v = werte[z * w + s];
          if (v > -1000) daten[(zeile0 + z) * breite + spalte0 + s] = v;   // -9999 = kein Wert
        }
      }
      ladeUnter("dgm", schluessel, dgmName(k), "fertig", 1, `${w} × ${h} m`);
      } catch (fehler) {
        ladeUnter("dgm", schluessel, dgmName(k), "fehler", 1, "Fehler");
        throw fehler;
      }
    }));
    if (nummer !== ladeNummer) return { abgebrochen: true };

    // Statistik und Lücken füllen (nächster bekannter Wert in der Zeile; Reststücke zeilenweise)
    let min = Infinity, max = -Infinity, vorhanden = 0;
    for (const v of daten) if (!Number.isNaN(v)) { vorhanden++; if (v < min) min = v; if (v > max) max = v; }
    if (!vorhanden) return { keine: true };
    for (let z = 0; z < hoehe; z++) {
      let letzter = NaN;
      for (let s = 0; s < breite; s++) { const i = z * breite + s; if (Number.isNaN(daten[i])) { if (!Number.isNaN(letzter)) daten[i] = letzter; } else letzter = daten[i]; }
      letzter = NaN;
      for (let s = breite - 1; s >= 0; s--) { const i = z * breite + s; if (Number.isNaN(daten[i])) { if (!Number.isNaN(letzter)) daten[i] = letzter; } else letzter = daten[i]; }
    }
    const jahre = kacheln.map((k) => k.jahr).filter(Boolean).sort();
    return { gelaende: { x0, yOben, breite, hoehe, daten, min, max, jahr: jahre[jahre.length - 1] || "", kacheln: kacheln.length, luecken: vorhanden < daten.length } };
  } catch (fehler) {
    return { fehler: fehler.message };
  }
}

function wendeGelaendeAn(ergebnis) {
  if (ergebnis.abgebrochen) return;
  if (ergebnis.fehler) {
    zeigeGelaendeStatus(`Gelände konnte nicht geladen werden (${ergebnis.fehler}). Das 3D-Modell steht auf einem flachen Boden.`);
    ladeSetze("dgm", "fehler", 1, "nicht geladen, 3D steht auf flachem Boden");
    return;
  }
  if (ergebnis.keine) {
    zeigeGelaendeStatus("Gelände: Für dieses Gebiet gibt es keine Höhendaten (nur Niedersachsen). Das 3D-Modell steht auf einem flachen Boden.");
    ladeSetze("dgm", "keine", 1, "keine Höhendaten (nur Niedersachsen)");
    return;
  }
  gelaende = ergebnis.gelaende;
  ladeSetze("dgm", "fertig", 1, `${zahl(gelaende.min, 1)} bis ${zahl(gelaende.max, 1)} m`);
  gelaendeQuelle = `Gelände: © GeoBasis-DE/LGLN ${gelaende.jahr}, Daten geändert`;
  zeigeGelaendeStatus(`Gelände geladen: ${zahl(gelaende.min, 1)} bis ${zahl(gelaende.max, 1)} m über NHN (Unterschied ${zahl(gelaende.max - gelaende.min, 1)} m). Quelle: © GeoBasis-DE/LGLN ${gelaende.jahr}, Daten geändert.`);
  wendeAnsichtAn();
}

// Höhe an einem Ort (UTM-Meter), bilinear aus dem Raster. Gibt null zurück, wenn es kein Gelände gibt.
function gelaendeHoehe(ost, nord) {
  if (!gelaende) return null;
  const g = gelaende;
  const sp = Math.min(g.breite - 1, Math.max(0, ost - g.x0 - 0.5));
  const ze = Math.min(g.hoehe - 1, Math.max(0, g.yOben - nord - 0.5));
  const s0 = Math.floor(sp), z0 = Math.floor(ze);
  const s1 = Math.min(g.breite - 1, s0 + 1), z1 = Math.min(g.hoehe - 1, z0 + 1);
  const fs = sp - s0, fz = ze - z0;
  const d = g.daten;
  const oben = d[z0 * g.breite + s0] * (1 - fs) + d[z0 * g.breite + s1] * fs;
  const unten = d[z1 * g.breite + s0] * (1 - fs) + d[z1 * g.breite + s1] * fs;
  return oben * (1 - fz) + unten * fz;
}
