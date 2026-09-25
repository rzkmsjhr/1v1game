import { AIDifficulty } from '../../types';
import { SnakeLadderEngine } from '../snake-ladder-engine';

export class SnakeLadderAI {
  private difficulty: AIDifficulty;

  constructor(difficulty: AIDifficulty = 'medium') {
    this.difficulty = difficulty;
  }

  public getThinkingDelay(): number {
    switch (this.difficulty) {
      case 'easy':
        return 700 + Math.random() * 400;
      case 'medium':
        return 800 + Math.random() * 500;
      case 'hard':
      case 'extreme':
        return 900 + Math.random() * 400;
    }
  }

  public decideStartChoice(_engine: SnakeLadderEngine): 'start_first' | 'start_second' {
    if (this.difficulty === 'easy' && Math.random() < 0.25) {
      return 'start_second';
    }
    // High tempo: playing first gives significant mathematical edge
    return 'start_first';
  }

  public reset(): void {
    // Stateless delay calculator, reset hook for interface parity
  }
}
