import confetti from 'canvas-confetti';
import { TetrisEngine } from './engine/tetris-engine';
import { BoardRenderer } from './components/BoardRenderer';
import { PiecePreview } from './components/PiecePreview';
import { InputController } from './components/InputController';
import { TetrisAI, type AIDifficulty } from './ai/tetris-ai';
import { WebRTCPeer, type NetworkMessage } from './network/webrtc-peer';
import { sounds } from './engine/sound';

type GameMode = 'menu' | 'ai' | 'online';

class TetrisApp {
  private mode: GameMode = 'menu';
  private aiDifficulty: AIDifficulty = 'medium';

  private playerEngine: TetrisEngine;
  private opponentEngine: TetrisEngine;
  private ai: TetrisAI | null = null;
  private peer: WebRTCPeer | null = null;

  private playerRenderer!: BoardRenderer;
  private opponentRenderer!: BoardRenderer;
  private inputController!: InputController;

  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private isMuted: boolean = false;
  private roomCode: string | null = null;
  private opponentName: string = 'AI Opponent';
  private opponentScore: number = 0;

  // DOM Elements
  private appContainer: HTMLElement;

  constructor() {
    this.appContainer = document.getElementById('app')!;

    // Initialize player engine
    this.playerEngine = new TetrisEngine({
      onChange: () => this.handlePlayerChange(),
      onPieceLocked: () => sounds.playHardDrop(),
      onLinesCleared: (lines, garbageSent, isTetris, combo) => {
        sounds.playLineClear(lines);
        if (isTetris) {
          this.playerRenderer.triggerShake(8);
          this.playerRenderer.addFloatingText('TETRIS!', '#00f0ff');
        } else if (combo > 0) {
          this.playerRenderer.addFloatingText(`COMBO x${combo + 1}`, '#ffe600');
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

    // Initialize opponent engine (simulated for AI or state-mirrored for human)
    this.opponentEngine = new TetrisEngine({
      onChange: () => {},
      onPieceLocked: () => {},
      onLinesCleared: (_lines, garbageSent, isTetris) => {
        if (isTetris) {
          this.opponentRenderer.triggerShake(6);
          this.opponentRenderer.addFloatingText('TETRIS!', '#ff0055');
        }
        if (garbageSent > 0 && this.mode === 'ai') {
          // AI attacks player!
          this.playerEngine.addIncomingGarbage(garbageSent);
          sounds.playGarbageAlert();
        }
      },
      onGameOver: () => {
        if (this.mode === 'ai') {
          this.handleGameOver(true);
        }
      }
    });

    this.setupInputController();
    this.checkUrlRoomParam();
    this.renderLobby();
  }

  private setupInputController() {
    this.inputController = new InputController({
      moveLeft: () => {
        if (this.playerEngine.moveLeft()) sounds.playMove();
      },
      moveRight: () => {
        if (this.playerEngine.moveRight()) sounds.playMove();
      },
      softDrop: () => {
        this.playerEngine.softDrop();
      },
      hardDrop: () => {
        this.playerEngine.hardDrop();
      },
      rotateCW: () => {
        if (this.playerEngine.rotate('cw')) sounds.playRotate();
      },
      rotateCCW: () => {
        if (this.playerEngine.rotate('ccw')) sounds.playRotate();
      },
      hold: () => {
        if (this.playerEngine.hold()) sounds.playHold();
      }
    });
    this.inputController.setEnabled(false);
  }

  private checkUrlRoomParam() {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      this.roomCode = room.toUpperCase();
    }
  }

  private handlePlayerChange() {
    this.updateStatsUI();
    this.renderPreviews();

    // Broadcast state to opponent if online
    if (this.mode === 'online' && this.peer?.isConnected) {
      this.peer.sendMessage({
        type: 'SYNC_BOARD',
        grid: this.playerEngine.getVisibleGrid(),
        score: this.playerEngine.score,
        pendingGarbage: this.playerEngine.pendingGarbage
      });
    }
  }

  private sendGarbageToOpponent(lines: number) {
    if (this.mode === 'ai') {
      this.opponentEngine.addIncomingGarbage(lines);
    } else if (this.mode === 'online' && this.peer?.isConnected) {
      this.peer.sendMessage({
        type: 'GARBAGE_ATTACK',
        lines
      });
    }
  }

  private handleGameOver(playerWon: boolean) {
    this.isRunning = false;
    this.inputController.setEnabled(false);

    if (this.mode === 'online' && this.peer?.isConnected) {
      this.peer.sendMessage({
        type: 'GAME_OVER',
        didWin: !playerWon
      });
    }

    if (playerWon) {
      sounds.playWin();
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 }
      });
    } else {
      sounds.playGameOver();
    }

    this.showGameOverModal(playerWon);
  }

  // -------------------------------------------------------------
  // RENDER VIEWS
  // -------------------------------------------------------------

  private renderLobby() {
    this.mode = 'menu';
    this.isRunning = false;
    this.inputController.setEnabled(false);
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);

    const initialJoinCode = this.roomCode || '';

    this.appContainer.innerHTML = `
      <header class="w-full max-w-5xl flex items-center justify-between py-4 border-b border-gray-800">
        <div class="flex items-center space-x-3">
          <div class="w-9 h-9 rounded-lg bg-gradient-to-tr from-cyan-500 to-fuchsia-500 flex items-center justify-center font-display font-black text-xl text-black shadow-lg shadow-cyan-500/20">
            T
          </div>
          <div>
            <h1 class="font-display font-bold text-xl sm:text-2xl tracking-wider text-white">
              TETRIS <span class="neon-text-cyan">1V1 BATTLE</span>
            </h1>
            <p class="text-xs text-gray-400">Cloudflare Free Tier • P2P Real-Time Multiplayer & AI</p>
          </div>
        </div>
        <button id="btn-sound-toggle" class="px-3 py-1.5 rounded-lg bg-[#141725] border border-gray-700 hover:border-cyan-400 text-xs font-mono transition-colors flex items-center space-x-2">
          <span>${this.isMuted ? '🔇 MUTED' : '🔊 SOUND ON'}</span>
        </button>
      </header>

      <main class="w-full max-w-4xl flex-1 flex flex-col items-center justify-center my-8">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
          
          <!-- Mode 1: Single Player vs AI -->
          <div class="cyber-panel rounded-2xl p-6 flex flex-col justify-between border border-cyan-500/30 hover:border-cyan-400 transition-all hover:shadow-lg hover:shadow-cyan-500/10">
            <div>
              <div class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 mb-4">
                SOLO DUEL
              </div>
              <h2 class="font-display text-2xl font-bold text-white mb-2">VS AI BOT</h2>
              <p class="text-sm text-gray-400 mb-6">
                Battle intelligent Dellacherie AI with dynamic garbage countering and simulated human pacing.
              </p>

              <label class="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">Select Difficulty</label>
              <div class="grid grid-cols-2 gap-2 mb-6">
                <button class="ai-diff-btn px-3 py-2 rounded-lg text-xs font-bold border ${this.aiDifficulty === 'easy' ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' : 'bg-black/30 border-gray-700 text-gray-400'}" data-diff="easy">
                  EASY
                </button>
                <button class="ai-diff-btn px-3 py-2 rounded-lg text-xs font-bold border ${this.aiDifficulty === 'medium' ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' : 'bg-black/30 border-gray-700 text-gray-400'}" data-diff="medium">
                  MEDIUM
                </button>
                <button class="ai-diff-btn px-3 py-2 rounded-lg text-xs font-bold border ${this.aiDifficulty === 'hard' ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' : 'bg-black/30 border-gray-700 text-gray-400'}" data-diff="hard">
                  HARD
                </button>
                <button class="ai-diff-btn px-3 py-2 rounded-lg text-xs font-bold border ${this.aiDifficulty === 'extreme' ? 'bg-pink-500/20 border-pink-500 text-pink-300' : 'bg-black/30 border-gray-700 text-gray-400'}" data-diff="extreme">
                  EXTREME 🔥
                </button>
              </div>
            </div>

            <button id="btn-start-ai" class="cyber-button w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-display font-extrabold tracking-wider text-sm uppercase shadow-lg shadow-cyan-500/20">
              Start AI Match
            </button>
          </div>

          <!-- Mode 2: 1v1 Online Multiplayer -->
          <div class="cyber-panel rounded-2xl p-6 flex flex-col justify-between border border-fuchsia-500/30 hover:border-fuchsia-400 transition-all hover:shadow-lg hover:shadow-fuchsia-500/10">
            <div>
              <div class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-fuchsia-500/10 text-fuchsia-400 mb-4">
                P2P MULTIPLAYER
              </div>
              <h2 class="font-display text-2xl font-bold text-white mb-2">1v1 ONLINE</h2>
              <p class="text-sm text-gray-400 mb-6">
                Zero-latency WebRTC peer-to-peer match. Share a 6-character room code or join an existing game.
              </p>

              <!-- Host or Join options -->
              <div class="space-y-4 mb-6">
                <div>
                  <button id="btn-host-match" class="cyber-button w-full py-3 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 text-white font-display font-extrabold tracking-wider text-sm uppercase shadow-lg shadow-fuchsia-500/20">
                    Host New Match
                  </button>
                </div>

                <div class="relative flex py-1 items-center">
                  <div class="flex-grow border-t border-gray-700"></div>
                  <span class="flex-shrink mx-3 text-xs uppercase tracking-widest text-gray-500">OR JOIN</span>
                  <div class="flex-grow border-t border-gray-700"></div>
                </div>

                <div class="flex space-x-2">
                  <input id="input-room-code" type="text" maxlength="6" placeholder="ROOM CODE" value="${initialJoinCode}" class="w-full uppercase font-mono tracking-widest text-center px-4 py-3 bg-black/40 border border-gray-700 focus:border-fuchsia-400 rounded-xl outline-none text-white text-sm placeholder-gray-600" />
                  <button id="btn-join-match" class="px-5 py-3 rounded-xl bg-[#1d1f30] hover:bg-fuchsia-600/30 border border-gray-700 hover:border-fuchsia-400 text-xs font-bold uppercase tracking-wider text-white transition-all">
                    Join
                  </button>
                </div>
              </div>
            </div>

            <div class="text-xs text-gray-500 text-center font-mono">
              Direct browser-to-browser WebRTC connection
            </div>
          </div>

        </div>

        <!-- Controls Reference -->
        <div class="mt-8 w-full max-w-2xl cyber-panel rounded-xl p-4 border border-gray-800 text-xs text-gray-400">
          <div class="font-bold text-gray-300 uppercase tracking-wider mb-2 text-center">Controls Guide</div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono">
            <div><span class="text-cyan-400 font-bold">← → / A D</span>: Move</div>
            <div><span class="text-cyan-400 font-bold">↑ / X</span>: Rotate CW</div>
            <div><span class="text-cyan-400 font-bold">Z / Ctrl</span>: Rotate CCW</div>
            <div><span class="text-cyan-400 font-bold">SPACE</span>: Hard Drop</div>
            <div><span class="text-cyan-400 font-bold">↓ / S</span>: Soft Drop</div>
            <div><span class="text-cyan-400 font-bold">C / Shift</span>: Hold</div>
            <div class="col-span-2 text-fuchsia-400">Mobile touch controls on small screens</div>
          </div>
        </div>
      </main>

      <footer class="w-full max-w-5xl py-3 border-t border-gray-800 text-center text-xs text-gray-500 font-mono">
        1v1 Battle Tetris • Super Rotation System • 7-Bag Randomizer • Serverless Cloudflare
      </footer>
    `;

    this.attachLobbyListeners();
  }

  private attachLobbyListeners() {
    // Sound toggle
    document.getElementById('btn-sound-toggle')?.addEventListener('click', () => {
      this.isMuted = !sounds.toggleMute();
      this.renderLobby();
    });

    // AI difficulty buttons
    document.querySelectorAll('.ai-diff-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const diff = (e.currentTarget as HTMLElement).dataset.diff as AIDifficulty;
        if (diff) {
          this.aiDifficulty = diff;
          document.querySelectorAll('.ai-diff-btn').forEach(b => {
            const isSelected = (b as HTMLElement).dataset.diff === diff;
            b.className = `ai-diff-btn px-3 py-2 rounded-lg text-xs font-bold border ${isSelected ? (diff === 'extreme' ? 'bg-pink-500/20 border-pink-500 text-pink-300' : 'bg-cyan-500/20 border-cyan-400 text-cyan-300') : 'bg-black/30 border-gray-700 text-gray-400'}`;
          });
        }
      });
    });

    // Start AI
    document.getElementById('btn-start-ai')?.addEventListener('click', () => {
      this.startAIMatch(this.aiDifficulty);
    });

    // Host Online Match
    document.getElementById('btn-host-match')?.addEventListener('click', () => {
      this.hostOnlineMatch();
    });

    // Join Online Match
    document.getElementById('btn-join-match')?.addEventListener('click', () => {
      const input = document.getElementById('input-room-code') as HTMLInputElement;
      const code = input?.value.trim();
      if (code) {
        this.joinOnlineMatch(code);
      } else {
        alert('Please enter a 6-character room code');
      }
    });
  }

  // -------------------------------------------------------------
  // GAME START HANDLERS
  // -------------------------------------------------------------

  private startAIMatch(diff: AIDifficulty) {
    this.mode = 'ai';
    this.aiDifficulty = diff;
    this.opponentName = `AI BOT (${diff.toUpperCase()})`;
    this.ai = new TetrisAI(diff);

    this.playerEngine.reset();
    this.opponentEngine.reset();
    this.renderArena();
    this.startGameLoop();
  }

  private async hostOnlineMatch() {
    this.mode = 'online';
    this.opponentName = 'Opponent';
    this.renderWaitingRoom('host');

    this.peer = new WebRTCPeer({
      onStatusChange: (status, message) => {
        this.updateNetworkStatusUI(status, message);
        if (status === 'connected') {
          this.startOnlineMatch();
        }
      },
      onRoomCreated: (code) => {
        this.roomCode = code;
        this.updateRoomCodeDisplay(code);
      },
      onMessage: (msg) => this.handleNetworkMessage(msg)
    });

    try {
      await this.peer.hostRoom();
    } catch (e: any) {
      alert(`Failed to host room: ${e.message}`);
      this.renderLobby();
    }
  }

  private async joinOnlineMatch(code: string) {
    this.mode = 'online';
    this.roomCode = code.toUpperCase();
    this.opponentName = 'Host Opponent';
    this.renderWaitingRoom('guest');

    this.peer = new WebRTCPeer({
      onStatusChange: (status, message) => {
        this.updateNetworkStatusUI(status, message);
        if (status === 'connected') {
          this.startOnlineMatch();
        }
      },
      onMessage: (msg) => this.handleNetworkMessage(msg)
    });

    try {
      await this.peer.joinRoom(this.roomCode);
    } catch (e: any) {
      alert(`Failed to join room: ${e.message}`);
      this.renderLobby();
    }
  }

  private renderWaitingRoom(role: 'host' | 'guest') {
    const isHost = role === 'host';
    this.appContainer.innerHTML = `
      <div class="min-h-screen flex flex-col items-center justify-center p-4 w-full max-w-md">
        <div class="cyber-panel w-full rounded-2xl p-6 border border-cyan-500/40 text-center shadow-xl shadow-cyan-500/10">
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-cyan-500/10 text-cyan-400 mb-4 animate-pulse">
            <svg class="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>

          <h2 class="font-display text-2xl font-bold text-white mb-2">
            ${isHost ? 'HOSTING MATCH' : 'JOINING MATCH'}
          </h2>
          <p id="net-status-text" class="text-sm text-gray-400 mb-6 font-mono">
            ${isHost ? 'Generating room code...' : `Connecting to room ${this.roomCode}...`}
          </p>

          ${isHost ? `
            <div class="bg-black/50 border border-gray-700 rounded-xl p-4 mb-4">
              <div class="text-xs text-gray-400 uppercase tracking-wider mb-1">Room Code</div>
              <div id="display-room-code" class="font-mono text-3xl font-black text-cyan-400 tracking-widest select-all">
                ------
              </div>
            </div>

            <button id="btn-copy-link" class="cyber-button w-full py-2.5 rounded-lg bg-[#1a1d2e] border border-gray-700 hover:border-cyan-400 text-xs font-mono font-bold text-gray-200 mb-4 flex items-center justify-center space-x-2">
              <span>📋 COPY SHAREABLE LINK</span>
            </button>
          ` : ''}

          <button id="btn-cancel-room" class="w-full py-2 rounded-lg text-xs font-mono text-gray-500 hover:text-gray-300">
            Cancel & Return to Lobby
          </button>
        </div>
      </div>
    `;

    document.getElementById('btn-cancel-room')?.addEventListener('click', () => {
      this.peer?.cleanup();
      this.renderLobby();
    });

    document.getElementById('btn-copy-link')?.addEventListener('click', () => {
      if (this.roomCode) {
        const url = `${window.location.origin}${window.location.pathname}?room=${this.roomCode}`;
        navigator.clipboard.writeText(url).then(() => {
          const btn = document.getElementById('btn-copy-link');
          if (btn) btn.innerHTML = '<span>✅ LINK COPIED!</span>';
          setTimeout(() => {
            if (btn) btn.innerHTML = '<span>📋 COPY SHAREABLE LINK</span>';
          }, 2000);
        });
      }
    });
  }

  private updateRoomCodeDisplay(code: string) {
    const el = document.getElementById('display-room-code');
    if (el) el.textContent = code;
  }

  private updateNetworkStatusUI(_status: string, message?: string) {
    const el = document.getElementById('net-status-text');
    if (el && message) {
      el.textContent = message;
    }
  }

  private startOnlineMatch() {
    this.playerEngine.reset();
    this.opponentEngine.reset();
    this.renderArena();
    this.startGameLoop();
  }

  private handleNetworkMessage(msg: NetworkMessage) {
    switch (msg.type) {
      case 'SYNC_BOARD':
        // Update opponent's visible board
        for (let r = 0; r < 20; r++) {
          for (let c = 0; c < 10; c++) {
            this.opponentEngine.grid[r + 4][c] = msg.grid[r][c];
          }
        }
        this.opponentScore = msg.score;
        this.opponentEngine.pendingGarbage = msg.pendingGarbage;
        this.updateStatsUI();
        break;

      case 'GARBAGE_ATTACK':
        this.playerEngine.addIncomingGarbage(msg.lines);
        sounds.playGarbageAlert();
        this.playerRenderer.triggerShake(4);
        break;

      case 'GAME_OVER':
        if (msg.didWin) {
          // Opponent claims victory, so player lost
          this.handleGameOver(false);
        } else {
          // Opponent lost, so player won!
          this.handleGameOver(true);
        }
        break;

      case 'REMATCH_REQUEST':
        this.showRematchOffer();
        break;

      case 'REMATCH_ACCEPT':
        this.hideGameOverModal();
        this.playerEngine.reset();
        this.opponentEngine.reset();
        this.startGameLoop();
        break;
    }
  }

  // -------------------------------------------------------------
  // ARENA LAYOUT
  // -------------------------------------------------------------

  private renderArena() {
    this.appContainer.innerHTML = `
      <!-- Top Arena Bar -->
      <div class="w-full max-w-5xl flex items-center justify-between py-2 border-b border-gray-800 text-xs font-mono">
        <div class="flex items-center space-x-3">
          <button id="btn-leave-match" class="px-2.5 py-1 rounded bg-[#161826] border border-gray-700 hover:border-red-500 text-gray-300 hover:text-red-400 transition-colors">
            ← LEAVE
          </button>
          <span class="font-bold text-cyan-400">
            ${this.mode === 'ai' ? `VS AI [${this.aiDifficulty.toUpperCase()}]` : `ROOM: #${this.roomCode || 'LOCAL'}`}
          </span>
        </div>

        <div class="flex items-center space-x-3">
          <button id="btn-arena-sound" class="text-gray-400 hover:text-white">
            ${this.isMuted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>

      <!-- Main Battle Canvas Container -->
      <div class="w-full max-w-5xl flex-1 flex flex-col md:flex-row items-center justify-center gap-4 sm:gap-8 my-2">
        
        <!-- Player Side -->
        <div class="flex items-center space-x-2 sm:space-x-4">
          <!-- Hold Box & Stats -->
          <div class="flex flex-col items-center justify-between h-[420px] sm:h-[560px] py-1">
            <!-- Hold Box -->
            <div class="cyber-panel rounded-xl p-2 border border-cyan-500/30 text-center w-20 sm:w-24">
              <div class="text-[10px] sm:text-xs font-display font-bold text-gray-400 uppercase mb-1">HOLD</div>
              <canvas id="canvas-hold" width="70" height="70" class="mx-auto"></canvas>
            </div>

            <!-- Player Stats -->
            <div class="cyber-panel rounded-xl p-2.5 border border-gray-800 text-center w-20 sm:w-24 space-y-2">
              <div>
                <div class="text-[9px] text-gray-500 uppercase font-mono">SCORE</div>
                <div id="stat-player-score" class="font-mono font-bold text-xs sm:text-sm text-white">0</div>
              </div>
              <div>
                <div class="text-[9px] text-gray-500 uppercase font-mono">LINES</div>
                <div id="stat-player-lines" class="font-mono font-bold text-xs sm:text-sm text-cyan-400">0</div>
              </div>
              <div>
                <div class="text-[9px] text-gray-500 uppercase font-mono">GARBAGE</div>
                <div id="stat-player-garbage" class="font-mono font-bold text-xs sm:text-sm text-yellow-400">0</div>
              </div>
            </div>

            <div class="text-[10px] font-display font-black text-cyan-400 tracking-wider">YOU</div>
          </div>

          <!-- Main Player Canvas -->
          <div class="relative cyber-panel rounded-xl p-1.5 border-2 border-cyan-400/50 shadow-lg shadow-cyan-500/10">
            <canvas id="canvas-player" class="rounded bg-[#0a0b12]"></canvas>
          </div>

          <!-- Next Queue -->
          <div class="flex flex-col items-center justify-start h-[420px] sm:h-[560px] py-1">
            <div class="cyber-panel rounded-xl p-2 border border-cyan-500/30 text-center w-20 sm:w-24 space-y-2">
              <div class="text-[10px] sm:text-xs font-display font-bold text-gray-400 uppercase">NEXT</div>
              <canvas id="canvas-next-0" width="70" height="55" class="mx-auto"></canvas>
              <canvas id="canvas-next-1" width="60" height="45" class="mx-auto opacity-75"></canvas>
              <canvas id="canvas-next-2" width="60" height="45" class="mx-auto opacity-60"></canvas>
              <canvas id="canvas-next-3" width="60" height="45" class="mx-auto opacity-40"></canvas>
            </div>
          </div>
        </div>

        <!-- VS Divider Badge -->
        <div class="hidden md:flex flex-col items-center justify-center space-y-2">
          <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-500 to-pink-500 flex items-center justify-center font-display font-black text-xs text-black shadow-lg shadow-pink-500/20">
            VS
          </div>
          <div class="h-24 w-0.5 bg-gradient-to-b from-cyan-500/50 via-pink-500/50 to-transparent"></div>
        </div>

        <!-- Opponent Side -->
        <div class="flex items-center space-x-2 sm:space-x-4">
          <!-- Main Opponent Canvas -->
          <div class="relative cyber-panel rounded-xl p-1.5 border-2 border-pink-500/40 shadow-lg shadow-pink-500/10">
            <canvas id="canvas-opponent" class="rounded bg-[#08090e]"></canvas>
          </div>

          <!-- Opponent Stats -->
          <div class="flex flex-col items-center justify-between h-[420px] sm:h-[560px] py-1">
            <div class="cyber-panel rounded-xl p-2.5 border border-gray-800 text-center w-20 sm:w-24 space-y-2">
              <div>
                <div class="text-[9px] text-gray-500 uppercase font-mono">SCORE</div>
                <div id="stat-opponent-score" class="font-mono font-bold text-xs sm:text-sm text-white">0</div>
              </div>
              <div>
                <div class="text-[9px] text-gray-500 uppercase font-mono">GARBAGE</div>
                <div id="stat-opponent-garbage" class="font-mono font-bold text-xs sm:text-sm text-pink-400">0</div>
              </div>
            </div>

            <div id="display-opponent-name" class="text-[10px] font-display font-black text-pink-400 tracking-wider text-center max-w-[80px] truncate">
              ${this.opponentName}
            </div>
          </div>
        </div>

      </div>

      <!-- Mobile On-Screen Virtual Controls -->
      <div class="w-full max-w-md grid grid-cols-5 gap-1.5 sm:hidden py-2 px-1">
        <button id="touch-left" class="touch-btn py-3.5 rounded-lg bg-gray-800/80 active:bg-cyan-500 font-bold text-lg">←</button>
        <button id="touch-right" class="touch-btn py-3.5 rounded-lg bg-gray-800/80 active:bg-cyan-500 font-bold text-lg">→</button>
        <button id="touch-down" class="touch-btn py-3.5 rounded-lg bg-gray-800/80 active:bg-cyan-500 font-bold text-lg">↓</button>
        <button id="touch-cw" class="touch-btn py-3.5 rounded-lg bg-cyan-600/70 active:bg-cyan-400 font-bold text-sm">ROT</button>
        <button id="touch-drop" class="touch-btn py-3.5 rounded-lg bg-pink-600/70 active:bg-pink-400 font-bold text-sm">DROP</button>
        <button id="touch-hold" class="touch-btn col-span-5 py-2 rounded-lg bg-gray-800/60 active:bg-gray-600 font-bold text-xs uppercase">HOLD PIECE (C)</button>
      </div>

      <!-- Game Over Modal (Hidden by default) -->
      <div id="modal-gameover" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="cyber-panel rounded-2xl p-6 max-w-sm w-full border border-cyan-400/50 text-center shadow-2xl">
          <div id="gameover-title" class="font-display text-4xl font-black mb-2 text-white">
            VICTORY!
          </div>
          <p id="gameover-subtitle" class="text-sm text-gray-400 mb-6 font-mono">
            You defeated your opponent!
          </p>

          <div class="space-y-3">
            <button id="btn-rematch" class="cyber-button w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 text-black font-display font-extrabold text-sm uppercase">
              Play Again
            </button>
            <button id="btn-modal-lobby" class="w-full py-2 text-xs font-mono text-gray-400 hover:text-white">
              Back to Main Menu
            </button>
          </div>
        </div>
      </div>
    `;

    this.attachArenaListeners();
    this.initCanvases();
  }

  private initCanvases() {
    const isMobile = window.innerWidth < 640;
    const playerBlockSize = isMobile ? 18 : 26;
    const opponentBlockSize = isMobile ? 14 : 22;

    const playerCanvas = document.getElementById('canvas-player') as HTMLCanvasElement;
    const opponentCanvas = document.getElementById('canvas-opponent') as HTMLCanvasElement;

    this.playerRenderer = new BoardRenderer(playerCanvas, playerBlockSize);
    this.opponentRenderer = new BoardRenderer(opponentCanvas, opponentBlockSize);
  }

  private attachArenaListeners() {
    document.getElementById('btn-leave-match')?.addEventListener('click', () => {
      this.peer?.cleanup();
      this.renderLobby();
    });

    document.getElementById('btn-arena-sound')?.addEventListener('click', (e) => {
      this.isMuted = !sounds.toggleMute();
      (e.currentTarget as HTMLElement).textContent = this.isMuted ? '🔇' : '🔊';
    });

    // Rematch button
    document.getElementById('btn-rematch')?.addEventListener('click', () => {
      if (this.mode === 'ai') {
        this.hideGameOverModal();
        this.playerEngine.reset();
        this.opponentEngine.reset();
        this.startGameLoop();
      } else if (this.mode === 'online' && this.peer?.isConnected) {
        this.peer.sendMessage({ type: 'REMATCH_REQUEST' });
        const btn = document.getElementById('btn-rematch');
        if (btn) {
          btn.textContent = 'Waiting for Opponent...';
          (btn as HTMLButtonElement).disabled = true;
        }
      }
    });

    document.getElementById('btn-modal-lobby')?.addEventListener('click', () => {
      this.hideGameOverModal();
      this.peer?.cleanup();
      this.renderLobby();
    });

    // Touch controls for mobile
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

  private startGameLoop() {
    this.isRunning = true;
    this.inputController.setEnabled(true);

    const loop = (currentTime: number) => {
      if (!this.isRunning) return;

      // Update Player Engine
      this.playerEngine.update(currentTime);

      // Update Opponent Engine (if AI)
      if (this.mode === 'ai' && this.ai) {
        this.opponentEngine.update(currentTime);
        this.ai.update(this.opponentEngine, currentTime);
      }

      // Render Canvases
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
    if (oScore) oScore.textContent = (this.mode === 'ai' ? this.opponentEngine.score : this.opponentScore).toString();
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
        title.className = 'font-display text-4xl font-black mb-2 neon-text-cyan';
        subtitle.textContent = `You knocked out ${this.opponentName}!`;
      } else {
        title.textContent = 'DEFEAT';
        title.className = 'font-display text-4xl font-black mb-2 neon-text-pink';
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
    if (subtitle) {
      subtitle.textContent = 'Opponent requested a rematch!';
    }
    const btn = document.getElementById('btn-rematch');
    if (btn) {
      btn.textContent = 'Accept Rematch';
      (btn as HTMLButtonElement).disabled = false;
      btn.onclick = () => {
        this.peer?.sendMessage({ type: 'REMATCH_ACCEPT' });
        this.hideGameOverModal();
        this.playerEngine.reset();
        this.opponentEngine.reset();
        this.startGameLoop();
      };
    }
  }
}

// Initialize game on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  new TetrisApp();
});
