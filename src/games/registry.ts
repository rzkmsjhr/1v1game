import type { GameDefinition } from './types';
import { TetrisGame } from './tetris/TetrisGame';
import { OthelloGame } from './othello/OthelloGame';
import { PoolGame } from './pool/PoolGame';

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
    bannerGradient: 'from-emerald-700 via-teal-800 to-slate-950',
    accentColor: '#10b981',
    iconSvg: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="10.5" r="1"/><circle cx="12" cy="13.5" r="1"/></svg>`,
    supportsAI: true,
    create: (container, session) => new PoolGame(container, session)
  },
  {
    id: 'sheep-fight',
    title: 'Sheep Fight',
    subtitle: 'Lane Battle & Ramming Frenzy',
    description: 'Spawn your flock into parallel lanes, leverage weight classes, and push opposing rams backward to breach their pasture.',
    genre: 'Casual Strategy',
    badge: 'Coming Soon',
    bannerGradient: 'from-amber-600 via-orange-700 to-stone-900',
    accentColor: '#f59e0b',
    iconSvg: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5c-2.5 0-4.5 2-4.5 5v4a4.5 4.5 0 0 0 9 0v-4c0-3-2-5-4.5-5z"/><path d="M7.5 10C5.5 10 3.5 8 3.5 6s2-3 4-2c1 .5 1.5 1.5 2 3"/><path d="M16.5 10c2 0 4-2 4-4s-2-3-4-2c-1 .5-1.5 1.5-2 3"/><circle cx="10" cy="12" r="1" fill="currentColor"/><circle cx="14" cy="12" r="1" fill="currentColor"/></svg>`,
    supportsAI: true,
    isComingSoon: true,
    create: () => { throw new Error('Coming soon'); }
  }
];
