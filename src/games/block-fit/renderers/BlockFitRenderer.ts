// High-DPI Canvas & 3D Glossy Polyomino Renderer for Block Fit Duel
import { INVALID_BLOCK_COLOR, VALID_SNAP_COLOR } from '../block-fit-types';
import type { BlockColor, PolyominoPiece, TrayDefinition, PlayerBoardState } from '../block-fit-types';

export interface DragGhostState {
  piece: PolyominoPiece;
  targetR: number;
  targetC: number;
  isValid: boolean;
}

export class BlockFitRenderer {
  /**
   * Draw a single 3D glossy beveled polyomino block
   */
  public static drawBlock(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    color: BlockColor,
    options?: {
      alpha?: number;
      connectedNeighbors?: { top?: boolean; bottom?: boolean; left?: boolean; right?: boolean };
      isGhost?: boolean;
    }
  ) {
    const alpha = options?.alpha ?? 1.0;
    const isGhost = options?.isGhost ?? false;
    const neighbors = options?.connectedNeighbors || {};
    const bevel = Math.max(2, Math.round(size * 0.12));
    const pad = 1.0; // slight gap if not connected

    ctx.save();
    ctx.globalAlpha = alpha;

    const bx = x + (neighbors.left ? 0 : pad);
    const by = y + (neighbors.top ? 0 : pad);
    const bw = size - (neighbors.left ? 0 : pad) - (neighbors.right ? 0 : pad);
    const bh = size - (neighbors.top ? 0 : pad) - (neighbors.bottom ? 0 : pad);

    // 1. Base Block Body with vertical gradient
    const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
    grad.addColorStop(0, color.light);
    grad.addColorStop(0.35, color.primary);
    grad.addColorStop(1, color.dark);
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, bw, bh);

    if (!isGhost) {
      // 2. Beveled 3D Edges
      // Top Edge (Highlight)
      if (!neighbors.top) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + bw, by);
        ctx.lineTo(bx + bw - bevel, by + bevel);
        ctx.lineTo(bx + bevel, by + bevel);
        ctx.closePath();
        ctx.fill();
      }

      // Left Edge (Highlight)
      if (!neighbors.left) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + bevel, by + bevel);
        ctx.lineTo(bx + bevel, by + bh - bevel);
        ctx.lineTo(bx, by + bh);
        ctx.closePath();
        ctx.fill();
      }

      // Bottom Edge (Deep Shadow)
      if (!neighbors.bottom) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.moveTo(bx, by + bh);
        ctx.lineTo(bx + bevel, by + bh - bevel);
        ctx.lineTo(bx + bw - bevel, by + bh - bevel);
        ctx.lineTo(bx + bw, by + bh);
        ctx.closePath();
        ctx.fill();
      }

      // Right Edge (Shadow)
      if (!neighbors.right) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.beginPath();
        ctx.moveTo(bx + bw, by);
        ctx.lineTo(bx + bw, by + bh);
        ctx.lineTo(bx + bw - bevel, by + bh - bevel);
        ctx.lineTo(bx + bw - bevel, by + bevel);
        ctx.closePath();
        ctx.fill();
      }

      // 3. Top Glossy Specular Sheen (Arc / Reflection)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(bx + bevel, by + bevel, bw - bevel * 2, Math.max(1, Math.round(bh * 0.2)));

      // 4. Subtle Outer Border
      ctx.strokeStyle = color.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    } else {
      // Ghost block outer pulse outline
      ctx.strokeStyle = color.border;
      ctx.lineWidth = 2;
      ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
    }

    ctx.restore();
  }

  /**
   * Render the main tray canvas
   */
  public static renderTray(
    canvas: HTMLCanvasElement,
    tray: TrayDefinition,
    board: PlayerBoardState,
    pieces: PolyominoPiece[],
    isDark: boolean,
    ghost?: DragGhostState | null
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.width;
    const height = rect.height || canvas.height;

    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const layout = this.getTrayLayout(canvas, tray);
    const cellSize = layout.cellSize;
    const originX = layout.originX;
    const originY = layout.originY;

    // 1. Draw Empty Slot Wells for all active tray cells
    for (let r = 0; r < tray.rows; r++) {
      for (let c = 0; c < tray.cols; c++) {
        if (!tray.mask[r][c]) continue;

        const x = originX + c * cellSize;
        const y = originY + r * cellSize;

        // Recessed slot styling
        ctx.save();
        ctx.fillStyle = isDark ? '#181b26' : '#e2e8f0';
        ctx.beginPath();
        ctx.roundRect(x + 1.5, y + 1.5, cellSize - 3, cellSize - 3, 5);
        ctx.fill();

        // Inner shadow
        ctx.strokeStyle = isDark ? '#0f121d' : '#cbd5e1';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Subtle center alignment dot
        ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
        ctx.beginPath();
        ctx.arc(x + cellSize / 2, y + cellSize / 2, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // 2. Build Occupancy Grid for Placed Pieces
    // cellOccupant: 'r,c' -> { piece, localR, localC }
    const cellOccupant = new Map<string, { piece: PolyominoPiece; localR: number; localC: number }>();
    for (const [pieceId, placed] of board.placedPieces) {
      const piece = pieces.find(p => p.id === pieceId);
      if (!piece) continue;
      for (const cell of piece.cells) {
        const tr = placed.trayR + cell.r;
        const tc = placed.trayC + cell.c;
        cellOccupant.set(`${tr},${tc}`, { piece, localR: cell.r, localC: cell.c });
      }
    }

    // 3. Render Placed Pieces with Connected Neighbor Bevels
    for (let r = 0; r < tray.rows; r++) {
      for (let c = 0; c < tray.cols; c++) {
        const occ = cellOccupant.get(`${r},${c}`);
        if (!occ) continue;

        const x = originX + c * cellSize;
        const y = originY + r * cellSize;

        // Check if adjacent cells belong to the same piece for seamless fusion
        const topOcc = cellOccupant.get(`${r - 1},${c}`);
        const botOcc = cellOccupant.get(`${r + 1},${c}`);
        const leftOcc = cellOccupant.get(`${r},${c - 1}`);
        const rightOcc = cellOccupant.get(`${r},${c + 1}`);

        const neighbors = {
          top: topOcc?.piece.id === occ.piece.id,
          bottom: botOcc?.piece.id === occ.piece.id,
          left: leftOcc?.piece.id === occ.piece.id,
          right: rightOcc?.piece.id === occ.piece.id
        };

        this.drawBlock(ctx, x, y, cellSize, occ.piece.color, {
          connectedNeighbors: neighbors
        });
      }
    }

    // 4. Render Ghost Snap Preview if a piece is being dragged over the tray
    if (ghost) {
      const ghostColor: BlockColor = ghost.isValid
        ? VALID_SNAP_COLOR
        : INVALID_BLOCK_COLOR;

      for (const cell of ghost.piece.cells) {
        const gr = ghost.targetR + cell.r;
        const gc = ghost.targetC + cell.c;

        if (gr >= 0 && gr < tray.rows && gc >= 0 && gc < tray.cols) {
          const gx = originX + gc * cellSize;
          const gy = originY + gr * cellSize;

          const neighbors = {
            top: ghost.piece.cells.some(c => c.r === cell.r - 1 && c.c === cell.c),
            bottom: ghost.piece.cells.some(c => c.r === cell.r + 1 && c.c === cell.c),
            left: ghost.piece.cells.some(c => c.r === cell.r && c.c === cell.c - 1),
            right: ghost.piece.cells.some(c => c.r === cell.r && c.c === cell.c + 1)
          };

          this.drawBlock(ctx, gx, gy, cellSize, ghostColor, {
            alpha: 0.85,
            connectedNeighbors: neighbors,
            isGhost: true
          });

          // Extra crisp red border if invalid
          if (!ghost.isValid) {
            ctx.save();
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.strokeRect(gx + 1, gy + 1, cellSize - 2, cellSize - 2);
            ctx.restore();
          }
        }
      }
    }

    ctx.restore();
  }

  /**
   * Render Opponent Mini-Tray Preview (Real-time 1v1 spectator)
   */
  public static renderMiniTray(
    canvas: HTMLCanvasElement,
    tray: TrayDefinition,
    board: PlayerBoardState,
    pieces: PolyominoPiece[],
    isDark: boolean
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.width;
    const height = rect.height || canvas.height;

    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const padding = 6;
    const cellSize = Math.min((width - padding * 2) / tray.cols, (height - padding * 2) / tray.rows);
    const originX = Math.round((width - cellSize * tray.cols) / 2);
    const originY = Math.round((height - cellSize * tray.rows) / 2);

    // 1. Draw Silhouette Base
    for (let r = 0; r < tray.rows; r++) {
      for (let c = 0; c < tray.cols; c++) {
        if (!tray.mask[r][c]) continue;
        const x = originX + c * cellSize;
        const y = originY + r * cellSize;
        ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
        ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
      }
    }

    // 2. Draw Opponent Placed Pieces
    for (const [pieceId, placed] of board.placedPieces) {
      const piece = pieces.find(p => p.id === pieceId);
      if (!piece) continue;

      for (const cell of piece.cells) {
        const tr = placed.trayR + cell.r;
        const tc = placed.trayC + cell.c;
        const x = originX + tc * cellSize;
        const y = originY + tr * cellSize;

        ctx.fillStyle = piece.color.primary;
        ctx.fillRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
      }
    }

    ctx.restore();
  }

  /**
   * Render a static standalone polyomino piece onto a small canvas for the dock
   */
  public static renderPieceToCanvas(
    canvas: HTMLCanvasElement,
    piece: PolyominoPiece,
    cellSize: number = 32
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = piece.width * cellSize;
    const h = piece.height * cellSize;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    for (const cell of piece.cells) {
      const x = cell.c * cellSize;
      const y = cell.r * cellSize;

      const neighbors = {
        top: piece.cells.some(c => c.r === cell.r - 1 && c.c === cell.c),
        bottom: piece.cells.some(c => c.r === cell.r + 1 && c.c === cell.c),
        left: piece.cells.some(c => c.r === cell.r && c.c === cell.c - 1),
        right: piece.cells.some(c => c.r === cell.r && c.c === cell.c + 1)
      };

      this.drawBlock(ctx, x, y, cellSize, piece.color, {
        connectedNeighbors: neighbors
      });
    }

    ctx.restore();
  }

  /**
   * Calculate cell layout, origin, and bounds of the tray canvas
   */
  public static getTrayLayout(
    canvas: HTMLCanvasElement,
    tray: TrayDefinition
  ) {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.width;
    const height = rect.height || canvas.height;
    const padding = 16;
    const availW = Math.max(10, width - padding * 2);
    const availH = Math.max(10, height - padding * 2);
    const cellSize = Math.min(availW / tray.cols, availH / tray.rows);

    const originX = Math.round((width - cellSize * tray.cols) / 2);
    const originY = Math.round((height - cellSize * tray.rows) / 2);

    return {
      rect,
      width,
      height,
      cellSize,
      originX,
      originY
    };
  }

  /**
   * Render the floating piece directly onto the drag canvas
   * If isValid: vibrant jewel color
   * If !isValid: grayish body with distinct red border
   */
  public static renderFloatingPiece(
    canvas: HTMLCanvasElement,
    piece: PolyominoPiece,
    cellSize: number,
    isValid: boolean
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = piece.width * cellSize;
    const h = piece.height * cellSize;

    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const color = isValid ? piece.color : INVALID_BLOCK_COLOR;

    for (const cell of piece.cells) {
      const x = cell.c * cellSize;
      const y = cell.r * cellSize;

      const neighbors = {
        top: piece.cells.some(c => c.r === cell.r - 1 && c.c === cell.c),
        bottom: piece.cells.some(c => c.r === cell.r + 1 && c.c === cell.c),
        left: piece.cells.some(c => c.r === cell.r && c.c === cell.c - 1),
        right: piece.cells.some(c => c.r === cell.r && c.c === cell.c + 1)
      };

      this.drawBlock(ctx, x, y, cellSize, color, {
        connectedNeighbors: neighbors,
        isGhost: false,
        alpha: isValid ? 1.0 : 0.92
      });

      // Distinct red border if invalid
      if (!isValid) {
        ctx.save();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        ctx.restore();
      } else {
        // Crisp subtle green edge to highlight valid placement
        ctx.save();
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  /**
   * Helper: Convert client coordinates (clientX, clientY) to tray grid cell (r, c)
   */
  public static clientToTrayCell(
    canvas: HTMLCanvasElement,
    tray: TrayDefinition,
    clientX: number,
    clientY: number
  ): { r: number; c: number } | null {
    const layout = this.getTrayLayout(canvas, tray);
    const x = clientX - layout.rect.left;
    const y = clientY - layout.rect.top;

    if (x < 0 || x > layout.rect.width || y < 0 || y > layout.rect.height) {
      return null;
    }

    const c = Math.floor((x - layout.originX) / layout.cellSize);
    const r = Math.floor((y - layout.originY) / layout.cellSize);

    return { r, c };
  }
}
