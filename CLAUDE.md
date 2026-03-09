# CLAUDE.md — Kit du Candidat

## 🎯 Contexte du projet

**Kit du Candidat** est une plateforme SaaS multi-tenant de formation modulaire hébergée sur **Railway.app** (backend Node.js/Express + PostgreSQL) avec le code source sur **GitHub**.

### Ce que fait l'application
- Les candidats se connectent et accèdent à des **modules de formation**
- Chaque candidat choisit son **site d'appartenance** à l'inscription
- Un **admin par site** gère et suit les candidats de son site uniquement
- Un **super admin** voit et gère **tous les candidats de tous les sites**
- Le dashboard affiche : % de progression par module, nombre de connexions, modules complétés
- Export Excel filtré par site

---

## 🏗️ Architecture & Stack

```
Backend  : Node.js + Express
Base de données : PostgreSQL (hébergé Railway)
Hébergement : Railway.app
Versioning : GitHub
Auth : Sessions (JWT ou express-session)
Export : Excel (xlsx ou exceljs)
```

### Schéma de base de données attendu

```sql
-- Sites (multi-tenant)
sites: id, name, slug, created_at

-- Utilisateurs (candidats + admins)
users: id, email, password_hash, role (candidat|admin|superadmin),
       site_id (FK → sites), first_name, last_name,
       created_at, last_login_at, login_count

-- Modules
modules: id, title, description, order_index, created_at

-- Progression des candidats
user_module_progress: id, user_id (FK), module_id (FK),
                      status (not_started|in_progress|completed),
                      progress_percent (0-100), started_at, completed_at,
                      updated_at

-- Sessions de connexion (audit trail)
login_sessions: id, user_id (FK), ip_address, user_agent,
                logged_in_at, logged_out_at
```

---

## 🔐 Système d'authentification & Sessions

### Ce qu'il faut vérifier et sécuriser absolument

1. **Hashage des mots de passe** — utiliser `bcrypt` avec salt rounds ≥ 12
2. **Sessions sécurisées** :
   - `httpOnly: true`, `secure: true` (en production), `sameSite: 'strict'`
   - Secret de session stocké dans les variables d'environnement Railway (jamais en dur dans le code)
   - Régénérer le session ID après login (`req.session.regenerate`)
   - Détruire proprement la session au logout
3. **Tokens JWT** (si utilisés à la place des sessions) :
   - Stocker en `httpOnly cookie`, jamais dans `localStorage`
   - Expiration courte (15min–1h) + refresh token séparé
   - Invalider le refresh token au logout
4. **Protection CSRF** — middleware `csurf` ou `double submit cookie`
5. **Rate limiting** sur `/login` — ex. 5 tentatives / 15 min par IP (utiliser `express-rate-limit`)
6. **Logging des connexions** — enregistrer chaque login dans `login_sessions` avec IP + user_agent

### Vérifications de sécurité à effectuer
- [ ] Aucun mot de passe ou secret dans le code source (vérifier `.env`, `.gitignore`)
- [ ] Headers HTTP sécurisés via `helmet`
- [ ] Pas de SQL injection possible (utiliser des requêtes paramétrées, jamais de concaténation)
- [ ] Pas de XSS (échapper toutes les sorties utilisateur)
- [ ] CORS configuré strictement (whitelist de domaines uniquement)
- [ ] Variables d'env Railway : `DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV=production`

---

## 👥 Système de rôles & Permissions

### 3 rôles distincts

| Rôle | Accès |
|------|-------|
| `candidat` | Ses propres modules uniquement |
| `admin` | Tous les candidats de **son site** uniquement |
| `superadmin` | Tous les candidats de **tous les sites** |

### Middleware de contrôle d'accès à vérifier

```javascript
// Exemple de middleware attendu
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  next();
};

// Isolation par site pour les admins
const requireSamesite = (req, res, next) => {
  if (req.user.role === 'admin' && req.targetUser.site_id !== req.user.site_id) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  next();
};
```

### Vérifications critiques
- [ ] Un admin ne peut **jamais** accéder aux données d'un autre site (vérifier toutes les routes API)
- [ ] Un candidat ne peut voir que sa propre progression
- [ ] L'isolation par `site_id` est appliquée côté serveur, **pas seulement côté client**
- [ ] Les routes admin sont protégées par middleware, pas juste cachées dans l'UI

---

## 📊 Dashboard Admin

### Données à afficher par candidat

```
- Nom / Prénom
- Email
- Site d'appartenance
- Nombre de connexions totales
- Date de dernière connexion
- % de progression global (moyenne de tous les modules)
- Nombre de modules : non commencés / en cours / complétés
- Détail par module (optionnel : expandable)
```

### Filtres et tri attendus (admin)
- Tri par : Nom, % de progression, nombre de modules complétés, date de connexion
- Filtre par : statut de progression (tous / en cours / complétés), module spécifique
- Recherche par nom/email

### Requêtes SQL optimisées à vérifier

```sql
-- Exemple de requête dashboard admin (à optimiser avec index)
SELECT
  u.id, u.first_name, u.last_name, u.email, u.login_count, u.last_login_at,
  COUNT(ump.id) FILTER (WHERE ump.status = 'completed') AS modules_completed,
  COUNT(ump.id) FILTER (WHERE ump.status = 'in_progress') AS modules_in_progress,
  ROUND(AVG(ump.progress_percent), 1) AS global_progress_percent
FROM users u
LEFT JOIN user_module_progress ump ON ump.user_id = u.id
WHERE u.role = 'candidat' AND u.site_id = $1  -- isolation site admin
GROUP BY u.id
ORDER BY u.last_name ASC;
```

- [ ] Index sur `users.site_id`, `users.role`, `user_module_progress.user_id`
- [ ] Pas de N+1 queries (utiliser JOIN, pas de boucles de requêtes)
- [ ] Pagination si > 100 candidats

---

## 📁 Export Excel

### Comportement attendu

- **Admin** : export des candidats de **son site uniquement**
- **Super Admin** : export de **tous les sites** (avec colonne "Site" dans le fichier)
- Format : une ligne par candidat, colonnes = toutes les métriques du dashboard
- Nom du fichier : `export_[nom-du-site]_[date].xlsx` ou `export_tous-sites_[date].xlsx`

### Vérification de sécurité export
- [ ] Vérifier le rôle et le `site_id` côté serveur **avant** de générer l'export
- [ ] Ne jamais laisser un admin exporter les données d'un autre site via manipulation de paramètres URL
- [ ] L'export ne doit pas exposer les `password_hash` ou données sensibles

---

## 🚀 Déploiement Railway

### Variables d'environnement à vérifier

```env
DATABASE_URL=postgresql://...          # Fourni automatiquement par Railway
SESSION_SECRET=<string aléatoire long> # Générer avec : openssl rand -hex 64
NODE_ENV=production
PORT=3000                              # Railway injecte $PORT automatiquement
CORS_ORIGIN=https://ton-domaine.com
```

### Checklist Railway
- [ ] `NODE_ENV=production` est bien défini
- [ ] `DATABASE_URL` utilisée (pas de credentials en dur)
- [ ] Le `.gitignore` exclut `.env`
- [ ] Les migrations de BDD sont jouées au démarrage (`npm run migrate` dans le start script)
- [ ] Health check endpoint `/health` retourne 200

---

## 🐛 Vérifications et corrections de bugs

### Priorité 1 — Sécurité critique
1. Vérifier isolation multi-tenant : chaque requête API filtre par `site_id` depuis `req.user`, jamais depuis un paramètre client
2. Vérifier que le logout détruit bien la session serveur (pas juste le cookie côté client)
3. Vérifier qu'il n'existe aucune route exposée sans middleware d'authentification

### Priorité 2 — Intégrité des données
1. Vérifier les transactions PostgreSQL sur les opérations critiques (ex: création user + affectation site)
2. Vérifier que `login_count` et `last_login_at` sont bien mis à jour à chaque connexion
3. Vérifier que `user_module_progress` est créé pour chaque user/module au bon moment

### Priorité 3 — Performance
1. Vérifier les index DB manquants
2. Vérifier qu'il n'y a pas de requêtes dans des boucles (N+1)
3. Vérifier que les exports Excel se font en streaming pour les gros volumes

### Priorité 4 — UX & Fiabilité
1. Vérifier la gestion des erreurs : toutes les routes API renvoient des messages d'erreur cohérents
2. Vérifier les validations d'entrée (email valide, mot de passe min 8 chars, site obligatoire à l'inscription)
3. Vérifier que les filtres/tris du dashboard fonctionnent correctement avec des données réelles

---

## 📋 Checklist globale avant validation

```
AUTH & SESSIONS
[ ] Passwords hashés avec bcrypt (≥12 rounds)
[ ] Sessions httpOnly + secure + sameSite
[ ] Rate limiting sur /login
[ ] CSRF protection active
[ ] Logout détruit la session serveur

RÔLES & ACCÈS
[ ] Middleware requireAuth sur toutes les routes protégées
[ ] Isolation site_id vérifiée côté serveur sur toutes les routes admin
[ ] Super admin peut voir tous les sites
[ ] Un candidat ne voit que ses données

BASE DE DONNÉES
[ ] Requêtes paramétrées (pas de concaténation SQL)
[ ] Index sur colonnes fréquemment filtrées
[ ] Pas de N+1 queries
[ ] Migrations versionnées et jouables

DASHBOARD
[ ] Données correctes (login_count, last_login, progress%)
[ ] Tri et filtres fonctionnels
[ ] Pagination si nécessaire

EXPORT EXCEL
[ ] Isolation site respectée à l'export
[ ] Pas de données sensibles exportées
[ ] Nom de fichier dynamique avec date et site

DÉPLOIEMENT RAILWAY
[ ] Aucun secret dans le code
[ ] Variables d'env correctement définies
[ ] .gitignore complet
[ ] Health check endpoint présent
[ ] Logs applicatifs lisibles
```

---

## 🔧 Instructions pour Claude Code

Quand tu analyses ce projet :

1. **Lis tout le code existant avant de modifier quoi que ce soit**
2. **Pour chaque bug trouvé** : explique la cause, montre le code problématique, propose le fix avec le code corrigé
3. **Pour chaque faille de sécurité** : catégorise la sévérité (critique / haute / moyenne / faible) et fournis le correctif
4. **Ne réécris pas l'app from scratch** : améliore et corrige ce qui existe
5. **Teste tes corrections** mentalement avec des cas limites (admin d'un site qui tente d'accéder à un autre site, injection SQL, session expirée, etc.)
6. **Respecte l'architecture existante** sauf si une refacto est absolument nécessaire pour la sécurité
7. **Documente chaque changement** avec un commentaire clair dans le code

Commence toujours par : `1) Audit de sécurité → 2) Correction des bugs → 3) Optimisation performance → 4) Vérification des fonctionnalités`
