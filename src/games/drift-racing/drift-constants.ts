export const DRIFT_CONSTANTS = {
  // Vehicle Dynamics (Balanced for realistic chassis weight & G-forces)
  MAX_SPEED: 4.4,            // Controllable top speed
  MAX_REVERSE_SPEED: 1.8,
  ACCEL_FORWARD: 0.075,      // Progressive acceleration
  BRAKE_RATE: 0.16,          // Controlled deceleration
  HANDBRAKE_RATE: 0.07,      // Handbrake cuts speed slightly while sustaining slide
  ROLLING_DRAG: 0.988,       // Coasting deceleration
  TURN_SPEED: 0.052,         // Smooth, natural turning rate with body weight (not twitchy!)
  DRIFT_TURN_SPEED: 0.078,   // Controlled yaw rotation during drift
  STEER_RETURN_RATE: 0.16,   // Progressive steering rack movement (replaces instant twitch)
  MAX_STEER_RAD: 0.54,       // ~31 degrees max front wheel lock

  // Chassis Suspension & Weight Transfer (Body Weight & G-Movement)
  CHASSIS_INERTIA: 0.16,     // How fast chassis yaw catches up to steering (weight latency)
  SUSPENSION_ROLL_RATE: 0.18,// Suspension damping for body roll under lateral G
  SUSPENSION_PITCH_RATE: 0.20,// Suspension damping for nose dive & squat
  MAX_BODY_ROLL_RAD: 0.065,  // Max visual body roll angle (~3.7 degrees)
  MAX_BODY_PITCH_RAD: 0.055, // Max visual dive/squat

  // Lateral Grip Coefficients
  LATERAL_GRIP_NORMAL: 0.78, // Progressive road grip
  LATERAL_GRIP_DRIFT: 0.965, // Low lateral friction: glides sideways smoothly in a drift!
  LATERAL_GRIP_HANDBRAKE: 0.98, // Maximum slide when yanking handbrake

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
  DRIFT_INIT_ANGLE_DEG: 12, // Lower threshold so getting sideways rewards points immediately
  MAX_DRIFT_ANGLE_DEG: 95, // Spinout threshold: > 95° = TWIST FAULT (0 pts round)
  
  // Throttle Commitment
  COMMITMENT_MIN_THROTTLE: 0.30,

  // Green Clipping Zone Multipliers
  ZONE_TIRE_MULTIPLIERS: [0, 0.25, 0.50, 0.75, 1.00], // 0, 1, 2, 3, 4 tires

  // Chase Proximity Brackets (px)
  PROXIMITY_DOOR_TO_DOOR: 46, // Ultra close tandem
  PROXIMITY_POCKET: 82,       // Tight chase
  PROXIMITY_OUT_OF_RANGE: 150,

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
