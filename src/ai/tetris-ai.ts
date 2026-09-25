import {
  COLS,
  BUFFER_ROWS,
  TOTAL_ROWS,
  type TetrominoType,
  TETROMINOES
} from '../engine/constants';
import { TetrisEngine } from '../engine/tetris-engine';

export type AIDifficulty = 'easy' | 'medium' | 'hard' | 'extreme';

interface MoveCandidate {
  rotation: number;
  targetX: number;
  score: number;
  useHold: boolean;
}

export class TetrisAI {
  public difficulty: AIDifficulty;
  private dropInterval: number;
  private lastActionTime: number = 0;
  private currentPlannedMove: MoveCandidate | null = null;
  private stepState: 'rotate' | 'shift' | 'drop' = 'rotate';
  private activePieceType: TetrominoType | null = null;

  constructor(difficulty: AIDifficulty = 'medium') {
    this.difficulty = difficulty;
    this.dropInterval = this.getIntervalForDifficulty(difficulty);
  }

  public setDifficulty(diff: AIDifficulty) {
    this.difficulty = diff;
    this.dropInterval = this.getIntervalForDifficulty(diff);
  }

  private getIntervalForDifficulty(diff: AIDifficulty): number {
    switch (diff) {
      case 'easy': return 1000;
      case 'medium': return 550;
      case 'hard': return 260;
      case 'extreme': return 110;
    }
  }

  public update(engine: TetrisEngine, timestamp: number) {
    if (engine.isGameOver || !engine.currentPiece) {
      this.currentPlannedMove = null;
      this.activePieceType = null;
      return;
    }

    // If piece locked or changed unexpectedly, reset planned move
    if (this.activePieceType !== engine.currentPiece.type) {
      this.activePieceType = engine.currentPiece.type;
      this.currentPlannedMove = null;
    }

    if (timestamp - this.lastActionTime < this.dropInterval) {
      return;
    }
    this.lastActionTime = timestamp;

    // If no planned move yet, plan one
    if (!this.currentPlannedMove) {
      this.currentPlannedMove = this.findBestMove(engine);
      if (this.currentPlannedMove?.useHold && engine.canHold) {
        engine.hold();
        this.activePieceType = engine.currentPiece?.type || null;
        this.currentPlannedMove = this.findBestMove(engine);
      }
      this.stepState = 'rotate';
    }

    const move = this.currentPlannedMove;
    if (!move || !engine.currentPiece) return;

    // Step 1: Rotate to target
    if (this.stepState === 'rotate') {
      if (engine.currentPiece.rotation !== move.rotation) {
        const rotated = engine.rotate('cw');
        if (!rotated) {
          // Blocked from rotating further; proceed to shift
          this.stepState = 'shift';
        }
        return;
      }
      this.stepState = 'shift';
    }

    // Step 2: Shift laterally
    if (this.stepState === 'shift') {
      if (engine.currentPiece.x < move.targetX) {
        const moved = engine.moveRight();
        if (!moved) {
          // Blocked by stack or wall; force drop to avoid infinite lock
          this.stepState = 'drop';
          return;
        }
        return;
      } else if (engine.currentPiece.x > move.targetX) {
        const moved = engine.moveLeft();
        if (!moved) {
          // Blocked by stack or wall; force drop to avoid infinite lock
          this.stepState = 'drop';
          return;
        }
        return;
      }
      this.stepState = 'drop';
    }

    // Step 3: Hard drop
    if (this.stepState === 'drop') {
      engine.hardDrop();
      this.currentPlannedMove = null;
      this.activePieceType = null;
    }
  }

  private findBestMove(engine: TetrisEngine): MoveCandidate {
    if (!engine.currentPiece) {
      return { rotation: 0, targetX: 3, score: -999999, useHold: false };
    }

    // Evaluate moves with current piece
    let bestMove = this.searchPieceMoves(engine, engine.currentPiece.type, false);

    // If Hard or Extreme, also evaluate moves with Hold piece if available
    if ((this.difficulty === 'hard' || this.difficulty === 'extreme') && engine.canHold) {
      const nextHoldType = engine.holdPieceType || (engine.nextQueue.length > 0 ? engine.nextQueue[0] : null);
      if (nextHoldType && nextHoldType !== engine.currentPiece.type) {
        const holdMove = this.searchPieceMoves(engine, nextHoldType, true);
        if (holdMove.score > bestMove.score + 15) {
          bestMove = holdMove;
        }
      }
    }

    // For Easy/Medium, inject occasional human-like inaccuracy
    if (this.difficulty === 'easy' && Math.random() < 0.25) {
      bestMove.targetX = Math.max(0, Math.min(COLS - 3, bestMove.targetX + (Math.random() < 0.5 ? -1 : 1)));
      bestMove.rotation = Math.floor(Math.random() * 4);
    } else if (this.difficulty === 'medium' && Math.random() < 0.08) {
      bestMove.targetX = Math.max(0, Math.min(COLS - 3, bestMove.targetX + (Math.random() < 0.5 ? -1 : 1)));
    }

    return bestMove;
  }

  private searchPieceMoves(engine: TetrisEngine, pieceType: TetrominoType, useHold: boolean): MoveCandidate {
    let bestMove: MoveCandidate = {
      rotation: 0,
      targetX: 3,
      score: -Infinity,
      useHold
    };

    const rotationsCount = TETROMINOES[pieceType].rotations.length;

    for (let rot = 0; rot < rotationsCount; rot++) {
      const shape = TETROMINOES[pieceType].rotations[rot];
      const pieceWidth = shape[0].length;

      for (let x = -2; x <= COLS - pieceWidth + 2; x++) {
        // Check if piece can start dropping at this x and rot
        const startY = BUFFER_ROWS;
        if (engine.checkCollision(x, startY, rot, pieceType)) {
          continue;
        }

        // Drop piece to bottom
        let dropY = startY;
        while (!engine.checkCollision(x, dropY + 1, rot, pieceType)) {
          dropY++;
        }

        // Simulate locked grid
        const simulatedGrid = this.cloneGrid(engine.grid);
        let valid = true;
        for (let r = 0; r < shape.length; r++) {
          for (let c = 0; c < shape[r].length; c++) {
            if (shape[r][c] !== 0) {
              const by = dropY + r;
              const bx = x + c;
              if (by >= 0 && by < TOTAL_ROWS && bx >= 0 && bx < COLS) {
                simulatedGrid[by][bx] = '#ffffff';
              } else {
                valid = false;
              }
            }
          }
        }

        if (!valid) continue;

        const score = this.evaluateGrid(simulatedGrid, dropY, this.difficulty);
        if (score > bestMove.score) {
          bestMove = {
            rotation: rot,
            targetX: x,
            score,
            useHold
          };
        }
      }
    }

    return bestMove;
  }

  private evaluateGrid(grid: (string | null)[][], landingY: number, diff: AIDifficulty): number {
    // Calculate columns height (distance from bottom of board)
    const colHeights: number[] = Array(COLS).fill(0);
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < TOTAL_ROWS; r++) {
        if (grid[r][c] !== null) {
          colHeights[c] = TOTAL_ROWS - r;
          break;
        }
      }
    }

    // Count full lines
    let completeLines = 0;
    for (let r = 0; r < TOTAL_ROWS; r++) {
      if (grid[r].every(cell => cell !== null)) {
        completeLines++;
      }
    }

    // Count holes (empty cells beneath filled cells)
    let holes = 0;
    for (let c = 0; c < COLS; c++) {
      let blockSeen = false;
      for (let r = 0; r < TOTAL_ROWS; r++) {
        if (grid[r][c] !== null) {
          blockSeen = true;
        } else if (blockSeen) {
          holes++;
        }
      }
    }

    // Column bumpiness
    let bumpiness = 0;
    for (let c = 0; c < COLS - 1; c++) {
      bumpiness += Math.abs(colHeights[c] - colHeights[c + 1]);
    }

    // Aggregate height
    const aggregateHeight = colHeights.reduce((sum, h) => sum + h, 0);
    const maxHeight = Math.max(...colHeights);

    // Weights adjusted per difficulty (Pierre Dellacherie based)
    let wLines = 3.4;
    let wHoles = -35.0;
    let wBumpiness = -1.8;
    let wHeight = -0.5;
    let wMaxHeight = -1.5;

    if (diff === 'easy') {
      wLines = 1.0;
      wHoles = -10.0;
      wBumpiness = -0.5;
      wHeight = -0.2;
    } else if (diff === 'hard' || diff === 'extreme') {
      wLines = 4.5;
      wHoles = -45.0;
      wBumpiness = -2.2;
      wHeight = -0.6;
      wMaxHeight = -2.5;

      // Reward Tetris clears heavily (4 lines at once)
      if (completeLines === 4) {
        wLines += 25.0;
      }

      // Keep right-most column somewhat lower for I-piece Tetris well if safe
      if (maxHeight < 12 && colHeights[COLS - 1] < colHeights[COLS - 2] - 2) {
        wLines += 4.0;
      }
    }

    const landingHeight = TOTAL_ROWS - landingY;

    return (
      landingHeight * -0.8 +
      completeLines * wLines +
      holes * wHoles +
      bumpiness * wBumpiness +
      aggregateHeight * wHeight +
      maxHeight * wMaxHeight
    );
  }

  private cloneGrid(grid: (string | null)[][]): (string | null)[][] {
    return grid.map(row => [...row]);
  }

  public reset(): void {
    this.lastActionTime = 0;
    this.currentPlannedMove = null;
    this.stepState = 'rotate';
    this.activePieceType = null;
  }
}
