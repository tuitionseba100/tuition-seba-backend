const express = require('express');
const Tuition = require('../models/Tuition');
const router = express.Router();

router.get('/available', async (req, res) => {
    try {
        const tuitions = await Tuition.find({ isPublish: true }).select('-status -guardianNumber');
        res.json(tuitions);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.get('/all', async (req, res) => {
    try {
        const tuitions = await Tuition.find(); // Fetch all tuition records
        res.json(tuitions); // Send the records as JSON response
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Add tuition record
router.post('/add', async (req, res) => {
    const {
        tuitionCode,
        isPublish,
        wantedTeacher,
        student,
        class: className,
        medium,
        institute,
        subject,
        day,
        time,
        salary,
        location,
        area,
        guardianNumber,
        status,
        joining,
        note,
        tutorNumber,
        isUrgent,
        taskAssignedTo,
    } = req.body;

    try {
        const newTuition = new Tuition({
            tuitionCode,
            isPublish,
            wantedTeacher,
            student,
            class: className,
            medium,
            institute,
            subject,
            day,
            time,
            salary,
            location,
            area,
            guardianNumber,
            status,
            joining,
            note,
            tutorNumber,
            isUrgent,
            taskAssignedTo,
        });

        await newTuition.save();
        res.status(201).json(newTuition);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Edit tuition record
router.put('/edit/:id', async (req, res) => {
    try {
        const updatedTuition = await Tuition.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedTuition);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Delete tuition record
router.delete('/delete/:id', async (req, res) => {
    try {
        await Tuition.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
