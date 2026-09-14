import { SlingEngine } from './sling-engine';
import { Puck } from './sling-types';
import { SlingPhysics } from './sling-physics';
import { AIDifficulty } from '../types';
import {
  CENTER_X,
  CENTER_Y,
  OPPONENT_BAND_REST_Y,
  MAX_PULL_DISTANCE,
  RAIL_LEFT,
  RAIL_RIGHT
} from './sling-constants';

export class SlingAI {
  private difficulty: AIDifficulty;
  private nextActionTime: number = 0;
  private isPulling: boolean = false;
  private activePuck: Puck | null = null;
  private pullStartTime: number = 0;
  private pullStartX: number = CENTER_X;
  private pullStartY: number = OPPONENT_BAND_REST_Y;
  private targetPullX: number = CENTER_X;
  private targetPullY: number = OPPONENT_BAND_REST_Y - 32;

  constructor(difficulty: AIDifficulty = 'medium') {
    this.difficulty = difficulty;
  }

  public update(engine: SlingEngine, currentTimeMs: number, onSnap?: (power: number) => void) {
    if (engine.phase !== 'PLAYING') {
      this.isPulling = false;
      this.activePuck = null;
      return;
    }

    // 1. If currently pulling a puck, complete the pull and release
    if (this.isPulling && this.activePuck) {
      const elapsed = currentTimeMs - this.pullStartTime;
      const pullDuration = this.getPullDuration();

      if (elapsed < pullDuration) {
        // Cubic ease-out interpolation for clearly visible, natural pull animation
        const t = Math.min(1.0, elapsed / pullDuration);
        const ease = 1 - Math.pow(1 - t, 3);
        const curX = this.pullStartX + (this.targetPullX - this.pullStartX) * ease;
        const curY = this.pullStartY + (this.targetPullY - this.pullStartY) * ease;

        this.activePuck.x = curX;
        this.activePuck.y = curY;
        this.activePuck.dragX = curX;
        this.activePuck.dragY = curY;
        this.activePuck.prevX = curX;
        this.activePuck.prevY = curY;

        // Stretch opponent band to follow puck
        engine.opponentBand.isStretched = true;
        engine.opponentBand.midX = curX;
        engine.opponentBand.midY = curY;
      } else {
        // Launch puck!
        this.activePuck.isDragged = false;
        SlingPhysics.launchFromBand(this.activePuck, engine.opponentBand, onSnap);
        this.isPulling = false;
        this.activePuck = null;
        engine.opponentBand.isStretched = false;
        this.nextActionTime = currentTimeMs + this.getCooldown();
      }
      return;
    }

    // 2. Wait until next action cooldown expires
    if (currentTimeMs < this.nextActionTime) return;

    // 3. Find candidate puck on opponent side (y < CENTER_Y)
    const opponentPucks = engine.pucks.filter(p => p.y < CENTER_Y && !p.isDragged);
    if (opponentPucks.length === 0) return;

    // Pick closest puck to the top band or best situated
    opponentPucks.sort((a, b) => a.y - b.y);
    const chosenPuck = opponentPucks[0];

    // Calculate aim: Direct shot towards center gate with difficulty variance
    const gateTargetX = CENTER_X + this.getAimVariance();

    // To shoot towards gateTargetX from band, the pull X offset is opposite
    // DirX = -pullOffsetX * 0.45 => pullX = CENTER_X - (targetX - CENTER_X) * 0.7
    const aimOffset = gateTargetX - CENTER_X;
    this.targetPullX = Math.max(RAIL_LEFT + 30, Math.min(RAIL_RIGHT - 30, CENTER_X - aimOffset * 0.8));
    this.targetPullY = OPPONENT_BAND_REST_Y - this.getPullPower();

    // Begin pull
    this.isPulling = true;
    this.activePuck = chosenPuck;
    this.activePuck.isDragged = true;
    this.pullStartTime = currentTimeMs;
    this.pullStartX = chosenPuck.x;
    this.pullStartY = chosenPuck.y;
  }

  private getPullDuration(): number {
    switch (this.difficulty) {
      case 'easy': return 620;
      case 'medium': return 460;
      case 'hard': return 350;
      case 'extreme': return 260;
    }
  }

  private getCooldown(): number {
    switch (this.difficulty) {
      case 'easy': return 1400 + Math.random() * 500;
      case 'medium': return 950 + Math.random() * 350;
      case 'hard': return 620 + Math.random() * 220;
      case 'extreme': return 380 + Math.random() * 160;
    }
  }

  private getAimVariance(): number {
    switch (this.difficulty) {
      case 'easy': return (Math.random() - 0.5) * 50;     // frequently deflects off wings
      case 'medium': return (Math.random() - 0.5) * 24;   // balanced accuracy
      case 'hard': return (Math.random() - 0.5) * 10;     // sharp aim
      case 'extreme': return (Math.random() - 0.5) * 3;   // laser accuracy
    }
  }

  private getPullPower(): number {
    switch (this.difficulty) {
      case 'easy': return 28 + Math.random() * 8;
      case 'medium': return 34 + Math.random() * 8;
      case 'hard': return 38 + Math.random() * 7;
      case 'extreme': return MAX_PULL_DISTANCE - Math.random() * 2;
    }
  }
}
