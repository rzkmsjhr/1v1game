import confetti from 'canvas-confetti';
import { TetrisEngine } from '../../engine/tetris-engine';
import { BoardRenderer } from '../../components/BoardRenderer';
import { PiecePreview } from '../../components/PiecePreview';
import { InputController } from '../../components/InputController';
import { TetrisAI } from '../../ai/tetris-ai';
import { sounds } from '../../engine/sound';
import type { GameInstance, GameSession, AppTheme } from '../types';
import type { NetworkHealth } from '../../network/webrtc-peer';

function hashRoomCode(code?: string | null): number {
  if (!code) return 0;
  let hash = 5381;
  for (let i = 0; i < code.length; i++) {
    hash = ((hash << 5) + hash + code.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
}

export class TetrisGame implements GameInstance {
  private container: HTMLElement;
  private session: GameSession;
  private currentTheme: AppTheme;

  private playerEngine: TetrisEngine;
  private opponentEngine: TetrisEngine;
  private ai: TetrisAI | null = null;
  private matchSeed: number = 0;

  private playerRenderer!: BoardRenderer;
  private opponentRenderer!: BoardRenderer;
  private inputController!: InputController;

  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private opponentName: string = 'AI Bot';
  private opponentScore: number = 0;
  private lastPieceBroadcastTime: number = 0;
  private trailingBroadcastTimer: number | null = null;
  private isMobileView: boolean = typeof window !== 'undefined' ? window.innerWidth < 768 : false;
  private isGameOverHandled: boolean = false;
  private rematchState: 'idle' | 'requested' | 'offer_received' = 'idle';

  // Network Health HUD elements
  private pingEl: HTMLElement | null = null;
  private pingDotEl: HTMLElement | null = null;
  private pingTextEl: HTMLElement | null = null;
  private peerAwayBannerEl: HTMLElement | null = null;

  // Cached DOM elements & dirty-checking fields to eliminate layout and canvas thrashing
  private statPlayerScoreEl: HTMLElement | null = null;
  private statPlayerLinesEl: HTMLElement | null = null;
  private statPlayerGarbageEl: HTMLElement | null = null;
  private statOpponentScoreEl: HTMLElement | null = null;
  private statOpponentGarbageEl: HTMLElement | null = null;
  private canvasHoldEl: HTMLCanvasElement | null = null;
  private canvasNextEls: (HTMLCanvasElement | null)[] = [];
  private cachedPlayerScore: number = -1;
  private cachedPlayerLines: number = -1;
  private cachedPlayerGarbage: number = -1;
  private cachedOpponentScore: number = -1;
  private cachedOpponentGarbage: number = -1;
  private cachedHoldPieceType: string | null = '__init__';
  private cachedNextQueue: string[] = [];
  private lastStatsUpdateTime: number = 0;

  constructor(container: HTMLElement, session: GameSession) {
    this.container = container;
    this.session = session;
    this.currentTheme = session.theme;
    this.isMobileView = typeof window !== 'undefined' ? window.innerWidth < 768 : false;

    if (session.mode === 'online') {
      const roomSeed = hashRoomCode(session.peer?.roomCode);
      this.matchSeed = roomSeed || (Math.floor(Math.random() * 2147483647) + 1);
    } else {
      this.matchSeed = Math.floor(Math.random() * 2147483647) + 1;
    }

    window.addEventListener('resize', this.handleResize);

    this.opponentName = session.mode === 'ai' 
      ? `AI (${session.aiDifficulty?.toUpperCase()})` 
      : 'Opponent';

    if (session.mode === 'ai' && session.aiDifficulty) {
      this.ai = new TetrisAI(session.aiDifficulty);
    }

    // 1. Render DOM structure first so canvases and stats elements exist
    this.render();

    // 2. Initialize player engine with synchronized matchSeed
    this.playerEngine = new TetrisEngine({
      onChange: () => this.handlePlayerChange(),
      onPieceLocked: () => {
        sounds.playHardDrop();
        this.syncFullBoard();
      },
      onLinesCleared: (_lines, garbageSent, isTetris, combo, clearedRows) => {
        sounds.playLineClear(_lines);
        if (isTetris) {
          this.playerRenderer?.triggerShake(8);
          this.playerRenderer?.addFloatingText('TETRIS!', '#0084f7');
        } else if (combo > 0) {
          this.playerRenderer?.addFloatingText(`COMBO x${combo + 1}`, '#eab308');
        }

        // Spawn particle explosions on all cleared rows
        if (clearedRows && clearedRows.length > 0) {
          const colors = ['#00f0f0', '#0000f0', '#f0a000', '#f0f000', '#00f000', '#a000f0', '#f00000'];
          for (const row of clearedRows) {
            const rowColor = isTetris ? '#38bdf8' : colors[Math.floor(Math.random() * colors.length)];
            this.playerRenderer?.addLineClearParticles(row, rowColor);
          }
        }

        if (garbageSent > 0) {
          this.sendGarbageToOpponent(garbageSent);
        }
      },
      onGarbageReceived: () => {
        sounds.playGarbageAlert();
        this.playerRenderer?.triggerShake(5);
        this.syncFullBoard();
      },
      onGameOver: () => {
        this.handleGameOver(false);
      }
    }, this.matchSeed);

    // 3. Initialize opponent engine with the EXACT SAME matchSeed
    this.opponentEngine = new TetrisEngine({
      onChange: () => {},
      onPieceLocked: () => {},
      onLinesCleared: (_lines, garbageSent, isTetris, _combo, clearedRows) => {
        if (isTetris) {
          this.opponentRenderer?.triggerShake(6);
          this.opponentRenderer?.addFloatingText('TETRIS!', '#ef4444');
        }
        if (clearedRows && clearedRows.length > 0) {
          const colors = ['#00f0f0', '#0000f0', '#f0a000', '#f0f000', '#00f000', '#a000f0', '#f00000'];
          for (const row of clearedRows) {
            const rowColor = isTetris ? '#ef4444' : colors[Math.floor(Math.random() * colors.length)];
            this.opponentRenderer?.addLineClearParticles(row, rowColor);
          }
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
    }, this.matchSeed);

    this.setupInputController();
    if (session.mode === 'online') {
      this.setupNetwork();
    }

    // 4. Initial UI sync and game loop
    this.updateStatsUI();
    this.renderPreviews();
    this.startLoop();

    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('snap') === 'tetris') {
      const colors = ['#00f0f0', '#0000f0', '#f0a000', '#f0f000', '#00f000', '#a000f0', '#f00000'];
      for (let r = 16; r < 24; r++) {
        for (let c = 0; c < 10; c++) {
          if ((r + c) % 3 !== 0) {
            this.playerEngine.grid[r][c] = colors[(r * 2 + c) % colors.length];
          }
          if ((r * 3 + c) % 4 !== 0) {
            this.opponentEngine.grid[r][c] = colors[(r + c * 2) % colors.length];
          }
        }
      }
      this.playerEngine.score = 4250;
      this.playerEngine.linesClearedTotal = 12;
      this.opponentScore = 3800;
      this.updateStatsUI();
    }
  }

  public setTheme(theme: AppTheme) {
    this.currentTheme = theme;
    this.playerRenderer?.setTheme(theme);
    this.opponentRenderer?.setTheme(theme);
  }

  public destroy() {
    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      this.session.peer.sendMessage({ type: 'PLAYER_LEAVE' });
    }

    this.isRunning = false;
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    if (this.trailingBroadcastTimer !== null) {
      clearTimeout(this.trailingBroadcastTimer);
      this.trailingBroadcastTimer = null;
    }
    this.inputController?.destroy();
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    window.removeEventListener('resize', this.handleResize);
    this.statPlayerScoreEl = null;
    this.statPlayerLinesEl = null;
    this.statPlayerGarbageEl = null;
    this.statOpponentScoreEl = null;
    this.statOpponentGarbageEl = null;
    this.canvasHoldEl = null;
    this.canvasNextEls = [];
    this.pingEl = null;
    this.pingDotEl = null;
    this.pingTextEl = null;
    this.peerAwayBannerEl = null;
    this.container.innerHTML = '';
  }

  private handleResize = () => {
    const mobile = window.innerWidth < 768;
    if (mobile !== this.isMobileView) {
      this.isMobileView = mobile;
      this.render();
      this.updateStatsUI();
      this.renderPreviews();
    } else if (this.isMobileView && this.playerRenderer && this.opponentRenderer) {
      const sizes = this.getMobileBlockSizes();
      this.playerRenderer.resize(sizes.playerBS);
      this.opponentRenderer.resize(sizes.opponentBS);
      this.renderPreviews();
    }
  };

  private getMobileBlockSizes(): { playerBS: number; opponentBS: number } {
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 375;
    const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 667;

    // Available width for the mobile arena container (with safe horizontal padding)
    const availableW = Math.min(screenWidth, 440) - 16;

    // Overhead: player card (12px) + opponent card (10px) + gap (6px) = 28px
    const boardSpace = availableW - 28;

    // Allocate ~67% to player, ~33% to opponent (10 columns each)
    let playerBS = Math.floor((boardSpace * 0.67) / 10);
    let opponentBS = Math.floor((boardSpace * 0.33) / 10);

    // Height constraint: ensure entire layout fits within screen height with 0 scrolling
    const maxBoardH = screenHeight - 196;
    const maxPlayerBSByHeight = Math.floor(maxBoardH / 20);

    if (maxPlayerBSByHeight > 0) {
      playerBS = Math.min(playerBS, maxPlayerBSByHeight);
    }

    playerBS = Math.max(19, Math.min(playerBS, 25));
    opponentBS = Math.max(9, Math.min(opponentBS, Math.floor(playerBS * 0.52)));

    return { playerBS, opponentBS };
  }

  private setupInputController() {
    this.inputController = new InputController({
      moveLeft: () => { if (this.playerEngine.moveLeft()) sounds.playMove(); },
      moveRight: () => { if (this.playerEngine.moveRight()) sounds.playMove(); },
      softDrop: () => { this.playerEngine.softDrop(); },
      hardDrop: () => { this.playerEngine.hardDrop(); },
      rotateCW: () => { if (this.playerEngine.rotate('cw')) sounds.playRotate(); },
      rotateCCW: () => { if (this.playerEngine.rotate('ccw')) sounds.playRotate(); },
      hold: () => {
        if (this.playerEngine.hold()) {
          sounds.playHold();
          this.syncFullBoard();
        }
      }
    });
  }

  private handleBeforeUnload = () => {
    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      this.session.peer.sendMessage({ type: 'PLAYER_LEAVE' });
    }
  };

  private setupNetwork() {
    if (!this.session.peer) return;

    const peer = this.session.peer;
    const origOnMessage = (peer as any).events?.onMessage;
    const origOnStatusChange = (peer as any).events?.onStatusChange;
    const origOnHealthChange = (peer as any).events?.onHealthChange;

    this.session.peer = Object.assign(peer, {
      events: {
        ...(peer as any).events,
        onMessage: (msg: any) => {
          origOnMessage?.(msg);
          this.handleNetworkMessage(msg);
        },
        onStatusChange: (status: string, message?: string) => {
          origOnStatusChange?.(status, message);
          if (status === 'connected') {
            if (peer.role === 'host') {
              peer.sendMessage({ type: 'TETRIS_START_SEED', seed: this.matchSeed });
            } else if (peer.role === 'guest') {
              peer.sendMessage({ type: 'TETRIS_REQUEST_SEED' });
            }
          }
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
      if (peer.role === 'host') {
        peer.sendMessage({ type: 'TETRIS_START_SEED', seed: this.matchSeed });
      } else if (peer.role === 'guest') {
        peer.sendMessage({ type: 'TETRIS_REQUEST_SEED' });
      }
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
    if (this.playerEngine?.isGameOver || this.isGameOverHandled) {
      const rematchBtn = document.getElementById('btn-rematch');
      if (rematchBtn) {
        rematchBtn.textContent = 'Opponent Disconnected';
        rematchBtn.classList.add('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
        rematchBtn.classList.remove('animate-pulse');
      }
      return;
    }

    this.isGameOverHandled = true;
    this.isRunning = false;
    this.inputController?.setEnabled(false);

    sounds.playWin();
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 } });

    const modal = document.getElementById('modal-gameover');
    const title = document.getElementById('gameover-title');
    const subtitle = document.getElementById('gameover-subtitle');
    const rematchBtn = document.getElementById('btn-rematch');
    const exitBtn = document.getElementById('btn-modal-exit');

    if (title) {
      title.textContent = 'VICTORY BY FORFEIT!';
      title.className = 'text-2xl sm:text-3xl font-extrabold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500';
    }
    if (subtitle) {
      subtitle.textContent = reason;
    }
    if (rematchBtn) {
      rematchBtn.textContent = 'Opponent Disconnected';
      rematchBtn.classList.add('opacity-50', 'cursor-not-allowed', 'pointer-events-none');
      rematchBtn.classList.remove('animate-pulse');
    }
    if (exitBtn) {
      exitBtn.className = 'ps-btn-primary w-full py-3 rounded-xl text-sm font-semibold cursor-pointer';
    }
    modal?.classList.remove('hidden');
  }

  private handleNetworkMessage(msg: any) {
    switch (msg.type) {
      case 'PLAYER_LEAVE':
        this.handleForfeitVictory('Opponent forfeited the match.');
        break;

      case 'TETRIS_REQUEST_SEED':
        if (this.session.peer?.role === 'host' && this.session.peer.isConnected) {
          this.session.peer.sendMessage({ type: 'TETRIS_START_SEED', seed: this.matchSeed });
        }
        break;

      case 'TETRIS_START_SEED':
        if (msg.seed && msg.seed !== this.matchSeed) {
          this.matchSeed = msg.seed;
          this.playerEngine.reset(true, msg.seed);
          this.opponentEngine.reset(false, msg.seed);
          this.playerRenderer?.reset();
          this.opponentRenderer?.reset();
          this.updateStatsUI(true);
          this.renderPreviews(true);
        }
        break;

      case 'TETRIS_PIECE_MOVE':
        if (this.opponentEngine) {
          if (msg.currentPiece !== undefined) {
            this.opponentEngine.currentPiece = msg.currentPiece;
          }
          this.opponentScore = msg.score;
          this.updateStatsUI();
        }
        break;

      case 'TETRIS_SYNC_BOARD':
        for (let r = 0; r < 20; r++) {
          for (let c = 0; c < 10; c++) {
            this.opponentEngine.grid[r + 4][c] = msg.grid[r][c];
          }
        }
        this.opponentScore = msg.score;
        this.opponentEngine.pendingGarbage = msg.pendingGarbage;
        if (msg.currentPiece !== undefined) {
          this.opponentEngine.currentPiece = msg.currentPiece;
        }
        this.updateStatsUI(true);
        break;

      case 'TETRIS_GARBAGE':
        this.playerEngine.addIncomingGarbage(msg.lines);
        sounds.playGarbageAlert();
        this.playerRenderer.triggerShake(4);
        break;

      case 'GAME_OVER':
        this.handleGameOver(msg.didWin, true);
        break;

      case 'TETRIS_REMATCH_REQUEST':
      case 'REMATCH_REQUEST':
        this.showRematchOffer();
        break;

      case 'TETRIS_REMATCH_ACCEPT':
      case 'REMATCH_ACCEPT':
        this.startNewMatch(msg.seed);
        break;
    }
  }

  private handlePlayerChange() {
    if (!this.playerEngine) return;
    this.updateStatsUI();
    this.renderPreviews();

    // Active movement broadcast: 60Hz transmission (every 16ms) with trailing flush
    if (this.session.mode === 'online' && this.session.peer?.isConnected) {
      const now = performance.now();
      if (now - this.lastPieceBroadcastTime >= 16) {
        if (this.trailingBroadcastTimer !== null) {
          clearTimeout(this.trailingBroadcastTimer);
          this.trailingBroadcastTimer = null;
        }
        this.lastPieceBroadcastTime = now;
        this.session.peer.sendMessage({
          type: 'TETRIS_PIECE_MOVE',
          currentPiece: this.playerEngine.currentPiece,
          score: this.playerEngine.score
        });
      } else {
        // Trailing timer guarantees the final shift position is always broadcast to peer
        if (this.trailingBroadcastTimer !== null) {
          clearTimeout(this.trailingBroadcastTimer);
        }
        this.trailingBroadcastTimer = window.setTimeout(() => {
          this.trailingBroadcastTimer = null;
          if (this.session.mode === 'online' && this.session.peer?.isConnected && this.playerEngine) {
            this.lastPieceBroadcastTime = performance.now();
            this.session.peer.sendMessage({
              type: 'TETRIS_PIECE_MOVE',
              currentPiece: this.playerEngine.currentPiece,
              score: this.playerEngine.score
            });
          }
        }, 16);
      }
    }
  }

  private syncFullBoard() {
    if (this.session.mode === 'online' && this.session.peer?.isConnected && this.playerEngine) {
      if (this.trailingBroadcastTimer !== null) {
        clearTimeout(this.trailingBroadcastTimer);
        this.trailingBroadcastTimer = null;
      }
      this.lastPieceBroadcastTime = performance.now();
      this.session.peer.sendMessage({
        type: 'TETRIS_SYNC_BOARD',
        grid: this.playerEngine.getVisibleGrid(),
        score: this.playerEngine.score,
        pendingGarbage: this.playerEngine.pendingGarbage,
        currentPiece: this.playerEngine.currentPiece
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

  private handleGameOver(playerWon: boolean, isRemote: boolean = false) {
    if (this.isGameOverHandled) return;
    this.isGameOverHandled = true;
    this.isRunning = false;
    this.inputController.setEnabled(false);

    if (!isRemote && this.session.mode === 'online' && this.session.peer?.isConnected) {
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

    if (this.isMobileView) {
      this.container.innerHTML = this.getMobileMarkup(isDark);
    } else {
      this.container.innerHTML = this.getDesktopMarkup(isDark);
    }

    this.initCanvases();
    this.attachEventListeners();
  }

  private getMobileMarkup(isDark: boolean): string {
    return `
      <!-- Top Arena Header -->
      <div class="w-full max-w-md flex items-center justify-between px-2 py-1.5 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'} select-none">
        <button id="btn-tetris-exit" class="ps-btn-secondary px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center space-x-1">
          <span>← Exit</span>
        </button>

        <div class="flex items-center space-x-1.5 font-bold text-xs">
          <span class="text-blue-500">TETRIS BATTLE</span>
          <span class="text-gray-400 text-[10px]">•</span>
          <span class="text-gray-400 text-[10px] uppercase">${this.session.mode === 'ai' ? `AI: ${this.session.aiDifficulty}` : '1v1 Online'}</span>
        </div>

        <div class="flex items-center space-x-1.5">
          <div id="tetris-net-ping" class="hidden items-center space-x-1 text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-300/40 dark:border-emerald-500/30 rounded px-1.5 py-0.5 shadow-sm">
            <span id="tetris-net-dot" class="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400"></span>
            <span id="tetris-net-text">--ms</span>
          </div>
          <div class="text-[10px] font-mono text-gray-500 font-semibold px-2 py-0.5 rounded bg-gray-500/10">
            VS
          </div>
        </div>
      </div>

      <!-- Inactive Tab / Opponent Away Banner -->
      <div id="tetris-peer-away-banner" class="hidden w-full max-w-md px-2 py-0.5 text-center rounded-lg bg-amber-100 dark:bg-amber-500/20 border border-amber-300/40 dark:border-amber-500/40 text-amber-700 dark:text-amber-300 font-bold text-[10px] tracking-wide animate-pulse">
        ⚠️ Opponent is tabbed out / minimized
      </div>

      <!-- Main Game Container (Stacked Dashboard + Arena) -->
      <div class="w-full max-w-md flex flex-col items-center gap-1.5 px-1 my-auto select-none">

        <!-- Top Dashboard: HOLD, YOU (SCORE / LINES / GARB), NEXT (Stacked directly above main area) -->
        <div class="w-full flex items-center justify-between gap-1.5">
          <!-- Hold Box -->
          <div class="ps-card rounded-xl p-1 text-center w-[60px] h-[54px] flex flex-col items-center justify-between shadow-sm flex-shrink-0">
            <div class="text-[8px] font-bold uppercase tracking-wider text-gray-400 leading-none">HOLD</div>
            <canvas id="canvas-hold" width="50" height="36" class="mx-auto block"></canvas>
          </div>

          <!-- Player Stats Card (YOU) -->
          <div class="flex-1 ps-card rounded-xl px-2 py-1 flex flex-col items-center justify-between h-[54px] shadow-sm border border-blue-500/30">
            <div class="w-full flex items-center justify-between px-0.5 leading-none mb-0.5">
              <span class="text-[9px] font-extrabold tracking-wider text-blue-400 uppercase">YOU</span>
              <span class="text-[8px] font-semibold text-gray-400 uppercase">STATS</span>
            </div>
            <div class="w-full grid grid-cols-3 gap-1 text-center">
              <div class="${isDark ? 'bg-gray-800/70' : 'bg-gray-100'} rounded px-1 py-0.5">
                <div class="text-[7px] uppercase tracking-wider text-gray-400 font-bold leading-tight">SCORE</div>
                <div id="stat-player-score" class="font-mono font-bold text-[11px] ${isDark ? 'text-white' : 'text-gray-900'} leading-tight">0</div>
              </div>
              <div class="${isDark ? 'bg-gray-800/70' : 'bg-gray-100'} rounded px-1 py-0.5">
                <div class="text-[7px] uppercase tracking-wider text-gray-400 font-bold leading-tight">LINES</div>
                <div id="stat-player-lines" class="font-mono font-bold text-[11px] text-blue-500 leading-tight">0</div>
              </div>
              <div class="${isDark ? 'bg-gray-800/70' : 'bg-gray-100'} rounded px-1 py-0.5">
                <div class="text-[7px] uppercase tracking-wider text-gray-400 font-bold leading-tight">GARB</div>
                <div id="stat-player-garbage" class="font-mono font-bold text-[11px] text-yellow-500 leading-tight">0</div>
              </div>
            </div>
          </div>

          <!-- Next Piece Box -->
          <div class="ps-card rounded-xl p-1 text-center w-[60px] h-[54px] flex flex-col items-center justify-between shadow-sm flex-shrink-0">
            <div class="text-[8px] font-bold uppercase tracking-wider text-gray-400 leading-none">NEXT</div>
            <canvas id="canvas-next-0" width="50" height="36" class="mx-auto block"></canvas>
            <canvas id="canvas-next-1" class="hidden"></canvas>
            <canvas id="canvas-next-2" class="hidden"></canvas>
            <canvas id="canvas-next-3" class="hidden"></canvas>
          </div>
        </div>

        <!-- Main Battle Arena: Player Board (Wider!) + Opponent Mini Battle Cam (Edge-to-edge) -->
        <div class="w-full flex items-start justify-between gap-1.5">
          <!-- Center/Main: PLAYER BOARD (Wider & high contrast) -->
          <div class="relative ps-card rounded-xl p-1 border-2 border-blue-500/60 shadow-xl shadow-blue-500/20 flex-shrink-0">
            <canvas id="canvas-player" class="rounded block"></canvas>
          </div>

          <!-- Right: OPPONENT MINI BATTLE CAM -->
          <div class="relative ps-card rounded-xl p-1 border border-rose-500/40 shadow-md flex flex-col items-center flex-shrink-0">
            <div class="w-full flex items-center justify-between px-1 mb-1 leading-none">
              <span class="text-[8px] font-extrabold text-rose-500 uppercase truncate max-w-[55px]">${this.opponentName}</span>
              <div class="flex items-center space-x-0.5 text-[8px] font-mono text-rose-400">
                <span class="text-[7px] text-gray-400">G:</span>
                <span id="stat-opponent-garbage" class="font-bold">0</span>
              </div>
            </div>

            <canvas id="canvas-opponent" class="rounded block"></canvas>

            <div class="w-full flex items-center justify-between px-1 mt-1 text-[8px] text-gray-400 ${isDark ? 'bg-gray-800/70' : 'bg-gray-100'} py-0.5 rounded leading-none">
              <span class="text-[7px] font-bold">SCORE</span>
              <span id="stat-opponent-score" class="font-mono font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'} text-[9px]">0</span>
            </div>
          </div>
        </div>

      </div>

      <!-- Mobile Touch Controls (Compact & Ergonomic) -->
      <div class="w-full max-w-md px-1 py-1 select-none touch-none space-y-1.5">
        <div class="grid grid-cols-5 gap-1.5">
          <button id="touch-hold" class="touch-control-btn py-2.5 rounded-xl ps-btn-secondary font-bold text-xs active:scale-95 transition-transform flex flex-col items-center justify-center">
            <span class="text-sm leading-none mb-0.5">↶</span>
            <span class="text-[8px] uppercase tracking-wider">HOLD</span>
          </button>
          <button id="touch-left" class="touch-control-btn py-2.5 rounded-xl ps-btn-secondary font-bold text-xl active:scale-95 transition-transform flex items-center justify-center">
            ←
          </button>
          <button id="touch-down" class="touch-control-btn py-2.5 rounded-xl ps-btn-secondary font-bold text-xl active:scale-95 transition-transform flex items-center justify-center">
            ↓
          </button>
          <button id="touch-right" class="touch-control-btn py-2.5 rounded-xl ps-btn-secondary font-bold text-xl active:scale-95 transition-transform flex items-center justify-center">
            →
          </button>
          <button id="touch-cw" class="touch-control-btn py-2.5 rounded-xl ps-btn-primary font-bold text-xs active:scale-95 transition-transform flex flex-col items-center justify-center bg-blue-600 shadow-md shadow-blue-500/20">
            <span class="text-sm leading-none mb-0.5">↻</span>
            <span class="text-[8px] uppercase tracking-wider">ROT</span>
          </button>
        </div>

        <button id="touch-drop" class="touch-control-btn w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 text-white font-extrabold text-xs active:scale-[0.98] transition-transform flex items-center justify-center space-x-1.5 shadow-lg shadow-rose-600/30">
          <span>⚡</span>
          <span>HARD DROP</span>
          <span>⚡</span>
        </button>
      </div>

      <!-- Game Over Modal -->
      <div id="modal-gameover" class="hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
  }

  private getDesktopMarkup(isDark: boolean): string {
    return `
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

        <div class="flex items-center space-x-2">
          <div id="tetris-net-ping" class="hidden items-center space-x-1 text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-300/40 dark:border-emerald-500/30 rounded px-1.5 py-0.5 shadow-sm">
            <span id="tetris-net-dot" class="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400"></span>
            <span id="tetris-net-text">--ms</span>
          </div>
        </div>
      </div>

      <!-- Inactive Tab / Opponent Away Banner -->
      <div id="tetris-peer-away-banner" class="hidden w-full max-w-5xl px-3 py-1 mb-1 text-center rounded-lg bg-amber-100 dark:bg-amber-500/20 border border-amber-300/40 dark:border-amber-500/40 text-amber-700 dark:text-amber-300 font-bold text-xs tracking-wide animate-pulse">
        ⚠️ Opponent is tabbed out / minimized
      </div>

      <!-- Main Battle Canvas Grid -->
      <div class="w-full max-w-5xl flex flex-row items-center justify-center gap-4 sm:gap-8 my-2">
        
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
        <div class="flex flex-col items-center justify-center space-y-2">
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
  }

  private initCanvases() {
    let playerBlockSize = 26;
    let opponentBlockSize = 22;

    if (this.isMobileView) {
      const sizes = this.getMobileBlockSizes();
      playerBlockSize = sizes.playerBS;
      opponentBlockSize = sizes.opponentBS;
    }

    const pCanvas = document.getElementById('canvas-player') as HTMLCanvasElement;
    const oCanvas = document.getElementById('canvas-opponent') as HTMLCanvasElement;

    if (pCanvas) {
      this.playerRenderer = new BoardRenderer(pCanvas, playerBlockSize, this.currentTheme);
    }
    if (oCanvas) {
      this.opponentRenderer = new BoardRenderer(oCanvas, opponentBlockSize, this.currentTheme);
    }

    this.statPlayerScoreEl = document.getElementById('stat-player-score');
    this.statPlayerLinesEl = document.getElementById('stat-player-lines');
    this.statPlayerGarbageEl = document.getElementById('stat-player-garbage');
    this.statOpponentScoreEl = document.getElementById('stat-opponent-score');
    this.statOpponentGarbageEl = document.getElementById('stat-opponent-garbage');
    this.canvasHoldEl = document.getElementById('canvas-hold') as HTMLCanvasElement;
    this.canvasNextEls = [0, 1, 2, 3].map(i => document.getElementById(`canvas-next-${i}`) as HTMLCanvasElement);

    this.pingEl = document.getElementById('tetris-net-ping');
    this.pingDotEl = document.getElementById('tetris-net-dot');
    this.pingTextEl = document.getElementById('tetris-net-text');
    this.peerAwayBannerEl = document.getElementById('tetris-peer-away-banner');

    // Reset caches so next UI pass paints cleanly
    this.cachedPlayerScore = -1;
    this.cachedPlayerLines = -1;
    this.cachedPlayerGarbage = -1;
    this.cachedOpponentScore = -1;
    this.cachedOpponentGarbage = -1;
    this.cachedHoldPieceType = '__init__';
    this.cachedNextQueue = [];
  }

  private attachEventListeners() {
    document.getElementById('btn-tetris-exit')?.addEventListener('click', () => {
      if (this.session.mode === 'online' && this.session.peer?.isConnected) {
        this.session.peer.sendMessage({ type: 'PLAYER_LEAVE' });
      }
      this.session.onExit();
    });

    document.getElementById('btn-rematch')?.addEventListener('click', () => {
      this.handleRematch();
    });

    document.getElementById('btn-modal-exit')?.addEventListener('click', () => {
      if (this.session.mode === 'online' && this.session.peer?.isConnected) {
        this.session.peer.sendMessage({ type: 'PLAYER_LEAVE' });
      }
      this.session.onExit();
    });

    // Mobile touch controls with hold/repeat support
    const bindTouchBtn = (id: string, onDown: () => void, onUp?: () => void) => {
      const btn = document.getElementById(id);
      if (!btn) return;

      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        onDown();
      });

      if (onUp) {
        btn.addEventListener('pointerup', (e) => {
          e.preventDefault();
          onUp();
        });
        btn.addEventListener('pointercancel', (e) => {
          e.preventDefault();
          onUp();
        });
        btn.addEventListener('pointerleave', (e) => {
          e.preventDefault();
          onUp();
        });
      }
    };

    bindTouchBtn('touch-left', () => this.inputController.pressLeft(), () => this.inputController.releaseLeft());
    bindTouchBtn('touch-right', () => this.inputController.pressRight(), () => this.inputController.releaseRight());
    bindTouchBtn('touch-down', () => this.inputController.pressDown(), () => this.inputController.releaseDown());
    bindTouchBtn('touch-cw', () => this.inputController.pressRotate());
    bindTouchBtn('touch-drop', () => this.inputController.pressHardDrop());
    bindTouchBtn('touch-hold', () => this.inputController.pressHold());
  }

  private startLoop() {
    this.isGameOverHandled = false;
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

  private updateStatsUI(force: boolean = false) {
    if (!this.playerEngine) return;
    const now = performance.now();
    // Throttle high-frequency stats updates to max 15Hz unless forced (lines clear, piece lock, etc.)
    if (!force && now - this.lastStatsUpdateTime < 66) {
      return;
    }
    this.lastStatsUpdateTime = now;

    const pScore = this.playerEngine.score;
    const pLines = this.playerEngine.linesClearedTotal;
    const pGarbage = this.playerEngine.pendingGarbage;
    const oScore = this.session.mode === 'ai' ? (this.opponentEngine?.score || 0) : this.opponentScore;
    const oGarbage = this.opponentEngine?.pendingGarbage || 0;

    if (this.statPlayerScoreEl && (force || pScore !== this.cachedPlayerScore)) {
      this.cachedPlayerScore = pScore;
      this.statPlayerScoreEl.textContent = pScore.toString();
    }
    if (this.statPlayerLinesEl && (force || pLines !== this.cachedPlayerLines)) {
      this.cachedPlayerLines = pLines;
      this.statPlayerLinesEl.textContent = pLines.toString();
    }
    if (this.statPlayerGarbageEl && (force || pGarbage !== this.cachedPlayerGarbage)) {
      this.cachedPlayerGarbage = pGarbage;
      this.statPlayerGarbageEl.textContent = pGarbage.toString();
    }
    if (this.statOpponentScoreEl && (force || oScore !== this.cachedOpponentScore)) {
      this.cachedOpponentScore = oScore;
      this.statOpponentScoreEl.textContent = oScore.toString();
    }
    if (this.statOpponentGarbageEl && (force || oGarbage !== this.cachedOpponentGarbage)) {
      this.cachedOpponentGarbage = oGarbage;
      this.statOpponentGarbageEl.textContent = oGarbage.toString();
    }
  }

  private renderPreviews(force: boolean = false) {
    if (!this.playerEngine) return;

    // 1. Hold piece preview (only redraw if hold piece changed or forced)
    const holdPiece = this.playerEngine.holdPieceType;
    if (force || holdPiece !== this.cachedHoldPieceType) {
      this.cachedHoldPieceType = holdPiece;
      const holdCanvas = this.canvasHoldEl;
      if (holdCanvas) {
        const holdScale = this.isMobileView ? 11 : 16;
        PiecePreview.drawMiniPiece(holdCanvas, holdPiece, holdScale);
      }
    }

    // 2. Next queue previews (only redraw if queue changed or forced)
    const queue = this.playerEngine.nextQueue;
    let queueChanged = force || queue.length !== this.cachedNextQueue.length;
    if (!queueChanged) {
      for (let i = 0; i < 4; i++) {
        if (queue[i] !== this.cachedNextQueue[i]) {
          queueChanged = true;
          break;
        }
      }
    }

    if (queueChanged) {
      this.cachedNextQueue = [...queue];
      for (let i = 0; i < 4; i++) {
        const nextCanvas = this.canvasNextEls[i];
        if (nextCanvas) {
          const piece = queue[i] || null;
          const nextScale = this.isMobileView ? 11 : (i === 0 ? 15 : 12);
          PiecePreview.drawMiniPiece(nextCanvas, piece, nextScale);
        }
      }
    }
  }

  private showGameOverModal(playerWon: boolean, customSubtitle?: string) {
    const modal = document.getElementById('modal-gameover');
    const title = document.getElementById('gameover-title');
    const subtitle = document.getElementById('gameover-subtitle');

    if (modal && title && subtitle) {
      if (playerWon) {
        title.textContent = 'VICTORY!';
        title.className = 'text-3xl font-extrabold mb-2 text-blue-500';
        subtitle.textContent = customSubtitle || `You defeated ${this.opponentName}!`;
      } else {
        title.textContent = 'DEFEAT';
        title.className = 'text-3xl font-extrabold mb-2 text-rose-500';
        subtitle.textContent = customSubtitle || `${this.opponentName} topped you out.`;
      }

      const rematchBtn = document.getElementById('btn-rematch');
      const exitBtn = document.getElementById('btn-modal-exit');

      if (customSubtitle) {
        rematchBtn?.classList.add('hidden');
        if (exitBtn) {
          exitBtn.className = 'ps-btn-primary w-full py-3 rounded-xl text-sm font-semibold';
        }
      } else {
        rematchBtn?.classList.remove('hidden');
        if (this.rematchState === 'offer_received') {
          this.showRematchOffer();
        } else if (rematchBtn) {
          rematchBtn.textContent = 'Play Again';
          rematchBtn.classList.remove('opacity-70', 'cursor-not-allowed', 'animate-pulse', 'pointer-events-none');
          rematchBtn.className = 'ps-btn-primary w-full py-3 rounded-xl text-sm font-semibold cursor-pointer';
        }
        if (exitBtn) {
          exitBtn.className = 'w-full py-2 text-xs font-semibold text-gray-500 hover:text-gray-400 cursor-pointer';
        }
      }

      modal.classList.remove('hidden');
    }
  }

  private hideGameOverModal() {
    const modal = document.getElementById('modal-gameover');
    modal?.classList.add('hidden');
  }

  private handleRematch() {
    const btn = document.getElementById('btn-rematch');

    if (this.session.mode === 'ai') {
      this.startNewMatch();
      return;
    }

    if (!this.session.peer?.isConnected) return;

    if (this.rematchState === 'offer_received') {
      const newSeed = Math.floor(Math.random() * 2147483647) + 1;
      this.session.peer.sendMessage({ type: 'TETRIS_REMATCH_ACCEPT', seed: newSeed });
      this.session.peer.sendMessage({ type: 'REMATCH_ACCEPT', seed: newSeed });
      this.startNewMatch(newSeed);
    } else if (this.rematchState === 'idle') {
      this.rematchState = 'requested';
      if (btn) {
        btn.textContent = 'Waiting for Opponent...';
        btn.classList.add('opacity-70', 'cursor-not-allowed');
      }
      this.session.peer.sendMessage({ type: 'TETRIS_REMATCH_REQUEST' });
      this.session.peer.sendMessage({ type: 'REMATCH_REQUEST' });
    }
  }

  private showRematchOffer() {
    if (this.rematchState === 'requested') {
      // Both clicked rematch at around the same time!
      const newSeed = Math.floor(Math.random() * 2147483647) + 1;
      if (this.session.peer?.role === 'host') {
        if (this.session.peer?.isConnected) {
          this.session.peer.sendMessage({ type: 'TETRIS_REMATCH_ACCEPT', seed: newSeed });
          this.session.peer.sendMessage({ type: 'REMATCH_ACCEPT', seed: newSeed });
        }
        this.startNewMatch(newSeed);
      }
      return;
    }

    this.rematchState = 'offer_received';
    const subtitle = document.getElementById('gameover-subtitle');
    if (subtitle) subtitle.textContent = 'Opponent offered a rematch!';
    const btn = document.getElementById('btn-rematch');
    if (btn) {
      btn.textContent = 'Accept Rematch!';
      btn.classList.remove('opacity-70', 'cursor-not-allowed', 'hidden');
      btn.className = 'w-full py-3 px-6 rounded-xl font-black tracking-wider uppercase text-white bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 shadow-lg shadow-emerald-500/30 active:scale-95 transition-all cursor-pointer animate-pulse';
    }
    sounds.playRoundComplete();
  }

  private startNewMatch(seed?: number) {
    this.rematchState = 'idle';
    this.hideGameOverModal();

    const btn = document.getElementById('btn-rematch');
    if (btn) {
      btn.textContent = 'Play Again';
      btn.classList.remove('opacity-70', 'cursor-not-allowed', 'animate-pulse', 'pointer-events-none');
      btn.className = 'ps-btn-primary w-full py-3 rounded-xl text-sm font-semibold cursor-pointer';
    }

    const newSeed = seed || Math.floor(Math.random() * 2147483647) + 1;
    this.matchSeed = newSeed;
    this.playerEngine.reset(true, newSeed);
    this.opponentEngine.reset(false, newSeed);
    this.playerRenderer?.reset();
    this.opponentRenderer?.reset();
    this.ai?.reset();
    this.opponentScore = 0;
    this.updateStatsUI(true);
    this.renderPreviews(true);
    this.startLoop();
  }
}
