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

// username -> socket.id  (only online users)
const onlineUsers = new Map();

function broadcastOnlineUsers() {
    io.emit('online-users', Array.from(onlineUsers.keys()));
}

io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    // ── Registration ──────────────────────────────────────────────
    socket.on('register', (username) => {
        if (!username || typeof username !== 'string') {
            return socket.emit('register-error', 'Invalid username.');
        }
        const trimmed = username.trim().toLowerCase();
        if (onlineUsers.has(trimmed)) {
            return socket.emit('register-error', 'Username already taken. Choose another.');
        }
        onlineUsers.set(trimmed, socket.id);
        socket.data.username = trimmed;
        socket.emit('register-success', trimmed);
        broadcastOnlineUsers();
        console.log(`Registered: ${trimmed}`);
    });

    // ── Direct calling (by username) ──────────────────────────────
    socket.on('call-user', ({ targetUsername, sdp }) => {
        const callerUsername = socket.data.username;
        const targetSocketId = onlineUsers.get(targetUsername?.trim().toLowerCase());
        if (!targetSocketId) {
            return socket.emit('call-error', `User "${targetUsername}" is not online.`);
        }
        // Forward the incoming call notification to the target
        io.to(targetSocketId).emit('incoming-call', {
            from: callerUsername,
            sdp
        });
    });

    socket.on('call-accepted', ({ targetUsername, sdp }) => {
        const targetSocketId = onlineUsers.get(targetUsername?.trim().toLowerCase());
        if (targetSocketId) {
            io.to(targetSocketId).emit('call-answered', {
                from: socket.data.username,
                sdp
            });
        }
    });

    socket.on('call-declined', ({ targetUsername }) => {
        const targetSocketId = onlineUsers.get(targetUsername?.trim().toLowerCase());
        if (targetSocketId) {
            io.to(targetSocketId).emit('call-declined', { from: socket.data.username });
        }
    });

    socket.on('end-call', ({ targetUsername }) => {
        const targetSocketId = onlineUsers.get(targetUsername?.trim().toLowerCase());
        if (targetSocketId) {
            io.to(targetSocketId).emit('call-ended', { from: socket.data.username });
        }
    });

    // ── ICE candidates (addressed by username) ────────────────────
    socket.on('ice-candidate', ({ targetUsername, candidate }) => {
        const targetSocketId = onlineUsers.get(targetUsername?.trim().toLowerCase());
        if (targetSocketId) {
            io.to(targetSocketId).emit('ice-candidate', {
                from: socket.data.username,
                candidate
            });
        }
    });

    // ── Disconnect ────────────────────────────────────────────────
    socket.on('disconnect', () => {
        const username = socket.data.username;
        if (username) {
            onlineUsers.delete(username);
            broadcastOnlineUsers();
            console.log(`Disconnected: ${username}`);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
