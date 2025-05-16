function handleSignalingEvents(socket, io) {
  socket.on("join room", (roomId) => {
    socket.join(roomId);

    const room = io.sockets.adapter.rooms.get(roomId);
    const otherUsers = [...(room || [])].filter(id => id !== socket.id);

    socket.emit("all users", otherUsers);

    socket.to(roomId).emit("player-count", room.size);
  });

  socket.on("offer", ({ target, sdp, callerId }) => {
    io.to(target).emit("offer", { sdp, callerId });
  });

  socket.on("answer", ({ target, sdp }) => {
    io.to(target).emit("answer", { sdp, callerId: socket.id });
  });

  socket.on("ice-candidate", ({ target, candidate }) => {
    io.to(target).emit("ice-candidate", { target: socket.id, candidate });
  });

  socket.on("leave room", (roomId) => {
    socket.leave(roomId);
    socket.to(roomId).emit("user-disconnected", socket.id);

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
  });
}


module.exports = handleSignalingEvents;
