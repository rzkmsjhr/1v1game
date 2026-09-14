import { Puck, ElasticBand, PlayerSide, MatchPhase } from './sling-types';
import { SlingPhysics } from './sling-physics';
import {
  TABLE_HEIGHT,
  CENTER_X,
  CENTER_Y,
  PLAYER_BAND_REST_Y,
  OPPONENT_BAND_REST_Y,
  BAND_LEFT_X,
  BAND_RIGHT_X,
  PUCK_RADIUS
} from './sling-constants';

export class SlingEngine {
  public pucks: Puck[] = [];
  public playerBand: ElasticBand;
  public opponentBand: ElasticBand;

  public phase: MatchPhase = 'COUNTDOWN';
  public countdown: number = 3;
  private countdownTimer: number = 0;

  public playerScore: number = 0;
  public opponentScore: number = 0;
  public roundsToWin: number = 1; // Direct race to clear table
  public roundWinner: PlayerSide | null = null;
  public matchWinner: PlayerSide | null = null;

  public onPuckCrossedGate?: (puck: Puck, toSide: PlayerSide) => void;
  public onRoundOver?: (winner: PlayerSide) => void;
  public onMatchOver?: (winner: PlayerSide) => void;

  constructor() {
    this.playerBand = {
      side: 'player',
      leftX: BAND_LEFT_X,
      leftY: PLAYER_BAND_REST_Y,
      rightX: BAND_RIGHT_X,
      rightY: PLAYER_BAND_REST_Y,
      midX: CENTER_X,
      midY: PLAYER_BAND_REST_Y,
      restY: PLAYER_BAND_REST_Y,
      tension: 0,
      isStretched: false,
      vibrationOffset: 0,
      vibrationVelocity: 0
    };

    this.opponentBand = {
      side: 'opponent',
      leftX: BAND_LEFT_X,
      leftY: OPPONENT_BAND_REST_Y,
      rightX: BAND_RIGHT_X,
      rightY: OPPONENT_BAND_REST_Y,
      midX: CENTER_X,
      midY: OPPONENT_BAND_REST_Y,
      restY: OPPONENT_BAND_REST_Y,
      tension: 0,
      isStretched: false,
      vibrationOffset: 0,
      vibrationVelocity: 0
    };

    this.setupRound(12345);
  }

  // Setup pucks symmetrically for a new round
  public setupRound(_seed: number = Date.now(), role: 'host' | 'guest' | null = 'host') {
    this.pucks = [];
    this.phase = 'COUNTDOWN';
    this.countdown = 3;
    this.countdownTimer = 0;
    this.roundWinner = null;

    // Fixed symmetrical layout for 5 pucks per side
    // Player puck positions (bottom half, Y: 460 - 580)
    const playerPositions = [
      { x: CENTER_X - 90, y: 460 },
      { x: CENTER_X + 90, y: 460 },
      { x: CENTER_X, y: 510 },
      { x: CENTER_X - 60, y: 560 },
      { x: CENTER_X + 60, y: 560 }
    ];

    // Opponent puck positions (top half, mirrored across CENTER_Y = 360)
    const opponentPositions = playerPositions.map(pos => ({
      x: pos.x,
      y: TABLE_HEIGHT - pos.y
    }));

    // In online PvP:
    // Host starting pucks are IDs 1-5 (Black).
    // Guest starting pucks are IDs 6-10 (Red).
    const isGuest = role === 'guest';
    const playerIds = isGuest ? [6, 7, 8, 9, 10] : [1, 2, 3, 4, 5];
    const playerColor: 'black' | 'red' = isGuest ? 'red' : 'black';
    const opponentIds = isGuest ? [1, 2, 3, 4, 5] : [6, 7, 8, 9, 10];
    const opponentColor: 'black' | 'red' = isGuest ? 'black' : 'red';

    // Add Player pucks (bottom)
    for (let i = 0; i < playerPositions.length; i++) {
      const pos = playerPositions[i];
      this.pucks.push({
        id: playerIds[i],
        x: pos.x,
        y: pos.y,
        prevX: pos.x,
        prevY: pos.y,
        vx: 0,
        vy: 0,
        radius: PUCK_RADIUS,
        owner: 'player',
        color: playerColor
      });
    }

    // Add Opponent pucks (top)
    for (let i = 0; i < opponentPositions.length; i++) {
      const pos = opponentPositions[i];
      this.pucks.push({
        id: opponentIds[i],
        x: pos.x,
        y: pos.y,
        prevX: pos.x,
        prevY: pos.y,
        vx: 0,
        vy: 0,
        radius: PUCK_RADIUS,
        owner: 'opponent',
        color: opponentColor
      });
    }
  }

  public getPlayerPuckCount(): number {
    return this.pucks.filter(p => p.y >= CENTER_Y).length;
  }

  public getOpponentPuckCount(): number {
    return this.pucks.filter(p => p.y < CENTER_Y).length;
  }

  public update(
    dtSec: number,
    onPuckCollision?: (p1: Puck, p2: Puck, speed: number) => void,
    onCushionBounce?: (puck: Puck, speed: number) => void,
    onGatePass?: (puck: Puck) => void
  ) {
    // 1. Handle Countdown
    if (this.phase === 'COUNTDOWN') {
      this.countdownTimer += dtSec;
      if (this.countdownTimer >= 1.0) {
        this.countdownTimer = 0;
        this.countdown -= 1;
        if (this.countdown <= 0) {
          this.phase = 'PLAYING';
        }
      }
      return;
    }

    if (this.phase !== 'PLAYING' && this.phase !== 'MATCH_OVER') return;

    // Store previous coordinates for sub-tick render interpolation
    for (const p of this.pucks) {
      p.prevX = p.x;
      p.prevY = p.y;
    }

    // 2. Physics update
    SlingPhysics.update(
      this.pucks,
      dtSec,
      4,
      onPuckCollision,
      onCushionBounce,
      puck => {
        if (onGatePass) onGatePass(puck);
        if (this.onPuckCrossedGate) {
          this.onPuckCrossedGate(puck, puck.owner);
        }
      },
      this.playerBand,
      this.opponentBand
    );

    // 3. Elastic band vibrations
    SlingPhysics.updateBandVibration(this.playerBand, dtSec);
    SlingPhysics.updateBandVibration(this.opponentBand, dtSec);

    // 4. Win condition check (only while active playing)
    if (this.phase === 'PLAYING') {
      const playerPucks = this.getPlayerPuckCount();
      const opponentPucks = this.getOpponentPuckCount();

      if (playerPucks === 0 && opponentPucks > 0) {
        this.handleRoundVictory('player');
      } else if (opponentPucks === 0 && playerPucks > 0) {
        this.handleRoundVictory('opponent');
      }
    }
  }

  private handleRoundVictory(winner: PlayerSide) {
    this.phase = 'MATCH_OVER';
    this.roundWinner = winner;
    this.matchWinner = winner;

    if (winner === 'player') {
      this.playerScore += 1;
    } else {
      this.opponentScore += 1;
    }

    if (this.onMatchOver) {
      this.onMatchOver(winner);
    }
  }

  public resetMatch(role: 'host' | 'guest' | null = 'host') {
    this.playerScore = 0;
    this.opponentScore = 0;
    this.matchWinner = null;
    this.setupRound(Date.now(), role);
  }
}
