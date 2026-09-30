export const SKYLINE_CONSTANTS = {
  TARGET_FLOORS: 30,
  MAX_LIVES: 3,
  
  // Dimensions
  BLOCK_WIDTH: 104,
  BLOCK_HEIGHT: 42,
  FOUNDATION_WIDTH: 140,
  FOUNDATION_HEIGHT: 50,
  
  // Physics & Timing
  GRAVITY: 2200,            // px / s^2 (snappy, satisfying drop feel)
  CRANE_CABLE_LENGTH: 110,
  CRANE_BASE_SWING_SPEED: 2.4, // rad / s
  CRANE_MAX_ANGLE: 0.68,    // ~39 degrees maximum pendulum amplitude
  
  // Accuracy Thresholds (horizontal offset from target center)
  PERFECT_THRESHOLD: 4.5,   // <= 4.5px is PERFECT
  GREAT_THRESHOLD: 14.0,    // <= 14px is GREAT
  GOOD_THRESHOLD: 38.0,     // <= 38px is GOOD
  MAX_OVERHANG: 52.0,       // > 52px (half width) causes block to tip and tumble!
  
  // Tower Sway / Elastic Spring Mechanics
  WOBBLE_SPRING_K: 18.0,    // Restoring spring force
  WOBBLE_DAMPING: 3.4,      // Velocity damping factor
  MAX_WOBBLE_ANGLE: 0.32,   // Maximum tower sway angle (~18 degrees)
  
  // Floor Themes
  THEMES: [
    { type: 'residential', color: '#f59e0b', accentColor: '#b45309', windows: 3 }, // Amber Apartments
    { type: 'office', color: '#06b6d4', accentColor: '#0e7490', windows: 4 },      // Cyan Modern Office
    { type: 'commercial', color: '#10b981', accentColor: '#047857', windows: 3 },  // Emerald Suites
    { type: 'luxury', color: '#8b5cf6', accentColor: '#6d28d9', windows: 4 },      // Royal Violet Lofts
    { type: 'residential', color: '#ef4444', accentColor: '#b91c1c', windows: 3 }, // Ruby Brick Flats
    { type: 'office', color: '#3b82f6', accentColor: '#1d4ed8', windows: 4 },      // Sapphire Tech Tower
  ] as const,
  
  PENTHOUSE_THEME: {
    type: 'penthouse',
    color: '#fbbf24',       // 24k Gold
    accentColor: '#d97706',
    windows: 5
  } as const
};
