export interface BallDef {
  id: number;
  number: number;
  color: string;
  type: 'cue' | 'solid' | 'stripe' | '8ball';
  name: string;
}

export interface PocketDef {
  id: string;
  x: number;
  y: number;
  radius: number;
  isMiddle: boolean;
}

export interface CushionDef {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  normalX: number;
  normalY: number;
}

// Coordinate space: Playable cloth area is 800 x 400
export const TABLE_WIDTH = 872;
export const TABLE_HEIGHT = 472;
export const RAIL_WIDTH = 36;

export const PLAY_X_MIN = RAIL_WIDTH;
export const PLAY_X_MAX = TABLE_WIDTH - RAIL_WIDTH; // 836
export const PLAY_Y_MIN = RAIL_WIDTH;
export const PLAY_Y_MAX = TABLE_HEIGHT - RAIL_WIDTH; // 436

export const PLAY_WIDTH = PLAY_X_MAX - PLAY_X_MIN; // 800
export const PLAY_HEIGHT = PLAY_Y_MAX - PLAY_Y_MIN; // 400

export const HEAD_STRING_X = PLAY_X_MIN + PLAY_WIDTH * 0.25; // 236 (kitchen line)
export const CENTER_X = PLAY_X_MIN + PLAY_WIDTH * 0.5; // 436
export const CENTER_Y = PLAY_Y_MIN + PLAY_HEIGHT * 0.5; // 236
export const FOOT_SPOT_X = PLAY_X_MIN + PLAY_WIDTH * 0.75; // 636
export const FOOT_SPOT_Y = CENTER_Y; // 236

export const BALL_RADIUS = 11;
export const BALL_DIAMETER = BALL_RADIUS * 2;
export const BALL_MASS = 1.0;
export const ROLLING_FRICTION = 0.988;
export const BALL_RESTITUTION = 0.96;
export const CUSHION_RESTITUTION = 0.85;
export const VELOCITY_STOP_THRESHOLD = 0.05;

// Six pockets with accurate corner mouth capture
export const POCKETS: PocketDef[] = [
  { id: 'top-left', x: PLAY_X_MIN + 3, y: PLAY_Y_MIN + 3, radius: 24, isMiddle: false },
  { id: 'top-middle', x: CENTER_X, y: PLAY_Y_MIN - 4, radius: 21, isMiddle: true },
  { id: 'top-right', x: PLAY_X_MAX - 3, y: PLAY_Y_MIN + 3, radius: 24, isMiddle: false },
  { id: 'bottom-left', x: PLAY_X_MIN + 3, y: PLAY_Y_MAX - 3, radius: 24, isMiddle: false },
  { id: 'bottom-middle', x: CENTER_X, y: PLAY_Y_MAX + 4, radius: 21, isMiddle: true },
  { id: 'bottom-right', x: PLAY_X_MAX - 3, y: PLAY_Y_MAX - 3, radius: 24, isMiddle: false },
];

// Cushions with corner angled jaw bevels
export const CUSHIONS: CushionDef[] = [
  // Top-Left cushion
  { x1: PLAY_X_MIN + 22, y1: PLAY_Y_MIN, x2: CENTER_X - 18, y2: PLAY_Y_MIN, normalX: 0, normalY: 1 },
  // Top-Right cushion
  { x1: CENTER_X + 18, y1: PLAY_Y_MIN, x2: PLAY_X_MAX - 22, y2: PLAY_Y_MIN, normalX: 0, normalY: 1 },
  // Bottom-Left cushion
  { x1: PLAY_X_MIN + 22, y1: PLAY_Y_MAX, x2: CENTER_X - 18, y2: PLAY_Y_MAX, normalX: 0, normalY: -1 },
  // Bottom-Right cushion
  { x1: CENTER_X + 18, y1: PLAY_Y_MAX, x2: PLAY_X_MAX - 22, y2: PLAY_Y_MAX, normalX: 0, normalY: -1 },
  // Left cushion
  { x1: PLAY_X_MIN, y1: PLAY_Y_MIN + 22, x2: PLAY_X_MIN, y2: PLAY_Y_MAX - 22, normalX: 1, normalY: 0 },
  // Right cushion (Foot rail)
  { x1: PLAY_X_MAX, y1: PLAY_Y_MIN + 22, x2: PLAY_X_MAX, y2: PLAY_Y_MAX - 22, normalX: -1, normalY: 0 },
];

// Ball definitions
export const BALL_DEFS: Record<number, BallDef> = {
  0: { id: 0, number: 0, color: '#ffffff', type: 'cue', name: 'Cue Ball' },
  1: { id: 1, number: 1, color: '#eab308', type: 'solid', name: '1 (Yellow)' },
  2: { id: 2, number: 2, color: '#2563eb', type: 'solid', name: '2 (Blue)' },
  3: { id: 3, number: 3, color: '#dc2626', type: 'solid', name: '3 (Red)' },
  4: { id: 4, number: 4, color: '#9333ea', type: 'solid', name: '4 (Purple)' },
  5: { id: 5, number: 5, color: '#ea580c', type: 'solid', name: '5 (Orange)' },
  6: { id: 6, number: 6, color: '#16a34a', type: 'solid', name: '6 (Green)' },
  7: { id: 7, number: 7, color: '#881337', type: 'solid', name: '7 (Maroon)' },
  8: { id: 8, number: 8, color: '#0f172a', type: '8ball', name: '8 (Black)' },
  9: { id: 9, number: 9, color: '#eab308', type: 'stripe', name: '9 (Yellow Stripe)' },
  10: { id: 10, number: 10, color: '#2563eb', type: 'stripe', name: '10 (Blue Stripe)' },
  11: { id: 11, number: 11, color: '#dc2626', type: 'stripe', name: '11 (Red Stripe)' },
  12: { id: 12, number: 12, color: '#9333ea', type: 'stripe', name: '12 (Purple Stripe)' },
  13: { id: 13, number: 13, color: '#ea580c', type: 'stripe', name: '13 (Orange Stripe)' },
  14: { id: 14, number: 14, color: '#16a34a', type: 'stripe', name: '14 (Green Stripe)' },
  15: { id: 15, number: 15, color: '#881337', type: 'stripe', name: '15 (Maroon Stripe)' },
};

// 8-Ball Triangle Rack Setup (15 balls)
export function get8BallRack(): { id: number; x: number; y: number }[] {
  const result: { id: number; x: number; y: number }[] = [];
  const startX = FOOT_SPOT_X;
  const startY = FOOT_SPOT_Y;
  const spacing = BALL_RADIUS * 2 + 0.5;
  const dx = spacing * Math.cos(Math.PI / 6); // row horizontal gap

  // Standard tournament pattern: 8 in center, corners differ
  const pattern = [
    [1],
    [9, 2],
    [3, 8, 10],
    [11, 4, 12, 5],
    [6, 13, 7, 14, 15]
  ];

  for (let row = 0; row < 5; row++) {
    const rx = startX + row * dx;
    const rowBalls = pattern[row];
    const rowStartY = startY - ((rowBalls.length - 1) * spacing) / 2;
    for (let col = 0; col < rowBalls.length; col++) {
      result.push({
        id: rowBalls[col],
        x: rx,
        y: rowStartY + col * spacing
      });
    }
  }

  return result;
}

// 9-Ball Diamond Rack Setup (9 balls)
export function get9BallRack(): { id: number; x: number; y: number }[] {
  const result: { id: number; x: number; y: number }[] = [];
  const startX = FOOT_SPOT_X;
  const startY = FOOT_SPOT_Y;
  const spacing = BALL_RADIUS * 2 + 0.5;
  const dx = spacing * Math.cos(Math.PI / 6);

  // 1 at apex, 9 in center
  const rows = [
    { row: 0, balls: [1] },
    { row: 1, balls: [2, 3] },
    { row: 2, balls: [4, 9, 5] },
    { row: 3, balls: [6, 7] },
    { row: 4, balls: [8] }
  ];

  for (const r of rows) {
    const rx = startX + r.row * dx;
    const rowStartY = startY - ((r.balls.length - 1) * spacing) / 2;
    for (let col = 0; col < r.balls.length; col++) {
      result.push({
        id: r.balls[col],
        x: rx,
        y: rowStartY + col * spacing
      });
    }
  }

  return result;
}

// Lagging Setup: Player (bottom side of kitchen) and Opponent (top side of kitchen)
export function getLaggingBalls(): { id: number; isPlayer: boolean; x: number; y: number }[] {
  return [
    { id: 0, isPlayer: true, x: HEAD_STRING_X, y: CENTER_Y + 70 },
    { id: 1, isPlayer: false, x: HEAD_STRING_X, y: CENTER_Y - 70 }
  ];
}
