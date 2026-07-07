// ============================================================
// CROWNFALL — constants.js
// All board layout, piece types, player config.
// Single source of truth. Never hardcode elsewhere.
// ============================================================

export const BOARD_SIZE = 60; // main track spaces: 0–59 (6 players × 10 each)
// Official Crownfall empires — clockwise order: Crimson → Bronze → Gold → Emerald → Sapphire → Silver
export const PLAYERS_CONFIG = ['red', 'orange', 'yellow', 'green', 'blue', 'silver'];

// Entry point on main track where each color's pieces enter
export const ENTRY_POINTS = {
  red:    0,   // Crimson
  orange: 10,  // Bronze
  yellow: 20,  // Gold
  green:  30,  // Emerald
  blue:   40,  // Sapphire
  silver: 50,  // Silver
};

// Color zone = the 3 spaces immediately BEFORE the entry point (retreat eligible)
// These wrap around: red's zone is [57, 58, 59]
export const COLOR_ZONES = {
  red:    [57, 58, 59],
  orange: [7, 8, 9],
  yellow: [17, 18, 19],
  green:  [27, 28, 29],
  blue:   [37, 38, 39],
  silver: [47, 48, 49],
};

export const PIECE_TYPES = {
  GENERAL: 'general',
  SPY:     'spy',
  SOLDIER: 'soldier',
};

// How many dice (sorted ascending) a piece type can pick from when assigned
// Soldier picks from [D1], Spy from [D1, D2], General from [D1, D2, D3]
export const ROLL_OPTIONS = {
  general: 3,
  spy:     2,
  soldier: 1,
};

// Initial pieces per player — 1 General, 2 Spies, 3 Soldiers
export const PIECE_TEMPLATES = [
  { suffix: 'G',  type: PIECE_TYPES.GENERAL },
  { suffix: 'S1', type: PIECE_TYPES.SPY },
  { suffix: 'S2', type: PIECE_TYPES.SPY },
  { suffix: 'T1', type: PIECE_TYPES.SOLDIER },
  { suffix: 'T2', type: PIECE_TYPES.SOLDIER },
  { suffix: 'T3', type: PIECE_TYPES.SOLDIER },
];

export const PHASES = {
  WAITING:   'WAITING',
  ROLL:      'ROLL',
  ASSIGN:    'ASSIGN',
  MOVE:      'MOVE',
  GAME_OVER: 'GAME_OVER',
};

export const PIECE_STATUS = {
  HOME:     'home',
  ACTIVE:   'active',
  PRISONER: 'prisoner',
  DEAD:     'dead',
};

export const ENTRY_DICE = new Set([1, 6]); // values that allow entering from Home

export const RETREAT_DICE = 3; // value that allows retreat from Color Zone

export const BOARD_WRAP = BOARD_SIZE; // alias for clarity

export const MAX_PLAYERS = 6;
export const MIN_PLAYERS = 2;

export const BOT_DIFFICULTIES = ['easy', 'medium', 'hard', 'impossible'];
