export const SKYLINE_CONSTANTS = {
  TARGET_FLOORS: 30,
  MAX_LIVES: 3,
  
  // Dimensions - Perfect 1:1 Square Modular Building Blocks
  BLOCK_WIDTH: 68,
  BLOCK_HEIGHT: 68,
  FOUNDATION_WIDTH: 96,
  FOUNDATION_HEIGHT: 38,
  
  // Physics & Timing
  GRAVITY: 2400,               // px / s^2 (snappy, satisfying drop feel)
  CRANE_CABLE_LENGTH: 130,     // px
  HOOK_CLEARANCE: 120,         // px clearance above top floor
  CRANE_BASE_SWING_SPEED: 2.3, // rad / s
  CRANE_MAX_ANGLE: 0.65,       // Pendulum maximum swing angle
  
  // Accuracy Thresholds (horizontal offset from target center)
  PERFECT_THRESHOLD: 3.5,      // <= 3.5px is PERFECT (snaps & dampens wobble)
  GREAT_THRESHOLD: 10.0,       // <= 10px is GREAT
  GOOD_THRESHOLD: 24.0,        // <= 24px is GOOD (near edge)
  MAX_OVERHANG: 34.0,          // > 34px (half of 68) causes block to tip and tumble!
  
  // Tower Sway / Elastic Spring Mechanics
  // Wobble frequency scales dynamically with building height:
  // ω = BASE_FREQ + FREQ_PER_FLOOR * floorCount
  // (Short tower = gentle slow sway; tall tower = fast shaking vibration)
  WOBBLE_BASE_FREQ: 7.2,       // rad / s (~1.15 Hz slow gentle sway when short)
  WOBBLE_FREQ_PER_FLOOR: 0.55, // +0.55 rad/s per floor (~3.8 Hz rapid vibration at floor 30!)
  WOBBLE_DAMPING_RATIO: 0.11,  // Underdamped ratio ζ for smooth, gentle multi-cycle decay
  MAX_WOBBLE_ANGLE: 0.32,      // Maximum tower sway angle (~18 degrees)
  
  // Floor Themes (4 windows in a 2x2 grid for each square apartment block)
  THEMES: [
    { type: 'residential', color: '#f59e0b', accentColor: '#b45309', windows: 4 }, // Amber Apartments
    { type: 'office', color: '#06b6d4', accentColor: '#0e7490', windows: 4 },      // Cyan Modern Office
    { type: 'commercial', color: '#10b981', accentColor: '#047857', windows: 4 },  // Emerald Suites
    { type: 'luxury', color: '#8b5cf6', accentColor: '#6d28d9', windows: 4 },      // Royal Violet Lofts
    { type: 'residential', color: '#ef4444', accentColor: '#b91c1c', windows: 4 }, // Ruby Brick Flats
    { type: 'office', color: '#3b82f6', accentColor: '#1d4ed8', windows: 4 },      // Sapphire Tech Tower
  ] as const,
  
  PENTHOUSE_THEME: {
    type: 'penthouse',
    color: '#fbbf24',          // 24k Gold
    accentColor: '#d97706',
    windows: 4
  } as const
};
