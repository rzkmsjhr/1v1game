import {
  PlayerId,
  GamePhase,
  Ladder,
  Snake,
  BoardConfig,
  DiceRoll,
  MoveStep,
  MoveResult,
  TileCoord
} from './snake-ladder-types';

export function getTileCoord(tile: number): TileCoord {
  const clamped = Math.max(1, Math.min(100, tile));
  const row = Math.floor((clamped - 1) / 10); // 0 (bottom) to 9 (top)
  const isEvenRow = row % 2 === 0;
  const col = isEvenRow ? (clamped - 1) % 10 : 9 - ((clamped - 1) % 10);
  
  // Center of each 100x100 tile in 1000x1000 SVG viewbox
  const x = col * 100 + 50;
  const y = (9 - row) * 100 + 50;

  return { tile: clamped, row, col, x, y };
}

function createPRNG(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateBoard(seedInput?: number): BoardConfig {
  const seed = seedInput ?? Math.floor(Math.random() * 10000000);
  const random = createPRNG(seed);

  const numLadders = 6 + Math.floor(random() * 2); // 6 or 7 ladders
  const numSnakes = 6 + Math.floor(random() * 2);   // 6 or 7 snakes

  const usedStartTiles = new Set<number>([1, 100]); // 1 and 100 cannot have triggers
  const usedEndTiles = new Set<number>([1, 100]);
  const ladderDestinations = new Set<number>();
  const snakeDestinations = new Set<number>();

  const ladders: Ladder[] = [];
  const snakes: Snake[] = [];

  // Ladder length tiers: short (1-2 rows), medium (3-4 rows), long (5-7 rows)
  const ladderTiers = [
    { minRows: 1, maxRows: 2, count: 2 },
    { minRows: 3, maxRows: 4, count: 3 },
    { minRows: 5, maxRows: 7, count: numLadders - 5 }
  ];

  let ladderId = 1;
  for (const tier of ladderTiers) {
    for (let k = 0; k < tier.count; k++) {
      let attempts = 0;
      while (attempts < 100) {
        attempts++;
        const startRow = Math.floor(random() * (10 - tier.minRows - 1)); // row 0 to (9 - minRows)
        const rowDiff = tier.minRows + Math.floor(random() * (tier.maxRows - tier.minRows + 1));
        const endRow = Math.min(9, startRow + rowDiff);
        if (endRow <= startRow) continue;

        const startCol = Math.floor(random() * 10);
        const endCol = Math.floor(random() * 10);

        const from = (startRow % 2 === 0 ? startRow * 10 + startCol + 1 : startRow * 10 + (9 - startCol) + 1);
        const to = (endRow % 2 === 0 ? endRow * 10 + endCol + 1 : endRow * 10 + (9 - endCol) + 1);

        if (from <= 1 || from >= 98 || to >= 100 || to <= from) continue;
        if (usedStartTiles.has(from) || usedEndTiles.has(to)) continue;

        usedStartTiles.add(from);
        usedEndTiles.add(to);
        ladderDestinations.add(to);

        ladders.push({
          id: ladderId++,
          from,
          to,
          length: to - from,
          startRow,
          endRow
        });
        break;
      }
    }
  }

  // Snake length tiers: short (1-2 rows down), medium (3-4 rows down), long (5-7 rows down)
  const snakeTiers = [
    { minRows: 1, maxRows: 2, count: 2 },
    { minRows: 3, maxRows: 4, count: 3 },
    { minRows: 5, maxRows: 7, count: numSnakes - 5 }
  ];

  let snakeId = 1;
  for (const tier of snakeTiers) {
    for (let k = 0; k < tier.count; k++) {
      let attempts = 0;
      while (attempts < 100) {
        attempts++;
        const startRow = tier.minRows + Math.floor(random() * (10 - tier.minRows)); // row minRows to 9
        const rowDiff = tier.minRows + Math.floor(random() * (tier.maxRows - tier.minRows + 1));
        const endRow = Math.max(0, startRow - rowDiff);
        if (endRow >= startRow) continue;

        const startCol = Math.floor(random() * 10);
        const endCol = Math.floor(random() * 10);

        const from = (startRow % 2 === 0 ? startRow * 10 + startCol + 1 : startRow * 10 + (9 - startCol) + 1);
        const to = (endRow % 2 === 0 ? endRow * 10 + endCol + 1 : endRow * 10 + (9 - endCol) + 1);

        if (from >= 100 || from <= 15 || to <= 1 || to >= from) continue;
        if (usedStartTiles.has(from) || usedEndTiles.has(to)) continue;
        // Ensure no ladder lands directly on this snake head
        if (ladderDestinations.has(from)) continue;
        // Ensure this snake tail doesn't land on a ladder start
        if (usedStartTiles.has(to)) continue;

        usedStartTiles.add(from);
        usedEndTiles.add(to);
        snakeDestinations.add(to);

        snakes.push({
          id: snakeId++,
          from,
          to,
          length: from - to,
          startRow,
          endRow
        });
        break;
      }
    }
  }

  // Sort ladders by start tile, snakes by head tile for clean lookup
  ladders.sort((a, b) => a.from - b.from);
  snakes.sort((a, b) => b.from - a.from);

  return { seed, ladders, snakes };
}

export class SnakeLadderEngine {
  public phase: GamePhase = 'ROLL_FOR_START';
  public board: BoardConfig;
  public playerPos: number = 1;
  public opponentPos: number = 1;
  public currentTurn: PlayerId = 'player';
  public consecutiveDoubles: number = 0;
  public winner: PlayerId | null = null;

  // Starting roll duel state
  public playerInitialRoll: DiceRoll | null = null;
  public opponentInitialRoll: DiceRoll | null = null;
  public duelWinner: PlayerId | 'tie' | null = null;

  // Last in-game roll info
  public lastRoll: DiceRoll | null = null;

  constructor(boardConfig?: BoardConfig) {
    this.board = boardConfig || generateBoard();
    this.reset();
  }

  public reset(newBoardConfig?: BoardConfig) {
    if (newBoardConfig) {
      this.board = newBoardConfig;
    } else {
      this.board = generateBoard();
    }
    this.phase = 'ROLL_FOR_START';
    this.playerPos = 1;
    this.opponentPos = 1;
    this.currentTurn = 'player';
    this.consecutiveDoubles = 0;
    this.winner = null;
    this.playerInitialRoll = null;
    this.opponentInitialRoll = null;
    this.duelWinner = null;
    this.lastRoll = null;
  }

  // -------------------------------------------------------------
  // INITIAL ROLL DUEL
  // -------------------------------------------------------------
  public rollInitial(player: PlayerId, forcedRoll?: { d1: number; d2: number }): DiceRoll {
    const d1 = forcedRoll ? forcedRoll.d1 : Math.floor(Math.random() * 6) + 1;
    const d2 = forcedRoll ? forcedRoll.d2 : Math.floor(Math.random() * 6) + 1;
    const roll: DiceRoll = {
      d1,
      d2,
      total: d1 + d2,
      isDouble: d1 === d2
    };

    if (player === 'player') {
      this.playerInitialRoll = roll;
    } else {
      this.opponentInitialRoll = roll;
    }

    if (this.playerInitialRoll !== null && this.opponentInitialRoll !== null) {
      if (this.playerInitialRoll.total > this.opponentInitialRoll.total) {
        this.duelWinner = 'player';
        this.phase = 'START_CHOICE';
      } else if (this.opponentInitialRoll.total > this.playerInitialRoll.total) {
        this.duelWinner = 'opponent';
        this.phase = 'START_CHOICE';
      } else {
        this.duelWinner = 'tie';
        // Tied! Stays in ROLL_FOR_START, waiting to reroll
      }
    }

    return roll;
  }

  public resetTieRolls() {
    this.playerInitialRoll = null;
    this.opponentInitialRoll = null;
    this.duelWinner = null;
    this.phase = 'ROLL_FOR_START';
  }

  public chooseStartTurn(choice: 'start_first' | 'start_second') {
    if (this.duelWinner === 'player') {
      this.currentTurn = choice === 'start_first' ? 'player' : 'opponent';
    } else if (this.duelWinner === 'opponent') {
      this.currentTurn = choice === 'start_first' ? 'opponent' : 'player';
    } else {
      this.currentTurn = 'player';
    }
    this.phase = 'PLAYING';
  }

  // -------------------------------------------------------------
  // IN-GAME TURN & MOVEMENT
  // -------------------------------------------------------------
  public rollDice(forcedRoll?: { d1: number; d2: number }): DiceRoll {
    const d1 = forcedRoll ? forcedRoll.d1 : Math.floor(Math.random() * 6) + 1;
    const d2 = forcedRoll ? forcedRoll.d2 : Math.floor(Math.random() * 6) + 1;
    const roll: DiceRoll = {
      d1,
      d2,
      total: d1 + d2,
      isDouble: d1 === d2
    };
    this.lastRoll = roll;
    return roll;
  }

  public executeMove(playerId: PlayerId, dice: DiceRoll): MoveResult {
    const from = playerId === 'player' ? this.playerPos : this.opponentPos;
    const steps: MoveStep[] = [];
    let current = from;

    // 1. Step-by-step tile movement with bounce-back on overshoot
    let isBouncing = false;
    for (let i = 1; i <= dice.total; i++) {
      if (!isBouncing) {
        if (current < 100) {
          current += 1;
          steps.push({ tile: current, type: 'step' });
        } else {
          isBouncing = true;
          current -= 1;
          steps.push({ tile: current, type: 'bounce' });
        }
      } else {
        current -= 1;
        steps.push({ tile: current, type: 'bounce' });
      }
    }

    const landing = current;
    let finalPos = landing;
    let hitLadder: Ladder | undefined;
    let hitSnake: Snake | undefined;

    // 2. Check Ladder climb
    const ladder = this.board.ladders.find(l => l.from === landing);
    if (ladder) {
      hitLadder = ladder;
      finalPos = ladder.to;
      steps.push({ tile: finalPos, type: 'ladder' });
    }

    // 3. Check Snake slide
    const snake = this.board.snakes.find(s => s.from === landing);
    if (snake) {
      hitSnake = snake;
      finalPos = snake.to;
      steps.push({ tile: finalPos, type: 'snake' });
    }

    // 4. Update player position
    if (playerId === 'player') {
      this.playerPos = finalPos;
    } else {
      this.opponentPos = finalPos;
    }

    // 5. Win check
    const won = finalPos === 100;
    if (won) {
      this.winner = playerId;
      this.phase = 'GAME_OVER';
      return {
        playerId,
        from,
        to: finalPos,
        dice,
        steps,
        hitLadder,
        hitSnake,
        won: true,
        extraTurn: false
      };
    }

    // 6. Turn resolution & doubles
    let extraTurn = false;
    if (dice.isDouble) {
      if (this.consecutiveDoubles < 2) {
        extraTurn = true;
        this.consecutiveDoubles++;
        // Turn stays with playerId
      } else {
        // 3 consecutive doubles: pass turn
        this.consecutiveDoubles = 0;
        this.currentTurn = playerId === 'player' ? 'opponent' : 'player';
      }
    } else {
      this.consecutiveDoubles = 0;
      this.currentTurn = playerId === 'player' ? 'opponent' : 'player';
    }

    return {
      playerId,
      from,
      to: finalPos,
      dice,
      steps,
      hitLadder,
      hitSnake,
      won: false,
      extraTurn
    };
  }

  public getPlayerPosition(playerId: PlayerId): number {
    return playerId === 'player' ? this.playerPos : this.opponentPos;
  }
}
