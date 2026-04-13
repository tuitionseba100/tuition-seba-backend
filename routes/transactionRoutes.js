const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
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

// Add Transaction
router.post('/add', authMiddleware, async (req, res) => {
    try {
        const { type, amount, category, note, date } = req.body;
        const newTransaction = new Transaction({
            type,
            amount,
            category,
            note,
            date: date || new Date(),
            createdBy: req.user.name || 'Admin'
        });
        const savedTransaction = await newTransaction.save();
        res.status(201).json(savedTransaction);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get Transactions with Filters
router.get('/all', authMiddleware, async (req, res) => {
    try {
        const { startDate, endDate, type, category } = req.query;
        let query = {};

        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }

        if (type) query.type = type;
        if (category) query.category = category;

        const transactions = await Transaction.find(query).sort({ date: -1 });
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get Summary Data
router.get('/summary', authMiddleware, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let query = {};

        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }

        const transactions = await Transaction.find(query);

        const summary = transactions.reduce((acc, curr) => {
            if (curr.type === 'income') {
                acc.totalIncome += curr.amount;
            } else {
                acc.totalExpense += curr.amount;
            }
            return acc;
        }, { totalIncome: 0, totalExpense: 0 });

        summary.profit = summary.totalIncome - summary.totalExpense;
        res.json(summary);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Delete Transaction
router.delete('/delete/:id', authMiddleware, async (req, res) => {
    try {
        await Transaction.findByIdAndDelete(req.params.id);
        res.json({ message: 'Transaction deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Update Transaction
router.put('/edit/:id', authMiddleware, async (req, res) => {
    try {
        const updatedTransaction = await Transaction.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.json(updatedTransaction);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
