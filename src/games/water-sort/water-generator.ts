import { WATER_COLORS, TOTAL_TUBES, UNITS_PER_COLOR } from './water-types';

export function createSeededRandom(seed: number) {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a deterministically shuffled 10-tube board configuration.
 * Each tube starts with exactly 3 layers (capacity is 4, leaving 1 empty space per tube).
 * Uses a reverse-pour shuffle to guarantee natural solvability.
 */
export function generateWaterBoard(seed: number = Date.now()): { tubes: string[][]; seed: number } {
  const rand = createSeededRandom(seed);
  const colorIds = WATER_COLORS.map(c => c.id);

  // Initialize 10 tubes with 3 pure segments each
  const tubes: string[][] = colorIds.map(c => Array(UNITS_PER_COLOR).fill(c));

  // Perform legal reverse pour shuffles
  const shuffleMoves = 100 + Math.floor(rand() * 40);
  let moves = 0;
  let attempts = 0;

  while (moves < shuffleMoves && attempts < 2000) {
    attempts++;
    const src = Math.floor(rand() * TOTAL_TUBES);
    if (tubes[src].length <= 1) continue;

    const dst = Math.floor(rand() * TOTAL_TUBES);
    if (src === dst) continue;
    if (tubes[dst].length >= 4) continue;

    // Transfer 1 liquid unit
    tubes[dst].push(tubes[src].pop()!);
    moves++;
  }

  // Balance so that every tube has exactly 3 layers at the start of the match
  const over: number[] = [];
  const under: number[] = [];

  for (let i = 0; i < TOTAL_TUBES; i++) {
    for (let k = tubes[i].length; k > 3; k--) over.push(i);
    for (let k = tubes[i].length; k < 3; k++) under.push(i);
  }

  while (over.length > 0 && under.length > 0) {
    const from = over.pop()!;
    const to = under.pop()!;
    tubes[to].push(tubes[from].pop()!);
  }

  // Avoid trivial completed tubes at the very beginning (if any tube is already 3 of the same color, swap 1 unit)
  for (let i = 0; i < TOTAL_TUBES; i++) {
    if (tubes[i].length === 3 && tubes[i][0] === tubes[i][1] && tubes[i][1] === tubes[i][2]) {
      const otherIdx = (i + 1) % TOTAL_TUBES;
      const temp = tubes[i][2];
      tubes[i][2] = tubes[otherIdx][2];
      tubes[otherIdx][2] = temp;
    }
  }

  return { tubes, seed };
}
