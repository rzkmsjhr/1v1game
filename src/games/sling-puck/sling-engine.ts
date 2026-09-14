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
  public setupRound(_seed: number = Date.now()) {
    this.pucks = [];
    this.phase = 'COUNTDOWN';
    this.countdown = 3;
    this.countdownTimer = 0;
    this.roundWinner = null;

    let nextId = 1;

    // Fixed symmetrical layout for 5 pucks per side
    // Player puck positions (Y: 460 - 580)
    const playerPositions = [
      { x: CENTER_X - 90, y: 460 },
      { x: CENTER_X + 90, y: 460 },
      { x: CENTER_X, y: 510 },
      { x: CENTER_X - 60, y: 560 },
      { x: CENTER_X + 60, y: 560 }
    ];

    // Opponent puck positions (mirrored across CENTER_Y = 360)
    const opponentPositions = playerPositions.map(pos => ({
      x: pos.x,
      y: TABLE_HEIGHT - pos.y
    }));

    // Add Player pucks
    for (const pos of playerPositions) {
      this.pucks.push({
        id: nextId++,
        x: pos.x,
        y: pos.y,
        prevX: pos.x,
        prevY: pos.y,
        vx: 0,
        vy: 0,
        radius: PUCK_RADIUS,
        owner: 'player'
      });
    }

    // Add Opponent pucks
    for (const pos of opponentPositions) {
      this.pucks.push({
        id: nextId++,
        x: pos.x,
        y: pos.y,
        prevX: pos.x,
        prevY: pos.y,
        vx: 0,
        vy: 0,
        radius: PUCK_RADIUS,
        owner: 'opponent'
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
      }
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

  public resetMatch() {
    this.playerScore = 0;
    this.opponentScore = 0;
    this.matchWinner = null;
    this.setupRound(Date.now());
  }
}
