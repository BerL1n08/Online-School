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
        socket.username = username; // <-- 1. Foydalanuvchi ismini socket ga yozib qo'yamiz
        socket.join(roomName);
        console.log(`${username} ${roomName} xonasiga kirdi`);
        
        // Xonadagi boshqa foydalanuvchilarga yangi kelganini ismi bilan aytish
        socket.to(roomName).emit('user-joined', { id: socket.id, username });
    });

    // WebRTC Signalling (Offer, Answer, ICE Candidates)
    socket.on('offer', (data) => {
        // <-- 2. Offer yuborishda username ni ham qo'shib yuboramiz
        io.to(data.target).emit('offer', { offer: data.offer, sender: socket.id, username: socket.username });
    });

    socket.on('answer', (data) => {
        io.to(data.target).emit('answer', { answer: data.answer, sender: socket.id });
    });

    socket.on('ice-candidate', (data) => {
        io.to(data.target).emit('ice-candidate', { candidate: data.candidate, sender: socket.id });
    });

    // Chat xabarini tarqatish
    socket.on('chat-message', (data) => {
        io.to(data.room).emit('chat-message', data);
    });

    // Uzilish
    socket.on('disconnect', () => {
        console.log('Foydalanuvchi chiqib ketdi:', socket.id);
        io.emit('user-disconnected', socket.id);
    });
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server ishga tushdi: http://localhost:${PORT}`);
});
