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
import type { NetworkHealth } from '../../network/webrtc-peer';

export class WaterSortGame implements GameInstance {
  private container: HTMLElement;
  private session: GameSession;
  private engine: WaterEngine;
  private ai: WaterAI | null = null;
  private selectedTubeIndex: number | null = null;
  private isAnimating: boolean = false;
  private currentTheme: AppTheme;

  // PvP State & Phases
  private phase: 'COUNTDOWN' | 'PLAYING' | 'MATCH_OVER' = 'COUNTDOWN';
  private countdown: number = 3;
  private countdownTimer: number | null = null;
  private opponentName: string = 'Opponent';
  private opponentScore: number = 0;
  private opponentWon: boolean = false;
  private matchSeed: number;
  private rematchState: 'idle' | 'requested' | 'offer_received' = 'idle';
  private playerMatchWins: number = 0;
  private opponentMatchWins: number = 0;
  private opponentCompletedColors: string[] = [];
  private opponentReservoirState: { color: string | null; count: number } = { color: null, count: 0 };
  private enemyToastTimeout: number | null = null;

  // Cached DOM elements & values to eliminate layout thrashing
  private tubesContainer: HTMLElement | null = null;
  private reservoirEl: HTMLElement | null = null;
  private colorRibbonEl: HTMLElement | null = null;
  private undoBtn: HTMLButtonElement | null = null;
  private hintBtn: HTMLButtonElement | null = null;
  private resetBtn: HTMLButtonElement | null = null;
  private statusBannerEl: HTMLElement | null = null;
  private statusTextEl: HTMLElement | null = null;
  private hintTextEl: HTMLElement | null = null;
  private scoreTrackerEl: HTMLElement | null = null;
  private badgePlayerEl: HTMLElement | null = null;
  private badgeOppEl: HTMLElement | null = null;
  private countdownOverlayEl: HTMLElement | null = null;
  private countdownNumberEl: HTMLElement | null = null;
  private countdownSubtitleEl: HTMLElement | null = null;
  private peerAwayBannerEl: HTMLElement | null = null;
  private netPingEl: HTMLElement | null = null;
  private netDotEl: HTMLElement | null = null;
  private netTextEl: HTMLElement | null = null;
  private rematchBtnEl: HTMLButtonElement | null = null;
  private enemyToastEl: HTMLElement | null = null;
  private oppClearedTrayEl: HTMLElement | null = null;
  private oppBowlStatusEl: HTMLElement | null = null;
  private oppAvatarEl: HTMLElement | null = null;

  private cachedPlayerScore: number = -1;
  private cachedOppScore: number = -1;
  private cachedStatusText: string = '';
  private cachedHintText: string = '';
  private cachedScoreText: string = '';
  private lastHUDUpdateTime: number = 0;

  // Audio helper for water pouring
  private audioCtx: AudioContext | null = null;

  constructor(container: HTMLElement, session: GameSession) {
    this.container = container;
    this.session = session;
    this.currentTheme = session.theme;

    if (session.mode === 'ai') {
      const diff = session.aiDifficulty || 'medium';
      const diffLabel = diff === 'extreme' ? 'BOSS' : diff.toUpperCase();
      this.opponentName = diff === 'extreme' ? 'BOSS 🔥' : `AI (${diffLabel})`;
    } else {
      this.opponentName = session.peer?.role === 'host' ? 'Guest' : 'Host';
    }

    // Seed generation
    this.matchSeed = session.mode === 'online'
      ? (session.peer?.role === 'host' ? Math.floor(Math.random() * 1000000) : 0)
      : Math.floor(Math.random() * 1000000);

    const generated = generateWaterBoard(this.matchSeed);
    this.engine = new WaterEngine(generated.tubes);

    this.mount();
    this.setupNetwork();
    this.setupAI();
    this.startCountdown();
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

    const origOnMessage = this.session.peer.events?.onMessage;
    const origOnStatusChange = this.session.peer.events?.onStatusChange;
    const origOnHealthChange = this.session.peer.events?.onHealthChange;

    this.session.peer = Object.assign(this.session.peer, {
      events: {
        ...this.session.peer.events,
        onMessage: (msg: any) => {
          origOnMessage?.(msg);
          this.handleNetworkMessage(msg);
        },
        onStatusChange: (status: string, message?: string) => {
          origOnStatusChange?.(status as any, message);
          if (status === 'disconnected') {
            if (this.phase !== 'MATCH_OVER' && !this.opponentWon && !this.engine.state.isWon) {
              this.handleMatchEnd('player', 'Opponent disconnected. You win by forfeit!');
            }
          }
        },
        onHealthChange: (health: NetworkHealth) => {
          origOnHealthChange?.(health);
          this.updateNetworkHealthHUD(health);
        }
      }
    });

    this.session.peer.flushEarlyMessages();

    if (this.session.peer.isConnected) {
      this.updateNetworkHealthHUD({
        rtt: this.session.peer.currentRtt,
        status: this.session.peer.networkQuality,
        isPeerVisible: this.session.peer.isPeerVisible
      });
    }

    // Host shares seed
    if (this.session.peer.role === 'host') {
      this.session.peer.sendMessage({
        type: 'WATER_INIT',
        seed: this.matchSeed
      });
    }
  }

  private updateNetworkHealthHUD(health: NetworkHealth) {
    if (this.netPingEl && this.netDotEl && this.netTextEl) {
      if (health.status === 'stalled') {
        this.netDotEl.className = 'w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping';
        this.netTextEl.textContent = 'Lag ⚠️';
        this.netPingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 rounded px-1.5 py-0.5';
      } else if (health.status === 'poor') {
        this.netDotEl.className = 'w-1.5 h-1.5 rounded-full bg-rose-400';
        this.netTextEl.textContent = `${health.rtt}ms`;
        this.netPingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 rounded px-1.5 py-0.5';
      } else if (health.status === 'moderate') {
        this.netDotEl.className = 'w-1.5 h-1.5 rounded-full bg-amber-400';
        this.netTextEl.textContent = `${health.rtt}ms`;
        this.netPingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 rounded px-1.5 py-0.5';
      } else {
        this.netDotEl.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400';
        this.netTextEl.textContent = `${health.rtt || 30}ms`;
        this.netPingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 rounded px-1.5 py-0.5';
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

  private handleNetworkMessage(msg: any) {
    switch (msg.type) {
      case 'PLAYER_LEAVE':
        if (this.phase !== 'MATCH_OVER' && !this.opponentWon && !this.engine.state.isWon) {
          this.handleMatchEnd('player', 'Opponent forfeited the match.');
        }
        break;
      case 'WATER_INIT':
        this.matchSeed = msg.seed;
        this.startNewMatch(this.matchSeed);
        break;
      case 'WATER_POUR_TUBE':
        // Opponent made a tube pour
        break;
      case 'WATER_POUR_BOWL': {
        const color = msg.color;
        const count = msg.count || 1;
        const isCompleted = !!msg.isCompleted;
        if (isCompleted) {
          if (!this.opponentCompletedColors.includes(color)) {
            this.opponentCompletedColors.push(color);
          }
          this.opponentReservoirState = { color: null, count: 0 };
          this.showOpponentActionToast('clear', color);
          this.updateOpponentClearedTray();
          this.updateOpponentBowlStatus();
        } else {
          this.opponentReservoirState = { color, count: msg.newBowlCount || count };
          this.showOpponentActionToast('pour', color, this.opponentReservoirState.count);
          this.updateOpponentBowlStatus();
        }
        break;
      }
      case 'WATER_PROGRESS':
        this.opponentScore = msg.score;
        if (Array.isArray(msg.completedColors)) {
          this.opponentCompletedColors = [...msg.completedColors];
          this.updateOpponentClearedTray();
        }
        this.updateHUD(true);
        if (msg.isWon && !this.engine.state.isWon) {
          this.opponentWon = true;
          this.handleMatchEnd('opponent');
        }
        break;
      case 'REMATCH_REQUEST':
        this.showRematchOffer();
        break;
      case 'REMATCH_ACCEPT':
        this.startNewMatch(msg.seed);
        break;
      case 'WATER_REMATCH':
        this.startNewMatch(msg.seed);
        break;
    }
  }

  private setupAI() {
    if (this.session.mode !== 'ai') return;
    const diff = this.session.aiDifficulty || 'medium';
    const generated = generateWaterBoard(this.matchSeed);

    if (this.ai) {
      this.ai.destroy();
      this.ai = null;
    }

    this.ai = new WaterAI(generated.tubes, diff, {
      onMove: (action) => {
        if (action.type === 'reservoir' && action.color) {
          if (action.isCompleted) {
            if (!this.opponentCompletedColors.includes(action.color)) {
              this.opponentCompletedColors.push(action.color);
            }
            this.opponentReservoirState = { color: null, count: 0 };
            this.showOpponentActionToast('clear', action.color);
            this.updateOpponentClearedTray();
            this.updateOpponentBowlStatus();
          } else {
            this.opponentReservoirState = { color: action.color, count: action.count || 1 };
            this.showOpponentActionToast('pour', action.color, action.count);
            this.updateOpponentBowlStatus();
          }
        }
      },
      onProgress: (score, completed, isWon) => {
        const prevScore = this.opponentScore;
        this.opponentScore = score;
        this.opponentCompletedColors = [...completed];
        this.updateOpponentClearedTray();
        if (score > prevScore) {
          const lastColor = completed[completed.length - 1];
          if (lastColor) {
            this.showOpponentActionToast('clear', lastColor);
          }
        }
        this.updateHUD(true);
        if (isWon && !this.engine.state.isWon) {
          this.opponentWon = true;
          this.handleMatchEnd('opponent');
        }
      }
    });

    if (this.phase === 'PLAYING') {
      this.ai.start();
    }
  }

  private startCountdown() {
    this.phase = 'COUNTDOWN';
    this.countdown = 3;
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }

    if (this.countdownOverlayEl && this.countdownNumberEl && this.countdownSubtitleEl) {
      this.countdownOverlayEl.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
      this.countdownNumberEl.className = 'text-7xl sm:text-8xl font-black text-amber-400 drop-shadow-[0_0_30px_rgba(245,158,11,0.9)] animate-scaleIn';
      this.countdownNumberEl.textContent = '3';
      this.countdownSubtitleEl.textContent = 'GET READY!';
    }

    sounds.playCountdownTick(false);
    this.updateHUD(true);

    this.countdownTimer = window.setInterval(() => {
      this.countdown--;
      if (this.countdown > 0) {
        sounds.playCountdownTick(false);
        if (this.countdownNumberEl) {
          this.countdownNumberEl.textContent = `${this.countdown}`;
          this.countdownNumberEl.classList.remove('animate-scaleIn');
          void this.countdownNumberEl.offsetWidth;
          this.countdownNumberEl.classList.add('animate-scaleIn');
        }
        this.updateHUD(true);
      } else if (this.countdown === 0) {
        sounds.playCountdownTick(true);
        if (this.countdownNumberEl && this.countdownSubtitleEl) {
          this.countdownNumberEl.className = 'text-6xl sm:text-7xl font-black text-emerald-400 drop-shadow-[0_0_30px_rgba(16,185,129,0.9)] animate-scaleIn';
          this.countdownNumberEl.textContent = 'GO!';
          this.countdownSubtitleEl.textContent = 'RACE TO SORT!';
        }
        this.phase = 'PLAYING';
        this.updateHUD(true);
        if (this.session.mode === 'ai' && this.ai) {
          this.ai.start();
        }

        // Smoothly fade out overlay
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

  private handleRematchClick() {
    if (this.session.mode === 'ai') {
      this.startNewMatch();
      return;
    }

    if (this.rematchState === 'offer_received') {
      const seed = Math.floor(Math.random() * 1000000);
      this.session.peer?.sendMessage({ type: 'REMATCH_ACCEPT', seed });
      this.startNewMatch(seed);
    } else if (this.rematchState === 'idle') {
      this.rematchState = 'requested';
      if (this.rematchBtnEl) {
        this.rematchBtnEl.textContent = 'Waiting for Opponent...';
        this.rematchBtnEl.classList.add('opacity-70', 'cursor-not-allowed');
      }
      this.session.peer?.sendMessage({ type: 'REMATCH_REQUEST' });
    }
  }

  private showRematchOffer() {
    this.rematchState = 'offer_received';
    if (this.rematchBtnEl) {
      this.rematchBtnEl.textContent = 'Accept Rematch!';
      this.rematchBtnEl.classList.remove('opacity-70', 'cursor-not-allowed');
      this.rematchBtnEl.className = 'w-full py-3 rounded-xl text-xs font-black tracking-wider uppercase text-white bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 shadow-lg shadow-emerald-500/30 active:scale-95 transition-all cursor-pointer animate-pulse';
    }
  }

  private startNewMatch(seed?: number) {
    this.rematchState = 'idle';
    const modal = document.getElementById('water-modal-victory');
    modal?.classList.add('hidden');

    if (this.rematchBtnEl) {
      this.rematchBtnEl.textContent = 'Play Next Match';
      this.rematchBtnEl.className = 'ps-btn-primary w-full py-3 rounded-xl text-xs font-bold';
    }

    this.matchSeed = seed !== undefined ? seed : Math.floor(Math.random() * 1000000);
    const generated = generateWaterBoard(this.matchSeed);
    this.engine = new WaterEngine(generated.tubes);
    this.selectedTubeIndex = null;
    this.opponentScore = 0;
    this.opponentWon = false;
    this.opponentCompletedColors = [];
    this.opponentReservoirState = { color: null, count: 0 };

    if (this.enemyToastTimeout !== null) {
      clearTimeout(this.enemyToastTimeout);
      this.enemyToastTimeout = null;
    }
    if (this.enemyToastEl) {
      this.enemyToastEl.className = 'w-full h-full transition-all duration-300 opacity-0 -translate-y-1 scale-98 pointer-events-none text-center rounded-xl border border-transparent flex items-center justify-center space-x-2 px-3 text-xs font-bold';
      this.enemyToastEl.style.boxShadow = '';
      this.enemyToastEl.style.backgroundColor = '';
      this.enemyToastEl.style.color = '';
      this.enemyToastEl.style.borderColor = 'transparent';
    }
    if (this.statusBannerEl) {
      this.statusBannerEl.style.borderColor = '';
      this.statusBannerEl.style.boxShadow = '';
    }

    this.updateOpponentClearedTray();
    this.updateOpponentBowlStatus();

    if (this.session.mode === 'ai') {
      this.setupAI();
    }

    this.render();
    this.startCountdown();
  }

  private showOpponentActionToast(type: 'clear' | 'pour', colorId: string, count?: number) {
    if (this.enemyToastTimeout !== null) {
      clearTimeout(this.enemyToastTimeout);
      this.enemyToastTimeout = null;
    }

    const cDef = this.getColorDef(colorId);
    const colorName = cDef?.name || colorId.toUpperCase();
    const colorHex = cDef?.hex || '#3b82f6';
    const isDark = this.currentTheme === 'dark';
    const oppLabel = this.session.mode === 'ai'
      ? (this.session.aiDifficulty === 'extreme' ? 'BOSS' : 'BOT')
      : 'OPPONENT';

    // Flash opponent avatar border & glow
    if (this.oppAvatarEl) {
      this.oppAvatarEl.style.boxShadow = `0 0 16px ${colorHex}`;
      this.oppAvatarEl.style.borderColor = colorHex;
      setTimeout(() => {
        if (this.oppAvatarEl) {
          this.oppAvatarEl.style.boxShadow = '';
          this.oppAvatarEl.style.borderColor = '';
        }
      }, 1800);
    }

    // Glow the center status capsule and show concise, punchy text that never gets cut off!
    if (this.statusBannerEl) {
      this.statusBannerEl.style.borderColor = colorHex;
      this.statusBannerEl.style.boxShadow = `0 0 14px ${colorHex}55`;
    }

    if (this.statusTextEl && this.hintTextEl) {
      if (type === 'clear') {
        this.statusTextEl.textContent = `⭐ ${oppLabel} CLEARED!`;
        this.statusTextEl.className = 'text-[9px] sm:text-[10px] font-black tracking-wide text-rose-400 uppercase leading-tight whitespace-nowrap animate-pulse';
        this.hintTextEl.textContent = `${colorName} • ${this.opponentScore}/${TOTAL_COLORS}`;
      } else {
        this.statusTextEl.textContent = `🥣 ${oppLabel} DEPOSIT`;
        this.statusTextEl.className = 'text-[9px] sm:text-[10px] font-black tracking-wide text-amber-400 uppercase leading-tight whitespace-nowrap';
        this.hintTextEl.textContent = `${colorName} (${count || 1}/3)`;
      }
    }

    if (!this.enemyToastEl) return;

    if (type === 'clear') {
      sounds.playBlockSnap();
      this.enemyToastEl.innerHTML = `
        <span class="text-sm animate-bounce">⭐</span>
        <div class="flex items-center space-x-1.5">
          <span class="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm" style="background: ${colorHex}; box-shadow: 0 0 10px ${colorHex};"></span>
          <span class="text-[11px] sm:text-xs font-black tracking-wide uppercase ${isDark ? 'text-white' : 'text-gray-900'}">${this.opponentName} CLEARED ${colorName}!</span>
        </div>
        <span class="text-[10px] font-mono font-black px-2 py-0.5 rounded bg-amber-500/25 text-amber-300 border border-amber-500/40 shrink-0">
          ${this.opponentScore}/${TOTAL_COLORS}
        </span>
      `;
      this.enemyToastEl.style.borderColor = colorHex;
      this.enemyToastEl.style.boxShadow = `0 0 16px ${colorHex}55`;
      this.enemyToastEl.style.backgroundColor = isDark ? '#111827' : '#ffffff';
      this.enemyToastEl.style.color = isDark ? '#ffffff' : '#111827';
      this.enemyToastEl.className = `w-full h-full transition-all duration-300 opacity-100 translate-y-0 scale-100 text-center rounded-xl border flex items-center justify-center space-x-2 px-3 text-xs font-bold shadow-lg`;

      this.enemyToastTimeout = window.setTimeout(() => {
        if (this.enemyToastEl) {
          this.enemyToastEl.className = 'w-full h-full transition-all duration-300 opacity-0 -translate-y-1 scale-98 pointer-events-none text-center rounded-xl border border-transparent flex items-center justify-center space-x-2 px-3 text-xs font-bold';
          this.enemyToastEl.style.boxShadow = '';
          this.enemyToastEl.style.backgroundColor = '';
          this.enemyToastEl.style.color = '';
          this.enemyToastEl.style.borderColor = 'transparent';
        }
        if (this.statusBannerEl) {
          this.statusBannerEl.style.borderColor = '';
          this.statusBannerEl.style.boxShadow = '';
        }
        if (this.statusTextEl) {
          this.statusTextEl.className = 'text-[9px] sm:text-[10px] font-black tracking-wide text-amber-400 uppercase leading-tight whitespace-nowrap';
        }
        this.enemyToastTimeout = null;
        this.updateHUD(true);
      }, 2600);
    } else {
      // Pour into bowl
      this.enemyToastEl.innerHTML = `
        <span class="text-xs">🥣</span>
        <div class="flex items-center space-x-1.5">
          <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background: ${colorHex}; box-shadow: 0 0 6px ${colorHex};"></span>
          <span class="text-[10px] sm:text-[11px] font-bold tracking-wide ${isDark ? 'text-gray-100' : 'text-gray-800'}">${this.opponentName} added ${colorName}</span>
        </div>
        <span class="text-[9px] font-mono font-black px-1.5 py-0.5 rounded bg-blue-500/25 text-blue-300 border border-blue-500/40 shrink-0">
          ${count || 1}/3
        </span>
      `;
      this.enemyToastEl.style.borderColor = `${colorHex}88`;
      this.enemyToastEl.style.boxShadow = `0 0 12px ${colorHex}33`;
      this.enemyToastEl.style.backgroundColor = isDark ? '#111827' : '#ffffff';
      this.enemyToastEl.style.color = isDark ? '#ffffff' : '#111827';
      this.enemyToastEl.className = `w-full h-full transition-all duration-300 opacity-100 translate-y-0 scale-100 text-center rounded-xl border flex items-center justify-center space-x-2 px-3 text-xs font-bold shadow-md`;

      this.enemyToastTimeout = window.setTimeout(() => {
        if (this.enemyToastEl) {
          this.enemyToastEl.className = 'w-full h-full transition-all duration-300 opacity-0 -translate-y-1 scale-98 pointer-events-none text-center rounded-xl border border-transparent flex items-center justify-center space-x-2 px-3 text-xs font-bold';
          this.enemyToastEl.style.boxShadow = '';
          this.enemyToastEl.style.backgroundColor = '';
          this.enemyToastEl.style.color = '';
          this.enemyToastEl.style.borderColor = 'transparent';
        }
        if (this.statusBannerEl) {
          this.statusBannerEl.style.borderColor = '';
          this.statusBannerEl.style.boxShadow = '';
        }
        if (this.statusTextEl) {
          this.statusTextEl.className = 'text-[9px] sm:text-[10px] font-black tracking-wide text-amber-400 uppercase leading-tight whitespace-nowrap';
        }
        this.enemyToastTimeout = null;
        this.updateHUD(true);
      }, 1600);
    }
  }

  private updateOpponentClearedTray() {
    if (!this.oppClearedTrayEl) return;
    if (this.opponentCompletedColors.length === 0) {
      this.oppClearedTrayEl.innerHTML = '';
      return;
    }
    this.oppClearedTrayEl.innerHTML = this.opponentCompletedColors.map(cId => {
      const cDef = this.getColorDef(cId);
      const hex = cDef?.hex || '#10b981';
      return `<span class="w-2 h-2 rounded-full inline-block shadow-sm transition-transform hover:scale-125" style="background: ${hex}; box-shadow: 0 0 4px ${hex};" title="${cDef?.name || cId}"></span>`;
    }).join('');
  }

  private updateOpponentBowlStatus() {
    if (!this.oppBowlStatusEl) return;
    if (this.opponentReservoirState.color && this.opponentReservoirState.count > 0) {
      const cDef = this.getColorDef(this.opponentReservoirState.color);
      const hex = cDef?.hex || '#10b981';
      this.oppBowlStatusEl.classList.remove('hidden');
      this.oppBowlStatusEl.style.borderColor = `${hex}66`;
      this.oppBowlStatusEl.style.backgroundColor = `${hex}22`;
      this.oppBowlStatusEl.style.color = hex;
      this.oppBowlStatusEl.textContent = `🥣 ${this.opponentReservoirState.count}/3`;
      this.oppBowlStatusEl.title = `Opponent bowl: ${cDef?.name || ''} (${this.opponentReservoirState.count}/3)`;
    } else {
      this.oppBowlStatusEl.classList.add('hidden');
    }
  }

  private getColorDef(colorId: string | null): ColorDef | undefined {
    if (!colorId) return undefined;
    return WATER_COLORS.find(c => c.id === colorId);
  }

  private mount() {
    this.container.innerHTML = `
      <style>
        @keyframes water-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .liquid-shimmer {
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 35%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.1) 65%, transparent 100%);
          background-size: 200% 100%;
          animation: water-shimmer 3s ease-in-out infinite;
        }
        @keyframes bowl-glow-pulse {
          0%, 100% { box-shadow: 0 0 15px var(--glow-color); }
          50% { box-shadow: 0 0 35px var(--glow-color), 0 0 60px var(--glow-color); }
        }
        @keyframes scale-in {
          0% { transform: scale(0.6); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-scaleIn {
          animation: scale-in 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
        }
      </style>
      <div id="water-game-root" class="w-full max-w-lg min-h-full flex flex-col justify-between items-center py-2 sm:py-4 px-3 sm:px-5 select-none relative font-sans">
        
        <!-- Top Bar: Exit, Title, Mode, Net Ping, Sound -->
        <header class="w-full flex items-center justify-between py-1 px-1 mb-1 sm:mb-2">
          <button id="water-btn-exit" class="px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 shadow-sm ps-btn-secondary" title="Exit to Arcade Hub">
            <span>← Exit</span>
          </button>

          <div class="flex items-center space-x-1.5">
            <span class="text-[10px] sm:text-[11px] font-bold text-amber-500 font-mono tracking-wider uppercase">WATER SORT</span>
            <span class="text-[9px] sm:text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">${this.session.mode === 'ai' ? 'VS AI' : '1V1 ONLINE'}</span>
          </div>

          <div class="flex items-center space-x-1.5">
            <span id="water-net-ping" class="${this.session.mode === 'online' ? 'inline-flex' : 'hidden'} items-center space-x-1 text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 rounded px-1.5 py-0.5">
              <span id="water-net-dot" class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span id="water-net-text">30ms</span>
            </span>
            <button id="water-btn-sound" class="p-1.5 rounded-xl text-xs font-bold transition-all ps-btn-secondary">
              <span>${sounds.enabled ? '🔊' : '🔇'}</span>
            </button>
          </div>
        </header>

        <!-- Inactive Tab / Peer Away Banner -->
        <div id="water-peer-away-banner" class="hidden w-full text-center py-0.5 px-2 mb-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-[10px] tracking-wide animate-pulse">
          ⚠️ Opponent is tabbed out / minimized
        </div>

        <!-- Opponent Action Notice Slot (Fixed height prevents any layout shift; generous top spacing) -->
        <div id="water-enemy-toast-slot" class="w-full h-8 sm:h-9 relative flex items-center justify-center mt-2.5 sm:mt-3 mb-1.5 sm:mb-2">
          <div id="water-enemy-toast" class="w-full h-full transition-all duration-300 opacity-0 -translate-y-1 scale-98 pointer-events-none text-center rounded-xl border border-transparent flex items-center justify-center space-x-2 px-3 text-xs font-bold">
            <!-- Populated dynamically -->
          </div>
        </div>

        <!-- 1v1 Split Duel Score & Momentum HUD -->
        <div id="water-duel-hud" class="w-full grid grid-cols-3 items-center px-1 mb-2 sm:mb-3 gap-1">
          <!-- Player Side -->
          <div class="flex items-center space-x-1.5 justify-self-start">
            <div class="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 flex items-center justify-center font-black text-xs shrink-0">P</div>
            <div class="flex flex-col">
              <span class="text-[9px] font-bold text-blue-400 leading-none">YOU</span>
              <span id="water-player-score-badge" class="px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-300 border border-blue-500/30 font-mono text-[10px] font-black leading-none mt-0.5">0/${TOTAL_COLORS}</span>
            </div>
          </div>

          <!-- Center Dynamic Momentum Banner -->
          <div id="water-status-banner" class="flex flex-col items-center justify-center px-2 py-0.5 rounded-xl bg-amber-600/15 border border-amber-500/30 text-center mx-auto w-full max-w-[160px] min-h-[36px] transition-all">
            <span id="water-status-text" class="text-[9px] sm:text-[10px] font-black tracking-wide text-amber-400 uppercase leading-tight whitespace-nowrap">GET READY!</span>
            <span id="water-hint-text" class="text-[8px] font-medium text-gray-400 leading-tight truncate max-w-[150px]">Match starts in 3...</span>
          </div>

          <!-- Opponent Side -->
          <div class="flex items-center space-x-1.5 justify-self-end text-right">
            <div class="flex flex-col items-end">
              <span id="water-opp-name" class="text-[9px] font-bold text-emerald-400 leading-none truncate max-w-[80px]">${this.opponentName}</span>
              <div class="flex items-center space-x-1 mt-0.5">
                <span id="water-opp-score-badge" class="px-1.5 py-0.5 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 font-mono text-[10px] font-black leading-none">0/${TOTAL_COLORS}</span>
                <span id="water-opp-bowl-status" class="hidden text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border leading-none"></span>
              </div>
              <!-- Mini Cleared Colors tray for Opponent -->
              <div id="water-opp-cleared-tray" class="flex items-center space-x-0.5 mt-1 min-h-[8px]"></div>
            </div>
            <div id="water-opp-avatar" class="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-black text-xs shrink-0 transition-all duration-300">
              ${this.session.mode === 'ai' ? '🤖' : '👤'}
            </div>
          </div>
        </div>

        <!-- 10-Color Capsule Ribbon (Fits mobile width with zero scrollbar) -->
        <div class="w-full max-w-sm py-1.5 mb-2 sm:mb-3">
          <div id="water-color-ribbon" class="flex items-center justify-between px-0.5">
            <!-- Rendered dynamically -->
          </div>
        </div>

        <!-- Central Big Mixing Bowl (Single Color Extractor) -->
        <div class="w-full flex flex-col items-center justify-center my-1.5 sm:my-3">
          <div class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
            <span>🥣 COLOR MIXING BOWL (3 UNITS TO CLEAR)</span>
          </div>
          <div id="water-reservoir-container" class="cursor-pointer transition-transform duration-200 hover:scale-105 active:scale-95">
            <!-- Rendered dynamically -->
          </div>
        </div>

        <!-- 10 Test Tubes Grid (2 Rows of 5 Tubes) -->
        <div class="w-full flex-1 flex flex-col justify-center items-center my-2 sm:my-4">
          <div id="water-tubes-container" class="w-full flex flex-col space-y-3 sm:space-y-4">
            <!-- Rendered dynamically: Row 1 (5 tubes) & Row 2 (5 tubes) -->
          </div>
        </div>

        <!-- Bottom Action Bar: Undo, Hint, Reset + Cumulative Score -->
        <footer class="w-full max-w-sm flex flex-col space-y-1.5 py-1 px-1 mt-1 sm:mt-2">
          <div class="w-full flex items-center justify-between space-x-3">
            <button id="water-btn-undo" class="flex-1 py-2 sm:py-2.5 rounded-xl text-xs font-bold ps-btn-secondary flex items-center justify-center space-x-1 shadow-sm transition-all disabled:opacity-40">
              <span>↩️ Undo</span>
            </button>
            <button id="water-btn-hint" class="flex-1 py-2 sm:py-2.5 rounded-xl text-xs font-bold ps-btn-secondary flex items-center justify-center space-x-1 shadow-sm transition-all text-amber-500 hover:text-amber-400">
              <span>💡 Hint</span>
            </button>
            <button id="water-btn-reset" class="flex-1 py-2 sm:py-2.5 rounded-xl text-xs font-bold ps-btn-secondary flex items-center justify-center space-x-1 shadow-sm transition-all text-rose-500 hover:text-rose-400">
              <span>🔄 Reset</span>
            </button>
          </div>
          <div class="w-full flex items-center justify-between px-1 text-[10px] font-mono text-gray-400">
            <span class="truncate">3 units per color to clear</span>
            <span id="water-score-tracker" class="font-black text-amber-500 shrink-0 ml-2">SCORE: 0 - 0</span>
          </div>
        </footer>

        <!-- Full-screen Countdown Overlay -->
        <div id="water-countdown-overlay" class="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300 pointer-events-auto rounded-3xl">
          <span id="water-countdown-number" class="text-7xl sm:text-8xl font-black text-amber-400 drop-shadow-[0_0_30px_rgba(245,158,11,0.9)] animate-scaleIn">3</span>
          <span id="water-countdown-subtitle" class="text-xs sm:text-sm font-black tracking-widest uppercase text-amber-200 mt-2 drop-shadow">GET READY!</span>
        </div>

        <!-- Victory / Match End Modal (Fixed full-screen backdrop, no white border lines) -->
        <div id="water-modal-victory" class="hidden fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div id="water-modal-card" class="w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl border-0 animate-fadeIn ${this.currentTheme === 'dark' ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}">
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
    this.undoBtn = document.getElementById('water-btn-undo') as HTMLButtonElement;
    this.hintBtn = document.getElementById('water-btn-hint') as HTMLButtonElement;
    this.resetBtn = document.getElementById('water-btn-reset') as HTMLButtonElement;
    this.statusTextEl = document.getElementById('water-status-text');
    this.hintTextEl = document.getElementById('water-hint-text');
    this.scoreTrackerEl = document.getElementById('water-score-tracker');
    this.badgePlayerEl = document.getElementById('water-player-score-badge');
    this.badgeOppEl = document.getElementById('water-opp-score-badge');
    this.countdownOverlayEl = document.getElementById('water-countdown-overlay');
    this.countdownNumberEl = document.getElementById('water-countdown-number');
    this.countdownSubtitleEl = document.getElementById('water-countdown-subtitle');
    this.peerAwayBannerEl = document.getElementById('water-peer-away-banner');
    this.netPingEl = document.getElementById('water-net-ping');
    this.netDotEl = document.getElementById('water-net-dot');
    this.netTextEl = document.getElementById('water-net-text');
    this.rematchBtnEl = document.getElementById('water-btn-play-again') as HTMLButtonElement;
    this.statusBannerEl = document.getElementById('water-status-banner');
    this.enemyToastEl = document.getElementById('water-enemy-toast');
    this.oppClearedTrayEl = document.getElementById('water-opp-cleared-tray');
    this.oppBowlStatusEl = document.getElementById('water-opp-bowl-status');
    this.oppAvatarEl = document.getElementById('water-opp-avatar');

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
      if (this.phase !== 'PLAYING' || this.isAnimating || !this.engine.canUndo()) return;
      this.engine.undo();
      this.selectedTubeIndex = null;
      this.playSplashSound();
      this.render();
    });

    // Reset
    this.resetBtn?.addEventListener('click', () => {
      if (this.phase !== 'PLAYING' || this.isAnimating) return;
      if (confirm('Reset this puzzle to start over?')) {
        this.engine.reset();
        this.selectedTubeIndex = null;
        this.render();
      }
    });

    // Hint
    this.hintBtn?.addEventListener('click', () => {
      if (this.phase !== 'PLAYING' || this.isAnimating) return;
      const hint = this.engine.getHint();
      if (!hint) {
        alert('No obvious hint found! Try unburying matching colors.');
        return;
      }
      this.highlightHint(hint);
    });

    // Reservoir Click
    this.reservoirEl?.addEventListener('click', () => {
      if (this.phase !== 'PLAYING' || this.isAnimating || this.selectedTubeIndex === null) return;
      this.handlePourToReservoir(this.selectedTubeIndex);
    });

    // Rematch button (uses 2-step handshake in online mode)
    this.rematchBtnEl?.addEventListener('click', () => {
      this.handleRematchClick();
    });

    document.getElementById('water-btn-return-hub')?.addEventListener('click', () => {
      this.session.onExit();
    });
  }

  private handleTubeClick(index: number) {
    if (this.phase !== 'PLAYING' || this.isAnimating || this.engine.state.isWon || this.opponentWon) return;

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

  private animatePour(
    srcIndex: number,
    targetEl: HTMLElement,
    colorId: string,
    onComplete: () => void
  ) {
    const srcEl = document.getElementById(`water-tube-${srcIndex}`);
    if (!srcEl) {
      onComplete();
      return;
    }

    const srcRect = srcEl.getBoundingClientRect();
    const dstRect = targetEl.getBoundingClientRect();

    const dx = (dstRect.left + dstRect.width / 2) - (srcRect.left + srcRect.width / 2);
    const dy = dstRect.top - srcRect.top;
    const toRight = dx >= 0;
    const tiltAngle = toRight ? 70 : -70;

    const colorDef = this.getColorDef(colorId);
    const gradient = colorDef ? `linear-gradient(180deg, ${colorDef.gradient[0]}, ${colorDef.gradient[1]})` : '#3b82f6';

    // 1. Set transform-origin near mouth and elevate & tilt toward destination
    srcEl.style.transformOrigin = '50% 15%';
    srcEl.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)';
    srcEl.style.zIndex = '50';
    srcEl.style.transform = `translate(${dx + (toRight ? -14 : 14)}px, ${dy - 55}px) rotate(${tiltAngle}deg)`;

    // 2. Liquid pour stream overlay directly between mouth and destination
    let streamEl: HTMLElement | null = null;
    const streamTimer = setTimeout(() => {
      this.playPourSound();

      const streamX = dstRect.left + dstRect.width / 2;
      const streamTop = Math.max(10, dstRect.top - 22);
      const streamHeight = 35;

      streamEl = document.createElement('div');
      streamEl.id = 'water-pour-stream';
      streamEl.className = 'fixed pointer-events-none z-40 rounded-full shadow-lg';
      streamEl.style.left = `${streamX - 3}px`;
      streamEl.style.top = `${streamTop}px`;
      streamEl.style.width = '6px';
      streamEl.style.height = `${streamHeight}px`;
      streamEl.style.background = gradient;
      streamEl.style.boxShadow = `0 0 14px ${colorDef?.hex || '#3b82f6'}`;

      document.body.appendChild(streamEl);
    }, 180);

    // 3. Return source tube and finish
    setTimeout(() => {
      clearTimeout(streamTimer);
      if (streamEl && streamEl.parentNode) {
        streamEl.parentNode.removeChild(streamEl);
      }

      srcEl.style.transition = 'transform 0.22s ease-out';
      srcEl.style.transform = '';
      srcEl.style.zIndex = '';
      srcEl.style.transformOrigin = '';

      setTimeout(() => {
        onComplete();
      }, 220);
    }, 520);
  }

  private handlePourBetweenTubes(srcIndex: number, dstIndex: number) {
    const check = this.engine.canPour(srcIndex, dstIndex);
    if (!check.valid || !check.color) {
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

    const dstEl = document.getElementById(`water-tube-${dstIndex}`);
    if (!dstEl) return;

    this.isAnimating = true;
    const color = check.color;

    this.animatePour(srcIndex, dstEl, color, () => {
      this.engine.pour(srcIndex, dstIndex);
      if (this.session.mode === 'online' && this.session.peer?.isConnected) {
        this.session.peer.sendMessage({
          type: 'WATER_POUR_TUBE',
          color,
          srcIndex,
          dstIndex
        });
      }
      this.selectedTubeIndex = null;
      this.isAnimating = false;
      this.render();
    });
  }

  private handlePourToReservoir(srcIndex: number) {
    const check = this.engine.canPourToReservoir(srcIndex);
    if (!check.valid || !check.color) {
      this.shakeReservoir();
      return;
    }

    const resCard = document.getElementById('water-reservoir-card');
    if (!resCard) return;

    this.isAnimating = true;
    const color = check.color;

    this.animatePour(srcIndex, resCard, color, () => {
      const result = this.engine.pourToReservoir(srcIndex);
      this.selectedTubeIndex = null;

      if (this.session.mode === 'online' && this.session.peer?.isConnected) {
        this.session.peer.sendMessage({
          type: 'WATER_POUR_BOWL',
          color,
          count: result?.count || 1,
          newBowlCount: this.engine.state.reservoir.count,
          isCompleted: result?.isCompleted || false,
          score: this.engine.state.score
        });
      }

      if (result?.isCompleted) {
        const completedColorDef = this.getColorDef(result.color);
        if (completedColorDef) {
          // Show the bowl completion animation before rendering the cleared state
          this.triggerColorCompleted(result.color);
          this.animateBowlCompletion(completedColorDef, () => {
            this.isAnimating = false;
            this.render();
            this.syncProgress();
            if (this.engine.state.isWon) {
              this.handleMatchEnd('player');
            }
          });
          return; // Don't render yet — animation callback will handle it
        }
      }

      this.isAnimating = false;
      this.render();
      this.syncProgress();

      if (this.engine.state.isWon) {
        this.handleMatchEnd('player');
      }
    });
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

  /**
   * Animate the bowl when a color is completed (3/3 filled).
   * Shows glow → "CLEARED!" badge → liquid drains upward → callback.
   */
  private animateBowlCompletion(colorDef: ColorDef, onComplete: () => void) {
    const resCard = document.getElementById('water-reservoir-card');
    if (!resCard) { onComplete(); return; }

    // Phase 1: Intense glow + pulsing border
    resCard.style.transition = 'box-shadow 0.3s, border-color 0.3s, transform 0.3s';
    resCard.style.boxShadow = `0 0 30px ${colorDef.hex}, 0 0 60px ${colorDef.hex}60`;
    resCard.style.borderColor = colorDef.hex;
    resCard.style.transform = 'scale(1.04)';

    // Create a liquid overlay that shows the full 3/3 state
    const overlay = document.createElement('div');
    overlay.className = 'absolute inset-x-1.5 bottom-1 top-1.5 z-30 flex items-center justify-center overflow-hidden';
    overlay.style.borderBottomLeftRadius = '32px';
    overlay.style.borderBottomRightRadius = '32px';
    overlay.style.background = `linear-gradient(180deg, ${colorDef.gradient[0]}, ${colorDef.gradient[1]})`;
    overlay.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
    overlay.innerHTML = `
      <div class="liquid-shimmer absolute inset-0 pointer-events-none"></div>
      <span class="relative text-white font-black text-sm sm:text-base drop-shadow-lg animate-pulse tracking-wider">
        ✨ ${colorDef.name} CLEARED! ✨
      </span>
    `;
    resCard.appendChild(overlay);

    // Phase 2: After glow hold, drain the liquid upward and fade out
    setTimeout(() => {
      overlay.style.opacity = '0';
      overlay.style.transform = 'translateY(-25px) scaleY(0.2)';
      resCard.style.boxShadow = '';
      resCard.style.borderColor = '';
      resCard.style.transform = '';
    }, 900);

    // Phase 3: Cleanup and trigger callback
    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resCard.style.transition = '';
      onComplete();
    }, 1500);
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

  private handleMatchEnd(winner: 'player' | 'opponent', customMessage?: string) {
    this.phase = 'MATCH_OVER';
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.countdownOverlayEl) {
      this.countdownOverlayEl.classList.add('hidden');
    }

    const modal = document.getElementById('water-modal-victory');
    const title = document.getElementById('water-victory-title');
    const sub = document.getElementById('water-victory-subtitle');
    const icon = document.getElementById('water-victory-icon');

    if (!modal || !title || !sub || !icon) return;

    const card = document.getElementById('water-modal-card');
    if (card) {
      const isDark = this.currentTheme === 'dark';
      card.className = `w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl border-0 animate-fadeIn ${isDark ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`;
    }

    if (winner === 'player') {
      this.playerMatchWins++;
      icon.textContent = '🏆';
      title.textContent = 'VICTORY!';
      sub.textContent = customMessage || `Magnificent! You sorted all 10 colors in ${this.engine.state.moveCount} moves!`;
      sounds.playFanfare();
      try {
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 } });
      } catch {}
    } else {
      this.opponentMatchWins++;
      icon.textContent = '💀';
      title.textContent = 'DEFEAT!';
      sub.textContent = customMessage || `${this.opponentName} completed all 10 colors first. Better luck next round!`;
      sounds.playGameOver();
    }

    modal.classList.remove('hidden');
    this.updateHUD(true);
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

  private updateHUD(force: boolean = false) {
    const now = performance.now();
    if (!force && now - this.lastHUDUpdateTime < 60) {
      return;
    }
    this.lastHUDUpdateTime = now;

    const pScore = this.engine.state.score;
    const oScore = this.opponentScore;

    if (this.badgePlayerEl && pScore !== this.cachedPlayerScore) {
      this.cachedPlayerScore = pScore;
      this.badgePlayerEl.textContent = `${pScore}/${TOTAL_COLORS}`;
    }

    if (this.badgeOppEl && oScore !== this.cachedOppScore) {
      this.cachedOppScore = oScore;
      this.badgeOppEl.textContent = `${oScore}/${TOTAL_COLORS}`;
    }

    const scoreStr = `SCORE: ${this.playerMatchWins} - ${this.opponentMatchWins}`;
    if (this.scoreTrackerEl && scoreStr !== this.cachedScoreText) {
      this.cachedScoreText = scoreStr;
      this.scoreTrackerEl.textContent = scoreStr;
    }

    if (this.statusTextEl && this.hintTextEl && (this.enemyToastTimeout === null || this.phase === 'MATCH_OVER')) {
      let newStatus = '';
      let newHint = '';

      if (this.phase === 'COUNTDOWN') {
        newStatus = 'GET READY!';
        newHint = `Match starts in ${this.countdown}...`;
      } else if (this.phase === 'PLAYING') {
        if (pScore > oScore) {
          newStatus = 'YOU ARE LEADING! 🔥';
          newHint = `Only ${TOTAL_COLORS - pScore} left to clear!`;
        } else if (pScore < oScore) {
          newStatus = 'OPPONENT LEADING! ⚡';
          newHint = 'Hurry up & sort faster!';
        } else {
          newStatus = 'TIED BATTLE! ⚔️';
          newHint = 'Pour 3 units into the bowl!';
        }
      } else if (this.phase === 'MATCH_OVER') {
        const didIWin = pScore >= TOTAL_COLORS || (!this.opponentWon && this.engine.state.isWon);
        newStatus = didIWin ? 'VICTORY!' : 'DEFEAT!';
        newHint = didIWin ? 'You sorted all 10 colors!' : `${this.opponentName} sorted first!`;
      }

      if (newStatus !== this.cachedStatusText) {
        this.cachedStatusText = newStatus;
        this.statusTextEl.textContent = newStatus;
      }
      if (newHint !== this.cachedHintText) {
        this.cachedHintText = newHint;
        this.hintTextEl.textContent = newHint;
      }
    }
  }

  public render() {
    const isDark = this.currentTheme === 'dark';

    // 1. Update HUD
    this.updateHUD();

    // 2. Update 10-Color Capsule Ribbon (Shows circle and colored text)
    if (this.colorRibbonEl) {
      this.colorRibbonEl.innerHTML = WATER_COLORS.map(color => {
        const isDone = this.engine.state.completedColors.includes(color.id);
        return `
          <div class="flex-1 flex flex-col items-center justify-center group cursor-default" title="${color.name}">
            <div class="w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center shadow-sm transition-all duration-200 relative border ${isDone ? 'ring-2 ring-amber-400 scale-110 shadow-amber-400/50 border-amber-300' : 'border-black/15 dark:border-white/20'}"
                 style="background: linear-gradient(135deg, ${color.gradient[0]}, ${color.gradient[1]}); min-width: 20px; min-height: 20px;">
              ${isDone ? '<span class="text-[10px] leading-none drop-shadow">⭐</span>' : ''}
            </div>
            <span class="text-[8px] sm:text-[9px] font-black mt-0.5 tracking-tight text-center truncate max-w-full"
                  style="color: ${color.hex};">
              ${color.name.split(' ')[0]}
            </span>
          </div>
        `;
      }).join('');
    }

    // 3. Update Central Horizontal Mixing Bowl
    if (this.reservoirEl) {
      const res = this.engine.state.reservoir;
      const colorDef = this.getColorDef(res.color);
      const percent = (res.count / res.maxCapacity) * 100;

      this.reservoirEl.innerHTML = `
        <div id="water-reservoir-card" 
             class="relative w-64 xs:w-72 sm:w-80 h-16 sm:h-18 border-2 cursor-pointer transition-all duration-200 flex flex-col items-center justify-between shadow-lg overflow-hidden group ${res.color ? 'border-blue-400 shadow-blue-500/25 ring-2 ring-blue-400/40' : (isDark ? 'bg-white/[0.03] border-white/20 shadow-black/40' : 'bg-black/[0.02] border-gray-400 shadow-gray-200')}"
             style="border-bottom-left-radius: 36px; border-bottom-right-radius: 36px;">
          
          <!-- Top Wide Glass Bowl Rim -->
          <div class="absolute -top-1.5 inset-x-3 h-3 rounded-full border-2 z-30 transition-all ${res.color ? 'border-blue-400 bg-blue-500/30' : (isDark ? 'border-white/35 bg-white/10' : 'border-gray-400 bg-gray-200')}"></div>

          <!-- Glass Reflection Streaks -->
          <div class="absolute left-2.5 top-1.5 bottom-2.5 w-1 bg-white/20 rounded-full pointer-events-none z-20"></div>
          <div class="absolute right-2.5 top-1.5 bottom-2.5 w-1 bg-white/10 rounded-full pointer-events-none z-20"></div>

          <!-- Inner Liquid Basin (Gravity settles at rounded bowl bottom) -->
          <div class="absolute inset-x-1.5 bottom-1 top-1.5 flex flex-col justify-end items-center z-10 overflow-hidden" 
               style="border-bottom-left-radius: 32px; border-bottom-right-radius: 32px;">
            ${res.color && res.count > 0 ? (() => {
              const bowlBorder = res.color === 'silver' ? 'border: 1.5px solid rgba(100,116,139,0.5);' : (res.color === 'black' ? 'border: 1.5px solid rgba(148,163,184,0.35);' : '');
              return `
              <div class="w-full transition-all duration-300 relative overflow-hidden shadow-inner rounded-b-[30px]" 
                   style="height: ${percent}%; background: linear-gradient(180deg, ${colorDef?.gradient[0] || '#3b82f6'}, ${colorDef?.gradient[1] || '#1d4ed8'}); ${bowlBorder}">
                <!-- Gloss highlight wave across surface -->
                <div class="w-full h-1.5 bg-white/35 rounded-t-full"></div>
                <!-- Shimmer animation overlay -->
                <div class="absolute inset-0 liquid-shimmer pointer-events-none"></div>
                <!-- Rising bubbles -->
                <div class="absolute top-1 left-8 w-1.5 h-1.5 rounded-full bg-white/40 animate-ping"></div>
                <div class="absolute top-1.5 right-12 w-2 h-2 rounded-full bg-white/30 animate-pulse"></div>
                <div class="absolute bottom-1.5 left-24 w-1 h-1 rounded-full bg-white/30"></div>
              </div>
              `;
            })() : ''}
          </div>

          <!-- Horizontal 3-Slot Volume Markers & Labels -->
          <div class="absolute inset-x-6 top-2.5 flex items-center justify-between pointer-events-none z-20">
            <div class="flex items-center space-x-2">
              ${[1, 2, 3].map(slot => {
                const isFilled = res.count >= slot;
                return `
                  <div class="px-2 py-0.5 rounded-full text-[8px] font-mono font-black border transition-all ${isFilled ? 'bg-white text-gray-900 border-white shadow-sm scale-105' : (isDark ? 'bg-black/30 border-white/20 text-gray-400' : 'bg-white/70 border-gray-400 text-gray-500')}">
                    ${slot}/3
                  </div>
                `;
              }).join('')}
            </div>
            <span class="text-[8px] font-mono font-bold ${isDark ? 'text-gray-400' : 'text-gray-500'}">3 TO CLEAR</span>
          </div>

          <!-- Center/Bottom Status Badge -->
          <div class="z-20 w-full text-center mt-auto pb-1 pointer-events-none">
            ${res.color ? `
              <span class="px-3 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase text-white shadow-md inline-flex items-center space-x-1 drop-shadow" style="background: ${colorDef?.hex};">
                <span>${colorDef?.name}: ${res.count}/${res.maxCapacity}</span>
              </span>
            ` : `
              <span class="text-[9px] sm:text-[10px] font-bold text-gray-400">
                ${this.selectedTubeIndex !== null ? 'Tap to deposit into bowl' : '🥣 Empty Mixing Bowl (Tap tube to start)'}
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
          <div class="flex flex-col items-center flex-1">
            <div id="water-tube-${index}" 
                 data-index="${index}"
                 class="water-tube-item relative w-[46px] xs:w-[50px] sm:w-[58px] h-[116px] sm:h-[136px] border-2 border-t-0 p-0.5 cursor-pointer transition-transform duration-200 flex flex-col justify-end items-center shadow-md group ${isSelected ? '-translate-y-3.5 shadow-blue-500/40 border-blue-400 ring-2 ring-blue-400 scale-105' : 'hover:-translate-y-1'} ${isDark ? 'bg-white/[0.03] border-white/20 shadow-black/40' : 'bg-black/[0.02] border-gray-400 shadow-gray-200'}"
                 style="border-bottom-left-radius: 23px; border-bottom-right-radius: 23px;">
              
              <!-- Glass Rim Ring at Top -->
              <div class="absolute -top-1.5 inset-x-[-2px] h-3 rounded-full border-2 z-30 transition-all ${isSelected ? 'border-blue-400 bg-blue-500/30' : (isDark ? 'border-white/35 bg-white/10' : 'border-gray-400 bg-gray-200')}"></div>

              <!-- Glass Reflection Streak -->
              <div class="absolute left-1 top-1.5 bottom-3 w-1 bg-white/20 rounded-full pointer-events-none z-20"></div>

              <!-- Liquid & Slot Stack Container (Gravity: liquids settle at bottom!) -->
              <div class="absolute inset-x-1 bottom-1 top-2 flex flex-col justify-end items-center z-10 overflow-hidden" 
                   style="border-bottom-left-radius: 19px; border-bottom-right-radius: 19px;">
                
                <!-- Empty buffer slots (at the TOP of the tube!) -->
                ${Array.from({ length: TUBE_CAPACITY - tube.length }).map(() => `
                  <div class="w-full flex-1 flex items-center justify-center opacity-20 pointer-events-none">
                    <div class="w-2.5 h-0.5 bg-gray-400 rounded-full"></div>
                  </div>
                `).join('')}

                <!-- Liquid Segments (at the BOTTOM of the tube by gravity!) -->
                ${tube.slice().reverse().map((colorId, revIdx) => {
                  const origIdx = tube.length - 1 - revIdx;
                  const c = this.getColorDef(colorId);
                  const isTop = origIdx === tube.length - 1;
                  const isBottom = origIdx === 0;
                  const borderStyle = colorId === 'silver' ? 'border: 1.5px solid rgba(100,116,139,0.5);' : (colorId === 'black' ? 'border: 1.5px solid rgba(148,163,184,0.35);' : '');
                  return `
                    <div class="w-full flex-1 rounded-sm transition-all duration-200 relative overflow-hidden shadow-inner ${isTop ? 'rounded-t-md' : ''} ${isBottom ? 'rounded-b-[18px]' : ''}"
                         style="background: linear-gradient(180deg, ${c?.gradient[0] || '#999'}, ${c?.gradient[1] || '#666'}); ${borderStyle}">
                      ${isTop ? `
                        <!-- Meniscus Curve on top liquid surface -->
                        <div class="w-full h-1 bg-white/35 rounded-t-full"></div>
                      ` : ''}
                      <!-- Shimmer animation overlay -->
                      <div class="absolute inset-0 liquid-shimmer pointer-events-none"></div>
                      <!-- Subtle liquid shine / bubbles -->
                      <div class="absolute top-1 right-1.5 w-1 h-1 rounded-full bg-white/30"></div>
                      <div class="absolute bottom-1.5 left-1.5 w-0.5 h-0.5 rounded-full bg-white/30"></div>
                    </div>
                  `;
                }).join('')}
              </div>

              <!-- Graduation tick marks on outer glass -->
              <div class="absolute inset-y-2.5 right-1 flex flex-col justify-between py-0.5 text-[7px] font-mono text-gray-400/40 pointer-events-none select-none z-20">
                <span>-</span>
                <span>-</span>
                <span>-</span>
              </div>
            </div>
          </div>
        `;
      };

      const row1Tubes = [0, 1, 2, 3, 4].map(renderTube).join('');
      const row2Tubes = [5, 6, 7, 8, 9].map(renderTube).join('');

      this.tubesContainer.innerHTML = `
        <!-- Rack Row 1 (Tubes 1 - 5) -->
        <div class="w-full flex items-center justify-around px-0.5 sm:px-1">
          ${row1Tubes}
        </div>
        <!-- Rack Row 2 (Tubes 6 - 10) -->
        <div class="w-full flex items-center justify-around px-0.5 sm:px-1 pt-0.5 sm:pt-1">
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
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.enemyToastTimeout !== null) {
      clearTimeout(this.enemyToastTimeout);
      this.enemyToastTimeout = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.container.innerHTML = '';
  }
}
