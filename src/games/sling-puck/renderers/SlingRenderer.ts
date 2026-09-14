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
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private renderScale: number = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context for SlingRenderer');
    this.ctx = ctx;
    this.updateScale(1);
  }

  /**
   * Adjust backing resolution to match device pixel ratio and screen scaling.
   * Ensures crystal-clear razor-sharp visuals on mobile retina screens without blur.
   */
  public updateScale(displayScale: number = 1) {
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    const targetScale = Math.max(1.0, Math.min(3.0, displayScale * dpr));

    if (Math.abs(this.renderScale - targetScale) > 0.05) {
      this.renderScale = targetScale;
      const targetWidth = Math.round(TABLE_WIDTH * this.renderScale);
      const targetHeight = Math.round(TABLE_HEIGHT * this.renderScale);
      if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
        this.canvas.width = targetWidth;
        this.canvas.height = targetHeight;
      }
      this.canvas.style.width = `${TABLE_WIDTH}px`;
      this.canvas.style.height = `${TABLE_HEIGHT}px`;
    }
  }

  public render(
    engine: SlingEngine,
    theme: AppTheme,
    alpha: number = 1.0,
    draggedPuck: Puck | null = null
  ) {
    const ctx = this.ctx;
    const isDark = theme === 'dark';

    // Clear entire backing buffer
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    ctx.scale(this.renderScale, this.renderScale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

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
    if (engine.opponentBand.isStretched) {
      const oppPuck = engine.pucks.find(p => p.isDragged && p.y < CENTER_Y);
      if (oppPuck) {
        this.renderAimGuide(ctx, oppPuck, engine.opponentBand);
      }
    }

    // 5. Pucks with Sub-tick Interpolation
    for (const p of engine.pucks) {
      const x = p.isDragged ? (p.dragX ?? p.x) : p.prevX + (p.x - p.prevX) * alpha;
      const y = p.isDragged ? (p.dragY ?? p.y) : p.prevY + (p.y - p.prevY) * alpha;
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
    const bgGrad = ctx.createLinearGradient(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    if (isDark) {
      // Warm polished honey-oak / golden teak wood surface.
      // Retains authentic physical wooden tabletop feel with high contrast against dark UI and pucks.
      bgGrad.addColorStop(0, '#d8ad7a');
      bgGrad.addColorStop(0.3, '#c99b66');
      bgGrad.addColorStop(0.7, '#ba8b56');
      bgGrad.addColorStop(1, '#d8ad7a');
    } else {
      // Light Antique Maple / Birch
      bgGrad.addColorStop(0, '#faebd7');
      bgGrad.addColorStop(0.5, '#f5deb3');
      bgGrad.addColorStop(1, '#faebd7');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

    // Subtle Wood Grain Texture Stripes
    ctx.save();
    ctx.globalAlpha = isDark ? 0.09 : 0.08;
    ctx.strokeStyle = isDark ? '#4a250c' : '#8b4513';
    ctx.lineWidth = 1;
    for (let x = 28; x < TABLE_WIDTH - 28; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, 20);
      ctx.lineTo(x + (x % 3 === 0 ? 6 : -4), TABLE_HEIGHT - 20);
      ctx.stroke();
    }
    ctx.restore();
  }

  private renderCourtMarkings(ctx: CanvasRenderingContext2D, isDark: boolean) {
    ctx.save();
    // Laser-etched groove markings: dark warm brown with high legibility
    ctx.strokeStyle = isDark ? 'rgba(74, 34, 10, 0.42)' : 'rgba(120, 53, 15, 0.24)';
    ctx.lineWidth = 2;

    // Center circular face-off zone
    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, 52, 0, Math.PI * 2);
    ctx.stroke();

    // Center center-point dot
    ctx.fillStyle = isDark ? 'rgba(74, 34, 10, 0.45)' : 'rgba(120, 53, 15, 0.3)';
    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, 3, 0, Math.PI * 2);
    ctx.fill();

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
    // Solid wooden divider bar
    ctx.fillStyle = isDark ? '#3d1c0b' : '#854d0e';
    ctx.strokeStyle = isDark ? '#5c2d15' : '#a16207';
    ctx.lineWidth = 1.5;

    // Left Wing
    ctx.fillRect(RAIL_LEFT, DIVIDER_TOP, GATE_LEFT - RAIL_LEFT, dividerH);
    ctx.strokeRect(RAIL_LEFT, DIVIDER_TOP, GATE_LEFT - RAIL_LEFT, dividerH);

    // Right Wing
    ctx.fillRect(GATE_RIGHT, DIVIDER_TOP, RAIL_RIGHT - GATE_RIGHT, dividerH);
    ctx.strokeRect(GATE_RIGHT, DIVIDER_TOP, RAIL_RIGHT - GATE_RIGHT, dividerH);

    // Gate Corner Posts (Rounded metal/wood studs)
    const postR = 4;
    ctx.fillStyle = '#f59e0b'; // Golden gate studs
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.arc(GATE_LEFT, CENTER_Y, postR, 0, Math.PI * 2);
    ctx.arc(GATE_RIGHT, CENTER_Y, postR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // Gate opening indicators (Directional Chevrons)
    ctx.fillStyle = isDark ? 'rgba(180, 83, 9, 0.75)' : 'rgba(180, 83, 9, 0.55)';
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

  private renderElasticBand(ctx: CanvasRenderingContext2D, band: ElasticBand, _isDark: boolean) {
    ctx.save();

    // Band anchor posts on left and right rails (Solid Brass Rivets)
    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.arc(band.leftX, band.leftY, 5.5, 0, Math.PI * 2);
    ctx.arc(band.rightX, band.rightY, 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(band.leftX, band.leftY, 2, 0, Math.PI * 2);
    ctx.arc(band.rightX, band.rightY, 2, 0, Math.PI * 2);
    ctx.fill();

    // Elastic Cord (drawn as thick quadratic Bézier curve)
    ctx.beginPath();
    ctx.moveTo(band.leftX, band.leftY);
    ctx.quadraticCurveTo(band.midX, band.midY, band.rightX, band.rightY);

    ctx.lineWidth = band.isStretched ? 4.5 : 5.5;
    ctx.lineCap = 'round';

    if (band.isStretched) {
      // High-tension red glow when pulled
      ctx.strokeStyle = '#ef4444';
      ctx.shadowColor = 'rgba(239, 68, 68, 0.8)';
      ctx.shadowBlur = 10;
      ctx.stroke();
    } else {
      // Natural braided dark slate elastic bungee cord
      ctx.strokeStyle = '#1e293b';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 3;
      ctx.stroke();

      // Subtle top woven cord specular highlight
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(band.leftX, band.leftY - 1);
      ctx.quadraticCurveTo(band.midX, band.midY - 1, band.rightX, band.rightY - 1);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  private renderAimGuide(ctx: CanvasRenderingContext2D, puck: Puck, band: ElasticBand) {
    const isPlayer = band.side === 'player';
    const midAnchorX = (band.leftX + band.rightX) * 0.5;
    const pullOffsetX = (puck.x - midAnchorX) / (TABLE_WIDTH * 0.5);
    const dirX = -pullOffsetX * 0.45;
    const dirY = isPlayer ? -1 : 1;
    const len = Math.hypot(dirX, dirY);

    const normDirX = dirX / len;
    const normDirY = dirY / len;

    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = isPlayer ? 'rgba(245, 158, 11, 0.95)' : 'rgba(239, 68, 68, 0.95)';
    ctx.lineWidth = 2.8;

    ctx.beginPath();
    ctx.moveTo(puck.x, puck.y + (isPlayer ? -PUCK_RADIUS : PUCK_RADIUS));
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
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = puck.isDragged ? 16 : 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = puck.isDragged ? 7 : 3;

    // 2. Base Puck Circle & Radial Shading
    const isBlack = puck.color ? puck.color === 'black' : puck.owner === 'player';
    const puckGrad = ctx.createRadialGradient(x - 5, y - 5, 2, x, y, r);

    if (isBlack) {
      // Obsidian Black Puck with dark slate specular peak & deep black body
      puckGrad.addColorStop(0, '#64748b'); // Slate-500 specular highlight
      puckGrad.addColorStop(0.35, '#334155'); // Slate-700
      puckGrad.addColorStop(0.75, '#1e293b'); // Slate-800
      puckGrad.addColorStop(1, '#090d16');   // Deep Obsidian
    } else {
      // Vibrant Crimson / Ruby Red Puck
      puckGrad.addColorStop(0, '#fca5a5'); // Red-300 specular highlight
      puckGrad.addColorStop(0.35, '#ef4444'); // Red-500
      puckGrad.addColorStop(0.75, '#dc2626'); // Red-600
      puckGrad.addColorStop(1, '#881337');   // Deep Ruby
    }

    ctx.fillStyle = puckGrad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Disable shadow for crisp interior details
    ctx.shadowColor = 'transparent';

    // 3. Polished Metallic Outer Rim
    // Gives the black puck a razor-sharp titanium rim and the red puck a rich ruby rim
    ctx.strokeStyle = isBlack ? '#cbd5e1' : '#b91c1c';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    // 4. Concentric lathe ring grooves
    ctx.strokeStyle = isBlack
      ? 'rgba(255, 255, 255, 0.45)'
      : 'rgba(254, 240, 138, 0.65)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
    ctx.stroke();

    // 5. Center polished rivet / core
    ctx.fillStyle = isBlack ? '#d97706' : '#ca8a04';
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(x, y, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // 6. Glossy lacquer reflection arc on top-left quadrant
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.82, -2.6, -0.9);
    ctx.stroke();

    ctx.restore();
  }

  private renderOuterRails(ctx: CanvasRenderingContext2D, isDark: boolean) {
    ctx.save();

    // Outer Wooden Frame Border
    // Light Mode: Classic Walnut / Amber (#713f12)
    // Dark Mode: Deep Roasted Espresso Walnut (#2b1408)
    ctx.strokeStyle = isDark ? '#2b1408' : '#713f12';
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

    // In Dark Mode: subtle golden inlay trim between wood rail and playing surface
    if (isDark) {
      ctx.strokeStyle = 'rgba(217, 119, 6, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(RAIL_LEFT + 1, RAIL_TOP + 1, (RAIL_RIGHT - RAIL_LEFT) - 2, (RAIL_BOTTOM - RAIL_TOP) - 2);
    }

    ctx.restore();
  }

  private renderCountdown(ctx: CanvasRenderingContext2D, count: number) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 72px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillStyle = '#f59e0b';
    ctx.shadowColor = 'rgba(245, 158, 11, 0.85)';
    ctx.shadowBlur = 24;

    const text = count > 0 ? `${count}` : 'GO!';
    ctx.fillText(text, CENTER_X, CENTER_Y);
    ctx.restore();
  }
}
