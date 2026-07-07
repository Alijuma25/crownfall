// ============================================================
// CROWNFALL — DicePanel.jsx  (v3: 1-piece-per-turn, no emoji, brutal)
// One piece per turn. Click a die option → immediately assigns + sends.
// No "Confirm" button. No staged state. Clean and direct.
// ============================================================

import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { sendMsg } from '../hooks/useGameSocket';

const ROLL_OPTIONS = { general: 3, spy: 2, soldier: 1 };
// Official Crownfall faction colors: Crimson, Bronze, Gold, Emerald, Sapphire, Silver
const COLOR_HEX = {
  red:    '#B22222',  // Crimson
  orange: '#CE8946',  // Bronze
  yellow: '#D4AF37',  // Gold
  green:  '#50C878',  // Emerald
  blue:   '#0F52BA',  // Sapphire
  silver: '#C4C4C4',  // Silver
};

// Phase breadcrumb — no emojis
function PhaseSteps({ phase, isMyTurn }) {
  const steps = [
    { key:'ROLL',   label:'ROLL' },
    { key:'ASSIGN', label:'PICK' },
    { key:'MOVE',   label:'MOVE' },
  ];
  const order = ['ROLL','ASSIGN','MOVE'];
  const cur = order.indexOf(phase);
  return (
    <div className="dp-steps">
      {steps.map((s, i) => {
        const isDone   = i < cur;
        const isActive = i === cur && isMyTurn;
        return (
          <span key={s.key} style={{ display:'flex', alignItems:'center', gap:0 }}>
            <span className={`dp-step${isActive?' active':''}${isDone?' done':''}`}>
              {isDone ? '✓ ' : ''}{s.label}
            </span>
            {i < 2 && <span className="dp-step-arrow"> / </span>}
          </span>
        );
      })}
    </div>
  );
}

// Die face — large bold number
function DieFace({ value, size = 54, textColor = 'white', rank }) {
  const rankLabel = rank === 1 ? 'D1' : rank === 2 ? 'D2' : 'D3';
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
      <span className="dp-die-rank">{rankLabel}</span>
      <div style={{ width: size, height: size, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <span style={{
          fontFamily: 'var(--font-title)',
          fontSize: Math.floor(size * 0.72) + 'px',
          fontWeight: '900',
          color: textColor,
          lineHeight: 1,
          textShadow: `0 2px 8px rgba(0,0,0,0.5)`,
          userSelect: 'none',
        }}>
          {value}
        </span>
      </div>
    </div>
  );
}

function DieCard({ value, rank, used, selected, readonly, onClick }) {
  const rankClass = rank === 3 ? 'dp-die--d3' : rank === 2 ? 'dp-die--d2' : 'dp-die--d1';
  const textColor = rank === 3 ? 'var(--gold-bright)' : 'white';
  const classes = [
    'dp-die', rankClass,
    used     ? 'dp-die--used'     : '',
    selected ? 'dp-die--selected' : '',
    readonly ? 'dp-die--readonly' : '',
  ].filter(Boolean).join(' ');
  return (
    <div className={classes} onClick={!used && !readonly ? onClick : undefined}
      style={{ opacity: used ? 0.25 : 1 }}>
      <DieFace value={value} size={54} textColor={textColor} rank={rank} />
    </div>
  );
}

export default function DicePanel({ wsRef }) {
  const [rolling, setRolling] = useState(false);
  const {
    gameState,
    entryHomeIds, setEntryHomeId,
    isMyTurn: isMyTurnFn, activeLocalPlayerId,
  } = useGameStore();

  if (!gameState) return null;
  const { phase, activePlayerId, currentDice, pieces, assignments, players, empires } = gameState;
  const isMyTurn   = isMyTurnFn();
  const myPlayerId = activeLocalPlayerId();

  function controlledHomes(pid) {
    const p = players[pid];
    if (!p) return [];
    return [...(p.alive ? [pid] : []), ...(p.controlledEmpires ?? [])];
  }
  function controlledZoneSpaces(pid) {
    return controlledHomes(pid).flatMap(hid => empires?.[hid]?.colorZone ?? []);
  }
  function resolveEntryHome(piece, homes) {
    const stored = entryHomeIds[piece.id];
    if (stored && homes.includes(stored)) return stored;
    if (homes.includes(piece.ownerId)) return piece.ownerId;
    return homes[0] ?? piece.ownerId;
  }

  function handleRoll() {
    setRolling(true);
    sendMsg(wsRef.current, { type: 'ROLL_DICE' });
    setTimeout(() => setRolling(false), 600);
  }

  // ── ROLL ────────────────────────────────────────────────
  if (phase === 'ROLL' && isMyTurn) {
    return (
      <div className="dice-panel">
        <PhaseSteps phase="ROLL" isMyTurn />
        <div className="dp-instruction my-turn">
          <div className="dp-instruction-text">YOUR TURN</div>
          <div className="dp-instruction-sub">Roll to see your dice</div>
        </div>
        <button className={`dp-roll-btn${rolling ? ' rolling' : ''}`}
          onClick={handleRoll} disabled={rolling}>
          <div className="dp-roll-btn-inner">
            <span className="dp-roll-dice-icon">&#9646;&#9646;&#9646;</span>
            <span>{rolling ? 'Rolling…' : 'ROLL'}</span>
          </div>
        </button>
      </div>
    );
  }

  // ── ASSIGN (1-piece-per-turn) ───────────────────────────
  // Clicking a die option immediately sends ASSIGN_DICE — no staging, no confirm.
  if (phase === 'ASSIGN' && isMyTurn && currentDice) {
    const sortedDice = [...currentDice].sort((a, b) => a - b);
    const myPieces   = Object.values(pieces).filter(p => p.controllerId === myPlayerId && p.status !== 'dead');
    const homes      = controlledHomes(myPlayerId);
    const hasFour    = currentDice.includes(4);

    const freePieces = hasFour ? Object.values(pieces).filter(p => {
      if (p.ownerId === myPlayerId || p.controllerId === myPlayerId || p.status === 'dead') return false;
      const isFree  = p.status === 'active' && p.controllerId === p.ownerId && p.position !== null && !players[p.ownerId]?.alive;
      const isSlave = p.controllerId !== p.ownerId;
      return isFree || isSlave;
    }) : [];
    const myImprisoned = hasFour ? Object.values(pieces).filter(p =>
      p.ownerId === myPlayerId && p.controllerId !== myPlayerId && p.status !== 'dead'
    ) : [];
    const myPrisoners = Object.values(pieces).filter(p =>
      p.controllerId === myPlayerId && p.ownerId !== myPlayerId && p.status !== 'dead'
    );

    function eligibleDice(piece) {
      const opts  = ROLL_OPTIONS[piece.type];
      const slice = sortedDice.slice(0, opts);
      if (piece.status === 'home' || piece.status === 'prisoner') return slice.filter(v => v === 1 || v === 6);
      return [...new Set(slice)];
    }

    // Immediately assign and go to MOVE phase
    function assignAndMove(pieceId, dieValue) {
      sendMsg(wsRef.current, { type: 'ASSIGN_DICE', assignments: { [pieceId]: dieValue } });
    }

    return (
      <div className="dice-panel">
        <PhaseSteps phase="ASSIGN" isMyTurn />
        <div className="dp-instruction my-turn">
          <div className="dp-instruction-text">PICK A PIECE</div>
          <div className="dp-instruction-sub">Choose which piece moves this turn</div>
        </div>

        {/* Dice reference row */}
        <div className="dp-dice-row">
          {sortedDice.map((v, i) => (
            <DieCard key={i} value={v} rank={i+1} readonly />
          ))}
        </div>

        {/* Release prisoners (no dice needed) */}
        {myPrisoners.length > 0 && (
          <div className="dp-special-box dp-special-box--release">
            <div className="dp-special-title">RELEASE PRISONER</div>
            <div className="dp-special-hint">Free action — turn continues after releasing</div>
            <div className="dp-assign-list">
              {myPrisoners.map(p => {
                const n = pieceFullName(p, players);
                return (
                  <div key={p.id} className="dp-assign-row">
                    <span className="dp-piece-badge" style={{ color: n.color }}>{n.label}</span>
                    <button className="dp-btn-escape"
                      onClick={() => sendMsg(wsRef.current, { type:'RELEASE_PRISONER', pieceId: p.id })}>
                      FREE
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Enslave with die=4 */}
        {hasFour && freePieces.length > 0 && (
          <div className="dp-special-box dp-special-box--enslave">
            <div className="dp-special-title">ENSLAVE (die=4)</div>
            <div className="dp-special-hint">Ends your turn</div>
            <div className="dp-assign-list">
              {freePieces.map(p => {
                const n = pieceFullName(p, players);
                return (
                  <div key={p.id} className="dp-assign-row">
                    <span className="dp-piece-badge" style={{ color: n.color }}>{n.label}</span>
                    <span className="dp-piece-loc">@{p.position}</span>
                    <button className="dp-btn-enslave"
                      onClick={() => sendMsg(wsRef.current, { type:'ENSLAVE', targetPieceId: p.id })}>
                      ENSLAVE
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Escape with die=4 */}
        {hasFour && myImprisoned.length > 0 && (
          <div className="dp-special-box dp-special-box--escape">
            <div className="dp-special-title">ESCAPE (die=4)</div>
            <div className="dp-special-hint">Ends your turn</div>
            <div className="dp-assign-list">
              {myImprisoned.map(p => {
                const n = pieceFullName(p, players);
                const captor = players[p.controllerId];
                return (
                  <div key={p.id} className="dp-assign-row">
                    <span className="dp-piece-badge" style={{ color: n.color }}>{n.label}</span>
                    <span className="dp-piece-loc">held by {captor?.name ?? '?'}</span>
                    <button className="dp-btn-escape"
                      onClick={() => sendMsg(wsRef.current, { type:'ESCAPE_PRISONER', pieceId: p.id })}>
                      ESCAPE
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Main piece list — click die to go directly to MOVE */}
        <div className="dp-assign-list">
          {myPieces.map(piece => {
            const opts      = eligibleDice(piece);
            const inHome    = piece.status === 'home' || piece.status === 'prisoner';
            const multiHome = inHome && homes.length > 1;
            const n         = pieceFullName(piece, players);
            const loc       = inHome ? 'HOME' : `SP.${piece.position}`;
            return (
              <div key={piece.id} className="dp-assign-row">
                <div className="dp-row-header">
                  <span className="dp-piece-badge" style={{ color: n.color }}>{n.label}</span>
                  <span className="dp-piece-loc">{loc}</span>
                </div>
                <div className="dp-assign-opts">
                  {opts.length > 0 ? (
                    opts.map(v => (
                      <button key={v} className="dp-btn-die"
                        onClick={() => assignAndMove(piece.id, v)}>
                        MOVE [{v}]
                      </button>
                    ))
                  ) : (
                    <span className="dp-no-opts">—</span>
                  )}
                  {multiHome && (
                    <select className="dp-home-select"
                      value={entryHomeIds[piece.id] ?? (homes.includes(piece.ownerId) ? piece.ownerId : homes[0])}
                      onChange={e => setEntryHomeId(piece.id, e.target.value)}>
                      {homes.map(hid => {
                        const c = players[hid]?.color ?? '';
                        return <option key={hid} value={hid}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>;
                      })}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    );
  }

  // ── MOVE ────────────────────────────────────────────────
  // With auto-end, the player only needs to hit the Move button once.
  if (phase === 'MOVE' && isMyTurn) {
    const sortedDice = currentDice ? [...currentDice].sort((a, b) => a - b) : [];
    const myPieces   = Object.values(pieces).filter(
      p => p.controllerId === myPlayerId && p.status !== 'dead' && assignments[p.id] !== undefined
    );
    const homes = controlledHomes(myPlayerId);

    function movePiece(piece) {
      const inHome      = piece.status === 'home' || piece.status === 'prisoner';
      const entryHomeId = inHome ? resolveEntryHome(piece, homes) : null;
      sendMsg(wsRef.current, { type:'MOVE_PIECE', pieceId: piece.id, entryHomeId });
    }
    function retreatPiece(piece) {
      const targetHomeId = entryHomeIds[piece.id] ?? homes[0] ?? myPlayerId;
      sendMsg(wsRef.current, { type:'RETREAT', pieceId: piece.id, targetHomeId });
    }
    function canRetreat(piece) {
      if (piece.status !== 'active') return false;
      if (assignments[piece.id] !== 3) return false;
      return controlledZoneSpaces(myPlayerId).includes(piece.position);
    }

    return (
      <div className="dice-panel">
        <PhaseSteps phase="MOVE" isMyTurn />
        <div className="dp-instruction my-turn">
          <div className="dp-instruction-text">EXECUTE</div>
          <div className="dp-instruction-sub">
            Move your piece —{' '}
            <button className="dp-btn-back"
              onClick={() => sendMsg(wsRef.current, { type: 'UNDO_ASSIGN' })}>
              change pick
            </button>
          </div>
        </div>

        {sortedDice.length > 0 && (
          <div className="dp-dice-row dp-dice-row--sm">
            {sortedDice.map((v, i) => {
              const inUse = Object.values(assignments).includes(v);
              return <DieCard key={i} value={v} rank={i+1} used={!inUse} readonly />;
            })}
          </div>
        )}

        <div className="dp-assign-list">
          {myPieces.map(piece => {
            const inHome       = piece.status === 'home' || piece.status === 'prisoner';
            const multiHome    = inHome && homes.length > 1;
            const retreatable  = canRetreat(piece);
            const n            = pieceFullName(piece, players);
            const loc          = inHome ? 'HOME' : `SP.${piece.position}`;
            const resolvedHome = inHome ? resolveEntryHome(piece, homes) : null;
            return (
              <div key={piece.id} className="dp-assign-row dp-assign-row--active">
                <div className="dp-row-header">
                  <span className="dp-piece-badge" style={{ color: n.color }}>{n.label}</span>
                  <span className="dp-piece-loc">{loc} — die [{assignments[piece.id]}]</span>
                </div>
                <div className="dp-assign-opts">
                  {multiHome && (
                    <select className="dp-home-select" value={resolvedHome}
                      onChange={e => setEntryHomeId(piece.id, e.target.value)}>
                      {homes.map(hid => {
                      const c = players[hid]?.color ?? '';
                      return <option key={hid} value={hid}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>;
                    })}
                    </select>
                  )}
                  <button className="dp-btn-die" onClick={() => movePiece(piece)}>MOVE</button>
                  {retreatable && (
                    <button className="dp-btn-retreat" onClick={() => retreatPiece(piece)}>
                      RETREAT
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Only shown if no pieces left (edge case fallback) */}
        {myPieces.length === 0 && (
          <button className="dp-btn-secondary"
            onClick={() => sendMsg(wsRef.current, { type:'END_MOVE' })}>
            END TURN
          </button>
        )}
      </div>
    );
  }

  // ── WAITING ─────────────────────────────────────────────
  if (phase !== 'GAME_OVER') {
    const activeName  = players[activePlayerId]?.name ?? '…';
    const activeColor = COLOR_HEX[players[activePlayerId]?.color];
    const sortedDice  = currentDice ? [...currentDice].sort((a, b) => a - b) : [];
    return (
      <div className="dice-panel">
        <PhaseSteps phase={phase ?? 'ROLL'} isMyTurn={false} />
        <div className="dp-instruction">
          <div className="dp-instruction-text">
            <span style={{ color: activeColor }}>{activeName}</span>
          </div>
          <div className="dp-instruction-sub">
            {{ ROLL:'Rolling…', ASSIGN:'Choosing a move…', MOVE:'Moving…' }[phase] ?? 'Waiting…'}
          </div>
        </div>
        {sortedDice.length > 0 && (
          <div className="dp-dice-row dp-dice-row--sm">
            {sortedDice.map((v, i) => (
              <DieCard key={i} value={v} rank={i+1} readonly />
            ))}
          </div>
        )}
        <p className="dp-waiting">Waiting for {activeName}…</p>
      </div>
    );
  }

  return null;
}

function pieceFullName(piece, players) {
  const color      = players[piece.ownerId]?.color ?? '';
  const colorLabel = color.charAt(0).toUpperCase() + color.slice(1);
  if (piece.type === 'general') return { label:`${colorLabel} General`, color: COLOR_HEX[color] };
  if (piece.type === 'spy') {
    const num = piece.id.endsWith('_S1') ? '1' : '2';
    return { label:`${colorLabel} Spy ${num}`, color: COLOR_HEX[color] };
  }
  // Soldier: T1 / T2 / T3
  const num = piece.id.endsWith('_T1') ? '1' : piece.id.endsWith('_T2') ? '2' : '3';
  return { label:`${colorLabel} Soldier ${num}`, color: COLOR_HEX[color] };
}
