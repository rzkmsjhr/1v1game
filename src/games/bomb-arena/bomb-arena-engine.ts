import { BOMB_ARENA_CONSTANTS } from './bomb-arena-constants';
import type {
  CellType,
  FacingDirection,
  GridCoord,
  ActiveBomb,
  ActiveExplosion,
  BombArenaPlayer,
  BombArenaState
} from './bomb-arena-types';

export class BombArenaEngine {
  public state!: BombArenaState;
  public seed: number;
  public isAuthoritative: boolean = true;

  // Callbacks
  public onBombPlaced?: (bomb: ActiveBomb) => void;
  public onFencePlaced?: (coord: GridCoord) => void;
  public onExplosion?: (explosion: ActiveExplosion, destroyedFences: GridCoord[]) => void;
  public onPlayerHit?: (victim: 'player' | 'opponent', killer: 'player' | 'opponent' | 'crush') => void;
  public onRoundOver?: (winner: 'player' | 'opponent' | 'draw', reason: string) => void;
  public onMatchOver?: (winner: 'player' | 'opponent') => void;
  public onSirenWarning?: () => void;
  public onArenaShrink?: (crushedRows: number[], crushedCols: number[]) => void;

  constructor(seed: number = Date.now()) {
    this.seed = seed;
    this.resetMatch(seed);
  }

  public resetMatch(seed?: number) {
    if (seed !== undefined) {
      this.seed = seed;
    }
    const initialPlayer: BombArenaPlayer = {
      id: 'player',
      name: 'You',
      x: 2.5,
      y: 10.5,
      col: 2,
      row: 10,
      facing: 'up',
      isMoving: false,
      isDead: false,
      fenceStock: BOMB_ARENA_CONSTANTS.MAX_FENCE_STOCK,
      bombStock: BOMB_ARENA_CONSTANTS.MAX_BOMB_STOCK,
      fenceRecharge: 0,
      bombRecharge: 0,
      fenceCooldown: 0,
      bombCooldown: 0,
      roundsWon: 0
    };

    const initialOpponent: BombArenaPlayer = {
      id: 'opponent',
      name: 'Rival',
      x: 3.5,
      y: 1.5,
      col: 3,
      row: 1,
      facing: 'down',
      isMoving: false,
      isDead: false,
      fenceStock: BOMB_ARENA_CONSTANTS.MAX_FENCE_STOCK,
      bombStock: BOMB_ARENA_CONSTANTS.MAX_BOMB_STOCK,
      fenceRecharge: 0,
      bombRecharge: 0,
      fenceCooldown: 0,
      bombCooldown: 0,
      roundsWon: 0
    };

    this.state = {
      grid: this.createEmptyGrid(),
      bombs: [],
      explosions: [],
      player: initialPlayer,
      opponent: initialOpponent,
      bounds: {
        minCol: 0,
        maxCol: BOMB_ARENA_CONSTANTS.GRID_COLS - 1,
        minRow: 0,
        maxRow: BOMB_ARENA_CONSTANTS.GRID_ROWS - 1,
        warningRows: [],
        warningCols: [],
        warningTimeLeft: 0,
        currentStageIndex: 0
      },
      roundTime: 0,
      roundNumber: 1,
      roundsToWin: BOMB_ARENA_CONSTANTS.ROUNDS_TO_WIN,
      phase: 'COUNTDOWN',
      roundWinner: null,
      matchWinner: null,
      roundWinReason: '',
      countdown: BOMB_ARENA_CONSTANTS.COUNTDOWN_SECONDS,
      screenShake: 0
    };

    this.setupRound(1);
  }

  public setupRound(roundNum: number) {
    this.state.roundNumber = roundNum;
    this.state.grid = this.createEmptyGrid();
    this.state.bombs = [];
    this.state.explosions = [];
    this.state.roundTime = 0;
    this.state.phase = 'COUNTDOWN';
    this.state.countdown = BOMB_ARENA_CONSTANTS.COUNTDOWN_SECONDS;
    this.state.roundWinner = null;
    this.state.roundWinReason = '';
    this.state.screenShake = 0;

    // Reset bounds
    this.state.bounds = {
      minCol: 0,
      maxCol: BOMB_ARENA_CONSTANTS.GRID_COLS - 1,
      minRow: 0,
      maxRow: BOMB_ARENA_CONSTANTS.GRID_ROWS - 1,
      warningRows: [],
      warningCols: [],
      warningTimeLeft: 0,
      currentStageIndex: 0
    };

    // Spawn Player at bottom center
    this.state.player.x = 2.5;
    this.state.player.y = 10.5;
    this.state.player.col = 2;
    this.state.player.row = 10;
    this.state.player.facing = 'up';
    this.state.player.isMoving = false;
    this.state.player.isDead = false;
    this.state.player.fenceStock = BOMB_ARENA_CONSTANTS.MAX_FENCE_STOCK;
    this.state.player.bombStock = BOMB_ARENA_CONSTANTS.MAX_BOMB_STOCK;
    this.state.player.fenceRecharge = 0;
    this.state.player.bombRecharge = 0;
    this.state.player.fenceCooldown = 0;
    this.state.player.bombCooldown = 0;

    // Spawn Opponent at top center
    this.state.opponent.x = 3.5;
    this.state.opponent.y = 1.5;
    this.state.opponent.col = 3;
    this.state.opponent.row = 1;
    this.state.opponent.facing = 'down';
    this.state.opponent.isMoving = false;
    this.state.opponent.isDead = false;
    this.state.opponent.fenceStock = BOMB_ARENA_CONSTANTS.MAX_FENCE_STOCK;
    this.state.opponent.bombStock = BOMB_ARENA_CONSTANTS.MAX_BOMB_STOCK;
    this.state.opponent.fenceRecharge = 0;
    this.state.opponent.bombRecharge = 0;
    this.state.opponent.fenceCooldown = 0;
    this.state.opponent.bombCooldown = 0;
  }

  private createEmptyGrid(): CellType[][] {
    const grid: CellType[][] = [];
    for (let c = 0; c < BOMB_ARENA_CONSTANTS.GRID_COLS; c++) {
      grid[c] = [];
      for (let r = 0; r < BOMB_ARENA_CONSTANTS.GRID_ROWS; r++) {
        grid[c][r] = 'empty';
      }
    }
    return grid;
  }

  // =========================================================================
  // MOVEMENT & CONTROLS
  // =========================================================================
  public movePlayer(id: 'player' | 'opponent', dx: number, dy: number, dt: number) {
    if (this.state.phase !== 'PLAYING') return;

    const p = id === 'player' ? this.state.player : this.state.opponent;
    if (p.isDead) return;

    const len = Math.hypot(dx, dy);
    if (len < 0.08) {
      p.isMoving = false;
      return;
    }

    p.isMoving = true;
    // Set facing direction
    if (Math.abs(dx) > Math.abs(dy)) {
      p.facing = dx > 0 ? 'right' : 'left';
    } else {
      p.facing = dy > 0 ? 'down' : 'up';
    }

    // 100% constant full speed - nothing ever makes players movement slow
    const dist = BOMB_ARENA_CONSTANTS.PLAYER_SPEED * dt;
    const vx = (dx / len) * dist;
    const vy = (dy / len) * dist;

    const startX = p.x;
    const startY = p.y;
    let movedX = false;
    let movedY = false;

    // Move along X with collision and corner assist
    if (vx !== 0) {
      const targetX = p.x + vx;
      const curOverlap = this.getOverlapDepth(p.x, p.y);
      const nextOverlap = this.getOverlapDepth(targetX, p.y);

      // Allow if no overlap, or moving away from existing overlap into open space
      if (nextOverlap === 0 || nextOverlap < curOverlap - 0.0001) {
        p.x = targetX;
        movedX = true;
      } else {
        // Corner assist: slide along Y if close to tile center
        const nearestRow = Math.floor(p.y) + 0.5;
        const diffY = nearestRow - p.y;
        if (Math.abs(diffY) > 0.02 && Math.abs(diffY) < 0.48) {
          const slideStep = Math.sign(diffY) * Math.min(Math.abs(diffY), dist);
          if (this.getOverlapDepth(p.x, p.y + slideStep) <= curOverlap) {
            p.y += slideStep;
          }
        }
      }
    }

    // Move along Y with collision and corner assist
    if (vy !== 0) {
      const targetY = p.y + vy;
      const curOverlap = this.getOverlapDepth(p.x, p.y);
      const nextOverlap = this.getOverlapDepth(p.x, targetY);

      if (nextOverlap === 0 || nextOverlap < curOverlap - 0.0001) {
        p.y = targetY;
        movedY = true;
      } else {
        // Corner assist: slide along X if close to tile center
        const nearestCol = Math.floor(p.x) + 0.5;
        const diffX = nearestCol - p.x;
        if (Math.abs(diffX) > 0.02 && Math.abs(diffX) < 0.48) {
          const slideStep = Math.sign(diffX) * Math.min(Math.abs(diffX), dist);
          if (this.getOverlapDepth(p.x + slideStep, p.y) <= curOverlap) {
            p.x += slideStep;
          }
        }
      }
    }

    // FALLBACK: When both X and Y were individually rejected, the player is
    // likely squeezed between fences. Try combined diagonal movement, or
    // move toward the nearest walkable tile center to escape.
    if (!movedX && !movedY && (vx !== 0 || vy !== 0)) {
      const curOverlap = this.getOverlapDepth(startX, startY);

      // Attempt 1: Combined diagonal movement — moving both axes at once may
      // succeed when each axis independently hits a different fence
      const comboOverlap = this.getOverlapDepth(startX + vx, startY + vy);
      if (comboOverlap === 0 || comboOverlap < curOverlap - 0.0001) {
        p.x = startX + vx;
        p.y = startY + vy;
      } else if (curOverlap > 0) {
        // Attempt 2: Player is already stuck inside obstacles — find any
        // adjacent walkable tile center and move toward it.
        const playerCol = Math.floor(startX);
        const playerRow = Math.floor(startY);
        const b = this.state.bounds;

        // Check all 4 + the current tile's center as escape targets
        const escapeTargets: { tx: number; ty: number; score: number }[] = [];
        const dirs = [
          { dc: 0, dr: -1 }, { dc: 0, dr: 1 },
          { dc: -1, dr: 0 }, { dc: 1, dr: 0 },
          { dc: 0, dr: 0 },  // current tile
        ];

        for (const { dc, dr } of dirs) {
          const tc = playerCol + dc;
          const tr = playerRow + dr;
          if (tc < b.minCol || tc > b.maxCol || tr < b.minRow || tr > b.maxRow) continue;
          if (this.state.grid[tc][tr] !== 'empty') continue;

          const tileCx = tc + 0.5;
          const tileCy = tr + 0.5;
          // Only consider tiles roughly in the direction the player is pushing
          const toDirX = tileCx - startX;
          const toDirY = tileCy - startY;
          const dot = toDirX * vx + toDirY * vy;
          if (dot <= 0 && !(dc === 0 && dr === 0)) continue; // not in movement direction

          escapeTargets.push({ tx: tileCx, ty: tileCy, score: dot });
        }

        // Sort by alignment with desired movement direction
        escapeTargets.sort((a, b) => b.score - a.score);

        for (const target of escapeTargets) {
          const toX = target.tx - startX;
          const toY = target.ty - startY;
          const tLen = Math.hypot(toX, toY);
          if (tLen < 0.01) continue;

          const escVx = (toX / tLen) * dist;
          const escVy = (toY / tLen) * dist;
          const escOverlap = this.getOverlapDepth(startX + escVx, startY + escVy);

          // Allow if it reduces overlap, OR if it moves toward an empty tile
          // even with some temporary overlap (depenetration will fix it)
          if (escOverlap < curOverlap + 0.05) {
            p.x = startX + escVx;
            p.y = startY + escVy;
            break;
          }
        }
      }
    }

    // Depenetrate so players never stick inside any obstacle
    this.resolvePlayerOverlaps(p);

    p.col = Math.floor(p.x);
    p.row = Math.floor(p.y);
  }

  public setPlayerFacing(id: 'player' | 'opponent', facing: FacingDirection) {
    const p = id === 'player' ? this.state.player : this.state.opponent;
    p.facing = facing;
  }

  public getOverlapDepth(x: number, y: number): number {
    const r = BOMB_ARENA_CONSTANTS.PLAYER_RADIUS;
    const b = this.state.bounds;

    if (x - r < b.minCol) return b.minCol - (x - r);
    if (x + r > b.maxCol + 1) return (x + r) - (b.maxCol + 1);
    if (y - r < b.minRow) return b.minRow - (y - r);
    if (y + r > b.maxRow + 1) return (y + r) - (b.maxRow + 1);

    let maxOverlap = 0;
    const minC = Math.max(0, Math.floor(x - r));
    const maxC = Math.min(BOMB_ARENA_CONSTANTS.GRID_COLS - 1, Math.floor(x + r));
    const minR = Math.max(0, Math.floor(y - r));
    const maxR = Math.min(BOMB_ARENA_CONSTANTS.GRID_ROWS - 1, Math.floor(y + r));

    for (let c = minC; c <= maxC; c++) {
      for (let row = minR; row <= maxR; row++) {
        if (this.state.grid[c][row] === 'fence' || this.state.grid[c][row] === 'crushed') {
          const closestX = Math.max(c, Math.min(c + 1, x));
          const closestY = Math.max(row, Math.min(row + 1, y));
          const distSq = (x - closestX) ** 2 + (y - closestY) ** 2;
          if (distSq < r * r) {
            const dist = Math.sqrt(distSq);
            maxOverlap = Math.max(maxOverlap, r - dist);
          }
        }
      }
    }

    return maxOverlap;
  }

  public resolvePlayerOverlaps(p: BombArenaPlayer) {
    const r = BOMB_ARENA_CONSTANTS.PLAYER_RADIUS;
    const b = this.state.bounds;
    const minC = Math.max(0, Math.floor(p.x - r));
    const maxC = Math.min(BOMB_ARENA_CONSTANTS.GRID_COLS - 1, Math.floor(p.x + r));
    const minR = Math.max(0, Math.floor(p.y - r));
    const maxR = Math.min(BOMB_ARENA_CONSTANTS.GRID_ROWS - 1, Math.floor(p.y + r));

    for (let c = minC; c <= maxC; c++) {
      for (let row = minR; row <= maxR; row++) {
        if (this.state.grid[c][row] === 'fence' || this.state.grid[c][row] === 'crushed') {
          this.resolveOverlapWithTile(p, c, row);
        }
      }
    }

    // Clamp inside active arena bounds
    const halfR = BOMB_ARENA_CONSTANTS.PLAYER_RADIUS;
    p.x = Math.max(b.minCol + halfR, Math.min(b.maxCol + 1 - halfR, p.x));
    p.y = Math.max(b.minRow + halfR, Math.min(b.maxRow + 1 - halfR, p.y));
  }

  public resolveOverlapWithTile(p: BombArenaPlayer, c: number, r: number) {
    const radius = BOMB_ARENA_CONSTANTS.PLAYER_RADIUS;
    const closestX = Math.max(c, Math.min(c + 1, p.x));
    const closestY = Math.max(r, Math.min(r + 1, p.y));
    const dx = p.x - closestX;
    const dy = p.y - closestY;
    const dist = Math.hypot(dx, dy);

    if (dist < radius) {
      if (dist > 0.001) {
        const pushDist = radius - dist + 0.03;
        p.x += (dx / dist) * pushDist;
        p.y += (dy / dist) * pushDist;
      } else {
        // Center is inside box: push towards nearest boundary
        const dLeft = p.x - c;
        const dRight = c + 1 - p.x;
        const dTop = p.y - r;
        const dBottom = r + 1 - p.y;
        const min = Math.min(dLeft, dRight, dTop, dBottom);
        if (min === dLeft) p.x = c - radius - 0.03;
        else if (min === dRight) p.x = c + 1 + radius + 0.03;
        else if (min === dTop) p.y = r - radius - 0.03;
        else p.y = r + 1 + radius + 0.03;
      }
    }
  }

  // =========================================================================
  // FENCE & BOMB PLACEMENT
  // =========================================================================
  public getTargetPlacementCell(id: 'player' | 'opponent'): GridCoord {
    const p = id === 'player' ? this.state.player : this.state.opponent;
    let targetCol = Math.floor(p.x);
    let targetRow = Math.floor(p.y);

    switch (p.facing) {
      case 'up':
        targetRow -= 1;
        break;
      case 'down':
        targetRow += 1;
        break;
      case 'left':
        targetCol -= 1;
        break;
      case 'right':
        targetCol += 1;
        break;
    }

    return { col: targetCol, row: targetRow };
  }

  public canPlaceFenceAt(col: number, row: number): boolean {
    const b = this.state.bounds;
    if (col < b.minCol || col > b.maxCol || row < b.minRow || row > b.maxRow) {
      return false;
    }
    if (this.state.grid[col][row] !== 'empty') {
      return false;
    }
    // Cannot place directly on top of player's center tile
    const pOnTile = Math.floor(this.state.player.x) === col && Math.floor(this.state.player.y) === row;
    const oOnTile = Math.floor(this.state.opponent.x) === col && Math.floor(this.state.opponent.y) === row;
    if (pOnTile || oOnTile) {
      return false;
    }
    // Cannot place on an active bomb
    if (this.state.bombs.some(bomb => bomb.col === col && bomb.row === row)) {
      return false;
    }
    return true;
  }

  public placeFence(id: 'player' | 'opponent'): boolean {
    if (this.state.phase !== 'PLAYING') return false;

    const p = id === 'player' ? this.state.player : this.state.opponent;
    if (p.isDead || p.fenceStock <= 0 || p.fenceCooldown > 0) return false;

    const target = this.getTargetPlacementCell(id);
    if (!this.canPlaceFenceAt(target.col, target.row)) return false;

    this.state.grid[target.col][target.row] = 'fence';
    p.fenceStock -= 1;
    p.fenceCooldown = BOMB_ARENA_CONSTANTS.FENCE_COOLDOWN;

    // Immediately push out any player touching or grazing the new fence so they NEVER get stuck!
    this.resolveOverlapWithTile(p, target.col, target.row);
    this.resolveOverlapWithTile(this.state.opponent, target.col, target.row);

    // Recalculate all bomb threats as this fence may shield an area
    this.recalculateAllBombThreats();
    this.onFencePlaced?.(target);
    return true;
  }

  public canPlaceBombAt(col: number, row: number): boolean {
    const b = this.state.bounds;
    if (col < b.minCol || col > b.maxCol || row < b.minRow || row > b.maxRow) {
      return false;
    }
    if (this.state.grid[col][row] !== 'empty') {
      return false;
    }
    if (this.state.bombs.some(bomb => bomb.col === col && bomb.row === row)) {
      return false;
    }
    return true;
  }

  public placeBomb(id: 'player' | 'opponent'): boolean {
    if (this.state.phase !== 'PLAYING') return false;

    const p = id === 'player' ? this.state.player : this.state.opponent;
    if (p.isDead || p.bombStock <= 0 || p.bombCooldown > 0) return false;

    // Try target in front first
    let target = this.getTargetPlacementCell(id);
    if (!this.canPlaceBombAt(target.col, target.row)) {
      // Fallback: place on current player cell if open
      target = { col: Math.floor(p.x), row: Math.floor(p.y) };
      if (!this.canPlaceBombAt(target.col, target.row)) {
        return false;
      }
    }

    const threatCells = this.calculateThreatCells(target.col, target.row, BOMB_ARENA_CONSTANTS.BOMB_RADIUS);
    const newBomb: ActiveBomb = {
      id: `bomb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      col: target.col,
      row: target.row,
      owner: id,
      timer: BOMB_ARENA_CONSTANTS.BOMB_FUSE_TIME,
      maxTimer: BOMB_ARENA_CONSTANTS.BOMB_FUSE_TIME,
      radius: BOMB_ARENA_CONSTANTS.BOMB_RADIUS,
      threatCells
    };

    this.state.bombs.push(newBomb);
    p.bombStock -= 1;
    p.bombCooldown = BOMB_ARENA_CONSTANTS.BOMB_COOLDOWN;

    this.onBombPlaced?.(newBomb);
    return true;
  }

  // =========================================================================
  // BLAST THREAT RAYCASTING
  // =========================================================================
  public calculateThreatCells(bCol: number, bRow: number, radius: number): GridCoord[] {
    const threats: GridCoord[] = [{ col: bCol, row: bRow }];
    const b = this.state.bounds;

    const dirs = [
      { dc: 0, dr: -1 }, // Up
      { dc: 0, dr: 1 },  // Down
      { dc: -1, dr: 0 }, // Left
      { dc: 1, dr: 0 }   // Right
    ];

    for (const dir of dirs) {
      for (let dist = 1; dist <= radius; dist++) {
        const c = bCol + dir.dc * dist;
        const r = bRow + dir.dr * dist;

        if (c < b.minCol || c > b.maxCol || r < b.minRow || r > b.maxRow) {
          break; // Hit edge of active arena
        }

        const cell = this.state.grid[c][r];
        if (cell === 'crushed') {
          break; // Unbreakable wall stops flames
        }

        threats.push({ col: c, row: r });

        if (cell === 'fence') {
          // Destroys the fence, but flames stop here!
          break;
        }
      }
    }

    return threats;
  }

  public recalculateAllBombThreats() {
    for (const bomb of this.state.bombs) {
      bomb.threatCells = this.calculateThreatCells(bomb.col, bomb.row, bomb.radius);
    }
  }

  // =========================================================================
  // MAIN ENGINE UPDATE LOOP
  // =========================================================================
  public update(dt: number) {
    // Decay screen shake
    if (this.state.screenShake > 0) {
      this.state.screenShake *= BOMB_ARENA_CONSTANTS.SCREEN_SHAKE_DECAY;
      if (this.state.screenShake < 0.2) this.state.screenShake = 0;
    }

    // 1. Countdown Phase
    if (this.state.phase === 'COUNTDOWN') {
      return;
    }

    // 2. Playing Phase
    if (this.state.phase === 'PLAYING') {
      this.state.roundTime += dt;

      // Inventory recharges
      this.updatePlayerInventories(dt);

      // Arena shrinking check
      this.updateArenaShrinking(dt);

      // Bombs fuse timers & detonations
      this.updateBombs(dt);

      // Explosions visual decay
      this.updateExplosions(dt);

      // Check sudden death hazards on players
      this.checkPlayerCrushHazards();
    }
  }

  private updatePlayerInventories(dt: number) {
    const players = [this.state.player, this.state.opponent];
    for (const p of players) {
      if (p.fenceCooldown > 0) {
        p.fenceCooldown = Math.max(0, p.fenceCooldown - dt);
      }
      if (p.bombCooldown > 0) {
        p.bombCooldown = Math.max(0, p.bombCooldown - dt);
      }

      // Fence recharge
      if (p.fenceStock < BOMB_ARENA_CONSTANTS.MAX_FENCE_STOCK) {
        p.fenceRecharge += dt;
        if (p.fenceRecharge >= BOMB_ARENA_CONSTANTS.FENCE_RECHARGE_TIME) {
          p.fenceStock += 1;
          p.fenceRecharge = 0;
        }
      } else {
        p.fenceRecharge = 0;
      }

      // Bomb recharge
      if (p.bombStock < BOMB_ARENA_CONSTANTS.MAX_BOMB_STOCK) {
        p.bombRecharge += dt;
        if (p.bombRecharge >= BOMB_ARENA_CONSTANTS.BOMB_RECHARGE_TIME) {
          p.bombStock += 1;
          p.bombRecharge = 0;
        }
      } else {
        p.bombRecharge = 0;
      }
    }
  }

  private updateArenaShrinking(dt: number) {
    const t = this.state.roundTime;
    const stages = BOMB_ARENA_CONSTANTS.SHRINK_STAGES;
    const stageIdx = this.state.bounds.currentStageIndex;

    if (stageIdx < stages.length) {
      const stage = stages[stageIdx];

      // Check if we entered warning phase
      if (t >= stage.triggerTime && this.state.bounds.warningTimeLeft <= 0) {
        this.state.bounds.warningRows = stage.crushRows ? [...stage.crushRows] : [];
        this.state.bounds.warningCols = stage.crushCols ? [...stage.crushCols] : [];
        this.state.bounds.warningTimeLeft = stage.warningDuration;
        this.onSirenWarning?.();
      }

      // Countdown warning timer
      if (this.state.bounds.warningTimeLeft > 0) {
        this.state.bounds.warningTimeLeft -= dt;
        if (this.state.bounds.warningTimeLeft <= 0) {
          // Warning expired: CRUSH the designated rows / cols!
          this.executeArenaCrush(stage);
          this.state.bounds.currentStageIndex += 1;
          this.state.bounds.warningRows = [];
          this.state.bounds.warningCols = [];
        }
      }
    }
  }

  private executeArenaCrush(stage: typeof BOMB_ARENA_CONSTANTS.SHRINK_STAGES[0]) {
    this.state.screenShake = 16;

    if (stage.crushRows) {
      for (const r of stage.crushRows) {
        for (let c = 0; c < BOMB_ARENA_CONSTANTS.GRID_COLS; c++) {
          this.state.grid[c][r] = 'crushed';
          // Destroy any bombs in this row
          this.state.bombs = this.state.bombs.filter(b => b.row !== r);
        }
      }
      this.state.bounds.minRow = Math.min(
        ...Array.from({ length: BOMB_ARENA_CONSTANTS.GRID_ROWS }, (_, i) => i).filter(r => !this.isRowCrushed(r))
      );
      this.state.bounds.maxRow = Math.max(
        ...Array.from({ length: BOMB_ARENA_CONSTANTS.GRID_ROWS }, (_, i) => i).filter(r => !this.isRowCrushed(r))
      );
    }

    if (stage.crushCols) {
      for (const c of stage.crushCols) {
        for (let r = 0; r < BOMB_ARENA_CONSTANTS.GRID_ROWS; r++) {
          this.state.grid[c][r] = 'crushed';
          this.state.bombs = this.state.bombs.filter(b => b.col !== c);
        }
      }
      this.state.bounds.minCol = Math.min(
        ...Array.from({ length: BOMB_ARENA_CONSTANTS.GRID_COLS }, (_, i) => i).filter(c => !this.isColCrushed(c))
      );
      this.state.bounds.maxCol = Math.max(
        ...Array.from({ length: BOMB_ARENA_CONSTANTS.GRID_COLS }, (_, i) => i).filter(c => !this.isColCrushed(c))
      );
    }

    this.recalculateAllBombThreats();
    this.onArenaShrink?.(stage.crushRows || [], stage.crushCols || []);
  }

  private isRowCrushed(row: number): boolean {
    for (let c = 0; c < BOMB_ARENA_CONSTANTS.GRID_COLS; c++) {
      if (this.state.grid[c][row] !== 'crushed') return false;
    }
    return true;
  }

  private isColCrushed(col: number): boolean {
    for (let r = 0; r < BOMB_ARENA_CONSTANTS.GRID_ROWS; r++) {
      if (this.state.grid[col][r] !== 'crushed') return false;
    }
    return true;
  }

  private checkPlayerCrushHazards() {
    const players = [this.state.player, this.state.opponent];
    for (const p of players) {
      if (p.isDead) continue;
      const c = Math.floor(p.x);
      const r = Math.floor(p.y);
      if (c >= 0 && c < BOMB_ARENA_CONSTANTS.GRID_COLS && r >= 0 && r < BOMB_ARENA_CONSTANTS.GRID_ROWS) {
        if (this.state.grid[c][r] === 'crushed') {
          p.isDead = true;
          this.onPlayerHit?.(p.id, 'crush');
          this.resolveRoundEnd(p.id === 'player' ? 'opponent' : 'player', `${p.name} was crushed by collapsing arena!`);
          return;
        }
      }
    }
  }

  private updateBombs(dt: number) {
    for (let i = this.state.bombs.length - 1; i >= 0; i--) {
      const bomb = this.state.bombs[i];
      bomb.timer -= dt;

      if (bomb.timer <= 0) {
        this.detonateBomb(bomb);
        this.state.bombs.splice(i, 1);
      }
    }
  }

  private detonateBomb(bomb: ActiveBomb) {
    this.state.screenShake = 14;

    const destroyedFences: GridCoord[] = [];
    const threatCells = bomb.threatCells;

    // Destroy fences caught in blast
    for (const cell of threatCells) {
      if (this.state.grid[cell.col][cell.row] === 'fence') {
        this.state.grid[cell.col][cell.row] = 'empty';
        destroyedFences.push({ col: cell.col, row: cell.row });
      }
    }

    // Create explosion visual
    const explosion: ActiveExplosion = {
      id: `expl_${Date.now()}`,
      cells: threatCells,
      timer: BOMB_ARENA_CONSTANTS.EXPLOSION_DURATION,
      maxTimer: BOMB_ARENA_CONSTANTS.EXPLOSION_DURATION,
      owner: bomb.owner
    };
    this.state.explosions.push(explosion);
    this.onExplosion?.(explosion, destroyedFences);

    // Recalculate remaining bomb threats as broken fences might open new corridors
    this.recalculateAllBombThreats();

    // Check if players were hit by the explosion
    let playerHit = false;
    let oppHit = false;

    for (const cell of threatCells) {
      if (Math.hypot(this.state.player.x - (cell.col + 0.5), this.state.player.y - (cell.row + 0.5)) < 0.72) {
        playerHit = true;
      }
      if (Math.hypot(this.state.opponent.x - (cell.col + 0.5), this.state.opponent.y - (cell.row + 0.5)) < 0.72) {
        oppHit = true;
      }
    }

    if (playerHit && oppHit) {
      this.state.player.isDead = true;
      this.state.opponent.isDead = true;
      this.onPlayerHit?.('player', bomb.owner);
      this.onPlayerHit?.('opponent', bomb.owner);
      this.resolveRoundEnd('draw', 'Mutual Blast Knockout!');
    } else if (playerHit) {
      this.state.player.isDead = true;
      this.onPlayerHit?.('player', bomb.owner);
      const killerName = bomb.owner === 'player' ? 'their own' : 'rival';
      this.resolveRoundEnd('opponent', `You were caught in ${killerName} bomb blast!`);
    } else if (oppHit) {
      this.state.opponent.isDead = true;
      this.onPlayerHit?.('opponent', bomb.owner);
      const killerName = bomb.owner === 'player' ? 'your' : 'their own';
      this.resolveRoundEnd('player', `Rival was blasted by ${killerName} bomb!`);
    }
  }

  private updateExplosions(dt: number) {
    for (let i = this.state.explosions.length - 1; i >= 0; i--) {
      const exp = this.state.explosions[i];
      exp.timer -= dt;
      if (exp.timer <= 0) {
        this.state.explosions.splice(i, 1);
      }
    }
  }

  // =========================================================================
  // ROUND & MATCH RESOLUTION
  // =========================================================================
  private resolveRoundEnd(winner: 'player' | 'opponent' | 'draw', reason: string) {
    if (this.state.phase !== 'PLAYING') return;

    this.state.phase = 'ROUND_OVER';
    this.state.roundWinner = winner;
    this.state.roundWinReason = reason;

    if (winner === 'player') {
      this.state.player.roundsWon += 1;
    } else if (winner === 'opponent') {
      this.state.opponent.roundsWon += 1;
    }

    const playerWonMatch = this.state.player.roundsWon >= this.state.roundsToWin;
    const oppWonMatch = this.state.opponent.roundsWon >= this.state.roundsToWin;

    if (playerWonMatch || oppWonMatch) {
      this.state.phase = 'MATCH_OVER';
      this.state.matchWinner = playerWonMatch ? 'player' : 'opponent';
      this.onMatchOver?.(this.state.matchWinner);
    } else {
      this.onRoundOver?.(winner, reason);
    }
  }
}
