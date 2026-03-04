@echo off
echo.
echo ╔══════════════════════════════════════════════════╗
echo ║  🎓 MDEF Learning Platform - Installation       ║
echo ╚══════════════════════════════════════════════════╝
echo.

:: Vérifier Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js n'est pas installé !
    echo.
    echo 👉 Télécharge-le ici : https://nodejs.org
    echo    Prends la version LTS (bouton vert)
    echo    Installe-le, puis relance ce script.
    echo.
    pause
    exit /b
)

echo ✅ Node.js détecté : 
node -v
echo.

:: Installer les dépendances
echo 📦 Installation des dépendances...
call npm install
echo.

if %errorlevel% neq 0 (
    echo ❌ Erreur lors de l'installation
    pause
    exit /b
)

echo ✅ Dépendances installées !
echo.
echo 🚀 Démarrage du serveur...
echo.
echo ════════════════════════════════════════════════════
echo   Ouvre ton navigateur sur : http://localhost:3000
echo   Compte admin : admin@mdef-gps.fr / Admin2024!
echo   Pour arrêter : Ctrl+C dans cette fenêtre
echo ════════════════════════════════════════════════════
echo.

node server.js
pause
