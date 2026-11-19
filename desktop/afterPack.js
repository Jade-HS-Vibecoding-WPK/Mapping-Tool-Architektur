// Läuft nach dem Zusammenbauen: setzt das SiteKick-Symbol und die Programmangaben in die SiteKick.exe.
// (electron-builder würde das selbst tun, braucht dafür aber Rechte für Verknüpfungen, die normale Windows-Konten oft nicht haben.)
const path = require("path");
const fs = require("fs");

module.exports = async function (context) {
  const { rcedit } = await import("rcedit");
  const pngToIco = (await import("png-to-ico")).default;
  const ico = path.join(context.packager.projectDir, "build", "icon.ico");
  fs.writeFileSync(ico, await pngToIco(path.join(context.packager.projectDir, "build", "icon.png")));
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  await rcedit(exe, {
    icon: ico,
    "version-string": { ProductName: "SiteKick", FileDescription: "SiteKick", CompanyName: "Jade Hochschule", LegalCopyright: "SiteKick, Jade Hochschule", OriginalFilename: "SiteKick.exe" }
  });
  console.log("  • Symbol und Programmangaben in", path.basename(exe), "gesetzt");
};
