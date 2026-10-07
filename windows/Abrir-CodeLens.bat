@echo off
chcp 65001 >nul
title CodeLens
cd /d "%~dp0"

echo %~dp0 | findstr /i /c:"\Temp\" /c:".zip" >nul
if not errorlevel 1 (
  echo.
  echo   ATENCAO: voce abriu de DENTRO do .zip.
  echo   Clique com o botao direito no .zip ^> "Extrair tudo...", e abra o Abrir-CodeLens.bat da pasta extraida.
  echo.
  pause
  exit /b 1
)

echo.
echo   Ligando o CodeLens... (deixe esta janela aberta enquanto usa; para desligar, feche-a)
"%~dp0node\node.exe" "%~dp0scripts\abrir-pronto.mjs"
echo.
pause
