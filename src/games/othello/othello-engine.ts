export const BOARD_SIZE = 8;

export type PlayerColor = 1 | 2; // 1 = Black (starts first), 2 = White
export type Cell = 0 | PlayerColor;

export interface MoveResult {
  r: number;
  c: number;
  player: PlayerColor;
  flipped: [number, number][];
}

const DIRECTIONS: [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

// Positional weight evaluation matrix for Othello
const POSITION_WEIGHTS: number[][] = [
  [ 120, -20,  20,   5,   5,  20, -20, 120 ],
  [ -20, -40,  -5,  -5,  -5,  -5, -40, -20 ],
  [  20,  -5,  15,   3,   3,  15,  -5,  20 ],
  [   5,  -5,   3,   3,   3,   3,  -5,   5 ],
  [   5,  -5,   3,   3,   3,   3,  -5,   5 ],
  [  20,  -5,  15,   3,   3,  15,  -5,  20 ],
  [ -20, -40,  -5,  -5,  -5,  -5, -40, -20 ],
  [ 120, -20,  20,   5,   5,  20, -20, 120 ],
];

export class OthelloEngine {
  public board: Cell[][];
  public currentPlayer: PlayerColor = 1; // Black starts
  public isGameOver: boolean = false;
  public lastMove: [number, number] | null = null;
  public passedTurn: boolean = false;

  constructor() {
    this.board = this.createInitialBoard();
  }

  public createInitialBoard(): Cell[][] {
    const b: Cell[][] = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
    // Standard Othello starting configuration in center:
    // (3,3) = White, (3,4) = Black, (4,3) = Black, (4,4) = White
    b[3][3] = 2;
    b[3][4] = 1;
    b[4][3] = 1;
    b[4][4] = 2;
    return b;
  }

  public reset() {
    this.board = this.createInitialBoard();
    this.currentPlayer = 1;
    this.isGameOver = false;
    this.lastMove = null;
    this.passedTurn = false;
  }

  public isValidCoord(r: number, c: number): boolean {
    return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
  }

  // Returns all opponent discs that would be flipped by placing a disc at (r, c)
  public getFlippedDiscs(r: number, c: number, player: PlayerColor, customBoard?: Cell[][]): [number, number][] {
    const b = customBoard || this.board;
    if (!this.isValidCoord(r, c) || b[r][c] !== 0) return [];

    const opponent: PlayerColor = player === 1 ? 2 : 1;
    const flipped: [number, number][] = [];

    for (const [dr, dc] of DIRECTIONS) {
      let curR = r + dr;
      let curC = c + dc;
      const path: [number, number][] = [];

      while (this.isValidCoord(curR, curC) && b[curR][curC] === opponent) {
        path.push([curR, curC]);
        curR += dr;
        curC += dc;
      }

      // If bracketed by player's own disc
      if (path.length > 0 && this.isValidCoord(curR, curC) && b[curR][curC] === player) {
        flipped.push(...path);
      }
    }

    return flipped;
  }

  public getValidMoves(player: PlayerColor = this.currentPlayer, customBoard?: Cell[][]): [number, number][] {
    const b = customBoard || this.board;
    const moves: [number, number][] = [];

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (b[r][c] === 0) {
          const flipped = this.getFlippedDiscs(r, c, player, b);
          if (flipped.length > 0) {
            moves.push([r, c]);
          }
        }
      }
    }
    return moves;
  }

  public makeMove(r: number, c: number): MoveResult | null {
    if (this.isGameOver) return null;

    const flipped = this.getFlippedDiscs(r, c, this.currentPlayer);
    if (flipped.length === 0) return null;

    // Place piece and flip captured discs
    const player = this.currentPlayer;
    this.board[r][c] = player;
    for (const [fr, fc] of flipped) {
      this.board[fr][fc] = player;
    }

    this.lastMove = [r, c];
    const nextPlayer: PlayerColor = player === 1 ? 2 : 1;

    // Check if next player has valid moves
    const nextMoves = this.getValidMoves(nextPlayer);
    if (nextMoves.length > 0) {
      this.currentPlayer = nextPlayer;
      this.passedTurn = false;
    } else {
      // Next player must pass! Check if current player can move again
      const currentMovesAgain = this.getValidMoves(player);
      if (currentMovesAgain.length > 0) {
        // Player moves again (opponent passes)
        this.passedTurn = true;
      } else {
        // Neither player has moves -> Game Over!
        this.isGameOver = true;
      }
    }

    return { r, c, player, flipped };
  }

  public getScores(): { black: number; white: number } {
    let black = 0;
    let white = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (this.board[r][c] === 1) black++;
        else if (this.board[r][c] === 2) white++;
      }
    }
    return { black, white };
  }

  // -------------------------------------------------------------
  // MINIMAX AI BOT FOR OTHELLO
  // -------------------------------------------------------------

  public getBestAIMove(difficulty: 'easy' | 'medium' | 'hard' | 'extreme'): [number, number] | null {
    const validMoves = this.getValidMoves(this.currentPlayer);
    if (validMoves.length === 0) return null;

    if (difficulty === 'easy') {
      // Easy: Random choice with slight corner preference
      if (Math.random() < 0.4) {
        return validMoves[Math.floor(Math.random() * validMoves.length)];
      }
      return this.searchBestMove(1);
    }

    if (difficulty === 'medium') {
      return this.searchBestMove(2);
    }

    if (difficulty === 'hard') {
      return this.searchBestMove(3);
    }

    // Extreme: 4-ply search with move ordering
    return this.searchBestMove(4);
  }

  private searchBestMove(depth: number): [number, number] {
    const validMoves = this.getValidMoves(this.currentPlayer);
    let bestScore = -Infinity;
    let bestMove: [number, number] = validMoves[0];

    // Order moves by positional weight to maximize early alpha-beta cutoffs
    validMoves.sort((a, b) => POSITION_WEIGHTS[b[0]][b[1]] - POSITION_WEIGHTS[a[0]][a[1]]);

    for (const [r, c] of validMoves) {
      const simulatedBoard = this.cloneBoard(this.board);
      const flipped = this.getFlippedDiscs(r, c, this.currentPlayer, simulatedBoard);
      simulatedBoard[r][c] = this.currentPlayer;
      for (const [fr, fc] of flipped) {
        simulatedBoard[fr][fc] = this.currentPlayer;
      }

      const opponent: PlayerColor = this.currentPlayer === 1 ? 2 : 1;
      const score = this.minimax(simulatedBoard, depth - 1, -Infinity, Infinity, false, this.currentPlayer, opponent);

      if (score > bestScore) {
        bestScore = score;
        bestMove = [r, c];
      }
    }

    return bestMove;
  }

  private minimax(
    board: Cell[][],
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean,
    aiPlayer: PlayerColor,
    curPlayer: PlayerColor
  ): number {
    const validMoves = this.getValidMoves(curPlayer, board);
    validMoves.sort((a, b) => POSITION_WEIGHTS[b[0]][b[1]] - POSITION_WEIGHTS[a[0]][a[1]]);
    const opponent: PlayerColor = curPlayer === 1 ? 2 : 1;

    // If no moves, check if opponent has moves (pass) or game over
    if (validMoves.length === 0) {
      const oppMoves = this.getValidMoves(opponent, board);
      if (oppMoves.length === 0 || depth <= 0) {
        return this.evaluateBoard(board, aiPlayer);
      }
      // Pass turn
      return this.minimax(board, depth - 1, alpha, beta, !isMaximizing, aiPlayer, opponent);
    }

    if (depth <= 0) {
      return this.evaluateBoard(board, aiPlayer);
    }

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const [r, c] of validMoves) {
        const nextBoard = this.cloneBoard(board);
        const flipped = this.getFlippedDiscs(r, c, curPlayer, nextBoard);
        nextBoard[r][c] = curPlayer;
        for (const [fr, fc] of flipped) nextBoard[fr][fc] = curPlayer;

        const ev = this.minimax(nextBoard, depth - 1, alpha, beta, false, aiPlayer, opponent);
        maxEval = Math.max(maxEval, ev);
        alpha = Math.max(alpha, ev);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const [r, c] of validMoves) {
        const nextBoard = this.cloneBoard(board);
        const flipped = this.getFlippedDiscs(r, c, curPlayer, nextBoard);
        nextBoard[r][c] = curPlayer;
        for (const [fr, fc] of flipped) nextBoard[fr][fc] = curPlayer;

        const ev = this.minimax(nextBoard, depth - 1, alpha, beta, true, aiPlayer, opponent);
        minEval = Math.min(minEval, ev);
        beta = Math.min(beta, ev);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  private evaluateBoard(board: Cell[][], aiPlayer: PlayerColor): number {
    const humanPlayer: PlayerColor = aiPlayer === 1 ? 2 : 1;
    let positionalScore = 0;
    let aiDiscs = 0;
    let humanDiscs = 0;

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] === aiPlayer) {
          aiDiscs++;
          positionalScore += POSITION_WEIGHTS[r][c];
        } else if (board[r][c] === humanPlayer) {
          humanDiscs++;
          positionalScore -= POSITION_WEIGHTS[r][c];
        }
      }
    }

    // Mobility evaluation (number of legal moves)
    const aiMoves = this.getValidMoves(aiPlayer, board).length;
    const humanMoves = this.getValidMoves(humanPlayer, board).length;
    let mobilityScore = 0;
    if (aiMoves + humanMoves > 0) {
      mobilityScore = 100 * (aiMoves - humanMoves) / (aiMoves + humanMoves);
    }

    // Corner occupancy bonus
    let cornerScore = 0;
    const corners = [[0, 0], [0, 7], [7, 0], [7, 7]];
    for (const [cr, cc] of corners) {
      if (board[cr][cc] === aiPlayer) cornerScore += 25;
      else if (board[cr][cc] === humanPlayer) cornerScore -= 25;
    }

    // End-game disc differential emphasis
    const totalDiscs = aiDiscs + humanDiscs;
    const discParity = totalDiscs > 50 ? (aiDiscs - humanDiscs) * 10 : (aiDiscs - humanDiscs) * 2;

    return positionalScore + mobilityScore * 8 + cornerScore + discParity;
  }

  private cloneBoard(board: Cell[][]): Cell[][] {
    return board.map(row => [...row]);
  }
}
