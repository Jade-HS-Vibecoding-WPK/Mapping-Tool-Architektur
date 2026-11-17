"""Kleiner Webserver für die Ortsanalyse (nur zum Entwickeln und Ausprobieren auf dem eigenen Rechner).

Aufruf:  python server.py [Port]      (Standard: 8765)

Warum nicht einfach "python -m http.server"? Der Standardserver erlaubt dem Browser, alte Dateien zwischenzuspeichern.
Dann sieht man nach einer Änderung manchmal noch die alte Seite oder eine Mischung aus alten und neuen Dateien.
Dieser Server sagt dem Browser, dass er nichts zwischenspeichern soll.
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class OhneZwischenspeicher(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = ThreadingHTTPServer(("127.0.0.1", port), OhneZwischenspeicher)
    print(f"Ortsanalyse laeuft auf http://localhost:{port}/index.html  (Beenden mit Strg+C)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
