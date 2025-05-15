function joinRoom(io, socket) {
  socket.on("join room", (roomId) => {
    const rooms = Array.from(io.sockets.adapter.rooms.keys());

    if (rooms.includes(roomId)) {
      socket.join(roomId);
      socket.emit("room-joined", roomId);
      console.log(`User ${socket.id} joined room ${roomId}`);

      const count = io.sockets.adapter.rooms.get(roomId)?.size || 1;
      io.to(roomId).emit("player-count", count);
    } else {
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
