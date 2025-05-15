const express = require('express');
const http = require('http');
const cors = require('cors');
const{Server} = require('socket.io');

const createRoom = require('./socketHandlers/createRoom');

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
});
  
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

