const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

module.exports = function(db) {

    // ====== INSCRIPTION ======
    router.post('/register', (req, res) => {
        try {
            const { name, email, password, site_id } = req.body;
            
            if (!name || !email || !password || !site_id) {
                return res.status(400).json({ error: 'Tous les champs sont obligatoires' });
            }
            if (password.length < 6) {
                return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
            }
            
            // Vérifier que le site existe
            const site = db.prepare('SELECT id FROM sites WHERE id = ?').get(site_id);
            if (!site) {
                return res.status(400).json({ error: 'Mission Locale invalide' });
            }

            // Vérifier email unique
            const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
            if (existing) {
                return res.status(400).json({ error: 'Cet email est déjà utilisé' });
            }

            const hash = bcrypt.hashSync(password, 10);
            const result = db.prepare(
                'INSERT INTO users (name, email, password_hash, role, site_id) VALUES (?, ?, ?, ?, ?)'
            ).run(name.trim(), email.toLowerCase().trim(), hash, 'learner', site_id);

            const userId = result.lastInsertRowid;

            // Log session
            db.prepare('INSERT INTO sessions_log (user_id, ip_address, user_agent) VALUES (?, ?, ?)').run(
                userId, req.ip, req.get('user-agent')
            );

            // Update last_active
            db.prepare('UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = ?').run(userId);

            // Session
            req.session.userId = userId;
            req.session.role = 'learner';
            req.session.siteId = site_id;

            res.json({ 
                success: true, 
                user: { id: userId, name: name.trim(), email: email.toLowerCase().trim(), role: 'learner', site_id }
            });
        } catch(err) {
            console.error('Register error:', err);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    // ====== CONNEXION ======
    router.post('/login', (req, res) => {
        try {
            const { email, password } = req.body;
            
            if (!email || !password) {
                return res.status(400).json({ error: 'Email et mot de passe requis' });
            }

            const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email.toLowerCase().trim());
            if (!user || !bcrypt.compareSync(password, user.password_hash)) {
                return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
            }

            // Log session
            db.prepare('INSERT INTO sessions_log (user_id, ip_address, user_agent) VALUES (?, ?, ?)').run(
                user.id, req.ip, req.get('user-agent')
            );

            // Update last_active
            db.prepare('UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

            // Session
            req.session.userId = user.id;
            req.session.role = user.role;
            req.session.siteId = user.site_id;
            req.session.sessionLogId = db.prepare('SELECT last_insert_rowid() as id').get().id;

            res.json({ 
                success: true, 
                user: { 
                    id: user.id, 
                    name: user.name, 
                    email: user.email, 
                    role: user.role, 
                    site_id: user.site_id 
                }
            });
        } catch(err) {
            console.error('Login error:', err);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    // ====== DÉCONNEXION ======
    router.post('/logout', (req, res) => {
        try {
            if (req.session.userId && req.session.sessionLogId) {
                // Update session duration
                db.prepare(`
                    UPDATE sessions_log 
                    SET logout_at = CURRENT_TIMESTAMP, 
                        duration_minutes = ROUND((JULIANDAY(CURRENT_TIMESTAMP) - JULIANDAY(login_at)) * 1440)
                    WHERE id = ?
                `).run(req.session.sessionLogId);
            }
            req.session.destroy();
            res.json({ success: true });
        } catch(err) {
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    // ====== SESSION ACTUELLE ======
    router.get('/me', (req, res) => {
        if (!req.session.userId) {
            return res.json({ user: null });
        }
        const user = db.prepare('SELECT id, name, email, role, site_id FROM users WHERE id = ?').get(req.session.userId);
        res.json({ user: user || null });
    });

    return router;
};
