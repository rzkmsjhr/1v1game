import type { AppTheme } from '../../types';
import { BOMB_ARENA_CONSTANTS } from '../bomb-arena-constants';
import type {
  BombArenaState,
  GridCoord,
  ArenaParticle
} from '../bomb-arena-types';

export class BombArenaRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private currentTheme: AppTheme;
  private particles: ArenaParticle[] = [];
  private animTimer: number = 0;

  constructor(canvas: HTMLCanvasElement, theme: AppTheme = 'dark') {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.currentTheme = theme;
  }

  public setTheme(theme: AppTheme) {
    this.currentTheme = theme;
  }

  public reset() {
    this.particles = [];
  }

  public addSplinters(col: number, row: number, count: number = 14) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 2.8;
      this.particles.push({
        x: col + 0.5,
        y: row + 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: Math.random() > 0.4 ? '#b45309' : '#d97706',
        size: 2.5 + Math.random() * 2.5,
        alpha: 1.0,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.3
      });
    }
  }

  public addSparks(col: number, row: number, count: number = 6) {
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI * 0.5 + (Math.random() - 0.5) * 1.5;
      const speed = 0.8 + Math.random() * 1.6;
      this.particles.push({
        x: col + 0.5,
        y: row + 0.3,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: Math.random() > 0.5 ? '#facc15' : '#f97316',
        size: 1.5 + Math.random() * 2,
        alpha: 1.0,
        life: 0,
        maxLife: 0.2 + Math.random() * 0.2
      });
    }
  }

  public render(state: BombArenaState, dt: number) {
    this.animTimer += dt;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const isDark = this.currentTheme === 'dark';

    // Clear background
    ctx.fillStyle = isDark ? '#090d16' : '#f1f5f9';
    ctx.fillRect(0, 0, w, h);

    // Calculate grid fit: 6 cols x 12 rows portrait
    const pad = 12;
    const availW = w - pad * 2;
    const availH = h - pad * 2;
    const cols = BOMB_ARENA_CONSTANTS.GRID_COLS;
    const rows = BOMB_ARENA_CONSTANTS.GRID_ROWS;

    const tileSize = Math.floor(Math.min(availW / cols, availH / rows));
    const arenaW = tileSize * cols;
    const arenaH = tileSize * rows;
    const originX = Math.floor((w - arenaW) / 2);
    const originY = Math.floor((h - arenaH) / 2);

    ctx.save();

    // Screen Shake
    if (state.screenShake > 0) {
      const shakeAmt = state.screenShake;
      const sx = (Math.random() - 0.5) * shakeAmt;
      const sy = (Math.random() - 0.5) * shakeAmt;
      ctx.translate(sx, sy);
    }

    // 1. Render Base Arena Floor
    this.renderFloor(ctx, state, originX, originY, tileSize, cols, rows, isDark);

    // 2. Render Shrink Collapse Warning Zone
    this.renderShrinkWarnings(ctx, state, originX, originY, tileSize);

    // 3. Render Bomb Threat Danger Overlay (Visual Expected Radius)
    this.renderBombThreats(ctx, state, originX, originY, tileSize);

    // 4. Render Target Placement Highlight Box in front of Player
    if (state.phase === 'PLAYING' && !state.player.isDead) {
      this.renderTargetIndicator(ctx, state, originX, originY, tileSize);
    }

    // 5. Render Fences
    this.renderFences(ctx, state, originX, originY, tileSize);

    // 6. Render Bombs
    this.renderBombs(ctx, state, originX, originY, tileSize);

    // 7. Render Players
    this.renderPlayers(ctx, state, originX, originY, tileSize);

    // 8. Render Explosions
    this.renderExplosions(ctx, state, originX, originY, tileSize);

    // 9. Render Particles
    this.renderParticles(ctx, dt, originX, originY, tileSize);

    ctx.restore();
  }

  private renderFloor(
    ctx: CanvasRenderingContext2D,
    state: BombArenaState,
    ox: number,
    oy: number,
    ts: number,
    cols: number,
    rows: number,
    isDark: boolean
  ) {
    // Outer Arena Border Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = isDark ? '#0b1329' : '#e2e8f0';
    ctx.fillRect(ox - 3, oy - 3, ts * cols + 6, ts * rows + 6);
    ctx.shadowColor = 'transparent';

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const x = ox + c * ts;
        const y = oy + r * ts;
        const cell = state.grid[c][r];

        if (cell === 'crushed') {
          // Crushed stone / deadzone
          ctx.fillStyle = isDark ? '#111827' : '#475569';
          ctx.fillRect(x, y, ts, ts);

          // Crushed debris cross
          ctx.strokeStyle = isDark ? '#1f2937' : '#334155';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 2, y + 2, ts - 4, ts - 4);
          ctx.beginPath();
          ctx.moveTo(x + 4, y + 4);
          ctx.lineTo(x + ts - 4, y + ts - 4);
          ctx.moveTo(x + ts - 4, y + 4);
          ctx.lineTo(x + 4, y + ts - 4);
          ctx.stroke();
        } else {
          // Checkerboard stone floor
          const isAlt = (c + r) % 2 === 0;
          if (isDark) {
            ctx.fillStyle = isAlt ? '#1e293b' : '#0f172a';
          } else {
            ctx.fillStyle = isAlt ? '#f8fafc' : '#f1f5f9';
          }
          ctx.fillRect(x, y, ts, ts);

          // Subtle stone bevel outline
          ctx.strokeStyle = isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(203, 213, 225, 0.6)';
          ctx.lineWidth = 0.8;
          ctx.strokeRect(x, y, ts, ts);
        }
      }
    }
  }

  private renderShrinkWarnings(
    ctx: CanvasRenderingContext2D,
    state: BombArenaState,
    ox: number,
    oy: number,
    ts: number
  ) {
    const b = state.bounds;
    if (b.warningTimeLeft <= 0) return;

    const pulse = 0.4 + 0.35 * Math.sin(this.animTimer * 12);
    ctx.save();
    ctx.fillStyle = `rgba(239, 68, 68, ${pulse})`;

    for (const r of b.warningRows) {
      for (let c = 0; c < BOMB_ARENA_CONSTANTS.GRID_COLS; c++) {
        const x = ox + c * ts;
        const y = oy + r * ts;
        ctx.fillRect(x, y, ts, ts);
        // Warning diagonal hazard stripes
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + ts, y + ts);
        ctx.stroke();
      }
    }

    for (const c of b.warningCols) {
      for (let r = 0; r < BOMB_ARENA_CONSTANTS.GRID_ROWS; r++) {
        const x = ox + c * ts;
        const y = oy + r * ts;
        ctx.fillRect(x, y, ts, ts);
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + ts, y + ts);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  private renderBombThreats(
    ctx: CanvasRenderingContext2D,
    state: BombArenaState,
    ox: number,
    oy: number,
    ts: number
  ) {
    if (state.bombs.length === 0) return;

    // Collect unique threatened cells
    const threatenedMap = new Map<string, GridCoord>();
    for (const bomb of state.bombs) {
      for (const cell of bomb.threatCells) {
        threatenedMap.set(`${cell.col},${cell.row}`, cell);
      }
    }

    ctx.save();
    const pulseAlpha = 0.22 + 0.16 * Math.sin(this.animTimer * 8);

    for (const cell of threatenedMap.values()) {
      const x = ox + cell.col * ts;
      const y = oy + cell.row * ts;

      // Red threat highlight
      ctx.fillStyle = `rgba(239, 68, 68, ${pulseAlpha})`;
      ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2);

      // Warning crosshair grid dots
      ctx.fillStyle = '#f87171';
      ctx.beginPath();
      ctx.arc(x + ts * 0.5, y + ts * 0.5, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Threat border
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x + 2, y + 2, ts - 4, ts - 4);
    }

    ctx.restore();
  }

  private renderTargetIndicator(
    ctx: CanvasRenderingContext2D,
    state: BombArenaState,
    ox: number,
    oy: number,
    ts: number
  ) {
    const p = state.player;
    let targetCol = Math.floor(p.x);
    let targetRow = Math.floor(p.y);

    // Target placement is BEHIND the player (opposite of facing)
    switch (p.facing) {
      case 'up': targetRow += 1; break;    // behind = below
      case 'down': targetRow -= 1; break;  // behind = above
      case 'left': targetCol += 1; break;  // behind = right
      case 'right': targetCol -= 1; break; // behind = left
    }

    const b = state.bounds;
    const inBounds = targetCol >= b.minCol && targetCol <= b.maxCol && targetRow >= b.minRow && targetRow <= b.maxRow;
    if (!inBounds) return;

    const tx = ox + targetCol * ts;
    const ty = oy + targetRow * ts;
    const canPlace = state.grid[targetCol][targetRow] === 'empty';

    ctx.save();

    // 1. Shaded highlight fill
    ctx.fillStyle = canPlace ? 'rgba(56, 189, 248, 0.12)' : 'rgba(239, 68, 68, 0.14)';
    ctx.fillRect(tx + 2, ty + 2, ts - 4, ts - 4);

    // 2. Animated marching ants dashed border
    ctx.strokeStyle = canPlace ? 'rgba(56, 189, 248, 0.9)' : 'rgba(239, 68, 68, 0.8)';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -this.animTimer * 22;
    ctx.strokeRect(tx + 3, ty + 3, ts - 6, ts - 6);
    ctx.setLineDash([]);

    // 3. Crisp Corner Brackets
    const bracketLen = Math.floor(ts * 0.28);
    ctx.strokeStyle = canPlace ? '#38bdf8' : '#ef4444';
    ctx.lineWidth = 2.4;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(tx + 3, ty + 3 + bracketLen);
    ctx.lineTo(tx + 3, ty + 3);
    ctx.lineTo(tx + 3 + bracketLen, ty + 3);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(tx + ts - 3 - bracketLen, ty + 3);
    ctx.lineTo(tx + ts - 3, ty + 3);
    ctx.lineTo(tx + ts - 3, ty + 3 + bracketLen);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(tx + 3, ty + ts - 3 - bracketLen);
    ctx.lineTo(tx + 3, ty + ts - 3);
    ctx.lineTo(tx + 3 + bracketLen, ty + ts - 3);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(tx + ts - 3 - bracketLen, ty + ts - 3);
    ctx.lineTo(tx + ts - 3, ty + ts - 3);
    ctx.lineTo(tx + ts - 3, ty + ts - 3 - bracketLen);
    ctx.stroke();

    // 4. Center Target Crosshair Reticle
    const cx = tx + ts / 2;
    const cy = ty + ts / 2;
    if (canPlace) {
      const reticleR = 4 + Math.sin(this.animTimer * 10) * 1.5;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx, cy, reticleR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      const xSize = 5;
      ctx.beginPath();
      ctx.moveTo(cx - xSize, cy - xSize);
      ctx.lineTo(cx + xSize, cy + xSize);
      ctx.moveTo(cx + xSize, cy - xSize);
      ctx.lineTo(cx - xSize, cy + xSize);
      ctx.stroke();
    }

    ctx.restore();
  }

  private renderFences(
    ctx: CanvasRenderingContext2D,
    state: BombArenaState,
    ox: number,
    oy: number,
    ts: number
  ) {
    for (let c = 0; c < BOMB_ARENA_CONSTANTS.GRID_COLS; c++) {
      for (let r = 0; r < BOMB_ARENA_CONSTANTS.GRID_ROWS; r++) {
        if (state.grid[c][r] === 'fence') {
          const x = ox + c * ts;
          const y = oy + r * ts;

          ctx.save();
          // Drop shadow
          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.fillRect(x + 3, y + 5, ts - 6, ts - 4);

          // Wood block base
          const woodGrad = ctx.createLinearGradient(x, y, x, y + ts);
          woodGrad.addColorStop(0, '#d97706'); // Warm amber wood
          woodGrad.addColorStop(0.5, '#b45309');
          woodGrad.addColorStop(1, '#78350f');
          ctx.fillStyle = woodGrad;

          ctx.beginPath();
          ctx.roundRect(x + 3, y + 3, ts - 6, ts - 6, 4);
          ctx.fill();

          // Wood slats texture
          ctx.strokeStyle = '#92400e';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + ts * 0.35, y + 4);
          ctx.lineTo(x + ts * 0.35, y + ts - 4);
          ctx.moveTo(x + ts * 0.65, y + 4);
          ctx.lineTo(x + ts * 0.65, y + ts - 4);
          ctx.stroke();

          // Top highlight
          ctx.strokeStyle = '#fde68a';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(x + 5, y + 4);
          ctx.lineTo(x + ts - 5, y + 4);
          ctx.stroke();

          ctx.restore();
        }
      }
    }
  }

  private renderBombs(
    ctx: CanvasRenderingContext2D,
    state: BombArenaState,
    ox: number,
    oy: number,
    ts: number
  ) {
    for (const bomb of state.bombs) {
      const cx = ox + (bomb.col + 0.5) * ts;
      const cy = oy + (bomb.row + 0.5) * ts;
      const radius = ts * 0.34;

      // Spawn fuse sparks
      if (Math.random() < 0.45) {
        this.addSparks(bomb.col, bomb.row, 2);
      }

      ctx.save();

      // Bomb drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + radius * 0.8, radius * 0.9, radius * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Bomb body (Obsidian 3D gradient sphere)
      const grad = ctx.createRadialGradient(
        cx - radius * 0.3,
        cy - radius * 0.3,
        radius * 0.1,
        cx,
        cy,
        radius
      );
      grad.addColorStop(0, '#475569');
      grad.addColorStop(0.35, '#1e293b');
      grad.addColorStop(1, '#020617');
      ctx.fillStyle = grad;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // Specular shine glint
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.arc(cx - radius * 0.32, cy - radius * 0.32, radius * 0.22, 0, Math.PI * 2);
      ctx.fill();

      // Metal neck cap
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(cx - radius * 0.25, cy - radius - 2, radius * 0.5, 4);

      // Fuse string
      ctx.strokeStyle = '#ea580c';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(cx, cy - radius - 2);
      ctx.quadraticCurveTo(cx + 4, cy - radius - 7, cx + 2, cy - radius - 10);
      ctx.stroke();

      // Spark sparkler flame
      ctx.fillStyle = Math.random() > 0.5 ? '#fde047' : '#ef4444';
      ctx.beginPath();
      ctx.arc(cx + 2, cy - radius - 10, 3 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();

      // Digital 3-second fuse timer badge hovering over bomb
      const timerStr = Math.max(0.1, bomb.timer).toFixed(1) + 's';
      ctx.font = '800 11px Inter, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Badge pill background
      const badgeW = 32;
      const badgeH = 15;
      const badgeY = cy - radius - 18;
      ctx.fillStyle = bomb.timer <= 1.0 ? '#ef4444' : '#1e293b';
      ctx.beginPath();
      ctx.roundRect(cx - badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, 6);
      ctx.fill();
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(timerStr, cx, badgeY);

      ctx.restore();
    }
  }

  private renderPlayers(
    ctx: CanvasRenderingContext2D,
    state: BombArenaState,
    ox: number,
    oy: number,
    ts: number
  ) {
    const players = [
      { p: state.player, isPlayer: true, primaryColor: '#0284c7', visorColor: '#38bdf8' },
      { p: state.opponent, isPlayer: false, primaryColor: '#dc2626', visorColor: '#f87171' }
    ];

    for (const { p, isPlayer, primaryColor, visorColor } of players) {
      if (p.isDead) continue;

      const px = ox + p.x * ts;
      const py = oy + p.y * ts;
      const radius = ts * BOMB_ARENA_CONSTANTS.PLAYER_RADIUS;

      // Bobbing walk animation
      const bobY = p.isMoving ? Math.sin(this.animTimer * 16) * 2 : 0;

      ctx.save();

      // Ground shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(px, py + radius * 0.9, radius * 0.85, radius * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Character body circle
      const bodyGrad = ctx.createRadialGradient(
        px - radius * 0.3,
        py + bobY - radius * 0.3,
        radius * 0.1,
        px,
        py + bobY,
        radius
      );
      bodyGrad.addColorStop(0, visorColor);
      bodyGrad.addColorStop(1, primaryColor);
      ctx.fillStyle = bodyGrad;

      ctx.beginPath();
      ctx.arc(px, py + bobY, radius, 0, Math.PI * 2);
      ctx.fill();

      // Outer outline
      ctx.strokeStyle = isPlayer ? '#bae6fd' : '#fecaca';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Visor / Face direction indicator
      ctx.fillStyle = '#0f172a';
      let vx = px;
      let vy = py + bobY;
      let vw = radius * 0.85;
      let vh = radius * 0.42;

      switch (p.facing) {
        case 'up':
          vy -= radius * 0.45;
          break;
        case 'down':
          vy += radius * 0.45;
          break;
        case 'left':
          vx -= radius * 0.45;
          vw = radius * 0.42;
          vh = radius * 0.85;
          break;
        case 'right':
          vx += radius * 0.45;
          vw = radius * 0.42;
          vh = radius * 0.85;
          break;
      }

      ctx.beginPath();
      ctx.roundRect(vx - vw / 2, vy - vh / 2, vw, vh, 3);
      ctx.fill();

      // Player Identification Badge
      ctx.font = '900 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = isPlayer ? '#38bdf8' : '#f87171';
      ctx.fillText(isPlayer ? 'YOU' : 'RIVAL', px, py + bobY - radius - 5);

      // Direction Arrow / Indicator on player icon showing where bomb/fence will be placed
      if (isPlayer) {
        ctx.save();
        ctx.translate(px, py + bobY);

        // Arrow points BEHIND the player (opposite of facing) to show placement target
        let angle = 0;
        switch (p.facing) {
          case 'up': angle = Math.PI / 2; break;     // arrow points down (behind)
          case 'down': angle = -Math.PI / 2; break;  // arrow points up (behind)
          case 'left': angle = 0; break;              // arrow points right (behind)
          case 'right': angle = Math.PI; break;       // arrow points left (behind)
        }
        ctx.rotate(angle);

        // Check if target tile BEHIND player is within bounds and open
        let targetCol = Math.floor(p.x);
        let targetRow = Math.floor(p.y);
        switch (p.facing) {
          case 'up': targetRow += 1; break;    // behind = below
          case 'down': targetRow -= 1; break;  // behind = above
          case 'left': targetCol += 1; break;  // behind = right
          case 'right': targetCol -= 1; break; // behind = left
        }
        const b = state.bounds;
        const inBounds = targetCol >= b.minCol && targetCol <= b.maxCol && targetRow >= b.minRow && targetRow <= b.maxRow;
        const canPlace = inBounds && state.grid[targetCol][targetRow] === 'empty';

        // Animated pulse distance
        const arrowDist = radius + 4 + Math.sin(this.animTimer * 12) * 2;
        const arrowColor = canPlace ? '#38bdf8' : '#f59e0b';
        const glowColor = canPlace ? 'rgba(56, 189, 248, 0.9)' : 'rgba(245, 158, 11, 0.9)';

        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 8;

        // Draw 3D Chevron Arrowhead pointing outward from player icon
        ctx.fillStyle = arrowColor;
        ctx.beginPath();
        ctx.moveTo(arrowDist + 11, 0);         // Tip
        ctx.lineTo(arrowDist, -7);             // Upper wing
        ctx.lineTo(arrowDist + 3.5, 0);        // Inner notch
        ctx.lineTo(arrowDist, 7);              // Lower wing
        ctx.closePath();
        ctx.fill();

        // White accent stroke for crisp contrast
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.3;
        ctx.stroke();

        ctx.restore();
      }

      ctx.restore();
    }
  }

  private renderExplosions(
    ctx: CanvasRenderingContext2D,
    state: BombArenaState,
    ox: number,
    oy: number,
    ts: number
  ) {
    for (const exp of state.explosions) {
      const alpha = Math.max(0, exp.timer / exp.maxTimer);

      ctx.save();
      ctx.globalAlpha = alpha;

      for (const cell of exp.cells) {
        const cx = ox + (cell.col + 0.5) * ts;
        const cy = oy + (cell.row + 0.5) * ts;
        const blastRadius = (ts * 0.55) * (1.1 - 0.2 * (exp.timer / exp.maxTimer));

        // Core white-hot blast
        const blastGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, blastRadius);
        blastGrad.addColorStop(0, '#ffffff');
        blastGrad.addColorStop(0.3, '#fde047');
        blastGrad.addColorStop(0.65, '#f97316');
        blastGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');

        ctx.fillStyle = blastGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, blastRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  private renderParticles(
    ctx: CanvasRenderingContext2D,
    dt: number,
    ox: number,
    oy: number,
    ts: number
  ) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha = 1.0 - p.life / p.maxLife;

      if (p.life >= p.maxLife || p.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      const px = ox + p.x * ts;
      const py = oy + p.y * ts;
      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
