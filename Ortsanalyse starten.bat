@echo off
rem ============================================================
rem  Ortsanalyse starten (Doppelklick)
rem  Startet einen kleinen Webserver nur auf diesem Rechner (Python)
rem  und oeffnet die Seite im Standard-Browser.
rem  Zum Beenden einfach dieses schwarze Fenster schliessen.
rem ============================================================
chcp 65001 >nul
title Ortsanalyse
cd /d "%~dp0"
set PORT=8642
set ADRESSE=http://localhost:%PORT%/

rem Laeuft die Ortsanalyse schon (z. B. doppelt gestartet)? Dann nur den Browser oeffnen.
rem (sprachunabhaengig: ein wartender Server hat als Gegenstelle 0.0.0.0:0)
netstat -ano | findstr /r /c:"127\.0\.0\.1:%PORT%  *0\.0\.0\.0:0 " >nul
if %errorlevel%==0 (
  echo Die Ortsanalyse laeuft bereits. Der Browser wird geoeffnet.
  if /i not "%~1"=="/ohne-browser" start "" "%ADRESSE%"
  ping -n 4 127.0.0.1 >nul
  exit /b
)

rem Python suchen (python oder der Windows-Starter py)
set PY=
where python >nul 2>nul && set PY=python
if not defined PY where py >nul 2>nul && set PY=py
if not defined PY goto keinpython

echo.
echo   ORTSANALYSE
echo   Die Seite oeffnet sich gleich im Browser: %ADRESSE%
echo.
echo   Dieses Fenster bitte offen lassen, solange du arbeitest.
echo   Zum Beenden das Fenster schliessen.
echo.

rem Browser kurz verzoegert oeffnen, damit der Server schon bereit ist
if /i not "%~1"=="/ohne-browser" start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 1; Start-Process '%ADRESSE%'"

%PY% -m http.server %PORT% --bind 127.0.0.1
echo.
echo Der Server wurde beendet.
pause
exit /b

:keinpython
echo.
echo   Python wurde nicht gefunden.
echo   Bitte Python installieren (https://www.python.org/downloads/, beim Installieren
echo   "Add python.exe to PATH" anhaken) und diese Datei danach erneut doppelklicken.
echo.
pause
