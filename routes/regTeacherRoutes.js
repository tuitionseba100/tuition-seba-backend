const express = require('express');
const RegTeacher = require('../models/RegTeacher');
const router = express.Router();
const moment = require('moment-timezone');

// Get all registered teachers
router.get('/all', async (req, res) => {
    try {
        const allTeachers = await RegTeacher.find();
        res.json(allTeachers);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Add new teacher registration
router.post('/add', async (req, res) => {
    try {
        const localTime = moment().utcOffset(6 * 60).format("YYYY-MM-DD HH:mm:ss");
        const newTeacher = new RegTeacher({
            ...req.body,
            createdAt: localTime,
            status: 'pending'
        });

        await newTeacher.save();
        res.status(201).json(newTeacher);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Edit teacher registration by ID
router.put('/edit/:id', async (req, res) => {
    try {
        const updatedTeacher = await RegTeacher.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.json(updatedTeacher);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Update teacher status and comment
router.put('/update-status/:id', async (req, res) => {
    const { status, comment } = req.body;

    if (!status) {
        return res.status(400).json({ message: "Status is required" });
    }

    try {
        const updatedTeacher = await RegTeacher.findByIdAndUpdate(
            req.params.id,
            { status, comment },
            { new: true }
        );

        if (!updatedTeacher) {
            return res.status(404).json({ message: "Record not found" });
        }

        res.json(updatedTeacher);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Delete teacher registration by ID
router.delete('/delete/:id', async (req, res) => {
    try {
        await RegTeacher.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
