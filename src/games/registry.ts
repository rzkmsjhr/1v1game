import type { GameDefinition } from './types';
import { TetrisGame } from './tetris/TetrisGame';
import { OthelloGame } from './othello/OthelloGame';
import { PoolGame } from './pool/PoolGame';
import { SnakeLadderGame } from './snake-ladder/SnakeLadderGame';
import { SlingPuckGame } from './sling-puck/SlingPuckGame';
import { BlockFitGame } from './block-fit/BlockFitGame';
import { SodaDashGame } from './soda-dash/SodaDashGame';

export const GAMES_REGISTRY: GameDefinition[] = [
  {
    id: 'tetris',
    title: 'Tetris 1v1 Battle',
    subtitle: 'Competitive Block Stacker',
    description: 'Stack, rotate, and clear lines. Launch devastating garbage lines at your opponent and master the Super Rotation System.',
    genre: 'Arcade Puzzle',
    badge: 'Competitive 1v1',
    bannerGradient: 'from-blue-600 via-blue-700 to-indigo-900',
    accentColor: '#0070d1',
    iconSvg: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="tet-purple" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#c084fc"/>
          <stop offset="100%" stop-color="#7e22ce"/>
        </linearGradient>
        <linearGradient id="tet-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fde047"/>
          <stop offset="100%" stop-color="#d97706"/>
        </linearGradient>
        <linearGradient id="tet-cyan" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#38bdf8"/>
          <stop offset="100%" stop-color="#0284c7"/>
        </linearGradient>
      </defs>
      <g filter="drop-shadow(0 1.2px 1.8px rgba(0,0,0,0.35))">
        <!-- Purple T-Piece -->
        <rect x="3.4" y="3.4" width="5.2" height="5.2" rx="1.2" fill="url(#tet-purple)" stroke="#e9d5ff" stroke-width="0.6"/>
        <rect x="9.4" y="3.4" width="5.2" height="5.2" rx="1.2" fill="url(#tet-purple)" stroke="#e9d5ff" stroke-width="0.6"/>
        <rect x="15.4" y="3.4" width="5.2" height="5.2" rx="1.2" fill="url(#tet-purple)" stroke="#e9d5ff" stroke-width="0.6"/>
        <rect x="9.4" y="9.4" width="5.2" height="5.2" rx="1.2" fill="url(#tet-purple)" stroke="#e9d5ff" stroke-width="0.6"/>
        <!-- Golden L-Piece -->
        <rect x="3.4" y="9.4" width="5.2" height="5.2" rx="1.2" fill="url(#tet-gold)" stroke="#fef08a" stroke-width="0.6"/>
        <rect x="3.4" y="15.4" width="5.2" height="5.2" rx="1.2" fill="url(#tet-gold)" stroke="#fef08a" stroke-width="0.6"/>
        <rect x="9.4" y="15.4" width="5.2" height="5.2" rx="1.2" fill="url(#tet-gold)" stroke="#fef08a" stroke-width="0.6"/>
        <rect x="15.4" y="15.4" width="5.2" height="5.2" rx="1.2" fill="url(#tet-gold)" stroke="#fef08a" stroke-width="0.6"/>
        <!-- Cyan Accent Block -->
        <rect x="15.4" y="9.4" width="5.2" height="5.2" rx="1.2" fill="url(#tet-cyan)" stroke="#bae6fd" stroke-width="0.6"/>
      </g>
    </svg>`,
    screenshotUrl: '/screenshots/tetris.png',
    supportsAI: true,
    create: (container, session) => new TetrisGame(container, session)
  },
  {
    id: 'othello',
    title: 'Othello (Reversi)',
    subtitle: 'Strategic Flank & Flip Duel',
    description: 'Outflank and flip your opponent\'s discs across the 8x8 grid. Control the corners and dominate the board with positional strategy.',
    genre: 'Classic Board Game',
    badge: 'Tactical 1v1',
    bannerGradient: 'from-emerald-700 via-teal-800 to-slate-950',
    accentColor: '#10b981',
    iconSvg: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <defs>
        <radialGradient id="oth-white-grad" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="70%" stop-color="#e2e8f0"/>
          <stop offset="100%" stop-color="#94a3b8"/>
        </radialGradient>
        <radialGradient id="oth-black-grad" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stop-color="#475569"/>
          <stop offset="45%" stop-color="#1e293b"/>
          <stop offset="100%" stop-color="#020617"/>
        </radialGradient>
        <filter id="oth-shadow" x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="1.4" stdDeviation="1.2" flood-color="#000" flood-opacity="0.45"/>
        </filter>
      </defs>
      <!-- Background White Disc -->
      <g filter="url(#oth-shadow)">
        <circle cx="14.5" cy="9.5" r="6.8" fill="url(#oth-white-grad)" stroke="#f8fafc" stroke-width="0.8"/>
        <circle cx="14.5" cy="9.5" r="4.2" fill="none" stroke="#cbd5e1" stroke-width="0.6"/>
        <path d="M 11.5 6 A 5 5 0 0 1 17.5 6" stroke="#ffffff" stroke-width="0.9" stroke-linecap="round" opacity="0.9"/>
      </g>
      <!-- Foreground Black Disc -->
      <g filter="url(#oth-shadow)">
        <circle cx="9.5" cy="14.5" r="6.8" fill="url(#oth-black-grad)" stroke="#64748b" stroke-width="0.8"/>
        <circle cx="9.5" cy="14.5" r="4.2" fill="none" stroke="#334155" stroke-width="0.6"/>
        <path d="M 6.5 11 A 5 5 0 0 1 12.5 11" stroke="#94a3b8" stroke-width="0.9" stroke-linecap="round" opacity="0.6"/>
      </g>
    </svg>`,
    screenshotUrl: '/screenshots/othello.png',
    supportsAI: true,
    create: (container, session) => new OthelloGame(container, session)
  },
  {
    id: 'pool',
    title: '8-Ball & 9-Ball Pool',
    subtitle: 'Classic Billiards with Authentic Lagging',
    description: 'Lag for the break to choose play order, line up precision bank shots with realistic physics, and compete in 8-Ball & 9-Ball modes.',
    genre: 'Sports & Physics',
    badge: '8-Ball & 9-Ball',
    bannerGradient: 'from-zinc-950 via-neutral-900 to-amber-950',
    accentColor: '#f59e0b',
    iconSvg: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.5" fill="#18181b" stroke="#3f3f46" stroke-width="1.2"/><circle cx="12" cy="12" r="4.4" fill="#ffffff"/><text x="12" y="14.5" font-size="7.5" font-weight="900" font-family="'Plus Jakarta Sans', system-ui, sans-serif" text-anchor="middle" fill="#09090b">8</text></svg>`,
    screenshotUrl: '/screenshots/pool.png',
    supportsAI: true,
    create: (container, session) => new PoolGame(container, session)
  },
  {
    id: 'snake-ladder',
    title: 'Snakes & Ladders',
    subtitle: 'Procedural Board Dice Duel',
    description: 'Roll the dice, climb magical ladders, and dodge sneaky snakes on a procedurally generated 100-tile board. Roll for the start, choose your tempo, and race to tile 100.',
    genre: 'Classic Board Game',
    badge: 'Dice & Strategy',
    bannerGradient: 'from-amber-600 via-orange-700 to-emerald-900',
    accentColor: '#ea580c',
    iconSvg: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="snk-ladder-grad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stop-color="#d97706"/>
          <stop offset="50%" stop-color="#fbbf24"/>
          <stop offset="100%" stop-color="#fef08a"/>
        </linearGradient>
        <linearGradient id="snk-snake-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#4ade80"/>
          <stop offset="50%" stop-color="#16a34a"/>
          <stop offset="100%" stop-color="#14532d"/>
        </linearGradient>
        <filter id="snk-shadow" x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="1" flood-color="#000" flood-opacity="0.4"/>
        </filter>
      </defs>
      <!-- 3D Golden Ladder -->
      <g filter="url(#snk-shadow)">
        <line x1="8.5" y1="21" x2="16.5" y2="3" stroke="url(#snk-ladder-grad)" stroke-width="1.8" stroke-linecap="round"/>
        <line x1="12.5" y1="22.5" x2="20.5" y2="4.5" stroke="url(#snk-ladder-grad)" stroke-width="1.8" stroke-linecap="round"/>
        <line x1="10" y1="17.5" x2="14" y2="19" stroke="#fef08a" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="12" y1="13" x2="16" y2="14.5" stroke="#fef08a" stroke-width="1.2" stroke-linecap="round"/>
        <line x1="14" y1="8.5" x2="18" y2="10" stroke="#fef08a" stroke-width="1.2" stroke-linecap="round"/>
      </g>
      <!-- Emerald Snake Coiling Through Ladder -->
      <g filter="url(#snk-shadow)">
        <path d="M 18.5 3.5 C 15.5 3, 13 6, 15.5 9 C 18 12, 10 12, 8.5 15 C 7 18, 9 20.5, 7.5 21.5" stroke="url(#snk-snake-grad)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="18.8" cy="3.8" r="0.75" fill="#fef08a"/>
        <circle cx="19" cy="3.8" r="0.35" fill="#000000"/>
      </g>
      <!-- Lucky 3D Ivory Die -->
      <g filter="url(#snk-shadow)">
        <rect x="2.5" y="11.5" width="8" height="8" rx="1.8" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.8"/>
        <circle cx="6.5" cy="15.5" r="1.4" fill="#dc2626"/>
      </g>
    </svg>`,
    screenshotUrl: '/screenshots/snake-ladder.png',
    supportsAI: true,
    create: (container, session) => new SnakeLadderGame(container, session)
  },
  {
    id: 'sling-puck',
    title: 'Fast Sling Puck',
    subtitle: 'High-Speed Wooden Tabletop Battle',
    description: 'Slingshot all your wooden pucks through the narrow center gate onto your opponent\'s side using elastic tension cords. Real-time, simultaneous, zero turns!',
    genre: 'Tabletop & Dexterity',
    badge: 'Real-Time 1v1',
    bannerGradient: 'from-[#fbf2e3] via-[#f7e5c6] to-[#edd1ab]',
    bannerTheme: 'light',
    accentColor: '#d97706',
    iconSvg: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <defs>
        <radialGradient id="slg-puck-obsidian" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stop-color="#475569"/>
          <stop offset="45%" stop-color="#1e293b"/>
          <stop offset="100%" stop-color="#090d16"/>
        </radialGradient>
        <radialGradient id="slg-puck-red" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stop-color="#fca5a5"/>
          <stop offset="45%" stop-color="#ef4444"/>
          <stop offset="100%" stop-color="#991b1b"/>
        </radialGradient>
        <filter id="slg-icon-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0.8" stdDeviation="0.6" flood-color="#000" flood-opacity="0.35"/>
        </filter>
      </defs>
      <!-- Light Maple Plank Grain Seams -->
      <line x1="8" y1="0" x2="8" y2="24" stroke="#d8b07e" stroke-width="0.75" opacity="0.65"/>
      <line x1="16" y1="0" x2="16" y2="24" stroke="#d8b07e" stroke-width="0.75" opacity="0.65"/>
      <!-- Outer Side Rails -->
      <rect x="0.5" y="0.5" width="2.4" height="23" rx="0.8" fill="#78350f"/>
      <rect x="21.1" y="0.5" width="2.4" height="23" rx="0.8" fill="#78350f"/>
      <!-- Opponent Crimson Puck in Top Court -->
      <circle cx="16.5" cy="2.5" r="2" fill="url(#slg-puck-red)" stroke="#7f1d1d" stroke-width="0.4"/>
      <!-- Center Gate Divider Wings -->
      <rect x="2.5" y="4.5" width="5.8" height="2" rx="0.5" fill="#854d0e"/>
      <rect x="15.7" y="4.5" width="5.8" height="2" rx="0.5" fill="#854d0e"/>
      <circle cx="8.3" cy="5.5" r="0.8" fill="#f59e0b" stroke="#78350f" stroke-width="0.3"/>
      <circle cx="15.7" cy="5.5" r="0.8" fill="#f59e0b" stroke="#78350f" stroke-width="0.3"/>
      <!-- Directional Slingshot Arrow through Center Gate -->
      <polygon points="12,3 10.7,4.6 13.3,4.6" fill="#d97706"/>
      <line x1="12" y1="11.5" x2="12" y2="6" stroke="#f59e0b" stroke-width="0.8" stroke-dasharray="0.8 1" stroke-linecap="round"/>
      <!-- Elastic Slingshot Band Stretched in Deep V -->
      <g filter="url(#slg-icon-shadow)">
        <circle cx="2.6" cy="10.2" r="1.1" fill="#f59e0b" stroke="#78350f" stroke-width="0.3"/>
        <circle cx="21.4" cy="10.2" r="1.1" fill="#f59e0b" stroke="#78350f" stroke-width="0.3"/>
        <path d="M 2.6 10.2 Q 6.5 12 8.8 14.8 L 12 18.8 L 15.2 14.8 Q 17.5 12 21.4 10.2" stroke="#1e293b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <path d="M 2.6 10.2 Q 6.5 12 8.8 14.8 L 12 18.8 L 15.2 14.8 Q 17.5 12 21.4 10.2" stroke="#ef4444" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.9"/>
      </g>
      <!-- Top-Down Obsidian Black Puck Positioned on Stretched Rubber -->
      <g filter="url(#slg-icon-shadow)">
        <circle cx="12" cy="15" r="4.2" fill="url(#slg-puck-obsidian)" stroke="#cbd5e1" stroke-width="0.75"/>
        <circle cx="12" cy="15" r="2.4" fill="none" stroke="#64748b" stroke-width="0.4"/>
        <circle cx="12" cy="15" r="0.7" fill="#94a3b8"/>
        <path d="M 9.4 13.1 A 3 3 0 0 1 14.6 13.1" stroke="#ffffff" stroke-width="0.6" stroke-linecap="round" opacity="0.85"/>
      </g>
    </svg>`,
    screenshotUrl: '/screenshots/sling-puck.png',
    supportsAI: true,
    create: (container, session) => new SlingPuckGame(container, session)
  },
  {
    id: 'block-fit',
    title: 'Block Fit Duel',
    subtitle: 'Randomized Tangram Puzzle Race',
    description: 'Race to pack vibrant polyomino shapes into randomized non-rectangular trays with zero rotation. First to complete 3 shapes wins the Best of 5 duel!',
    genre: 'Puzzle & Speed',
    badge: 'Best of 5',
    bannerGradient: 'from-violet-600 via-indigo-700 to-slate-950',
    accentColor: '#8b5cf6',
    iconSvg: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="bf-tray-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#312e81"/>
          <stop offset="100%" stop-color="#1e1b4b"/>
        </linearGradient>
        <linearGradient id="bf-cyan" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#67e8f9"/>
          <stop offset="100%" stop-color="#0891b2"/>
        </linearGradient>
        <linearGradient id="bf-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fef08a"/>
          <stop offset="100%" stop-color="#ca8a04"/>
        </linearGradient>
        <linearGradient id="bf-purple" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#e9d5ff"/>
          <stop offset="100%" stop-color="#7e22ce"/>
        </linearGradient>
        <linearGradient id="bf-ruby" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fca5a5"/>
          <stop offset="100%" stop-color="#dc2626"/>
        </linearGradient>
        <linearGradient id="bf-green" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#86efac"/>
          <stop offset="100%" stop-color="#16a34a"/>
        </linearGradient>
        <filter id="bf-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="0.8" flood-color="#000" flood-opacity="0.5"/>
        </filter>
      </defs>
      <!-- Stylized Non-Rectangular Tray Silhouette (Recessed Pocket) -->
      <path d="M 2 7 C 2 5.5 3.5 4 5 4 L 14 4 C 15 4 16 4.5 17 5.5 L 21.5 10 C 22.5 11 22.5 12.5 21.5 13.5 L 17 18.5 C 16 19.5 15 20 14 20 L 5 20 C 3.5 20 2 18.5 2 17 Z" fill="url(#bf-tray-bg)" stroke="#6366f1" stroke-width="1.2" stroke-linejoin="round"/>
      <!-- Grid Guides inside Tray -->
      <path d="M 7.5 5 L 7.5 19 M 13 5 L 13 19 M 3 10 L 18 10 M 3 15 L 18 15" stroke="#4338ca" stroke-width="0.7" stroke-dasharray="1 1.5" opacity="0.6"/>
      <!-- Blocks Fitted Inside Tray -->
      <g filter="url(#bf-glow)">
        <!-- Green L-Piece -->
        <rect x="3.5" y="5.5" width="4" height="4" rx="0.8" fill="url(#bf-green)" stroke="#bbf7d0" stroke-width="0.5"/>
        <rect x="3.5" y="10.5" width="4" height="4" rx="0.8" fill="url(#bf-green)" stroke="#bbf7d0" stroke-width="0.5"/>
        <rect x="3.5" y="15.5" width="4" height="4" rx="0.8" fill="url(#bf-green)" stroke="#bbf7d0" stroke-width="0.5"/>
        <rect x="8.5" y="15.5" width="4" height="4" rx="0.8" fill="url(#bf-green)" stroke="#bbf7d0" stroke-width="0.5"/>
        <!-- Gold Piece -->
        <rect x="8.5" y="5.5" width="4" height="4" rx="0.8" fill="url(#bf-gold)" stroke="#fef08a" stroke-width="0.5"/>
        <!-- Purple Piece -->
        <rect x="8.5" y="10.5" width="4" height="4" rx="0.8" fill="url(#bf-purple)" stroke="#e9d5ff" stroke-width="0.5"/>
        <rect x="13.5" y="10.5" width="4" height="4" rx="0.8" fill="url(#bf-purple)" stroke="#e9d5ff" stroke-width="0.5"/>
        <!-- Cyan Piece Snapping In -->
        <rect x="13.5" y="5.5" width="4" height="4" rx="0.8" fill="url(#bf-cyan)" stroke="#a5f3fc" stroke-width="0.5"/>
        <rect x="18" y="8" width="4" height="4" rx="0.8" fill="url(#bf-cyan)" stroke="#a5f3fc" stroke-width="0.5"/>
        <!-- Empty Target Pocket Indicator (dashed glowing amber/white) -->
        <rect x="13.5" y="15.5" width="4" height="4" rx="0.8" fill="#4338ca" stroke="#facc15" stroke-width="0.9" stroke-dasharray="1.5 1"/>
      </g>
    </svg>`,
    screenshotUrl: '/screenshots/block-fit.png',
    supportsAI: true,
    create: (container, session) => new BlockFitGame(container, session)
  },
  {
    id: 'soda-dash',
    title: 'Soda Rush: 1v1 Dash',
    subtitle: 'Infinite Urban Parkour Duel',
    description: 'Sprint down an infinite 3-lane highway with 3 Hearts in a sudden-death 1v1 duel. Leap over road barricades, slide under scaffolding, grab life cans, and outlast your rival as speed escalates!',
    genre: 'Action Runner',
    badge: '1v1 Sudden-Death',
    bannerGradient: 'from-cyan-600 via-blue-700 to-indigo-950',
    accentColor: '#06b6d4',
    iconSvg: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="dash-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="40%" stop-color="#312e81"/>
          <stop offset="100%" stop-color="#f97316"/>
        </linearGradient>
        <linearGradient id="dash-road" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1e293b"/>
          <stop offset="100%" stop-color="#0f172a"/>
        </linearGradient>
        <linearGradient id="dash-cyan" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#67e8f9"/>
          <stop offset="100%" stop-color="#0284c7"/>
        </linearGradient>
        <linearGradient id="dash-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fde047"/>
          <stop offset="100%" stop-color="#ea580c"/>
        </linearGradient>
      </defs>
      <!-- Twilight Sky & Sun Backdrop -->
      <rect x="2" y="2" width="20" height="9" rx="2" fill="url(#dash-sky)"/>
      <circle cx="12" cy="11" r="3.5" fill="#facc15" opacity="0.6"/>
      <!-- 3D Perspective Road -->
      <path d="M 10 11 L 14 11 L 22 22 L 2 22 Z" fill="url(#dash-road)"/>
      <!-- Red & White Curbs -->
      <path d="M 10 11 L 9.2 11 L 2 22 L 3.2 22 Z" fill="#ef4444"/>
      <path d="M 14 11 L 14.8 11 L 22 22 L 20.8 22 Z" fill="#ef4444"/>
      <!-- Dashed Lane Dividers -->
      <path d="M 11.2 12.5 L 11.4 13.5 M 10.5 15.5 L 10.8 17 M 9.5 19.5 L 10 21.5" stroke="#ffffff" stroke-width="0.7" stroke-linecap="round" opacity="0.8"/>
      <path d="M 12.8 12.5 L 12.6 13.5 M 13.5 15.5 L 13.2 17 M 14.5 19.5 L 14 21.5" stroke="#ffffff" stroke-width="0.7" stroke-linecap="round" opacity="0.8"/>
      <!-- Yellow Hurdle Barricade on Right -->
      <path d="M 13.5 17.5 L 19 17.5" stroke="#f59e0b" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M 14.5 17.5 L 14.5 19.5 M 18 17.5 L 18 19.5" stroke="#334155" stroke-width="0.8"/>
      <!-- Leaping Parkour Runner (Left/Center) -->
      <g filter="drop-shadow(0 1px 2px rgba(0,0,0,0.5))">
        <!-- Runner Torso & Head -->
        <circle cx="9" cy="10" r="1.8" fill="#0f172a"/>
        <path d="M 9.5 9.5 L 10.6 9.5" stroke="#fde047" stroke-width="0.8" stroke-linecap="round"/>
        <path d="M 7.5 11.5 L 9.5 11 L 9 14 L 7 13.5 Z" fill="url(#dash-cyan)"/>
        <!-- Flying Limbs -->
        <path d="M 9 13.5 L 6.8 15.5 L 5.5 14.8" stroke="#38bdf8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M 9 13.5 L 10.8 15 L 11.5 16.5" stroke="#0284c7" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
        <!-- Speed Wind Scarf -->
        <path d="M 8 11.5 C 6 11 4.5 12 3 11" stroke="#38bdf8" stroke-width="0.9" stroke-linecap="round"/>
      </g>
      <!-- Floating Soda Life Can with Heart -->
      <rect x="15" y="6" width="3" height="4.5" rx="0.8" fill="#ef4444" stroke="#f8fafc" stroke-width="0.4"/>
      <circle cx="16.5" cy="8.2" r="0.8" fill="#ffffff"/>
      <!-- Sparkle -->
      <path d="M 19 6 L 19.8 4.8 L 21 4 L 19.8 3.2 L 19 2 L 18.2 3.2 L 17 4 L 18.2 4.8 Z" fill="#facc15"/>
    </svg>`,
    screenshotUrl: '/screenshots/soda-dash.png',
    supportsAI: true,
    create: (container, session) => new SodaDashGame(container, session)
  }
];
