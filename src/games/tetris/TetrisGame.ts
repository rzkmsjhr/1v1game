import confetti from 'canvas-confetti';
import { TetrisEngine } from '../../engine/tetris-engine';
import { BoardRenderer } from '../../components/BoardRenderer';
import { PiecePreview } from '../../components/PiecePreview';
import { InputController } from '../../components/InputController';
import { TetrisAI } from '../../ai/tetris-ai';
import { sounds } from '../../engine/sound';
import type { GameInstance, GameSession, AppTheme } from '../types';

export class TetrisGame implements GameInstance {
  private container: HTMLElement;
  private session: GameSession;
  private currentTheme: AppTheme;

  private playerEngine: TetrisEngine;
  private opponentEngine: TetrisEngine;
  private ai: TetrisAI | null = null;

  private playerRenderer!: BoardRenderer;
  private opponentRenderer!: BoardRenderer;
  private inputController!: InputController;

  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private opponentName: string = 'AI Bot';
  private opponentScore: number = 0;

  constructor(container: HTMLElement, session: GameSession) {
    this.container = container;
    this.session = session;
    this.currentTheme = session.theme;

    this.opponentName = session.mode === 'ai' 
      ? `AI (${session.aiDifficulty?.toUpperCase()})` 
      : 'Opponent';

    if (session.mode === 'ai' && session.aiDifficulty) {
      this.ai = new TetrisAI(session.aiDifficulty);
    }

    // Initialize player engine
    this.playerEngine = new TetrisEngine({
      onChange: () => this.handlePlayerChange(),
      onPieceLocked: () => sounds.playHardDrop(),
      onLinesCleared: (_lines, garbageSent, isTetris, combo) => {
        sounds.playLineClear(_lines);
        if (isTetris) {
          this.playerRenderer.triggerShake(8);
          this.playerRenderer.addFloatingText('TETRIS!', '#0084f7');
        } else if (combo > 0) {
          this.playerRenderer.addFloatingText(`COMBO x${combo + 1}`, '#eab308');
        }

        if (garbageSent > 0) {
          this.sendGarbageToOpponent(garbageSent);
        }
      },
      onGarbageReceived: () => {
        sounds.playGarbageAlert();
        this.playerRenderer.triggerShake(5);
      },
      onGameOver: () => {
        this.handleGameOver(false);
      }
    });

    // Initialize opponent engine
    this.opponentEngine = new TetrisEngine({
      onChange: () => {},
      onPieceLocked: () => {},
      onLinesCleared: (_lines, garbageSent, isTetris) => {
        if (isTetris) {
          this.opponentRenderer.triggerShake(6);
          this.opponentRenderer.addFloatingText('TETRIS!', '#ef4444');
        }
        if (garbageSent > 0 && this.session.mode === 'ai') {
          this.playerEngine.addIncomingGarbage(garbageSent);
          sounds.playGarbageAlert();
        }
      },
      onGameOver: () => {
        if (this.session.mode === 'ai') {
          this.handleGameOver(true);
        }
      }
    });

    this.setupInputController();
    if (session.mode === 'online') {
      this.setupNetwork();
    }

    this.render();
    this.startLoop();
  }

  public setTheme(theme: AppTheme) {
    this.currentTheme = theme;
    this.playerRenderer?.setTheme(theme);
    this.opponentRenderer?.setTheme(theme);
  }

  public destroy() {
    this.isRunning = false;
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    this.inputController?.clearAll();
    this.container.innerHTML = '';
  }

  private setupInputController() {
    this.inputController = new InputController({
      moveLeft: () => { if (this.playerEngine.moveLeft()) sounds.playMove(); },
      moveRight: () => { if (this.playerEngine.moveRight()) sounds.playMove(); },
      softDrop: () => { this.playerEngine.softDrop(); },
      hardDrop: () => { this.playerEngine.hardDrop(); },
      rotateCW: () => { if (this.playerEngine.rotate('cw')) sounds.playRotate(); },
      rotateCCW: () => { if (this.playerEngine.rotate('ccw')) sounds.playRotate(); },
      hold: () => { if (this.playerEngine.hold()) sounds.playHold(); }
    });
  }

  private setupNetwork() {
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
    switch (msg.type) {
      case 'TETRIS_SYNC_BOARD':
        for (let r = 0; r < 20; r++) {
          for (let c = 0; c < 10; c++) {
            this.opponentEngine.grid[r + 4][c] = msg.grid[r][c];
          }
        }
        this.opponentScore = msg.score;
        this.opponentEngine.pendingGarbage = msg.pendingGarbage;
        this.updateStatsUI();
        break;

      case 'TETRIS_GARBAGE':
        this.playerEngine.addIncomingGarbage(msg.lines);
        sounds.playGarbageAlert();
        this.playerRenderer.triggerShake(4);
        break;

      case 'GAME_OVER':
        this.handleGameOver(!msg.didWin);
        break;

      case 'REMATCH_REQUEST':
        this.showRematchOffer();
        break;

      case 'REMATCH_ACCEPT':
        this.hideGameOverModal();
        this.playerEngine.reset();
        this.opponentEngine.reset();
        this.startLoop();
        break;
    }
  }

  private handlePlayerChange() {
    this.updateStatsUI();
    this.renderPreviews();

    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      this.session.peer.sendMessage({
        type: 'TETRIS_SYNC_BOARD',
        grid: this.playerEngine.getVisibleGrid(),
        score: this.playerEngine.score,
        pendingGarbage: this.playerEngine.pendingGarbage
      });
    }
  }

  private sendGarbageToOpponent(lines: number) {
    if (this.session.mode === 'ai') {
      this.opponentEngine.addIncomingGarbage(lines);
    } else if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      this.session.peer.sendMessage({
        type: 'TETRIS_GARBAGE',
        lines
      });
    }
  }

  private handleGameOver(playerWon: boolean) {
    this.isRunning = false;
    this.inputController.setEnabled(false);

    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      this.session.peer.sendMessage({
        type: 'GAME_OVER',
        didWin: !playerWon
      });
    }

    if (playerWon) {
      sounds.playWin();
      confetti({ particleCount: 120, spread: 70 });
    } else {
      sounds.playGameOver();
    }

    this.showGameOverModal(playerWon);
  }

  private render() {
    const isDark = this.currentTheme === 'dark';

    this.container.innerHTML = `
      <!-- Top Arena Header -->
      <div class="w-full max-w-5xl flex items-center justify-between py-3 mb-2 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}">
        <button id="btn-tetris-exit" class="ps-btn-secondary px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5">
          <span>← Exit Game</span>
        </button>

        <div class="flex items-center space-x-2 font-semibold text-xs">
          <span class="text-blue-500">TETRIS BATTLE</span>
          <span class="text-gray-400">•</span>
          <span class="text-gray-500 uppercase">${this.session.mode === 'ai' ? `AI: ${this.session.aiDifficulty}` : '1v1 Online'}</span>
        </div>

        <div class="w-16"></div>
      </div>

      <!-- Main Battle Canvas Grid -->
      <div class="w-full max-w-5xl flex flex-col md:flex-row items-center justify-center gap-4 sm:gap-8 my-2">
        
        <!-- Player Side -->
        <div class="flex items-center space-x-3 sm:space-x-4">
          <!-- Hold Box & Stats -->
          <div class="flex flex-col items-center justify-between h-[420px] sm:h-[560px] py-1">
            <div class="ps-card rounded-xl p-2.5 text-center w-20 sm:w-24">
              <div class="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">HOLD</div>
              <canvas id="canvas-hold" width="70" height="70" class="mx-auto"></canvas>
            </div>

            <div class="ps-card rounded-xl p-2.5 text-center w-20 sm:w-24 space-y-2">
              <div>
                <div class="text-[9px] uppercase tracking-wider text-gray-500 font-semibold">SCORE</div>
                <div id="stat-player-score" class="font-mono font-bold text-xs sm:text-sm">0</div>
              </div>
              <div>
                <div class="text-[9px] uppercase tracking-wider text-gray-500 font-semibold">LINES</div>
                <div id="stat-player-lines" class="font-mono font-bold text-xs sm:text-sm text-blue-500">0</div>
              </div>
              <div>
                <div class="text-[9px] uppercase tracking-wider text-gray-500 font-semibold">GARBAGE</div>
                <div id="stat-player-garbage" class="font-mono font-bold text-xs sm:text-sm text-yellow-500">0</div>
              </div>
            </div>

            <div class="text-xs font-bold tracking-wider text-blue-500">YOU</div>
          </div>

          <!-- Main Player Board -->
          <div class="relative ps-card rounded-xl p-1.5 border-2 border-blue-500/40">
            <canvas id="canvas-player" class="rounded"></canvas>
          </div>

          <!-- Next Queue -->
          <div class="flex flex-col items-center justify-start h-[420px] sm:h-[560px] py-1">
            <div class="ps-card rounded-xl p-2 text-center w-20 sm:w-24 space-y-2">
              <div class="text-[10px] font-semibold uppercase tracking-wider text-gray-400">NEXT</div>
              <canvas id="canvas-next-0" width="70" height="55" class="mx-auto"></canvas>
              <canvas id="canvas-next-1" width="60" height="45" class="mx-auto opacity-75"></canvas>
              <canvas id="canvas-next-2" width="60" height="45" class="mx-auto opacity-60"></canvas>
              <canvas id="canvas-next-3" width="60" height="45" class="mx-auto opacity-40"></canvas>
            </div>
          </div>
        </div>

        <!-- Center Divider -->
        <div class="hidden md:flex flex-col items-center justify-center space-y-2">
          <div class="w-8 h-8 rounded-full bg-blue-600/10 text-blue-500 flex items-center justify-center font-bold text-xs border border-blue-500/20">
            VS
          </div>
          <div class="h-20 w-px bg-gray-700/20"></div>
        </div>

        <!-- Opponent Side -->
        <div class="flex items-center space-x-3 sm:space-x-4">
          <div class="relative ps-card rounded-xl p-1.5 border border-rose-500/30">
            <canvas id="canvas-opponent" class="rounded"></canvas>
          </div>

          <div class="flex flex-col items-center justify-between h-[420px] sm:h-[560px] py-1">
            <div class="ps-card rounded-xl p-2.5 text-center w-20 sm:w-24 space-y-2">
              <div>
                <div class="text-[9px] uppercase tracking-wider text-gray-500 font-semibold">SCORE</div>
                <div id="stat-opponent-score" class="font-mono font-bold text-xs sm:text-sm">0</div>
              </div>
              <div>
                <div class="text-[9px] uppercase tracking-wider text-gray-500 font-semibold">GARBAGE</div>
                <div id="stat-opponent-garbage" class="font-mono font-bold text-xs sm:text-sm text-rose-500">0</div>
              </div>
            </div>

            <div class="text-xs font-bold tracking-wider text-rose-500 text-center max-w-[80px] truncate">
              ${this.opponentName}
            </div>
          </div>
        </div>

      </div>

      <!-- Mobile Touch Controls -->
      <div class="w-full max-w-md grid grid-cols-5 gap-1.5 sm:hidden py-2 px-1">
        <button id="touch-left" class="touch-control-btn py-3.5 rounded-lg ps-btn-secondary font-bold text-lg">←</button>
        <button id="touch-right" class="touch-control-btn py-3.5 rounded-lg ps-btn-secondary font-bold text-lg">→</button>
        <button id="touch-down" class="touch-control-btn py-3.5 rounded-lg ps-btn-secondary font-bold text-lg">↓</button>
        <button id="touch-cw" class="touch-control-btn py-3.5 rounded-lg ps-btn-primary font-bold text-sm">ROT</button>
        <button id="touch-drop" class="touch-control-btn py-3.5 rounded-lg bg-rose-500 text-white font-bold text-sm">DROP</button>
        <button id="touch-hold" class="touch-control-btn col-span-5 py-2 rounded-lg ps-btn-secondary font-semibold text-xs uppercase">HOLD PIECE (C)</button>
      </div>

      <!-- Game Over Modal -->
      <div id="modal-gameover" class="hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="ps-card rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl border ${isDark ? 'border-gray-800' : 'border-gray-200'}">
          <div id="gameover-title" class="text-3xl font-extrabold mb-2">
            VICTORY!
          </div>
          <p id="gameover-subtitle" class="text-sm text-gray-500 mb-6">
            Match finished!
          </p>

          <div class="space-y-2.5">
            <button id="btn-rematch" class="ps-btn-primary w-full py-3 rounded-xl text-sm font-semibold">
              Play Again
            </button>
            <button id="btn-modal-exit" class="w-full py-2 text-xs font-semibold text-gray-500 hover:text-gray-400">
              Back to Game Hub
            </button>
          </div>
        </div>
      </div>
    `;

    this.initCanvases();
    this.attachEventListeners();
  }

  private initCanvases() {
    const isMobile = window.innerWidth < 640;
    const playerBlockSize = isMobile ? 18 : 26;
    const opponentBlockSize = isMobile ? 14 : 22;

    const pCanvas = document.getElementById('canvas-player') as HTMLCanvasElement;
    const oCanvas = document.getElementById('canvas-opponent') as HTMLCanvasElement;

    this.playerRenderer = new BoardRenderer(pCanvas, playerBlockSize, this.currentTheme);
    this.opponentRenderer = new BoardRenderer(oCanvas, opponentBlockSize, this.currentTheme);
  }

  private attachEventListeners() {
    document.getElementById('btn-tetris-exit')?.addEventListener('click', () => {
      this.session.onExit();
    });

    document.getElementById('btn-rematch')?.addEventListener('click', () => {
      if (this.session.mode === 'ai') {
        this.hideGameOverModal();
        this.playerEngine.reset();
        this.opponentEngine.reset();
        this.startLoop();
      } else if (this.session.peer?.isConnected) {
        this.session.peer.sendMessage({ type: 'REMATCH_REQUEST' });
        const btn = document.getElementById('btn-rematch');
        if (btn) btn.textContent = 'Waiting for Opponent...';
      }
    });

    document.getElementById('btn-modal-exit')?.addEventListener('click', () => {
      this.session.onExit();
    });

    // Touch controls
    document.getElementById('touch-left')?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.playerEngine.moveLeft()) sounds.playMove();
    });
    document.getElementById('touch-right')?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.playerEngine.moveRight()) sounds.playMove();
    });
    document.getElementById('touch-down')?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.playerEngine.softDrop();
    });
    document.getElementById('touch-cw')?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.playerEngine.rotate('cw')) sounds.playRotate();
    });
    document.getElementById('touch-drop')?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.playerEngine.hardDrop();
    });
    document.getElementById('touch-hold')?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.playerEngine.hold()) sounds.playHold();
    });
  }

  private startLoop() {
    this.isRunning = true;
    this.inputController.setEnabled(true);

    const loop = (currentTime: number) => {
      if (!this.isRunning) return;

      this.playerEngine.update(currentTime);

      if (this.session.mode === 'ai' && this.ai) {
        this.opponentEngine.update(currentTime);
        this.ai.update(this.opponentEngine, currentTime);
      }

      this.playerRenderer.render(this.playerEngine, false);
      this.opponentRenderer.render(this.opponentEngine, true);

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  private updateStatsUI() {
    const pScore = document.getElementById('stat-player-score');
    const pLines = document.getElementById('stat-player-lines');
    const pGarbage = document.getElementById('stat-player-garbage');
    const oScore = document.getElementById('stat-opponent-score');
    const oGarbage = document.getElementById('stat-opponent-garbage');

    if (pScore) pScore.textContent = this.playerEngine.score.toString();
    if (pLines) pLines.textContent = this.playerEngine.linesClearedTotal.toString();
    if (pGarbage) pGarbage.textContent = this.playerEngine.pendingGarbage.toString();
    if (oScore) oScore.textContent = (this.session.mode === 'ai' ? this.opponentEngine.score : this.opponentScore).toString();
    if (oGarbage) oGarbage.textContent = this.opponentEngine.pendingGarbage.toString();
  }

  private renderPreviews() {
    const holdCanvas = document.getElementById('canvas-hold') as HTMLCanvasElement;
    if (holdCanvas) {
      PiecePreview.drawMiniPiece(holdCanvas, this.playerEngine.holdPieceType, 16);
    }

    for (let i = 0; i < 4; i++) {
      const nextCanvas = document.getElementById(`canvas-next-${i}`) as HTMLCanvasElement;
      if (nextCanvas) {
        const piece = this.playerEngine.nextQueue[i] || null;
        PiecePreview.drawMiniPiece(nextCanvas, piece, i === 0 ? 15 : 12);
      }
    }
  }

  private showGameOverModal(playerWon: boolean) {
    const modal = document.getElementById('modal-gameover');
    const title = document.getElementById('gameover-title');
    const subtitle = document.getElementById('gameover-subtitle');

    if (modal && title && subtitle) {
      if (playerWon) {
        title.textContent = 'VICTORY!';
        title.className = 'text-3xl font-extrabold mb-2 text-blue-500';
        subtitle.textContent = `You defeated ${this.opponentName}!`;
      } else {
        title.textContent = 'DEFEAT';
        title.className = 'text-3xl font-extrabold mb-2 text-rose-500';
        subtitle.textContent = `${this.opponentName} topped you out.`;
      }
      modal.classList.remove('hidden');
    }
  }

  private hideGameOverModal() {
    const modal = document.getElementById('modal-gameover');
    modal?.classList.add('hidden');
  }

  private showRematchOffer() {
    const subtitle = document.getElementById('gameover-subtitle');
    if (subtitle) subtitle.textContent = 'Opponent requested a rematch!';
    const btn = document.getElementById('btn-rematch');
    if (btn) {
      btn.textContent = 'Accept Rematch';
      btn.onclick = () => {
        this.session.peer?.sendMessage({ type: 'REMATCH_ACCEPT' });
        this.hideGameOverModal();
        this.playerEngine.reset();
        this.opponentEngine.reset();
        this.startLoop();
      };
    }
  }
}
