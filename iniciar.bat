@echo off
chcp 65001 >nul
title CodeLens
cd /d "%~dp0"

rem Se abriu de dentro do .zip, o Windows roda numa pasta temporaria e nada funciona
echo %~dp0 | findstr /i /c:"\Temp\" /c:".zip" >nul
if not errorlevel 1 (
  echo.
  echo   ATENCAO: parece que voce abriu de DENTRO do .zip.
  echo   Clique com o botao direito no .zip ^> "Extrair tudo...", e abra o iniciar.bat da pasta extraida.
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   O Node.js nao esta instalado neste computador.
  echo   Vou abrir o site: baixe a versao "LTS", instale ^(Avancar, Avancar...^) e abra este arquivo de novo.
  echo.
  start https://nodejs.org/pt
  pause
  exit /b 1
)

node scripts\iniciar.mjs
echo.
pause
