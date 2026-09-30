import type { AIDifficulty } from '../types';
import { BombArenaEngine } from './bomb-arena-engine';
import type { GridCoord } from './bomb-arena-types';

export class BombArenaAI {
  private engine: BombArenaEngine;
  private difficulty: AIDifficulty;
  private isRunning: boolean = true;
  private thinkTimer: number = 0;
  private moveDx: number = 0;
  private moveDy: number = 0;
  private actionCooldown: number = 0;

  constructor(engine: BombArenaEngine, difficulty: AIDifficulty = 'medium') {
    this.engine = engine;
    this.difficulty = difficulty;
  }

  public setDifficulty(difficulty: AIDifficulty) {
    this.difficulty = difficulty;
  }

  public stop() {
    this.isRunning = false;
    this.moveDx = 0;
    this.moveDy = 0;
  }

  public reset() {
    this.isRunning = true;
    this.thinkTimer = 0;
    this.moveDx = 0;
    this.moveDy = 0;
    this.actionCooldown = 0.5;
  }

  public update(dt: number) {
    if (!this.isRunning || this.engine.state.phase !== 'PLAYING') {
      return;
    }

    const ai = this.engine.state.opponent;
    if (ai.isDead) return;

    this.thinkTimer -= dt;
    this.actionCooldown -= dt;

    let thinkInterval = 0.25;
    if (this.difficulty === 'easy') thinkInterval = 0.45;
    else if (this.difficulty === 'hard') thinkInterval = 0.14;
    else if (this.difficulty === 'extreme') thinkInterval = 0.06;

    if (this.thinkTimer <= 0) {
      this.thinkTimer = thinkInterval;
      this.evaluateTactics();
    }

    // Apply movement
    if (this.moveDx !== 0 || this.moveDy !== 0) {
      this.engine.movePlayer('opponent', this.moveDx, this.moveDy, dt);
    }
  }

  private evaluateTactics() {
    const ai = this.engine.state.opponent;
    const player = this.engine.state.player;
    const aiCol = Math.floor(ai.x);
    const aiRow = Math.floor(ai.y);

    // Collect all danger cells from all active bombs
    const dangerCells = new Set<string>();
    for (const b of this.engine.state.bombs) {
      for (const tc of b.threatCells) {
        dangerCells.add(`${tc.col},${tc.row}`);
      }
    }

    const isAiInDanger = dangerCells.has(`${aiCol},${aiRow}`);

    // =========================================================================
    // 1. SURVIVAL: Escape bomb blast corridor
    // =========================================================================
    if (isAiInDanger) {
      const escapeCoord = this.findNearestSafeTile(aiCol, aiRow, dangerCells);
      if (escapeCoord) {
        const nextStep = this.getNextStepTowards(aiCol, aiRow, escapeCoord.col, escapeCoord.row, true);
        if (nextStep) {
          this.moveDx = nextStep.dx;
          this.moveDy = nextStep.dy;
          return;
        }
      }
    }

    // =========================================================================
    // 2. OFFENSE: Trap or bomb player
    // =========================================================================
    const playerDist = Math.hypot(ai.x - player.x, ai.y - player.y);

    if (this.actionCooldown <= 0 && !isAiInDanger) {
      // If close to player, attempt to plant bomb or fence
      if (playerDist <= 2.2) {
        // Higher difficulties: place fence to trap player, then bomb!
        if (ai.fenceStock > 0 && Math.random() < (this.difficulty === 'easy' ? 0.25 : 0.6)) {
          const placed = this.engine.placeFence('opponent');
          if (placed) {
            this.actionCooldown = 0.4;
            return;
          }
        }

        if (ai.bombStock > 0) {
          const placed = this.engine.placeBomb('opponent');
          if (placed) {
            this.actionCooldown = 0.5;
            // Immediately back away!
            this.moveDx = -this.moveDx;
            this.moveDy = -this.moveDy;
            return;
          }
        }
      }
    }

    // =========================================================================
    // 3. NAVIGATION: Advance towards player or patrol
    // =========================================================================
    const playerCol = Math.floor(player.x);
    const playerRow = Math.floor(player.y);

    const step = this.getNextStepTowards(aiCol, aiRow, playerCol, playerRow, false, dangerCells);
    if (step) {
      this.moveDx = step.dx;
      this.moveDy = step.dy;
    } else {
      // If path to player is completely blocked by fences, blast a fence open!
      if (ai.bombStock > 0 && this.actionCooldown <= 0 && !isAiInDanger) {
        const placed = this.engine.placeBomb('opponent');
        if (placed) {
          this.actionCooldown = 0.5;
        }
      }
      this.moveDx = 0;
      this.moveDy = 0;
    }
  }

  private findNearestSafeTile(startCol: number, startRow: number, dangerCells: Set<string>): GridCoord | null {
    const queue: GridCoord[] = [{ col: startCol, row: startRow }];
    const visited = new Set<string>();
    visited.add(`${startCol},${startRow}`);

    const b = this.engine.state.bounds;
    const dirs = [
      { dc: 0, dr: -1 },
      { dc: 0, dr: 1 },
      { dc: -1, dr: 0 },
      { dc: 1, dr: 0 }
    ];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (!dangerCells.has(`${cur.col},${cur.row}`)) {
        return cur;
      }

      for (const dir of dirs) {
        const nc = cur.col + dir.dc;
        const nr = cur.row + dir.dr;
        const key = `${nc},${nr}`;

        if (nc >= b.minCol && nc <= b.maxCol && nr >= b.minRow && nr <= b.maxRow && !visited.has(key)) {
          visited.add(key);
          const cell = this.engine.state.grid[nc][nr];
          // Can walk through empty tiles not blocked by bombs
          const hasBomb = this.engine.state.bombs.some(bomb => bomb.col === nc && bomb.row === nr);
          if (cell === 'empty' && !hasBomb) {
            queue.push({ col: nc, row: nr });
          }
        }
      }
    }

    return null;
  }

  private getNextStepTowards(
    startCol: number,
    startRow: number,
    targetCol: number,
    targetRow: number,
    allowDangerCells: boolean = false,
    dangerCells?: Set<string>
  ): { dx: number; dy: number } | null {
    if (startCol === targetCol && startRow === targetRow) {
      return null;
    }

    const queue: Array<{ col: number; row: number; firstStep: { dx: number; dy: number } }> = [];
    const visited = new Set<string>();
    visited.add(`${startCol},${startRow}`);

    const b = this.engine.state.bounds;
    const dirs = [
      { dc: 0, dr: -1, dx: 0, dy: -1 },
      { dc: 0, dr: 1, dx: 0, dy: 1 },
      { dc: -1, dr: 0, dx: -1, dy: 0 },
      { dc: 1, dr: 0, dx: 1, dy: 0 }
    ];

    for (const d of dirs) {
      const nc = startCol + d.dc;
      const nr = startRow + d.dr;
      const key = `${nc},${nr}`;

      if (nc >= b.minCol && nc <= b.maxCol && nr >= b.minRow && nr <= b.maxRow) {
        visited.add(key);
        if (this.isTilePassable(nc, nr, allowDangerCells, dangerCells)) {
          if (nc === targetCol && nr === targetRow) {
            return { dx: d.dx, dy: d.dy };
          }
          queue.push({ col: nc, row: nr, firstStep: { dx: d.dx, dy: d.dy } });
        }
      }
    }

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur.col === targetCol && cur.row === targetRow) {
        return cur.firstStep;
      }

      for (const d of dirs) {
        const nc = cur.col + d.dc;
        const nr = cur.row + d.dr;
        const key = `${nc},${nr}`;

        if (nc >= b.minCol && nc <= b.maxCol && nr >= b.minRow && nr <= b.maxRow && !visited.has(key)) {
          visited.add(key);
          if (this.isTilePassable(nc, nr, allowDangerCells, dangerCells)) {
            queue.push({ col: nc, row: nr, firstStep: cur.firstStep });
          }
        }
      }
    }

    return null;
  }

  private isTilePassable(col: number, row: number, allowDanger: boolean, dangerCells?: Set<string>): boolean {
    const cell = this.engine.state.grid[col][row];
    if (cell !== 'empty') return false;

    // Check bomb
    if (this.engine.state.bombs.some(b => b.col === col && b.row === row)) {
      return false;
    }

    if (!allowDanger && dangerCells?.has(`${col},${row}`)) {
      return false;
    }

    return true;
  }
}
