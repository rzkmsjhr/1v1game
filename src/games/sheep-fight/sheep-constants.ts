export const SHEEP_CONSTANTS = {
  // Virtual Viewport Dimensions (Portrait mobile aspect ratio)
  VIEWPORT_WIDTH: 460,
  VIEWPORT_HEIGHT: 860,

  // Lanes
  NUM_LANES: 5,
  LANE_MARGIN_X: 30,
  LANE_TOP_Y: 45,        // Opponent goal line
  LANE_BOTTOM_Y: 815,    // Player goal line
  START_SPACE_DEPTH: 88, // Physical clearance required to deploy a new sheep

  // Physics & Speeds (Requirement 6: Pushing movement is even across all sheep)
  MARCH_SPEED: 95,       // Pixels per second when walking unopposed
  PUSH_SPEED: 32,        // Pixels per second when pushing opponent backward (constant!)
  SPAWN_COOLDOWN: 0.95,  // Seconds cooldown between sheep deployments

  // Win Rules (Requirement 4)
  LANES_TO_WIN: 3,
  DRAW_LANES_FOR_SUDDEN_DEATH: 3,

  // Visual Styling (Requirement 1: 5 lanes, alternating dark/light green grass, dirt separators)
  COLORS: {
    DARK_GRASS: '#15803d',
    LIGHT_GRASS: '#16a34a',
    DIRT_SEPARATOR: '#78350f',
    DIRT_HIGHLIGHT: '#92400e',
    FIELD_BORDER: '#0f172a',
    PLAYER_GOAL: '#1e3a8a',
    PLAYER_GOAL_LINE: '#3b82f6',
    OPPONENT_GOAL: '#7f1d1d',
    OPPONENT_GOAL_LINE: '#ef4444',
    START_ZONE_CLEAR: 'rgba(56, 189, 248, 0.25)',
    START_ZONE_BLOCKED: 'rgba(239, 68, 68, 0.35)',
    START_ZONE_BORDER: 'rgba(56, 189, 248, 0.7)'
  }
};
