import confetti from 'canvas-confetti';
import { Connect4Engine, C4_COLS, C4_ROWS } from './connect4-engine';
import type { GameInstance, GameSession, AppTheme } from '../types';
import { sounds } from '../../engine/sound';

export class Connect4Game implements GameInstance {
  private container: HTMLElement;
  private session: GameSession;
  private engine: Connect4Engine;
  private currentTheme: AppTheme;

  private isMyTurn: boolean = true;
  private myPlayer: 1 | 2 = 1;
  private isProcessing: boolean = false;

  constructor(container: HTMLElement, session: GameSession) {
    this.container = container;
    this.session = session;
    this.currentTheme = session.theme;
    this.engine = new Connect4Engine();

    if (session.mode === 'online') {
      this.myPlayer = session.peer?.role === 'host' ? 1 : 2;
      this.isMyTurn = this.myPlayer === 1;
      this.setupNetworkListeners();
    } else {
      this.myPlayer = 1;
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

    // Listen to network moves
    const originalOnMessage = (this.session.peer as any).events?.onMessage;
    this.session.peer = Object.assign(this.session.peer, {
      events: {
        ...(this.session.peer as any).events,
        onMessage: (msg: any) => {
          originalOnMessage?.(msg);
          this.handleNetworkMessage(msg);
        }
      }
    });
  }

  private handleNetworkMessage(msg: any) {
    if (msg.type === 'C4_MOVE') {
      const drop = this.engine.dropToken(msg.col);
      if (drop) {
        sounds.playHardDrop();
        this.isMyTurn = true;
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
    const isPlayer1Turn = this.engine.currentPlayer === 1;

    let turnText = '';
    let turnColor = '';
    if (this.engine.isGameOver) {
      if (this.engine.isTie) {
        turnText = 'Game Drawn!';
        turnColor = 'text-gray-400';
      } else if (this.engine.winResult) {
        const isWinner = this.engine.winResult.winner === this.myPlayer;
        turnText = isWinner ? 'You Win!' : 'Opponent Wins!';
        turnColor = isWinner ? 'text-blue-500' : 'text-rose-500';
      }
    } else if (this.session.mode === 'ai') {
      turnText = this.isMyTurn ? 'Your Turn' : 'AI Thinking...';
      turnColor = this.isMyTurn ? 'text-blue-500' : 'text-rose-500';
    } else {
      turnText = this.isMyTurn ? 'Your Turn' : "Opponent's Turn";
      turnColor = this.isMyTurn ? 'text-blue-500' : 'text-rose-500';
    }

    this.container.innerHTML = `
      <div class="w-full max-w-2xl flex flex-col items-center justify-center p-4">
        
        <!-- Top Status Bar -->
        <div class="w-full flex items-center justify-between py-3 mb-4 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}">
          <button id="btn-c4-exit" class="ps-btn-secondary px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5">
            <span>← Exit Game</span>
          </button>
          
          <div class="flex items-center space-x-2">
            <span class="text-xs font-semibold uppercase tracking-wider ${turnColor}">
              ${turnText}
            </span>
            <div class="w-3 h-3 rounded-full ${isPlayer1Turn ? 'bg-blue-500' : 'bg-rose-500'} ${!this.engine.isGameOver ? 'animate-pulse' : ''}"></div>
          </div>

          <div class="text-xs font-mono text-gray-500">
            ${this.session.mode === 'ai' ? `AI: ${this.session.aiDifficulty?.toUpperCase()}` : '1v1 Online'}
          </div>
        </div>

        <!-- Interactive Connect 4 Grid -->
        <div class="ps-card p-4 sm:p-6 rounded-2xl ${isDark ? 'bg-[#121624] border-gray-800' : 'bg-blue-600/10 border-blue-200'}">
          <div class="grid grid-cols-7 gap-2 sm:gap-3">
            ${Array.from({ length: C4_COLS }).map((_, c) => `
              <div class="col-slot flex flex-col gap-2 sm:gap-3 cursor-pointer group" data-col="${c}">
                ${Array.from({ length: C4_ROWS }).map((_, r) => {
                  const val = this.engine.board[r][c];
                  const isWinningCell = this.engine.winResult?.winningLine.some(([wr, wc]) => wr === r && wc === c);

                  let cellBg = isDark ? 'bg-[#0b0e18]' : 'bg-white shadow-inner';
                  if (val === 1) cellBg = 'bg-blue-500 shadow-md shadow-blue-500/30';
                  if (val === 2) cellBg = 'bg-rose-500 shadow-md shadow-rose-500/30';

                  return `
                    <div class="w-10 h-10 sm:w-14 sm:h-14 rounded-full ${cellBg} flex items-center justify-center transition-all duration-200 ${isWinningCell ? 'ring-4 ring-yellow-400 scale-105' : ''}">
                      ${val !== 0 ? `<div class="w-7 h-7 sm:w-10 sm:h-10 rounded-full border border-white/20"></div>` : ''}
                    </div>
                  `;
                }).join('')}
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Action / Rematch banner when game over -->
        ${this.engine.isGameOver ? `
          <div class="mt-6 flex flex-col items-center space-y-3">
            <button id="btn-c4-rematch" class="ps-btn-primary px-6 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-blue-500/20">
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
    document.getElementById('btn-c4-exit')?.addEventListener('click', () => {
      this.session.onExit();
    });

    // Rematch button
    document.getElementById('btn-c4-rematch')?.addEventListener('click', () => {
      if (this.session.mode === 'ai') {
        this.resetMatch();
      } else if (this.session.peer?.isConnected) {
        this.session.peer.sendMessage({ type: 'REMATCH_REQUEST' });
        const btn = document.getElementById('btn-c4-rematch');
        if (btn) btn.textContent = 'Waiting for Opponent...';
      }
    });

    // Column click to drop token
    document.querySelectorAll('.col-slot').forEach(el => {
      el.addEventListener('click', (e) => {
        const col = parseInt((e.currentTarget as HTMLElement).dataset.col || '-1', 10);
        if (col >= 0 && !this.isProcessing) {
          this.handleColumnClick(col);
        }
      });
    });
  }

  private async handleColumnClick(col: number) {
    if (this.engine.isGameOver || !this.isMyTurn || !this.engine.canDrop(col)) {
      return;
    }

    const drop = this.engine.dropToken(col);
    if (!drop) return;

    sounds.playRotate();

    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      this.session.peer.sendMessage({
        type: 'C4_MOVE',
        col,
        row: drop.row,
        player: this.myPlayer
      });
      this.isMyTurn = false;
    }

    this.render();
    this.checkGameStatus();

    // AI Move
    if (!this.engine.isGameOver && this.session.mode === 'ai') {
      this.isMyTurn = false;
      this.isProcessing = true;
      this.render();

      const delay = this.session.aiDifficulty === 'extreme' ? 300 : 600;
      setTimeout(() => {
        const aiCol = this.engine.getBestAIMove(this.session.aiDifficulty || 'medium');
        this.engine.dropToken(aiCol);
        sounds.playHardDrop();
        this.isMyTurn = true;
        this.isProcessing = false;
        this.render();
        this.checkGameStatus();
      }, delay);
    }
  }

  private checkGameStatus() {
    if (this.engine.isGameOver) {
      if (this.engine.winResult) {
        const isWinner = this.engine.winResult.winner === this.myPlayer;
        if (isWinner) {
          sounds.playWin();
          confetti({ particleCount: 100, spread: 70 });
        } else {
          sounds.playGameOver();
        }
      }
      this.render();
    }
  }

  private showRematchOffer() {
    const btn = document.getElementById('btn-c4-rematch');
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
