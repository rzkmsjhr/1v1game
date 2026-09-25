import type { AppTheme, GameInstance, GameSession } from '../types';
import type { DashNetworkMessage, Lane } from './soda-dash-types';
import type { NetworkHealth, NetworkMessage } from '../../network/webrtc-peer';
import { SodaDashEngine } from './soda-dash-engine';
import { SodaDashRenderer } from './renderers/SodaDashRenderer';
import { SodaDashAI } from './soda-dash-ai';
import { sounds } from '../../engine/sound';
import confetti from 'canvas-confetti';

export class SodaDashGame implements GameInstance {
  private container: HTMLElement;
  private session: GameSession;
  private engine: SodaDashEngine;
  private renderer!: SodaDashRenderer;
  private ai: SodaDashAI | null = null;

  private canvas!: HTMLCanvasElement;
  private animFrameId: number | null = null;
  private lastTime: number = 0;
  private syncIntervalId: number | null = null;

  // DOM Elements
  private playerHeartsEl!: HTMLElement;
  private opponentHeartsEl!: HTMLElement;
  private playerDistEl!: HTMLElement;
  private opponentDistEl!: HTMLElement;
  private playerSpeedEl!: HTMLElement;
  private leadBadgeEl!: HTMLElement;
  private itemBtnEl!: HTMLElement;
  private gameOverModalEl!: HTMLElement;
  private gameOverTitleEl!: HTMLElement;
  private gameOverStatsEl!: HTMLElement;

  // Network Health HUD elements
  private pingEl: HTMLElement | null = null;
  private pingDotEl: HTMLElement | null = null;
  private pingTextEl: HTMLElement | null = null;
  private peerAwayBannerEl: HTMLElement | null = null;

  // Remote Opponent Smooth Netcode State (Dead reckoning + LERP interpolation)
  private remoteTargetDistance: number = 0;
  private remoteTargetSpeed: number = 16;
  private remoteTargetLane: Lane = 1;
  private remoteTargetX: number = 1;
  private remoteTargetJumpY: number = 0;
  private remoteLastSyncTime: number = 0;
  private isInitialSeedSynced: boolean = false;
  private rematchState: 'idle' | 'requested' | 'offer_received' = 'idle';

  // Top-Middle 2-Line Bubble Chat Elements (Rival Info)
  private rivalBubbleEl!: HTMLElement;
  private bubbleIconEl!: HTMLElement;
  private bubbleLine1El!: HTMLElement;
  private bubbleLine2El!: HTMLElement;
  private bubbleHideTimer: number | null = null;

  // Touch gesture tracking
  private touchStartX: number = 0;
  private touchStartY: number = 0;
  private touchStartTime: number = 0;
  private lastTapTime: number = 0;

  // Stats
  private obstaclesDodged: number = 0;
  private maxSpeedReached: number = 0;
  private startTime: number = 0;

  // DOM Dirty Checking Caches (prevents continuous reflows)
  private lastPDist: number = -1;
  private lastODist: number = -1;
  private lastKmh: number = -1;
  private lastLeadText: string = '';
  private lastLeadClass: string = '';
  private lastHeldItem: string | null = '__init__';

  private boundKeyDown = this.handleKeyDown.bind(this);
  private boundTouchStart = this.handleTouchStart.bind(this);
  private boundTouchEnd = this.handleTouchEnd.bind(this);
  private boundResize = this.handleResize.bind(this);

  constructor(container: HTMLElement, session: GameSession) {
    this.container = container;
    this.session = session;

    // Seed matching: host chooses seed or online syncs seed
    if (session.mode === 'online' && session.peer?.role === 'host') {
      const initialSeed = Math.floor(Math.random() * 1000000) + 1;
      this.engine = new SodaDashEngine(initialSeed);
      this.isInitialSeedSynced = true;
    } else {
      const initialSeed = Date.now();
      this.engine = new SodaDashEngine(initialSeed);
    }

    this.mountUI();
    this.initCanvasAndRenderer();
    this.initControls();
    this.initNetworking();

    if (session.mode === 'ai') {
      this.ai = new SodaDashAI(this.engine, session.aiDifficulty || 'medium');
    }

    this.startTime = Date.now();
    this.lastTime = performance.now();
    this.remoteLastSyncTime = performance.now();
    (window as any).__sodaDashGame = this;
    this.startLoop();
  }

  // -------------------------------------------------------------
  // UI MOUNTING
  // -------------------------------------------------------------

  private mountUI(): void {
    const isOnline = this.session.mode === 'online';
    const diff = this.session.aiDifficulty ? this.session.aiDifficulty.toUpperCase() : 'PVP';
    const isDark = this.session.theme === 'dark';

    this.container.className = 'w-full h-full p-0 m-0 overflow-hidden flex justify-center ' + (isDark ? 'bg-[#0a0c13]' : 'bg-slate-100');
    document.body.style.backgroundColor = isDark ? '#0a0c13' : '#f1f5f9';

    this.container.innerHTML = `
      <div class="relative w-full max-w-6xl mx-auto h-[100dvh] max-h-[100dvh] flex flex-col items-center justify-between overflow-hidden select-none font-sans shadow-2xl sm:border-x border-slate-200 dark:border-slate-800/60 bg-slate-100 dark:bg-slate-950" style="height: 100dvh; max-height: 100dvh;">
        
        <!-- Top Navigation & Status Bar -->
        <div class="w-full max-w-6xl px-3 sm:px-6 py-2 sm:py-3 z-20 flex items-center justify-between pointer-events-auto bg-white/95 dark:bg-transparent backdrop-blur-md dark:backdrop-blur-none">
          <!-- Back button & Mode Tag -->
          <div class="flex items-center space-x-2">
            <button id="btn-dash-exit" class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all bg-white dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 flex items-center space-x-1 shadow-md border border-slate-200 dark:border-slate-700/60 backdrop-blur-md">
              <span>← Hub</span>
            </button>
            <div class="hidden sm:inline-flex px-2.5 py-1 rounded-lg text-[10px] font-black tracking-wider uppercase bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-300/50 dark:border-amber-500/30">
              🥷 NINJA RUSH • ${diff}
            </div>
          </div>

          <!-- Real-Time Distance Lead Badge -->
          <div id="dash-lead-badge" class="px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-black tracking-wide bg-white dark:bg-slate-900/90 text-cyan-600 dark:text-cyan-400 border border-cyan-300/40 dark:border-cyan-500/30 shadow-lg backdrop-blur-md whitespace-nowrap flex-shrink-0 text-center">
            STARTING...
          </div>

          <!-- Quick Audio Toggle & Net Ping Badge -->
          <div class="flex items-center space-x-1.5">
            <div id="dash-net-ping" class="hidden items-center space-x-1 text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-300/40 dark:border-emerald-500/30 rounded px-1.5 py-0.5 shadow-sm">
              <span id="dash-net-dot" class="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400"></span>
              <span id="dash-net-text">--ms</span>
            </div>
            <button id="btn-dash-sound" class="p-2 rounded-xl text-xs bg-white dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/60 shadow-md">
              🔊
            </button>
          </div>
        </div>

        <!-- Inactive Tab / Opponent Away Banner -->
        <div id="dash-peer-away-banner" class="hidden w-full max-w-6xl px-3 sm:px-6 z-20 py-0.5 text-center rounded-lg bg-amber-100 dark:bg-amber-500/20 border border-amber-300/40 dark:border-amber-500/40 text-amber-700 dark:text-amber-300 font-bold text-[10px] tracking-wide animate-pulse">
          ⚠️ Opponent is tabbed out / minimized
        </div>

        <!-- In-Game HUD: Dual Hearts & Distance Meters (Streamlined & Compact) -->
        <div class="w-full max-w-6xl px-3 sm:px-6 z-20 grid grid-cols-2 gap-2.5 sm:gap-4 pointer-events-none pb-1">
          
          <!-- Player Health & Distance Card -->
          <div class="px-2.5 py-1.5 sm:p-3 rounded-xl sm:rounded-2xl bg-white/95 dark:bg-slate-900/85 border border-cyan-300/50 dark:border-cyan-500/40 shadow-xl backdrop-blur-md flex flex-col space-y-0.5 sm:space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-[10px] sm:text-[11px] font-black tracking-wider text-cyan-600 dark:text-cyan-400 uppercase">YOU (CYAN)</span>
              <div id="player-hearts" class="text-xs sm:text-base tracking-widest text-red-500 flex items-center space-x-0.5">
                ❤️ ❤️ ❤️
              </div>
            </div>
            <div class="flex items-baseline justify-between pt-0.5">
              <div id="player-dist" class="text-base sm:text-2xl font-black font-mono text-slate-900 dark:text-white tracking-tight">0 m</div>
              <div id="player-speed" class="text-[10px] sm:text-xs font-bold font-mono text-cyan-500 dark:text-cyan-300">58 km/h</div>
            </div>
          </div>

          <!-- Opponent Health & Distance Card -->
          <div class="px-2.5 py-1.5 sm:p-3 rounded-xl sm:rounded-2xl bg-white/95 dark:bg-slate-900/85 border border-rose-300/50 dark:border-rose-500/40 shadow-xl backdrop-blur-md flex flex-col space-y-0.5 sm:space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-[10px] sm:text-[11px] font-black tracking-wider text-rose-600 dark:text-rose-400 uppercase">${isOnline ? 'OPPONENT' : `BOT (${diff})`}</span>
              <div id="opponent-hearts" class="text-xs sm:text-base tracking-widest text-red-500 flex items-center space-x-0.5">
                ❤️ ❤️ ❤️
              </div>
            </div>
            <div class="flex items-baseline justify-between pt-0.5">
              <div id="opponent-dist" class="text-base sm:text-2xl font-black font-mono text-slate-900 dark:text-white tracking-tight">0 m</div>
              <div class="text-[10px] sm:text-xs font-bold text-rose-500 dark:text-rose-300">RIVAL</div>
            </div>
          </div>

        </div>

        <!-- Main 3D Canvas Viewport -->
        <div class="relative flex-1 w-full flex items-center justify-center overflow-hidden touch-none">
          <canvas id="dash-canvas" class="w-full h-full block"></canvas>
          
          <!-- Top-Middle 2-Line Bubble Chat Styled Notification Feed (Rival Info) -->
          <div id="dash-rival-bubble" class="absolute top-3 sm:top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none transition-all duration-300 opacity-0 -translate-y-2 max-w-xs sm:max-w-md w-[90%] flex justify-center">
            <div class="relative px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-white/95 dark:bg-slate-900/95 border border-rose-300/50 dark:border-rose-500/50 shadow-2xl backdrop-blur-md flex items-center space-x-2.5 sm:space-x-3 text-left">
              <div id="dash-bubble-icon" class="flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center text-sm shadow-md">
                🥷
              </div>
              <div class="flex-1 min-w-0 pr-1">
                <div id="dash-bubble-line1" class="text-[10px] sm:text-[11px] font-black tracking-wider uppercase text-rose-500 dark:text-rose-400 flex items-center justify-between">
                  <span>RIVAL INFO</span>
                  <span class="text-[9px] text-slate-500 dark:text-slate-400 font-normal">ALERT</span>
                </div>
                <div id="dash-bubble-line2" class="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate drop-shadow-sm">
                  Rival is ready!
                </div>
              </div>
              <!-- Speech bubble notch pointing towards top-right rival card -->
              <div class="absolute -top-1.5 right-10 w-3 h-3 bg-white dark:bg-slate-900 rotate-45 border-t border-l border-rose-300/50 dark:border-rose-500/50"></div>
            </div>
          </div>

          <!-- Desktop Keyboard Hint (hidden on touch/mobile) -->
          <div class="hidden sm:flex absolute bottom-4 left-6 z-20 pointer-events-none items-center space-x-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400/80 bg-white/90 dark:bg-slate-900/85 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 backdrop-blur-md">
            <span>Keys: [A/D] or [←/→] Lane • [W/Space] Jump • [S/↓] Slide • [E] Item</span>
          </div>

          <!-- Floating Item Slot Button -->
          <button id="btn-use-item" class="absolute bottom-4 right-4 z-20 px-4 py-3 rounded-2xl font-black text-xs sm:text-sm tracking-wide bg-slate-900/80 text-slate-500 border border-slate-700/60 opacity-40 pointer-events-none transition-all select-none shadow-md backdrop-blur-sm">
            <span>NO ITEM</span>
          </button>
        </div>

        <!-- Mobile Touch Bar (Directional Tap Controls) with Android/iOS Safe Area Inset -->
        <div class="sm:hidden w-full max-w-6xl px-3 pt-2.5 z-20 grid grid-cols-4 gap-2.5 pointer-events-auto bg-white/95 dark:bg-slate-950/90 border-t border-slate-200 dark:border-slate-800/80 backdrop-blur-md" style="padding-bottom: max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem));">
          <button id="touch-left" class="py-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-white font-black text-2xl active:bg-cyan-500 active:text-white active:scale-95 shadow-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center transition-transform select-none">
            ←
          </button>
          <button id="touch-jump" class="py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black text-xs sm:text-sm tracking-wider uppercase active:scale-95 shadow-lg shadow-cyan-500/25 border border-cyan-400/40 flex items-center justify-center gap-1 transition-transform select-none">
            <span>JUMP</span> <span>↑</span>
          </button>
          <button id="touch-slide" class="py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black text-xs sm:text-sm tracking-wider uppercase active:scale-95 shadow-lg shadow-amber-500/25 border border-amber-400/40 flex items-center justify-center gap-1 transition-transform select-none">
            <span>SLIDE</span> <span>↓</span>
          </button>
          <button id="touch-right" class="py-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-white font-black text-2xl active:bg-cyan-500 active:text-white active:scale-95 shadow-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center transition-transform select-none">
            →
          </button>
        </div>

        <!-- Game Over Modal -->
        <div id="modal-dash-gameover" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div class="w-full max-w-sm rounded-3xl p-6 flex flex-col items-center text-center shadow-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white animate-in fade-in zoom-in-95 duration-200">
            <div id="dash-winner-icon" class="text-5xl mb-2">🏆</div>
            <h3 id="dash-winner-title" class="text-2xl font-black mb-1 text-cyan-400 tracking-wide">VICTORY!</h3>
            <p id="dash-winner-desc" class="text-xs text-slate-500 dark:text-slate-400 mb-4">You outlasted your rival!</p>

            <div id="dash-stats-box" class="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/80 mb-5 text-xs space-y-1.5">
              <!-- Stats populated dynamically -->
            </div>

            <div class="w-full space-y-2.5">
              <button id="btn-dash-rematch" class="w-full py-3 px-6 rounded-xl font-black tracking-wider uppercase text-white bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/30 active:scale-95 transition-all cursor-pointer">
                Play Again
              </button>
              <button id="btn-dash-exit-modal" class="w-full py-2.5 px-6 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all border border-slate-200 dark:border-slate-700/50 cursor-pointer">
                Exit to Arcade Hub
              </button>
            </div>
          </div>
        </div>

      </div>
    `;

    this.canvas = document.getElementById('dash-canvas') as HTMLCanvasElement;
    this.playerHeartsEl = document.getElementById('player-hearts')!;
    this.opponentHeartsEl = document.getElementById('opponent-hearts')!;
    this.playerDistEl = document.getElementById('player-dist')!;
    this.opponentDistEl = document.getElementById('opponent-dist')!;
    this.playerSpeedEl = document.getElementById('player-speed')!;
    this.leadBadgeEl = document.getElementById('dash-lead-badge')!;
    this.itemBtnEl = document.getElementById('btn-use-item')!;
    this.gameOverModalEl = document.getElementById('modal-dash-gameover')!;
    this.gameOverTitleEl = document.getElementById('dash-winner-title')!;
    this.gameOverStatsEl = document.getElementById('dash-stats-box')!;

    // Network Health HUD elements
    this.pingEl = document.getElementById('dash-net-ping');
    this.pingDotEl = document.getElementById('dash-net-dot');
    this.pingTextEl = document.getElementById('dash-net-text');
    this.peerAwayBannerEl = document.getElementById('dash-peer-away-banner');

    // Bubble chat elements
    this.rivalBubbleEl = document.getElementById('dash-rival-bubble')!;
    this.bubbleIconEl = document.getElementById('dash-bubble-icon')!;
    this.bubbleLine1El = document.getElementById('dash-bubble-line1')!;
    this.bubbleLine2El = document.getElementById('dash-bubble-line2')!;

    // Header buttons
    document.getElementById('btn-dash-exit')?.addEventListener('click', () => this.session.onExit());
    document.getElementById('btn-dash-exit-modal')?.addEventListener('click', () => this.session.onExit());
    document.getElementById('btn-dash-rematch')?.addEventListener('click', () => this.handleRematch());

    document.getElementById('btn-dash-sound')?.addEventListener('click', () => {
      const enabled = sounds.toggleMute();
      const btn = document.getElementById('btn-dash-sound');
      if (btn) btn.textContent = enabled ? '🔊' : '🔇';
    });

    // Touch bar buttons (Instant Action Broadcast for PvP)
    document.getElementById('touch-left')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.engine.moveLeft('player');
      this.broadcastAction('MOVE_LEFT');
    });
    document.getElementById('touch-right')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.engine.moveRight('player');
      this.broadcastAction('MOVE_RIGHT');
    });
    document.getElementById('touch-jump')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.engine.jump('player');
      this.broadcastAction('JUMP');
    });
    document.getElementById('touch-slide')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.engine.slide('player');
      this.broadcastAction('SLIDE');
    });
    this.itemBtnEl.addEventListener('click', () => {
      this.useItem();
    });
  }

  // -------------------------------------------------------------
  // CANVAS & RENDERER INITIALIZATION
  // -------------------------------------------------------------

  private initCanvasAndRenderer(): void {
    this.renderer = new SodaDashRenderer(this.canvas, this.engine);
    this.handleResize();
    window.addEventListener('resize', this.boundResize);

    // Engine collision hook for visual/audio effects
    this.engine.onCollision = (evt) => {
      if (evt.runnerId === 'player') {
        // Player's local effects on road
        if (evt.type === 'HIT_DAMAGE') {
          const x = this.canvas.width * 0.5;
          const y = this.canvas.height * 0.7;
          this.renderer.addSplash(x, y, '#ef4444', 20);
          this.renderer.addFloatingText('-1 ❤️', x, y - 40, '#ef4444');
          const obstacleLabel = evt.itemType === 'DUMPSTER' ? 'Brick Wall' : evt.itemType === 'OVERHEAD' ? 'Slide Pipe' : evt.itemType === 'HURDLE' ? 'Hurdle' : evt.itemType;
          this.broadcastRivalEvent('RIVAL DAMAGED', `💥 Crashed into ${obstacleLabel}! (-1 ❤️)`, '💥');
        } else if (evt.type === 'HEAL') {
          const x = this.canvas.width * 0.5;
          const y = this.canvas.height * 0.7;
          this.renderer.addSplash(x, y, '#22c55e', 24);
          this.renderer.addFloatingText('+1 ❤️', x, y - 40, '#22c55e');
          this.broadcastRivalEvent('RIVAL HEALED', '❤️ Collected Life Can! (+1 ❤️)', '❤️', 'from-emerald-500 to-teal-500');
        } else if (evt.type === 'BOOST' || evt.type === 'TURBO_SMASH') {
          const x = this.canvas.width * 0.5;
          const y = this.canvas.height * 0.7;
          this.renderer.addSplash(x, y, '#f59e0b', 16);
          this.broadcastRivalEvent('RIVAL SURGE', '⚡ Hit Speed Surge Pad!', '⚡', 'from-yellow-400 to-amber-500');
        } else if (evt.type === 'SLOW_PAD') {
          const x = this.canvas.width * 0.5;
          const y = this.canvas.height * 0.7;
          this.renderer.addFloatingText('SLOWED!', x, y - 30, '#c084fc');
          this.broadcastRivalEvent('RIVAL SLOWED', '🐌 Stepped on Slow Pad! Speed reduced 🔻', '🐌', 'from-purple-500 to-pink-500');
        } else if (evt.type === 'STUMBLE') {
          const x = this.canvas.width * 0.5;
          const y = this.canvas.height * 0.7;
          this.renderer.addFloatingText('SLIP!', x, y - 30, '#a855f7');
          this.broadcastRivalEvent('RIVAL SLIPPED', '💫 Slipped on Trap puddle!', '💫', 'from-purple-500 to-pink-500');
        } else if (evt.type === 'SHIELD_BREAK') {
          const x = this.canvas.width * 0.5;
          const y = this.canvas.height * 0.7;
          this.renderer.addSplash(x, y, '#38bdf8', 24);
          this.renderer.addFloatingText('SHIELD BROKEN!', x, y - 40, '#38bdf8');
          this.broadcastRivalEvent('RIVAL SHIELD BROKEN', '🛡️ Shield absorbed collision!', '🛡️', 'from-blue-500 to-cyan-500');
        } else if (evt.type === 'PICKUP') {
          const itemNames: Record<string, string> = {
            FIZZ_TURBO: 'Rocket Boost 🚀',
            BUBBLE_SHIELD: 'Bubble Shield 🛡️',
            SODA_SPILL: 'Caltrops Trap 🛢️',
            CHEST: 'Gold Chest 🎁'
          };
          const name = itemNames[evt.itemType] || evt.itemType;
          this.broadcastRivalEvent('RIVAL ITEM', `🎁 Opened Gold Chest: Got ${name}!`, '🎁', 'from-amber-400 to-yellow-500');
        } else if (evt.type === 'ITEM_USE') {
          if (evt.itemType === 'FIZZ_TURBO') {
            this.broadcastRivalEvent('RIVAL BOOST', '🚀 Ignited Rocket Boost!', '🚀', 'from-amber-500 to-orange-500');
          } else if (evt.itemType === 'BUBBLE_SHIELD') {
            this.broadcastRivalEvent('RIVAL SHIELD', '🛡️ Activated Bubble Shield!', '🛡️', 'from-sky-500 to-cyan-500');
          } else if (evt.itemType === 'SODA_SPILL') {
            this.broadcastRivalEvent('RIVAL TRAP', '🛢️ Dropped Caltrops Trap behind them!', '🛢️', 'from-rose-500 to-red-600');
          }
        }
      } else {
        // Opponent's events -> Route to TOP-MIDDLE 2-LINE BUBBLE CHAT (NO on-road text)
        if (evt.type === 'HIT_DAMAGE') {
          const obstacleLabel = evt.itemType === 'DUMPSTER' ? 'Brick Wall' : evt.itemType === 'OVERHEAD' ? 'Slide Pipe' : evt.itemType === 'HURDLE' ? 'Hurdle' : evt.itemType;
          this.showRivalBubble('RIVAL CRASH', `💥 Crashed into ${obstacleLabel}! (-1 ❤️)`, '💥', 'from-rose-600 to-red-500');
        } else if (evt.type === 'HEAL') {
          this.showRivalBubble('RIVAL HEAL', '❤️ Collected Life Can! (+1 ❤️)', '❤️', 'from-emerald-500 to-teal-500');
        } else if (evt.type === 'BOOST' || evt.type === 'TURBO_SMASH') {
          this.showRivalBubble('RIVAL SURGE', '⚡ Hit Speed Surge Pad!', '⚡', 'from-yellow-400 to-amber-500');
        } else if (evt.type === 'SLOW_PAD') {
          this.showRivalBubble('RIVAL SLOWED', '🐌 Stepped on Slow Pad! Speed reduced 🔻', '🐌', 'from-purple-500 to-pink-500');
        } else if (evt.type === 'STUMBLE') {
          this.showRivalBubble('RIVAL SLIPPED', '💫 Slipped on Trap puddle!', '💫', 'from-purple-500 to-pink-500');
        } else if (evt.type === 'SHIELD_BREAK') {
          this.showRivalBubble('RIVAL SHIELD', '🛡️ Shield absorbed collision!', '🛡️', 'from-blue-500 to-cyan-500');
        } else if (evt.type === 'PICKUP') {
          const itemNames: Record<string, string> = {
            FIZZ_TURBO: 'Rocket Boost 🚀',
            BUBBLE_SHIELD: 'Bubble Shield 🛡️',
            SODA_SPILL: 'Caltrops Trap 🛢️',
            CHEST: 'Gold Chest 🎁'
          };
          const name = itemNames[evt.itemType] || evt.itemType;
          this.showRivalBubble('RIVAL CHEST', `🎁 Opened Gold Chest: Got ${name}!`, '🎁', 'from-amber-400 to-yellow-500');
        } else if (evt.type === 'ITEM_USE') {
          if (evt.itemType === 'FIZZ_TURBO') {
            this.showRivalBubble('RIVAL BOOST', '🚀 Ignited Rocket Boost!', '🚀', 'from-amber-500 to-orange-500');
          } else if (evt.itemType === 'BUBBLE_SHIELD') {
            this.showRivalBubble('RIVAL SHIELD', '🛡️ Activated Bubble Shield!', '🛡️', 'from-sky-500 to-cyan-500');
          } else if (evt.itemType === 'SODA_SPILL') {
            this.showRivalBubble('RIVAL TRAP', '🛢️ Dropped Caltrops Trap behind them!', '🛢️', 'from-rose-500 to-red-600');
          }
        }
      }
      this.updateHUD();
    };

    this.engine.onGameOver = (winner) => {
      this.handleGameOver(winner);
    };
  }

  private handleResize(): void {
    const isMobile = window.innerWidth < 768 || window.innerHeight > window.innerWidth;
    // On mobile, cap DPR at 1.5 to save >40% fill-rate while preserving crisp sharpness; desktop up to 2.0
    const maxDpr = isMobile ? 1.5 : 2.0;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.floor(rect.width || window.innerWidth);
    const h = Math.floor(rect.height || (window.innerHeight - 130));

    this.canvas.width = Math.max(320, w) * dpr;
    this.canvas.height = Math.max(300, h) * dpr;

    this.renderer?.onResize(this.canvas.width, this.canvas.height);
  }

  // -------------------------------------------------------------
  // CONTROLS: KEYBOARD & SWIPE GESTURES
  // -------------------------------------------------------------

  private initControls(): void {
    window.addEventListener('keydown', this.boundKeyDown);

    // Swipe controls on main canvas container
    const viewport = this.canvas.parentElement;
    if (viewport) {
      viewport.addEventListener('touchstart', this.boundTouchStart, { passive: false });
      viewport.addEventListener('touchend', this.boundTouchEnd, { passive: false });
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.engine.isGameOver) return;
    // Ignore OS key auto-repeat when holding keys (prevents infinite slide glitching)
    if (e.repeat) return;

    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault();
        this.engine.moveLeft('player');
        this.broadcastAction('MOVE_LEFT');
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault();
        this.engine.moveRight('player');
        this.broadcastAction('MOVE_RIGHT');
        break;
      case 'ArrowUp':
      case 'w':
      case 'W':
      case ' ':
        e.preventDefault();
        this.engine.jump('player');
        this.broadcastAction('JUMP');
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault();
        this.engine.slide('player');
        this.broadcastAction('SLIDE');
        break;
      case 'e':
      case 'E':
      case 'Shift':
        e.preventDefault();
        this.useItem();
        break;
    }
  }

  private handleTouchStart(e: TouchEvent): void {
    if (e.touches.length === 0) return;
    const touch = e.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchStartTime = Date.now();

    // Check double tap to use item
    const now = Date.now();
    if (now - this.lastTapTime < 300) {
      this.useItem();
    }
    this.lastTapTime = now;
  }

  private handleTouchEnd(e: TouchEvent): void {
    if (e.changedTouches.length === 0) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - this.touchStartX;
    const dy = touch.clientY - this.touchStartY;
    const dt = Date.now() - this.touchStartTime;

    const minSwipeDistance = 24;
    if (dt < 400 && (Math.abs(dx) > minSwipeDistance || Math.abs(dy) > minSwipeDistance)) {
      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal swipe
        if (dx < 0) {
          this.engine.moveLeft('player');
          this.broadcastAction('MOVE_LEFT');
        } else {
          this.engine.moveRight('player');
          this.broadcastAction('MOVE_RIGHT');
        }
      } else {
        // Vertical swipe
        if (dy < 0) {
          this.engine.jump('player');
          this.broadcastAction('JUMP');
        } else {
          this.engine.slide('player');
          this.broadcastAction('SLIDE');
        }
      }
    }
  }

  private broadcastAction(action: 'MOVE_LEFT' | 'MOVE_RIGHT' | 'JUMP' | 'SLIDE'): void {
    if (this.session.mode !== 'online' || !this.session.peer?.isConnected) return;
    this.session.peer.sendMessage({
      type: 'DASH_ACTION',
      action,
      lane: this.engine.player.lane,
      distance: this.engine.player.distance,
      timestamp: performance.now()
    });
  }

  // -------------------------------------------------------------
  // NETWORKING & MULTIPLAYER
  // -------------------------------------------------------------

  private initNetworking(): void {
    if (this.session.mode !== 'online' || !this.session.peer) return;

    const peer = this.session.peer;
    const origOnMessage = peer.events?.onMessage;
    const origOnStatusChange = peer.events?.onStatusChange;
    const origOnHealthChange = peer.events?.onHealthChange;

    peer.events = {
      ...peer.events,
      onMessage: (raw: NetworkMessage) => {
        origOnMessage?.(raw);
        this.handleNetworkMessage(raw as any);
      },
      onStatusChange: (status: string, message?: string) => {
        origOnStatusChange?.(status as any, message);
        if (status === 'connected') {
          if (this.session.peer?.role === 'host') {
            this.session.peer.sendMessage({
              type: 'DASH_READY',
              seed: this.engine.track.getSeed()
            });
          } else if (this.session.peer?.role === 'guest') {
            this.session.peer.sendMessage({
              type: 'DASH_REQUEST_SEED'
            });
          }
        } else if (status === 'disconnected') {
          this.handleForfeitVictory('Opponent disconnected from the match.');
        }
      },
      onHealthChange: (health: NetworkHealth) => {
        origOnHealthChange?.(health);
        this.updateNetworkHealthHUD(health);
      }
    };

    if (this.session.peer.isConnected) {
      if (this.session.peer.role === 'host') {
        this.session.peer.sendMessage({
          type: 'DASH_READY',
          seed: this.engine.track.getSeed()
        });
      } else if (this.session.peer.role === 'guest') {
        this.session.peer.sendMessage({
          type: 'DASH_REQUEST_SEED'
        });
      }
      this.updateNetworkHealthHUD({
        rtt: this.session.peer.currentRtt,
        status: this.session.peer.networkQuality,
        isPeerVisible: this.session.peer.isPeerVisible
      });
    }

    // Flush any early messages that arrived before handlers were attached
    peer.flushEarlyMessages?.();

    // 20Hz state broadcast interval
    this.syncIntervalId = window.setInterval(() => {
      this.broadcastState();
    }, 50);
  }

  private updateNetworkHealthHUD(health: NetworkHealth): void {
    if (!this.pingEl || !this.pingDotEl || !this.pingTextEl) return;
    this.pingEl.classList.remove('hidden');
    this.pingEl.classList.add('inline-flex');

    if (health.status === 'stalled') {
      this.pingDotEl.className = 'w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping';
      this.pingTextEl.textContent = 'Lag ⚠️';
      this.pingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 rounded px-1.5 py-0.5 shadow-sm';
    } else if (health.status === 'poor') {
      this.pingDotEl.className = 'w-1.5 h-1.5 rounded-full bg-rose-400';
      this.pingTextEl.textContent = `${health.rtt}ms`;
      this.pingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 rounded px-1.5 py-0.5 shadow-sm';
    } else if (health.status === 'moderate') {
      this.pingDotEl.className = 'w-1.5 h-1.5 rounded-full bg-amber-400';
      this.pingTextEl.textContent = `${health.rtt}ms`;
      this.pingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 rounded px-1.5 py-0.5 shadow-sm';
    } else {
      this.pingDotEl.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400';
      this.pingTextEl.textContent = `${health.rtt || 28}ms`;
      this.pingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 rounded px-1.5 py-0.5 shadow-sm';
    }

    if (this.peerAwayBannerEl) {
      if (!health.isPeerVisible) {
        this.peerAwayBannerEl.classList.remove('hidden');
      } else {
        this.peerAwayBannerEl.classList.add('hidden');
      }
    }
  }

  private broadcastState(): void {
    if (!this.session.peer || this.session.mode !== 'online' || !this.session.peer.isConnected) return;
    if (this.engine.isGameOver) return; // Suppress broadcasts once match is concluded
    const p = this.engine.player;

    const msg: DashNetworkMessage = {
      type: 'DASH_SYNC',
      distance: p.distance,
      speed: p.speed,
      lane: p.lane,
      currentX: p.currentX,
      jumpY: p.jumpY,
      isJumping: p.isJumping,
      isSliding: p.isSliding,
      hearts: p.hearts,
      invulnerable: p.invulnerableTimer > 0,
      stumbling: p.stumbleTimer > 0,
      isTurbo: p.isTurbo,
      hasShield: p.hasShield,
      heldItem: p.heldItem,
      timestamp: performance.now()
    };
    this.session.peer.sendMessage(msg);
  }

  private handleNetworkMessage(msg: DashNetworkMessage): void {
    if (!msg || !msg.type) return;

    if (msg.type === 'PLAYER_LEAVE') {
      this.handleForfeitVictory('Opponent forfeited the match.');
      return;
    } else if (msg.type === 'DASH_REQUEST_SEED') {
      if (this.session.peer?.role === 'host' && this.session.peer.isConnected) {
        this.session.peer.sendMessage({
          type: 'DASH_READY',
          seed: this.engine.track.getSeed()
        });
      }
      return;
    } else if (msg.type === 'DASH_READY') {
      if (!this.isInitialSeedSynced) {
        this.isInitialSeedSynced = true;
        this.startNewMatch(msg.seed);
      }
      return;
    } else if (msg.type === 'DASH_REMATCH_REQUEST' || msg.type === 'REMATCH_REQUEST') {
      this.showRematchOffer();
      return;
    } else if (msg.type === 'DASH_REMATCH_ACCEPT' || msg.type === 'REMATCH_ACCEPT' || msg.type === 'DASH_REMATCH') {
      this.startNewMatch(msg.seed);
      return;
    } else if (msg.type === 'DASH_ACTION') {
      const opp = this.engine.opponent;
      if (msg.action === 'MOVE_LEFT') {
        opp.lane = Math.max(-1, opp.lane - 1) as Lane;
        this.remoteTargetLane = opp.lane;
        this.remoteTargetX = opp.lane;
        sounds.playMove();
      } else if (msg.action === 'MOVE_RIGHT') {
        opp.lane = Math.min(1, opp.lane + 1) as Lane;
        this.remoteTargetLane = opp.lane;
        this.remoteTargetX = opp.lane;
        sounds.playMove();
      } else if (msg.action === 'JUMP') {
        opp.isJumping = true;
        opp.isSliding = false;
        opp.slideTimer = 0;
        opp.jumpVy = 4.4;
        this.remoteTargetJumpY = 1.0;
        sounds.playDashJump();
      } else if (msg.action === 'SLIDE') {
        opp.isSliding = true;
        opp.isJumping = false;
        opp.slideTimer = 0.75;
        this.remoteTargetJumpY = 0;
        sounds.playDashSlide();
      }
    } else if (msg.type === 'DASH_SYNC') {
      const opp = this.engine.opponent;
      // Target state update for smooth dead reckoning & LERP
      this.remoteTargetDistance = msg.distance;
      this.remoteTargetSpeed = msg.speed;
      this.remoteTargetLane = msg.lane;
      this.remoteTargetX = msg.currentX;
      this.remoteTargetJumpY = msg.jumpY;
      this.remoteLastSyncTime = performance.now();

      opp.isJumping = msg.isJumping;
      opp.isSliding = msg.isSliding;
      opp.hearts = msg.hearts;
      opp.isTurbo = msg.isTurbo;
      opp.hasShield = msg.hasShield;
      opp.heldItem = msg.heldItem;
      if (opp.hearts <= 0) opp.isDead = true;
      this.updateHUD();
    } else if (msg.type === 'DASH_ITEM_DROP') {
      this.engine.track.addDynamicItem('SODA_SPILL', msg.z, msg.lane);
    } else if (msg.type === 'DASH_EVENT') {
      this.showRivalBubble(msg.title, msg.message, msg.icon);
    } else if (msg.type === 'DASH_GAME_OVER') {
      this.engine.opponent.isDead = true;
      this.engine.opponent.hearts = 0;
      if (!this.engine.isGameOver) {
        this.handleGameOver('player');
      }
    }
  }

  private useItem(): void {
    const item = this.engine.player.heldItem;
    if (!item) return;
    const dropZ = Math.max(0, this.engine.player.distance - 2.5);
    const dropLane = this.engine.player.lane;
    this.engine.useHeldItem('player');
    this.updateItemButton();

    if (item === 'SODA_SPILL' && this.session.mode === 'online' && this.session.peer?.isConnected) {
      this.session.peer.sendMessage({
        type: 'DASH_ITEM_DROP',
        itemType: 'SODA_SPILL',
        z: dropZ,
        lane: dropLane
      });
    }
  }

  public showRivalBubble(title: string, message: string, icon: string = '🥷', iconBg: string = 'from-rose-500 to-amber-500'): void {
    if (!this.rivalBubbleEl || !this.bubbleLine1El || !this.bubbleLine2El || !this.bubbleIconEl) return;

    this.bubbleLine1El.innerHTML = `<span>${title}</span><span class="text-[9px] text-slate-400 font-normal">JUST NOW</span>`;
    this.bubbleLine2El.textContent = message;
    this.bubbleIconEl.textContent = icon;
    this.bubbleIconEl.className = `flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br ${iconBg} flex items-center justify-center text-sm shadow-md`;

    this.rivalBubbleEl.classList.remove('opacity-0', '-translate-y-2');
    this.rivalBubbleEl.classList.add('opacity-100', 'translate-y-0');

    if (this.bubbleHideTimer !== null) {
      window.clearTimeout(this.bubbleHideTimer);
    }
    this.bubbleHideTimer = window.setTimeout(() => {
      this.rivalBubbleEl.classList.remove('opacity-100', 'translate-y-0');
      this.rivalBubbleEl.classList.add('opacity-0', '-translate-y-2');
      this.bubbleHideTimer = null;
    }, 3200);
  }

  private broadcastRivalEvent(title: string, message: string, icon: string = '🥷', _iconBg?: string): void {
    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      this.session.peer.sendMessage({
        type: 'DASH_EVENT',
        title,
        message,
        icon
      });
    }
  }

  // -------------------------------------------------------------
  // MAIN GAME LOOP
  // -------------------------------------------------------------

  private startLoop(): void {
    const loop = (time: number) => {
      const dt = Math.max(0.001, Math.min((time - this.lastTime) / 1000, 0.1));
      this.lastTime = time;

      // 1. In online mode: Dead reckoning & liquid exponential LERP smoothing for remote opponent
      if (this.session.mode === 'online' && !this.engine.opponent.isDead) {
        const opp = this.engine.opponent;

        // Advance remote target distance using dead reckoning if packet was received recently (< 2.0s)
        const isStalled = time - this.remoteLastSyncTime > 2000;
        if (!isStalled) {
          this.remoteTargetDistance += this.remoteTargetSpeed * dt;
        }

        // Smoothly blend distance toward target (exact frame-rate independent exponential decay)
        const distDiff = this.remoteTargetDistance - opp.distance;
        if (Math.abs(distDiff) > 6.0) {
          opp.distance = this.remoteTargetDistance;
        } else {
          opp.distance += distDiff * (1 - Math.exp(-14.0 * dt));
        }

        // Smoothly blend lateral position toward target
        const xDiff = this.remoteTargetX - opp.currentX;
        opp.currentX += xDiff * (1 - Math.exp(-18.0 * dt));

        // Smoothly blend vertical jump position toward target
        const yDiff = this.remoteTargetJumpY - opp.jumpY;
        opp.jumpY += yDiff * (1 - Math.exp(-22.0 * dt));

        opp.speed = this.remoteTargetSpeed;
        opp.lane = this.remoteTargetLane;
      }

      // 2. Update AI (offline only)
      if (this.ai) {
        this.ai.update(dt);
      }

      // 3. Update Physics & Simulation
      // In online mode, skip local engine simulation of opponent as remote peer + dead reckoning is authoritative
      this.engine.update(dt, this.session.mode === 'online');

      // Track Max Speed
      const kmh = Math.floor(this.engine.player.speed * 3.6);
      if (kmh > this.maxSpeedReached) {
        this.maxSpeedReached = kmh;
      }

      // Render 3D Canvas
      this.renderer.render(dt);

      // Update UI HUD
      this.updateHUD();

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  // -------------------------------------------------------------
  // HUD & GAME OVER
  // -------------------------------------------------------------

  private updateHUD(): void {
    // Render Hearts
    const playerHeartsHtml = this.renderHeartsHtml(this.engine.player.hearts);
    const opponentHeartsHtml = this.renderHeartsHtml(this.engine.opponent.hearts);

    if (this.playerHeartsEl.innerHTML !== playerHeartsHtml) {
      this.playerHeartsEl.innerHTML = playerHeartsHtml;
    }
    if (this.opponentHeartsEl.innerHTML !== opponentHeartsHtml) {
      this.opponentHeartsEl.innerHTML = opponentHeartsHtml;
    }

    // Distance Meters (Dirty checked)
    const pDist = Math.floor(this.engine.player.distance);
    if (pDist !== this.lastPDist) {
      this.lastPDist = pDist;
      this.playerDistEl.textContent = `${pDist} m`;
      this.obstaclesDodged = Math.max(this.obstaclesDodged, Math.floor(pDist / 16));
    }

    const oDist = Math.floor(this.engine.opponent.distance);
    if (oDist !== this.lastODist) {
      this.lastODist = oDist;
      this.opponentDistEl.textContent = `${oDist} m`;
    }

    // Speedometer (Dirty checked)
    const kmh = Math.floor(this.engine.player.speed * 3.6);
    if (kmh !== this.lastKmh) {
      this.lastKmh = kmh;
      this.playerSpeedEl.textContent = `${kmh} km/h`;
    }

    // Lead Badge (Dirty checked)
    const lead = pDist - oDist;
    let leadText = '';
    let leadClass = '';
    if (Math.abs(lead) < 3) {
      leadText = '⚡ NECK & NECK!';
      leadClass = 'px-3 py-1 rounded-full text-xs font-black tracking-wide bg-white dark:bg-slate-900/90 text-amber-600 dark:text-amber-400 border border-amber-300/40 dark:border-amber-500/30 shadow-lg backdrop-blur-md';
    } else if (lead > 0) {
      leadText = `🚀 +${lead}m AHEAD`;
      leadClass = 'px-3 py-1 rounded-full text-xs font-black tracking-wide bg-white dark:bg-slate-900/90 text-cyan-600 dark:text-cyan-400 border border-cyan-300/40 dark:border-cyan-500/30 shadow-lg backdrop-blur-md';
    } else {
      leadText = `⚠️ ${Math.abs(lead)}m BEHIND`;
      leadClass = 'px-3 py-1 rounded-full text-xs font-black tracking-wide bg-white dark:bg-slate-900/90 text-rose-600 dark:text-rose-400 border border-rose-300/40 dark:border-rose-500/30 shadow-lg backdrop-blur-md';
    }

    if (this.lastLeadText !== leadText) {
      this.lastLeadText = leadText;
      this.leadBadgeEl.textContent = leadText;
    }
    if (this.lastLeadClass !== leadClass) {
      this.lastLeadClass = leadClass;
      this.leadBadgeEl.className = leadClass;
    }

    // Item Button (Dirty checked by heldItem)
    const item = this.engine.player.heldItem;
    if (item !== this.lastHeldItem) {
      this.lastHeldItem = item;
      this.updateItemButton();
    }
  }

  private renderHeartsHtml(hearts: number): string {
    const full = '❤️'.repeat(Math.max(0, hearts));
    const empty = '🤍'.repeat(Math.max(0, 3 - hearts));
    return full + empty;
  }

  private updateItemButton(): void {
    const item = this.engine.player.heldItem;
    if (!item) {
      this.itemBtnEl.textContent = 'NO ITEM';
      this.itemBtnEl.className = 'absolute bottom-4 right-4 z-20 px-4 py-3 rounded-2xl font-black text-xs sm:text-sm tracking-wide bg-slate-900/80 text-slate-500 border border-slate-700/60 opacity-40 pointer-events-none transition-all select-none shadow-md backdrop-blur-sm';
      return;
    }

    this.itemBtnEl.classList.remove('opacity-40', 'pointer-events-none');
    switch (item) {
      case 'FIZZ_TURBO':
        this.itemBtnEl.textContent = '🚀 ROCKET BOOST';
        this.itemBtnEl.className = 'absolute bottom-4 right-4 z-20 px-4 py-3 rounded-2xl font-black text-xs sm:text-sm tracking-wide bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white shadow-xl shadow-orange-500/40 border border-amber-300 active:scale-95 transition-all select-none cursor-pointer animate-pulse backdrop-blur-sm';
        break;
      case 'BUBBLE_SHIELD':
        this.itemBtnEl.textContent = '🛡️ BUBBLE SHIELD';
        this.itemBtnEl.className = 'absolute bottom-4 right-4 z-20 px-4 py-3 rounded-2xl font-black text-xs sm:text-sm tracking-wide bg-gradient-to-r from-sky-400 to-blue-600 text-white shadow-xl shadow-sky-500/40 border border-sky-300 active:scale-95 transition-all select-none cursor-pointer backdrop-blur-sm';
        break;
      case 'SODA_SPILL':
        this.itemBtnEl.textContent = '🛢️ CALTROPS TRAP';
        this.itemBtnEl.className = 'absolute bottom-4 right-4 z-20 px-4 py-3 rounded-2xl font-black text-xs sm:text-sm tracking-wide bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-xl shadow-purple-500/40 border border-purple-300 active:scale-95 transition-all select-none cursor-pointer backdrop-blur-sm';
        break;
    }
  }

  private handleGameOver(winner: 'player' | 'opponent' | 'draw'): void {
    if (this.gameOverModalEl && !this.gameOverModalEl.classList.contains('hidden')) {
      return;
    }

    const duration = Math.floor((Date.now() - this.startTime) / 1000);
    const pDist = Math.floor(this.engine.player.distance);
    const oDist = Math.floor(this.engine.opponent.distance);

    this.gameOverTitleEl.textContent = winner === 'player' ? 'VICTORY!' : winner === 'draw' ? 'DRAW!' : 'DEFEATED!';
    this.gameOverTitleEl.className = `text-2xl sm:text-3xl font-black tracking-tight mb-2 ${
      winner === 'player' ? 'text-cyan-400' : winner === 'draw' ? 'text-amber-400' : 'text-rose-400'
    }`;

    const iconEl = document.getElementById('dash-winner-icon');
    if (iconEl) {
      iconEl.textContent = winner === 'player' ? '🏆' : winner === 'draw' ? '🤝' : '💀';
    }

    const descEl = document.getElementById('dash-winner-desc');
    if (descEl) {
      descEl.textContent = winner === 'player'
        ? 'You outlasted your rival!'
        : winner === 'draw'
        ? 'Simultaneous wipeout! Incredible duel.'
        : 'Your rival outlasted you. Better luck next time!';
    }

    this.gameOverStatsEl.innerHTML = `
      <div class="flex justify-between text-slate-600 dark:text-slate-300"><span>Distance Run:</span> <b class="font-mono text-slate-900 dark:text-white">${pDist} m</b></div>
      <div class="flex justify-between text-slate-600 dark:text-slate-300"><span>Rival Distance:</span> <b class="font-mono text-slate-900 dark:text-white">${oDist} m</b></div>
      <div class="flex justify-between text-slate-600 dark:text-slate-300"><span>Peak Speed:</span> <b class="font-mono text-slate-900 dark:text-white">${this.maxSpeedReached} km/h</b></div>
      <div class="flex justify-between text-slate-600 dark:text-slate-300"><span>Obstacles Dodged:</span> <b class="font-mono text-slate-900 dark:text-white">${this.obstaclesDodged}</b></div>
      <div class="flex justify-between text-slate-600 dark:text-slate-300"><span>Match Duration:</span> <b class="font-mono text-slate-900 dark:text-white">${duration}s</b></div>
    `;

    const btn = document.getElementById('btn-dash-rematch');
    if (this.rematchState === 'offer_received') {
      this.showRematchOffer();
    } else if (btn) {
      btn.textContent = 'Play Again';
      btn.classList.remove('opacity-70', 'cursor-not-allowed', 'animate-pulse', 'pointer-events-none');
      btn.className = 'w-full py-3 px-6 rounded-xl font-black tracking-wider uppercase text-white bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/30 active:scale-95 transition-all cursor-pointer';
    }

    this.gameOverModalEl.classList.remove('hidden');

    if (winner === 'player') {
      sounds.playFanfare();
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
    } else {
      sounds.playInvalidBuzz();
    }

    // Broadcast online game over
    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      this.session.peer.sendMessage({
        type: 'DASH_GAME_OVER',
        loserId: winner === 'player' ? 'opponent' : 'player',
        finalDistance: Math.floor(this.engine.player.distance)
      });
    }
  }

  private handleRematch(): void {
    const btn = document.getElementById('btn-dash-rematch');

    if (this.session.mode !== 'online') {
      this.startNewMatch();
      return;
    }

    if (this.rematchState === 'offer_received') {
      const seed = Date.now();
      if (this.session.peer?.isConnected) {
        this.session.peer.sendMessage({ type: 'DASH_REMATCH_ACCEPT', seed });
        this.session.peer.sendMessage({ type: 'REMATCH_ACCEPT', seed });
      }
      this.startNewMatch(seed);
    } else if (this.rematchState === 'idle') {
      this.rematchState = 'requested';
      if (btn) {
        btn.textContent = 'Waiting for Opponent...';
        btn.classList.add('opacity-70', 'cursor-not-allowed');
      }
      if (this.session.peer?.isConnected) {
        this.session.peer.sendMessage({ type: 'DASH_REMATCH_REQUEST' });
        this.session.peer.sendMessage({ type: 'REMATCH_REQUEST' });
      }
    }
  }

  private showRematchOffer(): void {
    if (this.rematchState === 'requested') {
      // Both clicked rematch!
      const seed = Date.now();
      if (this.session.peer?.role === 'host') {
        if (this.session.peer?.isConnected) {
          this.session.peer.sendMessage({ type: 'DASH_REMATCH_ACCEPT', seed });
          this.session.peer.sendMessage({ type: 'REMATCH_ACCEPT', seed });
        }
        this.startNewMatch(seed);
      }
      return;
    }

    this.rematchState = 'offer_received';
    const btn = document.getElementById('btn-dash-rematch');
    if (btn) {
      btn.textContent = 'Accept Rematch!';
      btn.classList.remove('opacity-70', 'cursor-not-allowed');
      btn.className = 'w-full py-3 px-6 rounded-xl font-black tracking-wider uppercase text-white bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 shadow-lg shadow-emerald-500/30 active:scale-95 transition-all cursor-pointer animate-pulse';
    }
    sounds.playRoundComplete();
  }

  private startNewMatch(seed?: number): void {
    this.rematchState = 'idle';
    this.gameOverModalEl.classList.add('hidden');

    const btn = document.getElementById('btn-dash-rematch');
    if (btn) {
      btn.textContent = 'Play Again';
      btn.classList.remove('opacity-70', 'cursor-not-allowed', 'animate-pulse', 'pointer-events-none');
      btn.className = 'w-full py-3 px-6 rounded-xl font-black tracking-wider uppercase text-white bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/30 active:scale-95 transition-all cursor-pointer';
    }

    const newSeed = seed !== undefined ? seed : Date.now();
    this.engine.reset(newSeed);
    this.renderer.reset();
    this.ai?.reset();

    this.remoteTargetDistance = 0;
    this.remoteTargetSpeed = 16;
    this.remoteTargetLane = 1;
    this.remoteTargetX = 1;
    this.remoteTargetJumpY = 0;
    this.remoteLastSyncTime = performance.now();
    this.lastTime = performance.now();
    this.startTime = Date.now();
    this.obstaclesDodged = 0;
    this.maxSpeedReached = 0;
    this.lastPDist = -1;
    this.lastODist = -1;
    this.lastKmh = -1;
    this.lastLeadText = '';
    this.lastLeadClass = '';
    this.lastHeldItem = '__init__';
    this.updateHUD();
  }

  private handleForfeitVictory(reason: string): void {
    if (this.engine.isGameOver && this.gameOverModalEl && !this.gameOverModalEl.classList.contains('hidden')) {
      return;
    }

    this.engine.isGameOver = true;
    this.engine.winner = 'player';
    this.engine.opponent.isDead = true;
    this.engine.opponent.hearts = 0;

    sounds.playFanfare();
    confetti({ particleCount: 100, spread: 80, origin: { y: 0.5 } });

    const duration = Math.floor((Date.now() - this.startTime) / 1000);
    const pDist = Math.floor(this.engine.player.distance);
    const oDist = Math.floor(this.engine.opponent.distance);

    this.gameOverTitleEl.textContent = 'VICTORY BY FORFEIT!';
    this.gameOverTitleEl.className = 'text-2xl sm:text-3xl font-black tracking-tight mb-2 text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500';

    const iconEl = document.getElementById('dash-winner-icon');
    if (iconEl) iconEl.textContent = '🏆';

    const descEl = document.getElementById('dash-winner-desc');
    if (descEl) descEl.textContent = reason;

    this.gameOverStatsEl.innerHTML = `
      <div class="flex justify-between text-slate-600 dark:text-slate-300"><span>Distance Run:</span> <b class="font-mono text-slate-900 dark:text-white">${pDist} m</b></div>
      <div class="flex justify-between text-slate-600 dark:text-slate-300"><span>Rival Distance:</span> <b class="font-mono text-slate-900 dark:text-white">${oDist} m</b></div>
      <div class="flex justify-between text-slate-600 dark:text-slate-300"><span>Peak Speed:</span> <b class="font-mono text-slate-900 dark:text-white">${this.maxSpeedReached} km/h</b></div>
      <div class="flex justify-between text-slate-600 dark:text-slate-300"><span>Obstacles Dodged:</span> <b class="font-mono text-slate-900 dark:text-white">${this.obstaclesDodged}</b></div>
      <div class="flex justify-between text-slate-600 dark:text-slate-300"><span>Match Duration:</span> <b class="font-mono text-slate-900 dark:text-white">${duration}s</b></div>
    `;

    const btn = document.getElementById('btn-dash-rematch');
    if (btn) {
      btn.textContent = 'Opponent Disconnected';
      btn.classList.add('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
      btn.classList.remove('animate-pulse');
    }

    this.gameOverModalEl.classList.remove('hidden');
  }

  // -------------------------------------------------------------
  // LIFECYCLE
  // -------------------------------------------------------------

  public setTheme(theme: AppTheme): void {
    this.session.theme = theme;
    const isDark = theme === 'dark';
    this.container.className = 'w-full h-full p-0 m-0 overflow-hidden flex justify-center ' + (isDark ? 'bg-[#0a0c13]' : 'bg-slate-100');
    document.body.style.backgroundColor = isDark ? '#0a0c13' : '#f1f5f9';
  }

  public destroy(): void {
    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      this.session.peer.sendMessage({ type: 'PLAYER_LEAVE' });
    }

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.syncIntervalId !== null) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
    if (this.bubbleHideTimer !== null) {
      clearTimeout(this.bubbleHideTimer);
      this.bubbleHideTimer = null;
    }

    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('resize', this.boundResize);

    const viewport = this.canvas?.parentElement;
    if (viewport) {
      viewport.removeEventListener('touchstart', this.boundTouchStart);
      viewport.removeEventListener('touchend', this.boundTouchEnd);
    }

    this.ai?.destroy();
    if ((window as any).__sodaDashGame === this) {
      delete (window as any).__sodaDashGame;
    }
    document.body.style.backgroundColor = '';
  }
}
