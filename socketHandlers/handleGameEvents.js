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

// Game event handling with optimizations and rate limiting
function handleGameEvents(socket, io, handleWithRateLimit) {
  // Error handling wrapper
  const safeEmit = (roomId, event, data) => {
    try {
      io.to(roomId).emit(event, data);
    } catch (error) {
      console.error(`Error emitting ${event} to room ${roomId}:`, error);
    }
  };

  // Apply rate limiting if handler is provided, otherwise use standard handlers
  if (handleWithRateLimit) {
    // Player joins a game with username - with rate limiting
    handleWithRateLimit('game:join', async ({ roomId, username }) => {
      if (!roomId) {
        socket.emit('game:error', "Room ID is required");
        return;
      }
      
      try {
        const playerCount = addPlayerToGame(roomId, socket.id, username);
        
        // Send updated player list to all in room
        const gameState = getGameState(roomId);
        safeEmit(roomId, 'game:state', gameState);
        
        // Send role to the player if game is in progress
        if (gameState.gameStarted) {
          const role = getPlayerRole(roomId, socket.id);
          if (role) {
            socket.emit('game:role', { role });
          }
        }
      } catch (error) {
        console.error(`Error in game:join for room ${roomId}:`, error);
        socket.emit('game:error', "Failed to join game");
      }
    });
    
    // Player ready - with rate limiting
    handleWithRateLimit('game:ready', async ({ roomId }) => {
      if (!roomId) {
        socket.emit('game:error', "Room ID is required");
        return;
      }
      
      try {
        const allReady = markPlayerReady(roomId, socket.id);
        
        // Send updated player list
        safeEmit(roomId, 'game:state', getGameState(roomId));
        
        // Start game if all players are ready
        if (allReady) {
          startGame(roomId);
          
          // Start round and send roles
          const roundInfo = startRound(roomId);
          safeEmit(roomId, 'game:started', {
            round: roundInfo.round,
            maxRounds: roundInfo.maxRounds
          });
          
          // Send private role info to each player
          Object.entries(roundInfo.playerRoles).forEach(([playerId, role]) => {
            io.to(playerId).emit('game:role', { role });
          });
        }
      } catch (error) {
        console.error(`Error in game:ready for room ${roomId}:`, error);
        socket.emit('game:error', "Failed to mark as ready");
      }
    });
    
    // Police makes a guess - with rate limiting
    handleWithRateLimit('game:guess', async ({ roomId, suspectId }) => {
      if (!roomId || !suspectId) {
        socket.emit('game:error', "Room ID and suspect ID are required");
        return;
      }
      
      try {
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
        safeEmit(roomId, 'game:guess-result', {
          policeId: result.policeId,
          suspectId: result.suspectId,
          thiefId: result.thiefId,
          isCorrect: result.isCorrect,
          scores: result.scores
        });
        
        // Wait 5 seconds before prompting for next round
        setTimeout(() => {
          safeEmit(roomId, 'game:round-end');
        }, 5000);
      } catch (error) {
        console.error(`Error in game:guess for room ${roomId}:`, error);
        socket.emit('game:error', "Failed to process guess");
      }
    });
    
    // Start next round - with rate limiting
    handleWithRateLimit('game:next-round', async ({ roomId }) => {
      if (!roomId) {
        socket.emit('game:error', "Room ID is required");
        return;
      }
      
      try {
        const result = nextRound(roomId);
        
        if (!result) {
          socket.emit('game:error', { message: 'Failed to start next round' });
          return;
        }
        
        if (result.gameOver) {
          // Game ended, broadcast results
          safeEmit(roomId, 'game:ended', {
            winners: result.winners,
            scores: result.scores,
            players: result.players
          });
        } else {
          // Start new round
          const roundInfo = startRound(roomId);
          safeEmit(roomId, 'game:new-round', {
            round: roundInfo.round,
            maxRounds: roundInfo.maxRounds
          });
          
          // Send private role info to each player
          Object.entries(roundInfo.playerRoles).forEach(([playerId, role]) => {
            io.to(playerId).emit('game:role', { role });
          });
          
          // Update game state for all
          safeEmit(roomId, 'game:state', getGameState(roomId));
        }
      } catch (error) {
        console.error(`Error in game:next-round for room ${roomId}:`, error);
        socket.emit('game:error', "Failed to start next round");
      }
    });
    
    // Send emoji reaction - with rate limiting and validation
    handleWithRateLimit('game:emoji', async ({ roomId, emoji }) => {
      if (!roomId || !emoji) {
        return; // Silently fail invalid emoji requests
      }
      
      try {
        // Sanitize emoji - allow only single emoji characters
        const emojiRegex = /(\p{Emoji}|\p{Emoji_Presentation}|\p{Emoji_Modifier}|\p{Emoji_Component})/u;
        if (!emojiRegex.test(emoji) || emoji.length > 4) {
          return; // Invalid emoji
        }
        
        socket.to(roomId).emit('game:emoji', { 
          senderId: socket.id, 
          emoji 
        });
      } catch (error) {
        console.error(`Error in game:emoji for room ${roomId}:`, error);
      }
    });
    
    // Send chat message - with rate limiting and validation
    handleWithRateLimit('game:chat', async ({ roomId, message }) => {
      if (!roomId || !message || typeof message !== 'string' || message.length > 200) {
        return; // Invalid message
      }
      
      try {
        const gameState = getGameState(roomId);
        const player = gameState?.players.find(p => p.socketId === socket.id);
        
        if (player) {
          // Sanitize message
          const sanitizedMsg = message.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;');
          
          safeEmit(roomId, 'game:chat', {
            senderId: socket.id,
            username: player.username,
            message: sanitizedMsg
          });
        }
      } catch (error) {
        console.error(`Error in game:chat for room ${roomId}:`, error);
      }
    });
  } else {
    // Standard event handlers without rate limiting
    
    // Player joins a game with username
    socket.on('game:join', ({ roomId, username }) => {
      if (!roomId) return;
      
      try {
        const playerCount = addPlayerToGame(roomId, socket.id, username);
        
        // Send updated player list to all in room
        const gameState = getGameState(roomId);
        safeEmit(roomId, 'game:state', gameState);
        
        // Send role to the player if game is in progress
        if (gameState.gameStarted) {
          const role = getPlayerRole(roomId, socket.id);
          if (role) {
            socket.emit('game:role', { role });
          }
        }
      } catch (error) {
        console.error(`Error in game:join for room ${roomId}:`, error);
        socket.emit('game:error', "Failed to join game");
      }
    });
    
    // Player ready
    socket.on('game:ready', ({ roomId }) => {
      if (!roomId) return;
      
      try {
        const allReady = markPlayerReady(roomId, socket.id);
        
        // Send updated player list
        safeEmit(roomId, 'game:state', getGameState(roomId));
        
        // Start game if all players are ready
        if (allReady) {
          startGame(roomId);
          
          // Start round and send roles
          const roundInfo = startRound(roomId);
          safeEmit(roomId, 'game:started', {
            round: roundInfo.round,
            maxRounds: roundInfo.maxRounds
          });
          
          // Send private role info to each player
          Object.entries(roundInfo.playerRoles).forEach(([playerId, role]) => {
            io.to(playerId).emit('game:role', { role });
          });
        }
      } catch (error) {
        console.error(`Error in game:ready for room ${roomId}:`, error);
        socket.emit('game:error', "Failed to mark as ready");
      }
    });
    
    // Police makes a guess
    socket.on('game:guess', ({ roomId, suspectId }) => {
      if (!roomId || !suspectId) return;
      
      try {
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
        safeEmit(roomId, 'game:guess-result', {
          policeId: result.policeId,
          suspectId: result.suspectId,
          thiefId: result.thiefId,
          isCorrect: result.isCorrect,
          scores: result.scores
        });
        
        // Wait 5 seconds before prompting for next round
        setTimeout(() => {
          safeEmit(roomId, 'game:round-end');
        }, 5000);
      } catch (error) {
        console.error(`Error in game:guess for room ${roomId}:`, error);
        socket.emit('game:error', "Failed to process guess");
      }
    });
    
    // Start next round
    socket.on('game:next-round', ({ roomId }) => {
      if (!roomId) return;
      
      try {
        const result = nextRound(roomId);
        
        if (!result) {
          socket.emit('game:error', { message: 'Failed to start next round' });
          return;
        }
        
        if (result.gameOver) {
          // Game ended, broadcast results
          safeEmit(roomId, 'game:ended', {
            winners: result.winners,
            scores: result.scores,
            players: result.players
          });
        } else {
          // Start new round
          const roundInfo = startRound(roomId);
          safeEmit(roomId, 'game:new-round', {
            round: roundInfo.round,
            maxRounds: roundInfo.maxRounds
          });
          
          // Send private role info to each player
          Object.entries(roundInfo.playerRoles).forEach(([playerId, role]) => {
            io.to(playerId).emit('game:role', { role });
          });
          
          // Update game state for all
          safeEmit(roomId, 'game:state', getGameState(roomId));
        }
      } catch (error) {
        console.error(`Error in game:next-round for room ${roomId}:`, error);
        socket.emit('game:error', "Failed to start next round");
      }
    });
    
    // Send emoji reaction
    socket.on('game:emoji', ({ roomId, emoji }) => {
      if (!roomId || !emoji) return;
      
      try {
        // Sanitize emoji - allow only single emoji characters
        const emojiRegex = /(\p{Emoji}|\p{Emoji_Presentation}|\p{Emoji_Modifier}|\p{Emoji_Component})/u;
        if (!emojiRegex.test(emoji) || emoji.length > 4) {
          return; // Invalid emoji
        }
        
        socket.to(roomId).emit('game:emoji', { 
          senderId: socket.id, 
          emoji 
        });
      } catch (error) {
        console.error(`Error in game:emoji for room ${roomId}:`, error);
      }
    });
    
    // Send chat message
    socket.on('game:chat', ({ roomId, message }) => {
      if (!roomId || !message || typeof message !== 'string' || message.length > 200) {
        return; // Invalid message
      }
      
      try {
        const gameState = getGameState(roomId);
        const player = gameState?.players.find(p => p.socketId === socket.id);
        
        if (player) {
          // Sanitize message
          const sanitizedMsg = message.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;');
          
          safeEmit(roomId, 'game:chat', {
            senderId: socket.id,
            username: player.username,
            message: sanitizedMsg
          });
        }
      } catch (error) {
        console.error(`Error in game:chat for room ${roomId}:`, error);
      }
    });
  }

  // Handle player disconnecting
  socket.on('leave room', (roomId) => {
    if (!roomId) return;
    
    try {
      const remainingPlayers = removePlayerFromGame(roomId, socket.id);
      
      // Update game state for remaining players
      safeEmit(roomId, 'game:state', getGameState(roomId));
    } catch (error) {
      console.error(`Error in leave room for room ${roomId}:`, error);
    }
  });
  
  socket.on('disconnecting', () => {
    try {
      const rooms = [...socket.rooms].filter(room => room !== socket.id);
      
      rooms.forEach(roomId => {
        const remainingPlayers = removePlayerFromGame(roomId, socket.id);
        
        // Update game state for remaining players
        safeEmit(roomId, 'game:state', getGameState(roomId));
      });
    } catch (error) {
      console.error('Error in disconnecting event:', error);
    }
  });
}

module.exports = handleGameEvents;