import { WaterEngine } from './water-engine';
import { TOTAL_TUBES } from './water-types';
import type { AIDifficulty } from '../types';

export interface AICallbacks {
  onMove?: (action: { type: 'tube' | 'reservoir'; srcIndex: number; dstIndex?: number }) => void;
  onProgress?: (score: number, completedColors: string[], isWon: boolean) => void;
}

export class WaterAI {
  private engine: WaterEngine;
  private difficulty: AIDifficulty;
  private callbacks: AICallbacks;
  private timer: number | null = null;
  private isRunning: boolean = false;

  constructor(initialTubes: string[][], difficulty: AIDifficulty = 'medium', callbacks: AICallbacks = {}) {
    this.engine = new WaterEngine(initialTubes);
    this.difficulty = difficulty;
    this.callbacks = callbacks;
  }

  public start() {
    this.isRunning = true;
    this.scheduleNextMove();
  }

  public pause() {
    this.isRunning = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  public destroy() {
    this.pause();
  }

  public getScore(): number {
    return this.engine.state.score;
  }

  public getCompletedColors(): string[] {
    return [...this.engine.state.completedColors];
  }

  private getDelay(): number {
    switch (this.difficulty) {
      case 'easy':
        return 2600 + Math.random() * 1200; // 2.6s - 3.8s
      case 'medium':
        return 1600 + Math.random() * 800; // 1.6s - 2.4s
      case 'hard':
      case 'extreme':
        return 900 + Math.random() * 500; // 0.9s - 1.4s
      default:
        return 1800;
    }
  }

  private scheduleNextMove() {
    if (!this.isRunning || this.engine.state.isWon) return;

    const delay = this.getDelay();
    this.timer = window.setTimeout(() => {
      if (!this.isRunning) return;
      this.executeMove();
      if (!this.engine.state.isWon) {
        this.scheduleNextMove();
      }
    }, delay);
  }

  private executeMove() {
    if (this.engine.state.isWon) return;

    // 1. Can we pour into reservoir?
    if (this.engine.state.reservoir.color) {
      for (let i = 0; i < TOTAL_TUBES; i++) {
        const can = this.engine.canPourToReservoir(i);
        if (can.valid && can.color === this.engine.state.reservoir.color) {
          const res = this.engine.pourToReservoir(i);
          if (res) {
            this.callbacks.onMove?.({ type: 'reservoir', srcIndex: i });
            this.callbacks.onProgress?.(this.engine.state.score, this.engine.state.completedColors, this.engine.state.isWon);
            return;
          }
        }
      }
    }

    // 2. Reservoir empty? Pick most accessible color
    if (this.engine.state.reservoir.color === null) {
      const hint = this.engine.getHint();
      if (hint && hint.type === 'reservoir') {
        const res = this.engine.pourToReservoir(hint.srcIndex);
        if (res) {
          this.callbacks.onMove?.({ type: 'reservoir', srcIndex: hint.srcIndex });
          this.callbacks.onProgress?.(this.engine.state.score, this.engine.state.completedColors, this.engine.state.isWon);
          return;
        }
      }
    }

    // 3. Smart move or consolidate tubes
    const hint = this.engine.getHint();
    if (hint) {
      if (hint.type === 'reservoir') {
        const res = this.engine.pourToReservoir(hint.srcIndex);
        if (res) {
          this.callbacks.onMove?.({ type: 'reservoir', srcIndex: hint.srcIndex });
          this.callbacks.onProgress?.(this.engine.state.score, this.engine.state.completedColors, this.engine.state.isWon);
          return;
        }
      } else if (hint.type === 'tube' && hint.dstIndex !== undefined) {
        const res = this.engine.pour(hint.srcIndex, hint.dstIndex);
        if (res) {
          this.callbacks.onMove?.({ type: 'tube', srcIndex: hint.srcIndex, dstIndex: hint.dstIndex });
          this.callbacks.onProgress?.(this.engine.state.score, this.engine.state.completedColors, this.engine.state.isWon);
          return;
        }
      }
    }

    // Fallback: any valid tube move
    for (let i = 0; i < TOTAL_TUBES; i++) {
      for (let j = 0; j < TOTAL_TUBES; j++) {
        if (i === j) continue;
        if (this.engine.canPour(i, j).valid) {
          const res = this.engine.pour(i, j);
          if (res) {
            this.callbacks.onMove?.({ type: 'tube', srcIndex: i, dstIndex: j });
            this.callbacks.onProgress?.(this.engine.state.score, this.engine.state.completedColors, this.engine.state.isWon);
            return;
          }
        }
      }
    }
  }
}
