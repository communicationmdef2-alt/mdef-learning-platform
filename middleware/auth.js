// Vérifie que l'utilisateur est connecté ET actif
function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Non connecté' });
    }
    // Vérification is_active : un compte désactivé est bloqué même avec session active
    if (req.db) {
        const user = req.db.prepare('SELECT is_active FROM users WHERE id = ?').get(req.session.userId);
        if (!user || !user.is_active) {
            req.session.destroy();
            return res.status(401).json({ error: 'Compte désactivé' });
        }
    }
    next();
}

// Vérifie que l'utilisateur est admin ou superadmin
function requireAdmin(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Non connecté' });
    }
    if (req.session.role !== 'admin' && req.session.role !== 'superadmin') {
        return res.status(403).json({ error: 'Accès interdit — Réservé aux administrateurs' });
    }
    // Vérification is_active
    if (req.db) {
        const user = req.db.prepare('SELECT is_active FROM users WHERE id = ?').get(req.session.userId);
        if (!user || !user.is_active) {
            req.session.destroy();
            return res.status(401).json({ error: 'Compte désactivé' });
        }
    }
    next();
}

// Vérifie que l'utilisateur est superadmin
function requireSuperAdmin(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Non connecté' });
    }
    if (req.session.role !== 'superadmin') {
        return res.status(403).json({ error: 'Accès interdit — Réservé au super administrateur' });
    }
    next();
}

module.exports = { requireAuth, requireAdmin, requireSuperAdmin };
