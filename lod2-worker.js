/* ============================================================
   Ortsanalyse – Hintergrundprogramm für die LoD2-Dachformen

   Warum ein eigenes Programm? Eine LoD2-Kachel des LGLN ist ca. 57 MB groß (ein Quadratkilometer
   Gebäude als XML-Text). Würde die Seite das selbst einlesen, bliebe sie einige Sekunden "hängen".
   Dieses Programm läuft daneben im Hintergrund (Web Worker) und liest die Datei stückweise:
   Es lädt die Kachel, schneidet sie Gebäude für Gebäude auseinander und behält nur die Gebäude,
   die im gewählten Rechteck liegen. Nur deren Dachflächen schickt es an die Seite zurück.

   Eingabe:  { kacheln: [{ id, url }], bbox: [Ost_min, Nord_min, Ost_max, Nord_max] }  (UTM 32, Meter)
   Ausgabe:  { typ: "fortschritt", ... } zwischendurch,
             { typ: "fertig", gebaeude: [...] } am Ende oder { typ: "fehler", text } bei Problemen.
   Ein Gebäude: { id, dachtyp, flaechen: [ [ring, ring, ...], ... ] }
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
      self.postMessage({ typ: "fortschritt", geladen: g, gesamt: s, kacheln: kacheln.length, gebaeude: gefunden });
    };

    const alle = await Promise.all(kacheln.map(async (kachel) => {
      const liste = await leseKachel(kachel, bbox, melde, () => { gefunden++; });
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

// Lädt eine Kachel als Datenstrom und zerlegt sie in Gebäude-Blöcke
async function leseKachel(kachel, bbox, melde, zaehleGebaeude) {
  const antwort = await fetch(kachel.url);
  if (!antwort.ok) throw new Error(`Kachel ${kachel.id}: Server meldet Fehler ${antwort.status}`);
  const gesamt = Number(antwort.headers.get("content-length")) || 0;
  const leser = antwort.body.getReader();
  const dekoder = new TextDecoder("utf-8");
  const ergebnis = [];
  let puffer = "";
  let geladen = 0;

  for (;;) {
    const { done, value } = await leser.read();
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

  const flaechen = [];
  let beruehrt = false;
  for (const dach of block.match(/<bldg:RoofSurface[\s\S]*?<\/bldg:RoofSurface>/g) || []) {
    for (const polygon of dach.match(/<gml:Polygon[\s\S]*?<\/gml:Polygon>/g) || []) {
      // Zuerst kommt der Außenring, danach eventuelle Löcher (Innenhöfe)
      const ringe = [];
      for (const treffer of polygon.matchAll(/<gml:posList[^>]*>([^<]*)<\/gml:posList>/g)) {
        const ring = zahlen(treffer[1]);
        if (ring.length >= 9) ringe.push(ring);
      }
      if (!ringe.length) continue;
      flaechen.push(ringe);
      if (!beruehrt && beruehrtRechteck(ringe[0], bbox)) beruehrt = true;
    }
  }
  if (!beruehrt) return null;
  return { id: idTreffer ? idTreffer[1] : "", dachtyp: dachTreffer ? dachTreffer[1] : "", flaechen };
}

// Liegt mindestens ein Eckpunkt der Fläche im Rechteck?
function beruehrtRechteck(ring, bbox) {
  for (let i = 0; i < ring.length; i += 3) {
    if (ring[i] >= bbox[0] && ring[i] <= bbox[2] && ring[i + 1] >= bbox[1] && ring[i + 1] <= bbox[3]) return true;
  }
  return false;
}
