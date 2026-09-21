export type VehicleRole = 'lead' | 'chase' | 'solo';
export type CarModelType = 'ae86' | 's15';

export interface Point2D {
  x: number;
  y: number;
}

export interface TireContactPoint {
  x: number;
  y: number;
  inZone: boolean;
}

export interface VehiclePhysicsState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;          // Forward speed in px/frame
  angle: number;          // Heading in radians (0 = pointing up)
  steerAngle: number;     // Front wheels angle in radians relative to body (-0.55 to 0.55)
  angularVelocity: number;
  driftSlipAngle: number; // Degrees between heading and velocity vector (0 to 180)
  throttle: number;       // 0 to 1
  brake: boolean;
  handbrake: boolean;
  wheelSpinAngle: number;
  stationaryTimer: number; // Seconds stationary for anti-stall
  bodyRoll: number;        // Chassis lateral roll angle from G-forces (-0.1 to 0.1 rad)
  bodyPitch: number;       // Chassis pitch (dive on brake, squat on accel)
  lateralG: number;        // Lateral G-force acceleration
  tires: [TireContactPoint, TireContactPoint, TireContactPoint, TireContactPoint]; // FL, FR, RL, RR
}

export interface ClippingZone {
  id: string;
  name: string;
  polygon: Point2D[];
  outerEdge: Point2D[];
  zoneWeight: number; // Score multiplier for this section
}

export interface RunScoreBreakdown {
  driftAngleScore: number;
  zoneScore: number;
  throttleCommitmentScore: number;
  proximityScore: number;
  collisionPenalty: number;
  overtakePenalty: number;
  isZeroFault: boolean;
  faultReason?: string;
  totalScore: number;
  timeElapsed: number;
  finished: boolean;
  disqualified: boolean;
}

export type MatchPhase = 
  | 'ready'
  | 'countdown'
  | 'racing'
  | 'round_result'
  | 'omt_announcement'
  | 'solo_sprint_intro'
  | 'match_end';

export type RoundSubtype = 
  | 'r1_normal'
  | 'r2_normal'
  | 'r3_omt1'
  | 'r4_omt2'
  | 'solo_p1'
  | 'solo_p2';

export interface RoundState {
  currentRoundNumber: number; // 1, 2, 3 (OMT1), 4 (OMT2), 5 (Solo P1), 6 (Solo P2)
  roundType: RoundSubtype;
  playerRole: VehicleRole;
  enemyRole: VehicleRole;
  playerScore: RunScoreBreakdown;
  enemyScore: RunScoreBreakdown;
  countdownValue: number;
  phase: MatchPhase;
  phaseTimer: number;
}

export interface MatchHistoryEntry {
  roundNumber: number;
  roundName: string;
  playerScore: number;
  enemyScore: number;
  playerRole: VehicleRole;
  enemyRole: VehicleRole;
}

export interface DriftPeerMessage {
  type: 
    | 'DRIFT_SYNC_STATE'
    | 'DRIFT_ROUND_READY'
    | 'DRIFT_ROUND_START'
    | 'DRIFT_ROUND_END'
    | 'DRIFT_REMATCH_OFFER'
    | 'DRIFT_REMATCH_ACCEPT';
  payload?: any;
}
