const express = require('express');
const User = require('../models/User');
const LoginHistory = require('../models/LoginHistory');
const bcrypt = require('bcryptjs');
const router = express.Router();
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

// Max 10 login attempts per IP per 15 minutes, then blocked for 1 hour
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many login attempts. Please try again after 15 minutes.' }
});

const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ message: 'Access Denied' });

    try {
        const verified = jwt.verify(token, 'mahedi1000abcdefgh100');
        req.user = verified;
        next();
    } catch (err) {
        res.status(400).json({ message: 'Invalid Token' });
    }
};

// Get all users
router.get('/users', authMiddleware, async (req, res) => {
    try {
        const users = await User.find().select('-password').lean();
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Register user
router.post('/register', authMiddleware, async (req, res) => {
    const { username, password, role, name, permissions, autoLock, salary } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 12);
        const newUser = new User({
            username,
            password: hashedPassword,
            role,
            name,
            permissions: permissions || [],
            autoLock: autoLock || false,
            salary: salary !== undefined && salary !== null ? Number(salary) : 0
        });
        await newUser.save();
        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Check password — supports both bcrypt hashes and legacy plain-text passwords.
        // If the stored value is not a bcrypt hash, fall back to plain-text comparison
        // and immediately rehash the password so the account auto-migrates on first login.
        const isBcryptHash = user.password.startsWith('$2');
        let passwordValid = false;

        if (isBcryptHash) {
            passwordValid = await bcrypt.compare(password, user.password);
        } else {
            // Legacy plain-text comparison
            passwordValid = user.password === password;
            if (passwordValid) {
                // Auto-migrate: rehash and save so future logins use bcrypt
                user.password = await bcrypt.hash(password, 12);
                await user.save();
            }
        }

        if (!passwordValid) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        if (user.isLocked) {
            return res.status(403).json({ message: 'Your account is locked. Please contact Superadmin.' });
        }

        // Night Lock Logic (Only for standard admins)
        if (user.autoLock && user.role !== 'superadmin') {
            const bdHour = parseInt(new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Asia/Dhaka',
                hour: 'numeric',
                hour12: false
            }).format(new Date()));

            if (bdHour >= 0 && bdHour < 7) {
                return res.status(403).json({
                    message: 'Night Lock Active: Access restricted between 12:00 AM and 07:00 AM (Bangladesh Time).'
                });
            }
        }

        const token = jwt.sign(
            { userId: user._id, role: user.role },
            'mahedi1000abcdefgh100',
            { expiresIn: '12h' }
        );

        // Record login history
        try {
            const history = new LoginHistory({
                userId: user._id,
                username: user.username,
                ip: req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress,
                userAgent: req.headers['user-agent']
            });
            await history.save();
        } catch (historyErr) {
            console.error('Error saving login history:', historyErr);
            // Don't block login if history fails
        }

        res.json({
            message: 'Login successful',
            token,
            role: user.role,
            username: user.username,
            permissions: user.permissions || []
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Approve user
router.put('/approve/:id', authMiddleware, async (req, res) => {
    try {
        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            { status: 'approved' },
            { new: true }
        );
        res.json(updatedUser);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Edit user
router.put('/edit/:id', authMiddleware, async (req, res) => {
    const { username, password, role, name, permissions, autoLock, salary } = req.body;

    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Only hash and update password if a new password string was provided
        if (password && typeof password === 'string' && password.trim() !== '') {
            // Prevent re-hashing if it is already the current bcrypt hash
            if (password !== user.password) {
                user.password = await bcrypt.hash(password, 12);
            }
        }

        if (role) user.role = role;
        if (name) user.name = name;
        if (permissions !== undefined) user.permissions = permissions;
        if (autoLock !== undefined) user.autoLock = autoLock;
        if (salary !== undefined) user.salary = Number(salary);

        await user.save();

        res.json({ message: 'User updated successfully', user });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// Delete user
router.delete('/delete/:id', authMiddleware, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Toggle user lock status (Superadmin only)
router.put('/toggle-lock/:id', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'Only Superadmins can lock/unlock users' });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.isLocked = !user.isLocked;
        await user.save();

        res.json({ message: `User ${user.isLocked ? 'locked' : 'unlocked'} successfully`, isLocked: user.isLocked });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get login history for a specific user (Superadmin only)
router.get('/history/:userId', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'Only Superadmins can view login history' });
        }

        const history = await LoginHistory.find({ userId: req.params.userId })
            .sort({ timestamp: -1 })
            .limit(30);

        res.json(history);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
