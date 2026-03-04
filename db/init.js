const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'mdef.db');
let _db = null;

async function initDB() {
    const SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        _db = new SQL.Database(buffer);
        console.log('📂 Base chargée depuis', DB_PATH);
    } else {
        _db = new SQL.Database();
        console.log('🆕 Nouvelle base de données créée');
    }

    _db.run('PRAGMA foreign_keys = ON');

    // Tables
    _db.run(`CREATE TABLE IF NOT EXISTS sites (id TEXT PRIMARY KEY, name TEXT NOT NULL, short_name TEXT NOT NULL)`);
    _db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'learner' CHECK(role IN ('learner','admin','superadmin')), site_id TEXT REFERENCES sites(id), created_at DATETIME DEFAULT CURRENT_TIMESTAMP, last_active DATETIME, is_active INTEGER DEFAULT 1)`);
    _db.run(`CREATE TABLE IF NOT EXISTS modules (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, icon TEXT, color TEXT, sort_order INTEGER DEFAULT 0)`);
    _db.run(`CREATE TABLE IF NOT EXISTS lessons (id TEXT PRIMARY KEY, module_id TEXT NOT NULL REFERENCES modules(id), title TEXT NOT NULL, duration TEXT, video_url TEXT, content TEXT, sort_order INTEGER DEFAULT 0)`);
    _db.run(`CREATE TABLE IF NOT EXISTS user_progress (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, lesson_id TEXT NOT NULL, completed INTEGER DEFAULT 0, completed_at DATETIME, video_watched_pct INTEGER DEFAULT 0, UNIQUE(user_id, lesson_id))`);
    _db.run(`CREATE TABLE IF NOT EXISTS sessions_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, login_at DATETIME DEFAULT CURRENT_TIMESTAMP, logout_at DATETIME, duration_minutes INTEGER DEFAULT 0, ip_address TEXT, user_agent TEXT)`);

    // Index
    _db.run('CREATE INDEX IF NOT EXISTS idx_users_site ON users(site_id)');
    _db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    _db.run('CREATE INDEX IF NOT EXISTS idx_progress_user ON user_progress(user_id)');
    _db.run('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions_log(user_id)');

    // Sites
    [['senart','Mission Locale de Sénart','Sénart'],['grigny','Mission Locale de Grigny','Grigny'],['corbeil','Mission Locale de Corbeil-Essonnes','Corbeil-Essonnes'],['centre','Mission Locale Centre-Essonne','Centre-Essonne']].forEach(([id,name,short]) => {
        _db.run('INSERT OR IGNORE INTO sites (id,name,short_name) VALUES (?,?,?)', [id,name,short]);
    });

    // Modules
    [['cv','Créer son CV',"Apprenez à rédiger un CV professionnel et percutant.",'📄','blue',1],['lettre','Lettre de motivation',"Rédigez des lettres de motivation convaincantes.",'✉️','turquoise',2],['entretien','Réussir son entretien',"Préparez-vous efficacement aux entretiens.",'🎯','green',3],['numerique','Outils numériques',"Maîtrisez les outils numériques essentiels.",'💻','orange',4]].forEach(([id,t,d,i,c,o]) => {
        _db.run('INSERT OR IGNORE INTO modules (id,title,description,icon,color,sort_order) VALUES (?,?,?,?,?,?)', [id,t,d,i,c,o]);
    });

    // Leçons
    const L = [
        ['cv-1','cv','Introduction au CV','8 min','dQw4w9WgXcQ',`<h2>Qu'est-ce qu'un CV ?</h2><p>Le CV est votre carte de visite professionnelle. Un bon CV doit être <strong>clair, concis et bien structuré</strong>.</p><div class="lesson-tip"><div class="lesson-tip-title">💡 Astuce</div>Un recruteur passe en moyenne 30 secondes sur un CV.</div><h2>Les éléments essentiels</h2><p>Informations personnelles, titre, expériences, formation et compétences.</p>`,1],
        ['cv-2','cv','Les informations personnelles','6 min','dQw4w9WgXcQ',`<h2>L'en-tête du CV</h2><p>Coordonnées essentielles : prénom, nom, téléphone, email pro, ville.</p><div class="lesson-tip"><div class="lesson-tip-title">⚠️ Important</div>Utilisez une adresse email professionnelle.</div><h2>La photo</h2><p>Pas obligatoire en France. Si vous en mettez une, elle doit être professionnelle.</p>`,2],
        ['cv-3','cv','Rédiger ses expériences','10 min','dQw4w9WgXcQ',`<h2>Présenter ses expériences</h2><p>De la <strong>plus récente à la plus ancienne</strong>. Poste, entreprise, dates et missions.</p><div class="lesson-tip"><div class="lesson-tip-title">💡 Astuce pro</div>Verbes d'action : "Géré", "Développé", "Organisé"...</div><h2>Pas d'expérience ?</h2><p>Stages, bénévolat, jobs d'été comptent aussi !</p>`,3],
        ['cv-4','cv','Formation & compétences','7 min','dQw4w9WgXcQ',`<h2>Formation</h2><p>Diplômes du plus récent au plus ancien.</p><h2>Compétences</h2><p>Distinguez <strong>hard skills</strong> et <strong>soft skills</strong>.</p><div class="lesson-tip"><div class="lesson-tip-title">💡 Conseil</div>Adaptez vos compétences à chaque offre !</div>`,4],
        ['cv-5','cv','Mise en page & finitions','8 min','dQw4w9WgXcQ',`<h2>Règles d'or</h2><p>Un CV = <strong>une seule page</strong>. Lisibilité avant tout.</p><div class="lesson-tip"><div class="lesson-tip-title">✅ Checklist</div>Orthographe, PDF, relecture, avis extérieur.</div>`,5],
        ['lm-1','lettre','Structure d\'une lettre','7 min','dQw4w9WgXcQ',`<h2>Structure en 3 parties</h2><p><strong>Vous → Moi → Nous</strong>.</p><div class="lesson-tip"><div class="lesson-tip-title">💡 Astuce</div>Montrez que vous connaissez l'entreprise.</div>`,1],
        ['lm-2','lettre','Personnaliser sa lettre','9 min','dQw4w9WgXcQ',`<h2>Adapter à chaque offre</h2><p>Reprenez les <strong>mots-clés de l'annonce</strong>.</p><div class="lesson-tip"><div class="lesson-tip-title">⚠️ Erreur fréquente</div>Ne répétez pas votre CV !</div>`,2],
        ['lm-3','lettre','Les erreurs à éviter','6 min','dQw4w9WgXcQ',`<h2>Pièges classiques</h2><p>Fautes, copier-coller visible, ton familier.</p><div class="lesson-tip"><div class="lesson-tip-title">✅ Bon réflexe</div>Faites relire par votre conseiller !</div>`,3],
        ['ent-1','entretien','Avant l\'entretien','8 min','dQw4w9WgXcQ',`<h2>Préparation = 80% du succès</h2><p>Renseignez-vous sur l'entreprise.</p><div class="lesson-tip"><div class="lesson-tip-title">💡 Méthode STAR</div>Situation → Tâche → Action → Résultat.</div>`,1],
        ['ent-2','entretien','Pendant l\'entretien','10 min','dQw4w9WgXcQ',`<h2>Premières impressions</h2><p>Tenue soignée, 5 min en avance, assurance.</p><h2>Non-verbal</h2><p>Posture, regard et sourire comptent autant que vos mots.</p>`,2],
        ['ent-3','entretien','Après l\'entretien','5 min','dQw4w9WgXcQ',`<h2>Suivi</h2><p><strong>Email de remerciement</strong> dans les 24h.</p><h2>Refus ?</h2><p>Demandez un retour constructif.</p>`,3],
        ['num-1','numerique','Créer un email pro','6 min','dQw4w9WgXcQ',`<h2>Email professionnel</h2><p><strong>prenom.nom@gmail.com</strong> inspire confiance.</p><div class="lesson-tip"><div class="lesson-tip-title">💡</div>Activez les notifications !</div>`,1],
        ['num-2','numerique','Utiliser France Travail','9 min','dQw4w9WgXcQ',`<h2>France Travail</h2><p>Créez votre profil, paramétrez des alertes.</p><div class="lesson-tip"><div class="lesson-tip-title">💡</div>Mettez à jour votre CV régulièrement !</div>`,2],
        ['num-3','numerique','LinkedIn & réseaux pro','8 min','dQw4w9WgXcQ',`<h2>LinkedIn</h2><p>Profil <strong>complet et actif</strong> = plus de chances.</p><div class="lesson-tip"><div class="lesson-tip-title">💡</div>80% des recruteurs utilisent LinkedIn.</div>`,3],
        ['num-4','numerique','Postuler en ligne','7 min','dQw4w9WgXcQ',`<h2>Plateformes d'emploi</h2><p>Indeed, HelloWork, Welcome to the Jungle...</p><div class="lesson-tip"><div class="lesson-tip-title">✅</div>Créez un tableau de suivi !</div>`,4],
    ];
    L.forEach(([id,mod,title,dur,vid,content,order]) => {
        _db.run('INSERT OR IGNORE INTO lessons (id,module_id,title,duration,video_url,content,sort_order) VALUES (?,?,?,?,?,?,?)', [id,mod,title,dur,vid,content,order]);
    });

    // Admin par défaut
    const admin = get('SELECT id FROM users WHERE role = ?', ['superadmin']);
    if (!admin) {
        const adminPassword = process.env.ADMIN_PASSWORD || 'Admin2024!';
        const hash = bcrypt.hashSync(adminPassword, 10);
        _db.run('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)',
            ['Administrateur MDEF','admin@mdef-gps.fr',hash,'superadmin']);
        console.log('✅ Compte admin créé : admin@mdef-gps.fr (mot de passe défini via ADMIN_PASSWORD)');
    }

    save();
    return wrap();
}

function save() {
    if (_db) {
        const data = _db.export();
        fs.writeFileSync(DB_PATH, Buffer.from(data));
    }
}

setInterval(save, 30000);
process.on('exit', save);
process.on('SIGINT', () => { save(); process.exit(); });
process.on('SIGTERM', () => { save(); process.exit(); });

function get(sql, params = []) {
    const stmt = _db.prepare(sql);
    if (params.length) stmt.bind(params);
    if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r; }
    stmt.free();
    return null;
}

function all(sql, params = []) {
    const stmt = _db.prepare(sql);
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
}

function run(sql, params = []) {
    _db.run(sql, params);
    save();
    const r = get('SELECT last_insert_rowid() as id', []);
    return { lastInsertRowid: r ? r.id : 0, changes: _db.getRowsModified() };
}

function wrap() {
    return {
        prepare: (sql) => ({
            get: (...args) => get(sql, args.flat()),
            all: (...args) => all(sql, args.flat()),
            run: (...args) => run(sql, args.flat()),
        }),
    };
}

module.exports = { initDB, DB_PATH };
