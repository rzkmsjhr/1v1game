import {
  PLAY_X_MIN,
  PLAY_X_MAX,
  PLAY_Y_MIN,
  PLAY_Y_MAX,
  POCKETS,
  ROLLING_FRICTION,
  BALL_RESTITUTION,
  CUSHION_RESTITUTION,
  VELOCITY_STOP_THRESHOLD
} from './pool-constants';

export interface PoolBall {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isPotted: boolean;
  isSinking: boolean;
  pottedAnimProgress: number; // 0 to 1
  isCue: boolean;
  isPlayerLag?: boolean;
  prevX?: number;
  prevY?: number;
}

export interface TrajectoryPreview {
  rayEndX: number;
  rayEndY: number;
  hitBallId: number | null;
  ghostBallX: number;
  ghostBallY: number;
  targetDirX: number;
  targetDirY: number;
  cueDeflectX: number;
  cueDeflectY: number;
}

export class PoolPhysics {
  public static update(
    balls: PoolBall[],
    subSteps: number = 8,
    onBallCollision?: (b1: PoolBall, b2: PoolBall, speed: number) => void,
    onCushionCollision?: (b: PoolBall, speed: number) => void,
    onBallPotted?: (b: PoolBall, pocketId: string) => void
  ) {
    const dt = 1 / (60 * subSteps);
    // Exponential rolling friction per sub-step
    const friction = Math.pow(ROLLING_FRICTION, 1 / subSteps);

    for (let step = 0; step < subSteps; step++) {
      // 1. Move balls & apply friction
      for (const b of balls) {
        if (b.isPotted) continue;

        if (b.isSinking) {
          // Rapidly decelerate and shrink into pocket center
          b.vx *= 0.85;
          b.vy *= 0.85;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.pottedAnimProgress += 0.05;
          if (b.pottedAnimProgress >= 1.0) {
            b.isPotted = true;
            b.isSinking = false;
            b.vx = 0;
            b.vy = 0;
          }
          continue;
        }

        b.x += b.vx * (dt * 60);
        b.y += b.vy * (dt * 60);

        b.vx *= friction;
        b.vy *= friction;

        const speed = Math.hypot(b.vx, b.vy);
        if (speed < VELOCITY_STOP_THRESHOLD) {
          b.vx = 0;
          b.vy = 0;
        }
      }

      // 2. Pocket suction & capture
      for (const b of balls) {
        if (b.isPotted || b.isSinking) continue;

        for (const p of POCKETS) {
          const dist = Math.hypot(b.x - p.x, b.y - p.y);
          if (dist < p.radius) {
            b.isSinking = true;
            b.pottedAnimProgress = 0;
            // Guide velocity toward center of pocket
            const pullAngle = Math.atan2(p.y - b.y, p.x - b.x);
            const currentSpeed = Math.max(1.5, Math.hypot(b.vx, b.vy));
            b.vx = Math.cos(pullAngle) * currentSpeed * 0.7;
            b.vy = Math.sin(pullAngle) * currentSpeed * 0.7;
            if (onBallPotted) onBallPotted(b, p.id);
            break;
          }
        }
      }

      // 3. Cushion collisions (only for non-sinking balls)
      for (const b of balls) {
        if (b.isPotted || b.isSinking) continue;

        const r = b.radius;
        // Check if ball is in near-pocket zone
        const inNearPocketMouth = POCKETS.some(p => Math.hypot(b.x - p.x, b.y - p.y) < p.radius + 6);
        if (inNearPocketMouth) continue;

        let bounced = false;
        let bounceSpeed = 0;

        // Top cushion
        if (b.y - r < PLAY_Y_MIN && b.vy < 0) {
          b.y = PLAY_Y_MIN + r;
          bounceSpeed = Math.abs(b.vy);
          b.vy = -b.vy * CUSHION_RESTITUTION;
          bounced = true;
        }
        // Bottom cushion
        else if (b.y + r > PLAY_Y_MAX && b.vy > 0) {
          b.y = PLAY_Y_MAX - r;
          bounceSpeed = Math.abs(b.vy);
          b.vy = -b.vy * CUSHION_RESTITUTION;
          bounced = true;
        }

        // Left cushion (Head rail)
        if (b.x - r < PLAY_X_MIN && b.vx < 0) {
          b.x = PLAY_X_MIN + r;
          bounceSpeed = Math.max(bounceSpeed, Math.abs(b.vx));
          b.vx = -b.vx * CUSHION_RESTITUTION;
          bounced = true;
        }
        // Right cushion (Foot rail)
        else if (b.x + r > PLAY_X_MAX && b.vx > 0) {
          b.x = PLAY_X_MAX - r;
          bounceSpeed = Math.max(bounceSpeed, Math.abs(b.vx));
          b.vx = -b.vx * CUSHION_RESTITUTION;
          bounced = true;
        }

        if (bounced && onCushionCollision && bounceSpeed > 0.4) {
          onCushionCollision(b, bounceSpeed);
        }
      }

      // 4. Ball-to-ball collisions
      for (let i = 0; i < balls.length; i++) {
        const b1 = balls[i];
        if (b1.isPotted || b1.isSinking) continue;

        for (let j = i + 1; j < balls.length; j++) {
          const b2 = balls[j];
          if (b2.isPotted || b2.isSinking) continue;

          const dx = b2.x - b1.x;
          const dy = b2.y - b1.y;
          const distSq = dx * dx + dy * dy;
          const minDist = b1.radius + b2.radius;

          if (distSq < minDist * minDist && distSq > 0.0001) {
            const dist = Math.sqrt(distSq);
            const nx = dx / dist;
            const ny = dy / dist;

            // Separate overlapping balls
            const overlap = (minDist - dist) * 0.5;
            b1.x -= nx * overlap;
            b1.y -= ny * overlap;
            b2.x += nx * overlap;
            b2.y += ny * overlap;

            // Relative velocity along collision normal
            const kx = b1.vx - b2.vx;
            const ky = b1.vy - b2.vy;
            const p = 2 * (nx * kx + ny * ky) / 2; // equal mass = 1.0

            if (p > 0) {
              b1.vx -= p * nx * BALL_RESTITUTION;
              b1.vy -= p * ny * BALL_RESTITUTION;
              b2.vx += p * nx * BALL_RESTITUTION;
              b2.vy += p * ny * BALL_RESTITUTION;

              if (onBallCollision && p > 0.3) {
                onBallCollision(b1, b2, p);
              }
            }
          }
        }
      }
    }
  }

  public static areAllBallsSettled(balls: PoolBall[]): boolean {
    for (const b of balls) {
      if (b.isPotted) continue;
      if (b.isSinking) return false;
      if (Math.abs(b.vx) > 0.01 || Math.abs(b.vy) > 0.01) return false;
    }
    return true;
  }

  // Calculate aiming trajectory line with ghost ball and target ball deflection
  public static calculateTrajectory(
    cueBall: PoolBall,
    angle: number,
    balls: PoolBall[]
  ): TrajectoryPreview {
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const maxDist = 900;

    let closestDist = maxDist;
    let hitBall: PoolBall | null = null;
    let ghostX = cueBall.x + dirX * maxDist;
    let ghostY = cueBall.y + dirY * maxDist;

    // 1. Raycast against all object balls
    for (const b of balls) {
      if (b.isCue || b.isPotted || b.isSinking) continue;

      // Vector from cue to object ball
      const ox = b.x - cueBall.x;
      const oy = b.y - cueBall.y;

      // Project onto ray
      const proj = ox * dirX + oy * dirY;
      if (proj <= 0) continue; // behind cue ball

      // Distance from ray to ball center
      const perpSq = (ox * ox + oy * oy) - proj * proj;
      const rSum = cueBall.radius + b.radius;
      if (perpSq >= rSum * rSum) continue; // ray misses ball

      // Distance to contact point
      const dContact = proj - Math.sqrt(rSum * rSum - perpSq);
      if (dContact > 0 && dContact < closestDist) {
        closestDist = dContact;
        hitBall = b;
        ghostX = cueBall.x + dirX * dContact;
        ghostY = cueBall.y + dirY * dContact;
      }
    }

    // 2. If no ball hit, raycast against table boundaries
    if (!hitBall) {
      // Raycast to cushions
      let tMin = maxDist;
      if (dirX > 0) tMin = Math.min(tMin, (PLAY_X_MAX - cueBall.radius - cueBall.x) / dirX);
      if (dirX < 0) tMin = Math.min(tMin, (PLAY_X_MIN + cueBall.radius - cueBall.x) / dirX);
      if (dirY > 0) tMin = Math.min(tMin, (PLAY_Y_MAX - cueBall.radius - cueBall.y) / dirY);
      if (dirY < 0) tMin = Math.min(tMin, (PLAY_Y_MIN + cueBall.radius - cueBall.y) / dirY);

      ghostX = cueBall.x + dirX * Math.max(0, tMin);
      ghostY = cueBall.y + dirY * Math.max(0, tMin);

      return {
        rayEndX: ghostX,
        rayEndY: ghostY,
        hitBallId: null,
        ghostBallX: ghostX,
        ghostBallY: ghostY,
        targetDirX: 0,
        targetDirY: 0,
        cueDeflectX: 0,
        cueDeflectY: 0
      };
    }

    // 3. If object ball hit, calculate deflection lines
    // Target ball moves along vector from ghostBall to object ball center
    const tDx = hitBall.x - ghostX;
    const tDy = hitBall.y - ghostY;
    const tDist = Math.hypot(tDx, tDy) || 1;
    const targetDirX = tDx / tDist;
    const targetDirY = tDy / tDist;

    // Cue ball deflects perpendicular to collision normal
    const cueDot = dirX * targetDirX + dirY * targetDirY;
    const cueDeflectX = dirX - targetDirX * cueDot;
    const cueDeflectY = dirY - targetDirY * cueDot;
    const cueDist = Math.hypot(cueDeflectX, cueDeflectY) || 1;

    return {
      rayEndX: ghostX,
      rayEndY: ghostY,
      hitBallId: hitBall.id,
      ghostBallX: ghostX,
      ghostBallY: ghostY,
      targetDirX,
      targetDirY,
      cueDeflectX: cueDeflectX / cueDist,
      cueDeflectY: cueDeflectY / cueDist
    };
  }
}
