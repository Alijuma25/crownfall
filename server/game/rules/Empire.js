// ============================================================
// CROWNFALL — rules/Empire.js  (v5: new enslave/escape/release)
//
// v5 changes:
//   - Removed hasEnslaveEscapeDice (old 1+3+6 system).
//   - Added hasDieFour: die=4 triggers enslave OR escape attempts.
//   - Release (controller frees prisoner) has no dice requirement.
// ============================================================

import { PIECE_STATUS, PIECE_TYPES } from '../constants.js';

/**
 * A piece is "free" if:
 *  - It is ACTIVE on the board
 *  - Its owner's General is dead (player.alive === false)
 *  - It is still controlled by its original owner (not yet enslaved)
 */
export function isFree(piece, state) {
  if (piece.status !== PIECE_STATUS.ACTIVE) return false;
  if (piece.controllerId !== piece.ownerId)  return false;
  const owner = state.players[piece.ownerId];
  return owner ? !owner.alive : false;
}

/**
 * A piece is "enslaveable" by playerId if:
 *  - It's not owned or currently controlled by playerId
 *  - It's not dead
 *  - AND either:
 *    a) It's a free piece (General dead, controllerId === ownerId, ACTIVE) — original rule
 *    b) It's already enslaved by someone else (controllerId !== ownerId) — steal rule:
 *       you can steal another player's slave regardless of whether that controller
 *       has a living General.
 */
export function isEnslaveable(piece, byPlayerId, state) {
  if (piece.ownerId === byPlayerId)       return false;
  if (piece.controllerId === byPlayerId)  return false;
  if (piece.status === PIECE_STATUS.DEAD) return false;
  // Either free (condition a) or already enslaved by someone else (condition b)
  return isFree(piece, state) || piece.controllerId !== piece.ownerId;
}

/**
 * Return all free pieces on the board that belong to opponents of playerId.
 */
export function getFreePieces(playerId, state) {
  return Object.values(state.pieces).filter(
    p => p.ownerId !== playerId && isFree(p, state)
  );
}

/**
 * Die value 4 is the trigger for Enslave and Escape attempts.
 */
export function hasDieFour(dice) {
  return Array.isArray(dice) && dice.includes(4);
}

/**
 * Transfer an empire from a killed General's player to the conqueror.
 * HOME pieces become PRISONER under the conqueror.
 * ACTIVE (on-board) pieces stay FREE (controllerId = ownerId).
 */
export function transferEmpire(deadGeneralOwnerId, conquerorId, state) {
  const conqueror = state.players[conquerorId];
  if (!conqueror) return;

  state.players[deadGeneralOwnerId].alive = false;

  // Hand over Home
  state.empires[deadGeneralOwnerId].homeControlledBy = conquerorId;

  if (!conqueror.controlledEmpires.includes(deadGeneralOwnerId)) {
    conqueror.controlledEmpires.push(deadGeneralOwnerId);
  }

  // Convert pieces owned by the dead player
  for (const piece of Object.values(state.pieces)) {
    if (piece.ownerId !== deadGeneralOwnerId) continue;
    if (piece.type   === PIECE_TYPES.GENERAL) continue;
    if (piece.status === PIECE_STATUS.DEAD)   continue;

    if (piece.status === PIECE_STATUS.ACTIVE) {
      // On-board: piece stays FREE (controllerId = ownerId, no change needed)
    } else {
      // HOME or PRISONER (off-board): auto-captured by conqueror
      piece.status       = PIECE_STATUS.PRISONER;
      piece.controllerId = conquerorId;
    }
  }

  // ── Inherit sub-empire slaves ──────────────────────────────────
  // The dead player may have been controlling other players' pieces (via enslave/conquest).
  // On-board slaves go free; off-board slaves (home/prisoner) are passed to the conqueror.
  const deadController = state.players[deadGeneralOwnerId];
  const subEmpires = [...(deadController.controlledEmpires ?? [])];
  for (const subEmpireId of subEmpires) {
    for (const piece of Object.values(state.pieces)) {
      if (piece.ownerId !== subEmpireId)             continue;
      if (piece.controllerId !== deadGeneralOwnerId) continue;
      if (piece.status === PIECE_STATUS.DEAD)        continue;

      if (piece.status === PIECE_STATUS.ACTIVE) {
        // On-board: goes free (their controller just died)
        piece.controllerId = piece.ownerId;
      } else {
        // Off-board: inherited by conqueror
        piece.status       = PIECE_STATUS.PRISONER;
        piece.controllerId = conquerorId;
      }
    }

    // Transfer home control of the sub-empire to the conqueror
    if (state.empires[subEmpireId]?.homeControlledBy === deadGeneralOwnerId) {
      state.empires[subEmpireId].homeControlledBy = conquerorId;
    }

    // Conqueror inherits the sub-empire
    if (!conqueror.controlledEmpires.includes(subEmpireId)) {
      conqueror.controlledEmpires.push(subEmpireId);
    }
  }
  // Clear sub-empires from dead player
  deadController.controlledEmpires = [];
}

/**
 * Liberation: when a controller's General is killed, all their prisoners
 * (pieces they captured from sub-empires) are freed.
 */
function liberatePrisoners(deadControllerId, state) {
  const freed = [];
  const deadController = state.players[deadControllerId];
  const subEmpires = [...(deadController.controlledEmpires ?? [])];

  for (const subEmpireId of subEmpires) {
    for (const piece of Object.values(state.pieces)) {
      if (piece.ownerId !== subEmpireId)            continue;
      if (piece.controllerId !== deadControllerId)   continue;
      if (piece.status === PIECE_STATUS.DEAD)        continue;

      if (piece.status === PIECE_STATUS.ACTIVE) {
        piece.controllerId = piece.ownerId;
      } else {
        piece.status       = PIECE_STATUS.HOME;
        piece.position     = null;
        piece.controllerId = piece.ownerId;
      }
      freed.push(piece.id);
    }

    state.empires[subEmpireId].homeControlledBy = null;
  }

  deadController.controlledEmpires = [];
  return { freed };
}

export function resolveControllerDeath(deadControllerId, state) {
  return liberatePrisoners(deadControllerId, state);
}

/**
 * Win condition: no enemy piece is still a threat.
 * A piece is a "threat" only if it can be actively played:
 *   - ACTIVE on the board (position != null), OR
 *   - At home, owner's general is alive, and the piece is free (not imprisoned).
 *
 * Pieces that do NOT block the win:
 *   - DEAD pieces
 *   - Pieces at home whose owner's general is already dead (stranded)
 *   - Prisoners sitting at home under an enemy's control (stuck, can only
 *     enter if the controller chooses to play them — which the winner won't)
 */
export function checkWinCondition(state) {
  function isThreatening(piece) {
    if (piece.status === PIECE_STATUS.DEAD) return false;
    // On the board — always a threat
    if (piece.position !== null) return true;
    // At home: only a threat if the owner's general is alive AND the piece is free
    const ownerAlive = state.players[piece.ownerId]?.alive ?? false;
    if (!ownerAlive) return false;                          // general dead → stranded
    if (piece.controllerId !== piece.ownerId) return false; // prisoner → stuck at home
    return true; // free piece at home with living general → can still enter
  }

  const playerIds = Object.keys(state.players);
  const playersWithThreats = playerIds.filter(pid =>
    Object.values(state.pieces).some(p => p.ownerId === pid && isThreatening(p))
  );
  return playersWithThreats.length === 1 ? playersWithThreats[0] : null;
}

/**
 * Get all Home IDs currently controlled by a player.
 */
export function getControlledHomes(playerId, state) {
  const player = state.players[playerId];
  if (!player) return [];
  const homes = [];
  if (player.alive) homes.push(playerId);
  homes.push(...(player.controlledEmpires ?? []));
  return homes;
}
