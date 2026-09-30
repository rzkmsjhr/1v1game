import type { GameInstance, GameSession, AppTheme } from '../types';
import type { NetworkMessage, NetworkHealth } from '../../network/webrtc-peer';
import { BombArenaEngine } from './bomb-arena-engine';
import { BombArenaRenderer } from './renderers/BombArenaRenderer';
import { BombArenaAI } from './bomb-arena-ai';
import { BOMB_ARENA_CONSTANTS } from './bomb-arena-constants';
import { sounds } from '../../engine/sound';
import confetti from 'canvas-confetti';

export class BombArenaGame implements GameInstance {
  private container: HTMLElement;
  private session: GameSession;
  private currentTheme: AppTheme;

  private canvas!: HTMLCanvasElement;
  private renderer!: BombArenaRenderer;
  private engine!: BombArenaEngine;
  private ai: BombArenaAI | null = null;

  private animFrameId: number | null = null;
  private lastTime: number = performance.now();
  private startTime: number = Date.now();
  private resizeObserver: ResizeObserver | null = null;

  // Active key state for continuous movement
  private keyState = {
    up: false,
    down: false,
    left: false,
    right: false
  };

  // State & Network
  private opponentName: string = 'Opponent';
  private rematchState: 'idle' | 'requested' | 'offer_received' = 'idle';
  private winnerLocked: boolean = false;
  private localVictoryTimestamp: number = 0;
  private lastMoveBroadcastTime: number = 0;
  private lastHUDUpdateTime: number = 0;
  private cachedStatusText: string = '';

  // Countdown & Round transition timers
  private countdownTimer: number | null = null;
  private nextRoundTimer: number | null = null;

  // Cached DOM elements
  private scoreEl!: HTMLElement;
  private statusBannerEl: HTMLElement | null = null;
  private statusTextEl: HTMLElement | null = null;
  private fenceCountBadge!: HTMLElement;
  private bombCountBadge!: HTMLElement;
  private peerAwayBannerEl: HTMLElement | null = null;
  private pingEl: HTMLElement | null = null;
  private pingDotEl: HTMLElement | null = null;
  private pingTextEl: HTMLElement | null = null;
  private countdownOverlayEl: HTMLElement | null = null;
  private countdownNumberEl: HTMLElement | null = null;
  private countdownSubtitleEl: HTMLElement | null = null;
  private roundOverBannerEl: HTMLElement | null = null;
  private roundOverTextEl: HTMLElement | null = null;
  private gameOverModalEl!: HTMLElement;
  private gameOverTitleEl!: HTMLElement;
  private gameOverStatsEl!: HTMLElement;
  private rematchBtnEl: HTMLButtonElement | null = null;

  // Bound listeners
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private boundResize: () => void;
  private boundBeforeUnload: () => void;

  constructor(container: HTMLElement, session: GameSession) {
    this.container = container;
    this.session = session;
    this.currentTheme = session.theme;

    this.boundKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
    this.boundKeyUp = (e: KeyboardEvent) => this.handleKeyUp(e);
    this.boundResize = () => this.handleResize();
    this.boundBeforeUnload = () => {
      if (this.session.mode === 'online' && this.session.peer?.isConnected) {
        try {
          this.session.peer.sendMessage({ type: 'PLAYER_LEAVE' });
        } catch {}
      }
    };
    window.addEventListener('beforeunload', this.boundBeforeUnload);

    this.mountUI();
    this.initEngineAndRenderer();
    this.initControls();
    this.setupNetwork();
    this.startLoop();

    if (this.session.mode === 'ai') {
      this.startCountdown();
    }
  }

  // =========================================================================
  // UI MOUNTING
  // =========================================================================
  private mountUI() {
    const isDark = this.currentTheme === 'dark';
    this.container.className =
      'w-full h-[100dvh] max-h-[100dvh] p-0 m-0 overflow-hidden flex justify-center items-center ' +
      (isDark ? 'bg-[#060911]' : 'bg-slate-100');

    this.container.innerHTML = `
      <style>
        @keyframes scale-in {
          0% { transform: scale(0.6); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-scaleIn {
          animation: scale-in 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
        }
      </style>
      <div id="bomb-frame" class="relative w-full max-w-[480px] h-[100dvh] max-h-[100dvh] flex flex-col justify-between overflow-hidden shadow-2xl select-none ${
        isDark ? 'bg-[#0b1120] text-white' : 'bg-white text-slate-900'
      }">

        <!-- TOP BAR: Score, Status & Network Ping -->
        <div id="bomb-top-bar" class="px-3 py-2 flex items-center justify-between border-b ${
          isDark ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 bg-white/95'
        } z-20 shrink-0">
          
          <!-- Exit & Sound buttons -->
          <div class="flex items-center gap-1.5">
            <button id="bomb-btn-exit" class="px-2.5 py-1 text-xs font-bold rounded-lg border transition ${
              isDark ? 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300' : 'border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700'
            } cursor-pointer active:scale-95">
              ← Exit
            </button>
            <button id="bomb-btn-sound" class="p-1 text-xs rounded-lg transition hover:opacity-80 cursor-pointer" title="Toggle Sound">
              🔊
            </button>
          </div>

          <!-- Middle Duel Score Tracker -->
          <div class="flex flex-col items-center">
            <div id="bomb-score" class="font-mono font-black text-xs sm:text-sm tracking-wide">
              <span class="text-cyan-400">YOU: 0</span>
              <span class="text-slate-500 font-normal mx-1.5">vs</span>
              <span class="text-rose-400">RIVAL: 0</span>
            </div>
            <!-- Dynamic Duel Status Banner -->
            <div id="bomb-status-banner" class="flex flex-col items-center px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-center mt-0.5">
              <span id="bomb-status-text" class="text-[9px] sm:text-[10px] font-black tracking-wide text-amber-400 uppercase truncate max-w-[170px]">ROUND 1 • BEST OF 3</span>
            </div>
          </div>

          <!-- Network Ping & Mode Badge -->
          <div class="flex items-center gap-1.5">
            <span id="bomb-net-ping" class="${this.session.mode === 'online' ? 'inline-flex' : 'hidden'} items-center gap-1 text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 rounded px-1.5 py-0.5 shadow-sm">
              <span id="bomb-net-dot" class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span id="bomb-net-text">25ms</span>
            </span>
            <span class="px-2 py-0.5 text-[10px] font-black uppercase rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
              ${this.session.mode === 'online' ? '1v1 Online' : `Bot: ${(this.session.aiDifficulty || 'med').toUpperCase()}`}
            </span>
          </div>
        </div>

        <!-- Inactive Tab / Peer Away Banner -->
        <div id="bomb-peer-away-banner" class="hidden w-full text-center py-1 px-2 bg-amber-500/20 border-b border-amber-500/40 text-amber-300 font-bold text-[10px] tracking-wide animate-pulse z-30 select-none shrink-0">
          ⚠️ Opponent is tabbed out / minimized
        </div>

        <!-- MAIN ARENA CANVAS -->
        <div id="bomb-canvas-wrap" class="relative flex-1 min-h-0 w-full overflow-hidden flex items-center justify-center bg-transparent">
          <canvas id="bomb-canvas" class="w-full h-full block touch-none select-none"></canvas>

          <!-- COUNTDOWN OVERLAY -->
          <div id="bomb-countdown-overlay" class="hidden absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/65 backdrop-blur-sm transition-opacity duration-300 pointer-events-auto">
            <span id="bomb-countdown-number" class="text-7xl sm:text-8xl font-black text-amber-400 drop-shadow-[0_0_30px_rgba(245,158,11,0.9)] animate-scaleIn">3</span>
            <span id="bomb-countdown-subtitle" class="text-xs sm:text-sm font-black tracking-widest uppercase text-amber-200 mt-2 drop-shadow">GET READY!</span>
          </div>

          <!-- ROUND OVER BANNER -->
          <div id="bomb-round-over-banner" class="hidden absolute top-12 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-2xl bg-black/85 backdrop-blur-md border border-amber-400 shadow-2xl text-center">
            <div id="bomb-round-over-text" class="text-xs font-black text-amber-300 tracking-wider uppercase">ROUND WON BY YOU!</div>
          </div>
        </div>

        <!-- BOTTOM CONTROLS DOCK: Option A (D-Pad on Left + 2 Action Buttons on Right) -->
        <div id="bomb-bottom-dock" class="p-2 sm:p-3 border-t ${
          isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-slate-50/95'
        } z-20 shrink-0 flex items-center justify-between gap-2">
          
          <!-- Virtual 4-Way D-Pad -->
          <div class="relative w-28 h-28 shrink-0 flex items-center justify-center select-none touch-none">
            <!-- Up -->
            <button id="dpad-up" class="absolute top-0 left-9 w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-cyan-600 active:scale-95 text-white font-black text-sm flex items-center justify-center border border-slate-700 shadow-md">▲</button>
            <!-- Down -->
            <button id="dpad-down" class="absolute bottom-0 left-9 w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-cyan-600 active:scale-95 text-white font-black text-sm flex items-center justify-center border border-slate-700 shadow-md">▼</button>
            <!-- Left -->
            <button id="dpad-left" class="absolute left-0 top-9 w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-cyan-600 active:scale-95 text-white font-black text-sm flex items-center justify-center border border-slate-700 shadow-md">◀</button>
            <!-- Right -->
            <button id="dpad-right" class="absolute right-0 top-9 w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-cyan-600 active:scale-95 text-white font-black text-sm flex items-center justify-center border border-slate-700 shadow-md">▶</button>
            <!-- Center Pad -->
            <div class="w-7 h-7 rounded-lg bg-slate-900 border border-slate-700"></div>
          </div>

          <!-- Middle Keyboard Hint for Desktop -->
          <div class="hidden sm:flex flex-col items-center text-[10px] text-slate-400 font-mono text-center">
            <span>[WASD / Arrows] Move</span>
            <span>[J / Shift] Place Fence</span>
            <span>[K / Space] Drop Bomb</span>
          </div>

          <!-- Right Action Buttons: Fence & Bomb -->
          <div class="flex items-center gap-2 shrink-0 select-none">
            <!-- [🧱 FENCE] -->
            <button id="bomb-btn-fence" class="relative w-16 sm:w-20 h-20 sm:h-24 rounded-2xl font-black text-xs uppercase flex flex-col items-center justify-center gap-1 text-white bg-gradient-to-b from-amber-600 to-amber-800 active:scale-95 active:from-amber-500 shadow-lg shadow-amber-900/40 border border-amber-500 cursor-pointer">
              <span class="text-2xl">🧱</span>
              <span class="tracking-wider text-[10px]">FENCE</span>
              <span id="badge-fence-count" class="px-1.5 py-0.2 rounded-full bg-black/50 text-[9px] font-mono text-amber-200">3/3</span>
            </button>

            <!-- [💣 BOMB] -->
            <button id="bomb-btn-bomb" class="relative w-16 sm:w-20 h-20 sm:h-24 rounded-2xl font-black text-xs uppercase flex flex-col items-center justify-center gap-1 text-white bg-gradient-to-b from-rose-600 to-rose-900 active:scale-95 active:from-rose-500 shadow-lg shadow-rose-900/40 border border-rose-500 cursor-pointer">
              <span class="text-2xl">💣</span>
              <span class="tracking-wider text-[10px]">BOMB</span>
              <span id="badge-bomb-count" class="px-1.5 py-0.2 rounded-full bg-black/50 text-[9px] font-mono text-rose-200">2/2</span>
            </button>
          </div>

        </div>

        <!-- GAME OVER & REMATCH MODAL -->
        <div id="bomb-game-over-modal" class="hidden absolute inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div class="w-full max-w-sm rounded-3xl p-6 flex flex-col items-center text-center gap-4 shadow-2xl border ${
            isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
          }">
            <div id="bomb-game-over-title" class="text-3xl font-black tracking-tight">🏆 VICTORY!</div>
            <div id="bomb-game-over-stats" class="text-xs text-slate-400 leading-relaxed font-mono w-full">
              <!-- Dynamically populated match stats -->
            </div>
            <div class="flex gap-2 w-full mt-2">
              <button id="bomb-btn-rematch" class="flex-1 py-3 rounded-xl text-xs font-black bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-400 hover:to-blue-500 text-white transition shadow-lg shadow-cyan-500/30 cursor-pointer active:scale-95 uppercase tracking-wide">
                Play Again
              </button>
              <button id="bomb-btn-modal-exit" class="px-4 py-3 rounded-xl text-xs font-black border transition ${
                isDark ? 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300' : 'border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700'
              } cursor-pointer active:scale-95">
                Exit
              </button>
            </div>
          </div>
        </div>

      </div>
    `;

    // Cache elements
    this.scoreEl = document.getElementById('bomb-score')!;
    this.statusBannerEl = document.getElementById('bomb-status-banner');
    this.statusTextEl = document.getElementById('bomb-status-text');
    this.fenceCountBadge = document.getElementById('badge-fence-count')!;
    this.bombCountBadge = document.getElementById('badge-bomb-count')!;
    this.peerAwayBannerEl = document.getElementById('bomb-peer-away-banner');
    this.pingEl = document.getElementById('bomb-net-ping');
    this.pingDotEl = document.getElementById('bomb-net-dot');
    this.pingTextEl = document.getElementById('bomb-net-text');
    this.countdownOverlayEl = document.getElementById('bomb-countdown-overlay');
    this.countdownNumberEl = document.getElementById('bomb-countdown-number');
    this.countdownSubtitleEl = document.getElementById('bomb-countdown-subtitle');
    this.roundOverBannerEl = document.getElementById('bomb-round-over-banner');
    this.roundOverTextEl = document.getElementById('bomb-round-over-text');
    this.gameOverModalEl = document.getElementById('bomb-game-over-modal')!;
    this.gameOverTitleEl = document.getElementById('bomb-game-over-title')!;
    this.gameOverStatsEl = document.getElementById('bomb-game-over-stats')!;
    this.rematchBtnEl = document.getElementById('bomb-btn-rematch') as HTMLButtonElement | null;

    // Exit Button
    const handleExit = () => {
      if (this.session.mode === 'online' && this.session.peer?.isConnected) {
        try {
          this.session.peer.sendMessage({ type: 'PLAYER_LEAVE' });
        } catch {}
      }
      this.session.onExit();
    };
    document.getElementById('bomb-btn-exit')?.addEventListener('click', handleExit);
    document.getElementById('bomb-btn-modal-exit')?.addEventListener('click', handleExit);

    // Sound Toggle
    document.getElementById('bomb-btn-sound')?.addEventListener('click', (e) => {
      const isMuted = !sounds.toggleMute();
      (e.currentTarget as HTMLElement).textContent = isMuted ? '🔇' : '🔊';
    });

    // Rematch Button
    this.rematchBtnEl?.addEventListener('click', () => {
      this.handleRematchClick();
    });
  }

  // =========================================================================
  // ENGINE & RENDERER INITIALIZATION
  // =========================================================================
  private initEngineAndRenderer() {
    this.canvas = document.getElementById('bomb-canvas') as HTMLCanvasElement;
    this.renderer = new BombArenaRenderer(this.canvas, this.currentTheme);
    this.engine = new BombArenaEngine(Date.now());

    // Hook audio events
    this.engine.onFencePlaced = (coord) => {
      sounds.playWoodPlace();
      this.renderer.addSplinters(coord.col, coord.row, 8);
    };

    this.engine.onBombPlaced = (bomb) => {
      sounds.playBombDrop();
      this.renderer.addSparks(bomb.col, bomb.row, 6);
    };

    this.engine.onExplosion = (_explosion, destroyedFences) => {
      sounds.playExplosion();
      for (const f of destroyedFences) {
        this.renderer.addSplinters(f.col, f.row, 12);
      }
    };

    this.engine.onSirenWarning = () => {
      sounds.playSirenWarning();
    };

    this.engine.onArenaShrink = () => {
      sounds.playExplosion();
    };

    this.engine.onRoundOver = (winner, reason) => {
      this.handleRoundOver(winner, reason);
    };

    this.engine.onMatchOver = (winner) => {
      this.handleMatchOver(winner);
    };

    // Solo AI Mode
    if (this.session.mode === 'ai') {
      this.opponentName = `Bot (${(this.session.aiDifficulty || 'med').toUpperCase()})`;
      this.engine.state.opponent.name = this.opponentName;
      this.ai = new BombArenaAI(this.engine, this.session.aiDifficulty || 'medium');
    } else {
      this.opponentName = 'Rival';
      this.engine.state.opponent.name = 'Rival';
    }

    this.handleResize();
    window.addEventListener('resize', this.boundResize);

    if (this.canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.canvas.parentElement);
    }
  }

  // =========================================================================
  // CONTROLS INITIALIZATION
  // =========================================================================
  private initControls() {
    // 1. Keyboard
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);

    // 2. Mobile D-Pad Touch Listeners
    const bindDpad = (btnId: string, dir: 'up' | 'down' | 'left' | 'right') => {
      const btn = document.getElementById(btnId);
      if (!btn) return;

      const start = (e: Event) => {
        e.preventDefault();
        this.keyState[dir] = true;
      };
      const end = (e: Event) => {
        e.preventDefault();
        this.keyState[dir] = false;
      };

      btn.addEventListener('pointerdown', start);
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointercancel', end);
      btn.addEventListener('pointerleave', end);
    };

    bindDpad('dpad-up', 'up');
    bindDpad('dpad-down', 'down');
    bindDpad('dpad-left', 'left');
    bindDpad('dpad-right', 'right');

    // 3. Action Buttons (Fence & Bomb)
    document.getElementById('bomb-btn-fence')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.triggerPlaceFence();
    });

    document.getElementById('bomb-btn-bomb')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.triggerPlaceBomb();
    });
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.repeat) return;

    if (e.code === 'KeyW' || e.code === 'ArrowUp') {
      this.keyState.up = true;
      e.preventDefault();
    } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
      this.keyState.down = true;
      e.preventDefault();
    } else if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
      this.keyState.left = true;
      e.preventDefault();
    } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
      this.keyState.right = true;
      e.preventDefault();
    } else if (e.code === 'KeyJ' || e.code === 'KeyZ' || e.code === 'ShiftLeft') {
      e.preventDefault();
      this.triggerPlaceFence();
    } else if (e.code === 'KeyK' || e.code === 'KeyX' || e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      this.triggerPlaceBomb();
    }
  }

  private handleKeyUp(e: KeyboardEvent) {
    if (e.code === 'KeyW' || e.code === 'ArrowUp') this.keyState.up = false;
    else if (e.code === 'KeyS' || e.code === 'ArrowDown') this.keyState.down = false;
    else if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keyState.left = false;
    else if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keyState.right = false;
  }

  private triggerPlaceFence() {
    if (this.engine.state.phase !== 'PLAYING') return;
    const placed = this.engine.placeFence('player');
    if (placed && this.session.mode === 'online' && this.session.peer?.isConnected) {
      const target = this.engine.getTargetPlacementCell('player');
      this.session.peer.sendMessage({
        type: 'BOMB_PLACE_FENCE',
        col: target.col,
        row: target.row,
        id: `fence_${Date.now()}`,
        timestamp: Date.now()
      });
    }
  }

  private triggerPlaceBomb() {
    if (this.engine.state.phase !== 'PLAYING') return;
    const placed = this.engine.placeBomb('player');
    if (placed && this.session.mode === 'online' && this.session.peer?.isConnected) {
      const latestBomb = this.engine.state.bombs[this.engine.state.bombs.length - 1];
      if (latestBomb) {
        this.session.peer.sendMessage({
          type: 'BOMB_PLACE_BOMB',
          col: latestBomb.col,
          row: latestBomb.row,
          id: latestBomb.id,
          timestamp: Date.now()
        });
      }
    }
  }

  // =========================================================================
  // NETWORK HANDLING (PVP)
  // =========================================================================
  private setupNetwork() {
    if (!this.session.peer) return;

    const origOnMessage = this.session.peer.events?.onMessage;
    const origOnStatusChange = this.session.peer.events?.onStatusChange;
    const origOnHealthChange = this.session.peer.events?.onHealthChange;

    this.session.peer = Object.assign(this.session.peer, {
      events: {
        ...this.session.peer.events,
        onMessage: (msg: NetworkMessage) => {
          origOnMessage?.(msg);
          this.handleNetworkMessage(msg);
        },
        onStatusChange: (status: string, message?: string) => {
          origOnStatusChange?.(status as any, message);
          if (status === 'disconnected') {
            if (this.winnerLocked || this.engine.state.phase === 'MATCH_OVER') {
              if (this.rematchBtnEl) {
                this.rematchBtnEl.textContent = 'Opponent Disconnected';
                this.rematchBtnEl.classList.remove('animate-pulse');
                this.rematchBtnEl.classList.add('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
              }
              return;
            }
            this.handleForfeitVictory('Opponent disconnected from the match.');
          }
        },
        onHealthChange: (health: NetworkHealth) => {
          origOnHealthChange?.(health);
          this.updateNetworkHealthHUD(health);
        }
      }
    });

    this.session.peer.flushEarlyMessages?.();
    if (this.session.peer.isConnected) {
      this.updateNetworkHealthHUD({
        rtt: this.session.peer.currentRtt,
        status: this.session.peer.networkQuality,
        isPeerVisible: this.session.peer.isPeerVisible
      });
    }

    if (this.session.peer.role === 'host') {
      this.session.peer.sendMessage({
        type: 'BOMB_INIT',
        seed: this.engine.seed,
        roundsToWin: BOMB_ARENA_CONSTANTS.ROUNDS_TO_WIN
      });
      this.startCountdown();
    } else {
      if (this.countdownOverlayEl && this.countdownNumberEl && this.countdownSubtitleEl) {
        this.countdownOverlayEl.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
        this.countdownNumberEl.className = 'text-4xl sm:text-5xl font-black text-amber-400 animate-pulse';
        this.countdownNumberEl.textContent = '⏳';
        this.countdownSubtitleEl.textContent = 'WAITING FOR HOST...';
      }
      this.session.peer.sendMessage({ type: 'BOMB_REQUEST_SEED' });
    }
  }

  private handleNetworkMessage(msg: NetworkMessage) {
    switch (msg.type) {
      case 'PLAYER_LEAVE':
        if (this.winnerLocked || this.engine.state.phase === 'MATCH_OVER') {
          if (this.rematchBtnEl) {
            this.rematchBtnEl.textContent = 'Opponent Disconnected';
            this.rematchBtnEl.classList.remove('animate-pulse');
            this.rematchBtnEl.classList.add('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
          }
          break;
        }
        this.handleForfeitVictory('Opponent forfeited the match.');
        break;

      case 'BOMB_REQUEST_SEED':
        if (this.session.peer?.role === 'host') {
          this.session.peer.sendMessage({
            type: 'BOMB_INIT',
            seed: this.engine.seed,
            roundsToWin: BOMB_ARENA_CONSTANTS.ROUNDS_TO_WIN
          });
        }
        break;

      case 'BOMB_INIT':
        this.engine.resetMatch(msg.seed);
        this.renderer.reset();
        this.startCountdown();
        break;

      case 'BOMB_MOVE': {
        const opp = this.engine.state.opponent;
        opp.x = msg.x;
        opp.y = msg.y;
        opp.col = Math.floor(msg.x);
        opp.row = Math.floor(msg.y);
        opp.facing = msg.facing as any;
        opp.isMoving = msg.isMoving;
        break;
      }

      case 'BOMB_PLACE_FENCE':
        if (this.engine.canPlaceFenceAt(msg.col, msg.row)) {
          this.engine.state.grid[msg.col][msg.row] = 'fence';
          this.engine.recalculateAllBombThreats();
          sounds.playWoodPlace();
          this.renderer.addSplinters(msg.col, msg.row, 8);
        }
        break;

      case 'BOMB_PLACE_BOMB':
        if (this.engine.canPlaceBombAt(msg.col, msg.row)) {
          const threatCells = this.engine.calculateThreatCells(msg.col, msg.row, BOMB_ARENA_CONSTANTS.BOMB_RADIUS);
          this.engine.state.bombs.push({
            id: msg.id,
            col: msg.col,
            row: msg.row,
            owner: 'opponent',
            timer: BOMB_ARENA_CONSTANTS.BOMB_FUSE_TIME,
            maxTimer: BOMB_ARENA_CONSTANTS.BOMB_FUSE_TIME,
            radius: BOMB_ARENA_CONSTANTS.BOMB_RADIUS,
            threatCells
          });
          sounds.playBombDrop();
          this.renderer.addSparks(msg.col, msg.row, 6);
        }
        break;

      case 'BOMB_ROUND_START':
        this.engine.setupRound(msg.roundNum);
        this.renderer.reset();
        this.startCountdown();
        break;

      case 'BOMB_VICTORY':
        if (!this.winnerLocked) {
          this.handleMatchOver('opponent');
        } else if (this.session.peer?.role === 'host') {
          const guestWonFirst = (msg.timestamp || 0) < this.localVictoryTimestamp;
          if (guestWonFirst) {
            this.winnerLocked = false;
            this.handleMatchOver('opponent');
          }
          this.session.peer.sendMessage({
            type: 'BOMB_VICTORY_CONFIRM',
            winner: guestWonFirst ? 'guest' : 'host'
          });
        }
        break;

      case 'BOMB_VICTORY_CONFIRM':
        if (this.session.peer?.role === 'guest' && msg.winner === 'host') {
          this.winnerLocked = false;
          this.handleMatchOver('opponent');
        }
        break;

      case 'BOMB_REMATCH_REQUEST':
      case 'REMATCH_REQUEST':
        this.showRematchOffer();
        break;

      case 'BOMB_REMATCH_ACCEPT':
      case 'REMATCH_ACCEPT':
      case 'BOMB_REMATCH':
        this.startNewMatch(msg.seed);
        break;
    }
  }

  private updateNetworkHealthHUD(health: NetworkHealth) {
    if (this.pingEl && this.pingTextEl && this.pingDotEl) {
      if (health.status === 'stalled') {
        this.pingDotEl.className = 'w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping';
        this.pingTextEl.textContent = 'Lag ⚠️';
        this.pingEl.className =
          'inline-flex items-center gap-1 text-[9px] font-mono font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 rounded px-1.5 py-0.5 shadow-sm';
      } else if (health.status === 'poor') {
        this.pingDotEl.className = 'w-1.5 h-1.5 rounded-full bg-rose-400';
        this.pingTextEl.textContent = `${Math.round(health.rtt)}ms`;
        this.pingEl.className =
          'inline-flex items-center gap-1 text-[9px] font-mono font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 rounded px-1.5 py-0.5 shadow-sm';
      } else if (health.status === 'moderate') {
        this.pingDotEl.className = 'w-1.5 h-1.5 rounded-full bg-amber-400';
        this.pingTextEl.textContent = `${Math.round(health.rtt)}ms`;
        this.pingEl.className =
          'inline-flex items-center gap-1 text-[9px] font-mono font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 rounded px-1.5 py-0.5 shadow-sm';
      } else {
        this.pingDotEl.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400';
        this.pingTextEl.textContent = `${Math.round(health.rtt || 25)}ms`;
        this.pingEl.className =
          'inline-flex items-center gap-1 text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 rounded px-1.5 py-0.5 shadow-sm';
      }
    }

    if (this.peerAwayBannerEl) {
      if (!health.isPeerVisible) {
        this.peerAwayBannerEl.classList.remove('hidden');
      } else {
        this.peerAwayBannerEl.classList.add('hidden');
      }
    }
  }

  // =========================================================================
  // COUNTDOWN & MATCH FLOW
  // =========================================================================
  private startCountdown() {
    this.engine.state.phase = 'COUNTDOWN';
    this.engine.state.countdown = BOMB_ARENA_CONSTANTS.COUNTDOWN_SECONDS;

    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.roundOverBannerEl) {
      this.roundOverBannerEl.classList.add('hidden');
    }

    if (this.countdownOverlayEl && this.countdownNumberEl && this.countdownSubtitleEl) {
      this.countdownOverlayEl.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
      this.countdownNumberEl.className =
        'text-7xl sm:text-8xl font-black text-amber-400 drop-shadow-[0_0_30px_rgba(245,158,11,0.9)] animate-scaleIn';
      this.countdownNumberEl.textContent = '3';
      this.countdownSubtitleEl.textContent = `ROUND ${this.engine.state.roundNumber} • GET READY!`;
    }

    sounds.playCountdownTick(false);
    this.updateHUD(true);

    let cd = 3;
    this.countdownTimer = window.setInterval(() => {
      cd--;
      if (cd > 0) {
        sounds.playCountdownTick(false);
        if (this.countdownNumberEl) {
          this.countdownNumberEl.textContent = `${cd}`;
          this.countdownNumberEl.classList.remove('animate-scaleIn');
          void this.countdownNumberEl.offsetWidth;
          this.countdownNumberEl.classList.add('animate-scaleIn');
        }
        this.updateHUD(true);
      } else if (cd === 0) {
        sounds.playCountdownTick(true);
        if (this.countdownNumberEl && this.countdownSubtitleEl) {
          this.countdownNumberEl.className =
            'text-6xl sm:text-7xl font-black text-emerald-400 drop-shadow-[0_0_30px_rgba(16,185,129,0.9)] animate-scaleIn';
          this.countdownNumberEl.textContent = 'BLAST!';
          this.countdownSubtitleEl.textContent = 'FENCE & TRAP!';
        }
        this.engine.state.phase = 'PLAYING';
        this.updateHUD(true);

        if (this.session.mode === 'ai' && this.ai) {
          this.ai.reset();
        }

        setTimeout(() => {
          if (this.countdownOverlayEl) {
            this.countdownOverlayEl.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => {
              this.countdownOverlayEl?.classList.add('hidden');
            }, 300);
          }
        }, 450);

        if (this.countdownTimer !== null) {
          clearInterval(this.countdownTimer);
          this.countdownTimer = null;
        }
      }
    }, 850);
  }

  // =========================================================================
  // GAME LOOP
  // =========================================================================
  private startLoop() {
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;

      // 1. Process continuous local player movement
      if (this.engine.state.phase === 'PLAYING') {
        let dx = 0;
        let dy = 0;
        if (this.keyState.up) dy -= 1;
        if (this.keyState.down) dy += 1;
        if (this.keyState.left) dx -= 1;
        if (this.keyState.right) dx += 1;

        this.engine.movePlayer('player', dx, dy, dt);

        // Broadcast player movement over WebRTC (25Hz throttle)
        if (
          this.session.mode === 'online' &&
          this.session.peer?.isConnected &&
          now - this.lastMoveBroadcastTime > 40
        ) {
          this.lastMoveBroadcastTime = now;
          this.session.peer.sendMessage({
            type: 'BOMB_MOVE',
            x: this.engine.state.player.x,
            y: this.engine.state.player.y,
            facing: this.engine.state.player.facing,
            isMoving: this.engine.state.player.isMoving,
            timestamp: Date.now()
          });
        }

        // 2. Update AI (in solo mode)
        if (this.ai) {
          this.ai.update(dt);
        }
      }

      // 3. Update physics, bombs, hazards
      this.engine.update(dt);

      // 4. Render
      this.renderer.render(this.engine.state, dt);

      // 5. Update HUD
      this.updateHUD();

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  // =========================================================================
  // HUD UPDATES
  // =========================================================================
  private updateHUD(force: boolean = false) {
    const now = performance.now();
    if (!force && now - this.lastHUDUpdateTime < 50) return;
    this.lastHUDUpdateTime = now;

    // Score display
    const pWins = this.engine.state.player.roundsWon;
    const oWins = this.engine.state.opponent.roundsWon;
    this.scoreEl.innerHTML = `
      <span class="text-cyan-400">YOU: ${pWins}</span>
      <span class="text-slate-500 font-normal mx-1.5">vs</span>
      <span class="text-rose-400">RIVAL: ${oWins}</span>
    `;

    // Stock Badges
    const fStock = this.engine.state.player.fenceStock;
    const bStock = this.engine.state.player.bombStock;
    this.fenceCountBadge.textContent = `${fStock}/${BOMB_ARENA_CONSTANTS.MAX_FENCE_STOCK}`;
    this.bombCountBadge.textContent = `${bStock}/${BOMB_ARENA_CONSTANTS.MAX_BOMB_STOCK}`;

    // Dynamic Status Banner
    if (this.statusTextEl && this.statusBannerEl) {
      let statusText = '';
      let statusClass = '';

      if (this.engine.state.phase === 'COUNTDOWN') {
        statusText = `ROUND ${this.engine.state.roundNumber} • GET READY!`;
        statusClass = 'text-amber-400 font-black';
      } else if (this.engine.state.phase === 'PLAYING') {
        if (this.engine.state.bounds.warningTimeLeft > 0) {
          statusText = `⚠️ ARENA SHRINKING IN ${Math.ceil(this.engine.state.bounds.warningTimeLeft)}s!`;
          statusClass = 'text-rose-400 font-black animate-pulse';
        } else if (pWins >= 1 && oWins >= 1) {
          statusText = '🏁 FINAL ROUND • MATCH POINT!';
          statusClass = 'text-amber-300 font-black animate-pulse';
        } else if (pWins > oWins) {
          statusText = 'MATCH POINT! 1 ROUND TO WIN! 🚀';
          statusClass = 'text-emerald-400 font-bold';
        } else if (oWins > pWins) {
          statusText = 'RIVAL MATCH POINT! DEFEND! ⚡';
          statusClass = 'text-rose-400 font-bold';
        } else {
          statusText = `ROUND ${this.engine.state.roundNumber} • BEST OF 3`;
          statusClass = 'text-amber-400 font-bold';
        }
      } else if (this.engine.state.phase === 'ROUND_OVER') {
        statusText = this.engine.state.roundWinReason || 'ROUND OVER!';
        statusClass = 'text-amber-300 font-black';
      } else if (this.engine.state.phase === 'MATCH_OVER') {
        statusText = this.engine.state.matchWinner === 'player' ? 'VICTORY! 🏆' : 'DEFEAT! 💀';
        statusClass = this.engine.state.matchWinner === 'player' ? 'text-amber-400 font-black' : 'text-rose-500 font-black';
      }

      if (statusText !== this.cachedStatusText) {
        this.cachedStatusText = statusText;
        this.statusTextEl.textContent = statusText;
        this.statusTextEl.className = `text-[9px] sm:text-[10px] tracking-wide uppercase truncate max-w-[170px] ${statusClass}`;
      }
    }
  }

  private handleResize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const dpr = Math.min(2.0, window.devicePixelRatio || 1);
    const rect = parent.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);

    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
    }
  }

  // =========================================================================
  // ROUND & MATCH COMPLETION
  // =========================================================================
  private handleRoundOver(winner: 'player' | 'opponent' | 'draw', reason: string) {
    sounds.playRoundComplete();

    if (this.roundOverBannerEl && this.roundOverTextEl) {
      this.roundOverBannerEl.classList.remove('hidden');
      const winLabel =
        winner === 'player' ? 'YOU WON THE ROUND!' : (winner === 'opponent' ? 'RIVAL WON THE ROUND!' : 'ROUND DRAW!');
      this.roundOverTextEl.textContent = `${winLabel} (${reason})`;
    }

    // Schedule next round after 2.4s
    if (this.nextRoundTimer !== null) clearTimeout(this.nextRoundTimer);
    this.nextRoundTimer = window.setTimeout(() => {
      const nextRound = this.engine.state.roundNumber + 1;
      this.engine.setupRound(nextRound);
      this.renderer.reset();

      if (this.session.mode === 'online' && this.session.peer?.role === 'host') {
        this.session.peer.sendMessage({
          type: 'BOMB_ROUND_START',
          roundNum: nextRound,
          seed: Date.now()
        });
      }
      this.startCountdown();
    }, 2400);
  }

  private handleMatchOver(winner: 'player' | 'opponent') {
    if (this.winnerLocked) return;
    this.winnerLocked = true;
    this.ai?.stop();

    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.nextRoundTimer !== null) {
      clearTimeout(this.nextRoundTimer);
      this.nextRoundTimer = null;
    }

    this.countdownOverlayEl?.classList.add('hidden');
    this.roundOverBannerEl?.classList.add('hidden');

    const didIWin = winner === 'player';
    if (didIWin) {
      this.localVictoryTimestamp = Date.now();
      if (this.session.mode === 'online' && this.session.peer?.isConnected) {
        this.session.peer.sendMessage({
          type: 'BOMB_VICTORY',
          winner: 'opponent',
          timestamp: this.localVictoryTimestamp
        });
      }
    }

    const duration = Math.floor((Date.now() - this.startTime) / 1000);
    const pWins = this.engine.state.player.roundsWon;
    const oWins = this.engine.state.opponent.roundsWon;

    this.gameOverTitleEl.textContent = didIWin ? '🏆 VICTORY!' : '💀 DEFEAT';
    this.gameOverTitleEl.className = `text-3xl font-black tracking-tight ${
      didIWin ? 'text-amber-400' : 'text-rose-500'
    }`;

    this.gameOverStatsEl.innerHTML = `
      <div class="text-sm font-semibold mb-3 ${didIWin ? 'text-emerald-400' : 'text-slate-300'}">
        ${didIWin ? 'You out-fenced and blasted your rival!' : 'Your rival trapped you in the arena!'}
      </div>
      <div class="flex justify-between py-1 border-b border-slate-700/50"><span>Final Score:</span> <b>${pWins} - ${oWins}</b></div>
      <div class="flex justify-between py-1 border-b border-slate-700/50"><span>Total Rounds:</span> <b>${this.engine.state.roundNumber}</b></div>
      <div class="flex justify-between py-1"><span>Match Duration:</span> <b>${duration}s</b></div>
    `;

    if (this.rematchState === 'offer_received') {
      this.showRematchOffer();
    } else if (this.rematchBtnEl) {
      this.rematchBtnEl.textContent = 'Play Again';
      this.rematchBtnEl.disabled = false;
      this.rematchBtnEl.classList.remove('opacity-70', 'opacity-50', 'cursor-not-allowed', 'pointer-events-none', 'animate-pulse');
      this.rematchBtnEl.className =
        'flex-1 py-3 rounded-xl text-xs font-black bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-400 hover:to-blue-500 text-white transition shadow-lg shadow-cyan-500/30 cursor-pointer active:scale-95 uppercase tracking-wide';
    }

    this.gameOverModalEl.classList.remove('hidden');

    if (didIWin) {
      sounds.playFanfare();
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    } else {
      sounds.playGameOver();
    }
  }

  private handleForfeitVictory(reason: string) {
    if (this.winnerLocked || this.engine.state.phase === 'MATCH_OVER') {
      if (this.rematchBtnEl) {
        this.rematchBtnEl.textContent = 'Opponent Disconnected';
        this.rematchBtnEl.classList.remove('animate-pulse');
        this.rematchBtnEl.classList.add('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
      }
      return;
    }

    this.winnerLocked = true;
    this.ai?.stop();
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.nextRoundTimer !== null) {
      clearTimeout(this.nextRoundTimer);
      this.nextRoundTimer = null;
    }

    this.countdownOverlayEl?.classList.add('hidden');
    this.roundOverBannerEl?.classList.add('hidden');

    this.gameOverTitleEl.textContent = '🏆 VICTORY BY FORFEIT!';
    this.gameOverTitleEl.className =
      'text-2xl sm:text-3xl font-extrabold mb-1 text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500';

    this.gameOverStatsEl.innerHTML = `
      <div class="text-sm font-semibold mb-3 text-amber-300">${reason}</div>
      <div class="flex justify-between py-1 border-b border-slate-700/50"><span>Score:</span> <b>${this.engine.state.player.roundsWon} - ${this.engine.state.opponent.roundsWon}</b></div>
    `;

    if (this.rematchBtnEl) {
      this.rematchBtnEl.textContent = 'Opponent Disconnected';
      this.rematchBtnEl.classList.remove('animate-pulse');
      this.rematchBtnEl.classList.add('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
    }

    this.gameOverModalEl.classList.remove('hidden');
    sounds.playFanfare();
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 } });
  }

  private handleRematchClick() {
    if (!this.rematchBtnEl) return;

    if (this.session.mode === 'ai') {
      this.startNewMatch();
      return;
    }

    if (!this.session.peer?.isConnected) {
      this.startNewMatch();
      return;
    }

    if (this.rematchState === 'offer_received') {
      const seed = Date.now();
      this.session.peer.sendMessage({ type: 'BOMB_REMATCH_ACCEPT', seed });
      this.session.peer.sendMessage({ type: 'REMATCH_ACCEPT', seed });
      this.startNewMatch(seed);
    } else if (this.rematchState === 'idle') {
      this.rematchState = 'requested';
      this.rematchBtnEl.textContent = 'Waiting for Opponent...';
      this.rematchBtnEl.classList.add('opacity-70', 'cursor-not-allowed', 'pointer-events-none');
      this.session.peer.sendMessage({ type: 'BOMB_REMATCH_REQUEST' });
      this.session.peer.sendMessage({ type: 'REMATCH_REQUEST' });
    }
  }

  private showRematchOffer() {
    if (this.rematchState === 'requested') {
      if (this.session.peer?.role === 'host') {
        const seed = Date.now();
        this.session.peer.sendMessage({ type: 'BOMB_REMATCH_ACCEPT', seed });
        this.session.peer.sendMessage({ type: 'REMATCH_ACCEPT', seed });
        this.startNewMatch(seed);
      }
      return;
    }

    this.rematchState = 'offer_received';
    sounds.playRoundComplete();
    if (this.rematchBtnEl) {
      this.rematchBtnEl.textContent = 'Accept Rematch!';
      this.rematchBtnEl.disabled = false;
      this.rematchBtnEl.classList.remove('opacity-70', 'opacity-50', 'cursor-not-allowed', 'pointer-events-none');
      this.rematchBtnEl.className =
        'flex-1 py-3 rounded-xl text-xs font-black tracking-wider uppercase text-white bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 shadow-lg shadow-emerald-500/40 active:scale-95 transition-all cursor-pointer animate-pulse';
    }
  }

  private startNewMatch(seed?: number) {
    this.rematchState = 'idle';
    this.winnerLocked = false;
    this.localVictoryTimestamp = 0;
    this.startTime = Date.now();
    this.gameOverModalEl.classList.add('hidden');

    if (this.rematchBtnEl) {
      this.rematchBtnEl.textContent = 'Play Again';
      this.rematchBtnEl.disabled = false;
      this.rematchBtnEl.classList.remove('opacity-70', 'opacity-50', 'cursor-not-allowed', 'pointer-events-none', 'animate-pulse');
      this.rematchBtnEl.className =
        'flex-1 py-3 rounded-xl text-xs font-black bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-400 hover:to-blue-500 text-white transition shadow-lg shadow-cyan-500/30 cursor-pointer active:scale-95 uppercase tracking-wide';
    }

    const newSeed = seed !== undefined ? seed : Date.now();
    this.engine.resetMatch(newSeed);
    this.renderer.reset();

    if (this.session.mode === 'ai' && this.ai) {
      this.ai.reset();
    }

    this.startCountdown();
  }

  // =========================================================================
  // GAME INSTANCE INTERFACE
  // =========================================================================
  public setTheme(theme: AppTheme) {
    this.currentTheme = theme;
    this.renderer?.setTheme(theme);
    const frame = document.getElementById('bomb-frame');
    if (frame) {
      frame.className = `relative w-full max-w-[480px] h-[100dvh] max-h-[100dvh] flex flex-col justify-between overflow-hidden shadow-2xl select-none ${
        theme === 'dark' ? 'bg-[#0b1120] text-white' : 'bg-white text-slate-900'
      }`;
    }
  }

  public destroy() {
    window.removeEventListener('beforeunload', this.boundBeforeUnload);
    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      try {
        this.session.peer.sendMessage({ type: 'PLAYER_LEAVE' });
      } catch {}
    }
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.nextRoundTimer !== null) {
      clearTimeout(this.nextRoundTimer);
      this.nextRoundTimer = null;
    }
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    window.removeEventListener('resize', this.boundResize);
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.ai?.stop();

    this.scoreEl = null as any;
    this.statusBannerEl = null;
    this.statusTextEl = null;
    this.fenceCountBadge = null as any;
    this.bombCountBadge = null as any;
    this.peerAwayBannerEl = null;
    this.pingEl = null;
    this.pingDotEl = null;
    this.pingTextEl = null;
    this.countdownOverlayEl = null;
    this.countdownNumberEl = null;
    this.countdownSubtitleEl = null;
    this.roundOverBannerEl = null;
    this.roundOverTextEl = null;
    this.gameOverModalEl = null as any;
    this.gameOverTitleEl = null as any;
    this.gameOverStatsEl = null as any;
    this.rematchBtnEl = null;
    this.container.innerHTML = '';
  }
}
