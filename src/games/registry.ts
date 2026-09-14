import type { GameDefinition } from './types';
import { TetrisGame } from './tetris/TetrisGame';
import { OthelloGame } from './othello/OthelloGame';
import { PoolGame } from './pool/PoolGame';
import { SnakeLadderGame } from './snake-ladder/SnakeLadderGame';
import { SlingPuckGame } from './sling-puck/SlingPuckGame';

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
    iconSvg: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6v6H4zM10 14h6v6h-6zM10 8h6v6h-6zM16 14h6v6h-6z"/></svg>`,
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
    iconSvg: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>`,
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
    iconSvg: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 3L5 21M9 6h7M8 11h7M7 16h7M15 13c1.5 0 2.5 1 2.5 2s-1 2-2.5 2-2.5-1-2.5-2 1-2 2.5-2z"/></svg>`,
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
    bannerGradient: 'from-amber-700 via-orange-800 to-stone-950',
    accentColor: '#d97706',
    iconSvg: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="#d97706" stroke-width="2"/><line x1="3" y1="12" x2="9" y2="12" stroke="#d97706" stroke-width="2"/><line x1="15" y1="12" x2="21" y2="12" stroke="#d97706" stroke-width="2"/><circle cx="12" cy="12" r="2.5" fill="#f59e0b"/><path d="M5 19 Q12 16 19 19" stroke="#ffffff" stroke-width="1.8" fill="none"/></svg>`,
    screenshotUrl: '/screenshots/sling-puck.png',
    supportsAI: true,
    create: (container, session) => new SlingPuckGame(container, session)
  }
];
