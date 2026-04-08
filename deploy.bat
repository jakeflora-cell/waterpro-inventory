@echo off
echo ============================================
echo  WaterPro Inventory — Railway Deploy Script
echo ============================================
echo.

:: Check Railway CLI
where railway >nul 2>nul
if %errorlevel% neq 0 (
    echo Railway CLI not found. Installing...
    npm install -g @railway/cli
    echo.
    echo Now log in to Railway:
    railway login
    echo.
)

:: Init project
echo [1/6] Creating Railway project...
railway init --name waterpro-inventory
echo.

:: Add volume for persistent SQLite
echo [2/6] Adding persistent volume...
echo NOTE: If this command fails, add the volume manually in Railway dashboard:
echo   Service → Settings → Volumes → Add → Mount path: /data
railway volume add --mount /data
echo.

:: Set env vars
echo [3/6] Setting environment variables...
railway variables set PORT=3000
railway variables set DATA_DIR=/data
railway variables set ALBI_API_KEY=7475450b-f841-46a1-a652-5d349fd11865
railway variables set ALBI_BASE_URL=https://api.albiware.com/v5/Integrations
railway variables set SKIP_ALBI=false
railway variables set ADMIN_PIN=8347
echo.

:: Deploy
echo [4/6] Deploying to Railway...
railway up --detach
echo.

:: Generate domain
echo [5/6] Generating public domain...
railway domain
echo.

echo ============================================
echo  ALMOST DONE — ONE MANUAL STEP LEFT
echo ============================================
echo.
echo Copy the domain Railway just gave you and run:
echo.
echo   railway variables set BASE_URL=https://YOUR-DOMAIN-HERE
echo.
echo Then redeploy:
echo.
echo   railway up --detach
echo.
echo After that:
echo   1. Go to https://YOUR-DOMAIN/admin
echo   2. Log in with PIN: 8347
echo   3. Click "Sync Projects from Albi" in Reports tab
echo   4. Click "Print Labels" top right to print QR codes
echo   5. Hand out PINs (see EMPLOYEE-PINS.txt)
echo.
pause
