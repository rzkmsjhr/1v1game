import type { GameInstance, GameSession, AppTheme } from '../types';
import type {
  VehiclePhysicsState,
  RoundState,
  RunScoreBreakdown,
  CarModelType,
  MatchHistoryEntry
} from './drift-types';
import type { NetworkHealth } from '../../network/webrtc-peer';
import { DriftTrack } from './drift-track';
import { DriftEngine } from './drift-engine';
import { DriftRenderer } from './renderers/DriftRenderer';
import { DriftAI } from './drift-ai';
import { DRIFT_CONSTANTS } from './drift-constants';
import { sounds } from '../../engine/sound';
import confetti from 'canvas-confetti';

export class DriftRacingGame implements GameInstance {
  private container: HTMLElement;
  private session: GameSession;
  private canvas: HTMLCanvasElement;
  private track: DriftTrack;
  private engine: DriftEngine;
  public renderer: DriftRenderer;
  private ai: DriftAI;

  // Match & Round States
  public roundState: RoundState;
  private matchHistory: MatchHistoryEntry[] = [];
  private isOnline: boolean;
  private isHost: boolean = true;
  private animationFrameId: number | null = null;
  private lastTimestamp: number = 0;
  private isDestroyed: boolean = false;
  private resizeObserver: ResizeObserver | null = null;

  // Network Health HUD & Throttling
  private lastSyncBroadcastTime: number = 0;
  private netPingEl: HTMLElement | null = null;
  private netDotEl: HTMLElement | null = null;
  private netTextEl: HTMLElement | null = null;
  private peerAwayBannerEl: HTMLElement | null = null;

  // Remote Vehicle Interpolation & Dead Reckoning
  private remoteTargetX: number = 0;
  private remoteTargetY: number = 0;
  private remoteTargetAngle: number = 0;
  private remoteTargetSpeed: number = 0;
  private remoteTargetSteer: number = 0;
  private remoteTargetSlipAngle: number = 0;
  private remoteTargetThrottle: number = 0;
  private remoteTargetHandbrake: boolean = false;
  private lastRemoteUpdateTime: number = 0;

  // Two-Way Rematch & Round Synchronization
  private rematchState: 'idle' | 'requested' | 'offer_received' = 'idle';
  private roundReadyState: 'idle' | 'waiting_for_peer' = 'idle';
  private peerReadyForNextRound: boolean = false;

  // Vehicle States
  public playerCar: VehiclePhysicsState;
  public enemyCar: VehiclePhysicsState;
  public playerModel: CarModelType = 'ae86';
  public enemyModel: CarModelType = 's15';
  public playerRoofNum: number = 86;
  public enemyRoofNum: number = 15;

  // Input States
  public inputs = {
    throttle: 0,
    steer: 0,
    brake: false,
    handbrake: false
  };

  // Keyboard Handlers
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private boundResize: () => void;

  // Audio Screech Throttle
  private lastScreechTime: number = 0;

  // Lap Completion Gate Tracking (sequential waypoint checkpoint system)
  // Tracks the highest sequential waypoint index each car has legitimately reached.
  // This prevents false midpoint triggers at the figure-8 crossover (800,500) where
  // Loop 1 (wp0-2) and Loop 2 (wp58-62) share the same physical location.
  private playerMaxWaypoint: number = 0;
  private enemyMaxWaypoint: number = 0;

  // Fixed Timestep Physics Simulation (Guarantees steady 60Hz physics ticks regardless of device frame rate!)
  private physicsAccumulator: number = 0;
  private readonly FIXED_DT: number = 1 / 60;

  constructor(container: HTMLElement, session: GameSession) {
    this.container = container;
    this.session = session;
    this.isOnline = (session.mode === 'online');
    this.isHost = session.peer ? (session.peer.role === 'host') : true;

    // Track, Engine, Renderer, AI
    this.track = new DriftTrack();
    this.engine = new DriftEngine(this.track);
    this.ai = new DriftAI(this.track, session.aiDifficulty || 'medium');

    // Canvas Element
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'w-full h-full block touch-none select-none';
    this.renderer = new DriftRenderer(this.canvas, this.track);

    // Initial Vehicles
    this.playerCar = this.engine.createVehicleState(this.track.gridSlot1.x, this.track.gridSlot1.y, this.track.gridSlot1.angle, this.playerModel);
    this.enemyCar = this.engine.createVehicleState(this.track.gridSlot2.x, this.track.gridSlot2.y, this.track.gridSlot2.angle, this.enemyModel);

    // Initial Match Round State (Round 1: Normal Tandem)
    const isGuest = this.isOnline && !this.isHost;
    this.roundState = {
      currentRoundNumber: 1,
      roundType: 'r1_normal',
      playerRole: isGuest ? 'chase' : 'lead',
      enemyRole: isGuest ? 'lead' : 'chase',
      playerScore: this.engine.createInitialScore(),
      enemyScore: this.engine.createInitialScore(),
      countdownValue: 3,
      phase: 'countdown',
      phaseTimer: 3.5
    };

    // DOM Setup
    this.setupDOM();
    this.setupResizeObserver();

    // Input Listeners
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
    this.boundResize = this.handleResize.bind(this);

    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    window.addEventListener('resize', this.boundResize);

    // Network Setup if Online
    if (this.isOnline && this.session.peer) {
      this.setupNetwork();
    }

    // Reset grid for round 1
    this.resetGridPositions();
    this.renderer.snapCamera(this.playerCar);

    // Resize and start game loop
    this.handleResize();
    sounds.playRoundGong();

    (window as any).activeDriftGame = this;
    this.lastTimestamp = performance.now();
    this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
  }

  private setupDOM() {
    this.container.innerHTML = `
      <div id="drift-outer-wrapper" class="relative w-full h-full min-h-[100dvh] max-h-[100dvh] flex flex-col bg-[#0b0f19] text-white overflow-hidden select-none font-sans">
        
        <!-- Canvas Container -->
        <div id="drift-canvas-container" class="relative flex-1 w-full h-full overflow-hidden" style="touch-action: none;">
          <!-- Canvas injected dynamically -->
        </div>

        <!-- Top Header Action Bar (respects mobile notch safe area) -->
        <div class="absolute inset-x-3 flex items-center justify-between pointer-events-none z-10" style="top: max(env(safe-area-inset-top, 8px), 10px);">
          <div class="flex items-center gap-2 pointer-events-auto">
            <button id="drift-exit-btn" class="px-3 py-1.5 rounded-xl bg-black/60 hover:bg-black/80 border border-white/10 text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5 active:scale-95">
              <span>←</span> <span>Exit</span>
            </button>
            <div class="px-3 py-1 rounded-xl bg-black/60 border border-white/10 text-[11px] font-mono font-bold text-amber-300">
              ${this.isOnline ? '🌐 1v1 ONLINE' : `🤖 VS AI (${(this.session.aiDifficulty || 'MED').toUpperCase()})`}
            </div>
            <span id="drift-net-ping" class="${this.isOnline ? 'inline-flex' : 'hidden'} items-center space-x-1 text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 rounded px-1.5 py-0.5">
              <span id="drift-net-dot" class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span id="drift-net-text">30ms</span>
            </span>
          </div>

          <!-- Controls HUD -->
          <div class="flex items-center gap-2 pointer-events-auto">
            <button id="drift-sound-btn" class="w-8 h-8 rounded-xl bg-black/60 hover:bg-black/80 border border-white/10 text-xs font-bold transition-all shadow-md cursor-pointer flex items-center justify-center active:scale-95">
              ${sounds.enabled ? '🔊' : '🔇'}
            </button>
          </div>
        </div>

        <!-- Inactive Tab / Opponent Away Banner -->
        <div id="drift-peer-away-banner" class="hidden absolute top-14 left-1/2 -translate-x-1/2 z-20 text-center py-1 px-3 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-[11px] tracking-wide backdrop-blur-md animate-pulse shadow-lg pointer-events-none">
          ⚠️ Opponent is tabbed out / minimized
        </div>

        <!-- Countdown Banner Overlay -->
        <div id="drift-countdown-overlay" class="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div id="drift-countdown-text" class="text-6xl sm:text-8xl font-black font-mono tracking-tighter text-amber-400 drop-shadow-[0_0_25px_rgba(245,158,11,0.8)]">
            3
          </div>
        </div>

        <!-- Round End Result Modal (Hidden by default, responsive for all mobile screens) -->
        <div id="drift-round-modal" class="hidden absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-30 overflow-y-auto">
          <div class="max-w-md w-full my-auto bg-slate-900 border border-slate-700/80 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl flex flex-col gap-3 sm:gap-4 text-center">
            <div id="modal-round-tag" class="text-[10px] sm:text-xs font-black uppercase tracking-widest text-amber-400">ROUND 1 COMPLETED</div>
            <h3 id="modal-round-title" class="text-xl sm:text-2xl font-black text-white">Tandem Battle Results</h3>
            
            <div class="grid grid-cols-2 gap-2 sm:gap-3 bg-slate-950 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-800 text-left">
              <div>
                <div class="text-[9px] sm:text-[10px] font-black uppercase text-cyan-400 truncate">YOU (${this.roundState.playerRole.toUpperCase()})</div>
                <div class="flex items-baseline gap-1 mt-0.5">
                  <span id="modal-player-score" class="text-xl sm:text-2xl font-black font-mono text-cyan-300">0</span>
                  <span class="text-[10px] sm:text-xs font-bold text-cyan-400/70">pts</span>
                </div>
                <div id="modal-player-breakdown" class="text-[9px] sm:text-[10px] text-slate-400 mt-1 leading-tight">Angle: 0 • Zone: 0</div>
              </div>
              <div class="border-l border-slate-800 pl-2.5 sm:pl-3">
                <div class="text-[9px] sm:text-[10px] font-black uppercase text-rose-400 truncate">RIVAL (${this.roundState.enemyRole.toUpperCase()})</div>
                <div class="flex items-baseline gap-1 mt-0.5">
                  <span id="modal-enemy-score" class="text-xl sm:text-2xl font-black font-mono text-rose-300">0</span>
                  <span class="text-[10px] sm:text-xs font-bold text-rose-400/70">pts</span>
                </div>
                <div id="modal-enemy-breakdown" class="text-[9px] sm:text-[10px] text-slate-400 mt-1 leading-tight">Angle: 0 • Zone: 0</div>
              </div>
            </div>

            <div id="modal-round-summary" class="text-xs text-slate-300 leading-relaxed px-1">
              Role switch next round! Get ready to take the other role.
            </div>

            <div class="flex flex-col sm:flex-row gap-2 w-full mt-1">
              <button id="modal-exit-btn" class="w-full sm:w-1/3 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 hover:text-white font-bold text-xs sm:text-sm uppercase tracking-wide transition-all border border-slate-700 cursor-pointer flex items-center justify-center gap-1.5 shadow-md">
                <span>✕ Exit to Menu</span>
              </button>
              <button id="modal-next-round-btn" class="w-full sm:w-2/3 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wide transition-all shadow-lg shadow-emerald-500/25 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap">
                <span id="modal-btn-text">Start Round 2 (Role Switch)</span> <span class="text-base leading-none">→</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Virtual Touch Controls for Mobile (Visible on mobile & tablets < 1024px) -->
        <div id="drift-touch-controls" class="lg:hidden absolute inset-x-0 bottom-0 pointer-events-none z-10 select-none touch-none" style="padding-bottom: max(env(safe-area-inset-bottom, 8px), 10px); padding-left: max(env(safe-area-inset-left, 8px), 10px); padding-right: max(env(safe-area-inset-right, 8px), 10px);">
          <div class="relative w-full h-32 flex items-end justify-between">
            <!-- Left side: Steer controls (inline side-by-side) -->
            <div class="flex items-center gap-2 pointer-events-auto">
              <button id="btn-touch-left" class="w-16 h-16 rounded-2xl bg-black/75 active:bg-cyan-500/50 border border-white/20 text-2xl font-bold flex items-center justify-center text-white select-none touch-none shadow-lg active:scale-95 transition-transform">◀</button>
              <button id="btn-touch-right" class="w-16 h-16 rounded-2xl bg-black/75 active:bg-cyan-500/50 border border-white/20 text-2xl font-bold flex items-center justify-center text-white select-none touch-none shadow-lg active:scale-95 transition-transform">▶</button>
            </div>
            <!-- Right side: Action controls (Gas tall, Brake + Drift beside it) -->
            <div class="flex items-end gap-2 pointer-events-auto">
              <div class="flex flex-col gap-2">
                <button id="btn-touch-handbrake" class="w-14 h-14 rounded-2xl bg-amber-500/40 active:bg-amber-500 border border-amber-500/60 text-[10px] font-black flex items-center justify-center text-amber-200 select-none touch-none shadow-lg active:scale-95 transition-transform">DRIFT</button>
                <button id="btn-touch-brake" class="w-14 h-14 rounded-2xl bg-red-500/40 active:bg-red-500 border border-red-500/60 text-[10px] font-black flex items-center justify-center text-white select-none touch-none shadow-lg active:scale-95 transition-transform">BRAKE</button>
              </div>
              <button id="btn-touch-gas" class="w-16 rounded-2xl bg-emerald-500/50 active:bg-emerald-500 border border-emerald-500/70 text-2xl font-bold flex items-center justify-center text-white select-none touch-none shadow-lg active:scale-95 transition-transform" style="height:7.75rem">▲</button>
            </div>
          </div>
        </div>

      </div>
    `;

    const canvasContainer = this.container.querySelector('#drift-canvas-container')!;
    canvasContainer.appendChild(this.canvas);

    // Event Bindings for Buttons
    this.container.querySelector('#drift-exit-btn')!.addEventListener('click', () => {
      this.session.onExit();
    });

    this.container.querySelector('#modal-exit-btn')?.addEventListener('click', () => {
      this.session.onExit();
    });

    const soundBtn = this.container.querySelector('#drift-sound-btn')!;
    soundBtn.addEventListener('click', () => {
      sounds.toggleMute();
      soundBtn.textContent = sounds.enabled ? '🔊' : '🔇';
    });

    // Touch Controls
    this.bindTouchControls();

    // Next Round Button
    this.container.querySelector('#modal-next-round-btn')!.addEventListener('click', () => {
      this.handleProceedNextRound();
    });
  }

  private bindTouchControls() {
    const bindBtn = (id: string, onDown: () => void, onUp: () => void) => {
      const el = this.container.querySelector(id) as HTMLElement | null;
      if (!el) return;

      let isPressed = false;
      const handleDown = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        if (isPressed) return;
        isPressed = true;
        if ('setPointerCapture' in el && (e as PointerEvent).pointerId !== undefined) {
          try { el.setPointerCapture((e as PointerEvent).pointerId); } catch {}
        }
        onDown();
      };

      const handleUp = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isPressed) return;
        isPressed = false;
        if ('releasePointerCapture' in el && (e as PointerEvent).pointerId !== undefined) {
          try { el.releasePointerCapture((e as PointerEvent).pointerId); } catch {}
        }
        onUp();
      };

      // Pointer events with pointer capture (handles multi-touch, finger slides, no synthetic mouse cancellations)
      el.addEventListener('pointerdown', handleDown, { passive: false });
      el.addEventListener('pointerup', handleUp, { passive: false });
      el.addEventListener('pointercancel', handleUp, { passive: false });

      // Fallback touch events
      el.addEventListener('touchstart', handleDown, { passive: false });
      el.addEventListener('touchend', handleUp, { passive: false });
      el.addEventListener('touchcancel', handleUp, { passive: false });

      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };

    bindBtn('#btn-touch-left', () => this.inputs.steer = -1, () => this.inputs.steer = 0);
    bindBtn('#btn-touch-right', () => this.inputs.steer = 1, () => this.inputs.steer = 0);
    bindBtn('#btn-touch-gas', () => this.inputs.throttle = 1, () => this.inputs.throttle = 0);
    bindBtn('#btn-touch-brake', () => this.inputs.brake = true, () => this.inputs.brake = false);
    bindBtn('#btn-touch-handbrake', () => this.inputs.handbrake = true, () => this.inputs.handbrake = false);
  }

  private activeKeys = new Set<string>();

  private updateInputsFromKeys() {
    this.inputs.throttle = (this.activeKeys.has('KeyW') || this.activeKeys.has('ArrowUp')) ? 1 : 0;
    this.inputs.brake = (this.activeKeys.has('KeyS') || this.activeKeys.has('ArrowDown'));
    this.inputs.handbrake = this.activeKeys.has('Space');

    const left = this.activeKeys.has('KeyA') || this.activeKeys.has('ArrowLeft');
    const right = this.activeKeys.has('KeyD') || this.activeKeys.has('ArrowRight');
    if (left && !right) this.inputs.steer = -1;
    else if (right && !left) this.inputs.steer = 1;
    else this.inputs.steer = 0;
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space'].includes(e.code)) {
      this.activeKeys.add(e.code);
      this.updateInputsFromKeys();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    }
  }

  private handleKeyUp(e: KeyboardEvent) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space'].includes(e.code)) {
      this.activeKeys.delete(e.code);
      this.updateInputsFromKeys();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    }
  }

  private setupResizeObserver() {
    const canvasContainer = this.container.querySelector('#drift-canvas-container');
    if (canvasContainer && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(canvasContainer);
    }
  }

  private handleResize() {
    if (this.isDestroyed) return;
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      this.renderer.resize(rect.width, rect.height);
    }
  }

  private setupNetwork() {
    if (!this.session.peer) return;

    const peer = this.session.peer;
    const origOnMessage = peer.events?.onMessage;
    const origOnStatusChange = peer.events?.onStatusChange;
    const origOnHealthChange = peer.events?.onHealthChange;

    peer.events = {
      ...peer.events,
      onMessage: (msg: any) => {
        origOnMessage?.(msg);
        this.handleNetworkMessage(msg);
      },
      onStatusChange: (status: string, message?: string) => {
        origOnStatusChange?.(status as any, message);
        if (status === 'disconnected') {
          if (this.roundState.phase !== 'match_end') {
            this.handleForfeitVictory('Opponent disconnected. You win by forfeit!');
          }
        }
      },
      onHealthChange: (health: NetworkHealth) => {
        origOnHealthChange?.(health);
        this.updateNetworkHealthHUD(health);
      }
    };

    peer.flushEarlyMessages?.();
    if (peer.isConnected) {
      this.updateNetworkHealthHUD({
        rtt: peer.currentRtt,
        status: peer.networkQuality,
        isPeerVisible: peer.isPeerVisible
      });
    }
  }

  private updateNetworkHealthHUD(health: NetworkHealth) {
    const pingEl = this.netPingEl || (this.netPingEl = this.container.querySelector('#drift-net-ping'));
    const dotEl = this.netDotEl || (this.netDotEl = this.container.querySelector('#drift-net-dot'));
    const textEl = this.netTextEl || (this.netTextEl = this.container.querySelector('#drift-net-text'));
    const awayBanner = this.peerAwayBannerEl || (this.peerAwayBannerEl = this.container.querySelector('#drift-peer-away-banner'));

    if (pingEl && dotEl && textEl) {
      if (health.status === 'stalled') {
        dotEl.className = 'w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping';
        textEl.textContent = 'Lag ⚠️';
        pingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 rounded px-1.5 py-0.5';
      } else if (health.status === 'poor') {
        dotEl.className = 'w-1.5 h-1.5 rounded-full bg-rose-400';
        textEl.textContent = `${health.rtt}ms`;
        pingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 rounded px-1.5 py-0.5';
      } else if (health.status === 'moderate') {
        dotEl.className = 'w-1.5 h-1.5 rounded-full bg-amber-400';
        textEl.textContent = `${health.rtt}ms`;
        pingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 rounded px-1.5 py-0.5';
      } else {
        dotEl.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400';
        textEl.textContent = `${health.rtt || 30}ms`;
        pingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 rounded px-1.5 py-0.5';
      }
    }

    if (awayBanner) {
      if (!health.isPeerVisible) {
        awayBanner.classList.remove('hidden');
      } else {
        awayBanner.classList.add('hidden');
      }
    }
  }

  private handleNetworkMessage(msg: any) {
    switch (msg.type) {
      case 'PLAYER_LEAVE':
        if (this.roundState.phase !== 'match_end') {
          this.handleForfeitVictory('Opponent forfeited the match.');
        }
        break;

      case 'DRIFT_SYNC': {
        this.remoteTargetX = msg.x;
        this.remoteTargetY = msg.y;
        this.remoteTargetAngle = msg.angle;
        this.remoteTargetSpeed = msg.speed ?? 0;
        this.remoteTargetSteer = msg.steer ?? 0;
        this.remoteTargetSlipAngle = msg.slipAngle ?? 0;
        this.remoteTargetThrottle = msg.throttle ?? 0;
        this.remoteTargetHandbrake = !!msg.handbrake;
        this.lastRemoteUpdateTime = performance.now();

        // Snap immediately if large displacement (e.g. countdown, start, or desync > 150px)
        const dist = Math.hypot(this.enemyCar.x - msg.x, this.enemyCar.y - msg.y);
        if (dist > 150 || this.roundState.phase === 'countdown') {
          this.enemyCar.x = msg.x;
          this.enemyCar.y = msg.y;
          this.enemyCar.angle = msg.angle;
          this.enemyCar.speed = this.remoteTargetSpeed;
        }

        if (typeof msg.score === 'number') {
          this.roundState.enemyScore.totalScore = msg.score;
        }
        if (msg.finished && !this.roundState.enemyScore.finished) {
          this.roundState.enemyScore.finished = true;
        }
        break;
      }

      case 'DRIFT_ROUND_END':
        this.endRound('Round Completed');
        break;

      case 'DRIFT_ROUND_READY':
        this.peerReadyForNextRound = true;
        if (this.roundReadyState === 'waiting_for_peer') {
          this.handleProceedNextRound();
        }
        break;

      case 'DRIFT_REMATCH_OFFER':
      case 'REMATCH_REQUEST':
        this.showRematchOffer();
        break;

      case 'DRIFT_REMATCH_ACCEPT':
      case 'REMATCH_ACCEPT':
        this.startNewMatch(msg.seed);
        break;
    }
  }

  private tickCounter: number = 0;

  /**
   * Main Simulation & Render Loop
   */
  private gameLoop(timestamp: number) {
    if (this.isDestroyed) return;

    if (!this.lastTimestamp) {
      this.lastTimestamp = timestamp;
    }
    // Allow up to 80ms recovery per frame so physics simulation time is never dropped on mobile
    const elapsed = Math.min((timestamp - this.lastTimestamp) / 1000, 0.08);
    this.lastTimestamp = timestamp;
    this.physicsAccumulator += elapsed;

    // Run up to 4 physics steps per frame if needed to catch up (each takes ~0.02ms CPU)
    let steps = 0;
    while (this.physicsAccumulator >= this.FIXED_DT && steps < 4) {
      this.updatePhase(this.FIXED_DT);
      this.physicsAccumulator -= this.FIXED_DT;
      steps++;
    }
    // Prevent lag spiral only if accumulator exceeded 100ms (e.g. inactive background tab)
    if (this.physicsAccumulator > 0.1) {
      this.physicsAccumulator = 0;
    }

    // Smooth Remote Vehicle Interpolation & Dead Reckoning (Online PvP)
    if (this.isOnline && this.roundState.phase === 'racing') {
      const lerpFactor = 0.45;
      const dist = Math.hypot(this.remoteTargetX - this.enemyCar.x, this.remoteTargetY - this.enemyCar.y);

      if (dist > 150) {
        // Large warp or desync -> snap immediately
        this.enemyCar.x = this.remoteTargetX;
        this.enemyCar.y = this.remoteTargetY;
      } else if (dist > 0.5) {
        this.enemyCar.x += (this.remoteTargetX - this.enemyCar.x) * lerpFactor;
        this.enemyCar.y += (this.remoteTargetY - this.enemyCar.y) * lerpFactor;
      }

      // Dead reckoning: extrapolate forward if packet is between 30ms and 400ms old
      const timeSinceUpdate = (timestamp - this.lastRemoteUpdateTime) / 1000;
      if (timeSinceUpdate > 0.033 && timeSinceUpdate < 0.4 && this.remoteTargetSpeed > 1) {
        const deadReckonDist = this.remoteTargetSpeed * Math.min(elapsed, 0.05);
        this.enemyCar.x += Math.cos(this.enemyCar.angle) * deadReckonDist;
        this.enemyCar.y += Math.sin(this.enemyCar.angle) * deadReckonDist;
      }

      // Smooth Angle Lerping with wrap-around (-PI to PI)
      let diffAngle = this.remoteTargetAngle - this.enemyCar.angle;
      while (diffAngle > Math.PI) diffAngle -= Math.PI * 2;
      while (diffAngle < -Math.PI) diffAngle += Math.PI * 2;
      this.enemyCar.angle += diffAngle * lerpFactor;

      // Smooth auxiliary controls
      this.enemyCar.speed += (this.remoteTargetSpeed - this.enemyCar.speed) * lerpFactor;
      this.enemyCar.steerAngle += (this.remoteTargetSteer - this.enemyCar.steerAngle) * lerpFactor;
      this.enemyCar.driftSlipAngle += (this.remoteTargetSlipAngle - this.enemyCar.driftSlipAngle) * lerpFactor;
      this.enemyCar.throttle = this.remoteTargetThrottle;
      this.enemyCar.handbrake = this.remoteTargetHandbrake;

      // Watchdog timer: If remote player has not sent an update for > 2.5s, gently coast to a stop
      if (timeSinceUpdate > 2.5) {
        this.enemyCar.speed *= 0.95;
      }
    }

    // Adaptive Throttled Network Broadcast: ~30Hz during racing (every 33ms), 2.5Hz during countdown/idle
    if (this.isOnline && this.session.peer?.isConnected) {
      const syncInterval = (this.roundState.phase === 'racing') ? 33 : 400;
      if (timestamp - this.lastSyncBroadcastTime >= syncInterval) {
        this.lastSyncBroadcastTime = timestamp;
        this.session.peer.sendMessage({
          type: 'DRIFT_SYNC',
          x: this.playerCar.x,
          y: this.playerCar.y,
          angle: this.playerCar.angle,
          speed: this.playerCar.speed,
          slipAngle: this.playerCar.driftSlipAngle,
          throttle: this.playerCar.throttle,
          steer: this.playerCar.steerAngle,
          handbrake: this.playerCar.handbrake,
          score: this.roundState.playerScore.totalScore,
          roundScore: this.roundState.playerScore.totalScore,
          faults: [],
          finished: this.roundState.playerScore.finished,
          phase: this.roundState.phase,
          roundNum: this.roundState.currentRoundNumber,
          timestamp
        });
      }
    }

    // Sub-tick render interpolation factor (0.0 to 1.0) for silky 60/90/120Hz display refresh
    const alpha = Math.min(1.0, Math.max(0.0, this.physicsAccumulator / this.FIXED_DT));

    // Render Scene
    const isDay = (this.session.theme === 'light');
    this.renderer.render(
      this.playerCar,
      this.roundState.playerScore,
      this.playerModel,
      this.enemyCar,
      this.roundState.enemyScore,
      this.enemyModel,
      this.roundState,
      isDay,
      this.playerRoofNum,
      this.enemyRoofNum,
      alpha,
      this.playerMaxWaypoint
    );

    this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
  }

  private updatePhase(dt: number) {
    const r = this.roundState;

    if (r.phase === 'countdown') {
      r.phaseTimer -= dt;
      const count = Math.ceil(r.phaseTimer);
      const countdownEl = this.container.querySelector('#drift-countdown-text');

      if (count > 0) {
        if (countdownEl && countdownEl.textContent !== count.toString()) {
          countdownEl.textContent = count.toString();
          sounds.playMove();
        }
      } else {
        if (countdownEl) {
          countdownEl.textContent = 'GO!';
          countdownEl.className = 'text-7xl sm:text-9xl font-black font-mono tracking-tighter text-emerald-400 drop-shadow-[0_0_35px_rgba(16,185,129,0.9)]';
          sounds.playHardDrop();
        }
        r.phase = 'racing';
        // Reset stationary timers so anti-stall starts fresh at green light
        this.playerCar.stationaryTimer = 0;
        this.enemyCar.stationaryTimer = 0;

        // Hide countdown after 0.6s
        setTimeout(() => {
          const overlay = this.container.querySelector('#drift-countdown-overlay');
          if (overlay) overlay.classList.add('hidden');
        }, 600);
      }
      return;
    }

    if (r.phase === 'racing') {
      // 1. Step Player Physics
      this.engine.stepPhysics(this.playerCar, this.inputs, this.playerModel, dt);
      const pWall = this.engine.handleWallCollisions(this.playerCar, r.playerScore, this.playerModel, dt);
      if (pWall.collided) sounds.playWallCrash();

      // 2. Step Enemy Physics (AI or Remote Client)
      if (!this.isOnline) {
        const aiInputs = this.ai.computeInputs(this.enemyCar, r.enemyRole, this.playerCar, r.playerRole);
        this.engine.stepPhysics(this.enemyCar, aiInputs, this.enemyModel, dt);
        this.engine.handleWallCollisions(this.enemyCar, r.enemyScore, this.enemyModel, dt);
      }

      // 3. Inter-Vehicle Collision & Contact Penalty Resolution (OBB SAT)
      const carCol = this.engine.handleCarCollision(
        this.playerCar,
        this.playerModel,
        r.playerScore,
        r.playerRole,
        this.enemyCar,
        this.enemyModel,
        r.enemyScore,
        r.enemyRole,
        dt
      );

      if (carCol.collided) {
        // Immediately enforce wall containment post-impact so bumper bounce never expels car outside
        this.engine.handleWallCollisions(this.playerCar, r.playerScore, this.playerModel, dt);
        this.engine.handleWallCollisions(this.enemyCar, r.enemyScore, this.enemyModel, dt);

        // Emit visual sparks at bumper contact point
        this.renderer.emitSparks(carCol.contactX, carCol.contactY, carCol.normalX, carCol.normalY);

        if (carCol.isNewImpact) {
          // Play crunchy metallic bumper impact audio
          sounds.playCarBump();

          // Trigger Floating Score Text and Live HUD Banner
          if (carCol.penalizedParty === 'player') {
            this.renderer.addFloatingText('-50 CONTACT', carCol.contactX, carCol.contactY, '#f43f5e');
            this.renderer.contactAlert = {
              text: '⚠️ CONTACT PENALTY: -50 PTS (YOU)',
              color: 'rgba(225, 29, 72, 0.92)',
              expires: Date.now() + 1800
            };
          } else if (carCol.penalizedParty === 'enemy') {
            this.renderer.addFloatingText('RIVAL FAULT -50', carCol.contactX, carCol.contactY, '#38bdf8');
            this.renderer.contactAlert = {
              text: '⚡ RIVAL FAULT: -50 PTS TO RIVAL',
              color: 'rgba(2, 132, 199, 0.92)',
              expires: Date.now() + 1800
            };
          } else if (carCol.penalizedParty === 'both') {
            this.renderer.addFloatingText('MUTUAL -50', carCol.contactX, carCol.contactY, '#f59e0b');
            this.renderer.contactAlert = {
              text: '💥 MUTUAL CONTACT: -50 PTS EACH',
              color: 'rgba(217, 119, 6, 0.92)',
              expires: Date.now() + 1800
            };
          }
        } else if (carCol.penalizedParty !== 'none') {
          // Sustained contact / rubbing - refresh contact alert if expired or about to expire
          if (!this.renderer.contactAlert || Date.now() > this.renderer.contactAlert.expires - 300) {
            const isPl = carCol.penalizedParty === 'player';
            this.renderer.contactAlert = {
              text: isPl ? '⚠️ CONTINUOUS CONTACT: RUB PENALTY' : '⚡ RIVAL CONTINUOUS CONTACT: RUB PENALTY',
              color: isPl ? 'rgba(225, 29, 72, 0.92)' : 'rgba(2, 132, 199, 0.92)',
              expires: Date.now() + 1000
            };
          }
        }
      }


      // 4. Audio synthesis: Screech on drift
      if (this.playerCar.driftSlipAngle >= DRIFT_CONSTANTS.DRIFT_INIT_ANGLE_DEG && performance.now() - this.lastScreechTime > 120) {
        this.lastScreechTime = performance.now();
        sounds.playTireScreech(this.playerCar.driftSlipAngle / 90);
      }

      // 5. Evaluate Tandem Rules & Scoring
      this.engine.evaluateScoring(
        this.playerCar,
        r.playerScore,
        r.playerRole,
        this.enemyCar,
        r.enemyScore,
        r.enemyRole,
        dt
      );

      // 6. Check Finish Line Crossings (throttled to every 6 ticks = 10 times/sec to save CPU)
      this.tickCounter++;
      if (this.tickCounter % 6 === 0) {
        this.checkFinishLine(this.playerCar, r.playerScore, true);
        this.checkFinishLine(this.enemyCar, r.enemyScore, false);
      }

      // Check Round Completion Condition
      if (r.playerScore.finished && r.enemyScore.finished) {
        this.endRound('Both vehicles crossed finish line');
      } else if (r.playerScore.disqualified || r.enemyScore.disqualified) {
        sounds.playDisqualifyAlert();
        this.endRound('Disqualification via anti-stall timeout');
      }
    }
  }

  private checkFinishLine(car: VehiclePhysicsState, score: RunScoreBreakdown, isPlayer: boolean) {
    if (score.finished) return;
    const { waypointIndex } = this.track.getClosestProgress(car.x, car.y, car.angle);
    const totalWP = this.track.waypoints.length; // 120

    // Sequential waypoint advancement: only advance if the new waypoint is
    // within a reasonable forward range from the current position (prevents cross-loop
    // jumps at the figure-8 crossover where wp0 and wp60 share the same location)
    const curMax = isPlayer ? this.playerMaxWaypoint : this.enemyMaxWaypoint;
    const curRawWP = curMax % totalWP;

    // Calculate forward distance in waypoint indices (wrapping around)
    const fwdDist = (waypointIndex - curRawWP + totalWP) % totalWP;

    // Only advance if within 1-15 waypoints forward (prevents jumping from wp2 → wp60)
    if (fwdDist > 0 && fwdDist <= 15) {
      // Cumulative counter: add the forward distance to the running total
      // e.g., starting at 9, advancing 6 waypoints to wp15 → cumulative = 15
      // e.g., at wp119, advancing 1 waypoint to wp0 → cumulative = 120
      const newMax = curMax + fwdDist;
      if (isPlayer) this.playerMaxWaypoint = newMax;
      else this.enemyMaxWaypoint = newMax;
    }

    const maxWP = isPlayer ? this.playerMaxWaypoint : this.enemyMaxWaypoint;

    // Midpoint gate: car must have cumulatively advanced past waypoint 54
    // (well into Loop 2, past the crossover at wp0/wp60 ambiguity zone)
    const passedMid = maxWP >= 54;

    // Finish gate: car must have cumulatively advanced past waypoint 105 (near end of loop)
    // AND the current closest waypoint must be in the finish line zone (wp 118-120 or wp 0-8 across middle X)
    const completedLoop = maxWP >= 105;
    const inFinishZone = (waypointIndex >= 118 || waypointIndex <= 8);

    if (passedMid && completedLoop && inFinishZone && car.speed > 0.4) {
      score.finished = true;
      sounds.playDriftBonus();
    }
  }

  private endRound(reason: string) {
    if (this.roundState.phase === 'round_result' || this.roundState.phase === 'match_end') return;
    this.roundState.phase = 'round_result';

    sounds.playRoundGong();

    // Record History
    this.matchHistory.push({
      roundNumber: this.roundState.currentRoundNumber,
      roundName: `Round ${this.roundState.currentRoundNumber}`,
      playerScore: this.roundState.playerScore.totalScore,
      enemyScore: this.roundState.enemyScore.totalScore,
      playerRole: this.roundState.playerRole,
      enemyRole: this.roundState.enemyRole
    });

    // Show Round Result Modal
    this.showRoundResultModal(reason);

    if (this.isOnline && this.session.peer) {
      this.session.peer.sendMessage({
        type: 'DRIFT_ROUND_END',
        roundNum: this.roundState.currentRoundNumber,
        score: this.roundState.playerScore.totalScore,
        timeElapsed: this.roundState.playerScore.timeElapsed,
        dq: this.roundState.playerScore.disqualified
      });
    }
  }

  private showRoundResultModal(reason: string) {
    const modal = this.container.querySelector('#drift-round-modal') as HTMLElement;
    if (!modal) return;

    modal.classList.remove('hidden');

    const pScore = this.roundState.playerScore;
    const eScore = this.roundState.enemyScore;

    this.container.querySelector('#modal-round-tag')!.textContent = 
      reason ? `ROUND ${this.roundState.currentRoundNumber} • ${reason.toUpperCase()}` : `ROUND ${this.roundState.currentRoundNumber} OF 2 COMPLETE`;

    const pPenalties = Math.round(pScore.collisionPenalty + pScore.overtakePenalty);
    const pPenStr = pPenalties > 0 ? ` • Penalty: -${pPenalties}` : '';
    this.container.querySelector('#modal-player-score')!.textContent = `${pScore.totalScore}`;
    this.container.querySelector('#modal-player-breakdown')!.textContent = 
      `Angle: ${Math.round(pScore.driftAngleScore)} • Zone: ${Math.round(pScore.zoneScore)} • Prox: ${Math.round(pScore.proximityScore)}${pPenStr}`;

    const ePenalties = Math.round(eScore.collisionPenalty + eScore.overtakePenalty);
    const ePenStr = ePenalties > 0 ? ` • Penalty: -${ePenalties}` : '';
    this.container.querySelector('#modal-enemy-score')!.textContent = `${eScore.totalScore}`;
    this.container.querySelector('#modal-enemy-breakdown')!.textContent = 
      `Angle: ${Math.round(eScore.driftAngleScore)} • Zone: ${Math.round(eScore.zoneScore)} • Prox: ${Math.round(eScore.proximityScore)}${ePenStr}`;

    const summaryEl = this.container.querySelector('#modal-round-summary')!;
    const btnText = this.container.querySelector('#modal-btn-text');

    if (this.roundState.currentRoundNumber === 1) {
      summaryEl.textContent = 'Role switch next! You will swap Lead and Chase roles for Round 2.';
      if (btnText) btnText.textContent = 'Start Round 2 (Role Switch)';
    } else {
      // Evaluates Match Result or triggers OMT
      this.evaluateMatchResult(summaryEl, btnText);
    }
  }

  /**
   * Evaluates if there is a winner, or triggers OMT (One More Time) / Solo Sprint
   */
  private evaluateMatchResult(summaryEl: Element, btnText: Element | null) {
    let playerTotal = 0;
    let enemyTotal = 0;
    for (const h of this.matchHistory) {
      playerTotal += h.playerScore;
      enemyTotal += h.enemyScore;
    }

    if (playerTotal === enemyTotal) {
      // RULE 2: Exact tie -> OMT (One More Time) repeats 2 rounds!
      if (this.roundState.currentRoundNumber <= 2) {
        summaryEl.textContent = '🔥 SCORES ARE TIED! ONE MORE TIME (OMT) DECLARED! 2 MORE ROUNDS!';
        if (btnText) btnText.textContent = 'Start OMT Round 1';
        this.roundState.roundType = 'r3_omt1';
      } else {
        // Tied again after OMT -> Sudden Death Solo Sprint!
        summaryEl.textContent = '⚡ STILL TIED AFTER OMT! SUDDEN DEATH SOLO SPRINT RUNS!';
        if (btnText) btnText.textContent = 'Start Solo Drift Sprint';
        this.roundState.roundType = 'solo_p1';
      }
    } else if (playerTotal > enemyTotal) {
      // Player Wins!
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      summaryEl.textContent = `🏆 VICTORY! You won the Tandem Battle (${playerTotal} vs ${enemyTotal} pts)!`;
      this.roundState.phase = 'match_end';
      if (this.rematchState === 'offer_received') {
        this.showRematchOffer();
      } else if (btnText) {
        btnText.textContent = 'Play Again (Rematch)';
      }
    } else {
      // Enemy Wins
      summaryEl.textContent = `DEFEAT! Rival took the Tandem Battle (${enemyTotal} vs ${playerTotal} pts).`;
      this.roundState.phase = 'match_end';
      if (this.rematchState === 'offer_received') {
        this.showRematchOffer();
      } else if (btnText) {
        btnText.textContent = 'Play Again (Rematch)';
      }
    }
  }

  private handleProceedNextRound() {
    // If match ended, handle Two-Way Rematch Protocol
    if (this.roundState.phase === 'match_end') {
      if (this.session.mode === 'ai') {
        this.startNewMatch();
        return;
      }

      if (this.rematchState === 'offer_received') {
        const seed = Date.now();
        this.session.peer?.sendMessage({ type: 'REMATCH_ACCEPT', seed });
        this.startNewMatch(seed);
      } else if (this.rematchState === 'idle') {
        this.rematchState = 'requested';
        const nextBtn = this.container.querySelector('#modal-next-round-btn');
        const btnText = this.container.querySelector('#modal-btn-text');
        if (btnText) btnText.textContent = 'Waiting for Opponent...';
        if (nextBtn) nextBtn.classList.add('opacity-70', 'cursor-not-allowed');
        this.session.peer?.sendMessage({ type: 'REMATCH_REQUEST' });
      }
      return;
    }

    // In Online PvP, synchronize ready state before entering Round 2
    if (this.isOnline && this.session.peer?.isConnected) {
      if (!this.peerReadyForNextRound && this.roundReadyState === 'idle') {
        this.roundReadyState = 'waiting_for_peer';
        const nextBtn = this.container.querySelector('#modal-next-round-btn');
        const btnText = this.container.querySelector('#modal-btn-text');
        if (btnText) btnText.textContent = 'Waiting for Opponent...';
        if (nextBtn) nextBtn.classList.add('opacity-70', 'cursor-not-allowed');
        this.session.peer.sendMessage({
          type: 'DRIFT_ROUND_READY',
          roundNum: this.roundState.currentRoundNumber + 1
        });
        return;
      }
      // If peer already signaled ready, notify them that we're launching now!
      this.session.peer.sendMessage({
        type: 'DRIFT_ROUND_READY',
        roundNum: this.roundState.currentRoundNumber + 1
      });
    }

    this.roundReadyState = 'idle';
    this.peerReadyForNextRound = false;

    const modal = this.container.querySelector('#drift-round-modal') as HTMLElement;
    if (modal) modal.classList.add('hidden');

    const nextBtn = this.container.querySelector('#modal-next-round-btn');
    if (nextBtn) nextBtn.classList.remove('opacity-70', 'cursor-not-allowed');

    // Advance Round & Swap Roles cleanly for both Host and Guest!
    this.roundState.currentRoundNumber++;

    if (this.roundState.currentRoundNumber === 2) {
      const prevRole = this.roundState.playerRole;
      this.roundState.playerRole = (prevRole === 'lead') ? 'chase' : 'lead';
      this.roundState.enemyRole = (this.roundState.playerRole === 'lead') ? 'chase' : 'lead';
    } else if (this.roundState.roundType === 'r3_omt1') {
      this.roundState.playerRole = 'lead';
      this.roundState.enemyRole = 'chase';
    } else if (this.roundState.roundType === 'r4_omt2') {
      this.roundState.playerRole = 'chase';
      this.roundState.enemyRole = 'lead';
    } else if (this.roundState.roundType === 'solo_p1') {
      this.roundState.playerRole = 'solo';
      this.roundState.enemyRole = 'solo';
    }

    this.roundState.playerScore = this.engine.createInitialScore();
    this.roundState.enemyScore = this.engine.createInitialScore();
    this.roundState.phase = 'countdown';
    this.roundState.phaseTimer = 3.5;
    this.roundState.countdownValue = 3;

    // Reset countdown display
    const overlay = this.container.querySelector('#drift-countdown-overlay');
    if (overlay) overlay.classList.remove('hidden');
    const cdText = this.container.querySelector('#drift-countdown-text');
    if (cdText) {
      cdText.textContent = '3';
      cdText.className = 'text-6xl sm:text-8xl font-black font-mono tracking-tighter text-amber-400 drop-shadow-[0_0_25px_rgba(245,158,11,0.8)]';
    }

    this.renderer.clearSkidmarks();
    this.resetGridPositions();
    sounds.playRoundGong();
  }

  private resetGridPositions() {
    const isPlayerLead = (this.roundState.playerRole === 'lead' || this.roundState.playerRole === 'solo');

    // Grid Slot 1: Pole Position (Lead)
    // Grid Slot 2: Chase Position (~91px behind Lead on straightaway)
    const leadSlot = this.track.gridSlot1;
    const chaseSlot = this.track.gridSlot2;

    if (isPlayerLead) {
      this.playerCar = this.engine.createVehicleState(leadSlot.x, leadSlot.y, leadSlot.angle, this.playerModel);
      this.enemyCar = this.engine.createVehicleState(chaseSlot.x, chaseSlot.y, chaseSlot.angle, this.enemyModel);
    } else {
      this.enemyCar = this.engine.createVehicleState(leadSlot.x, leadSlot.y, leadSlot.angle, this.enemyModel);
      this.playerCar = this.engine.createVehicleState(chaseSlot.x, chaseSlot.y, chaseSlot.angle, this.playerModel);
    }

    // Initialize remote target to starting vehicle position
    this.remoteTargetX = this.enemyCar.x;
    this.remoteTargetY = this.enemyCar.y;
    this.remoteTargetAngle = this.enemyCar.angle;
    this.remoteTargetSpeed = 0;
    this.remoteTargetSteer = 0;
    this.remoteTargetSlipAngle = 0;
    this.remoteTargetThrottle = 0;
    this.remoteTargetHandbrake = false;
    this.lastRemoteUpdateTime = performance.now();

    // Reset stationary timeout timers
    this.playerCar.stationaryTimer = 0;
    this.enemyCar.stationaryTimer = 0;

    // Reset sequential waypoint checkpoint trackers
    // Lead car starts at grid slot 1 (wp 1), Chase at grid slot 2 (wp 0 staggered side-by-side)
    if (isPlayerLead) {
      this.playerMaxWaypoint = 1;
      this.enemyMaxWaypoint = 0;
      this.ai.reset(0, 1);
    } else {
      this.playerMaxWaypoint = 0;
      this.enemyMaxWaypoint = 1;
      this.ai.reset(1, 0);
    }

    // Immediately snap camera to player vehicle
    this.renderer.snapCamera(this.playerCar);
  }

  private showRematchOffer() {
    this.rematchState = 'offer_received';
    const nextBtn = this.container.querySelector('#modal-next-round-btn');
    const btnText = this.container.querySelector('#modal-btn-text');
    if (btnText) btnText.textContent = 'Accept Rematch!';
    if (nextBtn) {
      nextBtn.classList.remove('opacity-70', 'cursor-not-allowed');
      nextBtn.className = 'w-full sm:w-2/3 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wide transition-all shadow-lg shadow-emerald-500/30 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap animate-pulse';
    }
  }

  private startNewMatch(_seed?: number) {
    this.rematchState = 'idle';
    this.roundReadyState = 'idle';
    this.peerReadyForNextRound = false;

    const modal = this.container.querySelector('#drift-round-modal') as HTMLElement;
    if (modal) modal.classList.add('hidden');

    const nextBtn = this.container.querySelector('#modal-next-round-btn');
    const btnText = this.container.querySelector('#modal-btn-text');
    if (nextBtn) {
      nextBtn.classList.remove('opacity-70', 'cursor-not-allowed', 'animate-pulse');
      nextBtn.className = 'w-full sm:w-2/3 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wide transition-all shadow-lg shadow-emerald-500/25 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap';
    }
    if (btnText) btnText.textContent = 'Start Round 2 (Role Switch)';

    const isGuest = this.isOnline && !this.isHost;
    this.matchHistory = [];
    this.roundState = {
      currentRoundNumber: 1,
      roundType: 'r1_normal',
      playerRole: isGuest ? 'chase' : 'lead',
      enemyRole: isGuest ? 'lead' : 'chase',
      playerScore: this.engine.createInitialScore(),
      enemyScore: this.engine.createInitialScore(),
      countdownValue: 3,
      phase: 'countdown',
      phaseTimer: 3.5
    };

    // Reset countdown display
    const overlay = this.container.querySelector('#drift-countdown-overlay');
    if (overlay) overlay.classList.remove('hidden');
    const cdText = this.container.querySelector('#drift-countdown-text');
    if (cdText) {
      cdText.textContent = '3';
      cdText.className = 'text-6xl sm:text-8xl font-black font-mono tracking-tighter text-amber-400 drop-shadow-[0_0_25px_rgba(245,158,11,0.8)]';
    }

    this.renderer.clearSkidmarks();
    this.resetGridPositions();
    sounds.playRoundGong();
  }

  private handleForfeitVictory(reason: string) {
    this.roundState.phase = 'match_end';
    sounds.playFanfare();
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });

    const modal = this.container.querySelector('#drift-round-modal') as HTMLElement;
    if (modal) modal.classList.remove('hidden');

    const titleEl = this.container.querySelector('#modal-round-title');
    if (titleEl) titleEl.textContent = '🏆 VICTORY!';

    const tagEl = this.container.querySelector('#modal-round-tag');
    if (tagEl) tagEl.textContent = 'MATCH WON BY FORFEIT';

    const summaryEl = this.container.querySelector('#modal-round-summary');
    if (summaryEl) summaryEl.textContent = reason;

    const btnText = this.container.querySelector('#modal-btn-text');
    if (btnText) btnText.textContent = 'Play Again';

    const nextBtn = this.container.querySelector('#modal-next-round-btn');
    if (nextBtn) {
      nextBtn.classList.remove('opacity-70', 'cursor-not-allowed', 'animate-pulse');
      nextBtn.className = 'w-full sm:w-2/3 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wide transition-all shadow-lg shadow-emerald-500/25 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap';
    }
  }

  public setTheme(theme: AppTheme) {
    this.session.theme = theme;
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.isOnline && this.session.peer?.isConnected) {
      try {
        this.session.peer.sendMessage({ type: 'PLAYER_LEAVE' });
      } catch {}
    }

    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    window.removeEventListener('resize', this.boundResize);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.container.innerHTML = '';
  }
}
