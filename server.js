const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initDB } = require('./db/init');

// ======================== INIT ========================
const app = express();
const PORT = process.env.PORT || 3000;

async function start() {
    const db = await initDB();

    // ======================== MIDDLEWARE ========================

    // Sécurité HTTP headers (désactive CSP car inline scripts dans index.html)
    app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Assets statiques avec cache 1h
    app.use(express.static(path.join(__dirname, 'public'), {
        maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
    }));

    app.use(session({
        secret: process.env.SESSION_SECRET || 'mdef-gps-secret-key-change-me-in-production',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production', // HTTPS only en prod
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000,
            sameSite: 'lax'
        }
    }));

    // Attache db à chaque requête (utilisé par le middleware auth pour vérifier is_active)
    app.use((req, res, next) => { req.db = db; next(); });

    // Rate limiting sur les routes d'authentification (protège contre brute force)
    const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 20,                   // max 20 tentatives par IP
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Trop de tentatives, réessayez dans 15 minutes.' },
        skip: (req) => process.env.NODE_ENV === 'development' // désactivé en dev
    });

    // ======================== ROUTES API ========================
    app.use('/api/auth', authLimiter, require('./routes/auth')(db));
    app.use('/api', require('./routes/modules')(db));
    app.use('/api/admin', require('./routes/admin')(db));

    app.get('/api/sites', (req, res) => {
        const sites = db.prepare('SELECT * FROM sites').all();
        res.json({ sites });
    });

    // Health check pour Railway/Heroku
    app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
