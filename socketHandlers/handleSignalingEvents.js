// Enhanced WebRTC signaling with performance optimizations
function handleSignalingEvents(socket, io) {
  // Connection quality tracking
  const connectionStates = new Map();
  
  // Get users in a room without joining
  socket.on("room:get-users", (roomId) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    if (room) {
      const otherUsers = [...room].filter(id => id !== socket.id);
      socket.emit("all users", otherUsers);
    }
  });

  // Enhanced offer handling with bandwidth constraints
  socket.on("offer", ({ target, sdp, callerId, constraints = {} }) => {
    // Add bandwidth and quality constraints if not present
    let enhancedSdp = sdp;
    
    // Modify SDP to limit bandwidth if needed
    if (!enhancedSdp.includes('b=AS:')) {
      // Set default bandwidth limit (adjust based on your needs)
      // For low latency games, often 300-500kbps is sufficient for video
      const maxBandwidth = constraints.maxBandwidth || 500; // kbps
      enhancedSdp = enhancedSdp.replace(/(m=video.*\r\n)/g, 
        `$1b=AS:${maxBandwidth}\r\n`);
    }
    
    io.to(target).emit("offer", { 
      sdp: enhancedSdp, 
      callerId,
      constraints
    });
  });

  socket.on("answer", ({ target, sdp }) => {
    io.to(target).emit("answer", { sdp, callerId: socket.id });
  });

  // Enhanced ICE candidate handling with priority
  socket.on("ice-candidate", ({ target, candidate }) => {
    io.to(target).emit("ice-candidate", { target: socket.id, candidate });
  });

  // Connection quality monitoring
  socket.on("connection:quality", ({ roomId, stats }) => {
    // Store connection stats for this user
    connectionStates.set(socket.id, {
      timestamp: Date.now(),
      ...stats
    });
    
    // Broadcast quality issues to the room if needed
    if (stats.bitrate < 100 || stats.packetsLost > 5) {
      // Only notify of major quality issues
      socket.to(roomId).emit("connection:degraded", { peerId: socket.id });
    }
  });

  // Adaptive stream quality control
  socket.on("stream:adapt", ({ roomId, constraint }) => {
    socket.to(roomId).emit("stream:adapt", {
      peerId: socket.id,
      constraint
    });
  });

  // Connection restart mechanism
  socket.on("connection:restart", ({ target }) => {
    io.to(target).emit("connection:restart-request", { peerId: socket.id });
  });

  socket.on("leave room", (roomId) => {
    socket.leave(roomId);
    socket.to(roomId).emit("user-disconnected", socket.id);
    connectionStates.delete(socket.id);

    const room = io.sockets.adapter.rooms.get(roomId);
    const size = room ? room.size : 0;
    socket.to(roomId).emit("player-count", size);
  });

  socket.on("disconnecting", () => {
    const rooms = [...socket.rooms].filter(r => r !== socket.id);
    rooms.forEach(roomId => {
      socket.to(roomId).emit("user-disconnected", socket.id);
      const room = io.sockets.adapter.rooms.get(roomId);
      const size = room ? room.size - 1 : 0;
      socket.to(roomId).emit("player-count", size);
    });
    connectionStates.delete(socket.id);
  });
}

module.exports = handleSignalingEvents;