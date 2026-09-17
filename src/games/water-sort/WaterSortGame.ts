import confetti from 'canvas-confetti';
import type { GameInstance, GameSession, AppTheme } from '../types';
import { WaterEngine } from './water-engine';
import { generateWaterBoard } from './water-generator';
import { WaterAI } from './water-ai';
import {
  WATER_COLORS,
  TOTAL_COLORS,
  TUBE_CAPACITY,
  type ColorDef
} from './water-types';
import { sounds } from '../../engine/sound';

export class WaterSortGame implements GameInstance {
  private container: HTMLElement;
  private session: GameSession;
  private engine: WaterEngine;
  private ai: WaterAI | null = null;
  private selectedTubeIndex: number | null = null;
  private isAnimating: boolean = false;
  private currentTheme: AppTheme;

  // Multiplayer & Opponent state
  private opponentScore: number = 0;
  private opponentWon: boolean = false;
  private matchSeed: number;

  // DOM elements
  private tubesContainer: HTMLElement | null = null;
  private reservoirEl: HTMLElement | null = null;
  private colorRibbonEl: HTMLElement | null = null;
  private duelHudEl: HTMLElement | null = null;
  private undoBtn: HTMLButtonElement | null = null;
  private hintBtn: HTMLButtonElement | null = null;
  private resetBtn: HTMLButtonElement | null = null;

  // Audio helper for water pouring
  private audioCtx: AudioContext | null = null;

  constructor(container: HTMLElement, session: GameSession) {
    this.container = container;
    this.session = session;
    this.currentTheme = session.theme;

    // Seed generation
    this.matchSeed = session.mode === 'online'
      ? (session.peer?.role === 'host' ? Math.floor(Math.random() * 1000000) : 0)
      : Math.floor(Math.random() * 1000000);

    const generated = generateWaterBoard(this.matchSeed);
    this.engine = new WaterEngine(generated.tubes);

    this.mount();
    this.setupNetwork();
    this.setupAI();
  }

  private getAudioContext(): AudioContext | null {
    if (!sounds.enabled) return null;
    if (!this.audioCtx) {
      const AudioClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioClass) this.audioCtx = new AudioClass();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  private playPourSound() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Synthesize realistic water glug sound
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320 + Math.random() * 80, now);
    osc.frequency.exponentialRampToValueAtTime(540 + Math.random() * 60, now + 0.12);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  private playSplashSound() {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.15);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  private playCelebrationSound() {
    sounds.playWin();
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([40, 60, 80]);
    }
  }

  private setupNetwork() {
    if (this.session.mode !== 'online' || !this.session.peer) return;

    this.session.peer.events = {
      ...this.session.peer.events,
      onMessage: (msg) => {
        if (msg.type === 'WATER_INIT') {
          this.matchSeed = msg.seed;
          const generated = generateWaterBoard(this.matchSeed);
          this.engine = new WaterEngine(generated.tubes);
          this.selectedTubeIndex = null;
          this.render();
        } else if (msg.type === 'WATER_PROGRESS') {
          this.opponentScore = msg.score;
          if (msg.isWon) {
            this.opponentWon = true;
            this.handleMatchEnd('opponent');
          }
          this.updateHUD();
        } else if (msg.type === 'WATER_REMATCH') {
          this.matchSeed = msg.seed;
          const generated = generateWaterBoard(this.matchSeed);
          this.engine = new WaterEngine(generated.tubes);
          this.selectedTubeIndex = null;
          this.opponentScore = 0;
          this.opponentWon = false;
          this.render();
        }
      }
    };

    // Host shares seed
    if (this.session.peer.role === 'host') {
      this.session.peer.sendMessage({
        type: 'WATER_INIT',
        seed: this.matchSeed
      });
    }
  }

  private setupAI() {
    if (this.session.mode !== 'ai') return;
    const diff = this.session.aiDifficulty || 'medium';
    const generated = generateWaterBoard(this.matchSeed);

    this.ai = new WaterAI(generated.tubes, diff, {
      onProgress: (score, _completed, isWon) => {
        this.opponentScore = score;
        this.updateHUD();
        if (isWon && !this.engine.state.isWon) {
          this.opponentWon = true;
          this.handleMatchEnd('opponent');
        }
      }
    });

    this.ai.start();
  }

  private getColorDef(colorId: string | null): ColorDef | undefined {
    if (!colorId) return undefined;
    return WATER_COLORS.find(c => c.id === colorId);
  }

  private mount() {
    this.container.innerHTML = `
      <div id="water-game-root" class="w-full max-w-lg min-h-[92vh] flex flex-col justify-between items-center py-2 px-3 sm:px-4 select-none relative overflow-hidden font-sans">
        
        <!-- Top Bar: Exit, Sound, Status -->
        <header class="w-full flex items-center justify-between py-1 px-1 mb-1">
          <button id="water-btn-exit" class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 shadow-sm ps-btn-secondary">
            <span>← Exit</span>
          </button>

          <!-- 1v1 Split Duel Score HUD -->
          <div id="water-duel-hud" class="flex items-center space-x-3 text-xs font-bold font-mono">
            <!-- Rendered dynamically -->
          </div>

          <button id="water-btn-sound" class="p-2 rounded-xl text-xs font-bold transition-all ps-btn-secondary">
            <span>${sounds.enabled ? '🔊' : '🔇'}</span>
          </button>
        </header>

        <!-- 10-Color Capsule Ribbon -->
        <div class="w-full py-1.5 mb-2 overflow-x-auto no-scrollbar">
          <div id="water-color-ribbon" class="flex items-center justify-center space-x-1.5 sm:space-x-2">
            <!-- Rendered dynamically -->
          </div>
        </div>

        <!-- Central Big Reservoir Flask (Single Color Extractor) -->
        <div class="w-full flex flex-col items-center justify-center my-1 sm:my-2">
          <div class="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center space-x-1.5">
            <span>🧪 COLOR RESERVOIR (3 UNITS TO CLEAR)</span>
          </div>
          <div id="water-reservoir-container" class="cursor-pointer transition-transform duration-200 hover:scale-105 active:scale-95">
            <!-- Rendered dynamically -->
          </div>
        </div>

        <!-- 10 Test Tubes Grid (2 Rows of 5 Tubes) -->
        <div class="w-full flex-1 flex flex-col justify-center items-center my-2">
          <div id="water-tubes-container" class="w-full flex flex-col space-y-3 sm:space-y-4">
            <!-- Rendered dynamically: Row 1 (5 tubes) & Row 2 (5 tubes) -->
          </div>
        </div>

        <!-- Bottom Action Bar: Undo, Hint, Reset -->
        <footer class="w-full max-w-sm flex items-center justify-between space-x-3 py-2 px-1">
          <button id="water-btn-undo" class="flex-1 py-2.5 rounded-xl text-xs font-bold ps-btn-secondary flex items-center justify-center space-x-1 shadow-sm transition-all disabled:opacity-40">
            <span>↩️ Undo</span>
          </button>
          <button id="water-btn-hint" class="flex-1 py-2.5 rounded-xl text-xs font-bold ps-btn-secondary flex items-center justify-center space-x-1 shadow-sm transition-all text-amber-500 hover:text-amber-400">
            <span>💡 Hint</span>
          </button>
          <button id="water-btn-reset" class="flex-1 py-2.5 rounded-xl text-xs font-bold ps-btn-secondary flex items-center justify-center space-x-1 shadow-sm transition-all text-rose-500 hover:text-rose-400">
            <span>🔄 Reset</span>
          </button>
        </footer>

        <!-- Victory / Match End Modal (Hidden by default) -->
        <div id="water-modal-victory" class="hidden absolute inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div class="ps-card w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl border border-white/10 animate-fadeIn">
            <div id="water-victory-icon" class="text-5xl mb-3">🏆</div>
            <h3 id="water-victory-title" class="text-2xl font-black mb-1">VICTORY!</h3>
            <p id="water-victory-subtitle" class="text-xs text-gray-400 mb-5">You sorted all 10 colors first!</p>
            <div class="flex flex-col space-y-2.5">
              <button id="water-btn-play-again" class="ps-btn-primary w-full py-3 rounded-xl text-xs font-bold">
                Play Next Match
              </button>
              <button id="water-btn-return-hub" class="ps-btn-secondary w-full py-2.5 rounded-xl text-xs font-semibold text-gray-400">
                Return to Hub
              </button>
            </div>
          </div>
        </div>

      </div>
    `;

    this.tubesContainer = document.getElementById('water-tubes-container');
    this.reservoirEl = document.getElementById('water-reservoir-container');
    this.colorRibbonEl = document.getElementById('water-color-ribbon');
    this.duelHudEl = document.getElementById('water-duel-hud');
    this.undoBtn = document.getElementById('water-btn-undo') as HTMLButtonElement;
    this.hintBtn = document.getElementById('water-btn-hint') as HTMLButtonElement;
    this.resetBtn = document.getElementById('water-btn-reset') as HTMLButtonElement;

    this.setupEventListeners();
    this.render();
  }

  private setupEventListeners() {
    // Exit
    document.getElementById('water-btn-exit')?.addEventListener('click', () => {
      this.session.onExit();
    });

    // Sound toggle
    document.getElementById('water-btn-sound')?.addEventListener('click', () => {
      const enabled = sounds.toggleMute();
      const el = document.getElementById('water-btn-sound');
      if (el) el.innerHTML = `<span>${enabled ? '🔊' : '🔇'}</span>`;
    });

    // Undo
    this.undoBtn?.addEventListener('click', () => {
      if (this.isAnimating || !this.engine.canUndo()) return;
      this.engine.undo();
      this.selectedTubeIndex = null;
      this.playSplashSound();
      this.render();
    });

    // Reset
    this.resetBtn?.addEventListener('click', () => {
      if (this.isAnimating) return;
      if (confirm('Reset this puzzle to start over?')) {
        this.engine.reset();
        this.selectedTubeIndex = null;
        this.render();
      }
    });

    // Hint
    this.hintBtn?.addEventListener('click', () => {
      if (this.isAnimating) return;
      const hint = this.engine.getHint();
      if (!hint) {
        alert('No obvious hint found! Try unburying matching colors.');
        return;
      }
      this.highlightHint(hint);
    });

    // Reservoir Click
    this.reservoirEl?.addEventListener('click', () => {
      if (this.isAnimating || this.selectedTubeIndex === null) return;
      this.handlePourToReservoir(this.selectedTubeIndex);
    });

    // Victory modal buttons
    document.getElementById('water-btn-play-again')?.addEventListener('click', () => {
      document.getElementById('water-modal-victory')?.classList.add('hidden');
      this.matchSeed = Math.floor(Math.random() * 1000000);
      if (this.session.mode === 'online' && this.session.peer) {
        this.session.peer.sendMessage({ type: 'WATER_REMATCH', seed: this.matchSeed });
      }
      const gen = generateWaterBoard(this.matchSeed);
      this.engine = new WaterEngine(gen.tubes);
      this.selectedTubeIndex = null;
      this.opponentScore = 0;
      this.opponentWon = false;
      this.render();
    });

    document.getElementById('water-btn-return-hub')?.addEventListener('click', () => {
      this.session.onExit();
    });
  }

  private handleTubeClick(index: number) {
    if (this.isAnimating || this.engine.state.isWon || this.opponentWon) return;

    if (this.selectedTubeIndex === null) {
      // Pick source tube
      const tube = this.engine.state.tubes[index];
      if (tube.length === 0) return; // Cannot select empty tube as source
      this.selectedTubeIndex = index;
      this.playSplashSound();
      this.render();
    } else if (this.selectedTubeIndex === index) {
      // Tap again to deselect
      this.selectedTubeIndex = null;
      this.render();
    } else {
      // Tap destination tube: execute pour
      this.handlePourBetweenTubes(this.selectedTubeIndex, index);
    }
  }

  private handlePourBetweenTubes(srcIndex: number, dstIndex: number) {
    const check = this.engine.canPour(srcIndex, dstIndex);
    if (!check.valid) {
      // If destination has liquid, switch selection to it
      if (this.engine.state.tubes[dstIndex].length > 0) {
        this.selectedTubeIndex = dstIndex;
        this.playSplashSound();
        this.render();
      } else {
        // Shake source tube briefly
        this.shakeTube(srcIndex);
      }
      return;
    }

    this.isAnimating = true;
    this.playPourSound();

    // Execute pour in engine
    this.engine.pour(srcIndex, dstIndex);
    this.selectedTubeIndex = null;

    setTimeout(() => {
      this.isAnimating = false;
      this.render();
    }, 280);
  }

  private handlePourToReservoir(srcIndex: number) {
    const check = this.engine.canPourToReservoir(srcIndex);
    if (!check.valid) {
      this.shakeReservoir();
      return;
    }

    this.isAnimating = true;
    this.playPourSound();

    const result = this.engine.pourToReservoir(srcIndex);
    this.selectedTubeIndex = null;

    if (result?.isCompleted) {
      // Celebration when 3/3 of a color is sorted!
      setTimeout(() => {
        this.triggerColorCompleted(result.color);
      }, 200);
    }

    setTimeout(() => {
      this.isAnimating = false;
      this.render();
      this.syncProgress();

      if (this.engine.state.isWon) {
        this.handleMatchEnd('player');
      }
    }, 300);
  }

  private triggerColorCompleted(colorId: string) {
    this.playCelebrationSound();
    const colorDef = this.getColorDef(colorId);

    // Blast small celebratory confetti matching the completed color
    try {
      confetti({
        particleCount: 45,
        spread: 60,
        origin: { y: 0.35 },
        colors: colorDef ? [colorDef.hex, '#ffffff', '#fbbf24'] : ['#fbbf24', '#ffffff']
      });
    } catch {}
  }

  private syncProgress() {
    if (this.session.mode === 'online' && this.session.peer) {
      this.session.peer.sendMessage({
        type: 'WATER_PROGRESS',
        score: this.engine.state.score,
        completedColors: this.engine.state.completedColors,
        isWon: this.engine.state.isWon
      });
    }
  }

  private handleMatchEnd(winner: 'player' | 'opponent') {
    const modal = document.getElementById('water-modal-victory');
    const title = document.getElementById('water-victory-title');
    const sub = document.getElementById('water-victory-subtitle');
    const icon = document.getElementById('water-victory-icon');

    if (!modal || !title || !sub || !icon) return;

    if (winner === 'player') {
      icon.textContent = '🏆';
      title.textContent = 'YOU WIN!';
      sub.textContent = `Magnificent! You sorted all 10 colors in ${this.engine.state.moveCount} moves!`;
      try {
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 } });
      } catch {}
    } else {
      icon.textContent = '🥈';
      title.textContent = 'OPPONENT WON!';
      sub.textContent = 'Your opponent completed all 10 colors first. Better luck next round!';
    }

    modal.classList.remove('hidden');
  }

  private shakeTube(index: number) {
    const el = document.getElementById(`water-tube-${index}`);
    if (el) {
      el.classList.add('animate-shake');
      setTimeout(() => el.classList.remove('animate-shake'), 350);
    }
  }

  private shakeReservoir() {
    if (this.reservoirEl) {
      this.reservoirEl.classList.add('animate-shake');
      setTimeout(() => this.reservoirEl?.classList.remove('animate-shake'), 350);
    }
  }

  private highlightHint(hint: { type: 'reservoir' | 'tube'; srcIndex: number; dstIndex?: number }) {
    const srcEl = document.getElementById(`water-tube-${hint.srcIndex}`);
    if (srcEl) {
      srcEl.classList.add('ring-4', 'ring-amber-400', 'animate-pulse');
      setTimeout(() => srcEl.classList.remove('ring-4', 'ring-amber-400', 'animate-pulse'), 1400);
    }

    if (hint.type === 'reservoir') {
      const resCard = document.getElementById('water-reservoir-card');
      if (resCard) {
        resCard.classList.add('ring-4', 'ring-amber-400', 'animate-pulse');
        setTimeout(() => resCard.classList.remove('ring-4', 'ring-amber-400', 'animate-pulse'), 1400);
      }
    } else if (hint.type === 'tube' && hint.dstIndex !== undefined) {
      const dstEl = document.getElementById(`water-tube-${hint.dstIndex}`);
      if (dstEl) {
        dstEl.classList.add('ring-4', 'ring-emerald-400', 'animate-pulse');
        setTimeout(() => dstEl.classList.remove('ring-4', 'ring-emerald-400', 'animate-pulse'), 1400);
      }
    }
  }

  private updateHUD() {
    if (!this.duelHudEl) return;
    const isDark = this.currentTheme === 'dark';
    const oppLabel = this.session.mode === 'ai' ? 'Bot' : 'Opponent';

    this.duelHudEl.innerHTML = `
      <div class="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg ${isDark ? 'bg-blue-950/40 text-blue-400' : 'bg-blue-50 text-blue-600'} border border-blue-500/30">
        <span>YOU:</span>
        <span class="text-sm font-black">${this.engine.state.score}/${TOTAL_COLORS}</span>
      </div>
      <span class="text-gray-400 text-xs">VS</span>
      <div class="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg ${isDark ? 'bg-emerald-950/40 text-emerald-400' : 'bg-emerald-50 text-emerald-600'} border border-emerald-500/30">
        <span>${oppLabel}:</span>
        <span class="text-sm font-black">${this.opponentScore}/${TOTAL_COLORS}</span>
      </div>
    `;
  }

  public render() {
    const isDark = this.currentTheme === 'dark';

    // 1. Update HUD
    this.updateHUD();

    // 2. Update 10-Color Capsule Ribbon
    if (this.colorRibbonEl) {
      this.colorRibbonEl.innerHTML = WATER_COLORS.map(color => {
        const isDone = this.engine.state.completedColors.includes(color.id);
        return `
          <div class="flex flex-col items-center group transition-all" title="${color.name}">
            <div class="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center shadow-md transition-all ${isDone ? 'ring-2 ring-amber-400 scale-110' : 'opacity-80'}"
                 style="background: linear-gradient(135deg, ${color.gradient[0]}, ${color.gradient[1]});">
              ${isDone ? '<span class="text-[11px] leading-none drop-shadow">⭐</span>' : ''}
            </div>
            <span class="text-[9px] font-bold mt-0.5 ${isDone ? 'text-amber-400 font-extrabold' : 'text-gray-400'}">${color.name.split(' ')[0]}</span>
          </div>
        `;
      }).join('');
    }

    // 3. Update Central Big Reservoir Flask
    if (this.reservoirEl) {
      const res = this.engine.state.reservoir;
      const colorDef = this.getColorDef(res.color);
      const percent = (res.count / res.maxCapacity) * 100;

      this.reservoirEl.innerHTML = `
        <div id="water-reservoir-card" class="relative w-44 sm:w-52 h-24 sm:h-28 rounded-3xl p-2.5 ps-card flex flex-col items-center justify-between border-2 transition-all shadow-xl ${res.color ? 'border-blue-400 shadow-blue-500/20' : (isDark ? 'border-gray-800' : 'border-gray-200')}">
          
          <!-- Liquid fill inside reservoir flask -->
          <div class="absolute inset-x-2 bottom-2 rounded-2xl overflow-hidden pointer-events-none transition-all duration-300 ${isDark ? 'bg-black/30' : 'bg-gray-100/80'}" style="height: 72%;">
            ${res.color && res.count > 0 ? `
              <div class="absolute inset-x-0 bottom-0 transition-all duration-300" style="height: ${percent}%; background: linear-gradient(180deg, ${colorDef?.gradient[0] || '#3b82f6'}, ${colorDef?.gradient[1] || '#1d4ed8'});">
                <!-- Gloss highlight wave -->
                <div class="w-full h-2 bg-white/30 rounded-t-full"></div>
                <!-- Rising bubble animation -->
                <div class="absolute top-1 left-3 w-1.5 h-1.5 rounded-full bg-white/40 animate-ping"></div>
                <div class="absolute top-2 right-4 w-2 h-2 rounded-full bg-white/30 animate-pulse"></div>
              </div>
            ` : ''}

            <!-- Graduation tick marks -->
            <div class="absolute inset-y-0 right-1.5 flex flex-col justify-between py-1 text-[8px] font-mono text-gray-400/60 pointer-events-none select-none">
              <span>3</span>
              <span>2</span>
              <span>1</span>
            </div>
          </div>

          <!-- Top flask neck representation -->
          <div class="w-12 h-3 rounded-full border border-gray-400/40 ${isDark ? 'bg-gray-800' : 'bg-gray-200'} z-10"></div>

          <!-- Bottom Label -->
          <div class="z-10 w-full text-center mt-auto">
            ${res.color ? `
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase text-white shadow-sm" style="background: ${colorDef?.hex};">
                ${colorDef?.name}: ${res.count}/${res.maxCapacity}
              </span>
            ` : `
              <span class="text-[10px] font-bold text-gray-400">
                ${this.selectedTubeIndex !== null ? 'Tap to deposit color' : 'Empty (Tap tube to start)'}
              </span>
            `}
          </div>

        </div>
      `;
    }

    // 4. Update 10 Test Tubes (Row 1: Tubes 0-4, Row 2: Tubes 5-9)
    if (this.tubesContainer) {
      const renderTube = (index: number) => {
        const tube = this.engine.state.tubes[index];
        const isSelected = this.selectedTubeIndex === index;

        return `
          <div id="water-tube-${index}" 
               data-index="${index}"
               class="water-tube-item relative w-[54px] sm:w-[62px] h-36 sm:h-40 rounded-b-3xl border-2 border-t-0 p-1 cursor-pointer transition-all duration-200 flex flex-col justify-end items-center shadow-lg group ${isSelected ? '-translate-y-4 shadow-blue-500/40 border-blue-400 ring-2 ring-blue-400 scale-105' : 'hover:-translate-y-1'} ${isDark ? 'bg-white/[0.03] border-white/20' : 'bg-black/[0.02] border-gray-300'}"
               style="border-bottom-left-radius: 24px; border-bottom-right-radius: 24px;">
            
            <!-- Glass Rim Ring at Top -->
            <div class="absolute -top-1.5 inset-x-[-2px] h-3 rounded-full border-2 ${isSelected ? 'border-blue-400 bg-blue-500/20' : (isDark ? 'border-white/30 bg-white/10' : 'border-gray-400 bg-gray-200')}"></div>

            <!-- Glass Reflection Streak -->
            <div class="absolute left-1 top-2 bottom-4 w-1 bg-white/20 rounded-full pointer-events-none z-20"></div>

            <!-- Liquid Segments (Stack from bottom up, max 4 segments) -->
            <div class="w-full flex flex-col-reverse justify-start items-center space-y-reverse space-y-0.5 z-10">
              ${tube.map((colorId, segIdx) => {
                const c = this.getColorDef(colorId);
                const isTop = segIdx === tube.length - 1;
                return `
                  <div class="w-full h-7 sm:h-8 rounded-sm transition-all duration-200 relative overflow-hidden shadow-inner ${isTop ? 'rounded-t-lg' : ''} ${segIdx === 0 ? 'rounded-b-2xl' : ''}"
                       style="background: linear-gradient(180deg, ${c?.gradient[0] || '#999'}, ${c?.gradient[1] || '#666'});">
                    ${isTop ? `
                      <!-- Meniscus Curve -->
                      <div class="w-full h-1.5 bg-white/30 rounded-t-full"></div>
                    ` : ''}
                    <!-- Subtle liquid shimmer -->
                    <div class="absolute top-1 right-2 w-1 h-1 rounded-full bg-white/30"></div>
                  </div>
                `;
              }).join('')}
            </div>

            <!-- Empty Capacity Markings (Dotted slots) -->
            ${Array.from({ length: TUBE_CAPACITY - tube.length }).map(() => `
              <div class="w-full h-7 sm:h-8 flex items-center justify-center opacity-10">
                <div class="w-3 h-0.5 bg-gray-400 rounded-full"></div>
              </div>
            `).join('')}

            <!-- Tube Index Label at Bottom -->
            <span class="absolute -bottom-5 text-[9px] font-mono font-bold text-gray-400">${index + 1}</span>
          </div>
        `;
      };

      const row1Tubes = [0, 1, 2, 3, 4].map(renderTube).join('');
      const row2Tubes = [5, 6, 7, 8, 9].map(renderTube).join('');

      this.tubesContainer.innerHTML = `
        <!-- Rack Row 1 (Tubes 1 - 5) -->
        <div class="w-full flex items-center justify-around px-1">
          ${row1Tubes}
        </div>
        <!-- Rack Row 2 (Tubes 6 - 10) -->
        <div class="w-full flex items-center justify-around px-1 pt-2">
          ${row2Tubes}
        </div>
      `;

      // Attach tube tap listeners
      this.tubesContainer.querySelectorAll('.water-tube-item').forEach(el => {
        el.addEventListener('click', (e) => {
          const target = (e.currentTarget as HTMLElement).dataset.index;
          if (target !== undefined) {
            this.handleTubeClick(parseInt(target, 10));
          }
        });
      });
    }

    // 5. Update Undo Button State
    if (this.undoBtn) {
      this.undoBtn.disabled = !this.engine.canUndo();
    }
  }

  public setTheme(theme: AppTheme) {
    this.currentTheme = theme;
    this.render();
  }

  public destroy() {
    this.ai?.destroy();
    this.ai = null;
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.container.innerHTML = '';
  }
}
