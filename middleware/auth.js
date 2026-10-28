/**
 * Shared authentication middleware
 * Import this instead of duplicating jwt.verify() in every route file.
 *
 * Usage:
 *   const { authMiddleware, superadminOnly } = require('../middleware/auth');
 *   router.get('/protected', authMiddleware, superadminOnly, handler);
 */
const jwt = require('jsonwebtoken');

// Read secret from environment — never hard-code it in source files.
// Set JWT_SECRET in your .env (local) or platform environment variables (production).
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    // Fail fast on startup so misconfiguration is obvious
    throw new Error('FATAL: JWT_SECRET environment variable is not set. Set it in .env or platform env vars.');
}

/**
 * Validates the Bearer / raw JWT token from:
 *   - Authorization header  (preferred)
 *   - ?token= query param   (legacy — only allowed for GET endpoints; avoid for mutations)
 */
const authMiddleware = (req, res, next) => {
    let token = req.header('Authorization') || req.query.token;
    if (!token) return res.status(401).json({ message: 'Access Denied: No token provided' });

    if (typeof token === 'string' && token.startsWith('Bearer ')) {
        token = token.slice(7).trim();
    }

    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Invalid or expired token' });
    }
};

/**
 * Must be used AFTER authMiddleware.
 * Rejects requests from non-superadmin users.
 */
const superadminOnly = (req, res, next) => {
    if (!req.user || req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Forbidden: Superadmin access required' });
    }
    next();
};

/**
 * Utility — sign a token with the shared secret.
 * Use this in userRoutes instead of duplicating jwt.sign().
 */
const signToken = (payload, expiresIn = '12h') => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
};

module.exports = { authMiddleware, superadminOnly, signToken, JWT_SECRET };
