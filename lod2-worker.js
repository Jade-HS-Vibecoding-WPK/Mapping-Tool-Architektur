/* ============================================================
   SiteKick – Hintergrundprogramm für die LoD2-Dachformen

   Warum ein eigenes Programm? Eine LoD2-Kachel des LGLN ist ca. 57 MB groß (ein Quadratkilometer
   Gebäude als XML-Text). Würde die Seite das selbst einlesen, bliebe sie einige Sekunden "hängen".
   Dieses Programm läuft daneben im Hintergrund (Web Worker) und liest die Datei stückweise:
   Es lädt die Kachel, schneidet sie Gebäude für Gebäude auseinander und behält nur die Gebäude,
   die im gewählten Rechteck liegen. Nur deren Dachflächen schickt es an die Seite zurück.

   Eingabe:  { kacheln: [{ id, url }], bbox: [Ost_min, Nord_min, Ost_max, Nord_max] }  (UTM 32, Meter)
   Ausgabe:  { typ: "fortschritt", ... } zwischendurch,
             { typ: "fertig", gebaeude: [...] } am Ende oder { typ: "fehler", text } bei Problemen.
   Ein Gebäude: { id, dachtyp, funktion, hoehe, trauf, boden, flaechen: [ [ring, ring, ...], ... ], waende: [ ... ] }
   Ein Ring ist eine flache Zahlenliste [x, y, z, x, y, z, ...] in Metern (UTM 32, Höhe über NHN).
   ============================================================ */

"use strict";

const BLOCK_ENDE = "</core:cityObjectMember>"; // jedes Gebäude steckt in so einem Block
const RAND_M = 300;                              // so weit darf ein Gebäude über das Rechteck hinausragen

self.onmessage = async (ereignis) => {
  const { kacheln, bbox } = ereignis.data;
  try {
    const fortschritt = new Map(); // Kachel-ID -> { geladen, gesamt }
    let gefunden = 0;
    let letzteMeldung = 0;

    const melde = (id, geladen, gesamt, erzwingen) => {
      fortschritt.set(id, { geladen, gesamt });
      const jetzt = Date.now();
      if (!erzwingen && jetzt - letzteMeldung < 250) return; // höchstens 4 Meldungen pro Sekunde
      letzteMeldung = jetzt;
      let g = 0, s = 0;
      for (const p of fortschritt.values()) { g += p.geladen; s += p.gesamt; }
      const kachelStand = [...fortschritt.entries()].map(([id, p]) => ({ id, geladen: p.geladen, gesamt: p.gesamt }));
      self.postMessage({ typ: "fortschritt", geladen: g, gesamt: s, kacheln: kacheln.length, gemeldet: fortschritt.size, gebaeude: gefunden, kachelStand });
    };

    const alle = await Promise.all(kacheln.map(async (kachel) => {
      const liste = await leseKachelMitWiederholung(kachel, bbox, melde, (delta) => { gefunden += delta; });
      return liste;
    }));

    // Ein Gebäude kann in zwei Kacheln vorkommen, wenn es auf der Grenze liegt: doppelte entfernen
    const gesehen = new Set();
    const gebaeude = [];
    for (const liste of alle) {
      for (const g of liste) {
        if (gesehen.has(g.id)) continue;
        gesehen.add(g.id);
        gebaeude.push(g);
      }
    }
    self.postMessage({ typ: "fertig", gebaeude });
  } catch (fehler) {
    self.postMessage({ typ: "fehler", text: fehler && fehler.message ? fehler.message : String(fehler) });
  }
};

// Lädt eine Kachel; bis zu drei Versuche, falls die Verbindung abbricht oder stehen bleibt
async function leseKachelMitWiederholung(kachel, bbox, melde, zaehleGebaeude) {
  let letzterFehler;
  for (let versuch = 1; versuch <= 3; versuch++) {
    let gezaehlt = 0;
    try {
      return await leseKachel(kachel, bbox, melde, () => { gezaehlt++; zaehleGebaeude(1); });
    } catch (fehler) {
      letzterFehler = fehler;
      zaehleGebaeude(-gezaehlt);   // Treffer dieses Versuchs wieder abziehen, beim nächsten Versuch zählen wir neu
      melde(kachel.id, 0, 0, true);
      if (versuch < 3) self.postMessage({ typ: "hinweis", text: `Verbindung hing (${fehler.message}), neuer Versuch ${versuch + 1} von 3 …` });
      await new Promise((ok) => setTimeout(ok, 1500 * versuch));
    }
  }
  throw letzterFehler;
}

// Lädt eine Kachel als Datenstrom und zerlegt sie in Gebäude-Blöcke.
// Kommt 15 Sekunden lang kein neues Datenstück an, brechen wir ab (der Aufrufer versucht es dann erneut).
const STILLSTAND_MS = 15_000;
async function leseKachel(kachel, bbox, melde, zaehleGebaeude) {
  const abbruch = new AbortController();
  let wecker = null;
  const stelleWecker = () => { clearTimeout(wecker); wecker = setTimeout(() => abbruch.abort(), STILLSTAND_MS); };
  try {
    stelleWecker();
    const antwort = await fetch(kachel.url, { signal: abbruch.signal });
    if (!antwort.ok) throw new Error(`Kachel ${kachel.id}: Server meldet Fehler ${antwort.status}`);
    const gesamt = Number(antwort.headers.get("content-length")) || 0;
    const leser = antwort.body.getReader();
    const dekoder = new TextDecoder("utf-8");
    const ergebnis = [];
    let puffer = "";
    let geladen = 0;

    for (;;) {
      const { done, value } = await leser.read();
      stelleWecker();
      if (done) {
        puffer += dekoder.decode();
      } else {
        geladen += value.byteLength;
        puffer += dekoder.decode(value, { stream: true });
      }
      // Alle vollständigen Gebäude-Blöcke im Puffer abarbeiten, den Rest für den nächsten Brocken behalten
      let ende;
      while ((ende = puffer.indexOf(BLOCK_ENDE)) !== -1) {
        const block = puffer.slice(0, ende + BLOCK_ENDE.length);
        puffer = puffer.slice(ende + BLOCK_ENDE.length);
        const gebaeude = verarbeiteBlock(block, bbox);
        if (gebaeude) { ergebnis.push(gebaeude); zaehleGebaeude(); }
      }
      melde(kachel.id, geladen, gesamt || geladen, done);
      if (done) break;
    }
    return ergebnis;
  } catch (fehler) {
    if (fehler && fehler.name === "AbortError") throw new Error(`Kachel ${kachel.id}: Zeitüberschreitung (keine Daten seit ${STILLSTAND_MS / 1000} s)`);
    throw fehler;
  } finally {
    clearTimeout(wecker);
  }
}

const zahlen = (text) => text.trim().split(/\s+/).map(Number);

// Liest ein Gebäude aus seinem Textblock. Gibt null zurück, wenn es nicht im Rechteck liegt.
function verarbeiteBlock(block, bbox) {
  if (!block.includes("<bldg:Building")) return null;

  // Schneller Vorabtest: Liegt schon die erste Koordinate weit außerhalb, sparen wir uns das Einlesen
  const erste = /<gml:posList[^>]*>\s*(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/.exec(block);
  if (!erste) return null;
  const x0 = Number(erste[1]), y0 = Number(erste[2]);
  if (x0 < bbox[0] - RAND_M || x0 > bbox[2] + RAND_M || y0 < bbox[1] - RAND_M || y0 > bbox[3] + RAND_M) return null;

  const idTreffer = /<bldg:Building[^>]*gml:id="([^"]+)"/.exec(block);
  const dachTreffer = /<bldg:roofType>(\d+)<\/bldg:roofType>/.exec(block);
  // Merkmale für die Kennzahlen: Nutzungscode, Höhe über Gelände, Traufhöhe und Geländehöhe (beide über NHN)
  const funktionTreffer = /<bldg:function>([^<]*)<\/bldg:function>/.exec(block);
  const hoeheTreffer = /<bldg:measuredHeight[^>]*>([-\d.]+)<\/bldg:measuredHeight>/.exec(block);
  const merkmal = (name) => {
    const m = new RegExp('name="' + name + '">\\s*<gen:value>([^<]*)</gen:value>').exec(block);
    return m && m[1] !== "" && !Number.isNaN(Number(m[1])) ? Number(m[1]) : null;
  };

  // Liest alle Flächen (Polygone) einer Sorte, z. B. Dach oder Wand, aus dem Gebäudetext
  const leseFlaechen = (sorte) => {
    const liste = [];
    for (const teil of block.match(new RegExp("<bldg:" + sorte + "[\\s\\S]*?</bldg:" + sorte + ">", "g")) || []) {
      for (const polygon of teil.match(/<gml:Polygon[\s\S]*?<\/gml:Polygon>/g) || []) {
        // Zuerst kommt der Außenring, danach eventuelle Löcher (Innenhöfe)
        const ringe = [];
        for (const treffer of polygon.matchAll(/<gml:posList[^>]*>([^<]*)<\/gml:posList>/g)) {
          const ring = zahlen(treffer[1]);
          if (ring.length >= 9) ringe.push(ring);
        }
        if (ringe.length) liste.push(ringe);
      }
    }
    return liste;
  };
  const flaechen = leseFlaechen("RoofSurface");
  // Wände (und Verschlussflächen zwischen Gebäudeteilen) brauchen wir für das 3D-Modell
  const waende = [...leseFlaechen("WallSurface"), ...leseFlaechen("ClosureSurface")];
  const beruehrt = flaechen.some((ringe) => beruehrtRechteck(ringe[0], bbox));
  if (!beruehrt) return null;
  return {
    id: idTreffer ? idTreffer[1] : "",
    dachtyp: dachTreffer ? dachTreffer[1] : "",
    funktion: funktionTreffer ? funktionTreffer[1].trim() : "",
    hoehe: hoeheTreffer ? Number(hoeheTreffer[1]) : null,   // Gebäudehöhe über Gelände (m)
    trauf: merkmal("MittlereTraufHoehe"),                    // Traufhöhe über NHN (m)
    boden: merkmal("AbsoluteHoehe"),                         // Geländehöhe über NHN (m)
    flaechen,
    waende
  };
}

// Liegt mindestens ein Eckpunkt der Fläche im Rechteck?
function beruehrtRechteck(ring, bbox) {
  for (let i = 0; i < ring.length; i += 3) {
    if (ring[i] >= bbox[0] && ring[i] <= bbox[2] && ring[i + 1] >= bbox[1] && ring[i + 1] <= bbox[3]) return true;
  }
  return false;
}
