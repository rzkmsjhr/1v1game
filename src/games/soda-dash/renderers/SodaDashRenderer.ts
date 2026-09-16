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

  // Visual layout constants
  private horizonRatio: number = 0.38;

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

    const horizonY = height * this.horizonRatio;
    const vanishX = width * 0.5;

    // Camera follows player distance with a fixed follow distance
    const cameraZ = this.engine.player.distance - 4.5;

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
    const roadHalfWidthBottom = width * 0.42;

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

    // Base Clean Slate Asphalt
    ctx.beginPath();
    ctx.moveTo(vanishX - 25, horizonY);
    ctx.lineTo(vanishX + 25, horizonY);
    ctx.lineTo(vanishX + roadHalfWidthBottom, height);
    ctx.lineTo(vanishX - roadHalfWidthBottom, height);
    ctx.closePath();
    ctx.fillStyle = '#334155'; // Smooth Vibrant Slate Track
    ctx.fill();

    // Scrolling Curb Strips & Road Segments
    const segmentLength = 2.5;
    const startSegment = Math.floor(cameraZ / segmentLength);

    for (let i = 0; i < 35; i++) {
      const segZ1 = (startSegment + i) * segmentLength;
      const segZ2 = (startSegment + i + 1) * segmentLength;

      const relZ1 = segZ1 - cameraZ;
      const relZ2 = segZ2 - cameraZ;
      if (relZ1 <= 1.0) continue;

      const p1 = this.projectPoint(0, 0, relZ1, width, height, horizonY, vanishX);
      const p2 = this.projectPoint(0, 0, relZ2, width, height, horizonY, vanishX);

      const isOdd = (startSegment + i) % 2 === 0;

      // Curbs: Playful Candy Red & White Stripes
      const halfW1 = roadHalfWidthBottom * p1.scale;
      const halfW2 = roadHalfWidthBottom * p2.scale;
      const curbW1 = Math.max(3, 36 * p1.scale);
      const curbW2 = Math.max(3, 36 * p2.scale);

      ctx.fillStyle = isOdd ? '#ef4444' : '#ffffff';

      // Left curb
      ctx.beginPath();
      ctx.moveTo(vanishX - halfW2, p2.y);
      ctx.lineTo(vanishX - halfW2 + curbW2, p2.y);
      ctx.lineTo(vanishX - halfW1 + curbW1, p1.y);
      ctx.lineTo(vanishX - halfW1, p1.y);
      ctx.fill();

      // Right curb
      ctx.beginPath();
      ctx.moveTo(vanishX + halfW2, p2.y);
      ctx.lineTo(vanishX + halfW2 - curbW2, p2.y);
      ctx.lineTo(vanishX + halfW1 - curbW1, p1.y);
      ctx.lineTo(vanishX + halfW1, p1.y);
      ctx.fill();

      // Dashed lane divider lines (Bright Sunshine Yellow)
      if (isOdd) {
        ctx.fillStyle = '#facc15';
        for (const l of [-0.5, 0.5]) {
          const lp1 = this.projectPoint(l, 0, relZ1, width, height, horizonY, vanishX);
          const lp2 = this.projectPoint(l, 0, relZ2, width, height, horizonY, vanishX);
          const lw = Math.max(2.2, 7 * p1.scale);
          ctx.fillRect(lp1.x - lw * 0.5, lp2.y, lw, Math.max(1, lp1.y - lp2.y));
        }
      }
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

    // Track Items within range [cameraZ + 1.2, cameraZ + 90]
    const items = this.engine.track.getActiveItems(cameraZ + 1.2, cameraZ + 90);
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
    if (relZ <= 1.2) return;

    const p = this.projectPoint(item.lane, 0, relZ, width, height, horizonY, vanishX);
    if (p.scale <= 0.04) return;

    ctx.save();
    ctx.translate(p.x, p.y);

    const s = p.scale;

    switch (item.type) {
      case 'HURDLE': {
        // Playful Yellow & Orange Hurdle
        const hw = 95 * s;
        const hh = 60 * s;

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.beginPath();
        ctx.ellipse(0, 0, hw * 0.9, 12 * s, 0, 0, Math.PI * 2);
        ctx.fill();

        // Blue Support Feet
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = Math.max(2.5, 7 * s);
        ctx.beginPath();
        ctx.moveTo(-hw * 0.75, 0);
        ctx.lineTo(-hw * 0.75, -hh);
        ctx.moveTo(hw * 0.75, 0);
        ctx.lineTo(hw * 0.75, -hh);
        ctx.stroke();

        // Cheerful Yellow Board
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.roundRect(-hw, -hh, hw * 2, 34 * s, 8 * s);
        ctx.fill();

        // Orange Hazard Chevrons / Stripes
        ctx.fillStyle = '#f97316';
        for (let x = -hw + 8 * s; x < hw - 8 * s; x += 30 * s) {
          ctx.beginPath();
          ctx.moveTo(x, -hh);
          ctx.lineTo(x + 14 * s, -hh);
          ctx.lineTo(x, -hh + 34 * s);
          ctx.lineTo(x - 14 * s, -hh + 34 * s);
          ctx.fill();
        }
        break;
      }

      case 'OVERHEAD': {
        // Cheerful Slide Overhead Arch
        const pw = 120 * s;
        const pipeY = -120 * s;

        // Striped Posts
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = Math.max(2, 8 * s);
        ctx.beginPath();
        ctx.moveTo(-pw, 0);
        ctx.lineTo(-pw, pipeY);
        ctx.moveTo(pw, 0);
        ctx.lineTo(pw, pipeY);
        ctx.stroke();

        // Vibrant Arch Banner
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.roundRect(-pw - 8 * s, pipeY - 16 * s, (pw + 8 * s) * 2, 32 * s, 8 * s);
        ctx.fill();

        // Yellow Center Plaque
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.roundRect(-42 * s, pipeY - 12 * s, 84 * s, 24 * s, 6 * s);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.font = `900 ${Math.max(8, (16 * s) | 0)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('🔻 SLIDE! 🔻', 0, pipeY + 6 * s);
        break;
      }

      case 'DUMPSTER': {
        // Vibrant Toy / Soda Block Crate
        const dw = 80 * s;
        const dh = 100 * s;

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(0, 0, dw * 0.95, 14 * s, 0, 0, Math.PI * 2);
        ctx.fill();

        // Cheerful Royal Blue Crate Body
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.roundRect(-dw, -dh, dw * 2, dh, 14 * s);
        ctx.fill();

        // Colorful Inset Frame (Bright Orange)
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.roundRect(-dw + 8 * s, -dh + 10 * s, dw * 2 - 16 * s, dh - 20 * s, 10 * s);
        ctx.fill();

        // Inset Center (Sky Cyan)
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.roundRect(-dw + 14 * s, -dh + 16 * s, dw * 2 - 28 * s, dh - 32 * s, 8 * s);
        ctx.fill();

        // Star Emblem
        ctx.fillStyle = '#fef08a';
        ctx.font = `bold ${Math.max(12, (26 * s) | 0)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⭐', 0, -dh * 0.5);

        // Top Lid Handle
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.roundRect(-dw * 0.5, -dh - 8 * s, dw, 10 * s, 5 * s);
        ctx.fill();
        break;
      }

      case 'PUDDLE':
      case 'SODA_SPILL': {
        // Sparkling Fizzy Soda Splash
        const pr = 80 * s;
        ctx.fillStyle = item.type === 'SODA_SPILL' ? 'rgba(244, 63, 94, 0.78)' : 'rgba(192, 132, 252, 0.75)';
        ctx.beginPath();
        ctx.ellipse(0, 0, pr, pr * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();

        // Bubble specks
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-pr * 0.4, 0, 3 * s, 0, Math.PI * 2);
        ctx.arc(pr * 0.3, -2 * s, 2.5 * s, 0, Math.PI * 2);
        ctx.arc(pr * 0.1, 3 * s, 3.5 * s, 0, Math.PI * 2);
        ctx.fill();

        // Rim highlight
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, 3 * s);
        ctx.stroke();
        break;
      }

      case 'SPEED_PAD': {
        // Supercharged Lime Boost Strip
        const bw = 70 * s;
        const bh = 90 * s;

        ctx.fillStyle = 'rgba(74, 222, 128, 0.32)';
        ctx.beginPath();
        ctx.roundRect(-bw, -bh * 0.5, bw * 2, bh, 10 * s);
        ctx.fill();

        ctx.fillStyle = '#22c55e';
        for (let cy = -bh * 0.4; cy < bh * 0.4; cy += 30 * s) {
          ctx.beginPath();
          ctx.moveTo(0, cy - 14 * s);
          ctx.lineTo(bw * 0.75, cy + 8 * s);
          ctx.lineTo(bw * 0.5, cy + 8 * s);
          ctx.lineTo(0, cy - 4 * s);
          ctx.lineTo(-bw * 0.5, cy + 8 * s);
          ctx.lineTo(-bw * 0.75, cy + 8 * s);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }

      case 'HEART': {
        // Sparkling Strawberry Soda Can (+1 Heart)
        const cw = 32 * s;
        const ch = 56 * s;
        const floatY = -40 * s + Math.sin(Date.now() * 0.006 + item.z) * 8 * s;

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.beginPath();
        ctx.ellipse(0, 0, cw * 1.1, 8 * s, 0, 0, Math.PI * 2);
        ctx.fill();

        // Strawberry Red Can
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.roundRect(-cw, floatY - ch, cw * 2, ch, 12 * s);
        ctx.fill();

        // Golden Sparkling Rims
        ctx.fillStyle = '#fde047';
        ctx.fillRect(-cw, floatY - ch, cw * 2, 7 * s);
        ctx.fillRect(-cw, floatY - 7 * s, cw * 2, 7 * s);

        // Heart Symbol
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(14, (32 * s) | 0)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('❤️', 0, floatY - ch * 0.5);

        // Twinkling stars
        ctx.font = `bold ${Math.max(10, (18 * s) | 0)}px sans-serif`;
        ctx.fillText('✨', -cw * 1.2, floatY - ch * 0.8);
        ctx.fillText('✨', cw * 1.2, floatY - ch * 0.2);
        break;
      }

      case 'FIZZ_TURBO':
      case 'BUBBLE_SHIELD': {
        // Sparkling Rainbow Mystery Box
        const bw = 40 * s;
        const floatY = -48 * s + Math.sin(Date.now() * 0.005 + item.z) * 8 * s;

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.beginPath();
        ctx.ellipse(0, 0, bw * 1.1, 8 * s, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = item.type === 'FIZZ_TURBO' ? '#f59e0b' : '#3b82f6';
        ctx.beginPath();
        ctx.roundRect(-bw, floatY - bw * 2, bw * 2, bw * 2, 12 * s);
        ctx.fill();

        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = Math.max(2, 4 * s);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(16, (30 * s) | 0)}px sans-serif`;
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
    if (relZ <= 0.8) return;

    // Projected ground point
    const p = this.projectPoint(runner.currentX, 0, relZ, width, height, horizonY, vanishX);
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
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 36 * s * shadowScale, 12 * s * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Vertical Jump Offset
    const jumpOffsetPx = -runner.jumpY * 110 * s;
    ctx.translate(0, jumpOffsetPx);

    // Iridescent Bubble Shield
    if (runner.hasShield) {
      ctx.strokeStyle = '#38bdf8';
      ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
      ctx.lineWidth = Math.max(2, 7 * s);
      ctx.beginPath();
      ctx.arc(0, -66 * s, 72 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Bubble Shine Highlight
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, 4 * s);
      ctx.beginPath();
      ctx.arc(-26 * s, -90 * s, 26 * s, Math.PI * 1.1, Math.PI * 1.5);
      ctx.stroke();
    }

    // Cheerful Mascot Colors
    const primaryColor = isPlayer ? '#06b6d4' : '#f43f5e';
    const accentColor = isPlayer ? '#facc15' : '#38bdf8';
    const visorColor = '#fef08a';

    // Running cycle phase based on distance
    const runPhase = (runner.distance * 0.65) % (Math.PI * 2);
    const legSwing = Math.sin(runPhase);

    if (runner.isSliding) {
      // SLIDE POSE: Low aerodynamic tuck
      ctx.fillStyle = primaryColor;
      ctx.beginPath();
      ctx.roundRect(-42 * s, -30 * s, 84 * s, 30 * s, 12 * s);
      ctx.fill();

      // Visor
      ctx.fillStyle = visorColor;
      ctx.fillRect(12 * s, -24 * s, 20 * s, 10 * s);

      // Slide spark particles
      if (Math.random() < 0.4) {
        this.addSplash(p.x + (Math.random() - 0.5) * 40 * s, p.y - 2, '#fde047', 2);
      }
    } else {
      // UPRIGHT RUNNING / JUMPING POSE
      const torsoY = -70 * s;

      // Legs
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = Math.max(3, 10 * s);
      ctx.lineCap = 'round';

      if (runner.isJumping) {
        // Jump pose: Legs tucked
        ctx.beginPath();
        ctx.moveTo(-12 * s, torsoY + 24 * s);
        ctx.lineTo(-28 * s, torsoY + 42 * s);
        ctx.lineTo(-16 * s, torsoY + 52 * s);

        ctx.moveTo(12 * s, torsoY + 24 * s);
        ctx.lineTo(26 * s, torsoY + 42 * s);
        ctx.lineTo(14 * s, torsoY + 52 * s);
        ctx.stroke();
      } else {
        // Running stride legs
        ctx.beginPath();
        ctx.moveTo(-12 * s, torsoY + 24 * s);
        ctx.lineTo(-12 * s + legSwing * 24 * s, 0);

        ctx.moveTo(12 * s, torsoY + 24 * s);
        ctx.lineTo(12 * s - legSwing * 24 * s, 0);
        ctx.stroke();
      }

      // Torso
      ctx.fillStyle = primaryColor;
      ctx.beginPath();
      ctx.roundRect(-26 * s, torsoY - 18 * s, 52 * s, 46 * s, 12 * s);
      ctx.fill();

      // Scarf / Speed Trail
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.moveTo(-14 * s, torsoY - 10 * s);
      ctx.lineTo(-52 * s - Math.sin(Date.now() * 0.015) * 10 * s, torsoY - 30 * s);
      ctx.lineTo(-20 * s, torsoY + 6 * s);
      ctx.fill();

      // Mascot Head
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(0, torsoY - 34 * s, 25 * s, 0, Math.PI * 2);
      ctx.fill();

      // Visor
      ctx.fillStyle = visorColor;
      ctx.beginPath();
      ctx.roundRect(isPlayer ? 2 * s : -4 * s, torsoY - 42 * s, 22 * s, 13 * s, 4 * s);
      ctx.fill();
    }

    // Nametag above Opponent
    if (!isPlayer) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.beginPath();
      ctx.roundRect(-45 * s, -145 * s, 90 * s, 26 * s, 8 * s);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(10, (16 * s) | 0)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(runner.name, 0, -127 * s);
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
  ): { x: number; y: number; scale: number } {
    const minZ = 2.4;
    const roadHalfWidthBottom = width * 0.42;
    const laneSpacingBottom = roadHalfWidthBottom * 0.62;
    const normScale = minZ / Math.max(0.1, relZ);
    const y = horizonY + (height - horizonY) * normScale - trackY * 110 * normScale;
    const x = vanishX + (laneX * laneSpacingBottom) * normScale;

    return { x, y, scale: normScale };
  }
}
