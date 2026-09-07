import confetti from 'canvas-confetti';
import { OthelloEngine, BOARD_SIZE, type PlayerColor } from './othello-engine';
import type { GameInstance, GameSession, AppTheme } from '../types';
import { sounds } from '../../engine/sound';

export class OthelloGame implements GameInstance {
  private container: HTMLElement;
  private session: GameSession;
  private engine: OthelloEngine;
  private currentTheme: AppTheme;

  private myPlayer: PlayerColor = 1; // 1 = Black, 2 = White
  private isMyTurn: boolean = true;
  private isProcessing: boolean = false;

  constructor(container: HTMLElement, session: GameSession) {
    this.container = container;
    this.session = session;
    this.currentTheme = session.theme;
    this.engine = new OthelloEngine();

    if (session.mode === 'online') {
      // Host is Black (starts first), Guest is White
      this.myPlayer = session.peer?.role === 'host' ? 1 : 2;
      this.isMyTurn = this.myPlayer === 1;
      this.setupNetworkListeners();
    } else {
      this.myPlayer = 1; // Player is always Black vs AI
      this.isMyTurn = true;
    }

    this.render();
  }

  public setTheme(theme: AppTheme) {
    this.currentTheme = theme;
    this.render();
  }

  public destroy() {
    this.container.innerHTML = '';
  }

  private setupNetworkListeners() {
    if (!this.session.peer) return;

    const origOnMessage = (this.session.peer as any).events?.onMessage;
    this.session.peer = Object.assign(this.session.peer, {
      events: {
        ...(this.session.peer as any).events,
        onMessage: (msg: any) => {
          origOnMessage?.(msg);
          this.handleNetworkMessage(msg);
        }
      }
    });
  }

  private handleNetworkMessage(msg: any) {
    if (msg.type === 'OTHELLO_MOVE') {
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

  private render() {
    const isDark = this.currentTheme === 'dark';
    const scores = this.engine.getScores();
    const validMoves = !this.engine.isGameOver && this.isMyTurn ? this.engine.getValidMoves() : [];

    let turnText = '';
    let turnClass = '';

    if (this.engine.isGameOver) {
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
      <div class="w-full max-w-2xl flex flex-col items-center justify-center p-3 sm:p-4">
        
        <!-- Top Status Bar -->
        <div class="w-full flex items-center justify-between py-2.5 mb-3 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}">
          <button id="btn-othello-exit" class="ps-btn-secondary px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5">
            <span>← Exit Game</span>
          </button>
          
          <div class="flex items-center space-x-2">
            <span class="text-xs font-bold uppercase tracking-wider ${turnClass}">
              ${turnText}
            </span>
            <div class="w-3 h-3 rounded-full ${this.engine.currentPlayer === 1 ? 'bg-gray-900 border border-gray-600' : 'bg-white border border-gray-300'} ${!this.engine.isGameOver ? 'animate-pulse' : ''}"></div>
          </div>

          <div class="text-xs font-mono text-gray-500">
            ${this.session.mode === 'ai' ? `AI: ${this.session.aiDifficulty?.toUpperCase()}` : '1v1 Online'}
          </div>
        </div>

        <!-- Disc Score Cards -->
        <div class="w-full grid grid-cols-2 gap-3 mb-4 max-w-md">
          <!-- Black Player Card -->
          <div class="ps-card rounded-2xl p-3 flex items-center justify-between border-2 ${this.engine.currentPlayer === 1 && !this.engine.isGameOver ? 'border-emerald-500 shadow-md shadow-emerald-500/10' : 'border-transparent'}">
            <div class="flex items-center space-x-2.5">
              <div class="w-7 h-7 rounded-full bg-gradient-to-br from-gray-800 to-black border border-gray-600 shadow flex items-center justify-center">
                <div class="w-2.5 h-2.5 rounded-full bg-gray-700/50"></div>
              </div>
              <div>
                <div class="text-[10px] font-bold uppercase text-gray-400">BLACK ${this.myPlayer === 1 ? '(YOU)' : ''}</div>
                <div class="text-xs font-medium text-gray-500">${this.session.mode === 'ai' ? 'Player' : (this.session.peer?.role === 'host' ? 'Host' : 'Opponent')}</div>
              </div>
            </div>
            <div class="text-2xl font-black font-mono">${scores.black}</div>
          </div>

          <!-- White Player Card -->
          <div class="ps-card rounded-2xl p-3 flex items-center justify-between border-2 ${this.engine.currentPlayer === 2 && !this.engine.isGameOver ? 'border-emerald-500 shadow-md shadow-emerald-500/10' : 'border-transparent'}">
            <div class="flex items-center space-x-2.5">
              <div class="w-7 h-7 rounded-full bg-gradient-to-br from-white to-gray-200 border border-gray-300 shadow flex items-center justify-center">
                <div class="w-2.5 h-2.5 rounded-full bg-gray-300/60"></div>
              </div>
              <div>
                <div class="text-[10px] font-bold uppercase text-gray-400">WHITE ${this.myPlayer === 2 ? '(YOU)' : ''}</div>
                <div class="text-xs font-medium text-gray-500">${this.session.mode === 'ai' ? `AI (${this.session.aiDifficulty})` : (this.session.peer?.role === 'guest' ? 'You' : 'Guest')}</div>
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
            <button id="btn-othello-rematch" class="ps-btn-primary px-8 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-emerald-500/25">
              Play Again
            </button>
          </div>
        ` : ''}

      </div>
    `;

    this.attachEventListeners();
  }

  private attachEventListeners() {
    // Exit button
    document.getElementById('btn-othello-exit')?.addEventListener('click', () => {
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

    // Click on board cell
    document.querySelectorAll('.othello-cell').forEach(el => {
      el.addEventListener('click', (e) => {
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
    if (this.engine.isGameOver || !this.isMyTurn) return;

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
    if (!this.engine.isGameOver && this.session.mode === 'ai' && this.engine.currentPlayer === 2) {
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

    this.isMyTurn = this.engine.currentPlayer === 1;
    this.isProcessing = false;
    this.render();
    this.checkGameStatus();

    // If AI has to move again (human had to pass)
    if (!this.engine.isGameOver && this.engine.currentPlayer === 2 && this.session.mode === 'ai') {
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
    this.engine.reset();
    this.isMyTurn = this.myPlayer === 1;
    this.render();
  }
}
