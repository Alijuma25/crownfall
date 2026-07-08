// ============================================================
// CROWNFALL — hooks/useGameSocket.js  (v3: hot seat + bots)
// Handles ROOM_CREATED, ROOM_JOINED, LOCAL_PLAYER_ADDED,
// BOT_ADDED so store accumulates all local player IDs.
// ============================================================

import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';

// In dev, VITE_WS_URL points to the local server (ws://localhost:3001).
// In Capacitor (native iOS/Android app), window.location.protocol is 'capacitor:'
// so we fall back to the Railway production server.
// In browser production, auto-detect from window.location.
const RAILWAY_URL = 'wss://crownfall-production.up.railway.app';
const WS_URL = import.meta.env.VITE_WS_URL ||
  (window.location.protocol === 'capacitor:' ? RAILWAY_URL :
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`);

export function useGameSocket() {
  const wsRef    = useRef(null);
  const retryRef = useRef(null);
  const store    = useGameStore();

  useEffect(() => {
    let alive = true;

    function connect() {
      if (!alive) return;
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;
        store.setWs(ws);

        // Watchdog: if no open/close within 10s, close and retry
        const watchdog = setTimeout(() => {
          console.warn('[WS] Connection timeout — retrying');
          ws.close();
        }, 10000);

        ws.onopen = () => {
          clearTimeout(watchdog);
          store.setConnected(true);
          console.log('[WS] Connected');
        };

        ws.onclose = () => {
          clearTimeout(watchdog);
          store.setConnected(false);
          console.log('[WS] Disconnected — retrying in 3s');
          if (alive) retryRef.current = setTimeout(connect, 3000);
        };

        ws.onerror = err => {
          clearTimeout(watchdog);
          console.error('[WS]', err);
          ws.close();
        };

        ws.onmessage = ev => {
          let msg;
          try { msg = JSON.parse(ev.data); } catch { return; }
          handleMessage(msg, store);
        };
      } catch (e) {
        console.error('[WS] Failed to create socket:', e);
        if (alive) retryRef.current = setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      alive = false;
      clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, []); // eslint-disable-line

  return wsRef;
}

function handleMessage(msg, store) {
  switch (msg.type) {
    case 'ROOM_CREATED':
      store.setRoomId(msg.roomId);
      store.addMyPlayerId(msg.playerId, msg.color);
      break;

    case 'ROOM_JOINED':
      store.setRoomId(msg.roomId);
      store.addMyPlayerId(msg.playerId, msg.color);
      break;

    case 'LOCAL_PLAYER_ADDED':
      // Another local player added to this device
      store.addMyPlayerId(msg.playerId, msg.color);
      break;

    case 'BOT_ADDED':
      // Bot added — no action needed on client side
      break;

    case 'LOBBY_UPDATE':
      store.setLobbyPlayers(msg.players, msg.hostId, msg.isPublic, msg.isLocal);
      // If we receive a lobby update while a game is running, the server
      // reset the room to lobby — clear the game state so we return to lobby screen.
      store.setGameState(null);
      break;

    case 'ROOMS_LIST':
      store.setPublicRooms(msg.rooms ?? []);
      break;

    case 'KICKED':
      store.resetLobby();
      store.setError('You were removed from the room by the host.');
      setTimeout(() => store.clearError(), 5000);
      break;

    case 'GAME_STATE':
      store.setGameState(msg.state);
      store.clearPendingAssignments();
      store.selectPiece(null);
      // Capture auto-skip notice in the store so it persists even after
      // the next state update clears it on the server.
      if (msg.state?.autoSkipNotice) {
        store.setSkipNotice(msg.state.autoSkipNotice);
        setTimeout(() => store.clearSkipNotice(), 4000);
      }
      break;

    case 'ERROR':
      store.setError(msg.message);
      setTimeout(() => store.clearError(), 4000);
      break;

    default:
      break;
  }
}

export function sendMsg(ws, msg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
