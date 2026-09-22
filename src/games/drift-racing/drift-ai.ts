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
      targetSpeed = 2.25;
      targetSlipDeg = 26;
    } else if (this.difficulty === 'medium') {
      lookahead = 7;
      targetSpeed = 2.70;
      targetSlipDeg = 38;
    } else if (this.difficulty === 'hard') {
      lookahead = 8;
      targetSpeed = 2.95;
      targetSlipDeg = 42;
    } else if (this.difficulty === 'extreme') {
      lookahead = 8;
      targetSpeed = 3.10;
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
    } else if (state.speed > targetSpeed + 0.20) {
      throttle = 0.3;
      if (state.speed > targetSpeed + 0.50 && !isCurving) brake = true;
    } else {
      throttle = 1.0;
    }

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
    let maxChaseSpeed = 2.80;
    let proximitySweetSpot = 65;

    if (this.difficulty === 'easy') {
      lookahead = 6;
      maxChaseSpeed = 2.35;
      proximitySweetSpot = 85;
    } else if (this.difficulty === 'medium') {
      lookahead = 7;
      maxChaseSpeed = 2.80;
      proximitySweetSpot = 65;
    } else if (this.difficulty === 'hard') {
      lookahead = 8;
      maxChaseSpeed = 3.00;
      proximitySweetSpot = 55;
    } else if (this.difficulty === 'extreme') {
      lookahead = 8;
      maxChaseSpeed = 3.10;
      proximitySweetSpot = 50;
    }

    // Chase ALWAYS tracks the course line ahead of its own position so it never cuts into walls
    const targetIdx = (this.chaseWp + lookahead) % n;
    const targetWp = pts[targetIdx];

    const dx = leadState.x - aiState.x;
    const dy = leadState.y - aiState.y;
    const distToLead = Math.hypot(dx, dy);
    // Chase follows the centerline for maximum safety margin (50px+ from all walls)
    const aimX = targetWp.x;
    const aimY = targetWp.y;

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

    // Anti-Overtake & Proximity Throttle Control
    let throttle = 1.0;
    let brake = false;

    // Waypoint gap along lap circuit (leadWp - chaseWp + n) % n
    const forwardWpGap = (this.leadWp - this.chaseWp + n) % n;
    const isAheadOnTrack = (forwardWpGap > n - 4); // Chase is 1-3 waypoints ahead of lead

    if (isAheadOnTrack) {
      throttle = 0.0;
      if (aiState.speed > leadState.speed - 0.1) brake = true;
    } else if (distToLead < 60 && aiState.speed >= leadState.speed - 0.05) {
      throttle = 0.1;
      if (distToLead < 48 || aiState.speed > leadState.speed + 0.10) brake = true;
    } else if (aiState.driftSlipAngle > 55) {
      throttle = 0.65;
      if (aiState.driftSlipAngle > 78 && aiState.speed > 1.8) brake = true;
    } else if (distToLead <= proximitySweetSpot + 15 && distToLead >= proximitySweetSpot - 10) {
      if (aiState.speed > leadState.speed + 0.05) throttle = 0.3;
      else if (aiState.speed < leadState.speed - 0.05) throttle = 1.0;
      else throttle = 0.65;
    } else if (distToLead > proximitySweetSpot + 15) {
      throttle = (aiState.speed < maxChaseSpeed) ? 1.0 : 0.5;
    } else {
      throttle = 0.5;
    }

    return { throttle, steer, brake, handbrake };
  }
}
