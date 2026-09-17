import type { ActiveSheep, LaneState, LaneStatus, SheepFightState, SheepSide, SheepSize, SheepSyncSnapshot } from '../sheep-types';
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
  public isAuthoritative: boolean = true;
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
        clashY: null,
        deadlockTimer: 0
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
      pushStrain: 0,
      createdAt: performance.now()
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

    // Advance walk animations only for freely marching sheep (static when colliding)
    for (const s of lane.sheep) {
      if (!s.isPushing) {
        s.walkCycle += dt * 6.5;
      }
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
        if (!this.isAuthoritative) {
          playerSheep[0].y = SHEEP_CONSTANTS.LANE_TOP_Y + SHEEP_MODELS[playerSheep[0].size].radius;
          return;
        }
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
        if (!this.isAuthoritative) {
          opponentSheep[0].y = SHEEP_CONSTANTS.LANE_BOTTOM_Y - SHEEP_MODELS[opponentSheep[0].size].radius;
          return;
        }
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

      // Check if a clash is already active or just starting
      const wasClashing = lane.clashY !== null;
      const isClashing = wasClashing || (pFront.y - oFront.y <= clashDist + 1);

      if (!isClashing) {
        // Not clashing yet! Both sides march forward freely towards midfield
        lane.clashY = null;
        lane.playerStrength = 0;
        lane.opponentStrength = 0;
        lane.deadlockTimer = 0;

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

        // Did marching bring them into contact on this exact frame?
        if (pFront.y - oFront.y <= clashDist) {
          const midY = (pFront.y + oFront.y) / 2;
          pFront.y = midY + clashDist / 2;
          oFront.y = midY - clashDist / 2;
          lane.clashY = midY;
          if (this.callbacks.onClash) {
            this.callbacks.onClash(lane.index, 0, midY);
          }
        }

        this.updateStartSpaceBlocked(lane);
        return;
      }

      // =====================================================================
      // HEADBUTT CLASH ACTIVE!
      // =====================================================================
      // Keep front sheep locked firmly at contact distance
      const midY = lane.clashY ?? ((pFront.y + oFront.y) / 2);
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
        lane.clashY += moveDelta;
      }

      // 6. Check Goal Crossings
      if (pFront.y - SHEEP_MODELS[pFront.size].radius <= SHEEP_CONSTANTS.LANE_TOP_Y) {
        if (!this.isAuthoritative) {
          pFront.y = SHEEP_CONSTANTS.LANE_TOP_Y + SHEEP_MODELS[pFront.size].radius;
          return;
        }
        this.finishLane(lane, 'won_player');
        return;
      }
      if (oFront.y + SHEEP_MODELS[oFront.size].radius >= SHEEP_CONSTANTS.LANE_BOTTOM_Y) {
        if (!this.isAuthoritative) {
          oFront.y = SHEEP_CONSTANTS.LANE_BOTTOM_Y - SHEEP_MODELS[oFront.size].radius;
          return;
        }
        this.finishLane(lane, 'won_opponent');
        return;
      }

      // 7. REQUIREMENT 3: FULL LANE DRAW RULE!
      // A lane is ONLY considered a DRAW when it is FULL with sheep from both sides:
      // - The connected push chain stretches all the way from the opponent's start space to the player's start space.
      // - Neither side can deploy any more sheep into this lane.
      // - And they are in deadlock stalemate (fPlayer === fOpponent).
      this.updateStartSpaceBlocked(lane);
      const pClearY = SHEEP_CONSTANTS.LANE_BOTTOM_Y - SHEEP_CONSTANTS.START_SPACE_DEPTH;
      const oClearY = SHEEP_CONSTANTS.LANE_TOP_Y + SHEEP_CONSTANTS.START_SPACE_DEPTH;
      const lastP = pChain[pChain.length - 1];
      const lastO = oChain[oChain.length - 1];
      const isPlayerChainFull = Boolean(lastP && (lastP.y + SHEEP_MODELS[lastP.size].radius >= pClearY));
      const isOpponentChainFull = Boolean(lastO && (lastO.y - SHEEP_MODELS[lastO.size].radius <= oClearY));

      if (isPlayerChainFull && isOpponentChainFull) {
        if (fPlayer === fOpponent) {
          lane.deadlockTimer = (lane.deadlockTimer || 0) + dt;
          if (lane.deadlockTimer >= 1.0) {
            if (!this.isAuthoritative) return;
            this.finishLane(lane, 'draw');
            return;
          }
        } else {
          lane.deadlockTimer = 0;
        }
      } else {
        lane.deadlockTimer = 0;
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
    if (!this.isAuthoritative) return;

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

  /**
   * Serializes current engine state into a lightweight sync payload for peer replication
   */
  public getSyncSnapshot(): SheepSyncSnapshot {
    return {
      lanes: this.state.lanes.map(l => ({
        index: l.index,
        status: l.status,
        clashY: l.clashY !== null ? Math.round(l.clashY * 10) / 10 : null,
        sheep: l.sheep.map(s => ({
          id: s.id,
          size: s.size,
          side: s.side,
          y: Math.round(s.y * 10) / 10
        }))
      })),
      playerScore: this.state.playerScore,
      opponentScore: this.state.opponentScore,
      isSuddenDeath: this.state.isSuddenDeath,
      winner: this.state.winner
    };
  }

  /**
   * Applies authoritative Host state onto Guest engine with coordinate & lane inversion
   */
  public applyHostSync(sync: SheepSyncSnapshot, now: number = performance.now()) {
    const TOTAL_Y = SHEEP_CONSTANTS.LANE_TOP_Y + SHEEP_CONSTANTS.LANE_BOTTOM_Y; // 45 + 815 = 860

    // 1. Authoritative match scores (inverted: host's playerScore is guest's opponentScore)
    this.state.playerScore = sync.opponentScore;
    this.state.opponentScore = sync.playerScore;
    this.state.isSuddenDeath = sync.isSuddenDeath;

    // 2. Authoritative match winner
    if (sync.winner !== null && this.state.winner === null) {
      const mappedWinner: SheepSide | 'draw' =
        sync.winner === 'player' ? 'opponent' : sync.winner === 'opponent' ? 'player' : 'draw';
      this.state.winner = mappedWinner;
      if (this.callbacks.onMatchEnd) {
        this.callbacks.onMatchEnd(mappedWinner);
      }
    }

    // 3. Reconcile each lane (Host lane i -> Guest lane 4 - i)
    for (const hostLane of sync.lanes) {
      const guestLaneIndex = SHEEP_CONSTANTS.NUM_LANES - 1 - hostLane.index;
      const guestLane = this.state.lanes[guestLaneIndex];
      if (!guestLane) continue;

      // Status mapping: Host won_player -> Guest won_opponent, Host won_opponent -> Guest won_player
      const mappedStatus: LaneStatus =
        hostLane.status === 'won_player'
          ? 'won_opponent'
          : hostLane.status === 'won_opponent'
          ? 'won_player'
          : hostLane.status;

      // If host finalized the lane but guest hasn't yet
      if (mappedStatus !== 'active' && guestLane.status === 'active') {
        guestLane.status = mappedStatus;
        guestLane.clashY = null;
        if (mappedStatus === 'won_player') {
          if (this.callbacks.onLaneWin) this.callbacks.onLaneWin(guestLaneIndex, 'player');
        } else if (mappedStatus === 'won_opponent') {
          if (this.callbacks.onLaneWin) this.callbacks.onLaneWin(guestLaneIndex, 'opponent');
        } else if (mappedStatus === 'draw') {
          this.state.drawLanesCount++;
          if (this.callbacks.onLaneDraw) this.callbacks.onLaneDraw(guestLaneIndex);
        }
      } else if (guestLane.status !== 'active') {
        continue;
      }

      // Reconcile clash position
      if (hostLane.clashY !== null) {
        const targetClashY = TOTAL_Y - hostLane.clashY;
        if (guestLane.clashY === null) {
          guestLane.clashY = targetClashY;
        } else {
          guestLane.clashY += (targetClashY - guestLane.clashY) * 0.35;
        }
      } else {
        guestLane.clashY = null;
      }

      // Map of sheep from Host snapshot
      const hostSheepMap = new Map<string, { id: string; size: SheepSize; side: SheepSide; y: number }>();
      for (const hs of hostLane.sheep) {
        hostSheepMap.set(hs.id, hs);
      }

      // Update existing sheep with smooth interpolation
      for (const gs of guestLane.sheep) {
        const hs = hostSheepMap.get(gs.id);
        if (hs) {
          const targetY = TOTAL_Y - hs.y;
          const diff = targetY - gs.y;
          if (Math.abs(diff) > 50) {
            gs.y = targetY;
          } else {
            gs.y += diff * 0.35;
          }
        }
      }

      // Add sheep present in host snapshot but missing locally
      for (const hs of hostLane.sheep) {
        const exists = guestLane.sheep.some(s => s.id === hs.id);
        if (!exists) {
          const mappedSide: SheepSide = hs.side === 'player' ? 'opponent' : 'player';
          guestLane.sheep.push({
            id: hs.id,
            size: hs.size,
            side: mappedSide,
            laneIndex: guestLaneIndex,
            y: TOTAL_Y - hs.y,
            walkCycle: 0,
            isPushing: false,
            pushStrain: 0,
            createdAt: now
          });
        }
      }

      // Cull sheep removed on host, preserving recently deployed local sheep (< 1000ms)
      guestLane.sheep = guestLane.sheep.filter(gs => {
        if (hostSheepMap.has(gs.id)) return true;
        if (gs.side === 'player' && gs.createdAt && (now - gs.createdAt < 1000)) {
          return true;
        }
        return false;
      });

      this.updateStartSpaceBlocked(guestLane);
    }
  }
}
