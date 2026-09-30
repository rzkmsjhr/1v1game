import type { SkylinePlayerState, CraneState, FallingBlock, TumblingBlock, ParticleEffect, FloatingText } from '../skyline-types';
import { SKYLINE_CONSTANTS } from '../skyline-constants';
import type { AppTheme } from '../../types';

export class SkylineRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private currentTheme: AppTheme = 'dark';
  private cameraY: number = 0;
  private targetCameraY: number = 0;
  private animTime: number = 0;

  // Visual effects pools
  private particles: ParticleEffect[] = [];
  private floatingTexts: FloatingText[] = [];
  private textIdCounter: number = 0;

  constructor(canvas: HTMLCanvasElement, theme: AppTheme = 'dark') {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.currentTheme = theme;
  }

  public setTheme(theme: AppTheme) {
    this.currentTheme = theme;
  }

  public reset() {
    this.cameraY = 0;
    this.targetCameraY = 0;
    this.animTime = 0;
    this.particles = [];
    this.floatingTexts = [];
  }

  public addSparkles(x: number, y: number, count: number = 18) {
    const colors = ['#fde047', '#38bdf8', '#4ade80', '#f43f5e', '#a855f7', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 220;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 3,
        alpha: 1.0,
        life: 0,
        maxLife: 0.5 + Math.random() * 0.4
      });
    }
  }

  public addDustPuff(x: number, y: number) {
    for (let i = 0; i < 8; i++) {
      const vx = (Math.random() - 0.5) * 140;
      const vy = Math.random() * 60 + 20;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 60,
        y,
        vx,
        vy,
        color: 'rgba(226, 232, 240, 0.7)',
        size: 4 + Math.random() * 5,
        alpha: 0.8,
        life: 0,
        maxLife: 0.4
      });
    }
  }

  public addFloatingText(text: string, x: number, y: number, color: string = '#facc15') {
    this.floatingTexts.push({
      id: ++this.textIdCounter,
      text,
      x,
      y,
      color,
      scale: 1.2,
      alpha: 1.0,
      life: 0,
      maxLife: 1.0
    });
  }

  public render(
    playerState: SkylinePlayerState,
    dt: number,
    rivalState?: SkylinePlayerState | null
  ) {
    this.animTime += dt;
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const dpr = window.devicePixelRatio || 1;

    // Smooth camera tracking: keep top floor and crane in balanced vertical focus
    const topFloor = playerState.floors[playerState.floors.length - 1];
    const topFloorY = topFloor ? (topFloor.y + topFloor.height) : SKYLINE_CONSTANTS.FOUNDATION_HEIGHT;
    this.targetCameraY = Math.max(0, topFloorY - SKYLINE_CONSTANTS.FOUNDATION_HEIGHT);
    this.cameraY += (this.targetCameraY - this.cameraY) * Math.min(1.0, dt * 5.0);

    ctx.save();
    ctx.scale(dpr, dpr);

    const logicalW = width / dpr;
    const logicalH = height / dpr;

    // Center X of the player's tower
    const centerX = logicalW * 0.5;
    // Ground baseline Y on screen (smoothly recedes down as tower rises, showing 4-6 floors below the crane)
    const groundScreenY = logicalH * 0.74 + this.cameraY;

    // 1. Render Sky & Atmosphere Background
    this.renderAtmosphere(ctx, logicalW, logicalH, this.cameraY);

    // 2. Render Parallax City Skyline
    this.renderCitySkyline(ctx, logicalW, logicalH, this.cameraY);

    // 3. Render Foundation Ground
    this.renderGround(ctx, centerX, groundScreenY, logicalW);

    // 4. Render Skyscraper Floors with Dynamic Sway
    this.renderSkyscraper(ctx, playerState, centerX, groundScreenY);

    // 5. Render Tumbling Missed Blocks
    this.renderTumblingBlocks(ctx, playerState.tumblingBlocks, centerX, groundScreenY);

    // 6. Render Falling Active Block
    if (playerState.fallingBlock) {
      this.renderFallingBlock(ctx, playerState.fallingBlock, centerX, groundScreenY);
    }

    // 7. Render Swinging Construction Crane
    this.renderCrane(ctx, playerState.crane, centerX, groundScreenY);

    // 8. Render Particles & Floating Texts
    this.updateAndRenderParticles(ctx, dt, centerX, groundScreenY);
    this.updateAndRenderFloatingTexts(ctx, dt, centerX, groundScreenY);

    // 9. Render Rival Ghost Mini-Tower HUD (in portrait or single-canvas mode)
    if (rivalState) {
      this.renderRivalGhostHUD(ctx, rivalState, logicalW, logicalH);
    }

    ctx.restore();
  }

  /**
   * Dynamic sky atmosphere transitioning from day/sunset to twilight/night/stratosphere
   */
  private renderAtmosphere(ctx: CanvasRenderingContext2D, w: number, h: number, camY: number) {
    const isDark = this.currentTheme === 'dark';
    const altitude = Math.min(1.0, camY / (SKYLINE_CONSTANTS.TARGET_FLOORS * SKYLINE_CONSTANTS.BLOCK_HEIGHT));

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    if (isDark) {
      if (altitude < 0.4) {
        // Night City Lower Atmosphere
        grad.addColorStop(0, '#090d16');
        grad.addColorStop(0.7, '#0f172a');
        grad.addColorStop(1, '#1e1b4b');
      } else if (altitude < 0.8) {
        // Deep Space Purple Horizon
        grad.addColorStop(0, '#020617');
        grad.addColorStop(0.5, '#0f172a');
        grad.addColorStop(1, '#311042');
      } else {
        // Orbit / Stratosphere Stars
        grad.addColorStop(0, '#000000');
        grad.addColorStop(0.5, '#020617');
        grad.addColorStop(1, '#090d16');
      }
    } else {
      if (altitude < 0.4) {
        // Bright Sunny Day
        grad.addColorStop(0, '#38bdf8');
        grad.addColorStop(0.7, '#7dd3fc');
        grad.addColorStop(1, '#bae6fd');
      } else if (altitude < 0.8) {
        // Golden Sunset
        grad.addColorStop(0, '#6366f1');
        grad.addColorStop(0.4, '#f43f5e');
        grad.addColorStop(0.8, '#fb923c');
        grad.addColorStop(1, '#fde047');
      } else {
        // Twilight Stratosphere
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(0.6, '#312e81');
        grad.addColorStop(1, '#831843');
      }
    }

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Stars at higher altitudes
    if (altitude > 0.35 || isDark) {
      const starAlpha = Math.min(0.9, isDark ? 0.75 : (altitude - 0.35) * 2.0);
      ctx.fillStyle = `rgba(255, 255, 255, ${starAlpha})`;
      const starCount = 35;
      for (let i = 0; i < starCount; i++) {
        const sx = ((i * 97 + 23) % w);
        const sy = ((i * 137 + 41 + camY * 0.08) % (h * 0.75));
        const size = (i % 3 === 0) ? 2 : 1;
        ctx.fillRect(sx, sy, size, size);
      }
    }
  }

  /**
   * Parallax city backdrop with soft glowing skyline silhouettes
   */
  private renderCitySkyline(ctx: CanvasRenderingContext2D, w: number, h: number, camY: number) {
    const isDark = this.currentTheme === 'dark';
    const baseY = h * 0.82 + camY * 0.18; // Slow parallax shift

    // Distant background skyscrapers
    ctx.fillStyle = isDark ? '#0b1120' : '#94a3b8';
    const bldCount = 8;
    const bldW = w / bldCount;
    for (let i = 0; i < bldCount; i++) {
      const bH = 120 + ((i * 47) % 180);
      const bX = i * bldW;
      ctx.fillRect(bX - 5, baseY - bH, bldW + 10, bH + 200);

      // Distant window lights
      if (isDark) {
        ctx.fillStyle = 'rgba(253, 224, 71, 0.15)';
        for (let wy = baseY - bH + 20; wy < baseY - 10; wy += 24) {
          for (let wx = bX + 6; wx < bX + bldW - 6; wx += 14) {
            if ((i + wx) % 3 === 0) {
              ctx.fillRect(wx, wy, 4, 6);
            }
          }
        }
        ctx.fillStyle = '#0b1120';
      }
    }
  }

  /**
   * Renders construction foundation and road
   */
  private renderGround(ctx: CanvasRenderingContext2D, cx: number, gy: number, w: number) {
    const isDark = this.currentTheme === 'dark';

    // Road / ground base
    ctx.fillStyle = isDark ? '#0f172a' : '#475569';
    ctx.fillRect(0, gy, w, 200);

    // Foundation concrete slab
    const fW = SKYLINE_CONSTANTS.FOUNDATION_WIDTH;
    const fH = SKYLINE_CONSTANTS.FOUNDATION_HEIGHT;
    const fX = cx - fW * 0.5;
    const fY = gy - fH;

    // Concrete block
    ctx.fillStyle = isDark ? '#334155' : '#64748b';
    ctx.fillRect(fX, fY, fW, fH);

    // Hazard caution stripes on foundation border
    ctx.save();
    ctx.beginPath();
    ctx.rect(fX, fY + fH - 12, fW, 12);
    ctx.clip();

    ctx.fillStyle = '#eab308'; // Warning yellow
    ctx.fillRect(fX, fY + fH - 12, fW, 12);
    ctx.fillStyle = '#1e293b'; // Black hazard stripes
    for (let sx = fX - 20; sx < fX + fW + 20; sx += 20) {
      ctx.beginPath();
      ctx.moveTo(sx, fY + fH);
      ctx.lineTo(sx + 10, fY + fH);
      ctx.lineTo(sx + 20, fY + fH - 12);
      ctx.lineTo(sx + 10, fY + fH - 12);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Steel foundation bolts
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(fX + 12, fY + 12, 4, 0, Math.PI * 2);
    ctx.arc(fX + fW - 12, fY + 12, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Renders placed skyscraper floors with harmonic spring sway
   */
  private renderSkyscraper(
    ctx: CanvasRenderingContext2D,
    state: SkylinePlayerState,
    cx: number,
    gy: number
  ) {
    const floors = state.floors;
    const isDark = this.currentTheme === 'dark';

    for (let i = 1; i < floors.length; i++) {
      const floor = floors[i];
      // Quadratic sway displacement: higher floors sway significantly more!
      const swayFraction = i / Math.max(1, floors.length - 1);
      const swayX = Math.sin(state.wobbleAngle) * (floors.length * SKYLINE_CONSTANTS.BLOCK_HEIGHT * 0.28) * (swayFraction * swayFraction);

      const screenX = cx + floor.x + swayX - floor.width * 0.5;
      const screenY = gy - floor.y - floor.height;

      // Floor block main body
      ctx.fillStyle = floor.color;
      ctx.fillRect(screenX, screenY, floor.width, floor.height);

      // 3D architectural bevel / highlight (top and left edge)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.fillRect(screenX, screenY, floor.width, 3);
      ctx.fillRect(screenX, screenY, 3, floor.height);

      // Floor drop shadow (bottom edge)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fillRect(screenX, screenY + floor.height - 3, floor.width, 3);
      ctx.fillRect(screenX + floor.width - 3, screenY, 3, floor.height);

      // Accent cornices / ledges
      ctx.fillStyle = floor.accentColor;
      ctx.fillRect(screenX - 2, screenY, floor.width + 4, 4);

      // Windows
      const winW = 12;
      const winH = 16;
      const spacing = (floor.width - floor.windowCount * winW) / (floor.windowCount + 1);

      for (let wIdx = 0; wIdx < floor.windowCount; wIdx++) {
        const winX = screenX + spacing + wIdx * (winW + spacing);
        const winY = screenY + 11;

        const isLit = floor.windowLights[wIdx] ?? true;
        if (isLit) {
          ctx.fillStyle = isDark ? '#fef08a' : '#bae6fd'; // Glowing warm amber or cool sky blue
        } else {
          ctx.fillStyle = isDark ? '#1e293b' : '#64748b'; // Dark unlit
        }

        ctx.fillRect(winX, winY, winW, winH);

        // Window frame divider
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(winX + winW * 0.5 - 0.5, winY, 1, winH);
        ctx.fillRect(winX, winY + winH * 0.5 - 0.5, winW, 1);
      }

      // If it's the golden crown penthouse, draw spires and victory antenna!
      if (floor.type === 'penthouse') {
        ctx.fillStyle = '#f59e0b';
        // Central spire antenna
        ctx.fillRect(screenX + floor.width * 0.5 - 3, screenY - 28, 6, 28);
        ctx.beginPath();
        ctx.arc(screenX + floor.width * 0.5, screenY - 30, 5, 0, Math.PI * 2);
        ctx.fill();

        // Pulsing red aviation warning beacon
        const beaconAlpha = 0.5 + Math.sin(this.animTime * 6.0) * 0.5;
        ctx.fillStyle = `rgba(239, 68, 68, ${beaconAlpha})`;
        ctx.beginPath();
        ctx.arc(screenX + floor.width * 0.5, screenY - 30, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /**
   * Renders the actively falling block after release
   */
  private renderFallingBlock(
    ctx: CanvasRenderingContext2D,
    block: FallingBlock,
    cx: number,
    gy: number
  ) {
    const screenX = cx + block.x - block.width * 0.5;
    const screenY = gy - block.y - block.height;

    ctx.save();
    ctx.fillStyle = block.color;
    ctx.fillRect(screenX, screenY, block.width, block.height);

    // Bevel highlights
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(screenX, screenY, block.width, 3);
    ctx.fillRect(screenX, screenY, 3, block.height);

    ctx.fillStyle = block.accentColor;
    ctx.fillRect(screenX - 2, screenY, block.width + 4, 4);

    // Windows
    const winW = 12;
    const winH = 16;
    const spacing = (block.width - block.windowCount * winW) / (block.windowCount + 1);
    for (let wIdx = 0; wIdx < block.windowCount; wIdx++) {
      const winX = screenX + spacing + wIdx * (winW + spacing);
      const winY = screenY + 11;
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(winX, winY, winW, winH);
    }

    ctx.restore();
  }

  /**
   * Renders the swinging construction crane & suspended block
   */
  private renderCrane(
    ctx: CanvasRenderingContext2D,
    crane: CraneState,
    cx: number,
    gy: number
  ) {
    const anchorScreenX = cx + crane.anchorX;
    const anchorScreenY = gy - crane.anchorY;

    const hookScreenX = cx + crane.hookX;
    const hookScreenY = gy - crane.hookY;

    ctx.save();

    // 1. Crane Overhead Jib Arm (Lattice Mast)
    ctx.strokeStyle = '#f59e0b'; // Industrial safety yellow
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(anchorScreenX - 110, anchorScreenY - 14);
    ctx.lineTo(anchorScreenX + 110, anchorScreenY - 14);
    ctx.stroke();

    // Crane Pulley Trolley
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(anchorScreenX - 12, anchorScreenY - 16, 24, 12);

    // Blinking red aviation light on crane tip
    const blink = (Math.sin(this.animTime * 8.0) > 0);
    ctx.fillStyle = blink ? '#ef4444' : '#7f1d1d';
    ctx.beginPath();
    ctx.arc(anchorScreenX + 105, anchorScreenY - 18, 4, 0, Math.PI * 2);
    ctx.fill();

    // 2. Steel Winch Cable
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(anchorScreenX, anchorScreenY - 10);
    ctx.lineTo(hookScreenX, hookScreenY);
    ctx.stroke();

    // 3. Heavy Construction Hook
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(hookScreenX, hookScreenY, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(hookScreenX, hookScreenY + 6, 6, Math.PI * 0.2, Math.PI * 1.6);
    ctx.stroke();

    // 4. Block currently held by the hook
    if (crane.holdingBlock) {
      const block = crane.holdingBlock;
      const bScreenX = hookScreenX - block.width * 0.5;
      const bScreenY = hookScreenY + 6;

      ctx.fillStyle = block.color;
      ctx.fillRect(bScreenX, bScreenY, block.width, block.height);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(bScreenX, bScreenY, block.width, 3);
      ctx.fillRect(bScreenX, bScreenY, 3, block.height);

      ctx.fillStyle = block.accentColor;
      ctx.fillRect(bScreenX - 2, bScreenY, block.width + 4, 4);

      // Windows
      const winW = 12;
      const winH = 16;
      const spacing = (block.width - block.windowCount * winW) / (block.windowCount + 1);
      for (let wIdx = 0; wIdx < block.windowCount; wIdx++) {
        const winX = bScreenX + spacing + wIdx * (winW + spacing);
        const winY = bScreenY + 11;
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(winX, winY, winW, winH);
      }
    }

    ctx.restore();
  }

  /**
   * Renders missed blocks tumbling off into the abyss
   */
  private renderTumblingBlocks(
    ctx: CanvasRenderingContext2D,
    blocks: TumblingBlock[],
    cx: number,
    gy: number
  ) {
    for (const b of blocks) {
      ctx.save();
      const screenX = cx + b.x;
      const screenY = gy - b.y;

      ctx.translate(screenX, screenY);
      ctx.rotate(b.rotation);
      ctx.globalAlpha = Math.max(0, b.alpha);

      ctx.fillStyle = b.color;
      ctx.fillRect(-b.width * 0.5, -b.height * 0.5, b.width, b.height);

      ctx.fillStyle = b.accentColor;
      ctx.fillRect(-b.width * 0.5 - 2, -b.height * 0.5, b.width + 4, 4);

      ctx.restore();
    }
  }

  /**
   * Updates & renders sparkle and dust particles
   */
  private updateAndRenderParticles(
    ctx: CanvasRenderingContext2D,
    dt: number,
    cx: number,
    gy: number
  ) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha = 1.0 - (p.life / p.maxLife);

      if (p.life >= p.maxLife || p.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(cx + p.x, gy - p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * Updates & renders floating combo / score popups
   */
  private updateAndRenderFloatingTexts(
    ctx: CanvasRenderingContext2D,
    dt: number,
    cx: number,
    gy: number
  ) {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const t = this.floatingTexts[i];
      t.life += dt;
      t.y += 45 * dt; // Float upward
      t.alpha = 1.0 - (t.life / t.maxLife);

      if (t.life >= t.maxLife || t.alpha <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, t.alpha);
      ctx.font = '900 16px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';

      // Drop shadow for crisp readability
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillText(t.text, cx + t.x + 1.5, gy - t.y + 1.5);

      ctx.fillStyle = t.color;
      ctx.fillText(t.text, cx + t.x, gy - t.y);
      ctx.restore();
    }
  }

  /**
   * Renders floating mini-skyscraper HUD showing real-time rival height and progress
   */
  private renderRivalGhostHUD(
    ctx: CanvasRenderingContext2D,
    rival: SkylinePlayerState,
    w: number,
    _h: number
  ) {
    const isDark = this.currentTheme === 'dark';
    const hudW = 44;
    const hudH = 160;
    const hudX = w - hudW - 14;
    const hudY = 65;

    ctx.save();
    // Glassmorphic container
    ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.88)';
    ctx.strokeStyle = isDark ? 'rgba(51, 65, 85, 0.8)' : 'rgba(203, 213, 225, 0.9)';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.roundRect(hudX, hudY, hudW, hudH, 10);
    ctx.fill();
    ctx.stroke();

    // Rival Label
    ctx.fillStyle = '#ef4444'; // Rival Red
    ctx.font = '800 9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RIVAL', hudX + hudW * 0.5, hudY + 13);

    // Height progress meter bar inside card
    const meterX = hudX + 16;
    const meterY = hudY + 22;
    const meterW = 12;
    const meterH = 105;

    ctx.fillStyle = isDark ? '#1e293b' : '#e2e8f0';
    ctx.fillRect(meterX, meterY, meterW, meterH);

    // Rival filled floors
    const totalFloors = Math.max(1, SKYLINE_CONSTANTS.TARGET_FLOORS);
    const activeFloors = Math.max(0, rival.floors.length - 1);
    const fillFrac = Math.min(1.0, activeFloors / totalFloors);
    const fillH = meterH * fillFrac;

    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(meterX, meterY + meterH - fillH, meterW, fillH);

    // Floor count badge
    ctx.fillStyle = isDark ? '#ffffff' : '#0f172a';
    ctx.font = '900 11px monospace';
    ctx.fillText(`F${activeFloors}`, hudX + hudW * 0.5, hudY + hudH - 8);

    ctx.restore();
  }
}
