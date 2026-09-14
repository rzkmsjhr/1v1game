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

  public setDifficulty(diff: AIDifficulty) {
    this.difficulty = diff;
  }

  public start() {
    this.stop();
    this.isRunning = true;
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

  private getPacingDelay(): number {
    switch (this.difficulty) {
      case 'easy':
        return 2000 + Math.random() * 800; // 2.0s - 2.8s
      case 'medium':
        return 1200 + Math.random() * 500; // 1.2s - 1.7s
      case 'hard':
        return 700 + Math.random() * 350;  // 0.7s - 1.05s
      case 'extreme':
        return 340 + Math.random() * 180;  // 0.34s - 0.52s
      default:
        return 1300;
    }
  }

  private scheduleNextStep() {
    if (!this.isRunning || this.engine.status !== 'playing') return;

    const delay = this.getPacingDelay();
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

    // Simulate human-like blunder on Easy/Medium
    const blunderChance = this.difficulty === 'easy' ? 0.30 : (this.difficulty === 'medium' ? 0.12 : 0);
    if (Math.random() < blunderChance && unplaced.length > 1) {
      this.simulateBlunder(unplaced);
      return;
    }

    // Place next correct piece
    const piece = unplaced[0];
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
    // Pick an offset spot near the solution
    const piece = unplaced[0];
    const offsetR = piece.solutionR + (Math.random() < 0.5 ? 1 : -1);
    const offsetC = piece.solutionC;

    const placed = this.engine.placePiece(this.engine.opponentBoard, piece, offsetR, offsetC);
    if (placed) {
      this.onPiecePlaced?.(piece.id, offsetR, offsetC);

      // Realize mistake after 800-1400ms and remove piece
      this.timer = window.setTimeout(() => {
        this.timer = null;
        if (!this.isRunning || this.engine.status !== 'playing') return;
        this.engine.removePiece(this.engine.opponentBoard, piece.id);
        this.onPieceRemoved?.(piece.id);

        // Try again correctly
        this.scheduleNextStep();
      }, 900 + Math.random() * 500);
    } else {
      // If couldn't place blunder, just place correctly
      this.placeCorrect(piece);
      this.scheduleNextStep();
    }
  }
}
