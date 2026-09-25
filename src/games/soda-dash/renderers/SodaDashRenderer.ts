import type { RunnerState, TrackItem } from '../soda-dash-types';
import type { SodaDashEngine } from '../soda-dash-engine';

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface FloatingText {
  active: boolean;
  text: string;
  x: number;
  y: number;
  vy: number;
  alpha: number;
  color: string;
}

interface RenderSlot {
  isRunner: boolean;
  z: number;
  item: TrackItem | null;
  runner: RunnerState | null;
  isPlayer: boolean;
}

export class SodaDashRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private engine: SodaDashEngine;

  // Pre-allocated Fixed Particle Pool (80 particles)
  private particlePool: Particle[] = Array.from({ length: 80 }, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    color: '#ffffff',
    size: 3
  }));
  private nextParticleIdx: number = 0;

  // Pre-allocated Fixed Floating Text Pool (12 texts)
  private floatingTextPool: FloatingText[] = Array.from({ length: 12 }, () => ({
    active: false,
    text: '',
    x: 0,
    y: 0,
    vy: -50,
    alpha: 0,
    color: '#ffffff'
  }));
  private nextFloatingTextIdx: number = 0;

  // Pre-allocated Render Slots (96 slots for zero-allocation depth sorting)
  private renderSlots: RenderSlot[] = Array.from({ length: 96 }, () => ({
    isRunner: false,
    z: 0,
    item: null,
    runner: null,
    isPlayer: false
  }));

  // Cached Offscreen Canvas & Gradients
  private skylineCanvas: HTMLCanvasElement | null = null;
  private cachedSkyGrad: CanvasGradient | null = null;
  private cachedSunGlow: CanvasGradient | null = null;
  private cachedSunX: number = 0;
  private cachedSunY: number = 0;
  private cachedGrassGrad: CanvasGradient | null = null;
  private cachedWidth: number = 0;
  private cachedHeight: number = 0;
  private now: number = 0;

  constructor(canvas: HTMLCanvasElement, engine: SodaDashEngine) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Could not get Canvas 2D context');
    this.ctx = context;
    this.engine = engine;
    this.onResize(this.canvas.width || 800, this.canvas.height || 600);
  }

  public onResize(width: number, height: number): void {
    if (width === this.cachedWidth && height === this.cachedHeight && this.cachedSkyGrad) {
      return;
    }
    this.cachedWidth = width;
    this.cachedHeight = height;

    const isMobile = width < 768 || height > width;
    const horizonRatio = isMobile ? 0.28 : 0.32;
    const horizonY = height * horizonRatio;

    // 1. Cheerful Azure-to-Peach Summer Sky Gradient
    const skyGrad = this.ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, '#0284c7');    // Deep Azure
    skyGrad.addColorStop(0.4, '#38bdf8');  // Cheerful Sky Cyan
    skyGrad.addColorStop(0.75, '#7dd3fc'); // Gentle Summer Blue
    skyGrad.addColorStop(1, '#fed7aa');    // Warm Peach Sunlight Horizon
    this.cachedSkyGrad = skyGrad;

    // 2. Radiant Golden Cartoon Sun Radial Gradient
    this.cachedSunX = width * 0.82;
    this.cachedSunY = horizonY * 0.32;
    const sunGlow = this.ctx.createRadialGradient(this.cachedSunX, this.cachedSunY, 12, this.cachedSunX, this.cachedSunY, 140);
    sunGlow.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
    sunGlow.addColorStop(0.25, 'rgba(253, 224, 71, 0.6)');
    sunGlow.addColorStop(0.6, 'rgba(251, 146, 60, 0.2)');
    sunGlow.addColorStop(1, 'transparent');
    this.cachedSunGlow = sunGlow;

    // 3. Lush Emerald Lawn Shoulders Gradient
    const grassGrad = this.ctx.createLinearGradient(0, horizonY, 0, height);
    grassGrad.addColorStop(0, '#22c55e'); // Fresh Lawn Green
    grassGrad.addColorStop(0.5, '#16a34a');
    grassGrad.addColorStop(1, '#15803d');
    this.cachedGrassGrad = grassGrad;

    // 4. Pre-render City Skyline Offscreen Pattern
    this.generateSkyline();
  }

  public reset(): void {
    for (let i = 0; i < this.particlePool.length; i++) {
      this.particlePool[i].active = false;
    }
    for (let i = 0; i < this.floatingTextPool.length; i++) {
      this.floatingTextPool[i].active = false;
    }
  }

  private generateSkyline(): void {
    if (typeof document === 'undefined') return;
    if (!this.skylineCanvas) {
      this.skylineCanvas = document.createElement('canvas');
      this.skylineCanvas.width = 312;
      this.skylineCanvas.height = 105;
    }
    const offCtx = this.skylineCanvas.getContext('2d');
    if (!offCtx) return;

    offCtx.clearRect(0, 0, 312, 105);
    const buildingColors = ['#f43f5e', '#38bdf8', '#facc15', '#a855f7', '#34d399', '#fb923c'];

    for (let i = 0; i < 6; i++) {
      const bx = i * 52;
      const col = buildingColors[i];
      const bHeight = 35 + ((Math.abs(Math.sin((bx + 80) * 1.6)) * 46) | 0);

      // Building Body
      offCtx.fillStyle = col;
      offCtx.beginPath();
      offCtx.roundRect(bx, 105 - bHeight, 44, bHeight, [6, 6, 0, 0]);
      offCtx.fill();

      // Cute Triangular Roof
      if (i % 2 === 0) {
        offCtx.fillStyle = '#ffffff';
        offCtx.beginPath();
        offCtx.moveTo(bx, 105 - bHeight);
        offCtx.lineTo(bx + 22, 105 - bHeight - 14);
        offCtx.lineTo(bx + 44, 105 - bHeight);
        offCtx.closePath();
        offCtx.fill();
      }

      // Friendly White Windows
      offCtx.fillStyle = '#ffffff';
      for (let wy = 105 - bHeight + 8; wy < 105 - 6; wy += 12) {
        offCtx.fillRect(bx + 8, wy, 8, 7);
        offCtx.fillRect(bx + 28, wy, 8, 7);
      }
    }
  }

  public addSplash(x: number, y: number, color: string, count: number = 12): void {
    const pool = this.particlePool;
    const poolLen = pool.length;
    for (let i = 0; i < count; i++) {
      const p = pool[this.nextParticleIdx];
      this.nextParticleIdx = (this.nextParticleIdx + 1) % poolLen;

      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 120;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - 30;
      p.life = 0.4 + Math.random() * 0.4;
      p.maxLife = 0.8;
      p.color = color;
      p.size = 3 + Math.random() * 4;
    }
  }

  public addFloatingText(text: string, x: number, y: number, color: string): void {
    const pool = this.floatingTextPool;
    const ft = pool[this.nextFloatingTextIdx];
    this.nextFloatingTextIdx = (this.nextFloatingTextIdx + 1) % pool.length;

    ft.active = true;
    ft.text = text;
    ft.x = x;
    ft.y = y;
    ft.vy = -50;
    ft.alpha = 1.0;
    ft.color = color;
  }

  public render(dt: number): void {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const ctx = this.ctx;

    this.now = performance.now();
    if (!this.cachedSkyGrad || width !== this.cachedWidth || height !== this.cachedHeight) {
      this.onResize(width, height);
    }

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    const isMobile = width < 768 || height > width;
    const horizonRatio = isMobile ? 0.28 : 0.32;
    const horizonY = height * horizonRatio;
    const vanishX = width * 0.5;

    // Camera follows player distance: mobile is zoomed in more (2.0m follow), desktop is 3.4m
    const cameraFollowZ = isMobile ? 2.0 : 3.4;
    const cameraZ = this.engine.player.distance - cameraFollowZ;

    // 1. Draw Sky & Parallax City Skyline
    this.drawSkyAndSkyline(ctx, width, height, horizonY, cameraZ);

    // 2. Draw 3D Infinite Perspective Road
    this.drawRoad(ctx, width, height, horizonY, vanishX, cameraZ);

    // 3. Collect all 3D renderable objects (Obstacles, Pickups, Runners)
    this.drawWorldObjects(ctx, width, height, horizonY, vanishX, cameraZ, dt);

    // 4. Update and Render Particles
    this.drawParticles(ctx, dt);

    // 5. Update and Render Floating Texts
    this.drawFloatingTexts(ctx, dt);

    // 6. Draw Speed Lines & Damage Vignette
    this.drawScreenOverlays(ctx, width, height);

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 1. SKY & CITY PARALLAX
  // -------------------------------------------------------------

  private drawCloud(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 22 * s, 0, Math.PI * 2);
    ctx.arc(cx + 22 * s, cy - 10 * s, 30 * s, 0, Math.PI * 2);
    ctx.arc(cx + 50 * s, cy - 4 * s, 24 * s, 0, Math.PI * 2);
    ctx.arc(cx + 72 * s, cy + 6 * s, 18 * s, 0, Math.PI * 2);
    ctx.arc(cx - 18 * s, cy + 6 * s, 18 * s, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();

    // Cloud soft under-shading
    ctx.fillStyle = '#e0f2fe';
    ctx.beginPath();
    ctx.arc(cx + 22 * s, cy + 12 * s, 16 * s, 0, Math.PI * 2);
    ctx.arc(cx + 50 * s, cy + 12 * s, 14 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // -------------------------------------------------------------
  // 1. VIBRANT SUNNY SKY & PLAYFUL CARTOON CITY
  // -------------------------------------------------------------

  private drawSkyAndSkyline(
    ctx: CanvasRenderingContext2D,
    width: number,
    _height: number,
    horizonY: number,
    cameraZ: number
  ): void {
    // 1. Cheerful Azure-to-Peach Summer Sky (Cached gradient)
    ctx.fillStyle = this.cachedSkyGrad || '#38bdf8';
    ctx.fillRect(0, 0, width, horizonY);

    // 2. Radiant Golden Cartoon Sun (Cached glow)
    const sunX = this.cachedSunX;
    const sunY = this.cachedSunY;
    if (this.cachedSunGlow) {
      ctx.fillStyle = this.cachedSunGlow;
      ctx.fillRect(sunX - 140, sunY - 140, 280, 280);
    }

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 28, 0, Math.PI * 2);
    ctx.fill();

    // 3. Cute Drifting Fluffy White Clouds
    const cloudSpeed = cameraZ * 0.03;
    const cSpan = width + 300;
    this.drawCloud(ctx, ((140 - cloudSpeed) % cSpan + cSpan) % cSpan - 100, 80, 1.2);
    this.drawCloud(ctx, ((520 - cloudSpeed) % cSpan + cSpan) % cSpan - 100, 105, 0.9);
    this.drawCloud(ctx, ((940 - cloudSpeed) % cSpan + cSpan) % cSpan - 100, 70, 1.0);

    // 4. Distant Rolling Green Hills
    ctx.fillStyle = '#86efac';
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    for (let x = 0; x <= width; x += 80) {
      const hy = horizonY - 24 - Math.sin(x * 0.008 + cameraZ * 0.005) * 16;
      ctx.lineTo(x, hy);
    }
    ctx.lineTo(width, horizonY);
    ctx.closePath();
    ctx.fill();

    // 5. Colorful Pastel Candy / Soda City Skyline (Blitted from cached offscreen canvas)
    if (this.skylineCanvas) {
      const tileW = 312;
      const tileH = 105;
      const cityOffset = (cameraZ * 0.06) % tileW;
      let startX = -cityOffset;
      while (startX > 0) startX -= tileW;
      for (let x = startX; x < width; x += tileW) {
        ctx.drawImage(this.skylineCanvas, x, horizonY - tileH);
      }
    }
  }

  // -------------------------------------------------------------
  // 2. PERSPECTIVE ROAD ENGINE (LUSH LAWN & VIBRANT TRACK)
  // -------------------------------------------------------------

  private drawRoad(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    horizonY: number,
    vanishX: number,
    cameraZ: number
  ): void {
    const isMobile = width < 768 || height > width;
    const zCrest = isMobile ? 28 : 38;

    // Lush Emerald Lawn Shoulders (Cached gradient)
    ctx.fillStyle = this.cachedGrassGrad || '#16a34a';
    ctx.fillRect(0, horizonY, width, height - horizonY);

    // Scrolling Road Segments with Perfectly Aligned Curbs (Segment-by-Segment)
    const segmentLength = 2.0;
    const startSegment = Math.floor(cameraZ / segmentLength);
    const numSegments = Math.ceil(zCrest / segmentLength) + 1;

    for (let i = numSegments - 1; i >= -1; i--) {
      const segZ1 = (startSegment + i) * segmentLength;
      const segZ2 = (startSegment + i + 1) * segmentLength;

      const relZ1 = Math.max(0, segZ1 - cameraZ);
      const relZ2 = Math.max(0.1, segZ2 - cameraZ);
      if (relZ2 <= relZ1) continue;

      const p1 = this.projectPoint(0, 0, relZ1, width, height, horizonY, vanishX);
      const p2 = this.projectPoint(0, 0, relZ2, width, height, horizonY, vanishX);

      const isOdd = (startSegment + i) % 2 === 0;

      // Curb width scales with distance
      const curbW1 = Math.max(5, 40 * (p1.scale / (isMobile ? 1.42 : 1.0)));
      const curbW2 = Math.max(5, 40 * (p2.scale / (isMobile ? 1.42 : 1.0)));

      // Shared vertex coordinates guarantee 100% mathematical alignment
      const leftOuter1 = vanishX - p1.halfW;
      const leftOuter2 = vanishX - p2.halfW;
      const leftInner1 = leftOuter1 + curbW1;
      const leftInner2 = leftOuter2 + curbW2;

      const rightOuter1 = vanishX + p1.halfW;
      const rightOuter2 = vanishX + p2.halfW;
      const rightInner1 = rightOuter1 - curbW1;
      const rightInner2 = rightOuter2 - curbW2;

      // 1. Center Asphalt Road (Enhanced contrast for clear optical flow on high-refresh displays)
      ctx.fillStyle = isOdd ? '#38465c' : '#242f40';
      ctx.beginPath();
      ctx.moveTo(leftInner2, p2.y);
      ctx.lineTo(rightInner2, p2.y);
      ctx.lineTo(rightInner1, p1.y);
      ctx.lineTo(leftInner1, p1.y);
      ctx.closePath();
      ctx.fill();

      // 1b. Painted Dashed Lane Dividers (100% coplanar and glued to the asphalt surface)
      // Alternates with segments (isOdd) to create clean 2m painted, 2m gap highway dashed lines
      if (isOdd) {
        const dashW1 = Math.max(1.5, 4.5 * (p1.scale / (isMobile ? 1.42 : 1.0)));
        const dashW2 = Math.max(1.5, 4.5 * (p2.scale / (isMobile ? 1.42 : 1.0)));
        ctx.fillStyle = 'rgba(254, 240, 138, 0.85)'; // Radiant warm golden-white lane marking

        // Divider 1 (between Left Lane -1 and Center Lane 0: lane offset -0.5)
        const div1X1 = vanishX - 0.5 * p1.laneSpacing;
        const div1X2 = vanishX - 0.5 * p2.laneSpacing;
        ctx.beginPath();
        ctx.moveTo(div1X2 - dashW2 * 0.5, p2.y);
        ctx.lineTo(div1X2 + dashW2 * 0.5, p2.y);
        ctx.lineTo(div1X1 + dashW1 * 0.5, p1.y);
        ctx.lineTo(div1X1 - dashW1 * 0.5, p1.y);
        ctx.closePath();
        ctx.fill();

        // Divider 2 (between Center Lane 0 and Right Lane 1: lane offset +0.5)
        const div2X1 = vanishX + 0.5 * p1.laneSpacing;
        const div2X2 = vanishX + 0.5 * p2.laneSpacing;
        ctx.beginPath();
        ctx.moveTo(div2X2 - dashW2 * 0.5, p2.y);
        ctx.lineTo(div2X2 + dashW2 * 0.5, p2.y);
        ctx.lineTo(div2X1 + dashW1 * 0.5, p1.y);
        ctx.lineTo(div2X1 - dashW1 * 0.5, p1.y);
        ctx.closePath();
        ctx.fill();
      }

      // 2. Left Red & White Strip (100% Aligned to Asphalt Outer Edge)
      ctx.fillStyle = isOdd ? '#ef4444' : '#ffffff';
      ctx.beginPath();
      ctx.moveTo(leftOuter2, p2.y);
      ctx.lineTo(leftInner2, p2.y);
      ctx.lineTo(leftInner1, p1.y);
      ctx.lineTo(leftOuter1, p1.y);
      ctx.closePath();
      ctx.fill();

      // 3. Right Red & White Strip (100% Aligned to Asphalt Outer Edge)
      ctx.fillStyle = isOdd ? '#ef4444' : '#ffffff';
      ctx.beginPath();
      ctx.moveTo(rightInner2, p2.y);
      ctx.lineTo(rightOuter2, p2.y);
      ctx.lineTo(rightOuter1, p1.y);
      ctx.lineTo(rightInner1, p1.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  // -------------------------------------------------------------
  // 3. 3D WORLD OBJECTS (SORTED BY DEPTH)
  // -------------------------------------------------------------

  private drawWorldObjects(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    horizonY: number,
    vanishX: number,
    cameraZ: number,
    dt: number
  ): void {
    const isMobile = width < 768 || height > width;
    const zCrest = isMobile ? 28 : 38;

    let count = 0;
    const maxSlots = this.renderSlots.length;

    // Track Items within visible convex crest range
    const items = this.engine.track.getActiveItems(cameraZ + 0.4, cameraZ + zCrest + 2.0);
    const itemLen = items.length;
    for (let i = 0; i < itemLen; i++) {
      const item = items[i];
      if ((item.hit || item.cleared) && item.type !== 'PUDDLE' && item.type !== 'SODA_SPILL' && item.type !== 'SLOW_PAD') continue;
      if (count >= maxSlots) break;
      const slot = this.renderSlots[count++];
      slot.isRunner = false;
      slot.z = item.z;
      slot.item = item;
      slot.runner = null;
    }

    // Player Runner
    if (!this.engine.player.isDead && count < maxSlots) {
      const slot = this.renderSlots[count++];
      slot.isRunner = true;
      slot.z = this.engine.player.distance;
      slot.runner = this.engine.player;
      slot.isPlayer = true;
      slot.item = null;
    }

    // Opponent Runner
    if (!this.engine.opponent.isDead && count < maxSlots) {
      const slot = this.renderSlots[count++];
      slot.isRunner = true;
      slot.z = this.engine.opponent.distance;
      slot.runner = this.engine.opponent;
      slot.isPlayer = false;
      slot.item = null;
    }

    // In-place insertion sort (descending Z: furthest drawn first)
    // Items are already sorted ascending; adding 2 runners takes < 0.02ms with ZERO heap allocations!
    for (let i = 1; i < count; i++) {
      const curZ = this.renderSlots[i].z;
      const curIsRunner = this.renderSlots[i].isRunner;
      const curItem = this.renderSlots[i].item;
      const curRunner = this.renderSlots[i].runner;
      const curIsPlayer = this.renderSlots[i].isPlayer;

      let j = i - 1;
      while (j >= 0 && this.renderSlots[j].z < curZ) {
        const prev = this.renderSlots[j];
        const next = this.renderSlots[j + 1];
        next.z = prev.z;
        next.isRunner = prev.isRunner;
        next.item = prev.item;
        next.runner = prev.runner;
        next.isPlayer = prev.isPlayer;
        j--;
      }
      const target = this.renderSlots[j + 1];
      target.z = curZ;
      target.isRunner = curIsRunner;
      target.item = curItem;
      target.runner = curRunner;
      target.isPlayer = curIsPlayer;
    }

    // Render back-to-front
    for (let i = 0; i < count; i++) {
      const slot = this.renderSlots[i];
      if (slot.isRunner && slot.runner) {
        this.drawRunner(ctx, slot.runner, width, height, horizonY, vanishX, cameraZ, slot.isPlayer, dt);
      } else if (!slot.isRunner && slot.item) {
        this.drawTrackItem(ctx, slot.item, width, height, horizonY, vanishX, cameraZ);
      }
    }
  }

  private drawTrackItem(
    ctx: CanvasRenderingContext2D,
    item: TrackItem,
    width: number,
    height: number,
    horizonY: number,
    vanishX: number,
    cameraZ: number
  ): void {
    const relZ = item.z - cameraZ;
    if (relZ <= 0.4) return;

    const p = this.projectPoint(item.lane, 0, relZ, width, height, horizonY, vanishX);
    if (p.isBeyondCrest || p.scale <= 0.04) return;

    ctx.save();
    ctx.translate(p.x, p.y);

    const s = p.scale;

    switch (item.type) {
      case 'HURDLE': {
        // High-Contrast Yellow & Orange Hurdle Barricade
        // Hurdle width bounded to lane with clean spacing to prevent overlap
        const maxHw = p.laneSpacing * 0.38;
        const hw = Math.min(110 * s, maxHw);
        const sEff = hw / 110;
        const hh = 70 * sEff;

        // Ground Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 0, hw * 0.95, 14 * sEff, 0, 0, Math.PI * 2);
        ctx.fill();

        // Strong Feet
        ctx.strokeStyle = '#1d4ed8';
        ctx.lineWidth = Math.max(3, 8 * sEff);
        ctx.beginPath();
        ctx.moveTo(-hw * 0.75, 0);
        ctx.lineTo(-hw * 0.75, -hh);
        ctx.moveTo(hw * 0.75, 0);
        ctx.lineTo(hw * 0.75, -hh);
        ctx.stroke();

        // High-Contrast Board with Bold Cartoon Outline
        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2.5, 5 * sEff);
        ctx.beginPath();
        ctx.roundRect(-hw, -hh, hw * 2, 38 * sEff, 8 * sEff);
        ctx.fill();
        ctx.stroke();

        // Pure White Hazard Stripes
        ctx.fillStyle = '#ffffff';
        const stripeStep = 32 * sEff;
        const stripeW = 16 * sEff;
        for (let x = -hw + 8 * sEff; x < hw - 8 * sEff; x += stripeStep) {
          ctx.beginPath();
          ctx.moveTo(x, -hh);
          ctx.lineTo(x + stripeW, -hh);
          ctx.lineTo(x, -hh + 38 * sEff);
          ctx.lineTo(x - stripeW, -hh + 38 * sEff);
          ctx.fill();
        }
        break;
      }

      case 'OVERHEAD': {
        // Cheerful Slide Overhead Arch
        const maxPw = p.laneSpacing * 0.44;
        const pw = Math.min(140 * s, maxPw);
        const sEff = pw / 140;
        const pipeY = -135 * sEff;

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(-pw - 6 * sEff, -6 * sEff, (pw + 6 * sEff) * 2, 10 * sEff);

        // Striped Golden Posts
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = Math.max(2.5, 9 * sEff);
        ctx.beginPath();
        ctx.moveTo(-pw, 0);
        ctx.lineTo(-pw, pipeY);
        ctx.moveTo(pw, 0);
        ctx.lineTo(pw, pipeY);
        ctx.stroke();

        // Bold Outline for Banner
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2, 4 * sEff);
        ctx.beginPath();
        ctx.roundRect(-pw - 8 * sEff, pipeY - 18 * sEff, (pw + 8 * sEff) * 2, 36 * sEff, 8 * sEff);
        ctx.fill();
        ctx.stroke();

        // Yellow Center Plaque
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        const plaqueW = Math.min(96 * sEff, pw * 1.5);
        ctx.roundRect(-plaqueW * 0.5, pipeY - 13 * sEff, plaqueW, 26 * sEff, 6 * sEff);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.font = `900 ${Math.max(8, (18 * sEff) | 0)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('🔻 SLIDE! 🔻', 0, pipeY + 7 * sEff);
        break;
      }

      case 'DUMPSTER': {
        // Tall Cartoon Brick Wall with Directional Detour Arrows (Impassable Lane Barrier)
        const maxDw = p.laneSpacing * 0.38;
        const dw = Math.min(95 * s, maxDw);
        const sEff = dw / 95;

        // Taller than jump height with subtle height variation (185px - 210px)
        const heightBase = 185 + ((Math.abs(Math.sin(item.z * 1.7)) * 25) | 0);
        const dh = heightBase * sEff;

        // 1. Ground Drop Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.40)';
        ctx.beginPath();
        ctx.ellipse(0, 2 * sEff, dw * 1.06, 14 * sEff, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. Concrete Footer Foundation
        const footerH = 14 * sEff;
        ctx.fillStyle = '#64748b';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2.5, 5 * sEff);
        ctx.beginPath();
        ctx.roundRect(-dw * 1.02, -footerH, dw * 2.04, footerH, [0, 0, 6 * sEff, 6 * sEff]);
        ctx.fill();
        ctx.stroke();

        // 3. Solid Red Brick Wall Body
        const wallH = dh - footerH;
        ctx.fillStyle = '#dc2626'; // Vibrant cherry red brick
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2.5, 6 * sEff);
        ctx.beginPath();
        ctx.roundRect(-dw, -dh, dw * 2, wallH, 4 * sEff);
        ctx.fill();
        ctx.stroke();

        // 4. Staggered Brick Pattern (Mortar & Shaded Bricks)
        const numRows = 7;
        const rowH = wallH / numRows;
        ctx.strokeStyle = '#991b1b'; // Darker mortar line
        ctx.lineWidth = Math.max(1.5, 2.5 * sEff);

        for (let r = 0; r < numRows; r++) {
          const rowY = -dh + r * rowH;
          // Horizontal mortar line
          ctx.beginPath();
          ctx.moveTo(-dw, rowY);
          ctx.lineTo(dw, rowY);
          ctx.stroke();

          // Vertical joints (alternating offset)
          const isOffset = r % 2 === 1;
          const brickW = (dw * 2) / 3;
          const startX = -dw + (isOffset ? brickW * 0.5 : 0);

          for (let bx = startX; bx < dw; bx += brickW) {
            ctx.beginPath();
            ctx.moveTo(bx, rowY);
            ctx.lineTo(bx, rowY + rowH);
            ctx.stroke();

            // Lighter brick highlight speck on top-left of each brick
            ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
            ctx.fillRect(bx + 2 * sEff, rowY + 2 * sEff, brickW * 0.7, 3 * sEff);
          }
        }

        // 5. Heavy Concrete Top Coping / Stone Cap
        const capH = 16 * sEff;
        ctx.fillStyle = '#f1f5f9';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2.5, 5 * sEff);
        ctx.beginPath();
        ctx.roundRect(-dw * 1.04, -dh - capH * 0.5, dw * 2.08, capH, 6 * sEff);
        ctx.fill();
        ctx.stroke();

        // 6. Blinking Amber Hazard Beacon on Top Cap
        const beaconY = -dh - capH * 0.5 - 10 * sEff;
        const pulse = Math.sin(Date.now() * 0.008 + item.z) * 0.3 + 0.7;

        // Glowing halo
        const haloGrad = ctx.createRadialGradient(0, beaconY, 2, 0, beaconY, 24 * sEff);
        haloGrad.addColorStop(0, `rgba(245, 158, 11, ${0.7 * pulse})`);
        haloGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = haloGrad;
        ctx.fillRect(-24 * sEff, beaconY - 24 * sEff, 48 * sEff, 48 * sEff);

        // Beacon body & dome
        ctx.fillStyle = '#f59e0b';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2, 3.5 * sEff);
        ctx.beginPath();
        ctx.arc(0, beaconY, 8 * sEff, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-2 * sEff, beaconY - 2 * sEff, 2.5 * sEff, 0, Math.PI * 2);
        ctx.fill();

        // 7. High-Contrast Reflective Detour Chevron Sign in Center
        const signW = dw * 1.45;
        const signH = 44 * sEff;
        const signY = -dh * 0.52;

        // Sign plate (Caution Yellow)
        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2.5, 5 * sEff);
        ctx.beginPath();
        ctx.roundRect(-signW * 0.5, signY - signH * 0.5, signW, signH, 8 * sEff);
        ctx.fill();
        ctx.stroke();

        // Inner border
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = Math.max(1.5, 2.5 * sEff);
        ctx.strokeRect(-signW * 0.5 + 3 * sEff, signY - signH * 0.5 + 3 * sEff, signW - 6 * sEff, signH - 6 * sEff);

        // Directional Chevrons based on lane
        // Lane -1 (Left lane) -> Arrow points RIGHT (to center/right lane)
        // Lane +1 (Right lane) -> Arrow points LEFT (to center/left lane)
        // Lane 0 (Center lane) -> Dual arrows (◀ ▶)
        let arrowText = '◀  ▶';
        if (item.lane < 0) {
          arrowText = '▶▶▶';
        } else if (item.lane > 0) {
          arrowText = '◀◀◀';
        }

        ctx.fillStyle = '#0f172a';
        ctx.font = `900 ${Math.max(14, (26 * sEff) | 0)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(arrowText, 0, signY);
        break;
      }

      case 'PUDDLE':
      case 'SODA_SPILL': {
        // Sparkling Fizzy Soda Splash
        const maxPr = p.laneSpacing * 0.36;
        const pr = Math.min(88 * s, maxPr);
        const sEff = pr / 88;

        ctx.fillStyle = item.type === 'SODA_SPILL' ? 'rgba(244, 63, 94, 0.82)' : 'rgba(192, 132, 252, 0.8)';
        ctx.beginPath();
        ctx.ellipse(0, 0, pr, pr * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();

        // Bubble specks
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-pr * 0.4, 0, 3.5 * sEff, 0, Math.PI * 2);
        ctx.arc(pr * 0.3, -2 * sEff, 3 * sEff, 0, Math.PI * 2);
        ctx.arc(pr * 0.1, 3 * sEff, 4 * sEff, 0, Math.PI * 2);
        ctx.fill();

        // Rim highlight
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.5, 3.5 * sEff);
        ctx.stroke();
        break;
      }

      case 'SPEED_PAD': {
        // Supercharged Lime Boost Strip
        const maxBw = p.laneSpacing * 0.36;
        const bw = Math.min(76 * s, maxBw);
        const sEff = bw / 76;
        const bh = 96 * sEff;

        ctx.fillStyle = 'rgba(74, 222, 128, 0.35)';
        ctx.beginPath();
        ctx.roundRect(-bw, -bh * 0.5, bw * 2, bh, 10 * sEff);
        ctx.fill();

        ctx.fillStyle = '#22c55e';
        for (let cy = -bh * 0.4; cy < bh * 0.4; cy += 30 * sEff) {
          ctx.beginPath();
          ctx.moveTo(0, cy - 14 * sEff);
          ctx.lineTo(bw * 0.75, cy + 8 * sEff);
          ctx.lineTo(bw * 0.5, cy + 8 * sEff);
          ctx.lineTo(0, cy - 4 * sEff);
          ctx.lineTo(-bw * 0.5, cy + 8 * sEff);
          ctx.lineTo(-bw * 0.75, cy + 8 * sEff);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }

      case 'SLOW_PAD': {
        // High-Hazard Purple Slowness Strip (Jump to avoid!)
        const maxBw = p.laneSpacing * 0.38;
        const bw = Math.min(80 * s, maxBw);
        const sEff = bw / 80;
        const bh = 100 * sEff;

        // Glowing translucent purple road pad
        ctx.fillStyle = 'rgba(168, 85, 247, 0.40)';
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = Math.max(1.5, 3 * sEff);
        ctx.beginPath();
        ctx.roundRect(-bw, -bh * 0.5, bw * 2, bh, 10 * sEff);
        ctx.fill();
        ctx.stroke();

        // Inverted brake chevrons pointing down (slowing motion)
        ctx.fillStyle = '#f43f5e';
        for (let cy = -bh * 0.35; cy < bh * 0.4; cy += 32 * sEff) {
          ctx.beginPath();
          ctx.moveTo(0, cy + 12 * sEff);
          ctx.lineTo(bw * 0.7, cy - 8 * sEff);
          ctx.lineTo(bw * 0.45, cy - 8 * sEff);
          ctx.lineTo(0, cy + 3 * sEff);
          ctx.lineTo(-bw * 0.45, cy - 8 * sEff);
          ctx.lineTo(-bw * 0.7, cy - 8 * sEff);
          ctx.closePath();
          ctx.fill();
        }

        // Warning text on pad
        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${Math.max(9, (15 * sEff) | 0)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔻 SLOW 🔻', 0, 0);
        break;
      }

      case 'HEART': {
        // Standalone Glowing 3D Heart Pickup (+1 Heart, purely shaped, no box/wrapper)
        const maxHw = p.laneSpacing * 0.30;
        const hw = Math.min(38 * s, maxHw);
        const sEff = hw / 38;
        const floatY = -48 * sEff + Math.sin(Date.now() * 0.006 + item.z) * 8 * sEff;
        const pulse = 1.0 + Math.sin(Date.now() * 0.009 + item.z * 1.5) * 0.08;

        // Ground Drop Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
        ctx.beginPath();
        ctx.ellipse(0, 0, hw * 1.05, 8 * sEff, 0, 0, Math.PI * 2);
        ctx.fill();

        // Radiant Warm Pink/Red Aura Halo
        const auraGrad = ctx.createRadialGradient(0, floatY, 4 * sEff, 0, floatY, hw * 2.3);
        auraGrad.addColorStop(0, 'rgba(244, 63, 94, 0.65)');
        auraGrad.addColorStop(0.4, 'rgba(239, 68, 68, 0.22)');
        auraGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = auraGrad;
        ctx.fillRect(-hw * 2.3, floatY - hw * 2.3, hw * 4.6, hw * 4.6);

        // Vector Cartoon 3D Heart Shape
        const w = hw * pulse;
        const h = hw * 1.05 * pulse;
        const cy = floatY;

        ctx.beginPath();
        ctx.moveTo(0, cy + h * 0.85);
        // Left lobe curve
        ctx.bezierCurveTo(-w * 1.4, cy + h * 0.2, -w * 1.35, cy - h * 0.75, -w * 0.55, cy - h * 0.75);
        ctx.bezierCurveTo(-w * 0.15, cy - h * 0.75, 0, cy - h * 0.35, 0, cy - h * 0.22);
        // Right lobe curve
        ctx.bezierCurveTo(0, cy - h * 0.35, w * 0.15, cy - h * 0.75, w * 0.55, cy - h * 0.75);
        ctx.bezierCurveTo(w * 1.35, cy - h * 0.75, w * 1.4, cy + h * 0.2, 0, cy + h * 0.85);
        ctx.closePath();

        // Vibrant 3D Ruby/Crimson Shading
        const heartGrad = ctx.createLinearGradient(-w * 0.5, cy - h * 0.7, w * 0.5, cy + h * 0.8);
        heartGrad.addColorStop(0, '#ff3366'); // Radiant bright cherry top
        heartGrad.addColorStop(0.45, '#ef4444'); // Classic ruby red
        heartGrad.addColorStop(1, '#991b1b'); // Rich crimson shadow bottom
        ctx.fillStyle = heartGrad;
        ctx.fill();

        // Bold Outline
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2.5, 5 * sEff);
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Specular 3D Gloss / Shine on Top-Left Lobe
        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.beginPath();
        ctx.ellipse(-w * 0.5, cy - h * 0.42, w * 0.32, h * 0.16, -Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(-w * 0.36, cy - h * 0.48, 2.5 * sEff, 0, Math.PI * 2);
        ctx.fill();

        // Twinkling stars / sparkles
        ctx.font = `bold ${Math.max(10, (20 * sEff) | 0)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('✨', -hw * 1.25, floatY - hw * 0.65);
        ctx.fillText('✨', hw * 1.25, floatY - hw * 0.1);
        break;
      }

      case 'FIZZ_TURBO': {
        // Standalone 3D Rocket Item (pure shape, not in a box)
        const maxRw = p.laneSpacing * 0.30;
        const rw = Math.min(34 * s, maxRw);
        const sEff = rw / 34;
        const floatY = -48 * sEff + Math.sin(Date.now() * 0.007 + item.z) * 8 * sEff;

        // Ground Drop Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(0, 0, rw * 1.05, 8 * sEff, 0, 0, Math.PI * 2);
        ctx.fill();

        // Warm fiery aura
        const auraGrad = ctx.createRadialGradient(0, floatY, 4 * sEff, 0, floatY, rw * 2.2);
        auraGrad.addColorStop(0, 'rgba(249, 115, 22, 0.6)');
        auraGrad.addColorStop(0.5, 'rgba(234, 179, 8, 0.25)');
        auraGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = auraGrad;
        ctx.fillRect(-rw * 2.2, floatY - rw * 2.2, rw * 4.4, rw * 4.4);

        // Rocket Thruster Fire (pulsing)
        const flameH = (16 + Math.sin(Date.now() * 0.02 + item.z) * 6) * sEff;
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(-9 * sEff, floatY + 16 * sEff);
        ctx.lineTo(0, floatY + 16 * sEff + flameH);
        ctx.lineTo(9 * sEff, floatY + 16 * sEff);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.moveTo(-5 * sEff, floatY + 16 * sEff);
        ctx.lineTo(0, floatY + 16 * sEff + flameH * 0.65);
        ctx.lineTo(5 * sEff, floatY + 16 * sEff);
        ctx.closePath();
        ctx.fill();

        // Rocket Fins
        ctx.fillStyle = '#f59e0b';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2, 3.5 * sEff);
        // Left fin
        ctx.beginPath();
        ctx.moveTo(-13 * sEff, floatY + 2 * sEff);
        ctx.lineTo(-22 * sEff, floatY + 18 * sEff);
        ctx.lineTo(-13 * sEff, floatY + 16 * sEff);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Right fin
        ctx.beginPath();
        ctx.moveTo(13 * sEff, floatY + 2 * sEff);
        ctx.lineTo(22 * sEff, floatY + 18 * sEff);
        ctx.lineTo(13 * sEff, floatY + 16 * sEff);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Rocket Fuselage
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2.5, 4.5 * sEff);
        ctx.beginPath();
        ctx.roundRect(-13 * sEff, floatY - 14 * sEff, 26 * sEff, 30 * sEff, [0, 0, 6 * sEff, 6 * sEff]);
        ctx.fill();
        ctx.stroke();

        // Nose Cone (Pointed Tip)
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(-13 * sEff, floatY - 14 * sEff);
        ctx.quadraticCurveTo(0, floatY - 40 * sEff, 13 * sEff, floatY - 14 * sEff);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Cyan Porthole Window
        ctx.fillStyle = '#38bdf8';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(1.5, 3 * sEff);
        ctx.beginPath();
        ctx.arc(0, floatY - 2 * sEff, 6.5 * sEff, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Sparkles
        ctx.font = `bold ${Math.max(10, (18 * sEff) | 0)}px sans-serif`;
        ctx.fillText('✨', -rw * 1.2, floatY - 18 * sEff);
        ctx.fillText('✨', rw * 1.2, floatY);
        break;
      }

      case 'BUBBLE_SHIELD': {
        // Standalone 3D Shield Orb Item (pure shape, not in a box)
        const maxSw = p.laneSpacing * 0.30;
        const sw = Math.min(36 * s, maxSw);
        const sEff = sw / 36;
        const floatY = -48 * sEff + Math.sin(Date.now() * 0.006 + item.z) * 8 * sEff;

        // Ground Drop Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(0, 0, sw * 1.05, 8 * sEff, 0, 0, Math.PI * 2);
        ctx.fill();

        // Cyan Shimmering Aura
        const auraGrad = ctx.createRadialGradient(0, floatY, 4 * sEff, 0, floatY, sw * 2.2);
        auraGrad.addColorStop(0, 'rgba(56, 189, 248, 0.65)');
        auraGrad.addColorStop(0.5, 'rgba(6, 182, 212, 0.25)');
        auraGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = auraGrad;
        ctx.fillRect(-sw * 2.2, floatY - sw * 2.2, sw * 4.4, sw * 4.4);

        // Spherical Energy Bubble
        ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = Math.max(2.5, 4.5 * sEff);
        ctx.beginPath();
        ctx.arc(0, floatY, 24 * sEff, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Inner Shield Crest Emblem
        ctx.fillStyle = '#fde047';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2, 3.5 * sEff);
        ctx.beginPath();
        ctx.moveTo(0, floatY + 14 * sEff);
        ctx.lineTo(-12 * sEff, floatY + 2 * sEff);
        ctx.lineTo(-12 * sEff, floatY - 12 * sEff);
        ctx.lineTo(12 * sEff, floatY - 12 * sEff);
        ctx.lineTo(12 * sEff, floatY + 2 * sEff);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Blue Emblem Center
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.arc(0, floatY - 2 * sEff, 3.5 * sEff, 0, Math.PI * 2);
        ctx.fill();

        // Specular highlight on bubble
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(2, 3.5 * sEff);
        ctx.beginPath();
        ctx.arc(-7 * sEff, floatY - 7 * sEff, 11 * sEff, Math.PI * 1.1, Math.PI * 1.6);
        ctx.stroke();
        break;
      }

      case 'CHEST': {
        // Colorful Gold Treasure Chest (Mystery Powerup)
        const maxBw = p.laneSpacing * 0.32;
        const bw = Math.min(50 * s, maxBw);
        const sEff = bw / 50;
        const floatY = -48 * sEff + Math.sin(Date.now() * 0.005 + item.z) * 8 * sEff;

        // Ground Drop Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 0, bw * 1.15, 10 * sEff, 0, 0, Math.PI * 2);
        ctx.fill();

        // Shimmering Magical Aura (Gold & Cyan glow)
        const auraGrad = ctx.createRadialGradient(0, floatY - 20 * sEff, 6, 0, floatY - 20 * sEff, bw * 2.2);
        auraGrad.addColorStop(0, 'rgba(251, 191, 36, 0.65)');
        auraGrad.addColorStop(0.5, 'rgba(6, 182, 212, 0.35)');
        auraGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = auraGrad;
        ctx.fillRect(-bw * 2.2, floatY - 20 * sEff - bw * 2.2, bw * 4.4, bw * 4.4);

        const chestW = bw * 1.8;
        const chestH = 34 * sEff;
        const lidH = 22 * sEff;
        const cx = -chestW * 0.5;
        const cy = floatY - chestH;

        // 1. Lower Chest Box (Metallic Gold Gradient)
        const goldGrad = ctx.createLinearGradient(0, cy, 0, cy + chestH);
        goldGrad.addColorStop(0, '#fde047'); // Bright gold
        goldGrad.addColorStop(0.5, '#eab308'); // Rich amber gold
        goldGrad.addColorStop(1, '#a16207'); // Deep bronze gold
        ctx.fillStyle = goldGrad;
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2.5, 5 * sEff);
        ctx.beginPath();
        ctx.roundRect(cx, cy, chestW, chestH, [0, 0, 8 * sEff, 8 * sEff]);
        ctx.fill();
        ctx.stroke();

        // 2. Domed Curved Chest Lid
        const lidY = cy - lidH;
        const lidGrad = ctx.createLinearGradient(0, lidY, 0, cy);
        lidGrad.addColorStop(0, '#fef08a');
        lidGrad.addColorStop(0.4, '#f59e0b');
        lidGrad.addColorStop(1, '#b45309');
        ctx.fillStyle = lidGrad;
        ctx.beginPath();
        ctx.roundRect(cx - 3 * sEff, lidY, chestW + 6 * sEff, lidH + 4 * sEff, [14 * sEff, 14 * sEff, 4 * sEff, 4 * sEff]);
        ctx.fill();
        ctx.stroke();

        // 3. Colorful Cyan Metal Reinforcing Bands
        ctx.fillStyle = '#06b6d4'; // Vibrant turquoise metal bands
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(1.5, 3 * sEff);
        const bandW = 8 * sEff;
        // Left band
        ctx.fillRect(cx + 12 * sEff, lidY, bandW, lidH + chestH);
        ctx.strokeRect(cx + 12 * sEff, lidY, bandW, lidH + chestH);
        // Right band
        ctx.fillRect(cx + chestW - 12 * sEff - bandW, lidY, bandW, lidH + chestH);
        ctx.strokeRect(cx + chestW - 12 * sEff - bandW, lidY, bandW, lidH + chestH);

        // Golden Rivets on bands
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(cx + 12 * sEff + bandW * 0.5, lidY + 6 * sEff, 2 * sEff, 0, Math.PI * 2);
        ctx.arc(cx + 12 * sEff + bandW * 0.5, cy + chestH * 0.5, 2 * sEff, 0, Math.PI * 2);
        ctx.arc(cx + chestW - 12 * sEff - bandW * 0.5, lidY + 6 * sEff, 2 * sEff, 0, Math.PI * 2);
        ctx.arc(cx + chestW - 12 * sEff - bandW * 0.5, cy + chestH * 0.5, 2 * sEff, 0, Math.PI * 2);
        ctx.fill();

        // 4. Center Gold Lock Plate with Glowing Gemstone
        const lockW = 18 * sEff;
        const lockH = 20 * sEff;
        const lockX = -lockW * 0.5;
        const lockY = cy - 4 * sEff;

        ctx.fillStyle = '#fef08a';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2, 3.5 * sEff);
        ctx.beginPath();
        ctx.roundRect(lockX, lockY, lockW, lockH, 4 * sEff);
        ctx.fill();
        ctx.stroke();

        // Ruby Keyhole Gem in center
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(0, lockY + lockH * 0.45, 4 * sEff, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#991b1b';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Sparkle glint
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-1 * sEff, lockY + lockH * 0.45 - 1 * sEff, 1.5 * sEff, 0, Math.PI * 2);
        ctx.fill();

        // 5. Floating Magic Sparkles around chest
        const sparklePulse = Math.sin(Date.now() * 0.008 + item.z);
        ctx.font = `bold ${Math.max(10, (20 * sEff) | 0)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('✨', -chestW * 0.65, lidY + sparklePulse * 4 * sEff);
        ctx.fillText('✨', chestW * 0.65, cy + chestH * 0.8 - sparklePulse * 4 * sEff);
        break;
      }
    }

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 4. ANIMATED 3D RUNNERS (VIBRANT MASCOTS)
  // -------------------------------------------------------------

  private drawRunner(
    ctx: CanvasRenderingContext2D,
    runner: RunnerState,
    width: number,
    height: number,
    horizonY: number,
    vanishX: number,
    cameraZ: number,
    isPlayer: boolean,
    dt: number = 0.016
  ): void {
    const relZ = runner.distance - cameraZ;
    if (relZ <= 0.4) return;

    // Projected ground point
    const p = this.projectPoint(runner.currentX, 0, relZ, width, height, horizonY, vanishX);
    if (p.isBeyondCrest || p.scale <= 0.04) return;
    const s = p.scale;

    ctx.save();
    ctx.translate(p.x, p.y);

    // Same-Lane Shadow/Ghost: When other player/AI is in the same lane, make them semi-transparent
    // so player character and track view ahead remain clearly visible
    const isSameLane = !isPlayer && Math.abs(runner.currentX - this.engine.player.currentX) < 0.65;
    if (isSameLane) {
      ctx.globalAlpha = 0.32;
    }

    // Blinking transparency during invulnerability
    if (runner.invulnerableTimer > 0) {
      const blink = Math.sin(this.now * 0.04) > 0;
      if (blink) ctx.globalAlpha = isSameLane ? 0.18 : 0.35;
    }

    // Dynamic Shadow
    const shadowScale = Math.max(0.3, 1.0 - runner.jumpY * 0.5);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 42 * s * shadowScale, 14 * s * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Vertical Jump Offset
    const jumpOffsetPx = -runner.jumpY * 120 * s;
    ctx.translate(0, jumpOffsetPx);

    // Iridescent Bubble Shield
    if (runner.hasShield) {
      ctx.strokeStyle = '#38bdf8';
      ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
      ctx.lineWidth = Math.max(2.5, 7 * s);
      ctx.beginPath();
      ctx.arc(0, -68 * s, 76 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Bubble Shine Highlight
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2, 4.5 * s);
      ctx.beginPath();
      ctx.arc(-28 * s, -94 * s, 26 * s, Math.PI * 1.1, Math.PI * 1.5);
      ctx.stroke();
    }

    // Cheerful Mascot Colors
    const primaryColor = isPlayer ? '#06b6d4' : '#f43f5e';
    const accentColor = isPlayer ? '#facc15' : '#38bdf8';
    const visorColor = '#fef08a';

    // Running cycle phase based on distance (energetic 1.35x cadence avoids slow-motion look on 144Hz)
    const runPhase = (runner.distance * 1.35) % (Math.PI * 2);
    const legSwing = Math.sin(runPhase);
    const armSwingLeft = -legSwing;
    const armSwingRight = legSwing;

    if (runner.isSliding) {
      // SLIDE POSE: Low aerodynamic tuck with two hands braced
      ctx.fillStyle = primaryColor;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = Math.max(2.5, 5 * s);
      ctx.beginPath();
      ctx.roundRect(-44 * s, -30 * s, 88 * s, 30 * s, 12 * s);
      ctx.fill();
      ctx.stroke();

      // Visor
      ctx.fillStyle = visorColor;
      ctx.fillRect(-18 * s, -24 * s, 36 * s, 10 * s);

      // Gloves tucking at sides
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = Math.max(2, 3.5 * s);
      ctx.beginPath();
      ctx.arc(-36 * s, -12 * s, 9 * s, 0, Math.PI * 2);
      ctx.arc(36 * s, -12 * s, 9 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Slide spark particles (Frame-rate independent Poisson rate)
      const slideSparkProb = 1 - Math.pow(1 - 0.4, dt * 60);
      if (Math.random() < slideSparkProb) {
        this.addSplash(p.x + (Math.random() - 0.5) * 40 * s, p.y - 2, '#fde047', 2);
      }
    } else {
      // UPRIGHT RUNNING / JUMPING POSE (VIEWED FROM BEHIND)
      const torsoY = -75 * s;

      // Legs
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = Math.max(3.5, 12 * s);
      ctx.lineCap = 'round';

      if (runner.isJumping) {
        // Jump pose: Legs tucked
        ctx.beginPath();
        ctx.moveTo(-14 * s, torsoY + 24 * s);
        ctx.lineTo(-30 * s, torsoY + 44 * s);
        ctx.lineTo(-18 * s, torsoY + 54 * s);

        ctx.moveTo(14 * s, torsoY + 24 * s);
        ctx.lineTo(28 * s, torsoY + 44 * s);
        ctx.lineTo(16 * s, torsoY + 54 * s);
        ctx.stroke();
      } else {
        // Running stride legs
        ctx.beginPath();
        ctx.moveTo(-14 * s, torsoY + 24 * s);
        ctx.lineTo(-14 * s + legSwing * 26 * s, 0);

        ctx.moveTo(14 * s, torsoY + 24 * s);
        ctx.lineTo(14 * s - legSwing * 26 * s, 0);
        ctx.stroke();
      }

      // 2 HANDS & ARMS ANIMATION (VIEWED FROM BEHIND)
      if (runner.isJumping) {
        // JUMP: BOTH HANDS RAISED HIGH IN AIR IN TRIUMPH!
        // Left Arm & White Glove
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = Math.max(3.5, 11 * s);
        ctx.beginPath();
        ctx.moveTo(-22 * s, torsoY - 6 * s);
        ctx.lineTo(-44 * s, torsoY - 28 * s);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2.5, 4 * s);
        ctx.beginPath();
        ctx.arc(-44 * s, torsoY - 28 * s, 12 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Right Arm & White Glove
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = Math.max(3.5, 11 * s);
        ctx.beginPath();
        ctx.moveTo(22 * s, torsoY - 6 * s);
        ctx.lineTo(44 * s, torsoY - 28 * s);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2.5, 4 * s);
        ctx.beginPath();
        ctx.arc(44 * s, torsoY - 28 * s, 12 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        // RUNNING: 2 HANDS PUMPING IN NATURAL OPPOSITION
        // Left Arm & White Glove
        const leftHandX = -34 * s - armSwingLeft * 8 * s;
        const leftHandY = torsoY + 8 * s - armSwingLeft * 22 * s;
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = Math.max(3.5, 11 * s);
        ctx.beginPath();
        ctx.moveTo(-22 * s, torsoY);
        ctx.lineTo(leftHandX, leftHandY);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2, 3.5 * s);
        ctx.beginPath();
        ctx.arc(leftHandX, leftHandY, 11 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Right Arm & White Glove
        const rightHandX = 34 * s + armSwingRight * 8 * s;
        const rightHandY = torsoY + 8 * s - armSwingRight * 22 * s;
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = Math.max(3.5, 11 * s);
        ctx.beginPath();
        ctx.moveTo(22 * s, torsoY);
        ctx.lineTo(rightHandX, rightHandY);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2, 3.5 * s);
        ctx.beginPath();
        ctx.arc(rightHandX, rightHandY, 11 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Mascot Torso (From Behind)
      ctx.fillStyle = primaryColor;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = Math.max(2.5, 5 * s);
      ctx.beginPath();
      ctx.roundRect(-27 * s, torsoY - 19 * s, 54 * s, 47 * s, 14 * s);
      ctx.fill();
      ctx.stroke();

      // Symmetrical Dual Scarf Fluttering Behind Neck
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.moveTo(-12 * s, torsoY - 11 * s);
      ctx.lineTo(-44 * s - Math.sin(Date.now() * 0.015) * 8 * s, torsoY - 28 * s);
      ctx.lineTo(-18 * s, torsoY + 4 * s);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(12 * s, torsoY - 11 * s);
      ctx.lineTo(44 * s + Math.sin(Date.now() * 0.015) * 8 * s, torsoY - 28 * s);
      ctx.lineTo(18 * s, torsoY + 4 * s);
      ctx.fill();

      // Mascot Head (Back of Helmet)
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(0, torsoY - 35 * s, 26 * s, 0, Math.PI * 2);
      ctx.fill();

      // Visor Rim Seen from Behind
      ctx.fillStyle = visorColor;
      ctx.beginPath();
      ctx.roundRect(-22 * s, torsoY - 46 * s, 44 * s, 10 * s, 4 * s);
      ctx.fill();
    }

    // 🚀 DUAL ROCKET BOOSTERS (Active Turbo Thruster Pack)
    if (runner.isTurbo) {
      const rocketY = runner.isSliding ? -18 * s : -72 * s;
      const flameLen = (36 + Math.random() * 22) * s;

      // Rocket Pods at left & right shoulders
      const podOffsets = [-22 * s, 22 * s];
      for (const px of podOffsets) {
        // Rocket Pod Canister (Red with White Stripe & Silver Cone)
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2, 3.5 * s);
        ctx.beginPath();
        ctx.roundRect(px - 7 * s, rocketY - 14 * s, 14 * s, 28 * s, 4 * s);
        ctx.fill();
        ctx.stroke();

        // White stripe
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px - 6 * s, rocketY - 4 * s, 12 * s, 6 * s);

        // Exhaust Nozzle
        ctx.fillStyle = '#475569';
        ctx.fillRect(px - 5 * s, rocketY + 14 * s, 10 * s, 4 * s);

        // Outer Roaring Flame (Orange / Red)
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(px - 6 * s, rocketY + 18 * s);
        ctx.lineTo(px, rocketY + 18 * s + flameLen);
        ctx.lineTo(px + 6 * s, rocketY + 18 * s);
        ctx.closePath();
        ctx.fill();

        // Inner Blazing Core (Bright Yellow / White)
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.moveTo(px - 3 * s, rocketY + 18 * s);
        ctx.lineTo(px, rocketY + 18 * s + flameLen * 0.65);
        ctx.lineTo(px + 3 * s, rocketY + 18 * s);
        ctx.closePath();
        ctx.fill();
      }

      // Trailing rocket spark particles (Frame-rate independent Poisson rate)
      const rocketSparkProb = 1 - Math.pow(1 - 0.6, dt * 60);
      if (Math.random() < rocketSparkProb) {
        this.addSplash(p.x + (Math.random() - 0.5) * 20 * s, p.y + rocketY + 24 * s, '#fbbf24', 2);
      }
    }

    // Nametag above Opponent
    if (!isPlayer) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.beginPath();
      ctx.roundRect(-48 * s, -155 * s, 96 * s, 26 * s, 8 * s);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(10, (16 * s) | 0)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(runner.name, 0, -137 * s);
    }

    ctx.restore();
  }

  // -------------------------------------------------------------
  // 5. SCREEN FX & PARTICLES
  // -------------------------------------------------------------

  private drawParticles(ctx: CanvasRenderingContext2D, dt: number): void {
    let hasActive = false;
    const pool = this.particlePool;
    const poolLen = pool.length;

    for (let i = 0; i < poolLen; i++) {
      const p = pool[i];
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }

      hasActive = true;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt; // Gravity

      const alpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    if (hasActive) {
      ctx.globalAlpha = 1.0;
    }
  }

  private drawFloatingTexts(ctx: CanvasRenderingContext2D, dt: number): void {
    let hasActive = false;
    const pool = this.floatingTextPool;
    const poolLen = pool.length;

    for (let i = 0; i < poolLen; i++) {
      const ft = pool[i];
      if (!ft.active) continue;

      ft.alpha -= dt * 1.2;
      ft.y += ft.vy * dt;

      if (ft.alpha <= 0) {
        ft.active = false;
        continue;
      }

      if (!hasActive) {
        hasActive = true;
        ctx.save();
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round';
      }

      ctx.globalAlpha = ft.alpha;
      // High-performance hardware-accelerated text outline instead of slow shadowBlur
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.lineWidth = 4;
      ctx.strokeText(ft.text, ft.x, ft.y);

      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    }

    if (hasActive) {
      ctx.restore();
    }
  }

  private drawScreenOverlays(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Speed Wind Streaks: Full intensity on Turbo, subtle ambient peripheral streaks at normal running
    if (this.engine.player.isTurbo) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const sx = Math.random() * width;
        const sy = Math.random() * height;
        const len = 40 + Math.random() * 80;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - len * 0.4, sy + len);
      }
      ctx.stroke();
    } else if (this.engine.player.speed >= 16) {
      // Subtle peripheral speed streaks for optical flow on high refresh rate displays
      const speedRatio = Math.min(1.0, Math.max(0, (this.engine.player.speed - 16) / 29));
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.12 + speedRatio * 0.18})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const numStreaks = Math.min(4, Math.floor(2 + speedRatio * 2));
      for (let i = 0; i < numStreaks; i++) {
        // Keep to outer 25% edges of screen so main track stays crystal clear
        const isLeft = Math.random() < 0.5;
        const sx = isLeft ? Math.random() * (width * 0.25) : width * 0.75 + Math.random() * (width * 0.25);
        const sy = Math.random() * height;
        const len = 25 + Math.random() * 45;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - len * 0.35, sy + len);
      }
      ctx.stroke();
    }

    // Damage Red Vignette Flash
    if (this.engine.player.invulnerableTimer > 1.2) {
      const flashAlpha = (this.engine.player.invulnerableTimer - 1.2) * 2.0;
      ctx.fillStyle = `rgba(239, 68, 68, ${Math.min(0.4, flashAlpha)})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  // -------------------------------------------------------------
  // HELPER: 3D PROJECTION MATH
  // -------------------------------------------------------------

  private projectPoint(
    laneX: number,
    trackY: number,
    relZ: number,
    width: number,
    height: number,
    horizonY: number,
    vanishX: number
  ): { x: number; y: number; scale: number; halfW: number; laneSpacing: number; isBeyondCrest: boolean } {
    const isMobile = width < 768 || height > width;
    const zCrest = isMobile ? 28 : 38;
    const yBottom = height + 8;
    const yCrest = horizonY;

    // Road half width at bottom and crest (flat, non-tapered road)
    const roadHalfWidthBottom = isMobile ? width * 0.495 : width * 0.46;
    const roadHalfWidthCrest = roadHalfWidthBottom * (isMobile ? 0.76 : 0.72);

    // Convex curve progress u: 0 (near camera) to 1.0 (at crest)
    const u = Math.max(0, Math.min(1.0, relZ / zCrest));

    // Convex hill curve: rises and flattens out smoothly at crest
    const curveFactor = Math.sin(u * Math.PI * 0.5);
    const groundY = yBottom - (yBottom - yCrest) * curveFactor;

    // Flat width: only tapers gently (24% on mobile, 28% on desktop)
    const halfW = roadHalfWidthBottom - (roadHalfWidthBottom - roadHalfWidthCrest) * u;

    // Scale along convex curve
    const baseScale = isMobile ? 1.42 : 1.0;
    const s = baseScale * (1.0 - 0.60 * Math.pow(u, 1.2));

    // Curb width scales with distance; lanes are mathematically centered on asphalt
    const curbW = Math.max(5, 40 * (s / baseScale));
    const asphaltHalfW = Math.max(30, halfW - curbW);
    const laneSpacing = asphaltHalfW * (2 / 3);

    const x = vanishX + laneX * laneSpacing;
    const y = groundY - trackY * 130 * s;

    return {
      x,
      y,
      scale: s,
      halfW,
      laneSpacing,
      isBeyondCrest: relZ > zCrest
    };
  }
}
