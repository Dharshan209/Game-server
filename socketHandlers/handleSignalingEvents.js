function handleSignalingEvents(socket, io) {
  socket.on("join room", (roomId) => {
    socket.join(roomId);
    const room = io.sockets.adapter.rooms.get(roomId);
    const otherUsers = [...room || []].filter(id => id !== socket.id);
    socket.emit("all users", otherUsers);
  });

  socket.on("offer", ({ target, sdp, callerId }) => {
    io.to(target).emit("offer", { sdp, callerId });
  });

  socket.on("answer", ({ target, sdp }) => {
    io.to(target).emit("answer", { sdp });
  });

  socket.on("ice-candidate", ({ target, candidate }) => {
    io.to(target).emit("ice-candidate", { candidate });
  });

  socket.on("leave room", (roomId) => {
    socket.leave(roomId);
  });
}

module.exports = handleSignalingEvents;
