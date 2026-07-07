// ============================================================
// CROWNFALL — rules/Dice.js  (v2)
// Roll generation + assignment validation.
// NOTE: Rolling a 6 no longer grants a bonus turn (v2 spec).
// Bonus turns come exclusively from kills.
// ============================================================

import { ROLL_OPTIONS, ENTRY_DICE, PIECE_STATUS } from '../constants.js';

/**
 * Roll 3 dice. Returns array sorted ascending: [D1, D2, D3].
 */
export function rollDice() {
  const vals = [rand6(), rand6(), rand6()];
  vals.sort((a, b) => a - b);
  return vals;
}

function rand6() {
  return Math.floor(Math.random() * 6) + 1;
}

/**
 * Validate a proposed assignment map: { pieceId → dieValue }.
 *
 * Rules (v2):
 * 1. Each die value used must exist in the rolled pool (with multiplicity).
 * 2. A die can only be assigned once.
 * 3. Each piece receives at most one die.
 * 4. The assigned die value must be within the piece's roll-option window
 *    (Soldier: D1 only, Spy: D1 or D2, General: D1/D2/D3).
 * 5. If a piece is in Home, the die value must be 1 or 6.
 * 6. Only pieces controlled by the active player may be assigned.
 * 7. Dead pieces may not be assigned.
 *
 * Returns { valid: true } or { valid: false, reason: string }
 */
export function validateAssignments(assignments, dice, pieces, activePlayerId) {
  const pool = [...dice]; // mutable copy, track consumption
  const assignedPieceIds = new Set();

  for (const [pieceId, dieValue] of Object.entries(assignments)) {
    const piece = pieces[pieceId];

    if (!piece) {
      return { valid: false, reason: `Piece ${pieceId} does not exist.` };
    }
    if (piece.controllerId !== activePlayerId) {
      return { valid: false, reason: `Piece ${pieceId} is not controlled by active player.` };
    }
    if (piece.status === PIECE_STATUS.DEAD) {
      return { valid: false, reason: `Piece ${pieceId} is dead.` };
    }
    if (assignedPieceIds.has(pieceId)) {
      return { valid: false, reason: `Piece ${pieceId} assigned twice.` };
    }
    assignedPieceIds.add(pieceId);

    // Roll-option window: slice pool by piece type rank
    const rollOptions  = ROLL_OPTIONS[piece.type]; // 1, 2, or 3
    const eligibleDice = pool.slice(0, rollOptions);

    if (!eligibleDice.includes(dieValue)) {
      return {
        valid: false,
        reason: `${piece.type} cannot use die ${dieValue}. Eligible from current pool: [${eligibleDice}].`,
      };
    }

    // Consume die from pool
    pool.splice(pool.indexOf(dieValue), 1);

    // Entry constraint: pieces in Home OR off-board Prisoners need 1 or 6
    const needsEntry = piece.status === PIECE_STATUS.HOME ||
                       (piece.status === PIECE_STATUS.PRISONER && piece.position === null);
    if (needsEntry && !ENTRY_DICE.has(dieValue)) {
      return {
        valid: false,
        reason: `${pieceId} is off-board — needs die 1 or 6 to enter (got ${dieValue}).`,
      };
    }
  }

  return { valid: true };
}

/**
 * Return which die values from the current pool are eligible for a given piece type.
 * Used by the client to highlight valid assignments.
 */
export function eligibleDiceForPiece(pieceType, dice) {
  const options = ROLL_OPTIONS[pieceType];
  return [...new Set(dice.slice(0, options))];
}
