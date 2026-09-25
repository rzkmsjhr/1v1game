// Main Game Controller for Block Fit Duel (1v1 Tangram Polyomino Puzzle Race)
import confetti from 'canvas-confetti';
import type { GameInstance, GameSession, AppTheme } from '../types';
import type { NetworkHealth, NetworkMessage } from '../../network/webrtc-peer';
import { sounds } from '../../engine/sound';
import type { PolyominoPiece } from './block-fit-types';
import { BlockFitEngine } from './block-fit-engine';
import { BlockFitAI } from './block-fit-ai';
import { BlockFitRenderer, type DragGhostState } from './renderers/BlockFitRenderer';

export class BlockFitGame implements GameInstance {
  private container: HTMLElement;
  private session: GameSession;
  private engine: BlockFitEngine;
  private ai: BlockFitAI | null = null;
  private currentTheme: AppTheme;

  // Network Health & Rematch State
  private netPingEl: HTMLElement | null = null;
  private netDotEl: HTMLElement | null = null;
  private netTextEl: HTMLElement | null = null;
  private peerAwayBannerEl: HTMLElement | null = null;
  private rematchState: 'idle' | 'requested' | 'offer_received' = 'idle';
  private winnerLocked: boolean = false;
  private localRoundClaimTime: number = 0;

  // DOM Elements
  private canvasTray!: HTMLCanvasElement;
  private canvasOppTray!: HTMLCanvasElement;
  private dockContainer!: HTMLElement;
  private statusTextEl!: HTMLElement;
  private roundBadgeEl!: HTMLElement;
  private playerStarsEl!: HTMLElement;
  private oppStarsEl!: HTMLElement;
  private oppStatusEl!: HTMLElement;
  private countdownOverlayEl!: HTMLElement;
  private countdownNumberEl!: HTMLElement;
  private roundWinnerOverlayEl!: HTMLElement;
  private roundWinnerTextEl!: HTMLElement;
  private roundWinnerSubtextEl!: HTMLElement;
  private matchOverModalEl!: HTMLElement;

  // Interactive Drag & Selection State
  private dragCanvas!: HTMLCanvasElement;
  private dragGrabOffsetX: number = 0;
  private dragGrabOffsetY: number = 0;
  private dragTouchLiftY: number = 0;
  private lastDragValidState: boolean | null = null;
  private activeDragPiece: PolyominoPiece | null = null;
  private activeDragElem: HTMLElement | null = null;
  private dragGhost: DragGhostState | null = null;
  private selectedDockPiece: PolyominoPiece | null = null;
  private isPointerDown: boolean = false;
  private pointerStartX: number = 0;
  private pointerStartY: number = 0;
  private hasMovedFar: boolean = false;
  private dragFromTray: { pieceId: string; origR: number; origC: number } | null = null;
  private trayHoldTimer: number | null = null;

  // Animation & Event Cleanup
  private resizeObserver: ResizeObserver | null = null;
  private countdownTimer: number | null = null;
  private nextRoundTimer: number | null = null;
  private boundOnPointerMove: (e: PointerEvent) => void;
  private boundOnPointerUp: (e: PointerEvent) => void;

  constructor(container: HTMLElement, session: GameSession) {
    this.container = container;
    this.session = session;
    this.currentTheme = session.theme;

    // Seed determination (host or random)
    const seed = session.mode === 'online' && session.peer?.role === 'guest' ? 0 : Math.floor(Math.random() * 1000000);
    this.engine = new BlockFitEngine(seed);

    this.boundOnPointerMove = this.onPointerMove.bind(this);
    this.boundOnPointerUp = this.onPointerUp.bind(this);

    this.initDOM();
    this.initAI();
    this.initNetworking();

    // Start Round 1
    this.startRoundFlow();

    // Visual Testing & Verification Helper
    if (typeof window !== 'undefined') {
      (window as any).__testDrag = {
        dragToGap: () => {
          const firstPiece = this.dockContainer.querySelector('.piece-card') as HTMLElement;
          if (!firstPiece) return false;
          const rect = firstPiece.getBoundingClientRect();
          firstPiece.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
            pointerType: 'mouse'
          }));
          window.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top - 140,
            pointerType: 'mouse'
          }));
          return true;
        },
        dragToValid: () => {
          const firstPiece = this.dockContainer.querySelector('.piece-card') as HTMLElement;
          if (!firstPiece) return false;
          const pId = firstPiece.dataset.pieceId;
          const piece = this.engine.currentPuzzle.pieces.find(p => p.id === pId);
          if (!piece) return false;
          const rect = firstPiece.getBoundingClientRect();
          firstPiece.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
            pointerType: 'mouse'
          }));
          const layout = BlockFitRenderer.getTrayLayout(this.canvasTray, this.engine.currentPuzzle.tray);
          const targetX = layout.rect.left + layout.originX + (piece.solutionC + piece.width / 2) * layout.cellSize;
          const targetY = layout.rect.top + layout.originY + (piece.solutionR + piece.height / 2) * layout.cellSize;
          window.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true,
            clientX: targetX,
            clientY: targetY,
            pointerType: 'mouse'
          }));
          return true;
        },
        dragTrayPiece: (fromR: number, fromC: number, toR: number, toC: number) => {
          const layout = BlockFitRenderer.getTrayLayout(this.canvasTray, this.engine.currentPuzzle.tray);
          const startX = layout.rect.left + layout.originX + (fromC + 0.5) * layout.cellSize;
          const startY = layout.rect.top + layout.originY + (fromR + 0.5) * layout.cellSize;
          const endX = layout.rect.left + layout.originX + (toC + 0.5) * layout.cellSize;
          const endY = layout.rect.top + layout.originY + (toR + 0.5) * layout.cellSize;

          this.canvasTray.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            clientX: startX,
            clientY: startY,
            pointerType: 'mouse'
          }));
          window.dispatchEvent(new PointerEvent('pointermove', {
            bubbles: true,
            clientX: endX,
            clientY: endY,
            pointerType: 'mouse'
          }));
          window.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true,
            clientX: endX,
            clientY: endY,
            pointerType: 'mouse'
          }));
          return true;
        },
        tapTrayPiece: (r: number, c: number) => {
          const layout = BlockFitRenderer.getTrayLayout(this.canvasTray, this.engine.currentPuzzle.tray);
          const clickX = layout.rect.left + layout.originX + (c + 0.5) * layout.cellSize;
          const clickY = layout.rect.top + layout.originY + (r + 0.5) * layout.cellSize;

          this.canvasTray.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            clientX: clickX,
            clientY: clickY,
            pointerType: 'mouse'
          }));
          window.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true,
            clientX: clickX,
            clientY: clickY,
            pointerType: 'mouse'
          }));
          return true;
        }
      };

      const autodrag = new URLSearchParams(window.location.search).get('autodrag');
      if (autodrag) {
        window.setTimeout(() => {
          if (autodrag === 'gap') {
            (window as any).__testDrag?.dragToGap();
          } else if (autodrag === 'valid') {
            (window as any).__testDrag?.dragToValid();
          }
        }, 350);
      }
    }
  }

  // -------------------------------------------------------------
  // DOM INITIALIZATION
  // -------------------------------------------------------------

  private initDOM() {
    const isDark = this.currentTheme === 'dark';
    const oppName = this.session.mode === 'ai'
      ? `AI (${(this.session.aiDifficulty || 'medium').toUpperCase()})`
      : 'RIVAL PEER';

    this.container.innerHTML = `
      <div id="block-fit-root" class="w-full min-h-screen flex flex-col items-center justify-between px-2 sm:px-4 py-2 select-none overflow-x-hidden ${isDark ? 'text-white' : 'text-slate-900'}">
        
        <!-- Header HUD -->
        <header class="w-full max-w-2xl flex items-center justify-between px-2 py-1.5 rounded-2xl ${isDark ? 'bg-slate-900/85 border-slate-800' : 'bg-white/90 border-slate-200'} border shadow-md backdrop-blur-md shrink-0 mb-2">
          <!-- Exit Button & Net Ping -->
          <div class="flex items-center space-x-2">
            <button id="btn-fit-exit" class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'} flex items-center space-x-1 cursor-pointer">
              <span>← Exit</span>
            </button>
            <span id="fit-net-ping" class="${this.session.mode === 'online' ? 'inline-flex' : 'hidden'} items-center space-x-1 text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 rounded px-1.5 py-0.5 shadow-sm">
              <span id="fit-net-dot" class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span id="fit-net-text">30ms</span>
            </span>
          </div>

          <!-- Match Status / Round Title -->
          <div class="flex flex-col items-center text-center">
            <div class="flex items-center space-x-2">
              <span id="fit-round-badge" class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/30">
                ROUND 1 / 5
              </span>
              <span class="text-[10px] font-bold text-amber-500">BEST OF 5</span>
            </div>
            <div id="fit-status-text" class="text-xs font-extrabold tracking-tight mt-0.5">
              ${this.engine.currentPuzzle.tray.name}
            </div>
          </div>

          <!-- Scoreboard (Best of 5 Stars) -->
          <div class="flex items-center space-x-3 text-right">
            <!-- You -->
            <div class="flex flex-col items-end">
              <span class="text-[9px] font-bold text-blue-400 leading-none">YOU</span>
              <div id="fit-player-stars" class="flex items-center space-x-0.5 mt-0.5 text-xs text-amber-400">
                ☆☆☆
              </div>
            </div>
            <span class="text-xs font-bold opacity-30">vs</span>
            <!-- Opponent -->
            <div class="flex flex-col items-start">
              <span class="text-[9px] font-bold text-rose-400 leading-none">RIVAL</span>
              <div id="fit-opp-stars" class="flex items-center space-x-0.5 mt-0.5 text-xs text-amber-400">
                ☆☆☆
              </div>
            </div>
          </div>
        </header>

        <!-- Inactive Tab / Opponent Away Banner -->
        <div id="fit-peer-away-banner" class="hidden w-full max-w-2xl text-center py-1 px-3 mb-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-[11px] tracking-wide backdrop-blur-md animate-pulse shadow-lg pointer-events-none">
          ⚠️ Opponent is tabbed out / minimized
        </div>

        <!-- Main Duel Playground -->
        <main class="relative flex-1 w-full max-w-2xl flex flex-col md:flex-row items-center justify-center gap-3 my-auto min-h-0">
          
          <!-- Primary Player Tray Area -->
          <div class="relative flex flex-col items-center justify-center w-full md:flex-1 h-[260px] sm:h-[320px] md:h-[380px] rounded-3xl p-2 ${isDark ? 'bg-slate-900/60 border-slate-800/80 shadow-2xl' : 'bg-white/80 border-slate-200/90 shadow-xl'} border backdrop-blur-sm overflow-hidden">
            
            <!-- Tray Canvas -->
            <canvas id="canvas-tray" class="block touch-none cursor-pointer w-full h-full" style="touch-action: none;"></canvas>

            <!-- Floating Tap-Hint -->
            <div id="fit-tap-hint" class="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-gray-400/80 pointer-events-none whitespace-nowrap">
              Drag or tap blocks to fill the shape!
            </div>
          </div>

          <!-- Opponent Mini Spectator Card (Right on desktop, top-right on mobile) -->
          <div class="flex md:flex-col items-center justify-between w-full md:w-36 p-2 rounded-2xl ${isDark ? 'bg-slate-900/50 border-slate-800/70' : 'bg-white/70 border-slate-200/80'} border backdrop-blur-sm shrink-0">
            <div class="flex items-center md:flex-col md:text-center space-x-2 md:space-x-0 md:space-y-1">
              <div class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
              <span class="text-[10px] font-bold tracking-tight text-gray-400">${oppName}</span>
              <span id="fit-opp-placed-count" class="text-[10px] font-mono font-black text-rose-400">0 / ${this.engine.currentPuzzle.pieces.length}</span>
            </div>
            
            <!-- Opponent Mini Canvas -->
            <div class="w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center p-1 rounded-xl ${isDark ? 'bg-black/30' : 'bg-slate-100'} border ${isDark ? 'border-slate-800' : 'border-slate-200'}">
              <canvas id="canvas-opp-tray" class="w-full h-full block"></canvas>
            </div>
          </div>

        </main>

        <!-- Unplaced Pieces Dock (Bottom) -->
        <footer class="w-full max-w-2xl flex flex-col items-center justify-center shrink-0 mt-2">
          <div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
            Available Blocks (No Rotate Needed)
          </div>
          <div id="block-fit-dock" class="w-full flex items-center justify-center flex-wrap gap-2.5 sm:gap-3.5 p-2 sm:p-3 rounded-2xl ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white/90 border-slate-200'} border shadow-lg backdrop-blur-md min-h-[70px] sm:min-h-[85px]" style="touch-action: none;">
            <!-- Polyomino pieces mount here dynamically -->
          </div>
        </footer>

        <!-- Countdown Overlay (3, 2, 1, GO!) -->
        <div id="fit-overlay-countdown" class="hidden fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
          <div id="fit-countdown-num" class="text-7xl sm:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-tr from-amber-400 via-orange-500 to-yellow-200 transform scale-125 transition-transform duration-200 drop-shadow-2xl">
            3
          </div>
          <div class="text-sm sm:text-base font-extrabold uppercase tracking-widest text-amber-300 mt-2">
            Get Ready to Fit!
          </div>
        </div>

        <!-- Round Cleared Overlay -->
        <div id="fit-overlay-round-winner" class="hidden fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/75 backdrop-blur-md pointer-events-none">
          <div class="text-4xl sm:text-5xl mb-2">🎉</div>
          <h2 id="fit-round-winner-text" class="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-300 tracking-tight text-center">
            YOU WON ROUND 1!
          </h2>
          <p id="fit-round-winner-sub" class="text-xs sm:text-sm font-semibold text-gray-300 mt-1">
            Next shape coming up...
          </p>
        </div>

        <!-- Match Over / Game Over Modal -->
        <div id="modal-fit-gameover" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div class="w-full max-w-sm rounded-3xl p-6 sm:p-8 flex flex-col items-center text-center shadow-2xl border ${isDark ? 'border-slate-800 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900'}">
            <div id="fit-modal-trophy" class="text-5xl mb-2">🏆</div>
            <h3 id="fit-modal-title" class="text-2xl sm:text-3xl font-black mb-1 tracking-tight text-amber-400">
              MATCH VICTORY!
            </h3>
            <p id="fit-modal-desc" class="text-xs sm:text-sm text-gray-400 mb-6 leading-relaxed">
              You won the Best of 5 match (3 - 1)!
            </p>

            <div class="w-full space-y-2.5">
              <button id="btn-fit-rematch" class="w-full py-3 px-6 rounded-xl font-black tracking-wider uppercase text-white bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-600/30 active:scale-95 transition-all cursor-pointer">
                Play Again
              </button>
              <button id="btn-fit-exit-modal" class="w-full py-2.5 px-6 rounded-xl text-xs font-bold ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'} cursor-pointer transition-colors">
                Exit to Arcade Hub
              </button>
            </div>
          </div>
        </div>

        <!-- Floating Drag Canvas (Follows finger/mouse from bottom to tray) -->
        <canvas id="fit-drag-canvas" class="fixed pointer-events-none z-50 hidden drop-shadow-2xl" style="top: 0; left: 0; touch-action: none; will-change: transform;"></canvas>

      </div>
    `;

    // Cache elements
    this.canvasTray = document.getElementById('canvas-tray') as HTMLCanvasElement;
    this.canvasOppTray = document.getElementById('canvas-opp-tray') as HTMLCanvasElement;
    this.dragCanvas = document.getElementById('fit-drag-canvas') as HTMLCanvasElement;
    this.dockContainer = document.getElementById('block-fit-dock')!;
    this.statusTextEl = document.getElementById('fit-status-text')!;
    this.roundBadgeEl = document.getElementById('fit-round-badge')!;
    this.playerStarsEl = document.getElementById('fit-player-stars')!;
    this.oppStarsEl = document.getElementById('fit-opp-stars')!;
    this.oppStatusEl = document.getElementById('fit-opp-placed-count')!;
    this.countdownOverlayEl = document.getElementById('fit-overlay-countdown')!;
    this.countdownNumberEl = document.getElementById('fit-countdown-num')!;
    this.roundWinnerOverlayEl = document.getElementById('fit-overlay-round-winner')!;
    this.roundWinnerTextEl = document.getElementById('fit-round-winner-text')!;
    this.roundWinnerSubtextEl = document.getElementById('fit-round-winner-sub')!;
    this.matchOverModalEl = document.getElementById('modal-fit-gameover')!;

    // Attach Header Listeners
    document.getElementById('btn-fit-exit')?.addEventListener('click', () => {
      this.session.onExit();
    });
    document.getElementById('btn-fit-exit-modal')?.addEventListener('click', () => {
      this.session.onExit();
    });
    document.getElementById('btn-fit-rematch')?.addEventListener('click', () => {
      this.handleRematch();
    });

    // Tray interaction listeners
    this.canvasTray.addEventListener('pointerdown', this.onTrayPointerDown.bind(this));
    window.addEventListener('pointermove', this.boundOnPointerMove);
    window.addEventListener('pointerup', this.boundOnPointerUp);

    // Responsive Canvas Resize Observer
    this.resizeObserver = new ResizeObserver(() => {
      this.renderAll();
    });
    this.resizeObserver.observe(this.canvasTray);
  }

  // -------------------------------------------------------------
  // AI & NETWORKING
  // -------------------------------------------------------------

  private initAI() {
    if (this.session.mode !== 'ai') return;
    this.ai = new BlockFitAI(this.engine, this.session.aiDifficulty || 'medium', {
      onPiecePlaced: () => {
        sounds.playPuckClack(0.25);
        this.updateOpponentView();
        this.checkRoundEnd();
      },
      onPieceRemoved: () => {
        this.updateOpponentView();
      }
    });
  }

  private initNetworking() {
    if (this.session.mode !== 'online' || !this.session.peer) return;

    const peer = this.session.peer;
    const origOnMessage = peer.events?.onMessage;
    const origOnStatusChange = peer.events?.onStatusChange;
    const origOnHealthChange = peer.events?.onHealthChange;

    peer.events = {
      ...peer.events,
      onMessage: (raw: NetworkMessage) => {
        origOnMessage?.(raw);
        this.handleNetworkMessage(raw as any);
      },
      onStatusChange: (status: string, message?: string) => {
        origOnStatusChange?.(status as any, message);
        if (status === 'connected') {
          if (peer.role === 'host') {
            this.sendNetworkMsg({
              type: 'FIT_ROUND_START',
              seed: this.engine['matchSeed'],
              roundNumber: this.engine.matchScore.currentRound
            });
          } else if (peer.role === 'guest') {
            this.sendNetworkMsg({
              type: 'FIT_REQUEST_SEED'
            });
          }
        } else if (status === 'disconnected') {
          if (this.engine.status !== 'match_over') {
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
      if (peer.role === 'host') {
        this.sendNetworkMsg({
          type: 'FIT_ROUND_START',
          seed: this.engine['matchSeed'],
          roundNumber: 1
        });
      } else if (peer.role === 'guest') {
        this.sendNetworkMsg({
          type: 'FIT_REQUEST_SEED'
        });
      }
    }
  }

  private updateNetworkHealthHUD(health: NetworkHealth) {
    const pingEl = this.netPingEl || (this.netPingEl = document.getElementById('fit-net-ping'));
    const dotEl = this.netDotEl || (this.netDotEl = document.getElementById('fit-net-dot'));
    const textEl = this.netTextEl || (this.netTextEl = document.getElementById('fit-net-text'));
    const awayBanner = this.peerAwayBannerEl || (this.peerAwayBannerEl = document.getElementById('fit-peer-away-banner'));

    if (pingEl && dotEl && textEl) {
      if (health.status === 'stalled') {
        dotEl.className = 'w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping';
        textEl.textContent = 'Lag ⚠️';
        pingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 rounded px-1.5 py-0.5 shadow-sm';
      } else if (health.status === 'poor') {
        dotEl.className = 'w-1.5 h-1.5 rounded-full bg-rose-400';
        textEl.textContent = `${health.rtt}ms`;
        pingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 rounded px-1.5 py-0.5 shadow-sm';
      } else if (health.status === 'moderate') {
        dotEl.className = 'w-1.5 h-1.5 rounded-full bg-amber-400';
        textEl.textContent = `${health.rtt}ms`;
        pingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 rounded px-1.5 py-0.5 shadow-sm';
      } else {
        dotEl.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400';
        textEl.textContent = `${health.rtt || 28}ms`;
        pingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 rounded px-1.5 py-0.5 shadow-sm';
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
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'PLAYER_LEAVE':
        if (this.engine.status !== 'match_over') {
          this.handleForfeitVictory('Opponent forfeited the match.');
        }
        break;

      case 'FIT_REQUEST_SEED':
        if (this.session.peer?.role === 'host') {
          this.sendNetworkMsg({
            type: 'FIT_ROUND_START',
            seed: this.engine['matchSeed'],
            roundNumber: this.engine.matchScore.currentRound
          });
        }
        break;

      case 'FIT_ROUND_START':
        if (msg.seed !== undefined && msg.roundNumber !== undefined) {
          this.engine.resetMatch(msg.seed);
          this.engine.initRound(msg.roundNumber);
          this.startRoundFlow();
        }
        break;

      case 'FIT_PIECE_PLACED':
        if (msg.pieceId && msg.trayR !== undefined && msg.trayC !== undefined) {
          const piece = this.engine.currentPuzzle.pieces.find(p => p.id === msg.pieceId);
          if (piece) {
            this.engine.placePiece(this.engine.opponentBoard, piece, msg.trayR, msg.trayC);
            sounds.playPuckClack(0.25);
            this.updateOpponentView();
            this.checkRoundEnd();
          }
        }
        break;

      case 'FIT_PIECE_REMOVED':
        if (msg.pieceId) {
          this.engine.removePiece(this.engine.opponentBoard, msg.pieceId);
          this.updateOpponentView();
        }
        break;

      case 'FIT_ROUND_CLAIM':
        if (msg.roundNumber === this.engine.matchScore.currentRound) {
          if (this.engine.status === 'playing') {
            this.handleRoundWon('opponent');
          } else if (this.session.peer?.role === 'host') {
            // Host arbitration for simultaneous round claim
            const guestWonFirst = msg.timestamp < this.localRoundClaimTime;
            if (guestWonFirst) {
              this.reconcileRoundLossToGuest();
            }
            this.sendNetworkMsg({
              type: 'FIT_ROUND_RESOLVE',
              roundNumber: msg.roundNumber,
              winner: guestWonFirst ? 'guest' : 'host'
            });
          }
        }
        break;

      case 'FIT_ROUND_RESOLVE':
        if (this.session.peer?.role === 'guest' && msg.roundNumber === this.engine.matchScore.currentRound) {
          if (msg.winner === 'host') {
            this.reconcileRoundLossToGuest();
          }
        }
        break;

      case 'FIT_REMATCH_REQUEST':
      case 'REMATCH_REQUEST':
        this.showRematchOffer();
        break;

      case 'FIT_REMATCH_ACCEPT':
      case 'REMATCH_ACCEPT':
        this.startNewMatch(msg.seed);
        break;
    }
  }

  private sendNetworkMsg(msg: NetworkMessage) {
    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      this.session.peer.sendMessage(msg);
    }
  }

  // -------------------------------------------------------------
  // ROUND FLOW & BEST OF 5 STATE MACHINE
  // -------------------------------------------------------------

  private startRoundFlow() {
    this.ai?.stop();
    this.updateHUD();
    this.renderDock();
    this.renderAll();

    const isNoCountdown = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('nocountdown') === '1';
    if (isNoCountdown) {
      this.countdownOverlayEl.classList.add('hidden');
      this.engine.startRound();
      this.ai?.start();
      return;
    }

    // Show 3, 2, 1 Countdown
    this.countdownOverlayEl.classList.remove('hidden');
    let count = 3;
    this.countdownNumberEl.textContent = `${count}`;
    sounds.playMove();

    if (this.countdownTimer !== null) {
      window.clearInterval(this.countdownTimer);
    }

    this.countdownTimer = window.setInterval(() => {
      count--;
      if (count > 0) {
        this.countdownNumberEl.textContent = `${count}`;
        sounds.playMove();
      } else if (count === 0) {
        this.countdownNumberEl.textContent = 'GO!';
        sounds.playRotate();
      } else {
        window.clearInterval(this.countdownTimer!);
        this.countdownTimer = null;
        this.countdownOverlayEl.classList.add('hidden');
        this.engine.startRound();
        this.ai?.start();
      }
    }, 750);
  }

  private updateHUD() {
    const score = this.engine.matchScore;
    this.roundBadgeEl.textContent = `ROUND ${score.currentRound} / ${score.maxRounds}`;
    this.statusTextEl.textContent = this.engine.currentPuzzle.tray.name;

    // Stars formatting (e.g. ★ ★ ☆)
    const renderStars = (wins: number) => {
      let s = '';
      for (let i = 0; i < 3; i++) {
        s += i < wins ? '★ ' : '☆ ';
      }
      return s.trim();
    };

    this.playerStarsEl.textContent = renderStars(score.playerWins);
    this.oppStarsEl.textContent = renderStars(score.opponentWins);
    this.oppStatusEl.textContent = `${this.engine.opponentBoard.placedCount} / ${this.engine.currentPuzzle.pieces.length}`;
  }

  private checkRoundEnd() {
    if (this.engine.status !== 'playing') return;

    if (this.engine.playerBoard.isComplete) {
      this.handleRoundWon('player');
    } else if (this.engine.opponentBoard.isComplete) {
      this.handleRoundWon('opponent');
    }
  }

  private handleRoundWon(winner: 'player' | 'opponent') {
    if (this.engine.status !== 'playing' || this.winnerLocked) return;

    if (this.trayHoldTimer !== null) {
      window.clearTimeout(this.trayHoldTimer);
      this.trayHoldTimer = null;
    }
    this.isPointerDown = false;
    this.activeDragPiece = null;
    this.activeDragElem = null;
    this.dragFromTray = null;
    this.dragGhost = null;
    this.dragCanvas.classList.add('hidden');

    this.ai?.stop();
    const result = this.engine.claimRoundWin(winner);
    this.updateHUD();
    this.renderAll();

    if (winner === 'player') {
      this.localRoundClaimTime = Date.now();
      sounds.playRoundComplete();
      confetti({
        particleCount: 75,
        spread: 70,
        origin: { y: 0.6 }
      });
      this.sendNetworkMsg({
        type: 'FIT_ROUND_CLAIM',
        roundNumber: this.engine.matchScore.currentRound,
        timestamp: this.localRoundClaimTime
      });
    } else {
      sounds.playInvalidBuzz();
    }

    if (result === 'match_won') {
      // Match Complete! Atomically lock match winner and stop AI
      this.winnerLocked = true;
      this.ai?.stop();
      if (this.nextRoundTimer !== null) {
        window.clearTimeout(this.nextRoundTimer);
        this.nextRoundTimer = null;
      }
      window.setTimeout(() => {
        this.showMatchOverModal();
      }, 1200);
    } else {
      // Show Round Winner Banner and transition to next round
      this.roundWinnerTextEl.textContent = winner === 'player' ? `YOU WON ROUND ${this.engine.matchScore.currentRound}!` : `ENEMY TOOK ROUND ${this.engine.matchScore.currentRound}!`;
      this.roundWinnerTextEl.className = `text-3xl sm:text-4xl font-black tracking-tight text-center ${winner === 'player' ? 'text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-300' : 'text-rose-400'}`;
      this.roundWinnerSubtextEl.textContent = `Score: You ${this.engine.matchScore.playerWins} - ${this.engine.matchScore.opponentWins} Enemy`;
      this.roundWinnerOverlayEl.classList.remove('hidden');

      this.nextRoundTimer = window.setTimeout(() => {
        this.roundWinnerOverlayEl.classList.add('hidden');
        this.engine.nextRound();
        this.startRoundFlow();
      }, 2200);
    }
  }

  private reconcileRoundLossToGuest() {
    const result = this.engine.overrideRoundWinner('opponent');
    this.updateHUD();
    this.renderAll();

    if (result === 'match_won') {
      this.winnerLocked = true;
      this.ai?.stop();
      if (this.nextRoundTimer !== null) {
        window.clearTimeout(this.nextRoundTimer);
        this.nextRoundTimer = null;
      }
      this.roundWinnerOverlayEl.classList.add('hidden');
      this.showMatchOverModal();
    } else {
      this.winnerLocked = false;
      this.roundWinnerTextEl.textContent = `ENEMY TOOK ROUND ${this.engine.matchScore.currentRound}!`;
      this.roundWinnerTextEl.className = 'text-3xl sm:text-4xl font-black tracking-tight text-center text-rose-400';
      this.roundWinnerSubtextEl.textContent = `Score: You ${this.engine.matchScore.playerWins} - ${this.engine.matchScore.opponentWins} Enemy`;
      this.roundWinnerOverlayEl.classList.remove('hidden');

      if (this.nextRoundTimer !== null) {
        window.clearTimeout(this.nextRoundTimer);
      }
      this.nextRoundTimer = window.setTimeout(() => {
        this.roundWinnerOverlayEl.classList.add('hidden');
        this.engine.nextRound();
        this.startRoundFlow();
      }, 2200);
    }
  }

  private showMatchOverModal() {
    if (!this.engine.matchScore.matchWinner) return;
    const isPlayerWin = this.engine.matchScore.matchWinner === 'player';
    const trophy = document.getElementById('fit-modal-trophy');
    const title = document.getElementById('fit-modal-title');
    const desc = document.getElementById('fit-modal-desc');
    const btn = document.getElementById('btn-fit-rematch');

    if (trophy) trophy.textContent = isPlayerWin ? '🏆' : '💀';
    if (title) {
      title.textContent = isPlayerWin ? 'MATCH VICTORY!' : 'DEFEAT!';
      title.className = `text-2xl sm:text-3xl font-black mb-1 tracking-tight ${isPlayerWin ? 'text-amber-400' : 'text-rose-500'}`;
    }
    if (desc) {
      desc.textContent = isPlayerWin
        ? `Incredible speed! You won the Best of 5 match (${this.engine.matchScore.playerWins} - ${this.engine.matchScore.opponentWins})!`
        : `Enemy cleared 3 rounds first (${this.engine.matchScore.opponentWins} - ${this.engine.matchScore.playerWins}). Better luck next time!`;
    }

    if (this.rematchState === 'offer_received') {
      this.showRematchOffer();
    } else if (btn) {
      btn.textContent = 'Play Again';
      btn.classList.remove('opacity-70', 'cursor-not-allowed', 'animate-pulse');
      btn.className = 'w-full py-3 px-6 rounded-xl font-black tracking-wider uppercase text-white bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-600/30 active:scale-95 transition-all cursor-pointer';
    }

    this.matchOverModalEl.classList.remove('hidden');
    if (isPlayerWin) {
      sounds.playRoundComplete();
      confetti({
        particleCount: 120,
        spread: 100,
        origin: { y: 0.5 }
      });
    }
  }

  private handleRematch() {
    const btn = document.getElementById('btn-fit-rematch');

    if (this.session.mode === 'ai') {
      this.startNewMatch();
      return;
    }

    if (this.rematchState === 'offer_received') {
      const seed = Date.now();
      this.sendNetworkMsg({ type: 'FIT_REMATCH_ACCEPT', seed });
      this.startNewMatch(seed);
    } else if (this.rematchState === 'idle') {
      this.rematchState = 'requested';
      if (btn) {
        btn.textContent = 'Waiting for Opponent...';
        btn.classList.add('opacity-70', 'cursor-not-allowed');
      }
      this.sendNetworkMsg({ type: 'FIT_REMATCH_REQUEST' });
    }
  }

  private showRematchOffer() {
    this.rematchState = 'offer_received';
    const btn = document.getElementById('btn-fit-rematch');
    if (btn) {
      btn.textContent = 'Accept Rematch!';
      btn.classList.remove('opacity-70', 'cursor-not-allowed');
      btn.className = 'w-full py-3 px-6 rounded-xl font-black tracking-wider uppercase text-white bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 shadow-lg shadow-emerald-500/30 active:scale-95 transition-all cursor-pointer animate-pulse';
    }
  }

  private startNewMatch(seed?: number) {
    this.rematchState = 'idle';
    this.winnerLocked = false;
    this.localRoundClaimTime = 0;
    this.matchOverModalEl.classList.add('hidden');

    const btn = document.getElementById('btn-fit-rematch');
    if (btn) {
      btn.textContent = 'Play Again';
      btn.classList.remove('opacity-70', 'cursor-not-allowed', 'animate-pulse');
      btn.className = 'w-full py-3 px-6 rounded-xl font-black tracking-wider uppercase text-white bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-600/30 active:scale-95 transition-all cursor-pointer';
    }

    this.engine.resetMatch(seed);
    this.startRoundFlow();
  }

  private handleForfeitVictory(reason: string) {
    if (this.winnerLocked || this.engine.status === 'match_over') return;
    this.winnerLocked = true;

    if (this.countdownTimer !== null) {
      window.clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.nextRoundTimer !== null) {
      window.clearTimeout(this.nextRoundTimer);
      this.nextRoundTimer = null;
    }
    this.ai?.stop();
    this.countdownOverlayEl.classList.add('hidden');
    this.roundWinnerOverlayEl.classList.add('hidden');

    this.engine.status = 'match_over';
    this.engine.matchScore.matchWinner = 'player';

    sounds.playRoundComplete();
    confetti({ particleCount: 120, spread: 100, origin: { y: 0.5 } });

    const trophy = document.getElementById('fit-modal-trophy');
    const title = document.getElementById('fit-modal-title');
    const desc = document.getElementById('fit-modal-desc');
    const btn = document.getElementById('btn-fit-rematch');

    if (trophy) trophy.textContent = '🏆';
    if (title) {
      title.textContent = 'VICTORY BY FORFEIT!';
      title.className = 'text-2xl sm:text-3xl font-black mb-1 tracking-tight text-amber-400';
    }
    if (desc) desc.textContent = reason;
    if (btn) {
      btn.textContent = 'Play Again';
      btn.classList.remove('opacity-70', 'cursor-not-allowed', 'animate-pulse');
    }

    this.matchOverModalEl.classList.remove('hidden');
  }

  // -------------------------------------------------------------
  // RENDERING & PIECE DOCK
  // -------------------------------------------------------------

  private renderAll() {
    const isDark = this.currentTheme === 'dark';
    BlockFitRenderer.renderTray(
      this.canvasTray,
      this.engine.currentPuzzle.tray,
      this.engine.playerBoard,
      this.engine.currentPuzzle.pieces,
      isDark,
      this.dragGhost
    );

    this.updateOpponentView();
  }

  private updateOpponentView() {
    const isDark = this.currentTheme === 'dark';
    BlockFitRenderer.renderMiniTray(
      this.canvasOppTray,
      this.engine.currentPuzzle.tray,
      this.engine.opponentBoard,
      this.engine.currentPuzzle.pieces,
      isDark
    );
    this.oppStatusEl.textContent = `${this.engine.opponentBoard.placedCount} / ${this.engine.currentPuzzle.pieces.length}`;
  }

  private renderDock() {
    this.dockContainer.innerHTML = '';
    const puzzle = this.engine.currentPuzzle;
    const isDark = this.currentTheme === 'dark';

    // Filter pieces that are not yet placed on player board
    const unplaced = puzzle.pieces.filter(p => !this.engine.playerBoard.placedPieces.has(p.id));

    if (unplaced.length === 0) {
      this.dockContainer.innerHTML = `
        <div class="text-xs font-bold text-emerald-400 py-2">
          ✨ All pieces placed!
        </div>
      `;
      return;
    }

    for (const piece of unplaced) {
      const isSelected = this.selectedDockPiece?.id === piece.id;
      const pieceCard = document.createElement('div');
      pieceCard.className = `piece-card p-1.5 sm:p-2 rounded-xl border ${isSelected ? 'ring-2 ring-purple-500 bg-purple-500/20 border-purple-400 scale-105 shadow-md shadow-purple-500/25' : isDark ? 'bg-slate-800/80 border-slate-700/80 hover:border-slate-500' : 'bg-slate-100 border-slate-300 hover:border-slate-400'} shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing transition-all transform hover:-translate-y-0.5 flex items-center justify-center`;
      pieceCard.dataset.pieceId = piece.id;

      // Small static canvas for the piece
      const miniCanvas = document.createElement('canvas');
      const cellSize = window.innerWidth < 640 ? 22 : 28;
      BlockFitRenderer.renderPieceToCanvas(miniCanvas, piece, cellSize);
      pieceCard.appendChild(miniCanvas);

      // Attach pointerdown for dragging & clicking
      pieceCard.addEventListener('pointerdown', (e) => this.onDockPiecePointerDown(e, piece, pieceCard));

      this.dockContainer.appendChild(pieceCard);
    }
  }

  // -------------------------------------------------------------
  // INTERACTION (DRAG & DROP + TAP TO PLACE)
  // -------------------------------------------------------------

  private onDockPiecePointerDown(e: PointerEvent, piece: PolyominoPiece, elem: HTMLElement) {
    if (this.engine.status !== 'playing') return;
    e.preventDefault();

    this.isPointerDown = true;
    this.pointerStartX = e.clientX;
    this.pointerStartY = e.clientY;
    this.hasMovedFar = false;
    this.activeDragPiece = piece;
    this.activeDragElem = elem;

    const layout = BlockFitRenderer.getTrayLayout(this.canvasTray, this.engine.currentPuzzle.tray);
    const pieceW = piece.width * layout.cellSize;
    const pieceH = piece.height * layout.cellSize;

    this.dragGrabOffsetX = pieceW / 2;
    this.dragGrabOffsetY = pieceH / 2;
    this.dragTouchLiftY = e.pointerType === 'touch' ? -48 : 0;
    this.lastDragValidState = null;

    // Pre-render floating piece as invalid (grayish with red border) initially
    BlockFitRenderer.renderFloatingPiece(this.dragCanvas, piece, layout.cellSize, false);
    this.lastDragValidState = false;

    // Position floating canvas directly at cursor
    const posX = e.clientX - this.dragGrabOffsetX;
    const posY = e.clientY - this.dragGrabOffsetY + this.dragTouchLiftY;
    this.dragCanvas.style.transform = `translate3d(${posX}px, ${posY}px, 0)`;

    sounds.playBlockPick();
  }

  private onTrayPointerDown(e: PointerEvent) {
    if (this.engine.status !== 'playing') return;

    // Convert click coordinates to tray cell
    const cell = BlockFitRenderer.clientToTrayCell(
      this.canvasTray,
      this.engine.currentPuzzle.tray,
      e.clientX,
      e.clientY
    );
    if (!cell) return;

    // Check if player interacted with an already-placed piece
    for (const [pId, placed] of this.engine.playerBoard.placedPieces) {
      const piece = this.engine.currentPuzzle.pieces.find(p => p.id === pId);
      if (!piece) continue;

      const hasCell = piece.cells.some(c => placed.trayR + c.r === cell.r && placed.trayC + c.c === cell.c);
      if (hasCell) {
        // Deselect dock piece if one was selected
        if (this.selectedDockPiece) {
          this.selectedDockPiece = null;
          this.renderDock();
        }

        e.preventDefault();
        this.isPointerDown = true;
        this.pointerStartX = e.clientX;
        this.pointerStartY = e.clientY;
        this.hasMovedFar = false;
        this.activeDragPiece = piece;
        this.activeDragElem = null;
        this.dragFromTray = { pieceId: pId, origR: placed.trayR, origC: placed.trayC };

        const layout = BlockFitRenderer.getTrayLayout(this.canvasTray, this.engine.currentPuzzle.tray);
        const pieceScreenX = layout.rect.left + layout.originX + placed.trayC * layout.cellSize;
        const pieceScreenY = layout.rect.top + layout.originY + placed.trayR * layout.cellSize;

        this.dragGrabOffsetX = e.clientX - pieceScreenX;
        this.dragGrabOffsetY = e.clientY - pieceScreenY;
        this.dragTouchLiftY = 0; // Direct manipulation in tray: zero jump!
        this.lastDragValidState = true;

        // Pre-render floating piece on drag canvas
        BlockFitRenderer.renderFloatingPiece(this.dragCanvas, piece, layout.cellSize, true);

        // Position floating drag canvas exactly at piece screen coordinates
        const posX = e.clientX - this.dragGrabOffsetX;
        const posY = e.clientY - this.dragGrabOffsetY + this.dragTouchLiftY;
        this.dragCanvas.style.transform = `translate3d(${posX}px, ${posY}px, 0)`;

        // Setup touch/click hold timer: if held for 240ms without moving, lift into drag mode
        if (this.trayHoldTimer !== null) {
          window.clearTimeout(this.trayHoldTimer);
        }
        this.trayHoldTimer = window.setTimeout(() => {
          this.trayHoldTimer = null;
          if (this.isPointerDown && this.dragFromTray && !this.hasMovedFar) {
            this.startTrayDrag();
          }
        }, 240);

        return;
      }
    }

    // If a dock piece was previously selected via tap, place it here!
    if (this.selectedDockPiece) {
      const piece = this.selectedDockPiece;
      let placed = false;
      for (const c of piece.cells) {
        const tr = cell.r - c.r;
        const tc = cell.c - c.c;
        if (this.engine.canPlacePiece(this.engine.playerBoard, piece, tr, tc)) {
          this.selectedDockPiece = null;
          this.tryPlacePieceAt(piece, tr, tc);
          placed = true;
          break;
        }
      }
      if (!placed) {
        sounds.playInvalidBuzz();
      }
    }
  }

  private startTrayDrag() {
    if (!this.dragFromTray || this.hasMovedFar) return;
    this.hasMovedFar = true;
    this.dragCanvas.classList.remove('hidden');

    // Remove from board temporarily so its old cells are free for repositioning
    this.engine.removePiece(this.engine.playerBoard, this.dragFromTray.pieceId);
    sounds.playBlockPick();

    if (this.activeDragPiece) {
      this.dragGhost = {
        piece: this.activeDragPiece,
        targetR: this.dragFromTray.origR,
        targetC: this.dragFromTray.origC,
        isValid: true
      };
    }
    this.renderAll();
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.isPointerDown || !this.activeDragPiece) return;

    const dist = Math.hypot(e.clientX - this.pointerStartX, e.clientY - this.pointerStartY);
    if (!this.hasMovedFar && dist > 5) {
      if (this.trayHoldTimer !== null) {
        window.clearTimeout(this.trayHoldTimer);
        this.trayHoldTimer = null;
      }

      if (this.dragFromTray) {
        this.startTrayDrag();
      } else {
        this.hasMovedFar = true;
        this.dragCanvas.classList.remove('hidden');
        if (this.activeDragElem) {
          this.activeDragElem.style.opacity = '0.2';
          this.activeDragElem.style.filter = 'grayscale(60%)';
        }
      }
    }

    if (this.hasMovedFar) {
      const piece = this.activeDragPiece;
      const layout = BlockFitRenderer.getTrayLayout(this.canvasTray, this.engine.currentPuzzle.tray);

      const posX = e.clientX - this.dragGrabOffsetX;
      const posY = e.clientY - this.dragGrabOffsetY + this.dragTouchLiftY;
      this.dragCanvas.style.transform = `translate3d(${posX}px, ${posY}px, 0)`;

      // Map floating piece top-left to tray grid cell (targetR, targetC)
      const relX = posX - layout.rect.left - layout.originX;
      const relY = posY - layout.rect.top - layout.originY;
      const targetC = Math.round(relX / layout.cellSize);
      const targetR = Math.round(relY / layout.cellSize);

      const tray = this.engine.currentPuzzle.tray;
      // Is piece close enough to the tray to check placement?
      const isNearTray =
        targetR >= -1 &&
        targetR <= tray.rows &&
        targetC >= -1 &&
        targetC <= tray.cols;

      let isValid = false;
      if (isNearTray) {
        isValid = this.engine.canPlacePiece(this.engine.playerBoard, piece, targetR, targetC);
        this.dragGhost = {
          piece,
          targetR,
          targetC,
          isValid
        };
      } else {
        this.dragGhost = null;
      }

      // Dynamically update floating canvas color:
      // Valid -> Vibrant jewel color with green edge
      // Invalid -> Grayish body with red border
      if (isValid !== this.lastDragValidState) {
        this.lastDragValidState = isValid;
        BlockFitRenderer.renderFloatingPiece(this.dragCanvas, piece, layout.cellSize, isValid);
      }

      this.renderAll();
    }
  }

  private onPointerUp(e: PointerEvent) {
    if (this.trayHoldTimer !== null) {
      window.clearTimeout(this.trayHoldTimer);
      this.trayHoldTimer = null;
    }

    if (!this.isPointerDown) return;
    this.isPointerDown = false;

    const piece = this.activeDragPiece;
    const elem = this.activeDragElem;
    const traySource = this.dragFromTray;

    this.activeDragPiece = null;
    this.activeDragElem = null;
    this.dragFromTray = null;

    // Hide floating drag canvas
    this.dragCanvas.classList.add('hidden');

    if (elem) {
      elem.style.opacity = '1.0';
      elem.style.filter = 'none';
    }

    if (!piece) return;

    if (this.hasMovedFar) {
      // Calculate drop placement
      const layout = BlockFitRenderer.getTrayLayout(this.canvasTray, this.engine.currentPuzzle.tray);
      const posX = e.clientX - this.dragGrabOffsetX;
      const posY = e.clientY - this.dragGrabOffsetY + this.dragTouchLiftY;
      const relX = posX - layout.rect.left - layout.originX;
      const relY = posY - layout.rect.top - layout.originY;
      const targetC = Math.round(relX / layout.cellSize);
      const targetR = Math.round(relY / layout.cellSize);

      this.dragGhost = null;

      const tray = this.engine.currentPuzzle.tray;
      const isNearTray =
        targetR >= -1 &&
        targetR <= tray.rows &&
        targetC >= -1 &&
        targetC <= tray.cols;

      if (this.engine.canPlacePiece(this.engine.playerBoard, piece, targetR, targetC)) {
        this.tryPlacePieceAt(piece, targetR, targetC);
      } else if (traySource) {
        // Drag originated from tray, but cannot place at drop target
        if (isNearTray) {
          // Revert to original position in the tray
          this.engine.placePiece(this.engine.playerBoard, piece, traySource.origR, traySource.origC);
          sounds.playInvalidBuzz();
          this.renderAll();
        } else {
          // Dragged away from tray (e.g. into dock area or off-screen): recall piece to dock!
          sounds.playBlockRecall();
          this.sendNetworkMsg({ type: 'FIT_PIECE_REMOVED', pieceId: piece.id });
          this.renderDock();
          this.renderAll();
        }
      } else {
        // Drag originated from dock, dropped invalidly -> stays in dock
        sounds.playInvalidBuzz();
        this.renderAll();
      }
    } else {
      if (traySource) {
        // One tap/click simply removes the piece from the tray!
        this.engine.removePiece(this.engine.playerBoard, traySource.pieceId);
        sounds.playBlockRecall();
        this.sendNetworkMsg({ type: 'FIT_PIECE_REMOVED', pieceId: traySource.pieceId });
        this.renderDock();
        this.renderAll();
      } else {
        // Tap selection toggle on dock piece
        if (this.selectedDockPiece?.id === piece.id) {
          this.selectedDockPiece = null;
        } else {
          this.selectedDockPiece = piece;
          sounds.playBlockPick();
        }
        this.renderDock();
      }
    }
  }

  private tryPlacePieceAt(piece: PolyominoPiece, targetR: number, targetC: number) {
    const success = this.engine.placePiece(
      this.engine.playerBoard,
      piece,
      targetR,
      targetC
    );

    if (success) {
      sounds.playBlockSnap();
      this.sendNetworkMsg({
        type: 'FIT_PIECE_PLACED',
        pieceId: piece.id,
        trayR: targetR,
        trayC: targetC
      });
      this.renderDock();
      this.renderAll();
      this.checkRoundEnd();
    } else {
      sounds.playInvalidBuzz();
      this.renderAll();
    }
  }

  // -------------------------------------------------------------
  // LIFECYCLE & CLEANUP
  // -------------------------------------------------------------

  public setTheme(theme: AppTheme) {
    this.currentTheme = theme;
    this.renderAll();
    this.renderDock();
  }

  public destroy() {
    this.ai?.destroy();
    if (this.trayHoldTimer !== null) {
      window.clearTimeout(this.trayHoldTimer);
      this.trayHoldTimer = null;
    }
    if (this.countdownTimer !== null) {
      window.clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.nextRoundTimer !== null) {
      window.clearTimeout(this.nextRoundTimer);
      this.nextRoundTimer = null;
    }
    this.resizeObserver?.disconnect();
    window.removeEventListener('pointermove', this.boundOnPointerMove);
    window.removeEventListener('pointerup', this.boundOnPointerUp);

    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      try {
        this.session.peer.sendMessage({ type: 'PLAYER_LEAVE' });
      } catch {}
    }

    this.dragCanvas.classList.add('hidden');
    this.container.innerHTML = '';
  }
}
