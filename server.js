const express = require('express');
const session = require('express-session');
const path = require('path');
const { initDB } = require('./db/init');

// ======================== INIT ========================
const app = express();
const PORT = process.env.PORT || 3000;

async function start() {
    const db = await initDB();

    // ======================== MIDDLEWARE ========================
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(express.static(path.join(__dirname, 'public')));

    app.use(session({
        secret: process.env.SESSION_SECRET || 'mdef-gps-secret-key-change-me-in-production',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000, sameSite: 'lax' }
    }));

    // ======================== ROUTES API ========================
    app.use('/api/auth', require('./routes/auth')(db));
    app.use('/api', require('./routes/modules')(db));
    app.use('/api/admin', require('./routes/admin')(db));

    app.get('/api/sites', (req, res) => {
        const sites = db.prepare('SELECT * FROM sites').all();
        res.json({ sites });
    });

    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    app.listen(PORT, () => {
        console.log(`
╔══════════════════════════════════════════════╗
║  🎓 MDEF Learning Platform                  ║
║  ✅ Serveur démarré sur http://localhost:${PORT}  ║
║  📊 Admin : admin@mdef-gps.fr / Admin2024!  ║
╚══════════════════════════════════════════════╝
        `);
    });
}

start().catch(err => { console.error('❌ Erreur au démarrage:', err); process.exit(1); });
