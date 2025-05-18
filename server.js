const express = require('express');
const http = require('http');
const cors = require('cors');
const{Server} = require('socket.io');

const createRoom = require('./socketHandlers/createRoom');
const joinRoom = require('./socketHandlers/joinRoom');
const handleSignalingEvents = require('./socketHandlers/handleSignalingEvents');
const handleGameEvents = require('./socketHandlers/handleGameEvents');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server,{
    cors:{
       origin:'*',
       methods: ['GET', 'POST']
    }
});

// Store active rooms with timestamps
const activeRooms = new Map();

// Middleware to log all incoming events
io.use((socket, next) => {
  const originalEmit = socket.emit;
  socket.emit = function(event, ...args) {
    console.log(`[EMIT to ${socket.id}] ${event}`);
    return originalEmit.apply(socket, [event, ...args]);
  };
  next();
});

io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);
    
    // Create room handler - add to our active rooms
    socket.on("create-room", () => {
      const roomId = Math.random().toString(36).substring(2, 8);
      socket.join(roomId);
      
      // Store room with timestamp
      activeRooms.set(roomId, {
        createdAt: Date.now(),
        creator: socket.id
      });
      
      // Emit room-created to the creator
      socket.emit("room-created", roomId);
      
      // Get number of clients in the room
      const count = io.sockets.adapter.rooms.get(roomId)?.size || 1;
      
      // Emit to all in the room
      io.to(roomId).emit("player-count", count);
      
      console.log(`Room created: ${roomId} by ${socket.id}`);
    });

    // Join room handler
    socket.on("join room", (roomId) => {
      console.log(`User ${socket.id} trying to join room ${roomId}`);
      
      // Check if room exists in our active rooms OR in socket.io's rooms
      const roomExists = activeRooms.has(roomId) || io.sockets.adapter.rooms.has(roomId);
      
      // Special case: if this is the creator who just created the room
      const currentSocketRooms = Array.from(socket.rooms);
      const alreadyInRoom = currentSocketRooms.includes(roomId);
      
      if (roomExists || alreadyInRoom) {
        // If not already in the room, join it
        if (!alreadyInRoom) {
          socket.join(roomId);
        }
        
        socket.emit("room-joined", roomId);
        console.log(`User ${socket.id} joined room ${roomId}`);

        // Get the updated room
        const room = io.sockets.adapter.rooms.get(roomId);
        const count = room?.size || 1;
        
        // Send player count to everyone
        io.to(roomId).emit("player-count", count);
        
        // Get other users in the room
        const otherUsers = [...room].filter(id => id !== socket.id);
        
        // Send list of other users in the room to the new user
        socket.emit("all users", otherUsers);
        console.log(`Sent user list to ${socket.id}: ${JSON.stringify(otherUsers)}`);
        
        // Notify other users in the room that a new user has joined
        socket.to(roomId).emit("user-joined", socket.id);
        console.log(`Notified room ${roomId} about new user ${socket.id}`);
        
        // Also tell all existing users to initiate connections with the new user
        // This ensures bidirectional connection initialization
        otherUsers.forEach(userId => {
          io.to(userId).emit("initiate-connection", socket.id);
          console.log(`Told ${userId} to initiate connection with ${socket.id}`);
        });
      } else {
        console.log(`Room ${roomId} not found for user ${socket.id}`);
        socket.emit("room-error", "Room not found!");
      }
    });
    
    // Handle RTC signaling
    handleSignalingEvents(socket, io);
    
    // Handle game logic
    handleGameEvents(socket, io);
    
    // Handle disconnections
    socket.on("disconnecting", () => {
      const rooms = [...socket.rooms].filter(room => room !== socket.id);
      rooms.forEach(roomId => {
        socket.to(roomId).emit("user-disconnected", socket.id);
        const room = io.sockets.adapter.rooms.get(roomId);
        const size = room ? room.size - 1 : 0;
        socket.to(roomId).emit("player-count", size);
      });
    });
    
    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.id}`);
    });
});
  
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});