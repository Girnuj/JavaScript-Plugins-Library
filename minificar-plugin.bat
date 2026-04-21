@echo off
REM Minifica el archivo principal de un plugin JS en la carpeta indicada

setlocal enabledelayedexpansion

REM Solicitar nombre del plugin
set /p PLUGIN=Introduce el nombre del plugin (ej: FormDraft): 

REM Normaliza nombre de archivo js (primera letra minuscula, resto igual)
set "PLUGINFILE=!PLUGIN:~0,1!!PLUGIN:~1!"
set "PLUGINFILELOWER=!PLUGIN:~0,1!"
for %%A in (!PLUGINFILELOWER!) do set "PLUGINFILELOWER=%%A"
set "JSFILE=!PLUGINFILELOWER!!PLUGIN:~1!"

REM Construir rutas
set "FOLDER=%CD%\!PLUGIN!"
set "SRC=!FOLDER!\!JSFILE!.js"
set "DST=!FOLDER!\!JSFILE!.min.js"

if not exist "!SRC!" (
  echo No se encontró el archivo !SRC!
  pause
  exit /b 1
)

cd /d "!FOLDER!"
echo Minificando !JSFILE!.js en !FOLDER! ...
npx terser "!JSFILE!.js" -o "!JSFILE!.min.js" --compress --mangle
if %ERRORLEVEL%==0 (
  echo Minificación completada: !DST!
) else (
  echo Error durante la minificación.
)
pause
