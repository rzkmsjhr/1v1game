export type PlayerSide = 'player' | 'opponent';

export interface Puck {
  id: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  radius: number;
  owner: PlayerSide;
  isDragged?: boolean;
  dragX?: number;
  dragY?: number;
}

export interface ElasticBand {
  side: PlayerSide;
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
  midX: number;
  midY: number;
  restY: number;
  tension: number;
  isStretched: boolean;
  vibrationOffset: number;
  vibrationVelocity: number;
}

export type MatchPhase = 'COUNTDOWN' | 'PLAYING' | 'ROUND_OVER' | 'MATCH_OVER';

export interface SlingGameState {
  phase: MatchPhase;
  countdown: number; // 3, 2, 1, GO!
  winner: PlayerSide | null;
  playerScore: number;
  opponentScore: number;
  playerPuckCount: number;
  opponentPuckCount: number;
}
