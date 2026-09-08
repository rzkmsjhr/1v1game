import {
  COLS,
  BUFFER_ROWS,
  TOTAL_ROWS,
  type TetrominoType,
  TETROMINOES,
  SRS_KICKS_NORMAL,
  SRS_KICKS_I,
  calculateGarbage
} from './constants';

export interface ActivePiece {
  type: TetrominoType;
  x: number;
  y: number;
  rotation: number; // 0, 1, 2, 3
}

export interface EngineEvents {
  onChange?: () => void;
  onPieceLocked?: () => void;
  onLinesCleared?: (lines: number, garbageSent: number, isTetris: boolean, combo: number, clearedRows?: number[]) => void;
  onGarbageReceived?: (lines: number) => void;
  onGameOver?: (isWinner: boolean) => void;
}

export function createPRNG(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getCurrentTimestamp(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export class TetrisEngine {
  public grid: (string | null)[][]; // [TOTAL_ROWS][COLS]
  public currentPiece: ActivePiece | null = null;
  public holdPieceType: TetrominoType | null = null;
  public canHold: boolean = true;
  public nextQueue: TetrominoType[] = [];
  public bag: TetrominoType[] = [];

  public score: number = 0;
  public linesClearedTotal: number = 0;
  public combo: number = -1;
  public isBackToBack: boolean = false;
  public isGameOver: boolean = false;

  public seed: number = 0;
  private bagPRNG: () => number = Math.random;

  // Incoming garbage buffer (counter / queue)
  public pendingGarbage: number = 0;
  private garbageHoleCol: number = Math.floor(Math.random() * COLS);

  // Timing and lock delay
  public gravityInterval: number = 800; // ms per drop tick
  public lastDropTime: number = 0;
  public lockDelay: number = 500;
  public lockTimer: number | null = null;
  public lockResets: number = 0;
  private readonly maxLockResets: number = 15;

  public events: EngineEvents = {};

  constructor(events: EngineEvents = {}, seed?: number) {
    this.grid = this.createEmptyGrid();
    this.events = events;
    this.reset(false, seed);
  }

  public setSeed(seed: number) {
    this.seed = seed;
    this.bagPRNG = createPRNG(seed);
  }

  public createEmptyGrid(): (string | null)[][] {
    return Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(null));
  }

  public reset(notify: boolean = true, seed?: number) {
    if (seed !== undefined) {
      this.setSeed(seed);
    } else if (!this.seed) {
      this.setSeed(Math.floor(Math.random() * 2147483647) + 1);
    } else {
      this.setSeed(this.seed);
    }

    this.grid = this.createEmptyGrid();
    this.bag = [];
    this.nextQueue = [];
    this.holdPieceType = null;
    this.canHold = true;
    this.score = 0;
    this.linesClearedTotal = 0;
    this.combo = -1;
    this.isBackToBack = false;
    this.isGameOver = false;
    this.pendingGarbage = 0;
    this.garbageHoleCol = Math.floor(Math.random() * COLS);
    this.lockTimer = null;
    this.lockResets = 0;
    this.lastDropTime = 0;
    this.currentPiece = null;

    // Pre-fill queue with at least 5 pieces
    while (this.nextQueue.length < 7) {
      this.fillQueue();
    }
    this.spawnNextPiece(notify);
    if (notify) {
      this.events.onChange?.();
    }
  }

  private fillQueue() {
    if (this.bag.length === 0) {
      const pieces: TetrominoType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
      // Fisher-Yates shuffle using deterministic piece PRNG
      for (let i = pieces.length - 1; i > 0; i--) {
        const j = Math.floor(this.bagPRNG() * (i + 1));
        [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
      }
      this.bag = pieces;
    }
    this.nextQueue.push(this.bag.pop()!);
  }

  public spawnNextPiece(notify: boolean = true): boolean {
    if (this.nextQueue.length < 5) {
      this.fillQueue();
    }
    const type = this.nextQueue.shift()!;
    this.fillQueue();

    const shape = TETROMINOES[type].rotations[0];
    const pieceWidth = shape[0].length;
    const startX = Math.floor((COLS - pieceWidth) / 2);
    const startY = BUFFER_ROWS - 2;

    this.currentPiece = {
      type,
      x: startX,
      y: startY,
      rotation: 0
    };
    this.canHold = true;
    this.lockTimer = null;
    this.lockResets = 0;
    this.lastDropTime = getCurrentTimestamp();

    // Check if spawn location is blocked (Lockout / Block out game over)
    if (this.checkCollision(this.currentPiece.x, this.currentPiece.y, this.currentPiece.rotation, this.currentPiece.type)) {
      this.triggerGameOver();
      return false;
    }

    if (notify) {
      this.events.onChange?.();
    }
    return true;
  }

  public hold(): boolean {
    if (!this.canHold || !this.currentPiece || this.isGameOver) return false;

    const currentType = this.currentPiece.type;
    if (this.holdPieceType === null) {
      this.holdPieceType = currentType;
      this.spawnNextPiece();
    } else {
      const prevHold = this.holdPieceType;
      this.holdPieceType = currentType;
      const shape = TETROMINOES[prevHold].rotations[0];
      const startX = Math.floor((COLS - shape[0].length) / 2);
      const startY = BUFFER_ROWS - 2;
      this.currentPiece = {
        type: prevHold,
        x: startX,
        y: startY,
        rotation: 0
      };
      this.lockTimer = null;
      this.lockResets = 0;
      this.lastDropTime = getCurrentTimestamp();
    }

    this.canHold = false;
    this.events.onChange?.();
    return true;
  }

  public checkCollision(x: number, y: number, rotation: number, type: TetrominoType, customGrid?: (string | null)[][]): boolean {
    const matrix = TETROMINOES[type].rotations[rotation];
    const grid = customGrid || this.grid;

    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c] !== 0) {
          const boardX = x + c;
          const boardY = y + r;

          // Wall boundaries
          if (boardX < 0 || boardX >= COLS) return true;
          // Floor boundary
          if (boardY >= TOTAL_ROWS) return true;
          // Grid occupancy
          if (boardY >= 0 && grid[boardY][boardX] !== null) return true;
        }
      }
    }
    return false;
  }

  public moveLeft(): boolean {
    if (!this.currentPiece || this.isGameOver) return false;
    if (!this.checkCollision(this.currentPiece.x - 1, this.currentPiece.y, this.currentPiece.rotation, this.currentPiece.type)) {
      this.currentPiece.x -= 1;
      this.handlePieceMoved();
      this.events.onChange?.();
      return true;
    }
    return false;
  }

  public moveRight(): boolean {
    if (!this.currentPiece || this.isGameOver) return false;
    if (!this.checkCollision(this.currentPiece.x + 1, this.currentPiece.y, this.currentPiece.rotation, this.currentPiece.type)) {
      this.currentPiece.x += 1;
      this.handlePieceMoved();
      this.events.onChange?.();
      return true;
    }
    return false;
  }

  public softDrop(): boolean {
    if (!this.currentPiece || this.isGameOver) return false;
    if (!this.checkCollision(this.currentPiece.x, this.currentPiece.y + 1, this.currentPiece.rotation, this.currentPiece.type)) {
      this.currentPiece.y += 1;
      this.score += 1;
      this.lockTimer = null;
      this.lockResets = 0;
      this.events.onChange?.();
      return true;
    } else {
      // Piece touches ground
      this.startLockTimer();
      return false;
    }
  }

  public hardDrop(): number {
    if (!this.currentPiece || this.isGameOver) return 0;
    let dropDistance = 0;
    while (!this.checkCollision(this.currentPiece.x, this.currentPiece.y + 1, this.currentPiece.rotation, this.currentPiece.type)) {
      this.currentPiece.y += 1;
      dropDistance++;
    }
    this.score += dropDistance * 2;
    this.lockPiece();
    return dropDistance;
  }

  public rotate(direction: 'cw' | 'ccw'): boolean {
    if (!this.currentPiece || this.isGameOver) return false;
    const currentRot = this.currentPiece.rotation;
    const nextRot = direction === 'cw' ? (currentRot + 1) % 4 : (currentRot + 3) % 4;

    // Super Rotation System (SRS) Wall Kicks
    const kickKey = `${currentRot}->${nextRot}`;
    const kicks = this.currentPiece.type === 'I' ? SRS_KICKS_I[kickKey] : (SRS_KICKS_NORMAL[kickKey] || [[0, 0]]);

    for (const [kx, ky] of kicks) {
      // Note: Guideline Y kick offsets: positive Y is up in guideline, but in screen space positive Y is down!
      const testX = this.currentPiece.x + kx;
      const testY = this.currentPiece.y - ky;

      if (!this.checkCollision(testX, testY, nextRot, this.currentPiece.type)) {
        this.currentPiece.x = testX;
        this.currentPiece.y = testY;
        this.currentPiece.rotation = nextRot;
        this.handlePieceMoved();
        this.events.onChange?.();
        return true;
      }
    }
    return false;
  }

  private handlePieceMoved() {
    if (this.isOnGround()) {
      if (this.lockResets < this.maxLockResets) {
        this.lockResets++;
        this.lockTimer = getCurrentTimestamp();
      } else if (this.lockTimer === null) {
        this.lockTimer = getCurrentTimestamp();
      }
    } else {
      this.lockTimer = null;
    }
  }

  public isOnGround(): boolean {
    if (!this.currentPiece) return false;
    return this.checkCollision(this.currentPiece.x, this.currentPiece.y + 1, this.currentPiece.rotation, this.currentPiece.type);
  }

  private startLockTimer(time?: number) {
    if (this.lockTimer === null) {
      this.lockTimer = time ?? getCurrentTimestamp();
    }
  }

  public getGhostY(): number {
    if (!this.currentPiece) return 0;
    let ghostY = this.currentPiece.y;
    while (!this.checkCollision(this.currentPiece.x, ghostY + 1, this.currentPiece.rotation, this.currentPiece.type)) {
      ghostY++;
    }
    return ghostY;
  }

  public update(timestamp?: number) {
    if (this.isGameOver || !this.currentPiece) return;

    const now = timestamp ?? getCurrentTimestamp();

    if (this.lastDropTime === 0) {
      this.lastDropTime = now;
    }

    // Gravity drop
    if (now - this.lastDropTime >= this.gravityInterval) {
      this.lastDropTime = now;
      if (!this.checkCollision(this.currentPiece.x, this.currentPiece.y + 1, this.currentPiece.rotation, this.currentPiece.type)) {
        this.currentPiece.y += 1;
        this.lockTimer = null;
        this.lockResets = 0;
        this.events.onChange?.();
      } else {
        this.startLockTimer(now);
      }
    }

    // Lock delay check
    if (this.isOnGround()) {
      if (this.lockTimer === null) {
        this.lockTimer = now;
      } else if (now - this.lockTimer >= this.lockDelay) {
        this.lockPiece();
      }
    } else {
      this.lockTimer = null;
    }
  }

  public lockPiece() {
    if (!this.currentPiece || this.isGameOver) return;

    const shape = TETROMINOES[this.currentPiece.type].rotations[this.currentPiece.rotation];
    const color = TETROMINOES[this.currentPiece.type].color;

    // Stamp piece onto board
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] !== 0) {
          const by = this.currentPiece.y + r;
          const bx = this.currentPiece.x + c;
          if (by >= 0 && by < TOTAL_ROWS && bx >= 0 && bx < COLS) {
            this.grid[by][bx] = color;
          }
        }
      }
    }

    this.currentPiece = null;
    this.events.onPieceLocked?.();

    // Check line clears
    const { count: clearedLines, rows: clearedRows } = this.clearLines();

    // Competitive 1v1 Garbage Attack / Counter Calculation
    if (clearedLines > 0) {
      this.combo++;
      const isTetris = clearedLines === 4;
      const isB2B = isTetris && this.isBackToBack;
      if (isTetris) this.isBackToBack = true;
      else this.isBackToBack = false;

      const attackLines = calculateGarbage(clearedLines, false, this.combo, isB2B);

      // 1v1 Garbage Cancellation: clear incoming garbage first!
      let outgoingGarbage = 0;
      if (attackLines > 0) {
        if (this.pendingGarbage >= attackLines) {
          this.pendingGarbage -= attackLines;
        } else {
          outgoingGarbage = attackLines - this.pendingGarbage;
          this.pendingGarbage = 0;
        }
      }

      this.linesClearedTotal += clearedLines;
      this.events.onLinesCleared?.(clearedLines, outgoingGarbage, isTetris, this.combo, clearedRows);
    } else {
      this.combo = -1;
      // No lines cleared -> Receive pending garbage into the board!
      if (this.pendingGarbage > 0) {
        this.receivePendingGarbage();
      }
    }

    // Check if board topped out into buffer zone
    if (this.checkTopOut()) {
      this.triggerGameOver();
      return;
    }

    // Spawn next piece
    this.spawnNextPiece();
  }

  private clearLines(): { count: number; rows: number[] } {
    const clearedRows: number[] = [];
    const newGrid: (string | null)[][] = [];

    for (let r = 0; r < TOTAL_ROWS; r++) {
      const isFull = this.grid[r].every(cell => cell !== null);
      if (isFull) {
        clearedRows.push(r);
      } else {
        newGrid.push([...this.grid[r]]);
      }
    }

    // Add empty rows to top
    while (newGrid.length < TOTAL_ROWS) {
      newGrid.unshift(Array(COLS).fill(null));
    }

    this.grid = newGrid;
    const linesCleared = clearedRows.length;

    if (linesCleared > 0) {
      const baseScores = [0, 100, 300, 500, 800];
      this.score += (baseScores[linesCleared] || 1000) * (this.combo > 0 ? (1 + this.combo * 0.5) : 1);
    }

    return { count: linesCleared, rows: clearedRows };
  }

  // Pushes pending garbage up from the bottom
  private receivePendingGarbage() {
    // Cap at 8 lines per piece drop so player can react
    const linesToAdd = Math.min(this.pendingGarbage, 8);
    this.pendingGarbage -= linesToAdd;

    // Shift board rows up
    for (let i = 0; i < linesToAdd; i++) {
      // 10% chance to switch hole column
      if (Math.random() < 0.15) {
        this.garbageHoleCol = Math.floor(Math.random() * COLS);
      }
      this.grid.shift();
      const garbageRow: (string | null)[] = Array(COLS).fill('#555a6e'); // Gray garbage block
      garbageRow[this.garbageHoleCol] = null; // Hole
      this.grid.push(garbageRow);
    }

    this.events.onGarbageReceived?.(linesToAdd);
  }

  // Queue incoming garbage from opponent attack
  public addIncomingGarbage(lines: number) {
    if (this.isGameOver) return;
    this.pendingGarbage += lines;
    this.events.onChange?.();
  }

  private checkTopOut(): boolean {
    // If visible ceiling (rows 0 to BUFFER_ROWS - 1) contains locked blocks
    for (let r = 0; r < BUFFER_ROWS; r++) {
      if (this.grid[r].some(cell => cell !== null)) {
        return true;
      }
    }
    return false;
  }

  public triggerGameOver() {
    this.isGameOver = true;
    this.events.onGameOver?.(false);
    this.events.onChange?.();
  }

  // Export board matrix (20 visible rows) for opponent preview synchronization
  public getVisibleGrid(): (string | null)[][] {
    return this.grid.slice(BUFFER_ROWS);
  }
}
