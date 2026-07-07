// ============================================================
// CROWNFALL — Graveyard.jsx  (REDESIGN v3 — no emojis)
// Fallen soldiers panel. Clean text abbreviations.
// ============================================================

import { useGameStore } from '../store/gameStore';

// Official Crownfall faction colors: Crimson, Bronze, Gold, Emerald, Sapphire, Silver
const COLOR_HEX  = {
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
function pieceAbbr(piece) {
  if (piece.type === 'general') return 'G';
  if (piece.type === 'spy') return piece.id.endsWith('_S1') ? 'S1' : 'S2';
  if (piece.id.endsWith('_T1')) return 'T1';
  if (piece.id.endsWith('_T2')) return 'T2';
  return 'T3';
}

function pieceLabel(piece) {
  if (piece.type === 'general') return 'General';
  if (piece.type === 'spy') return piece.id.endsWith('_S1') ? 'Spy 1' : 'Spy 2';
  const num = piece.id.endsWith('_T1') ? '1' : piece.id.endsWith('_T2') ? '2' : '3';
  return `Soldier ${num}`;
}

export default function Graveyard() {
  const { gameState } = useGameStore();
  if (!gameState) return null;

  const { pieces, players, turnOrder } = gameState;

  const deadByOwner = {};
  for (const piece of Object.values(pieces)) {
    if (piece.status !== 'dead') continue;
    if (!deadByOwner[piece.ownerId]) deadByOwner[piece.ownerId] = [];
    deadByOwner[piece.ownerId].push(piece);
  }

  const ownerIds = (turnOrder ?? Object.keys(players)).filter(id => deadByOwner[id]);
  if (ownerIds.length === 0) return null;

  return (
    <div className="graveyard-panel">
      <div className="log-title" style={{ marginBottom: '6px', fontFamily: "var(--font-title)" }}>
        <span className="log-title-icon" style={{ fontSize:'0.7rem', opacity:0.6 }}>+</span>
        Fallen
      </div>

      <div className="graveyard-rows">
        {ownerIds.map(ownerId => {
          const player = players[ownerId];
          const color  = player?.color ?? 'red';
          const hex    = COLOR_HEX[color] ?? '#888';
          const dark   = COLOR_DARK[color] ?? '#444';
          const dead   = deadByOwner[ownerId];

          return (
            <div key={ownerId} className="graveyard-row">
              <div className="graveyard-dot"
                style={{ background: `linear-gradient(135deg, ${hex}, ${dark})` }}
              />
              <span className="graveyard-name" style={{ color: hex }}>
                {player?.name}
              </span>
              <div className="graveyard-pieces">
                {dead.map(piece => (
                  <span
                    key={piece.id}
                    className="graveyard-piece"
                    title={`${pieceLabel(piece)} — eliminated`}
                    style={{
                      background: `${hex}1A`,
                      border: `1px solid ${hex}44`,
                      color: `${hex}88`,
                      fontFamily: 'var(--font)',
                      fontSize: '0.58rem',
                      fontWeight: '800',
                    }}
                  >
                    {pieceAbbr(piece)}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
