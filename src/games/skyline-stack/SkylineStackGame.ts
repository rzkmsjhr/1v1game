import type { GameInstance, GameSession, AppTheme } from '../types';
import type { NetworkMessage, NetworkHealth } from '../../network/webrtc-peer';
import { SkylineStackEngine } from './skyline-engine';
import { SkylineRenderer } from './renderers/SkylineRenderer';
import { SkylineStackAI } from './skyline-ai';
import { SKYLINE_CONSTANTS } from './skyline-constants';
import type { DropEvent, SkylinePlayerState } from './skyline-types';
import { sounds } from '../../engine/sound';
import confetti from 'canvas-confetti';

export class SkylineStackGame implements GameInstance {
  private container: HTMLElement;
  private session: GameSession;
  private currentTheme: AppTheme;

  private canvas!: HTMLCanvasElement;
  private renderer!: SkylineRenderer;
  private playerEngine!: SkylineStackEngine;
  private opponentEngine: SkylineStackEngine | null = null;
  private ai: SkylineStackAI | null = null;

  private animFrameId: number | null = null;
  private lastTime: number = performance.now();
  private startTime: number = Date.now();
  private resizeObserver: ResizeObserver | null = null;

  // State & Network
  private opponentName: string = 'Opponent';
  private rematchState: 'idle' | 'requested' | 'offer_received' = 'idle';
  private winnerLocked: boolean = false;
  private localVictoryTimestamp: number = 0;
  private lastSyncBroadcastTime: number = 0;

  // Cached Remote Opponent State for ghost HUD
  private remoteOpponentState: SkylinePlayerState | null = null;

  // Cached DOM elements
  private playerFloorEl!: HTMLElement;
  private opponentFloorEl!: HTMLElement;
  private playerHeartsEl!: HTMLElement;
  private opponentHeartsEl!: HTMLElement;
  private playerPopEl!: HTMLElement;
  private comboBadgeEl!: HTMLElement;
  private heightMeterEl!: HTMLElement;
  private peerAwayBannerEl: HTMLElement | null = null;
  private pingEl: HTMLElement | null = null;
  private pingDotEl: HTMLElement | null = null;
  private pingTextEl: HTMLElement | null = null;
  private gameOverModalEl!: HTMLElement;
  private gameOverTitleEl!: HTMLElement;
  private gameOverStatsEl!: HTMLElement;
  private dropBtnEl!: HTMLElement;

  // Bound listeners
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundResize: () => void;

  constructor(container: HTMLElement, session: GameSession) {
    this.container = container;
    this.session = session;
    this.currentTheme = session.theme;

    this.boundKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
    this.boundResize = () => this.handleResize();

    this.mountUI();
    this.initEnginesAndRenderer();
    this.initControls();
    this.setupNetwork();
    this.startLoop();
  }

  // =========================================================================
  // UI MOUNTING
  // =========================================================================
  private mountUI() {
    const isDark = this.currentTheme === 'dark';
    this.container.className = 'w-full h-[100dvh] max-h-[100dvh] p-0 m-0 overflow-hidden flex justify-center items-center ' +
      (isDark ? 'bg-[#060911]' : 'bg-slate-100');

    this.container.innerHTML = `
      <div id="stack-frame" class="relative w-full max-w-[560px] sm:max-w-[620px] h-[100dvh] max-h-[100dvh] flex flex-col justify-between overflow-hidden shadow-2xl select-none ${
        isDark ? 'bg-[#0b1120] text-white' : 'bg-white text-slate-900'
      }">

        <!-- TOP BAR: Duel Progress, Hearts & Ping -->
        <div id="stack-top-bar" class="px-3 py-2 flex items-center justify-between border-b ${
          isDark ? 'border-slate-800 bg-slate-900/95' : 'border-slate-200 bg-white/95'
        } z-20 shrink-0">
          
          <!-- Exit & Sound buttons -->
          <div class="flex items-center gap-1.5">
            <button id="stack-btn-exit" class="px-2.5 py-1 text-xs font-bold rounded-lg border transition ${
              isDark ? 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300' : 'border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700'
            } cursor-pointer">
              ← Exit
            </button>
            <button id="stack-btn-sound" class="p-1 text-xs rounded-lg transition hover:opacity-80 cursor-pointer" title="Toggle Sound">
              🔊
            </button>
          </div>

          <!-- Middle Duel Tower Floor Tracker -->
          <div class="flex flex-col items-center">
            <div class="flex items-center gap-2 font-mono font-black text-xs sm:text-sm">
              <span id="stack-player-floors" class="text-cyan-400">F0 / ${SKYLINE_CONSTANTS.TARGET_FLOORS}</span>
              <span class="text-slate-500 font-normal">vs</span>
              <span id="stack-opp-floors" class="text-rose-400">F0 / ${SKYLINE_CONSTANTS.TARGET_FLOORS}</span>
            </div>
            <!-- Hearts -->
            <div class="flex items-center gap-3 text-[10px] mt-0.5">
              <span id="stack-player-hearts" class="tracking-widest">❤️❤️❤️</span>
              <span id="stack-opp-hearts" class="tracking-widest text-slate-400">❤️❤️❤️</span>
            </div>
          </div>

          <!-- Network Ping & Mode Badge -->
          <div class="flex items-center gap-1.5">
            <span id="stack-net-ping" class="${this.session.mode === 'online' ? 'inline-flex' : 'hidden'} items-center gap-1 text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 rounded px-1.5 py-0.5">
              <span id="stack-net-dot" class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span id="stack-net-text">25ms</span>
            </span>
            <span class="px-2 py-0.5 text-[10px] font-black uppercase rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              ${this.session.mode === 'online' ? '1v1 Online' : `Bot: ${(this.session.aiDifficulty || 'med').toUpperCase()}`}
            </span>
          </div>
        </div>

        <!-- Inactive Tab / Peer Away Banner -->
        <div id="stack-peer-away-banner" class="hidden w-full text-center py-1 px-2 bg-amber-500/20 border-b border-amber-500/40 text-amber-300 font-bold text-[10px] tracking-wide animate-pulse z-30 select-none shrink-0">
          ⚠️ Opponent is tabbed out / minimized
        </div>

        <!-- MAIN ARENA CANVAS -->
        <div id="stack-canvas-wrap" class="relative flex-1 min-h-0 w-full overflow-hidden flex items-center justify-center bg-transparent">
          <canvas id="stack-canvas" class="w-full h-full cursor-pointer block touch-none select-none"></canvas>

          <!-- In-Game Float Badges: Combo & Population -->
          <div class="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none z-10">
            <div id="stack-combo-badge" class="hidden px-2.5 py-1 rounded-xl font-black text-xs bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-orange-500/30 animate-bounce tracking-wide border border-amber-300">
              🔥 2x COMBO!
            </div>
            <div class="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-black/50 text-slate-300 backdrop-blur-sm border border-white/10">
              <span id="stack-pop-count">👥 0 Pop</span> • <span id="stack-height-meter">0m</span>
            </div>
          </div>
        </div>

        <!-- BOTTOM DOCK: Tap / Drop Button -->
        <div id="stack-bottom-dock" class="p-3 border-t ${
          isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-slate-50/95'
        } z-20 shrink-0">
          <button id="stack-btn-drop" class="w-full py-3.5 px-4 rounded-2xl font-black text-sm sm:text-base tracking-wider uppercase text-white bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-500 shadow-xl shadow-orange-500/35 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2">
            <span>🏗️</span>
            <span>DROP FLOOR [TAP / SPACE]</span>
          </button>
        </div>

        <!-- GAME OVER & REMATCH MODAL -->
        <div id="stack-game-over-modal" class="hidden absolute inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div class="w-full max-w-sm rounded-3xl p-6 flex flex-col items-center text-center gap-4 shadow-2xl border ${
            isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
          }">
            <div id="stack-game-over-title" class="text-3xl font-black tracking-tight">🏆 VICTORY!</div>
            <div id="stack-game-over-stats" class="text-xs text-slate-400 leading-relaxed font-mono w-full">
              <!-- Dynamically populated stats -->
            </div>
            <div class="flex gap-2 w-full mt-2">
              <button id="stack-btn-rematch" class="flex-1 py-3 rounded-xl text-xs font-black bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-400 hover:to-blue-500 text-white transition shadow-lg shadow-cyan-500/30 cursor-pointer active:scale-95 uppercase tracking-wide">
                Play Again
              </button>
              <button id="stack-btn-modal-exit" class="px-4 py-3 rounded-xl text-xs font-black border transition ${
                isDark ? 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300' : 'border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700'
              } cursor-pointer">
                Exit
              </button>
            </div>
          </div>
        </div>

      </div>
    `;

    // Cache elements
    this.playerFloorEl = document.getElementById('stack-player-floors')!;
    this.opponentFloorEl = document.getElementById('stack-opp-floors')!;
    this.playerHeartsEl = document.getElementById('stack-player-hearts')!;
    this.opponentHeartsEl = document.getElementById('stack-opp-hearts')!;
    this.playerPopEl = document.getElementById('stack-pop-count')!;
    this.comboBadgeEl = document.getElementById('stack-combo-badge')!;
    this.heightMeterEl = document.getElementById('stack-height-meter')!;
    this.peerAwayBannerEl = document.getElementById('stack-peer-away-banner');
    this.pingEl = document.getElementById('stack-net-ping');
    this.pingDotEl = document.getElementById('stack-net-dot');
    this.pingTextEl = document.getElementById('stack-net-text');
    this.gameOverModalEl = document.getElementById('stack-game-over-modal')!;
    this.gameOverTitleEl = document.getElementById('stack-game-over-title')!;
    this.gameOverStatsEl = document.getElementById('stack-game-over-stats')!;
    this.dropBtnEl = document.getElementById('stack-btn-drop')!;

    // Exit Button
    const handleExit = () => {
      if (this.session.mode === 'online' && this.session.peer?.isConnected) {
        try {
          this.session.peer.sendMessage({ type: 'PLAYER_LEAVE' });
        } catch {}
      }
      this.session.onExit();
    };
    document.getElementById('stack-btn-exit')?.addEventListener('click', handleExit);
    document.getElementById('stack-btn-modal-exit')?.addEventListener('click', handleExit);

    // Sound Toggle
    document.getElementById('stack-btn-sound')?.addEventListener('click', (e) => {
      const isMuted = !sounds.toggleMute();
      (e.currentTarget as HTMLElement).textContent = isMuted ? '🔇' : '🔊';
    });

    // Rematch Button
    document.getElementById('stack-btn-rematch')?.addEventListener('click', () => {
      this.handleRematchClick();
    });
  }

  // =========================================================================
  // ENGINES & RENDERER INITIALIZATION
  // =========================================================================
  private initEnginesAndRenderer() {
    this.canvas = document.getElementById('stack-canvas') as HTMLCanvasElement;
    this.renderer = new SkylineRenderer(this.canvas, this.currentTheme);

    const initialSeed = Date.now();
    this.playerEngine = new SkylineStackEngine(initialSeed, SKYLINE_CONSTANTS.TARGET_FLOORS, 'player', 'You');

    this.playerEngine.onDrop = (e: DropEvent) => this.handleLocalPlayerDrop(e);
    this.playerEngine.onGameOver = (winner) => this.handleGameOver(winner);

    // Offline AI Mode
    if (this.session.mode === 'ai') {
      this.opponentName = `Bot (${(this.session.aiDifficulty || 'med').toUpperCase()})`;
      this.opponentEngine = new SkylineStackEngine(initialSeed + 1, SKYLINE_CONSTANTS.TARGET_FLOORS, 'opponent', this.opponentName);
      this.ai = new SkylineStackAI(this.opponentEngine, this.session.aiDifficulty || 'medium');

      this.opponentEngine.onDrop = (_e: DropEvent) => {
        this.updateHUD();
      };
      this.opponentEngine.onGameOver = (winner) => {
        // Invert for local player: if bot won, player lost
        const result = winner === 'opponent' ? 'opponent' : (winner === 'player' ? 'player' : 'draw');
        this.handleGameOver(result === 'player' ? 'opponent' : 'player');
      };
    } else {
      this.opponentName = 'Rival';
    }

    this.handleResize();
    window.addEventListener('resize', this.boundResize);

    if (this.canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.canvas.parentElement);
    }
  }

  private initControls() {
    // 1. Direct Tap on Canvas
    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.triggerDrop();
    });

    // 2. Large Bottom Action Button
    this.dropBtnEl.addEventListener('click', (e) => {
      e.preventDefault();
      this.triggerDrop();
    });

    // 3. Keyboard (Space, ArrowDown, Enter)
    window.addEventListener('keydown', this.boundKeyDown);
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.repeat) return;
    if (e.code === 'Space' || e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      this.triggerDrop();
    }
  }

  private triggerDrop() {
    if (this.winnerLocked || this.playerEngine.isGameOver) return;
    const dropped = this.playerEngine.dropBlock();
    if (dropped) {
      sounds.playWinchRelease();
    }
  }

  private handleLocalPlayerDrop(e: DropEvent) {
    const topFloor = this.playerEngine.state.floors[this.playerEngine.state.floors.length - 1];
    const topFloorY = topFloor ? topFloor.y + topFloor.height : 0;
    const topFloorSwayX = this.playerEngine.calculateTopFloorSwayX();

    if (e.quality === 'perfect') {
      sounds.playBlockPerfect(e.combo);
      this.renderer.addSparkles(topFloorSwayX, topFloorY, 24);
      this.renderer.addFloatingText(e.combo > 1 ? `PERFECT! x${e.combo}` : 'PERFECT! +150', topFloorSwayX, topFloorY + 20, '#facc15');
    } else if (e.quality === 'great') {
      sounds.playBlockThud();
      this.renderer.addDustPuff(topFloorSwayX, topFloorY);
      this.renderer.addFloatingText('GREAT! +75', topFloorSwayX, topFloorY + 20, '#38bdf8');
    } else if (e.quality === 'good') {
      sounds.playBlockThud();
      sounds.playTowerGroan();
      this.renderer.addDustPuff(topFloorSwayX, topFloorY);
      this.renderer.addFloatingText('GOOD! +40', topFloorSwayX, topFloorY + 20, '#4ade80');
    } else if (e.quality === 'miss') {
      sounds.playBlockCrash();
      this.renderer.addFloatingText('MISS! -1 ❤️', topFloorSwayX, topFloorY + 20, '#f43f5e');
    }

    this.updateHUD();

    // Broadcast drop over WebRTC
    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      this.session.peer.sendMessage({
        type: 'STACK_DROP',
        floorNumber: e.floorNumber,
        x: topFloor ? topFloor.x : 0,
        isPerfect: e.quality === 'perfect',
        combo: e.combo,
        timestamp: Date.now()
      });
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
            if (this.winnerLocked || this.playerEngine.isGameOver) return;
            this.handleForfeitVictory('Opponent disconnected from the match.');
          }
        },
        onHealthChange: (health: NetworkHealth) => {
          origOnHealthChange?.(health);
          this.updateNetworkHealthHUD(health);
        }
      }
    });

    // Host sends initial seed to guest
    if (this.session.peer.role === 'host') {
      this.session.peer.sendMessage({
        type: 'STACK_INIT',
        seed: this.playerEngine.seed,
        targetFloors: SKYLINE_CONSTANTS.TARGET_FLOORS
      });
    } else {
      this.session.peer.sendMessage({ type: 'STACK_REQUEST_SEED' });
    }
  }

  private handleNetworkMessage(msg: NetworkMessage) {
    switch (msg.type) {
      case 'PLAYER_LEAVE':
        if (this.winnerLocked || this.playerEngine.isGameOver) break;
        this.handleForfeitVictory('Opponent forfeited the match.');
        break;

      case 'STACK_REQUEST_SEED':
        if (this.session.peer?.role === 'host') {
          this.session.peer.sendMessage({
            type: 'STACK_INIT',
            seed: this.playerEngine.seed,
            targetFloors: SKYLINE_CONSTANTS.TARGET_FLOORS
          });
        }
        break;

      case 'STACK_INIT':
        this.playerEngine.reset(msg.seed);
        this.renderer.reset();
        this.updateHUD();
        break;

      case 'STACK_DROP':
        if (!this.remoteOpponentState) {
          this.remoteOpponentState = {
            id: 'opponent',
            name: this.opponentName,
            floors: new Array(msg.floorNumber).fill({} as any),
            fallingBlock: null,
            tumblingBlocks: [],
            particles: [],
            floatingTexts: [],
            crane: {} as any,
            wobbleAngle: 0,
            wobbleVelocity: 0,
            lives: 3,
            maxLives: 3,
            population: 0,
            combo: msg.combo,
            maxCombo: msg.combo,
            perfectCount: 0,
            isDead: false,
            hasFinished: msg.floorNumber >= SKYLINE_CONSTANTS.TARGET_FLOORS,
            finishTime: 0
          };
        } else {
          this.remoteOpponentState.floors = new Array(msg.floorNumber).fill({} as any);
          this.remoteOpponentState.combo = msg.combo;
          if (msg.floorNumber >= SKYLINE_CONSTANTS.TARGET_FLOORS) {
            this.remoteOpponentState.hasFinished = true;
          }
        }
        this.updateHUD();
        break;

      case 'STACK_MISS':
        if (this.remoteOpponentState) {
          this.remoteOpponentState.lives = msg.remainingLives;
          if (msg.remainingLives <= 0) {
            this.remoteOpponentState.isDead = true;
            if (!this.winnerLocked) {
              this.handleGameOver('player');
            }
          }
        }
        this.updateHUD();
        break;

      case 'STACK_SYNC':
        if (!this.remoteOpponentState) {
          this.remoteOpponentState = {
            id: 'opponent',
            name: this.opponentName,
            floors: new Array(msg.currentFloor).fill({} as any),
            fallingBlock: null,
            tumblingBlocks: [],
            particles: [],
            floatingTexts: [],
            crane: {} as any,
            wobbleAngle: msg.wobbleAngle,
            wobbleVelocity: 0,
            lives: msg.lives,
            maxLives: 3,
            population: msg.population,
            combo: msg.combo,
            maxCombo: msg.combo,
            perfectCount: 0,
            isDead: msg.lives <= 0,
            hasFinished: msg.currentFloor >= SKYLINE_CONSTANTS.TARGET_FLOORS,
            finishTime: 0
          };
        } else {
          this.remoteOpponentState.floors = new Array(msg.currentFloor).fill({} as any);
          this.remoteOpponentState.wobbleAngle = msg.wobbleAngle;
          this.remoteOpponentState.population = msg.population;
          this.remoteOpponentState.lives = msg.lives;
          this.remoteOpponentState.combo = msg.combo;
        }
        this.updateHUD();
        break;

      case 'STACK_VICTORY':
        if (!this.winnerLocked) {
          this.winnerLocked = true;
          this.ai?.stop();
          this.playerEngine.isGameOver = true;
          this.showGameOverModal(false, `${this.opponentName} built 30 floors first!`);
        } else if (this.session.peer?.role === 'host') {
          // Host arbitration for simultaneous 30th floor drops
          const guestWonFirst = (msg.timestamp || 0) < this.localVictoryTimestamp;
          if (guestWonFirst) {
            this.winnerLocked = false;
            this.showGameOverModal(false, `${this.opponentName} reached floor 30 first!`);
          }
          this.session.peer.sendMessage({
            type: 'STACK_VICTORY_CONFIRM',
            winner: guestWonFirst ? 'guest' : 'host'
          });
        }
        break;

      case 'STACK_VICTORY_CONFIRM':
        if (this.session.peer?.role === 'guest') {
          if (msg.winner === 'host') {
            this.winnerLocked = false;
            this.showGameOverModal(false, `${this.opponentName} reached floor 30 first!`);
          }
        }
        break;

      case 'STACK_REMATCH_REQUEST':
      case 'REMATCH_REQUEST':
        this.showRematchOffer();
        break;

      case 'STACK_REMATCH_ACCEPT':
      case 'REMATCH_ACCEPT':
        this.startNewMatch(msg.seed);
        break;
    }
  }

  private updateNetworkHealthHUD(health: NetworkHealth) {
    if (this.pingEl && this.pingTextEl && this.pingDotEl) {
      this.pingTextEl.textContent = `${Math.round(health.rtt)}ms`;
      if (health.status === 'good') {
        this.pingDotEl.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400';
      } else if (health.status === 'moderate') {
        this.pingDotEl.className = 'w-1.5 h-1.5 rounded-full bg-amber-400';
      } else {
        this.pingDotEl.className = 'w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping';
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
  // GAME LOOP
  // =========================================================================
  private startLoop() {
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;

      // 1. Update AI simulation (in solo mode)
      if (this.ai && this.opponentEngine) {
        this.ai.update(dt);
        this.opponentEngine.update(dt);
      }

      // 2. Update local player physics
      this.playerEngine.update(dt);

      // 3. Render
      const oppState = this.session.mode === 'ai' ? this.opponentEngine?.state : this.remoteOpponentState;
      this.renderer.render(this.playerEngine.state, dt, oppState);

      // 4. Update HUD
      this.updateHUD();

      // 5. Online Sync Heartbeat (10Hz / 100ms)
      if (
        this.session.mode === 'online' &&
        this.session.peer?.isConnected &&
        !this.winnerLocked &&
        now - this.lastSyncBroadcastTime > 100
      ) {
        this.lastSyncBroadcastTime = now;
        this.session.peer.sendMessage({
          type: 'STACK_SYNC',
          currentFloor: this.playerEngine.getActiveFloorsCount(),
          wobbleAngle: this.playerEngine.state.wobbleAngle,
          population: this.playerEngine.state.population,
          lives: this.playerEngine.state.lives,
          combo: this.playerEngine.state.combo,
          timestamp: Date.now()
        });
      }

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  // =========================================================================
  // HUD UPDATES
  // =========================================================================
  private updateHUD() {
    const pFloors = this.playerEngine.getActiveFloorsCount();
    const pTarget = SKYLINE_CONSTANTS.TARGET_FLOORS;
    this.playerFloorEl.textContent = `F${pFloors} / ${pTarget}`;

    // Opponent floor count
    let oFloors = 0;
    let oLives = 3;
    if (this.session.mode === 'ai' && this.opponentEngine) {
      oFloors = this.opponentEngine.getActiveFloorsCount();
      oLives = this.opponentEngine.state.lives;
    } else if (this.remoteOpponentState) {
      oFloors = Math.max(0, this.remoteOpponentState.floors.length - 1);
      oLives = this.remoteOpponentState.lives;
    }
    this.opponentFloorEl.textContent = `F${oFloors} / ${pTarget}`;

    // Render Hearts
    this.playerHeartsEl.textContent = '❤️'.repeat(Math.max(0, this.playerEngine.state.lives)) + '🖤'.repeat(Math.max(0, 3 - this.playerEngine.state.lives));
    this.opponentHeartsEl.textContent = '❤️'.repeat(Math.max(0, oLives)) + '🖤'.repeat(Math.max(0, 3 - oLives));

    // Stats
    this.playerPopEl.textContent = `👥 ${this.playerEngine.state.population.toLocaleString()} Pop`;
    const heightMeters = Math.round(this.playerEngine.getTowerHeight() * 0.12);
    this.heightMeterEl.textContent = `${heightMeters}m`;

    // Combo badge
    if (this.playerEngine.state.combo >= 2) {
      this.comboBadgeEl.classList.remove('hidden');
      this.comboBadgeEl.textContent = `🔥 ${this.playerEngine.state.combo}x COMBO!`;
    } else {
      this.comboBadgeEl.classList.add('hidden');
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
  // GAME OVER & REMATCH
  // =========================================================================
  private handleGameOver(winner: 'player' | 'opponent' | 'draw') {
    if (this.winnerLocked) return;
    this.winnerLocked = true;
    this.ai?.stop();
    this.playerEngine.isGameOver = true;

    const didIWin = winner === 'player';
    if (didIWin) {
      this.localVictoryTimestamp = Date.now();
      if (this.session.mode === 'online' && this.session.peer?.isConnected) {
        this.session.peer.sendMessage({
          type: 'STACK_VICTORY',
          winner: 'opponent',
          timestamp: this.localVictoryTimestamp
        });
      }
    }

    const message = didIWin
      ? (this.playerEngine.state.hasFinished ? 'You crowned the 30th floor penthouse first!' : 'Your rival collapsed!')
      : 'Your rival built the grand skyscraper first!';

    this.showGameOverModal(didIWin, message);
  }

  private handleForfeitVictory(reason: string) {
    if (this.winnerLocked || this.playerEngine.isGameOver) return;
    this.winnerLocked = true;
    this.ai?.stop();
    this.playerEngine.isGameOver = true;
    this.showGameOverModal(true, reason);
  }

  private showGameOverModal(didIWin: boolean, message: string) {
    const isModalVisible = !this.gameOverModalEl.classList.contains('hidden');
    if (this.winnerLocked && isModalVisible) return;

    this.gameOverTitleEl.textContent = didIWin ? '🏆 VICTORY!' : '💀 DEFEAT';
    this.gameOverTitleEl.className = `text-3xl font-black tracking-tight ${
      didIWin ? 'text-amber-400' : 'text-rose-500'
    }`;

    const duration = Math.floor((Date.now() - this.startTime) / 1000);
    const floorsBuilt = this.playerEngine.getActiveFloorsCount();
    const perfectCount = this.playerEngine.state.perfectCount;
    const perfectPct = floorsBuilt > 0 ? Math.round((perfectCount / floorsBuilt) * 100) : 0;

    this.gameOverStatsEl.innerHTML = `
      <div class="text-sm font-semibold mb-3 ${didIWin ? 'text-emerald-400' : 'text-slate-300'}">${message}</div>
      <div class="flex justify-between py-1 border-b border-slate-700/50"><span>Floors Built:</span> <b>${floorsBuilt} / ${SKYLINE_CONSTANTS.TARGET_FLOORS}</b></div>
      <div class="flex justify-between py-1 border-b border-slate-700/50"><span>Population:</span> <b>${this.playerEngine.state.population.toLocaleString()}</b></div>
      <div class="flex justify-between py-1 border-b border-slate-700/50"><span>Perfect Accuracy:</span> <b>${perfectPct}% (${perfectCount})</b></div>
      <div class="flex justify-between py-1 border-b border-slate-700/50"><span>Max Combo:</span> <b>${this.playerEngine.state.maxCombo}x</b></div>
      <div class="flex justify-between py-1"><span>Match Duration:</span> <b>${duration}s</b></div>
    `;

    const btn = document.getElementById('stack-btn-rematch');
    if (this.rematchState === 'offer_received') {
      this.showRematchOffer();
    } else if (btn) {
      btn.textContent = 'Play Again';
      btn.classList.remove('opacity-70', 'cursor-not-allowed', 'animate-pulse');
    }

    this.gameOverModalEl.classList.remove('hidden');

    if (didIWin) {
      sounds.playFanfare();
      confetti({ particleCount: 100, spread: 75, origin: { y: 0.6 } });
    } else {
      sounds.playGameOver();
    }
  }

  private handleRematchClick() {
    const btn = document.getElementById('stack-btn-rematch');
    if (!btn) return;

    if (this.session.mode === 'ai') {
      this.startNewMatch();
      return;
    }

    if (this.rematchState === 'offer_received') {
      const seed = Date.now();
      this.session.peer?.sendMessage({ type: 'STACK_REMATCH_ACCEPT', seed });
      this.session.peer?.sendMessage({ type: 'REMATCH_ACCEPT', seed });
      this.startNewMatch(seed);
    } else if (this.rematchState === 'idle') {
      this.rematchState = 'requested';
      btn.textContent = 'Waiting for Opponent...';
      btn.classList.add('opacity-70', 'cursor-not-allowed');
      this.session.peer?.sendMessage({ type: 'STACK_REMATCH_REQUEST' });
      this.session.peer?.sendMessage({ type: 'REMATCH_REQUEST' });
    }
  }

  private showRematchOffer() {
    this.rematchState = 'offer_received';
    const btn = document.getElementById('stack-btn-rematch');
    if (btn) {
      btn.textContent = 'Accept Rematch!';
      btn.classList.remove('opacity-70', 'cursor-not-allowed');
      btn.classList.add('animate-pulse');
    }
  }

  private startNewMatch(seed?: number) {
    this.rematchState = 'idle';
    this.winnerLocked = false;
    this.localVictoryTimestamp = 0;
    this.startTime = Date.now();
    this.gameOverModalEl.classList.add('hidden');

    const newSeed = seed !== undefined ? seed : Date.now();
    this.playerEngine.reset(newSeed);
    this.renderer.reset();

    if (this.session.mode === 'ai' && this.opponentEngine && this.ai) {
      this.opponentEngine.reset(newSeed + 1);
      this.ai.reset();
    } else {
      this.remoteOpponentState = null;
    }

    this.updateHUD();
  }

  // =========================================================================
  // GAME INSTANCE INTERFACE
  // =========================================================================
  public setTheme(theme: AppTheme) {
    this.currentTheme = theme;
    this.renderer?.setTheme(theme);
    const frame = document.getElementById('stack-frame');
    if (frame) {
      frame.className = `relative w-full max-w-[560px] sm:max-w-[620px] h-[100dvh] max-h-[100dvh] flex flex-col justify-between overflow-hidden shadow-2xl select-none ${
        theme === 'dark' ? 'bg-[#0b1120] text-white' : 'bg-white text-slate-900'
      }`;
    }
  }

  public destroy() {
    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      try {
        this.session.peer.sendMessage({ type: 'PLAYER_LEAVE' });
      } catch {}
    }
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    window.removeEventListener('resize', this.boundResize);
    window.removeEventListener('keydown', this.boundKeyDown);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.ai?.stop();
  }
}
