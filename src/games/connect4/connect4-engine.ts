export const C4_COLS = 7;
export const C4_ROWS = 6;

export type CellValue = 0 | 1 | 2; // 0: empty, 1: Player 1, 2: Player 2

export interface WinResult {
  winner: 1 | 2;
  winningLine: [number, number][]; // [row, col][]
}

export class Connect4Engine {
  public board: CellValue[][]; // [row][col], row 0 is top, row 5 is bottom
  public currentPlayer: 1 | 2 = 1;
  public moveHistory: { row: number; col: number; player: 1 | 2 }[] = [];
  public isGameOver: boolean = false;
  public winResult: WinResult | null = null;
  public isTie: boolean = false;

  constructor() {
    this.board = this.createEmptyBoard();
  }

  public createEmptyBoard(): CellValue[][] {
    return Array.from({ length: C4_ROWS }, () => Array(C4_COLS).fill(0));
  }

  public reset() {
    this.board = this.createEmptyBoard();
    this.currentPlayer = 1;
    this.moveHistory = [];
    this.isGameOver = false;
    this.winResult = null;
    this.isTie = false;
  }

  public getLowestEmptyRow(col: number, customBoard?: CellValue[][]): number {
    const b = customBoard || this.board;
    if (col < 0 || col >= C4_COLS) return -1;
    for (let r = C4_ROWS - 1; r >= 0; r--) {
      if (b[r][col] === 0) return r;
    }
    return -1;
  }

  public canDrop(col: number): boolean {
    if (this.isGameOver) return false;
    return this.getLowestEmptyRow(col) !== -1;
  }

  public dropToken(col: number): { row: number; col: number; player: 1 | 2 } | null {
    if (!this.canDrop(col)) return null;

    const row = this.getLowestEmptyRow(col);
    const player = this.currentPlayer;
    this.board[row][col] = player;
    this.moveHistory.push({ row, col, player });

    const win = this.checkWin(this.board, row, col, player);
    if (win) {
      this.isGameOver = true;
      this.winResult = win;
    } else if (this.isBoardFull()) {
      this.isGameOver = true;
      this.isTie = true;
    } else {
      this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
    }

    return { row, col, player };
  }

  public isBoardFull(customBoard?: CellValue[][]): boolean {
    const b = customBoard || this.board;
    for (let c = 0; c < C4_COLS; c++) {
      if (b[0][c] === 0) return false;
    }
    return true;
  }

  public checkWin(board: CellValue[][], lastRow: number, lastCol: number, player: 1 | 2): WinResult | null {
    const directions: [number, number][] = [
      [0, 1],  // Horizontal
      [1, 0],  // Vertical
      [1, 1],  // Diagonal down-right
      [1, -1], // Diagonal down-left
    ];

    for (const [dr, dc] of directions) {
      const line: [number, number][] = [[lastRow, lastCol]];

      // Positive direction
      for (let step = 1; step <= 3; step++) {
        const r = lastRow + dr * step;
        const c = lastCol + dc * step;
        if (r >= 0 && r < C4_ROWS && c >= 0 && c < C4_COLS && board[r][c] === player) {
          line.push([r, c]);
        } else break;
      }

      // Negative direction
      for (let step = 1; step <= 3; step++) {
        const r = lastRow - dr * step;
        const c = lastCol - dc * step;
        if (r >= 0 && r < C4_ROWS && c >= 0 && c < C4_COLS && board[r][c] === player) {
          line.unshift([r, c]);
        } else break;
      }

      if (line.length >= 4) {
        return { winner: player, winningLine: line };
      }
    }

    return null;
  }

  // -------------------------------------------------------------
  // MINIMAX AI ENGINE
  // -------------------------------------------------------------

  public getBestAIMove(difficulty: 'easy' | 'medium' | 'hard' | 'extreme'): number {
    const validCols: number[] = [];
    for (let c = 0; c < C4_COLS; c++) {
      if (this.canDrop(c)) validCols.push(c);
    }
    if (validCols.length === 0) return 0;

    // Easy: 30% chance of random move, else 1-ply check
    if (difficulty === 'easy') {
      if (Math.random() < 0.35) {
        return validCols[Math.floor(Math.random() * validCols.length)];
      }
      return this.searchMinimax(1, 2).col;
    }

    // Medium: 2-ply search
    if (difficulty === 'medium') {
      return this.searchMinimax(2, 2).col;
    }

    // Hard: 4-ply search
    if (difficulty === 'hard') {
      return this.searchMinimax(4, 2).col;
    }

    // Extreme: 6-ply search
    return this.searchMinimax(6, 2).col;
  }

  private searchMinimax(depth: number, aiPlayer: 1 | 2): { col: number; score: number } {
    let bestScore = -Infinity;
    let bestCol = 3; // Center column default

    // Order columns by center preference: 3, 2, 4, 1, 5, 0, 6
    const orderedCols = [3, 2, 4, 1, 5, 0, 6];

    for (const c of orderedCols) {
      if (this.canDrop(c)) {
        const r = this.getLowestEmptyRow(c);
        this.board[r][c] = aiPlayer;

        // Check immediate win
        if (this.checkWin(this.board, r, c, aiPlayer)) {
          this.board[r][c] = 0;
          return { col: c, score: 99999 };
        }

        const score = this.minimax(this.board, depth - 1, -Infinity, Infinity, false, aiPlayer, r, c);
        this.board[r][c] = 0;

        if (score > bestScore) {
          bestScore = score;
          bestCol = c;
        }
      }
    }

    return { col: bestCol, score: bestScore };
  }

  private minimax(
    board: CellValue[][],
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean,
    aiPlayer: 1 | 2,
    lastR: number,
    lastC: number
  ): number {
    const humanPlayer: 1 | 2 = aiPlayer === 1 ? 2 : 1;
    const lastPlayer = isMaximizing ? humanPlayer : aiPlayer;

    const win = this.checkWin(board, lastR, lastC, lastPlayer);
    if (win) {
      return win.winner === aiPlayer ? 10000 + depth : -10000 - depth;
    }

    if (depth === 0 || this.isBoardFull(board)) {
      return this.evaluateBoard(board, aiPlayer);
    }

    const orderedCols = [3, 2, 4, 1, 5, 0, 6];

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const c of orderedCols) {
        const r = this.getLowestEmptyRow(c, board);
        if (r !== -1) {
          board[r][c] = aiPlayer;
          const ev = this.minimax(board, depth - 1, alpha, beta, false, aiPlayer, r, c);
          board[r][c] = 0;
          maxEval = Math.max(maxEval, ev);
          alpha = Math.max(alpha, ev);
          if (beta <= alpha) break;
        }
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const c of orderedCols) {
        const r = this.getLowestEmptyRow(c, board);
        if (r !== -1) {
          board[r][c] = humanPlayer;
          const ev = this.minimax(board, depth - 1, alpha, beta, true, aiPlayer, r, c);
          board[r][c] = 0;
          minEval = Math.min(minEval, ev);
          beta = Math.min(beta, ev);
          if (beta <= alpha) break;
        }
      }
      return minEval;
    }
  }

  private evaluateBoard(board: CellValue[][], aiPlayer: 1 | 2): number {
    let score = 0;
    const humanPlayer: 1 | 2 = aiPlayer === 1 ? 2 : 1;

    // Center column preference
    for (let r = 0; r < C4_ROWS; r++) {
      if (board[r][3] === aiPlayer) score += 4;
      else if (board[r][3] === humanPlayer) score -= 4;
    }

    // Windows of 4 evaluation
    // Horizontal
    for (let r = 0; r < C4_ROWS; r++) {
      for (let c = 0; c < C4_COLS - 3; c++) {
        score += this.evaluateWindow([board[r][c], board[r][c+1], board[r][c+2], board[r][c+3]], aiPlayer);
      }
    }

    // Vertical
    for (let c = 0; c < C4_COLS; c++) {
      for (let r = 0; r < C4_ROWS - 3; r++) {
        score += this.evaluateWindow([board[r][c], board[r+1][c], board[r+2][c], board[r+3][c]], aiPlayer);
      }
    }

    // Diagonal positive
    for (let r = 0; r < C4_ROWS - 3; r++) {
      for (let c = 0; c < C4_COLS - 3; c++) {
        score += this.evaluateWindow([board[r][c], board[r+1][c+1], board[r+2][c+2], board[r+3][c+3]], aiPlayer);
      }
    }

    // Diagonal negative
    for (let r = 3; r < C4_ROWS; r++) {
      for (let c = 0; c < C4_COLS - 3; c++) {
        score += this.evaluateWindow([board[r][c], board[r-1][c+1], board[r-2][c+2], board[r-3][c+3]], aiPlayer);
      }
    }

    return score;
  }

  private evaluateWindow(w: CellValue[], aiPlayer: 1 | 2): number {
    const humanPlayer: 1 | 2 = aiPlayer === 1 ? 2 : 1;
    const aiCount = w.filter(cell => cell === aiPlayer).length;
    const humanCount = w.filter(cell => cell === humanPlayer).length;
    const emptyCount = w.filter(cell => cell === 0).length;

    if (aiCount === 4) return 1000;
    if (aiCount === 3 && emptyCount === 1) return 25;
    if (aiCount === 2 && emptyCount === 2) return 5;

    if (humanCount === 3 && emptyCount === 1) return -40; // Block threat
    if (humanCount === 2 && emptyCount === 2) return -8;

    return 0;
  }
}
