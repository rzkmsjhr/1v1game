import type { SheepFightState } from '../sheep-types';
import type { AppTheme } from '../../types';
import { SHEEP_CONSTANTS } from '../sheep-constants';
import { SheepRenderer } from './SheepRenderer';

export class SheepFightRenderer {
  private ctx: CanvasRenderingContext2D;
  private animTimer: number = 0;
  private currentTheme: AppTheme = 'light';

  constructor(ctx: CanvasRenderingContext2D, theme: AppTheme = 'light') {
    this.ctx = ctx;
    this.currentTheme = theme;
  }

  public setTheme(theme: AppTheme) {
    this.currentTheme = theme;
  }

  public getTheme(): AppTheme {
    return this.currentTheme;
  }

  public getLanesTotalWidth(vw: number = SHEEP_CONSTANTS.VIEWPORT_WIDTH): number {
    return Math.min(430, Math.max(360, vw - 50));
  }

  public getLaneWidth(vw: number = SHEEP_CONSTANTS.VIEWPORT_WIDTH): number {
    return this.getLanesTotalWidth(vw) / SHEEP_CONSTANTS.NUM_LANES;
  }

  public getLaneMarginX(vw: number = SHEEP_CONSTANTS.VIEWPORT_WIDTH): number {
    return Math.round((vw - this.getLanesTotalWidth(vw)) / 2);
  }

  public render(state: SheepFightState, dt: number = 0.016, viewportWidth: number = SHEEP_CONSTANTS.VIEWPORT_WIDTH) {
    this.animTimer += dt;
    const ctx = this.ctx;
    const vw = viewportWidth;
    const h = SHEEP_CONSTANTS.VIEWPORT_HEIGHT;
    const isLight = this.currentTheme === 'light';

    const lanesTotalW = this.getLanesTotalWidth(vw);
    const laneW = lanesTotalW / SHEEP_CONSTANTS.NUM_LANES;
    const laneMarginX = this.getLaneMarginX(vw);

    ctx.save();
    // Theme-based pasture field background
    ctx.fillStyle = isLight ? '#15803d' : '#042f2e';
    ctx.fillRect(0, 0, vw, h);

    // 1. Draw 5 Pasture Lanes (Requirement 1: Alternating dark/light green grass, thin dirt separators)
    this.renderPastureLanes(vw, laneMarginX, laneW, lanesTotalW);

    // 2. Draw Sideline Pasture Decorations (Fences, Farm Trees, Rocks, Wildflowers, Bushes, Bunting, Fauna)
    this.renderPastureSidelines(vw, laneMarginX, laneW, lanesTotalW);

    // 3. Draw Start Spaces (Deployment Zones) & Clearance Indicators
    this.renderStartSpaces(state, laneMarginX, laneW);

    // 4. Draw All Active Sheep
    this.renderSheepEntities(state, laneMarginX, laneW);

    // 5. Draw Clash Sparks & Live Strength Badges
    this.renderClashEffectsAndBadges(state, laneMarginX, laneW);

    // 6. Draw Lane Completed / Draw Barricades
    this.renderLaneOverlays(state, laneMarginX, laneW, lanesTotalW);

    // 7. Draw Goal Headers & Sudden Death Alert
    this.renderFieldHeaders(state, vw);

    ctx.restore();
  }

  /**
   * REQUIREMENT 1: 5 lanes, all green grass view, 1 lane dark green, 1 lane light green,
   * separated with thin line of dirt color
   */
  private renderPastureLanes(vw: number, laneMarginX: number, laneW: number, lanesTotalW: number) {
    const ctx = this.ctx;
    const numLanes = SHEEP_CONSTANTS.NUM_LANES;
    const topY = SHEEP_CONSTANTS.LANE_TOP_Y;
    const bottomY = SHEEP_CONSTANTS.LANE_BOTTOM_Y;
    const laneH = bottomY - topY;
    const isLight = this.currentTheme === 'light';

    const darkGrass = isLight ? '#16a34a' : '#064e3b';
    const lightGrass = isLight ? '#22c55e' : '#047857';
    const dirtSep = isLight ? '#92400e' : '#451a03';
    const dirtHi = isLight ? '#b45309' : '#78350f';

    // Background base across entire viewport
    ctx.fillStyle = isLight ? '#15803d' : '#042f2e';
    ctx.fillRect(0, 0, vw, SHEEP_CONSTANTS.VIEWPORT_HEIGHT);

    for (let i = 0; i < numLanes; i++) {
      const lx = laneMarginX + i * laneW;
      const isDark = (i % 2 === 0);

      // Grass base color
      ctx.fillStyle = isDark ? darkGrass : lightGrass;
      ctx.fillRect(lx, topY, laneW, laneH);

      // Subtle mowed grass striping texture
      ctx.fillStyle = isDark
        ? (isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(0, 0, 0, 0.12)')
        : (isLight ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.04)');
      const stripeH = 30;
      for (let sy = topY; sy < bottomY; sy += stripeH * 2) {
        ctx.fillRect(lx, sy, laneW, stripeH);
      }

      // Thin Dirt Separators between lanes
      if (i > 0) {
        ctx.fillStyle = dirtSep;
        ctx.fillRect(lx - 2, topY, 4, laneH);

        // Highlight line on dirt
        ctx.fillStyle = dirtHi;
        ctx.fillRect(lx - 0.5, topY, 1, laneH);
      }
    }

    // Outer Borders
    ctx.strokeStyle = dirtSep;
    ctx.lineWidth = 3;
    ctx.strokeRect(laneMarginX, topY, lanesTotalW, laneH);

    // Center Midfield Line (Dotted white)
    const midY = (topY + bottomY) / 2;
    ctx.strokeStyle = isLight ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(laneMarginX, midY);
    ctx.lineTo(laneMarginX + lanesTotalW, midY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Static sideline decoration data for zero runtime allocations
  private static readonly BUSH_DATA: ReadonlyArray<{ side: 'left' | 'right'; y: number; size: number; hasBerries: boolean }> = [
    { side: 'left', y: 85, size: 8, hasBerries: true },
    { side: 'left', y: 195, size: 9, hasBerries: false },
    { side: 'left', y: 320, size: 9, hasBerries: true },
    { side: 'left', y: 470, size: 8, hasBerries: false },
    { side: 'left', y: 590, size: 10, hasBerries: true },
    { side: 'left', y: 710, size: 8, hasBerries: false },

    { side: 'right', y: 110, size: 9, hasBerries: true },
    { side: 'right', y: 240, size: 8, hasBerries: false },
    { side: 'right', y: 370, size: 10, hasBerries: true },
    { side: 'right', y: 530, size: 8, hasBerries: false },
    { side: 'right', y: 650, size: 9, hasBerries: true },
    { side: 'right', y: 765, size: 8, hasBerries: false },
  ];

  private static readonly FLOWER_DATA: ReadonlyArray<{ side: 'left' | 'right'; offsetX: number; y: number; type: 'daisy' | 'poppy' | 'violet' | 'clover' }> = [
    { side: 'left', offsetX: 6, y: 65, type: 'daisy' },
    { side: 'left', offsetX: 22, y: 140, type: 'poppy' },
    { side: 'left', offsetX: 7, y: 170, type: 'violet' },
    { side: 'left', offsetX: 21, y: 220, type: 'clover' },
    { side: 'left', offsetX: 6, y: 260, type: 'daisy' },
    { side: 'left', offsetX: 23, y: 350, type: 'poppy' },
    { side: 'left', offsetX: 7, y: 415, type: 'violet' },
    { side: 'left', offsetX: 22, y: 440, type: 'clover' },
    { side: 'left', offsetX: 6, y: 530, type: 'daisy' },
    { side: 'left', offsetX: 23, y: 560, type: 'poppy' },
    { side: 'left', offsetX: 7, y: 650, type: 'violet' },
    { side: 'left', offsetX: 21, y: 680, type: 'clover' },
    { side: 'left', offsetX: 6, y: 740, type: 'daisy' },
    { side: 'left', offsetX: 22, y: 790, type: 'poppy' },

    { side: 'right', offsetX: 8, y: 75, type: 'violet' },
    { side: 'right', offsetX: 23, y: 150, type: 'daisy' },
    { side: 'right', offsetX: 7, y: 180, type: 'clover' },
    { side: 'right', offsetX: 22, y: 285, type: 'poppy' },
    { side: 'right', offsetX: 8, y: 330, type: 'daisy' },
    { side: 'right', offsetX: 23, y: 445, type: 'violet' },
    { side: 'right', offsetX: 7, y: 480, type: 'clover' },
    { side: 'right', offsetX: 21, y: 575, type: 'poppy' },
    { side: 'right', offsetX: 8, y: 615, type: 'daisy' },
    { side: 'right', offsetX: 22, y: 700, type: 'violet' },
    { side: 'right', offsetX: 7, y: 740, type: 'clover' },
    { side: 'right', offsetX: 23, y: 800, type: 'daisy' },
  ];

  // Pre-calculated fence post positions (zero per-frame array allocations)
  private static readonly POST_Y_LIST: readonly number[] = [
    65, 120, 175, 230, 285, 340, 395, 450, 505, 560, 615, 670, 725, 780
  ];

  // Night Mode glowing fireflies along pasture sidelines
  private static readonly FIREFLY_DATA: ReadonlyArray<{ side: 'left' | 'right'; baseY: number; speed: number; phase: number }> = [
    { side: 'left', baseY: 130, speed: 1.2, phase: 0.0 },
    { side: 'left', baseY: 290, speed: 0.9, phase: 1.8 },
    { side: 'left', baseY: 480, speed: 1.4, phase: 3.2 },
    { side: 'left', baseY: 680, speed: 1.1, phase: 4.7 },
    { side: 'right', baseY: 180, speed: 1.3, phase: 0.9 },
    { side: 'right', baseY: 360, speed: 1.0, phase: 2.4 },
    { side: 'right', baseY: 560, speed: 1.5, phase: 4.1 },
    { side: 'right', baseY: 740, speed: 0.8, phase: 5.3 }
  ];

  /**
   * Renders decorative pasture sidelines:
   * Rustic wooden paddock fence, hanging festive bunting, lush berry bushes, blooming wildflowers,
   * natural orchard trees, mossy field stones, animated perched songbird, fluttering butterfly, and night fireflies.
   */
  private renderPastureSidelines(vw: number, laneMarginX: number, _laneW: number, lanesTotalW: number) {
    const ctx = this.ctx;
    const topY = SHEEP_CONSTANTS.LANE_TOP_Y;
    const bottomY = SHEEP_CONSTANTS.LANE_BOTTOM_Y;
    const leftFenceX = Math.max(12, laneMarginX - 12);
    const rightFenceX = Math.min(vw - 12, laneMarginX + lanesTotalW + 12);
    const isLight = this.currentTheme === 'light';

    // 1. Lush Sideline Grass Bases (covers full left margin 0..laneMarginX and right margin)
    ctx.fillStyle = isLight ? '#15803d' : '#042f2e';
    ctx.fillRect(0, topY, laneMarginX, bottomY - topY);
    ctx.fillRect(laneMarginX + lanesTotalW, topY, vw - (laneMarginX + lanesTotalW), bottomY - topY);

    // Mowed lawn shade stripes
    ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.12)';
    for (let sy = topY; sy < bottomY; sy += 36) {
      ctx.fillRect(0, sy, laneMarginX, 18);
      ctx.fillRect(laneMarginX + lanesTotalW, sy, vw - (laneMarginX + lanesTotalW), 18);
    }

    // Dirt verge trim next to the active lanes
    ctx.fillStyle = isLight ? 'rgba(146, 64, 14, 0.3)' : 'rgba(69, 26, 3, 0.4)';
    ctx.fillRect(laneMarginX - 3, topY, 3, bottomY - topY);
    ctx.fillRect(laneMarginX + lanesTotalW, topY, 3, bottomY - topY);

    // Subtle edge grass tufts - BATCHED into a single draw call
    ctx.fillStyle = isLight ? '#22c55e' : '#059669';
    ctx.beginPath();
    for (let y = topY + 10; y < bottomY; y += 28) {
      ctx.rect(2, y, 3, 4);
      if (laneMarginX > 16) ctx.rect(laneMarginX - 6, y + 14, 3, 3);
      ctx.rect(vw - 5, y + 18, 3, 4);
      if (laneMarginX > 16) ctx.rect(laneMarginX + lanesTotalW + 3, y + 8, 3, 3);
    }
    ctx.fill();

    // 2. Natural Farm Trees in the wider margin areas
    if (laneMarginX >= 36) {
      const leftTreeX = Math.round(laneMarginX * 0.38);
      const rightTreeX = Math.round(vw - laneMarginX * 0.38);
      const treeRadius = Math.min(22, Math.max(13, laneMarginX * 0.32));

      // Left Trees
      this.drawFarmTree(ctx, leftTreeX, 110, treeRadius, isLight);
      this.drawFarmTree(ctx, leftTreeX + 3, 330, treeRadius * 1.1, isLight);
      this.drawFarmTree(ctx, leftTreeX - 2, 540, treeRadius, isLight);
      this.drawFarmTree(ctx, leftTreeX + 2, 730, treeRadius * 0.95, isLight);

      // Right Trees
      this.drawFarmTree(ctx, rightTreeX, 150, treeRadius * 1.05, isLight);
      this.drawFarmTree(ctx, rightTreeX - 3, 390, treeRadius, isLight);
      this.drawFarmTree(ctx, rightTreeX + 2, 630, treeRadius * 1.1, isLight);

      // Mossy field stones
      this.drawFieldStone(ctx, Math.round(laneMarginX * 0.5), 220, 7);
      this.drawFieldStone(ctx, Math.round(laneMarginX * 0.45), 640, 8);
      this.drawFieldStone(ctx, Math.round(vw - laneMarginX * 0.5), 270, 7.5);
      this.drawFieldStone(ctx, Math.round(vw - laneMarginX * 0.45), 510, 8);
    }

    // 3. Dense Berry Bushes along margins
    for (const b of SheepFightRenderer.BUSH_DATA) {
      let bx: number;
      if (b.side === 'left') {
        bx = laneMarginX >= 36 ? Math.round(leftFenceX - 8) : Math.round(laneMarginX * 0.35);
      } else {
        bx = laneMarginX >= 36 ? Math.round(rightFenceX + 8) : Math.round(vw - laneMarginX * 0.35);
      }
      this.drawSidelineBush(ctx, bx, b.y, b.size, b.hasBerries, isLight);
    }

    // 4. Blooming Wildflowers
    for (const f of SheepFightRenderer.FLOWER_DATA) {
      let fx: number;
      if (f.side === 'left') {
        fx = laneMarginX >= 36 ? Math.round(f.offsetX * (laneMarginX / 30)) : f.offsetX;
      } else {
        fx = laneMarginX >= 36 ? Math.round(vw - laneMarginX + f.offsetX * (laneMarginX / 30)) : vw - 30 + f.offsetX;
      }
      this.drawWildflower(ctx, fx, f.y, f.type);
    }

    // 5. Wooden Paddock Fence with Bunting & Posts (Using pre-calculated static array)
    const postYList = SheepFightRenderer.POST_Y_LIST;

    // Draw rails & bunting connecting adjacent posts
    for (let i = 0; i < postYList.length - 1; i++) {
      const y1 = postYList[i];
      const y2 = postYList[i + 1];

      // Rails
      this.drawFenceRails(ctx, leftFenceX, y1, y2, isLight);
      this.drawFenceRails(ctx, rightFenceX, y1, y2, isLight);

      // Bunting strings with pennants
      this.drawBuntingSpan(ctx, leftFenceX, y1, y2, 4);
      this.drawBuntingSpan(ctx, rightFenceX, y1, y2, -4);
    }

    // Draw Fence Posts
    for (const py of postYList) {
      this.drawFencePost(ctx, leftFenceX, py, isLight);
      this.drawFencePost(ctx, rightFenceX, py, isLight);
    }

    if (isLight) {
      // 6. Day features: singing songbird on left fence & fluttering butterfly on right sideline
      this.drawPerchedBird(ctx, leftFenceX, postYList[4] || 285);
      this.drawButterfly(ctx, rightFenceX, 490);
    } else {
      // 7. Night feature: Enchanted glowing fireflies drifting along pasture sidelines
      this.drawFireflies(ctx, vw, laneMarginX);
    }
  }

  private drawFireflies(ctx: CanvasRenderingContext2D, vw: number, laneMarginX: number) {
    for (const ff of SheepFightRenderer.FIREFLY_DATA) {
      const baseX = ff.side === 'left' ? (laneMarginX >= 36 ? laneMarginX * 0.45 : 12) : (laneMarginX >= 36 ? vw - laneMarginX * 0.45 : vw - 12);
      const fx = baseX + Math.sin(this.animTimer * ff.speed + ff.phase) * 6;
      const fy = ff.baseY + Math.cos(this.animTimer * (ff.speed * 0.8) + ff.phase) * 8;
      const pulse = (Math.sin(this.animTimer * 3 + ff.phase) + 1) * 0.5;

      // Glow halo
      ctx.fillStyle = `rgba(250, 204, 21, ${0.12 + pulse * 0.20})`;
      ctx.beginPath();
      ctx.arc(fx, fy, 6 + pulse * 2, 0, Math.PI * 2);
      ctx.fill();

      // Bright inner core
      ctx.fillStyle = `rgba(254, 240, 138, ${0.7 + pulse * 0.3})`;
      ctx.beginPath();
      ctx.arc(fx, fy, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawFarmTree(ctx: CanvasRenderingContext2D, tx: number, ty: number, radius: number, isLight: boolean) {
    // Tree ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath();
    ctx.ellipse(tx, ty + radius * 0.9, radius * 1.1, radius * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wooden trunk
    ctx.fillStyle = '#451a03';
    ctx.beginPath();
    ctx.moveTo(tx - radius * 0.2, ty);
    ctx.lineTo(tx - radius * 0.35, ty + radius * 0.85);
    ctx.lineTo(tx + radius * 0.35, ty + radius * 0.85);
    ctx.lineTo(tx + radius * 0.2, ty);
    ctx.closePath();
    ctx.fill();

    // Trunk wood highlight
    ctx.fillStyle = '#78350f';
    ctx.fillRect(tx - radius * 0.1, ty + 2, radius * 0.2, radius * 0.7);

    // Deep foliage base
    ctx.fillStyle = isLight ? '#14532d' : '#022c22';
    ctx.beginPath();
    ctx.arc(tx, ty - 2, radius, 0, Math.PI * 2);
    ctx.fill();

    // Midtone leafy puffs
    ctx.fillStyle = isLight ? '#15803d' : '#064e3b';
    ctx.beginPath();
    ctx.arc(tx - radius * 0.4, ty - radius * 0.2, radius * 0.68, 0, Math.PI * 2);
    ctx.arc(tx + radius * 0.4, ty - radius * 0.2, radius * 0.68, 0, Math.PI * 2);
    ctx.arc(tx, ty - radius * 0.5, radius * 0.72, 0, Math.PI * 2);
    ctx.fill();

    // Highlight canopy puffs
    ctx.fillStyle = isLight ? '#22c55e' : '#047857';
    ctx.beginPath();
    ctx.arc(tx - radius * 0.2, ty - radius * 0.45, radius * 0.48, 0, Math.PI * 2);
    ctx.arc(tx + radius * 0.2, ty - radius * 0.4, radius * 0.45, 0, Math.PI * 2);
    ctx.arc(tx, ty - radius * 0.2, radius * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Red orchard apples / fruit dots
    ctx.fillStyle = isLight ? '#ef4444' : '#b91c1c';
    ctx.beginPath();
    ctx.arc(tx - radius * 0.45, ty - radius * 0.1, 2, 0, Math.PI * 2);
    ctx.arc(tx + radius * 0.35, ty - radius * 0.3, 2, 0, Math.PI * 2);
    ctx.arc(tx - radius * 0.1, ty - radius * 0.5, 1.8, 0, Math.PI * 2);
    ctx.arc(tx + radius * 0.2, ty + radius * 0.1, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawFieldStone(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number) {
    // Drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 2, size * 1.1, size * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    // Main boulder body
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.ellipse(sx, sy, size, size * 0.7, -0.15, 0, Math.PI * 2);
    ctx.fill();

    // Top highlight bevel
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.ellipse(sx - size * 0.15, sy - size * 0.2, size * 0.65, size * 0.4, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // Green moss patch on top
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(sx + size * 0.25, sy - size * 0.25, size * 0.3, 0, Math.PI * 2);
    ctx.arc(sx - size * 0.2, sy - size * 0.3, size * 0.25, 0, Math.PI * 2);
    ctx.fill();

    // Small companion pebble
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(sx + size * 0.9, sy + size * 0.3, size * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawFenceRails(ctx: CanvasRenderingContext2D, px: number, y1: number, y2: number, isLight: boolean) {
    // Two vertical wood rails
    ctx.fillStyle = isLight ? '#854d0e' : '#451a03';
    ctx.fillRect(px - 3, y1, 2, y2 - y1);
    ctx.fillRect(px + 1, y1, 2, y2 - y1);

    // Wood highlight sheen
    ctx.fillStyle = isLight ? '#a16207' : '#78350f';
    ctx.fillRect(px - 2.5, y1, 1, y2 - y1);
    ctx.fillRect(px + 1.5, y1, 1, y2 - y1);
  }

  private drawBuntingSpan(ctx: CanvasRenderingContext2D, px: number, y1: number, y2: number, sagX: number) {
    const midY = (y1 + y2) / 2;

    // String
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, y1 + 2);
    ctx.quadraticCurveTo(px + sagX, midY, px, y2 - 2);
    ctx.stroke();

    // 2 Pennant flags along curve
    const tValues = [0.35, 0.68];
    for (let j = 0; j < tValues.length; j++) {
      const t = tValues[j];
      const fy = y1 + t * (y2 - y1);
      const fx = px + Math.sin(t * Math.PI) * sagX;

      // Color scheme based on field side: red/gold for opponent side, blue/cyan for player side
      let flagColor = '#f59e0b';
      if (fy < 390) {
        flagColor = j === 0 ? '#ef4444' : '#fbbf24';
      } else if (fy > 450) {
        flagColor = j === 0 ? '#3b82f6' : '#38bdf8';
      } else {
        flagColor = j === 0 ? '#a855f7' : '#fef08a';
      }

      ctx.fillStyle = flagColor;
      ctx.beginPath();
      ctx.moveTo(fx, fy - 3);
      ctx.lineTo(fx + (sagX > 0 ? 5 : -5), fy);
      ctx.lineTo(fx, fy + 3);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawFencePost(ctx: CanvasRenderingContext2D, px: number, py: number, isLight: boolean) {
    // Drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.roundRect(px - 4, py - 4 + 2, 8, 11, 2);
    ctx.fill();

    // Post body
    ctx.fillStyle = isLight ? '#854d0e' : '#451a03';
    ctx.beginPath();
    ctx.roundRect(px - 4, py - 5, 8, 10, 2);
    ctx.fill();

    // Wood highlight bevel
    ctx.fillStyle = isLight ? '#a16207' : '#78350f';
    ctx.fillRect(px - 2, py - 5, 4, 10);

    // Rounded post cap
    ctx.fillStyle = isLight ? '#b45309' : '#92400e';
    ctx.beginPath();
    ctx.arc(px, py - 5, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Iron nail dot
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.arc(px, py - 1, 1, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawSidelineBush(ctx: CanvasRenderingContext2D, bx: number, by: number, size: number, hasBerries: boolean, isLight: boolean) {
    // Base shadow circle
    ctx.fillStyle = isLight ? '#14532d' : '#022c22';
    ctx.beginPath();
    ctx.arc(bx, by + 1, size, 0, Math.PI * 2);
    ctx.fill();

    // Main foliage circle
    ctx.fillStyle = isLight ? '#166534' : '#064e3b';
    ctx.beginPath();
    ctx.arc(bx - 1, by - 1, size * 0.85, 0, Math.PI * 2);
    ctx.fill();

    // Highlight leaf puff
    ctx.fillStyle = isLight ? '#22c55e' : '#047857';
    ctx.beginPath();
    ctx.arc(bx + 1, by - 2, size * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Red berries
    if (hasBerries) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(bx - 2, by - 2, 1.6, 0, Math.PI * 2);
      ctx.arc(bx + 2, by, 1.6, 0, Math.PI * 2);
      ctx.arc(bx, by + 3, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawWildflower(ctx: CanvasRenderingContext2D, fx: number, fy: number, type: 'daisy' | 'poppy' | 'violet' | 'clover') {
    if (type === 'daisy') {
      // 5 white petals around golden center
      ctx.fillStyle = '#ffffff';
      for (let a = 0; a < 5; a++) {
        const rad = (a * 72 * Math.PI) / 180;
        ctx.beginPath();
        ctx.arc(fx + Math.cos(rad) * 2.6, fy + Math.sin(rad) * 2.6, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(fx, fy, 1.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'poppy') {
      // 4 crimson petals
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(fx - 1.5, fy - 1.5, 2.4, 0, Math.PI * 2);
      ctx.arc(fx + 1.5, fy - 1.5, 2.4, 0, Math.PI * 2);
      ctx.arc(fx - 1.5, fy + 1.5, 2.4, 0, Math.PI * 2);
      ctx.arc(fx + 1.5, fy + 1.5, 2.4, 0, Math.PI * 2);
      ctx.fill();
      // Center
      ctx.fillStyle = '#1e1b4b';
      ctx.beginPath();
      ctx.arc(fx, fy, 1.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'violet') {
      // 4 lavender/purple petals
      ctx.fillStyle = '#c084fc';
      ctx.beginPath();
      ctx.arc(fx - 1.5, fy - 1, 2.2, 0, Math.PI * 2);
      ctx.arc(fx + 1.5, fy - 1, 2.2, 0, Math.PI * 2);
      ctx.arc(fx, fy + 1.8, 2.2, 0, Math.PI * 2);
      ctx.fill();
      // Center
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(fx, fy, 1.1, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Clover
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.arc(fx - 1.6, fy - 1.6, 1.8, 0, Math.PI * 2);
      ctx.arc(fx + 1.6, fy - 1.6, 1.8, 0, Math.PI * 2);
      ctx.arc(fx, fy + 1.6, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawPerchedBird(ctx: CanvasRenderingContext2D, px: number, py: number) {
    ctx.save();
    const bob = Math.sin(this.animTimer * 3.5) * 1.2;
    const by = py - 9 + bob;
    const bx = px + 1;

    // Tail
    ctx.fillStyle = '#1e3a8a';
    ctx.beginPath();
    ctx.moveTo(bx - 3, by + 2);
    ctx.lineTo(bx - 7, by + 5);
    ctx.lineTo(bx - 4, by);
    ctx.closePath();
    ctx.fill();

    // Body
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.ellipse(bx, by, 4, 4.5, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Orange breast
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.ellipse(bx + 2, by + 1, 2.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(bx + 2, by - 2, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(bx + 2.3, by - 2, 0.7, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(bx + 3.8, by - 2.5);
    ctx.lineTo(bx + 6.5, by - 1.5);
    ctx.lineTo(bx + 3.8, by - 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawButterfly(ctx: CanvasRenderingContext2D, px: number, py: number) {
    ctx.save();
    const hoverX = px + Math.sin(this.animTimer * 2.2) * 4;
    const hoverY = py + Math.cos(this.animTimer * 1.6) * 7;
    const wingFlap = Math.cos(this.animTimer * 14);

    ctx.translate(hoverX, hoverY);

    // Wings (scaled by wingFlap)
    ctx.save();
    ctx.scale(wingFlap, 1);

    // Upper wings
    ctx.fillStyle = '#f59e0b';
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 0.8;

    ctx.beginPath();
    ctx.ellipse(-4, -3, 4.5, 3, -0.4, 0, Math.PI * 2);
    ctx.ellipse(4, -3, 4.5, 3, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Lower wings
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.ellipse(-3, 2, 3, 2.2, 0.3, 0, Math.PI * 2);
    ctx.ellipse(3, 2, 3, 2.2, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Wing white dots
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-6, -4, 1.2, 1.2);
    ctx.fillRect(5, -4, 1.2, 1.2);
    ctx.restore();

    // Body
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.roundRect(-1, -4, 2, 8, 1);
    ctx.fill();

    // Antennae
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-0.5, -4);
    ctx.lineTo(-2.5, -6.5);
    ctx.moveTo(0.5, -4);
    ctx.lineTo(2.5, -6.5);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * REQUIREMENT 3: Deployment "Start" space visualization
   */
  private renderStartSpaces(state: SheepFightState, laneMarginX: number, laneW: number) {
    const ctx = this.ctx;
    const numLanes = SHEEP_CONSTANTS.NUM_LANES;
    const topY = SHEEP_CONSTANTS.LANE_TOP_Y;
    const bottomY = SHEEP_CONSTANTS.LANE_BOTTOM_Y;
    const depth = SHEEP_CONSTANTS.START_SPACE_DEPTH;

    for (let i = 0; i < numLanes; i++) {
      const lane = state.lanes[i];
      const lx = laneMarginX + i * laneW;
      const cx = lx + laneW / 2;

      if (lane.status !== 'active') continue;

      // 1. Player Start Space (Bottom)
      const pStartY = bottomY - depth;
      if (lane.isPlayerStartBlocked) {
        // Red locked / occupied indicator
        ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
        ctx.fillRect(lx + 2, pStartY, laneW - 4, depth);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 24px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
        ctx.fillText(`${i + 1}`, cx, pStartY + depth * 0.42);

        ctx.font = 'bold 9px system-ui';
        ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
        ctx.fillText('🔒 BUSY', cx, pStartY + depth * 0.74);
        ctx.restore();
      } else {
        // Clear & Ready: Gentle pulsing guide
        const pulse = (Math.sin(this.animTimer * 4) + 1) * 0.5;
        ctx.fillStyle = `rgba(56, 189, 248, ${0.08 + pulse * 0.08})`;
        ctx.fillRect(lx + 2, pStartY, laneW - 4, depth);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Subtle guide chevron pointing UP into battle
        ctx.fillStyle = `rgba(56, 189, 248, ${0.5 + pulse * 0.4})`;
        ctx.font = 'bold 10px system-ui';
        ctx.fillText('▲', cx, pStartY + depth * 0.26);

        // Prominent Athletic Lane Number (Requirement: "this should be the line number")
        ctx.font = '900 26px "JetBrains Mono", system-ui, -apple-system, sans-serif';
        ctx.fillStyle = `rgba(255, 255, 255, ${0.75 + pulse * 0.25})`;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 1;
        ctx.fillText(`${i + 1}`, cx, pStartY + depth * 0.6);
        ctx.restore();
      }

      // Dotted boundary line for player start space
      ctx.strokeStyle = lane.isPlayerStartBlocked ? 'rgba(239, 68, 68, 0.4)' : 'rgba(56, 189, 248, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(lx, pStartY);
      ctx.lineTo(lx + laneW, pStartY);
      ctx.stroke();
      ctx.setLineDash([]);

      // 2. Opponent Start Space (Top)
      const oStartY = topY;
      if (lane.isOpponentStartBlocked) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
        ctx.fillRect(lx + 2, oStartY, laneW - 4, depth);
      }

      // Dotted boundary line for opponent start space
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(lx, oStartY + depth);
      ctx.lineTo(lx + laneW, oStartY + depth);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /**
   * Renders all active sheep entities in top-down perspective
   */
  private renderSheepEntities(state: SheepFightState, laneMarginX: number, laneW: number) {
    const ctx = this.ctx;
    const numLanes = SHEEP_CONSTANTS.NUM_LANES;

    for (let i = 0; i < numLanes; i++) {
      const lane = state.lanes[i];
      const cx = laneMarginX + i * laneW + laneW / 2;

      // Draw all sheep in lane
      for (const s of lane.sheep) {
        SheepRenderer.renderSheep(ctx, {
          x: cx,
          y: s.y,
          size: s.size,
          side: s.side,
          view: 'top',
          facing: s.side === 'player' ? 'top_up' : 'top_down',
          walkCycle: s.walkCycle,
          isPushing: s.isPushing,
          pushStrain: s.pushStrain,
          scale: 1.0
        });
      }
    }
  }

  /**
   * Renders clashing headbutt sparks, dust, and dynamic force badges
   */
  private renderClashEffectsAndBadges(state: SheepFightState, laneMarginX: number, laneW: number) {
    const ctx = this.ctx;
    const numLanes = SHEEP_CONSTANTS.NUM_LANES;

    for (let i = 0; i < numLanes; i++) {
      const lane = state.lanes[i];
      if (lane.status !== 'active' || lane.clashY === null) continue;

      const cx = laneMarginX + i * laneW + laneW / 2;
      const cy = lane.clashY;

      // 1. Clash Sparks & Starburst
      ctx.save();
      const sparkCount = 8;
      const radius = 12 + Math.sin(this.animTimer * 8) * 3;
      for (let s = 0; s < sparkCount; s++) {
        const ang = (s * Math.PI * 2) / sparkCount + this.animTimer * 2;
        const sx = cx + Math.cos(ang) * radius;
        const sy = cy + Math.sin(ang) * (radius * 0.6);
        ctx.fillStyle = s % 2 === 0 ? '#fde047' : '#f97316';
        ctx.beginPath();
        ctx.arc(sx, sy, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Central clash flash star
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 2. LIVE STRENGTH FORCES BADGE (e.g. "3x vs 2x")
      ctx.save();
      const fP = lane.playerStrength;
      const fO = lane.opponentStrength;

      const badgeW = 76;
      const badgeH = 20;
      const badgeX = cx - badgeW / 2;
      const badgeY = cy - 30;

      // Pill Background
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.strokeStyle = fP > fO ? '#3b82f6' : fO > fP ? '#ef4444' : '#eab308';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 10);
      ctx.fill();
      ctx.stroke();

      // Text: Player vs Opponent
      ctx.font = '900 9px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Player force (Blue)
      ctx.fillStyle = '#60a5fa';
      ctx.fillText(`${fP}x`, badgeX + 15, badgeY + badgeH / 2);

      // VS Separator
      ctx.fillStyle = '#94a3b8';
      ctx.font = '700 7px system-ui';
      ctx.fillText('VS', badgeX + badgeW / 2, badgeY + badgeH / 2);

      // Opponent force (Red)
      ctx.font = '900 9px system-ui';
      ctx.fillStyle = '#f87171';
      ctx.fillText(`${fO}x`, badgeX + badgeW - 15, badgeY + badgeH / 2);

      ctx.restore();
    }
  }

  /**
   * REQUIREMENT 3 & 4: Barricades for DRAW lanes and victory flags for won lanes
   */
  private renderLaneOverlays(state: SheepFightState, laneMarginX: number, laneW: number, _lanesTotalW: number) {
    const ctx = this.ctx;
    const numLanes = SHEEP_CONSTANTS.NUM_LANES;
    const topY = SHEEP_CONSTANTS.LANE_TOP_Y;
    const bottomY = SHEEP_CONSTANTS.LANE_BOTTOM_Y;
    const laneH = bottomY - topY;

    for (let i = 0; i < numLanes; i++) {
      const lane = state.lanes[i];
      if (lane.status === 'active') continue;

      const lx = laneMarginX + i * laneW;
      const cx = lx + laneW / 2;
      const cy = (topY + bottomY) / 2;

      if (lane.status === 'draw') {
        // REQUIREMENT 3: "when the line is full with sheep from both sides... considered draw. put another sheep is disabled"
        ctx.save();
        // Darkened locked lane tint
        ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
        ctx.fillRect(lx, topY, laneW, laneH);

        // Wooden Crossed Barricades
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(lx + 8, cy - 50);
        ctx.lineTo(lx + laneW - 8, cy + 50);
        ctx.moveTo(lx + laneW - 8, cy - 50);
        ctx.lineTo(lx + 8, cy + 50);
        ctx.stroke();

        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(lx + 8, cy - 50);
        ctx.lineTo(lx + laneW - 8, cy + 50);
        ctx.moveTo(lx + laneW - 8, cy - 50);
        ctx.lineTo(lx + 8, cy + 50);
        ctx.stroke();

        // Stamped DRAW Plaque
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(cx - 40, cy - 14, 80, 28, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fde68a';
        ctx.font = '900 12px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔒 DRAW', cx, cy);
        ctx.restore();
      } else if (lane.status === 'won_player') {
        // Won by Player (Blue Victory Pennant)
        ctx.save();
        ctx.fillStyle = 'rgba(59, 130, 246, 0.25)';
        ctx.fillRect(lx, topY, laneW, laneH);

        ctx.fillStyle = '#1d4ed8';
        ctx.strokeStyle = '#93c5fd';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(cx - 42, cy - 14, 84, 28, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 11px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('👑 PLAYER', cx, cy);
        ctx.restore();
      } else if (lane.status === 'won_opponent') {
        // Won by Opponent (Red Victory Pennant)
        ctx.save();
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.fillRect(lx, topY, laneW, laneH);

        ctx.fillStyle = '#b91c1c';
        ctx.strokeStyle = '#fca5a5';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(cx - 44, cy - 14, 88, 28, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 11px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💀 OPPONENT', cx, cy);
        ctx.restore();
      }
    }
  }

  /**
   * Renders Field Headers: Goal lines, scores, and Sudden Death alert
   */
  private renderFieldHeaders(state: SheepFightState, vw: number) {
    const ctx = this.ctx;
    const w = vw;
    const isLight = this.currentTheme === 'light';

    // 1. Top Opponent Goal Bar
    ctx.fillStyle = isLight ? '#991b1b' : SHEEP_CONSTANTS.COLORS.OPPONENT_GOAL;
    ctx.fillRect(0, 0, w, SHEEP_CONSTANTS.LANE_TOP_Y);
    ctx.fillStyle = SHEEP_CONSTANTS.COLORS.OPPONENT_GOAL_LINE;
    ctx.fillRect(0, SHEEP_CONSTANTS.LANE_TOP_Y - 3, w, 3);

    // Opponent Goal text
    ctx.fillStyle = isLight ? '#fecaca' : '#fca5a5';
    ctx.font = '900 11px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔴 OPPONENT GOAL LINE', w / 2, 22);

    // 2. Bottom Player Goal Bar
    ctx.fillStyle = isLight ? '#1d4ed8' : SHEEP_CONSTANTS.COLORS.PLAYER_GOAL;
    ctx.fillRect(0, SHEEP_CONSTANTS.LANE_BOTTOM_Y, w, SHEEP_CONSTANTS.VIEWPORT_HEIGHT - SHEEP_CONSTANTS.LANE_BOTTOM_Y);
    ctx.fillStyle = SHEEP_CONSTANTS.COLORS.PLAYER_GOAL_LINE;
    ctx.fillRect(0, SHEEP_CONSTANTS.LANE_BOTTOM_Y, w, 3);

    ctx.fillStyle = isLight ? '#bfdbfe' : '#93c5fd';
    ctx.font = '900 11px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔵 PLAYER GOAL LINE (DEFEND THIS)', w / 2, SHEEP_CONSTANTS.LANE_BOTTOM_Y + 22);

    // 3. REQUIREMENT 4: SUDDEN DEATH ALERT BANNER
    if (state.isSuddenDeath && state.winner === null) {
      ctx.save();
      const pulse = (Math.sin(this.animTimer * 8) + 1) * 0.5;
      const bannerW = Math.min(380, w - 40);
      const bannerH = 34;
      const bx = w / 2 - bannerW / 2;
      const by = (SHEEP_CONSTANTS.LANE_TOP_Y + SHEEP_CONSTANTS.LANE_BOTTOM_Y) / 2 - bannerH / 2;

      ctx.fillStyle = `rgba(225, 29, 72, ${0.85 + pulse * 0.15})`;
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(bx, by, bannerW, bannerH, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 13px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡ SUDDEN DEATH! NEXT LANE WON WINS MATCH ⚡', w / 2, by + bannerH / 2);
      ctx.restore();
    }
  }
}
