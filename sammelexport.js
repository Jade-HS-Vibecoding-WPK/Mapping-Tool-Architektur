/* ============================================================
   SiteKick – Sammel-Export (letzter Reiter)

   Mehrere Pläne und Daten auf einmal wählen, Formate ankreuzen, einen gemeinsamen Ausschnitt festlegen und alles als eine ZIP-Datei
   herunterladen. Der Export-Knopf in den einzelnen Reitern bleibt unverändert.

   So ist es gebaut:
     - Die Dateien entstehen mit denselben Funktionen wie im Export-Fenster (export.js: expSzene, expLayout, expZeichne, expErzeuge).
     - Alle Pläne bekommen dieselben Blatt-Einstellungen und denselben Ausschnitt (in Metern, nicht in Prozent), Schnitt und 3D passen
       sich selbst ans Blatt an.
     - Reiter, deren Daten erst beim Öffnen entstehen (Sonne & Schatten, Schnitt, 3D-Modell), sind erst wählbar, wenn man sie einmal geöffnet hat.
     - PDF und SVG sind Vektor (Linien, Flächen und Schrift bleiben Vektoren). Pixelbilder bleiben Pixelbilder: Luftbild, Sonnen-Raster,
       die 3D-Ansicht und die Schnittzeichnung im PDF (im SVG und DXF ist der Schnitt Vektor). PNG wird aus den Vektoren in 150 bis 600 dpi gerechnet.
   ============================================================ */

"use strict";

const SM_REIHENFOLGE = ["schwarzplan", "strassen", "gruen", "lageplan", "sonne", "flurstuecke", "mieten", "wirtschaft", "infos", "luftbild", "schnitt", "3d", "kennzahlen"];
const SM_FORMATE = [
  { id: "pdf", name: "PDF", hilfe: "Vektor" },
  { id: "svg", name: "SVG", hilfe: "Vektor" },
  { id: "png", name: "PNG", hilfe: "Pixelbild, scharf" },
  { id: "dxf-allplan", name: "DXF Allplan 2024", hilfe: "CAD" },
  { id: "dxf-archicad", name: "DXF ArchiCAD 29", hilfe: "CAD" },
  { id: "geojson", name: "GeoJSON", hilfe: "Geodaten" },
  { id: "csv", name: "CSV", hilfe: "Tabellen" }
];
const SM_SPEICHER = "ortsanalyse-sammel";

const smEl = { feld: document.getElementById("sm-inhalt") };
let smGebaut = false;
let smWahl = { plaene: ["schwarzplan", "lageplan"], formate: ["pdf", "png"], referenz: "lageplan" };
let smVx = 0, smVy = 0;           // Ausschnitt in Prozent des Überstands (wie im Export-Fenster)
let smRefSzene = null, smRefAnsicht = null, smRefLay = null;
let smLaeuft = false;
let smZug = null;

try { const g = JSON.parse(localStorage.getItem(SM_SPEICHER) || "null"); if (g && Array.isArray(g.plaene) && Array.isArray(g.formate)) smWahl = { ...smWahl, ...g }; } catch (_) { /* nicht schlimm */ }
const smSpeichere = () => { try { localStorage.setItem(SM_SPEICHER, JSON.stringify(smWahl)); } catch (_) { /* nicht schlimm */ } };

// ---------- Bereitschaft: welche Pläne kann man jetzt exportieren? ----------
function smBereit(a) {
  if (!gebiet) return { ok: false, grund: "Erst ein Gebiet wählen." };
  if (a === "luftbild") return { ok: true, hinweis: "Das Foto wird beim Export geladen (nur Niedersachsen)." };
  if (!datenVorhanden) return { ok: false, grund: "Erst „Analysieren“ klicken." };
  if (a === "sonne" && !sonneLetztesBild) return { ok: false, grund: "Reiter „Sonne & Schatten“ einmal öffnen, dort wird gerechnet.", reiter: a };
  if (a === "schnitt" && !schnittDaten) return { ok: false, grund: schnittLinie ? "Reiter „Schnitt & Ansicht“ einmal öffnen, dort wird gerechnet." : "Im Reiter „Schnitt & Ansicht“ erst eine Linie ziehen.", reiter: a };
  if (a === "3d" && !(typeof d3 !== "undefined" && d3 && d3.gruppe)) return { ok: false, grund: "Reiter „3D-Modell“ einmal öffnen, dort wird gebaut.", reiter: a };
  if ((a === "flurstuecke" || a === "wirtschaft") && !flurstueckeVorhanden) return { ok: false, grund: "Keine Flurstücke geladen (nur Niedersachsen)." };
  if (a === "mieten" && !mietVorhanden) return { ok: false, grund: "Keine Mietdaten geladen." };
  return { ok: true };
}

// Welche Dateien entstehen aus den gewählten Formaten für diesen Plan?
function smZiele(a, formate) {
  const def = EXP_PLAENE[a];
  const ziele = [];
  for (const f of formate) {
    let z = f;
    if (def.art === "text") z = f === "pdf" ? "kz-pdf" : f === "csv" ? "kz-csv" : null;
    else if (def.art === "bild3d") z = f === "dxf-allplan" ? "dxf3d-allplan" : f === "dxf-archicad" ? "dxf3d-archicad" : f;
    else if (def.art === "schnitt" && (f === "dxf-allplan" || f === "dxf-archicad")) z = "dxf-schnitt";
    if (z && def.knoepfe.includes(z) && !ziele.includes(z)) ziele.push(z);
  }
  return ziele;
}

// ---------- Oberfläche ----------
function smBaue() {
  smGebaut = true;
  const plaeneHtml = SM_REIHENFOLGE.map((a) => `
    <label class="sm-zeile" data-plan="${a}"><input type="checkbox" data-plan="${a}"><span class="sm-name">${EXP_PLAENE[a].name}</span><span class="sm-status" data-status="${a}"></span></label>`).join("");
  const formateHtml = SM_FORMATE.map((f) => `
    <label class="sm-zeile sm-format"><input type="checkbox" data-format="${f.id}"><span class="sm-name">${f.name}</span><span class="sm-status">${f.hilfe}</span></label>`).join("");
  smEl.feld.innerHTML = `
    <h3>Sammel-Export</h3>
    <p class="kz-intro">Wähle mehrere Pläne und Formate, lege einen gemeinsamen Ausschnitt fest und lade alles als <strong>eine ZIP-Datei</strong> herunter. Der Export-Knopf in den einzelnen Reitern bleibt wie er ist.</p>
    <div class="sm-raster">
      <div class="sm-links">
        <section class="sm-karte">
          <h4>1 · Was soll exportiert werden?</h4>
          <div class="sm-knoepfe"><button type="button" class="btn ex-klein" id="sm-alle">Alle bereiten wählen</button><button type="button" class="btn ex-klein" id="sm-keine">Keine</button></div>
          <div class="sm-liste">${plaeneHtml}</div>
        </section>
        <section class="sm-karte">
          <h4>2 · In welchen Formaten?</h4>
          <div class="sm-liste">${formateHtml}</div>
          <p class="ex-klein-text" id="sm-format-hinweis"></p>
        </section>
        <section class="sm-karte ex-form">
          <h4>3 · Blatt und Beschriftung</h4>
          <label>Blattgröße <select id="sm-format"><option>A4</option><option selected>A3</option><option>A2</option><option>A1</option><option>A0</option></select></label>
          <label>Ausrichtung <select id="sm-richtung"><option value="auto" selected>automatisch</option><option value="quer">quer</option><option value="hoch">hoch</option></select></label>
          <label>Maßstab der Pläne (1 : …) <input type="number" id="sm-massstab" min="10" max="200000" step="50" value="2000"></label>
          <button type="button" class="btn ex-klein" id="sm-passend">Ganzes Gebiet aufs Blatt</button>
          <label>Projekt oder Ort (steht im Plankopf) <input type="text" id="sm-ort" placeholder="z. B. Oldenburg Innenstadt"></label>
          <label>Verfasser <input type="text" id="sm-verfasser" placeholder="Name"></label>
          <label>Kurs / Dozent <input type="text" id="sm-kurs" placeholder="Kurs, Dozent*in"></label>
          <label>Datum <input type="text" id="sm-datum"></label>
          <label class="ex-check"><input type="checkbox" id="sm-legende" checked> Legende im Plankopf</label>
          <label>PNG-Auflösung <select id="sm-dpi"><option value="150">150 dpi</option><option value="300" selected>300 dpi</option><option value="600">600 dpi (sehr scharf, große Datei)</option></select></label>
          <p class="ex-klein-text">Schnitt und 3D-Modell passen sich selbst ans Blatt an. Name und Kurs bleiben nur in deinem Browser gespeichert.</p>
        </section>
      </div>
      <div class="sm-rechts">
        <section class="sm-karte">
          <h4>4 · Ausschnitt (gilt für alle Pläne)</h4>
          <label class="sm-ref">Vorschau mit Plan <select id="sm-ref"></select></label>
          <div class="ex-vorschau" id="sm-vorschau"></div>
          <p class="ex-info" id="sm-info"></p>
          <div class="sm-knoepfe"><button type="button" class="btn ex-klein" id="sm-mitte">Ausschnitt zentrieren</button></div>
          <p class="ex-klein-text">Ist das Gebiet größer als das Blatt, zieh den Plan in der Vorschau mit der Maus. Genau dieser Ausschnitt wird für alle gewählten Pläne verwendet.</p>
        </section>
        <section class="sm-karte">
          <h4>5 · Herunterladen</h4>
          <p class="ex-info" id="sm-zusammen"></p>
          <button type="button" class="btn btn-primary" id="sm-los">Alles herunterladen (ZIP)</button>
          <ul class="sm-fortschritt" id="sm-fortschritt"></ul>
          <p class="ex-status" id="sm-status"></p>
        </section>
      </div>
    </div>`;
  // gespeicherte Eingaben
  let g = {}; try { g = JSON.parse(localStorage.getItem("ortsanalyse-export") || "{}"); } catch (_) { /* nicht schlimm */ }
  if (g.format && EXP_FORMATE[g.format]) smEl.feld.querySelector("#sm-format").value = g.format;
  if (g.dpi) smEl.feld.querySelector("#sm-dpi").value = g.dpi;
  smEl.feld.querySelector("#sm-verfasser").value = g.verfasser || "";
  smEl.feld.querySelector("#sm-kurs").value = g.kurs || "";
  smEl.feld.querySelector("#sm-datum").value = new Date().toLocaleDateString("de-DE");
  // Ereignisse
  smEl.feld.querySelectorAll("[data-plan] input, input[data-plan]").forEach((c) => c.addEventListener("change", () => { smLiesWahl(); smRefAktualisieren(); }));
  smEl.feld.querySelectorAll("input[data-format]").forEach((c) => c.addEventListener("change", () => { smLiesWahl(); smZusammenfassung(); }));
  smEl.feld.querySelector("#sm-alle").addEventListener("click", () => { smEl.feld.querySelectorAll("input[data-plan]:not(:disabled)").forEach((c) => { c.checked = true; }); smLiesWahl(); smRefAktualisieren(); });
  smEl.feld.querySelector("#sm-keine").addEventListener("click", () => { smEl.feld.querySelectorAll("input[data-plan]").forEach((c) => { c.checked = false; }); smLiesWahl(); smRefAktualisieren(); });
  smEl.feld.querySelector("#sm-ref").addEventListener("change", (e) => { smWahl.referenz = e.target.value; smSpeichere(); smVorschau(true); });
  ["sm-format", "sm-richtung", "sm-legende", "sm-ort", "sm-massstab"].forEach((id) => smEl.feld.querySelector("#" + id).addEventListener(id === "sm-massstab" || id === "sm-ort" ? "input" : "change", smVorschauVerzoegert));
  smEl.feld.querySelector("#sm-passend").addEventListener("click", smPassend);
  smEl.feld.querySelector("#sm-mitte").addEventListener("click", () => { smVx = 0; smVy = 0; smVorschau(false); });
  smEl.feld.querySelector("#sm-los").addEventListener("click", smExportiere);
  const vor = smEl.feld.querySelector("#sm-vorschau");
  vor.addEventListener("pointerdown", smZugStart);
  vor.addEventListener("pointermove", smZugBewegt);
  vor.addEventListener("pointerup", smZugEnde);
  vor.addEventListener("pointercancel", smZugEnde);
}

const smQ = (sel) => smEl.feld.querySelector(sel);
let smZeitgeber = null;
function smVorschauVerzoegert() { clearTimeout(smZeitgeber); smZeitgeber = setTimeout(() => smVorschau(false), 150); }

function smLiesWahl() {
  smWahl.plaene = [...smEl.feld.querySelectorAll("input[data-plan]")].filter((c) => c.checked).map((c) => c.dataset.plan);
  smWahl.formate = [...smEl.feld.querySelectorAll("input[data-format]")].filter((c) => c.checked).map((c) => c.dataset.format);
  smSpeichere();
  smZusammenfassung();
}

// Zeigt Status je Plan und schaltet nicht bereite Pläne ab
function smStatusAktualisieren() {
  for (const a of SM_REIHENFOLGE) {
    const b = smBereit(a);
    const box = smQ(`input[data-plan="${a}"]`), st = smQ(`[data-status="${a}"]`);
    box.disabled = !b.ok;
    if (!b.ok) box.checked = false; else if (!smGebaut || box.dataset.init !== "1") { box.checked = smWahl.plaene.includes(a); box.dataset.init = "1"; }
    st.innerHTML = b.ok ? `<span class="sm-ok">bereit</span>${b.hinweis ? ` <small>${b.hinweis}</small>` : ""}` : `<span class="sm-nein">${b.grund}</span>${b.reiter ? ` <button type="button" class="sm-oeffnen" data-oeffne="${a}">Öffnen</button>` : ""}`;
  }
  smEl.feld.querySelectorAll("[data-oeffne]").forEach((k) => { k.onclick = (e) => { e.preventDefault(); zeigeAnsicht(k.dataset.oeffne); }; });
  smEl.feld.querySelectorAll("input[data-format]").forEach((c) => { c.checked = smWahl.formate.includes(c.dataset.format); });
  smLiesWahl();
}

function smZusammenfassung() {
  const plaene = smWahl.plaene.filter((a) => smBereit(a).ok);
  const dateien = plaene.map((a) => smZiele(a, smWahl.formate).length).reduce((x, y) => x + y, 0);
  const los = smQ("#sm-los");
  smQ("#sm-zusammen").textContent = plaene.length && dateien ? `${plaene.length} ${plaene.length === 1 ? "Eintrag" : "Einträge"}, ${dateien} ${dateien === 1 ? "Datei" : "Dateien"} in einer ZIP-Datei.` : "Wähle mindestens einen Plan und ein Format.";
  los.disabled = !(plaene.length && dateien) || smLaeuft;
  // Hinweis: Formate, die für einen gewählten Plan nichts liefern
  const ohne = smWahl.formate.filter((f) => plaene.length && !plaene.some((a) => smZiele(a, [f]).length));
  smQ("#sm-format-hinweis").textContent = ohne.length ? `Für die gewählten Pläne gibt es kein ${ohne.map((f) => SM_FORMATE.find((x) => x.id === f).name).join(", ")}.` : "";
}

// Vorschau-Plan: nur Pläne mit Karte und Maßstab (kein Schnitt, 3D, Kennzahlen)
function smRefAktualisieren() {
  const moegl = smWahl.plaene.filter((a) => smBereit(a).ok && EXP_PLAENE[a].art === "plan");
  const sel = smQ("#sm-ref");
  sel.innerHTML = moegl.map((a) => `<option value="${a}">${EXP_PLAENE[a].name}</option>`).join("");
  if (!moegl.length) { smQ("#sm-vorschau").innerHTML = ""; smQ("#sm-info").textContent = "Für die Vorschau einen Plan mit Karte wählen (zum Beispiel Lageplan)."; smRefSzene = null; smRefLay = null; return; }
  if (!moegl.includes(smWahl.referenz)) smWahl.referenz = moegl.includes("lageplan") ? "lageplan" : moegl[0];
  sel.value = smWahl.referenz;
  smVorschau(true);
}

function smEinstellungen() {
  const ort = smQ("#sm-ort").value.trim();
  return {
    format: smQ("#sm-format").value, richtung: smQ("#sm-richtung").value, massstab: Math.max(1, Math.round(Number(smQ("#sm-massstab").value) || 2000)),
    versatzX: smVx, versatzY: smVy, titel: "", untertitel: "", verfasser: smQ("#sm-verfasser").value.trim(), kurs: smQ("#sm-kurs").value.trim(),
    datum: smQ("#sm-datum").value.trim(), legende: smQ("#sm-legende").checked, dpi: Number(smQ("#sm-dpi").value), ort
  };
}

function smUntertitel(ort) {
  const [west, sued, ost, nord] = turf.bbox(gebiet);
  const b = turf.distance([west, sued], [ost, sued]) * 1000, h = turf.distance([west, sued], [west, nord]) * 1000;
  return `${ort ? ort + " · " : ""}Untersuchungsgebiet ${zahl(b)} × ${zahl(h)} m (${zahl(turf.area(gebiet) / 10000, 1)} ha)`;
}

function smTitel(a) {
  if (a === "sonne") return sonneZustand.modus === "dauer" ? `Besonnungsdauer am ${sonneDatumText()}` : `Schattenplan ${sonneDatumText()}, ${uhrzeit(sonneZustand.minuten)} Uhr`;
  return EXP_PLAENE[a].name;
}

// Vorschau des Referenzplans mit den gemeinsamen Einstellungen
function smVorschau(neuBauen) {
  const a = smWahl.referenz;
  if (!smGebaut || !a || !gebiet || !smBereit(a).ok || EXP_PLAENE[a].art !== "plan") return;
  try {
    if (neuBauen || !smRefSzene || smRefAnsicht !== a) { smRefSzene = expSzene(a); smRefAnsicht = a; }
    const opt = { ...smEinstellungen(), titel: smTitel(a) };
    opt.untertitel = smUntertitel(opt.ort);
    const lay = expLayout(opt, smRefSzene);
    smRefLay = lay;
    const b = expSvg(lay.w, lay.h);
    expZeichne(b, opt, smRefSzene, lay);
    smQ("#sm-vorschau").innerHTML = b.ergebnis(true);
    const text = `${opt.format} ${lay.w > lay.h ? "quer" : "hoch"} (${lay.w} × ${lay.h} mm), Gebiet im Maßstab 1:${zahl(opt.massstab)}: ${zahl(lay.gw)} × ${zahl(lay.gh)} mm, Planfeld ${zahl(lay.feld.w)} × ${zahl(lay.feld.h)} mm.`;
    smQ("#sm-info").textContent = lay.passt ? text : `${text} Sichtbar sind ${zahl(lay.sicht * 100)} % des Gebiets.`;
    smQ("#sm-mitte").hidden = lay.passt;
    const svg = smQ("#sm-vorschau").firstElementChild;
    if (svg) svg.classList.toggle("ex-schiebbar", !lay.passt);
  } catch (fehler) {
    console.error(fehler);
    smQ("#sm-info").textContent = "Vorschau nicht möglich: " + fehler.message;
  }
}

function smPassend() {
  if (!smRefSzene) return;
  smQ("#sm-massstab").value = String(expPassenderNenner(smEinstellungen(), smRefSzene));
  smVx = 0; smVy = 0;
  smVorschau(false);
}

// Ausschnitt mit der Maus ziehen (wie im Export-Fenster)
function smZugStart(e) {
  const svg = e.target.closest("svg");
  if (!svg || !smRefLay || smRefLay.passt) return;
  smZug = { svg, x: e.clientX, y: e.clientY, vx0: smVx, vy0: smVy, mm: smRefLay.w / svg.getBoundingClientRect().width, inhalt: svg.querySelector(".ex-inhalt") };
  try { svg.setPointerCapture(e.pointerId); } catch (_) { /* nicht schlimm */ }
  svg.classList.add("ex-zieht");
  e.preventDefault();
}
function smZugBewegt(e) {
  if (!smZug) return;
  const lay = smRefLay;
  const dxMm = (e.clientX - smZug.x) * smZug.mm, dyMm = (e.clientY - smZug.y) * smZug.mm;
  const klemme = (v) => Math.max(-100, Math.min(100, v));
  const vx = lay.ueberB > 0.5 ? klemme(smZug.vx0 - (dxMm * 100) / (lay.ueberB / 2)) : smZug.vx0;
  const vy = lay.ueberH > 0.5 ? klemme(smZug.vy0 - (dyMm * 100) / (lay.ueberH / 2)) : smZug.vy0;
  smZug.vx = vx; smZug.vy = vy;
  const tx = lay.ueberB > 0.5 ? -((vx - smZug.vx0) * (lay.ueberB / 2)) / 100 : 0, ty = lay.ueberH > 0.5 ? -((vy - smZug.vy0) * (lay.ueberH / 2)) / 100 : 0;
  if (smZug.inhalt) smZug.inhalt.setAttribute("transform", `translate(${tx} ${ty})`);
}
function smZugEnde() {
  if (!smZug) return;
  const z = smZug; smZug = null;
  if (z.vx != null) { smVx = Math.round(z.vx * 10) / 10; smVy = Math.round(z.vy * 10) / 10; }
  smVorschau(false);
}

// ---------- Export ----------
const smPause = (ms = 20) => new Promise((r) => setTimeout(r, ms));

async function smSzeneFuer(a, opt) {
  const art = EXP_PLAENE[a].art;
  if (art === "luft") return expSzeneLuft();
  if (art === "schnitt") {
    // Die Zeichnung wird im Reiter „Schnitt & Ansicht“ ausgemessen, deshalb kurz dorthin wechseln und danach zurück
    const zurueck = aktuelleAnsicht;
    zeigeAnsicht("schnitt"); await smPause(600);
    try {
      const s = await expSzeneSchnitt(400);
      const nenner = expPassenderNenner(opt, s);
      return nenner === 400 ? s : await expSzeneSchnitt(nenner);
    } finally { zeigeAnsicht(zurueck); await smPause(100); }
  }
  if (art === "bild3d") return expSzene3d();
  if (art === "plan") return expSzene(a);
  return { ansicht: a, befehle: [], geo: [] };
}

async function smExportiere() {
  if (smLaeuft) return;
  if (!window.JSZip) { smQ("#sm-status").textContent = "ZIP-Bibliothek nicht geladen (Internetverbindung?)."; return; }
  const plaene = SM_REIHENFOLGE.filter((a) => smWahl.plaene.includes(a) && smBereit(a).ok);
  const basis = smEinstellungen();
  if (!plaene.length) return;
  // gemeinsamer Ausschnitt in Metern aus der Vorschau
  let versatzM = [0, 0];
  if (smRefLay && smRefAnsicht) {
    const k = 1000 / basis.massstab;
    versatzM = [(smVx / 100) * (smRefLay.ueberB / 2) / k, -(smVy / 100) * (smRefLay.ueberH / 2) / k];
  }
  try { localStorage.setItem("ortsanalyse-export", JSON.stringify({ verfasser: basis.verfasser, kurs: basis.kurs, format: basis.format, dpi: String(basis.dpi) })); } catch (_) { /* nicht schlimm */ }
  smLaeuft = true; smZusammenfassung();
  const liste = smQ("#sm-fortschritt"), status = smQ("#sm-status");
  liste.innerHTML = plaene.map((a) => `<li data-fort="${a}"><span class="sm-punkt"></span><span>${EXP_PLAENE[a].name}</span><span class="sm-fort-text">wartet</span></li>`).join("");
  const setze = (a, text, art) => { const li = liste.querySelector(`[data-fort="${a}"]`); li.className = art || ""; li.querySelector(".sm-fort-text").textContent = text; };
  status.textContent = "Wird erstellt …";
  await expLogoBereit;
  const zip = new JSZip();
  const dateien = [], probleme = [];
  const ordnerName = (a) => EXP_PLAENE[a].datei;
  for (const a of plaene) {
    const def = EXP_PLAENE[a];
    const ziele = smZiele(a, smWahl.formate);
    if (!ziele.length) { setze(a, "kein gewähltes Format passt", "sm-aus"); continue; }
    try {
      setze(a, "Daten werden vorbereitet …", "sm-laeuft"); await smPause();
      if (a === "kennzahlen" && !kennzahlenLetzte) { const k = berechneKennzahlen(); kennzahlenLetzte = { k, abschnitte: baueAbschnitte(k) }; }
      const opt = { ...basis, titel: smTitel(a), versatzMeter: versatzM };
      opt.untertitel = smUntertitel(basis.ort);
      const szene = await smSzeneFuer(a, opt);
      if (def.art === "schnitt" || def.art === "bild3d") { opt.massstab = expPassenderNenner(opt, szene); opt.versatzMeter = null; opt.versatzX = 0; opt.versatzY = 0; }
      const lay = def.art === "text" ? null : expLayout(opt, szene);
      let n = 0;
      for (const ziel of ziele) {
        setze(a, `${EXP_KNOPF_NAMEN[ziel] || ziel} (${++n} von ${ziele.length}) …`, "sm-laeuft"); await smPause();
        const d = await expErzeuge(ziel, a, szene, opt, lay);
        zip.file(`${ordnerName(a)}/${d.name}`, d.blob);
        dateien.push({ plan: def.name, name: `${ordnerName(a)}/${d.name}`, hinweis: d.hinweis || "" });
        await smPause();
      }
      setze(a, `${ziele.length} Datei${ziele.length === 1 ? "" : "en"} fertig`, "sm-fertig");
    } catch (fehler) {
      console.error(fehler);
      probleme.push(`${def.name}: ${fehler.message}`);
      setze(a, "Fehler: " + fehler.message, "sm-fehler");
    }
  }
  try {
    if (!dateien.length) throw new Error("Es konnte keine Datei erstellt werden.");
    zip.file("Hinweise-und-Quellen.txt", "﻿" + smHinweise(basis, dateien, probleme));
    status.textContent = "ZIP-Datei wird gepackt …"; await smPause(50);
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const stempel = new Date().toISOString().slice(0, 10);
    expHerunterladen(blob, `SiteKick-Export-${stempel}.zip`);
    status.textContent = `${dateien.length} Dateien gespeichert (${(blob.size / 1048576).toFixed(1).replace(".", ",")} MB).` + (probleme.length ? ` ${probleme.length} Plan konnte nicht erstellt werden, siehe oben.` : "");
  } catch (fehler) {
    console.error(fehler);
    status.textContent = "Speichern nicht möglich: " + fehler.message;
  }
  smLaeuft = false; smZusammenfassung();
}

function smHinweise(opt, dateien, probleme) {
  const z = [];
  z.push("SiteKick – Sammel-Export", `Erstellt am ${new Date().toLocaleString("de-DE")}`, "");
  z.push(`Blatt: ${opt.format}, Ausrichtung ${opt.richtung}, Maßstab der Pläne 1:${opt.massstab}`, `PNG-Auflösung: ${opt.dpi} dpi`);
  if (opt.ort) z.push(`Projekt/Ort: ${opt.ort}`);
  if (opt.verfasser) z.push(`Verfasser: ${opt.verfasser}`);
  if (opt.kurs) z.push(`Kurs/Dozent: ${opt.kurs}`);
  z.push("", "Enthaltene Dateien:");
  for (const d of dateien) z.push(`  ${d.name}${d.hinweis ? "  (" + d.hinweis + ")" : ""}`);
  if (probleme.length) { z.push("", "Nicht erstellt:"); probleme.forEach((p) => z.push("  " + p)); }
  z.push("", "Quellen:", "  " + expQuellen(), "",
    "Hinweise:",
    "  - PDF und SVG enthalten Linien und Flächen als Vektoren. Luftbild, Sonnen-Raster, 3D-Ansicht und die Schnittzeichnung im PDF sind Pixelbilder (der Schnitt als SVG und DXF ist Vektor).",
    "  - Der Maßstab stimmt nur, wenn beim Drucken „tatsächliche Größe“ (100 %) gewählt wird.",
    "  - DXF: Version R12, Einheit Meter, Flächen ohne Füllung. Mit ezdxf geprüft, in Allplan und ArchiCAD getestet.",
    "  - Daten nicht vermessungsgenau. Ergebnisse der Wirtschaftlichkeit sind Überschläge und kein Gutachten.");
  return z.join("\r\n");
}

// Wird von app.js aufgerufen, wenn der Reiter geöffnet wird
function aktualisiereSammel() {
  if (!smEl.feld || smLaeuft) return;
  if (!gebiet || !datenVorhanden) {
    smGebaut = false;
    smEl.feld.innerHTML = `<div class="kz-leer"><h3>Noch nichts zum Exportieren</h3><p>Wähle im Reiter „Karte“ ein Gebiet und klicke auf „Analysieren“. Danach kannst du hier mehrere Pläne auf einmal herunterladen.</p></div>`;
    return;
  }
  if (!smEl.feld.querySelector("#sm-los")) smBaue();
  smStatusAktualisieren();
  smRefAktualisieren();
}

// Nach neuen Daten: Vorschau verwerfen
function verwerfeSammel() { smRefSzene = null; smRefAnsicht = null; smRefLay = null; smVx = 0; smVy = 0; }
