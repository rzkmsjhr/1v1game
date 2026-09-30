import type { AIDifficulty } from '../types';
import { SkylineStackEngine } from './skyline-engine';

export class SkylineStackAI {
  private engine: SkylineStackEngine;
  private difficulty: AIDifficulty;
  private isRunning: boolean = true;
  private waitTimer: number = 0;
  private targetOffset: number = 0;
  private hasAimedCurrentBlock: boolean = false;

  constructor(engine: SkylineStackEngine, difficulty: AIDifficulty = 'medium') {
    this.engine = engine;
    this.difficulty = difficulty;
    this.resetTimer();
  }

  public setDifficulty(difficulty: AIDifficulty) {
    this.difficulty = difficulty;
  }

  public reset() {
    this.isRunning = true;
    this.hasAimedCurrentBlock = false;
    this.resetTimer();
  }

  public stop() {
    this.isRunning = false;
  }

  private resetTimer() {
    let minWait = 0.4;
    let maxWait = 0.9;
    let jitterSpread = 16.0;

    switch (this.difficulty) {
      case 'easy':
        minWait = 0.6;
        maxWait = 1.4;
        jitterSpread = 28.0;
        break;
      case 'medium':
        minWait = 0.35;
        maxWait = 0.8;
        jitterSpread = 12.0;
        break;
      case 'hard':
        minWait = 0.18;
        maxWait = 0.45;
        jitterSpread = 4.5;
        break;
      case 'extreme':
        minWait = 0.08;
        maxWait = 0.22;
        jitterSpread = 1.5;
        break;
    }

    this.waitTimer = minWait + Math.random() * (maxWait - minWait);
    // Gaussian-like jitter around target center
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1 || 0.001)) * Math.cos(2.0 * Math.PI * u2);
    this.targetOffset = z0 * (jitterSpread * 0.4);
    this.hasAimedCurrentBlock = true;
  }

  public update(dt: number) {
    if (!this.isRunning || this.engine.isGameOver || this.engine.state.isDead || this.engine.state.hasFinished) {
      return;
    }

    // If block is not on the crane hook yet, wait
    if (!this.engine.state.crane.holdingBlock || this.engine.state.fallingBlock) {
      this.hasAimedCurrentBlock = false;
      return;
    }

    if (!this.hasAimedCurrentBlock) {
      this.resetTimer();
    }

    this.waitTimer -= dt;
    if (this.waitTimer > 0) return;

    // AI evaluates if the swinging hook is close to the top floor landing zone
    const topFloorSwayX = this.engine.calculateTopFloorSwayX();
    const topFloor = this.engine.state.floors[this.engine.state.floors.length - 1];
    const targetX = (topFloor ? topFloor.x : 0) + topFloorSwayX + this.targetOffset;

    const hookX = this.engine.state.crane.hookX;
    const distanceToTarget = Math.abs(hookX - targetX);

    // Dynamic release window based on difficulty
    let releaseWindow = 12.0;
    if (this.difficulty === 'extreme') releaseWindow = 3.5;
    else if (this.difficulty === 'hard') releaseWindow = 6.0;
    else if (this.difficulty === 'medium') releaseWindow = 14.0;
    else releaseWindow = 26.0;

    if (distanceToTarget <= releaseWindow) {
      this.engine.dropBlock();
      this.hasAimedCurrentBlock = false;
      this.resetTimer();
    }
  }
}
