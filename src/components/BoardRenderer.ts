import {
  COLS,
  ROWS,
  BUFFER_ROWS,
  TOTAL_ROWS,
  TETROMINOES
} from '../engine/constants';
import { TetrisEngine } from '../engine/tetris-engine';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  life: number;
}

interface FloatingText {
  text: string;
  x: number;
  y: number;
  color: string;
  alpha: number;
  vy: number;
}

export class BoardRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private blockSize: number = 28;
  public theme: 'dark' | 'light' = 'dark';
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];
  public shakeOffset: { x: number; y: number } = { x: 0, y: 0 };
  private shakeTimer: number = 0;

  constructor(canvas: HTMLCanvasElement, blockSize: number = 28, theme: 'dark' | 'light' = 'dark') {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.blockSize = blockSize;
    this.theme = theme;
    this.resize(blockSize);
  }

  public setTheme(theme: 'dark' | 'light') {
    this.theme = theme;
  }

  public resize(blockSize: number) {
    this.blockSize = blockSize;
    // Extra 14px on left for incoming garbage meter
    const width = COLS * blockSize + 16;
    const height = ROWS * blockSize;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  public triggerShake(intensity: number = 6) {
    this.shakeTimer = 8;
    this.shakeOffset = {
      x: (Math.random() - 0.5) * intensity,
      y: (Math.random() - 0.5) * intensity
    };
  }

  public addLineClearParticles(row: number, color: string) {
    const screenY = (row - BUFFER_ROWS) * this.blockSize + this.blockSize / 2;
    for (let c = 0; c < COLS; c++) {
      const screenX = 16 + c * this.blockSize + this.blockSize / 2;
      for (let i = 0; i < 4; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 2;
        this.particles.push({
          x: screenX,
          y: screenY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color,
          size: Math.random() * 4 + 2,
          alpha: 1,
          life: 25
        });
      }
    }
  }

  public addFloatingText(text: string, color: string = '#00f0ff') {
    this.floatingTexts.push({
      text,
      x: this.canvas.width / 2,
      y: this.canvas.height * 0.45,
      color,
      alpha: 1,
      vy: -1.2
    });
  }

  public render(engine: TetrisEngine, isOpponent: boolean = false) {
    const ctx = this.ctx;
    const bs = this.blockSize;
    const meterWidth = 12;
    const boardOffsetX = 16;

    // Handle screen shake
    if (this.shakeTimer > 0) {
      this.shakeTimer--;
      this.shakeOffset.x = (Math.random() - 0.5) * 6;
      this.shakeOffset.y = (Math.random() - 0.5) * 6;
    } else {
      this.shakeOffset = { x: 0, y: 0 };
    }

    ctx.save();
    ctx.translate(this.shakeOffset.x, this.shakeOffset.y);

    const isDark = this.theme === 'dark';

    // Clear background with theme-aware clean styling
    if (isDark) {
      ctx.fillStyle = isOpponent ? '#0a0d16' : '#111420';
    } else {
      ctx.fillStyle = isOpponent ? '#f1f5f9' : '#ffffff';
    }
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Render Incoming Garbage Warning Meter on the left
    this.renderGarbageMeter(engine.pendingGarbage, meterWidth, isDark);

    // Render Grid Lines
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)';
    ctx.lineWidth = 1;
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(boardOffsetX, r * bs);
      ctx.lineTo(boardOffsetX + COLS * bs, r * bs);
      ctx.stroke();
    }
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(boardOffsetX + c * bs, 0);
      ctx.lineTo(boardOffsetX + c * bs, ROWS * bs);
      ctx.stroke();
    }

    // Render Locked Blocks
    for (let r = BUFFER_ROWS; r < TOTAL_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cellColor = engine.grid[r][c];
        if (cellColor) {
          const screenY = (r - BUFFER_ROWS) * bs;
          const screenX = boardOffsetX + c * bs;
          this.drawBlock(ctx, screenX, screenY, bs, cellColor);
        }
      }
    }

    // If active player (not spectator / game over), render Ghost Piece & Current Piece
    if (engine.currentPiece && !engine.isGameOver) {
      const ghostY = engine.getGhostY();
      const shape = TETROMINOES[engine.currentPiece.type].rotations[engine.currentPiece.rotation];
      const pieceColor = TETROMINOES[engine.currentPiece.type].color;

      // Draw Ghost Piece (semi-transparent outline)
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c] !== 0) {
            const boardY = ghostY + r;
            const boardX = engine.currentPiece.x + c;
            if (boardY >= BUFFER_ROWS && boardY < TOTAL_ROWS) {
              const sx = boardOffsetX + boardX * bs;
              const sy = (boardY - BUFFER_ROWS) * bs;
              this.drawGhostBlock(ctx, sx, sy, bs, pieceColor);
            }
          }
        }
      }

      // Draw Active Falling Piece
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c] !== 0) {
            const boardY = engine.currentPiece.y + r;
            const boardX = engine.currentPiece.x + c;
            if (boardY >= BUFFER_ROWS && boardY < TOTAL_ROWS) {
              const sx = boardOffsetX + boardX * bs;
              const sy = (boardY - BUFFER_ROWS) * bs;
              this.drawBlock(ctx, sx, sy, bs, pieceColor, true);
            }
          }
        }
      }
    }

    // Render Particles
    this.updateAndRenderParticles(ctx);

    // Render Floating Text announcements ("TETRIS!", "COMBO x3", etc.)
    this.updateAndRenderFloatingTexts(ctx);

    ctx.restore();
  }

  // Draw incoming garbage bar
  private renderGarbageMeter(pendingLines: number, meterWidth: number, isDark: boolean = true) {
    const ctx = this.ctx;
    const bs = this.blockSize;
    const totalH = ROWS * bs;

    // Background track
    ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(1, 0, meterWidth, totalH);

    if (pendingLines <= 0) return;

    // Meter height based on pending lines (each line is bs pixels)
    const meterHeight = Math.min(pendingLines * bs, totalH);
    const startY = totalH - meterHeight;

    // Color: Yellow if <= 3, Red if > 3
    const isCritical = pendingLines > 3;
    ctx.fillStyle = isCritical ? '#ef4444' : '#eab308';
    ctx.shadowColor = isCritical ? 'rgba(239, 68, 68, 0.4)' : 'rgba(234, 179, 8, 0.4)';
    ctx.shadowBlur = 6;
    ctx.fillRect(1, startY, meterWidth, meterHeight);
    ctx.shadowBlur = 0;

    // Segment divider notches
    ctx.fillStyle = isDark ? '#111420' : '#ffffff';
    for (let i = 1; i < pendingLines && i < ROWS; i++) {
      ctx.fillRect(1, totalH - i * bs - 1, meterWidth, 2);
    }
  }

  // Draw arcade block with bevel and neon highlight
  private drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, isActive: boolean = false) {
    const pad = 1;
    const innerSize = size - pad * 2;

    // Base fill
    ctx.fillStyle = color;
    ctx.fillRect(x + pad, y + pad, innerSize, innerSize);

    // Top & Left highlight (light)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.moveTo(x + pad, y + pad);
    ctx.lineTo(x + pad + innerSize, y + pad);
    ctx.lineTo(x + pad + innerSize - 3, y + pad + 3);
    ctx.lineTo(x + pad + 3, y + pad + 3);
    ctx.lineTo(x + pad + 3, y + pad + innerSize - 3);
    ctx.lineTo(x + pad, y + pad + innerSize);
    ctx.closePath();
    ctx.fill();

    // Bottom & Right shadow (dark)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.moveTo(x + pad + innerSize, y + pad);
    ctx.lineTo(x + pad + innerSize, y + pad + innerSize);
    ctx.lineTo(x + pad, y + pad + innerSize);
    ctx.lineTo(x + pad + 3, y + pad + innerSize - 3);
    ctx.lineTo(x + pad + innerSize - 3, y + pad + innerSize - 3);
    ctx.lineTo(x + pad + innerSize - 3, y + pad + 3);
    ctx.closePath();
    ctx.fill();

    // Subtle center glow for active piece
    if (isActive) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + pad + 2, y + pad + 2, innerSize - 4, innerSize - 4);
    }
  }

  private drawGhostBlock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    const pad = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(x + pad + 1, y + pad + 1, size - pad * 2 - 2, size - pad * 2 - 2);
    ctx.strokeRect(x + pad + 1, y + pad + 1, size - pad * 2 - 2, size - pad * 2 - 2);
  }

  private updateAndRenderParticles(ctx: CanvasRenderingContext2D) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15; // Gravity
      p.life--;
      p.alpha = Math.max(0, p.life / 25);

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.fillRect(p.x, p.y, p.size, p.size);
      ctx.restore();
    }
  }

  private updateAndRenderFloatingTexts(ctx: CanvasRenderingContext2D) {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy;
      ft.alpha -= 0.02;

      if (ft.alpha <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = ft.alpha;
      ctx.font = 'bold 20px "Orbitron", "Chakra Petch", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = ft.color;
      ctx.shadowColor = ft.color;
      ctx.shadowBlur = 10;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }
}
