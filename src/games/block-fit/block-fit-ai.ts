// Smart Heuristic AI Bot for Block Fit Duel
import type { AIDifficulty } from '../types';
import type { BlockFitEngine } from './block-fit-engine';
import type { PolyominoPiece } from './block-fit-types';

export class BlockFitAI {
  private engine: BlockFitEngine;
  private difficulty: AIDifficulty;
  private timer: number | null = null;
  private isRunning: boolean = false;
  private onPiecePlaced?: (pieceId: string, trayR: number, trayC: number) => void;
  private onPieceRemoved?: (pieceId: string) => void;

  constructor(
    engine: BlockFitEngine,
    difficulty: AIDifficulty = 'medium',
    callbacks?: {
      onPiecePlaced?: (pieceId: string, trayR: number, trayC: number) => void;
      onPieceRemoved?: (pieceId: string) => void;
    }
  ) {
    this.engine = engine;
    this.difficulty = difficulty;
    this.onPiecePlaced = callbacks?.onPiecePlaced;
    this.onPieceRemoved = callbacks?.onPieceRemoved;
  }

  private isFirstMoveOfRound: boolean = true;

  public setDifficulty(diff: AIDifficulty) {
    this.difficulty = diff;
  }

  public start() {
    this.stop();
    this.isRunning = true;
    this.isFirstMoveOfRound = true;
    this.scheduleNextStep();
  }

  public stop() {
    this.isRunning = false;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  public destroy() {
    this.stop();
  }

  /**
   * Initial round hesitation (human looks at tray & pieces before first move)
   */
  private getInitialDelay(): number {
    switch (this.difficulty) {
      case 'easy':
        return 4500 + Math.random() * 2500; // 4.5s - 7.0s generous scan time
      case 'medium':
        return 2400 + Math.random() * 1200; // 2.4s - 3.6s
      case 'hard':
        return 1200 + Math.random() * 600;  // 1.2s - 1.8s
      case 'extreme':
        return 450 + Math.random() * 250;   // 0.45s - 0.7s
      default:
        return 2500;
    }
  }

  /**
   * Subsequent piece placement delays
   */
  private getPacingDelay(): number {
    switch (this.difficulty) {
      case 'easy':
        return 3800 + Math.random() * 2200; // 3.8s - 6.0s per piece (total round ~28s - 45s)
      case 'medium':
        return 2200 + Math.random() * 1000; // 2.2s - 3.2s per piece (total round ~14s - 18s)
      case 'hard':
        return 1100 + Math.random() * 500;  // 1.1s - 1.6s per piece (total round ~6s - 9s)
      case 'extreme':
        return 450 + Math.random() * 250;   // 0.45s - 0.7s per piece (total round ~2.5s - 4s)
      default:
        return 2200;
    }
  }

  private scheduleNextStep() {
    if (!this.isRunning || this.engine.status !== 'playing') return;

    let delay: number;
    if (this.isFirstMoveOfRound) {
      this.isFirstMoveOfRound = false;
      delay = this.getInitialDelay();
    } else {
      delay = this.getPacingDelay();
    }

    this.timer = window.setTimeout(() => {
      this.timer = null;
      if (!this.isRunning || this.engine.status !== 'playing') return;
      this.performStep();
    }, delay);
  }

  private performStep() {
    const oppBoard = this.engine.opponentBoard;
    if (oppBoard.isComplete) return;

    const unplaced = this.engine.currentPuzzle.pieces.filter(
      p => !oppBoard.placedPieces.has(p.id)
    );

    if (unplaced.length === 0) return;

    // Easy AI simulates occasional human pondering / hesitant pauses
    if (this.difficulty === 'easy' && Math.random() < 0.40) {
      const pauseDuration = 2000 + Math.random() * 2000; // 2.0s - 4.0s pause
      this.timer = window.setTimeout(() => {
        this.timer = null;
        if (!this.isRunning || this.engine.status !== 'playing') return;
        this.performStep();
      }, pauseDuration);
      return;
    }

    // Simulate human-like blunder on Easy/Medium
    const blunderChance = this.difficulty === 'easy' ? 0.35 : (this.difficulty === 'medium' ? 0.12 : 0);
    if (Math.random() < blunderChance && unplaced.length > 1) {
      this.simulateBlunder(unplaced);
      return;
    }

    // Randomize which unplaced piece the AI attempts next on Easy & Medium
    const pieceIdx = (this.difficulty === 'easy' || this.difficulty === 'medium')
      ? Math.floor(Math.random() * unplaced.length)
      : 0;
    const piece = unplaced[pieceIdx];

    this.placeCorrect(piece);

    // Schedule next piece if round is still active
    if (!oppBoard.isComplete) {
      this.scheduleNextStep();
    }
  }

  private placeCorrect(piece: PolyominoPiece) {
    const success = this.engine.placePiece(
      this.engine.opponentBoard,
      piece,
      piece.solutionR,
      piece.solutionC
    );

    if (success) {
      this.onPiecePlaced?.(piece.id, piece.solutionR, piece.solutionC);
      if (this.engine.opponentBoard.isComplete) {
        this.engine.claimRoundWin('opponent');
      }
    }
  }

  private simulateBlunder(unplaced: PolyominoPiece[]) {
    // Pick an unplaced piece to blunder with
    const piece = unplaced[Math.floor(Math.random() * unplaced.length)];
    const offsetR = piece.solutionR + (Math.random() < 0.5 ? 1 : -1);
    const offsetC = piece.solutionC;

    const placed = this.engine.placePiece(this.engine.opponentBoard, piece, offsetR, offsetC);
    if (placed) {
      this.onPiecePlaced?.(piece.id, offsetR, offsetC);

      // Realize mistake after 1.8s - 3.2s and remove piece
      this.timer = window.setTimeout(() => {
        this.timer = null;
        if (!this.isRunning || this.engine.status !== 'playing') return;
        this.engine.removePiece(this.engine.opponentBoard, piece.id);
        this.onPieceRemoved?.(piece.id);

        // Pause briefly after removing before next attempt
        this.scheduleNextStep();
      }, 1800 + Math.random() * 1400);
    } else {
      // If couldn't place blunder (e.g. collided with boundary/mask),
      // simulate the AI fumbling/hesitating for 2.0s - 3.5s before retrying.
      // Crucial: do NOT place correctly immediately!
      this.timer = window.setTimeout(() => {
        this.timer = null;
        if (!this.isRunning || this.engine.status !== 'playing') return;
        this.scheduleNextStep();
      }, 2000 + Math.random() * 1500);
    }
  }
}
