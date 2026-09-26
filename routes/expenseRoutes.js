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
        const { amount, category, note, date, createdBy, salaryUser } = req.body;
        const newExpense = new Expense({
            amount,
            category,
            note,
            date: date || new Date(),
            createdBy,
            salaryUser: category === 'Salary' ? (salaryUser || '') : ''
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
        const { startDate, endDate, category, salaryUser, page = 1, limit = 20 } = req.query;
        let query = {};

        if (startDate || endDate) {
            query.date = {};
            if (startDate) {
                const s = new Date(startDate);
                s.setHours(0, 0, 0, 0);
                query.date.$gte = s;
            }
            if (endDate) {
                const e = new Date(endDate);
                e.setHours(23, 59, 59, 999);
                query.date.$lte = e;
            }
        }

        if (category) query.category = category;
        if (salaryUser) query.salaryUser = { $regex: new RegExp(`^${salaryUser}$`, 'i') };

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

// Get Salary History for a specific employee
router.get('/salary-history/:username', authMiddleware, async (req, res) => {
    try {
        const { username } = req.params;
        const requestedUser = req.user;

        // Non-superadmin can only see their own salary history
        if (requestedUser && requestedUser.role !== 'superadmin') {
            if (requestedUser.username && requestedUser.username.toLowerCase() !== username.toLowerCase()) {
                return res.status(403).json({ message: 'Unauthorized to view other employee salary history' });
            }
        }

        const history = await Expense.find({
            category: 'Salary',
            salaryUser: { $regex: new RegExp(`^${username}$`, 'i') }
        }).sort({ date: -1 });

        const totalPaid = history.reduce((sum, item) => sum + (item.amount || 0), 0);

        res.json({
            username,
            totalPaid,
            count: history.length,
            history
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
            if (startDate) {
                const s = new Date(startDate);
                s.setHours(0, 0, 0, 0);
                query.date.$gte = s;
            }
            if (endDate) {
                const e = new Date(endDate);
                e.setHours(23, 59, 59, 999);
                query.date.$lte = e;
            }
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
