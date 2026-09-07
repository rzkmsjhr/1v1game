import confetti from 'canvas-confetti';
import { OthelloEngine, BOARD_SIZE, type PlayerColor } from './othello-engine';
import type { GameInstance, GameSession, AppTheme } from '../types';
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

    this.render();
  }

  public setTheme(theme: AppTheme) {
    this.currentTheme = theme;
    this.render();
  }

  public destroy() {
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    this.container.innerHTML = '';
  }

  private handleBeforeUnload = () => {
    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      this.session.peer.sendMessage({ type: 'PLAYER_LEAVE' });
    }
  };

  private setupNetworkListeners() {
    if (!this.session.peer) return;

    const origOnMessage = (this.session.peer as any).events?.onMessage;
    const origOnStatusChange = (this.session.peer as any).events?.onStatusChange;

    this.session.peer = Object.assign(this.session.peer, {
      events: {
        ...(this.session.peer as any).events,
        onMessage: (msg: any) => {
          origOnMessage?.(msg);
          this.handleNetworkMessage(msg);
        },
        onStatusChange: (status: string, message?: string) => {
          origOnStatusChange?.(status, message);
          if (status === 'disconnected') {
            this.handleOpponentDisconnected();
          }
        }
      }
    });

    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  private handleOpponentDisconnected() {
    if (this.engine.isGameOver) return;
    this.gamePhase = 'playing';
    this.engine.isGameOver = true;
    this.forfeitMessage = 'Opponent left or disconnected. You win by forfeit!';
    sounds.playWin();
    confetti({ particleCount: 120, spread: 80 });
    this.render();
  }

  private handleNetworkMessage(msg: any) {
    if (msg.type === 'PLAYER_LEAVE') {
      this.handleOpponentDisconnected();
    } else if (msg.type === 'OTHELLO_DICE_ROLL') {
      this.opponentDiceRoll = msg.value;
      sounds.playDiceRoll();
      this.render();
      this.evaluateDiceRolls();
    } else if (msg.type === 'OTHELLO_COLOR_CHOICE') {
      // Winner chose msg.chosenColor, so I get the opposite color
      this.myPlayer = msg.chosenColor === 1 ? 2 : 1;
      this.isMyTurn = this.myPlayer === 1;
      this.gamePhase = 'playing';
      sounds.playRotate();
      this.render();
    } else if (msg.type === 'OTHELLO_MOVE') {
      const move = this.engine.makeMove(msg.r, msg.c);
      if (move) {
        sounds.playHardDrop();
        this.isMyTurn = this.engine.currentPlayer === this.myPlayer;
        this.render();
        this.checkGameStatus();
      }
    } else if (msg.type === 'REMATCH_REQUEST') {
      this.showRematchOffer();
    } else if (msg.type === 'REMATCH_ACCEPT') {
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
    this.render();

    // If player is White (2), AI is Black (1) and must make the first move!
    if (this.myPlayer === 2) {
      this.isMyTurn = false;
      this.isProcessing = true;
      this.render();
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
    myDice?.classList.add('animate-bounce');

    setTimeout(() => {
      this.isRollingAnimation = false;
      myDice?.classList.remove('animate-bounce');
      const val = 1 + Math.floor(Math.random() * 6);
      this.myDiceRoll = val;
      sounds.playHardDrop();

      if (this.session.peer?.isConnected) {
        this.session.peer.sendMessage({
          type: 'OTHELLO_DICE_ROLL',
          value: val
        });
      }

      this.render();
      this.evaluateDiceRolls();
    }, 700);
  }

  private evaluateDiceRolls() {
    if (this.myDiceRoll === null || this.opponentDiceRoll === null) return;

    if (this.myDiceRoll > this.opponentDiceRoll) {
      this.diceWinner = 'me';
      this.gamePhase = 'dice_choosing';
      sounds.playWin();
      confetti({ particleCount: 70, spread: 60 });
      this.render();
    } else if (this.myDiceRoll < this.opponentDiceRoll) {
      this.diceWinner = 'opponent';
      this.gamePhase = 'dice_choosing';
      this.render();
    } else {
      // Tie!
      this.diceWinner = 'tie';
      sounds.playRotate();
      this.render();

      setTimeout(() => {
        this.myDiceRoll = null;
        this.opponentDiceRoll = null;
        this.diceWinner = null;
        this.gamePhase = 'dice_rolling';
        this.render();
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
    this.render();
  }

  private render() {
    const isDark = this.currentTheme === 'dark';
    const scores = this.engine.getScores();
    const validMoves = !this.engine.isGameOver && this.isMyTurn && this.gamePhase === 'playing' ? this.engine.getValidMoves() : [];

    let turnText = '';
    let turnClass = '';

    if (this.forfeitMessage) {
      turnText = this.forfeitMessage;
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
      turnText = this.isMyTurn ? 'Opponent Passed! Your Turn' : 'No Moves! You Passed';
      turnClass = 'text-amber-500';
    } else if (this.isMyTurn) {
      turnText = `Your Turn (${this.myPlayer === 1 ? 'Black' : 'White'})`;
      turnClass = 'text-emerald-500';
    } else {
      turnText = this.session.mode === 'ai' ? 'AI is Thinking...' : "Opponent's Turn";
      turnClass = 'text-gray-400';
    }

    this.container.innerHTML = `
      <div class="w-full max-w-2xl flex flex-col items-center justify-center p-3 sm:p-4 relative">
        
        <!-- Top Status Bar -->
        <div class="w-full flex items-center justify-between py-2.5 mb-3 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}">
          <button id="btn-othello-exit" class="ps-btn-secondary px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5">
            <span>← Exit Game</span>
          </button>
          
          <div class="flex items-center space-x-2">
            <span class="text-xs font-bold uppercase tracking-wider ${turnClass}">
              ${turnText}
            </span>
            <div class="w-3 h-3 rounded-full ${this.engine.currentPlayer === 1 ? 'bg-gray-900 border border-gray-600' : 'bg-white border border-gray-300'} ${!this.engine.isGameOver && this.gamePhase === 'playing' ? 'animate-pulse' : ''}"></div>
          </div>

          <div class="text-xs font-mono text-gray-500">
            ${this.session.mode === 'ai' ? `AI: ${this.session.aiDifficulty?.toUpperCase()}` : '1v1 Online'}
          </div>
        </div>

        <!-- Disc Score Cards -->
        <div class="w-full grid grid-cols-2 gap-3 mb-4 max-w-md">
          <!-- Black Player Card -->
          <div class="ps-card rounded-2xl p-3 flex items-center justify-between border-2 ${this.engine.currentPlayer === 1 && !this.engine.isGameOver && this.gamePhase === 'playing' ? 'border-emerald-500 shadow-md shadow-emerald-500/10' : 'border-transparent'}">
            <div class="flex items-center space-x-2.5">
              <div class="w-7 h-7 rounded-full bg-gradient-to-br from-gray-800 to-black border border-gray-600 shadow flex items-center justify-center">
                <div class="w-2.5 h-2.5 rounded-full bg-gray-700/50"></div>
              </div>
              <div>
                <div class="text-[10px] font-bold uppercase text-gray-400">BLACK ${this.myPlayer === 1 ? '(YOU)' : ''}</div>
                <div class="text-xs font-medium text-gray-500">${this.session.mode === 'ai' ? (this.myPlayer === 1 ? 'Player' : `AI (${this.session.aiDifficulty})`) : (this.myPlayer === 1 ? 'You' : 'Opponent')}</div>
              </div>
            </div>
            <div class="text-2xl font-black font-mono">${scores.black}</div>
          </div>

          <!-- White Player Card -->
          <div class="ps-card rounded-2xl p-3 flex items-center justify-between border-2 ${this.engine.currentPlayer === 2 && !this.engine.isGameOver && this.gamePhase === 'playing' ? 'border-emerald-500 shadow-md shadow-emerald-500/10' : 'border-transparent'}">
            <div class="flex items-center space-x-2.5">
              <div class="w-7 h-7 rounded-full bg-gradient-to-br from-white to-gray-200 border border-gray-300 shadow flex items-center justify-center">
                <div class="w-2.5 h-2.5 rounded-full bg-gray-300/60"></div>
              </div>
              <div>
                <div class="text-[10px] font-bold uppercase text-gray-400">WHITE ${this.myPlayer === 2 ? '(YOU)' : ''}</div>
                <div class="text-xs font-medium text-gray-500">${this.session.mode === 'ai' ? (this.myPlayer === 2 ? 'Player' : `AI (${this.session.aiDifficulty})`) : (this.myPlayer === 2 ? 'You' : 'Opponent')}</div>
              </div>
            </div>
            <div class="text-2xl font-black font-mono">${scores.white}</div>
          </div>
        </div>

        <!-- Othello 8x8 Board -->
        <div class="relative ps-card p-3 sm:p-4 rounded-3xl ${isDark ? 'bg-[#0f1f18] border-emerald-900/60' : 'bg-[#1b5e3b] border-emerald-800'} shadow-2xl">
          <div class="grid grid-cols-8 gap-1 sm:gap-1.5 p-1 bg-[#10482d] rounded-2xl border border-emerald-700/40">
            ${Array.from({ length: BOARD_SIZE }).map((_, r) =>
              Array.from({ length: BOARD_SIZE }).map((_, c) => {
                const cell = this.engine.board[r][c];
                const isValid = validMoves.some(([vr, vc]) => vr === r && vc === c);
                const isLast = this.engine.lastMove && this.engine.lastMove[0] === r && this.engine.lastMove[1] === c;

                return `
                  <div class="othello-cell w-9 h-9 sm:w-12 sm:h-12 rounded-lg bg-[#19643d] hover:bg-[#1f784a] flex items-center justify-center relative cursor-pointer select-none transition-colors" data-r="${r}" data-c="${c}">
                    
                    <!-- Star point markers for corners (2,2; 2,6; 6,2; 6,6) -->
                    ${((r === 2 || r === 6) && (c === 2 || c === 6)) && cell === 0 ? `<div class="absolute w-1.5 h-1.5 rounded-full bg-emerald-900/60 pointer-events-none"></div>` : ''}

                    <!-- Placed Disc -->
                    ${cell === 1 ? `
                      <div class="w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-gray-800 to-black border border-gray-700 shadow-md transform transition-transform duration-300 ${isLast ? 'ring-2 ring-emerald-400 scale-105' : ''} flex items-center justify-center">
                        <div class="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-gray-700/40"></div>
                      </div>
                    ` : cell === 2 ? `
                      <div class="w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-white to-gray-200 border border-gray-300 shadow-md transform transition-transform duration-300 ${isLast ? 'ring-2 ring-emerald-400 scale-105' : ''} flex items-center justify-center">
                        <div class="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-gray-300/60"></div>
                      </div>
                    ` : ''}

                    <!-- Valid Move Hint Dot -->
                    ${isValid ? `
                      <div class="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-emerald-300/50 hover:bg-emerald-300 hover:scale-125 transition-all"></div>
                    ` : ''}

                  </div>
                `;
              }).join('')
            ).join('')}
          </div>
        </div>

        <!-- Rematch Banner when game over -->
        ${this.engine.isGameOver ? `
          <div class="mt-6 flex flex-col items-center space-y-3">
            ${this.forfeitMessage ? `
              <div class="px-5 py-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-sm font-bold text-center shadow-lg shadow-emerald-500/10">
                🏆 ${this.forfeitMessage}
              </div>
            ` : ''}
            ${(!this.forfeitMessage || this.session.mode === 'ai') ? `
              <button id="btn-othello-rematch" class="ps-btn-primary px-8 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-emerald-500/25">
                Play Again
              </button>
            ` : `
              <button id="btn-othello-back" class="ps-btn-primary px-8 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-emerald-500/25">
                Back to Dashboard
              </button>
            `}
          </div>
        ` : ''}

        <!-- 1. AI Match Setup / Randomizer Popup Overlay -->
        ${this.gamePhase === 'ai_setup' ? `
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
        ` : ''}

        <!-- 2. Online 1v1 Dice Roll Duel Overlay -->
        ${(this.gamePhase === 'dice_rolling' || this.gamePhase === 'dice_choosing') ? `
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
                  <div class="text-xs font-mono font-bold">
                    ${this.myDiceRoll !== null ? `Rolled: ${this.myDiceRoll}` : (this.isRollingAnimation ? 'Rolling...' : 'Ready')}
                  </div>
                </div>

                <!-- Opponent Dice -->
                <div class="ps-card rounded-2xl p-4 flex flex-col items-center justify-center border-2 ${this.diceWinner === 'opponent' ? 'border-emerald-500 shadow-lg shadow-emerald-500/20' : 'border-transparent'}">
                  <div class="text-[10px] font-bold uppercase text-gray-400 mb-2">OPPONENT</div>
                  <div id="opp-dice-container" class="mb-3">
                    ${renderDiceFace(this.opponentDiceRoll, isDark)}
                  </div>
                  <div class="text-xs font-mono font-bold">
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
        ` : ''}

      </div>
    `;

    this.attachEventListeners();
  }

  private attachEventListeners() {
    // Exit button
    document.getElementById('btn-othello-exit')?.addEventListener('click', () => {
      if (this.session.mode === 'online' && this.session.peer?.isConnected) {
        this.session.peer.sendMessage({ type: 'PLAYER_LEAVE' });
      }
      this.session.onExit();
    });

    // Dice exit button
    document.getElementById('btn-dice-exit')?.addEventListener('click', () => {
      if (this.session.mode === 'online' && this.session.peer?.isConnected) {
        this.session.peer.sendMessage({ type: 'PLAYER_LEAVE' });
      }
      this.session.onExit();
    });

    // Cancel setup button
    document.getElementById('btn-othello-cancel-setup')?.addEventListener('click', () => {
      this.session.onExit();
    });

    // Back button
    document.getElementById('btn-othello-back')?.addEventListener('click', () => {
      this.session.onExit();
    });

    // Rematch button
    document.getElementById('btn-othello-rematch')?.addEventListener('click', () => {
      if (this.session.mode === 'ai') {
        this.resetMatch();
      } else if (this.session.peer?.isConnected) {
        this.session.peer.sendMessage({ type: 'REMATCH_REQUEST' });
        const btn = document.getElementById('btn-othello-rematch');
        if (btn) btn.textContent = 'Waiting for Opponent...';
      }
    });

    // AI Setup buttons
    document.getElementById('btn-othello-randomize')?.addEventListener('click', () => {
      this.handleAIRandomize();
    });
    document.getElementById('btn-choose-black')?.addEventListener('click', () => {
      this.selectAIPiece(1);
    });
    document.getElementById('btn-choose-white')?.addEventListener('click', () => {
      this.selectAIPiece(2);
    });

    // Online Dice Duel buttons
    document.getElementById('btn-roll-dice')?.addEventListener('click', () => {
      this.handleRollDice();
    });
    document.getElementById('btn-online-choose-black')?.addEventListener('click', () => {
      this.handleOnlineColorChoice(1);
    });
    document.getElementById('btn-online-choose-white')?.addEventListener('click', () => {
      this.handleOnlineColorChoice(2);
    });

    // Click on board cell
    document.querySelectorAll('.othello-cell').forEach(el => {
      el.addEventListener('click', (e) => {
        if (this.gamePhase !== 'playing') return;
        const target = e.currentTarget as HTMLElement;
        const r = parseInt(target.dataset.r || '-1', 10);
        const c = parseInt(target.dataset.c || '-1', 10);
        if (r >= 0 && c >= 0 && !this.isProcessing) {
          this.handleCellClick(r, c);
        }
      });
    });
  }

  private async handleCellClick(r: number, c: number) {
    if (this.engine.isGameOver || !this.isMyTurn || this.gamePhase !== 'playing') return;

    const move = this.engine.makeMove(r, c);
    if (!move) return; // Invalid move

    sounds.playRotate();

    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      this.session.peer.sendMessage({
        type: 'OTHELLO_MOVE',
        r,
        c,
        player: this.myPlayer
      } as any);
      this.isMyTurn = this.engine.currentPlayer === this.myPlayer;
    }

    this.render();
    this.checkGameStatus();

    // Trigger AI move if Solo AI mode
    const aiPlayer: PlayerColor = this.myPlayer === 1 ? 2 : 1;
    if (!this.engine.isGameOver && this.session.mode === 'ai' && this.engine.currentPlayer === aiPlayer) {
      this.isMyTurn = false;
      this.isProcessing = true;
      this.render();

      const delay = this.session.aiDifficulty === 'extreme' ? 400 : 600;
      setTimeout(() => {
        this.makeAIMove();
      }, delay);
    }
  }

  private makeAIMove() {
    const aiMove = this.engine.getBestAIMove(this.session.aiDifficulty || 'medium');
    if (aiMove) {
      this.engine.makeMove(aiMove[0], aiMove[1]);
      sounds.playHardDrop();
    }

    this.isMyTurn = this.engine.currentPlayer === this.myPlayer;
    this.isProcessing = false;
    this.render();
    this.checkGameStatus();

    // If AI has to move again (human had to pass)
    const aiPlayer: PlayerColor = this.myPlayer === 1 ? 2 : 1;
    if (!this.engine.isGameOver && this.engine.currentPlayer === aiPlayer && this.session.mode === 'ai') {
      setTimeout(() => {
        this.makeAIMove();
      }, 500);
    }
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
      this.render();
    }
  }

  private showRematchOffer() {
    const btn = document.getElementById('btn-othello-rematch');
    if (btn) {
      btn.textContent = 'Accept Rematch';
      btn.onclick = () => {
        this.session.peer?.sendMessage({ type: 'REMATCH_ACCEPT' });
        this.resetMatch();
      };
    }
  }

  private resetMatch() {
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

    this.render();
  }
}
