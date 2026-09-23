import type { VehiclePhysicsState, VehicleRole } from './drift-types';
import type { AIDifficulty } from '../types';
import { DriftTrack } from './drift-track';

export class DriftAI {
  private track: DriftTrack;
  private difficulty: AIDifficulty;
  private aiWp: number = 0;
  private leadWp: number = 0;
  private chaseWp: number = 0;
  private racingLineOffsets: Float32Array = new Float32Array(120);

  constructor(track: DriftTrack, difficulty: AIDifficulty = 'medium') {
    this.track = track;
    this.difficulty = difficulty;
    this.initRacingLine();
  }

  public setDifficulty(diff: AIDifficulty) {
    this.difficulty = diff;
  }

  public reset(aiStartingWp: number = 0, leadStartingWp: number = 0) {
    this.aiWp = aiStartingWp;
    this.chaseWp = aiStartingWp;
    this.leadWp = leadStartingWp;
  }

  /**
   * Precomputes continuous S-curve racing line offsets across all 120 waypoints.
   * Eliminates sudden steering spikes between clipping points.
   */
  private initRacingLine() {
    const keyframes = [
      { wp: 0, val: 0.14 },     // Right side of launch straight (+nx)
      { wp: 10, val: 0.14 },    // End of run-up straight
      { wp: 14, val: 0.26 },    // OZ 1 Entry (+nx = outer wall ride)
      { wp: 26, val: 0.26 },    // OZ 1 Exit (+nx = outer wall ride)
      { wp: 36, val: -0.24 },   // IC 1 Entry (-nx = inner eye curb)
      { wp: 44, val: -0.24 },   // IC 1 Exit (-nx = inner eye curb)
      { wp: 52, val: 0.0 },     // Approaching crossover (straight flick)
      { wp: 64, val: 0.0 },     // Exiting crossover into Loop 2
      { wp: 72, val: -0.26 },   // OZ 2 Entry (-nx = outer wall ride of Loop 2)
      { wp: 84, val: -0.26 },   // OZ 2 Exit (-nx = outer wall ride of Loop 2)
      { wp: 94, val: 0.24 },    // IC 2 Entry (+nx = inner eye curb of Loop 2)
      { wp: 104, val: 0.24 },   // IC 2 Exit (+nx = inner eye curb of Loop 2)
      { wp: 110, val: -0.26 },  // OZ 3 Entry (-nx = outer exit sweeper)
      { wp: 118, val: -0.26 },  // OZ 3 Exit (-nx = outer exit sweeper)
      { wp: 120, val: 0.14 }    // Finish line return to right side of straight
    ];

    for (let k = 0; k < keyframes.length - 1; k++) {
      const k1 = keyframes[k];
      const k2 = keyframes[k + 1];
      const span = k2.wp - k1.wp;
      for (let i = k1.wp; i < k2.wp; i++) {
        const t = (i - k1.wp) / span;
        const easeT = (1 - Math.cos(t * Math.PI)) / 2;
        this.racingLineOffsets[i % 120] = k1.val + (k2.val - k1.val) * easeT;
      }
    }
  }

  private normalizeAngle(a: number): number {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  /**
   * Tracks waypoint progress locally along lap direction to prevent Figure-8 crossover jumping
   */
  private updateWaypoint(cur: number, x: number, y: number, heading: number): number {
    const pts = this.track.waypoints;
    const n = pts.length;
    let bestDistSq = Infinity;
    let bestIdx = cur;

    // Search in forward window [cur - 1, cur + 7]
    for (let offset = -1; offset <= 7; offset++) {
      const idx = (cur + offset + n) % n;
      const wp = pts[idx];
      let angleDiff = Math.abs(wp.angle - heading);
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      if (Math.abs(angleDiff) > Math.PI * 0.45) continue; // Filter out opposite branch at crossover!

      const dSq = (wp.x - x) ** 2 + (wp.y - y) ** 2;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = idx;
      }
    }

    // Failsafe: if vehicle respawned or got displaced far from window, fall back to global closest with heading filter
    if (bestDistSq > 22500) {
      return this.track.getClosestProgress(x, y, heading).waypointIndex;
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
   * Applies active wall avoidance and recovery steering using current waypoint lateral displacement
   */
  private applyWallAvoidance(
    state: VehiclePhysicsState,
    steer: number,
    throttle: number,
    currentWpIdx: number
  ): { steer: number; throttle: number } {
    const wp = this.track.waypoints[currentWpIdx];
    // Lateral displacement from centerline of the CURRENT track waypoint:
    // positive = right side (+nx), negative = left side (-nx)
    const lat = (state.x - wp.x) * wp.nx + (state.y - wp.y) * wp.ny;
    const absLat = Math.abs(lat);

    // Only intervene when vehicle gets dangerously close to the barrier (< 18px from barrier, i.e. absLat > 52px)
    if (absLat > 52) {
      const wallCloseness = Math.min(1.0, (absLat - 52) / 14); // 0.0 at 52px to 1.0 at 66px
      const inDir = lat > 0 ? -1 : 1; // +1 if on left (steer right), -1 if on right (steer left)

      // Outward velocity towards the wall
      const outwardVel = (state.vx * wp.nx + state.vy * wp.ny) * Math.sign(lat);

      if (outwardVel > -0.2 || absLat > 58) {
        // Bias steering smoothly inward along the track direction
        const inwardBias = inDir * 0.45;
        const targetInwardAngle = this.normalizeAngle(wp.angle + inwardBias);
        const steerDiff = this.normalizeAngle(targetInwardAngle - state.angle);
        const targetInwardSteer = Math.max(-1.0, Math.min(1.0, steerDiff * 2.2));

        const blend = wallCloseness * 0.70;
        steer = (1 - blend) * steer + blend * targetInwardSteer;

        if (absLat > 60) {
          throttle = Math.min(throttle, 0.75);
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
    this.aiWp = this.updateWaypoint(this.aiWp, state.x, state.y, state.angle);

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

    // Smooth continuous S-curve racing line offsets into green clipping zones
    const latOffset = targetWp.width * this.racingLineOffsets[targetIdx];

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
    const safeInputs = this.applyWallAvoidance(state, steer, throttle, this.aiWp);
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
    this.chaseWp = this.updateWaypoint(this.chaseWp, aiState.x, aiState.y, aiState.angle);
    this.leadWp = this.updateWaypoint(this.leadWp, leadState.x, leadState.y, leadState.angle);

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

    // Chase follows the pro tandem racing line:
    // On the straight run-up (wp 0-10), Chase holds left lane (-0.14 width) so it never collides side-by-side with Lead!
    // In corners and sweepers, it tucks closely into the drift pocket (0.85x lateral offset).
    let chaseOffsetFrac = this.racingLineOffsets[targetIdx] * 0.85;
    if (targetIdx <= 10) {
      chaseOffsetFrac = -0.14; // Maintain left side of straight on launch!
    }
    const latOffset = targetWp.width * chaseOffsetFrac;

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
    const safeInputs = this.applyWallAvoidance(aiState, steer, throttle, this.chaseWp);
    steer = safeInputs.steer;
    throttle = safeInputs.throttle;

    return { throttle, steer, brake, handbrake };
  }
}
