export type FloorThemeType = 'foundation' | 'residential' | 'office' | 'commercial' | 'luxury' | 'penthouse';

export interface FloorBlock {
  id: number;
  floorNumber: number;
  x: number;             // Center X position relative to tower base
  y: number;             // Vertical position from base ground (in px)
  width: number;
  height: number;
  type: FloorThemeType;
  color: string;
  accentColor: string;
  windowCount: number;
  windowLights: boolean[];
  isPerfect: boolean;
  offsetDx: number;      // Placement error relative to previous floor
  residents: number;
}

export interface FallingBlock {
  x: number;
  y: number;
  vy: number;
  width: number;
  height: number;
  type: FloorThemeType;
  color: string;
  accentColor: string;
  windowCount: number;
  windowLights: boolean[];
}

export interface TumblingBlock {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vRot: number;
  width: number;
  height: number;
  color: string;
  accentColor: string;
  type: FloorThemeType;
  alpha: number;
}

export interface ParticleEffect {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface FloatingText {
  id: number;
  text: string;
  x: number;
  y: number;
  color: string;
  scale: number;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface CraneState {
  anchorX: number;
  anchorY: number;
  cableLength: number;
  angle: number;
  angularVelocity: number;
  speedMultiplier: number;
  hookX: number;
  hookY: number;
  holdingBlock: FallingBlock | null;
}

export type PlacementQuality = 'perfect' | 'great' | 'good' | 'miss';

export interface DropEvent {
  floorNumber: number;
  quality: PlacementQuality;
  offsetDx: number;
  combo: number;
  populationGained: number;
  totalFloors: number;
}

export interface SkylinePlayerState {
  id: 'player' | 'opponent';
  name: string;
  floors: FloorBlock[];
  fallingBlock: FallingBlock | null;
  tumblingBlocks: TumblingBlock[];
  particles: ParticleEffect[];
  floatingTexts: FloatingText[];
  crane: CraneState;
  wobbleAngle: number;
  wobbleVelocity: number;
  lives: number;
  maxLives: number;
  population: number;
  combo: number;
  maxCombo: number;
  perfectCount: number;
  isDead: boolean;
  hasFinished: boolean;
  finishTime: number;
}
