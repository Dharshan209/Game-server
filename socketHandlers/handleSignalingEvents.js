function handleSignalingEvents(socket, io) {
  // Get users in a room without joining
  socket.on("room:get-users", (roomId) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    if (room) {
      // Get all users in the room excluding the requestor
      const otherUsers = [...room].filter(id => id !== socket.id);
      // Send list of users to the requestor
      socket.emit("all users", otherUsers);
      
      // Also tell all other users about this user to ensure bidirectional connections
      otherUsers.forEach(userId => {
        // Emit an event to each user to connect to the current user
        io.to(userId).emit("initiate-connection", socket.id);
      });
    }
  });

  socket.on("offer", ({ target, sdp, callerId }) => {
    // Forward the offer to the target user
    io.to(target).emit("offer", { sdp, callerId });
    console.log(`Forwarded offer from ${callerId} to ${target}`);
  });

  socket.on("answer", ({ target, sdp }) => {
    // Forward the answer to the target user
    io.to(target).emit("answer", { sdp, callerId: socket.id });
    console.log(`Forwarded answer from ${socket.id} to ${target}`);
  });

  socket.on("ice-candidate", ({ target, candidate }) => {
    // Forward ICE candidate to the target user
    io.to(target).emit("ice-candidate", { target: socket.id, candidate });
    console.log(`Forwarded ICE candidate from ${socket.id} to ${target}`);
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
