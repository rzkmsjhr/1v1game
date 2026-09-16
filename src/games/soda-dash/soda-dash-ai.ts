import type { AIDifficulty } from '../types';
import type { Lane } from './soda-dash-types';
import type { SodaDashEngine } from './soda-dash-engine';

interface AIDifficultyConfig {
  reactionDelayMinMs: number;
  reactionDelayMaxMs: number;
  blunderChance: number;      // 0 to 1
  seeksHearts: boolean;
  itemAggressiveness: number; // 0 to 1
  lookaheadMeters: number;
}

const AI_CONFIGS: Record<AIDifficulty, AIDifficultyConfig> = {
  easy: {
    reactionDelayMinMs: 360,
    reactionDelayMaxMs: 500,
    blunderChance: 0.30,
    seeksHearts: false,
    itemAggressiveness: 0.2,
    lookaheadMeters: 24
  },
  medium: {
    reactionDelayMinMs: 220,
    reactionDelayMaxMs: 320,
    blunderChance: 0.12,
    seeksHearts: true,
    itemAggressiveness: 0.5,
    lookaheadMeters: 30
  },
  hard: {
    reactionDelayMinMs: 120,
    reactionDelayMaxMs: 180,
    blunderChance: 0.03,
    seeksHearts: true,
    itemAggressiveness: 0.8,
    lookaheadMeters: 38
  },
  extreme: {
    reactionDelayMinMs: 60,
    reactionDelayMaxMs: 100,
    blunderChance: 0.005,
    seeksHearts: true,
    itemAggressiveness: 0.95,
    lookaheadMeters: 46
  }
};

export class SodaDashAI {
  private engine: SodaDashEngine;
  private config: AIDifficultyConfig;
  private isDestroyed: boolean = false;
  private pendingActionTimer: number = 0;
  private pendingAction: (() => void) | null = null;
  private lastProcessedItemId: string | null = null;

  constructor(engine: SodaDashEngine, difficulty: AIDifficulty = 'medium') {
    this.engine = engine;
    this.config = AI_CONFIGS[difficulty] || AI_CONFIGS.medium;
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.pendingAction = null;
  }

  public update(dt: number): void {
    if (this.isDestroyed || this.engine.isGameOver || this.engine.opponent.isDead) return;

    // Process pending delayed reaction action
    if (this.pendingActionTimer > 0) {
      this.pendingActionTimer -= dt;
      if (this.pendingActionTimer <= 0) {
        if (this.pendingAction) {
          this.pendingAction();
          this.pendingAction = null;
        }
      }
      return;
    }

    const opponent = this.engine.opponent;
    const currentZ = opponent.distance;
    const lookahead = this.config.lookaheadMeters;

    // Retrieve active items ahead of the opponent
    const itemsAhead = this.engine.track
      .getActiveItems(currentZ + 1.0, currentZ + lookahead)
      .filter(item => !item.hit && !item.cleared);

    // 1. Heart Seeking: If missing hearts and a heart is visible ahead, attempt to move to that lane
    if (this.config.seeksHearts && opponent.hearts < opponent.maxHearts) {
      const heartItem = itemsAhead.find(it => it.type === 'HEART' && it.z - currentZ > 6);
      if (heartItem && heartItem.lane !== opponent.lane) {
        // Safe to switch?
        const isSafeToSwitch = !itemsAhead.some(
          it => it.lane === heartItem.lane && Math.abs(it.z - (currentZ + 8)) < 4 && it.type === 'DUMPSTER'
        );
        if (isSafeToSwitch) {
          this.scheduleAction(() => {
            if (heartItem.lane < opponent.lane) {
              this.engine.moveLeft('opponent');
            } else if (heartItem.lane > opponent.lane) {
              this.engine.moveRight('opponent');
            }
          });
          return;
        }
      }
    }

    // 2. Obstacle in current lane
    const currentLaneItems = itemsAhead.filter(it => it.lane === opponent.lane);
    if (currentLaneItems.length === 0) {
      // Current lane is safe, check item usage
      this.evaluateItemUsage();
      return;
    }

    const nextItem = currentLaneItems[0];
    const distanceToItem = nextItem.z - currentZ;

    // Check if within reaction threshold (~9m-16m depending on speed)
    const triggerDistance = Math.max(9.0, opponent.speed * 0.45);

    if (distanceToItem <= triggerDistance && this.lastProcessedItemId !== nextItem.id) {
      this.lastProcessedItemId = nextItem.id;

      // Check if AI blunders on this obstacle
      const doesBlunder = Math.random() < this.config.blunderChance;

      if (doesBlunder) {
        // Blunder: either delay too late, do wrong action, or do nothing
        if (Math.random() < 0.5) {
          // Wrong action (e.g. slides on hurdle or jumps on overhead)
          const wrongAction = nextItem.type === 'HURDLE'
            ? () => this.engine.slide('opponent')
            : () => this.engine.jump('opponent');
          this.scheduleAction(wrongAction, 120);
        }
        return;
      }

      // Execute optimal evasive maneuver
      switch (nextItem.type) {
        case 'HURDLE':
        case 'SLOW_PAD': {
          // Action: Jump over hurdle or slow hazard strip
          this.scheduleAction(() => this.engine.jump('opponent'));
          break;
        }

        case 'OVERHEAD': {
          // Action: Slide
          this.scheduleAction(() => this.engine.slide('opponent'));
          break;
        }

        case 'DUMPSTER':
        case 'PUDDLE': {
          // Action: Swerve lane to safe adjacent lane
          const safeLanes: Lane[] = [-1, 0, 1].filter(l => l !== opponent.lane) as Lane[];

          // Pick lane with least upcoming threats
          safeLanes.sort((a, b) => {
            const threatA = itemsAhead.filter(it => it.lane === a && Math.abs(it.z - nextItem.z) < 8).length;
            const threatB = itemsAhead.filter(it => it.lane === b && Math.abs(it.z - nextItem.z) < 8).length;
            return threatA - threatB;
          });

          const chosenLane = safeLanes[0];
          this.scheduleAction(() => {
            if (chosenLane < opponent.lane) {
              this.engine.moveLeft('opponent');
            } else {
              this.engine.moveRight('opponent');
            }
          });
          break;
        }

        case 'SPEED_PAD':
        case 'FIZZ_TURBO':
        case 'BUBBLE_SHIELD':
        case 'HEART':
        case 'CHEST':
          // Bonus pickups require no evasion
          break;
      }
    }

    this.evaluateItemUsage();
  }

  private evaluateItemUsage(): void {
    const opponent = this.engine.opponent;
    if (!opponent.heldItem) return;

    if (opponent.heldItem === 'BUBBLE_SHIELD') {
      // Use shield immediately
      this.engine.useHeldItem('opponent');
      return;
    }

    if (opponent.heldItem === 'FIZZ_TURBO') {
      // Use turbo if health is low or road is crowded
      if (opponent.hearts <= 2 || Math.random() < this.config.itemAggressiveness * 0.2) {
        this.engine.useHeldItem('opponent');
      }
      return;
    }

    if (opponent.heldItem === 'SODA_SPILL') {
      // Drop spill if player is behind opponent
      const playerDist = this.engine.player.distance;
      if (playerDist < opponent.distance && opponent.distance - playerDist < 16) {
        this.engine.useHeldItem('opponent');
      }
    }
  }

  private scheduleAction(action: () => void, extraDelayMs: number = 0): void {
    const delayRange = this.config.reactionDelayMaxMs - this.config.reactionDelayMinMs;
    const baseDelay = this.config.reactionDelayMinMs + Math.random() * delayRange;
    this.pendingActionTimer = (baseDelay + extraDelayMs) / 1000;
    this.pendingAction = action;
  }
}
