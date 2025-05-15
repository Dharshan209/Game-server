function createRoom(io, socket) {
    const generateRoomId = () => Math.random().toString(36).substring(2, 8);
  
    socket.on("create-room", () => {
      const roomId = generateRoomId();
      socket.join(roomId);
  
      // Emit room-created to the creator
      socket.emit("room-created", roomId);
  
      // Get number of clients in the room
      const count = io.sockets.adapter.rooms.get(roomId)?.size || 1;
  
      // Emit to all in the room
      io.to(roomId).emit("player-count", count);
  
      console.log(`Room created: ${roomId}`);
    });
  }
  
  module.exports = createRoom;
  