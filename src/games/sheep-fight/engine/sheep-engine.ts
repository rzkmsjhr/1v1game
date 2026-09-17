import type { ActiveSheep, LaneState, SheepFightState, SheepSide, SheepSize } from '../sheep-types';
import { SHEEP_MODELS } from '../sheep-types';
import { SHEEP_CONSTANTS } from '../sheep-constants';

export interface SheepEngineCallbacks {
  onClash?: (laneIndex: number, x: number, y: number) => void;
  onLaneWin?: (laneIndex: number, winner: SheepSide) => void;
  onLaneDraw?: (laneIndex: number) => void;
  onSuddenDeath?: () => void;
  onMatchEnd?: (winner: SheepSide | 'draw') => void;
}

export class SheepEngine {
  public state: SheepFightState;
  private callbacks: SheepEngineCallbacks;
  private nextId: number = 1;

  constructor(callbacks: SheepEngineCallbacks = {}) {
    this.callbacks = callbacks;
    this.state = this.createInitialState();
  }

  public reset() {
    this.state = this.createInitialState();
  }

  private createInitialState(): SheepFightState {
    const lanes: LaneState[] = [];
    for (let i = 0; i < SHEEP_CONSTANTS.NUM_LANES; i++) {
      lanes.push({
        index: i,
        status: 'active',
        sheep: [],
        playerStrength: 0,
        opponentStrength: 0,
        isPlayerStartBlocked: false,
        isOpponentStartBlocked: false,
        clashY: null
      });
    }

    return {
      lanes,
      playerScore: 0,
      opponentScore: 0,
      drawLanesCount: 0,
      isSuddenDeath: false,
      winner: null,
      playerQueue: [this.rollRandomSheep(), this.rollRandomSheep(), this.rollRandomSheep()],
      opponentQueue: [this.rollRandomSheep(), this.rollRandomSheep(), this.rollRandomSheep()],
      playerCooldown: 0,
      opponentCooldown: 0
    };
  }

  /**
   * Probability-weighted random sheep generator:
   * Small (35%), Medium (35%), Big (20%), Giant (10%)
   */
  public rollRandomSheep(): SheepSize {
    const r = Math.random();
    if (r < 0.35) return 'small';
    if (r < 0.70) return 'medium';
    if (r < 0.90) return 'big';
    return 'giant';
  }

  /**
   * Checks if player or opponent can deploy into a specific lane
   */
  public canDeploy(laneIndex: number, side: SheepSide): boolean {
    if (this.state.winner !== null) return false;
    if (laneIndex < 0 || laneIndex >= SHEEP_CONSTANTS.NUM_LANES) return false;

    const lane = this.state.lanes[laneIndex];
    if (lane.status !== 'active') return false;

    const cooldown = side === 'player' ? this.state.playerCooldown : this.state.opponentCooldown;
    if (cooldown > 0.05) return false;

    // Check start space clearance
    if (side === 'player' && lane.isPlayerStartBlocked) return false;
    if (side === 'opponent' && lane.isOpponentStartBlocked) return false;

    return true;
  }

  /**
   * Deploys the current front sheep from the side's queue into the lane
   */
  public deploySheep(laneIndex: number, side: SheepSide, forcedSize?: SheepSize, forcedId?: string): boolean {
    if (!this.canDeploy(laneIndex, side)) return false;

    const queue = side === 'player' ? this.state.playerQueue : this.state.opponentQueue;
    const size = forcedSize || queue[0];

    // Pop from queue and roll next random sheep
    queue.shift();
    queue.push(this.rollRandomSheep());

    // Reset cooldown
    if (side === 'player') {
      this.state.playerCooldown = SHEEP_CONSTANTS.SPAWN_COOLDOWN;
    } else {
      this.state.opponentCooldown = SHEEP_CONSTANTS.SPAWN_COOLDOWN;
    }

    const def = SHEEP_MODELS[size];
    const lane = this.state.lanes[laneIndex];
    const id = forcedId || `${side}-${laneIndex}-${this.nextId++}`;

    // Calculate spawn Y right at the respective start line
    const spawnY = side === 'player'
      ? SHEEP_CONSTANTS.LANE_BOTTOM_Y - def.radius - 6
      : SHEEP_CONSTANTS.LANE_TOP_Y + def.radius + 6;

    const sheep: ActiveSheep = {
      id,
      size,
      side,
      laneIndex,
      y: spawnY,
      walkCycle: 0,
      isPushing: false,
      pushStrain: 0
    };

    lane.sheep.push(sheep);
    this.updateStartSpaceBlocked(lane);
    return true;
  }

  /**
   * Checks whether the start spaces of a lane are blocked by existing sheep
   */
  private updateStartSpaceBlocked(lane: LaneState) {
    let playerBlocked = false;
    let opponentBlocked = false;

    const pClearY = SHEEP_CONSTANTS.LANE_BOTTOM_Y - SHEEP_CONSTANTS.START_SPACE_DEPTH;
    const oClearY = SHEEP_CONSTANTS.LANE_TOP_Y + SHEEP_CONSTANTS.START_SPACE_DEPTH;

    for (const s of lane.sheep) {
      const r = SHEEP_MODELS[s.size].radius;
      // If sheep occupies the player deployment zone
      if (s.y + r >= pClearY) {
        playerBlocked = true;
      }
      // If sheep occupies the opponent deployment zone
      if (s.y - r <= oClearY) {
        opponentBlocked = true;
      }
    }

    lane.isPlayerStartBlocked = playerBlocked;
    lane.isOpponentStartBlocked = opponentBlocked;
  }

  /**
   * Main simulation step (dt in seconds)
   */
  public update(dt: number) {
    if (this.state.winner !== null) return;

    // 1. Tick Cooldowns
    if (this.state.playerCooldown > 0) {
      this.state.playerCooldown = Math.max(0, this.state.playerCooldown - dt);
    }
    if (this.state.opponentCooldown > 0) {
      this.state.opponentCooldown = Math.max(0, this.state.opponentCooldown - dt);
    }

    // 2. Update each lane
    for (const lane of this.state.lanes) {
      if (lane.status !== 'active') continue;
      this.updateLane(lane, dt);
    }

    // 3. Check Overall Match Status
    this.checkMatchConditions();
  }

  /**
   * Physics & collision logic for a single lane
   */
  private updateLane(lane: LaneState, dt: number) {
    const marchSpeed = SHEEP_CONSTANTS.MARCH_SPEED;
    const pushSpeed = SHEEP_CONSTANTS.PUSH_SPEED;

    // Separate player and opponent sheep
    // Player sheep move UP (y decreases), sorted by y ascending (index 0 is front-runner)
    const playerSheep = lane.sheep
      .filter(s => s.side === 'player')
      .sort((a, b) => a.y - b.y);

    // Opponent sheep move DOWN (y increases), sorted by y descending (index 0 is front-runner)
    const opponentSheep = lane.sheep
      .filter(s => s.side === 'opponent')
      .sort((a, b) => b.y - a.y);

    // Advance walk animations
    for (const s of lane.sheep) {
      s.walkCycle += dt * 7;
      s.isPushing = false;
      s.pushStrain = 0;
    }

    // CASE A: Only Player sheep exist in this lane
    if (playerSheep.length > 0 && opponentSheep.length === 0) {
      lane.clashY = null;
      lane.playerStrength = playerSheep.reduce((sum, s) => sum + SHEEP_MODELS[s.size].strength, 0);
      lane.opponentStrength = 0;

      // Front runner marches freely North
      playerSheep[0].y -= marchSpeed * dt;

      // Trailing friendly sheep follow and stack
      for (let i = 1; i < playerSheep.length; i++) {
        const leader = playerSheep[i - 1];
        const follower = playerSheep[i];
        const minDist = SHEEP_MODELS[leader.size].radius + SHEEP_MODELS[follower.size].radius + 2;

        follower.y -= marchSpeed * dt;
        if (follower.y - leader.y < minDist) {
          follower.y = leader.y + minDist;
        }
      }

      // Check if Player front sheep crosses opponent goal line
      if (playerSheep[0].y - SHEEP_MODELS[playerSheep[0].size].radius <= SHEEP_CONSTANTS.LANE_TOP_Y) {
        this.finishLane(lane, 'won_player');
        return;
      }

      this.updateStartSpaceBlocked(lane);
      return;
    }

    // CASE B: Only Opponent sheep exist in this lane
    if (opponentSheep.length > 0 && playerSheep.length === 0) {
      lane.clashY = null;
      lane.opponentStrength = opponentSheep.reduce((sum, s) => sum + SHEEP_MODELS[s.size].strength, 0);
      lane.playerStrength = 0;

      // Front runner marches freely South
      opponentSheep[0].y += marchSpeed * dt;

      // Trailing friendly sheep follow and stack
      for (let i = 1; i < opponentSheep.length; i++) {
        const leader = opponentSheep[i - 1];
        const follower = opponentSheep[i];
        const minDist = SHEEP_MODELS[leader.size].radius + SHEEP_MODELS[follower.size].radius + 2;

        follower.y += marchSpeed * dt;
        if (leader.y - follower.y < minDist) {
          follower.y = leader.y - minDist;
        }
      }

      // Check if Opponent front sheep crosses player goal line
      if (opponentSheep[0].y + SHEEP_MODELS[opponentSheep[0].size].radius >= SHEEP_CONSTANTS.LANE_BOTTOM_Y) {
        this.finishLane(lane, 'won_opponent');
        return;
      }

      this.updateStartSpaceBlocked(lane);
      return;
    }

    // CASE C: Both sides have sheep in this lane!
    if (playerSheep.length > 0 && opponentSheep.length > 0) {
      const pFront = playerSheep[0];
      const oFront = opponentSheep[0];
      const clashDist = SHEEP_MODELS[pFront.size].radius + SHEEP_MODELS[oFront.size].radius + 2;

      // Check if they have met yet
      if (pFront.y - oFront.y > clashDist) {
        // Not clashing yet! Both sides march forward freely
        lane.clashY = null;
        lane.playerStrength = 0;
        lane.opponentStrength = 0;

        pFront.y -= marchSpeed * dt;
        for (let i = 1; i < playerSheep.length; i++) {
          const leader = playerSheep[i - 1];
          const follower = playerSheep[i];
          const minDist = SHEEP_MODELS[leader.size].radius + SHEEP_MODELS[follower.size].radius + 2;
          follower.y -= marchSpeed * dt;
          if (follower.y - leader.y < minDist) follower.y = leader.y + minDist;
        }

        oFront.y += marchSpeed * dt;
        for (let i = 1; i < opponentSheep.length; i++) {
          const leader = opponentSheep[i - 1];
          const follower = opponentSheep[i];
          const minDist = SHEEP_MODELS[leader.size].radius + SHEEP_MODELS[follower.size].radius + 2;
          follower.y += marchSpeed * dt;
          if (leader.y - follower.y < minDist) follower.y = leader.y - minDist;
        }

        this.updateStartSpaceBlocked(lane);
        return;
      }

      // =====================================================================
      // HEADBUTT CLASH ACTIVE!
      // =====================================================================
      const wasClashing = lane.clashY !== null;

      // 1. Clamp heads at contact distance
      const midY = (pFront.y + oFront.y) / 2;
      pFront.y = midY + clashDist / 2;
      oFront.y = midY - clashDist / 2;
      lane.clashY = midY;

      // 2. Identify contiguous connected push chains & march trailing sheep smoothly
      const pChain: ActiveSheep[] = [pFront];
      let pChainIntact = true;
      for (let i = 1; i < playerSheep.length; i++) {
        const prev = playerSheep[i - 1];
        const curr = playerSheep[i];
        const touchDist = SHEEP_MODELS[prev.size].radius + SHEEP_MODELS[curr.size].radius + 2;

        if (pChainIntact && curr.y - prev.y <= touchDist + 2) {
          curr.y = prev.y + touchDist;
          pChain.push(curr);
        } else {
          pChainIntact = false;
          curr.y -= marchSpeed * dt;
          if (curr.y - prev.y <= touchDist) {
            curr.y = prev.y + touchDist;
            pChain.push(curr);
            pChainIntact = true;
          }
        }
      }

      const oChain: ActiveSheep[] = [oFront];
      let oChainIntact = true;
      for (let i = 1; i < opponentSheep.length; i++) {
        const prev = opponentSheep[i - 1];
        const curr = opponentSheep[i];
        const touchDist = SHEEP_MODELS[prev.size].radius + SHEEP_MODELS[curr.size].radius + 2;

        if (oChainIntact && prev.y - curr.y <= touchDist + 2) {
          curr.y = prev.y - touchDist;
          oChain.push(curr);
        } else {
          oChainIntact = false;
          curr.y += marchSpeed * dt;
          if (prev.y - curr.y <= touchDist) {
            curr.y = prev.y - touchDist;
            oChain.push(curr);
            oChainIntact = true;
          }
        }
      }

      // 3. Calculate total push forces of in-contact chains
      const fPlayer = pChain.reduce((sum, s) => sum + SHEEP_MODELS[s.size].strength, 0);
      const fOpponent = oChain.reduce((sum, s) => sum + SHEEP_MODELS[s.size].strength, 0);
      lane.playerStrength = fPlayer;
      lane.opponentStrength = fOpponent;

      // 4. Mark pushing & strain on all chain members
      const strain = Math.min(1.0, (fPlayer + fOpponent) / 10 + 0.3);
      for (const s of pChain) {
        s.isPushing = true;
        s.pushStrain = strain;
      }
      for (const s of oChain) {
        s.isPushing = true;
        s.pushStrain = strain;
      }

      // Only trigger onClash sound/event on initial impact, not every frame
      if (!wasClashing && this.callbacks.onClash) {
        this.callbacks.onClash(lane.index, 0, midY);
      }

      // 5. REQUIREMENT 6: Even pushing velocity!
      // When one side is stronger, the chain moves at a CONSTANT push speed (pushSpeed).
      // If equal strength, net speed is zero!
      let moveDelta = 0;
      if (fPlayer > fOpponent) {
        // Player pushes North (y decreases)
        moveDelta = -pushSpeed * dt;
      } else if (fOpponent > fPlayer) {
        // Opponent pushes South (y increases)
        moveDelta = pushSpeed * dt;
      }

      if (moveDelta !== 0) {
        for (const s of pChain) s.y += moveDelta;
        for (const s of oChain) s.y += moveDelta;
        lane.clashY = (pFront.y + oFront.y) / 2;
      }

      // 6. Check Goal Crossings
      if (pFront.y - SHEEP_MODELS[pFront.size].radius <= SHEEP_CONSTANTS.LANE_TOP_Y) {
        this.finishLane(lane, 'won_player');
        return;
      }
      if (oFront.y + SHEEP_MODELS[oFront.size].radius >= SHEEP_CONSTANTS.LANE_BOTTOM_Y) {
        this.finishLane(lane, 'won_opponent');
        return;
      }

      // 7. REQUIREMENT 3: LANE FULL DRAW RULE!
      // When the line is full with sheep from both sides such that neither player has start space
      // left to deploy, that lane is considered a DRAW!
      this.updateStartSpaceBlocked(lane);
      if (lane.isPlayerStartBlocked && lane.isOpponentStartBlocked) {
        this.finishLane(lane, 'draw');
        return;
      }
    }
  }

  /**
   * Finalizes an active lane into won_player, won_opponent, or draw
   */
  private finishLane(lane: LaneState, status: 'won_player' | 'won_opponent' | 'draw') {
    lane.status = status;
    lane.clashY = null;

    if (status === 'won_player') {
      this.state.playerScore++;
      if (this.callbacks.onLaneWin) this.callbacks.onLaneWin(lane.index, 'player');
    } else if (status === 'won_opponent') {
      this.state.opponentScore++;
      if (this.callbacks.onLaneWin) this.callbacks.onLaneWin(lane.index, 'opponent');
    } else if (status === 'draw') {
      this.state.drawLanesCount++;
      if (this.callbacks.onLaneDraw) this.callbacks.onLaneDraw(lane.index);
    }

    // REQUIREMENT 4: If 3 lanes are considered draw, the rest 2 lanes enter SUDDEN DEATH mode!
    if (this.state.drawLanesCount >= SHEEP_CONSTANTS.DRAW_LANES_FOR_SUDDEN_DEATH && !this.state.isSuddenDeath) {
      this.state.isSuddenDeath = true;
      if (this.callbacks.onSuddenDeath) this.callbacks.onSuddenDeath();
    }
  }

  /**
   * Evaluates overall match win or sudden death victory
   */
  private checkMatchConditions() {
    if (this.state.winner !== null) return;

    // Normal win: first to 3 lanes
    if (!this.state.isSuddenDeath) {
      if (this.state.playerScore >= SHEEP_CONSTANTS.LANES_TO_WIN) {
        this.state.winner = 'player';
        if (this.callbacks.onMatchEnd) this.callbacks.onMatchEnd('player');
        return;
      }
      if (this.state.opponentScore >= SHEEP_CONSTANTS.LANES_TO_WIN) {
        this.state.winner = 'opponent';
        if (this.callbacks.onMatchEnd) this.callbacks.onMatchEnd('opponent');
        return;
      }
    } else {
      // Sudden Death Mode:
      // The first player to win ANY active lane wins the match instantly!
      if (this.state.playerScore > this.state.opponentScore) {
        this.state.winner = 'player';
        if (this.callbacks.onMatchEnd) this.callbacks.onMatchEnd('player');
        return;
      }
      if (this.state.opponentScore > this.state.playerScore) {
        this.state.winner = 'opponent';
        if (this.callbacks.onMatchEnd) this.callbacks.onMatchEnd('opponent');
        return;
      }
    }

    // Check if all 5 lanes have concluded
    const allFinished = this.state.lanes.every(l => l.status !== 'active');
    if (allFinished) {
      if (this.state.playerScore > this.state.opponentScore) {
        this.state.winner = 'player';
      } else if (this.state.opponentScore > this.state.playerScore) {
        this.state.winner = 'opponent';
      } else {
        this.state.winner = 'draw';
      }
      if (this.callbacks.onMatchEnd) this.callbacks.onMatchEnd(this.state.winner);
    }
  }
}
