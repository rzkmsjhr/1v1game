import type { SheepFightState } from '../sheep-types';
import { SHEEP_CONSTANTS } from '../sheep-constants';
import { SheepRenderer } from './SheepRenderer';

export class SheepFightRenderer {
  private ctx: CanvasRenderingContext2D;
  private animTimer: number = 0;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  public render(state: SheepFightState, dt: number = 0.016) {
    this.animTimer += dt;
    const ctx = this.ctx;
    const w = SHEEP_CONSTANTS.VIEWPORT_WIDTH;
    const h = SHEEP_CONSTANTS.VIEWPORT_HEIGHT;

    ctx.save();
    ctx.fillStyle = '#064e3b';
    ctx.fillRect(0, 0, w, h);

    // 1. Draw 5 Pasture Lanes (Requirement 1: Alternating dark/light green grass, thin dirt separators)
    this.renderPastureLanes();

    // 2. Draw Sideline Pasture Decorations (Rustic Fence, Wildflowers, Bushes, Bunting, Fauna)
    this.renderPastureSidelines();

    // 3. Draw Start Spaces (Deployment Zones) & Clearance Indicators
    this.renderStartSpaces(state);

    // 3. Draw All Active Sheep
    this.renderSheepEntities(state);

    // 4. Draw Clash Sparks & Live Strength Badges
    this.renderClashEffectsAndBadges(state);

    // 5. Draw Lane Completed / Draw Barricades
    this.renderLaneOverlays(state);

    // 6. Draw Goal Headers & Sudden Death Alert
    this.renderFieldHeaders(state);

    ctx.restore();
  }

  /**
   * REQUIREMENT 1: 5 lanes, all green grass view, 1 lane dark green, 1 lane light green,
   * separated with thin line of dirt color
   */
  private renderPastureLanes() {
    const ctx = this.ctx;
    const numLanes = SHEEP_CONSTANTS.NUM_LANES;
    const laneW = (SHEEP_CONSTANTS.VIEWPORT_WIDTH - 2 * SHEEP_CONSTANTS.LANE_MARGIN_X) / numLanes;
    const topY = SHEEP_CONSTANTS.LANE_TOP_Y;
    const bottomY = SHEEP_CONSTANTS.LANE_BOTTOM_Y;
    const laneH = bottomY - topY;

    // Background base
    ctx.fillStyle = '#064e3b';
    ctx.fillRect(0, 0, SHEEP_CONSTANTS.VIEWPORT_WIDTH, SHEEP_CONSTANTS.VIEWPORT_HEIGHT);

    for (let i = 0; i < numLanes; i++) {
      const lx = SHEEP_CONSTANTS.LANE_MARGIN_X + i * laneW;
      const isDark = (i % 2 === 0);

      // Grass base color
      ctx.fillStyle = isDark ? SHEEP_CONSTANTS.COLORS.DARK_GRASS : SHEEP_CONSTANTS.COLORS.LIGHT_GRASS;
      ctx.fillRect(lx, topY, laneW, laneH);

      // Subtle mowed grass striping texture
      ctx.fillStyle = isDark ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.05)';
      const stripeH = 30;
      for (let sy = topY; sy < bottomY; sy += stripeH * 2) {
        ctx.fillRect(lx, sy, laneW, stripeH);
      }

      // Thin Dirt Separators between lanes
      if (i > 0) {
        ctx.fillStyle = SHEEP_CONSTANTS.COLORS.DIRT_SEPARATOR;
        ctx.fillRect(lx - 2, topY, 4, laneH);

        // Highlight line on dirt
        ctx.fillStyle = SHEEP_CONSTANTS.COLORS.DIRT_HIGHLIGHT;
        ctx.fillRect(lx - 0.5, topY, 1, laneH);
      }
    }

    // Outer Borders
    ctx.strokeStyle = SHEEP_CONSTANTS.COLORS.DIRT_SEPARATOR;
    ctx.lineWidth = 3;
    ctx.strokeRect(SHEEP_CONSTANTS.LANE_MARGIN_X, topY, numLanes * laneW, laneH);

    // Center Midfield Line (Dotted white)
    const midY = (topY + bottomY) / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(SHEEP_CONSTANTS.LANE_MARGIN_X, midY);
    ctx.lineTo(SHEEP_CONSTANTS.VIEWPORT_WIDTH - SHEEP_CONSTANTS.LANE_MARGIN_X, midY);
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

  /**
   * Renders decorative pasture sidelines:
   * Rustic wooden paddock fence, hanging festive bunting, lush berry bushes, blooming wildflowers,
   * animated perched songbird, and fluttering butterfly.
   */
  private renderPastureSidelines() {
    const ctx = this.ctx;
    const topY = SHEEP_CONSTANTS.LANE_TOP_Y;
    const bottomY = SHEEP_CONSTANTS.LANE_BOTTOM_Y;
    const leftFenceX = 15;
    const rightFenceX = SHEEP_CONSTANTS.VIEWPORT_WIDTH - 15;

    // 1. Lush Sideline Grass Bases (left: 0..30, right: 430..460)
    ctx.fillStyle = '#0f5132';
    ctx.fillRect(0, topY, SHEEP_CONSTANTS.LANE_MARGIN_X, bottomY - topY);
    ctx.fillRect(rightFenceX - 15, topY, SHEEP_CONSTANTS.LANE_MARGIN_X, bottomY - topY);

    // Subtle edge grass blades
    ctx.fillStyle = '#198754';
    for (let y = topY + 10; y < bottomY; y += 24) {
      // Left edge tufts
      ctx.fillRect(2, y, 3, 4);
      ctx.fillRect(25, y + 12, 3, 3);
      // Right edge tufts
      ctx.fillRect(SHEEP_CONSTANTS.VIEWPORT_WIDTH - 28, y + 6, 3, 3);
      ctx.fillRect(SHEEP_CONSTANTS.VIEWPORT_WIDTH - 5, y + 18, 3, 4);
    }

    // 2. Bushes along margins
    for (const b of SheepFightRenderer.BUSH_DATA) {
      const bx = b.side === 'left' ? 7 : SHEEP_CONSTANTS.VIEWPORT_WIDTH - 7;
      this.drawSidelineBush(ctx, bx, b.y, b.size, b.hasBerries);
    }

    // 3. Blooming Wildflowers
    for (const f of SheepFightRenderer.FLOWER_DATA) {
      const fx = f.side === 'left' ? f.offsetX : SHEEP_CONSTANTS.VIEWPORT_WIDTH - 30 + f.offsetX;
      this.drawWildflower(ctx, fx, f.y, f.type);
    }

    // 4. Wooden Paddock Fence with Bunting & Posts
    const postYList: number[] = [];
    for (let py = topY + 20; py <= bottomY - 15; py += 55) {
      postYList.push(py);
    }

    // Draw rails & bunting connecting adjacent posts
    for (let i = 0; i < postYList.length - 1; i++) {
      const y1 = postYList[i];
      const y2 = postYList[i + 1];

      // Rails
      this.drawFenceRails(ctx, leftFenceX, y1, y2);
      this.drawFenceRails(ctx, rightFenceX, y1, y2);

      // Bunting strings with pennants
      this.drawBuntingSpan(ctx, leftFenceX, y1, y2, 4);
      this.drawBuntingSpan(ctx, rightFenceX, y1, y2, -4);
    }

    // Draw Fence Posts
    for (const py of postYList) {
      this.drawFencePost(ctx, leftFenceX, py);
      this.drawFencePost(ctx, rightFenceX, py);
    }

    // 5. Perched singing songbird on left fence
    this.drawPerchedBird(ctx, leftFenceX, postYList[4] || 285);

    // 6. Fluttering butterfly on right sideline
    this.drawButterfly(ctx, rightFenceX, 490);
  }

  private drawFenceRails(ctx: CanvasRenderingContext2D, px: number, y1: number, y2: number) {
    ctx.save();
    // Two vertical wood rails
    ctx.fillStyle = '#78350f';
    ctx.fillRect(px - 3, y1, 2, y2 - y1);
    ctx.fillRect(px + 1, y1, 2, y2 - y1);

    // Wood highlight sheen
    ctx.fillStyle = '#92400e';
    ctx.fillRect(px - 2.5, y1, 1, y2 - y1);
    ctx.fillRect(px + 1.5, y1, 1, y2 - y1);
    ctx.restore();
  }

  private drawBuntingSpan(ctx: CanvasRenderingContext2D, px: number, y1: number, y2: number, sagX: number) {
    ctx.save();
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
    ctx.restore();
  }

  private drawFencePost(ctx: CanvasRenderingContext2D, px: number, py: number) {
    ctx.save();
    // Drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.roundRect(px - 4, py - 4 + 2, 8, 11, 2);
    ctx.fill();

    // Post body
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.roundRect(px - 4, py - 5, 8, 10, 2);
    ctx.fill();

    // Wood highlight bevel
    ctx.fillStyle = '#92400e';
    ctx.fillRect(px - 2, py - 5, 4, 10);

    // Rounded post cap
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.arc(px, py - 5, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Iron nail dot
    ctx.fillStyle = '#292524';
    ctx.beginPath();
    ctx.arc(px, py - 1, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawSidelineBush(ctx: CanvasRenderingContext2D, bx: number, by: number, size: number, hasBerries: boolean) {
    ctx.save();
    // Base shadow circle
    ctx.fillStyle = '#14532d';
    ctx.beginPath();
    ctx.arc(bx, by + 1, size, 0, Math.PI * 2);
    ctx.fill();

    // Main foliage circle
    ctx.fillStyle = '#166534';
    ctx.beginPath();
    ctx.arc(bx - 1, by - 1, size * 0.85, 0, Math.PI * 2);
    ctx.fill();

    // Highlight leaf puff
    ctx.fillStyle = '#22c55e';
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

      // Berry highlight
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx - 2.5, by - 2.5, 0.8, 0.8);
      ctx.fillRect(bx + 1.5, by - 0.5, 0.8, 0.8);
    }
    ctx.restore();
  }

  private drawWildflower(ctx: CanvasRenderingContext2D, fx: number, fy: number, type: 'daisy' | 'poppy' | 'violet' | 'clover') {
    ctx.save();
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
    ctx.restore();
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
  private renderStartSpaces(state: SheepFightState) {
    const ctx = this.ctx;
    const numLanes = SHEEP_CONSTANTS.NUM_LANES;
    const laneW = (SHEEP_CONSTANTS.VIEWPORT_WIDTH - 2 * SHEEP_CONSTANTS.LANE_MARGIN_X) / numLanes;
    const topY = SHEEP_CONSTANTS.LANE_TOP_Y;
    const bottomY = SHEEP_CONSTANTS.LANE_BOTTOM_Y;
    const depth = SHEEP_CONSTANTS.START_SPACE_DEPTH;

    for (let i = 0; i < numLanes; i++) {
      const lane = state.lanes[i];
      const lx = SHEEP_CONSTANTS.LANE_MARGIN_X + i * laneW;
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
  private renderSheepEntities(state: SheepFightState) {
    const ctx = this.ctx;
    const numLanes = SHEEP_CONSTANTS.NUM_LANES;
    const laneW = (SHEEP_CONSTANTS.VIEWPORT_WIDTH - 2 * SHEEP_CONSTANTS.LANE_MARGIN_X) / numLanes;

    for (let i = 0; i < numLanes; i++) {
      const lane = state.lanes[i];
      const cx = SHEEP_CONSTANTS.LANE_MARGIN_X + i * laneW + laneW / 2;

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
  private renderClashEffectsAndBadges(state: SheepFightState) {
    const ctx = this.ctx;
    const numLanes = SHEEP_CONSTANTS.NUM_LANES;
    const laneW = (SHEEP_CONSTANTS.VIEWPORT_WIDTH - 2 * SHEEP_CONSTANTS.LANE_MARGIN_X) / numLanes;

    for (let i = 0; i < numLanes; i++) {
      const lane = state.lanes[i];
      if (lane.status !== 'active' || lane.clashY === null) continue;

      const cx = SHEEP_CONSTANTS.LANE_MARGIN_X + i * laneW + laneW / 2;
      const cy = lane.clashY;

      // 1. Clash Sparks & Starburst
      ctx.save();
      const sparkCount = 8;
      const radius = 12 + Math.sin(this.animTimer * 8) * 3;

      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      for (let s = 0; s < sparkCount; s++) {
        const a = (s / sparkCount) * Math.PI * 2 + this.animTimer * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 3, cy + Math.sin(a) * 3);
        ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
        ctx.stroke();
      }
      ctx.restore();

      // 2. Dynamic Live Tug-of-War Strength Pill Badge
      ctx.save();
      const fP = lane.playerStrength;
      const fO = lane.opponentStrength;
      const badgeW = 64;
      const badgeH = 18;
      const badgeX = cx - badgeW / 2;
      // Position badge floating just above clash
      const badgeY = cy - 28;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = fP > fO ? '#3b82f6' : fO > fP ? '#ef4444' : '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 9);
      ctx.fill();
      ctx.stroke();

      ctx.font = 'bold 9.5px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Player force (Blue)
      ctx.fillStyle = '#60a5fa';
      ctx.fillText(`${fP}x`, badgeX + 15, badgeY + badgeH / 2);

      // VS indicator
      ctx.fillStyle = '#94a3b8';
      ctx.font = '8px system-ui';
      ctx.fillText('vs', cx, badgeY + badgeH / 2);

      // Opponent force (Red)
      ctx.font = 'bold 9.5px monospace';
      ctx.fillStyle = '#f87171';
      ctx.fillText(`${fO}x`, badgeX + badgeW - 15, badgeY + badgeH / 2);

      ctx.restore();
    }
  }

  /**
   * REQUIREMENT 3 & 4: Barricades for DRAW lanes and victory flags for won lanes
   */
  private renderLaneOverlays(state: SheepFightState) {
    const ctx = this.ctx;
    const numLanes = SHEEP_CONSTANTS.NUM_LANES;
    const laneW = (SHEEP_CONSTANTS.VIEWPORT_WIDTH - 2 * SHEEP_CONSTANTS.LANE_MARGIN_X) / numLanes;
    const topY = SHEEP_CONSTANTS.LANE_TOP_Y;
    const bottomY = SHEEP_CONSTANTS.LANE_BOTTOM_Y;
    const laneH = bottomY - topY;

    for (let i = 0; i < numLanes; i++) {
      const lane = state.lanes[i];
      if (lane.status === 'active') continue;

      const lx = SHEEP_CONSTANTS.LANE_MARGIN_X + i * laneW;
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
  private renderFieldHeaders(state: SheepFightState) {
    const ctx = this.ctx;
    const w = SHEEP_CONSTANTS.VIEWPORT_WIDTH;

    // 1. Top Opponent Goal Bar
    ctx.fillStyle = SHEEP_CONSTANTS.COLORS.OPPONENT_GOAL;
    ctx.fillRect(0, 0, w, SHEEP_CONSTANTS.LANE_TOP_Y);
    ctx.fillStyle = SHEEP_CONSTANTS.COLORS.OPPONENT_GOAL_LINE;
    ctx.fillRect(0, SHEEP_CONSTANTS.LANE_TOP_Y - 3, w, 3);

    // Opponent Goal text
    ctx.fillStyle = '#fca5a5';
    ctx.font = '900 11px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔴 OPPONENT GOAL LINE', w / 2, 22);

    // 2. Bottom Player Goal Bar
    ctx.fillStyle = SHEEP_CONSTANTS.COLORS.PLAYER_GOAL;
    ctx.fillRect(0, SHEEP_CONSTANTS.LANE_BOTTOM_Y, w, SHEEP_CONSTANTS.VIEWPORT_HEIGHT - SHEEP_CONSTANTS.LANE_BOTTOM_Y);
    ctx.fillStyle = SHEEP_CONSTANTS.COLORS.PLAYER_GOAL_LINE;
    ctx.fillRect(0, SHEEP_CONSTANTS.LANE_BOTTOM_Y, w, 3);

    ctx.fillStyle = '#93c5fd';
    ctx.font = '900 11px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔵 PLAYER GOAL LINE (DEFEND THIS)', w / 2, SHEEP_CONSTANTS.LANE_BOTTOM_Y + 22);

    // 3. REQUIREMENT 4: SUDDEN DEATH ALERT BANNER
    if (state.isSuddenDeath && state.winner === null) {
      ctx.save();
      const pulse = (Math.sin(this.animTimer * 8) + 1) * 0.5;
      const bannerW = 380;
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
