export const TABLE_WIDTH = 400;
export const TABLE_HEIGHT = 720;

export const RAIL_LEFT = 22;
export const RAIL_RIGHT = 378;
export const RAIL_TOP = 22;
export const RAIL_BOTTOM = 698;

export const PLAY_WIDTH = RAIL_RIGHT - RAIL_LEFT; // 356
export const PLAY_HEIGHT = RAIL_BOTTOM - RAIL_TOP; // 676
export const CENTER_X = TABLE_WIDTH * 0.5; // 200
export const CENTER_Y = TABLE_HEIGHT * 0.5; // 360

export const DIVIDER_THICKNESS = 14;
export const DIVIDER_TOP = CENTER_Y - DIVIDER_THICKNESS * 0.5; // 353
export const DIVIDER_BOTTOM = CENTER_Y + DIVIDER_THICKNESS * 0.5; // 367

export const GATE_WIDTH = 38; // Snug fit matching puck diameter (34px) with 2px clearance on each side
export const GATE_LEFT = CENTER_X - GATE_WIDTH * 0.5;
export const GATE_RIGHT = CENTER_X + GATE_WIDTH * 0.5;

export const PUCK_RADIUS = 17;
export const PUCK_DIAMETER = PUCK_RADIUS * 2; // 34
export const PUCK_MASS = 1.0;
export const PUCKS_PER_PLAYER = 5;

// Elastic Cord positions
export const PLAYER_BAND_REST_Y = 636;
export const OPPONENT_BAND_REST_Y = 84;
export const BAND_LEFT_X = RAIL_LEFT + 2;
export const BAND_RIGHT_X = RAIL_RIGHT - 2;
export const MAX_PULL_DISTANCE = 45;

// Physics coefficients
export const TABLE_FRICTION = 0.986;
export const CUSHION_RESTITUTION = 0.86;
export const PUCK_RESTITUTION = 0.88;
export const SLING_FORCE_FACTOR = 0.44; // Speed mapped from pull distance
export const MAX_LAUNCH_SPEED = 24;
export const VELOCITY_STOP_THRESHOLD = 0.08;

// Fixed simulation step: 60Hz
export const FIXED_TIMESTEP = 1000 / 60;
