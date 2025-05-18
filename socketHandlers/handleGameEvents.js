const { 
  addPlayerToGame, 
  removePlayerFromGame, 
  markPlayerReady, 
  startGame, 
  startRound, 
  makeGuess, 
  nextRound, 
  endGame,
  getGameState,
  getPlayerRole
} = require('./gameLogic');

function handleGameEvents(socket, io) {
  // Player joins a game with username
  socket.on('game:join', ({ roomId, username }) => {
    const playerCount = addPlayerToGame(roomId, socket.id, username);
    
    // Send updated player list to all in room
    const gameState = getGameState(roomId);
    io.to(roomId).emit('game:state', gameState);
    
    // Send role to the player if game is in progress
    if (gameState.gameStarted) {
      const role = getPlayerRole(roomId, socket.id);
      if (role) {
        socket.emit('game:role', { role });
      }
    }
  });
  
  // Player ready
  socket.on('game:ready', ({ roomId }) => {
    const allReady = markPlayerReady(roomId, socket.id);
    
    // Send updated player list
    io.to(roomId).emit('game:state', getGameState(roomId));
    
    // Start game if all players are ready
    if (allReady) {
      startGame(roomId);
      
      // Start round and send roles
      const roundInfo = startRound(roomId);
      io.to(roomId).emit('game:started', {
        round: roundInfo.round,
        maxRounds: roundInfo.maxRounds
      });
      
      // Send private role info to each player
      Object.entries(roundInfo.playerRoles).forEach(([playerId, role]) => {
        io.to(playerId).emit('game:role', { role });
      });
    }
  });
  
  // Police makes a guess
  socket.on('game:guess', ({ roomId, suspectId }) => {
    const result = makeGuess(roomId, socket.id, suspectId);
    
    if (!result) {
      socket.emit('game:error', { message: 'Invalid guess attempt' });
      return;
    }
    
    if (!result.success) {
      socket.emit('game:error', { message: result.message });
      return;
    }
    
    // Broadcast guess result to all players
    io.to(roomId).emit('game:guess-result', {
      policeId: result.policeId,
      suspectId: result.suspectId,
      thiefId: result.thiefId,
      isCorrect: result.isCorrect,
      scores: result.scores
    });
    
    // Wait 5 seconds before prompting for next round
    setTimeout(() => {
      io.to(roomId).emit('game:round-end');
    }, 5000);
  });
  
  // Start next round
  socket.on('game:next-round', ({ roomId }) => {
    const result = nextRound(roomId);
    
    if (!result) {
      socket.emit('game:error', { message: 'Failed to start next round' });
      return;
    }
    
    if (result.gameOver) {
      // Game ended, broadcast results
      io.to(roomId).emit('game:ended', {
        winners: result.winners,
        scores: result.scores,
        players: result.players
      });
    } else {
      // Start new round
      const roundInfo = startRound(roomId);
      io.to(roomId).emit('game:new-round', {
        round: roundInfo.round,
        maxRounds: roundInfo.maxRounds
      });
      
      // Send private role info to each player
      Object.entries(roundInfo.playerRoles).forEach(([playerId, role]) => {
        io.to(playerId).emit('game:role', { role });
      });
      
      // Update game state for all
      io.to(roomId).emit('game:state', getGameState(roomId));
    }
  });
  
  // Handle player disconnecting
  socket.on('leave room', (roomId) => {
    const remainingPlayers = removePlayerFromGame(roomId, socket.id);
    
    // Update game state for remaining players
    io.to(roomId).emit('game:state', getGameState(roomId));
  });
  
  socket.on('disconnecting', () => {
    const rooms = [...socket.rooms].filter(room => room !== socket.id);
    
    rooms.forEach(roomId => {
      const remainingPlayers = removePlayerFromGame(roomId, socket.id);
      
      // Update game state for remaining players
      io.to(roomId).emit('game:state', getGameState(roomId));
    });
  });
  
  // Send emoji reaction
  socket.on('game:emoji', ({ roomId, emoji }) => {
    socket.to(roomId).emit('game:emoji', { 
      senderId: socket.id, 
      emoji 
    });
  });
  
  // Send chat message
  socket.on('game:chat', ({ roomId, message }) => {
    const gameState = getGameState(roomId);
    const player = gameState?.players.find(p => p.socketId === socket.id);
    
    if (player) {
      io.to(roomId).emit('game:chat', {
        senderId: socket.id,
        username: player.username,
        message
      });
    }
  });
}

module.exports = handleGameEvents;