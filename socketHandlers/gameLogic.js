const ROLES = ['King', 'Queen', 'Police', 'Thief', 'Minister'];
const MAX_PLAYERS = 5;
const MIN_PLAYERS = 3;
const MAX_ROUNDS = 5;

// Game state for each room
const gameRooms = new Map();

function initGameRoom(roomId) {
  if (!gameRooms.has(roomId)) {
    gameRooms.set(roomId, {
      players: new Map(),
      round: 0,
      maxRounds: MAX_ROUNDS,
      gameStarted: false,
      currentRound: {
        roles: new Map(),
        policeGuess: null,
        thiefCaught: false,
        roundEnded: false
      },
      scores: new Map()
    });
  }
  return gameRooms.get(roomId);
}

function addPlayerToGame(roomId, socketId, username) {
  const gameRoom = initGameRoom(roomId);
  
  if (!gameRoom.players.has(socketId)) {
    gameRoom.players.set(socketId, { 
      socketId, 
      username,
      ready: false
    });
    
    gameRoom.scores.set(socketId, 0);
  }
  
  return gameRoom.players.size;
}

function removePlayerFromGame(roomId, socketId) {
  const gameRoom = gameRooms.get(roomId);
  if (!gameRoom) return 0;
  
  gameRoom.players.delete(socketId);
  gameRoom.scores.delete(socketId);
  
  // End game if too few players remain
  if (gameRoom.gameStarted && gameRoom.players.size < MIN_PLAYERS) {
    endGame(roomId);
  }
  
  return gameRoom.players.size;
}

function markPlayerReady(roomId, socketId) {
  const gameRoom = gameRooms.get(roomId);
  if (!gameRoom || !gameRoom.players.has(socketId)) return false;
  
  const player = gameRoom.players.get(socketId);
  player.ready = true;
  gameRoom.players.set(socketId, player);
  
  // Check if all players are ready
  const allReady = [...gameRoom.players.values()].every(p => p.ready);
  const enoughPlayers = gameRoom.players.size >= MIN_PLAYERS && gameRoom.players.size <= MAX_PLAYERS;
  
  return allReady && enoughPlayers;
}

function startGame(roomId) {
  const gameRoom = gameRooms.get(roomId);
  if (!gameRoom) return false;
  
  gameRoom.gameStarted = true;
  gameRoom.round = 1;
  
  // Start first round
  startRound(roomId);
  
  return true;
}

function startRound(roomId) {
  const gameRoom = gameRooms.get(roomId);
  if (!gameRoom) return false;
  
  // Reset round state
  gameRoom.currentRound = {
    roles: new Map(),
    policeGuess: null,
    thiefCaught: false,
    roundEnded: false
  };
  
  // Assign roles
  assignRoles(roomId);
  
  return {
    round: gameRoom.round,
    maxRounds: gameRoom.maxRounds,
    playerRoles: mapToObject(gameRoom.currentRound.roles)
  };
}

function assignRoles(roomId) {
  const gameRoom = gameRooms.get(roomId);
  if (!gameRoom) return;
  
  const playerIds = [...gameRoom.players.keys()];
  const shuffledRoles = shuffleArray(ROLES.slice(0, playerIds.length));
  
  playerIds.forEach((socketId, index) => {
    gameRoom.currentRound.roles.set(socketId, shuffledRoles[index]);
  });
}

function makeGuess(roomId, policeId, suspectId) {
  const gameRoom = gameRooms.get(roomId);
  if (!gameRoom || !gameRoom.gameStarted || gameRoom.currentRound.roundEnded) {
    return null;
  }
  
  // Verify the guesser is the Police
  if (gameRoom.currentRound.roles.get(policeId) !== 'Police') {
    return { success: false, message: 'Only the Police can make a guess!' };
  }
  
  gameRoom.currentRound.policeGuess = suspectId;
  const thiefId = [...gameRoom.currentRound.roles.entries()]
    .find(([id, role]) => role === 'Thief')?.[0];
  
  const isCorrect = suspectId === thiefId;
  gameRoom.currentRound.thiefCaught = isCorrect;
  
  // Update score
  if (isCorrect) {
    // Police gets a point for correct guess
    const currentScore = gameRoom.scores.get(policeId) || 0;
    gameRoom.scores.set(policeId, currentScore + 1);
  } else {
    // Thief gets a point if not caught
    const currentScore = gameRoom.scores.get(thiefId) || 0;
    gameRoom.scores.set(thiefId, currentScore + 1);
  }
  
  gameRoom.currentRound.roundEnded = true;
  
  return {
    success: true,
    isCorrect,
    thiefId,
    policeId,
    suspectId,
    scores: mapToObject(gameRoom.scores)
  };
}

function nextRound(roomId) {
  const gameRoom = gameRooms.get(roomId);
  if (!gameRoom || !gameRoom.gameStarted) return null;
  
  // Check if game should end
  if (gameRoom.round >= gameRoom.maxRounds) {
    return endGame(roomId);
  }
  
  // Increment round
  gameRoom.round += 1;
  
  // Reset player ready status for next round
  for (const [socketId, player] of gameRoom.players.entries()) {
    player.ready = false;
    gameRoom.players.set(socketId, player);
  }
  
  return {
    nextRound: gameRoom.round,
    maxRounds: gameRoom.maxRounds
  };
}

function endGame(roomId) {
  const gameRoom = gameRooms.get(roomId);
  if (!gameRoom) return null;
  
  // Calculate winner
  const scores = [...gameRoom.scores.entries()];
  scores.sort((a, b) => b[1] - a[1]); // Sort by score descending
  
  const winners = scores.filter(([_, score]) => score === scores[0][1])
    .map(([socketId]) => {
      const player = gameRoom.players.get(socketId);
      return { socketId, username: player.username, score: gameRoom.scores.get(socketId) };
    });
  
  // Reset game state
  gameRoom.gameStarted = false;
  gameRoom.round = 0;
  
  // Clear player ready status
  for (const [socketId, player] of gameRoom.players.entries()) {
    player.ready = false;
    gameRoom.players.set(socketId, player);
  }
  
  return {
    gameOver: true,
    winners,
    scores: mapToObject(gameRoom.scores),
    players: [...gameRoom.players.values()].map(p => ({
      socketId: p.socketId,
      username: p.username
    }))
  };
}

function getGameState(roomId) {
  const gameRoom = gameRooms.get(roomId);
  if (!gameRoom) return null;
  
  return {
    gameStarted: gameRoom.gameStarted,
    round: gameRoom.round,
    maxRounds: gameRoom.maxRounds,
    players: [...gameRoom.players.values()].map(p => ({
      socketId: p.socketId,
      username: p.username,
      ready: p.ready
    })),
    scores: mapToObject(gameRoom.scores)
  };
}

function getPlayerRole(roomId, socketId) {
  const gameRoom = gameRooms.get(roomId);
  if (!gameRoom || !gameRoom.currentRound || !gameRoom.currentRound.roles) {
    return null;
  }
  
  return gameRoom.currentRound.roles.get(socketId);
}

// Utility functions
function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

function mapToObject(map) {
  const obj = {};
  for (const [key, value] of map.entries()) {
    obj[key] = value;
  }
  return obj;
}

module.exports = {
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
};