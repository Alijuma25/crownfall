// ============================================================
// CROWNFALL — store/gameStore.js  (v4: UX overhaul)
// Zustand store. Hot seat + bots + click-die-first interaction.
// ============================================================

import { create } from 'zustand';

export const useGameStore = create((set, get) => ({
  // Connection
  connected: false,
  ws: null,

  // Identity — may control multiple players (hot seat)
  myPlayerIds: [],
  myColor: null,
  roomId: null,

  // Lobby
  lobbyPlayers: [],
  hostId: null,
  isPublic: false,      // whether the current room is public
  isLocalRoom: false,   // whether this is a local (hot-seat) room
  publicRooms: [],      // list of browseable public rooms

  // Game state (mirrored from server)
  gameState: null,

  // UI helpers
  selectedPieceId: null,
  pendingAssignments: {},
  entryHomeIds: {},
  error: null,
  skipNotice: null,   // { playerName, dice } — shown client-side for ~4s

  // v4 UX: click-die-first interaction
  // selectedDie: { value: number, rank: 1|2|3 } | null
  selectedDie: null,
  // hoveredPieceId for tooltip
  hoveredPieceId: null,

  // ── Actions ──────────────────────────────────────────────

  setWs: ws => set({ ws }),
  setConnected: connected => set({ connected }),
  // Dedup by key — prevents repeated GAME_STATE broadcasts from cancelling banner timers
  setSkipNotice: notice => {
    const cur = get().skipNotice;
    if (cur) {
      const nk = `${notice.playerId}-${(notice.dice ?? []).join(',')}`;
      const ck = `${cur.playerId}-${(cur.dice ?? []).join(',')}`;
      if (nk === ck) return; // same notice already shown — don't reset
    }
    set({ skipNotice: notice });
  },
  clearSkipNotice: () => set({ skipNotice: null }),

  addMyPlayerId: (playerId, color) =>
    set(s => ({
      myPlayerIds: [...s.myPlayerIds, playerId],
      myColor: s.myPlayerIds.length === 0 ? color : s.myColor,
    })),

  setRoomId: roomId => set({ roomId }),
  setLobbyPlayers: (players, hostId, isPublic, isLocal) => set({ lobbyPlayers: players, hostId: hostId ?? null, isPublic: isPublic ?? false, isLocalRoom: isLocal ?? false }),
  setPublicRooms: rooms => set({ publicRooms: rooms }),
  resetLobby: () => set({ myPlayerIds: [], myColor: null, roomId: null, lobbyPlayers: [], hostId: null, isPublic: false, isLocalRoom: false, publicRooms: [], gameState: null }),
  setGameState: state => set({ gameState: state }),
  setError: error => set({ error }),
  clearError: () => set({ error: null }),
  selectPiece: pieceId => set({ selectedPieceId: pieceId }),

  setSelectedDie: (die) => set({ selectedDie: die }),
  clearSelectedDie: () => set({ selectedDie: null }),
  setHoveredPieceId: (id) => set({ hoveredPieceId: id }),

  stageDiceAssignment: (pieceId, dieValue) =>
    // 1-piece-per-turn: replace any existing pending assignment entirely
    set(() => ({
      pendingAssignments: { [pieceId]: dieValue },
      selectedDie: null,
    })),

  unstageAssignment: pieceId =>
    set(s => {
      const next = { ...s.pendingAssignments };
      delete next[pieceId];
      return { pendingAssignments: next };
    }),

  setEntryHomeId: (pieceId, homeId) =>
    set(s => ({ entryHomeIds: { ...s.entryHomeIds, [pieceId]: homeId } })),

  clearPendingAssignments: () =>
    set({ pendingAssignments: {}, entryHomeIds: {}, selectedDie: null }),

  // ── Computed ─────────────────────────────────────────────

  isMyTurn: () => {
    const s = get();
    return s.myPlayerIds.includes(s.gameState?.activePlayerId);
  },

  activeLocalPlayerId: () => {
    const s = get();
    const active = s.gameState?.activePlayerId;
    return s.myPlayerIds.includes(active) ? active : null;
  },

  myPieces: () => {
    const s = get();
    const activeLocal = s.activeLocalPlayerId();
    if (!s.gameState || !activeLocal) return [];
    return Object.values(s.gameState.pieces).filter(p => p.controllerId === activeLocal);
  },

  phase: () => get().gameState?.phase ?? null,
}));
