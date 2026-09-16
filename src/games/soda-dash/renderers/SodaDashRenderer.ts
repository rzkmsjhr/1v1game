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

  private drawSkyAndSkyline(
    ctx: CanvasRenderingContext2D,
    width: number,
    _height: number,
    horizonY: number,
    cameraZ: number
  ): void {
    // Twilight Sunset Sky Gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, '#090d16');
    skyGrad.addColorStop(0.5, '#1e1b4b');
    skyGrad.addColorStop(0.85, '#4c1d95');
    skyGrad.addColorStop(1, '#f97316');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, horizonY);

    // Distant Neon City Buildings
    const cityOffset = (cameraZ * 0.04) % 120;
    ctx.fillStyle = '#0f172a';

    for (let x = -120; x < width + 120; x += 36) {
      const buildingX = x - cityOffset;
      const bHeight = 45 + ((Math.abs(Math.sin(x * 1.7)) * 55) | 0);
      ctx.fillRect(buildingX, horizonY - bHeight, 32, bHeight);

      // Lit windows
      ctx.fillStyle = (x % 72 === 0) ? '#fde047' : '#38bdf8';
      for (let wy = horizonY - bHeight + 8; wy < horizonY - 8; wy += 12) {
        if ((x + wy) % 5 === 0) {
          ctx.fillRect(buildingX + 6, wy, 4, 4);
          ctx.fillRect(buildingX + 18, wy, 4, 4);
        }
      }
      ctx.fillStyle = '#0f172a';
    }

    // Distant Sun Glow on Horizon
    const sunGrad = ctx.createRadialGradient(width * 0.5, horizonY, 5, width * 0.5, horizonY, width * 0.4);
    sunGrad.addColorStop(0, 'rgba(251, 146, 60, 0.45)');
    sunGrad.addColorStop(0.4, 'rgba(236, 72, 153, 0.2)');
    sunGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, horizonY - 60, width, 60);
  }

  // -------------------------------------------------------------
  // 2. PERSPECTIVE ROAD ENGINE
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

    // Ground Grass / Shoulders
    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, horizonY, width, height - horizonY);

    // Base Asphalt
    ctx.beginPath();
    ctx.moveTo(vanishX - 25, horizonY);
    ctx.lineTo(vanishX + 25, horizonY);
    ctx.lineTo(vanishX + roadHalfWidthBottom, height);
    ctx.lineTo(vanishX - roadHalfWidthBottom, height);
    ctx.closePath();
    ctx.fillStyle = '#1e293b';
    ctx.fill();

    // Rapidly Scrolling Curb Strips & Road Segments
    const segmentLength = 2.5; // 2.5 meters per segment
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

      // Road side curbs (Red & White hazard markings)
      const halfW1 = roadHalfWidthBottom * p1.scale;
      const halfW2 = roadHalfWidthBottom * p2.scale;
      const curbW1 = Math.max(2, 34 * p1.scale);
      const curbW2 = Math.max(2, 34 * p2.scale);

      ctx.fillStyle = isOdd ? '#ef4444' : '#f8fafc';

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

      // Dashed lane divider lines (between lanes -1, 0, 1)
      if (isOdd) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        for (const l of [-0.5, 0.5]) {
          const lp1 = this.projectPoint(l, 0, relZ1, width, height, horizonY, vanishX);
          const lp2 = this.projectPoint(l, 0, relZ2, width, height, horizonY, vanishX);
          const lw = Math.max(1.8, 6 * p1.scale);
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
        // Road barricade (Jump over)
        const hw = 95 * s;
        const hh = 60 * s;

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.ellipse(0, 0, hw * 0.9, 12 * s, 0, 0, Math.PI * 2);
        ctx.fill();

        // Barricade Feet
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = Math.max(2, 6 * s);
        ctx.beginPath();
        ctx.moveTo(-hw * 0.75, 0);
        ctx.lineTo(-hw * 0.75, -hh);
        ctx.moveTo(hw * 0.75, 0);
        ctx.lineTo(hw * 0.75, -hh);
        ctx.stroke();

        // Hazard Board
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(-hw, -hh, hw * 2, 34 * s);

        // Hazard Stripes
        ctx.fillStyle = '#0f172a';
        for (let x = -hw; x < hw; x += 28 * s) {
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
        // Scaffolding / Low Pipe (Slide under)
        const pw = 120 * s;
        const pipeY = -120 * s;

        // Side Vertical Poles
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = Math.max(1.5, 7 * s);
        ctx.beginPath();
        ctx.moveTo(-pw, 0);
        ctx.lineTo(-pw, pipeY);
        ctx.moveTo(pw, 0);
        ctx.lineTo(pw, pipeY);
        ctx.stroke();

        // Horizontal Heavy Pipe
        ctx.fillStyle = '#e11d48';
        ctx.fillRect(-pw - 6 * s, pipeY - 14 * s, (pw + 6 * s) * 2, 28 * s);

        // Warning Clearance Sign
        ctx.fillStyle = '#facc15';
        ctx.fillRect(-36 * s, pipeY - 11 * s, 72 * s, 22 * s);
        ctx.fillStyle = '#000000';
        ctx.font = `bold ${Math.max(8, (16 * s) | 0)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('SLIDE', 0, pipeY + 6 * s);
        break;
      }

      case 'DUMPSTER': {
        // Heavy Urban Dumpster (Swerve lane)
        const dw = 80 * s;
        const dh = 100 * s;

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.beginPath();
        ctx.ellipse(0, 0, dw * 0.95, 14 * s, 0, 0, Math.PI * 2);
        ctx.fill();

        // Dumpster Body
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(-dw, -dh, dw * 2, dh);

        // Highlight & Details
        ctx.fillStyle = '#0369a1';
        ctx.fillRect(-dw + 8 * s, -dh + 12 * s, dw * 2 - 16 * s, dh - 24 * s);

        // Lid
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-dw - 6 * s, -dh - 12 * s, dw * 2 + 12 * s, 16 * s);
        break;
      }

      case 'PUDDLE':
      case 'SODA_SPILL': {
        // Reflective Soda Puddle
        const pr = 80 * s;
        ctx.fillStyle = item.type === 'SODA_SPILL' ? 'rgba(239, 68, 68, 0.75)' : 'rgba(168, 85, 247, 0.65)';
        ctx.beginPath();
        ctx.ellipse(0, 0, pr, pr * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();

        // Rim highlight
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, 3 * s);
        ctx.stroke();
        break;
      }

      case 'SPEED_PAD': {
        // Neon Boost Chevron Arrow Strip
        const bw = 70 * s;
        const bh = 90 * s;

        ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
        ctx.fillRect(-bw, -bh * 0.5, bw * 2, bh);

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
        // Sparkling Life Can (+1 Heart)
        const cw = 32 * s;
        const ch = 56 * s;
        const floatY = -40 * s + Math.sin(Date.now() * 0.006 + item.z) * 8 * s;

        // Floating Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 0, cw * 1.1, 8 * s, 0, 0, Math.PI * 2);
        ctx.fill();

        // 3D Soda Can
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.roundRect(-cw, floatY - ch, cw * 2, ch, 10 * s);
        ctx.fill();

        // Silver Rim
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(-cw, floatY - ch, cw * 2, 6 * s);
        ctx.fillRect(-cw, floatY - 6 * s, cw * 2, 6 * s);

        // Heart Symbol
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(14, (32 * s) | 0)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('❤️', 0, floatY - ch * 0.5);
        break;
      }

      case 'FIZZ_TURBO':
      case 'BUBBLE_SHIELD': {
        // Mystery Item Box
        const bw = 40 * s;
        const floatY = -48 * s + Math.sin(Date.now() * 0.005 + item.z) * 8 * s;

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 0, bw * 1.1, 8 * s, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = item.type === 'FIZZ_TURBO' ? '#f59e0b' : '#3b82f6';
        ctx.beginPath();
        ctx.roundRect(-bw, floatY - bw * 2, bw * 2, bw * 2, 12 * s);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.5, 3 * s);
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
  // 4. ANIMATED 3D RUNNERS (PLAYER & OPPONENT)
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
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 36 * s * shadowScale, 12 * s * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Vertical Jump Offset
    const jumpOffsetPx = -runner.jumpY * 110 * s;
    ctx.translate(0, jumpOffsetPx);

    // Bubble Shield Aura
    if (runner.hasShield) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
      ctx.lineWidth = Math.max(2, 7 * s);
      ctx.beginPath();
      ctx.arc(0, -66 * s, 72 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Colors
    const primaryColor = isPlayer ? '#0284c7' : '#e11d48';
    const accentColor = isPlayer ? '#38bdf8' : '#fb7185';
    const visorColor = isPlayer ? '#fef08a' : '#38bdf8';

    // Running cycle phase based on distance
    const runPhase = (runner.distance * 0.65) % (Math.PI * 2);
    const legSwing = Math.sin(runPhase);

    if (runner.isSliding) {
      // SLIDE POSE: Low aerodynamic tuck
      ctx.fillStyle = primaryColor;
      ctx.beginPath();
      ctx.roundRect(-42 * s, -30 * s, 84 * s, 30 * s, 10 * s);
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
      ctx.strokeStyle = isPlayer ? '#0f172a' : '#1e293b';
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
      ctx.roundRect(-26 * s, torsoY - 18 * s, 52 * s, 46 * s, 11 * s);
      ctx.fill();

      // Scarf / Speed Trail
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.moveTo(-14 * s, torsoY - 10 * s);
      ctx.lineTo(-52 * s - Math.sin(Date.now() * 0.015) * 10 * s, torsoY - 30 * s);
      ctx.lineTo(-20 * s, torsoY + 6 * s);
      ctx.fill();

      // Head / Helmet
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(0, torsoY - 34 * s, 25 * s, 0, Math.PI * 2);
      ctx.fill();

      // Visor
      ctx.fillStyle = visorColor;
      ctx.fillRect(isPlayer ? 2 * s : -4 * s, torsoY - 42 * s, 22 * s, 13 * s);
    }

    // Nametag above Opponent
    if (!isPlayer) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
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
