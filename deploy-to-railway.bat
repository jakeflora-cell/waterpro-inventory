@echo off
echo ====================================================
echo === Push WaterPro Inventory to GitHub              ===
echo === (Claude will handle Railway config after this) ===
echo ====================================================
echo.

cd /d "%~dp0"

:: Init git if needed
if not exist ".git" (
    echo Initializing git repo...
    git init
    git branch -M main
)

:: Create the repo on GitHub
echo [1/3] Creating GitHub repo...
gh repo create jakeflora-cell/waterpro-inventory --public --source=. --remote=origin 2>nul
if errorlevel 1 (
    echo Repo may already exist, setting remote...
    git remote remove origin 2>nul
    git remote add origin https://github.com/jakeflora-cell/waterpro-inventory.git
)

echo [2/3] Staging files...
git add -A
git commit -m "Initial deploy: WaterPro Inventory System"
if errorlevel 1 (
    echo Nothing new to commit, pushing existing...
)

echo [3/3] Pushing to GitHub...
git push -u origin main
if errorlevel 1 (
    echo.
    echo ERROR: Push failed.
    echo Make sure gh is authenticated: run "gh auth login" first
    pause
    exit /b 1
)

echo.
echo =========================================================
echo   Code pushed! Tell Claude it's done.
echo   Claude will set up Railway from there.
echo =========================================================
echo.
pause
