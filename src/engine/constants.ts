export const COLS = 10;
export const ROWS = 20;
export const BUFFER_ROWS = 4; // Spawn & buffer area above visible board
export const TOTAL_ROWS = ROWS + BUFFER_ROWS;

export type TetrominoType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';

export interface TetrominoShape {
  type: TetrominoType;
  color: string;
  glowColor: string;
  // Rotations: 0 = spawn, 1 = 90 deg (R), 2 = 180 deg (2), 3 = 270 deg (L)
  rotations: number[][][];
}

// Standard Tetris Guideline Colors & Shapes
export const TETROMINOES: Record<TetrominoType, TetrominoShape> = {
  I: {
    type: 'I',
    color: '#00f0ff', // Cyan
    glowColor: 'rgba(0, 240, 255, 0.6)',
    rotations: [
      [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
      ],
      [
        [0, 0, 1, 0],
        [0, 0, 1, 0],
        [0, 0, 1, 0],
        [0, 0, 1, 0]
      ],
      [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0]
      ],
      [
        [0, 1, 0, 0],
        [0, 1, 0, 0],
        [0, 1, 0, 0],
        [0, 1, 0, 0]
      ]
    ]
  },
  J: {
    type: 'J',
    color: '#0048ff', // Blue
    glowColor: 'rgba(0, 72, 255, 0.6)',
    rotations: [
      [
        [1, 0, 0],
        [1, 1, 1],
        [0, 0, 0]
      ],
      [
        [0, 1, 1],
        [0, 1, 0],
        [0, 1, 0]
      ],
      [
        [0, 0, 0],
        [1, 1, 1],
        [0, 0, 1]
      ],
      [
        [0, 1, 0],
        [0, 1, 0],
        [1, 1, 0]
      ]
    ]
  },
  L: {
    type: 'L',
    color: '#ff8800', // Orange
    glowColor: 'rgba(255, 136, 0, 0.6)',
    rotations: [
      [
        [0, 0, 1],
        [1, 1, 1],
        [0, 0, 0]
      ],
      [
        [0, 1, 0],
        [0, 1, 0],
        [0, 1, 1]
      ],
      [
        [0, 0, 0],
        [1, 1, 1],
        [1, 0, 0]
      ],
      [
        [1, 1, 0],
        [0, 1, 0],
        [0, 1, 0]
      ]
    ]
  },
  O: {
    type: 'O',
    color: '#ffe600', // Yellow
    glowColor: 'rgba(255, 230, 0, 0.6)',
    rotations: [
      [
        [1, 1],
        [1, 1]
      ],
      [
        [1, 1],
        [1, 1]
      ],
      [
        [1, 1],
        [1, 1]
      ],
      [
        [1, 1],
        [1, 1]
      ]
    ]
  },
  S: {
    type: 'S',
    color: '#00ff66', // Green
    glowColor: 'rgba(0, 255, 102, 0.6)',
    rotations: [
      [
        [0, 1, 1],
        [1, 1, 0],
        [0, 0, 0]
      ],
      [
        [0, 1, 0],
        [0, 1, 1],
        [0, 0, 1]
      ],
      [
        [0, 0, 0],
        [0, 1, 1],
        [1, 1, 0]
      ],
      [
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0]
      ]
    ]
  },
  T: {
    type: 'T',
    color: '#9d00ff', // Purple
    glowColor: 'rgba(157, 0, 255, 0.6)',
    rotations: [
      [
        [0, 1, 0],
        [1, 1, 1],
        [0, 0, 0]
      ],
      [
        [0, 1, 0],
        [0, 1, 1],
        [0, 1, 0]
      ],
      [
        [0, 0, 0],
        [1, 1, 1],
        [0, 1, 0]
      ],
      [
        [0, 1, 0],
        [1, 1, 0],
        [0, 1, 0]
      ]
    ]
  },
  Z: {
    type: 'Z',
    color: '#ff0055', // Red
    glowColor: 'rgba(255, 0, 85, 0.6)',
    rotations: [
      [
        [1, 1, 0],
        [0, 1, 1],
        [0, 0, 0]
      ],
      [
        [0, 0, 1],
        [0, 1, 1],
        [0, 1, 0]
      ],
      [
        [0, 0, 0],
        [1, 1, 0],
        [0, 1, 1]
      ],
      [
        [0, 1, 0],
        [1, 1, 0],
        [1, 0, 0]
      ]
    ]
  }
};

// Standard SRS Wall Kick Offsets for J, L, S, T, Z
export const SRS_KICKS_NORMAL: Record<string, [number, number][]> = {
  '0->1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1->0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1->2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2->1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2->3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3->2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3->0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0->3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};

// Standard SRS Wall Kick Offsets for I
export const SRS_KICKS_I: Record<string, [number, number][]> = {
  '0->1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1->0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1->2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2->1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2->3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3->2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3->0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0->3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

// 1v1 Battle Garbage Line Calculations
export function calculateGarbage(linesCleared: number, isTSpin: boolean = false, combo: number = 0, isB2B: boolean = false): number {
  if (linesCleared === 0) return 0;

  let base = 0;
  if (isTSpin) {
    if (linesCleared === 1) base = 2;
    else if (linesCleared === 2) base = 4;
    else if (linesCleared === 3) base = 6;
  } else {
    if (linesCleared === 1) base = 0;
    else if (linesCleared === 2) base = 1;
    else if (linesCleared === 3) base = 2;
    else if (linesCleared === 4) base = 4; // Tetris!
  }

  // Back-to-Back bonus (Tetris or T-spin)
  if (isB2B && (linesCleared === 4 || isTSpin)) {
    base += 1;
  }

  // Combo attack bonus table
  let comboBonus = 0;
  if (combo >= 1) {
    if (combo <= 2) comboBonus = 1;
    else if (combo <= 4) comboBonus = 2;
    else if (combo <= 6) comboBonus = 3;
    else if (combo <= 8) comboBonus = 4;
    else comboBonus = 5;
  }

  return base + comboBonus;
}
