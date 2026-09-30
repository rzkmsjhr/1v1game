export type CellType = 'empty' | 'fence' | 'crushed';

export type FacingDirection = 'up' | 'down' | 'left' | 'right';

export interface GridCoord {
  col: number;
  row: number;
}

export interface ActiveBomb {
  id: string;
  col: number;
  row: number;
  owner: 'player' | 'opponent';
  timer: number;       // Starts at 3.0 seconds
  maxTimer: number;
  radius: number;      // Default 2 tiles
  threatCells: GridCoord[];
}

export interface ActiveExplosion {
  id: string;
  cells: GridCoord[];
  timer: number;       // Duration of blast visual (e.g. 0.4s)
  maxTimer: number;
  owner: 'player' | 'opponent';
}

export interface ArenaParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface BombArenaPlayer {
  id: 'player' | 'opponent';
  name: string;
  x: number;           // Continuous grid float X (0.0 to 5.0)
  y: number;           // Continuous grid float Y (0.0 to 11.0)
  col: number;         // Snapped grid column (0..5)
  row: number;         // Snapped grid row (0..11)
  facing: FacingDirection;
  isMoving: boolean;
  isDead: boolean;
  fenceStock: number;  // Max 3
  bombStock: number;   // Max 2
  fenceRecharge: number;
  bombRecharge: number;
  fenceCooldown: number;
  bombCooldown: number;
  roundsWon: number;
}

export interface ShrinkStage {
  triggerTime: number;    // In-game seconds when warning starts
  warningDuration: number;
  crushRows?: number[];
  crushCols?: number[];
}

export interface ArenaBounds {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
  warningRows: number[];
  warningCols: number[];
  warningTimeLeft: number;
  currentStageIndex: number;
}

export interface BombArenaState {
  grid: CellType[][]; // [col][row]
  bombs: ActiveBomb[];
  explosions: ActiveExplosion[];
  player: BombArenaPlayer;
  opponent: BombArenaPlayer;
  bounds: ArenaBounds;
  roundTime: number;
  roundNumber: number;
  roundsToWin: number;
  phase: 'COUNTDOWN' | 'PLAYING' | 'ROUND_OVER' | 'MATCH_OVER';
  roundWinner: 'player' | 'opponent' | 'draw' | null;
  matchWinner: 'player' | 'opponent' | null;
  roundWinReason: string;
  countdown: number;
  screenShake: number;
}
