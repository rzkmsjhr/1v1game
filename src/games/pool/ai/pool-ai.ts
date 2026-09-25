import { AIDifficulty } from '../../types';
import {
  BALL_DEFS,
  BALL_RADIUS,
  CENTER_X,
  CENTER_Y,
  HEAD_STRING_X,
  POCKETS,
  PLAY_X_MAX,
  PLAY_X_MIN,
  PLAY_Y_MAX,
  PLAY_Y_MIN
} from '../engine/pool-constants';
import { PoolEngine } from '../engine/pool-engine';
import { PoolBall } from '../engine/pool-physics';

export interface AIShotPlan {
  angle: number;
  power: number;
}

export class PoolAI {
  public difficulty: AIDifficulty;

  constructor(difficulty: AIDifficulty = 'medium') {
    this.difficulty = difficulty;
  }

  public reset(): void {
    // Stateless AI resets cleanly
  }

  // Calculate lag shot power based on AI difficulty
  public getLagShotPower(): number {
    // Perfect distance power is ~0.615
    let noise = 0;
    switch (this.difficulty) {
      case 'easy':
        noise = (Math.random() - 0.5) * 0.28;
        break;
      case 'medium':
        noise = (Math.random() - 0.5) * 0.12;
        break;
      case 'hard':
        noise = (Math.random() - 0.5) * 0.04;
        break;
      case 'extreme':
        noise = (Math.random() - 0.5) * 0.012;
        break;
    }
    return Math.max(0.42, Math.min(0.80, 0.615 + noise));
  }

  // Decide whether to break or pass break
  public decideBreakOption(): 'break' | 'pass' {
    if (this.difficulty === 'easy') return Math.random() < 0.75 ? 'break' : 'pass';
    return Math.random() < 0.95 ? 'break' : 'pass';
  }

  // Find strategic cue ball placement when AI has ball in hand
  public planBallInHandPlacement(engine: PoolEngine): { x: number; y: number } {
    const r = BALL_RADIUS;

    if (engine.ballInHandKitchenOnly) {
      const kitchenMaxX = HEAD_STRING_X - r - 6;
      // Tactical variation for break position: center or slight offset
      const breakYOptions = [CENTER_Y, CENTER_Y - 30, CENTER_Y + 30, CENTER_Y - 55, CENTER_Y + 55];
      const selectedY = breakYOptions[Math.floor(Math.random() * breakYOptions.length)];
      return { x: kitchenMaxX - 8, y: selectedY };
    }

    const legalBalls = this.getLegalTargetBalls(engine);
    const minX = PLAY_X_MIN + r * 2.5;
    const maxX = PLAY_X_MAX - r * 2.5;
    const minY = PLAY_Y_MIN + r * 2.5;
    const maxY = PLAY_Y_MAX - r * 2.5;

    let bestCandidate: { x: number; y: number } | null = null;
    let bestScore = -99999;

    // Evaluate placing cue ball directly behind legal balls for a straight pot
    for (const target of legalBalls) {
      for (const pocket of POCKETS) {
        const tpDx = pocket.x - target.x;
        const tpDy = pocket.y - target.y;
        const tpDist = Math.hypot(tpDx, tpDy);
        if (tpDist < 10) continue;

        // Check if path from target to pocket is clear
        if (!this.isPathClear(target.x, target.y, pocket.x, pocket.y, engine.balls, [0, target.id])) {
          continue;
        }

        const dirX = tpDx / tpDist;
        const dirY = tpDy / tpDist;

        // Test comfortable distances along the shot line
        for (const distFromTarget of [110, 140, 85, 160]) {
          const candX = target.x - dirX * distFromTarget;
          const candY = target.y - dirY * distFromTarget;

          if (candX < minX || candX > maxX || candY < minY || candY > maxY) continue;

          // Check clearance from other balls
          const collides = engine.balls.some(
            b => b.id !== 0 && !b.isPotted && Math.hypot(b.x - candX, b.y - candY) < r * 2 + 5
          );
          if (collides) continue;

          // Check path from candidate to target
          if (!this.isPathClear(candX, candY, target.x, target.y, engine.balls, [0, target.id])) {
            continue;
          }

          // Shorter distance to pocket is preferred and reliable
          const score = 1000 - tpDist - Math.abs(distFromTarget - 120);
          if (score > bestScore) {
            bestScore = score;
            bestCandidate = { x: candX, y: candY };
          }
        }
      }
    }

    if (bestCandidate) {
      return bestCandidate;
    }

    // Fallback candidates across table
    const testPositions = [
      { x: HEAD_STRING_X, y: CENTER_Y },
      { x: HEAD_STRING_X, y: CENTER_Y - 80 },
      { x: HEAD_STRING_X, y: CENTER_Y + 80 },
      { x: CENTER_X, y: CENTER_Y },
      { x: CENTER_X - 100, y: CENTER_Y - 60 },
      { x: CENTER_X - 100, y: CENTER_Y + 60 },
      { x: CENTER_X + 100, y: CENTER_Y - 60 },
      { x: CENTER_X + 100, y: CENTER_Y + 60 }
    ];

    for (const pos of testPositions) {
      const collides = engine.balls.some(
        b => b.id !== 0 && !b.isPotted && Math.hypot(b.x - pos.x, b.y - pos.y) < r * 2 + 5
      );
      if (!collides) {
        return pos;
      }
    }

    // Guaranteed spiral search
    let spiralR = 20;
    while (spiralR < 350) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        const sx = HEAD_STRING_X + Math.cos(angle) * spiralR;
        const sy = CENTER_Y + Math.sin(angle) * spiralR;
        if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
          const collides = engine.balls.some(
            b => b.id !== 0 && !b.isPotted && Math.hypot(b.x - sx, b.y - sy) < r * 2 + 5
          );
          if (!collides) return { x: sx, y: sy };
        }
      }
      spiralR += 25;
    }

    return { x: HEAD_STRING_X, y: CENTER_Y };
  }

  // Find optimal shot for active match turn
  public planShot(engine: PoolEngine): AIShotPlan {
    const cue = engine.getCueBall();
    if (!cue) return { angle: 0, power: 0.5 };

    if (engine.isBreakShot) {
      // Find the apex ball (ball 1 in both 8-ball and 9-ball)
      const apex = engine.balls.find(b => b.id === 1 && !b.isPotted);
      if (apex) {
        const breakAngle = Math.atan2(apex.y - cue.y, apex.x - cue.x);
        return {
          angle: this.applyAimNoise(breakAngle),
          power: Math.min(1.0, 0.90 + Math.random() * 0.10)
        };
      }
    }

    const legalBalls = this.getLegalTargetBalls(engine);
    if (legalBalls.length === 0) {
      return { angle: Math.random() * Math.PI * 2, power: 0.4 };
    }

    let bestScore = -9999;
    let bestAngle = 0;
    let bestPower = 0.5;

    // Evaluate each legal ball against each pocket
    for (const target of legalBalls) {
      for (const pocket of POCKETS) {
        // Vector from target ball to pocket
        const tpDx = pocket.x - target.x;
        const tpDy = pocket.y - target.y;
        const tpDist = Math.hypot(tpDx, tpDy);
        if (tpDist < 1) continue;

        const tpDirX = tpDx / tpDist;
        const tpDirY = tpDy / tpDist;

        // Check if path from target ball to pocket is clear
        if (!this.isPathClear(target.x, target.y, pocket.x, pocket.y, engine.balls, [cue.id, target.id])) {
          continue;
        }

        // Contact point (ghost ball center) behind target ball
        const ghostX = target.x - tpDirX * (target.radius + cue.radius);
        const ghostY = target.y - tpDirY * (target.radius + cue.radius);

        // Check if path from cue ball to ghost ball is clear
        if (!this.isPathClear(cue.x, cue.y, ghostX, ghostY, engine.balls, [cue.id, target.id])) {
          continue;
        }

        // Vector from cue to ghost ball
        const cgDx = ghostX - cue.x;
        const cgDy = ghostY - cue.y;
        const cgDist = Math.hypot(cgDx, cgDy);
        if (cgDist < 1) continue;

        const cgDirX = cgDx / cgDist;
        const cgDirY = cgDy / cgDist;

        // Cut angle: dot product between cue-to-ghost direction and target-to-pocket direction
        const dot = cgDirX * tpDirX + cgDirY * tpDirY;
        if (dot < 0.1) continue; // Back cuts greater than 85° are too acute

        // Score based on straightness and total travel distance
        const straightnessScore = Math.pow(dot, 2) * 100;
        const distancePenalty = (cgDist + tpDist) * 0.08;
        const score = straightnessScore - distancePenalty;

        if (score > bestScore) {
          bestScore = score;
          bestAngle = Math.atan2(cgDy, cgDx);
          // Calculate power proportional to distance
          const totalDistance = cgDist + tpDist;
          bestPower = Math.min(0.9, Math.max(0.3, totalDistance / 600));
        }
      }
    }

    // Fallback: If no direct pocket shot exists, aim straight at closest legal ball
    if (bestScore === -9999) {
      let closestDist = 9999;
      let closestBall = legalBalls[0];
      for (const b of legalBalls) {
        const d = Math.hypot(b.x - cue.x, b.y - cue.y);
        if (d < closestDist) {
          closestDist = d;
          closestBall = b;
        }
      }
      bestAngle = Math.atan2(closestBall.y - cue.y, closestBall.x - cue.x);
      bestPower = 0.55;
    }

    // Apply difficulty noise
    const noisyAngle = this.applyAimNoise(bestAngle);
    const noisyPower = this.applyPowerNoise(bestPower);

    return { angle: noisyAngle, power: noisyPower };
  }

  // Check if a cylindrical path between two points is clear of obstacle balls
  private isPathClear(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    allBalls: PoolBall[],
    ignoreIds: number[]
  ): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return true;

    const dirX = dx / dist;
    const dirY = dy / dist;
    const clearance = BALL_RADIUS * 2 - 1;

    for (const b of allBalls) {
      if (b.isPotted || ignoreIds.includes(b.id)) continue;

      const ox = b.x - x1;
      const oy = b.y - y1;
      const proj = ox * dirX + oy * dirY;

      if (proj <= 0 || proj >= dist) continue;

      const perpDistSq = (ox * ox + oy * oy) - proj * proj;
      if (perpDistSq < clearance * clearance) {
        return false;
      }
    }
    return true;
  }

  private getLegalTargetBalls(engine: PoolEngine): PoolBall[] {
    if (engine.variant === '8ball') {
      const group = engine.opponentGroup;
      if (!group) {
        // Open table: can target any solid or stripe (1-7 or 9-15)
        return engine.balls.filter(b => !b.isCue && !b.isPotted && b.id !== 8);
      }
      const ownRemaining = engine.balls.filter(b => !b.isCue && !b.isPotted && BALL_DEFS[b.id]?.type === group);
      if (ownRemaining.length > 0) return ownRemaining;
      // If group cleared, 8-ball is target!
      const ball8 = engine.balls.find(b => b.id === 8 && !b.isPotted);
      return ball8 ? [ball8] : [];
    } else {
      // 9-Ball: Lowest ball on table MUST be struck first
      const lowestId = engine.getLowestBallOnTable();
      const lowest = engine.balls.find(b => b.id === lowestId && !b.isPotted);
      return lowest ? [lowest] : [];
    }
  }

  private applyAimNoise(angle: number): number {
    let maxSpread = 0;
    switch (this.difficulty) {
      case 'easy':
        maxSpread = 0.085; // ~5 deg
        break;
      case 'medium':
        maxSpread = 0.035; // ~2 deg
        break;
      case 'hard':
        maxSpread = 0.012; // ~0.7 deg
        break;
      case 'extreme':
        maxSpread = 0.003; // ~0.17 deg
        break;
    }
    return angle + (Math.random() - 0.5) * 2 * maxSpread;
  }

  private applyPowerNoise(power: number): number {
    let spread = 0;
    switch (this.difficulty) {
      case 'easy':
        spread = 0.18;
        break;
      case 'medium':
        spread = 0.08;
        break;
      case 'hard':
        spread = 0.03;
        break;
      case 'extreme':
        spread = 0.008;
        break;
    }
    return Math.max(0.2, Math.min(1.0, power + (Math.random() - 0.5) * spread));
  }
}
