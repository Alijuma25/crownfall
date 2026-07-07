// ============================================================
// CROWNFALL — RoomManager.js  (v4: 6 players, color pick, remove, bot difficulty)
//
// v4 changes:
//  - MAX_PLAYERS raised to 6 (Crimson/Bronze/Gold/Emerald/Sapphire/Silver)
//  - joinRoom / addLocalPlayer accept optional preferred color
//  - addBotPlayer stores difficulty (default 'medium')
//  - removePlayer: host removes any other player (local, bot, online) → kicks them
//  - changeColor: host changes any owned player's color; non-host changes own only
//  - setBotDifficulty: host sets easy/medium/hard/impossible per bot
//  - buildLobbyUpdate now includes hostId + difficulty in payload
// ============================================================

import { v4 as uuid } from 'uuid';
import { createGameState } from '../game/GameState.js';
import { GameEngine }      from '../game/GameEngine.js';
import { PLAYERS_CONFIG, MAX_PLAYERS, MIN_PLAYERS, BOT_DIFFICULTIES } from '../game/constants.js';

// Clockwise turn order: Crimson → Bronze → Gold → Emerald → Sapphire → Silver
const COLOR_ORDER = ['red', 'orange', 'yellow', 'green', 'blue', 'silver'];

// Display names for each faction color key
const COLOR_DISPLAY_NAME = {
  red: 'Crimson', orange: 'Bronze', yellow: 'Gold',
  green: 'Emerald', blue: 'Sapphire', silver: 'Silver',
};
function sortByColor(players) {
  return [...players].sort((a, b) => {
    const ai = COLOR_ORDER.indexOf(a.color);
    const bi = COLOR_ORDER.indexOf(b.color);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

const rooms = new Map(); // roomId → RoomData

/**
 * RoomData:
 * {
 *   id: string,
 *   players: [{
 *     id: string,
 *     name: string,
 *     color: string,
 *     ws: WebSocket | null,
 *     isBot: boolean,
 *     isLocal: boolean,
 *     ownerWs: WebSocket | null,
 *     difficulty: string | null,   // bots only: 'easy'|'medium'|'hard'|'impossible'
 *   }],
 *   state: GameState | null,
 *   started: boolean,
 * }
 */

export function createRoom(isPublic = false, isLocal = false) {
  const id = uuid().slice(0, 6).toUpperCase();
  rooms.set(id, { id, players: [], state: null, started: false, isPublic: !!isPublic, isLocal: !!isLocal });
  return id;
}

export function setRoomPublic(roomId, isPublic) {
  const room = rooms.get(roomId);
  if (!room) return { ok: false, error: 'Room not found.' };
  room.isPublic = !!isPublic;
  return { ok: true };
}

export function listPublicRooms() {
  const result = [];
  for (const room of rooms.values()) {
    if (!room.isPublic || room.started) continue;
    result.push({
      id:          room.id,
      playerCount: room.players.length,
      maxPlayers:  MAX_PLAYERS,
      hostName:    room.players.find(p => !p.isBot)?.name ?? 'Unknown',
    });
  }
  return result;
}

/** Join as a remote online player. Optionally request a preferred color. */
export function joinRoom(roomId, playerName, ws, preferredColor = null) {
  const room = rooms.get(roomId);
  if (!room)               return { ok: false, error: 'Room not found.' };
  if (room.started)        return { ok: false, error: 'Game already started.' };
  if (room.players.length >= MAX_PLAYERS) return { ok: false, error: 'Room full.' };

  const color = pickColor(room, preferredColor);
  if (!color) return { ok: false, error: 'No colors left.' };

  const playerId = uuid();
  room.players.push({ id: playerId, name: playerName, color, ws, isBot: false, isLocal: false, ownerWs: ws, difficulty: null });
  return { ok: true, playerId, color };
}

/** Add a local (hot-seat) player. Optionally request a preferred color. */
export function addLocalPlayer(roomId, playerName, ownerWs, preferredColor = null) {
  const room = rooms.get(roomId);
  if (!room)               return { ok: false, error: 'Room not found.' };
  if (room.started)        return { ok: false, error: 'Game already started.' };
  if (room.players.length >= MAX_PLAYERS) return { ok: false, error: 'Room full.' };

  const color = pickColor(room, preferredColor);
  if (!color) return { ok: false, error: 'No colors left.' };

  const playerId = uuid();
  room.players.push({ id: playerId, name: playerName, color, ws: null, isBot: false, isLocal: true, ownerWs, difficulty: null });
  return { ok: true, playerId, color };
}

/** Add a bot player. Bots receive leftover colors; default difficulty is 'medium'. */
export function addBotPlayer(roomId, ownerWs, difficulty = 'medium') {
  const room = rooms.get(roomId);
  if (!room)               return { ok: false, error: 'Room not found.' };
  if (room.started)        return { ok: false, error: 'Game already started.' };
  if (room.players.length >= MAX_PLAYERS) return { ok: false, error: 'Room full.' };

  // Bots always get the next available color (no preference)
  const color = pickColor(room, null);
  if (!color) return { ok: false, error: 'No colors left.' };

  const name = COLOR_DISPLAY_NAME[color] ?? (color.charAt(0).toUpperCase() + color.slice(1));
  const diff     = BOT_DIFFICULTIES.includes(difficulty) ? difficulty : 'medium';

  const playerId = uuid();
  room.players.push({ id: playerId, name, color, ws: null, isBot: true, isLocal: false, ownerWs, difficulty: diff });
  return { ok: true, playerId, color, name, difficulty: diff };
}

/**
 * Remove a player from the lobby.
 * Host (first non-bot in the room) can remove anyone except themselves.
 * Returns the removed player's ws/ownerWs so the caller can send a KICKED message.
 */
export function removePlayer(roomId, targetPlayerId, requesterWs) {
  const room = rooms.get(roomId);
  if (!room)        return { ok: false, error: 'Room not found.' };
  if (room.started) return { ok: false, error: 'Cannot remove players after game started.' };

  const hostEntry = getHostEntry(room);
  const requesterIds = getWsPlayerIds(requesterWs, room);
  if (!requesterIds.includes(hostEntry?.id)) {
    return { ok: false, error: 'Only the host can remove players.' };
  }
  if (targetPlayerId === hostEntry.id) {
    return { ok: false, error: 'Host cannot remove themselves.' };
  }

  const idx = room.players.findIndex(p => p.id === targetPlayerId);
  if (idx === -1) return { ok: false, error: 'Player not found.' };

  const [removed] = room.players.splice(idx, 1);
  return { ok: true, removedWs: removed.ws, removedOwnerWs: removed.ownerWs };
}

/**
 * Change a player's color.
 * Host can change any player's color. Non-hosts can only change their own.
 */
export function changeColor(roomId, targetPlayerId, newColor, requesterWs) {
  const room = rooms.get(roomId);
  if (!room)        return { ok: false, error: 'Room not found.' };
  if (room.started) return { ok: false, error: 'Cannot change color after game started.' };
  if (!PLAYERS_CONFIG.includes(newColor)) return { ok: false, error: 'Invalid color.' };

  const taken = room.players.find(p => p.color === newColor && p.id !== targetPlayerId);
  if (taken) return { ok: false, error: 'Color already taken.' };

  const hostEntry     = getHostEntry(room);
  const requesterIds  = getWsPlayerIds(requesterWs, room);
  const isHost        = requesterIds.includes(hostEntry?.id);
  const ownsTarget    = requesterIds.includes(targetPlayerId);
  if (!isHost && !ownsTarget) return { ok: false, error: 'Not authorized to change this color.' };

  const player = room.players.find(p => p.id === targetPlayerId);
  if (!player) return { ok: false, error: 'Player not found.' };
  player.color = newColor;
  return { ok: true, color: newColor };
}

/**
 * Set bot difficulty. Host only.
 */
export function setBotDifficulty(roomId, botPlayerId, difficulty, requesterWs) {
  const room = rooms.get(roomId);
  if (!room)        return { ok: false, error: 'Room not found.' };
  if (room.started) return { ok: false, error: 'Cannot change difficulty after game started.' };
  if (!BOT_DIFFICULTIES.includes(difficulty)) return { ok: false, error: 'Invalid difficulty.' };

  const hostEntry    = getHostEntry(room);
  const requesterIds = getWsPlayerIds(requesterWs, room);
  if (!requesterIds.includes(hostEntry?.id)) {
    return { ok: false, error: 'Only the host can set bot difficulty.' };
  }

  const bot = room.players.find(p => p.id === botPlayerId && p.isBot);
  if (!bot) return { ok: false, error: 'Bot not found.' };
  bot.difficulty = difficulty;
  return { ok: true };
}

export function startRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room)          return { ok: false, error: 'Room not found.' };
  if (room.started)   return { ok: false, error: 'Already started.' };
  if (room.players.length < MIN_PLAYERS) return { ok: false, error: `Need at least ${MIN_PLAYERS} players.` };

  const playerData = sortByColor(room.players.map(p => ({
    id: p.id, name: p.name, color: p.color, isBot: p.isBot, isLocal: p.isLocal,
  })));
  room.state = createGameState(playerData);
  room.started = true;
  GameEngine.startGame(room.state);
  return { ok: true };
}

/** Restart the game with the same players and settings. */
export function restartRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return { ok: false, error: 'Room not found.' };

  const playerData = sortByColor(room.players.map(p => ({
    id: p.id, name: p.name, color: p.color, isBot: p.isBot, isLocal: p.isLocal,
  })));
  room.state = createGameState(playerData);
  room.started = true;
  room.botRunning  = false;
  room.botFastMode = false;
  GameEngine.startGame(room.state);
  return { ok: true };
}

/** Return room to lobby state, keeping all players. */
export function returnRoomToLobby(roomId) {
  const room = rooms.get(roomId);
  if (!room) return { ok: false, error: 'Room not found.' };

  room.state       = null;
  room.started     = false;
  room.botRunning  = false;
  room.botFastMode = false;
  return { ok: true };
}

export function getRoom(roomId)    { return rooms.get(roomId) || null; }

export function getRoomForWs(ws) {
  for (const room of rooms.values()) {
    if (room.players.some(p => p.ws === ws || p.ownerWs === ws)) return room;
  }
  return null;
}

export function getLocalPlayerIds(ws, room) {
  return room.players
    .filter(p => p.ownerWs === ws || p.ws === ws)
    .map(p => p.id);
}

export function broadcast(room, msg) {
  const str  = JSON.stringify(msg);
  const seen = new Set();
  for (const p of room.players) {
    const target = p.ws ?? p.ownerWs;
    if (target && !seen.has(target) && target.readyState === 1) {
      target.send(str);
      seen.add(target);
    }
  }
}

export function sendTo(ws, msg) {
  if (ws?.readyState === 1) ws.send(JSON.stringify(msg));
}

export function handleDisconnect(ws) {
  for (const room of rooms.values()) {
    for (const p of room.players) {
      if (p.ws === ws)      p.ws = null;
      if (p.ownerWs === ws) p.ownerWs = null;
    }
  }
}

export function isBot(playerId, room) {
  return room.players.find(p => p.id === playerId)?.isBot ?? false;
}

export function getBotDifficulty(playerId, room) {
  return room.players.find(p => p.id === playerId)?.difficulty ?? 'medium';
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Pick color: prefer requestedColor if available, else next in PLAYERS_CONFIG. */
function pickColor(room, requestedColor) {
  const used = room.players.map(p => p.color);
  if (requestedColor && PLAYERS_CONFIG.includes(requestedColor) && !used.includes(requestedColor)) {
    return requestedColor;
  }
  return PLAYERS_CONFIG.find(c => !used.includes(c)) ?? null;
}

/** First non-bot player in the room is the host. */
function getHostEntry(room) {
  return room.players.find(p => !p.isBot) ?? null;
}

/** All player IDs associated with a WS connection. */
function getWsPlayerIds(ws, room) {
  return room.players.filter(p => p.ownerWs === ws || p.ws === ws).map(p => p.id);
}
