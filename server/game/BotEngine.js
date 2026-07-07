// ============================================================
// CROWNFALL — BotEngine.js  (v5: genuinely differentiated difficulty)
//
// Difficulty levels — each has a distinct play-feel:
//
//   easy       — High randomness (70%). Often ignores kills.
//                Meanders. New players won't feel threatened.
//
//   medium     — Smart but not scary. Takes kills when close,
//                hunts any enemy, no danger-avoidance.
//
//   hard       — Hunts Generals exclusively. Kills weighted 5×.
//                Avoids landing in danger zones.
//
//   impossible — Perfect greedy play. Kills weighted 10×.
//                Massive danger penalty. Will dismantle you.
//
// ============================================================

import { PIECE_STATUS, PIECE_TYPES, BOARD_SIZE, ENTRY_POINTS, ROLL_OPTIONS } from './constants.js';
import { GameEngine } from './GameEngine.js';
import { computeTarget } from './rules/Movement.js';
import { getControlledHomes, isEnslaveable } from './rules/Empire.js';

const BOT_DELAY_MS = 700;

// ── Difficulty config ─────────────────────────────────────────
//
// randomChance   — probability [0,1] the bot ignores its scoring and acts randomly
// killScore      — pts awarded for landing on an enemy piece
// generalBonus   — extra pts when the killed/chased piece is a General
// proximityMax   — max pts from closing distance to enemy (0 = no proximity bonus)
// generalOnly    — if true, only chase Generals (not all enemies)
// dangerPenalty  — pts deducted per enemy piece that can reach target in 1–6 steps
// missKillChance — probability the bot skips an available kill entirely (Easy sloppiness)

const DIFF = {
  easy: {
    randomChance:   0.70,
    killScore:       150,
    generalBonus:   1000,
    proximityMax:      0,
    generalOnly:   false,
    dangerPenalty:     0,
    missKillChance:  0.55,
  },
  medium: {
    randomChance:   0.00,
    killScore:      1000,
    generalBonus:   8000,
    proximityMax:     40,
    generalOnly:   false,
    dangerPenalty:     0,
    missKillChance:  0.00,
  },
  hard: {
    randomChance:   0.00,
    killScore:      5000,
    generalBonus:  40000,
    proximityMax:     80,
    generalOnly:    true,
    dangerPenalty:    60,
    missKillChance:  0.00,
  },
  impossible: {
    randomChance:   0.00,
    killScore:     10000,
    generalBonus: 100000,
    proximityMax:    120,
    generalOnly:    true,
    dangerPenalty:   200,
    missKillChance:  0.00,
  },
  // ── Worst-move: used when a player's turn timer expires ──────
  // Inverted scoring: avoid kills, want danger, expose General.
  worst: {
    randomChance:    0.00,
    killScore:      -2000,  // landing on enemies is BAD for worst-move
    generalBonus:   -8000,  // especially avoid killing enemy Generals
    proximityMax:       0,  // don't move toward enemies
    generalOnly:    false,
    dangerPenalty:   -120,  // negative → score += 120 * dangerCount (seek danger)
    missKillChance:  0.00,
  },
};

function cfg(difficulty) {
  return DIFF[difficulty] ?? DIFF.medium;
}

// ── Needs an entry die (piece is off the board) ───────────────
function needsEntryDie(piece) {
  return piece.status === PIECE_STATUS.HOME ||
         (piece.status === PIECE_STATUS.PRISONER && piece.position === null);
}

// ── Main bot turn loop ────────────────────────────────────────

export async function runBotTurn(botPlayerId, state, broadcastFn, room = null) {
  const difficulty = room?.players?.find(p => p.id === botPlayerId)?.difficulty ?? 'medium';

  try {
    while (state.activePlayerId === botPlayerId && state.phase === 'ROLL') {

      await pause(room);

      // ── 1. Roll ─────────────────────────────────────────
      const rollResult = GameEngine.rollDice(botPlayerId, state);
      if (!rollResult.ok) return;
      broadcastFn();

      await pause(room);

      // ── 2a. Special actions (die=4) ──────────────────────
      if (state.currentDice && state.currentDice.includes(4)) {
        // Try escape first (own imprisoned pieces)
        const imprisoned = Object.values(state.pieces).filter(p =>
          p.ownerId === botPlayerId &&
          p.controllerId !== botPlayerId &&
          p.status !== PIECE_STATUS.DEAD
        );
        if (imprisoned.length > 0) {
          const typePrio = { general: 0, spy: 1, soldier: 2 };
          imprisoned.sort((a, b) => typePrio[a.type] - typePrio[b.type]);
          const r = GameEngine.escape(botPlayerId, imprisoned[0].id, state);
          if (r.ok) { broadcastFn(); continue; }
        }

        // Try enslave (free or already-enslaved pieces)
        const enslaveable = Object.values(state.pieces).filter(p =>
          isEnslaveable(p, botPlayerId, state)
        );
        if (enslaveable.length > 0) {
          // Prefer Generals, then Spies, then Soldiers
          const typePrio = { general: 0, spy: 1, soldier: 2 };
          enslaveable.sort((a, b) => typePrio[a.type] - typePrio[b.type]);
          const r = GameEngine.enslave(botPlayerId, enslaveable[0].id, state);
          if (r.ok) { broadcastFn(); continue; }
        }
      }

      // ── 2b. If no controllable pieces, skip ─────────────
      const controllable = Object.values(state.pieces).filter(
        p => p.controllerId === botPlayerId && p.status !== PIECE_STATUS.DEAD
      );
      if (controllable.length === 0) {
        GameEngine.assignDice(botPlayerId, {}, state);
        if (state.phase === 'MOVE') GameEngine.endMovePhase(botPlayerId, state);
        broadcastFn();
        continue;
      }

      // ── 2c. Assign dice ──────────────────────────────────
      const assignments = botAssignDice(botPlayerId, state, difficulty);
      let assignResult = GameEngine.assignDice(botPlayerId, assignments, state);
      if (!assignResult.ok) {
        console.warn(`[Bot ${botPlayerId}] Assignment failed: ${assignResult.error} — using empty`);
        assignResult = GameEngine.assignDice(botPlayerId, {}, state);
        if (!assignResult.ok) {
          console.error(`[Bot ${botPlayerId}] Empty assignment also failed: ${assignResult.error}`);
          return;
        }
      }
      broadcastFn();

      if (Object.keys(assignments).length === 0) {
        GameEngine.endMovePhase(botPlayerId, state);
        broadcastFn();
        continue;
      }

      await pause(room);

      // ── 3. Execute moves ─────────────────────────────────
      const moveOrder = botPrioritizeMoves(botPlayerId, state, difficulty);
      for (const { pieceId, entryHomeId } of moveOrder) {
        if (state.phase !== 'MOVE') break;
        if (!state.assignments[pieceId]) continue;

        const moveResult = GameEngine.movePiece(botPlayerId, pieceId, entryHomeId, state);
        if (moveResult.ok) {
          broadcastFn();
          await pause(room);
        }
        if (state.phase === 'GAME_OVER') return;
      }

      // ── 4. End move phase ────────────────────────────────
      if (state.phase === 'MOVE') {
        GameEngine.endMovePhase(botPlayerId, state);
        broadcastFn();
      }
    }
  } catch (err) {
    console.error('[Bot] Error during bot turn:', err);
  }
}

// ── Delay helper ──────────────────────────────────────────────

function pause(room) {
  // Always yield the event loop first (prevents blocking when botFastMode chains rapidly)
  const yieldLoop = () => new Promise(resolve => setImmediate(resolve));
  if (room?.botFastMode) return yieldLoop();
  // Store an interrupt function so handleSkipBot can immediately resolve this pause
  return new Promise(resolve => {
    const timer = setTimeout(resolve, BOT_DELAY_MS);
    if (room) {
      room._skipResolve = () => { clearTimeout(timer); resolve(); };
    }
  });
}

// ── Dice assignment AI ────────────────────────────────────────

function botAssignDice(botPlayerId, state, difficulty = 'medium') {
  const c = cfg(difficulty);
  const dice = [...state.currentDice];
  const myPieces = Object.values(state.pieces).filter(
    p => p.controllerId === botPlayerId && p.status !== PIECE_STATUS.DEAD
  );

  const typePriority = { general: 0, spy: 1, soldier: 2 };
  const sorted = [...myPieces].sort((a, b) => typePriority[a.type] - typePriority[b.type]);

  const assignments = {};
  const pool = [...dice];

  for (const piece of sorted) {
    const options  = ROLL_OPTIONS[piece.type];
    const eligible = pool.slice(0, options);

    const validValues = eligible.filter(v => {
      if (needsEntryDie(piece)) return v === 1 || v === 6;
      return true;
    });

    if (validValues.length === 0) continue;

    let bestValue;

    // Full random chance — pick any valid die regardless of quality
    if (c.randomChance > 0 && Math.random() < c.randomChance) {
      bestValue = validValues[Math.floor(Math.random() * validValues.length)];
    } else {
      bestValue = pickBestDie(piece, validValues, botPlayerId, state, difficulty);
    }

    assignments[piece.id] = bestValue;
    // ── 1-piece-per-turn rule: only assign one die ──
    break;
  }

  return assignments;
}

function pickBestDie(piece, validValues, botPlayerId, state, difficulty) {
  // Off-board: always prefer 6 (fastest entry), then highest available
  if (needsEntryDie(piece)) {
    return validValues.includes(6) ? 6 : validValues[validValues.length - 1];
  }

  let bestVal   = validValues[validValues.length - 1];
  let bestScore = -Infinity;

  for (const val of validValues) {
    const target = computeTarget(piece.position, val);
    const score  = scorePosition(piece, target, botPlayerId, state, difficulty);
    if (score > bestScore) { bestScore = score; bestVal = val; }
  }
  return bestVal;
}

// ── Move prioritization AI ────────────────────────────────────

function botPrioritizeMoves(botPlayerId, state, difficulty = 'medium') {
  const c = cfg(difficulty);
  const moves = [];
  const myPieces = Object.values(state.pieces).filter(
    p => p.controllerId === botPlayerId && state.assignments[p.id] !== undefined
  );
  const controlledHomes = getControlledHomes(botPlayerId, state);

  for (const piece of myPieces) {
    const dieVal = state.assignments[piece.id];

    if (needsEntryDie(piece)) {
      // Pick best entry home
      let bestHome  = piece.ownerId;
      let bestScore = -Infinity;
      for (const homeId of controlledHomes) {
        const color = state.players[homeId]?.color;
        const ep    = ENTRY_POINTS[color];
        if (ep === undefined) continue;
        const s = scorePosition(piece, ep, botPlayerId, state, difficulty);
        if (s > bestScore) { bestScore = s; bestHome = homeId; }
      }
      moves.push({ pieceId: piece.id, entryHomeId: bestHome, score: bestScore + 200 });
    } else {
      const target = computeTarget(piece.position, dieVal);

      // Easy: chance to randomly deprioritize a move (including kills)
      if (c.randomChance > 0 && Math.random() < c.randomChance) {
        moves.push({ pieceId: piece.id, entryHomeId: null, score: Math.random() * 50 });
      } else {
        let score = scorePosition(piece, target, botPlayerId, state, difficulty);

        // missKillChance: Easy bot sometimes ignores kills (simulate inattention)
        if (c.missKillChance > 0 && Math.random() < c.missKillChance) {
          // Wipe the kill bonus — bot "doesn't notice"
          score = Math.min(score, 50);
        }

        moves.push({ pieceId: piece.id, entryHomeId: null, score });
      }
    }
  }

  moves.sort((a, b) => b.score - a.score);
  return moves;
}

// ── Position scoring ──────────────────────────────────────────

function scorePosition(movingPiece, targetPos, botPlayerId, state, difficulty = 'medium') {
  const c = cfg(difficulty);
  let score = 0;

  // Score pieces at the target position
  const atTarget = Object.values(state.pieces).filter(
    p => p.position === targetPos && p.status === PIECE_STATUS.ACTIVE
  );
  for (const target of atTarget) {
    if (target.controllerId === botPlayerId) continue;
    const isGeneral = target.type === PIECE_TYPES.GENERAL;
    score += isGeneral
      ? c.killScore + c.generalBonus
      : c.killScore;
  }

  // Proximity bonus: how close does this move get us to the nearest enemy?
  if (c.proximityMax > 0) {
    const enemies = Object.values(state.pieces).filter(p => {
      if (p.controllerId === botPlayerId) return false;
      if (p.status !== PIECE_STATUS.ACTIVE) return false;
      if (p.position === null) return false;
      if (c.generalOnly && p.type !== PIECE_TYPES.GENERAL) return false;
      return true;
    });

    if (enemies.length > 0) {
      const minDist = Math.min(...enemies.map(e => clockwiseDist(targetPos, e.position)));
      // Full bonus at dist=0, falls off linearly, 0 at dist=proximityMax
      score += Math.max(0, c.proximityMax - minDist);
    }
  }

  // Danger penalty: deduct pts for each enemy that can reach targetPos in 1–6 steps
  if (c.dangerPenalty > 0) {
    const dangerCount = Object.values(state.pieces).filter(p =>
      p.controllerId !== botPlayerId &&
      p.status === PIECE_STATUS.ACTIVE &&
      p.position !== null &&
      clockwiseDist(p.position, targetPos) <= 6
    ).length;
    score -= dangerCount * c.dangerPenalty;
  }

  return score;
}

function clockwiseDist(from, to) {
  return (to - from + BOARD_SIZE) % BOARD_SIZE;
}

// ── Worst-move engine (called when a player's turn timer expires) ─
//
// Picks the assignment + move with the LOWEST score under inverted heuristics:
//   - Negative kill bonus  → avoid landing on enemies
//   - Negative danger penalty → prefer landing in threat range
//   - Prioritizes the General (most painful piece to expose)
// If the roll has no valid moves the existing auto-skip in rollDice fires instead.
// ─────────────────────────────────────────────────────────────────

function worstAssignDice(playerId, state) {
  const dice     = [...state.currentDice];
  const myPieces = Object.values(state.pieces).filter(
    p => p.controllerId === playerId && p.status !== PIECE_STATUS.DEAD
  );

  // General → Spy → Soldier: expose the most valuable piece first
  const typePriority = { general: 0, spy: 1, soldier: 2 };
  const sorted = [...myPieces].sort((a, b) => typePriority[a.type] - typePriority[b.type]);

  for (const piece of sorted) {
    const options  = ROLL_OPTIONS[piece.type];
    const eligible = dice.slice(0, options);

    const validValues = eligible.filter(v => {
      if (needsEntryDie(piece)) return v === 1 || v === 6;
      return true;
    });

    if (validValues.length === 0) continue;

    let worstValue = validValues[0];
    let worstScore = Infinity;

    for (const val of validValues) {
      let s;
      if (needsEntryDie(piece)) {
        // Entry: prefer die=1 (tiny move, easier to threaten)
        s = val === 1 ? 0 : 10;
      } else {
        const target = computeTarget(piece.position, val);
        s = scorePosition(piece, target, playerId, state, 'worst');
      }
      if (s < worstScore) { worstScore = s; worstValue = val; }
    }

    return { [piece.id]: worstValue }; // 1-piece-per-turn
  }
  return {};
}

function worstPrioritizeMoves(playerId, state) {
  const moves = [];
  const myPieces = Object.values(state.pieces).filter(
    p => p.controllerId === playerId && state.assignments[p.id] !== undefined
  );
  const controlledHomes = getControlledHomes(playerId, state);

  for (const piece of myPieces) {
    const dieVal = state.assignments[piece.id];

    if (needsEntryDie(piece)) {
      let worstHome  = controlledHomes[0] ?? piece.ownerId;
      let worstScore = Infinity;
      for (const homeId of controlledHomes) {
        const color = state.players[homeId]?.color;
        const ep    = ENTRY_POINTS[color];
        if (ep === undefined) continue;
        const s = scorePosition(piece, ep, playerId, state, 'worst');
        if (s < worstScore) { worstScore = s; worstHome = homeId; }
      }
      moves.push({ pieceId: piece.id, entryHomeId: worstHome, score: worstScore });
    } else {
      const target = computeTarget(piece.position, dieVal);
      const score  = scorePosition(piece, target, playerId, state, 'worst');
      moves.push({ pieceId: piece.id, entryHomeId: null, score });
    }
  }

  // Ascending — worst (lowest) score first
  moves.sort((a, b) => a.score - b.score);
  return moves;
}

/**
 * Execute one complete worst-move turn for a player whose timer expired.
 * Rolls if needed, assigns the lowest-scored die/piece combo, executes it.
 * If rollDice auto-skips (no valid moves), that's handled internally.
 * broadcastFn is called after each state-changing step.
 */
export function runWorstMoveTurn(playerId, state, broadcastFn) {
  if (state.activePlayerId !== playerId) return;
  if (state.phase === 'GAME_OVER') return;

  // ── Step 1: Roll if haven't yet ───────────────────────────────
  if (state.phase === 'ROLL') {
    const r = GameEngine.rollDice(playerId, state);
    if (!r.ok) return;
    broadcastFn();
    // rollDice may have auto-skipped (no valid moves) — if so, done
    if (r.autoSkipped) return;
  }

  if (state.activePlayerId !== playerId) return; // turn changed unexpectedly
  if (state.phase !== 'ASSIGN') return;

  // ── Step 2: Assign the worst die/piece combo ──────────────────
  const assignments = worstAssignDice(playerId, state);
  const assignResult = GameEngine.assignDice(playerId, assignments, state);
  if (!assignResult.ok) {
    // Fallback: empty assignment → end turn
    GameEngine.endMovePhase?.(playerId, state);
    broadcastFn();
    return;
  }
  broadcastFn();

  if (state.phase !== 'MOVE' || state.activePlayerId !== playerId) return;

  // ── Step 3: Execute the worst move ───────────────────────────
  const moveOrder = worstPrioritizeMoves(playerId, state);
  for (const { pieceId, entryHomeId } of moveOrder) {
    if (state.phase !== 'MOVE') break;
    if (!state.assignments[pieceId]) continue;
    const r = GameEngine.movePiece(playerId, pieceId, entryHomeId, state);
    if (r.ok) broadcastFn();
    if (state.phase === 'GAME_OVER') return;
    break; // only one piece per turn
  }

  // ── Step 4: End move phase ────────────────────────────────────
  if (state.phase === 'MOVE' && state.activePlayerId === playerId) {
    GameEngine.endMovePhase(playerId, state);
    broadcastFn();
  }
}
