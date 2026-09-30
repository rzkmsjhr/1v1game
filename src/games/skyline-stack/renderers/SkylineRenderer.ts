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

  // High-performance pre-baked depth-of-field background cache
  private bakedBgCanvas: HTMLCanvasElement | null = null;
  private bakedBgTheme: AppTheme | null = null;
  private bakedBgWidth: number = 0;
  private bakedBgHeight: number = 0;

  constructor(canvas: HTMLCanvasElement, theme: AppTheme = 'dark') {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.currentTheme = theme;
  }

  public setTheme(theme: AppTheme) {
    if (this.currentTheme !== theme) {
      this.currentTheme = theme;
      this.bakedBgTheme = null; // Re-bake background for new theme
    }
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
    const dpr = Math.min(2.0, window.devicePixelRatio || 1);
    ctx.save();
    ctx.scale(dpr, dpr);

    const logicalW = width / dpr;
    const logicalH = height / dpr;

    // Responsive Viewport Zoom:
    // Scale smoothly so mobile (logicalW < 540px) matches desktop framing (~540px reference)
    // Prevents mobile from feeling cramped or overly zoomed in!
    const viewScale = Math.min(1.0, Math.max(0.55, logicalW / 540));
    const worldW = logicalW / viewScale;
    const worldH = logicalH / viewScale;
    const centerX = worldW * 0.5;

    // Smooth camera tracking: keep top floor and crane in balanced vertical focus
    const topFloor = playerState.floors[playerState.floors.length - 1];
    const topFloorY = topFloor ? (topFloor.y + topFloor.height) : SKYLINE_CONSTANTS.FOUNDATION_HEIGHT;
    this.targetCameraY = Math.max(0, topFloorY - SKYLINE_CONSTANTS.FOUNDATION_HEIGHT);
    this.cameraY += (this.targetCameraY - this.cameraY) * Math.min(1.0, dt * 5.0);

    // Ground baseline Y in world coordinates
    const groundScreenY = worldH * 0.74 + this.cameraY;

    // ----------------------------------------------------
    // WORLD PASS: Scaled game world (Crane, Skyscraper, Particles)
    // ----------------------------------------------------
    ctx.save();
    ctx.scale(viewScale, viewScale);

    // 1. Render Sky & Atmosphere Background
    this.renderAtmosphere(ctx, worldW, worldH, this.cameraY);

    // 2. Render Parallax City Skyline with Depth-of-Field Blur (Focus on crane & player building)
    this.renderBlurredCitySkyline(ctx, worldW, worldH, this.cameraY);

    // 3. Render Foundation Ground
    this.renderGround(ctx, centerX, groundScreenY, worldW);

    // 4. Render Skyscraper Floors with Dynamic Sway
    this.renderSkyscraper(ctx, playerState, centerX, groundScreenY);

    // 5. Render Tumbling Missed Blocks
    this.renderTumblingBlocks(ctx, playerState.tumblingBlocks, centerX, groundScreenY);

    // 6. Render Falling Active Block
    if (playerState.fallingBlock) {
      this.renderFallingBlock(ctx, playerState.fallingBlock, centerX, groundScreenY);
    }

    // 7. Render Swinging Construction Crane ('r'-shaped cosmetic crane)
    this.renderCrane(ctx, playerState.crane, centerX, groundScreenY, worldW, worldH);

    // 8. Render Particles & Floating Texts
    this.updateAndRenderParticles(ctx, dt, centerX, groundScreenY);
    this.updateAndRenderFloatingTexts(ctx, dt, centerX, groundScreenY);

    ctx.restore(); // Restore world pass

    // ----------------------------------------------------
    // SCREEN PASS: Fixed UI overlays pinned to viewport edges
    // ----------------------------------------------------
    // 9. Render Rival Ghost Mini-Tower HUD
    if (rivalState) {
      this.renderRivalGhostHUD(ctx, rivalState, logicalW, logicalH);
    }

    ctx.restore(); // Restore dpr scale
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
   * Renders the colorful city skyline with camera depth-of-field blur.
   * Keeps the crane and player building in razor-sharp focus while giving
   * the background cityscape a soft, atmospheric photographic lens blur.
   */
  /**
   * Renders the colorful city skyline with camera depth-of-field blur.
   * Uses an ultra-optimized pre-baked texture cache with 0 per-frame blur overhead,
   * guaranteeing a locked 60 FPS on all mobile devices!
   */
  private renderBlurredCitySkyline(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    camY: number
  ) {
    const pad = 24;
    const totalW = Math.ceil(w + pad * 2);
    const totalH = Math.ceil(h + 460); // Ample height margin for camera travel up to 30 floors

    // Re-bake texture ONLY if missing, dimensions changed significantly, or theme changed
    if (
      !this.bakedBgCanvas ||
      this.bakedBgTheme !== this.currentTheme ||
      Math.abs(this.bakedBgWidth - totalW) > 8 ||
      Math.abs(this.bakedBgHeight - totalH) > 20
    ) {
      this.bakeCitySkyline(totalW, totalH, w, h);
    }

    if (!this.bakedBgCanvas) return;

    // Fast hardware blit with parallax vertical offset (~0.05ms)
    const parallaxShift = camY * 0.16;
    ctx.drawImage(this.bakedBgCanvas, -pad, -parallaxShift, totalW, totalH);

    // Blinking aviation warning beacon lights rendered in real-time (tiny glowing dots)
    const isDark = this.currentTheme === 'dark';
    const midBaseY = h * 0.80 - parallaxShift;
    const blink = Math.sin(this.animTime * 5.0) > 0;
    ctx.fillStyle = blink ? '#ef4444' : (isDark ? '#7f1d1d' : '#f87171');
    
    // Spire 1 (Stepped Art Deco tower)
    const sp1X = -18 + (w * 0.15 * 0.5);
    const sp1Y = midBaseY - 260 - 49;
    ctx.beginPath();
    ctx.arc(sp1X, sp1Y, 2.5, 0, Math.PI * 2);

    // Spire 2 (Antenna mast)
    const sp2X = -18 + (w * 0.15 - 4) + (w * 0.13 - 4) + (w * 0.16 - 4) + (w * 0.14 * 0.4);
    const sp2Y = midBaseY - 245 - 39;
    ctx.arc(sp2X, sp2Y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Pre-bakes the full-height colorful skyline with Depth-of-Field blur ONCE.
   */
  private bakeCitySkyline(totalW: number, totalH: number, w: number, h: number) {
    if (!this.bakedBgCanvas) {
      this.bakedBgCanvas = document.createElement('canvas');
    }

    // Downscale slightly (0.75x) for buttery performance, low memory & creamy bokeh
    const scale = 0.75;
    const bakeW = Math.ceil(totalW * scale);
    const bakeH = Math.ceil(totalH * scale);

    this.bakedBgCanvas.width = bakeW;
    this.bakedBgCanvas.height = bakeH;

    const bCtx = this.bakedBgCanvas.getContext('2d');
    if (!bCtx) return;

    bCtx.save();
    bCtx.scale(scale, scale);

    // Draw the static city skyline onto buffer
    this.renderCitySkyline(bCtx, w, h, totalH);

    bCtx.restore();

    // Apply the depth-of-field Gaussian blur ONCE at bake time!
    if ('filter' in bCtx) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = bakeW;
      tempCanvas.height = bakeH;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.filter = 'blur(2.8px)';
        tempCtx.drawImage(this.bakedBgCanvas, 0, 0);

        bCtx.clearRect(0, 0, bakeW, bakeH);
        bCtx.drawImage(tempCanvas, 0, 0);
      }
    }

    this.bakedBgTheme = this.currentTheme;
    this.bakedBgWidth = totalW;
    this.bakedBgHeight = totalH;
  }

  /**
   * Decorated city skyline with vibrant architectural colors,
   * realistic rooftop props (water towers, HVAC, spires, antenna beacons),
   * depth layers, and illuminated architectural window bands.
   */
  private renderCitySkyline(ctx: CanvasRenderingContext2D, w: number, h: number, totalH: number) {
    const isDark = this.currentTheme === 'dark';

    // -----------------------------------------------------------------
    // LAYER 1: Deep Horizon Silhouette Skyscrapers (Slowest Parallax)
    // -----------------------------------------------------------------
    const farBaseY = h * 0.78;
    const farCount = 11;
    const farW = (w + 40) / (farCount - 1);

    // Far skyline pastel & deep atmospheric color tints
    const farLightColors = ['#93c5fd', '#c4b5fd', '#a7f3d0', '#fed7aa', '#fbcfe8', '#bae6fd'];
    const farDarkColors = ['#0c192e', '#1a102f', '#071f1a', '#221508', '#200816', '#091e2b'];

    ctx.save();
    for (let i = 0; i < farCount; i++) {
      const fx = i * farW - 20;
      const fHeight = 170 + ((i * 59 + 29) % 130);
      const fw = farW * 0.95;
      const fy = farBaseY - fHeight;

      // Far building silhouette with atmospheric color tint
      ctx.fillStyle = isDark
        ? farDarkColors[i % farDarkColors.length]
        : farLightColors[i % farLightColors.length];
      ctx.fillRect(fx, fy, fw, fHeight + totalH);

      // Distinctive rooftop silhouettes on far layer
      if (i % 3 === 0) {
        // Needle spire
        const spireX = fx + fw * 0.5;
        const spireH = 28;
        ctx.strokeStyle = isDark ? '#334155' : '#94a3b8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(spireX, fy);
        ctx.lineTo(spireX, fy - spireH);
        ctx.stroke();

        // Pulsing red beacon
        const blink = Math.sin(this.animTime * 4.0 + i) > 0;
        ctx.fillStyle = blink ? (isDark ? '#ef4444' : '#f87171') : 'rgba(239, 68, 68, 0.2)';
        ctx.beginPath();
        ctx.arc(spireX, fy - spireH, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (i % 3 === 1) {
        // Stepped crown
        ctx.fillStyle = isDark ? '#1e1b4b' : '#b0c4de';
        ctx.fillRect(fx + fw * 0.2, fy - 10, fw * 0.6, 10);
        ctx.fillRect(fx + fw * 0.35, fy - 18, fw * 0.3, 8);
      } else {
        // Sloped angular cut
        ctx.fillStyle = isDark ? '#0f172a' : '#cbd5e1';
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + fw, fy - 12);
        ctx.lineTo(fx + fw, fy);
        ctx.closePath();
        ctx.fill();
      }

      // Faint distant window speckles in dark mode
      if (isDark) {
        ctx.fillStyle = 'rgba(254, 240, 138, 0.16)';
        for (let wy = fy + 24; wy < farBaseY - 20; wy += 26) {
          for (let wx = fx + 6; wx < fx + fw - 6; wx += 16) {
            if ((i * 7 + wx + wy) % 5 === 0) {
              ctx.fillRect(wx, wy, 3, 5);
            }
          }
        }
      }
    }
    ctx.restore();

    // -----------------------------------------------------------------
    // LAYER 2: Decorated Mid-Ground Architectural Cityscape with Vibrant Colors
    // -----------------------------------------------------------------
    const midBaseY = h * 0.80;
    const bldDefs = [
      {
        wRel: 0.15, hRel: 260, style: 'stepped', spire: true, winType: 'stripes',
        light: { body: '#c25438', shade: '#9c3d24', trim: '#e06d50' }, // Warm Terracotta / Brick
        dark:  { body: '#4a1525', shade: '#2e0a15', trim: '#9f1239' }
      },
      {
        wRel: 0.13, hRel: 215, style: 'water_tower', spire: false, winType: 'grid',
        light: { body: '#d97706', shade: '#b45309', trim: '#f59e0b' }, // Amber Warehouse Lofts
        dark:  { body: '#381e05', shade: '#231202', trim: '#92400e' }
      },
      {
        wRel: 0.16, hRel: 305, style: 'sloped', spire: false, winType: 'ribbon',
        light: { body: '#0284c7', shade: '#0369a1', trim: '#38bdf8' }, // Ocean Azure Glass
        dark:  { body: '#082f49', shade: '#041d2e', trim: '#0284c7' }
      },
      {
        wRel: 0.14, hRel: 245, style: 'antenna_mast', spire: true, winType: 'scatter',
        light: { body: '#4f46e5', shade: '#3730a3', trim: '#818cf8' }, // Tech Indigo
        dark:  { body: '#1e1b4b', shade: '#110f2e', trim: '#4f46e5' }
      },
      {
        wRel: 0.17, hRel: 285, style: 'hvac_penthouse', spire: false, winType: 'grid',
        light: { body: '#059669', shade: '#047857', trim: '#34d399' }, // Seafoam Emerald
        dark:  { body: '#022c22', shade: '#011913', trim: '#059669' }
      },
      {
        wRel: 0.13, hRel: 205, style: 'twin_spire', spire: true, winType: 'stripes',
        light: { body: '#2563eb', shade: '#1d4ed8', trim: '#60a5fa' }, // Royal Cobalt
        dark:  { body: '#0c2340', shade: '#061324', trim: '#1d4ed8' }
      },
      {
        wRel: 0.15, hRel: 255, style: 'balconies', spire: false, winType: 'ribbon',
        light: { body: '#e11d48', shade: '#be123c', trim: '#fb7185' }, // Coral Rosewood
        dark:  { body: '#4c0519', shade: '#2d020e', trim: '#be123c' }
      },
      {
        wRel: 0.16, hRel: 295, style: 'corporate_glass', spire: true, winType: 'scatter',
        light: { body: '#0d9488', shade: '#0f766e', trim: '#2dd4bf' }, // Contemporary Teal
        dark:  { body: '#042f2e', shade: '#021c1b', trim: '#0d9488' }
      }
    ];

    let currentX = -18;
    for (let idx = 0; idx < bldDefs.length; idx++) {
      const def = bldDefs[idx];
      const bW = Math.max(62, w * def.wRel);
      const bH = def.hRel;
      const bX = currentX;
      const bY = midBaseY - bH;
      currentX += bW - 4; // Slight architectural overlap

      // 1. Building Main Massing Body with Theme Colors
      const themeColors = isDark ? def.dark : def.light;
      const bodyColor = themeColors.body;
      const shadeColor = themeColors.shade;
      const trimColor = themeColors.trim;

      ctx.fillStyle = bodyColor;
      ctx.fillRect(bX, bY, bW, bH + totalH);

      // 2. 3D Architectural Depth (subtle side shadow band)
      ctx.fillStyle = shadeColor;
      const shadowW = Math.max(6, bW * 0.18);
      ctx.fillRect(bX + bW - shadowW, bY, shadowW, bH + totalH);

      // 3. Parapet Roof Lintel Cap
      ctx.fillStyle = trimColor;
      ctx.fillRect(bX - 2, bY - 3, bW + 4, 5);

      // 4. Rooftop Architectural Props based on style
      if (def.style === 'stepped') {
        // Art-Deco Tiered Crown
        ctx.fillStyle = bodyColor;
        ctx.fillRect(bX + bW * 0.2, bY - 14, bW * 0.6, 14);
        ctx.fillStyle = trimColor;
        ctx.fillRect(bX + bW * 0.18, bY - 16, bW * 0.64, 3);
        ctx.fillStyle = bodyColor;
        ctx.fillRect(bX + bW * 0.35, bY - 26, bW * 0.3, 12);
        ctx.fillStyle = trimColor;
        ctx.fillRect(bX + bW * 0.33, bY - 28, bW * 0.34, 3);

        // Center Spire with Aviation Warning Light
        const spX = bX + bW * 0.5;
        ctx.strokeStyle = isDark ? '#cbd5e1' : '#334155';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(spX, bY - 28);
        ctx.lineTo(spX, bY - 48);
        ctx.stroke();

        const redBlink = Math.sin(this.animTime * 5.0 + idx) > 0;
        ctx.fillStyle = redBlink ? '#ef4444' : '#7f1d1d';
        ctx.beginPath();
        ctx.arc(spX, bY - 49, 2.5, 0, Math.PI * 2);
        ctx.fill();

      } else if (def.style === 'water_tower') {
        // Classic Rooftop Cedar Water Tower on Steel Legs
        const tankW = 20;
        const tankH = 18;
        const tankX = bX + 10;
        const tankLegH = 14;
        const tankY = bY - tankH - tankLegH;

        // Steel frame legs & X-bracing
        ctx.strokeStyle = isDark ? '#64748b' : '#334155';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(tankX + 2, bY);
        ctx.lineTo(tankX + 4, tankY + tankH);
        ctx.moveTo(tankX + tankW - 2, bY);
        ctx.lineTo(tankX + tankW - 4, tankY + tankH);
        // X-brace
        ctx.moveTo(tankX + 2, bY);
        ctx.lineTo(tankX + tankW - 4, tankY + tankH);
        ctx.moveTo(tankX + tankW - 2, bY);
        ctx.lineTo(tankX + 4, tankY + tankH);
        ctx.stroke();

        // Wooden/Steel Barrel Tank
        ctx.fillStyle = isDark ? '#451a03' : '#92400e'; // Rich cedar wood
        ctx.fillRect(tankX, tankY, tankW, tankH);
        // Steel tension hoops around barrel
        ctx.strokeStyle = isDark ? '#78350f' : '#451a03';
        ctx.lineWidth = 1;
        ctx.strokeRect(tankX, tankY + 4, tankW, 1);
        ctx.strokeRect(tankX, tankY + 11, tankW, 1);

        // Conical Tank Roof
        ctx.fillStyle = isDark ? '#78350f' : '#b45309';
        ctx.beginPath();
        ctx.moveTo(tankX - 2, tankY);
        ctx.lineTo(tankX + tankW * 0.5, tankY - 7);
        ctx.lineTo(tankX + tankW + 2, tankY);
        ctx.closePath();
        ctx.fill();

        // HVAC Box alongside water tower
        ctx.fillStyle = isDark ? '#231202' : '#78350f';
        ctx.fillRect(bX + tankW + 18, bY - 9, 16, 9);

      } else if (def.style === 'sloped') {
        // Modern Sloped Angular Roof Cut
        ctx.fillStyle = trimColor;
        ctx.beginPath();
        ctx.moveTo(bX, bY);
        ctx.lineTo(bX + bW, bY - 20);
        ctx.lineTo(bX + bW, bY);
        ctx.closePath();
        ctx.fill();

        // Angular penthouse glass ribbon
        ctx.fillStyle = isDark ? 'rgba(56, 189, 248, 0.55)' : 'rgba(224, 242, 254, 0.85)';
        ctx.beginPath();
        ctx.moveTo(bX + 4, bY + 4);
        ctx.lineTo(bX + bW - 4, bY - 14);
        ctx.lineTo(bX + bW - 4, bY - 8);
        ctx.lineTo(bX + 4, bY + 10);
        ctx.closePath();
        ctx.fill();

      } else if (def.style === 'antenna_mast') {
        // Communication Lattice Mast with Dual Crossbars
        const mastX = bX + bW * 0.4;
        ctx.strokeStyle = isDark ? '#a5b4fc' : '#334155';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(mastX, bY);
        ctx.lineTo(mastX, bY - 38);
        // Crossbars
        ctx.moveTo(mastX - 8, bY - 20);
        ctx.lineTo(mastX + 8, bY - 20);
        ctx.moveTo(mastX - 5, bY - 30);
        ctx.lineTo(mastX + 5, bY - 30);
        ctx.stroke();

        // Tip Beacon
        const tipBlink = Math.sin(this.animTime * 6.0 + idx) > 0;
        ctx.fillStyle = tipBlink ? '#ef4444' : '#7f1d1d';
        ctx.beginPath();
        ctx.arc(mastX, bY - 39, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Elevator Machine Room Box
        ctx.fillStyle = isDark ? '#110f2e' : '#3730a3';
        ctx.fillRect(bX + bW * 0.6, bY - 12, 18, 12);

      } else if (def.style === 'hvac_penthouse') {
        // Rooftop HVAC Chillers, Vent Ducts & Maintenance Bulkhead
        ctx.fillStyle = isDark ? '#011913' : '#047857';
        ctx.fillRect(bX + 8, bY - 14, 26, 14);
        // Louver vents on bulkhead
        ctx.strokeStyle = isDark ? '#059669' : '#065f46';
        ctx.lineWidth = 1;
        for (let ly = bY - 11; ly < bY - 3; ly += 3) {
          ctx.beginPath();
          ctx.moveTo(bX + 11, ly);
          ctx.lineTo(bX + 22, ly);
          ctx.stroke();
        }
        // Round ventilator fan domes
        ctx.fillStyle = isDark ? '#065f46' : '#10b981';
        ctx.beginPath();
        ctx.arc(bX + 44, bY - 5, 5, Math.PI, 0);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(bX + 57, bY - 5, 5, Math.PI, 0);
        ctx.fill();

      } else if (def.style === 'twin_spire') {
        // Dual Symmetrical Mini-Pinnacles
        const pinW = 8;
        const pinH = 16;
        ctx.fillStyle = trimColor;
        ctx.fillRect(bX + 6, bY - pinH, pinW, pinH);
        ctx.fillRect(bX + bW - 6 - pinW, bY - pinH, pinW, pinH);

        // Thin rods
        ctx.strokeStyle = isDark ? '#93c5fd' : '#1d4ed8';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(bX + 6 + pinW * 0.5, bY - pinH);
        ctx.lineTo(bX + 6 + pinW * 0.5, bY - pinH - 14);
        ctx.moveTo(bX + bW - 6 - pinW * 0.5, bY - pinH);
        ctx.lineTo(bX + bW - 6 - pinW * 0.5, bY - pinH - 14);
        ctx.stroke();

      } else if (def.style === 'balconies') {
        // Stepped Penthouse Terraces
        ctx.fillStyle = trimColor;
        ctx.fillRect(bX + 6, bY - 10, bW - 12, 10);
        ctx.fillRect(bX + 14, bY - 18, bW - 28, 8);

      } else if (def.style === 'corporate_glass') {
        // High-tech Angular Crown & Satellite Dish
        ctx.fillStyle = trimColor;
        ctx.fillRect(bX + 8, bY - 12, bW - 16, 12);

        // Satellite Dish
        const dishX = bX + bW * 0.5;
        const dishY = bY - 14;
        ctx.strokeStyle = isDark ? '#5eead4' : '#0f766e';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(dishX, dishY, 7, 0.8 * Math.PI, 1.8 * Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(dishX, dishY);
        ctx.lineTo(dishX - 3, dishY - 4);
        ctx.stroke();
      }

      // 5. Architectural Windows & Illuminated Facades
      this.renderBuildingWindows(ctx, bX, bY, bW, bH, def.winType, idx, isDark);
    }

    // -----------------------------------------------------------------
    // LAYER 3: Atmospheric Ground Haze / Aerial Perspective Bleed
    // -----------------------------------------------------------------
    const hazeGrad = ctx.createLinearGradient(0, midBaseY - 60, 0, midBaseY + 60);
    if (isDark) {
      hazeGrad.addColorStop(0, 'rgba(11, 17, 32, 0)');
      hazeGrad.addColorStop(0.65, 'rgba(15, 23, 42, 0.7)');
      hazeGrad.addColorStop(1, 'rgba(15, 23, 42, 0.95)');
    } else {
      hazeGrad.addColorStop(0, 'rgba(186, 230, 253, 0)');
      hazeGrad.addColorStop(0.65, 'rgba(148, 163, 184, 0.55)');
      hazeGrad.addColorStop(1, 'rgba(100, 116, 139, 0.85)');
    }
    ctx.fillStyle = hazeGrad;
    ctx.fillRect(-20, midBaseY - 60, w + 40, totalH);
  }

  /**
   * Renders architectural window grids and glowing office patterns on background buildings
   */
  private renderBuildingWindows(
    ctx: CanvasRenderingContext2D,
    bx: number,
    by: number,
    bw: number,
    bh: number,
    winType: string,
    bldIdx: number,
    isDark: boolean
  ) {
    const marginX = 8;
    const innerW = bw - marginX * 2 - (bw * 0.18); // Stay clear of right shadow band
    if (innerW <= 12) return;

    if (winType === 'stripes' || winType === 'ribbon') {
      // Horizontal ribbon glass bands (modern corporate high-rise)
      const bandH = winType === 'ribbon' ? 7 : 5;
      const bandGap = winType === 'ribbon' ? 12 : 9;
      for (let wy = by + 20; wy < by + bh - 15; wy += bandH + bandGap) {
        if (isDark) {
          const isLit = (bldIdx + wy) % 3 !== 0;
          if (isLit) {
            const glowColor = (bldIdx % 2 === 0)
              ? 'rgba(56, 189, 248, 0.65)' // Modern Cyan Office
              : 'rgba(251, 191, 36, 0.70)'; // Warm Amber Suites
            ctx.fillStyle = glowColor;
            ctx.fillRect(bx + marginX, wy, innerW, bandH);

            // Vertical mullion divisions
            ctx.fillStyle = '#0f172a';
            for (let mx = bx + marginX + 10; mx < bx + marginX + innerW; mx += 10) {
              ctx.fillRect(mx, wy, 1.5, bandH);
            }
          }
        } else {
          // Daylight reflective glass band
          ctx.fillStyle = 'rgba(186, 230, 253, 0.65)';
          ctx.fillRect(bx + marginX, wy, innerW, bandH);
          // Top glass specular reflection
          ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
          ctx.fillRect(bx + marginX, wy, innerW, 1.5);
          // Mullions
          ctx.fillStyle = 'rgba(71, 85, 105, 0.5)';
          for (let mx = bx + marginX + 10; mx < bx + marginX + innerW; mx += 10) {
            ctx.fillRect(mx, wy, 1, bandH);
          }
        }
      }
    } else {
      // Classic punched window grid / scatter pattern
      const winW = 5;
      const winH = 8;
      const stepX = 11;
      const stepY = 14;

      for (let wy = by + 18; wy < by + bh - 12; wy += stepY) {
        for (let wx = bx + marginX; wx < bx + marginX + innerW - winW; wx += stepX) {
          const hash = (bldIdx * 131 + Math.floor(wx * 17) + Math.floor(wy * 31)) % 100;

          if (isDark) {
            // Realistic nighttime window lighting with organic occupancy
            if (hash < 45) {
              // Warm yellow / amber light
              ctx.fillStyle = (hash % 3 === 0)
                ? 'rgba(254, 240, 138, 0.90)'
                : (hash % 3 === 1)
                  ? 'rgba(251, 191, 36, 0.80)'
                  : 'rgba(56, 189, 248, 0.75)';
              ctx.fillRect(wx, wy, winW, winH);
            } else if (hash < 60) {
              // Dim interior light
              ctx.fillStyle = 'rgba(100, 116, 139, 0.35)';
              ctx.fillRect(wx, wy, winW, winH);
            }
          } else {
            // Daytime architectural windows with subtle glass sheen & sill
            if (hash < 75) {
              // Clean sky-tinted glass
              ctx.fillStyle = 'rgba(186, 230, 253, 0.75)';
              ctx.fillRect(wx, wy, winW, winH);
              // Top white glint
              ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
              ctx.fillRect(wx, wy, winW, 1.5);
              // Dark window sill
              ctx.fillStyle = 'rgba(51, 65, 85, 0.45)';
              ctx.fillRect(wx - 0.5, wy + winH - 1, winW + 1, 1.5);
            } else {
              // Interior curtain / blind
              ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
              ctx.fillRect(wx, wy, winW, winH);
            }
          }
        }
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
      // Elastic cantilever sway: higher floors sway significantly more!
      const swayFraction = i / Math.max(1, floors.length - 1);
      const curve = 0.3 * swayFraction + 0.7 * (swayFraction * swayFraction);
      const swayX = Math.sin(state.wobbleAngle) * (floors.length * SKYLINE_CONSTANTS.BLOCK_HEIGHT * 0.32) * curve;
      const floorTilt = state.wobbleAngle * swayFraction;

      const screenCenterX = cx + floor.x + swayX;
      const screenCenterY = gy - floor.y - floor.height * 0.5;

      ctx.save();
      ctx.translate(screenCenterX, screenCenterY);
      ctx.rotate(floorTilt);

      this.drawSquareFloorBlock(
        ctx,
        floor.width,
        floor.height,
        floor.color,
        floor.accentColor,
        floor.windowLights,
        isDark,
        floor.type === 'penthouse'
      );

      ctx.restore();
    }
  }

  /**
   * Renders a perfect 1:1 square architectural modular floor block with a 2x2 window grid
   */
  private drawSquareFloorBlock(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    color: string,
    accentColor: string,
    windowLights: boolean[],
    isDark: boolean,
    isPenthouse: boolean = false
  ) {
    const halfW = w * 0.5;
    const halfH = h * 0.5;

    // Floor square main body
    ctx.fillStyle = color;
    ctx.fillRect(-halfW, -halfH, w, h);

    // 3D architectural bevel highlights (top and left edges)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fillRect(-halfW, -halfH, w, 3);
    ctx.fillRect(-halfW, -halfH, 3, h);

    // Floor drop shadow (bottom and right edges)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
    ctx.fillRect(-halfW, halfH - 3, w, 3);
    ctx.fillRect(halfW - 3, -halfH, 3, h);

    // Top accent cornice / ledge trim
    ctx.fillStyle = accentColor;
    ctx.fillRect(-halfW - 2, -halfH, w + 4, 3.5);

    // 2x2 Grid of Windows for square apartment block
    const winW = 16;
    const winH = 16;
    const colX = [-halfW + 11, halfW - 11 - winW];
    const rowY = [-halfH + 12, halfH - 12 - winH];

    let wIdx = 0;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        const wx = colX[c];
        const wy = rowY[r];
        const isLit = windowLights[wIdx++] ?? true;

        // Window pane background
        ctx.fillStyle = isLit ? (isDark ? '#fef08a' : '#bae6fd') : (isDark ? '#1e293b' : '#64748b');
        ctx.fillRect(wx, wy, winW, winH);

        // Window cross frame (+)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.fillRect(wx + winW * 0.5 - 0.75, wy, 1.5, winH);
        ctx.fillRect(wx, wy + winH * 0.5 - 0.75, winW, 1.5);

        // Glass reflection glint
        if (isLit) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.fillRect(wx + 2, wy + 2, 4, 4);
        }
      }
    }

    // Penthouse spire and beacon
    if (isPenthouse) {
      ctx.fillStyle = '#f59e0b';
      // Central spire antenna
      ctx.fillRect(-3, -halfH - 28, 6, 28);
      ctx.beginPath();
      ctx.arc(0, -halfH - 30, 5, 0, Math.PI * 2);
      ctx.fill();

      // Pulsing red aviation beacon
      const beaconAlpha = 0.5 + Math.sin(this.animTime * 6.0) * 0.5;
      ctx.fillStyle = `rgba(239, 68, 68, ${beaconAlpha})`;
      ctx.beginPath();
      ctx.arc(0, -halfH - 30, 4, 0, Math.PI * 2);
      ctx.fill();
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
    const screenCenterX = cx + block.x;
    const screenCenterY = gy - block.y - block.height * 0.5;
    const isDark = this.currentTheme === 'dark';

    ctx.save();
    ctx.translate(screenCenterX, screenCenterY);
    this.drawSquareFloorBlock(
      ctx,
      block.width,
      block.height,
      block.color,
      block.accentColor,
      block.windowLights,
      isDark,
      block.type === 'penthouse'
    );
    ctx.restore();
  }

  /**
   * Renders a suspended square block with 3D perspective side walls along the 180° equator
   */
  private drawEquatorSquareBlock(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    color: string,
    accentColor: string,
    windowLights: boolean[],
    isDark: boolean,
    equatorAngle: number,
    isPenthouse: boolean = false
  ) {
    const halfW = w * 0.5;
    const halfH = h * 0.5;

    // 3D Side Wall when viewed from equator angles
    // When equatorAngle < -0.08: right wall visible
    // When equatorAngle > 0.08: left wall visible
    const sideWallWidth = Math.abs(Math.sin(equatorAngle)) * 14;

    if (equatorAngle < -0.08 && sideWallWidth > 1.5) {
      // Right side wall
      ctx.fillStyle = isDark ? '#1e293b' : '#334155';
      ctx.beginPath();
      ctx.moveTo(halfW, -halfH);
      ctx.lineTo(halfW + sideWallWidth, -halfH + 3);
      ctx.lineTo(halfW + sideWallWidth, halfH - 2);
      ctx.lineTo(halfW, halfH);
      ctx.closePath();
      ctx.fill();

      // Side wall architectural window slots
      ctx.fillStyle = isDark ? 'rgba(254, 240, 138, 0.4)' : 'rgba(186, 230, 253, 0.5)';
      ctx.fillRect(halfW + 3, -halfH + 12, Math.max(2, sideWallWidth * 0.45), 14);
      ctx.fillRect(halfW + 3, halfH - 26, Math.max(2, sideWallWidth * 0.45), 14);
    } else if (equatorAngle > 0.08 && sideWallWidth > 1.5) {
      // Left side wall
      ctx.fillStyle = isDark ? '#1e293b' : '#334155';
      ctx.beginPath();
      ctx.moveTo(-halfW, -halfH);
      ctx.lineTo(-halfW - sideWallWidth, -halfH + 3);
      ctx.lineTo(-halfW - sideWallWidth, halfH - 2);
      ctx.lineTo(-halfW, halfH);
      ctx.closePath();
      ctx.fill();

      // Side wall architectural window slots
      ctx.fillStyle = isDark ? 'rgba(254, 240, 138, 0.4)' : 'rgba(186, 230, 253, 0.5)';
      ctx.fillRect(-halfW - sideWallWidth + 3, -halfH + 12, Math.max(2, sideWallWidth * 0.45), 14);
      ctx.fillRect(-halfW - sideWallWidth + 3, halfH - 26, Math.max(2, sideWallWidth * 0.45), 14);
    }

    // Front square face
    this.drawSquareFloorBlock(ctx, w, h, color, accentColor, windowLights, isDark, isPenthouse);
  }

  /**
   * Renders the swinging construction crane & suspended block
   * Features a full cosmetic 'r'-shaped tower crane:
   * - Vertical steel lattice mast on the left side of the screen
   * - Horizontal lattice jib arm extending across the sky above the skyscraper
   * - Counter-jib, counterweights, A-frame apex, operator cabin, and tension guy-wires
   */
  private renderCrane(
    ctx: CanvasRenderingContext2D,
    crane: CraneState,
    cx: number,
    gy: number,
    logicalW: number,
    logicalH: number
  ) {
    const anchorScreenX = cx + crane.anchorX;
    const anchorScreenY = gy - crane.anchorY;

    const hookScreenX = cx + crane.hookX;
    const hookScreenY = gy - crane.hookY;
    const isDark = this.currentTheme === 'dark';

    // Position of the left vertical mast (the vertical stem of the 'r')
    // Placed on the left side of the screen, safely clear of the center tower and swing arc
    const mastX = Math.max(54, cx - 195);
    const jibTopY = anchorScreenY - 14;
    const jibEndX = Math.min(logicalW - 14, cx + 185);
    const mastBottomY = Math.min(logicalH + 120, gy);

    ctx.save();

    // 1. Vertical Crane Mast (The vertical stem of the 'r' rising on the left)
    const mastW = 16;
    const mastHalfW = mastW * 0.5;

    // Left and right vertical steel chords
    ctx.strokeStyle = '#f59e0b'; // Industrial safety yellow
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(mastX - mastHalfW, jibTopY);
    ctx.lineTo(mastX - mastHalfW, mastBottomY);
    ctx.moveTo(mastX + mastHalfW, jibTopY);
    ctx.lineTo(mastX + mastHalfW, mastBottomY);
    ctx.stroke();

    // Internal vertical service ladder line
    ctx.strokeStyle = isDark ? '#475569' : '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mastX, jibTopY);
    ctx.lineTo(mastX, mastBottomY);
    ctx.stroke();

    // Lattice truss diagonals and horizontal cross-struts
    ctx.strokeStyle = isDark ? '#d97706' : '#eab308';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    const sectionHeight = 20;
    const totalSections = Math.ceil((mastBottomY - jibTopY) / sectionHeight);
    for (let s = 0; s < totalSections; s++) {
      const y1 = jibTopY + s * sectionHeight;
      const y2 = Math.min(mastBottomY, y1 + sectionHeight);

      // Horizontal strut
      ctx.moveTo(mastX - mastHalfW, y1);
      ctx.lineTo(mastX + mastHalfW, y1);

      // Diagonal X bracing
      ctx.moveTo(mastX - mastHalfW, y1);
      ctx.lineTo(mastX + mastHalfW, y2);
      ctx.moveTo(mastX + mastHalfW, y1);
      ctx.lineTo(mastX - mastHalfW, y2);
    }
    ctx.stroke();

    // Concrete Footing / Foundation for Mast at the Ground level
    if (gy < logicalH + 100) {
      ctx.fillStyle = isDark ? '#334155' : '#64748b';
      ctx.fillRect(mastX - 16, gy - 8, 32, 10);
      // Yellow hazard caution marks
      ctx.fillStyle = '#eab308';
      ctx.fillRect(mastX - 14, gy - 7, 28, 3);
    }

    // 2. Counter-Jib & Heavy Counterweights (the back left tail of the 'r')
    const counterJibLeft = mastX - 38;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(mastX, jibTopY);
    ctx.lineTo(counterJibLeft, jibTopY);
    ctx.moveTo(mastX, jibTopY + 12);
    ctx.lineTo(counterJibLeft, jibTopY + 12);
    ctx.lineTo(counterJibLeft, jibTopY);
    ctx.stroke();

    // Concrete counterweight blocks
    ctx.fillStyle = isDark ? '#475569' : '#334155';
    ctx.fillRect(counterJibLeft - 4, jibTopY - 3, 16, 18);
    // Steel tie straps on counterweights
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(counterJibLeft - 4, jibTopY - 3, 16, 18);
    ctx.beginPath();
    ctx.moveTo(counterJibLeft + 4, jibTopY - 3);
    ctx.lineTo(counterJibLeft + 4, jibTopY + 15);
    ctx.stroke();

    // 3. Apex Tower Peak & Tension Cables (A-frame peak above the mast)
    const apexHeight = 30;
    const apexX = mastX;
    const apexY = jibTopY - apexHeight;

    // A-frame steel struts
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(mastX - mastHalfW, jibTopY);
    ctx.lineTo(apexX, apexY);
    ctx.lineTo(mastX + mastHalfW, jibTopY);
    ctx.stroke();

    // Blinking red aviation warning beacon on apex
    const blink = Math.sin(this.animTime * 8.0) > 0;
    ctx.fillStyle = blink ? '#ef4444' : '#7f1d1d';
    ctx.beginPath();
    ctx.arc(apexX, apexY - 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // High-tensile steel tension guy-wires
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    // Cable to counter-jib
    ctx.moveTo(apexX, apexY);
    ctx.lineTo(counterJibLeft + 4, jibTopY);
    // Cables to main horizontal jib arm
    ctx.moveTo(apexX, apexY);
    ctx.lineTo(mastX + 85, jibTopY);
    ctx.moveTo(apexX, apexY);
    ctx.lineTo(mastX + 175, jibTopY);
    ctx.stroke();

    // 4. Operator's Cabin (Cab at the slewing ring joint)
    const cabX = mastX + mastHalfW + 1;
    const cabY = jibTopY - 1;
    const cabW = 13;
    const cabH = 15;
    ctx.fillStyle = isDark ? '#1e293b' : '#334155';
    ctx.fillRect(cabX, cabY, cabW, cabH);
    // Cyan tinted glass windshield
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(cabX + 3, cabY + 2, cabW - 4, 7);
    // Safety railing
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 1;
    ctx.strokeRect(cabX - 1, cabY - 1, cabW + 2, cabH + 2);

    // 5. Main Horizontal Jib Arm (Top horizontal branch of the 'r' extending to the right)
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    // Upper horizontal chord
    ctx.moveTo(mastX, jibTopY);
    ctx.lineTo(jibEndX, jibTopY);
    // Lower horizontal chord (gently tapers toward tip)
    ctx.moveTo(mastX, jibTopY + 12);
    ctx.lineTo(jibEndX, jibTopY + 8);
    // End vertical connector
    ctx.lineTo(jibEndX, jibTopY);
    ctx.stroke();

    // Lattice diagonal cross-webbing along the horizontal jib
    ctx.strokeStyle = isDark ? '#d97706' : '#eab308';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const jibLength = jibEndX - mastX;
    const jibSegments = Math.ceil(jibLength / 22);
    const segW = jibLength / jibSegments;
    for (let j = 0; j < jibSegments; j++) {
      const jx1 = mastX + j * segW;
      const jx2 = jx1 + segW;
      const jyLower1 = jibTopY + 12 - (j / jibSegments) * 4;
      const jyLower2 = jibTopY + 12 - ((j + 1) / jibSegments) * 4;

      if (j % 2 === 0) {
        ctx.moveTo(jx1, jibTopY);
        ctx.lineTo(jx2, jyLower2);
      } else {
        ctx.moveTo(jx1, jyLower1);
        ctx.lineTo(jx2, jibTopY);
      }
      ctx.moveTo(jx2, jibTopY);
      ctx.lineTo(jx2, jyLower2);
    }
    ctx.stroke();

    // Blinking red aviation beacon on the far tip of the horizontal jib
    ctx.fillStyle = blink ? '#ef4444' : '#7f1d1d';
    ctx.beginPath();
    ctx.arc(jibEndX + 2, jibTopY - 1, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // 6. Pulley Trolley (moves smoothly along the horizontal jib above the center area)
    const trolleyX = anchorScreenX + Math.sin(crane.equatorAngle ?? crane.angle) * 22;
    const trolleyY = jibTopY + 8;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(trolleyX - 12, trolleyY - 4, 24, 10);
    // Trolley wheels
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(trolleyX - 7, trolleyY - 3, 2.5, 0, Math.PI * 2);
    ctx.arc(trolleyX + 7, trolleyY - 3, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 7. Equator Trajectory Guideline Arc (180° front hemisphere path)
    ctx.save();
    ctx.strokeStyle = isDark ? 'rgba(56, 189, 248, 0.18)' : 'rgba(2, 132, 199, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    const arcSamples = 32;
    for (let s = 0; s <= arcSamples; s++) {
      const ang = -Math.PI * 0.5 + (Math.PI * s) / arcSamples;
      const arcX = anchorScreenX + Math.sin(ang) * SKYLINE_CONSTANTS.EQUATOR_RADIUS_X;
      const arcY = gy - (crane.anchorY - crane.cableLength - Math.cos(ang) * SKYLINE_CONSTANTS.EQUATOR_RADIUS_Y);
      if (s === 0) ctx.moveTo(arcX, arcY);
      else ctx.lineTo(arcX, arcY);
    }
    ctx.stroke();
    ctx.restore();

    // 8. Steel Winch Cable (width scales subtly with depth)
    const depthZ = crane.depthZ ?? Math.cos(crane.equatorAngle ?? crane.angle);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.6 + 1.2 * depthZ;
    ctx.beginPath();
    ctx.moveTo(trolleyX, trolleyY + 4);
    ctx.lineTo(hookScreenX, hookScreenY);
    ctx.stroke();

    // 9. Heavy Construction Hook
    const hookScale = 0.92 + 0.16 * depthZ;
    ctx.save();
    ctx.translate(hookScreenX, hookScreenY);
    ctx.scale(hookScale, hookScale);

    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 6, 6, Math.PI * 0.2, Math.PI * 1.6);
    ctx.stroke();
    ctx.restore();

    // 10. Block currently held by the hook along the 180° equator arc
    if (crane.holdingBlock) {
      const block = crane.holdingBlock;
      const bCenterScreenX = hookScreenX;
      const bCenterScreenY = hookScreenY + 6 + block.height * 0.5;

      const perspScale = 0.92 + 0.16 * depthZ;
      const yawAngle = -Math.sin(crane.equatorAngle ?? crane.angle) * 0.26;

      ctx.save();
      ctx.translate(bCenterScreenX, bCenterScreenY);
      ctx.scale(perspScale, perspScale);
      ctx.rotate(yawAngle);

      this.drawEquatorSquareBlock(
        ctx,
        block.width,
        block.height,
        block.color,
        block.accentColor,
        block.windowLights,
        isDark,
        crane.equatorAngle ?? crane.angle,
        block.type === 'penthouse'
      );
      ctx.restore();
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
    const isDark = this.currentTheme === 'dark';
    for (const b of blocks) {
      ctx.save();
      const screenX = cx + b.x;
      const screenY = gy - b.y - b.height * 0.5;

      ctx.translate(screenX, screenY);
      ctx.rotate(b.rotation);
      ctx.globalAlpha = Math.max(0, b.alpha);

      this.drawSquareFloorBlock(
        ctx,
        b.width,
        b.height,
        b.color,
        b.accentColor,
        [true, false, true, false],
        isDark,
        b.type === 'penthouse'
      );

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
    const hudW = 40;
    const hudH = 94;
    const hudX = w - hudW - 12;
    const hudY = 12;

    ctx.save();
    // Glassmorphic container
    ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.90)';
    ctx.strokeStyle = isDark ? 'rgba(51, 65, 85, 0.8)' : 'rgba(203, 213, 225, 0.9)';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.roundRect(hudX, hudY, hudW, hudH, 8);
    ctx.fill();
    ctx.stroke();

    // Rival Label
    ctx.fillStyle = '#ef4444'; // Rival Red
    ctx.font = '800 8.5px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RIVAL', hudX + hudW * 0.5, hudY + 11);

    // Height progress meter bar inside card
    const meterW = 10;
    const meterX = hudX + Math.round((hudW - meterW) * 0.5);
    const meterY = hudY + 17;
    const meterH = 54;

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
    ctx.font = '900 10px monospace';
    ctx.fillText(`F${activeFloors}`, hudX + hudW * 0.5, hudY + hudH - 6);

    ctx.restore();
  }
}
