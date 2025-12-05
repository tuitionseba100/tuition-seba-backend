const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.DB_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log('MongoDB connection error:', err));

const tuitionRoutes = require('./routes/tuitionRoutes');
const userRoutes = require('./routes/userRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const guardianApplyRoutes = require('./routes/guardianApplyRoutes');
const taskDataRoutes = require('./routes/taskDataRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const tuitionApplyRoutes = require('./routes/tuitionApplyRoutes');
const refundRoutes = require('./routes/refundPaymentRoutes');
const teacherPaymentRoutes = require('./routes/teacherPaymentRoutes');
const regTeacherRoutes = require('./routes/regTeacherRoutes');
const phoneRoutes = require('./routes/phoneRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const leadRoutes = require('./routes/leadRoutes');

app.use('/api/tuition', tuitionRoutes);
app.use('/api/user', userRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/guardianApply', guardianApplyRoutes);
app.use('/api/taskData', taskDataRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/tuitionApply', tuitionApplyRoutes);
app.use('/api/refund', refundRoutes);
app.use('/api/teacherPayment', teacherPaymentRoutes);
app.use('/api/regTeacher', regTeacherRoutes);
app.use('/api/phone', phoneRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/lead', leadRoutes);

app.get('/', (req, res) => {
    res.send('Welcome to TuitionSeba API!');
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
