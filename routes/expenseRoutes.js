const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
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

// Add Expense
router.post('/add', authMiddleware, async (req, res) => {
    try {
        const { amount, category, note, date, createdBy } = req.body;
        const newExpense = new Expense({
            amount,
            category,
            note,
            date: date || new Date(),
            createdBy
        });
        const savedExpense = await newExpense.save();
        res.status(201).json(savedExpense);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get Expenses with Filters (Paginated)
router.get('/all', authMiddleware, async (req, res) => {
    try {
        const { startDate, endDate, category, page = 1, limit = 20 } = req.query;
        let query = {};

        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }

        if (category) query.category = category;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const expenses = await Expense.find(query)
            .sort({ date: -1 })
            .skip(skip)
            .limit(limitNum);
            
        const totalCount = await Expense.countDocuments(query);
        const totalPages = Math.ceil(totalCount / limitNum);

        res.json({
            data: expenses,
            currentPage: pageNum,
            totalPages,
            totalCount
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get Summary Data
router.get('/summary', authMiddleware, async (req, res) => {
    try {
        const { startDate, endDate, category } = req.query;
        let query = {};

        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }

        if (category) query.category = category;

        const expenses = await Expense.find(query);

        const totalExpense = expenses.reduce((acc, curr) => acc + curr.amount, 0);

        res.json({ totalExpense });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Delete Expense
router.delete('/delete/:id', authMiddleware, async (req, res) => {
    try {
        await Expense.findByIdAndDelete(req.params.id);
        res.json({ message: 'Expense deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Update Expense
router.put('/edit/:id', authMiddleware, async (req, res) => {
    try {
        const updatedExpense = await Expense.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.json(updatedExpense);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
