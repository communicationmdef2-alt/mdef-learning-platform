// Vérifie que l'utilisateur est connecté
function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Non connecté' });
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
