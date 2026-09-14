import { SlingEngine } from '../sling-engine';
import { Puck, ElasticBand } from '../sling-types';
import { AppTheme } from '../../types';
import {
  TABLE_WIDTH,
  TABLE_HEIGHT,
  RAIL_LEFT,
  RAIL_RIGHT,
  RAIL_TOP,
  RAIL_BOTTOM,
  CENTER_X,
  CENTER_Y,
  DIVIDER_TOP,
  DIVIDER_BOTTOM,
  GATE_LEFT,
  GATE_RIGHT,
  PUCK_RADIUS
} from '../sling-constants';

export class SlingRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context for SlingRenderer');
    this.ctx = ctx;
  }

  public render(
    engine: SlingEngine,
    theme: AppTheme,
    alpha: number = 1.0,
    draggedPuck: Puck | null = null
  ) {
    const ctx = this.ctx;
    const isDark = theme === 'dark';

    ctx.save();
    ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

    // 1. Board Surface (Wood Finish)
    this.renderBoardSurface(ctx, isDark);

    // 2. Court Markings & Center Divider
    this.renderCourtMarkings(ctx, isDark);
    this.renderCenterDivider(ctx, isDark);

    // 3. Elastic Cords (Top Opponent & Bottom Player)
    this.renderElasticBand(ctx, engine.opponentBand, isDark);
    this.renderElasticBand(ctx, engine.playerBand, isDark);

    // 4. Aim Trajectory Guide (when dragging)
    if (draggedPuck && engine.playerBand.isStretched) {
      this.renderAimGuide(ctx, draggedPuck, engine.playerBand);
    }

    // 5. Pucks with Sub-tick Interpolation
    for (const p of engine.pucks) {
      const x = p.isDragged ? p.x : p.prevX + (p.x - p.prevX) * alpha;
      const y = p.isDragged ? p.y : p.prevY + (p.y - p.prevY) * alpha;
      this.renderPuck(ctx, p, x, y);
    }

    // 6. Outer Wooden Border Frame & Rails
    this.renderOuterRails(ctx, isDark);

    // 7. Countdown Overlay (if in countdown)
    if (engine.phase === 'COUNTDOWN') {
      this.renderCountdown(ctx, engine.countdown);
    }

    ctx.restore();
  }

  private renderBoardSurface(ctx: CanvasRenderingContext2D, isDark: boolean) {
    // Maple / Wood Base
    const bgGrad = ctx.createLinearGradient(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    if (isDark) {
      bgGrad.addColorStop(0, '#1c1510');
      bgGrad.addColorStop(0.5, '#15100c');
      bgGrad.addColorStop(1, '#1c1510');
    } else {
      bgGrad.addColorStop(0, '#faebd7'); // Antique white / light maple
      bgGrad.addColorStop(0.5, '#f5deb3'); // Wheat
      bgGrad.addColorStop(1, '#faebd7');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

    // Subtle Wood Grain Texture Stripes
    ctx.save();
    ctx.globalAlpha = isDark ? 0.04 : 0.08;
    ctx.strokeStyle = isDark ? '#ffffff' : '#8b4513';
    ctx.lineWidth = 1;
    for (let x = 30; x < TABLE_WIDTH - 30; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, 20);
      ctx.lineTo(x + (x % 3 === 0 ? 6 : -4), TABLE_HEIGHT - 20);
      ctx.stroke();
    }
    ctx.restore();
  }

  private renderCourtMarkings(ctx: CanvasRenderingContext2D, isDark: boolean) {
    ctx.save();
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(120, 53, 15, 0.22)';
    ctx.lineWidth = 2;

    // Center circular face-off zone
    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, 50, 0, Math.PI * 2);
    ctx.stroke();

    // Player & Opponent baseline launch markers
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(RAIL_LEFT + 10, 600);
    ctx.lineTo(RAIL_RIGHT - 10, 600);
    ctx.moveTo(RAIL_LEFT + 10, 120);
    ctx.lineTo(RAIL_RIGHT - 10, 120);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  private renderCenterDivider(ctx: CanvasRenderingContext2D, isDark: boolean) {
    const dividerH = DIVIDER_BOTTOM - DIVIDER_TOP;

    ctx.save();
    // Wooden divider color
    ctx.fillStyle = isDark ? '#382214' : '#854d0e';
    ctx.strokeStyle = isDark ? '#52341f' : '#a16207';
    ctx.lineWidth = 1.5;

    // Left Wing
    ctx.fillRect(RAIL_LEFT, DIVIDER_TOP, GATE_LEFT - RAIL_LEFT, dividerH);
    ctx.strokeRect(RAIL_LEFT, DIVIDER_TOP, GATE_LEFT - RAIL_LEFT, dividerH);

    // Right Wing
    ctx.fillRect(GATE_RIGHT, DIVIDER_TOP, RAIL_RIGHT - GATE_RIGHT, dividerH);
    ctx.strokeRect(GATE_RIGHT, DIVIDER_TOP, RAIL_RIGHT - GATE_RIGHT, dividerH);

    // Gate Corner Posts (Rounded metal/wood studs)
    const postR = 3.5;
    ctx.fillStyle = isDark ? '#d4af37' : '#eab308'; // Golden gate studs
    ctx.beginPath();
    ctx.arc(GATE_LEFT, CENTER_Y, postR, 0, Math.PI * 2);
    ctx.arc(GATE_RIGHT, CENTER_Y, postR, 0, Math.PI * 2);
    ctx.fill();

    // Center Gate Arrows / Target Indicator
    ctx.fillStyle = isDark ? 'rgba(245, 158, 11, 0.6)' : 'rgba(180, 83, 9, 0.5)';
    // South arrow (player aiming target)
    ctx.beginPath();
    ctx.moveTo(CENTER_X - 6, DIVIDER_BOTTOM + 8);
    ctx.lineTo(CENTER_X + 6, DIVIDER_BOTTOM + 8);
    ctx.lineTo(CENTER_X, DIVIDER_BOTTOM + 3);
    ctx.closePath();
    ctx.fill();

    // North arrow (opponent aiming target)
    ctx.beginPath();
    ctx.moveTo(CENTER_X - 6, DIVIDER_TOP - 8);
    ctx.lineTo(CENTER_X + 6, DIVIDER_TOP - 8);
    ctx.lineTo(CENTER_X, DIVIDER_TOP - 3);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  private renderElasticBand(ctx: CanvasRenderingContext2D, band: ElasticBand, isDark: boolean) {
    ctx.save();

    // Band anchor posts on left and right rails
    ctx.fillStyle = isDark ? '#e2e8f0' : '#475569';
    ctx.beginPath();
    ctx.arc(band.leftX, band.leftY, 5, 0, Math.PI * 2);
    ctx.arc(band.rightX, band.rightY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Elastic Cord (drawn as thick quadratic Bézier curve)
    ctx.beginPath();
    ctx.moveTo(band.leftX, band.leftY);
    ctx.quadraticCurveTo(band.midX, band.midY, band.rightX, band.rightY);

    ctx.lineWidth = band.isStretched ? 4.5 : 5;
    ctx.lineCap = 'round';

    if (band.isStretched) {
      ctx.strokeStyle = '#ef4444'; // Red tension when pulled
      ctx.shadowColor = 'rgba(239, 68, 68, 0.5)';
      ctx.shadowBlur = 8;
    } else {
      ctx.strokeStyle = isDark ? '#ffffff' : '#1e293b';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
      ctx.shadowBlur = 3;
    }
    ctx.stroke();

    ctx.restore();
  }

  private renderAimGuide(ctx: CanvasRenderingContext2D, puck: Puck, band: ElasticBand) {
    const midAnchorX = (band.leftX + band.rightX) * 0.5;
    const pullOffsetX = (puck.x - midAnchorX) / (TABLE_WIDTH * 0.5);
    const dirX = -pullOffsetX * 0.45;
    const dirY = -1;
    const len = Math.hypot(dirX, dirY);

    const normDirX = dirX / len;
    const normDirY = dirY / len;

    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)'; // Amber trajectory
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.moveTo(puck.x, puck.y - PUCK_RADIUS);
    ctx.lineTo(puck.x + normDirX * 220, puck.y + normDirY * 220);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private renderPuck(
    ctx: CanvasRenderingContext2D,
    puck: Puck,
    x: number,
    y: number
  ) {
    ctx.save();
    const r = puck.radius;

    // 1. Drop shadow under puck
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = puck.isDragged ? 14 : 7;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = puck.isDragged ? 6 : 3;

    // 2. Base Puck Circle
    const isBlack = puck.color ? puck.color === 'black' : puck.owner === 'player';
    const puckGrad = ctx.createRadialGradient(x - 4, y - 4, 3, x, y, r);

    if (isBlack) {
      // Obsidian Black Puck with glossy reflection
      puckGrad.addColorStop(0, '#4b5563');
      puckGrad.addColorStop(0.5, '#1f2937');
      puckGrad.addColorStop(1, '#0b0f19');
    } else {
      // Warm Ivory / Crimson Opponent Puck
      puckGrad.addColorStop(0, '#f87171');
      puckGrad.addColorStop(0.5, '#dc2626');
      puckGrad.addColorStop(1, '#991b1b');
    }

    ctx.fillStyle = puckGrad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = 'transparent';

    // 3. Concentric lathe ring grooves
    ctx.strokeStyle = isBlack
      ? 'rgba(255, 255, 255, 0.22)'
      : 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
    ctx.stroke();

    // Center brass / metal dot
    ctx.fillStyle = isBlack ? '#9ca3af' : '#fef08a';
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Rim highlight stroke
    ctx.strokeStyle = isBlack ? '#374151' : '#b91c1c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  private renderOuterRails(ctx: CanvasRenderingContext2D, isDark: boolean) {
    ctx.save();

    // Outer Wooden Frame Border
    ctx.strokeStyle = isDark ? '#2e1c10' : '#713f12';
    ctx.lineWidth = RAIL_LEFT;

    ctx.strokeRect(
      RAIL_LEFT * 0.5,
      RAIL_TOP * 0.5,
      TABLE_WIDTH - RAIL_LEFT,
      TABLE_HEIGHT - RAIL_TOP
    );

    // Inner rail bevel shadow
    ctx.strokeStyle = isDark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(RAIL_LEFT, RAIL_TOP, RAIL_RIGHT - RAIL_LEFT, RAIL_BOTTOM - RAIL_TOP);

    ctx.restore();
  }

  private renderCountdown(ctx: CanvasRenderingContext2D, count: number) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 68px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillStyle = '#f59e0b';
    ctx.shadowColor = 'rgba(245, 158, 11, 0.8)';
    ctx.shadowBlur = 20;

    const text = count > 0 ? `${count}` : 'GO!';
    ctx.fillText(text, CENTER_X, CENTER_Y);
    ctx.restore();
  }
}
