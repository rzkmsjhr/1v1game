import type { VehiclePhysicsState, VehicleRole } from './drift-types';
import type { AIDifficulty } from '../types';
import { DriftTrack } from './drift-track';

export class DriftAI {
  private track: DriftTrack;
  private difficulty: AIDifficulty;
  private aiWp: number = 6;
  private leadWp: number = 9;
  private chaseWp: number = 6;

  constructor(track: DriftTrack, difficulty: AIDifficulty = 'medium') {
    this.track = track;
    this.difficulty = difficulty;
  }

  public setDifficulty(diff: AIDifficulty) {
    this.difficulty = diff;
  }

  public reset(aiStartingWp: number = 6, leadStartingWp: number = 9) {
    this.aiWp = aiStartingWp;
    this.chaseWp = aiStartingWp;
    this.leadWp = leadStartingWp;
  }

  private normalizeAngle(a: number): number {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  /**
   * Tracks waypoint progress locally along lap direction to prevent Figure-8 crossover jumping
   */
  private updateWaypoint(cur: number, x: number, y: number): number {
    const pts = this.track.waypoints;
    const n = pts.length;
    let bestDistSq = Infinity;
    let bestIdx = cur;

    // Search in forward window [cur - 2, cur + 8]
    for (let offset = -2; offset <= 8; offset++) {
      const idx = (cur + offset + n) % n;
      const wp = pts[idx];
      const dSq = (wp.x - x) ** 2 + (wp.y - y) ** 2;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = idx;
      }
    }

    // Failsafe: if vehicle respawned or got displaced far from window, fall back to global closest
    if (bestDistSq > 22500) {
      return this.track.getClosestProgress(x, y).waypointIndex;
    }

    return bestIdx;
  }

  /**
   * Generates driving inputs for AI vehicle: { throttle, steer, brake, handbrake }
   */
  public computeInputs(
    aiState: VehiclePhysicsState,
    aiRole: VehicleRole,
    humanState: VehiclePhysicsState,
    _humanRole: VehicleRole
  ): { throttle: number; steer: number; brake: boolean; handbrake: boolean } {
    if (aiRole === 'lead' || aiRole === 'solo') {
      return this.computeLeadInputs(aiState);
    } else {
      return this.computeChaseInputs(aiState, humanState);
    }
  }

  /**
   * Applies active wall avoidance and recovery steering when vehicle nears circuit barriers
   */
  private applyWallAvoidance(
    state: VehiclePhysicsState,
    steer: number,
    throttle: number
  ): { steer: number; throttle: number } {
    const trackPt = this.track.getClosestTrackPoint(state.x, state.y);
    if (trackPt.dist > 38) {
      const wallCloseness = Math.min(1.0, (trackPt.dist - 38) / 16); // 0.0 at 38px to 1.0 at 54px
      const inNx = (trackPt.cx - state.x) / (trackPt.dist || 1);
      const inNy = (trackPt.cy - state.y) / (trackPt.dist || 1);
      const inAngle = Math.atan2(inNx, -inNy);
      const inSteerDiff = this.normalizeAngle(inAngle - state.angle);

      // Check if velocity has outward component towards the wall
      const vOut = state.vx * (-inNx) + state.vy * (-inNy);

      if (vOut > -0.25 || trackPt.dist > 45) {
        const blend = wallCloseness * 0.65;
        const targetInwardSteer = Math.max(-1.0, Math.min(1.0, inSteerDiff * 2.5));
        steer = (1 - blend) * steer + blend * targetInwardSteer;

        if (trackPt.dist > 46) {
          throttle = Math.min(throttle, 0.70);
        }
      }
    }
    return { steer, throttle };
  }

  /**
   * AI as Lead Car: Smooth racing line, natural drift initiation & counter-steering, and clipping zone immersion
   */
  private computeLeadInputs(state: VehiclePhysicsState): {
    throttle: number;
    steer: number;
    brake: boolean;
    handbrake: boolean;
  } {
    const pts = this.track.waypoints;
    const n = pts.length;
    this.aiWp = this.updateWaypoint(this.aiWp, state.x, state.y);

    // Lookahead and Target Speeds by Difficulty
    let lookahead = 7;
    let targetSpeed = 2.70;
    let targetSlipDeg = 38;

    if (this.difficulty === 'easy') {
      lookahead = 6;
      targetSpeed = 2.20;
      targetSlipDeg = 26;
    } else if (this.difficulty === 'medium') {
      lookahead = 7;
      targetSpeed = 2.55;
      targetSlipDeg = 38;
    } else if (this.difficulty === 'hard') {
      lookahead = 8;
      targetSpeed = 2.80;
      targetSlipDeg = 42;
    } else if (this.difficulty === 'extreme') {
      lookahead = 8;
      targetSpeed = 2.95;
      targetSlipDeg = 45;
    }

    const targetIdx = (this.aiWp + lookahead) % n;
    const targetWp = pts[targetIdx];

    // Smooth lateral racing line offsets into green clipping zones:
    // In right loop (wp 0-60): counter-clockwise -> +nx is outer, -nx is inner
    // In left loop (wp 60-120): clockwise -> +nx is inner, -nx is outer
    let latOffset = 0;
    if (targetIdx >= 12 && targetIdx <= 26) latOffset = targetWp.width * 0.26; // Zone 1: Outer sweeper 1 (+nx)
    else if (targetIdx >= 34 && targetIdx <= 46) latOffset = -targetWp.width * 0.26; // Zone 2: Inside apex 1 (-nx)
    else if (targetIdx >= 72 && targetIdx <= 86) latOffset = -targetWp.width * 0.26; // Zone 4: Outer sweeper 2 (-nx)
    else if (targetIdx >= 94 && targetIdx <= 106) latOffset = targetWp.width * 0.26; // Zone 5: Inside apex 2 (+nx)

    const aimX = targetWp.x + targetWp.nx * latOffset;
    const aimY = targetWp.y + targetWp.ny * latOffset;

    // Angle to target lookahead
    const angleToTarget = Math.atan2(aimX - state.x, -(aimY - state.y));

    // Curvature ahead
    const curWp = pts[this.aiWp];
    const curveDiff = this.normalizeAngle(targetWp.angle - curWp.angle);
    const isCurving = Math.abs(curveDiff) > 0.15;
    const cornerDir = Math.sign(curveDiff) || 1; // +1 = right turn, -1 = left turn

    // Desired drift yaw angle:
    // In corner: car yaws inward into turn by targetSlipDeg
    let desiredHeading = angleToTarget;
    if (isCurving && state.speed > 1.2) {
      const targetSlipRad = (targetSlipDeg * Math.PI) / 180;
      desiredHeading = this.normalizeAngle(angleToTarget + cornerDir * targetSlipRad);
    }

    // Steering error: difference between desired heading and actual heading
    const steerError = this.normalizeAngle(desiredHeading - state.angle);

    // Dynamic damping based on angular velocity to eliminate wobbles and stabilize the slide
    let steer = steerError * 2.2 - state.angularVelocity * 1.5;
    steer = Math.max(-1.0, Math.min(1.0, steer));

    // Anti-Spinout Failsafe:
    // If slip angle gets too high (> 55°), immediately counter-steer towards velocity vector
    if (state.driftSlipAngle > 55 && state.speed > 0.8) {
      const velAngle = Math.atan2(state.vx, -state.vy);
      const counterAngle = this.normalizeAngle(velAngle - state.angle);
      steer = Math.max(-1.0, Math.min(1.0, counterAngle * 2.5));
    }

    // Handbrake: flick to initiate slide when entering corner
    const handbrake = isCurving && state.speed > 1.5 && state.driftSlipAngle < 16;

    // Throttle & Brake:
    let throttle = 1.0;
    let brake = false;

    if (state.driftSlipAngle > 55) {
      // Feather throttle during slide - never stall the car with low-speed braking!
      throttle = 0.65;
      if (state.driftSlipAngle > 78 && state.speed > 1.8) brake = true;
    } else if (state.speed > targetSpeed) {
      throttle = 0.35;
      if (state.speed > targetSpeed + 0.15) throttle = 0.05;
    } else {
      throttle = 1.0;
    }

    // Active wall avoidance & recovery
    const safeInputs = this.applyWallAvoidance(state, steer, throttle);
    steer = safeInputs.steer;
    throttle = safeInputs.throttle;

    return { throttle, steer, brake, handbrake };
  }

  /**
   * AI as Chase Car: Pursues lead along course line, sits in door-to-door pocket, mirrors drift, avoids ramming
   */
  private computeChaseInputs(
    aiState: VehiclePhysicsState,
    leadState: VehiclePhysicsState
  ): {
    throttle: number;
    steer: number;
    brake: boolean;
    handbrake: boolean;
  } {
    const pts = this.track.waypoints;
    const n = pts.length;
    this.chaseWp = this.updateWaypoint(this.chaseWp, aiState.x, aiState.y);
    this.leadWp = this.updateWaypoint(this.leadWp, leadState.x, leadState.y);

    let lookahead = 7;
    let maxChaseSpeed = 3.00;
    let baseSweetSpot = 44;

    if (this.difficulty === 'easy') {
      lookahead = 6;
      maxChaseSpeed = 2.65;
      baseSweetSpot = 50;
    } else if (this.difficulty === 'medium') {
      lookahead = 7;
      maxChaseSpeed = 3.00;
      baseSweetSpot = 44;
    } else if (this.difficulty === 'hard') {
      lookahead = 8;
      maxChaseSpeed = 3.10;
      baseSweetSpot = 40;
    } else if (this.difficulty === 'extreme') {
      lookahead = 8;
      maxChaseSpeed = 3.10;
      baseSweetSpot = 38;
    }

    // Chase ALWAYS tracks the course line ahead of its own position so it never cuts into walls
    const targetIdx = (this.chaseWp + lookahead) % n;
    const targetWp = pts[targetIdx];

    const dx = leadState.x - aiState.x;
    const dy = leadState.y - aiState.y;
    const distToLead = Math.hypot(dx, dy);

    // Chase follows the pro tandem racing line safely inside the barriers
    let latOffset = 0;
    if (targetIdx >= 12 && targetIdx <= 26) latOffset = targetWp.width * 0.20; // Zone 1: Outer sweeper 1 (+nx)
    else if (targetIdx >= 34 && targetIdx <= 46) latOffset = -targetWp.width * 0.20; // Zone 2: Inside apex 1 (-nx)
    else if (targetIdx >= 72 && targetIdx <= 86) latOffset = -targetWp.width * 0.20; // Zone 4: Outer sweeper 2 (-nx)
    else if (targetIdx >= 94 && targetIdx <= 106) latOffset = targetWp.width * 0.20; // Zone 5: Inside apex 2 (+nx)

    const aimX = targetWp.x + targetWp.nx * latOffset;
    const aimY = targetWp.y + targetWp.ny * latOffset;

    const angleToTarget = Math.atan2(aimX - aiState.x, -(aimY - aiState.y));
    const curWp = pts[this.chaseWp];
    const curveDiff = this.normalizeAngle(targetWp.angle - curWp.angle);
    const isCurving = Math.abs(curveDiff) > 0.08;
    const cornerDir = Math.sign(curveDiff) || 1;

    // Desired drift heading: initiate drift when cornering, matching lead's slip angle
    let desiredHeading = angleToTarget;
    const targetSlipDeg = Math.min(45, Math.max(25, leadState.driftSlipAngle));
    if (isCurving && aiState.speed > 1.2) {
      const targetSlipRad = (targetSlipDeg * Math.PI) / 180;
      desiredHeading = this.normalizeAngle(angleToTarget + cornerDir * targetSlipRad);
    }

    const steerError = this.normalizeAngle(desiredHeading - aiState.angle);
    let steer = steerError * 2.2 - aiState.angularVelocity * 1.5;
    steer = Math.max(-1.0, Math.min(1.0, steer));

    // Anti-spinout failsafe: steer front wheels into velocity vector
    if (aiState.driftSlipAngle > 55 && aiState.speed > 0.8) {
      const velAngle = Math.atan2(aiState.vx, -aiState.vy);
      const counterAngle = this.normalizeAngle(velAngle - aiState.angle);
      steer = Math.max(-1.0, Math.min(1.0, counterAngle * 2.5));
    }

    // Handbrake: flick when entering corner
    const handbrake = isCurving && (leadState.driftSlipAngle > 20 || aiState.speed > 1.8) && aiState.driftSlipAngle < 15 && aiState.speed > 1.3;

    // Relative Closing Velocity towards Lead Car
    const normX = distToLead > 0.001 ? dx / distToLead : 0;
    const normY = distToLead > 0.001 ? dy / distToLead : 0;
    const closingSpeed = (aiState.vx - leadState.vx) * normX + (aiState.vy - leadState.vy) * normY;

    // Dynamic tandem distance:
    // When directly in-line behind Lead's rear bumper, physical bumper touch distance is 66px (31.5 + 34.5),
    // so in-line following requires 75px to prevent rear-ending on straightaways.
    // When drifting sideways or sitting in the lateral door pocket, tuck tight to baseSweetSpot (38-50px)!
    const angleToLead = Math.atan2(dx, -dy);
    const inlineDiff = Math.abs(this.normalizeAngle(angleToLead - leadState.angle));
    const isDirectlyBehind = (inlineDiff < 0.65 && leadState.driftSlipAngle < 18);

    const proximitySweetSpot = isDirectlyBehind ? 75 : baseSweetSpot;
    const minSafeBumperDist = isDirectlyBehind ? 70 : (baseSweetSpot - 4);

    // Anti-Overtake & Proximity Throttle Control
    let throttle = 1.0;
    let brake = false;

    // Waypoint gap along lap circuit (leadWp - chaseWp + n) % n
    const forwardWpGap = (this.leadWp - this.chaseWp + n) % n;
    const isAheadOnTrack = (forwardWpGap > n - 4); // Chase is 1-3 waypoints ahead of lead

    if (isAheadOnTrack) {
      throttle = 0.0;
      if (aiState.speed > leadState.speed - 0.1) brake = true;
    } else if (distToLead < minSafeBumperDist + 4 && closingSpeed > 0.02) {
      throttle = 0.0;
      if (distToLead < minSafeBumperDist || closingSpeed > 0.06) brake = true;
    } else if (distToLead <= proximitySweetSpot + 10 && distToLead >= proximitySweetSpot - 6) {
      if (closingSpeed > 0.06) throttle = 0.35;
      else if (closingSpeed < -0.04) throttle = 1.0;
      else throttle = Math.max(0.65, leadState.throttle);
    } else if (distToLead > proximitySweetSpot + 10) {
      throttle = (aiState.speed < maxChaseSpeed) ? 1.0 : 0.70;
    } else {
      throttle = (aiState.speed > leadState.speed + 0.15) ? 0.35 : 0.70;
    }

    if (aiState.driftSlipAngle > 55) {
      throttle = Math.max(throttle, 0.65);
      if (aiState.driftSlipAngle > 80 && aiState.speed > 1.8) brake = true;
    }

    // Active wall avoidance & recovery
    const safeInputs = this.applyWallAvoidance(aiState, steer, throttle);
    steer = safeInputs.steer;
    throttle = safeInputs.throttle;

    return { throttle, steer, brake, handbrake };
  }
}
