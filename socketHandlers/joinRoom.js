function joinRoom(io, socket) {
    socket.on("join room", (roomId) => {
      const rooms = Array.from(io.sockets.adapter.rooms.keys());
  
      if (rooms.includes(roomId)) {
        socket.join(roomId);
        socket.emit("room-joined", roomId);
        console.log(`User ${socket.id} joined room ${roomId}`);
      } else {
        socket.emit("room-error", "Room not found!");
      }
    });
  }

  module.exports = joinRoom;
  