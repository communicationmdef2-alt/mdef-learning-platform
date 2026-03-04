#!/bin/bash
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  🎓 MDEF Learning Platform - Installation       ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Vérifier Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js n'est pas installé !"
    echo ""
    echo "👉 Télécharge-le ici : https://nodejs.org"
    echo "   Prends la version LTS"
    echo ""
    exit 1
fi

echo "✅ Node.js détecté : $(node -v)"
echo ""

# Installer les dépendances
echo "📦 Installation des dépendances..."
npm install
echo ""

echo "✅ Dépendances installées !"
echo ""
echo "🚀 Démarrage du serveur..."
echo ""
echo "════════════════════════════════════════════════════"
echo "  Ouvre ton navigateur sur : http://localhost:3000"
echo "  Compte admin : admin@mdef-gps.fr / Admin2024!"
echo "  Pour arrêter : Ctrl+C"
echo "════════════════════════════════════════════════════"
echo ""

node server.js
