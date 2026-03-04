const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

module.exports = function(db) {

    // ====== STATS GLOBALES ADMIN ======
    router.get('/stats', requireAdmin, (req, res) => {
        try {
            const total = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'learner'").get().count;
            
            const today = new Date().toISOString().split('T')[0];
            const todayActive = db.prepare(`
                SELECT COUNT(DISTINCT user_id) as count FROM sessions_log 
                WHERE DATE(login_at) = DATE(?)
            `).get(today).count;

            const totalConnections = db.prepare('SELECT COUNT(*) as count FROM sessions_log').get().count;

            // Modules complétés (tous users)
            const modules = db.prepare('SELECT id FROM modules').all();
            let totalCompleted = 0;
            const learners = db.prepare("SELECT id FROM users WHERE role = 'learner'").all();
            for (const user of learners) {
                for (const m of modules) {
                    const moduleLessons = db.prepare('SELECT id FROM lessons WHERE module_id = ?').all(m.id);
                    if (moduleLessons.length === 0) continue;
                    const done = db.prepare(`
                        SELECT COUNT(*) as count FROM user_progress 
                        WHERE user_id = ? AND completed = 1 AND lesson_id IN (${moduleLessons.map(() => '?').join(',')})
                    `).get(user.id, ...moduleLessons.map(l => l.id)).count;
                    if (done === moduleLessons.length) totalCompleted++;
                }
            }

            // Stats par site
            const sites = db.prepare('SELECT * FROM sites').all();
            const siteStats = sites.map(s => {
                const count = db.prepare("SELECT COUNT(*) as count FROM users WHERE site_id = ? AND role = 'learner'").get(s.id).count;
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

    // ====== LISTE DES APPRENANTS (filtrable par site) ======
    router.get('/learners', requireAdmin, (req, res) => {
        try {
            const { site, search } = req.query;
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

            if (site && site !== 'all') {
                query += ' AND u.site_id = ?';
                params.push(site);
            }
            if (search) {
                query += ' AND (u.name LIKE ? OR u.email LIKE ?)';
                params.push(`%${search}%`, `%${search}%`);
            }

            query += ' ORDER BY u.last_active DESC';

            const learners = db.prepare(query).all(...params);

            // Ajouter la progression pour chaque apprenant
            const totalLessons = db.prepare('SELECT COUNT(*) as count FROM lessons').get().count;
            const modules = db.prepare('SELECT id FROM modules').all();

            const result = learners.map(l => {
                const completed = db.prepare(
                    'SELECT COUNT(*) as count FROM user_progress WHERE user_id = ? AND completed = 1'
                ).get(l.id).count;

                let modulesCompleted = 0;
                for (const m of modules) {
                    const mLessons = db.prepare('SELECT id FROM lessons WHERE module_id = ?').all(m.id);
                    if (mLessons.length === 0) continue;
                    const mDone = db.prepare(`
                        SELECT COUNT(*) as count FROM user_progress 
                        WHERE user_id = ? AND completed = 1 AND lesson_id IN (${mLessons.map(() => '?').join(',')})
                    `).get(l.id, ...mLessons.map(x => x.id)).count;
                    if (mDone === mLessons.length) modulesCompleted++;
                }

                return {
                    ...l,
                    total_lessons: totalLessons,
                    completed_lessons: completed,
                    progress_pct: Math.round((completed / totalLessons) * 100),
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
            const user = db.prepare(`
                SELECT u.*, s.short_name as site_name FROM users u
                LEFT JOIN sites s ON u.site_id = s.id
                WHERE u.id = ? AND u.role = 'learner'
            `).get(req.params.id);

            if (!user) return res.status(404).json({ error: 'Apprenant introuvable' });

            // Progression par module
            const modules = db.prepare('SELECT * FROM modules ORDER BY sort_order').all();
            const moduleProgress = modules.map(m => {
                const lessons = db.prepare('SELECT * FROM lessons WHERE module_id = ? ORDER BY sort_order').all(m.id);
                const progress = db.prepare(`
                    SELECT lesson_id, completed, completed_at FROM user_progress 
                    WHERE user_id = ? AND lesson_id IN (${lessons.map(() => '?').join(',')})
                `).all(user.id, ...lessons.map(l => l.id));
                
                const progressMap = {};
                progress.forEach(p => progressMap[p.lesson_id] = p);

                return {
                    ...m,
                    lessons: lessons.map(l => ({
                        id: l.id,
                        title: l.title,
                        completed: progressMap[l.id]?.completed === 1,
                        completed_at: progressMap[l.id]?.completed_at
                    }))
                };
            });

            // Sessions
            const sessions = db.prepare(
                'SELECT * FROM sessions_log WHERE user_id = ? ORDER BY login_at DESC LIMIT 20'
            ).all(user.id);

            res.json({ user, modules: moduleProgress, sessions });
        } catch(err) {
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    // ====== EXPORT CSV ======
    router.get('/export', requireAdmin, (req, res) => {
        try {
            const { site } = req.query;
            let query = `
                SELECT u.name, u.email, s.short_name as mission_locale, u.created_at,
                       u.last_active,
                       (SELECT COUNT(*) FROM sessions_log WHERE user_id = u.id) as connexions,
                       (SELECT COALESCE(SUM(duration_minutes), 0) FROM sessions_log WHERE user_id = u.id) as temps_total_min,
                       (SELECT COUNT(*) FROM user_progress WHERE user_id = u.id AND completed = 1) as lecons_terminees
                FROM users u
                LEFT JOIN sites s ON u.site_id = s.id
                WHERE u.role = 'learner'
            `;
            const params = [];
            if (site && site !== 'all') {
                query += ' AND u.site_id = ?';
                params.push(site);
            }
            query += ' ORDER BY s.short_name, u.name';

            const rows = db.prepare(query).all(...params);
            
            const totalLessons = db.prepare('SELECT COUNT(*) as count FROM lessons').get().count;

            // CSV
            let csv = 'Nom,Email,Mission Locale,Date inscription,Dernière activité,Connexions,Temps total (min),Leçons terminées,Progression (%)\n';
            rows.forEach(r => {
                const pct = Math.round((r.lecons_terminees / totalLessons) * 100);
                csv += `"${r.name}","${r.email}","${r.mission_locale || ''}","${r.created_at}","${r.last_active || ''}",${r.connexions},${r.temps_total_min},${r.lecons_terminees},${pct}%\n`;
            });

            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename=export_apprenants_mdef.csv');
            res.send('\ufeff' + csv); // BOM pour Excel
        } catch(err) {
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    return router;
};
