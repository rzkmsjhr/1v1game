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
   * Calibrated move delays per difficulty:
   * - Easy (Kid-friendly): 2800ms - 4200ms (~2.5-4 min match), with casual hesitations
   * - Medium (Casual): 1300ms - 1900ms (~60-80s match), moderate pacing
   * - Hard (Challenging): 500ms - 750ms (~18-24s match), aggressive unburying
   * - Extreme (Boss 🔥): 240ms - 380ms (~10-14s match), relentless speedrunner
   */
  private getDelay(): number {
    let base = 0;
    switch (this.difficulty) {
      case 'easy':
        // Kid-friendly slow pace: 2.8s - 4.2s per move
        base = 2800 + Math.random() * 1400;
        // 25% chance for a child-like hesitation ("looking around at the bottles")
        if (Math.random() < 0.25) {
          base += 1500 + Math.random() * 1800;
        }
        return base;

      case 'medium':
        // Casual pace: 1.3s - 1.9s per move
        base = 1300 + Math.random() * 600;
        if (Math.random() < 0.12) {
          base += 600 + Math.random() * 600;
        }
        return base;

      case 'hard':
        // Challenging: 0.5s - 0.75s per move
        return 500 + Math.random() * 250;

      case 'extreme':
        // Boss speed: 0.24s - 0.38s per move
        return 240 + Math.random() * 140;

      default:
        return 1400;
    }
  }

  private scheduleNextMove(extraDelay: number = 0) {
    if (!this.isRunning || this.engine.state.isWon) return;

    const delay = this.getDelay() + extraDelay;
    this.timer = window.setTimeout(() => {
      if (!this.isRunning) return;
      const moveResult = this.executeMove();
      if (!this.engine.state.isWon && this.isRunning) {
        // The AI is also bound by physical liquid pouring and bowl clearing time!
        let pourPhysicalTime = 0;
        if (moveResult) {
          if (moveResult.type === 'reservoir') {
            pourPhysicalTime = moveResult.isCompleted ? 1100 : 500;
          } else {
            pourPhysicalTime = 400;
          }
        }
        this.scheduleNextMove(pourPhysicalTime);
      }
    }, delay);
  }

  /**
   * Find the most promising color to clear next when reservoir is empty.
   */
  private findBestTargetColor(): string | null {
    const completed = new Set(this.engine.state.completedColors);

    // On EASY (Kid-friendly): don't perform deep multi-tube depth math.
    // Simply pick any visible top color that hasn't been completed.
    if (this.difficulty === 'easy') {
      const availableTopColors: string[] = [];
      for (let i = 0; i < TOTAL_TUBES; i++) {
        const top = this.engine.getTopColor(i);
        if (top && !completed.has(top)) {
          availableTopColors.push(top);
        }
      }
      if (availableTopColors.length > 0) {
        return availableTopColors[Math.floor(Math.random() * availableTopColors.length)];
      }
    }

    // Medium, Hard, Extreme: Scores based on surface accessibility and proximity to top.
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

  private executeMove(): { type: 'reservoir' | 'tube'; color: string; isCompleted?: boolean } | null {
    if (this.engine.state.isWon) return null;

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
          const baseScore = this.difficulty === 'easy' ? 900 : 2000;
          candidates.push({
            type: 'reservoir',
            srcIndex: i,
            color: can.color,
            score: baseScore + can.count * 150
          });
        }
      }
    } else if (targetColor) {
      // Empty reservoir: check if targetColor is on top of any tube
      for (let i = 0; i < TOTAL_TUBES; i++) {
        const can = this.engine.canPourToReservoir(i);
        if (can.valid && can.color === targetColor) {
          const baseScore = this.difficulty === 'easy' ? 800 : 1600;
          candidates.push({
            type: 'reservoir',
            srcIndex: i,
            color: can.color,
            score: baseScore + can.count * 100
          });
        }
      }
    }

    // -------------------------------------------------------------
    // 2. UNBURYING MOVES FOR TARGET COLOR
    // (Active unburying algorithm only for Medium, Hard, and Extreme. Easy bot skips this)
    // -------------------------------------------------------------
    if (targetColor && this.difficulty !== 'easy') {
      for (let src = 0; src < TOTAL_TUBES; src++) {
        const tube = this.engine.state.tubes[src];
        const top = this.engine.getTopColor(src);
        if (!top || top === targetColor) continue;

        // Check if targetColor is buried below the top in this tube
        const targetIndex = tube.lastIndexOf(targetColor);
        if (targetIndex !== -1) {
          const depth = tube.length - 1 - targetIndex; // 1 = right under top, 2 = 2 below

          // For Medium: only unbury shallow layers (depth <= 1)
          if (this.difficulty === 'medium' && depth > 1) continue;

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

    if (candidates.length === 0) return null;

    // Difficulty selection:
    let selectedMove: ScoredMove = candidates[0];

    if (this.difficulty === 'easy') {
      // Easy (Kid-friendly):
      // Filter non-negative valid candidates (prevents infinite ping-pongs)
      const validPool = candidates.filter(c => c.score > 0);
      const pool = validPool.length > 0 ? validPool : candidates;

      // 60% of the time, pick randomly among the top sensible moves
      if (pool.length > 1 && Math.random() < 0.60) {
        const pickIndex = Math.floor(Math.random() * Math.min(4, pool.length));
        selectedMove = pool[pickIndex];
      } else {
        selectedMove = pool[0];
      }
    } else if (this.difficulty === 'medium') {
      // Medium (Casual): 25% chance of picking candidate 1 or 2
      if (candidates.length > 2 && Math.random() < 0.25) {
        selectedMove = candidates[Math.min(candidates.length - 1, Math.floor(1 + Math.random() * 2))];
      }
    } else if (this.difficulty === 'hard') {
      // Hard (Challenging): 95% optimal move, 5% candidate 1
      if (candidates.length > 1 && Math.random() < 0.05) {
        selectedMove = candidates[1];
      }
    } else {
      // Extreme (Boss 🔥): Always 100% absolute optimal move
      selectedMove = candidates[0];
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
        return { type: 'reservoir', color: selectedMove.color, isCompleted: res.isCompleted };
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
        return { type: 'tube', color: selectedMove.color };
      }
    }

    return null;
  }

  private recordMove(move: { type: 'reservoir' | 'tube'; src: number; dst?: number; color: string }) {
    this.recentMoves.push(move);
    if (this.recentMoves.length > 8) {
      this.recentMoves.shift();
    }
  }
}
