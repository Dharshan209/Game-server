function createRoom(io,socket){
    const generateRoomId = () => Math.random().toString(36).substring(2, 8);

socket.on("create-room",()=>{
    const roomId = generateRoomId();
    socket.join(roomId);
    socket.emit("room-created", roomId);
    console.log(`Room created: ${roomId}`);
}
)}

module.exports = createRoom;