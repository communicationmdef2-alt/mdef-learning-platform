const express = require('express');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

module.exports = function(db) {

    // ====== LISTE DES MODULES ======
    router.get('/modules', requireAuth, (req, res) => {
        try {
            const modules = db.prepare('SELECT * FROM modules ORDER BY sort_order').all();
            const userId = req.session.userId;

            const result = modules.map(m => {
                const lessons = db.prepare('SELECT id, title, duration, sort_order FROM lessons WHERE module_id = ? ORDER BY sort_order').all(m.id);
                const progress = db.prepare(`
                    SELECT lesson_id FROM user_progress 
                    WHERE user_id = ? AND lesson_id IN (${lessons.map(() => '?').join(',')}) AND completed = 1
                `).all(userId, ...lessons.map(l => l.id));

                const completedIds = new Set(progress.map(p => p.lesson_id));

                return {
                    ...m,
                    lessons_count: lessons.length,
                    completed_count: completedIds.size,
                    lessons: lessons.map(l => ({
                        ...l,
                        completed: completedIds.has(l.id)
                    }))
                };
            });

            res.json({ modules: result });
        } catch(err) {
            console.error('Modules error:', err);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    // ====== DÉTAIL D'UNE LEÇON ======
    router.get('/lessons/:id', requireAuth, (req, res) => {
        try {
            const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(req.params.id);
            if (!lesson) return res.status(404).json({ error: 'Leçon introuvable' });

            const progress = db.prepare(
                'SELECT * FROM user_progress WHERE user_id = ? AND lesson_id = ?'
            ).get(req.session.userId, lesson.id);

            res.json({ lesson, progress: progress || null });
        } catch(err) {
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    // ====== MARQUER UNE LEÇON COMME TERMINÉE ======
    router.post('/lessons/:id/complete', requireAuth, (req, res) => {
        try {
            const lessonId = req.params.id;
            const userId = req.session.userId;

            // Vérifier que la leçon existe
            const lesson = db.prepare('SELECT id FROM lessons WHERE id = ?').get(lessonId);
            if (!lesson) return res.status(404).json({ error: 'Leçon introuvable' });

            // Upsert progression
            db.prepare(`
                INSERT INTO user_progress (user_id, lesson_id, completed, completed_at)
                VALUES (?, ?, 1, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id, lesson_id) DO UPDATE SET completed = 1, completed_at = CURRENT_TIMESTAMP
            `).run(userId, lessonId);

            // Update last_active
            db.prepare('UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = ?').run(userId);

            res.json({ success: true });
        } catch(err) {
            console.error('Complete error:', err);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    // ====== STATS UTILISATEUR ======
    router.get('/stats', requireAuth, (req, res) => {
        try {
            const userId = req.session.userId;

            const totalLessons = db.prepare('SELECT COUNT(*) as count FROM lessons').get().count;
            const completedLessons = db.prepare(
                'SELECT COUNT(*) as count FROM user_progress WHERE user_id = ? AND completed = 1'
            ).get(userId).count;

            const connections = db.prepare(
                'SELECT COUNT(*) as count FROM sessions_log WHERE user_id = ?'
            ).get(userId).count;

            const totalTime = db.prepare(
                'SELECT COALESCE(SUM(duration_minutes), 0) as total FROM sessions_log WHERE user_id = ?'
            ).get(userId).total;

            // Modules complétés
            const modules = db.prepare('SELECT id FROM modules').all();
            let completedModules = 0;
            for (const m of modules) {
                const moduleLessons = db.prepare('SELECT id FROM lessons WHERE module_id = ?').all(m.id);
                const moduleCompleted = db.prepare(`
                    SELECT COUNT(*) as count FROM user_progress 
                    WHERE user_id = ? AND completed = 1 AND lesson_id IN (${moduleLessons.map(() => '?').join(',')})
                `).get(userId, ...moduleLessons.map(l => l.id)).count;
                if (moduleCompleted === moduleLessons.length) completedModules++;
            }

            res.json({
                total_lessons: totalLessons,
                completed_lessons: completedLessons,
                completed_modules: completedModules,
                total_modules: modules.length,
                connections,
                total_time_minutes: totalTime
            });
        } catch(err) {
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    return router;
};
