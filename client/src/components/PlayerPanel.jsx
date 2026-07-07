// ============================================================
// CROWNFALL — PlayerPanel.jsx  (REDESIGN v4: empire cards)
// Premium card layout. Cinzel font. Rich piece status display.
// ============================================================

import { useGameStore } from '../store/gameStore';

// Official Crownfall faction colors: Crimson, Bronze, Gold, Emerald, Sapphire, Silver
const COLOR_HEX = {
  red:    '#B22222',  // Crimson
  orange: '#CE8946',  // Bronze
  yellow: '#D4AF37',  // Gold
  green:  '#50C878',  // Emerald
  blue:   '#0F52BA',  // Sapphire
  silver: '#C4C4C4',  // Silver
};
const COLOR_DARK = {
  red:    '#6B1212',
  orange: '#7A4A1A',
  yellow: '#7A6200',
  green:  '#1A7040',
  blue:   '#072A6A',
  silver: '#6A6A6A',
};

// Piece abbreviations — no emojis
function pieceAbbr(piece) {
  if (piece.type === 'general') return 'G';
  if (piece.type === 'spy') return piece.id.endsWith('_S1') ? 'S1' : 'S2';
  // soldier
  if (piece.id.endsWith('_T1')) return 'T1';
  if (piece.id.endsWith('_T2')) return 'T2';
  return 'T3';
}

export default function PlayerPanel() {
  const { gameState, myPlayerIds } = useGameStore();
  if (!gameState) return null;

  const { players, pieces, activePlayerId, bonusTurnQueue } = gameState;
  const sorted = Object.values(players).sort((a, b) =>
    (gameState.turnOrder?.indexOf(a.id) ?? 99) - (gameState.turnOrder?.indexOf(b.id) ?? 99)
  );

  return (
    <div className="player-panel">
      <div className="pp-section-label">Empires</div>
      {sorted.map((player, idx) => {
        const isMe     = myPlayerIds.includes(player.id);
        const isActive = player.id === activePlayerId;
        const hex      = COLOR_HEX[player.color] ?? '#888';
        const dark     = COLOR_DARK[player.color] ?? '#444';
        const initial  = (player.name ?? '?').charAt(0).toUpperCase();

        const playerPieces = Object.values(pieces).filter(p => p.ownerId === player.id && p.status !== 'dead');
        const controlled   = player.controlledEmpires ?? [];

        const allPiecesDead = Object.values(pieces)
          .filter(p => p.ownerId === player.id)
          .every(p => p.status === 'dead');
        const isFallen = !player.alive && !allPiecesDead;

        return (
          <div key={player.id}
            className={`player-card${isActive ? ' player-card--active' : ''}${allPiecesDead ? ' player-card--dead' : ''}`}
            style={{ '--player-hex': hex, animationDelay: `${idx * 0.05}s` }}
          >
            {/* Card header band */}
            <div className="pc-header" style={{ background: `linear-gradient(90deg, ${hex}22, transparent)` }}>
              {/* Avatar circle */}
              <div className="pc-avatar" style={{
                background: `linear-gradient(135deg, ${hex}, ${dark})`,
              }}>
                {initial}
                {isActive && <div className="pc-avatar-ring" style={{ borderColor: hex }} />}
              </div>

              {/* Name + tags */}
              <div className="pc-name-wrap">
                <div className="pc-name" style={{ color: hex }}>
                  {isActive && <span style={{ fontSize:'0.5rem', marginRight:2 }}>▶</span>}
                  {player.name}
                </div>
                <div className="pc-tags">
                  {isMe      && <span className="pc-tag pc-tag--you">You</span>}
                  {player.isBot && <span className="pc-tag pc-tag--bot">Bot</span>}
                  {player.isLocal && !player.isBot && <span className="pc-tag pc-tag--local">P2</span>}
                  {allPiecesDead && <span className="pc-tag pc-tag--dead">Dead</span>}
                  {isFallen && <span className="pc-tag pc-tag--fallen">Fallen</span>}
                  {isActive && bonusTurnQueue > 0 && (
                    <span className="pc-tag pc-tag--bonus">+{bonusTurnQueue}</span>
                  )}
                </div>
              </div>

              {/* Controlled empires dots */}
              {controlled.length > 0 && (
                <div className="pc-empires">
                  {controlled.map(eid => {
                    const empHex  = COLOR_HEX[players[eid]?.color];
                    const empName = players[eid]?.name ?? eid;
                    return empHex ? (
                      <span key={eid} className="pc-empire-chip"
                        style={{ background: `${empHex}22`, borderColor: `${empHex}55`, color: empHex }}
                        title={`Controls ${empName}'s empire`}>
                        {(players[eid]?.color ?? '?').charAt(0).toUpperCase()}
                      </span>
                    ) : null;
                  })}
                </div>
              )}
            </div>

            {/* Piece dots */}
            {playerPieces.length > 0 && (
              <div className="pc-body">
                <div className="pc-pieces-row">
                  {playerPieces.map(piece => {
                    const ctrlHex    = COLOR_HEX[players[piece.controllerId]?.color] ?? hex;
                    const isPrisoner = piece.controllerId !== piece.ownerId;
                    return (
                      <span key={piece.id}
                        className="pc-piece"
                        style={{
                          background: `${ctrlHex}28`,
                          borderColor: `${ctrlHex}80`,
                          color: ctrlHex,
                        }}
                        title={`${piece.type} — ${piece.status}${piece.position != null ? ` @${piece.position}` : ''}`}
                      >
                        {pieceAbbr(piece)}
                        {isPrisoner && (
                          <span className="pc-piece-chain" title="Prisoner">!</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
