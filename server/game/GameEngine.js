// ============================================================
// CROWNFALL — GameEngine.js  (v6: new enslave/escape/release)
//
// v6 changes:
//   - enslave(): now requires die=4 (not 1+3+6). Targets free pieces.
//   - escape(): original owner uses die=4 to attempt escaping their
//     piece from a captor. Consumes the 4. Ends turn.
//   - release(): NEW — controller voluntarily frees a prisoner.
//     No dice required. Ends turn immediately.
//   - Old "escape" (controller releasing) → now called release().
// ============================================================

import { PHASES, PIECE_STATUS, PIECE_TYPES, ROLL_OPTIONS, ENTRY_DICE } from './constants.js';
import { rollDice, validateAssignments } from './rules/Dice.js';
import { validateMove, validateRetreat } from './rules/Movement.js';
import { resolveCombat, applyKill, bonusTurnsFromCombat } from './rules/Combat.js';
import {
  transferEmpire, resolveControllerDeath,
  checkWinCondition, getControlledHomes,
  isFree, isEnslaveable, getFreePieces, hasDieFour,
} from './rules/Empire.js';
import { appendLog, advanceTurn } from './GameState.js';

// ── Helpers ───────────────────────────────────────────────────

/**
 * Check whether the active player has at least one valid piece→die pairing
 * for movement (not enslave/escape). Used to detect "no moves" for auto-skip.
 */
/**
 * True only if die=4 exists AND there's at least one valid enslave or escape target.
 * A 4 with no targets should NOT block auto-skip.
 */
function hasValidDieFourAction(playerId, dice, state) {
  if (!hasDieFour(dice)) return false;
  // Can enslave any piece?
  if (Object.values(state.pieces).some(p => isEnslaveable(p, playerId, state))) return true;
  // Can escape? — own piece currently imprisoned by an enemy
  if (Object.values(state.pieces).some(p =>
    p.ownerId       === playerId &&
    p.controllerId  !== playerId &&
    p.status        !== PIECE_STATUS.DEAD
  )) return true;
  return false;
}

function hasAnyValidMoveAssignment(playerId, dice, state) {
  const myPieces = Object.values(state.pieces).filter(p =>
    p.controllerId === playerId && p.status !== PIECE_STATUS.DEAD
  );
  for (const piece of myPieces) {
    const rollOptions  = ROLL_OPTIONS[piece.type];
    const eligibleDice = dice.slice(0, rollOptions); // pool is sorted asc; take first N

    const needsEntry = piece.status === PIECE_STATUS.HOME ||
                       (piece.status === PIECE_STATUS.PRISONER && piece.position === null);

    for (const dieValue of eligibleDice) {
      if (needsEntry && !ENTRY_DICE.has(dieValue)) continue;
      return true;
    }
  }
  return false;
}

function pieceName(piece, players) {
  const color = players[piece.ownerId]?.color ?? '';
  const label = color.charAt(0).toUpperCase() + color.slice(1);
  const type  = piece.type === PIECE_TYPES.GENERAL ? 'General'
              : piece.type === PIECE_TYPES.SPY     ? 'Spy'
              : 'Soldier';
  return `${label} ${type}`;
}

function playerName(pid, players) {
  return players[pid]?.name ?? pid;
}

function finishTurn(playerId, state) {
  state.assignments = {};
  state.currentDice = null;

  if (state.bonusTurnQueue > 0) {
    state.bonusTurnQueue -= 1;
    state.phase = PHASES.ROLL;
    appendLog(state, `+ BONUS TURN — ${playerName(playerId, state.players)} rolls again`, 'bonus');
    return { type: 'BONUS_TURN', playerId };
  }

  advanceTurn(state);
  state.phase = PHASES.ROLL;
  appendLog(state, `${playerName(state.activePlayerId, state.players)}'s turn`, 'turn');
  return { type: 'TURN_CHANGED', playerId: state.activePlayerId };
}

// ── GameEngine ────────────────────────────────────────────────

export class GameEngine {

  static startGame(state) {
    state.phase          = PHASES.ROLL;
    state.activePlayerId = state.turnOrder[0];
    state.gameStartedAt  = Date.now();
    appendLog(state, `GAME STARTED — ${playerName(state.activePlayerId, state.players)} goes first`, 'system');
    return { ok: true, events: [{ type: 'GAME_STARTED' }] };
  }

  // ── Roll ────────────────────────────────────────────────────

  static rollDice(playerId, state) {
    if (state.phase !== PHASES.ROLL)           return { ok: false, error: 'Not in ROLL phase.' };
    if (state.activePlayerId !== playerId)     return { ok: false, error: 'Not your turn.' };

    // Clear any previous skip notice from the prior turn
    state.autoSkipNotice = null;

    const dice = rollDice();
    state.currentDice = dice;
    state.assignments  = {};
    state.phase        = PHASES.ASSIGN;

    appendLog(state, `${playerName(playerId, state.players)} rolled [${dice[0]}, ${dice[1]}, ${dice[2]}]`, 'roll');

    // ── Auto-skip: no valid moves and die=4 has no valid targets either ──
    if (!hasAnyValidMoveAssignment(playerId, dice, state) && !hasValidDieFourAction(playerId, dice, state)) {
      appendLog(state, `${playerName(playerId, state.players)} has no valid moves — skipping`, 'system');
      // Stamp a notice onto the state so the client can show a prominent banner
      state.autoSkipNotice = {
        playerId,
        playerName: playerName(playerId, state.players),
        dice: [...dice],
      };
      const skipEv = finishTurn(playerId, state);
      return { ok: true, autoSkipped: true, events: [{ type: 'DICE_ROLLED', dice }, skipEv] };
    }

    return { ok: true, events: [{ type: 'DICE_ROLLED', dice }] };
  }

  // ── Undo assign — revert MOVE → ASSIGN so player can re-pick ──

  static undoAssign(playerId, state) {
    if (state.phase !== PHASES.MOVE)         return { ok: false, error: 'Not in MOVE phase.' };
    if (state.activePlayerId !== playerId)   return { ok: false, error: 'Not your turn.' };
    state.assignments = {};
    state.phase       = PHASES.ASSIGN;
    return { ok: true };
  }

  // ── Timeout skip — player ran out of turn time ─────────────

  static timeoutSkip(playerId, state) {
    if (state.activePlayerId !== playerId) return { ok: false, error: 'Not your turn.' };
    if (state.phase === PHASES.GAME_OVER)  return { ok: false, error: 'Game over.' };

    // If in ROLL phase, roll so the notice has dice to show
    if (state.phase === PHASES.ROLL) {
      const dice = rollDice();
      state.currentDice = dice;
      state.assignments = {};
      state.phase       = PHASES.ASSIGN;
      appendLog(state, `${playerName(playerId, state.players)} timed out — rolled [${dice.join(', ')}]`, 'system');
    }

    state.autoSkipNotice = {
      playerId,
      playerName: playerName(playerId, state.players),
      dice:    state.currentDice ? [...state.currentDice] : [],
      timeout: true,
    };

    appendLog(state, `${playerName(playerId, state.players)} ran out of time — turn skipped`, 'system');
    const skipEv = finishTurn(playerId, state);
    return { ok: true, autoSkipped: true, events: [{ type: 'TIMEOUT_SKIP' }, skipEv] };
  }

  // ── Assign ──────────────────────────────────────────────────

  static assignDice(playerId, assignments, state) {
    if (state.phase !== PHASES.ASSIGN)         return { ok: false, error: 'Not in ASSIGN phase.' };
    if (state.activePlayerId !== playerId)     return { ok: false, error: 'Not your turn.' };

    // ── 1-piece-per-turn rule ────────────────────────────────────
    if (Object.keys(assignments).length > 1) {
      return { ok: false, error: 'You may only move 1 piece per turn.' };
    }

    const result = validateAssignments(assignments, state.currentDice, state.pieces, playerId);
    if (!result.valid) return { ok: false, error: result.reason };

    state.assignments = assignments;
    state.phase       = PHASES.MOVE;
    return { ok: true, events: [{ type: 'DICE_ASSIGNED', assignments }] };
  }

  // ── Enslave ─────────────────────────────────────────────────
  //
  // Requires die value 4 in the current roll.
  // Targets a FREE enemy piece (General dead, controllerId = ownerId, on board).
  // Consumes the entire turn.

  static enslave(playerId, targetPieceId, state) {
    if (state.phase !== PHASES.ASSIGN)         return { ok: false, error: 'Not in ASSIGN phase.' };
    if (state.activePlayerId !== playerId)     return { ok: false, error: 'Not your turn.' };

    if (!hasDieFour(state.currentDice)) {
      return { ok: false, error: 'Enslave requires a 4 in your roll.' };
    }

    const target = state.pieces[targetPieceId];
    if (!target)                               return { ok: false, error: 'Piece not found.' };
    if (target.ownerId === playerId)           return { ok: false, error: 'Cannot enslave your own piece.' };
    if (!isEnslaveable(target, playerId, state)) {
      return { ok: false, error: 'Target cannot be enslaved — it must be a free piece (owner General dead) or already enslaved by another player.' };
    }

    target.controllerId = playerId;

    const enslaver = playerName(playerId, state.players);
    const name     = pieceName(target, state.players);
    appendLog(state, `${enslaver} enslaved ${name}!`, 'prisoner');

    const events = [{ type: 'PIECE_ENSLAVED', pieceId: targetPieceId, by: playerId }];

    const winner = checkWinCondition(state);
    if (winner) {
      state.phase  = PHASES.GAME_OVER;
      state.winner = winner;
      appendLog(state, `${playerName(winner, state.players)} wins Crownfall!`, 'winner');
      events.push({ type: 'GAME_OVER', winnerId: winner });
      return { ok: true, events };
    }

    events.push(finishTurn(playerId, state));
    return { ok: true, events };
  }

  // ── Escape ──────────────────────────────────────────────────
  //
  // The ORIGINAL OWNER of a prisoner uses die=4 to attempt escape.
  // The piece reverts to their control:
  //   - Off-board PRISONER → HOME, controllerId = ownerId.
  //   - On-board (ACTIVE) → free piece again (controllerId = ownerId).
  // Consumes the entire turn.

  static escape(playerId, pieceId, state) {
    if (state.phase !== PHASES.ASSIGN)         return { ok: false, error: 'Not in ASSIGN phase.' };
    if (state.activePlayerId !== playerId)     return { ok: false, error: 'Not your turn.' };

    if (!hasDieFour(state.currentDice)) {
      return { ok: false, error: 'Escape requires a 4 in your roll.' };
    }

    const piece = state.pieces[pieceId];
    if (!piece)                                return { ok: false, error: 'Piece not found.' };
    if (piece.ownerId !== playerId)            return { ok: false, error: 'You can only escape your own pieces.' };
    if (piece.controllerId === playerId)       return { ok: false, error: 'This piece is not captured.' };
    if (piece.status === PIECE_STATUS.DEAD)    return { ok: false, error: 'Dead pieces cannot escape.' };

    const name    = pieceName(piece, state.players);
    const captor  = playerName(piece.controllerId, state.players);

    piece.controllerId = piece.ownerId;
    if (piece.status === PIECE_STATUS.PRISONER && piece.position === null) {
      piece.status = PIECE_STATUS.HOME;
    }

    appendLog(state, `${name} escaped from ${captor}'s control!`, 'liberation');

    const events = [{ type: 'PIECE_ESCAPED', pieceId, freedFrom: piece.ownerId }];
    events.push(finishTurn(playerId, state));
    return { ok: true, events };
  }

  // ── Release ─────────────────────────────────────────────────
  //
  // The CONTROLLER voluntarily releases a prisoner back to their original owner.
  // No dice requirement. Ends the turn.

  static release(playerId, pieceId, state) {
    if (state.phase !== PHASES.ASSIGN)         return { ok: false, error: 'Not in ASSIGN phase.' };
    if (state.activePlayerId !== playerId)     return { ok: false, error: 'Not your turn.' };

    const piece = state.pieces[pieceId];
    if (!piece)                                return { ok: false, error: 'Piece not found.' };
    if (piece.controllerId !== playerId)       return { ok: false, error: 'You do not control this piece.' };
    if (piece.ownerId === playerId)            return { ok: false, error: 'This is your own piece — nothing to release.' };
    if (piece.status === PIECE_STATUS.DEAD)    return { ok: false, error: 'Dead pieces cannot be released.' };

    const name       = pieceName(piece, state.players);
    const controller = playerName(playerId, state.players);

    piece.controllerId = piece.ownerId;
    if (piece.status === PIECE_STATUS.PRISONER && piece.position === null) {
      piece.status = PIECE_STATUS.HOME;
    }

    appendLog(state, `${controller} released ${name}`, 'liberation');

    // Releasing is a free action — turn continues in ASSIGN phase
    return { ok: true, events: [{ type: 'PIECE_RELEASED', pieceId, releasedBy: playerId }] };
  }

  // ── Move ────────────────────────────────────────────────────

  static movePiece(playerId, pieceId, entryHomeId, state) {
    if (state.phase !== PHASES.MOVE)           return { ok: false, error: 'Not in MOVE phase.' };
    if (state.activePlayerId !== playerId)     return { ok: false, error: 'Not your turn.' };

    const piece = state.pieces[pieceId];
    if (!piece)                                return { ok: false, error: 'Piece not found.' };
    if (piece.controllerId !== playerId)       return { ok: false, error: 'Not your piece.' };

    const dieValue = state.assignments[pieceId];
    if (dieValue === undefined)                return { ok: false, error: 'No die assigned to this piece.' };

    const moveResult = validateMove(piece, dieValue, entryHomeId ?? null, state);
    if (!moveResult.valid)                     return { ok: false, error: moveResult.reason };

    const fromPos = piece.position;
    const toPos   = moveResult.targetPosition;

    piece.position = toPos;
    piece.status   = PIECE_STATUS.ACTIVE;
    delete state.assignments[pieceId];

    const moverName = pieceName(piece, state.players);
    const fromStr   = fromPos === null ? 'Home' : `space ${fromPos}`;
    appendLog(state, `▶ ${moverName} moves ${fromStr} → space ${toPos}`, 'move');

    const events       = [{ type: 'PIECE_MOVED', pieceId, from: fromPos, to: toPos }];
    const combatEvents = resolveCombat(piece, toPos, state);
    let earnedBonus    = 0;

    for (const cEvent of combatEvents) {
      const killedPiece = state.pieces[cEvent.killedPieceId];
      const killedName  = pieceName(killedPiece, state.players);

      if (cEvent.wasGeneral) {
        const inheritedEmpires = [...(state.players[cEvent.killedOwnerId]?.controlledEmpires ?? [])];

        const libResult = resolveControllerDeath(cEvent.killedOwnerId, state);
        if (libResult.freed.length > 0) {
          appendLog(state, `${libResult.freed.length} prisoner(s) freed`, 'liberation');
          events.push({ type: 'PRISONERS_FREED', freed: libResult.freed });
        }

        applyKill(cEvent, state);
        events.push({ type: 'PIECE_KILLED', killedPieceId: cEvent.killedPieceId, killerPieceId: pieceId, wasGeneral: true });

        const deadName = playerName(cEvent.killedOwnerId, state.players);
        const conqName = playerName(playerId, state.players);
        appendLog(state, `${moverName} killed ${killedName}!`, 'kill_general');
        appendLog(state, `${conqName} conquered ${deadName}'s empire`, 'empire');

        transferEmpire(cEvent.killedOwnerId, playerId, state);

        for (const subId of inheritedEmpires) {
          state.empires[subId].homeControlledBy = playerId;
          if (!state.players[playerId].controlledEmpires.includes(subId)) {
            state.players[playerId].controlledEmpires.push(subId);
          }
        }

        events.push({ type: 'EMPIRE_TRANSFERRED', from: cEvent.killedOwnerId, to: playerId });

      } else {
        applyKill(cEvent, state);

        if (cEvent.ownerIsAlive) {
          appendLog(state, `${moverName} killed ${killedName} — sent back to Home`, 'kill');
        } else {
          appendLog(state, `${moverName} destroyed ${killedName}`, 'kill');
        }
        events.push({ type: 'PIECE_KILLED', killedPieceId: cEvent.killedPieceId, killerPieceId: pieceId, wasGeneral: false });
      }

      const winner = checkWinCondition(state);
      if (winner) {
        state.phase  = PHASES.GAME_OVER;
        state.winner = winner;
        appendLog(state, `${playerName(winner, state.players)} wins Crownfall!`, 'winner');
        events.push({ type: 'GAME_OVER', winnerId: winner });
        return { ok: true, events };
      }
    }

    earnedBonus = bonusTurnsFromCombat(combatEvents);

    if (dieValue === 6) {
      earnedBonus += 1;
      appendLog(state, `${playerName(playerId, state.players)} used a 6 — bonus turn!`, 'bonus');
    } else if (earnedBonus > 0) {
      appendLog(state, `${playerName(playerId, state.players)} earns a bonus turn!`, 'bonus');
    }

    // ── Bonus turn cap: max 1 at a time, no accumulation ────────
    // Whether or not there was already a bonus queued, a fresh earn sets it
    // to exactly 1 — it never stacks beyond 1.
    if (earnedBonus > 0) {
      state.bonusTurnQueue = 1;
    }

    // ── Auto-end: no assignments left → finish turn automatically ──
    if (Object.keys(state.assignments).length === 0) {
      events.push(finishTurn(playerId, state));
    }

    return { ok: true, events };
  }

  // ── Retreat ─────────────────────────────────────────────────

  static retreat(playerId, pieceId, targetHomeId, state) {
    if (state.phase !== PHASES.MOVE)           return { ok: false, error: 'Not in MOVE phase.' };
    if (state.activePlayerId !== playerId)     return { ok: false, error: 'Not your turn.' };

    const piece    = state.pieces[pieceId];
    const dieValue = state.assignments[pieceId];
    if (dieValue === undefined)                return { ok: false, error: 'No die assigned.' };

    const result = validateRetreat(piece, dieValue, targetHomeId, state);
    if (!result.valid)                         return { ok: false, error: result.reason };

    const fromPos = piece.position;
    piece.position = null;
    piece.status   = PIECE_STATUS.HOME;
    delete state.assignments[pieceId];

    appendLog(state, `${pieceName(piece, state.players)} retreated to Home`, 'retreat');
    const retreatEvents = [{ type: 'PIECE_RETREATED', pieceId, from: fromPos, toHome: targetHomeId }];

    // ── Auto-end: no assignments left → finish turn automatically ──
    if (Object.keys(state.assignments).length === 0) {
      retreatEvents.push(finishTurn(playerId, state));
    }

    return { ok: true, events: retreatEvents };
  }

  // ── End Move ─────────────────────────────────────────────────

  static endMovePhase(playerId, state) {
    if (state.phase !== PHASES.MOVE)           return { ok: false, error: 'Not in MOVE phase.' };
    if (state.activePlayerId !== playerId)     return { ok: false, error: 'Not your turn.' };

    // ── Must-play rule: cannot end turn if unplayed assignments remain ──
    if (Object.keys(state.assignments).length > 0) {
      return { ok: false, error: 'You must play your assigned move before ending your turn.' };
    }

    const ev = finishTurn(playerId, state);
    return { ok: true, events: [ev] };
  }
}
