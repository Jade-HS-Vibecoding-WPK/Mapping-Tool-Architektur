// Kopiert die Website (Ordner darüber) nach desktop/app-site, damit sie in das Programm eingebaut wird.
// Nicht kopiert werden: Entwicklungs-, Doku- und Hilfsdateien.
const fs = require("fs");
const path = require("path");

const quelle = path.join(__dirname, "..");
const ziel = path.join(__dirname, "app-site");
const MIT = ["index.html", "manifest.webmanifest", "fonts", "logo"];
const ENDUNGEN = [".js", ".css"];
const OHNE_LOGO = ["spass-ORIGINAL"];   // (Platzhalter, falls einmal Rohdateien dazukommen)

fs.rmSync(ziel, { recursive: true, force: true });
fs.mkdirSync(ziel, { recursive: true });

for (const name of fs.readdirSync(quelle)) {
  const von = path.join(quelle, name);
  if (fs.statSync(von).isFile() && ENDUNGEN.includes(path.extname(name)) || MIT.includes(name)) {
    fs.cpSync(von, path.join(ziel, name), { recursive: true, filter: (p) => !OHNE_LOGO.some((x) => p.includes(x)) });
  }
}
const n = fs.readdirSync(ziel).length;
console.log(`Website nach ${ziel} kopiert (${n} Einträge).`);
