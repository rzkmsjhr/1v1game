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

  // Lap Completion Gate Tracking
  private playerPassedMidpoint: boolean = false;
  private enemyPassedMidpoint: boolean = false;

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
      <div class="relative w-full h-full flex flex-col bg-[#0b0f19] text-white overflow-hidden select-none font-sans">
        
        <!-- Canvas Container -->
        <div id="drift-canvas-container" class="relative flex-1 w-full h-full overflow-hidden">
          <!-- Canvas injected dynamically -->
        </div>

        <!-- Top Header Action Bar -->
        <div class="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-none z-10">
          <div class="flex items-center gap-2 pointer-events-auto">
            <button id="drift-exit-btn" class="px-3 py-1.5 rounded-xl bg-black/60 hover:bg-black/80 border border-white/10 text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5">
              <span>←</span> <span>Exit</span>
            </button>
            <div class="px-3 py-1 rounded-xl bg-black/60 border border-white/10 text-[11px] font-mono font-bold text-amber-300">
              ${this.isOnline ? '🌐 1v1 ONLINE' : `🤖 VS AI (${(this.session.aiDifficulty || 'MED').toUpperCase()})`}
            </div>
          </div>

          <!-- Controls HUD -->
          <div class="flex items-center gap-2 pointer-events-auto">
            <button id="drift-sound-btn" class="w-8 h-8 rounded-xl bg-black/60 hover:bg-black/80 border border-white/10 text-xs font-bold transition-all shadow-md cursor-pointer flex items-center justify-center">
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

        <!-- Round End Result Modal (Hidden by default) -->
        <div id="drift-round-modal" class="hidden absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-30">
          <div class="max-w-md w-full bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 text-center">
            <div id="modal-round-tag" class="text-xs font-black uppercase tracking-widest text-amber-400">ROUND 1 COMPLETED</div>
            <h3 id="modal-round-title" class="text-2xl font-black text-white">Tandem Battle Results</h3>
            
            <div class="grid grid-cols-2 gap-3 bg-slate-950 p-4 rounded-2xl border border-slate-800 text-left">
              <div>
                <div class="text-[10px] font-black uppercase text-cyan-400">YOU (${this.roundState.playerRole.toUpperCase()})</div>
                <div id="modal-player-score" class="text-2xl font-black font-mono text-cyan-300">0 pts</div>
                <div id="modal-player-breakdown" class="text-[10px] text-slate-400 mt-1">Angle: 0 • Zone: 0</div>
              </div>
              <div class="border-l border-slate-800 pl-3">
                <div class="text-[10px] font-black uppercase text-rose-400">RIVAL (${this.roundState.enemyRole.toUpperCase()})</div>
                <div id="modal-enemy-score" class="text-2xl font-black font-mono text-rose-300">0 pts</div>
                <div id="modal-enemy-breakdown" class="text-[10px] text-slate-400 mt-1">Angle: 0 • Zone: 0</div>
              </div>
            </div>

            <div id="modal-round-summary" class="text-xs text-slate-300">
              Role switch next round! Get ready to take the other role.
            </div>

            <button id="modal-next-round-btn" class="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-sm uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/25 cursor-pointer">
              Next Round →
            </button>
          </div>
        </div>

        <!-- Virtual Touch Controls for Mobile -->
        <div class="sm:hidden absolute bottom-1 inset-x-1 pointer-events-none z-10" style="max-height:40vh">
          <!-- Left side: Steer controls (vertically stacked) -->
          <div class="absolute left-1 bottom-0 flex flex-col gap-1.5 pointer-events-auto">
            <button id="btn-touch-left" class="w-16 h-16 rounded-2xl bg-black/70 border border-white/20 text-2xl font-bold flex items-center justify-center active:bg-cyan-500/40 text-white select-none touch-none">◀</button>
            <button id="btn-touch-right" class="w-16 h-16 rounded-2xl bg-black/70 border border-white/20 text-2xl font-bold flex items-center justify-center active:bg-cyan-500/40 text-white select-none touch-none">▶</button>
          </div>
          <!-- Right side: Action controls (Gas tall, Brake + Drift beside it) -->
          <div class="absolute right-1 bottom-0 flex items-end gap-1.5 pointer-events-auto">
            <div class="flex flex-col gap-1.5">
              <button id="btn-touch-handbrake" class="w-14 h-14 rounded-2xl bg-amber-500/40 border border-amber-500/60 text-[10px] font-black flex items-center justify-center active:bg-amber-500 text-amber-200 select-none touch-none">DRIFT</button>
              <button id="btn-touch-brake" class="w-14 h-14 rounded-2xl bg-red-500/40 border border-red-500/60 text-[10px] font-black flex items-center justify-center active:bg-red-500 text-white select-none touch-none">BRAKE</button>
            </div>
            <button id="btn-touch-gas" class="w-16 rounded-2xl bg-emerald-500/50 border border-emerald-500/70 text-2xl font-bold flex items-center justify-center active:bg-emerald-500 text-white select-none touch-none" style="height:7.5rem">▲</button>
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
      const el = this.container.querySelector(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(); });
      el.addEventListener('touchend', (e) => { e.preventDefault(); onUp(); });
      el.addEventListener('mousedown', () => onDown());
      el.addEventListener('mouseup', () => onUp());
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

  /**
   * Main Simulation & Render Loop
   */
  private gameLoop(timestamp: number) {
    if (this.isDestroyed) return;

    const dt = Math.min((timestamp - this.lastTimestamp) / 1000, 0.05);
    this.lastTimestamp = timestamp;

    // 1. Update Game Phase
    this.updatePhase(dt);

    // 2. Render Scene
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
      this.enemyRoofNum
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
      const pWall = this.engine.handleWallCollisions(this.playerCar, r.playerScore, dt);
      if (pWall.collided) sounds.playWallCrash();

      // 2. Step Enemy Physics (AI or Remote Client)
      if (!this.isOnline) {
        const aiInputs = this.ai.computeInputs(this.enemyCar, r.enemyRole, this.playerCar, r.playerRole);
        this.engine.stepPhysics(this.enemyCar, aiInputs, this.enemyModel, dt);
        this.engine.handleWallCollisions(this.enemyCar, r.enemyScore, dt);
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

      // 6. Check Finish Line Crossings (after driving full Figure-8)
      this.checkFinishLine(this.playerCar, r.playerScore, true);
      this.checkFinishLine(this.enemyCar, r.enemyScore, false);

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
    const { progress, waypointIndex } = this.track.getClosestProgress(car.x, car.y);

    // Midpoint gate: vehicles must reach Loop 2 (progress 0.45 to 0.85)
    if (progress > 0.45 && progress < 0.85) {
      if (isPlayer) this.playerPassedMidpoint = true;
      else this.enemyPassedMidpoint = true;
    }

    const passedMid = isPlayer ? this.playerPassedMidpoint : this.enemyPassedMidpoint;

    // After completing the figure-8 loops and returning to checkered finish line at wp 10:
    if (passedMid && waypointIndex >= 9 && waypointIndex <= 15 && car.speed > 0.4) {
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

    this.container.querySelector('#modal-player-score')!.textContent = `${pScore.totalScore} pts`;
    this.container.querySelector('#modal-player-breakdown')!.textContent = 
      `Angle: ${Math.round(pScore.driftAngleScore)} • Zone: ${Math.round(pScore.zoneScore)} • Prox: ${Math.round(pScore.proximityScore)}`;

    this.container.querySelector('#modal-enemy-score')!.textContent = `${eScore.totalScore} pts`;
    this.container.querySelector('#modal-enemy-breakdown')!.textContent = 
      `Angle: ${Math.round(eScore.driftAngleScore)} • Zone: ${Math.round(eScore.zoneScore)} • Prox: ${Math.round(eScore.proximityScore)}`;

    const summaryEl = this.container.querySelector('#modal-round-summary')!;
    const btnNext = this.container.querySelector('#modal-next-round-btn') as HTMLButtonElement;

    if (this.roundState.currentRoundNumber === 1) {
      summaryEl.textContent = 'Role switch next! You will swap Lead and Chase roles for Round 2.';
      btnNext.textContent = 'Start Round 2 (Role Switch) →';
    } else {
      // Evaluates Match Result or triggers OMT
      this.evaluateMatchResult(summaryEl, btnNext);
    }
  }

  /**
   * Evaluates if there is a winner, or triggers OMT (One More Time) / Solo Sprint
   */
  private evaluateMatchResult(summaryEl: Element, btnNext: HTMLButtonElement) {
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
        btnNext.textContent = 'Start OMT Round 1 →';
        this.roundState.roundType = 'r3_omt1';
      } else {
        // Tied again after OMT -> Sudden Death Solo Sprint!
        summaryEl.textContent = '⚡ STILL TIED AFTER OMT! SUDDEN DEATH SOLO SPRINT RUNS!';
        btnNext.textContent = 'Start Solo Drift Sprint →';
        this.roundState.roundType = 'solo_p1';
      }
    } else if (playerTotal > enemyTotal) {
      // Player Wins!
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      summaryEl.textContent = `🏆 VICTORY! You won the Tandem Battle (${playerTotal} vs ${enemyTotal} pts)!`;
      btnNext.textContent = 'Play Again (Rematch)';
      this.roundState.phase = 'match_end';
    } else {
      // Enemy Wins
      summaryEl.textContent = `DEFEAT! Rival took the Tandem Battle (${enemyTotal} vs ${playerTotal} pts).`;
      btnNext.textContent = 'Play Again (Rematch)';
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

    // Reset lap midpoint gates
    this.playerPassedMidpoint = false;
    this.enemyPassedMidpoint = false;

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

    this.container.innerHTML = '';
  }
}
