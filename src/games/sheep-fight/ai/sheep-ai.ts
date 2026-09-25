import type { AIDifficulty } from '../../types';
import type { SheepEngine } from '../engine/sheep-engine';
import { SHEEP_CONSTANTS } from '../sheep-constants';
import { SHEEP_MODELS } from '../sheep-types';

export class SheepAI {
  private engine: SheepEngine;
  private difficulty: AIDifficulty;
  private thinkTimer: number = 0;
  private nextActionDelay: number = 1.0;

  constructor(engine: SheepEngine, difficulty: AIDifficulty = 'medium') {
    this.engine = engine;
    this.difficulty = difficulty;
    this.resetTimer();
  }

  private resetTimer() {
    switch (this.difficulty) {
      case 'easy':
        this.nextActionDelay = 1.4 + Math.random() * 0.8;
        break;
      case 'medium':
        this.nextActionDelay = 0.9 + Math.random() * 0.5;
        break;
      case 'hard':
        this.nextActionDelay = 0.6 + Math.random() * 0.4;
        break;
      case 'extreme':
        this.nextActionDelay = 0.4 + Math.random() * 0.3;
        break;
    }
    this.thinkTimer = 0;
  }

  public update(dt: number) {
    if (this.engine.state.winner !== null) return;
    if (this.engine.state.opponentCooldown > 0.05) return;

    this.thinkTimer += dt;
    if (this.thinkTimer < this.nextActionDelay) return;

    this.makeDecision();
    this.resetTimer();
  }

  private makeDecision() {
    const state = this.engine.state;
    const availableLanes = state.lanes
      .filter(l => l.status === 'active' && !l.isOpponentStartBlocked)
      .map(l => l.index);

    if (availableLanes.length === 0) return;

    // Easy AI: 70% random, 30% basic defense
    if (this.difficulty === 'easy') {
      const pick = availableLanes[Math.floor(Math.random() * availableLanes.length)];
      this.engine.deploySheep(pick, 'opponent');
      return;
    }

    // Medium, Hard, Extreme: Tactical lane scoring
    const currentSheepSize = state.opponentQueue[0];
    const currentWeight = SHEEP_MODELS[currentSheepSize].strength;

    let bestLane = -1;
    let highestScore = -Infinity;

    for (const laneIdx of availableLanes) {
      const lane = state.lanes[laneIdx];
      let score = 0;

      const playerSheep = lane.sheep.filter(s => s.side === 'player');
      const opponentSheep = lane.sheep.filter(s => s.side === 'opponent');

      // 1. Threat Detection: Is player pushing towards opponent goal?
      if (playerSheep.length > 0) {
        const pFront = playerSheep.reduce((front, s) => s.y < front.y ? s : front, playerSheep[0]);
        const distToGoal = pFront.y - SHEEP_CONSTANTS.LANE_TOP_Y;

        // Threat urgency: higher score the closer player is to opponent goal
        if (distToGoal < 350) {
          score += (350 - distToGoal) * 2;
        }

        // Defend against player strength
        const fP = lane.playerStrength;
        const fO = lane.opponentStrength;
        if (fP > fO) {
          score += (fP - fO) * 50;
        }
      }

      // 2. Opportunity: Push an undefended or winning lane
      if (playerSheep.length === 0 && opponentSheep.length > 0) {
        // We already have a free push marching toward player goal!
        score += 80;
      } else if (playerSheep.length === 0 && opponentSheep.length === 0) {
        // Completely empty lane: great for probing
        score += 40;
      }

      // 3. Weight Matching Tactics (Hard / Extreme)
      if (this.difficulty === 'hard' || this.difficulty === 'extreme') {
        // If current sheep is heavy (Mammoth/Brawler), prefer using it to crush a player push
        if (currentWeight >= 3 && lane.playerStrength > 0 && lane.playerStrength <= currentWeight + lane.opponentStrength) {
          score += 120;
        }
        // Avoid dropping giant into a lane that already has massive advantage
        if (currentWeight >= 3 && lane.opponentStrength > lane.playerStrength + 4) {
          score -= 60;
        }
      }

      // Small noise for human-like unpredictability
      score += (Math.random() - 0.5) * 25;

      if (score > highestScore) {
        highestScore = score;
        bestLane = laneIdx;
      }
    }

    if (bestLane !== -1) {
      this.engine.deploySheep(bestLane, 'opponent');
    }
  }

  public reset(): void {
    this.resetTimer();
  }
}
