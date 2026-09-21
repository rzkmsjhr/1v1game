export const DRIFT_CONSTANTS = {
  // Vehicle Dynamics
  MAX_SPEED: 7.2,
  MAX_REVERSE_SPEED: 2.2,
  ACCEL_FORWARD: 0.20,
  BRAKE_RATE: 0.30,
  HANDBRAKE_RATE: 0.16,
  ROLLING_DRAG: 0.985,
  TURN_SPEED: 0.048,
  STEER_RETURN_RATE: 0.20,
  MAX_STEER_RAD: 0.55, // ~31.5 degrees

  // Tire Grip Coefficients
  TIRE_GRIP_NORMAL: 0.945,
  TIRE_GRIP_DRIFT: 0.885,
  TIRE_GRIP_HANDBRAKE: 0.825,

  // Vehicle Dimensions (px)
  AE86: {
    LENGTH: 63,
    WIDTH: 25,
    FRONT_AXLE_Y: -18.5,
    REAR_AXLE_Y: 18.5,
    HALF_TRACK: 10.8
  },
  S15: {
    LENGTH: 69,
    WIDTH: 26,
    FRONT_AXLE_Y: -20.5,
    REAR_AXLE_Y: 20.5,
    HALF_TRACK: 11.4
  },

  // Scoring Rules & Thresholds
  DRIFT_INIT_ANGLE_DEG: 16, // Slip angle needed to start scoring drift points
  MAX_DRIFT_ANGLE_DEG: 95, // Spinout threshold: > 95° = TWIST FAULT (0 pts round)
  
  // Throttle Commitment
  COMMITMENT_MIN_THROTTLE: 0.35,

  // Green Clipping Zone Multipliers
  ZONE_TIRE_MULTIPLIERS: [0, 0.25, 0.50, 0.75, 1.00], // 0, 1, 2, 3, 4 tires

  // Chase Proximity Brackets (px)
  PROXIMITY_DOOR_TO_DOOR: 50, // Ultra close tandem
  PROXIMITY_POCKET: 90,       // Tight chase
  PROXIMITY_OUT_OF_RANGE: 160,

  // Penalties
  OVERTAKE_LEAD_AXLE_PENALTY: 200,
  CAR_CONTACT_PENALTY: 150,
  WALL_SCRAPE_PENALTY_PER_SEC: 100,

  // Disqualification Timer
  ANTI_STALL_SECONDS: 5.0, // 5.0 seconds stationary = DQ!

  // Track Figure-8 Dimensions
  TRACK_WIDTH: 140,
  TRACK_BOUNDS: {
    MIN_X: -200,
    MAX_X: 1800,
    MIN_Y: -200,
    MAX_Y: 1400
  }
};
