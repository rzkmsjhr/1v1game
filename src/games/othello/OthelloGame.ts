import confetti from 'canvas-confetti';
import { OthelloEngine, BOARD_SIZE, type PlayerColor, type MoveResult } from './othello-engine';
import type { GameInstance, GameSession, AppTheme } from '../types';
import type { NetworkHealth, NetworkMessage } from '../../network/webrtc-peer';
import { sounds } from '../../engine/sound';

function renderDiceFace(value: number | null, isDark: boolean): string {
  if (value === null) {
    return `
      <div class="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl ${isDark ? 'bg-gray-800/80 border-gray-700' : 'bg-gray-100 border-gray-300'} border-2 flex items-center justify-center shadow-inner">
        <span class="text-3xl font-extrabold text-gray-500 animate-pulse">?</span>
      </div>
    `;
  }

  const pips: Record<number, number[]> = {
    1: [4],
    2: [2, 6],
    3: [2, 4, 6],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8]
  };

  const activePips = pips[value] || [];

  return `
    <div class="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl ${isDark ? 'bg-gradient-to-br from-gray-800 to-gray-900 border-emerald-500/40' : 'bg-gradient-to-br from-white to-gray-100 border-emerald-600/40'} border-2 p-3 shadow-xl grid grid-cols-3 grid-rows-3 gap-1 transform transition-transform duration-300">
      ${Array.from({ length: 9 }).map((_, i) => `
        <div class="flex items-center justify-center">
          ${activePips.includes(i) ? `
            <div class="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full ${isDark ? 'bg-emerald-400 shadow-emerald-400/50' : 'bg-emerald-600 shadow-emerald-600/30'} shadow"></div>
          ` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

export class OthelloGame implements GameInstance {
  private container: HTMLElement;
  private session: GameSession;
  private engine: OthelloEngine;
  private currentTheme: AppTheme;

  private gamePhase: 'ai_setup' | 'dice_rolling' | 'dice_choosing' | 'playing' = 'playing';

  private myPlayer: PlayerColor = 1; // 1 = Black, 2 = White
  private isMyTurn: boolean = true;
  private isProcessing: boolean = false;
  private forfeitMessage: string | null = null;

  // Dice roll duel state (online)
  private myDiceRoll: number | null = null;
  private opponentDiceRoll: number | null = null;
  private isRollingAnimation: boolean = false;
  private diceWinner: 'me' | 'opponent' | 'tie' | null = null;
  private rematchState: 'idle' | 'requested' | 'offer_received' = 'idle';

  // DOM Caching & Persistent Grid
  private isShellRendered: boolean = false;
  private cellEls: (HTMLElement | null)[][] = [];
  private boardGridEl: HTMLElement | null = null;
  private scoreBlackEl: HTMLElement | null = null;
  private scoreWhiteEl: HTMLElement | null = null;
  private cardBlackEl: HTMLElement | null = null;
  private cardWhiteEl: HTMLElement | null = null;
  private turnTextEl: HTMLElement | null = null;
  private turnIndicatorEl: HTMLElement | null = null;
  private modalLayerEl: HTMLElement | null = null;
  private rematchBannerEl: HTMLElement | null = null;
  private activeDiceInterval: any = null;

  // Network Health HUD elements
  private pingEl: HTMLElement | null = null;
  private pingDotEl: HTMLElement | null = null;
  private pingTextEl: HTMLElement | null = null;
  private peerAwayBannerEl: HTMLElement | null = null;

  constructor(container: HTMLElement, session: GameSession) {
    this.container = container;
    this.session = session;
    this.currentTheme = session.theme;
    this.engine = new OthelloEngine();

    if (session.mode === 'online') {
      this.gamePhase = 'dice_rolling';
      this.setupNetworkListeners();
    } else {
      this.gamePhase = 'ai_setup';
    }

    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('snap') === 'othello') {
      this.gamePhase = 'playing';
      this.myPlayer = 1;
      this.isMyTurn = true;
      this.engine.makeMove(2, 3);
      this.engine.makeMove(2, 2);
      this.engine.makeMove(3, 2);
      this.engine.makeMove(4, 2);
      this.engine.makeMove(2, 4);
      this.engine.makeMove(5, 2);
      this.engine.makeMove(5, 3);
      this.engine.makeMove(1, 2);
    }

    this.render();
  }

  public setTheme(theme: AppTheme) {
    if (this.currentTheme === theme && this.isShellRendered) return;
    this.currentTheme = theme;
    this.isShellRendered = false;
    this.render();
  }

  public destroy() {
    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      this.session.peer.sendMessage({ type: 'PLAYER_LEAVE' });
    }
    if (this.activeDiceInterval) {
      clearInterval(this.activeDiceInterval);
      this.activeDiceInterval = null;
    }
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    this.cellEls = [];
    this.boardGridEl = null;
    this.scoreBlackEl = null;
    this.scoreWhiteEl = null;
    this.cardBlackEl = null;
    this.cardWhiteEl = null;
    this.turnTextEl = null;
    this.turnIndicatorEl = null;
    this.modalLayerEl = null;
    this.rematchBannerEl = null;
    this.pingEl = null;
    this.pingDotEl = null;
    this.pingTextEl = null;
    this.peerAwayBannerEl = null;
    this.container.innerHTML = '';
  }

  private handleBeforeUnload = () => {
    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      this.session.peer.sendMessage({ type: 'PLAYER_LEAVE' });
    }
  };

  private setupNetworkListeners() {
    if (!this.session.peer) return;

    const peer = this.session.peer;
    const origOnMessage = (peer as any).events?.onMessage;
    const origOnStatusChange = (peer as any).events?.onStatusChange;
    const origOnHealthChange = (peer as any).events?.onHealthChange;

    this.session.peer = Object.assign(peer, {
      events: {
        ...(peer as any).events,
        onMessage: (msg: NetworkMessage) => {
          origOnMessage?.(msg);
          this.handleNetworkMessage(msg);
        },
        onStatusChange: (status: string, message?: string) => {
          origOnStatusChange?.(status, message);
          if (status === 'disconnected') {
            this.handleForfeitVictory('Opponent disconnected from the match.');
          }
        },
        onHealthChange: (health: NetworkHealth) => {
          origOnHealthChange?.(health);
          this.updateNetworkHealthHUD(health);
        }
      }
    });

    peer.flushEarlyMessages?.();

    if (peer.isConnected) {
      this.updateNetworkHealthHUD({
        rtt: peer.currentRtt,
        status: peer.networkQuality,
        isPeerVisible: peer.isPeerVisible
      });
    }

    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  private updateNetworkHealthHUD(health: NetworkHealth) {
    if (!this.pingEl || !this.pingDotEl || !this.pingTextEl) return;
    this.pingEl.classList.remove('hidden');
    this.pingEl.classList.add('inline-flex');

    if (health.status === 'stalled') {
      this.pingDotEl.className = 'w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping';
      this.pingTextEl.textContent = 'Lag ⚠️';
      this.pingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 rounded px-1.5 py-0.5 shadow-sm';
    } else if (health.status === 'poor') {
      this.pingDotEl.className = 'w-1.5 h-1.5 rounded-full bg-rose-400';
      this.pingTextEl.textContent = `${health.rtt}ms`;
      this.pingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 rounded px-1.5 py-0.5 shadow-sm';
    } else if (health.status === 'moderate') {
      this.pingDotEl.className = 'w-1.5 h-1.5 rounded-full bg-amber-400';
      this.pingTextEl.textContent = `${health.rtt}ms`;
      this.pingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 rounded px-1.5 py-0.5 shadow-sm';
    } else {
      this.pingDotEl.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400';
      this.pingTextEl.textContent = `${health.rtt || 28}ms`;
      this.pingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 rounded px-1.5 py-0.5 shadow-sm';
    }

    if (this.peerAwayBannerEl) {
      if (!health.isPeerVisible) {
        this.peerAwayBannerEl.classList.remove('hidden');
      } else {
        this.peerAwayBannerEl.classList.add('hidden');
      }
    }
  }

  private handleForfeitVictory(reason: string) {
    if (this.engine.isGameOver) {
      this.renderRematchBanner();
      return;
    }

    if (this.activeDiceInterval) {
      clearInterval(this.activeDiceInterval);
      this.activeDiceInterval = null;
    }
    this.isRollingAnimation = false;

    this.gamePhase = 'playing';
    this.engine.isGameOver = true;
    this.forfeitMessage = reason;

    sounds.playWin();
    confetti({ particleCount: 120, spread: 80 });

    this.renderModalLayer();
    this.updateHUD();
    this.renderRematchBanner();
  }

  private handleNetworkMessage(msg: any) {
    if (msg.type === 'PLAYER_LEAVE') {
      this.handleForfeitVictory('Opponent forfeited the match.');
    } else if (msg.type === 'OTHELLO_DICE_ROLL') {
      sounds.playDiceRoll();
      const oppDice = document.getElementById('opp-dice-container');
      const oppDiceText = document.getElementById('opp-dice-label');
      if (oppDice) oppDice.classList.add('animate-bounce');
      if (oppDiceText) oppDiceText.textContent = 'Rolling...';

      let oppTicks = 0;
      const oppInterval = setInterval(() => {
        oppTicks++;
        const randomFace = 1 + Math.floor(Math.random() * 6);
        if (oppDice) {
          oppDice.innerHTML = renderDiceFace(randomFace, this.currentTheme === 'dark');
        }
        if (oppTicks >= 8) {
          clearInterval(oppInterval);
          if (oppDice) oppDice.classList.remove('animate-bounce');
          this.opponentDiceRoll = msg.value;
          sounds.playHardDrop();
          this.renderModalLayer();
          this.evaluateDiceRolls();
        }
      }, 50);
    } else if (msg.type === 'OTHELLO_COLOR_CHOICE') {
      // Winner chose msg.chosenColor, so I get the opposite color
      this.myPlayer = msg.chosenColor === 1 ? 2 : 1;
      this.isMyTurn = this.myPlayer === 1;
      this.gamePhase = 'playing';
      sounds.playRotate();
      this.renderModalLayer();
      this.updateHUD();
      this.updateAllCells();
    } else if (msg.type === 'OTHELLO_MOVE') {
      const move = this.engine.makeMove(msg.r, msg.c);
      if (move) {
        this.executeMoveWithAnimation(msg.r, msg.c, move, false);
      }
    } else if (msg.type === 'OTHELLO_REMATCH_REQUEST' || msg.type === 'REMATCH_REQUEST') {
      this.showRematchOffer();
    } else if (msg.type === 'OTHELLO_REMATCH_ACCEPT' || msg.type === 'REMATCH_ACCEPT') {
      this.resetMatch();
    }
  }

  private handleAIRandomize() {
    const btnLabel = document.getElementById('btn-randomize-label');
    const previewDisc = document.getElementById('ai-disc-preview');
    if (btnLabel) btnLabel.textContent = 'Randomizing...';

    sounds.playDiceRoll();

    let flips = 0;
    const interval = setInterval(() => {
      flips++;
      const tempColor = flips % 2 === 0 ? 1 : 2;
      if (previewDisc) {
        if (tempColor === 1) {
          previewDisc.className = 'w-20 h-20 sm:w-24 sm:h-24 rounded-full shadow-2xl transition-all duration-150 flex items-center justify-center border-2 border-emerald-500/40 bg-gradient-to-br from-gray-800 to-black scale-105';
          previewDisc.innerHTML = '<div class="w-8 h-8 rounded-full bg-gray-700/50"></div>';
        } else {
          previewDisc.className = 'w-20 h-20 sm:w-24 sm:h-24 rounded-full shadow-2xl transition-all duration-150 flex items-center justify-center border-2 border-emerald-500/40 bg-gradient-to-br from-white to-gray-200 scale-105';
          previewDisc.innerHTML = '<div class="w-8 h-8 rounded-full bg-gray-300/60"></div>';
        }
      }

      if (flips >= 10) {
        clearInterval(interval);
        const finalColor: PlayerColor = Math.random() < 0.5 ? 1 : 2;
        sounds.playHardDrop();
        this.selectAIPiece(finalColor);
      }
    }, 90);
  }

  private selectAIPiece(color: PlayerColor) {
    this.myPlayer = color;
    this.isMyTurn = this.myPlayer === 1;
    this.gamePhase = 'playing';
    this.renderModalLayer();
    this.updateHUD();
    this.updateAllCells();

    // If player is White (2), AI is Black (1) and must make the first move!
    if (this.myPlayer === 2) {
      this.isMyTurn = false;
      this.isProcessing = true;
      this.updateHUD();
      setTimeout(() => {
        this.makeAIMove();
      }, 600);
    }
  }

  private handleRollDice() {
    if (this.isRollingAnimation || this.myDiceRoll !== null) return;
    this.isRollingAnimation = true;
    sounds.playDiceRoll();

    const myDice = document.getElementById('my-dice-container');
    const myDiceText = document.getElementById('my-dice-label');
    if (myDice) myDice.classList.add('animate-bounce');
    if (myDiceText) myDiceText.textContent = 'Rolling...';

    let rollTicks = 0;
    if (this.activeDiceInterval) clearInterval(this.activeDiceInterval);
    this.activeDiceInterval = setInterval(() => {
      rollTicks++;
      const randomFace = 1 + Math.floor(Math.random() * 6);
      if (myDice) {
        myDice.innerHTML = renderDiceFace(randomFace, this.currentTheme === 'dark');
      }

      if (rollTicks >= 8) {
        clearInterval(this.activeDiceInterval);
        this.activeDiceInterval = null;
        this.isRollingAnimation = false;
        if (myDice) myDice.classList.remove('animate-bounce');

        const val = 1 + Math.floor(Math.random() * 6);
        this.myDiceRoll = val;
        sounds.playHardDrop();

        if (this.session.peer?.isConnected) {
          this.session.peer.sendMessage({
            type: 'OTHELLO_DICE_ROLL',
            value: val
          });
        }

        this.renderModalLayer();
        this.evaluateDiceRolls();
      }
    }, 50);
  }

  private evaluateDiceRolls() {
    if (this.myDiceRoll === null || this.opponentDiceRoll === null) return;

    if (this.myDiceRoll > this.opponentDiceRoll) {
      this.diceWinner = 'me';
      this.gamePhase = 'dice_choosing';
      sounds.playWin();
      confetti({ particleCount: 70, spread: 60 });
      this.renderModalLayer();
    } else if (this.myDiceRoll < this.opponentDiceRoll) {
      this.diceWinner = 'opponent';
      this.gamePhase = 'dice_choosing';
      this.renderModalLayer();
    } else {
      // Tie!
      this.diceWinner = 'tie';
      sounds.playRotate();
      this.renderModalLayer();

      setTimeout(() => {
        this.myDiceRoll = null;
        this.opponentDiceRoll = null;
        this.diceWinner = null;
        this.gamePhase = 'dice_rolling';
        this.renderModalLayer();
      }, 1500);
    }
  }

  private handleOnlineColorChoice(chosenColor: PlayerColor) {
    this.myPlayer = chosenColor;
    this.isMyTurn = this.myPlayer === 1;
    this.gamePhase = 'playing';

    if (this.session.peer?.isConnected) {
      this.session.peer.sendMessage({
        type: 'OTHELLO_COLOR_CHOICE',
        chosenColor,
        chooserRole: this.session.peer?.role || 'host'
      });
    }

    sounds.playRotate();
    this.renderModalLayer();
    this.updateHUD();
    this.updateAllCells();
  }

  private getDiscMarkup(color: PlayerColor, isLast: boolean = false, extraClasses: string = ''): string {
    if (color === 1) {
      return `
        <div class="othello-disc w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-gray-800 to-black border border-gray-700 shadow-md ${isLast ? 'ring-2 ring-emerald-400 scale-105' : ''} ${extraClasses} flex items-center justify-center select-none pointer-events-none" style="transform-style: preserve-3d; backface-visibility: hidden; will-change: transform;">
          <div class="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-gray-700/40"></div>
        </div>
      `;
    } else {
      return `
        <div class="othello-disc w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-white to-gray-200 border border-gray-300 shadow-md ${isLast ? 'ring-2 ring-emerald-400 scale-105' : ''} ${extraClasses} flex items-center justify-center select-none pointer-events-none" style="transform-style: preserve-3d; backface-visibility: hidden; will-change: transform;">
          <div class="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-gray-300/60"></div>
        </div>
      `;
    }
  }

  private getHintDotMarkup(): string {
    return `<div class="othello-hint-dot w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-emerald-300/50 hover:bg-emerald-300 hover:scale-125 transition-all pointer-events-none animate-pulse"></div>`;
  }

  private getStarPointMarkup(): string {
    return `<div class="absolute w-1.5 h-1.5 rounded-full bg-emerald-900/60 pointer-events-none star-point"></div>`;
  }

  private render() {
    if (!this.isShellRendered) {
      this.renderShell();
    }
    this.updateHUD();
    this.updateAllCells();
    this.renderModalLayer();
    this.renderRematchBanner();
  }

  private renderShell() {
    const isDark = this.currentTheme === 'dark';

    this.container.innerHTML = `
      <div class="w-full max-w-2xl flex flex-col items-center justify-center p-3 sm:p-4 relative">
        
        <!-- Top Status Bar (Locked height & overflow-protected to eliminate screen push/jump) -->
        <div class="w-full h-11 min-h-[44px] max-h-[44px] shrink-0 flex items-center justify-between px-1 mb-2 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}">
          <button id="btn-othello-exit" class="ps-btn-secondary px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1 shrink-0 active:scale-95 transition-transform" title="Exit to Arcade Hub">
            <span>← Exit</span>
          </button>
          
          <div class="flex-1 min-w-0 flex items-center justify-center space-x-2 px-2 overflow-hidden">
            <span id="othello-turn-text" class="text-xs font-bold uppercase tracking-wider text-gray-400 truncate whitespace-nowrap">
              Initializing...
            </span>
            <div id="othello-turn-indicator" class="w-3 h-3 shrink-0 rounded-full bg-gray-900 border border-gray-600 animate-pulse"></div>
          </div>

          <div class="flex items-center space-x-1.5 shrink-0 text-right">
            <div id="othello-net-ping" class="hidden items-center space-x-1 text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-300/40 dark:border-emerald-500/30 rounded px-1.5 py-0.5 shadow-sm">
              <span id="othello-net-dot" class="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400"></span>
              <span id="othello-net-text">--ms</span>
            </div>
            <span class="text-xs font-mono text-gray-500">
              ${this.session.mode === 'ai' ? `AI: ${this.session.aiDifficulty?.toUpperCase()}` : '1V1 ONLINE'}
            </span>
          </div>
        </div>

        <!-- Inactive Tab / Opponent Away Banner -->
        <div id="othello-peer-away-banner" class="hidden w-full px-2 py-0.5 mb-2 text-center rounded-lg bg-amber-100 dark:bg-amber-500/20 border border-amber-300/40 dark:border-amber-500/40 text-amber-700 dark:text-amber-300 font-bold text-[10px] tracking-wide animate-pulse">
          ⚠️ Opponent is tabbed out / minimized
        </div>

        <!-- Disc Score Cards -->
        <div class="w-full grid grid-cols-2 gap-3 mb-4 max-w-md">
          <!-- Black Player Card -->
          <div id="card-black" class="ps-card rounded-2xl p-3 flex items-center justify-between border-2 transition-all duration-300 border-transparent">
            <div class="flex items-center space-x-2.5">
              <div class="w-7 h-7 rounded-full bg-gradient-to-br from-gray-800 to-black border border-gray-600 shadow flex items-center justify-center">
                <div class="w-2.5 h-2.5 rounded-full bg-gray-700/50"></div>
              </div>
              <div>
                <div id="label-black-role" class="text-[10px] font-bold uppercase text-gray-400">BLACK ${this.myPlayer === 1 ? '(YOU)' : ''}</div>
                <div id="label-black-name" class="text-xs font-medium text-gray-500">${this.session.mode === 'ai' ? (this.myPlayer === 1 ? 'Player' : `AI (${this.session.aiDifficulty})`) : (this.myPlayer === 1 ? 'You' : 'Opponent')}</div>
              </div>
            </div>
            <div id="score-black" class="text-2xl font-black font-mono">2</div>
          </div>

          <!-- White Player Card -->
          <div id="card-white" class="ps-card rounded-2xl p-3 flex items-center justify-between border-2 transition-all duration-300 border-transparent">
            <div class="flex items-center space-x-2.5">
              <div class="w-7 h-7 rounded-full bg-gradient-to-br from-white to-gray-200 border border-gray-300 shadow flex items-center justify-center">
                <div class="w-2.5 h-2.5 rounded-full bg-gray-300/60"></div>
              </div>
              <div>
                <div id="label-white-role" class="text-[10px] font-bold uppercase text-gray-400">WHITE ${this.myPlayer === 2 ? '(YOU)' : ''}</div>
                <div id="label-white-name" class="text-xs font-medium text-gray-500">${this.session.mode === 'ai' ? (this.myPlayer === 2 ? 'Player' : `AI (${this.session.aiDifficulty})`) : (this.myPlayer === 2 ? 'You' : 'Opponent')}</div>
              </div>
            </div>
            <div id="score-white" class="text-2xl font-black font-mono">2</div>
          </div>
        </div>

        <!-- Othello 8x8 Board -->
        <div class="relative ps-card p-3 sm:p-4 rounded-3xl ${isDark ? 'bg-[#0f1f18] border-emerald-900/60' : 'bg-[#1b5e3b] border-emerald-800'} shadow-2xl">
          <div id="othello-board-grid" class="grid grid-cols-8 gap-1 sm:gap-1.5 p-1 bg-[#10482d] rounded-2xl border border-emerald-700/40">
            ${Array.from({ length: BOARD_SIZE }).map((_, r) =>
              Array.from({ length: BOARD_SIZE }).map((_, c) => `
                <div class="othello-cell w-9 h-9 sm:w-12 sm:h-12 rounded-lg bg-[#19643d] hover:bg-[#1f784a] flex items-center justify-center relative cursor-pointer select-none transition-colors" data-r="${r}" data-c="${c}" style="perspective: 500px;">
                </div>
              `).join('')
            ).join('')}
          </div>
        </div>

        <!-- Rematch Banner Container -->
        <div id="othello-rematch-layer" class="w-full"></div>

        <!-- Modal Layer Container -->
        <div id="othello-modal-layer"></div>

      </div>
    `;

    // Cache DOM nodes
    this.boardGridEl = this.container.querySelector('#othello-board-grid');
    this.scoreBlackEl = this.container.querySelector('#score-black');
    this.scoreWhiteEl = this.container.querySelector('#score-white');
    this.cardBlackEl = this.container.querySelector('#card-black');
    this.cardWhiteEl = this.container.querySelector('#card-white');
    this.turnTextEl = this.container.querySelector('#othello-turn-text');
    this.turnIndicatorEl = this.container.querySelector('#othello-turn-indicator');
    this.rematchBannerEl = this.container.querySelector('#othello-rematch-layer');
    this.modalLayerEl = this.container.querySelector('#othello-modal-layer');
    this.pingEl = this.container.querySelector('#othello-net-ping');
    this.pingDotEl = this.container.querySelector('#othello-net-dot');
    this.pingTextEl = this.container.querySelector('#othello-net-text');
    this.peerAwayBannerEl = this.container.querySelector('#othello-peer-away-banner');

    this.cellEls = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        this.cellEls[r][c] = this.boardGridEl?.querySelector(`[data-r="${r}"][data-c="${c}"]`) as HTMLElement | null;
      }
    }

    // Delegated Board Click Listener
    this.boardGridEl?.addEventListener('click', (e) => {
      if (this.gamePhase !== 'playing' || this.isProcessing || !this.isMyTurn || this.engine.isGameOver) return;
      const cell = (e.target as HTMLElement).closest('.othello-cell') as HTMLElement | null;
      if (!cell) return;
      const r = parseInt(cell.dataset.r || '-1', 10);
      const c = parseInt(cell.dataset.c || '-1', 10);
      if (r >= 0 && c >= 0) {
        this.handleCellClick(r, c);
      }
    });

    // Exit Button
    document.getElementById('btn-othello-exit')?.addEventListener('click', () => {
      if (this.session.mode === 'online' && this.session.peer?.isConnected) {
        this.session.peer.sendMessage({ type: 'PLAYER_LEAVE' });
      }
      this.session.onExit();
    });

    this.isShellRendered = true;
  }

  private updateHUD() {
    const scores = this.engine.getScores();

    let turnText = '';
    let turnClass = '';

    if (this.forfeitMessage) {
      turnText = 'Win by Forfeit';
      turnClass = 'text-emerald-500 font-bold';
    } else if (this.engine.isGameOver) {
      if (scores.black === scores.white) {
        turnText = 'Game Drawn!';
        turnClass = 'text-gray-400';
      } else {
        const winner = scores.black > scores.white ? 1 : 2;
        const isWinner = winner === this.myPlayer;
        turnText = isWinner ? 'You Win!' : 'Opponent Wins!';
        turnClass = isWinner ? 'text-emerald-500' : 'text-rose-500';
      }
    } else if (this.engine.passedTurn) {
      turnText = this.isMyTurn ? 'Opponent Passed' : 'You Passed';
      turnClass = 'text-amber-500';
    } else if (this.isMyTurn) {
      turnText = 'Your Turn';
      turnClass = 'text-emerald-500';
    } else {
      turnText = this.session.mode === 'ai' ? 'AI Thinking...' : "Opponent's Turn";
      turnClass = 'text-gray-400';
    }

    if (this.turnTextEl) {
      this.turnTextEl.textContent = turnText;
      this.turnTextEl.className = `text-xs font-bold uppercase tracking-wider truncate whitespace-nowrap ${turnClass}`;
    }

    if (this.turnIndicatorEl) {
      const isPlaying = !this.engine.isGameOver && this.gamePhase === 'playing';
      const discColorClass = this.engine.currentPlayer === 1
        ? 'bg-gray-900 border border-gray-600'
        : 'bg-white border border-gray-300';
      const pulseClass = isPlaying ? 'animate-pulse' : '';
      this.turnIndicatorEl.className = `w-3 h-3 rounded-full ${discColorClass} ${pulseClass}`;
    }

    if (this.scoreBlackEl) {
      const s = String(scores.black);
      if (this.scoreBlackEl.textContent !== s) {
        this.scoreBlackEl.textContent = s;
      }
    }

    if (this.scoreWhiteEl) {
      const s = String(scores.white);
      if (this.scoreWhiteEl.textContent !== s) {
        this.scoreWhiteEl.textContent = s;
      }
    }

    const isPlaying = !this.engine.isGameOver && this.gamePhase === 'playing';
    if (this.cardBlackEl) {
      const isActive = this.engine.currentPlayer === 1 && isPlaying;
      if (isActive) {
        this.cardBlackEl.classList.add('border-emerald-500', 'shadow-md', 'shadow-emerald-500/10');
        this.cardBlackEl.classList.remove('border-transparent');
      } else {
        this.cardBlackEl.classList.remove('border-emerald-500', 'shadow-md', 'shadow-emerald-500/10');
        this.cardBlackEl.classList.add('border-transparent');
      }
    }

    if (this.cardWhiteEl) {
      const isActive = this.engine.currentPlayer === 2 && isPlaying;
      if (isActive) {
        this.cardWhiteEl.classList.add('border-emerald-500', 'shadow-md', 'shadow-emerald-500/10');
        this.cardWhiteEl.classList.remove('border-transparent');
      } else {
        this.cardWhiteEl.classList.remove('border-emerald-500', 'shadow-md', 'shadow-emerald-500/10');
        this.cardWhiteEl.classList.add('border-transparent');
      }
    }

    // Role / Name labels
    const labelBlackRole = this.container.querySelector('#label-black-role');
    const labelBlackName = this.container.querySelector('#label-black-name');
    if (labelBlackRole) labelBlackRole.textContent = `BLACK ${this.myPlayer === 1 ? '(YOU)' : ''}`;
    if (labelBlackName) {
      labelBlackName.textContent = this.session.mode === 'ai'
        ? (this.myPlayer === 1 ? 'Player' : `AI (${this.session.aiDifficulty})`)
        : (this.myPlayer === 1 ? 'You' : 'Opponent');
    }

    const labelWhiteRole = this.container.querySelector('#label-white-role');
    const labelWhiteName = this.container.querySelector('#label-white-name');
    if (labelWhiteRole) labelWhiteRole.textContent = `WHITE ${this.myPlayer === 2 ? '(YOU)' : ''}`;
    if (labelWhiteName) {
      labelWhiteName.textContent = this.session.mode === 'ai'
        ? (this.myPlayer === 2 ? 'Player' : `AI (${this.session.aiDifficulty})`)
        : (this.myPlayer === 2 ? 'You' : 'Opponent');
    }
  }

  private clearHintDots() {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (this.engine.board[r][c] === 0) {
          const cellEl = this.cellEls[r]?.[c];
          if (cellEl) {
            const isStar = (r === 2 || r === 6) && (c === 2 || c === 6);
            cellEl.innerHTML = isStar ? this.getStarPointMarkup() : '';
          }
        }
      }
    }
  }

  private updateCell(r: number, c: number, isValid: boolean) {
    const cellEl = this.cellEls[r]?.[c];
    if (!cellEl) return;

    const cell = this.engine.board[r][c];
    const isLast = this.engine.lastMove !== null && this.engine.lastMove[0] === r && this.engine.lastMove[1] === c;
    const isStar = (r === 2 || r === 6) && (c === 2 || c === 6);

    if (cell === 1) {
      cellEl.innerHTML = this.getDiscMarkup(1, isLast);
    } else if (cell === 2) {
      cellEl.innerHTML = this.getDiscMarkup(2, isLast);
    } else {
      if (isValid) {
        cellEl.innerHTML = `${isStar ? this.getStarPointMarkup() : ''}${this.getHintDotMarkup()}`;
      } else {
        cellEl.innerHTML = isStar ? this.getStarPointMarkup() : '';
      }
    }
  }

  private updateAllCells() {
    const validMoves = !this.engine.isGameOver && this.isMyTurn && this.gamePhase === 'playing'
      ? this.engine.getValidMoves()
      : [];
    const validSet = new Set(validMoves.map(([vr, vc]) => `${vr},${vc}`));

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        this.updateCell(r, c, validSet.has(`${r},${c}`));
      }
    }
  }

  private renderRematchBanner() {
    if (!this.rematchBannerEl) return;

    if (!this.engine.isGameOver) {
      this.rematchBannerEl.innerHTML = '';
      return;
    }

    const isConnected = this.session.mode === 'online' && this.session.peer?.isConnected;
    const isPeerGone = this.session.mode === 'online' && !isConnected;

    let rematchBtnText = 'Play Again';
    let rematchBtnClass = 'ps-btn-primary px-8 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-emerald-500/25 active:scale-95 cursor-pointer';
    let isRematchDisabled = false;

    if (isPeerGone) {
      rematchBtnText = 'Opponent Disconnected';
      rematchBtnClass = 'ps-btn-primary px-8 py-3 rounded-2xl text-sm font-bold opacity-50 cursor-not-allowed pointer-events-none';
      isRematchDisabled = true;
    } else if (this.rematchState === 'requested') {
      rematchBtnText = 'Waiting for Opponent...';
      rematchBtnClass = 'ps-btn-primary px-8 py-3 rounded-2xl text-sm font-bold opacity-70 cursor-not-allowed pointer-events-none';
      isRematchDisabled = true;
    } else if (this.rematchState === 'offer_received') {
      rematchBtnText = 'Accept Rematch!';
      rematchBtnClass = 'w-full max-w-xs py-3 px-6 rounded-2xl font-black text-sm uppercase tracking-wider text-white bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 shadow-lg shadow-emerald-500/30 active:scale-95 transition-all cursor-pointer animate-pulse';
    }

    const scores = this.engine.getScores();
    const isDraw = scores.black === scores.white;
    const winner = scores.black > scores.white ? 1 : 2;
    const isWinner = !isDraw && winner === this.myPlayer;
    const myScore = this.myPlayer === 1 ? scores.black : scores.white;
    const oppScore = this.myPlayer === 1 ? scores.white : scores.black;

    this.rematchBannerEl.innerHTML = `
      <div class="mt-5 flex flex-col items-center space-y-3">
        ${this.forfeitMessage ? `
          <div class="text-center space-y-1">
            <h3 class="text-2xl sm:text-3xl font-extrabold mb-1 text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500">
              🏆 VICTORY BY FORFEIT!
            </h3>
            <p class="text-xs sm:text-sm text-gray-400">
              ${this.forfeitMessage}
            </p>
          </div>
        ` : `
          <div class="text-center space-y-1">
            <h3 class="text-2xl sm:text-3xl font-extrabold mb-1 ${isWinner ? 'text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500' : (isDraw ? 'text-gray-300' : 'text-rose-500')}">
              ${isWinner ? '🏆 VICTORY!' : (isDraw ? '🤝 DRAW MATCH!' : '💀 DEFEAT')}
            </h3>
            <p class="text-xs sm:text-sm text-gray-400">
              ${this.rematchState === 'offer_received'
                ? 'Opponent offered a rematch!'
                : (isWinner ? `You dominated the board with ${myScore} discs!` : (isDraw ? 'Both players tied with equal discs!' : `Opponent won with ${oppScore} discs.`))}
            </p>
          </div>
        `}

        <div class="flex items-center space-x-3 w-full max-w-xs justify-center">
          <button id="btn-othello-rematch" class="${rematchBtnClass}" ${isRematchDisabled ? 'disabled' : ''}>
            ${rematchBtnText}
          </button>
          <button id="btn-othello-back" class="ps-btn-secondary px-6 py-3 rounded-2xl text-sm font-bold active:scale-95 cursor-pointer">
            Exit
          </button>
        </div>
      </div>
    `;

    document.getElementById('btn-othello-rematch')?.addEventListener('click', () => {
      this.handleRematchClick();
    });

    document.getElementById('btn-othello-back')?.addEventListener('click', () => {
      if (this.session.mode === 'online' && this.session.peer?.isConnected) {
        this.session.peer.sendMessage({ type: 'PLAYER_LEAVE' });
      }
      this.session.onExit();
    });
  }

  private renderModalLayer() {
    if (!this.modalLayerEl) return;
    const isDark = this.currentTheme === 'dark';

    if (this.gamePhase === 'playing') {
      this.modalLayerEl.innerHTML = '';
      return;
    }

    if (this.gamePhase === 'ai_setup') {
      this.modalLayerEl.innerHTML = `
        <div class="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div class="ps-card rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl border ${isDark ? 'border-gray-800' : 'border-gray-200'}">
            ${this.session.aiDifficulty === 'extreme' ? `
              <!-- Boss Match: Keep Random -->
              <div class="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-bold uppercase tracking-wider mb-4">
                <span>Boss Match 🔥</span>
              </div>
              <h3 class="text-2xl font-extrabold mb-1">Random Piece</h3>
              <p class="text-xs text-gray-400 mb-6">Against the Boss, pieces are assigned at random!</p>

              <!-- Animated Disc Preview -->
              <div class="flex justify-center mb-6">
                <div id="ai-disc-preview" class="w-20 h-20 sm:w-24 sm:h-24 rounded-full shadow-2xl transition-all duration-200 flex items-center justify-center border-2 border-rose-500/40 bg-gradient-to-br from-gray-800 to-black">
                  <div class="w-8 h-8 rounded-full bg-gray-700/50"></div>
                </div>
              </div>

              <div class="space-y-3">
                <button id="btn-othello-randomize" class="ps-btn-primary w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center space-x-2 shadow-lg shadow-rose-500/25 hover:scale-[1.02] transition-transform bg-gradient-to-r from-rose-600 to-red-600">
                  <span>🎲</span>
                  <span id="btn-randomize-label">Spin for Piece</span>
                </button>

                <button id="btn-othello-cancel-setup" class="w-full py-2 text-xs font-semibold text-gray-500 hover:text-gray-400 pt-1">
                  ← Exit to Hub
                </button>
              </div>
            ` : `
              <!-- Easy, Medium, Hard: Choose Freely -->
              <div class="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-4">
                <span>Match Setup (${this.session.aiDifficulty?.toUpperCase()})</span>
              </div>
              <h3 class="text-2xl font-extrabold mb-1">Choose Your Piece</h3>
              <p class="text-xs text-gray-400 mb-6">Select whether you want to play as Black or White</p>

              <div class="grid grid-cols-2 gap-3 mb-5">
                <!-- Choose Black -->
                <button id="btn-choose-black" class="ps-btn-secondary p-4 rounded-2xl flex flex-col items-center justify-center border-2 border-transparent hover:border-emerald-500/60 shadow-lg hover:scale-[1.02] transition-all group">
                  <div class="w-10 h-10 rounded-full bg-gradient-to-br from-gray-800 to-black border-2 border-gray-600 shadow-md mb-2 flex items-center justify-center group-hover:ring-2 group-hover:ring-emerald-400 transition-all">
                    <div class="w-3.5 h-3.5 rounded-full bg-gray-700/60"></div>
                  </div>
                  <span class="text-xs font-bold mb-0.5">Black Piece</span>
                  <span class="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">Moves 1st</span>
                </button>

                <!-- Choose White -->
                <button id="btn-choose-white" class="ps-btn-secondary p-4 rounded-2xl flex flex-col items-center justify-center border-2 border-transparent hover:border-emerald-500/60 shadow-lg hover:scale-[1.02] transition-all group">
                  <div class="w-10 h-10 rounded-full bg-gradient-to-br from-white to-gray-200 border-2 border-gray-300 shadow-md mb-2 flex items-center justify-center group-hover:ring-2 group-hover:ring-emerald-400 transition-all">
                    <div class="w-3.5 h-3.5 rounded-full bg-gray-300/60"></div>
                  </div>
                  <span class="text-xs font-bold mb-0.5">White Piece</span>
                  <span class="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Moves 2nd</span>
                </button>
              </div>

              <button id="btn-othello-cancel-setup" class="w-full py-2 text-xs font-semibold text-gray-500 hover:text-gray-400 pt-1">
                ← Exit to Hub
              </button>
            `}
          </div>
        </div>
      `;

      document.getElementById('btn-othello-randomize')?.addEventListener('click', () => {
        this.handleAIRandomize();
      });
      document.getElementById('btn-choose-black')?.addEventListener('click', () => {
        this.selectAIPiece(1);
      });
      document.getElementById('btn-choose-white')?.addEventListener('click', () => {
        this.selectAIPiece(2);
      });
      document.getElementById('btn-othello-cancel-setup')?.addEventListener('click', () => {
        this.session.onExit();
      });
      return;
    }

    if (this.gamePhase === 'dice_rolling' || this.gamePhase === 'dice_choosing') {
      this.modalLayerEl.innerHTML = `
        <div class="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div class="ps-card rounded-3xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl border ${isDark ? 'border-gray-800' : 'border-gray-200'}">
            <div class="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs font-bold uppercase tracking-wider mb-4">
              <span>1v1 Pre-Match Duel</span>
            </div>
            <h3 class="text-2xl sm:text-3xl font-extrabold mb-1">Roll the Dice</h3>
            <p class="text-xs text-gray-400 mb-6">
              ${this.gamePhase === 'dice_choosing'
                ? (this.diceWinner === 'me' ? '🎉 You won the roll! Choose your piece.' : 'Opponent won the roll. Awaiting their piece choice...')
                : 'Highest roll selects whether to play as Black or White'}
            </p>

            <!-- Dice Box Arena -->
            <div class="grid grid-cols-2 gap-4 mb-6">
              <!-- My Dice -->
              <div class="ps-card rounded-2xl p-4 flex flex-col items-center justify-center border-2 ${this.diceWinner === 'me' ? 'border-emerald-500 shadow-lg shadow-emerald-500/20' : 'border-transparent'}">
                <div class="text-[10px] font-bold uppercase text-gray-400 mb-2">YOU</div>
                <div id="my-dice-container" class="mb-3 transition-transform ${this.isRollingAnimation ? 'animate-bounce' : ''}">
                  ${renderDiceFace(this.myDiceRoll, isDark)}
                </div>
                <div id="my-dice-label" class="text-xs font-mono font-bold">
                  ${this.myDiceRoll !== null ? `Rolled: ${this.myDiceRoll}` : (this.isRollingAnimation ? 'Rolling...' : 'Ready')}
                </div>
              </div>

              <!-- Opponent Dice -->
              <div class="ps-card rounded-2xl p-4 flex flex-col items-center justify-center border-2 ${this.diceWinner === 'opponent' ? 'border-emerald-500 shadow-lg shadow-emerald-500/20' : 'border-transparent'}">
                <div class="text-[10px] font-bold uppercase text-gray-400 mb-2">OPPONENT</div>
                <div id="opp-dice-container" class="mb-3">
                  ${renderDiceFace(this.opponentDiceRoll, isDark)}
                </div>
                <div id="opp-dice-label" class="text-xs font-mono font-bold">
                  ${this.opponentDiceRoll !== null ? `Rolled: ${this.opponentDiceRoll}` : 'Awaiting roll...'}
                </div>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="space-y-3">
              ${this.gamePhase === 'dice_rolling' ? `
                ${this.myDiceRoll === null ? `
                  <button id="btn-roll-dice" class="ps-btn-primary w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/25 ${this.isRollingAnimation ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02]'} transition-all" ${this.isRollingAnimation ? 'disabled' : ''}>
                    <span>🎲</span>
                    <span>ROLL DICE</span>
                  </button>
                ` : `
                  <div class="p-3 rounded-xl bg-gray-800/40 border border-gray-700/50 text-xs text-gray-400 flex items-center justify-center space-x-2">
                    <div class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></div>
                    <span>You rolled <strong>${this.myDiceRoll}</strong>. Waiting for opponent...</span>
                  </div>
                `}
              ` : this.gamePhase === 'dice_choosing' ? `
                ${this.diceWinner === 'me' ? `
                  <div class="space-y-2.5">
                    <div class="text-xs font-bold text-emerald-400">You won the roll (${this.myDiceRoll} vs ${this.opponentDiceRoll})! Pick your piece:</div>
                    <div class="grid grid-cols-2 gap-3">
                      <button id="btn-online-choose-black" class="ps-btn-primary py-3 px-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 shadow-lg shadow-emerald-500/20">
                        <div class="w-3.5 h-3.5 rounded-full bg-black border border-gray-500"></div>
                        <span>Black (1st)</span>
                      </button>
                      <button id="btn-online-choose-white" class="ps-btn-secondary py-3 px-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5">
                        <div class="w-3.5 h-3.5 rounded-full bg-white border border-gray-300"></div>
                        <span>White (2nd)</span>
                      </button>
                    </div>
                  </div>
                ` : `
                  <div class="p-3.5 rounded-2xl bg-gray-800/40 border border-gray-700/50 text-xs text-gray-300 flex items-center justify-center space-x-2">
                    <div class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
                    <span>Opponent rolled higher (${this.opponentDiceRoll} vs ${this.myDiceRoll}). Waiting for their choice...</span>
                  </div>
                `}
              ` : ''}

              ${this.diceWinner === 'tie' ? `
                <div class="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold animate-bounce">
                  ⚡ It's a Tie (${this.myDiceRoll} vs ${this.opponentDiceRoll})! Re-rolling dice...
                </div>
              ` : ''}

              <button id="btn-dice-exit" class="w-full py-2 text-xs font-semibold text-gray-500 hover:text-gray-400">
                ← Exit Match
              </button>
            </div>
          </div>
        </div>
      `;

      document.getElementById('btn-roll-dice')?.addEventListener('click', () => {
        this.handleRollDice();
      });
      document.getElementById('btn-online-choose-black')?.addEventListener('click', () => {
        this.handleOnlineColorChoice(1);
      });
      document.getElementById('btn-online-choose-white')?.addEventListener('click', () => {
        this.handleOnlineColorChoice(2);
      });
      document.getElementById('btn-dice-exit')?.addEventListener('click', () => {
        if (this.session.mode === 'online' && this.session.peer?.isConnected) {
          this.session.peer.sendMessage({ type: 'PLAYER_LEAVE' });
        }
        this.session.onExit();
      });
    }
  }

  private handleCellClick(r: number, c: number) {
    if (this.engine.isGameOver || !this.isMyTurn || this.gamePhase !== 'playing' || this.isProcessing) return;

    const move = this.engine.makeMove(r, c);
    if (!move) return; // Invalid move

    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      this.session.peer.sendMessage({
        type: 'OTHELLO_MOVE',
        r,
        c,
        player: this.myPlayer
      } as any);
    }

    this.executeMoveWithAnimation(r, c, move, true);
  }

  private executeMoveWithAnimation(r: number, c: number, moveResult: MoveResult, _isLocal: boolean) {
    this.isProcessing = true;
    this.clearHintDots();

    // 1. Placed disc pop animation
    const placedCell = this.cellEls[r]?.[c];
    if (placedCell) {
      placedCell.innerHTML = this.getDiscMarkup(moveResult.player, true);
      const disc = placedCell.firstElementChild as HTMLElement | null;
      if (disc) {
        disc.style.transform = 'scale(0.35)';
        disc.style.opacity = '0.5';
        disc.style.transition = 'transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease';
        disc.getBoundingClientRect(); // force reflow
        disc.style.transform = 'scale(1.05)';
        disc.style.opacity = '1';
      }
    }
    sounds.playHardDrop();

    // 2. Group captured discs by Chebyshev distance: max(|fr - r|, |fc - c|)
    const distanceGroups = new Map<number, [number, number][]>();
    for (const [fr, fc] of moveResult.flipped) {
      const dist = Math.max(Math.abs(fr - r), Math.abs(fc - c));
      if (!distanceGroups.has(dist)) {
        distanceGroups.set(dist, []);
      }
      distanceGroups.get(dist)!.push([fr, fc]);
    }

    const sortedDistances = Array.from(distanceGroups.keys()).sort((a, b) => a - b);
    const maxDist = sortedDistances.length > 0 ? sortedDistances[sortedDistances.length - 1] : 1;

    // 3. Stagger flip waves outward
    for (const dist of sortedDistances) {
      const delay = (dist - 1) * 75;
      setTimeout(() => {
        sounds.playRotate();
        const coords = distanceGroups.get(dist) || [];
        for (const [fr, fc] of coords) {
          const cellEl = this.cellEls[fr]?.[fc];
          const discEl = cellEl?.querySelector('.othello-disc') as HTMLElement | null;
          if (discEl) {
            // Half 1: Rotate to 90deg edge-on
            discEl.style.transition = 'transform 110ms ease-in';
            discEl.style.transform = 'rotateY(90deg) scale(1.08)';

            setTimeout(() => {
              if (cellEl) {
                cellEl.innerHTML = this.getDiscMarkup(moveResult.player, false);
                const newDisc = cellEl.firstElementChild as HTMLElement | null;
                if (newDisc) {
                  newDisc.style.transform = 'rotateY(90deg) scale(1.08)';
                  newDisc.getBoundingClientRect(); // force reflow
                  // Half 2: Rotate back to 0deg with spring bounce
                  newDisc.style.transition = 'transform 120ms cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                  newDisc.style.transform = 'rotateY(0deg) scale(1)';
                }
              }
            }, 110);
          } else if (cellEl) {
            cellEl.innerHTML = this.getDiscMarkup(moveResult.player, false);
          }
        }
      }, delay);
    }

    // 4. Conclude move after all wave flips finish
    const totalDuration = (maxDist - 1) * 75 + 240 + 40;
    setTimeout(() => {
      this.isMyTurn = this.engine.currentPlayer === this.myPlayer;
      this.isProcessing = false;
      this.updateHUD();
      this.updateAllCells();
      this.checkGameStatus();

      // If Solo AI mode and AI should make the next move
      const aiPlayer: PlayerColor = this.myPlayer === 1 ? 2 : 1;
      if (!this.engine.isGameOver && this.session.mode === 'ai' && this.engine.currentPlayer === aiPlayer) {
        this.isMyTurn = false;
        this.isProcessing = true;
        this.updateHUD();
        const delay = this.session.aiDifficulty === 'extreme' ? 350 : 500;
        setTimeout(() => {
          this.makeAIMove();
        }, delay);
      }
    }, totalDuration);
  }

  private makeAIMove() {
    if (this.engine.isGameOver || this.gamePhase !== 'playing') return;

    const aiMove = this.engine.getBestAIMove(this.session.aiDifficulty || 'medium');
    if (aiMove) {
      const move = this.engine.makeMove(aiMove[0], aiMove[1]);
      if (move) {
        this.executeMoveWithAnimation(aiMove[0], aiMove[1], move, false);
        return;
      }
    }

    // Fallback if no moves possible
    this.isMyTurn = this.engine.currentPlayer === this.myPlayer;
    this.isProcessing = false;
    this.updateHUD();
    this.updateAllCells();
    this.checkGameStatus();
  }

  private checkGameStatus() {
    if (this.engine.isGameOver) {
      const scores = this.engine.getScores();
      if (scores.black !== scores.white) {
        const winner = scores.black > scores.white ? 1 : 2;
        if (winner === this.myPlayer) {
          sounds.playWin();
          confetti({ particleCount: 120, spread: 75 });
        } else {
          sounds.playGameOver();
        }
      }
      this.updateHUD();
      this.renderRematchBanner();
    }
  }

  private handleRematchClick() {
    if (this.session.mode === 'ai') {
      this.resetMatch();
      return;
    }

    if (!this.session.peer?.isConnected) return;

    if (this.rematchState === 'offer_received') {
      this.session.peer.sendMessage({ type: 'OTHELLO_REMATCH_ACCEPT' });
      this.session.peer.sendMessage({ type: 'REMATCH_ACCEPT' });
      this.resetMatch();
      return;
    }

    if (this.rematchState === 'idle') {
      this.rematchState = 'requested';
      this.session.peer.sendMessage({ type: 'OTHELLO_REMATCH_REQUEST' });
      this.session.peer.sendMessage({ type: 'REMATCH_REQUEST' });
      this.renderRematchBanner();
    }
  }

  private showRematchOffer() {
    if (this.rematchState === 'requested') {
      // Both clicked rematch at around the same time!
      if (this.session.peer?.role === 'host') {
        if (this.session.peer?.isConnected) {
          this.session.peer.sendMessage({ type: 'OTHELLO_REMATCH_ACCEPT' });
          this.session.peer.sendMessage({ type: 'REMATCH_ACCEPT' });
        }
        this.resetMatch();
      }
      return;
    }

    this.rematchState = 'offer_received';
    this.renderRematchBanner();
    sounds.playRoundComplete();
  }

  private resetMatch() {
    this.rematchState = 'idle';
    this.forfeitMessage = null;
    this.engine.reset();
    this.isProcessing = false;

    if (this.session.mode === 'ai') {
      this.gamePhase = 'ai_setup';
    } else {
      this.gamePhase = 'dice_rolling';
      this.myDiceRoll = null;
      this.opponentDiceRoll = null;
      this.diceWinner = null;
    }

    if (this.rematchBannerEl) {
      this.rematchBannerEl.innerHTML = '';
    }

    this.updateHUD();
    this.updateAllCells();
    this.renderModalLayer();
  }
}
