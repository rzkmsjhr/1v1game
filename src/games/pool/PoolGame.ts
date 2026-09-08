import confetti from 'canvas-confetti';
import { GameInstance, GameSession, AppTheme } from '../types';
import type { NetworkMessage } from '../../network/webrtc-peer';
import { sounds } from '../../engine/sound';
import { TABLE_WIDTH, TABLE_HEIGHT, BALL_DEFS, HEAD_STRING_X } from './engine/pool-constants';
import { PoolEngine, GameVariant, PlayerId } from './engine/pool-engine';
import { PoolRenderer } from './renderers/PoolRenderer';
import { PoolAI } from './ai/pool-ai';

function getPoolBallIconSVG(
  variant: GameVariant,
  group: 'solid' | 'stripe' | 'open' | null,
  roleColor: string,
  targetBallNum?: number,
  clipId: string = 'clip-ball'
): string {
  if (variant === '9ball' && targetBallNum !== undefined && targetBallNum >= 1 && targetBallNum <= 9) {
    const isStripe = targetBallNum === 9;
    const color = BALL_DEFS[targetBallNum]?.color || '#eab308';
    if (isStripe) {
      return `<svg viewBox="0 0 24 24" class="w-4 h-4 sm:w-5 sm:h-5 shrink-0 drop-shadow" title="Target Ball #${targetBallNum}">
        <defs>
          <clipPath id="${clipId}"><circle cx="12" cy="12" r="10.5" /></clipPath>
          <radialGradient id="${clipId}-base" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stop-color="#ffffff" />
            <stop offset="65%" stop-color="#f1f5f9" />
            <stop offset="100%" stop-color="#cbd5e1" />
          </radialGradient>
        </defs>
        <circle cx="12" cy="12" r="10.5" fill="url(#${clipId}-base)" stroke="rgba(0,0,0,0.28)" stroke-width="0.85" />
        <rect x="0" y="7" width="24" height="10" fill="${color}" clip-path="url(#${clipId})" />
        <circle cx="12" cy="12" r="4.8" fill="#ffffff" stroke="rgba(0,0,0,0.15)" stroke-width="0.5" />
        <text x="12" y="12.5" font-size="6.5" font-weight="900" font-family="'Plus Jakarta Sans', system-ui, sans-serif" text-anchor="middle" dominant-baseline="central" fill="#0f172a">${targetBallNum}</text>
        <ellipse cx="8.5" cy="7" rx="4" ry="2.2" fill="#ffffff" opacity="0.45" transform="rotate(-25 8.5 7)" />
      </svg>`;
    } else {
      const textColor = targetBallNum === 8 ? '#ffffff' : '#0f172a';
      return `<svg viewBox="0 0 24 24" class="w-4 h-4 sm:w-5 sm:h-5 shrink-0 drop-shadow" title="Target Ball #${targetBallNum}">
        <circle cx="12" cy="12" r="10.5" fill="${color}" stroke="rgba(0,0,0,0.22)" stroke-width="0.85" />
        <circle cx="12" cy="12" r="4.8" fill="#ffffff" stroke="rgba(0,0,0,0.12)" stroke-width="0.5" />
        <text x="12" y="12.5" font-size="6.5" font-weight="900" font-family="'Plus Jakarta Sans', system-ui, sans-serif" text-anchor="middle" dominant-baseline="central" fill="${textColor}">${targetBallNum}</text>
        <ellipse cx="8.5" cy="7" rx="4" ry="2.2" fill="#ffffff" opacity="0.45" transform="rotate(-25 8.5 7)" />
      </svg>`;
    }
  }

  if (group === 'solid') {
    return `<svg viewBox="0 0 24 24" class="w-4 h-4 sm:w-5 sm:h-5 shrink-0 drop-shadow" title="Solid Ball">
      <circle cx="12" cy="12" r="10.5" fill="${roleColor}" stroke="rgba(0,0,0,0.22)" stroke-width="0.85" />
      <circle cx="12" cy="12" r="4.8" fill="#ffffff" stroke="rgba(0,0,0,0.12)" stroke-width="0.5" />
      <circle cx="12" cy="12" r="2.6" fill="${roleColor}" />
      <ellipse cx="8.5" cy="7" rx="4" ry="2.2" fill="#ffffff" opacity="0.45" transform="rotate(-25 8.5 7)" />
    </svg>`;
  } else if (group === 'stripe') {
    return `<svg viewBox="0 0 24 24" class="w-4 h-4 sm:w-5 sm:h-5 shrink-0 drop-shadow" title="Striped Ball">
      <defs>
        <clipPath id="${clipId}"><circle cx="12" cy="12" r="10.5" /></clipPath>
        <radialGradient id="${clipId}-base" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#ffffff" />
          <stop offset="65%" stop-color="#f1f5f9" />
          <stop offset="100%" stop-color="#cbd5e1" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10.5" fill="url(#${clipId}-base)" stroke="rgba(0,0,0,0.28)" stroke-width="0.85" />
      <rect x="0" y="7" width="24" height="10" fill="${roleColor}" clip-path="url(#${clipId})" />
      <circle cx="12" cy="12" r="4.8" fill="#ffffff" stroke="rgba(0,0,0,0.15)" stroke-width="0.5" />
      <rect x="9.2" y="10.8" width="5.6" height="2.4" rx="1.2" fill="${roleColor}" />
      <ellipse cx="8.5" cy="7" rx="4" ry="2.2" fill="#ffffff" opacity="0.45" transform="rotate(-25 8.5 7)" />
    </svg>`;
  } else {
    // Open table / lag: Split solid/stripe ball
    return `<svg viewBox="0 0 24 24" class="w-4 h-4 sm:w-5 sm:h-5 shrink-0 drop-shadow opacity-90" title="Open Table">
      <defs>
        <clipPath id="${clipId}"><circle cx="12" cy="12" r="10.5" /></clipPath>
        <radialGradient id="${clipId}-base" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#ffffff" />
          <stop offset="65%" stop-color="#f1f5f9" />
          <stop offset="100%" stop-color="#cbd5e1" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10.5" fill="url(#${clipId}-base)" stroke="rgba(0,0,0,0.28)" stroke-width="0.85" />
      <path d="M 12,1.5 A 10.5,10.5 0 0,0 12,22.5 Z" fill="${roleColor}" />
      <rect x="12" y="7" width="12" height="10" fill="${roleColor}" clip-path="url(#${clipId})" />
      <circle cx="12" cy="12" r="4.2" fill="#ffffff" stroke="rgba(0,0,0,0.12)" stroke-width="0.5" />
      <ellipse cx="8.5" cy="7" rx="3.5" ry="1.8" fill="#ffffff" opacity="0.45" transform="rotate(-25 8.5 7)" />
    </svg>`;
  }
}

export class PoolGame implements GameInstance {
  private container: HTMLElement;
  private session: GameSession;
  private currentTheme: AppTheme;

  private engine: PoolEngine;
  private renderer!: PoolRenderer;
  private ai?: PoolAI;

  private canvas!: HTMLCanvasElement;
  private animationFrameId: number | null = null;
  private isRunning: boolean = false;

  // Aiming & Controls State
  private cueAngle: number = 0;
  private cuePower: number = 0.45; // 0.05 to 1.0
  private humanCuePower: number = 0.45;
  private isAiming: boolean = false;
  private isDraggingCueStick: boolean = false;
  private isDraggingCueBall: boolean = false;
  private isAITurnProcessing: boolean = false;
  private wasSimulating: boolean = false;
  private handleWindowPointerMove: ((e: PointerEvent) => void) | null = null;
  private handleWindowPointerUp: ((e: PointerEvent) => void) | null = null;
  private lastMoveBroadcastTime: number = 0;
  private opponentCue: { angle: number; power: number } | null = null;
  private lastAimBroadcastTime: number = 0;

  // Mobile & Auto-Rotation State
  private isMobileView: boolean = false;
  private isVirtualLandscape: boolean = false;
  private resizeObserver: ResizeObserver | null = null;
  private opponentName: string = 'Opponent';

  constructor(container: HTMLElement, session: GameSession) {
    this.container = container;
    this.session = session;
    this.currentTheme = session.theme;

    const variant: GameVariant = session.gameVariant || '8ball';
    this.engine = new PoolEngine(variant);

    if (session.mode === 'ai') {
      this.ai = new PoolAI(session.aiDifficulty || 'medium');
      this.opponentName = `AI (${(session.aiDifficulty || 'medium').toUpperCase()})`;
    } else {
      this.opponentName = session.peer ? 'Player 2' : 'Opponent';
    }

    this.checkMobileAndOrientation();
    this.render();
    this.setupNetwork();

    const matchParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('match') : null;
    if (matchParam === '1') {
      this.engine.setupMatchTable('player');
    }

    this.startLoop();

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  public destroy() {
    this.isRunning = false;
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    if (this.handleWindowPointerMove) {
      window.removeEventListener('pointermove', this.handleWindowPointerMove);
      this.handleWindowPointerMove = null;
    }
    if (this.handleWindowPointerUp) {
      window.removeEventListener('pointerup', this.handleWindowPointerUp);
      window.removeEventListener('pointercancel', this.handleWindowPointerUp);
      this.handleWindowPointerUp = null;
    }
    this.container.style.height = '';
    this.container.style.maxHeight = '';
    this.container.style.padding = '';
    this.container.style.margin = '';
    this.container.style.overflow = '';
    this.container.innerHTML = '';
  }

  public setTheme(theme: AppTheme) {
    this.currentTheme = theme;
    const wrapper = document.getElementById('pool-outer-wrapper');
    if (wrapper) {
      if (theme === 'dark') {
        wrapper.classList.remove('bg-gray-50', 'text-gray-900');
        wrapper.classList.add('bg-gray-950', 'text-white');
      } else {
        wrapper.classList.remove('bg-gray-950', 'text-white');
        wrapper.classList.add('bg-gray-50', 'text-gray-900');
      }
    }
  }

  private checkMobileAndOrientation() {
    if (typeof window === 'undefined') return;
    this.isMobileView = window.innerWidth < 768;

    if (window.innerWidth >= window.innerHeight) {
      // Physical landscape: show unrotated horizontal table
      this.isVirtualLandscape = false;
    } else if (this.isMobileView) {
      // Portrait on mobile: default to vertical table filling screen height
      this.isVirtualLandscape = true;
    }
  }

  private handleResize = () => {
    if (this.container && typeof window !== 'undefined') {
      this.container.style.height = `${window.innerHeight}px`;
      this.container.style.maxHeight = `${window.innerHeight}px`;
    }
    this.checkMobileAndOrientation();
    this.updateContainerOrientation();
  };

  private handleBeforeUnload = () => {
    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      this.session.peer.sendMessage({ type: 'PLAYER_LEAVE' });
    }
  };

  private setupNetwork() {
    if (!this.session.peer) return;

    const origOnMessage = this.session.peer.events?.onMessage;
    this.session.peer.events.onMessage = (msg: NetworkMessage) => {
      origOnMessage?.(msg);
      this.handleNetworkMessage(msg);
    };
  }

  private handleNetworkMessage(msg: any) {
    switch (msg.type) {
      case 'PLAYER_LEAVE':
        this.showGameOverModal(true, 'Opponent forfeited the match.');
        break;
      case 'POOL_LAG_SHOT':
        this.engine.shootLagBall(false, msg.power);
        sounds.playCueHit(msg.power);
        break;
      case 'POOL_DECIDE_BREAK':
        this.engine.setupMatchTable(msg.breaker);
        this.updateHUD();
        break;
      case 'POOL_AIM_MOVE':
        this.opponentCue = { angle: msg.angle, power: msg.power };
        break;
      case 'POOL_SYNC_TABLE':
        this.opponentCue = null;
        this.engine.syncTableState(msg);
        this.updateHUD();
        break;
      case 'POOL_SHOT':
        this.opponentCue = null;
        this.engine.shoot(msg.angle, msg.power);
        sounds.playCueHit(msg.power);
        break;
      case 'POOL_MOVE_BALL':
        this.engine.placeCueBall(msg.x, msg.y);
        break;
      case 'POOL_PLACE_BALL':
        this.engine.placeCueBall(msg.x, msg.y);
        this.engine.confirmBallInHand();
        this.updateHUD();
        break;
      case 'REMATCH_REQUEST':
        this.showRematchOffer();
        break;
      case 'REMATCH_ACCEPT':
        this.hideGameOverModal();
        this.isLagModalShown = false;
        this.isGameOverModalShown = false;
        this.isAITurnProcessing = false;
        this.engine.setupLagging();
        this.updateHUD();
        break;
    }
  }

  // -------------------------------------------------------------
  // RENDERING & DOM STRUCTURE
  // -------------------------------------------------------------
  private render() {
    const isDark = this.currentTheme === 'dark';

    // Lock container to inner window bounds to prevent address bar overflow/clipping
    this.container.className = 'w-full h-full flex flex-col items-center justify-start p-0 m-0 overflow-hidden';
    this.container.style.height = `${window.innerHeight}px`;
    this.container.style.maxHeight = `${window.innerHeight}px`;
    this.container.style.padding = '0';
    this.container.style.margin = '0';
    this.container.style.overflow = 'hidden';

    this.container.innerHTML = `
      <div id="pool-outer-wrapper" class="w-full h-full max-h-full flex flex-col items-center justify-between p-1 select-none overflow-hidden ${isDark ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900'}">
        
        <!-- Top Information & Controls (2 rows, 68px) -->
        <div class="w-full max-w-2xl flex flex-col shrink-0 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'} pb-1 gap-1">
          <!-- Row 1: Top Navigation Bar -->
          <div class="w-full flex items-center justify-between px-2 py-0.5 text-xs">
            <button id="btn-pool-exit" class="ps-btn-secondary px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-0.5 cursor-pointer active:scale-95" title="Exit to Game Hub">
              <span>← Exit</span>
            </button>
            <span class="text-[11px] font-bold text-gray-400 font-mono tracking-wider uppercase">${this.engine.variant === '9ball' ? '9-BALL POOL' : '8-BALL POOL'}</span>
          </div>

          <!-- Row 2: Match Information & Players Score Strip -->
          <div class="w-full flex items-center justify-between px-2 pt-0.5 text-xs gap-1">
            <!-- Player Profile (YOU) -->
            <div class="flex items-center space-x-1.5 sm:space-x-2 min-w-[75px] sm:min-w-[110px]">
              <div id="icon-player-ball" class="w-6 h-6 sm:w-7 sm:h-7 shrink-0 rounded-full bg-slate-200/90 dark:bg-slate-800/90 border border-slate-300/80 dark:border-slate-700/80 flex items-center justify-center shadow-xs"></div>
              <div class="flex flex-col">
                <span class="text-[10px] sm:text-xs font-bold text-blue-600 dark:text-blue-400 leading-tight">YOU</span>
                <div class="flex items-center space-x-1">
                  <span id="badge-player-group" class="px-1.5 py-0.2 rounded bg-blue-600/15 dark:bg-blue-600/20 text-blue-700 dark:text-blue-300 font-mono text-[10px] sm:text-xs font-extrabold">OPEN</span>
                </div>
              </div>
            </div>

            <!-- Turn Banner (Center) -->
            <div id="pool-status-banner" class="flex-1 max-w-[170px] sm:max-w-[280px] md:max-w-[380px] flex flex-col items-center px-2 sm:px-4 py-0.5 rounded-xl bg-emerald-600/15 border border-emerald-500/30 text-center mx-auto transition-all">
              <div id="pool-status-text" class="text-[11px] sm:text-xs md:text-sm font-black tracking-wide text-emerald-600 dark:text-emerald-400 uppercase truncate w-full">YOUR TURN</div>
              <div id="pool-hint-text" class="text-[9px] sm:text-[11px] md:text-xs font-medium text-gray-500 dark:text-gray-400 truncate w-full">Open table: Sink any ball</div>
            </div>

            <!-- Opponent Profile -->
            <div class="flex items-center justify-end space-x-1.5 sm:space-x-2 min-w-[75px] sm:min-w-[110px] text-right">
              <div class="flex flex-col items-end">
                <span class="text-[10px] sm:text-xs font-bold text-rose-600 dark:text-rose-400 leading-tight truncate max-w-[70px] sm:max-w-[130px]">${this.opponentName}</span>
                <div class="flex items-center space-x-1">
                  <span id="badge-opponent-group" class="px-1.5 py-0.2 rounded bg-rose-600/15 dark:bg-rose-600/20 text-rose-700 dark:text-rose-300 font-mono text-[10px] sm:text-xs font-extrabold">OPEN</span>
                </div>
              </div>
              <div id="icon-opponent-ball" class="w-6 h-6 sm:w-7 sm:h-7 shrink-0 rounded-full bg-slate-200/90 dark:bg-slate-800/90 border border-slate-300/80 dark:border-slate-700/80 flex items-center justify-center shadow-xs"></div>
            </div>
          </div>
        </div>

        <!-- Billiard Table Arena Viewport -->
        <div id="pool-table-viewport" class="relative flex-1 w-full min-h-0 overflow-hidden my-auto p-0.5 select-none" style="touch-action: none;">
          <!-- Absolutely centered, unconstrained 872x472 container immune to flexbox squashing -->
          <div id="pool-canvas-container" class="rounded-3xl overflow-hidden shadow-2xl border-4 border-[#1c130d] bg-[#111827]" style="position: absolute; width: ${TABLE_WIDTH}px; height: ${TABLE_HEIGHT}px; left: 50%; top: 50%; margin-left: -${TABLE_WIDTH / 2}px; margin-top: -${TABLE_HEIGHT / 2}px; transform-origin: center center; touch-action: none; flex-shrink: 0;">
            <canvas id="canvas-pool" width="${TABLE_WIDTH}" height="${TABLE_HEIGHT}" class="block cursor-crosshair" style="width: ${TABLE_WIDTH}px; height: ${TABLE_HEIGHT}px; touch-action: none; display: block;"></canvas>
          </div>

          <!-- Vertical Power Gauge on Left of Viewport (Positioned at 26% height, cleanly between top-left and middle-left holes) -->
          <div id="pool-power-panel" class="absolute left-0.5 sm:left-2 z-20 flex flex-col items-center ps-card p-1 sm:p-1.5 rounded-2xl shadow-2xl backdrop-blur-md border border-white/10 select-none bg-gray-950/92" style="top: 26%; transform: translateY(-50%); touch-action: none;">
            <div class="flex items-center justify-between w-full mb-0.5 px-0.5">
              <span class="text-[9px] sm:text-[10px] font-black text-emerald-400 uppercase tracking-wider">PWR</span>
              <button id="btn-pwr-panel-close" class="w-5 h-5 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-black text-xs flex items-center justify-center active:scale-90 shadow-md transition-all ml-1 cursor-pointer" title="Close / Minimize power meter">✕</button>
            </div>

            <div id="pool-power-panel-body" class="flex flex-col items-center">
              <div id="hud-power-text" class="text-xs sm:text-sm font-black font-mono text-emerald-400 mb-1">${Math.round(this.cuePower * 100)}%</div>

              <!-- Vertical Track (touch & drag enabled) -->
              <div id="track-power-vertical" class="relative w-6 sm:w-7 h-28 sm:h-36 rounded-xl bg-gray-900 border border-gray-700/80 cursor-pointer overflow-hidden flex flex-col justify-end select-none" style="touch-action: none;" title="Drag or tap to set shot power">
                <div id="fill-power-vertical" class="w-full rounded-b-xl bg-gradient-to-t from-emerald-500 via-yellow-400 to-rose-500 pointer-events-none transition-all duration-75" style="height: ${Math.round(this.cuePower * 100)}%;"></div>
                <div id="knob-power-vertical" class="absolute left-0 w-full h-2.5 bg-white rounded-full shadow-md border border-gray-400 pointer-events-none -translate-y-1/2" style="bottom: ${Math.round(this.cuePower * 100)}%;"></div>
              </div>

              <!-- Quick Presets -->
              <div class="grid grid-cols-2 gap-1 mt-1 w-full">
                <button id="btn-pwr-25" class="px-1 py-0.5 rounded text-[9px] font-bold ps-btn-secondary hover:text-emerald-400 active:scale-90 cursor-pointer">25%</button>
                <button id="btn-pwr-50" class="px-1 py-0.5 rounded text-[9px] font-bold ps-btn-secondary hover:text-yellow-400 active:scale-90 cursor-pointer">50%</button>
                <button id="btn-pwr-75" class="px-1 py-0.5 rounded text-[9px] font-bold ps-btn-secondary hover:text-orange-400 active:scale-90 cursor-pointer">75%</button>
                <button id="btn-pwr-max" class="px-1 py-0.5 rounded text-[9px] font-bold ps-btn-secondary hover:text-rose-400 active:scale-90 cursor-pointer">MAX</button>
              </div>
            </div>
          </div>

          <!-- Collapsed Mini Power Badge (Positioned at 26% height, between top and middle holes) -->
          <div id="pool-power-panel-collapsed" class="hidden absolute left-0.5 sm:left-2 z-20 select-none" style="top: 26%; transform: translateY(-50%); touch-action: none;">
            <button id="btn-pwr-panel-expand" class="flex items-center space-x-1 px-2 py-1 rounded-xl bg-gray-950/95 border border-emerald-500/60 shadow-2xl text-emerald-400 font-mono text-xs font-black active:scale-95 cursor-pointer" title="Tap to expand power meter">
              <span>⚡</span>
              <span id="hud-power-text-mini">${Math.round(this.cuePower * 100)}%</span>
            </button>
          </div>
        </div>

        <!-- Shot Controls Bar (Bottom) -->
        <div class="w-full max-w-md px-2 py-1 select-none shrink-0 pb-[calc(env(safe-area-inset-bottom,0px)+4px)]">
          <div class="flex items-center justify-between gap-3 w-full">
            <!-- Power Stepper & Dialog Trigger -->
            <div class="flex items-center space-x-1 ps-card p-1 rounded-xl shrink-0">
              <button id="btn-power-minus" class="w-7 sm:w-8 h-7 sm:h-8 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-black text-sm flex items-center justify-center active:scale-90 select-none touch-manipulation cursor-pointer" title="Decrease power">−</button>
              <button id="btn-power-open-modal" class="px-2 sm:px-3 h-7 sm:h-8 rounded-lg bg-gray-800/80 hover:bg-gray-700 flex items-center space-x-1 active:scale-95 select-none touch-manipulation cursor-pointer" title="Open power options">
                <span class="text-[10px] text-gray-400 font-bold">PWR</span>
                <span id="text-power-bottom" class="text-xs sm:text-sm font-mono font-black text-emerald-400">${Math.round(this.cuePower * 100)}%</span>
                <span class="text-[9px] text-emerald-400">▲</span>
              </button>
              <button id="btn-power-plus" class="w-7 sm:w-8 h-7 sm:h-8 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-black text-sm flex items-center justify-center active:scale-90 select-none touch-manipulation cursor-pointer" title="Increase power">+</button>
            </div>

            <!-- Action Button (STRIKE) -->
            <button id="btn-action-shoot" class="flex-1 max-w-[150px] sm:max-w-[180px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-xs sm:text-sm active:scale-95 transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center space-x-1.5 select-none cursor-pointer">
              <span>⚡</span>
              <span id="btn-shoot-label" class="truncate">STRIKE</span>
            </button>
          </div>
        </div>

        <!-- Shot Power Settings Modal / Sheet -->
        <div id="modal-pool-power" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-3 select-none">
          <div id="modal-pool-power-card" class="ps-card rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-white/15 bg-gray-900 text-white">
            <div class="flex items-center justify-between mb-4 border-b border-gray-800 pb-2">
              <div class="flex items-center space-x-2">
                <span class="text-emerald-400 text-base">⚡</span>
                <span class="text-sm font-black tracking-wider uppercase">CUE SHOT POWER</span>
              </div>
              <button id="btn-close-power-modal" class="text-gray-400 hover:text-white px-2 py-1 rounded text-sm font-bold active:scale-95 cursor-pointer">✕</button>
            </div>

            <!-- Big Digital Readout & Gauge -->
            <div class="flex items-center justify-between space-x-4 mb-5 bg-gray-950/90 p-4 rounded-xl border border-gray-800">
              <div id="modal-power-text" class="text-4xl font-black font-mono text-emerald-400 min-w-[90px] text-center">${Math.round(this.cuePower * 100)}%</div>
              <div class="flex-1">
                <div class="w-full h-4 rounded-full bg-gray-800 overflow-hidden p-0.5 border border-gray-700">
                  <div id="modal-power-fill" class="h-full rounded-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-rose-500 transition-all duration-75" style="width: ${Math.round(this.cuePower * 100)}%;"></div>
                </div>
                <div class="flex justify-between text-[10px] font-mono text-gray-500 mt-1.5 px-0.5">
                  <span>SOFT</span>
                  <span>MED</span>
                  <span>MAX</span>
                </div>
              </div>
            </div>

            <!-- Full Width Touch Slider -->
            <div class="mb-5 px-1">
              <label for="slider-modal-power" class="block text-[11px] font-bold text-gray-400 mb-1.5 uppercase">Slide to Adjust</label>
              <input id="slider-modal-power" type="range" min="5" max="100" step="1" value="${Math.round(this.cuePower * 100)}" class="w-full accent-emerald-500 h-3 bg-gray-800 rounded-lg cursor-pointer" style="touch-action: pan-y;">
            </div>

            <!-- Quick Preset Chips -->
            <div class="mb-5">
              <span class="block text-[11px] font-bold text-gray-400 mb-1.5 uppercase">Quick Presets</span>
              <div class="grid grid-cols-5 gap-1.5">
                <button data-power="0.15" class="btn-preset-modal py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs font-black text-center text-emerald-300 border border-gray-700 active:scale-95 cursor-pointer">15%</button>
                <button data-power="0.35" class="btn-preset-modal py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs font-black text-center text-teal-300 border border-gray-700 active:scale-95 cursor-pointer">35%</button>
                <button data-power="0.55" class="btn-preset-modal py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs font-black text-center text-yellow-300 border border-gray-700 active:scale-95 cursor-pointer">55%</button>
                <button data-power="0.75" class="btn-preset-modal py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs font-black text-center text-orange-300 border border-gray-700 active:scale-95 cursor-pointer">75%</button>
                <button data-power="1.00" class="btn-preset-modal py-2 rounded-xl bg-rose-600/30 hover:bg-rose-600/50 text-xs font-black text-center text-rose-300 border border-rose-500/50 active:scale-95 cursor-pointer">MAX</button>
              </div>
            </div>

            <!-- Done Button -->
            <button id="btn-confirm-power-modal" class="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/30 active:scale-95 cursor-pointer">
              Done (Set Power)
            </button>
          </div>
        </div>

        <!-- Lag Result / Break Choice Modal -->
        <div id="modal-lag-choice" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div class="ps-card rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl border ${isDark ? 'border-gray-800' : 'border-gray-200'}">
            <div class="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-1">THE LAG RESULT</div>
            <h3 id="lag-modal-title" class="text-2xl font-extrabold mb-2 text-white">YOU WON THE LAG!</h3>
            <p id="lag-modal-desc" class="text-xs text-gray-400 mb-6 leading-relaxed">
              Your ball came to rest closer to the head rail. Choose who takes the break shot.
            </p>

            <div id="lag-choice-actions" class="space-y-2.5">
              <button id="btn-choice-break" class="ps-btn-primary w-full py-3 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/30 cursor-pointer">
                Break First (My Break)
              </button>
              <button id="btn-choice-pass" class="ps-btn-secondary w-full py-2.5 rounded-xl text-xs font-semibold text-gray-300 cursor-pointer">
                Pass Break to Opponent
              </button>
            </div>
          </div>
        </div>

        <!-- Game Over Modal -->
        <div id="modal-pool-gameover" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div class="ps-card rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl border ${isDark ? 'border-gray-800' : 'border-gray-200'}">
            <div id="pool-gameover-title" class="text-3xl font-extrabold mb-2">VICTORY!</div>
            <p id="pool-gameover-desc" class="text-sm text-gray-400 mb-6">Match concluded.</p>

            <div class="space-y-2.5">
              <button id="btn-pool-rematch" class="ps-btn-primary w-full py-3 rounded-xl text-sm font-semibold cursor-pointer">
                Play Again
              </button>
              <button id="btn-pool-exit-modal" class="w-full py-2 text-xs font-semibold text-gray-500 hover:text-gray-400 cursor-pointer">
                Back to Game Hub
              </button>
            </div>
          </div>
        </div>

      </div>
    `;

    this.canvas = document.getElementById('canvas-pool') as HTMLCanvasElement;
    this.renderer = new PoolRenderer(this.canvas);

    this.attachEventListeners();
    this.setupResizeObserver();
    this.updateContainerOrientation();
    this.updateHUD();
  }

  // -------------------------------------------------------------
  // MOBILE ORIENTATION MANAGEMENT & RESIZING
  // -------------------------------------------------------------
  private setupResizeObserver() {
    const viewport = document.getElementById('pool-table-viewport');
    if (viewport && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.updateContainerOrientation();
      });
      this.resizeObserver.observe(viewport);
    }
  }

  private updateContainerOrientation() {
    const viewport = document.getElementById('pool-table-viewport');
    const container = document.getElementById('pool-canvas-container');
    if (!viewport || !container) return;

    // Viewport dimensions (available visible space)
    const availW = Math.max(10, viewport.clientWidth - 2);
    const availH = Math.max(10, viewport.clientHeight - 2);

    if (availW <= 0 || availH <= 0) {
      requestAnimationFrame(() => this.updateContainerOrientation());
      return;
    }

    let scale = 1;
    if (this.isVirtualLandscape) {
      // Rotated 90 degrees:
      // Width on screen is TABLE_HEIGHT (472), height on screen is TABLE_WIDTH (872)
      scale = Math.min(availW / TABLE_HEIGHT, availH / TABLE_WIDTH);
      container.style.transform = `rotate(90deg) scale(${scale})`;
    } else {
      // Unrotated:
      // Width on screen is TABLE_WIDTH (872), height on screen is TABLE_HEIGHT (472)
      scale = Math.min(availW / TABLE_WIDTH, availH / TABLE_HEIGHT);
      container.style.transform = `scale(${scale})`;
    }

    if (this.renderer) {
      this.renderer.updateScale(scale);
    }
  }

  // Convert client touch/mouse coordinates to virtual table coordinates (872 x 472)
  private getTableCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();

    if (this.isVirtualLandscape) {
      // Rotated 90deg clockwise:
      // Local X runs from top to bottom (Y on screen)
      // Local Y runs from right to left (X on screen)
      const normX = (clientY - rect.top) / rect.height;
      const normY = (rect.right - clientX) / rect.width;
      return {
        x: Math.max(0, Math.min(TABLE_WIDTH, normX * TABLE_WIDTH)),
        y: Math.max(0, Math.min(TABLE_HEIGHT, normY * TABLE_HEIGHT))
      };
    }

    const normX = (clientX - rect.left) / rect.width;
    const normY = (clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(TABLE_WIDTH, normX * TABLE_WIDTH)),
      y: Math.max(0, Math.min(TABLE_HEIGHT, normY * TABLE_HEIGHT))
    };
  }

  // -------------------------------------------------------------
  // EVENT LISTENERS & INPUT
  // -------------------------------------------------------------
  private attachEventListeners() {
    // Exit button
    document.getElementById('btn-pool-exit')?.addEventListener('click', () => {
      if (this.session.mode === 'online' && this.session.peer?.isConnected) {
        this.session.peer.sendMessage({ type: 'PLAYER_LEAVE' });
      }
      this.session.onExit();
    });

    document.getElementById('btn-pool-exit-modal')?.addEventListener('click', () => {
      if (this.session.mode === 'online' && this.session.peer?.isConnected) {
        this.session.peer.sendMessage({ type: 'PLAYER_LEAVE' });
      }
      this.session.onExit();
    });

    // Rematch button
    document.getElementById('btn-pool-rematch')?.addEventListener('click', () => {
      if (this.session.mode === 'ai') {
        this.hideGameOverModal();
        this.isLagModalShown = false;
        this.isGameOverModalShown = false;
        this.isAITurnProcessing = false;
        this.engine.setupLagging();
        this.updateHUD();
      } else if (this.session.peer?.isConnected) {
        this.session.peer.sendMessage({ type: 'REMATCH_REQUEST' });
        const btn = document.getElementById('btn-pool-rematch');
        if (btn) btn.textContent = 'Waiting for Opponent...';
      }
    });

    // Shot Power Controls
    this.setupPowerControls();

    // Strike / Action Button
    document.getElementById('btn-action-shoot')?.addEventListener('click', () => {
      this.executeAction();
    });

    // Lag choice buttons
    document.getElementById('btn-choice-break')?.addEventListener('click', () => {
      this.chooseBreakOption('break');
    });

    document.getElementById('btn-choice-pass')?.addEventListener('click', () => {
      this.chooseBreakOption('pass');
    });

    // Canvas Pointer Aiming & Ball-In-Hand Dragging
    const onPointerDown = (e: PointerEvent) => {
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {}

      const coords = this.getTableCoords(e.clientX, e.clientY);
      const cue = this.engine.getCueBall();

      if (this.engine.phase === 'BALL_IN_HAND' && cue && this.isHumanTurn()) {
        const dist = Math.hypot(coords.x - cue.x, coords.y - cue.y);
        if (dist < cue.radius + 18) {
          this.isDraggingCueBall = true;
          return;
        }
        // If kitchen only, don't allow tapping outside the kitchen line
        if (this.engine.ballInHandKitchenOnly && coords.x > HEAD_STRING_X) {
          return;
        }
        // Allow tapping anywhere on felt inside legal zone to place cue ball
        const placed = this.engine.placeCueBall(coords.x, coords.y);
        if (placed) {
          this.isDraggingCueBall = true;
          const updatedCue = this.engine.getCueBall();
          if (updatedCue && this.session.mode === 'online' && this.session.peer?.isConnected) {
            this.session.peer.sendMessage({
              type: 'POOL_MOVE_BALL',
              x: updatedCue.x,
              y: updatedCue.y
            });
          }
          return;
        }
      }

      // If it's the break shot in PLAYING phase and the player hasn't shot yet,
      // tapping the cue ball allows readjusting its position in the kitchen
      if (
        this.engine.isBreakShot &&
        this.engine.phase === 'PLAYING' &&
        cue &&
        this.isHumanTurn() &&
        !this.engine.isSimulating
      ) {
        const dist = Math.hypot(coords.x - cue.x, coords.y - cue.y);
        if (dist < cue.radius + 18) {
          this.engine.phase = 'BALL_IN_HAND';
          this.isDraggingCueBall = true;
          this.updateHUD();
          return;
        }
      }

      if (this.isHumanTurn() && !this.engine.isSimulating) {
        this.isAiming = true;
        if (this.isPointerOnCueStick(coords)) {
          this.isDraggingCueStick = true;
          this.canvas.style.cursor = 'grabbing';
          this.updateAimFromStick(coords.x, coords.y);
        } else {
          this.isDraggingCueStick = false;
          this.canvas.style.cursor = 'crosshair';
          this.updateAimAngle(coords.x, coords.y);
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const coords = this.getTableCoords(e.clientX, e.clientY);

      if (this.isDraggingCueBall && this.engine.phase === 'BALL_IN_HAND' && this.isHumanTurn()) {
        this.engine.placeCueBall(coords.x, coords.y);
        const cue = this.engine.getCueBall();
        if (cue && this.session.mode === 'online' && this.session.peer?.isConnected) {
          const now = Date.now();
          if (now - this.lastMoveBroadcastTime > 40) {
            this.lastMoveBroadcastTime = now;
            this.session.peer.sendMessage({
              type: 'POOL_MOVE_BALL',
              x: cue.x,
              y: cue.y
            });
          }
        }
        return;
      }

      if (this.isAiming && this.isHumanTurn() && !this.engine.isSimulating) {
        if (this.isDraggingCueStick) {
          this.updateAimFromStick(coords.x, coords.y);
        } else {
          this.updateAimAngle(coords.x, coords.y);
        }
        return;
      }

      // Hover cursor feedback when not dragging
      if (this.isHumanTurn() && !this.engine.isSimulating && this.engine.phase !== 'BALL_IN_HAND') {
        if (this.isPointerOnCueStick(coords)) {
          this.canvas.style.cursor = 'grab';
        } else {
          this.canvas.style.cursor = 'crosshair';
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      try {
        if (this.canvas.hasPointerCapture(e.pointerId)) {
          this.canvas.releasePointerCapture(e.pointerId);
        }
      } catch {}

      if (this.isDraggingCueBall && this.session.mode === 'online' && this.session.peer?.isConnected) {
        const cue = this.engine.getCueBall();
        if (cue) {
          this.session.peer.sendMessage({
            type: 'POOL_MOVE_BALL',
            x: cue.x,
            y: cue.y
          });
        }
      }

      this.isAiming = false;
      this.isDraggingCueStick = false;
      this.isDraggingCueBall = false;
      this.canvas.style.cursor = 'crosshair';
    };

    this.handleWindowPointerMove = onPointerMove;
    this.handleWindowPointerUp = onPointerUp;

    this.canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  // -------------------------------------------------------------
  // SHOT POWER MANAGEMENT
  // -------------------------------------------------------------
  public setPower(power: number) {
    this.humanCuePower = Math.max(0.05, Math.min(1.0, power));
    this.cuePower = this.humanCuePower;
    const pct = Math.round(this.cuePower * 100);

    // 1. Vertical HUD Power readout and gauge
    const hudPowerText = document.getElementById('hud-power-text');
    const fillVertical = document.getElementById('fill-power-vertical');
    const knobVertical = document.getElementById('knob-power-vertical');
    if (hudPowerText) {
      hudPowerText.textContent = `${pct}%`;
      hudPowerText.className = `text-xs sm:text-sm font-black font-mono mb-1 ${
        pct < 40 ? 'text-emerald-400' : pct < 75 ? 'text-yellow-400' : 'text-rose-400'
      }`;
    }
    if (fillVertical) fillVertical.style.height = `${pct}%`;
    if (knobVertical) knobVertical.style.bottom = `${pct}%`;

    // 2. Bottom stepper power label & mini badge
    const textPowerBottom = document.getElementById('text-power-bottom');
    if (textPowerBottom) {
      textPowerBottom.textContent = `${pct}%`;
      textPowerBottom.className = `text-xs sm:text-sm font-mono font-black ${
        pct < 40 ? 'text-emerald-400' : pct < 75 ? 'text-yellow-400' : 'text-rose-400'
      }`;
    }
    const hudMini = document.getElementById('hud-power-text-mini');
    if (hudMini) hudMini.textContent = `${pct}%`;

    // 3. Power modal readout, progress fill, and slider input
    const modalPowerText = document.getElementById('modal-power-text');
    const modalPowerFill = document.getElementById('modal-power-fill');
    const sliderModal = document.getElementById('slider-modal-power') as HTMLInputElement | null;
    if (modalPowerText) {
      modalPowerText.textContent = `${pct}%`;
      modalPowerText.className = `text-4xl font-black font-mono min-w-[90px] text-center ${
        pct < 40 ? 'text-emerald-400' : pct < 75 ? 'text-yellow-400' : 'text-rose-400'
      }`;
    }
    if (modalPowerFill) modalPowerFill.style.width = `${pct}%`;
    if (sliderModal && parseFloat(sliderModal.value) !== pct) {
      sliderModal.value = `${pct}`;
    }
    this.broadcastAim();
  }

  private broadcastAim() {
    if (this.session.mode !== 'online' || !this.session.peer?.isConnected || !this.isHumanTurn()) return;
    const now = performance.now();
    if (now - this.lastAimBroadcastTime > 40) {
      this.lastAimBroadcastTime = now;
      this.session.peer.sendMessage({
        type: 'POOL_AIM_MOVE',
        angle: this.cueAngle,
        power: this.cuePower
      });
    }
  }

  private openPowerModal() {
    const modal = document.getElementById('modal-pool-power');
    if (modal) {
      modal.classList.remove('hidden');
      this.setPower(this.humanCuePower);
    }
  }

  private closePowerModal() {
    const modal = document.getElementById('modal-pool-power');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  private setupPowerControls() {
    // 1. Vertical Gauge on left of table (click & pointer drag)
    const track = document.getElementById('track-power-vertical');
    if (track) {
      const updateFromTrack = (e: PointerEvent) => {
        const rect = track.getBoundingClientRect();
        if (rect.height <= 0) return;
        const relY = e.clientY - rect.top;
        const ratio = 1 - (relY / rect.height);
        this.setPower(ratio);
      };

      track.addEventListener('pointerdown', (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        try { track.setPointerCapture(e.pointerId); } catch {}
        updateFromTrack(e);

        const onMove = (me: PointerEvent) => {
          me.preventDefault();
          updateFromTrack(me);
        };
        const onUp = (ue: PointerEvent) => {
          try { track.releasePointerCapture(ue.pointerId); } catch {}
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
      });
    }

    // 2. Vertical Panel Quick Presets
    document.getElementById('btn-pwr-25')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setPower(0.25);
    });
    document.getElementById('btn-pwr-50')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setPower(0.50);
    });
    document.getElementById('btn-pwr-75')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setPower(0.75);
    });
    document.getElementById('btn-pwr-max')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setPower(1.00);
    });

    // 3. Vertical Panel Close ('X') / Expand
    const powerPanel = document.getElementById('pool-power-panel');
    const powerCollapsed = document.getElementById('pool-power-panel-collapsed');

    document.getElementById('btn-pwr-panel-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      powerPanel?.classList.add('hidden');
      powerCollapsed?.classList.remove('hidden');
    });

    document.getElementById('btn-pwr-panel-expand')?.addEventListener('click', (e) => {
      e.stopPropagation();
      powerPanel?.classList.remove('hidden');
      powerCollapsed?.classList.add('hidden');
    });

    // 4. Bottom Bar Steppers
    document.getElementById('btn-power-minus')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setPower(Math.max(0.05, this.humanCuePower - 0.05));
    });
    document.getElementById('btn-power-plus')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setPower(Math.min(1.00, this.humanCuePower + 0.05));
    });

    // 5. Open Modal on tapping PWR button or text
    document.getElementById('btn-power-open-modal')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openPowerModal();
    });

    // 6. Modal controls
    document.getElementById('btn-close-power-modal')?.addEventListener('click', () => {
      this.closePowerModal();
    });
    document.getElementById('btn-confirm-power-modal')?.addEventListener('click', () => {
      this.closePowerModal();
    });

    // Backdrop click closes modal
    const modal = document.getElementById('modal-pool-power');
    const modalCard = document.getElementById('modal-pool-power-card');
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) this.closePowerModal();
    });
    modalCard?.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Modal Slider
    const sliderModal = document.getElementById('slider-modal-power') as HTMLInputElement | null;
    sliderModal?.addEventListener('input', () => {
      const val = parseFloat(sliderModal.value) / 100;
      this.setPower(val);
    });

    // Modal Preset Buttons (.btn-preset-modal)
    const presetButtons = document.querySelectorAll('.btn-preset-modal');
    presetButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        const pwrVal = parseFloat(target.dataset.power || '0.5');
        this.setPower(pwrVal);
      });
    });
  }

  private isPointerOnCueStick(coords: { x: number; y: number }): boolean {
    const cue = this.engine.getCueBall();
    if (!cue) return false;

    // The cue stick extends behind the cue ball opposite to the aim angle (cueAngle + Math.PI)
    // Unit vector along the cue stick axis (from cue ball towards the butt)
    const ux = -Math.cos(this.cueAngle);
    const uy = -Math.sin(this.cueAngle);

    // Vector from cue ball to pointer coords
    const dx = coords.x - cue.x;
    const dy = coords.y - cue.y;

    // Longitudinal projection along stick axis
    const proj = dx * ux + dy * uy;
    // Perpendicular distance from stick axis
    const perp = Math.abs(dx * uy - dy * ux);

    // Cue stick length is ~320px + pullback up to ~58px
    // Generous touch tolerance: along axis 15px to 450px, perpendicular offset <= 44px
    return proj >= 15 && proj <= 450 && perp <= 44;
  }

  private updateAimFromStick(stickX: number, stickY: number) {
    const cue = this.engine.getCueBall();
    if (!cue) return;
    const dx = cue.x - stickX;
    const dy = cue.y - stickY;
    if (Math.hypot(dx, dy) >= 15) {
      this.cueAngle = Math.atan2(dy, dx);
      this.broadcastAim();
    }
  }

  private updateAimAngle(targetX: number, targetY: number) {
    const cue = this.engine.getCueBall();
    if (!cue) return;
    const dx = targetX - cue.x;
    const dy = targetY - cue.y;
    if (Math.hypot(dx, dy) >= cue.radius + 4) {
      this.cueAngle = Math.atan2(dy, dx);
      this.broadcastAim();
    }
  }

  private isHumanTurn(): boolean {
    return this.engine.currentTurn === 'player';
  }

  // -------------------------------------------------------------
  // SHOT EXECUTION & LAGGING
  // -------------------------------------------------------------
  private executeAction() {
    if (this.engine.isSimulating) return;

    if (this.engine.phase === 'LAGGING') {
      if (!this.engine.playerLagShotDone) {
        this.engine.shootLagBall(true, this.cuePower);
        sounds.playCueHit(this.cuePower);

        if (this.session.mode === 'ai' && this.ai) {
          // AI shoots lag simultaneously with calculated power
          const aiPower = this.ai.getLagShotPower();
          setTimeout(() => {
            this.engine.shootLagBall(false, aiPower);
            sounds.playCueHit(aiPower);
          }, 150);
        } else if (this.session.peer?.isConnected) {
          this.session.peer.sendMessage({
            type: 'POOL_LAG_SHOT',
            power: this.cuePower
          });
        }
      }
    } else if (this.engine.phase === 'BALL_IN_HAND') {
      if (!this.isHumanTurn()) return;
      this.engine.confirmBallInHand();
      if (this.session.mode === 'online' && this.session.peer?.isConnected) {
        const cue = this.engine.getCueBall();
        if (cue) {
          this.session.peer.sendMessage({
            type: 'POOL_PLACE_BALL',
            x: cue.x,
            y: cue.y
          });
        }
      }
      this.updateHUD();
    } else if (this.engine.phase === 'PLAYING') {
      if (!this.isHumanTurn()) return;

      const success = this.engine.shoot(this.cueAngle, this.cuePower);
      if (success) {
        this.isAiming = false;
        this.isDraggingCueStick = false;
        this.canvas.style.cursor = 'crosshair';
        sounds.playCueHit(this.cuePower);

        if (this.session.mode === 'online' && this.session.peer?.isConnected) {
          this.session.peer.sendMessage({
            type: 'POOL_SHOT',
            angle: this.cueAngle,
            power: this.cuePower
          });
        }
      }
    }
  }

  private chooseBreakOption(choice: 'break' | 'pass') {
    const breaker: PlayerId = choice === 'break' ? 'player' : 'opponent';
    this.engine.setupMatchTable(breaker);
    this.hideLagModal();
    this.updateHUD();

    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      const peerBreaker: PlayerId = breaker === 'player' ? 'opponent' : 'player';
      this.session.peer.sendMessage({
        type: 'POOL_DECIDE_BREAK',
        breaker: peerBreaker
      });
    }
  }

  private processAITurn() {
    if (
      this.session.mode !== 'ai' ||
      !this.ai ||
      this.engine.isSimulating ||
      this.engine.currentTurn !== 'opponent' ||
      this.engine.phase === 'GAME_OVER'
    ) {
      this.isAITurnProcessing = false;
      return;
    }

    if (this.engine.phase === 'BALL_IN_HAND') {
      // 1. AI places cue ball after brief thinking delay
      this.updateHUD();
      setTimeout(() => {
        if (!this.isRunning || this.engine.phase !== 'BALL_IN_HAND' || this.engine.currentTurn !== 'opponent') {
          this.isAITurnProcessing = false;
          return;
        }

        const placement = this.ai!.planBallInHandPlacement(this.engine);
        this.engine.placeCueBall(placement.x, placement.y);
        this.engine.confirmBallInHand();
        this.updateHUD();

        // 2. Now aim and shoot from placed spot
        setTimeout(() => {
          this.scheduleAIShot();
        }, 400);
      }, 750);
    } else if (this.engine.phase === 'PLAYING') {
      this.scheduleAIShot();
    } else {
      this.isAITurnProcessing = false;
    }
  }

  private scheduleAIShot() {
    if (
      this.session.mode !== 'ai' ||
      !this.ai ||
      this.engine.isSimulating ||
      this.engine.currentTurn !== 'opponent' ||
      this.engine.phase !== 'PLAYING'
    ) {
      this.isAITurnProcessing = false;
      return;
    }

    // AI computes optimal shot angle and power
    const plan = this.ai.planShot(this.engine);
    this.cueAngle = plan.angle;
    this.cuePower = plan.power;
    this.isAiming = true;
    this.updateHUD();

    // Aiming delay (simulate aiming, pullback, and alignment)
    setTimeout(() => {
      this.isAiming = false;
      if (!this.isRunning || this.engine.phase !== 'PLAYING' || this.engine.currentTurn !== 'opponent') {
        this.isAITurnProcessing = false;
        return;
      }

      const success = this.engine.shoot(plan.angle, plan.power);
      if (success) {
        sounds.playCueHit(plan.power);
      } else {
        this.isAITurnProcessing = false;
      }
    }, 850);
  }

  // -------------------------------------------------------------
  // GAME LOOP
  // -------------------------------------------------------------
  private startLoop() {
    this.isRunning = true;
    let screenshotFrames = 0;

    const FIXED_TIMESTEP = 1000 / 60; // 16.6667ms per physics tick (consistent across 60Hz/120Hz/144Hz)
    let lastTime = performance.now();
    let accumulator = 0;

    const loop = (currentTime: number) => {
      if (!this.isRunning) return;

      const delta = Math.min(currentTime - lastTime, 100);
      lastTime = currentTime;
      accumulator += delta;

      // 60Hz fixed-timestep physics updates
      while (accumulator >= FIXED_TIMESTEP) {
        this.engine.update(
          (_b1, _b2, speed) => sounds.playBallHit(Math.min(1.0, speed / 8)),
          (_ball, speed) => sounds.playCushionBounce(Math.min(1.0, speed / 8)),
          () => sounds.playPocketDrop()
        );
        accumulator -= FIXED_TIMESTEP;
      }

      // Reset AI processing flag when physics simulation settles
      if (this.wasSimulating && !this.engine.isSimulating) {
        this.isAITurnProcessing = false;
        if (this.isHumanTurn()) {
          this.setPower(this.humanCuePower);
        }
        // In online PvP, broadcast authoritative table snapshot when balls settle
        if (this.session.mode === 'online' && this.session.peer?.isConnected) {
          this.session.peer.sendMessage({
            type: 'POOL_SYNC_TABLE',
            balls: this.engine.balls.map(b => ({
              id: b.id,
              x: b.x,
              y: b.y,
              isPotted: b.isPotted,
              isSinking: b.isSinking
            })),
            currentTurn: this.engine.currentTurn,
            playerGroup: this.engine.playerGroup,
            opponentGroup: this.engine.opponentGroup,
            phase: this.engine.phase,
            winner: this.engine.winner
          });
        }
      }
      this.wasSimulating = this.engine.isSimulating;

      // Check phase transitions
      if (this.engine.phase === 'LAG_RESULT' && !this.isLagModalShown) {
        this.handleLagResultTransition();
      } else if (this.engine.phase === 'GAME_OVER' && !this.isGameOverModalShown) {
        this.handleGameOverTransition();
      }

      // Check if AI turn started
      if (
        !this.engine.isSimulating &&
        (this.engine.phase === 'PLAYING' || this.engine.phase === 'BALL_IN_HAND') &&
        this.engine.currentTurn === 'opponent' &&
        this.session.mode === 'ai' &&
        !this.isAITurnProcessing
      ) {
        this.isAITurnProcessing = true;
        this.processAITurn();
      }

      // Render frame with opponent cue if applicable
      this.renderer.render(
        this.engine,
        this.cueAngle,
        this.cuePower,
        this.isAiming,
        this.isHumanTurn(),
        this.opponentCue
      );

      this.updateHUD();

      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('screenshot') === '1') {
        screenshotFrames++;
        if (screenshotFrames >= 5) return;
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  // -------------------------------------------------------------
  // UI & MODALS
  // -------------------------------------------------------------
  private isLagModalShown: boolean = false;
  private isGameOverModalShown: boolean = false;

  private handleLagResultTransition() {
    this.isLagModalShown = true;
    const modal = document.getElementById('modal-lag-choice');
    const title = document.getElementById('lag-modal-title');
    const desc = document.getElementById('lag-modal-desc');
    const actions = document.getElementById('lag-choice-actions');

    if (!modal || !title || !desc || !actions) return;

    const res = this.engine.lagResult;
    if (!res) return;

    if (res.winner === 'player') {
      title.textContent = 'YOU WON THE LAG!';
      title.className = 'text-2xl font-extrabold mb-2 text-emerald-400';
      desc.textContent = `${res.reason} Choose whether to break first or pass.`;
      actions.classList.remove('hidden');
    } else {
      title.textContent = `${this.opponentName} WON THE LAG!`;
      title.className = 'text-2xl font-extrabold mb-2 text-rose-400';
      desc.textContent = `${res.reason} Waiting for ${this.opponentName} to decide the break...`;
      actions.classList.add('hidden');

      // If AI won, AI makes choice after brief delay
      if (this.session.mode === 'ai' && this.ai) {
        const choice = this.ai.decideBreakOption();
        setTimeout(() => {
          const breaker: PlayerId = choice === 'break' ? 'opponent' : 'player';
          this.engine.setupMatchTable(breaker);
          this.hideLagModal();
          this.updateHUD();
        }, 1200);
      }
    }

    modal.classList.remove('hidden');
  }

  private hideLagModal() {
    this.isLagModalShown = false;
    document.getElementById('modal-lag-choice')?.classList.add('hidden');
  }

  private handleGameOverTransition() {
    this.isGameOverModalShown = true;
    const won = this.engine.winner === 'player';
    if (won) {
      sounds.playWin();
      confetti({ particleCount: 120, spread: 80 });
    } else {
      sounds.playGameOver();
    }
    this.showGameOverModal(won, this.engine.gameOverReason);
  }

  private showGameOverModal(playerWon: boolean, customSubtitle?: string) {
    const modal = document.getElementById('modal-pool-gameover');
    const title = document.getElementById('pool-gameover-title');
    const desc = document.getElementById('pool-gameover-desc');

    if (modal && title && desc) {
      if (playerWon) {
        title.textContent = 'VICTORY!';
        title.className = 'text-3xl font-extrabold mb-2 text-emerald-400';
        desc.textContent = customSubtitle || 'You won the match!';
      } else {
        title.textContent = 'DEFEAT';
        title.className = 'text-3xl font-extrabold mb-2 text-rose-500';
        desc.textContent = customSubtitle || 'Opponent won the match.';
      }
      modal.classList.remove('hidden');
    }
  }

  private hideGameOverModal() {
    this.isGameOverModalShown = false;
    document.getElementById('modal-pool-gameover')?.classList.add('hidden');
  }

  private showRematchOffer() {
    const btn = document.getElementById('btn-pool-rematch');
    if (btn) {
      btn.textContent = 'Accept Rematch!';
      btn.className = 'ps-btn-primary w-full py-3 rounded-xl text-sm font-semibold animate-pulse bg-emerald-600';
    }
  }

  private updateActionButtonState(isMyTurn: boolean) {
    const btn = document.getElementById('btn-action-shoot');
    const canInteract = isMyTurn && !this.engine.isSimulating && this.engine.phase !== 'GAME_OVER';

    if (btn) {
      if (canInteract) {
        btn.classList.remove('opacity-40', 'cursor-not-allowed', 'pointer-events-none');
        btn.classList.add('cursor-pointer');
      } else {
        btn.classList.add('opacity-40', 'cursor-not-allowed', 'pointer-events-none');
        btn.classList.remove('cursor-pointer');
      }
    }
  }

  private updateHUD() {
    const statusBanner = document.getElementById('pool-status-banner');
    const statusText = document.getElementById('pool-status-text');
    const hintText = document.getElementById('pool-hint-text');
    const btnShootLabel = document.getElementById('btn-shoot-label');
    const badgePlayerGroup = document.getElementById('badge-player-group');
    const badgeOpponentGroup = document.getElementById('badge-opponent-group');
    const iconPlayerBall = document.getElementById('icon-player-ball');
    const iconOpponentBall = document.getElementById('icon-opponent-ball');

    // Update Player & Opponent Group Badges and Ball Icons
    if (this.engine.phase === 'LAGGING') {
      if (badgePlayerGroup && badgePlayerGroup.textContent !== 'LAG') {
        badgePlayerGroup.textContent = 'LAG';
      }
      if (badgeOpponentGroup && badgeOpponentGroup.textContent !== 'LAG') {
        badgeOpponentGroup.textContent = 'LAG';
      }
      if (iconPlayerBall && iconPlayerBall.dataset.iconKey !== 'lag-p') {
        iconPlayerBall.dataset.iconKey = 'lag-p';
        iconPlayerBall.innerHTML = getPoolBallIconSVG(this.engine.variant, 'open', '#3b82f6', undefined, 'clip-lag-p');
      }
      if (iconOpponentBall && iconOpponentBall.dataset.iconKey !== 'lag-o') {
        iconOpponentBall.dataset.iconKey = 'lag-o';
        iconOpponentBall.innerHTML = getPoolBallIconSVG(this.engine.variant, 'open', '#f43f5e', undefined, 'clip-lag-o');
      }
    } else if (this.engine.variant === '8ball') {
      const pGrp = this.engine.playerGroup;
      const oGrp = this.engine.opponentGroup;

      const pText = pGrp ? pGrp.toUpperCase() : 'OPEN';
      const oText = oGrp ? oGrp.toUpperCase() : 'OPEN';

      if (badgePlayerGroup && badgePlayerGroup.textContent !== pText) {
        badgePlayerGroup.textContent = pText;
      }
      if (badgeOpponentGroup && badgeOpponentGroup.textContent !== oText) {
        badgeOpponentGroup.textContent = oText;
      }

      const pKey = `8ball-${pGrp || 'open'}`;
      if (iconPlayerBall && iconPlayerBall.dataset.iconKey !== pKey) {
        iconPlayerBall.dataset.iconKey = pKey;
        iconPlayerBall.innerHTML = getPoolBallIconSVG('8ball', pGrp || 'open', '#3b82f6', undefined, 'clip-p');
      }

      const oKey = `8ball-${oGrp || 'open'}`;
      if (iconOpponentBall && iconOpponentBall.dataset.iconKey !== oKey) {
        iconOpponentBall.dataset.iconKey = oKey;
        iconOpponentBall.innerHTML = getPoolBallIconSVG('8ball', oGrp || 'open', '#f43f5e', undefined, 'clip-o');
      }
    } else {
      // 9-Ball: Target is the lowest numbered ball on the table
      const lowest = this.engine.getLowestBallOnTable();
      const targetText = `BALL #${lowest}`;

      if (badgePlayerGroup && badgePlayerGroup.textContent !== targetText) {
        badgePlayerGroup.textContent = targetText;
      }
      if (badgeOpponentGroup && badgeOpponentGroup.textContent !== targetText) {
        badgeOpponentGroup.textContent = targetText;
      }

      const ballKey = `9ball-${lowest}`;
      if (iconPlayerBall && iconPlayerBall.dataset.iconKey !== ballKey) {
        iconPlayerBall.dataset.iconKey = ballKey;
        iconPlayerBall.innerHTML = getPoolBallIconSVG('9ball', null, '#3b82f6', lowest, 'clip-9-p');
      }
      if (iconOpponentBall && iconOpponentBall.dataset.iconKey !== ballKey) {
        iconOpponentBall.dataset.iconKey = ballKey;
        iconOpponentBall.innerHTML = getPoolBallIconSVG('9ball', null, '#f43f5e', lowest, 'clip-9-o');
      }
    }

    if (this.engine.phase === 'LAGGING') {
      const canShootLag = !this.engine.playerLagShotDone;
      if (statusBanner) {
        statusBanner.className = 'flex-1 max-w-[170px] sm:max-w-[240px] flex flex-col items-center px-2 py-0.5 rounded-xl bg-cyan-600/15 border border-cyan-500/30 text-center mx-auto';
      }
      if (statusText) {
        statusText.textContent = 'LAG FOR BREAK';
        statusText.className = 'text-[11px] sm:text-xs font-black tracking-wide text-cyan-600 dark:text-cyan-400 uppercase truncate w-full';
      }
      if (hintText) {
        hintText.textContent = canShootLag
          ? 'Bounce ball off far cushion to head rail'
          : 'Waiting for balls to settle...';
        hintText.className = 'text-[9px] sm:text-[11px] md:text-xs font-medium text-gray-500 dark:text-gray-400 truncate w-full';
      }
      if (btnShootLabel) btnShootLabel.textContent = canShootLag ? 'SHOOT LAG' : 'SETTLING...';
      this.updateActionButtonState(canShootLag);
      return;
    }

    const isMyTurn = this.isHumanTurn();

    if (this.engine.phase === 'BALL_IN_HAND') {
      const isBreak = this.engine.isBreakShot;
      if (statusBanner) {
        statusBanner.className = isMyTurn
          ? 'flex-1 max-w-[170px] sm:max-w-[240px] flex flex-col items-center px-2 py-0.5 rounded-xl bg-amber-600/15 border border-amber-500/30 text-center mx-auto'
          : 'flex-1 max-w-[170px] sm:max-w-[240px] flex flex-col items-center px-2 py-0.5 rounded-xl bg-gray-200/60 dark:bg-gray-800/40 border border-gray-300/60 dark:border-gray-700/40 text-center mx-auto';
      }
      if (statusText) {
        if (isBreak) {
          statusText.textContent = isMyTurn ? 'BREAK IN HAND (YOU)' : `BREAK IN HAND (${this.opponentName.toUpperCase()})`;
        } else {
          statusText.textContent = isMyTurn ? 'BALL IN HAND (YOU)' : `BALL IN HAND (${this.opponentName.toUpperCase()})`;
        }
        statusText.className = isMyTurn
          ? 'text-[11px] sm:text-xs font-black tracking-wide text-amber-600 dark:text-amber-400 uppercase truncate w-full'
          : 'text-[11px] sm:text-xs font-black tracking-wide text-gray-600 dark:text-gray-400 uppercase truncate w-full';
      }
      if (hintText) {
        if (isBreak) {
          hintText.textContent = isMyTurn
            ? 'Place cue ball behind striped line to break'
            : `${this.opponentName} is placing cue ball...`;
        } else {
          hintText.textContent = isMyTurn
            ? 'Drag ball or tap table to place'
            : `${this.opponentName} is placing cue ball...`;
        }
        hintText.className = 'text-[9px] sm:text-[11px] md:text-xs font-medium text-gray-500 dark:text-gray-400 truncate w-full';
      }
      if (btnShootLabel) {
        btnShootLabel.textContent = isMyTurn
          ? (isBreak ? 'CONFIRM BREAK' : 'CONFIRM POS')
          : 'OPPONENT PLACING...';
      }
      this.updateActionButtonState(isMyTurn);
      return;
    }

    if (this.engine.phase === 'PLAYING') {
      if (statusBanner) {
        statusBanner.className = isMyTurn
          ? 'flex-1 max-w-[170px] sm:max-w-[240px] flex flex-col items-center px-2 py-0.5 rounded-xl bg-emerald-600/15 border border-emerald-500/30 text-center mx-auto'
          : 'flex-1 max-w-[170px] sm:max-w-[240px] flex flex-col items-center px-2 py-0.5 rounded-xl bg-rose-600/15 border border-rose-500/30 text-center mx-auto';
      }
      if (statusText) {
        statusText.textContent = isMyTurn ? 'YOUR TURN' : `${this.opponentName.toUpperCase()}'S TURN`;
        statusText.className = isMyTurn
          ? 'text-[11px] sm:text-xs font-black tracking-wide text-emerald-600 dark:text-emerald-400 uppercase truncate w-full'
          : 'text-[11px] sm:text-xs font-black tracking-wide text-rose-600 dark:text-rose-400 uppercase truncate w-full';
      }
      if (btnShootLabel) {
        btnShootLabel.textContent = isMyTurn ? 'STRIKE' : (this.session.mode === 'ai' ? 'AI AIMING...' : 'OPPONENT TURN');
      }
      this.updateActionButtonState(isMyTurn);

      if (this.engine.variant === '8ball') {
        const pGrp = this.engine.playerGroup;
        if (hintText) {
          if (this.engine.isBreakShot) {
            hintText.textContent = isMyTurn
              ? 'Tap cue ball to adjust, or aim & strike to break!'
              : `${this.opponentName} is breaking!`;
          } else if (isMyTurn) {
            if (!pGrp) hintText.textContent = 'Open table: Sink any ball to claim group';
            else {
              const rem = this.engine.getRemainingGroupBalls(pGrp).length;
              hintText.textContent = rem > 0 ? `Sink your ${pGrp} balls` : 'Sink the 8-Ball to WIN!';
            }
          } else {
            hintText.textContent = `${this.opponentName} is taking shot...`;
          }
        }
      } else {
        // 9-Ball
        const lowest = this.engine.getLowestBallOnTable();
        if (hintText) {
          if (this.engine.isBreakShot) {
            hintText.textContent = isMyTurn
              ? 'Aim & strike to break rack!'
              : `${this.opponentName} is breaking!`;
          } else {
            hintText.textContent = isMyTurn
              ? `Must strike #${lowest} first!`
              : `${this.opponentName} is aiming...`;
          }
        }
      }
    }
  }
}
