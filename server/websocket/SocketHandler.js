// ============================================================
// CROWNFALL — SocketHandler.js  (v5: 6 players, color pick, remove, bot difficulty)
//
// v5 changes:
//  - CREATE_ROOM / JOIN_ROOM accept optional preferredColor
//  - ADD_BOT accepts optional difficulty
//  - REMOVE_PLAYER: host kicks any non-host player
//  - CHANGE_COLOR: change a player's color in lobby
//  - SET_BOT_DIFFICULTY: host sets per-bot difficulty
//  - LOBBY_UPDATE now includes hostId + difficulty
//  - Kicked players receive { type: 'KICKED' }
// ============================================================

import {
  createRoom, joinRoom, startRoom,
  getRoom, getRoomForWs, getLocalPlayerIds,
  addLocalPlayer, addBotPlayer,
  removePlayer, changeColor, setBotDifficulty,
  setRoomPublic, listPublicRooms,
  restartRoom, returnRoomToLobby,
  broadcast, sendTo, handleDisconnect, isBot,
} from './RoomManager.js';
import { GameEngine } from '../game/GameEngine.js';
import { runBotTurn, runWorstMoveTurn } from '../game/BotEngine.js';

const connectionMap = new WeakMap();

export function handleConnection(ws) {
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); }
    catch { sendTo(ws, { type: 'ERROR', message: 'Invalid JSON.' }); return; }
    routeMessage(ws, msg);
  });

  ws.on('close', () => {
    const room = getRoomForWs(ws);
    handleDisconnect(ws);
    if (room) broadcast(room, { type: 'PLAYER_DISCONNECTED' });
  });

  ws.on('error', err => console.error('[WS Error]', err.message));
}

function routeMessage(ws, msg) {
  const { type, ...payload } = msg;
  switch (type) {
    case 'CREATE_ROOM':         return handleCreateRoom(ws, payload);
    case 'JOIN_ROOM':           return handleJoinRoom(ws, payload);
    case 'ADD_LOCAL_PLAYER':    return handleAddLocalPlayer(ws, payload);
    case 'ADD_BOT':             return handleAddBot(ws, payload);
    case 'REMOVE_PLAYER':       return handleRemovePlayer(ws, payload);
    case 'CHANGE_COLOR':        return handleChangeColor(ws, payload);
    case 'SET_BOT_DIFFICULTY':  return handleSetBotDifficulty(ws, payload);
    case 'START_GAME':          return handleStartGame(ws, payload);
    case 'ROLL_DICE':           return handleRollDice(ws, payload);
    case 'ASSIGN_DICE':         return handleAssignDice(ws, payload);
    case 'MOVE_PIECE':          return handleMovePiece(ws, payload);
    case 'RETREAT':             return handleRetreat(ws, payload);
    case 'END_MOVE':            return handleEndMove(ws, payload);
    case 'ENSLAVE':             return handleEnslave(ws, payload);
    case 'ESCAPE_PRISONER':     return handleEscape(ws, payload);
    case 'RELEASE_PRISONER':    return handleRelease(ws, payload);
    case 'SKIP_BOT_TURN':       return handleSkipBot(ws);
    case 'UNDO_ASSIGN':         return handleUndoAssign(ws);
    case 'TIMEOUT_SKIP':        return handleTimeoutSkip(ws);
    case 'RESTART_GAME':        return handleRestartGame(ws);
    case 'RETURN_TO_LOBBY':     return handleReturnToLobby(ws);
    case 'SET_PUBLIC':          return handleSetPublic(ws, payload);
    case 'LIST_ROOMS':          return handleListRooms(ws);
    default: sendTo(ws, { type: 'ERROR', message: `Unknown: ${type}` });
  }
}

// ── Room setup ────────────────────────────────────────────────

function handleCreateRoom(ws, { playerName, preferredColor, isPublic, isLocal }) {
  const roomId = createRoom(isPublic ?? false, isLocal ?? false);
  const join   = joinRoom(roomId, playerName, ws, preferredColor ?? null);
  if (!join.ok) { sendTo(ws, { type: 'ERROR', message: join.error }); return; }
  connectionMap.set(ws, { primaryPlayerId: join.playerId, roomId });
  sendTo(ws, { type: 'ROOM_CREATED', roomId, playerId: join.playerId, color: join.color });
  sendLobbyUpdate(ws, roomId);
}

function handleJoinRoom(ws, { roomId, playerName, preferredColor }) {
  const join = joinRoom(roomId, playerName, ws, preferredColor ?? null);
  if (!join.ok) { sendTo(ws, { type: 'ERROR', message: join.error }); return; }
  connectionMap.set(ws, { primaryPlayerId: join.playerId, roomId });
  sendTo(ws, { type: 'ROOM_JOINED', playerId: join.playerId, color: join.color, roomId });
  const room = getRoom(roomId);
  broadcast(room, buildLobbyUpdate(room));
}

function handleAddLocalPlayer(ws, { playerName, preferredColor }) {
  const { roomId } = connectionMap.get(ws) ?? {};
  if (!roomId) { sendTo(ws, { type: 'ERROR', message: 'Not in a room.' }); return; }
  const result = addLocalPlayer(roomId, playerName, ws, preferredColor ?? null);
  if (!result.ok) { sendTo(ws, { type: 'ERROR', message: result.error }); return; }
  sendTo(ws, { type: 'LOCAL_PLAYER_ADDED', playerId: result.playerId, color: result.color });
  const room = getRoom(roomId);
  broadcast(room, buildLobbyUpdate(room));
}

function handleAddBot(ws, { difficulty }) {
  const { roomId } = connectionMap.get(ws) ?? {};
  if (!roomId) { sendTo(ws, { type: 'ERROR', message: 'Not in a room.' }); return; }
  const result = addBotPlayer(roomId, ws, difficulty ?? 'medium');
  if (!result.ok) { sendTo(ws, { type: 'ERROR', message: result.error }); return; }
  sendTo(ws, { type: 'BOT_ADDED', playerId: result.playerId, color: result.color, name: result.name, difficulty: result.difficulty });
  const room = getRoom(roomId);
  broadcast(room, buildLobbyUpdate(room));
}

function handleRemovePlayer(ws, { targetPlayerId }) {
  const { roomId } = connectionMap.get(ws) ?? {};
  if (!roomId) { sendTo(ws, { type: 'ERROR', message: 'Not in a room.' }); return; }
  const result = removePlayer(roomId, targetPlayerId, ws);
  if (!result.ok) { sendTo(ws, { type: 'ERROR', message: result.error }); return; }
  // Notify kicked player's WS if it's a different connection
  const kickedWs = result.removedWs ?? result.removedOwnerWs;
  if (kickedWs && kickedWs !== ws) {
    sendTo(kickedWs, { type: 'KICKED', message: 'You were removed from the room by the host.' });
  }
  const room = getRoom(roomId);
  broadcast(room, buildLobbyUpdate(room));
}

function handleChangeColor(ws, { targetPlayerId, color }) {
  const { roomId } = connectionMap.get(ws) ?? {};
  if (!roomId) { sendTo(ws, { type: 'ERROR', message: 'Not in a room.' }); return; }
  const result = changeColor(roomId, targetPlayerId, color, ws);
  if (!result.ok) { sendTo(ws, { type: 'ERROR', message: result.error }); return; }
  const room = getRoom(roomId);
  broadcast(room, buildLobbyUpdate(room));
}

function handleSetBotDifficulty(ws, { botPlayerId, difficulty }) {
  const { roomId } = connectionMap.get(ws) ?? {};
  if (!roomId) { sendTo(ws, { type: 'ERROR', message: 'Not in a room.' }); return; }
  const result = setBotDifficulty(roomId, botPlayerId, difficulty, ws);
  if (!result.ok) { sendTo(ws, { type: 'ERROR', message: result.error }); return; }
  const room = getRoom(roomId);
  broadcast(room, buildLobbyUpdate(room));
}

function handleStartGame(ws, _) {
  const { roomId } = connectionMap.get(ws) ?? {};
  if (!roomId) return;
  const r = startRoom(roomId);
  if (!r.ok) { sendTo(ws, { type: 'ERROR', message: r.error }); return; }
  const room = getRoom(roomId);
  broadcastState(room);
}

// ── Game actions ──────────────────────────────────────────────

function handleRollDice(ws, _) {
  const { room, playerId } = ctx(ws); if (!room) return;
  const r = GameEngine.rollDice(playerId, room.state);
  if (!r.ok) { sendTo(ws, { type: 'ERROR', message: r.error }); return; }
  broadcastState(room);
}

function handleAssignDice(ws, { assignments }) {
  const { room, playerId } = ctx(ws); if (!room) return;
  const r = GameEngine.assignDice(playerId, assignments ?? {}, room.state);
  if (!r.ok) { sendTo(ws, { type: 'ERROR', message: r.error }); return; }
  broadcastState(room);
}

function handleMovePiece(ws, { pieceId, entryHomeId }) {
  const { room, playerId } = ctx(ws); if (!room) return;
  const r = GameEngine.movePiece(playerId, pieceId, entryHomeId ?? null, room.state);
  if (!r.ok) { sendTo(ws, { type: 'ERROR', message: r.error }); return; }
  broadcastState(room);
}

function handleRetreat(ws, { pieceId, targetHomeId }) {
  const { room, playerId } = ctx(ws); if (!room) return;
  const r = GameEngine.retreat(playerId, pieceId, targetHomeId, room.state);
  if (!r.ok) { sendTo(ws, { type: 'ERROR', message: r.error }); return; }
  broadcastState(room);
}

function handleEndMove(ws, _) {
  const { room, playerId } = ctx(ws); if (!room) return;
  const r = GameEngine.endMovePhase(playerId, room.state);
  if (!r.ok) { sendTo(ws, { type: 'ERROR', message: r.error }); return; }
  broadcastState(room);
}

function handleEnslave(ws, { targetPieceId }) {
  const { room, playerId } = ctx(ws); if (!room) return;
  const r = GameEngine.enslave(playerId, targetPieceId, room.state);
  if (!r.ok) { sendTo(ws, { type: 'ERROR', message: r.error }); return; }
  broadcastState(room);
}

function handleEscape(ws, { pieceId }) {
  const { room, playerId } = ctx(ws); if (!room) return;
  const r = GameEngine.escape(playerId, pieceId, room.state);
  if (!r.ok) { sendTo(ws, { type: 'ERROR', message: r.error }); return; }
  broadcastState(room);
}

function handleRelease(ws, { pieceId }) {
  const { room, playerId } = ctx(ws); if (!room) return;
  const r = GameEngine.release(playerId, pieceId, room.state);
  if (!r.ok) { sendTo(ws, { type: 'ERROR', message: r.error }); return; }
  broadcastState(room);
}

function handleSkipBot(ws) {
  const conn = connectionMap.get(ws) ?? {};
  const room = getRoom(conn.roomId);
  if (!room?.state) return;
  if (!isBot(room.state.activePlayerId, room)) return;
  room.botFastMode = true;
  // Immediately resolve any in-progress pause so the bot acts right now
  if (room._skipResolve) {
    room._skipResolve();
    room._skipResolve = null;
  }
}



function handleUndoAssign(ws) {
  const { room, playerId } = ctx(ws); if (!room) return;
  const r = GameEngine.undoAssign(playerId, room.state);
  if (!r.ok) { sendTo(ws, { type: 'ERROR', message: r.error }); return; }
  broadcastState(room);
}
function handleTimeoutSkip(ws) {
  const conn = connectionMap.get(ws) ?? {};
  const room = getRoom(conn.roomId);
  if (!room?.state) return;
  if (room.state.phase === 'GAME_OVER') return;

  // Verify this WS controls the active player
  const activeId   = room.state.activePlayerId;
  const controlled = getLocalPlayerIds(ws, room);
  if (!controlled.includes(activeId)) return;

  // Run the worst-move bot — it rolls if needed, executes the worst
  // valid move, or auto-skips via rollDice if no moves exist at all.
  runWorstMoveTurn(
    activeId,
    room.state,
    () => broadcast(room, { type: 'GAME_STATE', state: enrichState(room.state, room) }),
  );
  broadcastState(room); // final state + kick off bot chain if needed
}

// ── Post-game navigation ──────────────────────────────────────

function handleRestartGame(ws) {
  const conn = connectionMap.get(ws) ?? {};
  const room = getRoom(conn.roomId);
  if (!room) return;
  const r = restartRoom(conn.roomId);
  if (!r.ok) { sendTo(ws, { type: 'ERROR', message: r.error }); return; }
  broadcastState(room);
}

function handleReturnToLobby(ws) {
  const conn = connectionMap.get(ws) ?? {};
  const room = getRoom(conn.roomId);
  if (!room) return;
  returnRoomToLobby(conn.roomId);
  broadcast(room, buildLobbyUpdate(room));
}

function handleSetPublic(ws, { isPublic }) {
  const conn = connectionMap.get(ws) ?? {};
  if (!conn.roomId) { sendTo(ws, { type: 'ERROR', message: 'Not in a room.' }); return; }
  const result = setRoomPublic(conn.roomId, isPublic);
  if (!result.ok) { sendTo(ws, { type: 'ERROR', message: result.error }); return; }
  const room = getRoom(conn.roomId);
  broadcast(room, buildLobbyUpdate(room));
}

function handleListRooms(ws) {
  sendTo(ws, { type: 'ROOMS_LIST', rooms: listPublicRooms() });
}

// ── Broadcast + bot chain ─────────────────────────────────────

function broadcastState(room) {
  broadcast(room, { type: 'GAME_STATE', state: enrichState(room.state, room) });

  if (
    room.state.phase === 'ROLL' &&
    isBot(room.state.activePlayerId, room) &&
    !room.botRunning
  ) {
    room.botRunning  = true;
    room.botFastMode = false;
    runBotChain(room)
      .catch(err => console.error('[Bot chain error]', err))
      .finally(() => {
        room.botRunning  = false;
        room.botFastMode = false;
        broadcast(room, { type: 'GAME_STATE', state: enrichState(room.state, room) });
      });
  }
}

async function runBotChain(room) {
  const MAX_CONSECUTIVE = 200; // safety cap — avoids infinite loop if something goes wrong
  let iterations = 0;
  while (
    room.state.phase !== 'GAME_OVER' &&
    room.state.phase === 'ROLL' &&
    isBot(room.state.activePlayerId, room) &&
    iterations++ < MAX_CONSECUTIVE
  ) {
    const botId = room.state.activePlayerId;
    await runBotTurn(botId, room.state, () => {
      broadcast(room, { type: 'GAME_STATE', state: enrichState(room.state, room) });
    }, room);
    // Yield event loop between bot turns so WS messages can be processed
    await new Promise(resolve => setImmediate(resolve));
  }
}

// ── State enrichment ──────────────────────────────────────────

function enrichState(state, room) {
  const enrichedPlayers = {};
  for (const [pid, player] of Object.entries(state.players)) {
    const meta = room.players.find(p => p.id === pid) ?? {};
    enrichedPlayers[pid] = {
      ...player,
      isBot:      meta.isBot      ?? false,
      isLocal:    meta.isLocal    ?? false,
      difficulty: meta.difficulty ?? null,
    };
  }
  return { ...state, players: enrichedPlayers };
}

// ── Helpers ───────────────────────────────────────────────────

function ctx(ws) {
  const conn = connectionMap.get(ws);
  if (!conn) { sendTo(ws, { type: 'ERROR', message: 'Not in a room.' }); return {}; }
  const room = getRoom(conn.roomId);
  if (!room?.state) { sendTo(ws, { type: 'ERROR', message: 'Game not started.' }); return {}; }

  const activeId   = room.state.activePlayerId;
  const controlled = getLocalPlayerIds(ws, room);
  if (!controlled.includes(activeId)) {
    sendTo(ws, { type: 'ERROR', message: 'Not your turn.' });
    return {};
  }
  return { room, playerId: activeId };
}

function sendLobbyUpdate(ws, roomId) {
  const room = getRoom(roomId);
  if (room) broadcast(room, buildLobbyUpdate(room));
}

function buildLobbyUpdate(room) {
  const host = room.players.find(p => !p.isBot);
  return {
    type:     'LOBBY_UPDATE',
    hostId:   host?.id ?? null,
    isPublic: room.isPublic ?? false,
    isLocal:  room.isLocal  ?? false,
    players:  room.players.map(p => ({
      id:         p.id,
      name:       p.name,
      color:      p.color,
      isBot:      p.isBot,
      isLocal:    p.isLocal,
      difficulty: p.difficulty ?? null,
    })),
  };
}
