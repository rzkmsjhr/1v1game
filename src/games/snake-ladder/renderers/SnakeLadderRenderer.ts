import { BoardConfig, Ladder, Snake } from '../snake-ladder-types';
import { getTileCoord } from '../snake-ladder-engine';
import { AppTheme } from '../../types';

export interface SnakeBezier {
  p0: { x: number; y: number };
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  p3: { x: number; y: number };
}

export function getSnakeBezier(snake: Snake): SnakeBezier {
  const head = getTileCoord(snake.from);
  const tail = getTileCoord(snake.to);

  const vx = tail.x - head.x;
  const vy = tail.y - head.y;
  const len = Math.sqrt(vx * vx + vy * vy);
  if (len === 0) {
    return {
      p0: { x: head.x, y: head.y },
      p1: { x: head.x, y: head.y },
      p2: { x: tail.x, y: tail.y },
      p3: { x: tail.x, y: tail.y }
    };
  }

  const ux = vx / len;
  const uy = vy / len;
  const nx = -uy;
  const ny = ux;

  // Organic S-curve wave displacement matching original snake styling
  const sign = snake.id % 2 === 0 ? 1 : -1;
  const waveAmp = Math.min(48, Math.max(26, len * 0.14)) * sign;

  const cp1x = head.x + vx * 0.32 + nx * waveAmp;
  const cp1y = head.y + vy * 0.32 + ny * waveAmp;
  const cp2x = head.x + vx * 0.68 - nx * waveAmp;
  const cp2y = head.y + vy * 0.68 - ny * waveAmp;

  return {
    p0: { x: head.x, y: head.y },
    p1: { x: cp1x, y: cp1y },
    p2: { x: cp2x, y: cp2y },
    p3: { x: tail.x, y: tail.y }
  };
}

export function evaluateCubicBezier(b: SnakeBezier, t: number): { x: number; y: number } {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  const x = mt3 * b.p0.x + 3 * mt2 * t * b.p1.x + 3 * mt * t2 * b.p2.x + t3 * b.p3.x;
  const y = mt3 * b.p0.y + 3 * mt2 * t * b.p1.y + 3 * mt * t2 * b.p2.y + t3 * b.p3.y;

  return { x, y };
}

export function getTokenCoord(
  playerId: 'player' | 'opponent',
  playerPos: number,
  opponentPos: number
): { x: number; y: number } {
  const pCoord = getTileCoord(playerPos);
  const oCoord = getTileCoord(opponentPos);
  const sameTile = playerPos === opponentPos;

  if (playerId === 'player') {
    return {
      x: sameTile ? pCoord.x - 17 : pCoord.x,
      y: sameTile ? pCoord.y - 12 : pCoord.y
    };
  } else {
    return {
      x: sameTile ? oCoord.x + 17 : oCoord.x,
      y: sameTile ? oCoord.y + 12 : oCoord.y
    };
  }
}

export class SnakeLadderRenderer {
  public renderSVG(
    board: BoardConfig,
    playerPos: number,
    opponentPos: number,
    currentTurn: 'player' | 'opponent',
    theme: AppTheme,
    highlightTile?: number
  ): string {
    const isDark = theme === 'dark';

    // 1. Defs: Gradients, Patterns, Shadows
    const defs = `
      <defs>
        <!-- Board Ambient Filter -->
        <filter id="sl-drop-shadow" x="-10%" y="-10%" width="130%" height="130%">
          <feDropShadow dx="2" dy="4" stdDeviation="4" flood-opacity="0.35" />
        </filter>
        <filter id="token-glow-player" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#3b82f6" flood-opacity="0.85">
            <animate attributeName="stdDeviation" values="6;13;6" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="flood-opacity" values="0.75;1;0.75" dur="2.4s" repeatCount="indefinite" />
          </feDropShadow>
        </filter>
        <filter id="token-glow-opp" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="0" stdDeviation="6" flood-color="#f43f5e" flood-opacity="0.85">
            <animate attributeName="stdDeviation" values="6;13;6" dur="2.4s" begin="0.4s" repeatCount="indefinite" />
            <animate attributeName="flood-opacity" values="0.75;1;0.75" dur="2.4s" begin="0.4s" repeatCount="indefinite" />
          </feDropShadow>
        </filter>

        <!-- Player Token Sphere Gradient -->
        <radialGradient id="grad-token-player" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#93c5fd" />
          <stop offset="45%" stop-color="#2563eb" />
          <stop offset="100%" stop-color="#1e3a8a" />
        </radialGradient>

        <!-- Opponent Token Sphere Gradient -->
        <radialGradient id="grad-token-opp" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#fda4af" />
          <stop offset="45%" stop-color="#e11d48" />
          <stop offset="100%" stop-color="#881337" />
        </radialGradient>

        <!-- Ladder Rail Gradient -->
        <linearGradient id="grad-ladder-rail" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f59e0b" />
          <stop offset="50%" stop-color="#d97706" />
          <stop offset="100%" stop-color="#78350f" />
        </linearGradient>

        <!-- Golden Trophy Tile 100 Gradient -->
        <linearGradient id="grad-tile-100" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fef08a" />
          <stop offset="50%" stop-color="#eab308" />
          <stop offset="100%" stop-color="#ca8a04" />
        </linearGradient>

        <!-- Snake Gradients (Multiple vibrant types) -->
        <linearGradient id="grad-snake-green" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#10b981" />
          <stop offset="50%" stop-color="#047857" />
          <stop offset="100%" stop-color="#064e3b" />
        </linearGradient>
        <linearGradient id="grad-snake-purple" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#c084fc" />
          <stop offset="50%" stop-color="#9333ea" />
          <stop offset="100%" stop-color="#581c87" />
        </linearGradient>
        <linearGradient id="grad-snake-coral" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fb7185" />
          <stop offset="50%" stop-color="#e11d48" />
          <stop offset="100%" stop-color="#881337" />
        </linearGradient>
      </defs>
    `;

    // 2. Render 100 Tiles
    const tilesSvg = this.renderTiles(isDark, highlightTile);

    // 3. Render Ladders
    const laddersSvg = board.ladders.map(l => this.renderLadder(l)).join('\n');

    // 4. Render Snakes
    const snakesSvg = board.snakes.map(s => this.renderSnake(s)).join('\n');

    // 5. Render Tokens
    const tokensSvg = this.renderTokens(playerPos, opponentPos, currentTurn);

    return `
      <svg viewBox="0 0 1000 1000" class="w-full h-full select-none" style="display: block; overflow: visible;">
        ${defs}
        <!-- Board Background Frame -->
        <rect x="0" y="0" width="1000" height="1000" rx="20" fill="${isDark ? '#0b0f19' : '#ffffff'}" stroke="${isDark ? '#334155' : '#cbd5e1'}" stroke-width="4" />
        
        <!-- 10x10 Tiles -->
        <g id="sl-tiles">${tilesSvg}</g>

        <!-- Ladders Layer (Behind snakes) -->
        <g id="sl-ladders" filter="url(#sl-drop-shadow)">${laddersSvg}</g>

        <!-- Snakes Layer -->
        <g id="sl-snakes" filter="url(#sl-drop-shadow)">${snakesSvg}</g>

        <!-- Tokens Layer (On Top) -->
        <g id="sl-tokens">${tokensSvg}</g>
      </svg>
    `;
  }

  private renderTiles(isDark: boolean, highlightTile?: number): string {
    const tiles: string[] = [];

    for (let t = 1; t <= 100; t++) {
      const coord = getTileCoord(t);
      const row = coord.row;
      const col = coord.col;
      const x = col * 100;
      const y = (9 - row) * 100;

      const isEven = (row + col) % 2 === 0;
      const is100 = t === 100;
      const is1 = t === 1;
      const isHighlighted = highlightTile === t;

      let fill = '';
      if (is100) {
        fill = 'url(#grad-tile-100)';
      } else if (isHighlighted) {
        fill = isDark ? '#1e3a8a' : '#bfdbfe';
      } else if (isDark) {
        fill = isEven ? '#1e293b' : '#0f172a';
      } else {
        fill = isEven ? '#f8fafc' : '#f1f5f9';
      }

      const stroke = is100 ? '#ca8a04' : (isDark ? '#334155' : '#e2e8f0');
      const textColor = is100 ? '#713f12' : (isDark ? '#94a3b8' : '#64748b');

      let tileMarkup = `
        <g id="tile-${t}" class="transition-colors duration-200">
          <rect x="${x}" y="${y}" width="100" height="100" fill="${fill}" stroke="${stroke}" stroke-width="1.5" />
          <text x="${x + 10}" y="${y + 24}" font-size="17" font-weight="800" font-family="'Plus Jakarta Sans', system-ui, sans-serif" fill="${textColor}">${t}</text>
      `;

      if (is1) {
        tileMarkup += `
          <!-- Start Indicator Badge -->
          <rect x="${x + 8}" y="${y + 68}" width="54" height="24" rx="6" fill="#16a34a" />
          <text x="${x + 35}" y="${y + 83}" font-size="11" font-weight="900" font-family="'Plus Jakarta Sans', system-ui, sans-serif" text-anchor="middle" fill="#ffffff">START</text>
        `;
      } else if (is100) {
        tileMarkup += `
          <!-- Golden Trophy/Crown Icon on 100 -->
          <path d="M ${x + 50} ${y + 40} l 14 30 l -28 0 Z" fill="#b45309" opacity="0.3" />
          <text x="${x + 50}" y="${y + 64}" font-size="28" text-anchor="middle" dominant-baseline="central">🏆</text>
          <text x="${x + 50}" y="${y + 88}" font-size="12" font-weight="900" font-family="'Plus Jakarta Sans', system-ui, sans-serif" text-anchor="middle" fill="#713f12">WINNER!</text>
        `;
      }

      tileMarkup += `</g>`;
      tiles.push(tileMarkup);
    }

    return tiles.join('\n');
  }

  private renderLadder(ladder: Ladder): string {
    const c1 = getTileCoord(ladder.from);
    const c2 = getTileCoord(ladder.to);

    const vx = c2.x - c1.x;
    const vy = c2.y - c1.y;
    const len = Math.sqrt(vx * vx + vy * vy);
    if (len === 0) return '';

    const ux = vx / len;
    const uy = vy / len;
    const nx = -uy;
    const ny = ux;

    const halfW = 12; // Ladder rail offset

    // Rail points
    const lx1 = c1.x - nx * halfW;
    const ly1 = c1.y - ny * halfW;
    const lx2 = c2.x - nx * halfW;
    const ly2 = c2.y - ny * halfW;

    const rx1 = c1.x + nx * halfW;
    const ry1 = c1.y + ny * halfW;
    const rx2 = c2.x + nx * halfW;
    const ry2 = c2.y + ny * halfW;

    // Rungs along the ladder
    const rungSpacing = 22;
    const numRungs = Math.floor(len / rungSpacing);
    const rungs: string[] = [];

    for (let i = 1; i <= numRungs; i++) {
      const t = (i * rungSpacing) / len;
      if (t >= 0.96) break;
      const rx = c1.x + vx * t;
      const ry = c1.y + vy * t;

      const rungX1 = rx - nx * (halfW - 0.5);
      const rungY1 = ry - ny * (halfW - 0.5);
      const rungX2 = rx + nx * (halfW - 0.5);
      const rungY2 = ry + ny * (halfW - 0.5);

      rungs.push(`
        <line x1="${rungX1}" y1="${rungY1}" x2="${rungX2}" y2="${rungY2}" stroke="#d97706" stroke-width="4.5" stroke-linecap="round" />
        <line x1="${rungX1}" y1="${rungY1}" x2="${rungX2}" y2="${rungY2}" stroke="#fde68a" stroke-width="1.8" stroke-linecap="round" />
      `);
    }

    return `
      <g id="ladder-${ladder.id}">
        <!-- Shadow Rails -->
        <line x1="${lx1}" y1="${ly1}" x2="${lx2}" y2="${ly2}" stroke="rgba(0,0,0,0.3)" stroke-width="7" stroke-linecap="round" />
        <line x1="${rx1}" y1="${ry1}" x2="${rx2}" y2="${ry2}" stroke="rgba(0,0,0,0.3)" stroke-width="7" stroke-linecap="round" />

        <!-- Left & Right Rails -->
        <line x1="${lx1}" y1="${ly1}" x2="${lx2}" y2="${ly2}" stroke="url(#grad-ladder-rail)" stroke-width="5.5" stroke-linecap="round" />
        <line x1="${rx1}" y1="${ry1}" x2="${rx2}" y2="${ry2}" stroke="url(#grad-ladder-rail)" stroke-width="5.5" stroke-linecap="round" />

        <!-- Highlight Rail Gleam -->
        <line x1="${lx1}" y1="${ly1}" x2="${lx2}" y2="${ly2}" stroke="#fde68a" stroke-width="1.6" stroke-linecap="round" opacity="0.65" />
        <line x1="${rx1}" y1="${ry1}" x2="${rx2}" y2="${ry2}" stroke="#fde68a" stroke-width="1.6" stroke-linecap="round" opacity="0.65" />

        <!-- Rungs -->
        ${rungs.join('\n')}

        <!-- Bottom Base Indicator Badge (+X Climb) -->
        <circle cx="${c1.x}" cy="${c1.y + 28}" r="13" fill="#16a34a" stroke="#ffffff" stroke-width="2" />
        <text x="${c1.x}" y="${c1.y + 32}" font-size="10" font-weight="900" font-family="'Plus Jakarta Sans', system-ui, sans-serif" text-anchor="middle" fill="#ffffff">+${ladder.length}</text>
      </g>
    `;
  }

  private renderSnake(snake: Snake): string {
    const b = getSnakeBezier(snake);
    const pathData = `M ${b.p0.x} ${b.p0.y} C ${b.p1.x} ${b.p1.y}, ${b.p2.x} ${b.p2.y}, ${b.p3.x} ${b.p3.y}`;

    // Select color palette
    const colors = [
      { base: 'url(#grad-snake-green)', stroke: '#065f46', pattern: '#fef08a' },
      { base: 'url(#grad-snake-coral)', stroke: '#9f1239', pattern: '#fef08a' },
      { base: 'url(#grad-snake-purple)', stroke: '#581c87', pattern: '#fed7aa' }
    ];
    const palette = colors[snake.id % colors.length];

    // Head angle calculation (tangent at start of Bézier curve: cp1 - head)
    const angleHead = Math.atan2(b.p1.y - b.p0.y, b.p1.x - b.p0.x);

    return `
      <g id="snake-${snake.id}">
        <!-- Snake Shadow -->
        <path d="${pathData}" fill="none" stroke="rgba(0,0,0,0.32)" stroke-width="17" stroke-linecap="round" />

        <!-- Outer Skin -->
        <path d="${pathData}" fill="none" stroke="${palette.stroke}" stroke-width="14" stroke-linecap="round" />

        <!-- Body Gradient -->
        <path d="${pathData}" fill="none" stroke="${palette.base}" stroke-width="10.5" stroke-linecap="round" />

        <!-- Scales Pattern Stripe -->
        <path d="${pathData}" fill="none" stroke="${palette.pattern}" stroke-width="3" stroke-dasharray="6 7" stroke-linecap="round" opacity="0.85" />

        <!-- Snake Head (Circle + Eyes + Tongue) -->
        <g transform="translate(${b.p0.x}, ${b.p0.y}) rotate(${(angleHead * 180) / Math.PI})">
          <!-- Flicking Red Forked Tongue -->
          <path d="M 12 0 L 22 -3 M 12 0 L 22 3" stroke="#dc2626" stroke-width="2.5" stroke-linecap="round" />
          
          <!-- Head Base -->
          <circle cx="0" cy="0" r="14" fill="${palette.stroke}" />
          <circle cx="0" cy="0" r="12" fill="${palette.base}" />
          
          <!-- Yellow Snake Eyes -->
          <circle cx="3" cy="-6" r="3.5" fill="#fef08a" />
          <circle cx="4" cy="-6" r="1.8" fill="#0f172a" />
          <circle cx="3" cy="6" r="3.5" fill="#fef08a" />
          <circle cx="4" cy="6" r="1.8" fill="#0f172a" />
        </g>

        <!-- Head Drop Badge (-X Drop) -->
        <circle cx="${b.p0.x}" cy="${b.p0.y - 24}" r="13" fill="#dc2626" stroke="#ffffff" stroke-width="2" />
        <text x="${b.p0.x}" y="${b.p0.y - 20}" font-size="10" font-weight="900" font-family="'Plus Jakarta Sans', system-ui, sans-serif" text-anchor="middle" fill="#ffffff">-${snake.length}</text>
      </g>
    `;
  }

  private renderTokens(playerPos: number, opponentPos: number, currentTurn: 'player' | 'opponent'): string {
    const pCoord = getTokenCoord('player', playerPos, opponentPos);
    const oCoord = getTokenCoord('opponent', playerPos, opponentPos);

    const pGlow = currentTurn === 'player' ? 'filter="url(#token-glow-player)"' : '';
    const oGlow = currentTurn === 'opponent' ? 'filter="url(#token-glow-opp)"' : '';

    return `
      <!-- Player Token (Blue) Group -->
      <g id="token-player-group" transform="translate(${pCoord.x}, ${pCoord.y})" style="will-change: transform;">
        <!-- Player Breathing Aura Waves -->
        <g id="token-player-aura" pointer-events="none">
          <circle cx="0" cy="0" r="21" fill="none" stroke="#60a5fa" stroke-width="3" opacity="0.8">
            <animate attributeName="r" values="21;35;21" dur="2.4s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.2 1; 0.4 0 0.2 1" />
            <animate attributeName="opacity" values="0.85;0.05;0.85" dur="2.4s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.2 1; 0.4 0 0.2 1" />
            <animate attributeName="stroke-width" values="3.5;0.5;3.5" dur="2.4s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.2 1; 0.4 0 0.2 1" />
          </circle>
          <circle cx="0" cy="0" r="21" fill="rgba(59, 130, 246, 0.22)">
            <animate attributeName="r" values="21;29;21" dur="2.4s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.2 1; 0.4 0 0.2 1" />
            <animate attributeName="opacity" values="0.75;0.15;0.75" dur="2.4s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.2 1; 0.4 0 0.2 1" />
          </circle>
        </g>

        <!-- Player Body -->
        <g id="token-player-body" ${pGlow}>
          <!-- Breathing Scale Container -->
          <g>
            <animateTransform attributeName="transform" type="scale" values="1;1.08;1" dur="2.4s" repeatCount="indefinite" additive="sum" calcMode="spline" keySplines="0.4 0 0.2 1; 0.4 0 0.2 1" />
            <!-- Drop Shadow -->
            <ellipse cx="2" cy="4" rx="20" ry="12" fill="rgba(0,0,0,0.4)" />
            <!-- Base 3D Sphere -->
            <circle cx="0" cy="0" r="21" fill="url(#grad-token-player)" stroke="#ffffff" stroke-width="2.5" />
            <!-- White Ring Badge -->
            <circle cx="0" cy="0" r="12" fill="#ffffff" opacity="0.9" />
            <text x="0" y="4.5" font-size="12" font-weight="900" font-family="'Plus Jakarta Sans', system-ui, sans-serif" text-anchor="middle" fill="#1e3a8a">YOU</text>
            <!-- Specular Highlight -->
            <ellipse cx="-6" cy="-7" rx="6.5" ry="3.5" fill="#ffffff" opacity="0.55" transform="rotate(-30 -6 -7)" />
          </g>
        </g>
      </g>

      <!-- Opponent Token (Rose/Red) Group -->
      <g id="token-opponent-group" transform="translate(${oCoord.x}, ${oCoord.y})" style="will-change: transform;">
        <!-- Opponent Breathing Aura Waves -->
        <g id="token-opp-aura" pointer-events="none">
          <circle cx="0" cy="0" r="21" fill="none" stroke="#fb7185" stroke-width="3" opacity="0.8">
            <animate attributeName="r" values="21;35;21" dur="2.4s" begin="0.4s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.2 1; 0.4 0 0.2 1" />
            <animate attributeName="opacity" values="0.85;0.05;0.85" dur="2.4s" begin="0.4s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.2 1; 0.4 0 0.2 1" />
            <animate attributeName="stroke-width" values="3.5;0.5;3.5" dur="2.4s" begin="0.4s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.2 1; 0.4 0 0.2 1" />
          </circle>
          <circle cx="0" cy="0" r="21" fill="rgba(244, 63, 94, 0.22)">
            <animate attributeName="r" values="21;29;21" dur="2.4s" begin="0.4s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.2 1; 0.4 0 0.2 1" />
            <animate attributeName="opacity" values="0.75;0.15;0.75" dur="2.4s" begin="0.4s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.2 1; 0.4 0 0.2 1" />
          </circle>
        </g>

        <!-- Opponent Body -->
        <g id="token-opponent-body" ${oGlow}>
          <!-- Breathing Scale Container -->
          <g>
            <animateTransform attributeName="transform" type="scale" values="1;1.08;1" dur="2.4s" begin="0.4s" repeatCount="indefinite" additive="sum" calcMode="spline" keySplines="0.4 0 0.2 1; 0.4 0 0.2 1" />
            <!-- Drop Shadow -->
            <ellipse cx="2" cy="4" rx="20" ry="12" fill="rgba(0,0,0,0.4)" />
            <!-- Base 3D Sphere -->
            <circle cx="0" cy="0" r="21" fill="url(#grad-token-opp)" stroke="#ffffff" stroke-width="2.5" />
            <!-- White Ring Badge -->
            <circle cx="0" cy="0" r="12" fill="#ffffff" opacity="0.9" />
            <text x="0" y="4.5" font-size="12" font-weight="900" font-family="'Plus Jakarta Sans', system-ui, sans-serif" text-anchor="middle" fill="#881337">OPP</text>
            <!-- Specular Highlight -->
            <ellipse cx="-6" cy="-7" rx="6.5" ry="3.5" fill="#ffffff" opacity="0.55" transform="rotate(-30 -6 -7)" />
          </g>
        </g>
      </g>
    `;
  }
}
