
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
