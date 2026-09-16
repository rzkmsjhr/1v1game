/**
 * Type definitions for Ninja Rush: 1v1 Dash
 * High-speed ninja parkour duel with 3 hearts, dynamic speed scaling, and obstacle dodging
 */

export type Lane = -1 | 0 | 1; // Left, Center, Right

export type ObstacleType =
  | 'HURDLE'    // Low roadwork barricade (must Jump over)
  | 'OVERHEAD'  // Low industrial pipe/scaffolding (must Slide under)
  | 'DUMPSTER'  // Tall brick wall blocking entire lane (must Swerve)
  | 'PUDDLE'    // Slippery soda puddle (causes spinout & slowdown)
  | 'SPEED_PAD' // Green neon chevron strip (instant speed surge)
  | 'SLOW_PAD'; // Purple hazard brake strip (causes spinout/slowdown, jump over to avoid!)

export type PickupType =
  | 'HEART'        // Rare life can (+1 ❤️, max 3)
  | 'FIZZ_TURBO'   // 3.2s rocket speed boost + destroys obstacles
  | 'SODA_SPILL'   // Drop slippery puddle in your lane behind you
  | 'BUBBLE_SHIELD'// Absorbs next collision with 0 damage
  | 'CHEST';       // Colorful gold chest (mystery drop: Rocket / Shield / Spill)

export type TrackItemType = ObstacleType | PickupType;

export interface TrackItem {
  id: string;
  z: number;            // Distance along track in meters
  lane: Lane;
  type: TrackItemType;
  cleared?: boolean;    // Already jumped/slid or picked up
  hit?: boolean;        // Already collided with
}

export interface RunnerState {
  id: 'player' | 'opponent';
  name: string;
  hearts: number;         // 0 to 3
  maxHearts: number;      // 3
  distance: number;       // Meters traveled along the road
  speed: number;          // Current forward speed (units/s)
  lane: Lane;             // Target discrete lane (-1, 0, 1)
  currentX: number;       // Smooth lateral position (-1 to 1)
  jumpY: number;          // 0 (ground) to 1.0 (jump peak)
  jumpVy: number;         // Vertical velocity
  isJumping: boolean;
  isSliding: boolean;
  slideTimer: number;     // Remaining duration of slide
  invulnerableTimer: number; // Post-hit blinking invulnerability
  stumbleTimer: number;   // Spinout/stumble duration
  isTurbo: boolean;
  turboTimer: number;
  hasShield: boolean;
  heldItem: PickupType | null;
  isDead: boolean;
  scoreDistance: number;  // Final distance at wipeout
}

export interface MatchStats {
  winner: 'player' | 'opponent' | 'draw' | null;
  playerDistance: number;
  opponentDistance: number;
  playerMaxSpeed: number;
  opponentMaxSpeed: number;
  playerHeartsLeft: number;
  opponentHeartsLeft: number;
  obstaclesDodged: number;
  powerUpsUsed: number;
  durationSeconds: number;
}

// WebRTC P2P multiplayer protocol message formats
export type DashNetworkMessage =
  | {
      type: 'DASH_READY';
      seed: number;
    }
  | {
      type: 'DASH_SYNC';
      distance: number;
      speed: number;
      lane: Lane;
      currentX: number;
      jumpY: number;
      isJumping: boolean;
      isSliding: boolean;
      hearts: number;
      invulnerable: boolean;
      stumbling: boolean;
      isTurbo: boolean;
      hasShield: boolean;
      heldItem: PickupType | null;
      timestamp?: number;
    }
  | {
      type: 'DASH_ACTION';
      action: 'MOVE_LEFT' | 'MOVE_RIGHT' | 'JUMP' | 'SLIDE';
      lane: Lane;
      distance: number;
      timestamp: number;
    }
  | {
      type: 'DASH_ITEM_DROP';
      itemType: 'SODA_SPILL';
      z: number;
      lane: Lane;
    }
  | {
      type: 'DASH_GAME_OVER';
      loserId: 'player' | 'opponent';
      finalDistance: number;
    }
  | {
      type: 'DASH_REMATCH';
      seed: number;
    }
  | {
      type: 'DASH_EVENT';
      title: string;
      message: string;
      icon: string;
    };
