import type { AppTheme, GameInstance, GameSession } from '../types';
import { SHEEP_MODELS } from './sheep-types';
import { SHEEP_CONSTANTS } from './sheep-constants';
import { SheepEngine } from './engine/sheep-engine';
import { SheepFightRenderer } from './renderers/SheepFightRenderer';
import { SheepAI } from './ai/sheep-ai';
import confetti from 'canvas-confetti';

export class SheepFightGame implements GameInstance {
  private container: HTMLElement;
  private session: GameSession;
  private engine: SheepEngine;
  private renderer!: SheepFightRenderer;
  private ai: SheepAI | null = null;

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private animFrameId: number | null = null;
  private lastTime: number = 0;

  // Sound Synth
  private audioCtx: AudioContext | null = null;
  private isMuted: boolean = false;
  private lastClashSoundTime: number = 0;

  // DOM Elements
  private scoreEl!: HTMLElement;
  private suddenDeathEl!: HTMLElement;
  private preview1El!: HTMLElement;
  private preview2El!: HTMLElement;
  private cooldownBarEl!: HTMLElement;
  private laneButtons: HTMLElement[] = [];
  private gameOverModalEl!: HTMLElement;
  private gameOverTitleEl!: HTMLElement;
  private gameOverStatsEl!: HTMLElement;

  // Event Listeners
  private boundKeyDown = this.handleKeyDown.bind(this);
  private boundResize = this.handleResize.bind(this);
  private resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement, session: GameSession) {
    this.container = container;
    this.session = session;

    this.engine = new SheepEngine({
      onClash: () => this.playClashSound(),
      onLaneWin: (_, winner) => this.playLaneWinSound(winner),
      onLaneDraw: () => this.playLaneDrawSound(),
      onSuddenDeath: () => this.playSuddenDeathSound(),
      onMatchEnd: (winner) => this.handleMatchEnd(winner)
    });

    if (session.mode === 'ai') {
      this.ai = new SheepAI(this.engine, session.aiDifficulty || 'medium');
    }

    this.mountUI();
    this.initCanvasAndRenderer();
    this.initControls();
    this.initNetworking();

    this.lastTime = performance.now();
    this.startLoop();
  }

  // =========================================================================
  // UI MOUNTING
  // =========================================================================
  private mountUI() {
    const isDark = this.session.theme === 'dark';
    this.container.className = 'w-full h-[100dvh] max-h-[100dvh] p-0 m-0 overflow-hidden flex justify-center items-center ' +
      (isDark ? 'bg-[#080c14]' : 'bg-slate-100');

    this.container.innerHTML = `
      <div class="relative w-full max-w-[480px] h-[100dvh] max-h-[100dvh] flex flex-col justify-between overflow-hidden shadow-2xl ${
        isDark ? 'bg-[#0f172a] text-white' : 'bg-white text-slate-900'
      }" style="height: 100dvh; max-height: 100dvh;">

        <!-- TOP BAR: Header, Scores & Mode -->
        <div class="px-3 py-2 flex items-center justify-between border-b ${
          isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-white/95'
        } backdrop-blur z-20 select-none shrink-0">
          <button id="sf-btn-exit" class="px-2.5 py-1 text-xs font-bold rounded-lg border transition ${
            isDark ? 'border-slate-700 bg-slate-800 hover:bg-slate-700' : 'border-slate-300 bg-slate-100 hover:bg-slate-200'
          }">
            ← Exit
          </button>

          <!-- Middle Score & Sudden Death Badge -->
          <div class="flex flex-col items-center">
            <div id="sf-score" class="font-black text-sm tracking-wider flex items-center gap-2">
              <span class="text-blue-500">🔵 0</span>
              <span class="text-slate-400 font-normal">:</span>
              <span class="text-red-500">0 🔴</span>
            </div>
            <div id="sf-sudden-death" class="hidden text-[10px] font-black text-amber-400 animate-pulse tracking-wide uppercase">
              ⚡ Sudden Death Active ⚡
            </div>
          </div>

          <!-- Mode & Sound Toggle -->
          <div class="flex items-center gap-1.5">
            <span id="sf-mode-badge" class="px-2 py-0.5 text-[10px] font-black uppercase rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
              ${this.session.mode === 'online' ? '1v1 Online' : `Bot: ${(this.session.aiDifficulty || 'med').toUpperCase()}`}
            </span>
            <button id="sf-btn-sound" class="p-1 text-xs rounded-lg transition hover:opacity-80">
              🔊
            </button>
          </div>
        </div>

        <!-- MAIN FIELD CANVAS WRAPPER -->
        <div class="relative flex-1 min-h-0 w-full overflow-hidden flex items-center justify-center bg-[#064e3b]">
          <canvas id="sf-canvas" class="cursor-pointer block touch-none"></canvas>
        </div>

        <!-- BOTTOM DOCK: RANDOM SHEEP QUEUE & QUICK-TAP LANE BUTTONS -->
        <div class="p-2.5 flex flex-col gap-2 border-t ${
          isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50'
        } z-20 select-none shrink-0">

          <!-- Row 1: Ready Sheep Card + Upcoming Queue -->
          <div class="flex items-center justify-between gap-2">
            <!-- Active Ready Card -->
            <div id="sf-active-card" class="relative flex-1 p-2 rounded-xl border-2 border-blue-500 bg-blue-500/10 flex items-center gap-2.5 cursor-pointer shadow-sm overflow-hidden">
              <div id="sf-card-avatar" class="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-xl shrink-0">
                🐑
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Ready to Drop</span>
                  <span id="sf-card-weight" class="text-[10px] font-black text-amber-400">Push: 2x</span>
                </div>
                <div id="sf-card-name" class="font-black text-xs truncate">Standard Sheep</div>
              </div>

              <!-- Cooldown overlay bar -->
              <div id="sf-cooldown-bar" class="absolute bottom-0 left-0 h-1 bg-amber-400 w-0 transition-all"></div>
            </div>

            <!-- Upcoming Queue (Next 1, Next 2) -->
            <div class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border ${
              isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-white'
            }">
              <span class="text-[9px] font-black uppercase text-slate-400">Next:</span>
              <div id="sf-preview-1" class="w-9 h-9 rounded-lg bg-slate-800 flex flex-col items-center justify-center border border-slate-700 leading-tight" title="Next Sheep">
                <span class="text-xs">🐑</span>
                <span class="text-[8px] font-mono text-amber-400 font-bold">2x</span>
              </div>
              <div id="sf-preview-2" class="w-9 h-9 rounded-lg bg-slate-800 flex flex-col items-center justify-center border border-slate-700 opacity-60 leading-tight" title="After Next">
                <span class="text-xs">🥊</span>
                <span class="text-[8px] font-mono text-amber-400 font-bold">3x</span>
              </div>
            </div>
          </div>

          <!-- Row 2: 5 Quick-Tap Lane Deployment Buttons -->
          <div class="grid grid-cols-5 gap-1.5">
            ${[0, 1, 2, 3, 4].map(i => `
              <button data-lane="${i}" class="sf-lane-btn p-1.5 rounded-lg border font-black text-xs flex flex-col items-center gap-0.5 transition active:scale-95 cursor-pointer ${
                isDark ? 'border-slate-700 bg-slate-800 hover:border-blue-500' : 'border-slate-300 bg-white hover:border-blue-500'
              }">
                <span class="text-[9px] font-bold text-slate-400">LANE ${i + 1}</span>
                <span class="sf-lane-status text-[11px] text-blue-400">▲ DROP</span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- GAME OVER MODAL -->
        <div id="sf-game-over-modal" class="hidden absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div class="w-full max-w-sm rounded-3xl p-6 flex flex-col items-center text-center gap-4 shadow-2xl border ${
            isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
          }">
            <div id="sf-game-over-title" class="text-2xl font-black tracking-tight">🏆 VICTORY!</div>
            <div id="sf-game-over-stats" class="text-xs text-slate-400 leading-relaxed">
              You pushed through 3 lanes to claim victory!
            </div>
            <div class="flex gap-2 w-full mt-2">
              <button id="sf-btn-rematch" class="flex-1 py-2.5 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-500 text-white transition shadow-lg cursor-pointer">
                Play Again
              </button>
              <button id="sf-btn-modal-exit" class="flex-1 py-2.5 rounded-xl text-xs font-black border transition ${
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
    this.scoreEl = this.container.querySelector('#sf-score')!;
    this.suddenDeathEl = this.container.querySelector('#sf-sudden-death')!;
    this.preview1El = this.container.querySelector('#sf-preview-1')!;
    this.preview2El = this.container.querySelector('#sf-preview-2')!;
    this.cooldownBarEl = this.container.querySelector('#sf-cooldown-bar')!;
    this.gameOverModalEl = this.container.querySelector('#sf-game-over-modal')!;
    this.gameOverTitleEl = this.container.querySelector('#sf-game-over-title')!;
    this.gameOverStatsEl = this.container.querySelector('#sf-game-over-stats')!;
    this.laneButtons = Array.from(this.container.querySelectorAll('.sf-lane-btn'));

    // Top Exit Button
    this.container.querySelector('#sf-btn-exit')?.addEventListener('click', () => this.session.onExit());
    this.container.querySelector('#sf-btn-modal-exit')?.addEventListener('click', () => this.session.onExit());

    // Rematch Button
    this.container.querySelector('#sf-btn-rematch')?.addEventListener('click', () => {
      this.engine.reset();
      this.gameOverModalEl.classList.add('hidden');
      if (this.session.mode === 'online' && this.session.peer) {
        this.session.peer.sendMessage({ type: 'SHEEP_REMATCH' });
      }
    });

    // Sound toggle
    const soundBtn = this.container.querySelector('#sf-btn-sound')!;
    soundBtn.addEventListener('click', () => {
      this.isMuted = !this.isMuted;
      soundBtn.textContent = this.isMuted ? '🔇' : '🔊';
    });
  }

  private initCanvasAndRenderer() {
    this.canvas = this.container.querySelector('#sf-canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.renderer = new SheepFightRenderer(this.ctx);
    this.handleResize();
    window.addEventListener('resize', this.boundResize);

    if (this.canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.canvas.parentElement);
    }
  }

  private handleResize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const parentW = parent.clientWidth;
    const parentH = parent.clientHeight;
    const targetRatio = SHEEP_CONSTANTS.VIEWPORT_WIDTH / SHEEP_CONSTANTS.VIEWPORT_HEIGHT;

    let drawW = parentW;
    let drawH = parentW / targetRatio;

    if (drawH > parentH) {
      drawH = parentH;
      drawW = parentH * targetRatio;
    }

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = SHEEP_CONSTANTS.VIEWPORT_WIDTH * dpr;
    this.canvas.height = SHEEP_CONSTANTS.VIEWPORT_HEIGHT * dpr;

    this.canvas.style.width = `${drawW}px`;
    this.canvas.style.height = `${drawH}px`;

    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
  }

  private initControls() {
    // 1. Direct Canvas Tapping / Clicking
    const handleCanvasInput = (clientX: number) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = SHEEP_CONSTANTS.VIEWPORT_WIDTH / rect.width;
      const x = (clientX - rect.left) * scaleX;

      const laneW = (SHEEP_CONSTANTS.VIEWPORT_WIDTH - 2 * SHEEP_CONSTANTS.LANE_MARGIN_X) / SHEEP_CONSTANTS.NUM_LANES;
      const laneIndex = Math.floor((x - SHEEP_CONSTANTS.LANE_MARGIN_X) / laneW);

      if (laneIndex >= 0 && laneIndex < SHEEP_CONSTANTS.NUM_LANES) {
        this.tryDeploy(laneIndex);
      }
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      handleCanvasInput(e.clientX);
    });

    // 2. Direct Lane Buttons
    this.laneButtons.forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        this.tryDeploy(idx);
      });
    });

    // 3. Keyboard Hotkeys
    window.addEventListener('keydown', this.boundKeyDown);
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.repeat) return;
    const key = e.key.toLowerCase();
    const laneMap: Record<string, number> = {
      '1': 0, '2': 1, '3': 2, '4': 3, '5': 4,
      'q': 0, 'w': 1, 'e': 2, 'r': 3, 't': 4,
      'a': 0, 's': 1, 'd': 2, 'f': 3, 'g': 4
    };

    if (key in laneMap) {
      this.tryDeploy(laneMap[key]);
    }
  }

  private initNetworking() {
    if (this.session.mode !== 'online' || !this.session.peer) return;

    this.session.peer.events = {
      ...this.session.peer.events,
      onMessage: (msg: any) => {
        if (msg.type === 'SHEEP_DEPLOY') {
          this.engine.deploySheep(msg.laneIndex, 'opponent', msg.size, msg.id);
          this.playSpawnSound();
        } else if (msg.type === 'SHEEP_REMATCH') {
          this.engine.reset();
          this.gameOverModalEl.classList.add('hidden');
        }
      }
    };
  }

  private tryDeploy(laneIndex: number) {
    if (!this.engine.canDeploy(laneIndex, 'player')) return;

    const size = this.engine.state.playerQueue[0];
    const id = `player-${laneIndex}-${Date.now()}`;
    const success = this.engine.deploySheep(laneIndex, 'player', size, id);

    if (success) {
      this.playSpawnSound();

      // Sync online if in p2p mode
      if (this.session.mode === 'online' && this.session.peer) {
        this.session.peer.sendMessage({
          type: 'SHEEP_DEPLOY',
          laneIndex,
          size,
          id,
          timestamp: Date.now()
        });
      }
    }
  }

  // =========================================================================
  // GAME LOOP
  // =========================================================================
  private startLoop() {
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - this.lastTime) / 1000);
      this.lastTime = now;

      // Update AI
      if (this.ai) {
        this.ai.update(dt);
      }

      // Update Engine
      this.engine.update(dt);

      // Render Field & Sheep
      this.renderer.render(this.engine.state, dt);

      // Update DOM HUD
      this.updateHUD();

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  private updateHUD() {
    const state = this.engine.state;

    // Score
    this.scoreEl.innerHTML = `
      <span class="text-blue-500">🔵 ${state.playerScore}</span>
      <span class="text-slate-400 font-normal">:</span>
      <span class="text-red-500">${state.opponentScore} 🔴</span>
    `;

    // Sudden Death alert
    if (state.isSuddenDeath && state.winner === null) {
      this.suddenDeathEl.classList.remove('hidden');
    } else {
      this.suddenDeathEl.classList.add('hidden');
    }

    // Active Ready Sheep Card
    const curSize = state.playerQueue[0];
    const def = SHEEP_MODELS[curSize];
    const avatarEmoji = curSize === 'small' ? '👶' : curSize === 'medium' ? '🐑' : curSize === 'big' ? '🥊' : '👑';

    this.container.querySelector('#sf-card-avatar')!.textContent = avatarEmoji;
    this.container.querySelector('#sf-card-name')!.textContent = def.name;
    this.container.querySelector('#sf-card-weight')!.textContent = `Push: ${def.weight}x`;

    // Upcoming Previews
    const p1 = state.playerQueue[1];
    const p2 = state.playerQueue[2];
    const p1Emoji = p1 === 'small' ? '👶' : p1 === 'medium' ? '🐑' : p1 === 'big' ? '🥊' : '👑';
    const p2Emoji = p2 === 'small' ? '👶' : p2 === 'medium' ? '🐑' : p2 === 'big' ? '🥊' : '👑';
    this.preview1El.innerHTML = `<span class="text-xs">${p1Emoji}</span><span class="text-[8px] font-mono text-amber-400 font-bold">${SHEEP_MODELS[p1].weight}x</span>`;
    this.preview2El.innerHTML = `<span class="text-xs">${p2Emoji}</span><span class="text-[8px] font-mono text-amber-400 font-bold">${SHEEP_MODELS[p2].weight}x</span>`;

    // Cooldown Progress Bar
    const cdRatio = state.playerCooldown / SHEEP_CONSTANTS.SPAWN_COOLDOWN;
    if (cdRatio > 0) {
      this.cooldownBarEl.style.width = `${cdRatio * 100}%`;
    } else {
      this.cooldownBarEl.style.width = '0%';
    }

    // Lane Buttons status
    this.laneButtons.forEach((btn, idx) => {
      const lane = state.lanes[idx];
      const statusEl = btn.querySelector('.sf-lane-status') as HTMLElement;
      if (!statusEl) return;

      if (lane.status === 'draw') {
        btn.classList.add('opacity-40', 'cursor-not-allowed');
        btn.classList.remove('hover:border-blue-500');
        statusEl.textContent = '🔒 DRAW';
        statusEl.className = 'sf-lane-status text-[10px] text-amber-400 font-bold';
      } else if (lane.status === 'won_player') {
        btn.classList.add('opacity-40', 'cursor-not-allowed');
        statusEl.textContent = '👑 WON';
        statusEl.className = 'sf-lane-status text-[10px] text-blue-400 font-bold';
      } else if (lane.status === 'won_opponent') {
        btn.classList.add('opacity-40', 'cursor-not-allowed');
        statusEl.textContent = '💀 LOST';
        statusEl.className = 'sf-lane-status text-[10px] text-red-400 font-bold';
      } else if (lane.isPlayerStartBlocked) {
        statusEl.textContent = '🔒 BLOCKED';
        statusEl.className = 'sf-lane-status text-[9px] text-red-400 font-bold';
      } else {
        btn.classList.remove('opacity-40', 'cursor-not-allowed');
        btn.classList.add('hover:border-blue-500');
        statusEl.textContent = '▲ DROP';
        statusEl.className = 'sf-lane-status text-[11px] text-blue-400 font-black';
      }
    });
  }

  private handleMatchEnd(winner: 'player' | 'opponent' | 'draw') {
    this.gameOverModalEl.classList.remove('hidden');

    if (winner === 'player') {
      this.playVictorySound();
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
      this.gameOverTitleEl.textContent = '🏆 VICTORY!';
      this.gameOverTitleEl.className = 'text-3xl font-black text-blue-400 tracking-tight';
      this.gameOverStatsEl.textContent = `You dominated the pasture, claiming ${this.engine.state.playerScore} lanes to win the match!`;
    } else if (winner === 'opponent') {
      this.playDefeatSound();
      this.gameOverTitleEl.textContent = '💀 DEFEAT';
      this.gameOverTitleEl.className = 'text-3xl font-black text-red-400 tracking-tight';
      this.gameOverStatsEl.textContent = `Opponent pushed through your defenses, winning ${this.engine.state.opponentScore} lanes.`;
    } else {
      this.gameOverTitleEl.textContent = '🤝 HONORABLE DRAW';
      this.gameOverTitleEl.className = 'text-3xl font-black text-amber-400 tracking-tight';
      this.gameOverStatsEl.textContent = 'All lanes locked in a fierce stalemate. Neither flock surrendered an inch!';
    }
  }

  // =========================================================================
  // WEB AUDIO SYNTHESIZER
  // =========================================================================
  private getAudioContext(): AudioContext | null {
    if (this.isMuted) return null;
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  private playSpawnSound() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(580, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  }

  private playClashSound() {
    const now = performance.now();
    if (now - this.lastClashSoundTime < 200) return; // Throttle sound
    this.lastClashSoundTime = now;

    const ctx = this.getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.09);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  }

  private playLaneWinSound(winner: 'player' | 'opponent') {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const freqs = winner === 'player' ? [440, 554, 659, 880] : [330, 290, 240, 180];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.06);

      gain.gain.setValueAtTime(0.12, ctx.currentTime + idx * 0.06);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + idx * 0.06 + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.06);
      osc.stop(ctx.currentTime + idx * 0.06 + 0.1);
    });
  }

  private playLaneDrawSound() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.2);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  }

  private playSuddenDeathSound() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.35);

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  }

  private playVictorySound() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime + idx * 0.1);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + idx * 0.1 + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.1);
      osc.stop(ctx.currentTime + idx * 0.1 + 0.25);
    });
  }

  private playDefeatSound() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    [330, 311, 293, 277].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);
      gain.gain.setValueAtTime(0.12, ctx.currentTime + idx * 0.12);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + idx * 0.12 + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.12);
      osc.stop(ctx.currentTime + idx * 0.12 + 0.2);
    });
  }

  // =========================================================================
  // CLEANUP & LIFECYCLE
  // =========================================================================
  public setTheme(theme: AppTheme) {
    this.session.theme = theme;
  }

  public destroy() {
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
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}
