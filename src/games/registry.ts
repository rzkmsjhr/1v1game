import type { GameDefinition } from './types';
import { TetrisGame } from './tetris/TetrisGame';
import { Connect4Game } from './connect4/Connect4Game';

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
    supportsAI: true,
    create: (container, session) => new TetrisGame(container, session)
  },
  {
    id: 'connect4',
    title: 'Connect 4 Duel',
    subtitle: 'Tactical Gravity Grid',
    description: 'Drop tokens into the vertical grid. Outmaneuver your rival and align 4 tokens horizontally, vertically, or diagonally to win.',
    genre: 'Turn-Based Strategy',
    badge: 'Classic 1v1',
    bannerGradient: 'from-rose-600 via-rose-700 to-orange-900',
    accentColor: '#f43f5e',
    iconSvg: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="3"/></svg>`,
    supportsAI: true,
    create: (container, session) => new Connect4Game(container, session)
  },
  {
    id: 'pong',
    title: 'Pong Duel',
    subtitle: 'High-Speed Reflex Arena',
    description: 'Deflect high-speed shots, apply curve spins, and bounce past your opponent in this precision paddle duel.',
    genre: 'Arcade Sports',
    badge: 'Coming Soon',
    bannerGradient: 'from-emerald-600 via-teal-700 to-slate-900',
    accentColor: '#10b981',
    iconSvg: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="2" height="8" rx="1"/><rect x="19" y="8" width="2" height="8" rx="1"/><circle cx="12" cy="12" r="2"/></svg>`,
    supportsAI: true,
    isComingSoon: true,
    create: () => { throw new Error('Coming soon'); }
  },
  {
    id: 'chess',
    title: 'Chess Blitz',
    subtitle: 'Rapid Tactical Warfare',
    description: 'Fast-paced 1v1 speed chess. Out-calculate your opponent with aggressive sacrifices and tactical combinations.',
    genre: 'Strategy Board',
    badge: 'Coming Soon',
    bannerGradient: 'from-purple-600 via-violet-800 to-slate-900',
    accentColor: '#8b5cf6',
    iconSvg: `<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 5H9l3-5zM6 7l2 5h8l2-5H6zM6 12l2 8h8l2-8H6zM4 22h16v-2H4v2z"/></svg>`,
    supportsAI: true,
    isComingSoon: true,
    create: () => { throw new Error('Coming soon'); }
  }
];
