/* ============================================================
   Ortsanalyse – PNG-Export
   - 2D-Pläne maßstäblich (1:500 … 1:5000) auf einem Blatt A4–A0 mit Schriftfeld
     (Titel, Legende, Maßstab, Nordpfeil, Maßstabsleiste, Quellen)
   - Schnitt maßstäblich auf einem Blatt
   - 3D-Ansicht und Diagramme als hochaufgelöstes Bild
   Der Plan wird in einer unsichtbaren zweiten Karte Stück für Stück in Druckauflösung gezeichnet
   und zu einem großen Bild zusammengesetzt.
   ============================================================ */

const PAPIER = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189] }; // mm (kurz, lang)
const DPI_JE_FORMAT = { A4: 300, A3: 300, A2: 300, A1: 200, A0: 150 }; // große Blätter mit weniger dpi (Speicher im Browser)
const MASSSTAEBE = { plan: [500, 1000, 2000, 5000], schnitt: [200, 500, 1000, 2000] };
const exportEinstellung = { plan: { massstab: 1000, format: "A3", quer: true }, schnitt: { massstab: 500, format: "A3", quer: true } };

const mmZuPx = (mm, dpi) => (mm / 25.4) * dpi;

function herunterladen(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const canvasAlsPng = (canvas) => new Promise((ok) => canvas.toBlob(ok, "image/png"));
const dateiDatum = () => new Date().toISOString().slice(0, 10);

// SVG-Text → Bild → Canvas (Faktor = Vergrößerung)
async function svgAufCanvas(svg, breite, hoehe, faktor) {
  const bild = new Image();
  bild.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await bild.decode();
  const c = document.createElement("canvas");
  c.width = Math.round(breite * faktor); c.height = Math.round(hoehe * faktor);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bild, 0, 0, c.width, c.height);
  return c;
}

// ---------- Diagramme ----------
async function diagrammAlsPng(d) {
  const svg = diagrammSvg(d, true);
  const H = +svg.match(/height="([\d.]+)"/)[1];
  const c = await svgAufCanvas(svg, d.breite, H, 4); // ca. 380 dpi bei 9 cm Breite
  herunterladen(await canvasAlsPng(c), `ortsanalyse_diagramm_${d.id}_${dateiDatum()}.png`);
}

// ---------- 3D-Ansicht ----------
async function dreidAlsPng() {
  if (!dreid) return;
  const { renderer, scene, camera } = dreid;
  const vorher = renderer.getPixelRatio();
  const b = renderer.domElement.clientWidth || 1000;
  renderer.setPixelRatio(Math.min(4, 8000 / b)); // ca. 4-fache Bildschirmauflösung
  renderer.render(scene, camera);
  const bild = renderer.domElement;
  // Quellen unten anfügen (vollständig, umgebrochen: Pflicht laut Lizenz)
  const rand = Math.round(bild.width * 0.025), schrift = Math.round(rand * 0.45);
  const messen = document.createElement("canvas").getContext("2d");
  messen.font = `${schrift}px Helvetica, Arial, sans-serif`;
  const zeilen = umbrechen(messen, (document.getElementById("plan").dataset.quelle || "© OpenStreetMap-Mitwirkende (ODbL)")
    + " · 3D-Ansicht, nicht maßstäblich · Erstellt mit Ortsanalyse", bild.width - rand * 2);
  const c = document.createElement("canvas");
  c.width = bild.width; c.height = bild.height + rand + zeilen.length * schrift * 1.4;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bild, 0, 0);
  ctx.fillStyle = "#555";
  ctx.font = messen.font;
  zeilen.forEach((z, i) => ctx.fillText(z, rand, bild.height + rand * 0.6 + (i + 0.8) * schrift * 1.4));
  renderer.setPixelRatio(vorher);
  renderer.render(scene, camera);
  herunterladen(await canvasAlsPng(c), `ortsanalyse_3d_${dateiDatum()}.png`);
}

function textKuerzen(ctx, text, breite) {
  if (ctx.measureText(text).width <= breite) return text;
  while (text.length > 3 && ctx.measureText(`${text}…`).width > breite) text = text.slice(0, -1);
  return `${text}…`;
}

// Text in Zeilen umbrechen
function umbrechen(ctx, text, breite) {
  const zeilen = [];
  let zeile = "";
  for (const wort of String(text).split(/\s+/)) {
    const test = zeile ? `${zeile} ${wort}` : wort;
    if (ctx.measureText(test).width > breite && zeile) { zeilen.push(zeile); zeile = wort; } else zeile = test;
  }
  if (zeile) zeilen.push(zeile);
  return zeilen;
}

// ---------- Blatt: Maße und Schriftfeld ----------
function blattMasse(einst) {
  const [kurz, lang] = PAPIER[einst.format];
  const W = einst.quer ? lang : kurz, H = einst.quer ? kurz : lang;
  const f = Math.sqrt(kurz / 210); // Schrift und Ränder wachsen mit dem Format (A4 = 1, A0 = 2)
  const rand = 10 * f, schriftfeld = 34 * f;
  return { W, H, f, rand, schriftfeld, dpi: DPI_JE_FORMAT[einst.format],
    rahmen: { x: rand, y: rand, w: W - 2 * rand, h: H - 2 * rand - schriftfeld - 3 * f } }; // Zeichenfeld in mm
}

// Legendeneinträge eines Plans für das Schriftfeld: [{ art, farbe, text, bild? }]
function exportLegende(plan) {
  if (plan === "infra" && infraDaten) {
    const e = Object.entries(INFRA_EBENEN).filter(([key]) => infraSichtbar[key]).map(([key, d]) => ({ art: "kreis-voll", farbe: d.farbe,
      text: `${d.name} (${fmt(INFRA_ARTEN.filter(([art, eb]) => eb === key).reduce((s, [art]) => s + (infraDaten.anzahl[art] || 0), 0))})` }));
    for (const [key, r] of Object.entries(INFRA_RADIEN)) if (radienSichtbar[key]) e.push({ art: "flaeche", farbe: `${r.farbe}33`, text: `${r.radius} m um ${r.name}` });
    return e;
  }
  if (plan === "schnitt") return [{ art: "strich", farbe: PLAN_FARBEN.akzent, text: "Schnittlinie A–A′" }, { art: "flaeche", farbe: "#f6d2ca", text: "Blickbereich" }];
  return (planLegenden[plan] || []).filter((e) => e[0] !== "text").map(([art, wert, text]) => ({
    art, text, farbe: typeof wert === "string" ? (wert.match(/#[0-9a-f]{3,6}/i) || [wert])[0] : "#111", staerke: typeof wert === "number" ? wert : 1 }));
}

// Schriftfeld unten: Titel | Legende | Maßstab, Nordpfeil, Maßstabsleiste; darunter die Quellen
function zeichneSchriftfeld(ctx, b, { titel, untertitel, massstab, legende, quelle, mitNord }) {
  const px = (mm) => mmZuPx(mm, b.dpi);
  const y0 = b.H - b.rand - b.schriftfeld, x0 = b.rand, breite = b.W - 2 * b.rand, f = b.f;
  ctx.strokeStyle = "#111"; ctx.lineWidth = px(0.35 * f);
  ctx.strokeRect(px(x0), px(b.rahmen.y), px(breite), px(b.H - b.rand - b.rahmen.y)); // Blattrahmen
  ctx.beginPath(); ctx.moveTo(px(x0), px(y0)); ctx.lineTo(px(x0 + breite), px(y0)); ctx.stroke();
  const quellenH = 7 * f;
  const feldH = b.schriftfeld - quellenH;
  const sp1 = breite * 0.3, sp3 = breite * 0.24, sp2 = breite - sp1 - sp3;
  ctx.lineWidth = px(0.18 * f);
  for (const x of [x0 + sp1, x0 + sp1 + sp2]) { ctx.beginPath(); ctx.moveTo(px(x), px(y0)); ctx.lineTo(px(x), px(y0 + feldH)); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(px(x0), px(y0 + feldH)); ctx.lineTo(px(x0 + breite), px(y0 + feldH)); ctx.stroke();
  const pad = 3 * f;
  const schrift = (mm, fett) => { ctx.font = `${fett ? "600 " : ""}${px(mm)}px Helvetica Neue, Helvetica, Arial, sans-serif`; };

  // Titel
  ctx.fillStyle = PLAN_FARBEN.akzent; schrift(2.2 * f, true);
  ctx.fillText("ORTSANALYSE", px(x0 + pad), px(y0 + pad + 2.2 * f));
  ctx.fillStyle = "#111"; schrift(5 * f, true);
  ctx.fillText(textKuerzen(ctx, titel, px(sp1 - 2 * pad)), px(x0 + pad), px(y0 + pad + 8.5 * f));
  schrift(2.3 * f);
  ctx.fillStyle = "#333";
  umbrechen(ctx, untertitel, px(sp1 - 2 * pad)).slice(0, 4).forEach((z, i) => ctx.fillText(z, px(x0 + pad), px(y0 + pad + 13 * f + i * 3.2 * f)));

  // Legende in Spalten
  const lx = x0 + sp1 + pad, ly = y0 + pad, zeileH = 3.6 * f, spalten = Math.max(1, Math.ceil(legende.length / Math.floor((feldH - 2 * pad) / zeileH)));
  const spB = (sp2 - 2 * pad) / spalten, proSpalte = Math.ceil(legende.length / spalten);
  schrift(2.2 * f);
  legende.forEach((e, i) => {
    const x = lx + Math.floor(i / proSpalte) * spB, y = ly + (i % proSpalte) * zeileH;
    const zw = 6 * f, zh = 2.6 * f;
    ctx.fillStyle = e.farbe; ctx.strokeStyle = e.farbe;
    if (e.art === "flaeche") { ctx.fillRect(px(x), px(y), px(zw), px(zh)); ctx.strokeStyle = "#999"; ctx.lineWidth = px(0.1 * f); ctx.strokeRect(px(x), px(y), px(zw), px(zh)); }
    else if (e.art === "linie" || e.art === "strich") {
      ctx.strokeStyle = e.art === "linie" ? "#111" : e.farbe; ctx.lineWidth = px((e.art === "linie" ? 0.15 * (e.staerke || 1) + 0.1 : 0.4) * f);
      ctx.setLineDash(e.art === "strich" ? [px(1.2 * f), px(0.6 * f)] : []);
      ctx.beginPath(); ctx.moveTo(px(x), px(y + zh / 2)); ctx.lineTo(px(x + zw), px(y + zh / 2)); ctx.stroke(); ctx.setLineDash([]);
    } else {
      ctx.beginPath(); ctx.arc(px(x + zw / 2), px(y + zh / 2), px(zh / 2), 0, Math.PI * 2);
      if (e.art === "kreis-voll") ctx.fill(); else { ctx.globalAlpha = 0.3; ctx.fill(); ctx.globalAlpha = 1; ctx.lineWidth = px(0.15 * f); ctx.stroke(); }
    }
    ctx.fillStyle = "#111";
    ctx.fillText(textKuerzen(ctx, e.text, px(spB - zw - 3 * f)), px(x + zw + 1.5 * f), px(y + zh - 0.2 * f));
  });

  // Maßstab, Nordpfeil, Maßstabsleiste
  const mx = x0 + sp1 + sp2 + pad;
  ctx.fillStyle = "#111"; schrift(4.2 * f, true);
  ctx.fillText(`M 1:${fmt(massstab)}`, px(mx), px(y0 + pad + 4.2 * f));
  schrift(2.1 * f); ctx.fillStyle = "#555";
  ctx.fillText(`${b.format} ${b.quer ? "quer" : "hoch"} · ${b.dpi} dpi`, px(mx), px(y0 + pad + 8 * f));
  if (mitNord) {
    const nx = x0 + breite - pad - 4 * f, ny = y0 + pad + 1 * f, nh = 11 * f;
    ctx.fillStyle = "#111"; schrift(2.6 * f, true); ctx.textAlign = "center";
    ctx.fillText("N", px(nx), px(ny + 2.4 * f)); ctx.textAlign = "left";
    ctx.beginPath(); ctx.moveTo(px(nx), px(ny + 3.4 * f)); ctx.lineTo(px(nx + 2.8 * f), px(ny + nh)); ctx.lineTo(px(nx), px(ny + nh - 2.2 * f)); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(px(nx), px(ny + 3.4 * f)); ctx.lineTo(px(nx - 2.8 * f), px(ny + nh)); ctx.lineTo(px(nx), px(ny + nh - 2.2 * f)); ctx.closePath();
    ctx.lineWidth = px(0.15 * f); ctx.strokeStyle = "#111"; ctx.stroke();
  }
  // Maßstabsleiste: echte Länge auf dem Papier
  const leisteMax = sp3 - 2 * pad - 4 * f;
  const meter = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].filter((m) => (m * 1000) / massstab <= leisteMax).pop() || 5;
  const lmm = (meter * 1000) / massstab, ly2 = y0 + feldH - pad - 4 * f;
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? "#fff" : "#111";
    ctx.fillRect(px(mx + (i * lmm) / 4), px(ly2), px(lmm / 4), px(1.4 * f));
  }
  ctx.strokeStyle = "#111"; ctx.lineWidth = px(0.15 * f); ctx.strokeRect(px(mx), px(ly2), px(lmm), px(1.4 * f));
  ctx.fillStyle = "#111"; schrift(2 * f);
  ctx.fillText("0", px(mx - 0.5 * f), px(ly2 + 4.2 * f));
  ctx.textAlign = "right"; ctx.fillText(`${fmt(meter)} m`, px(mx + lmm + 2 * f), px(ly2 + 4.2 * f)); ctx.textAlign = "left";

  // Quellen (Pflicht laut Lizenz)
  // Schrift so klein wählen, dass alle Quellen in drei Zeilen passen (nichts darf abgeschnitten werden)
  ctx.fillStyle = "#444";
  const qText = `${quelle} · Erstellt mit Ortsanalyse am ${new Date().toLocaleDateString("de-DE")} · nicht vermessungsgenau`;
  let groesse = 1.7, zeilen;
  do { schrift(groesse * f); zeilen = umbrechen(ctx, qText, px(breite - 2 * pad)); groesse -= 0.1; } while (zeilen.length > 3 && groesse > 0.9);
  const abstand = Math.min(2.1, (quellenH - 1) / zeilen.length) * f;
  zeilen.forEach((z, i) => ctx.fillText(z, px(x0 + pad), px(y0 + feldH + 2.4 * f + i * abstand)));
}

// ---------- Plan maßstäblich ----------
// Web-Mercator: Weltpixel bei Zoomstufe z (MapLibre: Kachelgröße 512)
const weltPx = (lon, lat, z) => {
  const W = 512 * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * W, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * W];
};
const ausWeltPx = (x, y, z) => {
  const W = 512 * 2 ** z;
  return [(x / W) * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / W))) * 180) / Math.PI];
};

// Prüft, wie groß das Gebiet beim gewählten Maßstab auf dem Blatt wird
function passtAufsBlatt(art, einst) {
  const b = blattMasse(einst);
  let breiteMm, hoeheMm;
  if (art === "schnitt") {
    const erg = berechneSchnitt();
    if (!erg) return { b, passt: false, text: "Noch keine Schnittlinie." };
    const k = mmZuPx(1000 / einst.massstab, 96);
    const s = schnittSvg(erg, { k });
    breiteMm = (s.W / 96) * 25.4; hoeheMm = (s.H / 96) * 25.4;
  } else {
    const [w, s, o, n] = analyseErgebnis.bbox;
    const [e1, n1] = gradZuUtm(w, s), [e2, n2] = gradZuUtm(o, n);
    breiteMm = ((e2 - e1) * 1000) / einst.massstab; hoeheMm = ((n2 - n1) * 1000) / einst.massstab;
  }
  const passt = breiteMm <= b.rahmen.w + 0.5 && hoeheMm <= b.rahmen.h + 0.5;
  return { b, passt, breiteMm, hoeheMm };
}

// Unsichtbare Karte mit dem aktuellen Plan-Stil in Druckauflösung; zeichnet den Rahmen Stück für Stück
async function planAufCanvas(ctx, b, einst, meldung) {
  const pr = b.dpi / 96;                          // Druckpixel je Bildschirmpixel
  const [w, s, o, n] = analyseErgebnis.bbox;
  const mitte = [(w + o) / 2, (s + n) / 2];
  const meterJePx = (einst.massstab * 0.0254) / 96; // Meter in der Natur je Bildschirmpixel auf dem Papier
  const z = Math.log2((40075016.686 * Math.cos((mitte[1] * Math.PI) / 180)) / (512 * meterJePx));
  const rahmenB = mmZuPx(b.rahmen.w, 96), rahmenH = mmZuPx(b.rahmen.h, 96); // in Bildschirmpixeln
  const [cx, cy] = weltPx(mitte[0], mitte[1], z);
  const x0 = cx - rahmenB / 2, y0 = cy - rahmenH / 2;
  // Kachel in Bildschirmpixeln: 1008 und der Überstand 48 ergeben bei 300/200/150 dpi ganze Druckpixel.
  // Jede Kachel wird mit Überstand gezeichnet und der Rand abgeschnitten (sonst feine Nahtlinien).
  const T = 1008, U = 48;

  const box = document.createElement("div");
  box.style.cssText = `position:fixed;left:-20000px;top:0;width:${T + 2 * U}px;height:${T + 2 * U}px;`;
  document.body.appendChild(box);
  const karte = new maplibregl.Map({ container: box, style: planKarte.getStyle(), center: mitte, zoom: z, pixelRatio: pr,
    interactive: false, attributionControl: false, fadeDuration: 0, preserveDrawingBuffer: true, maxZoom: 24, maxCanvasSize: [8192, 8192] });
  try {
    await new Promise((ok) => karte.once("load", ok));
    await infraBilderLaden(karte);
    const px = (mm) => mmZuPx(mm, b.dpi);
    ctx.save();
    ctx.beginPath(); ctx.rect(px(b.rahmen.x), px(b.rahmen.y), px(b.rahmen.w), px(b.rahmen.h)); ctx.clip();
    const nx = Math.ceil(rahmenB / T), ny = Math.ceil(rahmenH / T);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        meldung(`Zeichne Teil ${j * nx + i + 1} von ${nx * ny} …`);
        karte.jumpTo({ center: ausWeltPx(x0 + i * T + T / 2, y0 + j * T + T / 2, z), zoom: z });
        await new Promise((ok) => { karte.once("idle", ok); karte.triggerRepaint(); });
        const t = Math.round(T * pr), u = Math.round(U * pr);
        ctx.drawImage(karte.getCanvas(), u, u, t, t, Math.round(px(b.rahmen.x)) + i * t, Math.round(px(b.rahmen.y)) + j * t, t, t);
      }
    }
    ctx.restore();
  } finally {
    karte.remove();
    box.remove();
  }
}

// ---------- Export-Dialog ----------
let exportArt = "plan";

function oeffneExport(art) {
  if (!analyseErgebnis) return;
  exportArt = art;
  const dialog = document.getElementById("export-dialog");
  const einst = exportEinstellung[art];
  const titel = art === "schnitt" ? "Schnitt" : PLAN_TITEL[aktuellerPlan];
  dialog.innerHTML = `<form method="dialog" class="export-form">
      <h3>PNG exportieren: ${titel}</h3>
      <label>Maßstab <select id="ex-massstab">${MASSSTAEBE[art].map((m) => `<option value="${m}" ${m === einst.massstab ? "selected" : ""}>1:${fmt(m)}</option>`).join("")}</select></label>
      <label>Format <select id="ex-format">${Object.keys(PAPIER).map((p) => `<option ${p === einst.format ? "selected" : ""}>${p}</option>`).join("")}</select></label>
      <label>Ausrichtung <select id="ex-quer"><option value="1" ${einst.quer ? "selected" : ""}>quer</option><option value="0" ${einst.quer ? "" : "selected"}>hoch</option></select></label>
      <p class="export-info" id="ex-info"></p>
      <p class="export-status" id="ex-status"></p>
      <div class="row"><button class="btn btn-primary" id="ex-los" value="los">PNG erstellen</button><button class="btn btn-ghost" value="abbruch">Abbrechen</button></div>
    </form>`;
  const lesen = () => {
    einst.massstab = +dialog.querySelector("#ex-massstab").value;
    einst.format = dialog.querySelector("#ex-format").value;
    einst.quer = dialog.querySelector("#ex-quer").value === "1";
    const p = passtAufsBlatt(art, einst);
    dialog.querySelector("#ex-info").innerHTML = p.text ? p.text
      : `Blatt ${p.b.W} × ${p.b.H} mm, ${p.b.dpi} dpi (${fmt(mmZuPx(p.b.W, p.b.dpi))} × ${fmt(mmZuPx(p.b.H, p.b.dpi))} Pixel).<br>`
        + (art === "schnitt" ? "Schnitt" : "Gebiet") + ` auf dem Papier: ${fmt(p.breiteMm)} × ${fmt(p.hoeheMm)} mm, Zeichenfeld ${fmt(p.b.rahmen.w)} × ${fmt(p.b.rahmen.h)} mm.<br>`
        + (p.passt ? "<strong>Passt aufs Blatt.</strong>" : `<strong class="export-warnung">Passt nicht ganz:</strong> ${art === "schnitt"
          ? "Der Schnitt wird am Rand abgeschnitten. Wähle einen kleineren Maßstab oder ein größeres Format."
          : "Gezeigt wird der Ausschnitt um die Gebietsmitte. Für das ganze Gebiet einen kleineren Maßstab (z. B. 1:2000) oder ein größeres Format wählen."}`);
    return p;
  };
  dialog.querySelectorAll("select").forEach((s) => s.addEventListener("change", lesen));
  lesen();
  dialog.querySelector("#ex-los").addEventListener("click", async (e) => {
    e.preventDefault();
    const knopf = e.currentTarget;
    knopf.disabled = true;
    const status = dialog.querySelector("#ex-status");
    try {
      await erstelleBlatt(art, einst, (t) => { status.textContent = t; });
      dialog.close();
    } catch (fehler) {
      console.error(fehler);
      status.textContent = `Export fehlgeschlagen: ${fehler.message}`;
    } finally { knopf.disabled = false; }
  });
  dialog.showModal();
}

async function erstelleBlatt(art, einst, meldung) {
  const b = { ...blattMasse(einst), format: einst.format, quer: einst.quer };
  const px = (mm) => mmZuPx(mm, b.dpi);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(px(b.W)); canvas.height = Math.round(px(b.H));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Bild zu groß für den Browser");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const quelle = document.getElementById("plan").dataset.quelle || "© OpenStreetMap-Mitwirkende (ODbL)";

  if (art === "schnitt") {
    meldung("Zeichne den Schnitt …");
    const erg = berechneSchnitt();
    const k = mmZuPx(1000 / einst.massstab, 96);
    const s = schnittSvg(erg, { k });
    const bild = await svgAufCanvas(s.svg, s.W, s.H, b.dpi / 96);
    // mittig ins Zeichenfeld
    const dx = px(b.rahmen.x) + Math.max(0, (px(b.rahmen.w) - bild.width) / 2);
    const dy = px(b.rahmen.y) + Math.max(0, (px(b.rahmen.h) - bild.height) / 2);
    ctx.save(); ctx.beginPath(); ctx.rect(px(b.rahmen.x), px(b.rahmen.y), px(b.rahmen.w), px(b.rahmen.h)); ctx.clip();
    ctx.drawImage(bild, dx, dy); ctx.restore();
    // Lageplan klein in die Ecke
    const lage = document.querySelector("#schnitt-lage svg");
    if (lage) {
      const lb = +lage.getAttribute("width"), lh = +lage.getAttribute("height");
      const lc = await svgAufCanvas(lage.outerHTML, lb, lh, b.dpi / 96);
      const zielB = px(45 * b.f), zielH = (zielB / lc.width) * lc.height;
      ctx.drawImage(lc, px(b.rahmen.x + b.rahmen.w) - zielB - px(2), px(b.rahmen.y) + px(2), zielB, zielH);
    }
    zeichneSchriftfeld(ctx, b, { titel: "Schnitt A–A′", untertitel: schnittTitel(erg).replace("Schnitt A–A′ · ", "") + ". Schwarz: geschnitten, grau: Ansicht.",
      massstab: einst.massstab, legende: [{ art: "flaeche", farbe: "#111", text: "Schnitt: Gelände und Gebäude" },
        { art: "flaeche", farbe: "#c3c3c1", text: "Ansicht, je weiter weg desto heller" }, { art: "kreis", farbe: "#4a5a44", text: "Bäume (Höhe geschätzt)" }],
      quelle, mitNord: false });
  } else {
    await planAufCanvas(ctx, b, einst, meldung);
    zeichneSchriftfeld(ctx, b, { titel: PLAN_TITEL[aktuellerPlan],
      untertitel: aktuellerPlan === "wohnen" ? `${ZENSUS_MERKMALE[zensusMerkmal].name}${zensusMerkmal === "vergleich" ? ` (${VERGLEICH_FELDER[vergleichFeld()].text})` : ""}, Zensus 2022` : "Untersuchungsgebiet (rot gestrichelt)",
      massstab: einst.massstab, legende: exportLegende(aktuellerPlan), quelle, mitNord: true });
  }
  meldung("Speichere das Bild …");
  const blob = await canvasAlsPng(canvas);
  if (!blob) throw new Error("Bild zu groß für den Browser");
  const name = art === "schnitt" ? "schnitt" : aktuellerPlan;
  herunterladen(blob, `ortsanalyse_${name}_1-${einst.massstab}_${einst.format}_${dateiDatum()}.png`);
}

// Knöpfe anmelden
document.getElementById("plan-export").addEventListener("click", () => oeffneExport("plan"));
document.getElementById("schnitt-export").addEventListener("click", () => oeffneExport("schnitt"));
document.getElementById("dreid-export").addEventListener("click", dreidAlsPng);
