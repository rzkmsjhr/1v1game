import type { Lane, RunnerState } from './soda-dash-types';
import { SodaTrackGenerator } from './soda-dash-generator';
import { sounds } from '../../engine/sound';

export interface CollisionEvent {
  runnerId: 'player' | 'opponent';
  type: 'HIT_DAMAGE' | 'HEAL' | 'PICKUP' | 'BOOST' | 'SHIELD_BREAK' | 'STUMBLE' | 'TURBO_SMASH';
  itemType: string;
  remainingHearts: number;
}

export class SodaDashEngine {
  public track: SodaTrackGenerator;
  public player: RunnerState;
  public opponent: RunnerState;
  public isGameOver: boolean = false;
  public winner: 'player' | 'opponent' | 'draw' | null = null;

  // Track collision listeners
  public onCollision?: (event: CollisionEvent) => void;
  public onGameOver?: (winner: 'player' | 'opponent' | 'draw') => void;

  constructor(seed: number = Date.now()) {
    this.track = new SodaTrackGenerator(seed);
    this.player = this.createInitialRunner('player', 'You');
    this.opponent = this.createInitialRunner('opponent', 'Rival');
  }

  public reset(seed: number = Date.now()): void {
    this.track.reset(seed);
    this.player = this.createInitialRunner('player', 'You');
    this.opponent = this.createInitialRunner('opponent', 'Rival');
    this.isGameOver = false;
    this.winner = null;
  }

  private createInitialRunner(id: 'player' | 'opponent', name: string): RunnerState {
    return {
      id,
      name,
      hearts: 3,
      maxHearts: 3,
      distance: 0,
      speed: 16, // Start at a friendly, approachable 16 m/s (~58 km/h)
      lane: id === 'player' ? -1 : 1, // Player starts left, rival starts right
      currentX: id === 'player' ? -1 : 1,
      jumpY: 0,
      jumpVy: 0,
      isJumping: false,
      isSliding: false,
      slideTimer: 0,
      invulnerableTimer: 0,
      stumbleTimer: 0,
      isTurbo: false,
      turboTimer: 0,
      hasShield: false,
      heldItem: null,
      isDead: false,
      scoreDistance: 0
    };
  }

  // --- Runner Actions ---

  public moveLeft(runnerId: 'player' | 'opponent' = 'player'): boolean {
    const r = runnerId === 'player' ? this.player : this.opponent;
    if (r.isDead || this.isGameOver) return false;
    if (r.lane > -1) {
      r.lane = (r.lane - 1) as Lane;
      sounds.playMove();
      return true;
    }
    return false;
  }

  public moveRight(runnerId: 'player' | 'opponent' = 'player'): boolean {
    const r = runnerId === 'player' ? this.player : this.opponent;
    if (r.isDead || this.isGameOver) return false;
    if (r.lane < 1) {
      r.lane = (r.lane + 1) as Lane;
      sounds.playMove();
      return true;
    }
    return false;
  }

  public jump(runnerId: 'player' | 'opponent' = 'player'): boolean {
    const r = runnerId === 'player' ? this.player : this.opponent;
    if (r.isDead || this.isGameOver) return false;
    if (!r.isJumping && r.jumpY <= 0.05) {
      r.isJumping = true;
      r.jumpVy = 4.4; // Initial upward velocity
      r.isSliding = false; // Jump cancels slide
      r.slideTimer = 0;
      if (runnerId === 'player') sounds.playDashJump();
      return true;
    }
    return false;
  }

  public slide(runnerId: 'player' | 'opponent' = 'player'): boolean {
    const r = runnerId === 'player' ? this.player : this.opponent;
    if (r.isDead || this.isGameOver) return false;
    if (r.isJumping) {
      // Fast fall down from jump
      r.jumpVy = -8.0;
      r.isSliding = true;
      r.slideTimer = 0.75;
      if (runnerId === 'player') sounds.playDashSlide();
      return true;
    }
    if (!r.isSliding) {
      r.isSliding = true;
      r.slideTimer = 0.75;
      if (runnerId === 'player') sounds.playDashSlide();
      return true;
    }
    return false;
  }

  public useHeldItem(runnerId: 'player' | 'opponent' = 'player'): boolean {
    const r = runnerId === 'player' ? this.player : this.opponent;
    if (r.isDead || this.isGameOver || !r.heldItem) return false;

    const item = r.heldItem;
    r.heldItem = null;

    if (item === 'FIZZ_TURBO') {
      r.isTurbo = true;
      r.turboTimer = 3.2;
      r.stumbleTimer = 0;
      if (runnerId === 'player') sounds.playSodaBoost();
      return true;
    }

    if (item === 'BUBBLE_SHIELD') {
      r.hasShield = true;
      if (runnerId === 'player') sounds.playRotate();
      return true;
    }

    if (item === 'SODA_SPILL') {
      // Drop puddle behind runner
      const dropZ = Math.max(0, r.distance - 2.5);
      this.track.addDynamicItem('SODA_SPILL', dropZ, r.lane);
      if (runnerId === 'player') sounds.playItemDrop();
      return true;
    }

    return false;
  }

  // --- Main Simulation Update ---

  public update(dt: number): void {
    if (this.isGameOver) return;

    // Cap delta time to prevent physics tunneling on lag spikes
    const clampedDt = Math.min(dt, 0.05);

    if (!this.player.isDead) {
      this.updateRunner(this.player, clampedDt);
    }
    if (!this.opponent.isDead) {
      this.updateRunner(this.opponent, clampedDt);
    }

    this.checkGameEnd();
  }

  private updateRunner(r: RunnerState, dt: number): void {
    // 1. Calculate Target Base Speed with Smooth Asymptotic Scaling Curve
    // Starts at a friendly, kid-accessible 16 m/s (~58 km/h) and gently scales towards 45 m/s (~162 km/h)
    const baseSpeed = 16;
    const maxSpeed = 45;
    const targetBaseSpeed = baseSpeed + (maxSpeed - baseSpeed) * (1 - Math.exp(-r.distance / 1000));

    let effectiveSpeed = targetBaseSpeed;

    // Apply Turbo modifier
    if (r.isTurbo) {
      r.turboTimer -= dt;
      if (r.turboTimer <= 0) {
        r.isTurbo = false;
        r.turboTimer = 0;
      } else {
        effectiveSpeed *= 1.5;
      }
    }

    // Apply Stumble / Spinout modifier
    if (r.stumbleTimer > 0) {
      r.stumbleTimer -= dt;
      effectiveSpeed *= 0.45;
    }

    r.speed = effectiveSpeed;
    r.distance += effectiveSpeed * dt;

    // 2. Smooth Lateral Position Interpolation (Lane Switching)
    const lateralSpeed = 16.0;
    r.currentX += (r.lane - r.currentX) * Math.min(1.0, lateralSpeed * dt);

    // 3. Vertical Jump Arc Physics
    if (r.isJumping || r.jumpY > 0) {
      const gravity = -13.5;
      r.jumpVy += gravity * dt;
      r.jumpY += r.jumpVy * dt;

      if (r.jumpY <= 0) {
        r.jumpY = 0;
        r.jumpVy = 0;
        r.isJumping = false;
      }
    }

    // 4. Slide Timer
    if (r.isSliding) {
      r.slideTimer -= dt;
      if (r.slideTimer <= 0) {
        r.isSliding = false;
        r.slideTimer = 0;
      }
    }

    // 5. Invulnerability Timer
    if (r.invulnerableTimer > 0) {
      r.invulnerableTimer -= dt;
      if (r.invulnerableTimer <= 0) {
        r.invulnerableTimer = 0;
      }
    }

    // 6. Check Track Collisions
    this.checkTrackCollisions(r);
  }

  private checkTrackCollisions(r: RunnerState): void {
    // Get items within collision window near runner
    const collisionWindow = 2.0; // 2 meters window
    const items = this.track.getActiveItems(r.distance - 0.5, r.distance + collisionWindow);

    for (const item of items) {
      if (item.hit || item.cleared) continue;

      // Check lateral lane alignment
      const laneDist = Math.abs(r.currentX - item.lane);
      if (laneDist > 0.52) continue; // In a different lane, safe!

      // Check longitudinal distance
      const deltaZ = item.z - r.distance;
      if (deltaZ > 1.2 || deltaZ < -0.8) continue; // Not at obstacle yet or already behind

      // Handle Pickups
      if (item.type === 'HEART') {
        item.cleared = true;
        if (r.hearts < r.maxHearts) {
          r.hearts++;
          if (r.id === 'player') sounds.playHeartPickup();
          this.triggerCollision(r.id, 'HEAL', item.type, r.hearts);
        } else {
          // Full hearts, bonus points chime
          if (r.id === 'player') sounds.playRotate();
        }
        continue;
      }

      if (item.type === 'SPEED_PAD') {
        item.cleared = true;
        r.isTurbo = true;
        r.turboTimer = 1.8;
        if (r.id === 'player') sounds.playSodaBoost();
        this.triggerCollision(r.id, 'BOOST', item.type, r.hearts);
        continue;
      }

      if (item.type === 'FIZZ_TURBO' || item.type === 'BUBBLE_SHIELD' || item.type === 'SODA_SPILL') {
        item.cleared = true;
        r.heldItem = item.type;
        if (r.id === 'player') sounds.playHold();
        this.triggerCollision(r.id, 'PICKUP', item.type, r.hearts);
        continue;
      }

      // Handle Obstacles
      if (r.invulnerableTimer > 0) {
        // Blinking invulnerability after taking damage
        continue;
      }

      let collided = false;

      if (item.type === 'HURDLE') {
        // Must jump over hurdle (even while on speed boost!)
        if (r.jumpY < 0.35) {
          collided = true;
        } else {
          item.cleared = true;
        }
      } else if (item.type === 'OVERHEAD') {
        // Must slide under overhead pipe (even while on speed boost!)
        if (!r.isSliding) {
          collided = true;
        } else {
          item.cleared = true;
        }
      } else if (item.type === 'DUMPSTER') {
        // Impassable block in current lane
        collided = true;
      } else if (item.type === 'PUDDLE' || item.type === 'SODA_SPILL') {
        // Puddle: slip if on ground
        if (r.jumpY < 0.25) {
          item.hit = true;
          r.stumbleTimer = 1.2;
          // Slip interrupts speed boost
          if (r.isTurbo) {
            r.isTurbo = false;
            r.turboTimer = 0;
          }
          if (r.id === 'player') sounds.playItemSlip();
          this.triggerCollision(r.id, 'STUMBLE', item.type, r.hearts);
        }
        continue;
      }

      if (collided) {
        item.hit = true;

        // Any collision interrupts active speed boost
        if (r.isTurbo) {
          r.isTurbo = false;
          r.turboTimer = 0;
        }

        if (r.hasShield) {
          // Shield absorbs collision
          r.hasShield = false;
          r.invulnerableTimer = 1.2;
          if (r.id === 'player') sounds.playHardDrop();
          this.triggerCollision(r.id, 'SHIELD_BREAK', item.type, r.hearts);
        } else {
          // Lose 1 Heart!
          r.hearts--;
          r.invulnerableTimer = 1.6;
          r.stumbleTimer = 0.9;
          if (r.id === 'player') sounds.playHeartLoss();
          this.triggerCollision(r.id, 'HIT_DAMAGE', item.type, r.hearts);

          if (r.hearts <= 0) {
            r.isDead = true;
            r.scoreDistance = Math.floor(r.distance);
          }
        }
      }
    }
  }

  private triggerCollision(runnerId: 'player' | 'opponent', type: any, itemType: string, remainingHearts: number): void {
    if (this.onCollision) {
      this.onCollision({ runnerId, type, itemType, remainingHearts });
    }
  }

  private checkGameEnd(): void {
    if (this.isGameOver) return;

    if (this.player.isDead && this.opponent.isDead) {
      this.isGameOver = true;
      // If both died at the exact same tick, further distance wins
      if (Math.abs(this.player.scoreDistance - this.opponent.scoreDistance) < 5) {
        this.winner = 'draw';
      } else if (this.player.scoreDistance > this.opponent.scoreDistance) {
        this.winner = 'player';
      } else {
        this.winner = 'opponent';
      }
      this.onGameOver?.(this.winner);
    } else if (this.player.isDead) {
      this.isGameOver = true;
      this.winner = 'opponent';
      this.onGameOver?.(this.winner);
    } else if (this.opponent.isDead) {
      this.isGameOver = true;
      this.winner = 'player';
      this.onGameOver?.(this.winner);
    }
  }
}
