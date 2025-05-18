const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const os = require('os');

// Socket.io rate limiter for message throttling
const { RateLimiterMemory } = require('rate-limiter-flexible');

const createRoom = require('./socketHandlers/createRoom');
const joinRoom = require('./socketHandlers/joinRoom');
const handleSignalingEvents = require('./socketHandlers/handleSignalingEvents');
const handleGameEvents = require('./socketHandlers/handleGameEvents');

// Initialize server metrics
const metrics = {
  connections: 0,
  messageCount: 0,
  activeRooms: 0,
  errors: 0,
  rateLimit: {
    hits: 0,
    blocks: 0
  },
  startTime: Date.now()
};

const app = express();
app.use(cors());

const server = http.createServer(app);

// Configure Socket.io with optimizations
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? [/\.render\.com$/, /localhost/] : '*',
    methods: ['GET', 'POST']
  },
  // Enable WebSocket compression
  perMessageDeflate: {
    threshold: 1024, // Only compress messages larger than 1KB
    zlibDeflateOptions: {
      level: 6, // Compression level (1-9, where 9 is highest but slowest)
    }
  },
  // Ping timeout and interval for faster disconnection detection
  pingTimeout: 10000,
  pingInterval: 15000,
  // Reduce connection timeout to save resources
  connectTimeout: 15000,
  // Limit max http buffer size to prevent memory issues
  maxHttpBufferSize: 1e6, // 1MB
  // Transport options with WebSocket preference
  transports: ['websocket', 'polling'],
  // Disable JSONP for security
  allowEIO3: false
});

// Store active rooms with metadata
const activeRooms = new Map();

// Configure rate limiters
const socketLimiter = new RateLimiterMemory({
  points: 40,     // Number of requests allowed
  duration: 2,    // Per 2 seconds
});

const signalLimiter = new RateLimiterMemory({
  points: 100,    // Allow more points for signaling
  duration: 10,   // Per 10 seconds
});

// Room cleanup interval (every 30 minutes)
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Set up room cleanup interval
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  let expiredRooms = 0;
  
  for (const [roomId, roomData] of activeRooms.entries()) {
    if (now - roomData.createdAt > ROOM_TTL_MS) {
      // Check if room is empty
      const room = io.sockets.adapter.rooms.get(roomId);
      if (!room || room.size === 0) {
        activeRooms.delete(roomId);
        expiredRooms++;
      }
    }
  }
  
  // Update metrics
  metrics.activeRooms = activeRooms.size;
  console.log(`Cleaned up ${expiredRooms} expired rooms. Active rooms: ${activeRooms.size}`);
}, CLEANUP_INTERVAL_MS);

// Middleware for connection metrics, logging, and rate limiting
io.use((socket, next) => {
  // Track metrics
  metrics.connections++;
  metrics.activeConnections = io.engine.clientsCount;
  
  // Add connection timestamp for tracking
  socket.connectionTime = Date.now();
  socket.messageCount = 0;
  socket.rooms = new Set([socket.id]);
  
  // Set up logging for important events (reduced verbosity)
  const originalEmit = socket.emit;
  socket.emit = function(event, ...args) {
    if (['error', 'room-error', 'room-joined', 'room-created', 'game:error', 'user-disconnected'].includes(event)) {
      console.log(`[EMIT to ${socket.id}] ${event}`);
    }
    metrics.messageCount++;
    return originalEmit.apply(socket, [event, ...args]);
  };
  
  // Apply rate limiting to all incoming connections
  socketLimiter.consume(socket.handshake.address)
    .then(() => {
      next();
    })
    .catch(() => {
      metrics.rateLimit.blocks++;
      console.warn(`Rate limit exceeded for ${socket.handshake.address}`);
      next(new Error('Rate limit exceeded'));
    });
});

// API endpoint for server status
app.get('/status', (req, res) => {
  const uptime = Math.floor((Date.now() - metrics.startTime) / 1000);
  
  res.json({
    status: 'ok',
    uptime,
    metrics: {
      connections: metrics.connections,
      activeConnections: io.engine.clientsCount,
      activeRooms: activeRooms.size,
      messages: metrics.messageCount,
      errors: metrics.errors,
      rateLimit: metrics.rateLimit,
      memory: {
        free: os.freemem(),
        total: os.totalmem(),
        usage: 1 - (os.freemem() / os.totalmem())
      }
    }
  });
});

io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);
    
    // Error handling for socket events
    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
      metrics.errors++;
      
      // Attempt to recover by rejoining rooms
      socket.rooms.forEach(roomId => {
        if (roomId !== socket.id) {
          socket.join(roomId).catch(e => {
            console.error(`Failed to rejoin room ${roomId}:`, e);
          });
        }
      });
    });
    
    // Create a wrapper for all socket handlers with rate limiting and error handling
    const handleWithRateLimit = (event, handler, limiter = socketLimiter) => {
      socket.on(event, async (...args) => {
        const callback = args.length > 0 && typeof args[args.length - 1] === 'function' 
          ? args.pop() 
          : null;
          
        try {
          // Apply rate limiting
          await limiter.consume(socket.handshake.address);
          
          // Call the original handler
          socket.messageCount++;
          await handler(...args);
          
        } catch (error) {
          metrics.errors++;
          
          if (error.name === 'RateLimiterError') {
            console.warn(`Rate limit exceeded for ${socket.id} on event ${event}`);
            metrics.rateLimit.hits++;
            if (callback) callback({ error: 'Too many requests' });
          } else {
            console.error(`Error handling ${event} for ${socket.id}:`, error);
            if (callback) callback({ error: 'Server error' });
          }
        }
      });
    };
    
    // Create room handler - add to our active rooms
    handleWithRateLimit("create-room", async () => {
      // Check if we're at capacity for rooms
      if (activeRooms.size >= 1000) {
        socket.emit("room-error", "Server is at capacity. Please try again later.");
        return;
      }
      
      const roomId = Math.random().toString(36).substring(2, 8);
      await socket.join(roomId);
      socket.rooms.add(roomId);
      
      // Store room with metadata
      activeRooms.set(roomId, {
        createdAt: Date.now(),
        creator: socket.id,
        lastActivity: Date.now(),
        playerCount: 1,
        gameInProgress: false
      });
      
      // Update metrics
      metrics.activeRooms = activeRooms.size;
      
      // Emit room-created to the creator
      socket.emit("room-created", roomId);
      
      // Get number of clients in the room
      const count = io.sockets.adapter.rooms.get(roomId)?.size || 1;
      
      // Emit to all in the room
      io.to(roomId).emit("player-count", count);
      
      console.log(`Room created: ${roomId} by ${socket.id}`);
    });

    // Join room handler
    handleWithRateLimit("join room", async (roomId) => {
      if (!roomId || typeof roomId !== 'string') {
        socket.emit("room-error", "Invalid room ID");
        return;
      }
      
      console.log(`User ${socket.id} trying to join room ${roomId}`);
      
      // Check if room exists in our active rooms OR in socket.io's rooms
      const roomExists = activeRooms.has(roomId) || io.sockets.adapter.rooms.has(roomId);
      
      // Special case: if this is the creator who just created the room
      const alreadyInRoom = socket.rooms.has(roomId);
      
      if (roomExists || alreadyInRoom) {
        // If not already in the room, join it
        if (!alreadyInRoom) {
          try {
            await socket.join(roomId);
            socket.rooms.add(roomId);
          } catch (error) {
            console.error(`Error joining room ${roomId}:`, error);
            socket.emit("room-error", "Failed to join room");
            return;
          }
        }
        
        // Update room activity timestamp
        if (activeRooms.has(roomId)) {
          const roomData = activeRooms.get(roomId);
          roomData.lastActivity = Date.now();
          
          // Get the updated room
          const room = io.sockets.adapter.rooms.get(roomId);
          roomData.playerCount = room?.size || 1;
        }
        
        socket.emit("room-joined", roomId);
        console.log(`User ${socket.id} joined room ${roomId}`);

        // Get the updated room
        const room = io.sockets.adapter.rooms.get(roomId);
        const count = room?.size || 1;
        
        // Send player count to everyone
        io.to(roomId).emit("player-count", count);
        
        // Send list of other users in the room to the new user
        const otherUsers = [...room].filter(id => id !== socket.id);
        socket.emit("all users", otherUsers);
        
        // Notify other users in the room that a new user has joined
        socket.to(roomId).emit("user-joined", socket.id);
      } else {
        console.log(`Room ${roomId} not found for user ${socket.id}`);
        socket.emit("room-error", "Room not found or has expired");
      }
    });
    
    // Handle RTC signaling with higher rate limits
    handleWithRateLimit("offer", async ({ target, sdp, callerId }) => {
      io.to(target).emit("offer", { sdp, callerId });
    }, signalLimiter);
    
    handleWithRateLimit("answer", async ({ target, sdp }) => {
      io.to(target).emit("answer", { sdp, callerId: socket.id });
    }, signalLimiter);
    
    handleWithRateLimit("ice-candidate", async ({ target, candidate }) => {
      io.to(target).emit("ice-candidate", { target: socket.id, candidate });
    }, signalLimiter);
    
    handleWithRateLimit("room:get-users", async (roomId) => {
      const room = io.sockets.adapter.rooms.get(roomId);
      if (room) {
        const otherUsers = [...room].filter(id => id !== socket.id);
        socket.emit("all users", otherUsers);
      }
    });
    
    // Handle game logic
    handleGameEvents(socket, io, handleWithRateLimit);
    
    // Handle disconnections
    socket.on("disconnecting", () => {
      const rooms = [...socket.rooms].filter(room => room !== socket.id);
      rooms.forEach(roomId => {
        socket.to(roomId).emit("user-disconnected", socket.id);
        const room = io.sockets.adapter.rooms.get(roomId);
        const size = room ? room.size - 1 : 0;
        socket.to(roomId).emit("player-count", size);
        
        // Update room metadata
        if (activeRooms.has(roomId)) {
          const roomData = activeRooms.get(roomId);
          roomData.playerCount = Math.max(0, roomData.playerCount - 1);
          roomData.lastActivity = Date.now();
          
          // If this was the last player, mark the room for cleanup
          if (size === 0) {
            roomData.empty = true;
            roomData.emptyTime = Date.now();
          }
        }
      });
    });
    
    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.id}`);
      metrics.activeConnections = io.engine.clientsCount;
    });
    
    // Handle explicit room leaving
    handleWithRateLimit("leave room", async (roomId) => {
      if (!roomId) return;
      
      // Remove from internal tracking
      socket.rooms.delete(roomId);
      
      try {
        await socket.leave(roomId);
        socket.to(roomId).emit("user-disconnected", socket.id);
        
        // Update room state
        const room = io.sockets.adapter.rooms.get(roomId);
        const size = room ? room.size : 0;
        socket.to(roomId).emit("player-count", size);
        
        // Update room metadata
        if (activeRooms.has(roomId)) {
          const roomData = activeRooms.get(roomId);
          roomData.playerCount = size;
          roomData.lastActivity = Date.now();
          
          // If this was the last player, mark the room for cleanup
          if (size === 0) {
            roomData.empty = true;
            roomData.emptyTime = Date.now();
          }
        }
      } catch (error) {
        console.error(`Error leaving room ${roomId}:`, error);
      }
    });
});
  
const PORT = process.env.PORT || 3001;

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  clearInterval(cleanupInterval);
  io.close(() => {
    console.log('Socket.io server closed');
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  clearInterval(cleanupInterval);
  io.close(() => {
    console.log('Socket.io server closed');
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Memory: ${Math.round(os.totalmem() / (1024 * 1024))}MB total, ${Math.round(os.freemem() / (1024 * 1024))}MB free`);
});