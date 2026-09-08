import confetti from 'canvas-confetti';
import { GameInstance, GameSession, AppTheme } from '../types';
import type { NetworkMessage } from '../../network/webrtc-peer';
import { sounds } from '../../engine/sound';
import { SnakeLadderEngine, generateBoard } from './snake-ladder-engine';
import { SnakeLadderRenderer } from './renderers/SnakeLadderRenderer';
import { SnakeLadderAI } from './ai/snake-ladder-ai';
import { DiceRoll, PlayerId } from './snake-ladder-types';

interface PipDef {
  x: number;
  y: number;
  r: number;
  color: 'red' | 'blue';
}

function getPips(value: number): PipDef[] {
  switch (value) {
    case 1:
      return [{ x: 30, y: 30, r: 8.8, color: 'red' }];
    case 2:
      return [
        { x: 43, y: 17, r: 4.8, color: 'blue' },
        { x: 17, y: 43, r: 4.8, color: 'blue' }
      ];
    case 3:
      return [
        { x: 43, y: 17, r: 4.8, color: 'blue' },
        { x: 30, y: 30, r: 4.8, color: 'blue' },
        { x: 17, y: 43, r: 4.8, color: 'blue' }
      ];
    case 4:
      return [
        { x: 17, y: 17, r: 4.8, color: 'red' },
        { x: 43, y: 17, r: 4.8, color: 'red' },
        { x: 17, y: 43, r: 4.8, color: 'red' },
        { x: 43, y: 43, r: 4.8, color: 'red' }
      ];
    case 5:
      return [
        { x: 17, y: 17, r: 4.8, color: 'blue' },
        { x: 43, y: 17, r: 4.8, color: 'blue' },
        { x: 30, y: 30, r: 4.8, color: 'blue' },
        { x: 17, y: 43, r: 4.8, color: 'blue' },
        { x: 43, y: 43, r: 4.8, color: 'blue' }
      ];
    case 6:
      return [
        { x: 17, y: 16, r: 4.6, color: 'blue' },
        { x: 17, y: 30, r: 4.6, color: 'blue' },
        { x: 17, y: 44, r: 4.6, color: 'blue' },
        { x: 43, y: 16, r: 4.6, color: 'blue' },
        { x: 43, y: 30, r: 4.6, color: 'blue' },
        { x: 43, y: 44, r: 4.6, color: 'blue' }
      ];
    default:
      return [];
  }
}

function renderDiceFace(value: number | null, isDark: boolean): string {
  // Authentic Chinese / Asian Traditional Dice Style
  // White ivory body, Big Red 1, Red 4, Blue 2, 3, 5, 6 with recessed depth and bevel
  if (value === null) {
    return `
      <svg viewBox="0 0 60 60" class="w-12 h-12 sm:w-14 sm:h-14 drop-shadow-md transition-transform duration-200" style="display:block;">
        <defs>
          <linearGradient id="die-base-null" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ffffff" />
            <stop offset="50%" stop-color="#f8fafc" />
            <stop offset="100%" stop-color="#cbd5e1" />
          </linearGradient>
        </defs>
        <rect x="2.5" y="2.5" width="55" height="55" rx="13" fill="url(#die-base-null)" stroke="${isDark ? '#475569' : '#cbd5e1'}" stroke-width="2" />
        <path d="M 6 15 Q 30 8 54 15 Q 48 23 30 21 Q 12 23 6 15 Z" fill="#ffffff" opacity="0.65" />
        <text x="30" y="38" font-size="24" font-weight="900" font-family="'Plus Jakarta Sans', system-ui, sans-serif" text-anchor="middle" fill="${isDark ? '#64748b' : '#94a3b8'}">?</text>
      </svg>
    `;
  }

  const pips = getPips(value);
  const gradId = `die-base-${value}-${isDark ? 'dark' : 'light'}`;

  return `
    <svg viewBox="0 0 60 60" class="w-12 h-12 sm:w-14 sm:h-14 drop-shadow-md transition-transform duration-200" style="display:block;">
      <defs>
        <!-- Die Body Ivory Gradient -->
        <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ffffff" />
          <stop offset="45%" stop-color="#f8fafc" />
          <stop offset="85%" stop-color="#e2e8f0" />
          <stop offset="100%" stop-color="#cbd5e1" />
        </linearGradient>

        <!-- Red Pip Radial Depth (Recessed concave carved indentation) -->
        <radialGradient id="pip-red" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#f87171" />
          <stop offset="45%" stop-color="#dc2626" />
          <stop offset="85%" stop-color="#991b1b" />
          <stop offset="100%" stop-color="#7f1d1d" />
        </radialGradient>

        <!-- Blue Pip Radial Depth (Recessed concave carved indentation) -->
        <radialGradient id="pip-blue" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#60a5fa" />
          <stop offset="45%" stop-color="#2563eb" />
          <stop offset="85%" stop-color="#1e40af" />
          <stop offset="100%" stop-color="#1e3a8a" />
        </radialGradient>
      </defs>

      <!-- Die Base Rect -->
      <rect x="2.5" y="2.5" width="55" height="55" rx="13" 
            fill="url(#${gradId})" 
            stroke="${isDark ? '#64748b' : '#cbd5e1'}" 
            stroke-width="1.8" />

      <!-- Specular Bevel Highlight (Curved light reflection on top) -->
      <path d="M 6 15 Q 30 8 54 15 Q 48 23 30 21 Q 12 23 6 15 Z" fill="#ffffff" opacity="0.65" />

      <!-- Pips (Dots) -->
      ${pips.map(p => `
        <g>
          <!-- Subtle concave depth shadow -->
          <circle cx="${p.x}" cy="${p.y + 0.6}" r="${p.r}" fill="rgba(0,0,0,0.22)" />
          <!-- Carved colored pip -->
          <circle cx="${p.x}" cy="${p.y}" r="${p.r}" 
                  fill="${p.color === 'red' ? 'url(#pip-red)' : 'url(#pip-blue)'}" 
                  stroke="rgba(0,0,0,0.15)" stroke-width="0.75" />
          <!-- Inner specular reflection dot -->
          <circle cx="${p.x - p.r * 0.3}" cy="${p.y - p.r * 0.3}" r="${p.r * 0.28}" fill="#ffffff" opacity="0.45" />
        </g>
      `).join('')}
    </svg>
  `;
}

export class SnakeLadderGame implements GameInstance {
  private container: HTMLElement;
  private session: GameSession;
  private currentTheme: AppTheme;

  private engine: SnakeLadderEngine;
  private renderer: SnakeLadderRenderer;
  private ai?: SnakeLadderAI;

  private opponentName: string = 'Opponent';
  private isProcessingMove: boolean = false;
  private isRollingDiceAnimation: boolean = false;
  private isAIThinking: boolean = false;

  // Initial Roll Duel state
  private playerDuelD1: number | null = null;
  private playerDuelD2: number | null = null;
  private oppDuelD1: number | null = null;
  private oppDuelD2: number | null = null;
  private isDuelRolling: boolean = false;
  private lastDice: DiceRoll = { d1: 1, d2: 1, total: 2, isDouble: false };

  constructor(container: HTMLElement, session: GameSession) {
    this.container = container;
    this.session = session;
    this.currentTheme = session.theme;

    // Set opponent display name
    if (session.mode === 'ai') {
      const diffLabel = (session.aiDifficulty || 'medium').toUpperCase();
      this.opponentName = `AI (${diffLabel})`;
      this.ai = new SnakeLadderAI(session.aiDifficulty);
    } else {
      this.opponentName = session.peer?.role === 'host' ? 'Guest' : 'Host';
    }

    this.engine = new SnakeLadderEngine();
    this.renderer = new SnakeLadderRenderer();

    this.render();
    this.setupNetwork();
    this.updateHUD();

    // If host in online PvP, generate and sync board config
    if (this.session.mode === 'online' && this.session.peer?.role === 'host') {
      this.session.peer.sendMessage({
        type: 'SNAKE_INIT_BOARD',
        board: this.engine.board
      });
    }

    const matchParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('match') : null;
    if (matchParam === '1') {
      this.engine.chooseStartTurn('start_first');
      this.hideDuelModal();
      this.engine.playerPos = 24;
      this.engine.opponentPos = 18;
      this.lastDice = { d1: 4, d2: 2, total: 6, isDouble: false };
      this.updateHUD();
      this.renderBoard();
    }
  }

  public destroy() {
    this.isProcessingMove = false;
    this.isAIThinking = false;
    this.container.innerHTML = '';
  }

  public setTheme(theme: AppTheme) {
    this.currentTheme = theme;
    const wrapper = document.getElementById('sl-outer-wrapper');
    if (wrapper) {
      if (theme === 'dark') {
        wrapper.classList.remove('bg-gray-50', 'text-gray-900');
        wrapper.classList.add('bg-gray-950', 'text-white');
      } else {
        wrapper.classList.remove('bg-gray-950', 'text-white');
        wrapper.classList.add('bg-gray-50', 'text-gray-900');
      }
    }
    this.renderBoard();
    this.updateDiceDisplay(this.lastDice);
    this.updateHUD();
  }

  // -------------------------------------------------------------
  // NETWORK HANDLING (PVP)
  // -------------------------------------------------------------
  private setupNetwork() {
    if (!this.session.peer) return;

    const origOnMessage = this.session.peer.events?.onMessage;
    const origOnStatusChange = this.session.peer.events?.onStatusChange;

    this.session.peer = Object.assign(this.session.peer, {
      events: {
        ...this.session.peer.events,
        onMessage: (msg: NetworkMessage) => {
          origOnMessage?.(msg);
          this.handleNetworkMessage(msg);
        },
        onStatusChange: (status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error', message?: string) => {
          origOnStatusChange?.(status, message);
          if (status === 'connected') {
            if (this.session.peer?.role === 'host') {
              this.session.peer.sendMessage({
                type: 'SNAKE_INIT_BOARD',
                board: this.engine.board
              });
            } else if (this.session.peer?.role === 'guest') {
              this.session.peer.sendMessage({
                type: 'SNAKE_REQUEST_BOARD'
              });
            }
          }
        }
      }
    });

    // Send board request/init if already connected
    if (this.session.peer.isConnected) {
      if (this.session.peer.role === 'host') {
        this.session.peer.sendMessage({
          type: 'SNAKE_INIT_BOARD',
          board: this.engine.board
        });
      } else if (this.session.peer.role === 'guest') {
        this.session.peer.sendMessage({
          type: 'SNAKE_REQUEST_BOARD'
        });
      }
    }
  }

  private handleNetworkMessage(msg: any) {
    switch (msg.type) {
      case 'PLAYER_LEAVE':
        this.showGameOverModal(true, 'Opponent left the game.');
        break;
      case 'SNAKE_REQUEST_BOARD':
        if (this.session.peer?.role === 'host') {
          this.session.peer.sendMessage({
            type: 'SNAKE_INIT_BOARD',
            board: this.engine.board
          });
        }
        break;
      case 'SNAKE_INIT_BOARD':
        // Guest receives host's randomized board config
        this.engine.reset(msg.board);
        this.renderBoard();
        this.updateHUD();
        break;
      case 'SNAKE_MOVE_COMPLETE':
        this.engine.opponentPos = msg.finalPos;
        this.renderBoard();
        this.updateHUD();
        break;
      case 'SNAKE_INITIAL_ROLL':
        this.oppDuelD1 = msg.d1;
        this.oppDuelD2 = msg.d2;
        this.engine.rollInitial('opponent', { d1: msg.d1, d2: msg.d2 });
        sounds.playDiceRoll();
        this.updateDuelModal();
        break;
      case 'SNAKE_INITIAL_CHOICE':
        this.engine.chooseStartTurn(msg.choice);
        this.hideDuelModal();
        this.updateHUD();
        break;
      case 'SNAKE_DICE_ROLL':
        this.animateAndExecuteMove('opponent', {
          d1: msg.d1,
          d2: msg.d2,
          total: msg.total,
          isDouble: msg.isDouble
        });
        break;
      case 'REMATCH_REQUEST':
        this.showRematchOffer();
        break;
      case 'REMATCH_ACCEPT':
        this.hideGameOverModal();
        const newBoard = msg.seed ? generateBoard(msg.seed) : generateBoard();
        this.engine.reset(newBoard);
        this.playerDuelD1 = null;
        this.playerDuelD2 = null;
        this.oppDuelD1 = null;
        this.oppDuelD2 = null;
        this.isDuelRolling = false;
        this.lastDice = { d1: 1, d2: 1, total: 2, isDouble: false };
        this.updateDiceDisplay(this.lastDice);
        this.renderBoard();
        this.updateHUD();
        this.showDuelModal();
        break;
    }
  }

  // -------------------------------------------------------------
  // DOM RENDERING & STRUCTURE
  // -------------------------------------------------------------
  private render() {
    const isDark = this.currentTheme === 'dark';

    this.container.innerHTML = `
      <div id="sl-outer-wrapper" class="w-full h-screen max-h-screen overflow-hidden flex flex-col items-center justify-between p-1.5 sm:p-2.5 lg:p-3 select-none ${isDark ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900'}">
        
        <!-- Top Information & Score Strip -->
        <div class="w-full max-w-5xl flex flex-col shrink-0 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'} pb-1.5 gap-1">
          <!-- Row 1: Exit & Title -->
          <div class="w-full flex items-center justify-between px-1 text-xs">
            <button id="btn-sl-exit" class="ps-btn-secondary px-3 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1 cursor-pointer active:scale-95" title="Exit to Game Hub">
              <span>← Exit</span>
            </button>
            <span class="text-[11px] font-bold text-gray-400 font-mono tracking-wider uppercase">SNAKES & LADDERS • 100 TILES</span>
            <span class="text-[10px] font-mono text-gray-400 hidden sm:inline">${this.session.mode === 'ai' ? 'VS AI' : '1V1 ONLINE'}</span>
          </div>

          <!-- Row 2: Players Status & Turn Center Banner -->
          <div class="w-full flex items-center justify-between px-1 text-xs gap-1.5">
            <!-- Player 1 (YOU) -->
            <div class="flex items-center space-x-1.5 min-w-[85px] sm:min-w-[120px]">
              <div class="w-6 h-6 sm:w-7 sm:h-7 shrink-0 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center shadow-xs">
                <span class="text-xs font-black text-blue-400">P</span>
              </div>
              <div class="flex flex-col">
                <span class="text-[10px] sm:text-xs font-bold text-blue-600 dark:text-blue-400 leading-tight">YOU</span>
                <span id="badge-player-tile" class="px-1.5 py-0.2 rounded bg-blue-600/15 dark:bg-blue-600/20 text-blue-700 dark:text-blue-300 font-mono text-[10px] sm:text-xs font-extrabold">TILE 1</span>
              </div>
            </div>

            <!-- Turn Banner (Center) -->
            <div id="sl-status-banner" class="flex-1 max-w-[180px] sm:max-w-[260px] flex flex-col items-center px-2 py-0.5 rounded-xl bg-emerald-600/15 border border-emerald-500/30 text-center mx-auto transition-all">
              <div id="sl-status-text" class="text-[11px] sm:text-xs md:text-sm font-black tracking-wide text-emerald-600 dark:text-emerald-400 uppercase truncate w-full">YOUR TURN</div>
              <div id="sl-hint-text" class="text-[9px] sm:text-[11px] font-medium text-gray-500 dark:text-gray-400 truncate w-full">Roll both dice to advance</div>
            </div>

            <!-- Opponent -->
            <div class="flex items-center justify-end space-x-1.5 min-w-[85px] sm:min-w-[120px] text-right">
              <div class="flex flex-col items-end">
                <span class="text-[10px] sm:text-xs font-bold text-rose-600 dark:text-rose-400 leading-tight truncate max-w-[85px] sm:max-w-[120px]">${this.opponentName}</span>
                <span id="badge-opponent-tile" class="px-1.5 py-0.2 rounded bg-rose-600/15 dark:bg-rose-600/20 text-rose-700 dark:text-rose-300 font-mono text-[10px] sm:text-xs font-extrabold">TILE 1</span>
              </div>
              <div class="w-6 h-6 sm:w-7 sm:h-7 shrink-0 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shadow-xs">
                <span class="text-xs font-black text-rose-400">O</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Main Playing Area: Board + Controls -->
        <div class="w-full flex-1 min-h-0 flex flex-col lg:flex-row items-center justify-center gap-2 sm:gap-3 lg:gap-8 px-1 sm:px-2 my-auto overflow-hidden">
          
          <!-- 10x10 Board Viewport -->
          <div class="flex items-center justify-center h-full max-h-[min(560px,calc(100vh-175px))] lg:max-h-[min(560px,calc(100vh-90px))] aspect-square shrink-0">
            <div id="sl-board-viewport" class="relative w-full h-full rounded-2xl shadow-2xl overflow-hidden">
              <!-- SVG Board mounts here -->
            </div>
          </div>

          <!-- Controls & 2-Dice Area (Side station on desktop, bottom bar on mobile) -->
          <div class="w-full max-w-xs lg:w-72 flex flex-col items-center justify-center shrink-0 lg:p-5 lg:rounded-3xl ${isDark ? 'lg:bg-gray-900/90 lg:border lg:border-gray-800' : 'lg:bg-white/95 lg:border lg:border-gray-200'} lg:shadow-2xl gap-2 lg:gap-4 pb-1">
            
            <!-- Desktop Header in Dice Card -->
            <div class="hidden lg:flex items-center justify-between w-full border-b ${isDark ? 'border-gray-800' : 'border-gray-200'} pb-2">
              <span class="text-xs font-black tracking-wider uppercase text-amber-500">DICE CONTROLS</span>
              <span class="text-[11px] font-bold text-gray-400 font-mono">GOAL: 100</span>
            </div>

            <!-- Two Dice Faces Display -->
            <div class="flex items-center space-x-3">
              <div id="dice-face-1" class="transform transition-transform duration-200">
                ${renderDiceFace(1, isDark)}
              </div>
              <div id="dice-face-2" class="transform transition-transform duration-200">
                ${renderDiceFace(1, isDark)}
              </div>
              <div class="flex flex-col items-start pl-1">
                <span id="dice-total-text" class="text-lg sm:text-xl font-black font-mono text-amber-500 leading-none">TOTAL: 2</span>
                <span id="dice-doubles-tag" class="text-[10px] sm:text-xs font-bold text-amber-400 opacity-0 transition-opacity">★ DOUBLES!</span>
              </div>
            </div>

            <!-- Roll Dice Button -->
            <button id="btn-roll-dice" class="w-full max-w-xs lg:max-w-none py-2.5 px-6 rounded-xl font-black tracking-wider uppercase text-white bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-500 shadow-lg shadow-orange-500/30 active:scale-95 transition-all cursor-pointer">
              🎲 ROLL DICE
            </button>
          </div>

        </div>

        <!-- Initial Roll Duel Modal Overlay -->
        <div id="modal-roll-duel" class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div class="w-full max-w-sm rounded-3xl ps-card p-5 flex flex-col items-center text-center shadow-2xl border ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'} animate-in fade-in zoom-in-95 duration-200">
            <h3 class="text-xl sm:text-2xl font-black mb-1 text-amber-400 tracking-wide">ROLL FOR THE START</h3>
            <p id="duel-modal-desc" class="text-xs sm:text-sm text-gray-400 mb-4">Roll 2 dice! Highest total chooses who goes first.</p>

            <!-- Duel Dice Arena (Two Columns: You vs Opponent) -->
            <div class="w-full grid grid-cols-2 gap-3 mb-4">
              <!-- Player Column -->
              <div class="flex flex-col items-center p-3 rounded-2xl bg-blue-500/10 border border-blue-500/30">
                <span class="text-xs font-bold text-blue-400 mb-2">YOU</span>
                <div class="flex space-x-1.5 mb-2" id="duel-player-dice-container">
                  <div id="duel-player-d1">${renderDiceFace(null, isDark)}</div>
                  <div id="duel-player-d2">${renderDiceFace(null, isDark)}</div>
                </div>
                <span id="duel-player-total" class="text-sm font-black font-mono text-blue-300">Ready</span>
              </div>

              <!-- Opponent Column -->
              <div class="flex flex-col items-center p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30">
                <span class="text-xs font-bold text-rose-400 mb-2">${this.opponentName}</span>
                <div class="flex space-x-1.5 mb-2" id="duel-opp-dice-container">
                  <div id="duel-opp-d1">${renderDiceFace(null, isDark)}</div>
                  <div id="duel-opp-d2">${renderDiceFace(null, isDark)}</div>
                </div>
                <span id="duel-opp-total" class="text-sm font-black font-mono text-rose-300">Ready</span>
              </div>
            </div>

            <!-- Duel Result / Action Area -->
            <div id="duel-action-area" class="w-full flex flex-col items-center gap-2">
              <button id="btn-duel-roll" class="w-full py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-orange-500/25 cursor-pointer active:scale-95">
                ROLL 2 DICE
              </button>
            </div>
          </div>
        </div>

        <!-- Game Over Modal Overlay -->
        <div id="modal-game-over" class="fixed inset-0 z-50 hidden flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div class="w-full max-w-sm rounded-3xl ps-card p-6 flex flex-col items-center text-center shadow-2xl border ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'} animate-in fade-in zoom-in-95 duration-200">
            <div id="game-over-icon" class="text-5xl mb-2">🏆</div>
            <h3 id="game-over-title" class="text-2xl font-black mb-1">VICTORY!</h3>
            <p id="game-over-desc" class="text-xs sm:text-sm text-gray-400 mb-5">You reached tile 100 first!</p>
            <div class="w-full flex space-x-2">
              <button id="btn-sl-rematch" class="flex-1 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30 cursor-pointer active:scale-95">
                Play Again
              </button>
              <button id="btn-game-over-exit" class="flex-1 py-2.5 rounded-xl font-bold text-sm bg-gray-700 hover:bg-gray-600 text-white cursor-pointer active:scale-95">
                Exit
              </button>
            </div>
          </div>
        </div>

      </div>
    `;

    this.bindEvents();
    this.renderBoard();
  }

  private bindEvents() {
    document.getElementById('btn-sl-exit')?.addEventListener('click', () => {
      this.session.onExit();
    });

    document.getElementById('btn-game-over-exit')?.addEventListener('click', () => {
      this.session.onExit();
    });

    document.getElementById('btn-roll-dice')?.addEventListener('click', () => {
      this.handlePlayerRollDice();
    });

    document.getElementById('btn-duel-roll')?.addEventListener('click', () => {
      this.handleDuelRoll();
    });

    document.getElementById('btn-sl-rematch')?.addEventListener('click', () => {
      this.handleRematchClick();
    });
  }

  private renderBoard(highlightTile?: number) {
    const viewport = document.getElementById('sl-board-viewport');
    if (!viewport) return;
    viewport.innerHTML = this.renderer.renderSVG(
      this.engine.board,
      this.engine.playerPos,
      this.engine.opponentPos,
      this.engine.currentTurn,
      this.currentTheme,
      highlightTile
    );
  }

  // -------------------------------------------------------------
  // INITIAL ROLL DUEL LOGIC
  // -------------------------------------------------------------
  private handleDuelRoll() {
    if (this.isDuelRolling || this.playerDuelD1 !== null) return;
    this.isDuelRolling = true;
    this.updateDuelModal();
    sounds.playDiceRoll();

    const d1El = document.getElementById('duel-player-d1');
    const d2El = document.getElementById('duel-player-d2');
    d1El?.classList.add('animate-bounce');
    d2El?.classList.add('animate-bounce');

    setTimeout(() => {
      d1El?.classList.remove('animate-bounce');
      d2El?.classList.remove('animate-bounce');

      const roll = this.engine.rollInitial('player');
      this.playerDuelD1 = roll.d1;
      this.playerDuelD2 = roll.d2;
      this.isDuelRolling = false;

      // Sync to peer if online
      if (this.session.mode === 'online' && this.session.peer?.isConnected) {
        this.session.peer.sendMessage({
          type: 'SNAKE_INITIAL_ROLL',
          d1: roll.d1,
          d2: roll.d2,
          total: roll.total
        });
      }

      // If AI, AI rolls its dice after delay
      if (this.session.mode === 'ai') {
        const delay = this.ai?.getThinkingDelay() || 700;
        setTimeout(() => {
          const aiRoll = this.engine.rollInitial('opponent');
          this.oppDuelD1 = aiRoll.d1;
          this.oppDuelD2 = aiRoll.d2;
          sounds.playDiceRoll();
          this.updateDuelModal();
        }, delay);
      }

      this.updateDuelModal();
    }, 450);
  }

  private updateDuelModal() {
    const isDark = this.currentTheme === 'dark';

    const pD1 = document.getElementById('duel-player-d1');
    const pD2 = document.getElementById('duel-player-d2');
    const pTot = document.getElementById('duel-player-total');

    const oD1 = document.getElementById('duel-opp-d1');
    const oD2 = document.getElementById('duel-opp-d2');
    const oTot = document.getElementById('duel-opp-total');

    if (pD1) pD1.innerHTML = renderDiceFace(this.playerDuelD1, isDark);
    if (pD2) pD2.innerHTML = renderDiceFace(this.playerDuelD2, isDark);
    if (pTot) {
      if (this.playerDuelD1 !== null) {
        pTot.textContent = `Total: ${this.playerDuelD1 + this.playerDuelD2!}`;
      } else if (this.isDuelRolling) {
        pTot.textContent = 'Rolling...';
      } else {
        pTot.textContent = 'Ready';
      }
    }

    if (oD1) oD1.innerHTML = renderDiceFace(this.oppDuelD1, isDark);
    if (oD2) oD2.innerHTML = renderDiceFace(this.oppDuelD2, isDark);
    if (oTot) {
      if (this.oppDuelD1 !== null) {
        oTot.textContent = `Total: ${this.oppDuelD1 + this.oppDuelD2!}`;
      } else if (this.playerDuelD1 !== null) {
        oTot.textContent = 'Rolling...';
      } else {
        oTot.textContent = 'Ready';
      }
    }

    const actionArea = document.getElementById('duel-action-area');
    const desc = document.getElementById('duel-modal-desc');
    if (!actionArea) return;

    // Both players finished rolling
    if (this.engine.duelWinner !== null) {
      if (this.engine.duelWinner === 'tie') {
        if (desc) desc.textContent = '🎲 TIE! Both players rolled the same total. Roll again!';
        actionArea.innerHTML = `
          <button id="btn-duel-reroll" class="w-full py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-orange-500/25 cursor-pointer active:scale-95">
            REROLL TIE
          </button>
        `;
        document.getElementById('btn-duel-reroll')?.addEventListener('click', () => {
          this.engine.resetTieRolls();
          this.playerDuelD1 = null;
          this.playerDuelD2 = null;
          this.oppDuelD1 = null;
          this.oppDuelD2 = null;
          this.isDuelRolling = false;
          this.updateDuelModal();
        });
      } else if (this.engine.duelWinner === 'player') {
        if (desc) desc.textContent = '🎉 You won the roll! Choose who starts the match:';
        actionArea.innerHTML = `
          <div class="w-full flex space-x-2">
            <button id="btn-choice-first" class="flex-1 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-500/25 cursor-pointer active:scale-95">
              PLAY FIRST
            </button>
            <button id="btn-choice-second" class="flex-1 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-gray-700 hover:bg-gray-600 text-white shadow-md cursor-pointer active:scale-95">
              PLAY SECOND
            </button>
          </div>
        `;
        document.getElementById('btn-choice-first')?.addEventListener('click', () => {
          this.selectStartTurn('start_first');
        });
        document.getElementById('btn-choice-second')?.addEventListener('click', () => {
          this.selectStartTurn('start_second');
        });
      } else {
        // Opponent won roll
        if (this.session.mode === 'ai') {
          const choice = this.ai?.decideStartChoice(this.engine) || 'start_first';
          if (desc) desc.textContent = `${this.opponentName} won the roll and chose to ${choice === 'start_first' ? 'play first' : 'play second'}!`;
          actionArea.innerHTML = `<span class="text-xs font-bold text-amber-400 animate-pulse">Starting game...</span>`;
          setTimeout(() => {
            this.engine.chooseStartTurn(choice);
            this.hideDuelModal();
            this.updateHUD();
            if (this.engine.currentTurn === 'opponent') {
              this.processAITurn();
            }
          }, 1200);
        } else {
          if (desc) desc.textContent = `${this.opponentName} won the roll. Awaiting their choice...`;
          actionArea.innerHTML = `<span class="text-xs font-bold text-gray-400 animate-pulse">Waiting for opponent choice...</span>`;
        }
      }
    } else {
      // duelWinner is null: either before rolling, or during rolling
      if (this.isDuelRolling) {
        if (desc) desc.textContent = 'Rolling both dice...';
        actionArea.innerHTML = `<span class="text-xs font-bold text-amber-400 animate-pulse">Rolling dice...</span>`;
      } else if (this.playerDuelD1 !== null) {
        if (desc) desc.textContent = this.session.mode === 'ai' ? `${this.opponentName} is rolling...` : `Waiting for ${this.opponentName} to roll...`;
        actionArea.innerHTML = `<span class="text-xs font-bold text-gray-400 animate-pulse">Waiting for opponent...</span>`;
      } else {
        // Ready to roll! (Initial match start and on Rematch)
        if (desc) desc.textContent = 'Roll 2 dice! Highest total chooses who goes first.';
        actionArea.innerHTML = `
          <button id="btn-duel-roll" class="w-full py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-orange-500/25 cursor-pointer active:scale-95">
            ROLL 2 DICE
          </button>
        `;
        document.getElementById('btn-duel-roll')?.addEventListener('click', () => {
          this.handleDuelRoll();
        });
      }
    }
  }

  private selectStartTurn(choice: 'start_first' | 'start_second') {
    this.engine.chooseStartTurn(choice);

    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      // In guest's perspective, choices are reversed
      const peerChoice = choice === 'start_first' ? 'start_second' : 'start_first';
      this.session.peer.sendMessage({
        type: 'SNAKE_INITIAL_CHOICE',
        choice: peerChoice
      });
    }

    this.hideDuelModal();
    this.updateHUD();

    if (this.session.mode === 'ai' && this.engine.currentTurn === 'opponent') {
      this.processAITurn();
    }
  }

  private hideDuelModal() {
    const modal = document.getElementById('modal-roll-duel');
    if (modal) modal.classList.add('hidden');
  }

  private showDuelModal() {
    const modal = document.getElementById('modal-roll-duel');
    if (modal) modal.classList.remove('hidden');
    this.updateDuelModal();
  }

  // -------------------------------------------------------------
  // IN-GAME DICE ROLLING & TOKEN MOVEMENT
  // -------------------------------------------------------------
  private handlePlayerRollDice() {
    if (
      this.isProcessingMove ||
      this.isRollingDiceAnimation ||
      this.engine.phase !== 'PLAYING' ||
      this.engine.currentTurn !== 'player'
    ) {
      return;
    }

    this.isRollingDiceAnimation = true;
    this.updateHUD();
    sounds.playDiceRoll();

    const d1El = document.getElementById('dice-face-1');
    const d2El = document.getElementById('dice-face-2');
    d1El?.classList.add('animate-bounce');
    d2El?.classList.add('animate-bounce');

    const roll = this.engine.rollDice();

    setTimeout(() => {
      d1El?.classList.remove('animate-bounce');
      d2El?.classList.remove('animate-bounce');
      this.isRollingDiceAnimation = false;

      // Broadcast to peer if online
      if (this.session.mode === 'online' && this.session.peer?.isConnected) {
        this.session.peer.sendMessage({
          type: 'SNAKE_DICE_ROLL',
          d1: roll.d1,
          d2: roll.d2,
          total: roll.total,
          isDouble: roll.isDouble
        });
      }

      this.animateAndExecuteMove('player', roll);
    }, 450);
  }

  private processAITurn() {
    if (
      this.session.mode !== 'ai' ||
      this.isAIThinking ||
      this.isProcessingMove ||
      this.engine.phase !== 'PLAYING' ||
      this.engine.currentTurn !== 'opponent'
    ) {
      return;
    }

    this.isAIThinking = true;
    this.updateHUD();

    const delay = this.ai?.getThinkingDelay() || 900;
    setTimeout(() => {
      if (this.engine.phase !== 'PLAYING' || this.engine.currentTurn !== 'opponent') {
        this.isAIThinking = false;
        return;
      }

      this.isRollingDiceAnimation = true;
      this.updateHUD();
      sounds.playDiceRoll();

      const d1El = document.getElementById('dice-face-1');
      const d2El = document.getElementById('dice-face-2');
      d1El?.classList.add('animate-bounce');
      d2El?.classList.add('animate-bounce');

      const roll = this.engine.rollDice();

      setTimeout(() => {
        d1El?.classList.remove('animate-bounce');
        d2El?.classList.remove('animate-bounce');
        this.isRollingDiceAnimation = false;
        this.isAIThinking = false;

        this.animateAndExecuteMove('opponent', roll);
      }, 450);
    }, delay);
  }

  private async animateAndExecuteMove(playerId: PlayerId, dice: DiceRoll) {
    this.isProcessingMove = true;
    this.lastDice = dice;
    this.updateDiceDisplay(dice);

    const result = this.engine.executeMove(playerId, dice);

    // Animate step-by-step hopping
    const startTile = result.from;
    const normalSteps = result.steps.filter(s => s.type === 'step' || s.type === 'bounce');

    let runningPos = startTile;
    for (const st of normalSteps) {
      runningPos = st.tile;
      if (playerId === 'player') {
        this.engine.playerPos = runningPos;
      } else {
        this.engine.opponentPos = runningPos;
      }
      sounds.playStep();
      this.renderBoard(runningPos);
      this.updateHUD();
      await this.sleep(130);
    }

    // Check ladder or snake climax
    if (result.hitLadder) {
      await this.sleep(250);
      sounds.playLadderClimb();
      if (playerId === 'player') {
        this.engine.playerPos = result.hitLadder.to;
      } else {
        this.engine.opponentPos = result.hitLadder.to;
      }
      this.renderBoard(result.hitLadder.to);
      this.updateHUD();
      await this.sleep(400);
    } else if (result.hitSnake) {
      await this.sleep(250);
      sounds.playSnakeSlide();
      if (playerId === 'player') {
        this.engine.playerPos = result.hitSnake.to;
      } else {
        this.engine.opponentPos = result.hitSnake.to;
      }
      this.renderBoard(result.hitSnake.to);
      this.updateHUD();
      await this.sleep(400);
    }

    this.isProcessingMove = false;
    this.renderBoard();
    this.updateHUD();

    if (playerId === 'player' && this.session.mode === 'online' && this.session.peer?.isConnected) {
      this.session.peer.sendMessage({
        type: 'SNAKE_MOVE_COMPLETE',
        finalPos: this.engine.playerPos
      });
    }

    // Check game over
    if (result.won) {
      sounds.playFanfare();
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
      const didIWin = playerId === 'player';
      this.showGameOverModal(didIWin, didIWin ? 'You conquered tile 100 first!' : `${this.opponentName} reached tile 100 first.`);
      return;
    }

    // If doubles, same player rolls again
    if (result.extraTurn) {
      if (playerId === 'opponent' && this.session.mode === 'ai') {
        this.processAITurn();
      }
    } else {
      if (this.engine.currentTurn === 'opponent' && this.session.mode === 'ai') {
        this.processAITurn();
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // -------------------------------------------------------------
  // HUD UPDATES & CONTROLS
  // -------------------------------------------------------------
  private updateDiceDisplay(dice: DiceRoll) {
    const isDark = this.currentTheme === 'dark';
    const d1El = document.getElementById('dice-face-1');
    const d2El = document.getElementById('dice-face-2');
    const totalEl = document.getElementById('dice-total-text');
    const doublesTag = document.getElementById('dice-doubles-tag');

    if (d1El) d1El.innerHTML = renderDiceFace(dice.d1, isDark);
    if (d2El) d2El.innerHTML = renderDiceFace(dice.d2, isDark);
    if (totalEl) totalEl.textContent = `TOTAL: ${dice.total}`;

    if (doublesTag) {
      if (dice.isDouble) {
        doublesTag.classList.remove('opacity-0');
        doublesTag.classList.add('opacity-100');
        doublesTag.textContent = `★ DOUBLES (${dice.d1}+${dice.d2})! ROLL AGAIN!`;
      } else {
        doublesTag.classList.remove('opacity-100');
        doublesTag.classList.add('opacity-0');
      }
    }
  }

  private updateHUD() {
    const statusBanner = document.getElementById('sl-status-banner');
    const statusText = document.getElementById('sl-status-text');
    const hintText = document.getElementById('sl-hint-text');
    const btnRoll = document.getElementById('btn-roll-dice') as HTMLButtonElement | null;
    const badgePlayer = document.getElementById('badge-player-tile');
    const badgeOpponent = document.getElementById('badge-opponent-tile');

    if (badgePlayer) badgePlayer.textContent = `TILE ${this.engine.playerPos}`;
    if (badgeOpponent) badgeOpponent.textContent = `TILE ${this.engine.opponentPos}`;

    if (this.engine.phase === 'ROLL_FOR_START' || this.engine.phase === 'START_CHOICE') {
      if (statusBanner) {
        statusBanner.className = 'flex-1 max-w-[180px] sm:max-w-[260px] flex flex-col items-center px-2 py-0.5 rounded-xl bg-amber-600/15 border border-amber-500/30 text-center mx-auto';
      }
      if (statusText) {
        statusText.textContent = 'ROLL FOR START';
        statusText.className = 'text-[11px] sm:text-xs md:text-sm font-black tracking-wide text-amber-600 dark:text-amber-400 uppercase truncate w-full';
      }
      if (hintText) {
        hintText.textContent = 'Highest roll chooses start order';
      }
      if (btnRoll) {
        btnRoll.disabled = true;
        btnRoll.classList.add('opacity-50', 'cursor-not-allowed');
      }
      return;
    }

    const isMyTurn = this.engine.currentTurn === 'player';

    if (statusBanner) {
      statusBanner.className = isMyTurn
        ? 'flex-1 max-w-[180px] sm:max-w-[260px] flex flex-col items-center px-2 py-0.5 rounded-xl bg-emerald-600/15 border border-emerald-500/30 text-center mx-auto'
        : 'flex-1 max-w-[180px] sm:max-w-[260px] flex flex-col items-center px-2 py-0.5 rounded-xl bg-rose-600/15 border border-rose-500/30 text-center mx-auto';
    }

    if (statusText) {
      if (this.isProcessingMove) {
        statusText.textContent = isMyTurn ? 'MOVING...' : `${this.opponentName.toUpperCase()} MOVING...`;
      } else if (this.isAIThinking) {
        statusText.textContent = `${this.opponentName.toUpperCase()} ROLLING...`;
      } else {
        statusText.textContent = isMyTurn ? 'YOUR TURN' : `${this.opponentName.toUpperCase()}'S TURN`;
      }
      statusText.className = isMyTurn
        ? 'text-[11px] sm:text-xs md:text-sm font-black tracking-wide text-emerald-600 dark:text-emerald-400 uppercase truncate w-full'
        : 'text-[11px] sm:text-xs md:text-sm font-black tracking-wide text-rose-600 dark:text-rose-400 uppercase truncate w-full';
    }

    if (hintText) {
      if (this.engine.consecutiveDoubles > 0) {
        hintText.textContent = isMyTurn ? 'Rolled doubles! Roll again!' : `${this.opponentName} rolled doubles!`;
      } else {
        hintText.textContent = isMyTurn ? 'Roll both dice to advance' : `Waiting for ${this.opponentName}...`;
      }
    }

    if (btnRoll) {
      const canRoll = isMyTurn && !this.isProcessingMove && !this.isRollingDiceAnimation && this.engine.phase === 'PLAYING';
      btnRoll.disabled = !canRoll;
      if (canRoll) {
        btnRoll.classList.remove('opacity-50', 'cursor-not-allowed');
        btnRoll.classList.add('cursor-pointer');
      } else {
        btnRoll.classList.add('opacity-50', 'cursor-not-allowed');
        btnRoll.classList.remove('cursor-pointer');
      }
    }
  }

  // -------------------------------------------------------------
  // GAME OVER & REMATCH
  // -------------------------------------------------------------
  private showGameOverModal(didIWin: boolean, message: string) {
    const modal = document.getElementById('modal-game-over');
    const icon = document.getElementById('game-over-icon');
    const title = document.getElementById('game-over-title');
    const desc = document.getElementById('game-over-desc');

    if (icon) icon.textContent = didIWin ? '🏆' : '💀';
    if (title) title.textContent = didIWin ? 'VICTORY!' : 'DEFEAT!';
    if (desc) desc.textContent = message;

    if (modal) modal.classList.remove('hidden');
  }

  private hideGameOverModal() {
    const modal = document.getElementById('modal-game-over');
    if (modal) modal.classList.add('hidden');
  }

  private handleRematchClick() {
    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      this.session.peer.sendMessage({
        type: 'REMATCH_REQUEST'
      });
      const btn = document.getElementById('btn-sl-rematch');
      if (btn) {
        btn.textContent = 'Waiting for Opponent...';
        btn.setAttribute('disabled', 'true');
      }
    } else {
      // AI rematch: fresh randomized board
      this.hideGameOverModal();
      this.engine.reset();
      this.playerDuelD1 = null;
      this.playerDuelD2 = null;
      this.oppDuelD1 = null;
      this.oppDuelD2 = null;
      this.isDuelRolling = false;
      this.lastDice = { d1: 1, d2: 1, total: 2, isDouble: false };
      this.updateDiceDisplay(this.lastDice);
      this.renderBoard();
      this.updateHUD();
      this.showDuelModal();
    }
  }

  private showRematchOffer() {
    const btn = document.getElementById('btn-sl-rematch');
    if (btn) {
      btn.removeAttribute('disabled');
      btn.textContent = 'Opponent Wants Rematch! Accept?';
      btn.className = 'ps-btn-primary px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider animate-bounce';
      btn.onclick = () => {
        const seed = Math.floor(Math.random() * 10000000);
        this.session.peer?.sendMessage({
          type: 'REMATCH_ACCEPT',
          seed
        });
        this.hideGameOverModal();
        this.engine.reset(generateBoard(seed));
        this.playerDuelD1 = null;
        this.playerDuelD2 = null;
        this.oppDuelD1 = null;
        this.oppDuelD2 = null;
        this.isDuelRolling = false;
        this.lastDice = { d1: 1, d2: 1, total: 2, isDouble: false };
        this.updateDiceDisplay(this.lastDice);
        this.renderBoard();
        this.updateHUD();
        this.showDuelModal();
      };
    }
  }
}
