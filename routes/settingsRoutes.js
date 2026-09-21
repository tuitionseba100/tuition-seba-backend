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

// In-memory RAM cache for public settings (0 DB query overhead for visitors)
let cachedPublicSettings = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes in-memory refresh

const getPublicSettingsData = async () => {
    const now = Date.now();
    if (cachedPublicSettings && (now - lastCacheTime < CACHE_TTL_MS)) {
        return cachedPublicSettings;
    }

    try {
        const setting = await Settings.findOne({ key: 'whatsapp_number' }).lean();
        cachedPublicSettings = {
            whatsapp_number: setting && setting.value ? String(setting.value).trim() : '+8801633920928'
        };
        lastCacheTime = now;
        return cachedPublicSettings;
    } catch (err) {
        console.error('Error reading public settings from DB:', err);
        return cachedPublicSettings || { whatsapp_number: '+8801633920928' };
    }
};

// Public endpoint - Zero auth required, served from RAM with Cache-Control headers
router.get('/public', async (req, res) => {
    try {
        const data = await getPublicSettingsData();
        res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message, whatsapp_number: '+8801633920928' });
    }
});

// Get all settings
router.get('/', authMiddleware, async (req, res) => {
    try {
        const settings = await Settings.find().lean();
        res.json(settings);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get a setting by key
router.get('/:key', authMiddleware, async (req, res) => {
    try {
        const setting = await Settings.findOne({ key: req.params.key }).lean();
        res.json(setting || { key: req.params.key, value: null });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Update or create a setting
router.post('/', authMiddleware, async (req, res) => {
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

        // Instantly invalidate in-memory RAM cache when settings are saved
        if (key === 'whatsapp_number') {
            cachedPublicSettings = {
                whatsapp_number: value ? String(value).trim() : '+8801633920928'
            };
            lastCacheTime = Date.now();
        } else {
            cachedPublicSettings = null;
            lastCacheTime = 0;
        }

        res.json(setting);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
