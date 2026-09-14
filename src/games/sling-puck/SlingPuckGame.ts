import confetti from 'canvas-confetti';
import { GameInstance, GameSession, AppTheme } from '../types';
import { SlingEngine } from './sling-engine';
import { SlingRenderer } from './renderers/SlingRenderer';
import { SlingAI } from './sling-ai';
import { Puck, PlayerSide } from './sling-types';
import { SlingPhysics } from './sling-physics';
import { sounds } from '../../engine/sound';
import { NetworkMessage } from '../../network/webrtc-peer';
import {
  TABLE_WIDTH,
  TABLE_HEIGHT,
  CENTER_Y,
  PLAYER_BAND_REST_Y,
  RAIL_LEFT,
  RAIL_RIGHT,
  RAIL_BOTTOM,
  FIXED_TIMESTEP
} from './sling-constants';

export class SlingPuckGame implements GameInstance {
  private container: HTMLElement;
  private session: GameSession;
  private currentTheme: AppTheme;

  private engine: SlingEngine;
  private renderer!: SlingRenderer;
  private ai?: SlingAI;
  private canvas!: HTMLCanvasElement;

  private isRunning: boolean = true;
  private animationFrameId: number | null = null;
  private draggedPuck: Puck | null = null;
  private activePointerId: number | null = null;

  private opponentName: string = 'Opponent';
  private rematchState: 'idle' | 'requested' | 'offer_received' = 'idle';
  private lastSyncBroadcastTime: number = 0;

  constructor(container: HTMLElement, session: GameSession) {
    this.container = container;
    this.session = session;
    this.currentTheme = session.theme;

    if (session.mode === 'ai') {
      const diffLabel = (session.aiDifficulty || 'medium').toUpperCase();
      this.opponentName = `AI (${diffLabel})`;
      this.ai = new SlingAI(session.aiDifficulty || 'medium');
    } else {
      this.opponentName = session.peer?.role === 'host' ? 'Guest' : 'Host';
    }

    this.engine = new SlingEngine();
    this.render();
    this.setupEngineHooks();
    this.setupNetwork();
    this.startGameLoop();

    // If host in online PvP, broadcast match start seed
    if (this.session.mode === 'online' && this.session.peer?.role === 'host') {
      this.session.peer.sendMessage({
        type: 'SLING_START',
        seed: Date.now()
      });
    }
  }

  public destroy() {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.container.innerHTML = '';
  }

  public setTheme(theme: AppTheme) {
    this.currentTheme = theme;
    const wrapper = document.getElementById('sling-outer-wrapper');
    if (wrapper) {
      if (theme === 'dark') {
        wrapper.classList.remove('bg-amber-50', 'text-gray-900');
        wrapper.classList.add('bg-stone-950', 'text-white');
      } else {
        wrapper.classList.remove('bg-stone-950', 'text-white');
        wrapper.classList.add('bg-amber-50', 'text-gray-900');
      }
    }
    this.updateHUD();
  }

  // -------------------------------------------------------------
  // ENGINE HOOKS (Both AI and PvP)
  // -------------------------------------------------------------
  private setupEngineHooks() {
    // Hook engine gate crossing: when a puck crosses into opponent's territory, notify peer!
    this.engine.onPuckCrossedGate = (puck: Puck, toSide: PlayerSide) => {
      if (toSide === 'opponent') {
        // Player shot a puck through gate into opponent side!
        sounds.playGatePass();
        if (this.session.mode === 'online' && this.session.peer?.isConnected) {
          // Mirror Y and inverted VY for opponent's frame of reference
          this.session.peer.sendMessage({
            type: 'SLING_PUCK_CROSSED',
            id: puck.id,
            x: puck.x,
            y: TABLE_HEIGHT - puck.y,
            vx: puck.vx,
            vy: -puck.vy
          });
        }
      }
    };

    this.engine.onMatchOver = (winner: PlayerSide) => {
      const didIWin = winner === 'player';
      if (this.session.mode === 'online' && this.session.peer?.isConnected && didIWin) {
        this.session.peer.sendMessage({
          type: 'SLING_VICTORY',
          winner: 'opponent' // From opponent perspective, opponent lost
        });
      }
      this.showGameOverModal(didIWin, didIWin ? 'You cleared all pucks from your side!' : `${this.opponentName} cleared all pucks first!`);
    };
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
        onStatusChange: (status: string, message?: string) => {
          origOnStatusChange?.(status as any, message);
          if (status === 'disconnected') {
            this.showGameOverModal(true, 'Opponent disconnected. You win by forfeit!');
          }
        }
      }
    });

    this.session.peer.flushEarlyMessages();
  }

  private handleNetworkMessage(msg: any) {
    switch (msg.type) {
      case 'PLAYER_LEAVE':
        this.showGameOverModal(true, 'Opponent forfeited the match.');
        break;
      case 'SLING_START':
        this.engine.setupRound(msg.seed);
        this.updateHUD();
        break;
      case 'SLING_PUCK_CROSSED':
        // Opponent shot a puck through the gate onto our side!
        sounds.playGatePass();
        let targetPuck = this.engine.pucks.find(p => p.id === msg.id);
        if (!targetPuck) {
          targetPuck = {
            id: msg.id,
            x: msg.x,
            y: msg.y,
            prevX: msg.x,
            prevY: msg.y,
            vx: msg.vx,
            vy: msg.vy,
            radius: 17,
            owner: 'player'
          };
          this.engine.pucks.push(targetPuck);
        } else {
          targetPuck.x = msg.x;
          targetPuck.y = msg.y;
          targetPuck.vx = msg.vx;
          targetPuck.vy = msg.vy;
          targetPuck.owner = 'player';
        }
        this.updateHUD();
        break;
      case 'SLING_SYNC_PUCKS':
        // Lightweight sync validation
        this.updateHUD();
        break;
      case 'SLING_VICTORY':
        this.showGameOverModal(false, `${this.opponentName} cleared all pucks!`);
        break;
      case 'REMATCH_REQUEST':
        this.showRematchOffer();
        break;
      case 'REMATCH_ACCEPT':
        this.startNewMatch(msg.seed);
        break;
    }
  }

  // -------------------------------------------------------------
  // DOM RENDERING & LAYOUT
  // -------------------------------------------------------------
  private render() {
    const isDark = this.currentTheme === 'dark';

    this.container.innerHTML = `
      <div id="sling-outer-wrapper" class="w-full h-full min-h-[100dvh] max-h-[100dvh] overflow-hidden flex flex-col items-center justify-between p-1.5 sm:p-2.5 lg:p-3 select-none ${isDark ? 'bg-stone-950 text-white' : 'bg-amber-50 text-gray-900'}">
        
        <!-- Top HUD Header -->
        <div class="w-full max-w-lg flex flex-col shrink-0 border-b ${isDark ? 'border-stone-800' : 'border-amber-200'} pb-1.5 gap-1">
          <!-- Row 1: Exit, Title, Mode -->
          <div class="w-full flex items-center justify-between px-1 text-xs">
            <button id="btn-sling-exit" class="ps-btn-secondary px-3 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1 cursor-pointer active:scale-95" title="Exit to Arcade Hub">
              <span>← Exit</span>
            </button>
            <span class="text-[11px] font-bold text-amber-500 font-mono tracking-wider uppercase">SLING PUCK • 10 PUCKS</span>
            <span class="text-[10px] font-mono text-gray-400">${this.session.mode === 'ai' ? 'VS AI' : '1V1 ONLINE'}</span>
          </div>

          <!-- Row 2: Live Puck Score Banner -->
          <div class="w-full flex items-center justify-between px-1 text-xs gap-2">
            <!-- Player Count -->
            <div class="flex items-center space-x-1.5 min-w-[90px]">
              <div class="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center font-black text-blue-400 text-xs">P</div>
              <div class="flex flex-col">
                <span class="text-[10px] font-bold text-blue-400 leading-tight">YOU</span>
                <span id="badge-player-pucks" class="px-1.5 py-0.2 rounded bg-blue-600/20 text-blue-300 font-mono text-xs font-black">5 PUCKS</span>
              </div>
            </div>

            <!-- Match Status / Rounds Center -->
            <div id="sling-status-banner" class="flex-1 max-w-[170px] sm:max-w-[220px] flex flex-col items-center px-2 py-0.5 rounded-xl bg-amber-600/15 border border-amber-500/30 text-center mx-auto">
              <span id="sling-status-text" class="text-[11px] sm:text-xs font-black tracking-wide text-amber-500 uppercase truncate">RACE TO CLEAR!</span>
              <span id="sling-hint-text" class="text-[9px] font-medium text-gray-400 truncate">Sling all pucks through gate</span>
            </div>

            <!-- Opponent Count -->
            <div class="flex items-center justify-end space-x-1.5 min-w-[90px] text-right">
              <div class="flex flex-col items-end">
                <span class="text-[10px] font-bold text-rose-400 leading-tight truncate max-w-[85px]">${this.opponentName}</span>
                <span id="badge-opp-pucks" class="px-1.5 py-0.2 rounded bg-rose-600/20 text-rose-300 font-mono text-xs font-black">5 PUCKS</span>
              </div>
              <div class="w-6 h-6 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center font-black text-rose-400 text-xs">O</div>
            </div>
          </div>
        </div>

        <!-- Main Playing Area: Scaled Board Viewport -->
        <div id="sling-board-viewport" class="relative flex-1 w-full min-h-0 flex items-center justify-center overflow-hidden my-auto p-0.5" style="touch-action: none;">
          <div id="sling-canvas-wrapper" class="relative rounded-2xl shadow-2xl overflow-hidden border-4 ${isDark ? 'border-stone-800 bg-[#1c1510]' : 'border-amber-900/60 bg-[#faebd7]'}" style="touch-action: none; width: ${TABLE_WIDTH}px; height: ${TABLE_HEIGHT}px;">
            <canvas id="canvas-sling" width="${TABLE_WIDTH}" height="${TABLE_HEIGHT}" class="block cursor-grab active:cursor-grabbing" style="width: ${TABLE_WIDTH}px; height: ${TABLE_HEIGHT}px; touch-action: none; display: block;"></canvas>
          </div>
        </div>

        <!-- Bottom Controls Bar / Tips -->
        <div class="w-full max-w-sm flex items-center justify-between px-3 py-1 shrink-0 text-center text-xs font-medium text-gray-500">
          <span class="text-[10px]">👉 Drag puck down against cord & release to sling!</span>
          <span id="sling-score-tracker" class="text-[11px] font-black font-mono text-amber-500">SCORE: 0 - 0</span>
        </div>

        <!-- Game Over Modal -->
        <div id="modal-sling-gameover" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div class="w-full max-w-sm rounded-3xl ps-card p-6 flex flex-col items-center text-center shadow-2xl border ${isDark ? 'border-stone-800 bg-stone-900 text-white' : 'border-amber-200 bg-white text-gray-900'} animate-in fade-in zoom-in-95 duration-200">
            <div id="sling-gameover-icon" class="text-4xl mb-2">🏆</div>
            <h3 id="sling-gameover-title" class="text-2xl font-black mb-1 text-amber-400 tracking-wide">VICTORY!</h3>
            <p id="sling-gameover-desc" class="text-xs sm:text-sm text-gray-400 mb-6">You cleared all pucks from your side!</p>

            <div class="w-full space-y-2.5">
              <button id="btn-sling-rematch" class="w-full py-3 px-6 rounded-xl font-black tracking-wider uppercase text-white bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-500 shadow-lg shadow-orange-500/30 active:scale-95 transition-all cursor-pointer">
                Play Again
              </button>
              <button id="btn-sling-back" class="w-full py-2.5 px-6 rounded-xl text-xs font-bold ps-btn-secondary cursor-pointer">
                Exit to Arcade Hub
              </button>
            </div>
          </div>
        </div>

      </div>
    `;

    this.canvas = document.getElementById('canvas-sling') as HTMLCanvasElement;
    this.renderer = new SlingRenderer(this.canvas);

    this.setupEventListeners();
    this.handleResize();
    window.addEventListener('resize', this.handleResize);
  }

  // Responsive Board Scaling (immune to squashing, perfectly centers on mobile and desktop)
  private handleResize = () => {
    const viewport = document.getElementById('sling-board-viewport');
    const wrapper = document.getElementById('sling-canvas-wrapper');
    if (!viewport || !wrapper) return;

    const availW = Math.max(10, viewport.clientWidth - 8);
    const availH = Math.max(10, viewport.clientHeight - 8);

    const scale = Math.min(availW / TABLE_WIDTH, availH / TABLE_HEIGHT);
    wrapper.style.transform = `scale(${scale})`;
    wrapper.style.transformOrigin = 'center center';
  };

  private getTableCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = TABLE_WIDTH / rect.width;
    const scaleY = TABLE_HEIGHT / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  // -------------------------------------------------------------
  // EVENT LISTENERS & TOUCH CONTROLS
  // -------------------------------------------------------------
  private setupEventListeners() {
    document.getElementById('btn-sling-exit')?.addEventListener('click', () => {
      this.session.onExit();
    });

    document.getElementById('btn-sling-back')?.addEventListener('click', () => {
      this.session.onExit();
    });

    document.getElementById('btn-sling-rematch')?.addEventListener('click', () => {
      this.handleRematchClick();
    });

    // Canvas Pointer Events
    this.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      if (this.engine.phase !== 'PLAYING') return;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {}

      const coords = this.getTableCoords(e.clientX, e.clientY);
      // Only allow grabbing pucks situated in player territory (y >= CENTER_Y)
      const candidatePucks = this.engine.pucks.filter(p => p.y >= CENTER_Y);

      // Find closest puck within touch reach
      let closestPuck: Puck | null = null;
      let minDist = 32; // Touch tolerance

      for (const p of candidatePucks) {
        const d = Math.hypot(coords.x - p.x, coords.y - p.y);
        if (d < minDist) {
          minDist = d;
          closestPuck = p;
        }
      }

      if (closestPuck) {
        this.draggedPuck = closestPuck;
        this.activePointerId = e.pointerId;
        this.draggedPuck.isDragged = true;
        this.draggedPuck.dragX = coords.x;
        this.draggedPuck.dragY = coords.y;
      }
    });

    this.canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.draggedPuck || e.pointerId !== this.activePointerId) return;

      const coords = this.getTableCoords(e.clientX, e.clientY);

      // Clamp puck coordinates inside player zone
      const clampedX = Math.max(RAIL_LEFT + this.draggedPuck.radius, Math.min(coords.x, RAIL_RIGHT - this.draggedPuck.radius));
      const clampedY = Math.max(CENTER_Y + 15, Math.min(coords.y, RAIL_BOTTOM - this.draggedPuck.radius));

      this.draggedPuck.dragX = clampedX;
      this.draggedPuck.dragY = clampedY;

      // If puck is pulled behind player's elastic band, stretch the band!
      if (clampedY > PLAYER_BAND_REST_Y) {
        this.engine.playerBand.isStretched = true;
        this.engine.playerBand.midX = clampedX;
        this.engine.playerBand.midY = clampedY;
      } else {
        this.engine.playerBand.isStretched = false;
        this.engine.playerBand.midY = PLAYER_BAND_REST_Y;
      }
    });

    const releaseDrag = (e: PointerEvent) => {
      if (!this.draggedPuck || e.pointerId !== this.activePointerId) return;

      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {}

      if (this.engine.playerBand.isStretched) {
        // Launch puck using elastic band physics!
        SlingPhysics.launchFromBand(this.draggedPuck, this.engine.playerBand, power => {
          sounds.playSlingSnap(power);
        });
      }

      this.draggedPuck.isDragged = false;
      this.draggedPuck = null;
      this.activePointerId = null;
      this.engine.playerBand.isStretched = false;
    };

    this.canvas.addEventListener('pointerup', releaseDrag);
    this.canvas.addEventListener('pointercancel', releaseDrag);
  }

  // -------------------------------------------------------------
  // GAME LOOP (60Hz PHYSICS & HIGH-REFRESH RENDERING)
  // -------------------------------------------------------------
  private startGameLoop() {
    let lastTime = performance.now();
    let accumulator = 0;

    const loop = (currentTime: number) => {
      if (!this.isRunning) return;

      const delta = Math.min(currentTime - lastTime, 50); // clamp delta
      lastTime = currentTime;
      accumulator += delta;

      // 60Hz Fixed-Timestep Physics Updates
      while (accumulator >= FIXED_TIMESTEP) {
        this.engine.update(
          FIXED_TIMESTEP / 1000,
          (_p1, _p2, speed) => sounds.playPuckClack(speed),
          (_puck, speed) => sounds.playPuckClack(speed * 0.7)
        );

        if (this.session.mode === 'ai' && this.ai) {
          this.ai.update(this.engine, currentTime, power => sounds.playSlingSnap(power));
        }

        accumulator -= FIXED_TIMESTEP;
      }

      // Sub-tick render interpolation factor (0.0 to 1.0)
      const alpha = Math.min(1.0, Math.max(0.0, accumulator / FIXED_TIMESTEP));
      this.renderer.render(this.engine, this.currentTheme, alpha, this.draggedPuck);

      this.updateHUD();

      // Broadcast periodic 2Hz sync heartbeat in online PvP
      if (this.session.mode === 'online' && this.session.peer?.isConnected) {
        if (currentTime - this.lastSyncBroadcastTime > 500) {
          this.lastSyncBroadcastTime = currentTime;
          this.session.peer.sendMessage({
            type: 'SLING_SYNC_PUCKS',
            myPuckCount: this.engine.getPlayerPuckCount(),
            oppPuckCount: this.engine.getOpponentPuckCount()
          });
        }
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  private updateHUD() {
    const badgePlayer = document.getElementById('badge-player-pucks');
    const badgeOpp = document.getElementById('badge-opp-pucks');
    const statusText = document.getElementById('sling-status-text');
    const hintText = document.getElementById('sling-hint-text');
    const scoreTracker = document.getElementById('sling-score-tracker');

    const pCount = this.engine.getPlayerPuckCount();
    const oCount = this.engine.getOpponentPuckCount();

    if (badgePlayer) badgePlayer.textContent = `${pCount} PUCK${pCount === 1 ? '' : 'S'}`;
    if (badgeOpp) badgeOpp.textContent = `${oCount} PUCK${oCount === 1 ? '' : 'S'}`;

    if (scoreTracker) {
      scoreTracker.textContent = `SCORE: ${this.engine.playerScore} - ${this.engine.opponentScore}`;
    }

    if (statusText && hintText) {
      if (this.engine.phase === 'COUNTDOWN') {
        statusText.textContent = 'GET READY!';
        hintText.textContent = `Match starts in ${this.engine.countdown}...`;
      } else if (this.engine.phase === 'PLAYING') {
        if (pCount < oCount) {
          statusText.textContent = 'YOU ARE LEADING!';
          hintText.textContent = `Only ${pCount} left to clear!`;
        } else if (pCount > oCount) {
          statusText.textContent = 'OPPONENT LEADING!';
          hintText.textContent = 'Shoot faster!';
        } else {
          statusText.textContent = 'TIED BATTLE!';
          hintText.textContent = 'Sling pucks through the gate!';
        }
      } else if (this.engine.phase === 'MATCH_OVER') {
        const didIWin = this.engine.matchWinner === 'player';
        statusText.textContent = didIWin ? 'VICTORY!' : 'DEFEAT!';
        hintText.textContent = didIWin ? 'You cleared all pucks!' : `${this.opponentName} cleared all pucks!`;
      }
    }
  }

  // -------------------------------------------------------------
  // GAME OVER & REMATCH HANDLING
  // -------------------------------------------------------------
  private showGameOverModal(didIWin: boolean, message: string) {
    const modal = document.getElementById('modal-sling-gameover');
    const title = document.getElementById('sling-gameover-title');
    const desc = document.getElementById('sling-gameover-desc');
    const icon = document.getElementById('sling-gameover-icon');

    if (title) title.textContent = didIWin ? 'VICTORY!' : 'DEFEAT!';
    if (desc) desc.textContent = message;
    if (icon) icon.textContent = didIWin ? '🏆' : '💀';

    if (didIWin) {
      sounds.playFanfare();
      confetti({ particleCount: 120, spread: 80 });
    } else {
      sounds.playGameOver();
    }

    modal?.classList.remove('hidden');
  }

  private handleRematchClick() {
    const btn = document.getElementById('btn-sling-rematch');
    if (!btn) return;

    if (this.session.mode === 'ai') {
      this.startNewMatch();
      return;
    }

    if (this.rematchState === 'offer_received') {
      this.session.peer?.sendMessage({ type: 'REMATCH_ACCEPT' });
      this.startNewMatch();
    } else if (this.rematchState === 'idle') {
      this.rematchState = 'requested';
      btn.textContent = 'Waiting for Opponent...';
      btn.classList.add('opacity-70', 'cursor-not-allowed');
      this.session.peer?.sendMessage({ type: 'REMATCH_REQUEST' });
    }
  }

  private showRematchOffer() {
    this.rematchState = 'offer_received';
    const btn = document.getElementById('btn-sling-rematch');
    if (btn) {
      btn.textContent = 'Accept Rematch!';
      btn.classList.remove('opacity-70', 'cursor-not-allowed');
      btn.className = 'w-full py-3 px-6 rounded-xl font-black tracking-wider uppercase text-white bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 shadow-lg shadow-emerald-500/30 active:scale-95 transition-all cursor-pointer animate-pulse';
    }
  }

  private startNewMatch(seed?: number) {
    this.rematchState = 'idle';
    const modal = document.getElementById('modal-sling-gameover');
    modal?.classList.add('hidden');

    const btn = document.getElementById('btn-sling-rematch');
    if (btn) {
      btn.textContent = 'Play Again';
      btn.className = 'w-full py-3 px-6 rounded-xl font-black tracking-wider uppercase text-white bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-500 shadow-lg shadow-orange-500/30 active:scale-95 transition-all cursor-pointer';
    }

    this.engine.resetMatch();
    if (seed) this.engine.setupRound(seed);
    this.updateHUD();
  }
}
