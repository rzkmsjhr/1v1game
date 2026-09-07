import { TETROMINOES, type TetrominoType } from '../engine/constants';

export class PiecePreview {
  public static drawMiniPiece(canvas: HTMLCanvasElement, type: TetrominoType | null, blockSize: number = 18) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!type) return;

    const shape = TETROMINOES[type].rotations[0];
    const color = TETROMINOES[type].color;

    // Calculate piece dimensions to center it in canvas
    let minR = shape.length, maxR = 0, minC = shape[0].length, maxC = 0;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] !== 0) {
          minR = Math.min(minR, r);
          maxR = Math.max(maxR, r);
          minC = Math.min(minC, c);
          maxC = Math.max(maxC, c);
        }
      }
    }

    const pWidth = (maxC - minC + 1) * blockSize;
    const pHeight = (maxR - minR + 1) * blockSize;
    const startX = Math.round((canvas.width - pWidth) / 2);
    const startY = Math.round((canvas.height - pHeight) / 2);

    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        if (shape[r][c] !== 0) {
          const x = startX + (c - minC) * blockSize;
          const y = startY + (r - minR) * blockSize;
          const pad = 1;
          const innerSize = blockSize - pad * 2;

          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 4;
          ctx.fillRect(x + pad, y + pad, innerSize, innerSize);
          ctx.shadowBlur = 0;

          // Highlight
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.fillRect(x + pad, y + pad, innerSize, 2);
          ctx.fillRect(x + pad, y + pad, 2, innerSize);
        }
      }
    }
  }
}
