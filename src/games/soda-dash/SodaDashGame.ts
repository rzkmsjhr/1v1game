import type { AppTheme, GameInstance, GameSession } from '../types';
import type { DashNetworkMessage } from './soda-dash-types';
import type { NetworkMessage } from '../../network/webrtc-peer';
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

  // Touch gesture tracking
  private touchStartX: number = 0;
  private touchStartY: number = 0;
  private touchStartTime: number = 0;
  private lastTapTime: number = 0;

  // Stats
  private obstaclesDodged: number = 0;
  private maxSpeedReached: number = 0;
  private startTime: number = 0;

  private boundKeyDown = this.handleKeyDown.bind(this);
  private boundTouchStart = this.handleTouchStart.bind(this);
  private boundTouchEnd = this.handleTouchEnd.bind(this);
  private boundResize = this.handleResize.bind(this);

  constructor(container: HTMLElement, session: GameSession) {
    this.container = container;
    this.session = session;

    // Seed matching: host chooses seed or online syncs seed
    const initialSeed = Date.now();
    this.engine = new SodaDashEngine(initialSeed);

    this.mountUI();
    this.initCanvasAndRenderer();
    this.initControls();
    this.initNetworking();

    if (session.mode === 'ai') {
      this.ai = new SodaDashAI(this.engine, session.aiDifficulty || 'medium');
    }

    this.startTime = Date.now();
    this.lastTime = performance.now();
    this.startLoop();
  }

  // -------------------------------------------------------------
  // UI MOUNTING
  // -------------------------------------------------------------

  private mountUI(): void {
    const isDark = this.session.theme === 'dark';
    const isOnline = this.session.mode === 'online';
    const diff = this.session.aiDifficulty ? this.session.aiDifficulty.toUpperCase() : 'PVP';

    this.container.innerHTML = `
      <div class="relative w-full h-screen max-h-screen flex flex-col items-center justify-between overflow-hidden select-none bg-slate-950 font-sans">
        
        <!-- Top Navigation & Status Bar -->
        <div class="w-full max-w-5xl px-3 py-2 z-20 flex items-center justify-between pointer-events-auto">
          <!-- Back button & Mode Tag -->
          <div class="flex items-center space-x-2">
            <button id="btn-dash-exit" class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all bg-slate-800/90 text-slate-200 hover:bg-slate-700 active:scale-95 flex items-center space-x-1 shadow-md border border-slate-700/60 backdrop-blur-md">
              <span>← Hub</span>
            </button>
            <div class="px-2.5 py-1 rounded-lg text-[10px] font-black tracking-wider uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
              ⚡ SODA RUSH • ${diff}
            </div>
          </div>

          <!-- Real-Time Distance Lead Badge -->
          <div id="dash-lead-badge" class="px-3 py-1 rounded-full text-xs font-black tracking-wide bg-slate-900/90 text-cyan-400 border border-cyan-500/30 shadow-lg backdrop-blur-md">
            STARTING...
          </div>

          <!-- Quick Audio Toggle -->
          <div class="flex items-center space-x-1.5">
            <button id="btn-dash-sound" class="p-2 rounded-xl text-xs bg-slate-800/90 text-slate-300 hover:bg-slate-700 border border-slate-700/60 shadow-md">
              🔊
            </button>
          </div>
        </div>

        <!-- In-Game HUD: Dual Hearts & Distance Meters -->
        <div class="w-full max-w-5xl px-3 z-20 grid grid-cols-2 gap-3 pointer-events-none">
          
          <!-- Player Health & Distance Card -->
          <div class="p-2.5 sm:p-3 rounded-2xl bg-slate-900/85 border border-cyan-500/40 shadow-xl backdrop-blur-md flex flex-col space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-black tracking-wider text-cyan-400 uppercase">YOU (CYAN)</span>
              <div id="player-hearts" class="text-sm sm:text-base tracking-widest text-red-500 flex items-center space-x-0.5">
                ❤️ ❤️ ❤️
              </div>
            </div>
            <div class="flex items-baseline justify-between pt-0.5">
              <div id="player-dist" class="text-lg sm:text-2xl font-black font-mono text-white tracking-tight">0 m</div>
              <div id="player-speed" class="text-[10px] sm:text-xs font-bold font-mono text-cyan-300">100 km/h</div>
            </div>
          </div>

          <!-- Opponent Health & Distance Card -->
          <div class="p-2.5 sm:p-3 rounded-2xl bg-slate-900/85 border border-rose-500/40 shadow-xl backdrop-blur-md flex flex-col space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-black tracking-wider text-rose-400 uppercase">${isOnline ? 'OPPONENT' : `BOT (${diff})`}</span>
              <div id="opponent-hearts" class="text-sm sm:text-base tracking-widest text-red-500 flex items-center space-x-0.5">
                ❤️ ❤️ ❤️
              </div>
            </div>
            <div class="flex items-baseline justify-between pt-0.5">
              <div id="opponent-dist" class="text-lg sm:text-2xl font-black font-mono text-white tracking-tight">0 m</div>
              <div class="text-[10px] sm:text-xs font-bold text-rose-300">RIVAL</div>
            </div>
          </div>

        </div>

        <!-- Main 3D Canvas Viewport -->
        <div class="relative flex-1 w-full flex items-center justify-center overflow-hidden touch-none">
          <canvas id="dash-canvas" class="w-full h-full block"></canvas>
          
          <!-- Desktop Keyboard Hint (hidden on touch devices) -->
          <div class="hidden sm:flex absolute bottom-4 left-6 z-10 pointer-events-none items-center space-x-2 text-[11px] font-semibold text-slate-400/80 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800">
            <span>Keys: [A/D] or [←/→] Lane • [W/Space] Jump • [S/↓] Slide • [E] Item</span>
          </div>

          <!-- Touch Item Slot Button -->
          <button id="btn-use-item" class="absolute bottom-6 right-6 z-20 px-4 py-3 rounded-2xl font-black text-xs sm:text-sm tracking-wide bg-gradient-to-r from-amber-500 to-yellow-400 text-amber-950 shadow-xl shadow-amber-500/30 border border-yellow-300 active:scale-95 transition-all opacity-40 pointer-events-none">
            EMPTY ITEM
          </button>
        </div>

        <!-- Mobile Touch Bar (Directional Tap Controls) -->
        <div class="sm:hidden w-full px-3 py-3 z-20 grid grid-cols-4 gap-2 pointer-events-auto bg-slate-950/80 border-t border-slate-800/80 backdrop-blur-md">
          <button id="touch-left" class="py-3 rounded-xl bg-slate-800 text-slate-200 font-bold text-lg active:bg-slate-700 active:scale-95 shadow border border-slate-700">←</button>
          <button id="touch-jump" class="py-3 rounded-xl bg-cyan-700 text-white font-black text-xs active:bg-cyan-600 active:scale-95 shadow border border-cyan-500/60">JUMP ⬆</button>
          <button id="touch-slide" class="py-3 rounded-xl bg-amber-700 text-white font-black text-xs active:bg-amber-600 active:scale-95 shadow border border-amber-500/60">SLIDE ⬇</button>
          <button id="touch-right" class="py-3 rounded-xl bg-slate-800 text-slate-200 font-bold text-lg active:bg-slate-700 active:scale-95 shadow border border-slate-700">→</button>
        </div>

        <!-- Game Over Modal -->
        <div id="modal-dash-gameover" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md hidden">
          <div class="w-full max-w-sm rounded-3xl p-6 sm:p-8 text-center shadow-2xl border ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-800 bg-slate-900'} text-white animate-in fade-in zoom-in-95 duration-200">
            <div id="dash-winner-emoji" class="text-5xl sm:text-6xl mb-3">🏆</div>
            <h2 id="dash-winner-title" class="text-2xl sm:text-3xl font-black tracking-tight mb-2 text-yellow-400">VICTORY!</h2>
            <p id="dash-winner-sub" class="text-xs text-slate-400 mb-5 font-medium">You outlasted your rival on the infinite highway!</p>
            
            <div id="dash-stats-box" class="rounded-2xl p-4 mb-6 bg-slate-950 border border-slate-800 text-left space-y-2 text-xs font-mono text-slate-300">
              <!-- Dynamic stats -->
            </div>

            <div class="space-y-2.5">
              <button id="btn-dash-rematch" class="w-full py-3.5 rounded-2xl font-black text-sm tracking-wide bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/30 hover:brightness-110 active:scale-98 transition-all">
                PLAY AGAIN
              </button>
              <button id="btn-dash-exit-modal" class="w-full py-2.5 rounded-xl font-bold text-xs text-slate-400 hover:text-white transition-all">
                Exit to Hub
              </button>
            </div>
          </div>
        </div>

      </div>
    `;

    // Cache elements
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

    // Header buttons
    document.getElementById('btn-dash-exit')?.addEventListener('click', () => this.session.onExit());
    document.getElementById('btn-dash-exit-modal')?.addEventListener('click', () => this.session.onExit());
    document.getElementById('btn-dash-rematch')?.addEventListener('click', () => this.handleRematch());

    document.getElementById('btn-dash-sound')?.addEventListener('click', () => {
      const enabled = sounds.toggleMute();
      const btn = document.getElementById('btn-dash-sound');
      if (btn) btn.textContent = enabled ? '🔊' : '🔇';
    });

    // Touch bar buttons
    document.getElementById('touch-left')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.engine.moveLeft('player');
    });
    document.getElementById('touch-right')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.engine.moveRight('player');
    });
    document.getElementById('touch-jump')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.engine.jump('player');
    });
    document.getElementById('touch-slide')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.engine.slide('player');
    });
    this.itemBtnEl.addEventListener('click', () => {
      this.engine.useHeldItem('player');
      this.updateItemButton();
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
      if (evt.type === 'HIT_DAMAGE') {
        const x = this.canvas.width * 0.5;
        const y = this.canvas.height * 0.7;
        this.renderer.addSplash(x, y, '#ef4444', 20);
        this.renderer.addFloatingText('-1 ❤️', x, y - 40, '#ef4444');
      } else if (evt.type === 'HEAL') {
        const x = this.canvas.width * 0.5;
        const y = this.canvas.height * 0.7;
        this.renderer.addSplash(x, y, '#22c55e', 24);
        this.renderer.addFloatingText('+1 ❤️', x, y - 40, '#22c55e');
      } else if (evt.type === 'BOOST' || evt.type === 'TURBO_SMASH') {
        const x = this.canvas.width * 0.5;
        const y = this.canvas.height * 0.7;
        this.renderer.addSplash(x, y, '#f59e0b', 16);
      } else if (evt.type === 'STUMBLE') {
        const x = this.canvas.width * 0.5;
        const y = this.canvas.height * 0.7;
        this.renderer.addFloatingText('SLIP!', x, y - 30, '#a855f7');
      }
      this.updateHUD();
    };

    this.engine.onGameOver = (winner) => {
      this.handleGameOver(winner);
    };
  }

  private handleResize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.floor(rect.width || window.innerWidth);
    const h = Math.floor(rect.height || (window.innerHeight - 130));

    this.canvas.width = Math.max(320, w) * dpr;
    this.canvas.height = Math.max(300, h) * dpr;
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

    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault();
        this.engine.moveLeft('player');
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault();
        this.engine.moveRight('player');
        break;
      case 'ArrowUp':
      case 'w':
      case 'W':
      case ' ':
        e.preventDefault();
        this.engine.jump('player');
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault();
        this.engine.slide('player');
        break;
      case 'e':
      case 'E':
      case 'Shift':
        e.preventDefault();
        this.engine.useHeldItem('player');
        this.updateItemButton();
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
      this.engine.useHeldItem('player');
      this.updateItemButton();
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
        } else {
          this.engine.moveRight('player');
        }
      } else {
        // Vertical swipe
        if (dy < 0) {
          this.engine.jump('player');
        } else {
          this.engine.slide('player');
        }
      }
    }
  }

  // -------------------------------------------------------------
  // NETWORKING & MULTIPLAYER
  // -------------------------------------------------------------

  private initNetworking(): void {
    if (this.session.mode !== 'online' || !this.session.peer) return;

    const peer = this.session.peer;
    const origOnMessage = peer.events?.onMessage;

    peer.events = {
      ...peer.events,
      onMessage: (raw: NetworkMessage) => {
        origOnMessage?.(raw);
        this.handleNetworkMessage(raw as any);
      }
    };

    // 20Hz state broadcast interval
    this.syncIntervalId = window.setInterval(() => {
      this.broadcastState();
    }, 50);
  }

  private broadcastState(): void {
    if (!this.session.peer || this.session.mode !== 'online' || !this.session.peer.isConnected) return;
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
      heldItem: p.heldItem
    };
    this.session.peer.sendMessage(msg);
  }

  private handleNetworkMessage(msg: DashNetworkMessage): void {
    if (msg.type === 'DASH_SYNC') {
      const opp = this.engine.opponent;
      opp.distance = msg.distance;
      opp.speed = msg.speed;
      opp.lane = msg.lane;
      opp.currentX = msg.currentX;
      opp.jumpY = msg.jumpY;
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
    } else if (msg.type === 'DASH_GAME_OVER') {
      this.engine.opponent.isDead = true;
      this.engine.opponent.hearts = 0;
      this.handleGameOver('player');
    } else if (msg.type === 'DASH_REMATCH') {
      this.engine.reset(msg.seed);
      this.gameOverModalEl.classList.add('hidden');
      this.updateHUD();
    }
  }

  // -------------------------------------------------------------
  // MAIN GAME LOOP
  // -------------------------------------------------------------

  private startLoop(): void {
    const loop = (time: number) => {
      const dt = Math.min((time - this.lastTime) / 1000, 0.1);
      this.lastTime = time;

      // Update AI
      if (this.ai) {
        this.ai.update(dt);
      }

      // Update Physics & Simulation
      this.engine.update(dt);

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

    // Distance Meters
    const pDist = Math.floor(this.engine.player.distance);
    const oDist = Math.floor(this.engine.opponent.distance);
    this.playerDistEl.textContent = `${pDist} m`;
    this.opponentDistEl.textContent = `${oDist} m`;
    this.obstaclesDodged = Math.max(this.obstaclesDodged, Math.floor(pDist / 16));

    // Speedometer
    const kmh = Math.floor(this.engine.player.speed * 3.6);
    this.playerSpeedEl.textContent = `${kmh} km/h`;

    // Lead Badge
    const lead = pDist - oDist;
    if (Math.abs(lead) < 3) {
      this.leadBadgeEl.textContent = '⚡ NECK & NECK!';
      this.leadBadgeEl.className = 'px-3 py-1 rounded-full text-xs font-black tracking-wide bg-slate-900/90 text-amber-400 border border-amber-500/30 shadow-lg backdrop-blur-md';
    } else if (lead > 0) {
      this.leadBadgeEl.textContent = `🚀 +${lead}m AHEAD`;
      this.leadBadgeEl.className = 'px-3 py-1 rounded-full text-xs font-black tracking-wide bg-slate-900/90 text-cyan-400 border border-cyan-500/30 shadow-lg backdrop-blur-md';
    } else {
      this.leadBadgeEl.textContent = `⚠️ ${Math.abs(lead)}m BEHIND`;
      this.leadBadgeEl.className = 'px-3 py-1 rounded-full text-xs font-black tracking-wide bg-slate-900/90 text-rose-400 border border-rose-500/30 shadow-lg backdrop-blur-md';
    }

    this.updateItemButton();
  }

  private renderHeartsHtml(hearts: number): string {
    let s = '';
    for (let i = 0; i < 3; i++) {
      if (i < hearts) {
        s += '<span class="inline-block transform hover:scale-110 transition-transform">❤️</span>';
      } else {
        s += '<span class="inline-block opacity-25 grayscale">🖤</span>';
      }
    }
    return s;
  }

  private updateItemButton(): void {
    const item = this.engine.player.heldItem;
    if (!item) {
      this.itemBtnEl.textContent = 'NO ITEM';
      this.itemBtnEl.className = 'absolute bottom-6 right-6 z-20 px-4 py-3 rounded-2xl font-black text-xs sm:text-sm tracking-wide bg-slate-800 text-slate-500 border border-slate-700 opacity-40 pointer-events-none transition-all';
    } else {
      const labels: Record<string, string> = {
        FIZZ_TURBO: '⚡ TURBO DASH',
        BUBBLE_SHIELD: '🛡️ SHIELD',
        SODA_SPILL: '🛢️ DROP SPILL'
      };
      this.itemBtnEl.textContent = labels[item] || item;
      this.itemBtnEl.className = 'absolute bottom-6 right-6 z-20 px-4 py-3 rounded-2xl font-black text-xs sm:text-sm tracking-wide bg-gradient-to-r from-amber-500 to-yellow-400 text-amber-950 shadow-xl shadow-amber-500/40 border border-yellow-300 active:scale-95 transition-all opacity-100 cursor-pointer animate-pulse';
    }
  }

  private handleGameOver(winner: 'player' | 'opponent' | 'draw'): void {
    const isVictory = winner === 'player';
    const isDraw = winner === 'draw';

    const title = isVictory ? 'VICTORY!' : isDraw ? 'PHOTO FINISH!' : 'DEFEATED!';
    const emoji = isVictory ? '🏆' : isDraw ? '🤝' : '💥';
    const sub = isVictory
      ? 'Your rival ran out of hearts! You conquered the infinite highway!'
      : isDraw
      ? 'Both runners wiped out at the exact same moment!'
      : 'You ran out of hearts! The road was unforgiving.';

    document.getElementById('dash-winner-emoji')!.textContent = emoji;
    this.gameOverTitleEl.textContent = title;
    this.gameOverTitleEl.className = `text-2xl sm:text-3xl font-black tracking-tight mb-2 ${isVictory ? 'text-yellow-400' : isDraw ? 'text-cyan-400' : 'text-rose-500'}`;
    document.getElementById('dash-winner-sub')!.textContent = sub;

    const durationSec = Math.floor((Date.now() - this.startTime) / 1000);
    const pDist = Math.floor(this.engine.player.distance);
    const oDist = Math.floor(this.engine.opponent.distance);

    this.gameOverStatsEl.innerHTML = `
      <div class="flex justify-between"><span>Your Distance:</span><span class="font-bold text-cyan-400">${pDist} m</span></div>
      <div class="flex justify-between"><span>Rival Distance:</span><span class="font-bold text-rose-400">${oDist} m</span></div>
      <div class="flex justify-between"><span>Top Speed:</span><span class="font-bold text-yellow-400">${this.maxSpeedReached} km/h</span></div>
      <div class="flex justify-between"><span>Obstacles Cleared:</span><span class="font-bold text-amber-400">${this.obstaclesDodged}</span></div>
      <div class="flex justify-between"><span>Survival Time:</span><span class="font-bold text-white">${durationSec}s</span></div>
    `;

    this.gameOverModalEl.classList.remove('hidden');

    if (isVictory) {
      sounds.playRoundComplete();
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
    const newSeed = Date.now();
    this.engine.reset(newSeed);
    this.gameOverModalEl.classList.add('hidden');
    this.startTime = Date.now();
    this.obstaclesDodged = 0;
    this.updateHUD();

    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      this.session.peer.sendMessage({
        type: 'DASH_REMATCH',
        seed: newSeed
      });
    }
  }

  // -------------------------------------------------------------
  // LIFECYCLE
  // -------------------------------------------------------------

  public setTheme(theme: AppTheme): void {
    this.session.theme = theme;
  }

  public destroy(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.syncIntervalId !== null) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }

    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('resize', this.boundResize);

    const viewport = this.canvas?.parentElement;
    if (viewport) {
      viewport.removeEventListener('touchstart', this.boundTouchStart);
      viewport.removeEventListener('touchend', this.boundTouchEnd);
    }

    this.ai?.destroy();
  }
}
