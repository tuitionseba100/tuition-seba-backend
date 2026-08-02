const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dns = require('node:dns');

// Set global DNS servers to resolve MongoDB SRV records reliably across different networks
dns.setServers(['8.8.8.8', '1.1.1.1']);

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
const smsRoutes = require('./routes/smsRoutes');
const generalSearchRoutes = require('./routes/generalSearchRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const activityLogRoutes = require('./routes/activityLogRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const statusHistoryRoutes = require('./routes/statusHistoryRoutes');
const complaintSuggestionRoutes = require('./routes/complaintSuggestionRoutes');
const reportRoutes = require('./routes/reportRoutes');
const serviceChargeRoutes = require('./routes/serviceChargeRoutes');
const chatRoutes = require('./routes/chatRoutes');

app.use('/api/tuition', tuitionRoutes);
app.use('/api/activity-log', activityLogRoutes);
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
app.use('/api/sms', smsRoutes);
app.use('/api/generalSearch', generalSearchRoutes);
app.use('/api/expense', expenseRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/statusHistory', statusHistoryRoutes);
app.use('/api/complaintSuggestion', complaintSuggestionRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/serviceCharge', serviceChargeRoutes);
app.use('/api/chat', chatRoutes);


app.get('/', (req, res) => {
    res.send('Welcome to TuitionSeba API!');
});

const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});

// Render Load Balancer connection timeout fix
// This prevents the "2 requests work, 1 fails" random drop issue
server.keepAliveTimeout = 120 * 1000;
server.headersTimeout = 120 * 1000;

// Setup Socket.io Server integrated directly
const { Server } = require('socket.io');
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Keep track of active agents joined in each member's room
const activeAgents = {};


// Import models for Socket.io database writes
const ChatMessage = require('./models/ChatMessage');
const ChatSession = require('./models/ChatSession');

io.on('connection', (socket) => {
    console.log(`New user connected: ${socket.id}`);

    // Join room for a specific member
    socket.on('join_room', async ({ phone, name, role }) => {
        try {
            socket.join(phone);
            console.log(`${role || 'Member'} (${name}) joined room: ${phone}`);

            if (role === 'agent') {
                if (!activeAgents[phone]) activeAgents[phone] = 0;
                activeAgents[phone]++;
                io.to(phone).emit('agent_status', { agentOnline: true });
            }
        } catch (err) {
            console.error('Socket join_room error:', err);
        }
    });

    // Handle sending messages
    socket.on('send_message', async (data) => {
        try {
            const { phone, premiumCode, sender, senderName, text } = data;

            // Save message
            const newMessage = new ChatMessage({
                phone,
                premiumCode,
                sender,
                senderName,
                text,
                isRead: sender === 'agent'
            });
            await newMessage.save();

            // Upsert session
            await ChatSession.findOneAndUpdate(
                { phone },
                {
                    phone,
                    name: sender === 'member' ? senderName : undefined,
                    premiumCode: sender === 'member' ? premiumCode : undefined,
                    lastMessage: text,
                    lastMessageAt: new Date(),
                    $inc: { unreadCount: (sender === 'member') ? 1 : 0 }
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            // Broadcast to the room
            io.to(phone).emit('receive_message', newMessage);

            // Notify agents in the system of a new/updated session
            io.emit('session_updated');


        } catch (err) {
            console.error('Socket send_message error:', err);
        }
    });

    // Handle typing indicator
    socket.on('typing', ({ phone, isTyping, role }) => {
        try {
            socket.to(phone).emit('display_typing', { isTyping, role });
        } catch (err) {
            console.error('Socket typing error:', err);
        }
    });

    // Handle user leaving room
    socket.on('leave_room', ({ phone, role }) => {
        try {
            socket.leave(phone);
            if (role === 'agent') {
                if (activeAgents[phone]) {
                    activeAgents[phone]--;
                    if (activeAgents[phone] <= 0) {
                        activeAgents[phone] = 0;
                        io.to(phone).emit('agent_status', { agentOnline: false });
                    }
                }
            }
            console.log(`User left room: ${phone}`);
        } catch (err) {
            console.error('Socket leave_room error:', err);
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

