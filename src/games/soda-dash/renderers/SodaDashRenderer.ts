import type { RunnerState, TrackItem } from '../soda-dash-types';
import type { SodaDashEngine } from '../soda-dash-engine';

interface Particle {
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
  text: string;
  x: number;
  y: number;
  vy: number;
  alpha: number;
  color: string;
}

export class SodaDashRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private engine: SodaDashEngine;
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];

  constructor(canvas: HTMLCanvasElement, engine: SodaDashEngine) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Could not get Canvas 2D context');
    this.ctx = context;
    this.engine = engine;
  }

  public addSplash(x: number, y: number, color: string, count: number = 12): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 120;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        life: 0.4 + Math.random() * 0.4,
        maxLife: 0.8,
        color,
        size: 3 + Math.random() * 4
      });
    }
  }

  public addFloatingText(text: string, x: number, y: number, color: string): void {
    this.floatingTexts.push({
      text,
      x,
      y,
      vy: -50,
      alpha: 1.0,
      color
    });
  }

  public render(dt: number): void {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const ctx = this.ctx;

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
    this.drawWorldObjects(ctx, width, height, horizonY, vanishX, cameraZ);

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
    // 1. Cheerful Azure-to-Peach Summer Sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, '#0284c7');    // Deep Azure
    skyGrad.addColorStop(0.4, '#38bdf8');  // Cheerful Sky Cyan
    skyGrad.addColorStop(0.75, '#7dd3fc'); // Gentle Summer Blue
    skyGrad.addColorStop(1, '#fed7aa');    // Warm Peach Sunlight Horizon
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, horizonY);

    // 2. Radiant Golden Cartoon Sun
    const sunX = width * 0.82;
    const sunY = horizonY * 0.32;
    const sunGlow = ctx.createRadialGradient(sunX, sunY, 12, sunX, sunY, 140);
    sunGlow.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
    sunGlow.addColorStop(0.25, 'rgba(253, 224, 71, 0.6)');
    sunGlow.addColorStop(0.6, 'rgba(251, 146, 60, 0.2)');
    sunGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = sunGlow;
    ctx.fillRect(sunX - 140, sunY - 140, 280, 280);

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

    // 5. Colorful Pastel Candy / Soda City Skyline
    const buildingColors = ['#f43f5e', '#38bdf8', '#facc15', '#a855f7', '#34d399', '#fb923c'];
    const cityOffset = (cameraZ * 0.06) % 312;

    for (let x = -100; x < width + 100; x += 52) {
      const bx = x - (cityOffset % 52);
      const colIdx = Math.abs(Math.floor((x + cityOffset) / 52)) % buildingColors.length;
      const col = buildingColors[colIdx];
      const bHeight = 35 + ((Math.abs(Math.sin((x + 80) * 1.6)) * 46) | 0);

      // Building Body
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.roundRect(bx, horizonY - bHeight, 44, bHeight, [6, 6, 0, 0]);
      ctx.fill();

      // Cute Triangular Roof
      if (colIdx % 2 === 0) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(bx, horizonY - bHeight);
        ctx.lineTo(bx + 22, horizonY - bHeight - 14);
        ctx.lineTo(bx + 44, horizonY - bHeight);
        ctx.closePath();
        ctx.fill();
      }

      // Friendly White Windows
      ctx.fillStyle = '#ffffff';
      for (let wy = horizonY - bHeight + 8; wy < horizonY - 6; wy += 12) {
        ctx.fillRect(bx + 8, wy, 8, 7);
        ctx.fillRect(bx + 28, wy, 8, 7);
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

    // Lush Emerald Lawn Shoulders
    const grassGrad = ctx.createLinearGradient(0, horizonY, 0, height);
    grassGrad.addColorStop(0, '#22c55e'); // Fresh Lawn Green
    grassGrad.addColorStop(0.5, '#16a34a');
    grassGrad.addColorStop(1, '#15803d');
    ctx.fillStyle = grassGrad;
    ctx.fillRect(0, horizonY, width, height - horizonY);

    // Cheerful Roadside Flowers
    const flowerColors = ['#facc15', '#f43f5e', '#38bdf8', '#ffffff', '#fb923c'];
    for (let i = 0; i < 28; i++) {
      const fx = (i * 47) % width;
      const fy = horizonY + 15 + ((i * 31) % (height - horizonY - 30));
      if (fx > vanishX - 220 && fx < vanishX + 220 && fy > height - 120) continue;

      ctx.fillStyle = flowerColors[i % flowerColors.length];
      ctx.beginPath();
      ctx.arc(fx, fy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(fx, fy, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

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

      // 1. Center Asphalt Road (Smooth Slate, clean without yellow stripes)
      ctx.fillStyle = isOdd ? '#334155' : '#2d3748';
      ctx.beginPath();
      ctx.moveTo(leftInner2, p2.y);
      ctx.lineTo(rightInner2, p2.y);
      ctx.lineTo(rightInner1, p1.y);
      ctx.lineTo(leftInner1, p1.y);
      ctx.closePath();
      ctx.fill();

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
    cameraZ: number
  ): void {
    interface Renderable {
      type: 'track_item' | 'runner';
      z: number;
      draw: () => void;
    }

    const renderables: Renderable[] = [];

    const isMobile = width < 768 || height > width;
    const zCrest = isMobile ? 28 : 38;

    // Track Items within visible convex crest range
    const items = this.engine.track.getActiveItems(cameraZ + 0.4, cameraZ + zCrest + 2.0);
    for (const item of items) {
      if (item.hit && item.type !== 'PUDDLE' && item.type !== 'SODA_SPILL') continue;
      renderables.push({
        type: 'track_item',
        z: item.z,
        draw: () => this.drawTrackItem(ctx, item, width, height, horizonY, vanishX, cameraZ)
      });
    }

    // Player Runner
    if (!this.engine.player.isDead) {
      renderables.push({
        type: 'runner',
        z: this.engine.player.distance,
        draw: () => this.drawRunner(ctx, this.engine.player, width, height, horizonY, vanishX, cameraZ, true)
      });
    }

    // Opponent Runner
    if (!this.engine.opponent.isDead) {
      renderables.push({
        type: 'runner',
        z: this.engine.opponent.distance,
        draw: () => this.drawRunner(ctx, this.engine.opponent, width, height, horizonY, vanishX, cameraZ, false)
      });
    }

    // Sort back-to-front (furthest Z drawn first)
    renderables.sort((a, b) => b.z - a.z);

    for (const obj of renderables) {
      obj.draw();
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
        // High-Contrast Toy Soda Crate
        const maxDw = p.laneSpacing * 0.36;
        const dw = Math.min(95 * s, maxDw);
        const sEff = dw / 95;
        const dh = 115 * sEff;

        // Drop Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 0, dw * 0.95, 16 * sEff, 0, 0, Math.PI * 2);
        ctx.fill();

        // Bold Cartoon Blue Crate Body
        ctx.fillStyle = '#2563eb';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2.5, 6 * sEff);
        ctx.beginPath();
        ctx.roundRect(-dw, -dh, dw * 2, dh, 14 * sEff);
        ctx.fill();
        ctx.stroke();

        // Orange Inset Frame
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.roundRect(-dw + 9 * sEff, -dh + 12 * sEff, dw * 2 - 18 * sEff, dh - 24 * sEff, 10 * sEff);
        ctx.fill();

        // Cyan Inset Panel
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.roundRect(-dw + 16 * sEff, -dh + 19 * sEff, dw * 2 - 32 * sEff, dh - 38 * sEff, 8 * sEff);
        ctx.fill();

        // Golden Star Emblem
        ctx.fillStyle = '#fef08a';
        ctx.font = `bold ${Math.max(12, (32 * sEff) | 0)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⭐', 0, -dh * 0.5);

        // Top Lid Handle
        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2, 4 * sEff);
        ctx.beginPath();
        ctx.roundRect(-dw * 0.5, -dh - 10 * sEff, dw, 12 * sEff, 6 * sEff);
        ctx.fill();
        ctx.stroke();
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

      case 'HEART': {
        // Glowing Strawberry Soda Life Can (+1 Heart)
        const maxCw = p.laneSpacing * 0.28;
        const cw = Math.min(38 * s, maxCw);
        const sEff = cw / 38;
        const ch = 66 * sEff;
        const floatY = -42 * sEff + Math.sin(Date.now() * 0.006 + item.z) * 8 * sEff;

        // Radiant Golden Aura Halo
        const auraGrad = ctx.createRadialGradient(0, floatY - ch * 0.5, 6, 0, floatY - ch * 0.5, cw * 2.2);
        auraGrad.addColorStop(0, 'rgba(253, 224, 71, 0.65)');
        auraGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = auraGrad;
        ctx.fillRect(-cw * 2.2, floatY - ch * 1.5, cw * 4.4, ch * 2);

        // Ground Drop Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(0, 0, cw * 1.1, 9 * sEff, 0, 0, Math.PI * 2);
        ctx.fill();

        // Strawberry Red Can with Bold Cartoon Outline
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2.5, 5 * sEff);
        ctx.beginPath();
        ctx.roundRect(-cw, floatY - ch, cw * 2, ch, 14 * sEff);
        ctx.fill();
        ctx.stroke();

        // Golden Sparkling Rims
        ctx.fillStyle = '#fde047';
        ctx.fillRect(-cw + 2 * sEff, floatY - ch + 2 * sEff, cw * 2 - 4 * sEff, 8 * sEff);
        ctx.fillRect(-cw + 2 * sEff, floatY - 9 * sEff, cw * 2 - 4 * sEff, 8 * sEff);

        // Heart Symbol
        ctx.font = `bold ${Math.max(14, (36 * sEff) | 0)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('❤️', 0, floatY - ch * 0.5);

        // Twinkling stars
        ctx.font = `bold ${Math.max(10, (22 * sEff) | 0)}px sans-serif`;
        ctx.fillText('✨', -cw * 1.3, floatY - ch * 0.8);
        ctx.fillText('✨', cw * 1.3, floatY - ch * 0.2);
        break;
      }

      case 'FIZZ_TURBO':
      case 'BUBBLE_SHIELD': {
        // Sparkling Rainbow Mystery Box
        const maxBw = p.laneSpacing * 0.30;
        const bw = Math.min(46 * s, maxBw);
        const sEff = bw / 46;
        const floatY = -50 * sEff + Math.sin(Date.now() * 0.005 + item.z) * 8 * sEff;

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.beginPath();
        ctx.ellipse(0, 0, bw * 1.1, 9 * sEff, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = item.type === 'FIZZ_TURBO' ? '#f59e0b' : '#3b82f6';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(2.5, 5 * sEff);
        ctx.beginPath();
        ctx.roundRect(-bw, floatY - bw * 2, bw * 2, bw * 2, 14 * sEff);
        ctx.fill();
        ctx.stroke();

        // Inner Gold Border
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = Math.max(2, 4 * sEff);
        ctx.strokeRect(-bw + 4 * sEff, floatY - bw * 2 + 4 * sEff, bw * 2 - 8 * sEff, bw * 2 - 8 * sEff);

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(14, (34 * sEff) | 0)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.type === 'FIZZ_TURBO' ? '⚡' : '🛡️', 0, floatY - bw);
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
    isPlayer: boolean
  ): void {
    const relZ = runner.distance - cameraZ;
    if (relZ <= 0.4) return;

    // Projected ground point
    const p = this.projectPoint(runner.currentX, 0, relZ, width, height, horizonY, vanishX);
    if (p.isBeyondCrest || p.scale <= 0.04) return;
    const s = p.scale;

    ctx.save();
    ctx.translate(p.x, p.y);

    // Blinking transparency during invulnerability
    if (runner.invulnerableTimer > 0) {
      const blink = Math.sin(Date.now() * 0.04) > 0;
      if (blink) ctx.globalAlpha = 0.35;
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

    // Running cycle phase based on distance
    const runPhase = (runner.distance * 0.65) % (Math.PI * 2);
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

      // Slide spark particles
      if (Math.random() < 0.4) {
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
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

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
    ctx.globalAlpha = 1.0;
  }

  private drawFloatingTexts(ctx: CanvasRenderingContext2D, dt: number): void {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.alpha -= dt * 1.2;
      ft.y += ft.vy * dt;

      if (ft.alpha <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = ft.alpha;
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 6;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }

  private drawScreenOverlays(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Speed Wind Streaks if Turbo is active
    if (this.engine.player.isTurbo) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 8; i++) {
        const sx = Math.random() * width;
        const sy = Math.random() * height;
        const len = 40 + Math.random() * 80;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - len * 0.4, sy + len);
        ctx.stroke();
      }
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
