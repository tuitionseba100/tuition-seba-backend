const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
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

const superadminMiddleware = (req, res, next) => {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Superadmin access required' });
    }
    next();
};

// Get all settings
router.get('/', authMiddleware, async (req, res) => {
    try {
        const settings = await Settings.find();
        res.json(settings);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get a setting by key
router.get('/:key', authMiddleware, async (req, res) => {
    try {
        const setting = await Settings.findOne({ key: req.params.key });
        res.json(setting || { key: req.params.key, value: null });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Update or create a setting
router.post('/', authMiddleware, superadminMiddleware, async (req, res) => {
    const { key, value, submodule, mode } = req.body;
    try {
        let updateData = { value, submodule };

        if (mode === 'append') {
            const existing = await Settings.findOne({ key });
            const existingValue = existing ? (Array.isArray(existing.value) ? existing.value : (existing.value ? [existing.value] : [])) : [];
            const newValue = Array.isArray(value) ? value : (value ? [value] : []);
            
            // Merge and ensure unique values
            const merged = [...existingValue];
            newValue.forEach(val => {
                if (!merged.includes(val)) {
                    merged.push(val);
                }
            });
            updateData.value = merged;
        }

        const setting = await Settings.findOneAndUpdate(
            { key },
            updateData,
            { upsert: true, new: true }
        );
        res.json(setting);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
