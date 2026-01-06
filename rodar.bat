@echo off
setlocal enabledelayedexpansion
title prevIA - Backend (FastAPI)

cd /d "%~dp0"

set "BACKEND_DIR=%~dp0backend"
set "ENV_FILE=%BACKEND_DIR%\.env"

if not exist "%BACKEND_DIR%\app.py" (
  echo [ERRO] Nao achei backend\app.py em: %BACKEND_DIR%
  pause
  exit /b 1
)

if not exist "%BACKEND_DIR%\requirements.txt" (
  echo [ERRO] Nao achei backend\requirements.txt em: %BACKEND_DIR%
  pause
  exit /b 1
)

REM Python: usa seu 3.14 (confirmado)
set "PY=py -3.14"

REM Controle: OPEN_ENV=0 desativa abrir o .env automaticamente
if "%OPEN_ENV%"=="" set "OPEN_ENV=1"

if "%OPEN_ENV%"=="1" (
  if exist "%ENV_FILE%" (
    where code >nul 2>&1
    if %errorlevel%==0 (
      start "" code "%ENV_FILE%"
    ) else (
      start "" notepad "%ENV_FILE%"
    )
  ) else (
    echo [WARN] .env nao encontrado: %ENV_FILE%
  )
)

cd /d "%BACKEND_DIR%"

echo.
echo ===== Instalando dependencias =====
%PY% -m pip install -r requirements.txt
if %errorlevel% neq 0 (
  echo [ERRO] pip install falhou.
  pause
  exit /b 1
)

echo.
echo ===== Subindo servidor =====
start "" "http://127.0.0.1:8000/"
%PY% -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload

echo.
echo [INFO] Uvicorn encerrou.
pause
