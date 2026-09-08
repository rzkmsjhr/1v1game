import {
  BALL_DEFS,
  BALL_RADIUS,
  FOOT_SPOT_X,
  FOOT_SPOT_Y,
  HEAD_STRING_X,
  CENTER_Y,
  PLAY_X_MIN,
  PLAY_X_MAX,
  PLAY_Y_MIN,
  PLAY_Y_MAX,
  get8BallRack,
  get9BallRack,
  getLaggingBalls
} from './pool-constants';
import { PoolBall, PoolPhysics } from './pool-physics';

export type MatchPhase = 'LAGGING' | 'LAG_RESULT' | 'PLAYING' | 'BALL_IN_HAND' | 'GAME_OVER';
export type PlayerId = 'player' | 'opponent';
export type BallGroup = 'solid' | 'stripe' | null;
export type GameVariant = '8ball' | '9ball';

export interface LagResult {
  winner: PlayerId;
  playerDist: number; // distance to head cushion in pixels
  opponentDist: number;
  playerDisqualified: boolean;
  opponentDisqualified: boolean;
  reason: string;
}

export interface ShotResult {
  foul: boolean;
  foulReason?: string;
  pottedBalls: number[];
  winner?: PlayerId;
  loser?: PlayerId;
  turnContinues: boolean;
}

export class PoolEngine {
  public variant: GameVariant;
  public phase: MatchPhase = 'LAGGING';
  public currentTurn: PlayerId = 'player';
  public balls: PoolBall[] = [];

  // 8-Ball specific group assignments
  public playerGroup: BallGroup = null;
  public opponentGroup: BallGroup = null;

  // Shot tracking
  public isSimulating: boolean = false;
  public isBreakShot: boolean = false;
  public ballInHandKitchenOnly: boolean = false;
  public firstBallHitId: number | null = null;
  public cushionHitAfterContact: boolean = false;
  public pottedBallsThisShot: number[] = [];
  public didScratch: boolean = false;

  // Lagging evaluation
  public lagResult: LagResult | null = null;
  public playerLagShotDone: boolean = false;
  public opponentLagShotDone: boolean = false;
  public playerLagHitFarRail: boolean = false;
  public opponentLagHitFarRail: boolean = false;
  public playerLagDisqualified: boolean = false;
  public opponentLagDisqualified: boolean = false;

  // Match statistics & scores
  public winner: PlayerId | null = null;
  public gameOverReason: string = '';
  public ballsPocketedByPlayer: number[] = [];
  public ballsPocketedByOpponent: number[] = [];

  constructor(variant: GameVariant = '8ball') {
    this.variant = variant;
    this.setupLagging();
  }

  public setupLagging() {
    this.phase = 'LAGGING';
    this.isBreakShot = false;
    this.ballInHandKitchenOnly = false;
    this.balls = [];
    this.lagResult = null;
    this.playerLagShotDone = false;
    this.opponentLagShotDone = false;
    this.playerLagHitFarRail = false;
    this.opponentLagHitFarRail = false;
    this.playerLagDisqualified = false;
    this.opponentLagDisqualified = false;

    const lagDefs = getLaggingBalls();
    for (const d of lagDefs) {
      this.balls.push({
        id: d.id,
        x: d.x,
        y: d.y,
        vx: 0,
        vy: 0,
        radius: BALL_RADIUS,
        isPotted: false,
        isSinking: false,
        pottedAnimProgress: 0,
        isCue: true,
        isPlayerLag: d.isPlayer
      });
    }
  }

  // Execute lag shot for player or opponent
  public shootLagBall(isPlayer: boolean, power: number) {
    const ball = this.balls.find(b => b.isPlayerLag === isPlayer);
    if (!ball) return;

    // Shot travels horizontally down the table towards the foot cushion (x: 836)
    // Speed mapped from power (0 to 1) -> 8 to 28 px/frame
    const speed = 7 + power * 22;
    ball.vx = speed;
    ball.vy = 0; // Pure horizontal trajectory ensures 100% deterministic lag distance across peers

    if (isPlayer) this.playerLagShotDone = true;
    else this.opponentLagShotDone = true;

    this.isSimulating = true;
  }

  // Initialize match table after lagging decision
  public setupMatchTable(breaker: PlayerId) {
    this.phase = 'BALL_IN_HAND';
    this.isBreakShot = true;
    this.ballInHandKitchenOnly = true;
    this.currentTurn = breaker;
    this.playerGroup = null;
    this.opponentGroup = null;
    this.ballsPocketedByPlayer = [];
    this.ballsPocketedByOpponent = [];
    this.winner = null;
    this.gameOverReason = '';
    this.balls = [];

    // 1. Place Cue Ball in kitchen (behind head string)
    this.balls.push({
      id: 0,
      x: HEAD_STRING_X - BALL_RADIUS - 1,
      y: CENTER_Y,
      vx: 0,
      vy: 0,
      radius: BALL_RADIUS,
      isPotted: false,
      isSinking: false,
      pottedAnimProgress: 0,
      isCue: true
    });

    // 2. Rack object balls
    const rack = this.variant === '8ball' ? get8BallRack() : get9BallRack();
    for (const r of rack) {
      this.balls.push({
        id: r.id,
        x: r.x,
        y: r.y,
        vx: 0,
        vy: 0,
        radius: BALL_RADIUS,
        isPotted: false,
        isSinking: false,
        pottedAnimProgress: 0,
        isCue: false
      });
    }
  }

  public getCueBall(): PoolBall | null {
    return this.balls.find(b => b.id === 0 && !b.isPotted) || null;
  }

  // Shoot cue ball with given angle and power (0.0 to 1.0)
  public shoot(angle: number, power: number): boolean {
    if (this.isSimulating || this.phase === 'GAME_OVER') return false;

    const cue = this.getCueBall();
    if (!cue) return false;

    // Reset shot telemetry
    this.firstBallHitId = null;
    this.cushionHitAfterContact = false;
    this.pottedBallsThisShot = [];
    this.didScratch = false;

    // Apply impulse: 0.1 to 1.0 power translates to 4 to 32 speed
    const speed = 3.5 + power * 29;
    cue.vx = Math.cos(angle) * speed;
    cue.vy = Math.sin(angle) * speed;

    this.isSimulating = true;
    return true;
  }

  // Update physics simulation frame
  public update(
    onBallCollision?: (b1: PoolBall, b2: PoolBall, speed: number) => void,
    onCushionCollision?: (b: PoolBall, speed: number) => void,
    onBallPotted?: (b: PoolBall, pocketId: string) => void
  ) {
    if (!this.isSimulating) return;

    PoolPhysics.update(
      this.balls,
      8,
      (b1, b2, speed) => {
        // Track cue ball first contact
        if (this.firstBallHitId === null) {
          if (b1.isCue && !b2.isCue) this.firstBallHitId = b2.id;
          else if (b2.isCue && !b1.isCue) this.firstBallHitId = b1.id;
        }
        if (onBallCollision) onBallCollision(b1, b2, speed);
      },
      (ball, speed) => {
        // Track cushion hit after ball contact
        if (this.firstBallHitId !== null) {
          this.cushionHitAfterContact = true;
        }

        // Track lag far rail bounce
        if (this.phase === 'LAGGING') {
          if (ball.x + ball.radius >= PLAY_X_MAX - 3) {
            if (ball.isPlayerLag) this.playerLagHitFarRail = true;
            else this.opponentLagHitFarRail = true;
          }
        }

        if (onCushionCollision) onCushionCollision(ball, speed);
      },
      (ball, pocketId) => {
        if (ball.isCue) {
          this.didScratch = true;
          if (this.phase === 'LAGGING') {
            if (ball.isPlayerLag) this.playerLagDisqualified = true;
            else this.opponentLagDisqualified = true;
          }
        } else {
          this.pottedBallsThisShot.push(ball.id);
        }
        if (onBallPotted) onBallPotted(ball, pocketId);
      }
    );

    // Check if motion has settled
    if (PoolPhysics.areAllBallsSettled(this.balls)) {
      this.isSimulating = false;
      this.handleMotionSettled();
    }
  }

  private handleMotionSettled() {
    if (this.phase === 'LAGGING') {
      // Both players must complete their lag shot before evaluating winner/disqualifications
      if (!this.playerLagShotDone || !this.opponentLagShotDone) {
        return;
      }
      this.evaluateLag();
    } else if (this.phase === 'PLAYING') {
      this.evaluateShot();
    }
  }

  // -------------------------------------------------------------
  // LAGGING EVALUATION
  // -------------------------------------------------------------
  private evaluateLag() {
    const pBall = this.balls.find(b => b.isPlayerLag === true);
    const oBall = this.balls.find(b => b.isPlayerLag === false);

    if (!pBall || !oBall) return;

    // Disqualify if ball didn't reach far rail
    if (!this.playerLagHitFarRail) this.playerLagDisqualified = true;
    if (!this.opponentLagHitFarRail) this.opponentLagDisqualified = true;

    // Disqualify if crossed table center divider
    if (pBall.y < CENTER_Y) this.playerLagDisqualified = true;
    if (oBall.y > CENTER_Y) this.opponentLagDisqualified = true;

    // Distance to head cushion (PLAY_X_MIN: 36)
    const pDist = Math.max(0, pBall.x - pBall.radius - PLAY_X_MIN);
    const oDist = Math.max(0, oBall.x - oBall.radius - PLAY_X_MIN);

    let winner: PlayerId = 'player';
    let reason = '';

    if (this.playerLagDisqualified && !this.opponentLagDisqualified) {
      winner = 'opponent';
      reason = 'Player fouled or missed the far rail on lag.';
    } else if (this.opponentLagDisqualified && !this.playerLagDisqualified) {
      winner = 'player';
      reason = 'Opponent fouled on lag.';
    } else if (this.playerLagDisqualified && this.opponentLagDisqualified) {
      // Re-lag
      this.setupLagging();
      return;
    } else if (Math.abs(pDist - oDist) < 0.5) {
      // Tie distance (within 0.5px / ~1mm) - Re-lag per official BCA/WPA rules
      this.setupLagging();
      return;
    } else {
      // Closest to head cushion wins!
      winner = pDist < oDist ? 'player' : 'opponent';
      const pCm = (pDist * 0.25).toFixed(1);
      const oCm = (oDist * 0.25).toFixed(1);
      reason = winner === 'player'
        ? `You were closer to the rail (${pCm}cm vs ${oCm}cm)!`
        : `Opponent was closer to the rail (${oCm}cm vs ${pCm}cm).`;
    }

    this.lagResult = {
      winner,
      playerDist: pDist,
      opponentDist: oDist,
      playerDisqualified: this.playerLagDisqualified,
      opponentDisqualified: this.opponentLagDisqualified,
      reason
    };

    this.phase = 'LAG_RESULT';
  }

  // -------------------------------------------------------------
  // REGULAR SHOT EVALUATION (8-BALL & 9-BALL)
  // -------------------------------------------------------------
  private evaluateShot() {
    let foul = false;
    let foulReason = '';
    let turnContinues = false;

    // 1. Scratch check
    if (this.didScratch) {
      foul = true;
      foulReason = 'Scratch (cue ball pocketed)!';
    }

    // 2. Check first contact
    if (!foul && this.firstBallHitId === null) {
      foul = true;
      foulReason = 'Foul: No ball contacted!';
    }

    if (this.variant === '8ball') {
      const eval8 = this.evaluate8BallShot(foul, foulReason);
      if (eval8.gameOver) return;
      foul = eval8.foul;
      foulReason = eval8.foulReason;
      turnContinues = eval8.turnContinues;
    } else {
      const eval9 = this.evaluate9BallShot(foul, foulReason);
      if (eval9.gameOver) return;
      foul = eval9.foul;
      foulReason = eval9.foulReason;
      turnContinues = eval9.turnContinues;
    }

    // Handle Foul or Turn Transition
    if (foul) {
      // Switch turn with ball in hand
      this.currentTurn = this.currentTurn === 'player' ? 'opponent' : 'player';
      this.respawnCueBall();
      this.phase = 'BALL_IN_HAND';
      // In 8-ball, scratch on break gives ball in hand behind head string
      if (this.isBreakShot && this.didScratch) {
        this.ballInHandKitchenOnly = true;
      } else {
        this.ballInHandKitchenOnly = false;
      }
    } else if (turnContinues) {
      // Active player stays on table
      this.phase = 'PLAYING';
      this.ballInHandKitchenOnly = false;
    } else {
      // Turn passes normally to other player
      this.currentTurn = this.currentTurn === 'player' ? 'opponent' : 'player';
      this.phase = 'PLAYING';
      this.ballInHandKitchenOnly = false;
    }

    this.isBreakShot = false;
  }

  private evaluate8BallShot(initialFoul: boolean, initialReason: string) {
    let foul = initialFoul;
    let foulReason = initialReason;
    let turnContinues = false;

    const is8BallPotted = this.pottedBallsThisShot.includes(8);
    const activePlayer = this.currentTurn;
    const activeGroup = activePlayer === 'player' ? this.playerGroup : this.opponentGroup;

    // Remaining group balls BEFORE this shot was taken (including any balls potted on this shot)
    const remainingGroupBallsBeforeShot = activeGroup
      ? this.balls.filter(
          b => !b.isCue && BALL_DEFS[b.id]?.type === activeGroup && (!b.isPotted || this.pottedBallsThisShot.includes(b.id))
        )
      : [];

    // 8-Ball pocketed
    if (is8BallPotted) {
      if (remainingGroupBallsBeforeShot.length === 0 && !foul) {
        // Legally pocketed 8-ball -> Victory!
        this.winner = activePlayer;
        this.gameOverReason = `${activePlayer === 'player' ? 'You' : 'Opponent'} legally pocketed the 8-Ball!`;
      } else {
        // Early 8-ball (still had group balls when shot began) or scratched on 8-ball -> Loss!
        this.winner = activePlayer === 'player' ? 'opponent' : 'player';
        this.gameOverReason = `${activePlayer === 'player' ? 'You' : 'Opponent'} illegally pocketed the 8-Ball!`;
      }
      this.phase = 'GAME_OVER';
      return { foul, foulReason, turnContinues, gameOver: true };
    }

    // First contact check
    if (!foul && this.firstBallHitId !== null) {
      if (activeGroup === null) {
        // On open table, hitting 8-ball first is a foul
        if (this.firstBallHitId === 8) {
          foul = true;
          foulReason = 'Foul: Cannot hit the 8-Ball first on an open table!';
        }
      } else {
        const firstHitDef = BALL_DEFS[this.firstBallHitId];
        if (remainingGroupBallsBeforeShot.length > 0) {
          if (firstHitDef.type !== activeGroup) {
            foul = true;
            foulReason = `Foul: Did not hit your own group (${activeGroup}) first!`;
          }
        } else {
          // Can hit 8-ball directly once all group balls were cleared before this shot
          if (this.firstBallHitId !== 8) {
            foul = true;
            foulReason = 'Foul: Must hit the 8-Ball first!';
          }
        }
      }
    }

    // Assign groups if open table (official rules: table remains open after break shot)
    if (!foul && !this.isBreakShot && this.playerGroup === null && this.pottedBallsThisShot.length > 0) {
      const firstPotted = this.pottedBallsThisShot[0];
      const pDef = BALL_DEFS[firstPotted];
      if (pDef.type === 'solid' || pDef.type === 'stripe') {
        if (activePlayer === 'player') {
          this.playerGroup = pDef.type;
          this.opponentGroup = pDef.type === 'solid' ? 'stripe' : 'solid';
        } else {
          this.opponentGroup = pDef.type;
          this.playerGroup = pDef.type === 'solid' ? 'stripe' : 'solid';
        }
      }
    }

    // Determine if turn continues
    if (!foul && this.pottedBallsThisShot.length > 0) {
      if (activeGroup === null) {
        turnContinues = true;
      } else {
        const hasPottedOwn = this.pottedBallsThisShot.some(id => BALL_DEFS[id]?.type === activeGroup);
        if (hasPottedOwn) turnContinues = true;
      }
    }

    // Record pocketed balls
    if (activePlayer === 'player') {
      this.ballsPocketedByPlayer.push(...this.pottedBallsThisShot);
    } else {
      this.ballsPocketedByOpponent.push(...this.pottedBallsThisShot);
    }

    return { foul, foulReason, turnContinues, gameOver: false };
  }

  private evaluate9BallShot(initialFoul: boolean, initialReason: string) {
    let foul = initialFoul;
    let foulReason = initialReason;
    let turnContinues = false;

    // Lowest numbered ball on table BEFORE this shot was struck
    let lowestBallId = 9;
    for (const b of this.balls) {
      if (!b.isCue && (!b.isPotted || this.pottedBallsThisShot.includes(b.id)) && b.id < lowestBallId) {
        lowestBallId = b.id;
      }
    }

    // 9-ball pocketed
    const is9Potted = this.pottedBallsThisShot.includes(9);

    if (!foul && this.firstBallHitId !== lowestBallId) {
      foul = true;
      foulReason = `Foul: Must hit the lowest ball (${lowestBallId}) first!`;
    }

    if (is9Potted) {
      if (!foul) {
        // Legal 9-ball pocketed -> Win!
        this.winner = this.currentTurn;
        this.gameOverReason = `${this.currentTurn === 'player' ? 'You' : 'Opponent'} legally pocketed the 9-Ball!`;
        this.phase = 'GAME_OVER';
        return { foul, foulReason, turnContinues, gameOver: true };
      } else {
        // Respot 9-ball on foot spot if pocketed on foul
        const b9 = this.balls.find(b => b.id === 9);
        if (b9) {
          b9.isPotted = false;
          b9.isSinking = false;
          b9.x = FOOT_SPOT_X;
          b9.y = FOOT_SPOT_Y;
          b9.vx = 0;
          b9.vy = 0;
        }
      }
    }

    if (!foul && this.pottedBallsThisShot.length > 0) {
      turnContinues = true;
    }

    return { foul, foulReason, turnContinues, gameOver: false };
  }

  public getLowestBallOnTable(): number {
    let lowest = 9;
    for (const b of this.balls) {
      if (!b.isCue && !b.isPotted && b.id < lowest) {
        lowest = b.id;
      }
    }
    return lowest;
  }

  public getRemainingGroupBalls(group: BallGroup): PoolBall[] {
    if (!group) return [];
    return this.balls.filter(b => !b.isCue && !b.isPotted && BALL_DEFS[b.id]?.type === group);
  }

  // Respawn cue ball for Ball-in-Hand
  public respawnCueBall() {
    let cue = this.balls.find(b => b.id === 0);
    if (!cue) {
      cue = {
        id: 0,
        x: HEAD_STRING_X,
        y: CENTER_Y,
        vx: 0,
        vy: 0,
        radius: BALL_RADIUS,
        isPotted: false,
        isSinking: false,
        pottedAnimProgress: 0,
        isCue: true
      };
      this.balls.unshift(cue);
    } else {
      cue.isPotted = false;
      cue.isSinking = false;
      cue.vx = 0;
      cue.vy = 0;
      cue.x = HEAD_STRING_X;
      cue.y = CENTER_Y;
    }

    // Ensure spawn position does not overlap with any existing object ball
    let spawnX = HEAD_STRING_X;
    let spawnY = CENTER_Y;
    let offset = 0;
    while (offset < 250) {
      const collides = this.balls.some(
        b => b.id !== 0 && !b.isPotted && Math.hypot(b.x - spawnX, b.y - spawnY) < BALL_RADIUS * 2 + 3
      );
      if (!collides) break;
      offset += 16;
      spawnX = HEAD_STRING_X - offset;
      if (spawnX < PLAY_X_MIN + BALL_RADIUS * 2) {
        spawnX = HEAD_STRING_X;
        spawnY = CENTER_Y + offset;
      }
    }
    cue.x = spawnX;
    cue.y = spawnY;
  }

  // Place cue ball during Ball-in-Hand
  public placeCueBall(x: number, y: number): boolean {
    if (this.phase !== 'BALL_IN_HAND') return false;

    // Bounds checking
    const r = BALL_RADIUS;
    const maxX = this.ballInHandKitchenOnly ? (HEAD_STRING_X - r) : (PLAY_X_MAX - r);
    const clampedX = Math.max(PLAY_X_MIN + r, Math.min(x, maxX));
    const clampedY = Math.max(PLAY_Y_MIN + r, Math.min(y, PLAY_Y_MAX - r));

    // Ensure no overlap with other object balls
    for (const b of this.balls) {
      if (b.id === 0 || b.isPotted) continue;
      const dist = Math.hypot(clampedX - b.x, clampedY - b.y);
      if (dist < r * 2 + 1) return false;
    }

    const cue = this.getCueBall();
    if (cue) {
      cue.x = clampedX;
      cue.y = clampedY;
      cue.vx = 0;
      cue.vy = 0;
    }
    return true;
  }

  public confirmBallInHand() {
    if (this.phase === 'BALL_IN_HAND') {
      this.phase = 'PLAYING';
    }
  }

  // Reconcile ball positions and game state from peer authoritative broadcast
  public syncTableState(data: {
    balls: Array<{ id: number; x: number; y: number; isPotted: boolean; isSinking: boolean }>;
    currentTurn?: PlayerId;
    playerGroup?: BallGroup;
    opponentGroup?: BallGroup;
    phase?: MatchPhase;
    winner?: PlayerId | null;
  }) {
    if (!data.balls) return;
    for (const bData of data.balls) {
      const existing = this.balls.find(b => b.id === bData.id);
      if (existing) {
        existing.x = bData.x;
        existing.y = bData.y;
        existing.isPotted = bData.isPotted;
        existing.isSinking = bData.isSinking;
        existing.vx = 0;
        existing.vy = 0;
      }
    }
    if (data.currentTurn) this.currentTurn = data.currentTurn;
    if (data.playerGroup !== undefined) this.playerGroup = data.playerGroup;
    if (data.opponentGroup !== undefined) this.opponentGroup = data.opponentGroup;
    if (data.phase && this.phase !== 'GAME_OVER') this.phase = data.phase;
    if (data.winner !== undefined) this.winner = data.winner;
    this.isSimulating = false;
  }
}
