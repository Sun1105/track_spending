@echo off
echo ========================================
echo   Savings Plan App - Auto Deploy Tool
echo ========================================

:: Check if git is initialized
if not exist .git (
    echo [ERROR] Git is not initialized.
    pause
    exit /b
)

:: Check if remote is set
git remote -v > nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] No GitHub remote found. 
    echo Please run: git remote add origin YOUR_GITHUB_REPO_URL
    pause
    exit /b
)

echo [1/3] Adding changes...
git add .

echo [2/3] Committing changes...
set /p msg="Enter update message (default: Auto-update): "
if "%msg%"=="" set msg="Auto-update"
git commit -m "%msg%"

echo [3/3] Pushing to GitHub (This triggers Vercel/GitHub Pages)...
git push origin master

echo ========================================
echo   Done! Your website is being updated.
echo ========================================
pause
