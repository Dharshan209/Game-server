function joinRoom(io, socket) {
  socket.on("join room", (roomId) => {
    console.log(`User ${socket.id} trying to join room ${roomId}`);
    
    // Check if room exists by checking if any socket is in this room
    const roomExists = io.sockets.adapter.rooms.has(roomId);
    
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
      
      // Send list of other users in the room to the new user
      const otherUsers = [...room].filter(id => id !== socket.id);
      socket.emit("all users", otherUsers);
      
      // Notify other users in the room that a new user has joined
      socket.to(roomId).emit("user-joined", socket.id);
    } else {
      console.log(`Room ${roomId} not found for user ${socket.id}`);
      socket.emit("room-error", "Room not found!");
    }
  });

  socket.on("leave room", (roomId) => {
    socket.leave(roomId);

    setTimeout(() => {
      const count = io.sockets.adapter.rooms.get(roomId)?.size || 0;
      io.to(roomId).emit("player-count", count);
    }, 100);
  });

  socket.on("disconnecting", () => {
    const rooms = [...socket.rooms].filter((room) => room !== socket.id);
    rooms.forEach((roomId) => {
      setTimeout(() => {
        const count = io.sockets.adapter.rooms.get(roomId)?.size || 0;
        io.to(roomId).emit("player-count", count);
      }, 100);
    });
  });
}

module.exports = joinRoom;
