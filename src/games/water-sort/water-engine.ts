import {
  TUBE_CAPACITY,
  UNITS_PER_COLOR,
  TOTAL_TUBES,
  TOTAL_COLORS,
  type MoveRecord,
  type WaterGameState
} from './water-types';

export class WaterEngine {
  private initialTubes: string[][];
  public state: WaterGameState;
  private undoStack: MoveRecord[] = [];

  constructor(initialTubes: string[][]) {
    this.initialTubes = initialTubes.map(t => [...t]);
    this.state = {
      tubes: initialTubes.map(t => [...t]),
      reservoir: {
        color: null,
        count: 0,
        maxCapacity: UNITS_PER_COLOR
      },
      completedColors: [],
      score: 0,
      moveCount: 0,
      isWon: false
    };
  }

  public getTopColor(tubeIndex: number): string | null {
    const tube = this.state.tubes[tubeIndex];
    if (!tube || tube.length === 0) return null;
    return tube[tube.length - 1];
  }

  public getContiguousTopCount(tubeIndex: number): { color: string; count: number } | null {
    const tube = this.state.tubes[tubeIndex];
    if (!tube || tube.length === 0) return null;
    const color = tube[tube.length - 1];
    let count = 0;
    for (let i = tube.length - 1; i >= 0; i--) {
      if (tube[i] === color) count++;
      else break;
    }
    return { color, count };
  }

  public canPour(srcIndex: number, dstIndex: number): { valid: boolean; count: number; color?: string } {
    if (srcIndex === dstIndex) return { valid: false, count: 0 };
    if (srcIndex < 0 || srcIndex >= TOTAL_TUBES || dstIndex < 0 || dstIndex >= TOTAL_TUBES) {
      return { valid: false, count: 0 };
    }

    const src = this.state.tubes[srcIndex];
    const dst = this.state.tubes[dstIndex];
    if (src.length === 0) return { valid: false, count: 0 };
    if (dst.length >= TUBE_CAPACITY) return { valid: false, count: 0 };

    const topInfo = this.getContiguousTopCount(srcIndex);
    if (!topInfo) return { valid: false, count: 0 };

    const dstTop = this.getTopColor(dstIndex);
    // Valid if destination is empty OR destination top matches source top
    if (dstTop !== null && dstTop !== topInfo.color) {
      return { valid: false, count: 0 };
    }

    // How many units can destination receive?
    const freeSpace = TUBE_CAPACITY - dst.length;
    const pourCount = Math.min(topInfo.count, freeSpace);

    return { valid: pourCount > 0, count: pourCount, color: topInfo.color };
  }

  public canPourToReservoir(srcIndex: number): { valid: boolean; count: number; color?: string } {
    if (srcIndex < 0 || srcIndex >= TOTAL_TUBES) return { valid: false, count: 0 };
    const src = this.state.tubes[srcIndex];
    if (src.length === 0) return { valid: false, count: 0 };

    const topInfo = this.getContiguousTopCount(srcIndex);
    if (!topInfo) return { valid: false, count: 0 };

    const res = this.state.reservoir;
    // Allowed if reservoir is empty, or matches current locked color and has space
    if (res.color !== null && res.color !== topInfo.color) {
      return { valid: false, count: 0 };
    }

    const remainingSpace = res.maxCapacity - res.count;
    if (remainingSpace <= 0) return { valid: false, count: 0 };

    const pourCount = Math.min(topInfo.count, remainingSpace);
    return { valid: pourCount > 0, count: pourCount, color: topInfo.color };
  }

  public pour(srcIndex: number, dstIndex: number): {
    success: boolean;
    color: string;
    count: number;
    srcIndex: number;
    dstIndex: number;
  } | null {
    const check = this.canPour(srcIndex, dstIndex);
    if (!check.valid || !check.color) return null;

    const record: MoveRecord = {
      type: 'tube_to_tube',
      srcIndex,
      dstIndex,
      color: check.color,
      count: check.count,
      prevReservoirColor: this.state.reservoir.color,
      prevReservoirCount: this.state.reservoir.count
    };

    // Execute transfer
    for (let i = 0; i < check.count; i++) {
      this.state.tubes[srcIndex].pop();
      this.state.tubes[dstIndex].push(check.color);
    }

    this.undoStack.push(record);
    this.state.moveCount++;

    return {
      success: true,
      color: check.color,
      count: check.count,
      srcIndex,
      dstIndex
    };
  }

  public pourToReservoir(srcIndex: number): {
    success: boolean;
    color: string;
    count: number;
    isCompleted: boolean;
    isWon: boolean;
    prevReservoirCount: number;
    newReservoirCount: number;
  } | null {
    const check = this.canPourToReservoir(srcIndex);
    if (!check.valid || !check.color) return null;

    const prevResColor = this.state.reservoir.color;
    const prevResCount = this.state.reservoir.count;
    const color = check.color;
    const count = check.count;

    // Pop from source tube
    for (let i = 0; i < count; i++) {
      this.state.tubes[srcIndex].pop();
    }

    this.state.reservoir.color = color;
    this.state.reservoir.count += count;
    const newCount = this.state.reservoir.count;

    let isCompleted = false;
    let completedColor: string | null = null;

    // Check if full (3/3 units)
    if (this.state.reservoir.count >= this.state.reservoir.maxCapacity) {
      isCompleted = true;
      completedColor = color;
      this.state.completedColors.push(color);
      this.state.score++;

      // Reset reservoir to empty for next color selection!
      this.state.reservoir.color = null;
      this.state.reservoir.count = 0;

      if (this.state.score >= TOTAL_COLORS) {
        this.state.isWon = true;
      }
    }

    const record: MoveRecord = {
      type: 'tube_to_reservoir',
      srcIndex,
      color,
      count,
      prevReservoirColor: prevResColor,
      prevReservoirCount: prevResCount,
      completedColor
    };

    this.undoStack.push(record);
    this.state.moveCount++;

    return {
      success: true,
      color,
      count,
      isCompleted,
      isWon: this.state.isWon,
      prevReservoirCount: prevResCount,
      newReservoirCount: newCount
    };
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public undo(): MoveRecord | null {
    if (this.undoStack.length === 0) return null;
    const record = this.undoStack.pop()!;

    if (record.type === 'tube_to_tube' && record.dstIndex !== undefined) {
      // Revert tube to tube transfer
      for (let i = 0; i < record.count; i++) {
        this.state.tubes[record.dstIndex].pop();
        this.state.tubes[record.srcIndex].push(record.color);
      }
    } else if (record.type === 'tube_to_reservoir') {
      // Revert tube to reservoir
      if (record.completedColor) {
        // Uncomplete color
        this.state.completedColors = this.state.completedColors.filter(c => c !== record.completedColor);
        this.state.score--;
        this.state.isWon = false;
      }
      this.state.reservoir.color = record.prevReservoirColor;
      this.state.reservoir.count = record.prevReservoirCount;
      for (let i = 0; i < record.count; i++) {
        this.state.tubes[record.srcIndex].push(record.color);
      }
    }

    this.state.moveCount = Math.max(0, this.state.moveCount - 1);
    return record;
  }

  public reset() {
    this.state.tubes = this.initialTubes.map(t => [...t]);
    this.state.reservoir = {
      color: null,
      count: 0,
      maxCapacity: UNITS_PER_COLOR
    };
    this.state.completedColors = [];
    this.state.score = 0;
    this.state.moveCount = 0;
    this.state.isWon = false;
    this.undoStack = [];
  }

  /**
   * Smart hint recommendation:
   * 1. Check if any tube top matches the current locked reservoir color (or can start reservoir).
   * 2. Check if moving a block creates space or merges identical colors.
   */
  public getHint(): { type: 'reservoir' | 'tube'; srcIndex: number; dstIndex?: number } | null {
    // 1. Highest priority: Pour into reservoir if it has a locked color
    if (this.state.reservoir.color) {
      for (let i = 0; i < TOTAL_TUBES; i++) {
        const p = this.canPourToReservoir(i);
        if (p.valid && p.color === this.state.reservoir.color) {
          return { type: 'reservoir', srcIndex: i };
        }
      }
    }

    // 2. Can we start filling the reservoir with an available color?
    if (this.state.reservoir.color === null) {
      // Find color that has multiple units accessible on top
      const topColorCounts = new Map<string, number>();
      for (let i = 0; i < TOTAL_TUBES; i++) {
        const top = this.getTopColor(i);
        if (top) topColorCounts.set(top, (topColorCounts.get(top) || 0) + 1);
      }
      // Prefer color with highest top frequency
      let bestColor: string | null = null;
      let maxFreq = 0;
      for (const [col, freq] of topColorCounts.entries()) {
        if (freq > maxFreq) {
          maxFreq = freq;
          bestColor = col;
        }
      }
      if (bestColor) {
        for (let i = 0; i < TOTAL_TUBES; i++) {
          if (this.getTopColor(i) === bestColor) {
            return { type: 'reservoir', srcIndex: i };
          }
        }
      }
    }

    // 3. Merging identical colors between tubes (to consolidate and free space)
    for (let i = 0; i < TOTAL_TUBES; i++) {
      for (let j = 0; j < TOTAL_TUBES; j++) {
        if (i === j) continue;
        const check = this.canPour(i, j);
        if (check.valid && this.state.tubes[j].length > 0) {
          return { type: 'tube', srcIndex: i, dstIndex: j };
        }
      }
    }

    // 4. Any valid move to empty tube
    for (let i = 0; i < TOTAL_TUBES; i++) {
      for (let j = 0; j < TOTAL_TUBES; j++) {
        if (i === j) continue;
        const check = this.canPour(i, j);
        if (check.valid) {
          return { type: 'tube', srcIndex: i, dstIndex: j };
        }
      }
    }

    return null;
  }
}
