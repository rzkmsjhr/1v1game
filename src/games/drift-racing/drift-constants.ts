export const DRIFT_CONSTANTS = {
  // Vehicle Dynamics (Tuned for energetic, natural drift dynamics and twistability)
  MAX_SPEED: 2.70,           // +20% boost from 2.25: fast, exhilarating cruising speed
  MAX_REVERSE_SPEED: 1.05,
  ACCEL_FORWARD: 0.044,      // +20% boost from 0.036: punchy, immediate throttle pickup
  BRAKE_RATE: 0.12,          // Crisp deceleration matching 2.70 top speed
  HANDBRAKE_RATE: 0.045,     // Handbrake cuts speed slightly while sustaining slide
  ROLLING_DRAG: 0.985,       // Natural engine coasting drag
  TURN_SPEED: 0.048,         // Smooth, natural turning rate with body weight
  DRIFT_TURN_SPEED: 0.080,   // Crisp yaw authority to twist angle & transition at 2.70 speed
  STEER_RETURN_RATE: 0.18,   // Progressive steering rack movement
  MAX_STEER_RAD: 0.54,       // ~31 degrees max front wheel lock

  // Chassis Suspension & Weight Transfer (Body Weight & G-Movement)
  CHASSIS_INERTIA: 0.17,     // How fast chassis yaw catches up to steering (weight latency)
  SUSPENSION_ROLL_RATE: 0.18,// Suspension damping for body roll under lateral G
  SUSPENSION_PITCH_RATE: 0.20,// Suspension damping for nose dive & squat
  MAX_BODY_ROLL_RAD: 0.065,  // Max visual body roll angle (~3.7 degrees)
  MAX_BODY_PITCH_RAD: 0.055, // Max visual dive/squat

  // Lateral Grip & Drift Sustain (Natural Tire Physics)
  LATERAL_GRIP_NORMAL: 0.78, // High grip road adherence (clean recovery when lifting throttle)
  LATERAL_GRIP_DRIFT: 0.978, // Natural tire slide friction (requires throttle to sustain, not Teflon ice)
  LATERAL_GRIP_HANDBRAKE: 0.982, // Friction when yanking handbrake
  DRIFT_SUSTAIN_THRUST: 0.45, // Throttle powers drift glide without locking car on rails
  DRIFT_OVERSTEER_TORQUE: 0.008, // RWD oversteer torque that rewards counter-steering

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
  DRIFT_INIT_ANGLE_DEG: 13, // Natural drift initiation angle threshold
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
