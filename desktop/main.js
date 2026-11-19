// SiteKick als Windows-Programm: ein Fenster (Electron) zeigt die Website.
// Die Website läuft über einen kleinen Server nur auf diesem Rechner (127.0.0.1), damit sich alles wie im Browser verhält
// (Hintergrundprogramme, Speicher im Browser, Downloads). Karten und amtliche Daten kommen weiter aus dem Internet.
const { app, BrowserWindow, Menu, shell, session } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const WEB = path.join(__dirname, "app-site");
const FESTER_PORT = 47831;   // fester Port: damit bleibt die Adresse gleich und der gemerkte Projektstand (localStorage) erhalten
const TYPEN = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8"
};

function starteServer() {
  const server = http.createServer((req, res) => {
    let pfad = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (pfad === "/") pfad = "/index.html";
    const datei = path.normalize(path.join(WEB, pfad));
    if (!datei.startsWith(WEB)) { res.writeHead(403); res.end(); return; }   // nichts außerhalb des Website-Ordners ausliefern
    fs.readFile(datei, (fehler, daten) => {
      if (fehler) { res.writeHead(404); res.end("Nicht gefunden"); return; }
      res.writeHead(200, { "Content-Type": TYPEN[path.extname(datei).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(daten);
    });
  });
  return new Promise((ok, fehler) => {
    const los = (port) => {
      server.once("error", (e) => { if (port === FESTER_PORT) los(0); else fehler(e); });   // Port belegt: freien nehmen
      server.listen(port, "127.0.0.1", () => ok(server.address().port));
    };
    los(FESTER_PORT);
  });
}

// Exporte (PDF, PNG, DXF, ZIP ...) sind Downloads: Windows fragt wie gewohnt, wo die Datei gespeichert werden soll.
function richteDownloadsEin() {
  session.defaultSession.on("will-download", (e, item) => {
    console.log("Download:", item.getFilename());
    if (process.env.SITEKICK_TEST_ORDNER) item.setSavePath(path.join(process.env.SITEKICK_TEST_ORDNER, item.getFilename()));   // nur für automatische Tests
    item.once("done", (ev, status) => console.log("Download fertig:", item.getFilename(), status));
  });
}

let fenster = null;
async function oeffneFenster() {
  richteDownloadsEin();
  const port = await starteServer();
  fenster = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    title: "SiteKick", backgroundColor: "#ffffff", autoHideMenuBar: true,
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  // Links nach außen (Quellen, Lizenzen) im normalen Browser öffnen, nie im Programmfenster
  fenster.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  fenster.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });
  fenster.loadURL(`http://127.0.0.1:${port}/index.html`);
  fenster.on("closed", () => { fenster = null; });
}

Menu.setApplicationMenu(Menu.buildFromTemplate([
  { label: "Ansicht", submenu: [
    { role: "reload", label: "Neu laden" }, { role: "forceReload", label: "Neu laden (ohne Zwischenspeicher)" }, { type: "separator" },
    { role: "resetZoom", label: "Zoom zurücksetzen" }, { role: "zoomIn", label: "Vergrößern" }, { role: "zoomOut", label: "Verkleinern" }, { type: "separator" },
    { role: "togglefullscreen", label: "Vollbild" }, { role: "toggleDevTools", label: "Entwicklertools" }
  ] }
]));

if (!app.requestSingleInstanceLock()) { app.quit(); }   // SiteKick nur einmal gleichzeitig
else {
  app.on("second-instance", () => { if (fenster) { if (fenster.isMinimized()) fenster.restore(); fenster.focus(); } });
  app.whenReady().then(oeffneFenster);
  app.on("window-all-closed", () => app.quit());
}
