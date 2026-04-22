const express = require('express');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const router = express.Router();
const jwt = require('jsonwebtoken');

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
        const users = await User.find();
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Register user
router.post('/register', authMiddleware, async (req, res) => {
    const { username, password, role, name, permissions } = req.body;

    try {
        const newUser = new User({ username, password, role, name, permissions: permissions || [] });
        await newUser.save();
        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user || user.password !== password) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        if (user.isLocked) {
            return res.status(403).json({ message: 'Your account is locked. Please contact Superadmin.' });
        }

        const token = jwt.sign(
            { userId: user._id, role: user.role },
            'mahedi1000abcdefgh100',
            { expiresIn: '12h' }
        );

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
    const { username, password, role, name, permissions } = req.body;

    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Update user details
        if (username) user.username = username;
        if (password) user.password = password;
        if (role) user.role = role;
        if (name) user.name = name;
        if (permissions !== undefined) user.permissions = permissions;

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

module.exports = router;
