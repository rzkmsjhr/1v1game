import {
  PLAY_X_MIN,
  PLAY_X_MAX,
  PLAY_Y_MIN,
  PLAY_Y_MAX,
  CENTER_X,
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
  targetPocketId?: string;
  isCue: boolean;
  isPlayerLag?: boolean;
  prevX?: number;
  prevY?: number;
}

export interface JawSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// Angled cushion jaw facings matching the visual table geometry
export const JAW_SEGMENTS: JawSegment[] = [
  // Top-Left corner jaws (nose to throat back)
  { x1: PLAY_X_MIN + 22, y1: PLAY_Y_MIN, x2: PLAY_X_MIN + 12, y2: PLAY_Y_MIN - 18 },
  { x1: PLAY_X_MIN, y1: PLAY_Y_MIN + 22, x2: PLAY_X_MIN - 18, y2: PLAY_Y_MIN + 12 },

  // Top-Right corner jaws
  { x1: PLAY_X_MAX - 22, y1: PLAY_Y_MIN, x2: PLAY_X_MAX - 12, y2: PLAY_Y_MIN - 18 },
  { x1: PLAY_X_MAX, y1: PLAY_Y_MIN + 22, x2: PLAY_X_MAX + 18, y2: PLAY_Y_MIN + 12 },

  // Bottom-Left corner jaws
  { x1: PLAY_X_MIN + 22, y1: PLAY_Y_MAX, x2: PLAY_X_MIN + 12, y2: PLAY_Y_MAX + 18 },
  { x1: PLAY_X_MIN, y1: PLAY_Y_MAX - 22, x2: PLAY_X_MIN - 18, y2: PLAY_Y_MAX - 12 },

  // Bottom-Right corner jaws
  { x1: PLAY_X_MAX - 22, y1: PLAY_Y_MAX, x2: PLAY_X_MAX - 12, y2: PLAY_Y_MAX + 18 },
  { x1: PLAY_X_MAX, y1: PLAY_Y_MAX - 22, x2: PLAY_X_MAX + 18, y2: PLAY_Y_MAX - 12 },

  // Top-Middle pocket jaws
  { x1: CENTER_X - 22, y1: PLAY_Y_MIN, x2: CENTER_X - 16, y2: PLAY_Y_MIN - 18 },
  { x1: CENTER_X + 22, y1: PLAY_Y_MIN, x2: CENTER_X + 16, y2: PLAY_Y_MIN - 18 },

  // Bottom-Middle pocket jaws
  { x1: CENTER_X - 22, y1: PLAY_Y_MAX, x2: CENTER_X - 16, y2: PLAY_Y_MAX + 18 },
  { x1: CENTER_X + 22, y1: PLAY_Y_MAX, x2: CENTER_X + 16, y2: PLAY_Y_MAX + 18 },
];

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
          const p = POCKETS.find(pkt => pkt.id === b.targetPocketId) || POCKETS[0];
          const dx = p.x - b.x;
          const dy = p.y - b.y;
          const dist = Math.hypot(dx, dy);

          // Exponentially damp previous velocity
          b.vx *= 0.82;
          b.vy *= 0.82;

          // Continuous gentle suction directly towards pocket center
          if (dist > 0.3) {
            const pullSpeed = Math.min(3.5, dist * 0.25);
            b.vx += (dx / dist) * pullSpeed;
            b.vy += (dy / dist) * pullSpeed;
          }

          b.x += b.vx * (dt * 60);
          b.y += b.vy * (dt * 60);

          // Advance sinking animation progress smoothly across ~16-20 frames
          b.pottedAnimProgress += 0.008;
          if (b.pottedAnimProgress >= 1.0) {
            b.isPotted = true;
            b.isSinking = false;
            b.vx = 0;
            b.vy = 0;
            b.x = p.x;
            b.y = p.y;
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
          let isCaptured = false;

          if (p.isMiddle) {
            // Side pocket: within mouth opening width (±20px) AND entering the pocket recess
            const inMouthX = Math.abs(b.x - p.x) < 20;
            const inMouthY = p.id === 'top-middle'
              ? b.y < PLAY_Y_MIN + 2
              : b.y > PLAY_Y_MAX - 2;

            if ((inMouthX && inMouthY) || dist < p.radius + 1.5) {
              isCaptured = true;
            }
          } else {
            // Corner pocket: aperture capture radius
            if (dist < p.radius + 2) {
              isCaptured = true;
            }
          }

          if (isCaptured) {
            b.isSinking = true;
            b.pottedAnimProgress = 0;
            b.targetPocketId = p.id;
            // Guide velocity toward center of pocket
            const pullAngle = Math.atan2(p.y - b.y, p.x - b.x);
            const currentSpeed = Math.min(6.0, Math.max(1.5, Math.hypot(b.vx, b.vy) * 0.4));
            b.vx = Math.cos(pullAngle) * currentSpeed;
            b.vy = Math.sin(pullAngle) * currentSpeed;
            if (onBallPotted) onBallPotted(b, p.id);
            break;
          }
        }
      }

      // 3. Cushion collisions (only for non-sinking balls)
      for (const b of balls) {
        if (b.isPotted || b.isSinking) continue;

        const r = b.radius;
        let bounced = false;
        let bounceSpeed = 0;

        // Top cushion segments: [PLAY_X_MIN + 22, CENTER_X - 22] and [CENTER_X + 22, PLAY_X_MAX - 22]
        if (b.y - r < PLAY_Y_MIN && b.vy < 0) {
          const inTopLeft = b.x >= PLAY_X_MIN + 22 && b.x <= CENTER_X - 22;
          const inTopRight = b.x >= CENTER_X + 22 && b.x <= PLAY_X_MAX - 22;
          if (inTopLeft || inTopRight) {
            b.y = PLAY_Y_MIN + r;
            bounceSpeed = Math.abs(b.vy);
            b.vy = -b.vy * CUSHION_RESTITUTION;
            bounced = true;
          }
        }
        // Bottom cushion segments
        else if (b.y + r > PLAY_Y_MAX && b.vy > 0) {
          const inBottomLeft = b.x >= PLAY_X_MIN + 22 && b.x <= CENTER_X - 22;
          const inBottomRight = b.x >= CENTER_X + 22 && b.x <= PLAY_X_MAX - 22;
          if (inBottomLeft || inBottomRight) {
            b.y = PLAY_Y_MAX - r;
            bounceSpeed = Math.abs(b.vy);
            b.vy = -b.vy * CUSHION_RESTITUTION;
            bounced = true;
          }
        }

        // Left cushion (Head rail): [PLAY_Y_MIN + 22, PLAY_Y_MAX - 22]
        if (b.x - r < PLAY_X_MIN && b.vx < 0) {
          if (b.y >= PLAY_Y_MIN + 22 && b.y <= PLAY_Y_MAX - 22) {
            b.x = PLAY_X_MIN + r;
            bounceSpeed = Math.max(bounceSpeed, Math.abs(b.vx));
            b.vx = -b.vx * CUSHION_RESTITUTION;
            bounced = true;
          }
        }
        // Right cushion (Foot rail): [PLAY_Y_MIN + 22, PLAY_Y_MAX - 22]
        else if (b.x + r > PLAY_X_MAX && b.vx > 0) {
          if (b.y >= PLAY_Y_MIN + 22 && b.y <= PLAY_Y_MAX - 22) {
            b.x = PLAY_X_MAX - r;
            bounceSpeed = Math.max(bounceSpeed, Math.abs(b.vx));
            b.vx = -b.vx * CUSHION_RESTITUTION;
            bounced = true;
          }
        }

        // Angled jaw segments & corner pocket mouth facings
        for (const seg of JAW_SEGMENTS) {
          const sDx = seg.x2 - seg.x1;
          const sDy = seg.y2 - seg.y1;
          const lenSq = sDx * sDx + sDy * sDy;
          const t = Math.max(0, Math.min(1, ((b.x - seg.x1) * sDx + (b.y - seg.y1) * sDy) / lenSq));
          const cx = seg.x1 + t * sDx;
          const cy = seg.y1 + t * sDy;
          const cdx = b.x - cx;
          const cdy = b.y - cy;
          const dist = Math.hypot(cdx, cdy);

          if (dist < r && dist > 0.0001) {
            const nx = cdx / dist;
            const ny = cdy / dist;
            const vn = b.vx * nx + b.vy * ny;
            if (vn < 0) {
              b.x = cx + nx * r;
              b.y = cy + ny * r;
              b.vx -= (1 + CUSHION_RESTITUTION) * vn * nx;
              b.vy -= (1 + CUSHION_RESTITUTION) * vn * ny;
              bounced = true;
              bounceSpeed = Math.max(bounceSpeed, Math.abs(vn));
            }
          }
        }

        // Safety table boundary clamp: active balls can never escape the table rails
        b.x = Math.max(PLAY_X_MIN - 4, Math.min(PLAY_X_MAX + 4, b.x));
        b.y = Math.max(PLAY_Y_MIN - 4, Math.min(PLAY_Y_MAX + 4, b.y));

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
