// ============================================================
// CROWNFALL — Board.jsx  (REDESIGN v3 — Premium, no emojis)
//
// All game math IDENTICAL. Rendering redesigned:
//   • No emojis anywhere — pure SVG shapes + Cinzel text
//   • Piece icons: crown path (G), eye diamond (S), shield (T)
//   • Entry spaces: diamond SVG shape
//   • Corner decorations: cross/diamond SVG
//   • Home bases: richer gradient treatment
//   • Prisoner badge: crossed-swords SVG
// ============================================================

import { useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { sendMsg } from '../hooks/useGameSocket';

// ── Constants ─────────────────────────────────────────────────
// Clockwise board order: Crimson(red,0) → Bronze(orange,10) → Gold(yellow,20)
//                      → Emerald(green,30) → Sapphire(blue,40) → Silver(silver,50)
const BOARD_SIZE   = 60;
const ENTRY_POINTS = { red:0, orange:10, yellow:20, green:30, blue:40, silver:50 };
const COLOR_ZONE   = {
  red:    [57,58,59], orange: [7,8,9],  yellow: [17,18,19],
  green:  [27,28,29], blue:   [37,38,39], silver: [47,48,49],
};
const ROLL_OPTIONS = { general: 3, spy: 2, soldier: 1 };

// Official Crownfall faction colors
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
const COLOR_LIGHT = {
  red:'#FFD0D0', orange:'#FFDDAA', yellow:'#FFF0A0',
  green:'#B0FFD4', blue:'#C8D8FF', silver:'#F0F0F0',
};
// Clockwise zone order matches board positions 0-59
const ZONE_ORDER = ['red','orange','yellow','green','blue','silver'];

function zoneForSpace(i) { return ZONE_ORDER[Math.floor(i / 10)]; }

// ── Space positions (UNCHANGED) ───────────────────────────────
function spacePos(i) {
  const sp = 44, s = 100;
  if (i < 15)  return { x: s + i * sp,          y: 80 };
  if (i < 30)  return { x: 740,                  y: s + (i-15) * sp };
  if (i < 45)  return { x: s + (44-i) * sp,     y: 740 };
  /* 45–59 */  return { x: 60,                   y: s + (59-i) * sp };
}

const HOME_POS = {
  red:    { x: 265, y: 265 },
  orange: { x: 535, y: 265 },
  yellow: { x: 535, y: 400 },
  green:  { x: 535, y: 535 },
  blue:   { x: 265, y: 535 },
  silver: { x: 265, y: 400 },
};

function spaceSide(i) {
  if (i < 15)  return 'top';
  if (i < 30)  return 'right';
  if (i < 45)  return 'bottom';
  return 'left';
}

function rankEligible(pieceType, rank) { return rank <= ROLL_OPTIONS[pieceType]; }
function canAcceptDie(piece, selectedDie, pendingAssignments) {
  if (!selectedDie) return false;
  if (piece.status === 'dead') return false;
  if (pendingAssignments[piece.id] !== undefined) return false;
  const { value, rank } = selectedDie;
  if (!rankEligible(piece.type, rank)) return false;
  if (piece.status === 'home' || piece.status === 'prisoner') {
    if (value !== 1 && value !== 6) return false;
  }
  return true;
}

function buildZoneColorMap(empires, players) {
  const map = {};
  if (!empires || !players) return map;
  for (const [empireId, empire] of Object.entries(empires)) {
    const zones = empire.colorZone ?? [];
    if (!zones.length) continue;
    const controllerId = empire.homeControlledBy ?? empireId;
    const color = players[controllerId]?.color ?? players[empireId]?.color;
    if (!color) continue;
    for (const pos of zones) map[pos] = { hex: COLOR_HEX[color], color };
  }
  return map;
}

function connectorPoints(hx, hy, nx, ny) {
  let tBox = Infinity;
  if (nx < 0) tBox = Math.min(tBox, -40 / nx);
  if (nx > 0) tBox = Math.min(tBox, 40 / nx);
  if (ny < 0) tBox = Math.min(tBox, -36 / ny);
  if (ny > 0) tBox = Math.min(tBox, 36 / ny);
  const x0 = hx + nx * tBox, y0 = hy + ny * tBox;
  let tRect = Infinity;
  if (nx < 0) tRect = Math.min(tRect, (175 - hx) / nx);
  if (nx > 0) tRect = Math.min(tRect, (625 - hx) / nx);
  if (ny < 0) tRect = Math.min(tRect, (175 - hy) / ny);
  if (ny > 0) tRect = Math.min(tRect, (625 - hy) / ny);
  const x1 = hx + nx * tRect, y1 = hy + ny * tRect;
  return { x0, y0, x1, y1 };
}

// ── Piece icon shapes (SVG paths centered at 0,0) ─────────────

// Crown: base bar + 3 peaks
function CrownIcon({ size = 12, fill = 'white' }) {
  const s = size / 12;
  return (
    <g>
      <rect x={-9*s} y={3*s} width={18*s} height={4*s} rx={1*s} fill={fill} />
      <polygon points={`${-8*s},${3*s} ${-8*s},${-6*s} ${-3*s},${-1*s} 0,${-9*s} ${3*s},${-1*s} ${8*s},${-6*s} ${8*s},${3*s}`} fill={fill} />
    </g>
  );
}

// Hood/spy: teardrop shape + small eye
function SpyIcon({ size = 12, fill = 'white' }) {
  const s = size / 12;
  return (
    <g>
      <ellipse cx={0} cy={0} rx={6*s} ry={8*s} fill={fill} opacity={0.9} />
      <ellipse cx={0} cy={2*s} rx={2.5*s} ry={1.5*s} fill="rgba(0,0,0,0.5)" />
    </g>
  );
}

// Shield: rounded-top rectangle with pointed bottom
function ShieldIcon({ size = 12, fill = 'white' }) {
  const s = size / 12;
  return (
    <path d={`M${-6*s},${-8*s} A${6*s},${6*s} 0 0,1 ${6*s},${-8*s} L${6*s},${2*s} L0,${9*s} L${-6*s},${2*s} Z`}
      fill={fill} />
  );
}

// Generic piece icon dispatch
function PieceIcon({ type, size, fill }) {
  if (type === 'general') return <CrownIcon size={size} fill={fill} />;
  if (type === 'spy')     return <SpyIcon   size={size} fill={fill} />;
  return                         <ShieldIcon size={size} fill={fill} />;
}

// Diamond shape for entry spaces
function DiamondIcon({ x, y, r = 6, fill, stroke }) {
  return (
    <polygon
      points={`${x},${y-r} ${x+r*0.7},${y} ${x},${y+r} ${x-r*0.7},${y}`}
      fill={fill}
      stroke={stroke}
      strokeWidth={1.5}
    />
  );
}

// Ornamental cross for board corners
function CornerOrnament({ x, y, size = 10, fill }) {
  const s = size / 10;
  return (
    <g>
      <rect x={x - s} y={y - 8*s} width={2*s} height={16*s} rx={s} fill={fill} />
      <rect x={x - 8*s} y={y - s} width={16*s} height={2*s} rx={s} fill={fill} />
      <circle cx={x} cy={y} r={2.5*s} fill={fill} />
    </g>
  );
}

// ── Board component ───────────────────────────────────────────
export default function Board({ wsRef }) {
  const {
    gameState, selectedPieceId, pendingAssignments, selectedDie,
    hoveredPieceId,
    stageDiceAssignment, selectPiece, setHoveredPieceId,
    isMyTurn: isMyTurnFn, activeLocalPlayerId,
  } = useGameStore();

  const [tooltipPos,      setTooltipPos]      = useState(null);
  const [hoveredSpaceIdx, setHoveredSpaceIdx] = useState(null);
  const [spaceTooltipPos, setSpaceTooltipPos] = useState(null);
  const isMyTurn   = isMyTurnFn();
  const myPlayerId = activeLocalPlayerId();

  if (!gameState) return null;
  const { phase, pieces, players, assignments, currentDice, empires } = gameState;

  const zoneColorMap = useMemo(
    () => buildZoneColorMap(empires, players),
    [empires, players]
  );

  const activePieces = useMemo(() =>
    Object.values(pieces).filter(p => p.position !== null && p.status === 'active'),
    [pieces]
  );

  function handlePieceClick(piece) {
    if (!isMyTurn) return;
    if (phase === 'ASSIGN') {
      if (selectedDie) {
        if (canAcceptDie(piece, selectedDie, pendingAssignments)) {
          stageDiceAssignment(piece.id, selectedDie.value);
        }
      } else {
        selectPiece(piece.id);
      }
    } else if (phase === 'MOVE') {
      if (assignments[piece.id] !== undefined && piece.controllerId === myPlayerId) {
        const inHome      = piece.status === 'home' || piece.status === 'prisoner';
        const entryHomeId = inHome ? piece.ownerId : null;
        sendMsg(wsRef.current, { type: 'MOVE_PIECE', pieceId: piece.id, entryHomeId });
      }
    }
  }

  // ── Render track ──────────────────────────────────────────
  function renderTrack() {
    const spaces = [];
    for (let i = 0; i < BOARD_SIZE; i++) {
      const { x, y } = spacePos(i);
      const zone     = zoneForSpace(i);
      const zHex     = COLOR_HEX[zone];
      const zLight   = COLOR_LIGHT[zone];
      const isEntry  = Object.values(ENTRY_POINTS).includes(i);
      const isZone   = COLOR_ZONE[zone]?.includes(i);
      const liveZone = zoneColorMap[i];

      const side = spaceSide(i);
      const [tw, th] = (side === 'top' || side === 'bottom') ? [40, 30] : [30, 40];

      let tileFill, tileStroke, tileStrokeW;
      if (isEntry) {
        tileFill    = zHex;
        tileStroke  = COLOR_DARK[zone];
        tileStrokeW = 3;
      } else if (isZone) {
        tileStroke  = zHex;
        tileStrokeW = 2.5;
        tileFill    = (liveZone && liveZone.color !== zone)
          ? COLOR_HEX[liveZone.color] + '88'
          : zLight;
      } else if (liveZone) {
        tileFill    = liveZone.hex + '44';
        tileStroke  = liveZone.hex;
        tileStrokeW = 1.8;
      } else {
        tileFill    = '#3a2c18cc';
        tileStroke  = '#6a5030';
        tileStrokeW = 1.5;
      }

      spaces.push(
        <g key={`space-${i}`}
          onMouseEnter={e => { setHoveredSpaceIdx(i); setSpaceTooltipPos({ x: e.clientX, y: e.clientY }); }}
          onMouseLeave={() => { setHoveredSpaceIdx(null); setSpaceTooltipPos(null); }}
        >
          {/* Shadow */}
          <rect x={x-tw/2+1} y={y-th/2+2} width={tw} height={th} rx={6}
            fill="rgba(0,0,0,0.15)" />
          {/* Main tile */}
          <rect x={x-tw/2} y={y-th/2} width={tw} height={th} rx={6}
            fill={tileFill}
            stroke={tileStroke}
            strokeWidth={tileStrokeW}
          />
          {/* Hover overlay */}
          {hoveredSpaceIdx === i && (
            <rect x={x-tw/2} y={y-th/2} width={tw} height={th} rx={6}
              fill="rgba(255,255,255,0.18)" />
          )}
          {/* Entry: diamond icon */}
          {isEntry && (
            <DiamondIcon x={x} y={y} r={7}
              fill={COLOR_DARK[zone]} stroke="rgba(255,255,255,0.5)" />
          )}
          {/* Zone safe space: filled dot + conqueror indicator */}
          {isZone && !isEntry && (
            <>
              <circle cx={x} cy={y} r={4} fill={COLOR_DARK[zone]} opacity={0.75} />
              {liveZone && liveZone.color !== zone && (
                <circle cx={x+9} cy={y-9} r={3.5} fill={COLOR_HEX[liveZone.color]} opacity={0.95} />
              )}
            </>
          )}
        </g>
      );
    }
    return spaces;
  }

  // ── Space tooltip ─────────────────────────────────────────
  function renderSpaceTooltip() {
    if (hoveredSpaceIdx === null || !spaceTooltipPos) return null;
    const i       = hoveredSpaceIdx;
    const zone    = zoneForSpace(i);
    const isEntry = Object.values(ENTRY_POINTS).includes(i);
    const isZone  = COLOR_ZONE[zone]?.includes(i);
    const live    = zoneColorMap[i];

    const label = isEntry
      ? `${zone.charAt(0).toUpperCase() + zone.slice(1)} Entry`
      : isZone
        ? `${zone.charAt(0).toUpperCase() + zone.slice(1)} Safe Zone`
        : `Space ${i}`;

    const owner = live
      ? players[Object.keys(players).find(id => players[id].color === live.color)]?.name ?? live.color
      : zone.charAt(0).toUpperCase() + zone.slice(1);

    return (
      <div className="piece-tooltip" style={{ left: spaceTooltipPos.x + 14, top: spaceTooltipPos.y - 10 }}>
        <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: '0.72rem', color: live ? COLOR_HEX[live.color] : COLOR_HEX[zone] }}>
          {live && live.color !== zone ? `Conquered by ${owner}` : `Territory: ${owner}`}
        </div>
        {isZone && (
          <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
            Safe zone — retreat here with die=3
          </div>
        )}
      </div>
    );
  }

  // ── Render home bases ─────────────────────────────────────
  function renderHomes() {
    const colorToPlayerId = {};
    for (const [pid, player] of Object.entries(players)) {
      colorToPlayerId[player.color] = pid;
    }

    return Object.entries(HOME_POS).map(([color, { x, y }]) => {
      const hex   = COLOR_HEX[color];
      const dark  = COLOR_DARK[color];
      const light = COLOR_LIGHT[color];
      const ownerId   = colorToPlayerId[color];
      const homePieces = Object.values(pieces).filter(
        p => p.ownerId === ownerId && (p.status === 'home' || p.status === 'prisoner')
      );
      const entryIdx = ENTRY_POINTS[color];
      const { x: ex, y: ey } = spacePos(entryIdx);
      const dx = ex - x, dy = ey - y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const nx = dx / dist, ny = dy / dist;
      const { x0, y0, x1, y1 } = connectorPoints(x, y, nx, ny);

      // color name abbreviated
      const abbr = color.charAt(0).toUpperCase() + color.slice(1,3).toUpperCase();

      return (
        <g key={`home-${color}`}>
          {/* Connector line */}
          <line x1={x0} y1={y0} x2={x1} y2={y1}
            stroke={hex} strokeWidth={2}
            strokeDasharray="4,5" opacity={0.45}
          />
          {/* Arrow tip */}
          <polygon
            points={`${x1},${y1} ${x1-nx*9+ny*4},${y1-ny*9-nx*4} ${x1-nx*9-ny*4},${y1-ny*9+nx*4}`}
            fill={hex} opacity={0.6}
          />

          {/* Home base ring */}
          <circle cx={x} cy={y} r={40} fill={`url(#homeGrad-${color})`}
            stroke={dark} strokeWidth={2.5} filter="url(#homeShadow)" />
          {/* Inner decorative ring */}
          <circle cx={x} cy={y} r={32} fill="none"
            stroke={`${hex}44`} strokeWidth={1.5} strokeDasharray="3,4" />

          {/* Color label — Cinzel font */}
          <text x={x} y={y - 22} textAnchor="middle" fontSize="8"
            fontFamily="'Cinzel', Georgia, serif" fontWeight="700"
            letterSpacing="1.5"
            fill={dark}>
            {color.toUpperCase()}
          </text>

          {/* Home pieces */}
          {homePieces.map((piece, idx) => {
            const OFFSETS = [
              { ox:  0,  oy:  4 },
              { ox: -16, oy: -10 },
              { ox:  16, oy: -10 },
              { ox: -16, oy:  18 },
              { ox:  16, oy:  18 },
              { ox:  0,  oy: -22 },
            ];
            const off = OFFSETS[idx] ?? OFFSETS[0];
            const px = x + off.ox;
            const py = y + off.oy;

            const ownerHex   = hex;
            const isPrisoner = piece.controllerId !== piece.ownerId;
            const captorColor = isPrisoner ? players[piece.controllerId]?.color : null;
            const captorHex   = captorColor ? (COLOR_HEX[captorColor] ?? '#fff') : null;
            const isSelected  = selectedPieceId === piece.id;
            const isMyPiece   = piece.controllerId === myPlayerId;
            const spyNum      = piece.type === 'spy' ? (piece.id.endsWith('_S1') ? '1' : '2') : null;
            const soldierNum  = piece.type === 'soldier' ? (piece.id.endsWith('_T1') ? '1' : piece.id.endsWith('_T2') ? '2' : '3') : null;

            let isValid = false;
            if (isMyTurn && phase === 'ASSIGN' && selectedDie && isMyPiece)
              isValid = canAcceptDie(piece, selectedDie, pendingAssignments);
            else if (isMyTurn && phase === 'MOVE' && isMyPiece && gameState.assignments?.[piece.id] !== undefined)
              isValid = true;

            const pr = 14;
            return (
              <g key={piece.id}
                style={{ cursor: isMyPiece ? 'pointer' : 'default' }}
                onClick={() => handlePieceClick(piece)}
                onMouseEnter={e => { setHoveredPieceId(piece.id); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                onMouseLeave={() => { setHoveredPieceId(null); setTooltipPos(null); }}
              >
                {(isValid || isSelected) && (
                  <circle cx={px} cy={py} r={pr + 7} fill={`${ownerHex}1A`}
                    stroke={ownerHex} strokeWidth={1.5}
                    style={{ animation: 'piece-glow-pulse 1.2s ease-in-out infinite' }} />
                )}
                {isPrisoner && (
                  <circle cx={px} cy={py} r={pr + 4} fill="none"
                    stroke={captorHex} strokeWidth={3.5} opacity={0.9} />
                )}
                {/* Piece circle */}
                <circle cx={px} cy={py} r={pr}
                  fill={`url(#pieceGrad-${color})`}
                  stroke={isSelected ? 'white' : 'rgba(255,255,255,0.35)'}
                  strokeWidth={isSelected ? 2 : 1.5} />
                {/* Piece icon */}
                <g transform={`translate(${px},${py})`}>
                  <PieceIcon type={piece.type} size={13}
                    fill={isSelected ? 'white' : 'rgba(255,255,255,0.9)'} />
                </g>
                {/* Prisoner chain badge */}
                {isPrisoner && (
                  <g>
                    <circle cx={px + pr - 1} cy={py - pr + 1} r={7}
                      fill={captorHex} stroke="rgba(0,0,0,0.5)" strokeWidth={1} />
                    <text x={px + pr - 1} y={py - pr + 5} textAnchor="middle"
                      fontSize="8" fontWeight="900" fill="white" style={{ userSelect:'none' }}>
                      x
                    </text>
                  </g>
                )}
                {/* Spy / Soldier number badge */}
                {(spyNum || soldierNum) && (
                  <g>
                    <circle cx={px - pr + 3} cy={py + pr - 3} r={6}
                      fill="rgba(0,0,0,0.75)" stroke={ownerHex} strokeWidth={1} />
                    <text x={px - pr + 3} y={py + pr} textAnchor="middle"
                      fontSize="8" fontWeight="900" fill="white" style={{ userSelect:'none' }}>
                      {spyNum ?? soldierNum}
                    </text>
                  </g>
                )}
                {/* Die badge */}
                {gameState.assignments?.[piece.id] !== undefined && (
                  <g>
                    <circle cx={isPrisoner ? px - pr + 3 : px + pr} cy={py - pr}
                      r={7} fill="#C9A227" stroke="rgba(0,0,0,0.4)" strokeWidth={1} />
                    <text x={isPrisoner ? px - pr + 3 : px + pr} y={py - pr + 4}
                      textAnchor="middle" fontSize="9" fontWeight="900" fill="#1a1208">
                      {gameState.assignments[piece.id]}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      );
    });
  }

  // ── Render on-board pieces ────────────────────────────────
  function renderPieces() {
    const byPos = {};
    for (const piece of activePieces) {
      const k = piece.position;
      if (!byPos[k]) byPos[k] = [];
      byPos[k].push(piece);
    }

    return activePieces.map(piece => {
      const { x: cx, y: cy } = spacePos(piece.position);
      const stack  = byPos[piece.position];
      const idx    = stack.indexOf(piece);
      const total  = stack.length;
      const ox     = total > 1 ? (idx - (total-1)/2) * 14 : 0;
      const oy     = total > 1 ? (idx % 2) * -8 : 0;

      const ownerColor  = players[piece.ownerId]?.color ?? 'red';
      const ctrlColor   = players[piece.controllerId]?.color ?? ownerColor;
      const ownerHex    = COLOR_HEX[ownerColor] ?? '#999';
      const ctrlHex     = COLOR_HEX[ctrlColor]  ?? ownerHex;

      const isSelected    = selectedPieceId === piece.id;
      const isMyPiece     = piece.controllerId === myPlayerId;
      const isPrisoner    = piece.controllerId !== piece.ownerId;
      const hasAssignment = assignments?.[piece.id] !== undefined;
      const spyNum        = piece.type === 'spy' ? (piece.id.endsWith('_S1') ? '1' : '2') : null;
      const soldierNum    = piece.type === 'soldier' ? (piece.id.endsWith('_T1') ? '1' : piece.id.endsWith('_T2') ? '2' : '3') : null;
      const captorColor   = isPrisoner ? (players[piece.controllerId]?.color ?? null) : null;
      const captorHex     = captorColor ? (COLOR_HEX[captorColor] ?? '#fff') : null;

      let isValid = false;
      if (isMyTurn && phase === 'ASSIGN' && selectedDie && isMyPiece) {
        isValid = canAcceptDie(piece, selectedDie, pendingAssignments);
      } else if (isMyTurn && phase === 'MOVE' && isMyPiece && hasAssignment) {
        isValid = true;
      }

      const pieceClass = [
        'board-piece',
        isValid    ? 'board-piece--valid'    : '',
        isSelected ? 'board-piece--selected' : '',
      ].filter(Boolean).join(' ');

      const pieceR = 19;

      return (
        <g key={piece.id}
          className={pieceClass}
          style={{ transform: `translate(${cx + ox}px, ${cy + oy}px)`, cursor: isMyTurn && isMyPiece ? 'pointer' : 'default' }}
          onClick={() => handlePieceClick(piece)}
          onMouseEnter={e => { setHoveredPieceId(piece.id); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
          onMouseLeave={() => { setHoveredPieceId(null); setTooltipPos(null); }}
        >
          {/* Glow ring */}
          {(isSelected || isValid) && (
            <circle r={pieceR + 8}
              fill={`${ownerHex}1A`}
              stroke={ownerHex}
              strokeWidth={2}
              style={{ animation: 'piece-glow-pulse 1.2s ease-in-out infinite' }}
            />
          )}
          {/* Prisoner outer ring */}
          {isPrisoner && (
            <circle r={pieceR + 4} fill="none"
              stroke={captorHex} strokeWidth={4} opacity={0.9} />
          )}
          {/* Drop shadow */}
          <ellipse cx={1} cy={pieceR + 4} rx={pieceR - 2} ry={5}
            fill="rgba(0,0,0,0.3)" />
          {/* Main circle — owner color */}
          <circle r={pieceR} fill={`url(#pieceGrad-${ownerColor})`}
            stroke={isSelected ? 'white' : 'rgba(255,255,255,0.3)'}
            strokeWidth={isSelected ? 2.5 : 1.5} />
          {/* Piece icon */}
          <PieceIcon type={piece.type} size={16}
            fill={isSelected ? 'white' : 'rgba(255,255,255,0.92)'} />
          {/* Prisoner badge */}
          {isPrisoner && (
            <g>
              <circle cx={pieceR - 1} cy={-pieceR + 1} r={8}
                fill={captorHex} stroke="rgba(0,0,0,0.4)" strokeWidth={1} />
              <text x={pieceR - 1} y={-pieceR + 5} textAnchor="middle"
                fontSize="10" fontWeight="900" fill="white" style={{ userSelect:'none' }}>
                x
              </text>
            </g>
          )}
          {/* Spy / Soldier number badge */}
          {(spyNum || soldierNum) && (
            <g>
              <circle cx={-pieceR + 5} cy={pieceR - 5} r={7}
                fill="rgba(0,0,0,0.75)" stroke={ownerHex} strokeWidth={1.5} />
              <text x={-pieceR + 5} y={pieceR - 2} textAnchor="middle"
                fontSize="9" fontWeight="900" fill="white" style={{ userSelect:'none' }}>
                {spyNum ?? soldierNum}
              </text>
            </g>
          )}
          {/* Die assignment badge */}
          {assignments?.[piece.id] !== undefined && (
            <g>
              <circle cx={isPrisoner ? -pieceR + 5 : pieceR} cy={-pieceR}
                r={8} fill="#C9A227" stroke="rgba(0,0,0,0.4)" strokeWidth={1} />
              <text x={isPrisoner ? -pieceR + 5 : pieceR} y={-pieceR + 4}
                textAnchor="middle" fontSize="10" fontWeight="900" fill="#1a1208">
                {assignments[piece.id]}
              </text>
            </g>
          )}
        </g>
      );
    });
  }

  // ── Tooltip ───────────────────────────────────────────────
  const hoveredPiece = hoveredPieceId ? pieces[hoveredPieceId] : null;
  function renderTooltip() {
    if (!hoveredPiece || !tooltipPos) return null;
    const ownerColor = players[hoveredPiece.ownerId]?.color ?? '';
    const ctrlColor  = players[hoveredPiece.controllerId]?.color ?? ownerColor;
    const isPrisoner = hoveredPiece.controllerId !== hoveredPiece.ownerId;
    const typeLabel  = hoveredPiece.type.charAt(0).toUpperCase() + hoveredPiece.type.slice(1);
    return (
      <div className="piece-tooltip" style={{ left: tooltipPos.x + 14, top: tooltipPos.y - 10 }}>
        <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 2 }}>
          {typeLabel}
        </div>
        <div style={{ color: COLOR_HEX[ownerColor] ?? 'white', fontSize: '0.75rem' }}>
          {players[hoveredPiece.ownerId]?.name ?? '?'}
        </div>
        {isPrisoner && (
          <div style={{ color: COLOR_HEX[ctrlColor] ?? 'white', fontSize: '0.75rem' }}>
            Held by: {players[hoveredPiece.controllerId]?.name ?? '?'}
          </div>
        )}
        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
          {hoveredPiece.status === 'home'     ? 'At Home' :
           hoveredPiece.status === 'prisoner' ? 'Imprisoned' :
           `Space ${hoveredPiece.position}`}
        </div>
      </div>
    );
  }

  // ── Full SVG render ───────────────────────────────────────
  return (
    <>
      <svg viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg"
        style={{ width:'100%', height:'100%', maxWidth:'100%', maxHeight:'100%', display:'block' }}
      >
        <defs>
          <radialGradient id="boardGrad" cx="50%" cy="50%">
            <stop offset="0%"   stopColor="#2e2010" />
            <stop offset="100%" stopColor="#1a1208" />
          </radialGradient>
          <radialGradient id="centerGrad" cx="50%" cy="50%">
            <stop offset="0%"   stopColor="#261a0c" />
            <stop offset="100%" stopColor="#180e06" />
          </radialGradient>

          {/* Piece gradients */}
          {Object.entries(COLOR_HEX).map(([color, hex]) => (
            <radialGradient key={color} id={`pieceGrad-${color}`} cx="35%" cy="30%">
              <stop offset="0%"   stopColor={hex} stopOpacity="1" />
              <stop offset="100%" stopColor={COLOR_DARK[color]} stopOpacity="1" />
            </radialGradient>
          ))}

          {/* Home gradients */}
          {Object.entries(COLOR_HEX).map(([color, hex]) => (
            <radialGradient key={color} id={`homeGrad-${color}`} cx="35%" cy="30%">
              <stop offset="0%"   stopColor={COLOR_LIGHT[color]} />
              <stop offset="100%" stopColor={hex + '55'} />
            </radialGradient>
          ))}

          <filter id="homeShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="rgba(0,0,0,0.3)" />
          </filter>
          <filter id="boardShadow" x="-5%" y="-5%" width="110%" height="110%">
            <feDropShadow dx="0" dy="8" stdDeviation="16" floodColor="rgba(0,0,0,0.45)" />
          </filter>
        </defs>

        {/* ── Board background ── */}
        <rect x="20" y="20" width="760" height="760" rx="24"
          fill="url(#boardGrad)" filter="url(#boardShadow)" />
        {/* Primary gold border */}
        <rect x="20" y="20" width="760" height="760" rx="24"
          fill="none" stroke="#C9A227" strokeWidth="4.5" />
        {/* Inner gold accent line */}
        <rect x="28" y="28" width="744" height="744" rx="20"
          fill="none" stroke="rgba(232,184,75,0.35)" strokeWidth="1" />

        {/* ── Corner ornaments (SVG cross, no emoji) ── */}
        {[
          { x: 50, y: 50 }, { x: 750, y: 50 },
          { x: 750, y: 750 }, { x: 50, y: 750 },
        ].map(({ x, y }, i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={16} fill="#D4A820" opacity={0.25} />
            <CornerOrnament x={x} y={y} size={11} fill="rgba(212,168,32,0.8)" />
          </g>
        ))}

        {/* ── Track road background (stone channel) ── */}
        <rect x="82" y="62"  width="636" height="38"  rx="8" fill="#5a4020" opacity={0.45} />
        <rect x="82" y="720" width="636" height="38"  rx="8" fill="#5a4020" opacity={0.45} />
        <rect x="42" y="82"  width="38"  height="636" rx="8" fill="#5a4020" opacity={0.45} />
        <rect x="720" y="82" width="38"  height="636" rx="8" fill="#5a4020" opacity={0.45} />

        {/* ── Center area ── */}
        <rect x="178" y="178" width="444" height="444" rx="18"
          fill="url(#centerGrad)" stroke="rgba(200,170,80,0.5)" strokeWidth="2" />

        {/* Center logo watermark */}
        <image href="/logo.png" x="310" y="310" width="180" height="180"
          opacity="0.20" style={{ mixBlendMode: 'luminosity' }} />

        {/* ── Track spaces ── */}
        {renderTrack()}

        {/* ── Home bases & connectors ── */}
        {renderHomes()}

        {/* ── On-board pieces ── */}
        {renderPieces()}
      </svg>

      {/* Tooltips */}
      {renderTooltip()}
      {renderSpaceTooltip()}
    </>
  );
}
