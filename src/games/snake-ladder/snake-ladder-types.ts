export type PlayerId = 'player' | 'opponent';

export type GamePhase = 'ROLL_FOR_START' | 'START_CHOICE' | 'PLAYING' | 'GAME_OVER';

export interface Ladder {
  id: number;
  from: number; // Bottom of ladder (start)
  to: number;   // Top of ladder (destination)
  length: number; // to - from
  startRow: number;
  endRow: number;
}

export interface Snake {
  id: number;
  from: number; // Head of snake (start)
  to: number;   // Tail of snake (destination)
  length: number; // from - to
  startRow: number;
  endRow: number;
}

export interface BoardConfig {
  seed: number;
  ladders: Ladder[];
  snakes: Snake[];
}

export interface DiceRoll {
  d1: number;
  d2: number;
  total: number;
  isDouble: boolean;
}

export interface MoveStep {
  tile: number;
  type: 'step' | 'ladder' | 'snake' | 'bounce';
}

export interface MoveResult {
  playerId: PlayerId;
  from: number;
  to: number;
  dice: DiceRoll;
  steps: MoveStep[];
  hitLadder?: Ladder;
  hitSnake?: Snake;
  won: boolean;
  extraTurn: boolean;
}

export interface TileCoord {
  tile: number;
  row: number; // 0 (bottom) to 9 (top)
  col: number; // 0 (left) to 9 (right)
  x: number;   // 0 to 1000 coordinate space
  y: number;   // 0 to 1000 coordinate space
}
