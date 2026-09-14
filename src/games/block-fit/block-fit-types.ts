// Type definitions for Block Fit Duel (1v1 Tangram Polyomino Puzzle Race)

export interface CellCoord {
  r: number;
  c: number;
}

export interface BlockColor {
  id: string;
  name: string;
  primary: string;
  light: string;
  dark: string;
  border: string;
  glow: string;
}

export interface PolyominoPiece {
  id: string;
  cells: CellCoord[]; // Normalized with min(r) = 0, min(c) = 0
  color: BlockColor;
  width: number;
  height: number;
  // Perfect solution origin inside the tray (used for AI solver & verification)
  solutionR: number;
  solutionC: number;
}

export interface PlacedPiece {
  pieceId: string;
  trayR: number;
  trayC: number;
}

export interface TrayDefinition {
  id: string;
  name: string;
  rows: number;
  cols: number;
  mask: boolean[][]; // true = active puzzle slot, false = background void
  cellCount: number;
}

export interface RoundPuzzle {
  seed: number;
  roundNumber: number;
  tray: TrayDefinition;
  pieces: PolyominoPiece[];
}

export interface PlayerBoardState {
  // pieceId -> { pieceId, trayR, trayC }
  placedPieces: Map<string, PlacedPiece>;
  placedCount: number;
  totalPieces: number;
  filledCells: number;
  totalCells: number;
  isComplete: boolean;
}

export type RoundWinner = 'player' | 'opponent' | null;

export interface RoundResult {
  roundNumber: number;
  winner: RoundWinner;
  trayName: string;
  durationMs: number;
}

export interface MatchScore {
  playerWins: number;
  opponentWins: number;
  targetWins: number; // 3 for Best of 5
  currentRound: number;
  maxRounds: number;  // 5
  history: RoundResult[];
  matchWinner: 'player' | 'opponent' | null;
}

// WebRTC peer protocol message payloads
export interface PeerBlockFitMsg {
  type:
    | 'FIT_ROUND_START'
    | 'FIT_PIECE_PLACED'
    | 'FIT_PIECE_REMOVED'
    | 'FIT_ROUND_CLAIM'
    | 'FIT_REMATCH_REQUEST'
    | 'FIT_REMATCH_ACCEPT';
  seed?: number;
  roundNumber?: number;
  pieceId?: string;
  trayR?: number;
  trayC?: number;
  timestamp?: number;
}
