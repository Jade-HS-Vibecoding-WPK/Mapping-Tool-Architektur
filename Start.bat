@echo off
rem ---------------------------------------------------------------
rem  SiteKick starten (Windows): Doppelklick auf diese Datei.
rem  Startet einen kleinen lokalen Webserver und oeffnet das Tool
rem  im Browser. Zum Beenden dieses Fenster schliessen.
rem  Voraussetzung: Python ist installiert (python.org).
rem ---------------------------------------------------------------
cd /d "%~dp0"

set PYTHON=
where python >nul 2>nul && set PYTHON=python
if "%PYTHON%"=="" (
  where py >nul 2>nul && set PYTHON=py
)
if "%PYTHON%"=="" (
  echo Python wurde nicht gefunden. Bitte Python von python.org installieren
  echo und dann Start.bat noch einmal doppelklicken.
  pause
  exit /b 1
)

echo SiteKick laeuft auf http://localhost:8765/index.html
echo Dieses Fenster offen lassen. Zum Beenden einfach schliessen.
echo.

rem Browser nach 2 Sekunden oeffnen, damit der Server schon bereit ist
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8765/index.html"

%PYTHON% server.py 8765
