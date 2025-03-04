const express = require('express');
const GuardianApply = require('../models/GuardianApply');
const router = express.Router();

router.get('/all', async (req, res) => {
    try {
        const allApply = await GuardianApply.find();
        res.json(allApply);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/add', async (req, res) => {
    const {
        name,
        phone,
        address,
        studentClass,
        teacherGender,
        characteristics,
    } = req.body;

    try {
        const newData = new GuardianApply({
            name,
            phone,
            address,
            studentClass,
            teacherGender,
            characteristics,
            appliedAt: new Date()
        });

        await newData.save();
        res.status(201).json(newData);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.put('/edit/:id', async (req, res) => {
    try {
        const updatedData = await GuardianApply.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedData);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


router.delete('/delete/:id', async (req, res) => {
    try {
        await GuardianApply.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;