const express = require('express');
const bcrypt = require('bcryptjs');
const { requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();

module.exports = function(db) {

    // ====== STATS GLOBALES ADMIN ======
    router.get('/stats', requireAdmin, (req, res) => {
        try {
            const isSuperAdmin = req.session.role === 'superadmin';
            const adminSiteId = req.session.siteId;
            const today = new Date().toISOString().split('T')[0];

            let total, todayActive, totalConnections, totalCompleted;

            if (isSuperAdmin) {
                total = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'learner'").get().count;

                todayActive = db.prepare(`
                    SELECT COUNT(DISTINCT user_id) as count FROM sessions_log
                    WHERE DATE(login_at) = DATE(?)
                `).get(today).count;

                totalConnections = db.prepare('SELECT COUNT(*) as count FROM sessions_log').get().count;

                totalCompleted = db.prepare(`
                    SELECT COUNT(*) as count FROM (
                        SELECT up.user_id, l.module_id
                        FROM user_progress up
                        JOIN lessons l ON up.lesson_id = l.id
                        WHERE up.completed = 1
                        GROUP BY up.user_id, l.module_id
                        HAVING COUNT(DISTINCT up.lesson_id) = (
                            SELECT COUNT(*) FROM lessons WHERE module_id = l.module_id
                        )
                    )
                `).get().count;

            } else {
                // Admin standard : données filtrées sur son site uniquement
                total = db.prepare(
                    "SELECT COUNT(*) as count FROM users WHERE role = 'learner' AND site_id = ?"
                ).get(adminSiteId).count;

                todayActive = db.prepare(`
                    SELECT COUNT(DISTINCT sl.user_id) as count
                    FROM sessions_log sl
                    JOIN users u ON sl.user_id = u.id
                    WHERE DATE(sl.login_at) = DATE(?) AND u.site_id = ?
                `).get(today, adminSiteId).count;

                totalConnections = db.prepare(`
                    SELECT COUNT(*) as count FROM sessions_log sl
                    JOIN users u ON sl.user_id = u.id WHERE u.site_id = ?
                `).get(adminSiteId).count;

                totalCompleted = db.prepare(`
                    SELECT COUNT(*) as count FROM (
                        SELECT up.user_id, l.module_id
                        FROM user_progress up
                        JOIN lessons l ON up.lesson_id = l.id
                        JOIN users u ON up.user_id = u.id
                        WHERE up.completed = 1 AND u.site_id = ?
                        GROUP BY up.user_id, l.module_id
                        HAVING COUNT(DISTINCT up.lesson_id) = (
                            SELECT COUNT(*) FROM lessons WHERE module_id = l.module_id
                        )
                    )
                `).get(adminSiteId).count;
            }

            // Sites visibles : tous pour superadmin, uniquement le sien pour admin
            const sitesToShow = isSuperAdmin
                ? db.prepare('SELECT * FROM sites').all()
                : db.prepare('SELECT * FROM sites WHERE id = ?').all(adminSiteId);

            const siteStats = sitesToShow.map(s => {
                const count = db.prepare(
                    "SELECT COUNT(*) as count FROM users WHERE site_id = ? AND role = 'learner'"
                ).get(s.id).count;
                const siteConnections = db.prepare(`
                    SELECT COUNT(*) as count FROM sessions_log sl
                    JOIN users u ON sl.user_id = u.id WHERE u.site_id = ?
                `).get(s.id).count;
                return { ...s, learners_count: count, connections: siteConnections };
            });

            res.json({
                total_learners: total,
                today_active: todayActive,
                total_connections: totalConnections,
                total_modules_completed: totalCompleted,
                sites: siteStats
            });
        } catch(err) {
            console.error('Admin stats error:', err);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    // ====== LISTE DES APPRENANTS (filtrable par site, module, nom) ======
    router.get('/learners', requireAdmin, (req, res) => {
        try {
            const isSuperAdmin = req.session.role === 'superadmin';
            const adminSiteId = req.session.siteId;
            const { site, search, module } = req.query;

            let query = `
                SELECT u.id, u.name, u.email, u.site_id, u.created_at, u.last_active,
                       s.short_name as site_name,
                       (SELECT COUNT(*) FROM sessions_log WHERE user_id = u.id) as connections,
                       (SELECT COALESCE(SUM(duration_minutes), 0) FROM sessions_log WHERE user_id = u.id) as total_time
                FROM users u
                LEFT JOIN sites s ON u.site_id = s.id
                WHERE u.role = 'learner'
            `;
            const params = [];

            // Isolation par site : admin voit uniquement son site, superadmin filtre librement
            if (!isSuperAdmin) {
                query += ' AND u.site_id = ?';
                params.push(adminSiteId);
            } else if (site && site !== 'all') {
                query += ' AND u.site_id = ?';
                params.push(site);
            }

            if (search && search.trim()) {
                query += ' AND (u.name LIKE ? OR u.email LIKE ?)';
                params.push(`%${search.trim()}%`, `%${search.trim()}%`);
            }

            // Filtre par module : apprenants ayant complété au moins une leçon du module
            if (module && module !== 'all') {
                query += ` AND u.id IN (
                    SELECT DISTINCT up.user_id FROM user_progress up
                    JOIN lessons l ON up.lesson_id = l.id
                    WHERE l.module_id = ? AND up.completed = 1
                )`;
                params.push(module);
            }

            query += ' ORDER BY u.last_active DESC NULLS LAST';

            const learners = db.prepare(query).all(...params);

            const totalLessons = db.prepare('SELECT COUNT(*) as count FROM lessons').get().count;
            const totalModules = db.prepare('SELECT COUNT(*) as count FROM modules').get().count;

            // Leçons complétées par apprenant — requête unique
            const completedRows = db.prepare(
                'SELECT user_id, COUNT(*) as cnt FROM user_progress WHERE completed = 1 GROUP BY user_id'
            ).all();
            const completedMap = {};
            completedRows.forEach(r => { completedMap[r.user_id] = r.cnt; });

            // Modules complétés par apprenant — requête unique
            const modulesRows = db.prepare(`
                SELECT user_id, COUNT(*) as modules_completed FROM (
                    SELECT up.user_id, l.module_id
                    FROM user_progress up
                    JOIN lessons l ON up.lesson_id = l.id
                    WHERE up.completed = 1
                    GROUP BY up.user_id, l.module_id
                    HAVING COUNT(DISTINCT up.lesson_id) = (
                        SELECT COUNT(*) FROM lessons WHERE module_id = l.module_id
                    )
                ) GROUP BY user_id
            `).all();
            const modulesMap = {};
            modulesRows.forEach(r => { modulesMap[r.user_id] = r.modules_completed; });

            const result = learners.map(l => {
                const completed = completedMap[l.id] || 0;
                const modulesCompleted = modulesMap[l.id] || 0;
                return {
                    ...l,
                    total_lessons: totalLessons,
                    total_modules: totalModules,
                    completed_lessons: completed,
                    progress_pct: totalLessons > 0 ? Math.round((completed / totalLessons) * 100) : 0,
                    modules_completed: modulesCompleted
                };
            });

            res.json({ learners: result });
        } catch(err) {
            console.error('Admin learners error:', err);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    // ====== DÉTAIL D'UN APPRENANT ======
    router.get('/learners/:id', requireAdmin, (req, res) => {
        try {
            const isSuperAdmin = req.session.role === 'superadmin';
            const adminSiteId = req.session.siteId;

            const user = db.prepare(`
                SELECT u.*, s.short_name as site_name FROM users u
                LEFT JOIN sites s ON u.site_id = s.id
                WHERE u.id = ? AND u.role = 'learner'
            `).get(req.params.id);

            if (!user) return res.status(404).json({ error: 'Apprenant introuvable' });

            // Isolation : admin ne peut voir que les apprenants de son site
            if (!isSuperAdmin && user.site_id !== adminSiteId) {
                return res.status(403).json({ error: 'Accès interdit' });
            }

            // Progression par module
            const modules = db.prepare('SELECT * FROM modules ORDER BY sort_order').all();
            const moduleProgress = modules.map(m => {
                const lessons = db.prepare('SELECT * FROM lessons WHERE module_id = ? ORDER BY sort_order').all(m.id);
                if (lessons.length === 0) return { ...m, lessons: [] };

                const progress = db.prepare(`
                    SELECT lesson_id, completed, completed_at FROM user_progress
                    WHERE user_id = ? AND lesson_id IN (${lessons.map(() => '?').join(',')})
                `).all(user.id, ...lessons.map(l => l.id));

                const progressMap = {};
                progress.forEach(p => { progressMap[p.lesson_id] = p; });

                return {
                    ...m,
                    lessons: lessons.map(l => ({
                        id: l.id,
                        title: l.title,
                        completed: progressMap[l.id]?.completed === 1,
                        completed_at: progressMap[l.id]?.completed_at || null
                    }))
                };
            });

            // Sessions (20 dernières)
            const sessions = db.prepare(
                'SELECT * FROM sessions_log WHERE user_id = ? ORDER BY login_at DESC LIMIT 20'
            ).all(user.id);

            res.json({ user, modules: moduleProgress, sessions });
        } catch(err) {
            console.error('Learner detail error:', err);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    // ====== EXPORT CSV ======
    router.get('/export', requireAdmin, (req, res) => {
        try {
            const isSuperAdmin = req.session.role === 'superadmin';
            const adminSiteId = req.session.siteId;
            const { site, module } = req.query;

            let query = `
                SELECT u.id, u.name, u.email, s.short_name as mission_locale, u.created_at,
                       u.last_active,
                       (SELECT COUNT(*) FROM sessions_log WHERE user_id = u.id) as connexions,
                       (SELECT COALESCE(SUM(duration_minutes), 0) FROM sessions_log WHERE user_id = u.id) as temps_total_min,
                       (SELECT COUNT(*) FROM user_progress WHERE user_id = u.id AND completed = 1) as lecons_terminees
                FROM users u
                LEFT JOIN sites s ON u.site_id = s.id
                WHERE u.role = 'learner'
            `;
            const params = [];

            if (!isSuperAdmin) {
                query += ' AND u.site_id = ?';
                params.push(adminSiteId);
            } else if (site && site !== 'all') {
                query += ' AND u.site_id = ?';
                params.push(site);
            }

            if (module && module !== 'all') {
                query += ` AND u.id IN (
                    SELECT DISTINCT up.user_id FROM user_progress up
                    JOIN lessons l ON up.lesson_id = l.id
                    WHERE l.module_id = ? AND up.completed = 1
                )`;
                params.push(module);
            }

            query += ' ORDER BY s.short_name, u.name';

            const rows = db.prepare(query).all(...params);
            const totalLessons = db.prepare('SELECT COUNT(*) as count FROM lessons').get().count;
            const totalModules = db.prepare('SELECT COUNT(*) as count FROM modules').get().count;

            // Modules complétés par apprenant — requête unique
            const modulesRows = db.prepare(`
                SELECT user_id, COUNT(*) as modules_completed FROM (
                    SELECT up.user_id, l.module_id
                    FROM user_progress up
                    JOIN lessons l ON up.lesson_id = l.id
                    WHERE up.completed = 1
                    GROUP BY up.user_id, l.module_id
                    HAVING COUNT(DISTINCT up.lesson_id) = (
                        SELECT COUNT(*) FROM lessons WHERE module_id = l.module_id
                    )
                ) GROUP BY user_id
            `).all();
            const modulesMap = {};
            modulesRows.forEach(r => { modulesMap[r.user_id] = r.modules_completed; });

            // Échappe un champ pour CSV (double les guillemets internes)
            function csvField(val) {
                const str = (val === null || val === undefined) ? '' : String(val);
                return '"' + str.replace(/"/g, '""') + '"';
            }

            let csv = 'Nom,Email,Mission Locale,Date inscription,Dernière activité,Connexions,Temps (min),Leçons terminées,Modules terminés,Progression (%)\n';
            rows.forEach(r => {
                const pct = totalLessons > 0 ? Math.round((r.lecons_terminees / totalLessons) * 100) : 0;
                const modDone = modulesMap[r.id] || 0;
                csv += [
                    csvField(r.name),
                    csvField(r.email),
                    csvField(r.mission_locale),
                    csvField(r.created_at),
                    csvField(r.last_active),
                    r.connexions,
                    r.temps_total_min,
                    r.lecons_terminees,
                    modDone + '/' + totalModules,
                    pct + '%'
                ].join(',') + '\n';
            });

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename=export_apprenants_mdef.csv');
            res.send('\ufeff' + csv); // BOM pour Excel
        } catch(err) {
            console.error('Export error:', err);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    // ====== GESTION DES COMPTES ADMIN (superadmin uniquement) ======

    // Liste de tous les admins/superadmins
    router.get('/admins', requireSuperAdmin, (req, res) => {
        try {
            const admins = db.prepare(`
                SELECT u.id, u.name, u.email, u.site_id, u.role, u.is_active, u.created_at, u.last_active,
                       s.short_name as site_name
                FROM users u
                LEFT JOIN sites s ON u.site_id = s.id
                WHERE u.role IN ('admin', 'superadmin')
                ORDER BY u.role DESC, u.name ASC
            `).all();
            res.json({ admins });
        } catch(err) {
            console.error('List admins error:', err);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    // Créer un compte admin
    router.post('/admins', requireSuperAdmin, (req, res) => {
        try {
            const { name, email, site_id, password } = req.body;

            if (!name || !email || !site_id || !password) {
                return res.status(400).json({ error: 'Tous les champs sont requis' });
            }
            if (password.length < 8) {
                return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });
            }

            const site = db.prepare('SELECT id FROM sites WHERE id = ?').get(site_id);
            if (!site) return res.status(400).json({ error: 'Site invalide' });

            const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
            if (existing) return res.status(400).json({ error: 'Cet email est déjà utilisé' });

            const hash = bcrypt.hashSync(password, 10);
            const result = db.prepare(
                'INSERT INTO users (name, email, password_hash, role, site_id) VALUES (?, ?, ?, ?, ?)'
            ).run(name.trim(), email.toLowerCase().trim(), hash, 'admin', site_id);

            res.json({ success: true, id: result.lastInsertRowid });
        } catch(err) {
            console.error('Create admin error:', err);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    // Modifier un admin : toggle actif, changer site, réinitialiser mdp
    router.patch('/admins/:id', requireSuperAdmin, (req, res) => {
        try {
            const adminId = parseInt(req.params.id);
            const { action, site_id, password } = req.body;

            const user = db.prepare(
                "SELECT id, role, is_active FROM users WHERE id = ? AND role IN ('admin', 'superadmin')"
            ).get(adminId);
            if (!user) return res.status(404).json({ error: 'Administrateur introuvable' });

            // Un superadmin ne peut pas se désactiver ou se modifier lui-même via ce panneau
            if (user.role === 'superadmin' && adminId === req.session.userId) {
                return res.status(403).json({ error: 'Vous ne pouvez pas modifier votre propre compte ici' });
            }

            switch(action) {
                case 'toggle_active': {
                    const newState = user.is_active ? 0 : 1;
                    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(newState, adminId);
                    res.json({ success: true, is_active: newState === 1 });
                    break;
                }
                case 'change_site': {
                    if (!site_id) return res.status(400).json({ error: 'Site requis' });
                    const site = db.prepare('SELECT id FROM sites WHERE id = ?').get(site_id);
                    if (!site) return res.status(400).json({ error: 'Site invalide' });
                    db.prepare('UPDATE users SET site_id = ? WHERE id = ?').run(site_id, adminId);
                    res.json({ success: true });
                    break;
                }
                case 'reset_password': {
                    if (!password || password.length < 8) {
                        return res.status(400).json({ error: 'Mot de passe invalide (min. 8 caractères)' });
                    }
                    const hash = bcrypt.hashSync(password, 10);
                    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, adminId);
                    res.json({ success: true });
                    break;
                }
                default:
                    res.status(400).json({ error: 'Action invalide' });
            }
        } catch(err) {
            console.error('Update admin error:', err);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    return router;
};
