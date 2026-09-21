import type {
  VehiclePhysicsState,
  TireContactPoint,
  VehicleRole,
  RunScoreBreakdown,
  CarModelType
} from './drift-types';
import { DRIFT_CONSTANTS } from './drift-constants';
import { DriftTrack } from './drift-track';

export class DriftEngine {
  public track: DriftTrack;

  constructor(track?: DriftTrack) {
    this.track = track || new DriftTrack();
  }

  /**
   * Initializes a vehicle physics state at specified coordinates & heading
   */
  public createVehicleState(x: number, y: number, angle: number, carType: CarModelType = 'ae86'): VehiclePhysicsState {
    const dummyTire: TireContactPoint = { x, y, inZone: false };
    const state: VehiclePhysicsState = {
      x,
      y,
      vx: 0,
      vy: 0,
      speed: 0,
      angle,
      steerAngle: 0,
      angularVelocity: 0,
      driftSlipAngle: 0,
      throttle: 0,
      brake: false,
      handbrake: false,
      wheelSpinAngle: 0,
      stationaryTimer: 0,
      tires: [{ ...dummyTire }, { ...dummyTire }, { ...dummyTire }, { ...dummyTire }]
    };
    this.updateTirePositions(state, carType);
    return state;
  }

  public createInitialScore(): RunScoreBreakdown {
    return {
      driftAngleScore: 0,
      zoneScore: 0,
      throttleCommitmentScore: 0,
      proximityScore: 0,
      collisionPenalty: 0,
      overtakePenalty: 0,
      isZeroFault: false,
      totalScore: 0,
      timeElapsed: 0,
      finished: false,
      disqualified: false
    };
  }

  /**
   * Updates 4 tire contact coordinates in world space
   */
  public updateTirePositions(state: VehiclePhysicsState, carType: CarModelType) {
    const dim = (carType === 'ae86' ? DRIFT_CONSTANTS.AE86 : DRIFT_CONSTANTS.S15);
    const cos = Math.cos(state.angle);
    const sin = Math.sin(state.angle);

    // FL: Front-Left
    state.tires[0].x = state.x - cos * dim.HALF_TRACK - sin * dim.FRONT_AXLE_Y;
    state.tires[0].y = state.y - sin * dim.HALF_TRACK + cos * dim.FRONT_AXLE_Y;

    // FR: Front-Right
    state.tires[1].x = state.x + cos * dim.HALF_TRACK - sin * dim.FRONT_AXLE_Y;
    state.tires[1].y = state.y + sin * dim.HALF_TRACK + cos * dim.FRONT_AXLE_Y;

    // RL: Rear-Left
    state.tires[2].x = state.x - cos * dim.HALF_TRACK - sin * dim.REAR_AXLE_Y;
    state.tires[2].y = state.y - sin * dim.HALF_TRACK + cos * dim.REAR_AXLE_Y;

    // RR: Rear-Right
    state.tires[3].x = state.x + cos * dim.HALF_TRACK - sin * dim.REAR_AXLE_Y;
    state.tires[3].y = state.y + sin * dim.HALF_TRACK + cos * dim.REAR_AXLE_Y;

    // Check intersection with clipping zones
    for (let i = 0; i < 4; i++) {
      const t = state.tires[i];
      t.inZone = false;
      for (const zone of this.track.clippingZones) {
        if (DriftTrack.isPointInPolygon(t, zone.polygon)) {
          t.inZone = true;
          break;
        }
      }
    }
  }

  /**
   * Physics step for one vehicle
   */
  public stepPhysics(
    state: VehiclePhysicsState,
    inputs: { throttle: number; steer: number; brake: boolean; handbrake: boolean },
    carType: CarModelType,
    dt: number = 1 / 60
  ) {
    state.throttle = inputs.throttle;
    state.brake = inputs.brake;
    state.handbrake = inputs.handbrake;

    // 1. Steering Articulation
    const targetSteer = inputs.steer * DRIFT_CONSTANTS.MAX_STEER_RAD;
    state.steerAngle += (targetSteer - state.steerAngle) * DRIFT_CONSTANTS.STEER_RETURN_RATE;

    // 2. Acceleration & Braking
    if (inputs.throttle > 0) {
      state.speed = Math.min(
        state.speed + inputs.throttle * DRIFT_CONSTANTS.ACCEL_FORWARD,
        DRIFT_CONSTANTS.MAX_SPEED
      );
    } else if (inputs.brake) {
      state.speed = Math.max(state.speed - DRIFT_CONSTANTS.BRAKE_RATE, -DRIFT_CONSTANTS.MAX_REVERSE_SPEED);
    } else {
      state.speed *= DRIFT_CONSTANTS.ROLLING_DRAG;
    }

    if (inputs.handbrake) {
      state.speed *= (1.0 - DRIFT_CONSTANTS.HANDBRAKE_RATE);
    }

    // 3. Angular Rotation
    const forwardDirection = (state.speed >= 0 ? 1 : -1);
    const driftMultiplier = (inputs.handbrake ? 1.75 : 1.0);

    if (Math.abs(state.speed) > 0.15) {
      state.angle += state.steerAngle * DRIFT_CONSTANTS.TURN_SPEED * (state.speed / DRIFT_CONSTANTS.MAX_SPEED) * forwardDirection * driftMultiplier;
    }

    // 4. Lateral Grip vs Drift Slip
    const headingX = Math.sin(state.angle);
    const headingY = -Math.cos(state.angle);

    let grip = DRIFT_CONSTANTS.TIRE_GRIP_NORMAL;
    if (inputs.handbrake) {
      grip = DRIFT_CONSTANTS.TIRE_GRIP_HANDBRAKE;
    } else if (state.driftSlipAngle > DRIFT_CONSTANTS.DRIFT_INIT_ANGLE_DEG) {
      grip = DRIFT_CONSTANTS.TIRE_GRIP_DRIFT;
    }

    state.vx = state.vx * grip + headingX * state.speed * (1 - grip);
    state.vy = state.vy * grip + headingY * state.speed * (1 - grip);

    state.x += state.vx;
    state.y += state.vy;

    // 5. Wheel Spin Angle (for tire rolling animation)
    state.wheelSpinAngle += state.speed * 1.2;

    // 6. Calculate Drift Slip Angle (Degrees between heading and velocity vector)
    const moveSpeed = Math.hypot(state.vx, state.vy);
    if (moveSpeed > 0.8) {
      const moveAngle = Math.atan2(state.vy, state.vx);
      const forwardAngle = Math.atan2(-Math.cos(state.angle), Math.sin(state.angle));
      let diff = Math.abs(moveAngle - forwardAngle);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      state.driftSlipAngle = Math.round((diff * 180) / Math.PI);
    } else {
      state.driftSlipAngle = 0;
    }

    // 7. Update Tires
    this.updateTirePositions(state, carType);

    // 8. Anti-stall countdown check
    if (moveSpeed < 0.4) {
      state.stationaryTimer += dt;
    } else {
      state.stationaryTimer = Math.max(0, state.stationaryTimer - dt * 1.5);
    }
  }

  /**
   * Handles barrier / wall collisions and penalties
   */
  public handleWallCollisions(
    state: VehiclePhysicsState,
    score: RunScoreBreakdown,
    dt: number = 1 / 60
  ): { collided: boolean; wallStop: boolean } {
    let collided = false;
    let wallStop = false;

    // Test car perimeter points against wall segments
    const allWalls = [...this.track.outerWalls, ...this.track.innerWalls];
    const carRadius = 18;

    for (const wall of allWalls) {
      const dist = this.pointToSegmentDistance({ x: state.x, y: state.y }, wall.p1, wall.p2);
      if (dist < carRadius) {
        collided = true;
        score.collisionPenalty += DRIFT_CONSTANTS.WALL_SCRAPE_PENALTY_PER_SEC * dt;

        // Normal bounce push out
        const segDx = wall.p2.x - wall.p1.x;
        const segDy = wall.p2.y - wall.p1.y;
        const segLen = Math.hypot(segDx, segDy) || 1;
        const nx = -segDy / segLen;
        const ny = segDx / segLen;

        // Reposition
        state.x += nx * (carRadius - dist);
        state.y += ny * (carRadius - dist);

        // Dampen velocity
        state.vx *= 0.65;
        state.vy *= 0.65;
        state.speed *= 0.65;

        // Check if wall stopped the car completely (Rule 7: Hard wall stop = 0 pts round)
        if (Math.hypot(state.vx, state.vy) < 0.2) {
          wallStop = true;
          score.isZeroFault = true;
          score.faultReason = 'WALL STOP (CRASH)';
        }
        break;
      }
    }

    return { collided, wallStop };
  }

  /**
   * Distance from point P to line segment AB
   */
  private pointToSegmentDistance(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
    const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
  }

  /**
   * Evaluates Tandem Drift Scoring Rules in real time
   */
  public evaluateScoring(
    playerState: VehiclePhysicsState,
    playerScore: RunScoreBreakdown,
    playerRole: VehicleRole,
    enemyState: VehiclePhysicsState,
    enemyScore: RunScoreBreakdown,
    _enemyRole: VehicleRole,
    dt: number = 1 / 60
  ) {
    // 1. Evaluate Lead Vehicle
    const leadState = (playerRole === 'lead' ? playerState : enemyState);
    const leadScore = (playerRole === 'lead' ? playerScore : enemyScore);

    this.scoreLeadRun(leadState, leadScore, dt);

    // 2. Evaluate Chase Vehicle (Proximity, Tandem rules, Front axle overtake)
    const chaseState = (playerRole === 'chase' ? playerState : enemyState);
    const chaseScore = (playerRole === 'chase' ? playerScore : enemyScore);

    this.scoreChaseRun(chaseState, chaseScore, leadState, dt);

    // 3. Check Inter-Vehicle Collision
    const distBetweenCars = Math.hypot(playerState.x - enemyState.x, playerState.y - enemyState.y);
    if (distBetweenCars < 36) {
      // Chase bumped into lead!
      chaseScore.collisionPenalty += DRIFT_CONSTANTS.CAR_CONTACT_PENALTY * dt;
      // Push cars apart
      const overlap = 36 - distBetweenCars;
      const angle = Math.atan2(chaseState.y - leadState.y, chaseState.x - leadState.x);
      chaseState.x += Math.cos(angle) * overlap * 0.5;
      chaseState.y += Math.sin(angle) * overlap * 0.5;
      leadState.x -= Math.cos(angle) * overlap * 0.5;
      leadState.y -= Math.sin(angle) * overlap * 0.5;
    }

    // 4. Update Time Elapsed
    playerScore.timeElapsed += dt;
    enemyScore.timeElapsed += dt;

    // 5. Calculate Final Totals
    this.calculateFinalScore(playerScore);
    this.calculateFinalScore(enemyScore);
  }

  /**
   * Scoring for Lead Car:
   * Drift Angle + Green Zone Tires + Gas Commitment
   */
  private scoreLeadRun(state: VehiclePhysicsState, score: RunScoreBreakdown, dt: number) {
    if (score.isZeroFault || score.finished) return;

    // Rule 6: Over-rotation / Twist fault (> 95° spinout = 0 pts)
    if (state.driftSlipAngle > DRIFT_CONSTANTS.MAX_DRIFT_ANGLE_DEG) {
      score.isZeroFault = true;
      score.faultReason = 'SPINOUT / OVER-ROTATION (TWIST)';
      return;
    }

    // Active Drift Scoring
    if (state.driftSlipAngle >= DRIFT_CONSTANTS.DRIFT_INIT_ANGLE_DEG && state.speed > 1.2) {
      // Angle points (higher degrees approaching 90° awards more points)
      const angleRatio = Math.min(1.0, state.driftSlipAngle / 85);
      const angleRate = Math.pow(angleRatio, 1.6) * 45;
      score.driftAngleScore += angleRate * dt;

      // Throttle commitment (more gas = thicker smoke = higher score)
      const commitmentMultiplier = 1.0 + state.throttle * 0.85;
      score.throttleCommitmentScore += (state.throttle * 25) * dt;

      // Green Clipping Zone tire bonus (0, 1, 2, 3, or 4 tires in zone)
      let tiresInZone = 0;
      for (let i = 0; i < 4; i++) {
        if (state.tires[i].inZone) tiresInZone++;
      }
      const zoneMultiplier = DRIFT_CONSTANTS.ZONE_TIRE_MULTIPLIERS[tiresInZone];
      const zoneBonusRate = 50 * zoneMultiplier * commitmentMultiplier;
      score.zoneScore += zoneBonusRate * dt;
    }

    // Anti-stall Disqualification check (5 seconds stationary)
    if (state.stationaryTimer >= DRIFT_CONSTANTS.ANTI_STALL_SECONDS) {
      score.disqualified = true;
      score.isZeroFault = true;
      score.faultReason = 'DISQUALIFIED (STATIONARY TIMEOUT)';
    }
  }

  /**
   * Scoring for Chase Car:
   * Proximity is the primary score + Minor angle/zone additions
   * Faults: Overtaking lead front axle, transition crowding
   */
  private scoreChaseRun(
    chaseState: VehiclePhysicsState,
    chaseScore: RunScoreBreakdown,
    leadState: VehiclePhysicsState,
    dt: number
  ) {
    if (chaseScore.isZeroFault || chaseScore.finished) return;

    // Rule 6: Over-rotation / Twist fault (> 95° spinout = 0 pts)
    if (chaseState.driftSlipAngle > DRIFT_CONSTANTS.MAX_DRIFT_ANGLE_DEG) {
      chaseScore.isZeroFault = true;
      chaseScore.faultReason = 'SPINOUT / OVER-ROTATION (TWIST)';
      return;
    }

    // Rule 8: Chase cannot pass Lead front axle!
    // Project vector from Lead to Chase onto Lead forward vector
    const leadHeadingX = Math.sin(leadState.angle);
    const leadHeadingY = -Math.cos(leadState.angle);
    const relX = chaseState.x - leadState.x;
    const relY = chaseState.y - leadState.y;
    const forwardProjection = relX * leadHeadingX + relY * leadHeadingY;

    if (forwardProjection > 25) {
      // Chase passed Lead's front bumper!
      chaseScore.overtakePenalty += DRIFT_CONSTANTS.OVERTAKE_LEAD_AXLE_PENALTY * dt;
    }

    // Proximity Scoring (Door-to-Door tandem)
    const dist = Math.hypot(relX, relY);
    if (dist < DRIFT_CONSTANTS.PROXIMITY_DOOR_TO_DOOR) {
      // Door-to-door proximity!
      chaseScore.proximityScore += 90 * dt;
    } else if (dist < DRIFT_CONSTANTS.PROXIMITY_POCKET) {
      // In the tandem pocket
      chaseScore.proximityScore += 55 * dt;
    } else if (dist < DRIFT_CONSTANTS.PROXIMITY_OUT_OF_RANGE) {
      // Trailing
      chaseScore.proximityScore += 20 * dt;
    }

    // Minor Angle & Zone Additions
    if (chaseState.driftSlipAngle >= DRIFT_CONSTANTS.DRIFT_INIT_ANGLE_DEG && chaseState.speed > 1.2) {
      chaseScore.driftAngleScore += (chaseState.driftSlipAngle / 90) * 15 * dt;
      let tiresInZone = 0;
      for (let i = 0; i < 4; i++) {
        if (chaseState.tires[i].inZone) tiresInZone++;
      }
      chaseScore.zoneScore += (tiresInZone * 5) * dt;
    }

    // Anti-stall check
    if (chaseState.stationaryTimer >= DRIFT_CONSTANTS.ANTI_STALL_SECONDS) {
      chaseScore.disqualified = true;
      chaseScore.isZeroFault = true;
      chaseScore.faultReason = 'DISQUALIFIED (STATIONARY TIMEOUT)';
    }
  }

  private calculateFinalScore(score: RunScoreBreakdown) {
    if (score.isZeroFault || score.disqualified) {
      score.totalScore = 0;
      return;
    }

    const positivePoints = 
      score.driftAngleScore + 
      score.zoneScore + 
      score.throttleCommitmentScore + 
      score.proximityScore;

    const penalties = score.collisionPenalty + score.overtakePenalty;
    score.totalScore = Math.max(0, Math.round(positivePoints - penalties));
  }
}
