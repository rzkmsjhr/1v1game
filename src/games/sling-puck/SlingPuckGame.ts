import confetti from 'canvas-confetti';
import { GameInstance, GameSession, AppTheme } from '../types';
import { SlingEngine } from './sling-engine';
import { SlingRenderer } from './renderers/SlingRenderer';
import { SlingAI } from './sling-ai';
import { Puck, PlayerSide } from './sling-types';
import { SlingPhysics } from './sling-physics';
import { sounds } from '../../engine/sound';
import { NetworkMessage, NetworkHealth } from '../../network/webrtc-peer';
import {
  TABLE_WIDTH,
  TABLE_HEIGHT,
  CENTER_Y,
  PLAYER_BAND_REST_Y,
  OPPONENT_BAND_REST_Y,
  BAND_LEFT_X,
  BAND_RIGHT_X,
  RAIL_LEFT,
  RAIL_RIGHT,
  RAIL_BOTTOM,
  PUCK_RADIUS,
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
  private dragOffsetX: number = 0;
  private dragOffsetY: number = 0;
  private wasBandStretched: boolean = false;
  private boundPointerMove?: (e: PointerEvent) => void;
  private boundPointerUp?: (e: PointerEvent) => void;

  private opponentName: string = 'Opponent';
  private rematchState: 'idle' | 'requested' | 'offer_received' = 'idle';
  private winnerLocked: boolean = false;
  private localVictoryTimestamp: number = 0;
  private lastSyncBroadcastTime: number = 0;
  private lastBandBroadcastTime: number = 0;
  private lastOpponentBandPullTime: number = 0;
  private remoteTargetBandX: number = (BAND_LEFT_X + BAND_RIGHT_X) * 0.5;
  private remoteTargetBandY: number = OPPONENT_BAND_REST_Y;
  private remoteTargetPuckId: number | null = null;
  private remoteTargetPuckX: number = 0;
  private remoteTargetPuckY: number = 0;
  private resizeObserver: ResizeObserver | null = null;

  // Cached DOM elements & values to eliminate layout thrashing
  private badgePlayerEl: HTMLElement | null = null;
  private badgeOppEl: HTMLElement | null = null;
  private statusTextEl: HTMLElement | null = null;
  private hintTextEl: HTMLElement | null = null;
  private scoreTrackerEl: HTMLElement | null = null;
  private cachedPlayerPuckCount: number = -1;
  private cachedOppPuckCount: number = -1;
  private cachedScoreText: string = '';
  private cachedStatusText: string = '';
  private cachedHintText: string = '';
  private lastHUDUpdateTime: number = 0;

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
    this.engine.setupRound(12345, this.session.peer?.role);
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
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.boundPointerMove) {
      window.removeEventListener('pointermove', this.boundPointerMove);
    }
    if (this.boundPointerUp) {
      window.removeEventListener('pointerup', this.boundPointerUp);
      window.removeEventListener('pointercancel', this.boundPointerUp);
    }
    window.removeEventListener('resize', this.handleResize);
    this.badgePlayerEl = null;
    this.badgeOppEl = null;
    this.statusTextEl = null;
    this.hintTextEl = null;
    this.scoreTrackerEl = null;
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
    const canvasWrapper = document.getElementById('sling-canvas-wrapper');
    if (canvasWrapper) {
      if (theme === 'dark') {
        canvasWrapper.className = 'rounded-3xl shadow-2xl overflow-hidden border-4 border-[#3b1c0b] shadow-[0_20px_50px_rgba(0,0,0,0.85)] bg-[#2b1408]';
      } else {
        canvasWrapper.className = 'rounded-3xl shadow-2xl overflow-hidden border-4 border-[#5c3016] shadow-2xl bg-[#5c3016]';
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
            vy: -puck.vy,
            color: puck.color
          });
        }
      }
    };

    this.engine.onMatchOver = (winner: PlayerSide) => {
      if (this.winnerLocked) return;
      this.winnerLocked = true;
      this.ai?.stop();
      this.engine.phase = 'MATCH_OVER';
      this.engine.matchWinner = winner;

      const didIWin = winner === 'player';
      if (didIWin) {
        this.localVictoryTimestamp = Date.now();
      }
      if (this.session.mode === 'online' && this.session.peer?.isConnected && didIWin) {
        this.session.peer.sendMessage({
          type: 'SLING_VICTORY',
          winner: 'opponent',
          timestamp: this.localVictoryTimestamp
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
    const origOnHealthChange = this.session.peer.events?.onHealthChange;

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
            if (this.winnerLocked || this.engine.phase === 'MATCH_OVER') return;
            this.showGameOverModal(true, 'Opponent disconnected. You win by forfeit!');
          }
        },
        onHealthChange: (health: NetworkHealth) => {
          origOnHealthChange?.(health);
          this.updateNetworkHealthHUD(health);
        }
      }
    });

    this.session.peer.flushEarlyMessages();
    if (this.session.peer.isConnected) {
      this.updateNetworkHealthHUD({
        rtt: this.session.peer.currentRtt,
        status: this.session.peer.networkQuality,
        isPeerVisible: this.session.peer.isPeerVisible
      });
    }
  }

  private updateNetworkHealthHUD(health: NetworkHealth) {
    const pingEl = document.getElementById('sling-net-ping');
    const dotEl = document.getElementById('sling-net-dot');
    const textEl = document.getElementById('sling-net-text');
    const awayBanner = document.getElementById('sling-peer-away-banner');

    if (pingEl && dotEl && textEl) {
      if (health.status === 'stalled') {
        dotEl.className = 'w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping';
        textEl.textContent = 'Lag ⚠️';
        pingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 rounded px-1.5 py-0.5';
      } else if (health.status === 'poor') {
        dotEl.className = 'w-1.5 h-1.5 rounded-full bg-rose-400';
        textEl.textContent = `${health.rtt}ms`;
        pingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 rounded px-1.5 py-0.5';
      } else if (health.status === 'moderate') {
        dotEl.className = 'w-1.5 h-1.5 rounded-full bg-amber-400';
        textEl.textContent = `${health.rtt}ms`;
        pingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 rounded px-1.5 py-0.5';
      } else {
        dotEl.className = 'w-1.5 h-1.5 rounded-full bg-emerald-400';
        textEl.textContent = `${health.rtt || 30}ms`;
        pingEl.className = 'inline-flex items-center space-x-1 text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 rounded px-1.5 py-0.5';
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
    switch (msg.type) {
      case 'PLAYER_LEAVE':
        if (this.winnerLocked || this.engine.phase === 'MATCH_OVER') break;
        this.showGameOverModal(true, 'Opponent forfeited the match.');
        break;
      case 'SLING_START':
        this.engine.setupRound(msg.seed, this.session.peer?.role);
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
            owner: 'player',
            color: msg.color || 'red'
          };
          this.engine.pucks.push(targetPuck);
        } else {
          targetPuck.x = msg.x;
          targetPuck.y = msg.y;
          targetPuck.prevX = msg.x;
          targetPuck.prevY = msg.y;
          targetPuck.dragX = msg.x;
          targetPuck.dragY = msg.y;
          targetPuck.isDragged = false;
          targetPuck.vx = msg.vx;
          targetPuck.vy = msg.vy;
          targetPuck.owner = 'player';
          if (msg.color) {
            targetPuck.color = msg.color;
          }
        }
        this.updateHUD();
        break;
      case 'SLING_BAND_PULL': {
        this.lastOpponentBandPullTime = performance.now();
        const isDragging = msg.isDragging ?? msg.isStretched;
        if (isDragging && msg.x !== undefined && msg.y !== undefined) {
          const oppY = TABLE_HEIGHT - msg.y;
          this.remoteTargetBandX = msg.x;
          this.remoteTargetBandY = msg.isStretched ? oppY : OPPONENT_BAND_REST_Y;
          this.engine.opponentBand.isStretched = !!msg.isStretched;
          this.remoteTargetPuckId = msg.puckId ?? null;
          this.remoteTargetPuckX = msg.x;
          this.remoteTargetPuckY = oppY;

          let targetPuck = this.engine.pucks.find(p => p.id === msg.puckId);
          if (targetPuck) {
            targetPuck.isDragged = true;
            // Snap immediately if starting fresh drag so there is no laggy slide across board
            if (this.engine.opponentBand.midY === OPPONENT_BAND_REST_Y || Math.hypot(targetPuck.x - msg.x, targetPuck.y - oppY) > 60) {
              if (msg.isStretched) {
                this.engine.opponentBand.midX = msg.x;
                this.engine.opponentBand.midY = oppY;
              }
              targetPuck.x = msg.x;
              targetPuck.y = oppY;
              targetPuck.dragX = msg.x;
              targetPuck.dragY = oppY;
              targetPuck.prevX = msg.x;
              targetPuck.prevY = oppY;
            }
          }
        } else {
          this.engine.opponentBand.isStretched = false;
          this.remoteTargetPuckId = null;
          this.engine.opponentBand.midX = (BAND_LEFT_X + BAND_RIGHT_X) * 0.5;
          this.engine.opponentBand.midY = OPPONENT_BAND_REST_Y;
          for (const p of this.engine.pucks) {
            if (p.y < CENTER_Y && p.isDragged) {
              p.isDragged = false;
              if (p.y - p.radius <= OPPONENT_BAND_REST_Y) {
                p.y = OPPONENT_BAND_REST_Y + p.radius + 1;
                p.prevY = p.y;
                p.dragY = p.y;
              }
            }
          }
        }
        break;
      }
      case 'SLING_PUCK_LAUNCH': {
        let targetPuck = this.engine.pucks.find(p => p.id === msg.puckId);
        if (targetPuck) {
          targetPuck.isDragged = false;
          targetPuck.x = msg.x;
          // Cleanly position in front of opponent band and apply launch velocity
          targetPuck.y = Math.max(msg.y, OPPONENT_BAND_REST_Y + targetPuck.radius + 2);
          targetPuck.prevX = targetPuck.x;
          targetPuck.prevY = targetPuck.y;
          targetPuck.dragX = targetPuck.x;
          targetPuck.dragY = targetPuck.y;
          targetPuck.vx = msg.vx;
          targetPuck.vy = msg.vy;
        }
        // Snap opponent rubber band with energetic vibration and sound
        this.engine.opponentBand.isStretched = false;
        this.remoteTargetPuckId = null;
        this.engine.opponentBand.midX = (BAND_LEFT_X + BAND_RIGHT_X) * 0.5;
        this.engine.opponentBand.midY = OPPONENT_BAND_REST_Y;
        this.engine.opponentBand.vibrationVelocity = Math.min(Math.hypot(msg.vx, msg.vy) * 0.65, 8.5);
        sounds.playSlingSnap(msg.power || 0.8);
        break;
      }
      case 'SLING_PUCK_SYNC':
        if (msg.pucks && Array.isArray(msg.pucks)) {
          for (const sp of msg.pucks) {
            let targetPuck = this.engine.pucks.find(p => p.id === sp.id);
            if (targetPuck) {
              // Don't sync if this is the puck actively dragged by the remote opponent
              if (targetPuck.id === this.remoteTargetPuckId) {
                continue;
              }
              // Only reconcile pucks on opponent half (y < CENTER_Y) that aren't being dragged locally
              if (targetPuck.y < CENTER_Y && !targetPuck.isDragged) {
                const localSpeed = Math.hypot(targetPuck.vx, targetPuck.vy);
                const remoteSpeed = Math.hypot(sp.vx, sp.vy);

                if (localSpeed > 2.0 || remoteSpeed > 2.0) {
                  // Fast-moving launched puck: guide velocity without snapping position mid-flight
                  targetPuck.vx += (sp.vx - targetPuck.vx) * 0.25;
                  targetPuck.vy += (sp.vy - targetPuck.vy) * 0.25;
                } else {
                  // Slow or resting puck: smooth convergence
                  const dist = Math.hypot(targetPuck.x - sp.x, targetPuck.y - sp.y);
                  if (dist > 40) {
                    targetPuck.x = sp.x;
                    targetPuck.y = sp.y;
                    targetPuck.prevX = sp.x;
                    targetPuck.prevY = sp.y;
                  } else if (dist > 0.8) {
                    targetPuck.x += (sp.x - targetPuck.x) * 0.45;
                    targetPuck.y += (sp.y - targetPuck.y) * 0.45;
                  }
                  targetPuck.vx = sp.vx;
                  targetPuck.vy = sp.vy;
                }
                if (sp.color) targetPuck.color = sp.color;
              }
            } else if (this.engine.pucks.length < 10) {
              // Self-healing: restore missing puck if dropped during connection
              this.engine.pucks.push({
                id: sp.id,
                x: sp.x,
                y: sp.y,
                prevX: sp.x,
                prevY: sp.y,
                dragX: sp.x,
                dragY: sp.y,
                isDragged: false,
                vx: sp.vx,
                vy: sp.vy,
                radius: PUCK_RADIUS,
                owner: 'opponent',
                color: sp.color || 'red'
              });
            }
          }
        }
        break;
      case 'SLING_SYNC_PUCKS':
        this.updateHUD();
        break;
      case 'SLING_VICTORY':
        if (!this.winnerLocked) {
          this.winnerLocked = true;
          this.ai?.stop();
          this.engine.phase = 'MATCH_OVER';
          this.engine.matchWinner = 'opponent';
          this.showGameOverModal(false, `${this.opponentName} cleared all pucks!`);
        } else if (this.session.peer?.role === 'host') {
          // Host arbitration for simultaneous puck clearing
          const guestWonFirst = (msg.timestamp || 0) < this.localVictoryTimestamp;
          if (guestWonFirst) {
            this.winnerLocked = false;
            this.engine.matchWinner = 'opponent';
            this.showGameOverModal(false, `${this.opponentName} cleared all pucks first!`);
          }
          this.session.peer.sendMessage({
            type: 'SLING_VICTORY_CONFIRM',
            winner: guestWonFirst ? 'guest' : 'host'
          });
        }
        break;
      case 'SLING_VICTORY_CONFIRM':
        if (this.session.peer?.role === 'guest') {
          if (msg.winner === 'host') {
            this.winnerLocked = false;
            this.engine.matchWinner = 'opponent';
            this.showGameOverModal(false, `${this.opponentName} cleared all pucks first!`);
          }
        }
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
    const isGuest = this.session.peer?.role === 'guest';
    const playerTheme = isGuest
      ? { letter: 'P', label: 'YOU', bg: 'bg-rose-500/20 border-rose-500/40 text-rose-400', badge: 'bg-rose-600/20 text-rose-300', text: 'text-rose-400' }
      : { letter: 'P', label: 'YOU', bg: 'bg-blue-500/20 border-blue-500/40 text-blue-400', badge: 'bg-blue-600/20 text-blue-300', text: 'text-blue-400' };
    const oppTheme = isGuest
      ? { letter: 'O', label: this.opponentName, bg: 'bg-blue-500/20 border-blue-500/40 text-blue-400', badge: 'bg-blue-600/20 text-blue-300', text: 'text-blue-400' }
      : { letter: 'O', label: this.opponentName, bg: 'bg-rose-500/20 border-rose-500/40 text-rose-400', badge: 'bg-rose-600/20 text-rose-300', text: 'text-rose-400' };

    this.container.innerHTML = `
      <div id="sling-outer-wrapper" class="w-full h-full min-h-[100dvh] max-h-[100dvh] overflow-hidden flex flex-col items-center justify-between p-1.5 sm:p-2.5 lg:p-3 select-none ${isDark ? 'bg-stone-950 text-white' : 'bg-amber-50 text-gray-900'}">
        
        <!-- Top HUD Header -->
        <div class="w-full max-w-md flex flex-col shrink-0 border-b ${isDark ? 'border-stone-800' : 'border-amber-200'} pb-1 gap-1">
          <!-- Row 1: Exit, Title, Mode & Net Ping -->
          <div class="w-full flex items-center justify-between px-1 text-xs">
            <button id="btn-sling-exit" class="ps-btn-secondary px-2.5 py-0.5 rounded-lg text-xs font-semibold flex items-center space-x-1 cursor-pointer active:scale-95" title="Exit to Arcade Hub">
              <span>← Exit</span>
            </button>
            <span class="text-[10px] sm:text-[11px] font-bold text-amber-500 font-mono tracking-wider uppercase">SLING PUCK • 10 PUCKS</span>
            <div class="flex items-center space-x-1.5">
              <span id="sling-net-ping" class="${this.session.mode === 'online' ? 'inline-flex' : 'hidden'} items-center space-x-1 text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 rounded px-1.5 py-0.5">
                <span id="sling-net-dot" class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span id="sling-net-text">30ms</span>
              </span>
              <span class="text-[9px] sm:text-[10px] font-mono text-gray-400">${this.session.mode === 'ai' ? 'VS AI' : '1V1 ONLINE'}</span>
            </div>
          </div>

          <!-- Row 2: Live Puck Score Banner -->
          <div class="w-full grid grid-cols-3 items-center px-1 text-xs gap-1">
            <!-- Player Count -->
            <div class="flex items-center space-x-1 justify-self-start">
              <div class="w-5 h-5 rounded-full ${playerTheme.bg} border flex items-center justify-center font-black text-[10px] shrink-0">${playerTheme.letter}</div>
              <div class="flex flex-col">
                <span class="text-[9px] font-bold ${playerTheme.text} leading-none">${playerTheme.label}</span>
                <span id="badge-player-pucks" class="px-1 py-0.5 rounded ${playerTheme.badge} font-mono text-[10px] font-black leading-none mt-0.5">5 PUCKS</span>
              </div>
            </div>

            <!-- Match Status / Rounds Center -->
            <div id="sling-status-banner" class="flex flex-col items-center px-1.5 py-0.5 rounded-lg bg-amber-600/15 border border-amber-500/30 text-center mx-auto w-full max-w-[130px]">
              <span id="sling-status-text" class="text-[9px] sm:text-[10px] font-black tracking-wide text-amber-500 uppercase truncate max-w-[115px]">RACE TO CLEAR!</span>
              <span id="sling-hint-text" class="text-[8px] font-medium text-gray-400 truncate max-w-[115px]">Sling all pucks</span>
            </div>

            <!-- Opponent Count -->
            <div class="flex items-center space-x-1 justify-self-end text-right">
              <div class="flex flex-col items-end">
                <span class="text-[9px] font-bold ${oppTheme.text} leading-none truncate max-w-[65px]">${oppTheme.label}</span>
                <span id="badge-opp-pucks" class="px-1 py-0.5 rounded ${oppTheme.badge} font-mono text-[10px] font-black leading-none mt-0.5">5 PUCKS</span>
              </div>
              <div class="w-5 h-5 rounded-full ${oppTheme.bg} border flex items-center justify-center font-black text-[10px] shrink-0">${oppTheme.letter}</div>
            </div>
          </div>

          <!-- Inactive Tab / Opponent Away Banner -->
          <div id="sling-peer-away-banner" class="hidden w-full text-center py-0.5 px-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-[10px] tracking-wide animate-pulse">
            ⚠️ Opponent is tabbed out / minimized
          </div>
        </div>

        <!-- Main Playing Area: Scaled Board Viewport -->
        <div id="sling-board-viewport" class="relative flex-1 w-full min-h-0 overflow-hidden my-auto select-none" style="touch-action: none;">
          <!-- Absolutely centered, unconstrained 400x720 container immune to flexbox squashing -->
          <div id="sling-canvas-wrapper" class="rounded-3xl shadow-2xl overflow-hidden border-4 ${isDark ? 'border-[#3b1c0b] shadow-[0_20px_50px_rgba(0,0,0,0.85)] bg-[#2b1408]' : 'border-[#5c3016] shadow-2xl bg-[#5c3016]'}" style="position: absolute; width: ${TABLE_WIDTH}px; height: ${TABLE_HEIGHT}px; left: 50%; top: 50%; margin-left: -${TABLE_WIDTH / 2}px; margin-top: -${TABLE_HEIGHT / 2}px; transform-origin: center center; touch-action: none; flex-shrink: 0; box-sizing: content-box;">
            <canvas id="canvas-sling" width="${TABLE_WIDTH}" height="${TABLE_HEIGHT}" class="block cursor-grab active:cursor-grabbing" style="width: ${TABLE_WIDTH}px; height: ${TABLE_HEIGHT}px; touch-action: none; display: block;"></canvas>
          </div>
        </div>

        <!-- Bottom Controls Bar / Tips -->
        <div class="w-full max-w-md flex items-center justify-between px-2 py-0.5 shrink-0 text-center text-xs font-medium text-gray-500">
          <span class="text-[9px] sm:text-[10px] truncate">👉 Pull cord back & release to sling!</span>
          <span id="sling-score-tracker" class="text-[10px] sm:text-[11px] font-black font-mono text-amber-500 shrink-0 ml-1.5">SCORE: 0 - 0</span>
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
    this.badgePlayerEl = document.getElementById('badge-player-pucks');
    this.badgeOppEl = document.getElementById('badge-opp-pucks');
    this.statusTextEl = document.getElementById('sling-status-text');
    this.hintTextEl = document.getElementById('sling-hint-text');
    this.scoreTrackerEl = document.getElementById('sling-score-tracker');

    this.renderer = new SlingRenderer(this.canvas);

    this.setupEventListeners();
    this.setupResizeObserver();
    this.handleResize();
    requestAnimationFrame(() => this.handleResize());
    window.addEventListener('resize', this.handleResize);
  }

  private setupResizeObserver() {
    const viewport = document.getElementById('sling-board-viewport');
    if (viewport && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(viewport);
    }
  }

  // Responsive Board Scaling (immune to squashing, perfectly centers on mobile and desktop)
  private handleResize = () => {
    const viewport = document.getElementById('sling-board-viewport');
    const wrapper = document.getElementById('sling-canvas-wrapper');
    if (!viewport || !wrapper) return;

    // Available viewport space with safety margin so the scaled board never touches viewport edges
    const availW = Math.max(10, viewport.clientWidth - 16);
    const availH = Math.max(10, viewport.clientHeight - 16);

    // Include the 4px border on each side (8px total)
    const TOTAL_WIDTH = TABLE_WIDTH + 8;
    const TOTAL_HEIGHT = TABLE_HEIGHT + 8;

    const scale = Math.min(availW / TOTAL_WIDTH, availH / TOTAL_HEIGHT);
    wrapper.style.transform = `scale(${scale})`;

    if (this.renderer) {
      this.renderer.updateScale(scale);
    }
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
      if (this.draggedPuck) return; // Prevent multi-touch conflict

      if (e.cancelable) e.preventDefault();
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {}

      const coords = this.getTableCoords(e.clientX, e.clientY);
      // Only allow grabbing pucks situated in player territory (y >= CENTER_Y)
      const candidatePucks = this.engine.pucks.filter(p => p.y >= CENTER_Y);

      // Find closest puck within touch reach
      let closestPuck: Puck | null = null;
      let minDist = 38; // Generous touch tolerance

      for (const p of candidatePucks) {
        const d = Math.hypot(coords.x - p.x, coords.y - p.y);
        if (d < minDist) {
          minDist = d;
          closestPuck = p;
        }
      }

      // If tapped near the band, check if a puck is resting against the band
      if (!closestPuck && coords.y >= PLAYER_BAND_REST_Y - 32) {
        let bandMinDist = 65;
        for (const p of candidatePucks) {
          const d = Math.hypot(coords.x - p.x, coords.y - p.y);
          if (d < bandMinDist) {
            bandMinDist = d;
            closestPuck = p;
          }
        }
      }

      if (closestPuck) {
        this.draggedPuck = closestPuck;
        this.activePointerId = e.pointerId;
        this.draggedPuck.isDragged = true;

        // Smooth offset to prevent jump upon touch down
        this.dragOffsetX = coords.x - closestPuck.x;
        this.dragOffsetY = coords.y - closestPuck.y;
        if (Math.hypot(this.dragOffsetX, this.dragOffsetY) > 22) {
          const angle = Math.atan2(this.dragOffsetY, this.dragOffsetX);
          this.dragOffsetX = Math.cos(angle) * 22;
          this.dragOffsetY = Math.sin(angle) * 22;
        }

        this.draggedPuck.dragX = this.draggedPuck.x;
        this.draggedPuck.dragY = this.draggedPuck.y;
        this.draggedPuck.prevX = this.draggedPuck.x;
        this.draggedPuck.prevY = this.draggedPuck.y;
        this.wasBandStretched = false;
      }
    });

    const onPointerMove = (e: PointerEvent) => {
      if (!this.draggedPuck || e.pointerId !== this.activePointerId) return;
      if (e.cancelable) e.preventDefault();

      const coords = this.getTableCoords(e.clientX, e.clientY);
      const targetX = coords.x - this.dragOffsetX;
      const targetY = coords.y - this.dragOffsetY;

      // Clamp puck coordinates inside player zone (cannot penetrate rails)
      const clampedX = Math.max(
        RAIL_LEFT + this.draggedPuck.radius,
        Math.min(targetX, RAIL_RIGHT - this.draggedPuck.radius)
      );
      const clampedY = Math.max(
        CENTER_Y + 15,
        Math.min(targetY, RAIL_BOTTOM - this.draggedPuck.radius)
      );

      // Immediately sync puck coordinates to eliminate any render or physics lag
      this.draggedPuck.x = clampedX;
      this.draggedPuck.y = clampedY;
      this.draggedPuck.prevX = clampedX;
      this.draggedPuck.prevY = clampedY;
      this.draggedPuck.dragX = clampedX;
      this.draggedPuck.dragY = clampedY;

      // If puck is pulled behind player's elastic band, stretch the band!
      if (clampedY > PLAYER_BAND_REST_Y) {
        this.engine.playerBand.isStretched = true;
        this.engine.playerBand.midX = clampedX;
        this.engine.playerBand.midY = clampedY;
        this.wasBandStretched = true;
      } else {
        this.engine.playerBand.isStretched = false;
        this.engine.playerBand.midY = PLAYER_BAND_REST_Y;
      }

      // Sync stretch & drag state with peer in online PvP at 60Hz (every 16ms)
      if (this.session.mode === 'online' && this.session.peer?.isConnected) {
        const now = performance.now();
        if (now - this.lastBandBroadcastTime >= 16) {
          this.lastBandBroadcastTime = now;
          this.session.peer.sendMessage({
            type: 'SLING_BAND_PULL',
            isStretched: this.engine.playerBand.isStretched,
            isDragging: true,
            puckId: this.draggedPuck.id,
            x: clampedX,
            y: clampedY
          });
        }
      }
    };

    const releaseDrag = (e: PointerEvent) => {
      if (!this.draggedPuck || e.pointerId !== this.activePointerId) return;

      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {}

      const shouldLaunch =
        this.engine.playerBand.isStretched ||
        this.wasBandStretched ||
        this.draggedPuck.y > PLAYER_BAND_REST_Y + 3;

      let launched = false;
      if (shouldLaunch) {
        // Launch puck using elastic band physics!
        launched = SlingPhysics.launchFromBand(this.draggedPuck, this.engine.playerBand, power => {
          sounds.playSlingSnap(power);
          if (this.session.mode === 'online' && this.session.peer?.isConnected && this.draggedPuck) {
            this.session.peer.sendMessage({
              type: 'SLING_PUCK_LAUNCH',
              puckId: this.draggedPuck.id,
              x: this.draggedPuck.x,
              y: TABLE_HEIGHT - this.draggedPuck.y,
              vx: this.draggedPuck.vx,
              vy: -this.draggedPuck.vy,
              power
            });
          }
        });
      }

      if (!launched) {
        // Guarantee puck is never left behind the rubber band
        if (this.draggedPuck.y > PLAYER_BAND_REST_Y - PUCK_RADIUS) {
          this.draggedPuck.y = PLAYER_BAND_REST_Y - PUCK_RADIUS - 1;
          this.draggedPuck.dragY = this.draggedPuck.y;
          this.draggedPuck.prevY = this.draggedPuck.y;
        }
        if (this.session.mode === 'online' && this.session.peer?.isConnected) {
          this.session.peer.sendMessage({
            type: 'SLING_BAND_PULL',
            isStretched: false,
            isDragging: false
          });
        }
      }

      this.draggedPuck.isDragged = false;
      this.draggedPuck = null;
      this.activePointerId = null;
      this.engine.playerBand.isStretched = false;
      this.wasBandStretched = false;
    };

    this.boundPointerMove = onPointerMove;
    this.boundPointerUp = releaseDrag;

    this.canvas.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointermove', onPointerMove);
    this.canvas.addEventListener('pointerup', releaseDrag);
    window.addEventListener('pointerup', releaseDrag);
    this.canvas.addEventListener('pointercancel', releaseDrag);
    window.addEventListener('pointercancel', releaseDrag);
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

      // Opponent drag watchdog: if dragging or stretched with no network updates for > 1200ms, auto-release to prevent sticking
      // Only applies to online PvP — in AI mode the AI manages the opponent band directly
      if (this.session.mode === 'online' && (this.engine.opponentBand.isStretched || this.remoteTargetPuckId !== null) && (currentTime - this.lastOpponentBandPullTime > 1200)) {
        this.engine.opponentBand.isStretched = false;
        this.remoteTargetPuckId = null;
        this.engine.opponentBand.midX = (BAND_LEFT_X + BAND_RIGHT_X) * 0.5;
        this.engine.opponentBand.midY = OPPONENT_BAND_REST_Y;
        for (const p of this.engine.pucks) {
          if (p.y < CENTER_Y && p.isDragged) {
            p.isDragged = false;
            if (p.y - p.radius <= OPPONENT_BAND_REST_Y) {
              p.y = OPPONENT_BAND_REST_Y + p.radius + 1;
              p.prevY = p.y;
              p.dragY = p.y;
            }
          }
        }
      }

      // Butter-smooth frame interpolation for remote opponent dragging & rubber band
      const lerpFactor = 0.55;
      if (this.engine.opponentBand.isStretched) {
        this.engine.opponentBand.midX += (this.remoteTargetBandX - this.engine.opponentBand.midX) * lerpFactor;
        this.engine.opponentBand.midY += (this.remoteTargetBandY - this.engine.opponentBand.midY) * lerpFactor;
      }

      if (this.remoteTargetPuckId !== null) {
        const remotePuck = this.engine.pucks.find(p => p.id === this.remoteTargetPuckId);
        if (remotePuck && remotePuck.isDragged) {
          remotePuck.x += (this.remoteTargetPuckX - remotePuck.x) * lerpFactor;
          remotePuck.y += (this.remoteTargetPuckY - remotePuck.y) * lerpFactor;
          remotePuck.dragX = remotePuck.x;
          remotePuck.dragY = remotePuck.y;
          remotePuck.prevX = remotePuck.x;
          remotePuck.prevY = remotePuck.y;
        }
      }

      // Sub-tick render interpolation factor (0.0 to 1.0)
      const alpha = Math.min(1.0, Math.max(0.0, accumulator / FIXED_TIMESTEP));
      this.renderer.render(this.engine, this.currentTheme, alpha, this.draggedPuck);

      this.updateHUD();

      // Real-time P2P puck sync: 30Hz when moving/dragged pucks exist, 2.5Hz resting heartbeat
      if (this.session.mode === 'online' && this.session.peer?.isConnected) {
        const myPucks = this.engine.pucks.filter(p => p.y >= CENTER_Y || p.isDragged);
        const hasMovingPucks = myPucks.some(p => Math.hypot(p.vx, p.vy) > 0.08 || p.isDragged);
        const syncInterval = hasMovingPucks ? 33 : 400; // 30Hz active, 2.5Hz idle

        if (currentTime - this.lastSyncBroadcastTime > syncInterval) {
          this.lastSyncBroadcastTime = currentTime;
          const serializedPucks = myPucks.map(p => ({
            id: p.id,
            x: p.x,
            y: TABLE_HEIGHT - p.y,
            vx: p.vx,
            vy: -p.vy,
            color: p.color
          }));

          this.session.peer.sendMessage({
            type: 'SLING_PUCK_SYNC',
            pucks: serializedPucks,
            myPuckCount: this.engine.getPlayerPuckCount(),
            oppPuckCount: this.engine.getOpponentPuckCount()
          });
        }
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  private updateHUD(force: boolean = false) {
    const now = performance.now();
    // Throttle DOM updates to max 15Hz unless forced (e.g., game state change, score change)
    if (!force && now - this.lastHUDUpdateTime < 66) {
      return;
    }
    this.lastHUDUpdateTime = now;

    const pCount = this.engine.getPlayerPuckCount();
    const oCount = this.engine.getOpponentPuckCount();

    if (this.badgePlayerEl && pCount !== this.cachedPlayerPuckCount) {
      this.cachedPlayerPuckCount = pCount;
      this.badgePlayerEl.textContent = `${pCount} PUCK${pCount === 1 ? '' : 'S'}`;
    }
    if (this.badgeOppEl && oCount !== this.cachedOppPuckCount) {
      this.cachedOppPuckCount = oCount;
      this.badgeOppEl.textContent = `${oCount} PUCK${oCount === 1 ? '' : 'S'}`;
    }

    const scoreStr = `SCORE: ${this.engine.playerScore} - ${this.engine.opponentScore}`;
    if (this.scoreTrackerEl && scoreStr !== this.cachedScoreText) {
      this.cachedScoreText = scoreStr;
      this.scoreTrackerEl.textContent = scoreStr;
    }

    if (this.statusTextEl && this.hintTextEl) {
      let newStatus = '';
      let newHint = '';

      if (this.engine.phase === 'COUNTDOWN') {
        newStatus = 'GET READY!';
        newHint = `Match starts in ${this.engine.countdown}...`;
      } else if (this.engine.phase === 'PLAYING') {
        if (pCount < oCount) {
          newStatus = 'YOU ARE LEADING!';
          newHint = `Only ${pCount} left to clear!`;
        } else if (pCount > oCount) {
          newStatus = 'OPPONENT LEADING!';
          newHint = 'Shoot faster!';
        } else {
          newStatus = 'TIED BATTLE!';
          newHint = 'Sling pucks through the gate!';
        }
      } else if (this.engine.phase === 'MATCH_OVER') {
        const didIWin = this.engine.matchWinner === 'player';
        newStatus = didIWin ? 'VICTORY!' : 'DEFEAT!';
        newHint = didIWin ? 'You cleared all pucks!' : `${this.opponentName} cleared all pucks!`;
      }

      if (newStatus !== this.cachedStatusText) {
        this.cachedStatusText = newStatus;
        this.statusTextEl.textContent = newStatus;
      }
      if (newHint !== this.cachedHintText) {
        this.cachedHintText = newHint;
        this.hintTextEl.textContent = newHint;
      }
    }
  }

  // -------------------------------------------------------------
  // GAME OVER & REMATCH HANDLING
  // -------------------------------------------------------------
  private showGameOverModal(didIWin: boolean, message: string) {
    const modal = document.getElementById('modal-sling-gameover');
    const isModalVisible = modal && !modal.classList.contains('hidden');
    if (this.winnerLocked && isModalVisible && this.engine.matchWinner === (didIWin ? 'player' : 'opponent')) {
      return;
    }
    this.winnerLocked = true;
    this.ai?.stop();
    this.engine.phase = 'MATCH_OVER';
    this.engine.matchWinner = didIWin ? 'player' : 'opponent';

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
      const seed = Date.now();
      this.session.peer?.sendMessage({ type: 'REMATCH_ACCEPT', seed });
      this.startNewMatch(seed);
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
    this.winnerLocked = false;
    this.localVictoryTimestamp = 0;
    const modal = document.getElementById('modal-sling-gameover');
    modal?.classList.add('hidden');

    const btn = document.getElementById('btn-sling-rematch');
    if (btn) {
      btn.textContent = 'Play Again';
      btn.className = 'w-full py-3 px-6 rounded-xl font-black tracking-wider uppercase text-white bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-500 shadow-lg shadow-orange-500/30 active:scale-95 transition-all cursor-pointer';
    }

    this.engine.resetMatch(this.session.peer?.role);
    if (seed) this.engine.setupRound(seed, this.session.peer?.role);
    this.updateHUD(true);
  }
}
