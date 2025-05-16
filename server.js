const express = require('express');
const http = require('http');
const cors = require('cors');
const{Server} = require('socket.io');

const createRoom = require('./socketHandlers/createRoom');
const joinRoom = require('./socketHandlers/joinRoom');
const handleSignalingEvents = require('./socketHandlers/handleSignalingEvents');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server,{
    cors:{
       origin:'*',
       methods: ['GET', 'POST']
    }
});

io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);
    createRoom(io,socket);
    joinRoom(io,socket); 
    handleSignalingEvents(socket, io);  
});
  
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

