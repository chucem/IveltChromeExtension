@echo off
for /f %%i in ('powershell -Command "((Get-Content -Raw -Path extension/manifest.json | ConvertFrom-Json).version)"') do set "version=%%i"
echo %version%

7z a -tzip  "dist/ivelt-helper-%version%.zip" "./extension/*"