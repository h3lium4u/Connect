const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Store active users and their rooms
const users = new Map();

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join-room', (roomId, userId) => {
        socket.join(roomId);
        users.set(socket.id, { roomId, userId });
        console.log(`User ${userId} joined room ${roomId}`);

        // Notify others in the room
        socket.to(roomId).emit('user-connected', userId);
    });

    socket.on('send-message', (data) => {
        const { roomId, message, userId, userName } = data;
        io.to(roomId).emit('receive-message', {
            text: message,
            userId,
            userName,
            timestamp: new Date().toISOString()
        });
    });

    // WebRTC Signaling
    socket.on('offer', (data) => {
        socket.to(data.target).emit('offer', {
            sdp: data.sdp,
            sender: socket.id
        });
    });

    socket.on('answer', (data) => {
        socket.to(data.target).emit('answer', {
            sdp: data.sdp,
            sender: socket.id
        });
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.target).emit('ice-candidate', {
            candidate: data.candidate,
            sender: socket.id
        });
    });

    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        if (user) {
            socket.to(user.roomId).emit('user-disconnected', user.userId);
            users.delete(socket.id);
        }
        console.log('User disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
