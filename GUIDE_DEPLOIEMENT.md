# 🎓 MDEF Learning Platform — Guide de déploiement

## 📋 Ce que contient le projet

```
mdef-platform/
├── server.js              ← Serveur principal (Express)
├── package.json           ← Dépendances Node.js
├── db/
│   └── init.js            ← Base de données SQLite (auto-créée)
├── middleware/
│   └── auth.js            ← Protection des routes (admin vs learner)
├── routes/
│   ├── auth.js            ← Inscription, connexion, déconnexion
│   ├── modules.js         ← Modules, leçons, progression
│   └── admin.js           ← Dashboard admin, export CSV
└── public/
    └── index.html         ← Interface complète (frontend)
```

## 🔐 Séparation Admin / Jeune

| Rôle | Accès | Comment le créer |
|------|-------|------------------|
| `learner` | Dashboard, modules, leçons | Inscription normale sur le site |
| `admin` | Tout + dashboard admin d'un site | Créé manuellement en base |
| `superadmin` | Tout + tous les sites | Compte par défaut (toi) |

**Les jeunes ne voient JAMAIS le lien "Admin" dans le menu.**  
Même s'ils tapent `/admin` dans l'URL, l'API refuse avec erreur 403.

## 🚀 Comment déployer (étape par étape)

### Option 1 : o2switch (recommandé — ~5€/mois)

1. **Acheter un hébergement** sur https://www.o2switch.fr
2. **Accéder au cPanel** → Terminal SSH
3. **Uploader le dossier** `mdef-platform` via le gestionnaire de fichiers
4. **Exécuter dans le terminal :**

```bash
cd mdef-platform
npm install
npm start
```

5. **Configurer le domaine** (ex: `learn.mdef-grandparissud.fr`) dans cPanel

### Option 2 : VPS (OVH, Hetzner, DigitalOcean)

```bash
# Se connecter en SSH
ssh root@votre-ip

# Installer Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Uploader et lancer
cd mdef-platform
npm install
npm start
```

Pour que ça tourne en permanence :
```bash
npm install -g pm2
pm2 start server.js --name mdef-learn
pm2 save
pm2 startup
```

### Option 3 : Railway.app (gratuit pour commencer)

1. Créer un compte sur https://railway.app
2. Cliquer "New Project" → "Deploy from GitHub"
3. Uploader le code sur GitHub et connecter
4. Railway lance tout automatiquement

## 🔑 Comptes par défaut

| Email | Mot de passe | Rôle |
|-------|-------------|------|
| `admin@mdef-gps.fr` | `Admin2024!` | Super Admin |

**⚠️ CHANGE LE MOT DE PASSE ADMIN en production !**

## 👤 Créer un compte admin pour une Mission Locale

Ouvre le terminal du serveur et lance :

```bash
node -e "
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const db = new Database('./db/mdef.db');
const hash = bcrypt.hashSync('MotDePasse123!', 10);
db.prepare('INSERT INTO users (name, email, password_hash, role, site_id) VALUES (?, ?, ?, ?, ?)').run(
    'Conseiller Sénart', 'admin@ml-senart.fr', hash, 'admin', 'senart'
);
console.log('✅ Admin créé pour Sénart');
"
```

Répète pour chaque mission locale en changeant `site_id` :
- `senart` → Sénart
- `grigny` → Grigny
- `corbeil` → Corbeil-Essonnes
- `centre` → Centre-Essonne

## 📊 Données stockées

| Donnée | Table | Description |
|--------|-------|-------------|
| Utilisateurs | `users` | Nom, email, mission locale, rôle |
| Progression | `user_progress` | Quelle leçon vue, quand |
| Connexions | `sessions_log` | Date, durée, IP, navigateur |
| Modules | `modules` | Titre, description, ordre |
| Leçons | `lessons` | Titre, vidéo YouTube, contenu HTML |

**Tout est dans un seul fichier** : `db/mdef.db` (SQLite)  
→ Facile à sauvegarder, copier, analyser

## 📹 Changer les vidéos YouTube

Ouvre `db/init.js` et remplace les `dQw4w9WgXcQ` par les vrais IDs YouTube.

L'ID YouTube c'est la partie après `v=` dans l'URL :  
`https://www.youtube.com/watch?v=ABC123` → l'ID est `ABC123`

## 🔒 Sécurité en production

Dans `server.js`, change :
```javascript
// Remplace cette ligne :
secret: process.env.SESSION_SECRET || 'mdef-gps-secret-key-change-me-in-production',

// Par quelque chose de unique et complexe :
secret: 'une-phrase-secrete-tres-longue-et-unique-42!',
```

Et si tu as HTTPS (recommandé) :
```javascript
cookie: {
    secure: true,  // ← Passer à true
    ...
}
```

## 📤 Export des données

Depuis le dashboard admin, clique sur **"📊 Exporter CSV"** pour télécharger un fichier Excel compatible avec :
- Nom, email, mission locale
- Date d'inscription, dernière activité
- Nombre de connexions, temps total
- Leçons terminées, progression en %

Le CSV est filtrable par mission locale.
