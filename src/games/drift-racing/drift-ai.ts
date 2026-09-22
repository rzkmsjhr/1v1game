import type { VehiclePhysicsState, VehicleRole } from './drift-types';
import type { AIDifficulty } from '../types';
import { DriftTrack } from './drift-track';

export class DriftAI {
  private track: DriftTrack;
  private difficulty: AIDifficulty;

  constructor(track: DriftTrack, difficulty: AIDifficulty = 'medium') {
    this.track = track;
    this.difficulty = difficulty;
  }

  public setDifficulty(diff: AIDifficulty) {
    this.difficulty = diff;
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
   * AI as Lead Car: Follows pro racing line, clips green zones with all 4 tires, and sustains high-speed drift
   */
  private computeLeadInputs(state: VehiclePhysicsState): {
    throttle: number;
    steer: number;
    brake: boolean;
    handbrake: boolean;
  } {
    const { waypointIndex } = this.track.getClosestProgress(state.x, state.y);
    const n = this.track.waypoints.length;

    // Lookahead and Target Speeds by Difficulty
    let lookaheadSteps = 6;
    let targetSpeed = 2.70;
    let targetSlipAngle = 46;
    let steerGain = 2.2;

    if (this.difficulty === 'easy') {
      lookaheadSteps = 5;
      targetSpeed = 2.25;
      targetSlipAngle = 32;
      steerGain = 1.8;
    } else if (this.difficulty === 'medium') {
      lookaheadSteps = 6;
      targetSpeed = 2.70;
      targetSlipAngle = 46;
      steerGain = 2.2;
    } else if (this.difficulty === 'hard') {
      lookaheadSteps = 7;
      targetSpeed = 2.98;
      targetSlipAngle = 55;
      steerGain = 2.5;
    } else if (this.difficulty === 'extreme') {
      lookaheadSteps = 7;
      targetSpeed = 3.10;
      targetSlipAngle = 62;
      steerGain = 2.6;
    }

    // Racing line offset: actively guides the car deep into green clipping zones!
    const targetWp = this.track.waypoints[(waypointIndex + lookaheadSteps) % n];
    let lateralOffset = 0;
    const wpIdx = (waypointIndex + lookaheadSteps) % n;

    // Zone 1: Outer Sweeper 1 (wp 12-24, outer right)
    if (wpIdx >= 12 && wpIdx <= 24) lateralOffset = targetWp.width * 0.32;
    // Zone 2: Inside Clip 1 (wp 34-45, inner left apex)
    else if (wpIdx >= 34 && wpIdx <= 45) lateralOffset = -targetWp.width * 0.30;
    // Zone 3: Switch Zone (wp 50-68, outer right)
    else if (wpIdx >= 50 && wpIdx <= 68) lateralOffset = targetWp.width * 0.28;
    // Zone 4: Outer Sweeper 2 (wp 72-84, outer right)
    else if (wpIdx >= 72 && wpIdx <= 84) lateralOffset = targetWp.width * 0.32;
    // Zone 5: Inside Clip 2 (wp 94-105, inner left apex)
    else if (wpIdx >= 94 && wpIdx <= 105) lateralOffset = -targetWp.width * 0.30;
    // Zone 6: Final Exit Clip (wp 110-118, outer right)
    else if (wpIdx >= 110 && wpIdx <= 118) lateralOffset = targetWp.width * 0.30;

    const aimX = targetWp.x + targetWp.nx * lateralOffset;
    const aimY = targetWp.y + targetWp.ny * lateralOffset;

    // Angle to target
    const targetAngle = Math.atan2(aimX - state.x, -(aimY - state.y));
    let angleDiff = targetAngle - state.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const isCurving = Math.abs(angleDiff) > 0.22;
    const inClippingZone = lateralOffset !== 0;

    // Pro Counter-Steering Drift Control
    let steer = 0;
    if (state.driftSlipAngle > 15) {
      // Car is in an active slide: balance angle dynamically using counter-steer
      const turnDir = Math.sign(angleDiff) || 1;
      if (state.driftSlipAngle < targetSlipAngle) {
        // Build more slip angle -> steer into turn
        steer = turnDir * 0.85;
      } else {
        // Catch and sustain the slide with counter-steer
        const excess = (state.driftSlipAngle - targetSlipAngle) / 25;
        steer = -turnDir * Math.min(1.0, 0.4 + excess * 0.6);
      }
    } else {
      // Grip steering line towards clipping target
      steer = Math.max(-1, Math.min(1, angleDiff * steerGain));
    }

    // Handbrake initiation flick into corner
    const handbrake = (isCurving || inClippingZone) && state.speed > 1.2 && state.driftSlipAngle < 20;

    // Throttle commitment: keep on the power inside clipping zones for thick smoke & top score
    let throttle = 1.0;
    if (!inClippingZone && state.speed > targetSpeed) {
      throttle = (state.speed > targetSpeed + 0.20) ? 0.2 : 0.5;
    }
    const brake = !inClippingZone && (state.speed > targetSpeed + 0.35);

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
    const { waypointIndex: leadWp } = this.track.getClosestProgress(leadState.x, leadState.y);
    const n = this.track.waypoints.length;

    // Tandem Gap Tuning by Difficulty
    let targetLagSteps = 3;
    let maxChaseSpeed = 2.75;
    let proximitySweetSpot = 65;

    if (this.difficulty === 'easy') {
      targetLagSteps = 4;
      maxChaseSpeed = 2.35;
      proximitySweetSpot = 85;
    } else if (this.difficulty === 'medium') {
      targetLagSteps = 3;
      maxChaseSpeed = 2.75;
      proximitySweetSpot = 65;
    } else if (this.difficulty === 'hard') {
      targetLagSteps = 2;
      maxChaseSpeed = 3.05;
      proximitySweetSpot = 52;
    } else if (this.difficulty === 'extreme') {
      targetLagSteps = 2;
      maxChaseSpeed = 3.10;
      proximitySweetSpot = 50;
    }

    // Track-aligned tandem pocket: lag behind lead car along track curve
    const pocketWpIdx = (leadWp - targetLagSteps + n) % n;
    const pocketWp = this.track.waypoints[pocketWpIdx];

    // Position pocket slightly to the inside door if lead is drifting
    let innerOffset = 0;
    if (leadState.driftSlipAngle > 15) {
      const leadHeadingX = Math.sin(leadState.angle);
      const leadHeadingY = -Math.cos(leadState.angle);
      const leadMoveX = leadState.vx || 1;
      const leadMoveY = leadState.vy || 1;
      const cross = leadHeadingX * leadMoveY - leadHeadingY * leadMoveX;
      innerOffset = (cross > 0 ? -pocketWp.width * 0.18 : pocketWp.width * 0.18);
    }

    const targetX = pocketWp.x + pocketWp.nx * innerOffset;
    const targetY = pocketWp.y + pocketWp.ny * innerOffset;

    // Distance and vector to Lead Car
    const dx = leadState.x - aiState.x;
    const dy = leadState.y - aiState.y;
    const distToLead = Math.hypot(dx, dy);

    // Closing velocity along line connecting the two cars
    const normX = distToLead > 0.001 ? dx / distToLead : 0;
    const normY = distToLead > 0.001 ? dy / distToLead : 0;
    const closingSpeed = (aiState.vx - leadState.vx) * normX + (aiState.vy - leadState.vy) * normY;

    // Target angle for steering
    const targetAngle = Math.atan2(targetX - aiState.x, -(targetY - aiState.y));
    let angleDiff = targetAngle - aiState.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    // Steering: mirror lead drift or steer towards tandem pocket
    let steer = 0;
    if (leadState.driftSlipAngle > 18 && aiState.speed > 1.0) {
      const turnDir = Math.sign(angleDiff) || 1;
      const targetAngle = Math.min(65, leadState.driftSlipAngle + 5);
      if (aiState.driftSlipAngle < targetAngle - 8) {
        steer = turnDir * 0.9;
      } else {
        steer = -turnDir * 0.45; // countersteer
      }
    } else {
      steer = Math.max(-1, Math.min(1, angleDiff * 2.2));
    }

    // Handbrake: flick if lead is drifting and AI needs to initiate
    const handbrake = (leadState.driftSlipAngle > 20 && aiState.driftSlipAngle < 15 && aiState.speed > 1.2);

    // Anti-Overtake & Position Lock:
    // Project Chase relative position onto track direction at Lead car
    const wp = this.track.waypoints[leadWp];
    const trackDirX = Math.sin(wp.angle);
    const trackDirY = -Math.cos(wp.angle);
    const distAlongTrack = dx * -trackDirX + dy * -trackDirY; // positive if Chase is ahead of Lead along track

    const isCreepingAhead = distAlongTrack > -18; // Chase is creeping alongside or ahead of Lead
    const isTightOnTail = (distToLead < 66);

    // Throttle & Braking with Pro Tandem Proximity Control
    let throttle = 1.0;
    let brake = false;

    // Condition 1: If creeping ahead of lead on track (distAlongTrack > -10) -> brake to stay behind!
    if (isCreepingAhead) {
      throttle = 0.0;
      if (aiState.speed > leadState.speed - 0.15) brake = true;
    }
    // Condition 2: Anti-Ramming bumper cushion (< 66px and closing in) -> brake to prevent contact penalty!
    else if (isTightOnTail && (aiState.speed >= leadState.speed - 0.05 || closingSpeed > 0.04)) {
      throttle = 0.0;
      if (aiState.speed > leadState.speed) brake = true;
    }
    // Condition 3: Locked in the tandem sweet spot (44px - 65px) -> match lead speed smoothly
    else if (distToLead <= proximitySweetSpot + 12 && distToLead >= proximitySweetSpot - 8) {
      if (aiState.speed > leadState.speed + 0.05) {
        throttle = 0.2;
      } else if (aiState.speed < leadState.speed - 0.05) {
        throttle = 1.0;
      } else {
        throttle = 0.6;
      }
    }
    // Condition 4: Lagging behind -> hammer throttle to close gap to lead
    else if (distToLead > proximitySweetSpot + 12) {
      throttle = (aiState.speed < maxChaseSpeed) ? 1.0 : 0.5;
    } else {
      throttle = (aiState.speed > leadState.speed) ? 0.1 : 0.5;
    }

    return { throttle, steer, brake, handbrake };
  }
}
