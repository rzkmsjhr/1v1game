import type {
  VehiclePhysicsState,
  TireContactPoint,
  VehicleRole,
  RunScoreBreakdown,
  CarModelType,
  CarCollisionResult
} from './drift-types';
import { DRIFT_CONSTANTS } from './drift-constants';
import { DriftTrack } from './drift-track';

export class DriftEngine {
  public track: DriftTrack;
  private contactCooldown: number = 0;

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
      prevX: x,
      prevY: y,
      vx: 0,
      vy: 0,
      speed: 0,
      angle,
      prevAngle: angle,
      steerAngle: 0,
      angularVelocity: 0,
      driftSlipAngle: 0,
      throttle: 0,
      brake: false,
      handbrake: false,
      wheelSpinAngle: 0,
      stationaryTimer: 0,
      bodyRoll: 0,
      bodyPitch: 0,
      lateralG: 0,
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

    // Check intersection with clipping zones (fast AABB filter skips 99% of raycasts!)
    for (let i = 0; i < 4; i++) {
      const t = state.tires[i];
      t.inZone = false;
      for (let z = 0; z < this.track.clippingZones.length; z++) {
        const zone = this.track.clippingZones[z];
        if (t.x < zone.minX || t.x > zone.maxX || t.y < zone.minY || t.y > zone.maxY) {
          continue;
        }
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
    state.prevX = state.x;
    state.prevY = state.y;
    state.prevAngle = state.angle;

    state.throttle = inputs.throttle;
    state.brake = inputs.brake;
    state.handbrake = inputs.handbrake;

    // 1. Steering Articulation (front wheels)
    const targetSteer = inputs.steer * DRIFT_CONSTANTS.MAX_STEER_RAD;
    state.steerAngle += (targetSteer - state.steerAngle) * DRIFT_CONSTANTS.STEER_RETURN_RATE;

    // 2. Decompose current velocity into Forward (vFwd) and Lateral (vLat) components
    // Heading unit vectors: forward = (sin(angle), -cos(angle)), right = (cos(angle), sin(angle))
    const cosAngle = Math.cos(state.angle);
    const sinAngle = Math.sin(state.angle);
    let vFwd = state.vx * sinAngle - state.vy * cosAngle;
    let vLat = state.vx * cosAngle + state.vy * sinAngle;
    let currentSpeed = Math.hypot(vFwd, vLat);

    // 3. Drift State & Oversteer Detection
    // The car effortlessly initiates a drift when:
    // a) Handbrake (Space / DRIFT button) is tapped
    // b) Power-oversteer: turning with throttle at speed (Math.abs(inputs.steer) > 0.40 && inputs.throttle > 0.45 && currentSpeed > 0.50)
    const isPowerOversteer = (Math.abs(inputs.steer) > 0.40 && inputs.throttle > 0.45 && currentSpeed > 0.50);
    const wantsDrift = inputs.handbrake || isPowerOversteer;
    const currentSlipAngle = Math.atan2(Math.abs(vLat), Math.max(0.15, Math.abs(vFwd))) * (180 / Math.PI);
    const isCurrentlyDrifting = currentSlipAngle > DRIFT_CONSTANTS.DRIFT_INIT_ANGLE_DEG || wantsDrift;

    // 4. Forward & Lateral Acceleration (Throttle Sustains the Drift Slide!)
    if (inputs.throttle > 0) {
      if (isCurrentlyDrifting) {
        // While drifting, spinning rear wheels drive forward with punch and sustain lateral slide
        vFwd += inputs.throttle * DRIFT_CONSTANTS.ACCEL_FORWARD * 0.75;
        vLat += Math.sign(vLat || 1) * inputs.throttle * DRIFT_CONSTANTS.ACCEL_FORWARD * DRIFT_CONSTANTS.DRIFT_SUSTAIN_THRUST;
      } else {
        vFwd += inputs.throttle * DRIFT_CONSTANTS.ACCEL_FORWARD;
      }
    } else if (inputs.brake) {
      if (vFwd > 0.1) {
        vFwd = Math.max(0, vFwd - DRIFT_CONSTANTS.BRAKE_RATE);
      } else {
        vFwd = Math.max(-DRIFT_CONSTANTS.MAX_REVERSE_SPEED, vFwd - DRIFT_CONSTANTS.BRAKE_RATE * 0.6);
      }
    } else {
      vFwd *= DRIFT_CONSTANTS.ROLLING_DRAG;
    }

    if (inputs.handbrake) {
      vFwd *= (1.0 - DRIFT_CONSTANTS.HANDBRAKE_RATE);
    }

    currentSpeed = Math.hypot(vFwd, vLat);

    // 5. Angular Yaw Dynamics with Real Chassis Rotational Inertia (Body Weight)
    const speedRatio = Math.min(1.0, currentSpeed / 0.65);
    const forwardDirection = (vFwd >= -0.1 ? 1 : -1);

    if (currentSpeed > 0.1) {
      let targetYaw = state.steerAngle * DRIFT_CONSTANTS.TURN_SPEED * speedRatio * forwardDirection;

      if (isCurrentlyDrifting) {
        // In drift: responsive steering authority to twist, aim nose, or transition
        targetYaw = state.steerAngle * DRIFT_CONSTANTS.DRIFT_TURN_SPEED * speedRatio * forwardDirection;
        if (inputs.handbrake) targetYaw *= 1.50; // Handbrake whip!

        // Holding throttle in a drift produces rear wheelspin oversteer torque in direction of slide
        // In a left slide (vLat > 0), rear steps out right -> negative yaw cuts nose inward
        if (inputs.throttle > 0.1 && Math.abs(currentSlipAngle) > 6) {
          targetYaw -= Math.sign(vLat || 1) * inputs.throttle * DRIFT_CONSTANTS.DRIFT_OVERSTEER_TORQUE;
        }
        // Responsive rotational momentum: twists crisply when steering is input
        state.angularVelocity += (targetYaw - state.angularVelocity) * 0.32;
      } else {
        // Normal grip: heavy chassis inertia resists instant turning, builds progressive cornering bite!
        state.angularVelocity += (targetYaw - state.angularVelocity) * DRIFT_CONSTANTS.CHASSIS_INERTIA;
      }
    } else {
      state.angularVelocity *= 0.8;
    }

    state.angle += state.angularVelocity;

    // 6. Calculate Lateral & Longitudinal G-Forces (Weight Transfer)
    // Lateral G from cornering rate & lateral slide
    state.lateralG = (vFwd * state.angularVelocity * 35.0) + (vLat * 0.50);
    const targetRoll = Math.max(-DRIFT_CONSTANTS.MAX_BODY_ROLL_RAD, Math.min(DRIFT_CONSTANTS.MAX_BODY_ROLL_RAD, state.lateralG * 0.045));
    state.bodyRoll += (targetRoll - state.bodyRoll) * DRIFT_CONSTANTS.SUSPENSION_ROLL_RATE;

    // Longitudinal G from throttle squat & brake dive
    let targetPitch = 0;
    if (inputs.throttle > 0) targetPitch = -inputs.throttle * 0.04; // Rear squats down
    else if (inputs.brake) targetPitch = 0.05; // Nose dives forward
    state.bodyPitch += (targetPitch - state.bodyPitch) * DRIFT_CONSTANTS.SUSPENSION_PITCH_RATE;

    // 7. Lateral Friction (Grip vs Drift Glide)
    if (inputs.handbrake) {
      vLat *= DRIFT_CONSTANTS.LATERAL_GRIP_HANDBRAKE;
    } else if (isCurrentlyDrifting && (inputs.throttle > 0.12 || wantsDrift)) {
      vLat *= DRIFT_CONSTANTS.LATERAL_GRIP_DRIFT; // 0.992: slide is sustained as long as gas is held!
    } else {
      vLat *= DRIFT_CONSTANTS.LATERAL_GRIP_NORMAL; // 0.78: clean grip recovery when lifting gas
    }

    // Speed Cap (proportional clamping so speed cap respects drift direction)
    const rawSpeed = Math.hypot(vFwd, vLat);
    if (rawSpeed > DRIFT_CONSTANTS.MAX_SPEED) {
      const scale = DRIFT_CONSTANTS.MAX_SPEED / rawSpeed;
      vFwd *= scale;
      vLat *= scale;
    }

    // 7. Reconstruct velocity in world coordinates
    state.vx = vFwd * sinAngle + vLat * cosAngle;
    state.vy = -vFwd * cosAngle + vLat * sinAngle;

    state.speed = Math.hypot(state.vx, state.vy);
    state.x += state.vx;
    state.y += state.vy;

    // 8. Wheel spin for tire tread animation
    state.wheelSpinAngle += state.speed * 1.4;

    // 9. Accurate Drift Slip Angle
    if (state.speed > 0.4) {
      const moveAngle = Math.atan2(state.vy, state.vx);
      const headingAngle = Math.atan2(-cosAngle, sinAngle);
      let diff = Math.abs(moveAngle - headingAngle);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      state.driftSlipAngle = Math.round((diff * 180) / Math.PI);
    } else {
      state.driftSlipAngle = 0;
    }

    // 10. Update 4 tire positions & contact
    this.updateTirePositions(state, carType);

    // 11. Anti-stall stationary timer
    if (state.speed < 0.3) {
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

    const walls = this.track.allWalls;
    const carRadius = 16;
    const carRadiusSq = carRadius * carRadius;
    const prevSpeed = Math.hypot(state.vx, state.vy);

    for (let i = 0; i < walls.length; i++) {
      const wall = walls[i];

      // Fast AABB filter: skip walls that are far away from the car
      if (
        state.x < wall.minX - carRadius ||
        state.x > wall.maxX + carRadius ||
        state.y < wall.minY - carRadius ||
        state.y > wall.maxY + carRadius
      ) {
        continue;
      }

      const closest = this.closestPointOnSegment({ x: state.x, y: state.y }, wall.p1, wall.p2);
      const toCarX = state.x - closest.x;
      const toCarY = state.y - closest.y;
      const distSq = toCarX * toCarX + toCarY * toCarY;

      if (distSq < carRadiusSq) {
        const dist = Math.sqrt(distSq);
        collided = true;
        score.collisionPenalty += DRIFT_CONSTANTS.WALL_SCRAPE_PENALTY_PER_SEC * dt;

        // Push car directly AWAY from the segment towards open track!
        const pushDist = carRadius - dist;
        let pushX = 0;
        let pushY = 0;
        if (dist > 0.001) {
          pushX = toCarX / dist;
          pushY = toCarY / dist;
        } else {
          const segDx = wall.p2.x - wall.p1.x;
          const segDy = wall.p2.y - wall.p1.y;
          const segLen = Math.hypot(segDx, segDy) || 1;
          pushX = -segDy / segLen;
          pushY = segDx / segLen;
        }

        state.x += pushX * (pushDist + 0.5);
        state.y += pushY * (pushDist + 0.5);

        // Deflect velocity: preserve momentum sliding along the barrier
        const dot = state.vx * pushX + state.vy * pushY;
        if (dot < 0) {
          state.vx -= dot * pushX * 1.25;
          state.vy -= dot * pushY * 1.25;
          state.vx *= 0.82;
          state.vy *= 0.82;
          state.speed = Math.min(state.speed, Math.hypot(state.vx, state.vy));
        }

        // Hard wall stop DQ check: ONLY if car slammed into barrier from high speed!
        const currentSpeed = Math.hypot(state.vx, state.vy);
        if (prevSpeed > 2.8 && currentSpeed < 0.3) {
          wallStop = true;
          score.isZeroFault = true;
          score.faultReason = 'HARD CRASH (WALL STOP)';
        }
        break;
      }
    }

    return { collided, wallStop };
  }

  /**
   * Finds closest point on segment AB to point P
   */
  private closestPointOnSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
    const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (l2 === 0) return { x: a.x, y: a.y };
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return {
      x: a.x + t * (b.x - a.x),
      y: a.y + t * (b.y - a.y)
    };
  }

  /**
   * High-precision OBB (Oriented Bounding Box) Car-to-Car Collision Resolution
   * Implements Separating Axis Theorem (SAT), momentum exchange with restitution,
   * angular torque impulse, and intelligent tandem fault judging.
   */
  public handleCarCollision(
    car1: VehiclePhysicsState,
    model1: CarModelType,
    score1: RunScoreBreakdown,
    role1: VehicleRole,
    car2: VehiclePhysicsState,
    model2: CarModelType,
    score2: RunScoreBreakdown,
    role2: VehicleRole,
    dt: number = 1 / 60
  ): CarCollisionResult {
    if (this.contactCooldown > 0) {
      this.contactCooldown = Math.max(0, this.contactCooldown - dt);
    }

    const dims1 = model1 === 's15' ? DRIFT_CONSTANTS.S15 : DRIFT_CONSTANTS.AE86;
    const dims2 = model2 === 's15' ? DRIFT_CONSTANTS.S15 : DRIFT_CONSTANTS.AE86;

    const hx1 = dims1.WIDTH / 2;
    const hy1 = dims1.LENGTH / 2;
    const hx2 = dims2.WIDTH / 2;
    const hy2 = dims2.LENGTH / 2;

    // 1. Broadphase Circle Check
    const dx = car2.x - car1.x;
    const dy = car2.y - car1.y;
    const distSq = dx * dx + dy * dy;
    const maxR1 = Math.hypot(hx1, hy1);
    const maxR2 = Math.hypot(hx2, hy2);
    const maxDist = maxR1 + maxR2;

    if (distSq > maxDist * maxDist) {
      return {
        collided: false,
        contactX: 0,
        contactY: 0,
        normalX: 0,
        normalY: 0,
        impactSpeed: 0,
        penalizedParty: 'none',
        penaltyAmount: 0,
        isNewImpact: false
      };
    }

    // 2. Compute OBB Corners & Unit Vectors
    // In game physics: 0 angle = pointing UP (-Y).
    const f1x = Math.sin(car1.angle), f1y = -Math.cos(car1.angle);
    const r1x = Math.cos(car1.angle), r1y = Math.sin(car1.angle);

    const f2x = Math.sin(car2.angle), f2y = -Math.cos(car2.angle);
    const r2x = Math.cos(car2.angle), r2y = Math.sin(car2.angle);

    const corners1 = [
      { x: car1.x + f1x * hy1 + r1x * hx1, y: car1.y + f1y * hy1 + r1y * hx1 },
      { x: car1.x + f1x * hy1 - r1x * hx1, y: car1.y + f1y * hy1 - r1y * hx1 },
      { x: car1.x - f1x * hy1 - r1x * hx1, y: car1.y - f1y * hy1 - r1y * hx1 },
      { x: car1.x - f1x * hy1 + r1x * hx1, y: car1.y - f1y * hy1 + r1y * hx1 }
    ];

    const corners2 = [
      { x: car2.x + f2x * hy2 + r2x * hx2, y: car2.y + f2y * hy2 + r2x * hx2 },
      { x: car2.x + f2x * hy2 - r2x * hx2, y: car2.y + f2y * hy2 - r2x * hx2 },
      { x: car2.x - f2x * hy2 - r2x * hx2, y: car2.y - f2y * hy2 - r2x * hx2 },
      { x: car2.x - f2x * hy2 + r2x * hx2, y: car2.y - f2y * hy2 + r2x * hx2 }
    ];

    // 3. SAT (Separating Axis Theorem) across 4 candidate axes
    const axes = [
      { x: r1x, y: r1y },
      { x: f1x, y: f1y },
      { x: r2x, y: r2y },
      { x: f2x, y: f2y }
    ];

    let minOverlap = Infinity;
    let normX = 0, normY = 0;

    for (let i = 0; i < 4; i++) {
      const ax = axes[i].x;
      const ay = axes[i].y;

      let min1 = Infinity, max1 = -Infinity;
      for (let j = 0; j < 4; j++) {
        const p = corners1[j].x * ax + corners1[j].y * ay;
        if (p < min1) min1 = p;
        if (p > max1) max1 = p;
      }

      let min2 = Infinity, max2 = -Infinity;
      for (let j = 0; j < 4; j++) {
        const p = corners2[j].x * ax + corners2[j].y * ay;
        if (p < min2) min2 = p;
        if (p > max2) max2 = p;
      }

      const overlap = Math.min(max1, max2) - Math.max(min1, min2);
      if (overlap <= 0) {
        // Separating axis found -> no collision
        return {
          collided: false,
          contactX: 0,
          contactY: 0,
          normalX: 0,
          normalY: 0,
          impactSpeed: 0,
          penalizedParty: 'none',
          penaltyAmount: 0,
          isNewImpact: false
        };
      }

      if (overlap < minOverlap) {
        minOverlap = overlap;
        normX = ax;
        normY = ay;
      }
    }

    // Ensure normal points from Car 1 to Car 2
    if (dx * normX + dy * normY < 0) {
      normX = -normX;
      normY = -normY;
    }

    // 4. Positional Separation: push apart along normal
    const sep = (minOverlap + 0.6) * 0.5;
    car1.x -= normX * sep;
    car1.y -= normY * sep;
    car2.x += normX * sep;
    car2.y += normY * sep;

    // Contact point (center of overlapping boundary)
    const contactX = (car1.x + car2.x) * 0.5;
    const contactY = (car1.y + car2.y) * 0.5;

    // 5. Physics Response: Momentum Exchange & Restitution
    const relVx = car1.vx - car2.vx;
    const relVy = car1.vy - car2.vy;
    const vn = relVx * normX + relVy * normY;
    const impactSpeed = Math.abs(vn);

    // Pre-impulse velocities directed towards each other (positive = moving towards the other car)
    const preV1Towards2 = car1.vx * normX + car1.vy * normY;
    const preV2Towards1 = -(car2.vx * normX + car2.vy * normY);

    if (vn > 0) {
      // Cars moving towards each other -> apply bumper impulse
      const e = DRIFT_CONSTANTS.CAR_RESTITUTION || 0.32;
      const J = (1 + e) * vn * 0.5;

      car1.vx -= J * normX;
      car1.vy -= J * normY;
      car2.vx += J * normX;
      car2.vy += J * normY;

      // Tangential friction (door rubbing drag)
      const tx = -normY;
      const ty = normX;
      const vt = relVx * tx + relVy * ty;
      const Jt = vt * 0.22;
      car1.vx -= Jt * tx * 0.5;
      car1.vy -= Jt * ty * 0.5;
      car2.vx += Jt * tx * 0.5;
      car2.vy += Jt * ty * 0.5;

      car1.speed = Math.min(DRIFT_CONSTANTS.MAX_SPEED, Math.hypot(car1.vx, car1.vy));
      car2.speed = Math.min(DRIFT_CONSTANTS.MAX_SPEED, Math.hypot(car2.vx, car2.vy));

      // Angular Yaw Torque Impulse (car spins if clipped off-center)
      const r1x = contactX - car1.x;
      const r1y = contactY - car1.y;
      const r2x = contactX - car2.x;
      const r2y = contactY - car2.y;

      const tau1 = -(r1x * normY - r1y * normX) * (J + 0.08) * 0.015;
      const tau2 = (r2x * normY - r2y * normX) * (J + 0.08) * 0.015;

      car1.angularVelocity = Math.max(-0.25, Math.min(0.25, car1.angularVelocity + tau1));
      car2.angularVelocity = Math.max(-0.25, Math.min(0.25, car2.angularVelocity + tau2));
    }

    // 6. Tandem Judging & Penalty Assignment
    // Also check rear-end bumper collision (Chase hitting Lead from behind)
    const forward1 = dx * f1x + dy * f1y; // Car 2 is ahead of Car 1
    const forward2 = -dx * f2x - dy * f2y; // Car 1 is ahead of Car 2

    let penalizedParty: 'player' | 'enemy' | 'both' | 'none' = 'none';
    let penaltyAmount = 0;
    const isNewImpact = (this.contactCooldown <= 0);

    if (isNewImpact) {
      this.contactCooldown = 0.45; // 450ms cooldown before another full impact penalty
      penaltyAmount = DRIFT_CONSTANTS.CAR_CONTACT_PENALTY; // Flat 50 pts deduction

      // Chase hitting Lead is primary fault in drift rules
      if (role1 === 'chase' && forward1 > 15) {
        // Player is Chase and hit Lead from behind
        penalizedParty = 'player';
        score1.collisionPenalty += penaltyAmount;
      } else if (role2 === 'chase' && forward2 > 15) {
        // Enemy is Chase and hit Lead from behind
        penalizedParty = 'enemy';
        score2.collisionPenalty += penaltyAmount;
      } else if (preV1Towards2 > preV2Towards1 + 0.15) {
        // Player pushed enemy
        penalizedParty = 'player';
        score1.collisionPenalty += penaltyAmount;
      } else if (preV2Towards1 > preV1Towards2 + 0.15) {
        // Enemy pushed player
        penalizedParty = 'enemy';
        score2.collisionPenalty += penaltyAmount;
      } else {
        // Mutual aggressive contact
        penalizedParty = 'both';
        score1.collisionPenalty += penaltyAmount;
        score2.collisionPenalty += penaltyAmount;
      }
    } else {
      // Continuous rubbing penalty while in contact (75 pts/sec)
      const rub = DRIFT_CONSTANTS.CAR_CONTACT_RUB_PENALTY_PER_SEC * dt;
      if (role1 === 'chase' && forward1 > 10) {
        score1.collisionPenalty += rub;
        penalizedParty = 'player';
      } else if (role2 === 'chase' && forward2 > 10) {
        score2.collisionPenalty += rub;
        penalizedParty = 'enemy';
      } else if (preV1Towards2 > preV2Towards1 + 0.1) {
        score1.collisionPenalty += rub;
        penalizedParty = 'player';
      } else if (preV2Towards1 > preV1Towards2 + 0.1) {
        score2.collisionPenalty += rub;
        penalizedParty = 'enemy';
      } else {
        score1.collisionPenalty += rub * 0.5;
        score2.collisionPenalty += rub * 0.5;
        penalizedParty = 'both';
      }
    }

    return {
      collided: true,
      contactX,
      contactY,
      normalX: normX,
      normalY: normY,
      impactSpeed,
      penalizedParty,
      penaltyAmount,
      isNewImpact
    };
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

    // 3. Update Time Elapsed
    playerScore.timeElapsed += dt;
    enemyScore.timeElapsed += dt;

    // 4. Calculate Final Totals
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
    if (state.driftSlipAngle >= DRIFT_CONSTANTS.DRIFT_INIT_ANGLE_DEG && state.speed > 0.8) {
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
    if (chaseState.driftSlipAngle >= DRIFT_CONSTANTS.DRIFT_INIT_ANGLE_DEG && chaseState.speed > 0.8) {
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
