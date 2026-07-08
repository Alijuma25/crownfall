// ============================================================
// CROWNFALL — rules/Combat.js  (v4: ownership vs control)
//
// CRITICAL DISTINCTION:
//   piece.ownerId      = original owner; NEVER changes.
//   piece.controllerId = current controller; changes on enslave/escape.
//
// ALLY definition (the ONLY pairs that cannot attack each other):
//   target.ownerId      === attacker.ownerId       (same original empire)
//   AND
//   target.controllerId === attacker.controllerId   (same current controller)
//
// This means a player CAN intentionally kill their own prisoners:
//   Blue Soldier (owner=Blue, ctrl=Blue) vs Blue's Red Prisoner (owner=Red, ctrl=Blue)
//   → Different originalOwner → ENEMIES → combat resolves normally → prisoner dies (DEAD).
//
// Likewise, a free Red piece CAN kill another free Red piece:
//   Red Spy (owner=Red, ctrl=Red) vs Red Soldier (owner=Red, ctrl=Red)
//   → Both fields match → ALLIES → no combat (safe to share a square).
//
// Safe space rule: pieces are immune on ANY controlled color space (entry + all 3 zone tiles).
// ============================================================

import { PIECE_STATUS, PIECE_TYPES } from '../constants.js';

/**
 * Safe Space Rule:
 * A piece is safe on ANY colored space (entry point OR zone tiles) belonging to
 * an empire currently controlled by that piece's controller.
 */
function isOnSafeSpace(piece, position, state) {
  for (const [, empire] of Object.entries(state.empires)) {
    if (empire.homeControlledBy !== piece.controllerId) continue;
    // Entry point is safe
    if (empire.entryPoint === position) return true;
    // All 3 zone tiles are also safe
    if ((empire.colorZone ?? []).includes(position)) return true;
  }
  return false;
}

/**
 * Collect all combat events for a piece landing at targetPosition.
 *
 * Ally check: BOTH ownerId AND controllerId must match the attacker.
 * Any other combination → enemy → combat.
 *
 * Does NOT mutate state. Returns array of event objects.
 */
export function resolveCombat(movingPiece, targetPosition, state) {
  const events = [];

  const targets = Object.values(state.pieces).filter(p =>
    p.position === targetPosition &&
    p.status === PIECE_STATUS.ACTIVE
  );

  for (const target of targets) {
    // ── Ally check ──────────────────────────────────────────────
    // Two pieces are allies ONLY if they share the same original owner
    // AND the same current controller. Any mismatch = enemy.
    const sameOwner      = target.ownerId      === movingPiece.ownerId;
    const sameController = target.controllerId === movingPiece.controllerId;
    if (sameOwner && sameController) continue; // true allies — no combat

    // ── Prisoner protection rule ─────────────────────────────────
    // A prisoner (ownerId ≠ controllerId) cannot kill pieces that are
    // owned by its controller. Example: Red captures Blue's spy →
    // that Blue spy (controlled by Red) cannot kill any Red-owned pieces,
    // regardless of whether those Red pieces are free or also prisoners.
    const movingIsPrisoner = movingPiece.controllerId !== movingPiece.ownerId;
    if (movingIsPrisoner && target.ownerId === movingPiece.controllerId) continue;

    // ── Safe space ──────────────────────────────────────────────
    // Defender is immune if standing on their controlled entry point.
    if (isOnSafeSpace(target, targetPosition, state)) continue;

    // ── Combat event ────────────────────────────────────────────
    // ownerIsAlive drives applyKill outcome:
    //   true  → piece retreats to HOME (owner's General still alive)
    //   false → piece is DEAD (owner's General gone; permanent elimination)
    const ownerIsAlive = state.players[target.ownerId]?.alive ?? false;

    events.push({
      killedPieceId:      target.id,
      killerPieceId:      movingPiece.id,
      wasGeneral:         target.type === PIECE_TYPES.GENERAL,
      killedOwnerId:      target.ownerId,
      killedControllerId: target.controllerId,
      ownerIsAlive,
    });
  }

  return events;
}

/**
 * Apply a single kill event to state (mutates state.pieces).
 *
 * Outcomes:
 *   General killed  → DEAD; caller handles empire transfer.
 *   Any other piece → DEAD and added to the graveyard permanently.
 *                     No respawn, regardless of whether the original owner's General is alive.
 *
 * Returns { empireTransferNeeded, deadGeneralOwnerId }
 */
export function applyKill(event, state) {
  const killed = state.pieces[event.killedPieceId];
  if (!killed) return {};

  if (event.wasGeneral) {
    killed.status      = PIECE_STATUS.DEAD;
    killed.position    = null;
    killed.controllerId = killed.ownerId;
    return { empireTransferNeeded: true, deadGeneralOwnerId: killed.ownerId };
  }

  // All killed pieces go to the graveyard permanently — no respawn,
  // regardless of whether the original owner's General is alive.
  killed.status      = PIECE_STATUS.DEAD;
  killed.position    = null;
  killed.controllerId = killed.ownerId;

  return {};
}

/**
 * Bonus turn: 1 per kill action (regardless of how many pieces were on the tile).
 */
export function bonusTurnsFromCombat(combatEvents) {
  return combatEvents.length > 0 ? 1 : 0;
}
