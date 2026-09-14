import { Puck, ElasticBand } from './sling-types';
import {
  RAIL_LEFT,
  RAIL_RIGHT,
  RAIL_TOP,
  RAIL_BOTTOM,
  PLAY_WIDTH,
  DIVIDER_TOP,
  DIVIDER_BOTTOM,
  GATE_LEFT,
  GATE_RIGHT,
  TABLE_FRICTION,
  CUSHION_RESTITUTION,
  PUCK_RESTITUTION,
  VELOCITY_STOP_THRESHOLD,
  MAX_LAUNCH_SPEED,
  MAX_PULL_DISTANCE
} from './sling-constants';

export class SlingPhysics {
  public static update(
    pucks: Puck[],
    dt: number,
    subSteps: number = 4,
    onPuckCollision?: (p1: Puck, p2: Puck, speed: number) => void,
    onCushionBounce?: (puck: Puck, speed: number) => void,
    onGatePass?: (puck: Puck) => void,
    playerBand?: ElasticBand,
    opponentBand?: ElasticBand
  ) {
    const subDt = dt / subSteps;
    const friction = Math.pow(TABLE_FRICTION, 1 / subSteps);

    // Gate corner posts (rounded corners of the gate opening)
    const gateCorners = [
      { x: GATE_LEFT, y: (DIVIDER_TOP + DIVIDER_BOTTOM) * 0.5, r: 3 },
      { x: GATE_RIGHT, y: (DIVIDER_TOP + DIVIDER_BOTTOM) * 0.5, r: 3 }
    ];

    for (let step = 0; step < subSteps; step++) {
      // 1. Position integration & table friction
      for (const p of pucks) {
        if (p.isDragged) {
          p.x = p.dragX ?? p.x;
          p.y = p.dragY ?? p.y;
          p.vx = 0;
          p.vy = 0;
          continue;
        }

        p.x += p.vx * (subDt * 60);
        p.y += p.vy * (subDt * 60);

        p.vx *= friction;
        p.vy *= friction;

        const speed = Math.hypot(p.vx, p.vy);
        if (speed < VELOCITY_STOP_THRESHOLD) {
          p.vx = 0;
          p.vy = 0;
        }
      }

      // 2. Outer boundary rail bounces (unconditional clamping keeps pucks inside table)
      for (const p of pucks) {
        if (p.isDragged) continue;
        const r = p.radius;

        // Left rail
        if (p.x - r < RAIL_LEFT) {
          p.x = RAIL_LEFT + r;
          if (p.vx < 0) {
            const bounceSpeed = Math.abs(p.vx);
            p.vx = -p.vx * CUSHION_RESTITUTION;
            if (bounceSpeed > 0.4 && onCushionBounce) onCushionBounce(p, bounceSpeed);
          }
        }
        // Right rail
        else if (p.x + r > RAIL_RIGHT) {
          p.x = RAIL_RIGHT - r;
          if (p.vx > 0) {
            const bounceSpeed = Math.abs(p.vx);
            p.vx = -p.vx * CUSHION_RESTITUTION;
            if (bounceSpeed > 0.4 && onCushionBounce) onCushionBounce(p, bounceSpeed);
          }
        }

        // Top rail
        if (p.y - r < RAIL_TOP) {
          p.y = RAIL_TOP + r;
          if (p.vy < 0) {
            const bounceSpeed = Math.abs(p.vy);
            p.vy = -p.vy * CUSHION_RESTITUTION;
            if (bounceSpeed > 0.4 && onCushionBounce) onCushionBounce(p, bounceSpeed);
          }
        }
        // Bottom rail
        else if (p.y + r > RAIL_BOTTOM) {
          p.y = RAIL_BOTTOM - r;
          if (p.vy > 0) {
            const bounceSpeed = Math.abs(p.vy);
            p.vy = -p.vy * CUSHION_RESTITUTION;
            if (bounceSpeed > 0.4 && onCushionBounce) onCushionBounce(p, bounceSpeed);
          }
        }
      }

      // 3. Center Divider & Gate Collision
      for (const p of pucks) {
        if (p.isDragged) continue;
        const r = p.radius;

        // Check if puck is crossing through the center gate
        const isHorizontallyInGate = p.x - r * 0.75 >= GATE_LEFT && p.x + r * 0.75 <= GATE_RIGHT;
        if (isHorizontallyInGate) {
          // Puck is inside the gate slot: check if it crossed from one side to the other
          const prevSide = p.owner;
          const currentSide = p.y < (DIVIDER_TOP + DIVIDER_BOTTOM) * 0.5 ? 'opponent' : 'player';
          if (prevSide !== currentSide) {
            p.owner = currentSide;
            if (onGatePass) onGatePass(p);
          }
          continue; // Successfully passing through gate, no divider bounce
        }

        // Collide with Left Wing (x < GATE_LEFT) or Right Wing (x > GATE_RIGHT)
        const isLeftWing = p.x <= GATE_LEFT;
        const isRightWing = p.x >= GATE_RIGHT;

        if (isLeftWing || isRightWing) {
          // Bottom face of divider (coming from player side heading north)
          if (p.y - r < DIVIDER_BOTTOM && p.y + r > DIVIDER_BOTTOM && p.vy < 0) {
            p.y = DIVIDER_BOTTOM + r;
            const bounceSpeed = Math.abs(p.vy);
            p.vy = -p.vy * CUSHION_RESTITUTION;
            if (bounceSpeed > 0.4 && onCushionBounce) onCushionBounce(p, bounceSpeed);
          }
          // Top face of divider (coming from opponent side heading south)
          else if (p.y + r > DIVIDER_TOP && p.y - r < DIVIDER_TOP && p.vy > 0) {
            p.y = DIVIDER_TOP - r;
            const bounceSpeed = Math.abs(p.vy);
            p.vy = -p.vy * CUSHION_RESTITUTION;
            if (bounceSpeed > 0.4 && onCushionBounce) onCushionBounce(p, bounceSpeed);
          }
        }

        // Collide with gate corner posts
        for (const corner of gateCorners) {
          const dx = p.x - corner.x;
          const dy = p.y - corner.y;
          const dist = Math.hypot(dx, dy);
          const minDist = r + corner.r;

          if (dist < minDist && dist > 0) {
            const nx = dx / dist;
            const ny = dy / dist;
            // Push out of post
            p.x = corner.x + nx * minDist;
            p.y = corner.y + ny * minDist;

            // Reflect velocity along collision normal
            const dot = p.vx * nx + p.vy * ny;
            if (dot < 0) {
              p.vx = (p.vx - 2 * dot * nx) * CUSHION_RESTITUTION;
              p.vy = (p.vy - 2 * dot * ny) * CUSHION_RESTITUTION;
              const speed = Math.hypot(p.vx, p.vy);
              if (speed > 0.4 && onCushionBounce) onCushionBounce(p, speed);
            }
          }
        }
      }

      // 4. Puck-to-puck elastic collisions
      for (let i = 0; i < pucks.length; i++) {
        const p1 = pucks[i];

        for (let j = i + 1; j < pucks.length; j++) {
          const p2 = pucks[j];

          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const dist = Math.hypot(dx, dy);
          const minDist = p1.radius + p2.radius;

          if (dist < minDist && dist > 0) {
            const nx = dx / dist;
            const ny = dy / dist;

            // Positional overlap resolution
            const overlap = minDist - dist;
            if (!p1.isDragged && !p2.isDragged) {
              p1.x -= nx * overlap * 0.5;
              p1.y -= ny * overlap * 0.5;
              p2.x += nx * overlap * 0.5;
              p2.y += ny * overlap * 0.5;
            } else if (p1.isDragged && !p2.isDragged) {
              p2.x += nx * overlap;
              p2.y += ny * overlap;
            } else if (!p1.isDragged && p2.isDragged) {
              p1.x -= nx * overlap;
              p1.y -= ny * overlap;
            }

            // Keep non-dragged pucks safely inside table rails
            if (!p1.isDragged) {
              p1.x = Math.max(RAIL_LEFT + p1.radius, Math.min(p1.x, RAIL_RIGHT - p1.radius));
              p1.y = Math.max(RAIL_TOP + p1.radius, Math.min(p1.y, RAIL_BOTTOM - p1.radius));
            }
            if (!p2.isDragged) {
              p2.x = Math.max(RAIL_LEFT + p2.radius, Math.min(p2.x, RAIL_RIGHT - p2.radius));
              p2.y = Math.max(RAIL_TOP + p2.radius, Math.min(p2.y, RAIL_BOTTOM - p2.radius));
            }

            // Velocity impulse
            const kx = p1.vx - p2.vx;
            const ky = p1.vy - p2.vy;
            const p = 2 * (nx * kx + ny * ky) / 2; // Equal masses (mass = 1.0)

            if (p > 0) {
              const impactSpeed = Math.abs(p);
              if (!p1.isDragged) {
                p1.vx -= p * nx * PUCK_RESTITUTION;
                p1.vy -= p * ny * PUCK_RESTITUTION;
              }
              if (!p2.isDragged) {
                p2.vx += p * nx * PUCK_RESTITUTION;
                p2.vy += p * ny * PUCK_RESTITUTION;
              }

              if (impactSpeed > 0.5 && onPuckCollision) {
                onPuckCollision(p1, p2, impactSpeed);
              }
            }
          }
        }
      }

      // 5. Elastic Band Bounces for Free Pucks (Absorbs & deadens incoming shots)
      if (playerBand && !playerBand.isStretched) {
        for (const p of pucks) {
          if (p.isDragged) continue;
          if (p.y + p.radius >= playerBand.midY && p.y - p.radius < playerBand.midY + 16) {
            p.y = playerBand.midY - p.radius;
            if (p.vy > 0) {
              // Deaden incoming puck so it settles cleanly in the player's zone
              p.vy = -p.vy * 0.2;
              p.vx *= 0.4;
              playerBand.vibrationVelocity = -Math.min(Math.abs(p.vy) * 0.3, 2.5);
              if (Math.abs(p.vy) > 0.4 && onCushionBounce) onCushionBounce(p, Math.abs(p.vy));
            }
          }
        }
      }

      if (opponentBand && !opponentBand.isStretched) {
        for (const p of pucks) {
          if (p.isDragged) continue;
          if (p.y - p.radius <= opponentBand.midY && p.y + p.radius > opponentBand.midY - 16) {
            p.y = opponentBand.midY + p.radius;
            if (p.vy < 0) {
              // Deaden incoming puck so it settles cleanly in the opponent's zone
              p.vy = -p.vy * 0.2;
              p.vx *= 0.4;
              opponentBand.vibrationVelocity = Math.min(Math.abs(p.vy) * 0.3, 2.5);
              if (Math.abs(p.vy) > 0.4 && onCushionBounce) onCushionBounce(p, Math.abs(p.vy));
            }
          }
        }
      }
    }
  }

  // Update elastic cord vibration and return impulse on launch
  public static launchFromBand(
    puck: Puck,
    band: ElasticBand,
    onSnap?: (power: number) => void
  ): boolean {
    const isPlayer = band.side === 'player';
    const restY = band.restY;
    const dyFromPuck = isPlayer ? (puck.y - restY) : (restY - puck.y);
    const dyFromBand = isPlayer ? (band.midY - restY) : (restY - band.midY);
    const dy = Math.max(dyFromPuck, dyFromBand);

    if (dy < 4) {
      // Not pulled enough to trigger launch
      band.isStretched = false;
      band.midY = restY;
      return false;
    }

    const pullDistance = Math.min(MAX_PULL_DISTANCE, dy);
    const power = Math.max(0.12, pullDistance / MAX_PULL_DISTANCE);

    // Launch trajectory: mostly forward (towards gate) with steer based on puck pull X offset
    const midAnchorX = (band.leftX + band.rightX) * 0.5;
    const pullOffsetX = (puck.x - midAnchorX) / (PLAY_WIDTH * 0.5);

    const speed = 10 + power * (MAX_LAUNCH_SPEED - 10);
    const dirY = isPlayer ? -1 : 1;
    const dirX = -pullOffsetX * 0.45; // Pulling right aims left, pulling left aims right

    const len = Math.hypot(dirX, dirY);
    puck.vx = (dirX / len) * speed;
    puck.vy = (dirY / len) * speed;

    // Immediately position puck just in front of the band so it launches cleanly into the field
    puck.y = isPlayer ? restY - puck.radius - 2 : restY + puck.radius + 2;
    puck.prevX = puck.x;
    puck.prevY = puck.y;
    puck.dragX = puck.x;
    puck.dragY = puck.y;

    // Trigger elastic band vibration
    band.isStretched = false;
    band.midX = (band.leftX + band.rightX) * 0.5;
    band.midY = restY;
    band.vibrationVelocity = (isPlayer ? -1 : 1) * Math.min(speed * 0.7, 9);

    if (onSnap) onSnap(power);
    return true;
  }

  // Update elastic band physical vibration oscillation
  public static updateBandVibration(band: ElasticBand, dt: number) {
    if (band.isStretched) return;

    const springK = 380; // Spring stiffness
    const damping = 18;  // Oscillation decay

    const force = -springK * band.vibrationOffset - damping * band.vibrationVelocity;
    band.vibrationVelocity += force * dt;
    band.vibrationOffset += band.vibrationVelocity * dt;

    if (Math.abs(band.vibrationOffset) < 0.05 && Math.abs(band.vibrationVelocity) < 0.05) {
      band.vibrationOffset = 0;
      band.vibrationVelocity = 0;
      band.midX = (band.leftX + band.rightX) * 0.5;
    }

    band.midY = band.restY + band.vibrationOffset;
  }
}
