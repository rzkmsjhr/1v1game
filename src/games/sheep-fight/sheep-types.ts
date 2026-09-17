export type SheepSize = 'small' | 'medium' | 'big' | 'giant';

export type SheepSide = 'player' | 'opponent';

export interface SheepModelDef {
  size: SheepSize;
  name: string;
  weight: number;      // Push force / Mass: 1, 2, 3, 5
  strength: number;    // Same as weight
  radius: number;      // Collision and visual radius (13, 19, 27, 38)
  hornStyle: 'none' | 'small_curved' | 'heavy_spiral' | 'colossal_ridged';
  armorStyle: 'none' | 'bandana' | 'forehead_plate' | 'war_collar_gold';
  description: string;
}

export const SHEEP_MODELS: Record<SheepSize, SheepModelDef> = {
  small: {
    size: 'small',
    name: 'Swift Lamb',
    weight: 1,
    strength: 1,
    radius: 17,
    hornStyle: 'none',
    armorStyle: 'bandana',
    description: 'Fast, lightweight baby lamb. Nimble, but easily pushed by heavier sheep.'
  },
  medium: {
    size: 'medium',
    name: 'Standard Sheep',
    weight: 2,
    strength: 2,
    radius: 24,
    hornStyle: 'small_curved',
    armorStyle: 'none',
    description: 'Balanced all-rounder with curved horns. The backbone of every lane push.'
  },
  big: {
    size: 'big',
    name: 'Brawler Ram',
    weight: 3,
    strength: 3,
    radius: 32,
    hornStyle: 'heavy_spiral',
    armorStyle: 'forehead_plate',
    description: 'Bulky warrior ram with ribbed spiral horns and iron forehead plate.'
  },
  giant: {
    size: 'giant',
    name: 'Mammoth Ram',
    weight: 5,
    strength: 5,
    radius: 40,
    hornStyle: 'colossal_ridged',
    armorStyle: 'war_collar_gold',
    description: 'Colossal mountain juggernaut with golden horns. Bulldozes entire lanes.'
  }
};

export interface ActiveSheep {
  id: string;
  size: SheepSize;
  side: SheepSide;
  laneIndex: number;
  y: number;               // Current Y position in virtual canvas coordinates
  walkCycle: number;       // Leg/tail oscillation phase
  isPushing: boolean;      // In contact with opposing chain or stationary
  pushStrain: number;      // 0 to 1 vibration strain
}

export type LaneStatus = 'active' | 'won_player' | 'won_opponent' | 'draw';

export interface LaneState {
  index: number;
  status: LaneStatus;
  sheep: ActiveSheep[];
  playerStrength: number;       // Sum of active player sheep in push line
  opponentStrength: number;     // Sum of active opponent sheep in push line
  isPlayerStartBlocked: boolean; // Whether player cannot deploy due to sheep in start zone
  isOpponentStartBlocked: boolean;
  clashY: number | null;        // Y position of current headbutt contact point, or null if no clash
}

export interface SheepFightState {
  lanes: LaneState[];
  playerScore: number;          // Number of lanes won by player (0-3)
  opponentScore: number;        // Number of lanes won by opponent (0-3)
  drawLanesCount: number;       // Number of locked draw lanes
  isSuddenDeath: boolean;       // Activated when 3 lanes are DRAW
  winner: SheepSide | 'draw' | null;
  playerQueue: SheepSize[];     // Current ready sheep (index 0) + upcoming previews
  opponentQueue: SheepSize[];
  playerCooldown: number;       // Remaining cooldown in seconds
  opponentCooldown: number;
}

export interface SheepSpawnEvent {
  side: SheepSide;
  laneIndex: number;
  size: SheepSize;
  id: string;
}

export type SheepNetworkMessage =
  | { type: 'DEPLOY_SHEEP'; laneIndex: number; size: SheepSize; id: string; timestamp: number }
  | { type: 'SYNC_STATE'; state: SheepFightState; timestamp: number }
  | { type: 'REMATCH_REQUEST' }
  | { type: 'REMATCH_ACCEPT' };
