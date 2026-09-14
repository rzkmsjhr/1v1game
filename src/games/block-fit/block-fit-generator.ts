// Procedural Silhouette & Polyomino Decomposition Generator for Block Fit Duel
import type { CellCoord, BlockColor, PolyominoPiece, TrayDefinition, RoundPuzzle } from './block-fit-types';

// Vibrant Tetris-style jewel colors with 3D specular bevel shading
export const BLOCK_COLORS: BlockColor[] = [
  {
    id: 'cyan',
    name: 'Cyan Diamond',
    primary: '#06b6d4',
    light: '#67e8f9',
    dark: '#0e7490',
    border: '#22d3ee',
    glow: 'rgba(6, 182, 212, 0.45)'
  },
  {
    id: 'gold',
    name: 'Topaz Gold',
    primary: '#eab308',
    light: '#fef08a',
    dark: '#a16207',
    border: '#fde047',
    glow: 'rgba(234, 179, 8, 0.45)'
  },
  {
    id: 'purple',
    name: 'Amethyst Purple',
    primary: '#a855f7',
    light: '#e9d5ff',
    dark: '#7e22ce',
    border: '#c084fc',
    glow: 'rgba(168, 85, 247, 0.45)'
  },
  {
    id: 'green',
    name: 'Emerald Green',
    primary: '#22c55e',
    light: '#bbf7d0',
    dark: '#15803d',
    border: '#4ade80',
    glow: 'rgba(34, 197, 94, 0.45)'
  },
  {
    id: 'red',
    name: 'Ruby Crimson',
    primary: '#ef4444',
    light: '#fecaca',
    dark: '#b91c1c',
    border: '#f87171',
    glow: 'rgba(239, 68, 68, 0.45)'
  },
  {
    id: 'blue',
    name: 'Sapphire Blue',
    primary: '#3b82f6',
    light: '#bfdbfe',
    dark: '#1d4ed8',
    border: '#60a5fa',
    glow: 'rgba(59, 130, 246, 0.45)'
  },
  {
    id: 'orange',
    name: 'Amber Orange',
    primary: '#f97316',
    light: '#fed7aa',
    dark: '#c2410c',
    border: '#fb923c',
    glow: 'rgba(249, 115, 22, 0.45)'
  },
  {
    id: 'rose',
    name: 'Neon Magenta',
    primary: '#ec4899',
    light: '#fbcfe8',
    dark: '#be185d',
    border: '#f472b6',
    glow: 'rgba(236, 72, 153, 0.45)'
  },
  {
    id: 'lime',
    name: 'Electric Lime',
    primary: '#84cc16',
    light: '#d9f99d',
    dark: '#4d7c0f',
    border: '#a3e635',
    glow: 'rgba(132, 204, 22, 0.45)'
  }
];

// Mulberry32 seeded deterministic PRNG
class SeededRNG {
  private s: number;
  constructor(seed: number) {
    this.s = seed | 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  shuffle<T>(arr: T[]): T[] {
    const res = [...arr];
    for (let i = res.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [res[i], res[j]] = [res[j], res[i]];
    }
    return res;
  }
}

// Preset Non-Rectangular Silhouettes (Strings where '#' = cell, '.' = empty space)
interface SilhouettePreset {
  name: string;
  grid: string[];
}

const SILHOUETTE_PRESETS: SilhouettePreset[] = [
  {
    name: 'Royal Crown',
    grid: [
      '#...#...#',
      '##..#..##',
      '.#######.',
      '..#####..'
    ]
  },
  {
    name: 'Knight Shield',
    grid: [
      '#######',
      '#######',
      '.#####.',
      '.#####.',
      '..###..',
      '...#...'
    ]
  },
  {
    name: 'Pixel Heart',
    grid: [
      '.##.##.',
      '#######',
      '#######',
      '.#####.',
      '..###..',
      '...#...'
    ]
  },
  {
    name: 'Cross Star',
    grid: [
      '..###..',
      '..###..',
      '#######',
      '#######',
      '..###..',
      '..###..'
    ]
  },
  {
    name: 'Diamond Crest',
    grid: [
      '...#...',
      '..###..',
      '.#####.',
      '#######',
      '.#####.',
      '..###..',
      '...#...'
    ]
  },
  {
    name: 'Flying Butterfly',
    grid: [
      '##...##',
      '###.###',
      '.##.##.',
      '###.###',
      '##...##'
    ]
  },
  {
    name: 'Staircase Pyramid',
    grid: [
      '....#',
      '...##',
      '..###',
      '.####',
      '#####'
    ]
  },
  {
    name: 'Thunderbolt',
    grid: [
      '..####',
      '.####.',
      '####..',
      '..####',
      '..###.',
      '...#..'
    ]
  },
  {
    name: 'Victory Trophy',
    grid: [
      '#..###..#',
      '#########',
      '.#######.',
      '..#####..',
      '...###...',
      '..#####..'
    ]
  },
  {
    name: 'Space Invader',
    grid: [
      '.#...#.',
      '..#.#..',
      '.#####.',
      '##.#.##',
      '#######',
      '#.#.#.#'
    ]
  },
  {
    name: 'Stepped Donut',
    grid: [
      '.#####.',
      '#######',
      '##...##',
      '##...##',
      '#######',
      '.#####.'
    ]
  },
  {
    name: 'Mecha Crab',
    grid: [
      '#.....#',
      '##...##',
      '.#####.',
      '#######',
      '.##.##.',
      '#.....#'
    ]
  },
  {
    name: 'Anchor Seal',
    grid: [
      '..###..',
      '...#...',
      '#######',
      '...#...',
      '#..#..#',
      '.#####.'
    ]
  },
  {
    name: 'Castle Fortress',
    grid: [
      '#.#.#.#',
      '#######',
      '.#####.',
      '.#####.',
      '#######',
      '##...##'
    ]
  },
  {
    name: 'Hourglass',
    grid: [
      '#######',
      '.#####.',
      '..###..',
      '...#...',
      '..###..',
      '.#####.',
      '#######'
    ]
  },
  {
    name: 'Hexagon Matrix',
    grid: [
      '..###..',
      '.#####.',
      '#######',
      '#######',
      '.#####.',
      '..###..'
    ]
  }
];

// Procedural cellular cluster generator for limitless random shapes
function generateOrganicSilhouette(rng: SeededRNG, targetCells: number = 18): { name: string; cells: CellCoord[]; rows: number; cols: number } {
  const gridSize = 7;
  const grid: boolean[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill(false));
  const centerR = 3;
  const centerC = 3;
  grid[centerR][centerC] = true;

  const cells: CellCoord[] = [{ r: centerR, c: centerC }];
  const neighbors = [
    { r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 }
  ];

  while (cells.length < targetCells) {
    const candidateList: CellCoord[] = [];
    for (const cell of cells) {
      for (const n of neighbors) {
        const nr = cell.r + n.r;
        const nc = cell.c + n.c;
        if (nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize && !grid[nr][nc]) {
          candidateList.push({ r: nr, c: nc });
        }
      }
    }
    if (candidateList.length === 0) break;
    const picked = rng.pick(candidateList);
    grid[picked.r][picked.c] = true;
    cells.push(picked);
  }

  // Normalize bounds
  let minR = gridSize, maxR = 0, minC = gridSize, maxC = 0;
  for (const c of cells) {
    minR = Math.min(minR, c.r);
    maxR = Math.max(maxR, c.r);
    minC = Math.min(minC, c.c);
    maxC = Math.max(maxC, c.c);
  }

  const normCells = cells.map(c => ({ r: c.r - minR, c: c.c - minC }));
  const rows = maxR - minR + 1;
  const cols = maxC - minC + 1;

  const names = ['Nebula Cluster', 'Astral Shard', 'Geo Crystal', 'Cosmic Monolith', 'Quantum Poly'];
  return {
    name: rng.pick(names),
    cells: normCells,
    rows,
    cols
  };
}

// Parse preset grid string into cells
function parsePreset(preset: SilhouettePreset): { name: string; cells: CellCoord[]; rows: number; cols: number } {
  const cells: CellCoord[] = [];
  const rows = preset.grid.length;
  let maxCols = 0;
  for (let r = 0; r < rows; r++) {
    const line = preset.grid[r];
    maxCols = Math.max(maxCols, line.length);
    for (let c = 0; c < line.length; c++) {
      if (line[c] === '#') {
        cells.push({ r, c });
      }
    }
  }
  return {
    name: preset.name,
    cells,
    rows,
    cols: maxCols
  };
}

// Reverse Partition Algorithm: Carve tray silhouette into 4-6 connected polyomino pieces
function partitionSilhouette(
  cells: CellCoord[],
  rows: number,
  cols: number,
  rng: SeededRNG
): PolyominoPiece[] | null {
  const total = cells.length;
  // Desired pieces: total / 4 (target piece size: 3 to 5 blocks)
  const targetPieceCount = Math.max(4, Math.min(6, Math.round(total / 4)));

  const cellMap = new Map<string, boolean>();
  for (const c of cells) {
    cellMap.set(`${c.r},${c.c}`, true);
  }

  const assigned = new Map<string, number>(); // key -> pieceIndex
  const piecesCells: CellCoord[][] = [];

  const neighbors = [
    { r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 }
  ];

  // Try up to 20 partition attempts to find a clean connected decomposition
  for (let attempt = 0; attempt < 20; attempt++) {
    assigned.clear();
    piecesCells.length = 0;

    let unassigned = [...cells];
    let fail = false;

    for (let pIdx = 0; pIdx < targetPieceCount; pIdx++) {
      if (unassigned.length === 0) break;

      // Desired size for this piece
      const isLast = pIdx === targetPieceCount - 1;
      let targetSize: number;
      if (isLast) {
        targetSize = unassigned.length;
      } else {
        const remainingPieces = targetPieceCount - pIdx;
        const avg = Math.round(unassigned.length / remainingPieces);
        targetSize = Math.max(3, Math.min(5, avg + rng.nextInt(-1, 1)));
      }

      // Pick starting seed (corner or edge preferred)
      const seedCell = rng.pick(unassigned);
      const piece: CellCoord[] = [seedCell];
      assigned.set(`${seedCell.r},${seedCell.c}`, pIdx);

      // Expand piece connectedly
      while (piece.length < targetSize) {
        const frontier: CellCoord[] = [];
        for (const c of piece) {
          for (const n of neighbors) {
            const nr = c.r + n.r;
            const nc = c.c + n.c;
            const key = `${nr},${nc}`;
            if (cellMap.has(key) && !assigned.has(key) && !frontier.some(f => f.r === nr && f.c === nc)) {
              frontier.push({ r: nr, c: nc });
            }
          }
        }
        if (frontier.length === 0) break; // Can't grow further
        const nextCell = rng.pick(frontier);
        piece.push(nextCell);
        assigned.set(`${nextCell.r},${nextCell.c}`, pIdx);
      }

      piecesCells.push(piece);
      unassigned = cells.filter(c => !assigned.has(`${c.r},${c.c}`));
    }

    // Merge any leftover unassigned cells into adjacent pieces
    if (unassigned.length > 0) {
      for (const rem of unassigned) {
        let merged = false;
        for (const n of neighbors) {
          const key = `${rem.r + n.r},${rem.c + n.c}`;
          if (assigned.has(key)) {
            const pIdx = assigned.get(key)!;
            piecesCells[pIdx].push(rem);
            assigned.set(`${rem.r},${rem.c}`, pIdx);
            merged = true;
            break;
          }
        }
        if (!merged) {
          fail = true;
          break;
        }
      }
    }

    // Verify all pieces have at least 3 cells and at most 6 cells
    if (!fail && piecesCells.every(p => p.length >= 3 && p.length <= 6)) {
      // Success! Build PolyominoPieces
      const shuffledColors = rng.shuffle(BLOCK_COLORS);
      const pieces: PolyominoPiece[] = piecesCells.map((rawCells, i) => {
        let minR = rows, maxR = 0, minC = cols, maxC = 0;
        for (const c of rawCells) {
          minR = Math.min(minR, c.r);
          maxR = Math.max(maxR, c.r);
          minC = Math.min(minC, c.c);
          maxC = Math.max(maxC, c.c);
        }

        const normCells: CellCoord[] = rawCells.map(c => ({
          r: c.r - minR,
          c: c.c - minC
        }));

        // Sort normalized cells for consistent rendering
        normCells.sort((a, b) => a.r !== b.r ? a.r - b.r : a.c - b.c);

        return {
          id: `piece-${i + 1}`,
          cells: normCells,
          color: shuffledColors[i % shuffledColors.length],
          width: maxC - minC + 1,
          height: maxR - minR + 1,
          solutionR: minR,
          solutionC: minC
        };
      });

      return pieces;
    }
  }

  return null;
}

/**
 * Generate a complete, mathematically guaranteed solvable RoundPuzzle
 * @param seed - Numeric seed for reproducible multiplayer puzzles
 * @param roundNumber - 1 to 5
 */
export function generateRoundPuzzle(seed: number, roundNumber: number): RoundPuzzle {
  const rng = new SeededRNG(seed + roundNumber * 7919);

  let rawSilhouette: { name: string; cells: CellCoord[]; rows: number; cols: number } = parsePreset(SILHOUETTE_PRESETS[0]);
  let pieces: PolyominoPiece[] | null = null;

  // Attempt until a guaranteed valid partition is generated
  for (let retry = 0; retry < 50; retry++) {
    if (roundNumber <= SILHOUETTE_PRESETS.length) {
      // Pick varied preset based on round & seed
      const presetIdx = (roundNumber - 1 + rng.nextInt(0, 2)) % SILHOUETTE_PRESETS.length;
      rawSilhouette = parsePreset(SILHOUETTE_PRESETS[presetIdx]);
    } else {
      rawSilhouette = generateOrganicSilhouette(rng, rng.nextInt(16, 22));
    }

    pieces = partitionSilhouette(rawSilhouette.cells, rawSilhouette.rows, rawSilhouette.cols, rng);
    if (pieces && pieces.length >= 4) {
      break;
    }
  }

  // Fallback to Diamond Crest if random partition took too long
  if (!pieces) {
    rawSilhouette = parsePreset(SILHOUETTE_PRESETS[4]);
    pieces = partitionSilhouette(rawSilhouette.cells, rawSilhouette.rows, rawSilhouette.cols, rng) || [];
  }

  // Build Tray mask grid
  const mask: boolean[][] = Array.from({ length: rawSilhouette.rows }, () =>
    Array(rawSilhouette.cols).fill(false)
  );
  for (const c of rawSilhouette.cells) {
    mask[c.r][c.c] = true;
  }

  const tray: TrayDefinition = {
    id: `tray-r${roundNumber}-${seed}`,
    name: rawSilhouette.name,
    rows: rawSilhouette.rows,
    cols: rawSilhouette.cols,
    mask,
    cellCount: rawSilhouette.cells.length
  };

  // Shuffle pieces array so pieces appear randomly in player's dock
  const shuffledPieces = rng.shuffle(pieces);

  return {
    seed,
    roundNumber,
    tray,
    pieces: shuffledPieces
  };
}
