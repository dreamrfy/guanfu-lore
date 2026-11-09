@echo off
set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
set PROFILE=E:\dev\tools\flowus-cap\profile
start "" %CHROME% --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir=%PROFILE% --no-first-run --no-default-browser-check --window-size=1600,1000 about:blank
