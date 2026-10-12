const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

io.on('connection', (socket) => {
    console.log('Foydalanuvchi ulandi:', socket.id);

    // Xonaga qo'shilish
    socket.on('join-room', (username, roomName) => {
        socket.username = username;
        socket.roomName = roomName;
        socket.join(roomName);
        console.log(`${username} (${roomName}) xonasiga kirdi`);

        // Xonadagi boshqa foydalanuvchilarning ro'yxatini olamiz
        const clientsInRoom = io.sockets.adapter.rooms.get(roomName);
        const users = [];
        if (clientsInRoom) {
            clientsInRoom.forEach((clientId) => {
                if (clientId !== socket.id) {
                    const clientSocket = io.sockets.sockets.get(clientId);
                    users.push({ id: clientId, username: clientSocket ? clientSocket.username : "Ishtirokchi" });
                }
            });
        }

        // Yangi kelganga xonadagi mavjud odamlarni yuboramiz
        socket.emit('all-users', users);

        // Boshqalarga yangi odam kelganini aytamiz
        socket.to(roomName).emit('user-joined', { id: socket.id, username });
    });

    // WebRTC Signalling
    socket.on('offer', (data) => {
        io.to(data.target).emit('offer', { offer: data.offer, sender: socket.id, username: socket.username });
    });

    socket.on('answer', (data) => {
        io.to(data.target).emit('answer', { answer: data.answer, sender: socket.id });
    });

    socket.on('ice-candidate', (data) => {
        io.to(data.target).emit('ice-candidate', { candidate: data.candidate, sender: socket.id });
    });

    // Chat xabari
    socket.on('chat-message', (data) => {
        io.to(data.room).emit('chat-message', data);
    });

    // Uzilish
    socket.on('disconnect', () => {
        console.log('Foydalanuvchi chiqib ketdi:', socket.id);
        io.emit('user-disconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server ishga tushdi: http://localhost:${PORT}`);
});
