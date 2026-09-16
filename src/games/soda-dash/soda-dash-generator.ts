import type { Lane, ObstacleType, PickupType, TrackItem } from './soda-dash-types';

/**
 * Seeded PRNG using Mulberry32 algorithm
 * Guarantees identical procedural tracks on both host and client devices
 */
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SodaTrackGenerator {
  private rng: () => number;
  private seed: number;
  private generatedUntilZ: number = 0;
  private items: TrackItem[] = [];
  private nextItemId: number = 1;

  // Dropped items from players (e.g. SODA_SPILL)
  private dynamicItems: TrackItem[] = [];

  constructor(seed: number = Date.now()) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    // Pre-generate the first 800m of track
    this.generateUpTo(800);
  }

  public getSeed(): number {
    return this.seed;
  }

  /**
   * Reset track with a new match seed
   */
  public reset(newSeed: number): void {
    this.seed = newSeed;
    this.rng = mulberry32(newSeed);
    this.generatedUntilZ = 0;
    this.items = [];
    this.dynamicItems = [];
    this.nextItemId = 1;
    this.generateUpTo(800);
  }

  /**
   * Add a dynamic item dropped by a runner (e.g. Soda Spill behind runner)
   */
  public addDynamicItem(type: 'SODA_SPILL', z: number, lane: Lane): void {
    this.dynamicItems.push({
      id: `dyn-${this.nextItemId++}`,
      z,
      lane,
      type
    });
  }

  /**
   * Procedurally generate track items up to a specified distance Z
   */
  public generateUpTo(targetZ: number): void {
    while (this.generatedUntilZ < targetZ) {
      const zStart = this.generatedUntilZ;
      const zEnd = zStart + 50; // 50-meter chunk
      this.generateChunk(zStart, zEnd);
      this.generatedUntilZ = zEnd;
    }
  }

  /**
   * Retrieve active track items currently within range [minZ, maxZ]
   * Cleans up items that have already scrolled far behind minZ to keep memory flat (~50KB)
   */
  public getActiveItems(minZ: number, maxZ: number): TrackItem[] {
    // Ensure we have generated far enough ahead
    if (this.generatedUntilZ < maxZ + 200) {
      this.generateUpTo(maxZ + 400);
    }

    // Recycle / prune items that are more than 100m behind the camera
    const pruneThreshold = minZ - 100;
    if (this.items.length > 80 && this.items[0].z < pruneThreshold) {
      this.items = this.items.filter(item => item.z >= pruneThreshold);
    }
    if (this.dynamicItems.length > 20 && this.dynamicItems[0].z < pruneThreshold) {
      this.dynamicItems = this.dynamicItems.filter(item => item.z >= pruneThreshold);
    }

    const staticSlice = this.items.filter(item => item.z >= minZ && item.z <= maxZ);
    const dynamicSlice = this.dynamicItems.filter(item => item.z >= minZ && item.z <= maxZ);

    return [...staticSlice, ...dynamicSlice].sort((a, b) => a.z - b.z);
  }

  /**
   * Generate a 50m procedural section
   */
  /**
   * Generate a 50m procedural section
   */
  private generateChunk(zStart: number, zEnd: number): void {
    // 0m - 90m: Peaceful warmup runway
    if (zEnd <= 90) return;

    const lanes: Lane[] = [-1, 0, 1];
    const difficultyProgress = Math.min(1.0, zStart / 1500); // 0 at start, 1 at 1500m+

    // Relaxed spacing between obstacles (42m at start down to 20m at supersonic speeds)
    const spacing = 42 - difficultyProgress * 22;
    let currentZ = Math.max(zStart + 10, 90);

    while (currentZ < zEnd - 5) {
      const roll = this.rng();

      // Generous Heart (+❤️) pickup spawn (~every 200m-300m)
      const heartChance = 0.11 + (1.0 - difficultyProgress) * 0.04;
      if (roll < heartChance && currentZ > 120) {
        const heartLane = lanes[Math.floor(this.rng() * 3)];
        this.items.push({
          id: `item-${this.nextItemId++}`,
          z: currentZ,
          lane: heartLane,
          type: 'HEART'
        });
        currentZ += spacing * 0.75;
        continue;
      }

      // Speed Pad / Mystery Crate spawn
      if (roll > 0.82) {
        const bonusLane = lanes[Math.floor(this.rng() * 3)];
        const bonusType: PickupType | 'SPEED_PAD' =
          this.rng() > 0.5 ? 'SPEED_PAD' : this.rng() > 0.5 ? 'FIZZ_TURBO' : 'BUBBLE_SHIELD';

        this.items.push({
          id: `item-${this.nextItemId++}`,
          z: currentZ,
          lane: bonusLane,
          type: bonusType
        });
        currentZ += spacing * 0.75;
        continue;
      }

      // Generate Obstacle Pattern with Staged Pacing:
      // - 0m - 250m: Only single gentle obstacles (Hurdle or Overhead) to learn jumping and sliding
      // - 250m - 600m: Single obstacles (70%) or Double (30%)
      // - 600m+: Full challenge with Triple synchronized barriers
      const patternRoll = this.rng();

      if (currentZ < 250 || patternRoll < 0.65) {
        // Single Obstacle (Playful Hurdle, Overhead Slide, or Toy Crate)
        const lane = lanes[Math.floor(this.rng() * 3)];
        const obsType: ObstacleType =
          this.rng() < 0.5 ? 'HURDLE' : this.rng() < 0.8 ? 'OVERHEAD' : 'DUMPSTER';

        this.items.push({
          id: `obs-${this.nextItemId++}`,
          z: currentZ,
          lane,
          type: obsType
        });
      } else if (currentZ < 600 || patternRoll < 0.88) {
        // Double Obstacle across 2 lanes (leaves 1 clear escape lane)
        const freeLane = lanes[Math.floor(this.rng() * 3)];
        const blockedLanes = lanes.filter(l => l !== freeLane);

        for (const lane of blockedLanes) {
          const obsType: ObstacleType = this.rng() < 0.55 ? 'HURDLE' : 'OVERHEAD';
          this.items.push({
            id: `obs-${this.nextItemId++}`,
            z: currentZ,
            lane,
            type: obsType
          });
        }
      } else {
        // Triple Synchronized Barricade (High distance only)
        const canPassByJump = this.rng() > 0.5;
        if (canPassByJump) {
          for (const lane of lanes) {
            this.items.push({
              id: `obs-${this.nextItemId++}`,
              z: currentZ,
              lane,
              type: 'HURDLE'
            });
          }
        } else {
          const passableLane = lanes[Math.floor(this.rng() * 3)];
          for (const lane of lanes) {
            const type: ObstacleType = lane === passableLane ? 'OVERHEAD' : 'DUMPSTER';
            this.items.push({
              id: `obs-${this.nextItemId++}`,
              z: currentZ,
              lane,
              type
            });
          }
        }
      }

      currentZ += spacing;
    }
  }
}
