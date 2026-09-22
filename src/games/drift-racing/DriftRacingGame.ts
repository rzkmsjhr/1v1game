import type { GameInstance, GameSession, AppTheme } from '../types';
import type {
  VehiclePhysicsState,
  RoundState,
  RunScoreBreakdown,
  CarModelType,
  MatchHistoryEntry
} from './drift-types';
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
          </div>

          <!-- Controls HUD -->
          <div class="flex items-center gap-2 pointer-events-auto">
            <button id="drift-sound-btn" class="w-8 h-8 rounded-xl bg-black/60 hover:bg-black/80 border border-white/10 text-xs font-bold transition-all shadow-md cursor-pointer flex items-center justify-center active:scale-95">
              ${sounds.enabled ? '🔊' : '🔇'}
            </button>
          </div>
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

            <button id="modal-next-round-btn" class="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wide transition-all shadow-lg shadow-emerald-500/25 cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap">
              <span id="modal-btn-text">Start Round 2 (Role Switch)</span> <span class="text-base leading-none">→</span>
            </button>
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

    peer.events = {
      ...peer.events,
      onMessage: (msg: any) => {
        origOnMessage?.(msg);
        if (msg.type === 'DRIFT_SYNC') {
          if (this.roundState.phase !== 'racing') return;
          this.enemyCar.x = msg.x;
          this.enemyCar.y = msg.y;
          this.enemyCar.angle = msg.angle;
          this.enemyCar.steerAngle = msg.steer;
          this.enemyCar.speed = msg.speed;
          this.enemyCar.driftSlipAngle = msg.slipAngle;
          this.enemyCar.throttle = msg.throttle;
          this.enemyCar.handbrake = msg.handbrake;
        } else if (msg.type === 'DRIFT_ROUND_END') {
          this.endRound('Round Completed');
        } else if (msg.type === 'DRIFT_REMATCH') {
          this.restartFullMatch();
        }
      },
      onStatusChange: (status: string, message?: string) => {
        origOnStatusChange?.(status as any, message);
        if (status === 'disconnected') {
          if (this.roundState.phase !== 'match_end') {
            this.endRound('Opponent disconnected');
          }
        }
      }
    };
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
      alpha
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

      // 3. Broadcast State in Online mode
      if (this.isOnline && this.session.peer) {
        this.session.peer.sendMessage({
          type: 'DRIFT_SYNC',
          x: this.playerCar.x,
          y: this.playerCar.y,
          angle: this.playerCar.angle,
          speed: this.playerCar.speed,
          slipAngle: this.playerCar.driftSlipAngle,
          score: this.roundState.playerScore.totalScore,
          throttle: this.playerCar.throttle,
          steer: this.playerCar.steerAngle,
          handbrake: this.playerCar.handbrake,
          roundScore: this.roundState.playerScore.totalScore,
          faults: []
        });
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
    const { waypointIndex } = this.track.getClosestProgress(car.x, car.y);
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
    // AND the current closest waypoint must be in the finish line zone (wp 0-15)
    const completedLoop = maxWP >= 105;
    const inFinishZone = waypointIndex >= 0 && waypointIndex <= 15;

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
      if (btnText) btnText.textContent = 'Play Again (Rematch)';
      this.roundState.phase = 'match_end';
    } else {
      // Enemy Wins
      summaryEl.textContent = `DEFEAT! Rival took the Tandem Battle (${enemyTotal} vs ${playerTotal} pts).`;
      if (btnText) btnText.textContent = 'Play Again (Rematch)';
      this.roundState.phase = 'match_end';
    }
  }

  private handleProceedNextRound() {
    if (this.roundState.phase === 'match_end') {
      this.restartFullMatch();
      return;
    }

    const modal = this.container.querySelector('#drift-round-modal') as HTMLElement;
    if (modal) modal.classList.add('hidden');

    // Advance Round & Swap Roles
    this.roundState.currentRoundNumber++;

    if (this.roundState.currentRoundNumber === 2) {
      // Normal Round 2: swap roles!
      this.roundState.playerRole = 'chase';
      this.roundState.enemyRole = 'lead';
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

    // Reset stationary timeout timers
    this.playerCar.stationaryTimer = 0;
    this.enemyCar.stationaryTimer = 0;

    // Reset sequential waypoint checkpoint trackers
    // Lead car starts at grid slot 1 (wp9), Chase at grid slot 2 (wp6)
    if (isPlayerLead) {
      this.playerMaxWaypoint = 9;
      this.enemyMaxWaypoint = 6;
      this.ai.reset(6, 9);
    } else {
      this.playerMaxWaypoint = 6;
      this.enemyMaxWaypoint = 9;
      this.ai.reset(9, 6);
    }

    // Immediately snap camera to player vehicle
    this.renderer.snapCamera(this.playerCar);
  }

  private restartFullMatch() {
    this.matchHistory = [];
    this.roundState = {
      currentRoundNumber: 1,
      roundType: 'r1_normal',
      playerRole: 'lead',
      enemyRole: 'chase',
      playerScore: this.engine.createInitialScore(),
      enemyScore: this.engine.createInitialScore(),
      countdownValue: 3,
      phase: 'countdown',
      phaseTimer: 3.5
    };

    const modal = this.container.querySelector('#drift-round-modal') as HTMLElement;
    if (modal) modal.classList.add('hidden');

    this.renderer.clearSkidmarks();
    this.resetGridPositions();
    sounds.playRoundGong();

    if (this.isOnline && this.session.peer) {
      this.session.peer.sendMessage({
        type: 'DRIFT_REMATCH',
        seed: Date.now()
      });
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
