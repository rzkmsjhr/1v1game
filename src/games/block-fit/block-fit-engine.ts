// Core Match & Puzzle Validation Engine for Block Fit Duel
import type {
  PolyominoPiece,
  RoundPuzzle,
  PlayerBoardState,
  MatchScore,
  RoundWinner
} from './block-fit-types';
import { generateRoundPuzzle } from './block-fit-generator';

export class BlockFitEngine {
  public matchScore: MatchScore;
  public currentPuzzle!: RoundPuzzle;
  public playerBoard!: PlayerBoardState;
  public opponentBoard!: PlayerBoardState;

  public status: 'idle' | 'countdown' | 'playing' | 'round_won' | 'match_over' = 'idle';
  public countdown: number = 3;
  public roundWinner: RoundWinner = null;
  public roundStartTime: number = 0;
  public roundDurationMs: number = 0;

  private matchSeed: number;

  constructor(seed?: number) {
    this.matchSeed = seed ?? Math.floor(Math.random() * 1000000);
    this.matchScore = {
      playerWins: 0,
      opponentWins: 0,
      targetWins: 3, // Best of 5
      currentRound: 1,
      maxRounds: 5,
      history: [],
      matchWinner: null
    };

    this.initRound(1);
  }

  public initRound(roundNumber: number) {
    this.matchScore.currentRound = roundNumber;
    this.roundWinner = null;
    this.status = 'countdown';
    this.countdown = 3;
    this.roundStartTime = 0;
    this.roundDurationMs = 0;

    // Generate puzzle for this round
    this.currentPuzzle = generateRoundPuzzle(this.matchSeed, roundNumber);

    this.playerBoard = this.createEmptyBoard(this.currentPuzzle);
    this.opponentBoard = this.createEmptyBoard(this.currentPuzzle);
  }

  private createEmptyBoard(puzzle: RoundPuzzle): PlayerBoardState {
    return {
      placedPieces: new Map(),
      placedCount: 0,
      totalPieces: puzzle.pieces.length,
      filledCells: 0,
      totalCells: puzzle.tray.cellCount,
      isComplete: false
    };
  }

  public startRound() {
    this.status = 'playing';
    this.roundStartTime = Date.now();
  }

  /**
   * Check if a piece can be placed at (targetR, targetC) inside the tray
   */
  public canPlacePiece(
    board: PlayerBoardState,
    piece: PolyominoPiece,
    targetR: number,
    targetC: number
  ): boolean {
    const tray = this.currentPuzzle.tray;

    // 1. Build currently occupied cells map (excluding this piece if re-positioning)
    const occupied = new Set<string>();
    for (const [pId, placed] of board.placedPieces) {
      if (pId === piece.id) continue;
      const otherPiece = this.currentPuzzle.pieces.find(p => p.id === pId);
      if (!otherPiece) continue;
      for (const c of otherPiece.cells) {
        occupied.add(`${placed.trayR + c.r},${placed.trayC + c.c}`);
      }
    }

    // 2. Validate all cells of incoming piece
    for (const cell of piece.cells) {
      const r = targetR + cell.r;
      const c = targetC + cell.c;

      // Within tray bounding grid?
      if (r < 0 || r >= tray.rows || c < 0 || c >= tray.cols) {
        return false;
      }

      // Inside tray active silhouette mask?
      if (!tray.mask[r][c]) {
        return false;
      }

      // Overlapping another piece?
      if (occupied.has(`${r},${c}`)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Place a piece at (targetR, targetC)
   * Returns true if placement was successful
   */
  public placePiece(
    board: PlayerBoardState,
    piece: PolyominoPiece,
    targetR: number,
    targetC: number
  ): boolean {
    if (!this.canPlacePiece(board, piece, targetR, targetC)) {
      return false;
    }

    // Remove first if already placed elsewhere
    if (board.placedPieces.has(piece.id)) {
      this.removePiece(board, piece.id);
    }

    board.placedPieces.set(piece.id, {
      pieceId: piece.id,
      trayR: targetR,
      trayC: targetC
    });

    this.recalculateBoard(board);
    return true;
  }

  /**
   * Remove piece from tray back to dock
   */
  public removePiece(board: PlayerBoardState, pieceId: string): boolean {
    if (!board.placedPieces.has(pieceId)) return false;
    board.placedPieces.delete(pieceId);
    this.recalculateBoard(board);
    return true;
  }

  private recalculateBoard(board: PlayerBoardState) {
    let filled = 0;
    for (const [pId] of board.placedPieces) {
      const p = this.currentPuzzle.pieces.find(pc => pc.id === pId);
      if (p) filled += p.cells.length;
    }
    board.filledCells = filled;
    board.placedCount = board.placedPieces.size;
    board.isComplete = filled === board.totalCells && board.placedCount === board.totalPieces;
  }

  /**
   * Declare round winner and update Best-of-5 match status
   */
  public claimRoundWin(winner: 'player' | 'opponent'): 'round_cleared' | 'match_won' {
    if (this.status !== 'playing') return 'round_cleared';

    this.roundWinner = winner;
    this.roundDurationMs = Date.now() - this.roundStartTime;

    if (winner === 'player') {
      this.matchScore.playerWins++;
    } else {
      this.matchScore.opponentWins++;
    }

    this.matchScore.history.push({
      roundNumber: this.matchScore.currentRound,
      winner,
      trayName: this.currentPuzzle.tray.name,
      durationMs: this.roundDurationMs
    });

    if (this.matchScore.playerWins >= this.matchScore.targetWins) {
      this.matchScore.matchWinner = 'player';
      this.status = 'match_over';
      return 'match_won';
    } else if (this.matchScore.opponentWins >= this.matchScore.targetWins) {
      this.matchScore.matchWinner = 'opponent';
      this.status = 'match_over';
      return 'match_won';
    } else {
      this.status = 'round_won';
      return 'round_cleared';
    }
  }

  /**
   * Reconcile/override round winner when network tiebreaker resolves
   */
  public overrideRoundWinner(winner: 'player' | 'opponent'): 'round_cleared' | 'match_won' {
    const prevWinner = this.roundWinner;
    if (prevWinner === winner) {
      return this.matchScore.matchWinner ? 'match_won' : 'round_cleared';
    }

    if (prevWinner === 'player') this.matchScore.playerWins = Math.max(0, this.matchScore.playerWins - 1);
    else if (prevWinner === 'opponent') this.matchScore.opponentWins = Math.max(0, this.matchScore.opponentWins - 1);

    if (winner === 'player') this.matchScore.playerWins++;
    else if (winner === 'opponent') this.matchScore.opponentWins++;

    this.roundWinner = winner;
    const lastHistory = this.matchScore.history[this.matchScore.history.length - 1];
    if (lastHistory && lastHistory.roundNumber === this.matchScore.currentRound) {
      lastHistory.winner = winner;
    }

    if (this.matchScore.playerWins >= this.matchScore.targetWins) {
      this.matchScore.matchWinner = 'player';
      this.status = 'match_over';
      return 'match_won';
    } else if (this.matchScore.opponentWins >= this.matchScore.targetWins) {
      this.matchScore.matchWinner = 'opponent';
      this.status = 'match_over';
      return 'match_won';
    } else {
      this.matchScore.matchWinner = null;
      this.status = 'round_won';
      return 'round_cleared';
    }
  }

  public nextRound() {
    if (this.matchScore.matchWinner) return;
    this.initRound(this.matchScore.currentRound + 1);
  }

  public resetMatch(newSeed?: number) {
    this.matchSeed = newSeed ?? Math.floor(Math.random() * 1000000);
    this.matchScore = {
      playerWins: 0,
      opponentWins: 0,
      targetWins: 3,
      currentRound: 1,
      maxRounds: 5,
      history: [],
      matchWinner: null
    };
    this.initRound(1);
  }
}
