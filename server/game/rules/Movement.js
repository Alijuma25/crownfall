// ============================================================
// CROWNFALL — rules/Movement.js  (v3: full territory control)
//
// v3 changes:
//   - Retreat (die=3) now checks ALL color zones of ALL empires
//     controlled by the piece's controller — not just its own
//     original color zone. Full territory absorption on General kill.
//   - Multi-home retreat: any piece (not just General) can retreat
//     to ANY home controlled by their controller.
//   - Removes COLOR_ZONES direct import; uses state.empires[id].colorZone
//     so zone ownership is always live (updates when empire is conquered).
// ============================================================

import {
  BOARD_SIZE,
  ENTRY_POINTS,
  RETREAT_DICE,
  PIECE_STATUS,
} from '../constants.js';
import { getControlledHomes } from './Empire.js';

/**
 * Compute the target board position for a piece moving `steps` spaces clockwise.
 */
export function computeTarget(fromPosition, steps) {
  return (fromPosition + steps) % BOARD_SIZE;
}

/**
 * Returns all color zone spaces currently controlled by `controllerId`.
 * A player controls a zone when state.empires[empireId].homeControlledBy === controllerId.
 */
function controlledZoneSpaces(controllerId, state) {
  const homes = getControlledHomes(controllerId, state);
  const spaces = [];
  for (const homeId of homes) {
    const zone = state.empires[homeId]?.colorZone ?? [];
    spaces.push(...zone);
  }
  return spaces;
}

/**
 * Validate a move for a piece assigned dieValue.
 *
 * @param {object}      piece
 * @param {number}      dieValue       — assigned die value
 * @param {string|null} entryHomeId    — which controlled Home to enter from (any controlled home)
 * @param {object}      state
 *
 * Returns:
 *   { valid: true, targetPosition, isEntry, canRetreat }
 *   { valid: false, reason }
 */
export function validateMove(piece, dieValue, entryHomeId, state) {
  if (piece.status === PIECE_STATUS.DEAD) {
    return { valid: false, reason: 'Piece is dead.' };
  }

  // ── HOME / PRISONER (off-board) → Entry ──────────────────────────────
  if (piece.status === PIECE_STATUS.HOME || (piece.status === PIECE_STATUS.PRISONER && piece.position === null)) {
    // Entry die already validated in Dice.js (must be 1 or 6)
    const controllerId = piece.controllerId;
    const controlled   = getControlledHomes(controllerId, state);

    // Default to own home if no entryHomeId specified
    const homeId = entryHomeId ?? piece.ownerId;

    // A player can ALWAYS enter from their own original home, even if their
    // General died and the zone was conquered by someone else.
    // For prisoner pieces (controller ≠ owner), only controlled homes are valid.
    const isOwnPiece    = piece.controllerId === piece.ownerId;
    const allowedHomes  = isOwnPiece
      ? [...new Set([...controlled, piece.ownerId])]
      : controlled;

    if (!allowedHomes.includes(homeId)) {
      return { valid: false, reason: `Player does not control home "${homeId}".` };
    }

    const homeColor  = state.players[homeId]?.color;
    const entryPoint = ENTRY_POINTS[homeColor];

    if (entryPoint === undefined) {
      return { valid: false, reason: `Invalid home color for "${homeId}".` };
    }

    return { valid: true, targetPosition: entryPoint, isEntry: true, canRetreat: false };
  }

  // ── ON BOARD ─────────────────────────────────────────────────────────
  const pos = piece.position;

  // Retreat eligibility: die = 3 AND piece is in a color zone controlled by its controller.
  // Full territory rule: controlling an empire = controlling ALL its zone spaces.
  const inControlledZone = controlledZoneSpaces(piece.controllerId, state).includes(pos);
  const canRetreat = dieValue === RETREAT_DICE && inControlledZone;

  const forwardTarget = computeTarget(pos, dieValue);
  return { valid: true, targetPosition: forwardTarget, isEntry: false, canRetreat };
}

/**
 * Validate a retreat action.
 *
 * Rules:
 *   - Die must be 3.
 *   - Piece must be standing in a color zone belonging to an empire
 *     currently controlled by the piece's controller (full territory rule).
 *   - Target home must be any home controlled by the controller.
 *     (Any piece type — not just Generals — may retreat to any controlled home.)
 */
export function validateRetreat(piece, dieValue, targetHomeId, state) {
  if (dieValue !== RETREAT_DICE) {
    return { valid: false, reason: 'Retreat requires die value 3.' };
  }

  const controllerId = piece.controllerId;
  const controlled   = getControlledHomes(controllerId, state);

  // Check piece is in a color zone the controller currently owns
  const inControlledZone = controlled.some(homeId =>
    (state.empires[homeId]?.colorZone ?? []).includes(piece.position)
  );

  if (!inControlledZone) {
    return {
      valid: false,
      reason: 'Piece is not in a color zone controlled by its current controller.',
    };
  }

  // Target home must be any controlled home (any piece type — multi-home rule)
  if (!controlled.includes(targetHomeId)) {
    return { valid: false, reason: `Player does not control home "${targetHomeId}".` };
  }

  return { valid: true };
}

/**
 * Get all ACTIVE pieces at a given board position.
 */
export function getPiecesAtPosition(position, pieces) {
  return Object.values(pieces).filter(
    p => p.position === position && p.status === PIECE_STATUS.ACTIVE
  );
}
