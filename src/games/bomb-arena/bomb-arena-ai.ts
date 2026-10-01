import type { AIDifficulty } from '../types';
import { BombArenaEngine } from './bomb-arena-engine';
import { BOMB_ARENA_CONSTANTS } from './bomb-arena-constants';
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

    let thinkInterval = 0.16;
    if (this.difficulty === 'easy') thinkInterval = 0.32;
    else if (this.difficulty === 'hard') thinkInterval = 0.10;
    else if (this.difficulty === 'extreme') thinkInterval = 0.05;

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
    const playerCol = Math.floor(player.x);
    const playerRow = Math.floor(player.y);

    // =========================================================================
    // 0. COLLECT ALL ACTIVE DANGER CELLS
    // =========================================================================
    const dangerCells = new Set<string>();

    // Threat cells from ticking bombs
    for (const b of this.engine.state.bombs) {
      for (const tc of b.threatCells) {
        dangerCells.add(`${tc.col},${tc.row}`);
      }
    }

    // Active visual explosion cells
    for (const exp of this.engine.state.explosions) {
      for (const c of exp.cells) {
        dangerCells.add(`${c.col},${c.row}`);
      }
    }

    // Sudden death shrink warnings (incoming crush within 2.5s)
    if (this.engine.state.bounds.warningTimeLeft > 0 && this.engine.state.bounds.warningTimeLeft <= 2.5) {
      for (const r of this.engine.state.bounds.warningRows) {
        for (let c = 0; c < BOMB_ARENA_CONSTANTS.GRID_COLS; c++) {
          dangerCells.add(`${c},${r}`);
        }
      }
      for (const c of this.engine.state.bounds.warningCols) {
        for (let r = 0; r < BOMB_ARENA_CONSTANTS.GRID_ROWS; r++) {
          dangerCells.add(`${c},${r}`);
        }
      }
    }

    const isAiInDanger = this.isAiPhysicallyInDanger(ai.x, ai.y, dangerCells);

    // =========================================================================
    // 1. SURVIVAL: Escape bomb blast / hazard immediately
    // =========================================================================
    if (isAiInDanger) {
      const escapeCoord = this.findNearestSafeTile(aiCol, aiRow, dangerCells, 8);
      if (escapeCoord) {
        if (aiCol === escapeCoord.col && aiRow === escapeCoord.row) {
          // Already in safe cell, but near edge: center on tile to stay out of blast radius
          this.centerOnTile(escapeCoord.col, escapeCoord.row, ai.x, ai.y);
          return;
        }

        const nextStep = this.getNextStepTowards(aiCol, aiRow, escapeCoord.col, escapeCoord.row, true);
        if (nextStep) {
          this.applyDirectionWithCentering(nextStep.dx, nextStep.dy, ai.x, ai.y, aiCol, aiRow);
          return;
        }
      }

      // Fallback: If trapped in blast line, run away from nearest bomb center
      let nearestBomb = this.engine.state.bombs[0];
      let minDist = 999;
      for (const b of this.engine.state.bombs) {
        const d = Math.hypot(ai.x - (b.col + 0.5), ai.y - (b.row + 0.5));
        if (d < minDist) {
          minDist = d;
          nearestBomb = b;
        }
      }
      if (nearestBomb) {
        const awayX = ai.x - (nearestBomb.col + 0.5);
        const awayY = ai.y - (nearestBomb.row + 0.5);
        if (Math.abs(awayX) > Math.abs(awayY)) {
          this.moveDx = Math.sign(awayX);
          this.moveDy = 0;
        } else {
          this.moveDx = 0;
          this.moveDy = Math.sign(awayY);
        }
        return;
      }
    }

    // =========================================================================
    // 2. COVER HOLDING: When bombs are ticking, hold safe cover!
    // =========================================================================
    if (dangerCells.size > 0 && !isAiInDanger) {
      // Check if there is an entirely safe path to player that avoids all dangerCells
      const safePathStep = this.getNextStepTowards(aiCol, aiRow, playerCol, playerRow, false, dangerCells);
      if (!safePathStep) {
        // Path is blocked by blasts or obstacles: STAY IN COVER and wait for bombs to explode!
        this.centerOnTile(aiCol, aiRow, ai.x, ai.y);
        return;
      }
    }

    // =========================================================================
    // 3. OFFENSE: Trap or bomb player (only if 100% safe to escape!)
    // =========================================================================
    const playerDist = Math.hypot(ai.x - player.x, ai.y - player.y);

    if (this.actionCooldown <= 0 && !isAiInDanger) {
      // Tactical fence drop: block or separate player
      if (playerDist <= 2.8 && ai.fenceStock > 0) {
        const fenceChance = this.difficulty === 'easy' ? 0.15 : this.difficulty === 'medium' ? 0.40 : 0.65;
        if (Math.random() < fenceChance) {
          const target = this.engine.getTargetPlacementCell('opponent');
          if (this.canSafelyPlaceFence(target.col, target.row)) {
            const placed = this.engine.placeFence('opponent');
            if (placed) {
              this.actionCooldown = 0.35;
              return;
            }
          }
        }
      }

      // Bomb placement: ONLY if AI can safely flee after planting!
      if (playerDist <= 2.3 && ai.bombStock > 0) {
        const escapePlan = this.canSafelyEscapeAfterPlacingBomb();
        if (escapePlan.canEscape) {
          const placed = this.engine.placeBomb('opponent');
          if (placed) {
            this.actionCooldown = 0.4;
            this.thinkTimer = 0.02; // React immediately to flee!
            if (escapePlan.escapeTile) {
              const step = this.getNextStepTowards(aiCol, aiRow, escapePlan.escapeTile.col, escapePlan.escapeTile.row, true);
              if (step) {
                this.applyDirectionWithCentering(step.dx, step.dy, ai.x, ai.y, aiCol, aiRow);
              }
            }
            return;
          }
        }
      }
    }

    // =========================================================================
    // 4. NAVIGATION: Advance towards player or clear blocking fence
    // =========================================================================
    const step = this.getNextStepTowards(aiCol, aiRow, playerCol, playerRow, false, dangerCells);
    if (step) {
      this.applyDirectionWithCentering(step.dx, step.dy, ai.x, ai.y, aiCol, aiRow);
    } else {
      // If path to player is completely blocked by fences (and no active bombs), blast a fence open!
      if (dangerCells.size === 0 && ai.bombStock > 0 && this.actionCooldown <= 0) {
        const escapePlan = this.canSafelyEscapeAfterPlacingBomb();
        if (escapePlan.canEscape) {
          const placed = this.engine.placeBomb('opponent');
          if (placed) {
            this.actionCooldown = 0.4;
            this.thinkTimer = 0.02;
            if (escapePlan.escapeTile) {
              const escapeStep = this.getNextStepTowards(aiCol, aiRow, escapePlan.escapeTile.col, escapePlan.escapeTile.row, true);
              if (escapeStep) {
                this.applyDirectionWithCentering(escapeStep.dx, escapeStep.dy, ai.x, ai.y, aiCol, aiRow);
              }
            }
            return;
          }
        }
      }

      // In safe cover or waiting: stop moving
      this.centerOnTile(aiCol, aiRow, ai.x, ai.y);
    }
  }

  private isAiPhysicallyInDanger(x: number, y: number, dangerCells: Set<string>): boolean {
    if (dangerCells.size === 0) return false;
    const col = Math.floor(x);
    const row = Math.floor(y);
    if (dangerCells.has(`${col},${row}`)) return true;

    // Check circular distance to any blast cell center (detonation lethal threshold is < 0.72)
    for (const key of dangerCells) {
      const commaIdx = key.indexOf(',');
      const c = Number(key.substring(0, commaIdx));
      const r = Number(key.substring(commaIdx + 1));
      if (Math.hypot(x - (c + 0.5), y - (r + 0.5)) < 0.78) {
        return true;
      }
    }
    return false;
  }

  private findNearestSafeTile(
    startCol: number,
    startRow: number,
    dangerCells: Set<string>,
    maxSteps: number = 8
  ): GridCoord | null {
    const queue: Array<{ col: number; row: number; dist: number }> = [{ col: startCol, row: startRow, dist: 0 }];
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
        return { col: cur.col, row: cur.row };
      }

      if (cur.dist >= maxSteps) continue;

      for (const dir of dirs) {
        const nc = cur.col + dir.dc;
        const nr = cur.row + dir.dr;
        const key = `${nc},${nr}`;

        if (nc >= b.minCol && nc <= b.maxCol && nr >= b.minRow && nr <= b.maxRow && !visited.has(key)) {
          visited.add(key);
          const cell = this.engine.state.grid[nc][nr];
          // Empty tiles are passable (bombs do not block walking)
          if (cell === 'empty') {
            queue.push({ col: nc, row: nr, dist: cur.dist + 1 });
          }
        }
      }
    }

    return null;
  }

  private canSafelyEscapeAfterPlacingBomb(): { canEscape: boolean; escapeTile?: GridCoord } {
    const ai = this.engine.state.opponent;
    const aiCol = Math.floor(ai.x);
    const aiRow = Math.floor(ai.y);

    let target = this.engine.getTargetPlacementCell('opponent');
    if (!this.engine.canPlaceBombAt(target.col, target.row, 'opponent')) {
      target = { col: aiCol, row: aiRow };
      if (!this.engine.canPlaceBombAt(target.col, target.row, 'opponent')) {
        return { canEscape: false };
      }
    }

    const prospectiveThreats = this.engine.calculateThreatCells(
      target.col,
      target.row,
      BOMB_ARENA_CONSTANTS.BOMB_RADIUS
    );

    const futureDangerCells = new Set<string>();
    for (const b of this.engine.state.bombs) {
      for (const tc of b.threatCells) {
        futureDangerCells.add(`${tc.col},${tc.row}`);
      }
    }
    for (const tc of prospectiveThreats) {
      futureDangerCells.add(`${tc.col},${tc.row}`);
    }

    // Verify there is an unthreatened tile within reachable distance (max 5 steps)
    const escapeTile = this.findNearestSafeTile(aiCol, aiRow, futureDangerCells, 5);
    if (escapeTile) {
      return { canEscape: true, escapeTile };
    }

    return { canEscape: false };
  }

  private canSafelyPlaceFence(targetCol: number, targetRow: number): boolean {
    if (!this.engine.canPlaceFenceAt(targetCol, targetRow)) {
      return false;
    }
    const ai = this.engine.state.opponent;
    const aiCol = Math.floor(ai.x);
    const aiRow = Math.floor(ai.y);
    const b = this.engine.state.bounds;

    let openNeighbors = 0;
    const dirs = [
      { dc: 0, dr: -1 },
      { dc: 0, dr: 1 },
      { dc: -1, dr: 0 },
      { dc: 1, dr: 0 }
    ];
    for (const d of dirs) {
      const nc = aiCol + d.dc;
      const nr = aiRow + d.dr;
      if (nc === targetCol && nr === targetRow) continue;
      if (nc >= b.minCol && nc <= b.maxCol && nr >= b.minRow && nr <= b.maxRow) {
        if (this.engine.state.grid[nc][nr] === 'empty') {
          openNeighbors++;
        }
      }
    }

    return openNeighbors >= 1;
  }

  private applyDirectionWithCentering(
    dx: number,
    dy: number,
    curX: number,
    curY: number,
    curCol: number,
    curRow: number
  ) {
    if (dx !== 0 && dy === 0) {
      // Moving horizontally: align Y with lane center to prevent clipping corner
      const targetY = curRow + 0.5;
      const diffY = targetY - curY;
      this.moveDx = dx;
      this.moveDy = Math.abs(diffY) > 0.08 ? Math.sign(diffY) * 0.5 : 0;
    } else if (dy !== 0 && dx === 0) {
      // Moving vertically: align X with lane center to prevent clipping corner
      const targetX = curCol + 0.5;
      const diffX = targetX - curX;
      this.moveDy = dy;
      this.moveDx = Math.abs(diffX) > 0.08 ? Math.sign(diffX) * 0.5 : 0;
    } else {
      this.moveDx = dx;
      this.moveDy = dy;
    }
  }

  private centerOnTile(col: number, row: number, curX: number, curY: number) {
    const targetX = col + 0.5;
    const targetY = row + 0.5;
    const diffX = targetX - curX;
    const diffY = targetY - curY;
    const dist = Math.hypot(diffX, diffY);

    if (dist > 0.06) {
      this.moveDx = diffX / dist;
      this.moveDy = diffY / dist;
    } else {
      this.moveDx = 0;
      this.moveDy = 0;
    }
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

    if (!allowDanger && dangerCells?.has(`${col},${row}`)) {
      return false;
    }

    return true;
  }
}

