const express = require('express');
const Phone = require('../models/Phone');
const router = express.Router();

router.get('/all', async (req, res) => {
    try {
        const data = await Phone.find();
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/add', async (req, res) => {
    const { phone, note, isActive = true, isSpam = true } = req.body;

    try {
        const newPhone = new Phone({ phone, note, isActive, isSpam });
        await newPhone.save();
        res.status(201).json(newPhone);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.put('/edit/:id', async (req, res) => {
    try {
        const updatedData = await Phone.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedData);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.delete('/delete/:id', async (req, res) => {
    try {
        await Phone.findByIdAndDelete(req.params.id);
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
