import { SKYLINE_CONSTANTS } from './skyline-constants';
import type {
  FloorBlock,
  FallingBlock,
  TumblingBlock,
  CraneState,
  DropEvent,
  PlacementQuality,
  FloorThemeType,
  SkylinePlayerState
} from './skyline-types';

export class SkylineStackEngine {
  public seed: number;
  public targetFloors: number;
  public state: SkylinePlayerState;
  public isGameOver: boolean = false;
  public winner: 'player' | 'opponent' | 'draw' | null = null;
  public isAuthoritative: boolean = true;

  private simTime: number = 0;
  private nextBlockSpawnTimer: number = 0;
  private floorIdCounter: number = 0;
  private rng: () => number;

  // Callbacks
  public onDrop?: (event: DropEvent) => void;
  public onGameOver?: (winner: 'player' | 'opponent' | 'draw') => void;

  constructor(seed: number = Date.now(), targetFloors: number = SKYLINE_CONSTANTS.TARGET_FLOORS, id: 'player' | 'opponent' = 'player', name: string = 'You') {
    this.seed = seed;
    this.targetFloors = targetFloors;
    this.rng = this.pseudoRandom(seed);
    this.state = this.createInitialPlayerState(id, name);
    this.spawnNextBlock();
  }

  private pseudoRandom(s: number): () => number {
    let mask = 0xffffffff;
    let m_w = (123456789 + s) & mask;
    let m_z = (987654321 - s) & mask;
    return () => {
      m_z = (36969 * (m_z & 65535) + (m_z >> 16)) & mask;
      m_w = (18000 * (m_w & 65535) + (m_w >> 16)) & mask;
      let result = ((m_z << 16) + (m_w & 65535)) >>> 0;
      return result / 4294967296;
    };
  }

  private createInitialPlayerState(id: 'player' | 'opponent', name: string): SkylinePlayerState {
    const crane: CraneState = {
      anchorX: 0,
      anchorY: SKYLINE_CONSTANTS.FOUNDATION_HEIGHT + SKYLINE_CONSTANTS.CRANE_CABLE_LENGTH + SKYLINE_CONSTANTS.HOOK_CLEARANCE,
      cableLength: SKYLINE_CONSTANTS.CRANE_CABLE_LENGTH,
      angle: 0,
      equatorAngle: 0,
      depthZ: 1.0,
      angularVelocity: SKYLINE_CONSTANTS.CRANE_BASE_SWING_SPEED,
      speedMultiplier: 1.0,
      hookX: 0,
      hookY: SKYLINE_CONSTANTS.FOUNDATION_HEIGHT + SKYLINE_CONSTANTS.HOOK_CLEARANCE - SKYLINE_CONSTANTS.EQUATOR_RADIUS_Y,
      holdingBlock: null
    };

    // Foundation block at floor 0
    const foundation: FloorBlock = {
      id: 0,
      floorNumber: 0,
      x: 0,
      y: 0,
      width: SKYLINE_CONSTANTS.FOUNDATION_WIDTH,
      height: SKYLINE_CONSTANTS.FOUNDATION_HEIGHT,
      type: 'foundation',
      color: '#334155',
      accentColor: '#1e293b',
      windowCount: 0,
      windowLights: [],
      isPerfect: true,
      offsetDx: 0,
      residents: 0
    };

    return {
      id,
      name,
      floors: [foundation],
      fallingBlock: null,
      tumblingBlocks: [],
      particles: [],
      floatingTexts: [],
      crane,
      wobbleAngle: 0,
      wobbleVelocity: 0,
      lives: SKYLINE_CONSTANTS.MAX_LIVES,
      maxLives: SKYLINE_CONSTANTS.MAX_LIVES,
      population: 0,
      combo: 0,
      maxCombo: 0,
      perfectCount: 0,
      isDead: false,
      hasFinished: false,
      finishTime: 0
    };
  }

  public reset(seed: number = Date.now()) {
    this.seed = seed;
    this.rng = this.pseudoRandom(seed);
    this.simTime = 0;
    this.nextBlockSpawnTimer = 0;
    this.floorIdCounter = 0;
    this.isGameOver = false;
    this.winner = null;
    this.state = this.createInitialPlayerState(this.state.id, this.state.name);
    this.spawnNextBlock();
  }

  /**
   * Spawns the next block attached to the crane hook
   */
  private spawnNextBlock() {
    if (this.isGameOver || this.state.isDead || this.state.hasFinished) return;

    this.floorIdCounter++;
    const currentFloor = this.state.floors.length; // e.g. 1 for first real floor

    let theme: { type: FloorThemeType; color: string; accentColor: string; windows: number };

    if (currentFloor === this.targetFloors) {
      // Golden Crown Penthouse!
      theme = SKYLINE_CONSTANTS.PENTHOUSE_THEME;
    } else {
      const themeIdx = (currentFloor - 1) % SKYLINE_CONSTANTS.THEMES.length;
      theme = SKYLINE_CONSTANTS.THEMES[themeIdx];
    }

    const windowLights: boolean[] = [];
    for (let i = 0; i < theme.windows; i++) {
      windowLights.push(this.rng() > 0.3);
    }

    const block: FallingBlock = {
      x: this.state.crane.hookX,
      y: this.state.crane.hookY,
      vy: 0,
      width: SKYLINE_CONSTANTS.BLOCK_WIDTH,
      height: SKYLINE_CONSTANTS.BLOCK_HEIGHT,
      type: theme.type,
      color: theme.color,
      accentColor: theme.accentColor,
      windowCount: theme.windows,
      windowLights
    };

    this.state.crane.holdingBlock = block;
  }

  /**
   * Player drops the held block from the crane
   */
  public dropBlock(): boolean {
    if (this.isGameOver || this.state.isDead || this.state.hasFinished) return false;
    if (!this.state.crane.holdingBlock || this.state.fallingBlock) return false;

    // Release block from crane hook
    const block = this.state.crane.holdingBlock;
    block.x = this.state.crane.hookX;
    block.y = this.state.crane.hookY;
    block.vy = 0;

    this.state.fallingBlock = block;
    this.state.crane.holdingBlock = null;
    return true;
  }

  /**
   * Main physics & simulation update tick
   */
  public update(dt: number) {
    if (this.isGameOver) return;
    this.simTime += dt;

    const topFloor = this.state.floors[this.state.floors.length - 1];
    const topFloorY = topFloor ? topFloor.y + topFloor.height : SKYLINE_CONSTANTS.FOUNDATION_HEIGHT;

    // 1. Crane Anchor Position follows the top of the tower
    const desiredAnchorY = topFloorY + SKYLINE_CONSTANTS.HOOK_CLEARANCE + SKYLINE_CONSTANTS.CRANE_CABLE_LENGTH;
    this.state.crane.anchorY += (desiredAnchorY - this.state.crane.anchorY) * Math.min(1.0, dt * 6.0);

    // Crane swing speed increases slightly as tower grows taller
    const floorSpeedBonus = 1.0 + Math.min(0.5, this.state.floors.length * 0.015);
    this.state.crane.speedMultiplier = floorSpeedBonus;

    // 180-Degree Circular Equator Trajectory (like the equator line of an earth globe)
    // Trajectory moves across the 180° front hemisphere [-π/2, +π/2]
    const swingFrequency = SKYLINE_CONSTANTS.CRANE_BASE_SWING_SPEED * this.state.crane.speedMultiplier;
    // Sinusoidal sweep across the 180-degree front arc
    const equatorPhase = Math.sin(this.simTime * swingFrequency);
    const equatorAngle = equatorPhase * (Math.PI * 0.5); // sweeps from -π/2 to +π/2 (exact 180° arc)

    this.state.crane.angle = equatorAngle;
    this.state.crane.equatorAngle = equatorAngle;
    // depthZ = cos(equatorAngle) >= 0 (0 at side horizons, 1.0 at front center)
    this.state.crane.depthZ = Math.cos(equatorAngle);

    // Circular equator trajectory coordinates:
    // X follows circular arc sin(equatorAngle)
    this.state.crane.hookX = this.state.crane.anchorX + Math.sin(equatorAngle) * SKYLINE_CONSTANTS.EQUATOR_RADIUS_X;
    
    // Y follows the downward curved equator arc in perspective (curves down toward viewer at center)
    const arcDipY = this.state.crane.depthZ * SKYLINE_CONSTANTS.EQUATOR_RADIUS_Y;
    this.state.crane.hookY = this.state.crane.anchorY - this.state.crane.cableLength - arcDipY;

    if (this.state.crane.holdingBlock) {
      this.state.crane.holdingBlock.x = this.state.crane.hookX;
      this.state.crane.holdingBlock.y = this.state.crane.hookY;
    }

    // 2. Tower Wobble Harmonic Spring Physics
    // Frequency increases dynamically as the tower gets taller: shakes faster the taller the building!
    const floorCount = Math.max(1, this.state.floors.length - 1);
    const currentFreq = SKYLINE_CONSTANTS.WOBBLE_BASE_FREQ + SKYLINE_CONSTANTS.WOBBLE_FREQ_PER_FLOOR * floorCount;
    const springK = currentFreq * currentFreq; // k = ω²
    const dampingC = 2.0 * SKYLINE_CONSTANTS.WOBBLE_DAMPING_RATIO * currentFreq; // Underdamped c = 2ζω for smooth multi-cycle sway

    const wobbleAcc = -springK * this.state.wobbleAngle - dampingC * this.state.wobbleVelocity;
    this.state.wobbleVelocity += wobbleAcc * dt;
    this.state.wobbleAngle += this.state.wobbleVelocity * dt;

    // Clamp maximum wobble
    if (Math.abs(this.state.wobbleAngle) > SKYLINE_CONSTANTS.MAX_WOBBLE_ANGLE) {
      this.state.wobbleAngle = Math.sign(this.state.wobbleAngle) * SKYLINE_CONSTANTS.MAX_WOBBLE_ANGLE;
      this.state.wobbleVelocity *= -0.3;
    }

    // 3. Falling Block Dynamics
    if (this.state.fallingBlock) {
      const fb = this.state.fallingBlock;
      fb.vy += SKYLINE_CONSTANTS.GRAVITY * dt;
      fb.y -= fb.vy * dt;

      // Top floor position with sway offset
      const targetLandingY = topFloorY;
      const topFloorSwayX = this.calculateTopFloorSwayX();
      const targetLandingX = topFloor.x + topFloorSwayX;

      // Collision check with top floor surface
      if (fb.y <= targetLandingY) {
        fb.y = targetLandingY;
        this.resolveBlockLanding(fb, targetLandingX, targetLandingY);
        this.state.fallingBlock = null;
        this.nextBlockSpawnTimer = 0.22; // 220ms before next block appears on crane
      }
    }

    // 4. Next Block Respawn Timer
    if (!this.state.crane.holdingBlock && !this.state.fallingBlock && !this.state.isDead && !this.state.hasFinished) {
      this.nextBlockSpawnTimer -= dt;
      if (this.nextBlockSpawnTimer <= 0) {
        this.spawnNextBlock();
      }
    }

    // 5. Tumbling Missed Blocks Physics
    for (let i = this.state.tumblingBlocks.length - 1; i >= 0; i--) {
      const tb = this.state.tumblingBlocks[i];
      tb.vy += SKYLINE_CONSTANTS.GRAVITY * 0.85 * dt;
      tb.x += tb.vx * dt;
      tb.y -= tb.vy * dt;
      tb.rotation += tb.vRot * dt;
      tb.alpha -= dt * 0.65;

      if (tb.alpha <= 0 || tb.y < -300) {
        this.state.tumblingBlocks.splice(i, 1);
      }
    }

    // 6. Check Game End
    this.checkGameEnd();
  }

  /**
   * Resolves collision when falling block lands on top of tower
   */
  private resolveBlockLanding(fb: FallingBlock, targetX: number, targetY: number) {
    const rawOffsetDx = fb.x - targetX;
    const absOffset = Math.abs(rawOffsetDx);

    if (absOffset > SKYLINE_CONSTANTS.MAX_OVERHANG) {
      // OVERHANG MISS: Block tips over and tumbles off!
      this.handleBlockMiss(fb, rawOffsetDx);
      return;
    }

    let quality: PlacementQuality;
    let isPerfect = false;
    let placedX = fb.x;
    let popGain = 50;

    const floorCount = Math.max(1, this.state.floors.length - 1);
    // Taller building has more mass/leverage up high, exciting stronger torque
    const heightLeverage = 1.0 + Math.min(1.4, floorCount * 0.05);

    if (absOffset <= SKYLINE_CONSTANTS.PERFECT_THRESHOLD) {
      quality = 'perfect';
      isPerfect = true;
      placedX = targetX; // Perfect snap alignment!
      this.state.combo += 1;
      if (this.state.combo > this.state.maxCombo) {
        this.state.maxCombo = this.state.combo;
      }
      this.state.perfectCount += 1;
      popGain = 100 + this.state.combo * 50;

      // PERFECT stabilizes the tower sway!
      this.state.wobbleAngle *= 0.25;
      this.state.wobbleVelocity *= 0.15;
    } else if (absOffset <= SKYLINE_CONSTANTS.GREAT_THRESHOLD) {
      quality = 'great';
      this.state.combo = 0;
      popGain = 75;
      // Slight torque impulse
      const edgeFraction = (absOffset - SKYLINE_CONSTANTS.PERFECT_THRESHOLD) / (SKYLINE_CONSTANTS.GREAT_THRESHOLD - SKYLINE_CONSTANTS.PERFECT_THRESHOLD);
      const impulse = Math.sign(rawOffsetDx) * (0.04 + 0.08 * edgeFraction) * heightLeverage;
      this.state.wobbleVelocity += impulse;
    } else {
      // GOOD: Placed near the edge!
      quality = 'good';
      this.state.combo = 0;
      popGain = 40;
      // Substantial torque impulse when dropped near the edge!
      const edgeFraction = (absOffset - SKYLINE_CONSTANTS.GREAT_THRESHOLD) / (SKYLINE_CONSTANTS.MAX_OVERHANG - SKYLINE_CONSTANTS.GREAT_THRESHOLD);
      const impulse = Math.sign(rawOffsetDx) * (0.12 + 0.24 * Math.pow(edgeFraction, 1.2)) * heightLeverage;
      this.state.wobbleVelocity += impulse;
    }

    this.state.population += popGain;

    const floorNumber = this.state.floors.length;
    const newFloor: FloorBlock = {
      id: this.floorIdCounter,
      floorNumber,
      x: placedX,
      y: targetY,
      width: fb.width,
      height: fb.height,
      type: fb.type,
      color: fb.color,
      accentColor: fb.accentColor,
      windowCount: fb.windowCount,
      windowLights: fb.windowLights,
      isPerfect,
      offsetDx: rawOffsetDx,
      residents: popGain
    };

    this.state.floors.push(newFloor);

    // Check if player completed target floors
    if (this.state.floors.length - 1 >= this.targetFloors) {
      this.state.hasFinished = true;
      this.state.finishTime = Date.now();
    }

    this.onDrop?.({
      floorNumber,
      quality,
      offsetDx: rawOffsetDx,
      combo: this.state.combo,
      populationGained: popGain,
      totalFloors: this.state.floors.length - 1
    });
  }

  /**
   * Handles missed block that fell off the skyscraper
   */
  private handleBlockMiss(fb: FallingBlock, rawOffsetDx: number) {
    this.state.lives -= 1;
    this.state.combo = 0;

    const tumbleDirection = rawOffsetDx >= 0 ? 1 : -1;
    const tb: TumblingBlock = {
      x: fb.x,
      y: fb.y,
      vx: tumbleDirection * (120 + Math.random() * 80),
      vy: -120,
      rotation: 0,
      vRot: tumbleDirection * (4.5 + Math.random() * 3.0),
      width: fb.width,
      height: fb.height,
      color: fb.color,
      accentColor: fb.accentColor,
      type: fb.type,
      alpha: 1.0
    };

    this.state.tumblingBlocks.push(tb);

    if (this.state.lives <= 0) {
      this.state.isDead = true;
    }

    this.onDrop?.({
      floorNumber: this.state.floors.length,
      quality: 'miss',
      offsetDx: rawOffsetDx,
      combo: 0,
      populationGained: 0,
      totalFloors: this.state.floors.length - 1
    });
  }

  /**
   * Calculates top floor horizontal displacement from base due to harmonic sway
   */
  public calculateTopFloorSwayX(): number {
    const totalHeight = this.getTowerHeight();
    return Math.sin(this.state.wobbleAngle) * (totalHeight * 0.32);
  }

  /**
   * Calculates sway offset for any given floor height
   */
  public calculateFloorSwayX(floorIndex: number): number {
    if (floorIndex === 0) return 0;
    const progress = floorIndex / Math.max(1, this.state.floors.length - 1);
    // Elastic cantilever curved sway: bottom anchored, upper floors sway wide
    const curve = 0.3 * progress + 0.7 * (progress * progress);
    return Math.sin(this.state.wobbleAngle) * (this.getTowerHeight() * 0.32) * curve;
  }

  public getTowerHeight(): number {
    if (this.state.floors.length === 0) return 0;
    const top = this.state.floors[this.state.floors.length - 1];
    return top.y + top.height;
  }

  public getActiveFloorsCount(): number {
    return Math.max(0, this.state.floors.length - 1);
  }

  private checkGameEnd() {
    if (this.isGameOver) return;

    if (this.state.isDead) {
      this.isGameOver = true;
      this.winner = 'opponent';
      this.onGameOver?.(this.winner);
    } else if (this.state.hasFinished) {
      this.isGameOver = true;
      this.winner = 'player';
      this.onGameOver?.(this.winner);
    }
  }
}
