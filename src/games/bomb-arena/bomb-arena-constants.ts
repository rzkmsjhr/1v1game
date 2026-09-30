import type { ShrinkStage } from './bomb-arena-types';

export const BOMB_ARENA_CONSTANTS = {
  GRID_COLS: 6,
  GRID_ROWS: 12,

  // Player physics & movement
  PLAYER_SPEED: 3.8, // in grid units per second
  PLAYER_RADIUS: 0.36, // collision box radius in grid units

  // Inventory & cooldowns
  MAX_FENCE_STOCK: 3,
  FENCE_RECHARGE_TIME: 1.8, // seconds per stock
  FENCE_COOLDOWN: 0.25,      // seconds between drops

  MAX_BOMB_STOCK: 2,
  BOMB_RECHARGE_TIME: 2.4,   // seconds per stock
  BOMB_COOLDOWN: 0.35,

  // Bomb & blast
  BOMB_FUSE_TIME: 3.0,       // 3 seconds countdown
  BOMB_RADIUS: 2,            // 2 tiles in 4 directions
  EXPLOSION_DURATION: 0.42,   // seconds visual blast lingers
  SCREEN_SHAKE_DECAY: 0.88,

  // Match flow
  ROUNDS_TO_WIN: 2,          // Best of 3
  COUNTDOWN_SECONDS: 3,

  // Shrink stages (progressive Sudden Death)
  SHRINK_STAGES: [
    {
      triggerTime: 25.0,
      warningDuration: 3.0,
      crushRows: [0, 11]     // Top & bottom rows 0 & 11
    },
    {
      triggerTime: 42.0,
      warningDuration: 3.0,
      crushRows: [1, 10]     // Rows 1 & 10
    },
    {
      triggerTime: 58.0,
      warningDuration: 3.0,
      crushCols: [0, 5]      // Outer left & right columns
    },
    {
      triggerTime: 72.0,
      warningDuration: 3.0,
      crushRows: [2, 9]      // Rows 2 & 9
    }
  ] as ShrinkStage[]
};
