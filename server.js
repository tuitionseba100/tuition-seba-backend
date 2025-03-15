const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.DB_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log(err));

// Routes
const tuitionRoutes = require('./routes/tuitionRoutes');
const userRoutes = require('./routes/userRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const guardianApplyRoutes = require('./routes/guardianApplyRoutes');
const taskDataRoutes = require('./routes/taskDataRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');

app.use('/api/tuition', tuitionRoutes);
app.use('/api/user', userRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/guardianApply', guardianApplyRoutes);
app.use('/api/taskData', taskDataRoutes);
app.use('/api/attendance', attendanceRoutes);

app.get('/', (req, res) => {
    res.send('Welcome!');
});


const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});


