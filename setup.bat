@echo off
echo ============================================
echo   JellyOS Setup
echo ============================================
echo.

REM Check Node.js
echo [1/6] Checking Node.js...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: Node.js is required (^>=18^). Install from https://nodejs.org
    exit /b 1
)
node -v
echo   Node found
echo.

REM Install dependencies
echo [2/6] Installing dependencies...
call npm install
echo   Dependencies installed
echo.

REM Build
echo [3/6] Building...
call npm run build
echo   Build complete
echo.

REM API Keys
echo [4/6] API Key Configuration
echo   (Press Enter to skip any key)
echo.

set /p openrouter_key=OpenRouter API Key (required):
set /p alchemy_key=Alchemy API Key (optional):
set /p polymarket_key=Polymarket API Key (optional):
set /p kalshi_key=Kalshi API Key (optional):
set /p manifold_key=Manifold API Key (optional):
echo.

REM Create config
echo [5/6] Creating configuration...
set JELLYOS_DIR=%USERPROFILE%\.jellyos
if not exist "%JELLYOS_DIR%" mkdir "%JELLYOS_DIR%"
if not exist "%JELLYOS_DIR%\sessions" mkdir "%JELLYOS_DIR%\sessions"
if not exist "%JELLYOS_DIR%\cache" mkdir "%JELLYOS_DIR%\cache"

REM Create config.json
echo { > "%JELLYOS_DIR%\config.json"
echo   "effectLevel": "normal", >> "%JELLYOS_DIR%\config.json"
echo   "confirmDestructive": true >> "%JELLYOS_DIR%\config.json"
echo } >> "%JELLYOS_DIR%\config.json"

REM Create .env in %JELLYOS_DIR%
echo JELLY_MODEL_1=openrouter/anthropic/claude-sonnet-4-20250514 > "%JELLYOS_DIR%\.env"
echo JELLY_MODEL_2=openrouter/openai/gpt-4o-mini >> "%JELLYOS_DIR%\.env"
echo JELLY_MODEL_3=openrouter/google/gemini-2.5-pro >> "%JELLYOS_DIR%\.env"
echo JELLY_MODEL_4=openrouter/meta-llama/llama-4-maverick >> "%JELLYOS_DIR%\.env"
echo JELLY_MODEL_5=openrouter/deepseek/deepseek-chat >> "%JELLYOS_DIR%\.env"
echo. >> "%JELLYOS_DIR%\.env"
echo OPENROUTER_API_KEY=%openrouter_key% >> "%JELLYOS_DIR%\.env"
echo ALCHEMY_KEY=%alchemy_key% >> "%JELLYOS_DIR%\.env"
echo POLYMARKET_API_KEY=%polymarket_key% >> "%JELLYOS_DIR%\.env"
echo KALSHI_API_KEY=%kalshi_key% >> "%JELLYOS_DIR%\.env"
echo MANIFOLD_API_KEY=%manifold_key% >> "%JELLYOS_DIR%\.env"

echo.
echo ============================================
echo   JellyOS is ready!
echo ============================================
echo.
echo   Run: jelly
echo.
echo   Config saved to: %JELLYOS_DIR%
echo   Environment saved to: %JELLYOS_DIR%\.env
echo.

REM Run npm link to make jelly command globally available
echo [6/6] Linking global command...
npm link
echo ✓ Global link created. Use 'jelly' from anywhere.