import { WaterEngine } from './water-engine';
import { TOTAL_TUBES, TUBE_CAPACITY } from './water-types';
import type { AIDifficulty } from '../types';

export interface AICallbacks {
  onMove?: (action: {
    type: 'tube' | 'reservoir';
    srcIndex: number;
    dstIndex?: number;
    color?: string;
    count?: number;
    isCompleted?: boolean;
  }) => void;
  onProgress?: (score: number, completedColors: string[], isWon: boolean) => void;
}

interface ScoredMove {
  type: 'reservoir' | 'tube';
  srcIndex: number;
  dstIndex?: number;
  color: string;
  score: number;
}

export class WaterAI {
  private engine: WaterEngine;
  private difficulty: AIDifficulty;
  private callbacks: AICallbacks;
  private timer: number | null = null;
  private isRunning: boolean = false;
  private recentMoves: Array<{ type: 'reservoir' | 'tube'; src: number; dst?: number; color: string }> = [];

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

  /**
   * Calibrated competitive move delays per difficulty:
   * - Easy: 1100ms - 1500ms (~35-45s match)
   * - Medium: 650ms - 900ms (~20-28s match)
   * - Hard: 350ms - 500ms (~12-16s match)
   * - Extreme: 180ms - 280ms (~7-10s match, lightning speedrunner bot)
   */
  private getDelay(): number {
    switch (this.difficulty) {
      case 'easy':
        return 1100 + Math.random() * 400;
      case 'medium':
        return 650 + Math.random() * 250;
      case 'hard':
        return 350 + Math.random() * 150;
      case 'extreme':
        return 180 + Math.random() * 100;
      default:
        return 650;
    }
  }

  private scheduleNextMove() {
    if (!this.isRunning || this.engine.state.isWon) return;

    const delay = this.getDelay();
    this.timer = window.setTimeout(() => {
      if (!this.isRunning) return;
      this.executeMove();
      if (!this.engine.state.isWon && this.isRunning) {
        this.scheduleNextMove();
      }
    }, delay);
  }

  /**
   * Find the most promising color to clear next when reservoir is empty.
   * Scores based on surface accessibility and proximity to top.
   */
  private findBestTargetColor(): string | null {
    const completed = new Set(this.engine.state.completedColors);
    const colorScores = new Map<string, number>();

    for (let i = 0; i < TOTAL_TUBES; i++) {
      const tube = this.engine.state.tubes[i];
      for (let pos = 0; pos < tube.length; pos++) {
        const color = tube[pos];
        if (completed.has(color)) continue;

        // Depth from top: 0 = top element, 1 = 1 element below, etc.
        const depth = tube.length - 1 - pos;
        let weight = 0;
        if (depth === 0) weight = 4;
        else if (depth === 1) weight = 1.5;
        else weight = -1;

        colorScores.set(color, (colorScores.get(color) || 0) + weight);
      }
    }

    let bestColor: string | null = null;
    let maxScore = -Infinity;
    for (const [color, score] of colorScores.entries()) {
      if (score > maxScore) {
        maxScore = score;
        bestColor = color;
      }
    }
    return bestColor;
  }

  /**
   * Check if a tube contains only 1 pure color (no other colors underneath).
   */
  private isTubeHomogeneous(tubeIndex: number): boolean {
    const tube = this.engine.state.tubes[tubeIndex];
    if (tube.length <= 1) return true;
    const first = tube[0];
    return tube.every(c => c === first);
  }

  private executeMove() {
    if (this.engine.state.isWon) return;

    const reservoir = this.engine.state.reservoir;
    const candidates: ScoredMove[] = [];

    // Determine target color: either already locked in reservoir, or best candidate to start
    const targetColor = reservoir.color || this.findBestTargetColor();

    // -------------------------------------------------------------
    // 1. RESERVOIR MOVES (Priority #1)
    // -------------------------------------------------------------
    if (reservoir.color !== null) {
      for (let i = 0; i < TOTAL_TUBES; i++) {
        const can = this.engine.canPourToReservoir(i);
        if (can.valid && can.color === reservoir.color) {
          candidates.push({
            type: 'reservoir',
            srcIndex: i,
            color: can.color,
            score: 2000 + can.count * 150
          });
        }
      }
    } else if (targetColor) {
      // Empty reservoir: check if targetColor is on top of any tube
      for (let i = 0; i < TOTAL_TUBES; i++) {
        const can = this.engine.canPourToReservoir(i);
        if (can.valid && can.color === targetColor) {
          candidates.push({
            type: 'reservoir',
            srcIndex: i,
            color: can.color,
            score: 1600 + can.count * 100
          });
        }
      }
    }

    // -------------------------------------------------------------
    // 2. UNBURYING MOVES FOR TARGET COLOR
    // -------------------------------------------------------------
    if (targetColor) {
      for (let src = 0; src < TOTAL_TUBES; src++) {
        const tube = this.engine.state.tubes[src];
        const top = this.engine.getTopColor(src);
        if (!top || top === targetColor) continue;

        // Check if targetColor is buried below the top in this tube
        const targetIndex = tube.lastIndexOf(targetColor);
        if (targetIndex !== -1) {
          const depth = tube.length - 1 - targetIndex; // 1 = right under top, 2 = 2 below
          const topInfo = this.engine.getContiguousTopCount(src);
          const topCount = topInfo ? topInfo.count : 1;

          for (let dst = 0; dst < TOTAL_TUBES; dst++) {
            if (src === dst) continue;
            const can = this.engine.canPour(src, dst);
            if (!can.valid || !can.color) continue;

            const dstTube = this.engine.state.tubes[dst];
            const dstTop = this.engine.getTopColor(dst);
            const dstFree = TUBE_CAPACITY - dstTube.length;

            if (dstTop === top) {
              // Merge on top of same color
              if (dstFree >= topCount) {
                // Completely uncovers targetColor if depth === topCount
                const uncoversDirectly = targetIndex === tube.length - 1 - topCount;
                candidates.push({
                  type: 'tube',
                  srcIndex: src,
                  dstIndex: dst,
                  color: can.color,
                  score: 1200 + (uncoversDirectly ? 300 : 100) - depth * 40
                });
              } else {
                candidates.push({
                  type: 'tube',
                  srcIndex: src,
                  dstIndex: dst,
                  color: can.color,
                  score: 900 - depth * 40
                });
              }
            } else if (dstTube.length === 0) {
              // Move to empty tube
              const uncoversDirectly = targetIndex === tube.length - 1 - topCount;
              candidates.push({
                type: 'tube',
                srcIndex: src,
                dstIndex: dst,
                color: can.color,
                score: 850 + (uncoversDirectly ? 250 : 0) - depth * 50
              });
            }
          }
        }
      }
    }

    // -------------------------------------------------------------
    // 3. GENERAL SMART CONSOLIDATIONS & MERGES
    // -------------------------------------------------------------
    const lastMove = this.recentMoves.length > 0 ? this.recentMoves[this.recentMoves.length - 1] : null;

    for (let src = 0; src < TOTAL_TUBES; src++) {
      const srcTube = this.engine.state.tubes[src];
      if (srcTube.length === 0) continue;
      const topColor = this.engine.getTopColor(src);
      if (!topColor) continue;

      const topInfo = this.engine.getContiguousTopCount(src);
      const topCount = topInfo ? topInfo.count : 1;
      const isSrcHomogeneous = this.isTubeHomogeneous(src);

      for (let dst = 0; dst < TOTAL_TUBES; dst++) {
        if (src === dst) continue;
        const can = this.engine.canPour(src, dst);
        if (!can.valid || !can.color) continue;

        const dstTube = this.engine.state.tubes[dst];
        const dstTop = this.engine.getTopColor(dst);

        let score = 400;

        // Severe penalty for reversing the immediate last move (anti-pingpong)
        if (lastMove && lastMove.type === 'tube' && lastMove.src === dst && lastMove.dst === src && lastMove.color === can.color) {
          score -= 1500;
        }

        // Penalty for repeating recent moves
        const recentCount = this.recentMoves.filter(m => m.src === src && m.dst === dst).length;
        score -= recentCount * 350;

        // If source tube is homogeneous (pure 1 color)
        if (isSrcHomogeneous) {
          if (dstTube.length === 0) {
            // NEVER move a pure tube into an empty tube (useless ping-pong)
            score = -3000;
          } else if (dstTop === topColor) {
            // Merging pure tube into another tube with same color: only good if it clears source
            if (can.count >= srcTube.length) {
              score += 350; // Frees a tube
            } else {
              score -= 200;
            }
          }
        } else {
          // Mixed source tube
          if (dstTop === topColor) {
            // Merging same color
            if (can.count === topCount) {
              // Completely clears top color group from source, revealing new color underneath!
              score += 300;
            }
            if (can.count === srcTube.length) {
              score += 400; // Empties entire tube!
            }
            score += can.count * 80;
          } else if (dstTube.length === 0) {
            // Moving to empty tube: good if it reveals a different color underneath
            if (can.count === topCount && srcTube.length > topCount) {
              score += 150;
            } else {
              score -= 300;
            }
          }
        }

        candidates.push({
          type: 'tube',
          srcIndex: src,
          dstIndex: dst,
          color: can.color,
          score
        });
      }
    }

    // Sort moves by score descending
    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length === 0) return;

    // Difficulty selection:
    // - Easy: 25% chance of picking a slightly suboptimal move (index 1 or 2)
    // - Medium, Hard, Extreme: Always pick best move (index 0)
    let selectedMove: ScoredMove = candidates[0];
    if (this.difficulty === 'easy' && candidates.length > 2 && Math.random() < 0.25) {
      selectedMove = candidates[Math.min(candidates.length - 1, Math.floor(1 + Math.random() * 2))];
    }

    // Execute the chosen move
    if (selectedMove.type === 'reservoir') {
      const res = this.engine.pourToReservoir(selectedMove.srcIndex);
      if (res) {
        this.recordMove({
          type: 'reservoir',
          src: selectedMove.srcIndex,
          color: selectedMove.color
        });
        this.callbacks.onMove?.({
          type: 'reservoir',
          srcIndex: selectedMove.srcIndex,
          color: selectedMove.color,
          count: res.count,
          isCompleted: res.isCompleted
        });
        this.callbacks.onProgress?.(this.engine.state.score, this.engine.state.completedColors, this.engine.state.isWon);
      }
    } else if (selectedMove.type === 'tube' && selectedMove.dstIndex !== undefined) {
      const res = this.engine.pour(selectedMove.srcIndex, selectedMove.dstIndex);
      if (res) {
        this.recordMove({
          type: 'tube',
          src: selectedMove.srcIndex,
          dst: selectedMove.dstIndex,
          color: selectedMove.color
        });
        this.callbacks.onMove?.({
          type: 'tube',
          srcIndex: selectedMove.srcIndex,
          dstIndex: selectedMove.dstIndex
        });
        this.callbacks.onProgress?.(this.engine.state.score, this.engine.state.completedColors, this.engine.state.isWon);
      }
    }
  }

  private recordMove(move: { type: 'reservoir' | 'tube'; src: number; dst?: number; color: string }) {
    this.recentMoves.push(move);
    if (this.recentMoves.length > 8) {
      this.recentMoves.shift();
    }
  }
}
