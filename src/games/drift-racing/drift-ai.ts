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
   * AI as Lead Car: Follows racing line and drifts through green clipping zones
   */
  private computeLeadInputs(state: VehiclePhysicsState): {
    throttle: number;
    steer: number;
    brake: boolean;
    handbrake: boolean;
  } {
    const { waypointIndex } = this.track.getClosestProgress(state.x, state.y);
    const n = this.track.waypoints.length;

    // Lookahead waypoint
    const lookaheadSteps = (this.difficulty === 'easy' ? 4 : (this.difficulty === 'medium' ? 6 : 8));
    const targetWp = this.track.waypoints[(waypointIndex + lookaheadSteps) % n];

    // Angle to target
    const targetAngle = Math.atan2(targetWp.x - state.x, -(targetWp.y - state.y));
    let angleDiff = targetAngle - state.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const steer = Math.max(-1, Math.min(1, angleDiff * 1.8));

    // Check if near or inside a green clipping zone
    let inClippingZone = false;
    for (const z of this.track.clippingZones) {
      if (DriftTrack.isPointInPolygon({ x: state.x, y: state.y }, z.polygon)) {
        inClippingZone = true;
        break;
      }
    }

    // Drift initiation: if turning sharply or inside clipping zone, use handbrake
    const needDrift = (Math.abs(angleDiff) > 0.45 || inClippingZone);
    const handbrake = needDrift && (state.speed > 3.0) && (state.driftSlipAngle < 25);

    // Throttle modulation
    let maxSpeed = 5.2;
    if (this.difficulty === 'easy') maxSpeed = 4.2;
    if (this.difficulty === 'hard') maxSpeed = 5.8;
    if (this.difficulty === 'extreme') maxSpeed = 6.4;

    const throttle = (state.speed < maxSpeed) ? 1.0 : 0.4;
    const brake = (state.speed > maxSpeed + 1.0);

    return { throttle, steer, brake, handbrake };
  }

  /**
   * AI as Chase Car: Pursues human player, holds tight proximity, respects transitions
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
    // Calculate target tandem pocket directly behind Lead car
    const targetDist = (this.difficulty === 'easy' ? 85 : (this.difficulty === 'medium' ? 65 : 45));
    const leadCos = Math.cos(leadState.angle);
    const leadSin = Math.sin(leadState.angle);

    // Pocket is behind the lead
    const targetX = leadState.x + leadSin * targetDist;
    const targetY = leadState.y - leadCos * targetDist;

    // Distance to target pocket
    const distToTarget = Math.hypot(targetX - aiState.x, targetY - aiState.y);

    // Steer towards target pocket
    const targetAngle = Math.atan2(targetX - aiState.x, -(targetY - aiState.y));
    let angleDiff = targetAngle - aiState.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const steer = Math.max(-1, Math.min(1, angleDiff * 1.9));

    // Match Lead car's speed + close gap
    let desiredSpeed = leadState.speed;
    if (distToTarget > 40) desiredSpeed += 0.8;
    if (distToTarget < 15) desiredSpeed -= 0.6;

    // Check front axle overtake prevention (Rule 8: cannot pass lead front axle)
    const relX = aiState.x - leadState.x;
    const relY = aiState.y - leadState.y;
    const forwardProj = relX * Math.sin(leadState.angle) - relY * Math.cos(leadState.angle);
    if (forwardProj > 10) {
      // Back off to prevent overtake penalty!
      desiredSpeed = Math.max(1.0, leadState.speed - 1.2);
    }

    const throttle = (aiState.speed < desiredSpeed) ? 1.0 : 0.2;
    const brake = (aiState.speed > desiredSpeed + 0.8);
    const handbrake = (Math.abs(angleDiff) > 0.4 && aiState.speed > 2.8 && aiState.driftSlipAngle < 20);

    return { throttle, steer, brake, handbrake };
  }
}
