import { GAMES_REGISTRY } from './games/registry';
import type { GameDefinition, GameInstance, AIDifficulty, AppTheme } from './games/types';
import { WebRTCPeer } from './network/webrtc-peer';
import { sounds } from './engine/sound';

// Fallback in-memory storage for Incognito / Private browsing modes
const memoryStorage = new Map<string, string>();

const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // Ignored in Incognito / Restricted mode
    }
    return memoryStorage.get(key) || null;
  },
  setItem: (key: string, val: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, val);
      }
    } catch {
      // Ignored in Incognito / Restricted mode
    }
    memoryStorage.set(key, val);
  }
};

class ConsoleDashboard {
  private appContainer: HTMLElement;
  private currentTheme: AppTheme = 'dark';
  private isMuted: boolean = false;

  private selectedGameIndex: number = 0;
  private activeGameInstance: GameInstance | null = null;
  private peer: WebRTCPeer | null = null;
  private roomCode: string | null = null;
  private currentAIDifficulty: AIDifficulty = 'medium';

  constructor() {
    const el = document.getElementById('app');
    if (!el) throw new Error('Missing #app container in DOM');
    this.appContainer = el;

    this.initTheme();
    this.checkUrlRoomParam();
    this.renderDashboard();
  }

  private initTheme() {
    const saved = safeStorage.getItem('hub_theme') as AppTheme | null;
    if (saved) {
      this.currentTheme = saved;
    } else {
      let prefersDark = true;
      try {
        prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      } catch {
        prefersDark = true;
      }
      this.currentTheme = prefersDark ? 'dark' : 'light';
    }
    this.applyTheme(this.currentTheme);
  }

  private applyTheme(theme: AppTheme) {
    this.currentTheme = theme;
    safeStorage.setItem('hub_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
    this.activeGameInstance?.setTheme(theme);
  }

  private toggleTheme() {
    const next = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(next);
    if (!this.activeGameInstance) {
      this.renderDashboard();
    }
  }

  private checkUrlRoomParam() {
    try {
      const params = new URLSearchParams(window.location.search);
      const room = params.get('room');
      if (room) {
        this.roomCode = room.trim().toUpperCase();
      }
    } catch (e) {
      console.warn('Could not parse room URL param:', e);
    }
  }

  // -------------------------------------------------------------
  // PS5 DASHBOARD VIEW
  // -------------------------------------------------------------

  public renderDashboard() {
    this.activeGameInstance?.destroy();
    this.activeGameInstance = null;
    this.peer?.cleanup();

    const isDark = this.currentTheme === 'dark';
    const currentGame = GAMES_REGISTRY[this.selectedGameIndex] || GAMES_REGISTRY[0];

    this.appContainer.innerHTML = `
      <!-- Console Top Navigation Bar -->
      <header class="w-full max-w-6xl px-4 sm:px-8 py-5 flex items-center justify-between border-b ${isDark ? 'border-gray-800/80' : 'border-gray-200'}">
        <div class="flex items-center space-x-3">
          <!-- Console Symbol -->
          <span class="text-3xl sm:text-4xl select-none leading-none">🎮</span>
          <div>
            <h1 class="text-base sm:text-lg font-bold tracking-tight">1V1 BATTLE HUB</h1>
            <p class="text-[11px] text-gray-500 font-medium">Instant 1v1 Multiplayer Games</p>
          </div>
        </div>

        <!-- Right Quick Controls -->
        <div class="flex items-center space-x-2.5">
          <!-- Theme Toggle Pill -->
          <button id="btn-theme-toggle" class="ps-btn-secondary px-3 py-1.5 rounded-full text-xs font-semibold flex items-center space-x-1.5 shadow-sm">
            <span>${isDark ? '🌙 Dark' : '☀️ Light'}</span>
          </button>

          <!-- Sound Toggle Pill -->
          <button id="btn-sound-toggle" class="ps-btn-secondary px-3 py-1.5 rounded-full text-xs font-semibold flex items-center space-x-1.5 shadow-sm">
            <span>${this.isMuted ? '🔇' : '🔊'}</span>
          </button>
        </div>
      </header>

      <!-- Main Showcase & Carousel Area -->
      <main class="w-full max-w-6xl px-4 sm:px-8 flex-1 flex flex-col justify-center py-6 sm:py-8">
        
        <!-- Match Invitation Banner if room code present in URL -->
        ${this.roomCode ? `
          <div class="mb-6 p-4 rounded-2xl ${isDark ? 'bg-blue-950/40 border-blue-500/40' : 'bg-blue-50 border-blue-200'} border flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
            <div class="flex items-center space-x-3">
              <div class="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold">
                🎮
              </div>
              <div>
                <div class="text-xs font-bold text-blue-500 uppercase tracking-wider">Match Invitation Detected</div>
                <div class="text-sm font-semibold">You were invited to 1v1 Room: <span class="font-mono text-blue-500 font-bold">${this.roomCode}</span></div>
              </div>
            </div>
            <div class="flex items-center space-x-2">
              <button id="btn-banner-join" class="ps-btn-primary px-5 py-2 rounded-xl text-xs font-semibold">
                Join Match Now
              </button>
              <button id="btn-banner-dismiss" class="ps-btn-secondary px-3 py-2 rounded-xl text-xs font-semibold text-gray-500">
                Dismiss
              </button>
            </div>
          </div>
        ` : ''}

        <!-- Hero Showcase Card -->
        <div class="relative overflow-hidden rounded-3xl p-6 sm:p-10 mb-8 ps-card shadow-2xl bg-gradient-to-br ${currentGame.bannerGradient} text-white">
          <div class="relative z-10 max-w-xl">
            <div class="flex items-center space-x-2 mb-3">
              <span class="ps-badge bg-white/20 backdrop-blur-md text-white">
                ${currentGame.badge}
              </span>
              <span class="text-xs text-white/80 font-medium">
                ${currentGame.genre}
              </span>
            </div>

            <h2 class="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">
              ${currentGame.title}
            </h2>
            <p class="text-base sm:text-lg font-medium text-white/90 mb-3">
              ${currentGame.subtitle}
            </p>
            <p class="text-sm text-white/75 mb-8 line-clamp-2 leading-relaxed">
              ${currentGame.description}
            </p>

            <div class="flex items-center space-x-3">
              ${!currentGame.isComingSoon ? `
                <button id="btn-play-hero" class="px-7 py-3 rounded-xl bg-white text-gray-950 font-bold text-sm hover:bg-gray-100 transition-all transform hover:-translate-y-0.5 shadow-lg shadow-black/20 flex items-center space-x-2">
                  <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  <span>PLAY NOW</span>
                </button>
              ` : `
                <button disabled class="px-6 py-3 rounded-xl bg-white/20 text-white/60 font-semibold text-sm cursor-not-allowed">
                  COMING SOON
                </button>
              `}
            </div>
          </div>

          <!-- Ambient background motif -->
          <div class="absolute right-6 -bottom-8 opacity-15 pointer-events-none transform scale-150 sm:scale-175 text-white">
            ${currentGame.iconSvg}
          </div>
        </div>

        <!-- Games Selection Carousel -->
        <div>
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-bold uppercase tracking-wider text-gray-500">
              Select Game
            </h3>
            <span class="text-xs text-gray-400 font-medium">
              ${GAMES_REGISTRY.length} Games Available
            </span>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
            ${GAMES_REGISTRY.map((game, idx) => {
              const isSelected = idx === this.selectedGameIndex;
              return `
                <div class="game-card ps-card rounded-2xl p-4 cursor-pointer relative overflow-hidden transition-all duration-200 ${isSelected ? 'ps-card-active -translate-y-1' : 'hover:-translate-y-0.5'}" data-index="${idx}">
                  <div class="w-10 h-10 rounded-xl mb-3 flex items-center justify-center text-white bg-gradient-to-tr ${game.bannerGradient}">
                    ${game.iconSvg}
                  </div>
                  <h4 class="font-bold text-sm truncate mb-0.5">${game.title}</h4>
                  <div class="flex items-center justify-between text-[11px] text-gray-500">
                    <span>${game.genre}</span>
                    ${game.isComingSoon ? `<span class="text-[10px] text-amber-500 font-semibold">SOON</span>` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

      </main>

      <!-- Bottom Platform Footer -->
      <footer class="w-full max-w-6xl px-4 sm:px-8 py-4 border-t ${isDark ? 'border-gray-800/80' : 'border-gray-200'} flex items-center justify-between text-xs text-gray-500">
        <div>1v1 Battle Platform • Instant Multiplayer</div>
        <div>Play Online with Friends or Challenge AI</div>
      </footer>

      <!-- Launch Game Modal (Hidden by default) -->
      <div id="modal-launch" class="hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div class="ps-card rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border ${isDark ? 'border-gray-800' : 'border-gray-200'}">
          <div class="flex items-center justify-between mb-4">
            <div>
              <span class="ps-badge bg-blue-500/10 text-blue-500 mb-1">CHOOSE MATCH MODE</span>
              <h3 id="modal-game-title" class="text-xl font-extrabold tracking-tight">${currentGame.title}</h3>
            </div>
            <button id="btn-modal-close" class="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1">
              ✕
            </button>
          </div>

          <div class="space-y-4">
            <!-- Solo vs AI -->
            <div class="p-4 rounded-2xl ${isDark ? 'bg-[#0f121d]' : 'bg-gray-50'} border ${isDark ? 'border-gray-800' : 'border-gray-200'}">
              <div class="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Solo vs AI</div>
              <div class="grid grid-cols-4 gap-1.5 mb-3">
                <button class="ai-btn px-2 py-1.5 rounded-lg text-xs font-semibold ${this.currentAIDifficulty === 'easy' ? 'bg-blue-600 text-white' : 'ps-btn-secondary'}" data-diff="easy">Easy</button>
                <button class="ai-btn px-2 py-1.5 rounded-lg text-xs font-semibold ${this.currentAIDifficulty === 'medium' ? 'bg-blue-600 text-white' : 'ps-btn-secondary'}" data-diff="medium">Med</button>
                <button class="ai-btn px-2 py-1.5 rounded-lg text-xs font-semibold ${this.currentAIDifficulty === 'hard' ? 'bg-blue-600 text-white' : 'ps-btn-secondary'}" data-diff="hard">Hard</button>
                <button class="ai-btn px-2 py-1.5 rounded-lg text-xs font-semibold ${this.currentAIDifficulty === 'extreme' ? 'bg-rose-600 text-white' : 'ps-btn-secondary'}" data-diff="extreme">Boss 🔥</button>
              </div>
              <button id="btn-start-ai" class="ps-btn-primary w-full py-2.5 rounded-xl text-xs font-semibold">
                Play vs AI
              </button>
            </div>

            <!-- 1v1 Online Multiplayer -->
            <div class="p-4 rounded-2xl ${isDark ? 'bg-[#0f121d]' : 'bg-gray-50'} border ${isDark ? 'border-gray-800' : 'border-gray-200'}">
              <div class="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">1v1 Online Multiplayer</div>
              
              <button id="btn-host-online" class="ps-btn-secondary w-full py-2.5 rounded-xl text-xs font-semibold mb-3">
                Host New Match (Get Code)
              </button>

              <div class="flex items-center space-x-2">
                <input id="input-room-code" type="text" maxlength="6" placeholder="ENTER 6-CHAR CODE" value="${this.roomCode || ''}" class="w-full text-center font-mono text-xs uppercase px-3 py-2 rounded-xl border ${isDark ? 'bg-black/30 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'} outline-none focus:border-blue-500" />
                <button id="btn-join-online" class="ps-btn-primary px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap">
                  Join
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.attachDashboardListeners();
  }

  private attachDashboardListeners() {
    // Theme toggle
    document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
      this.toggleTheme();
    });

    // Sound toggle
    document.getElementById('btn-sound-toggle')?.addEventListener('click', () => {
      this.isMuted = !sounds.toggleMute();
      this.renderDashboard();
    });

    // Carousel card click
    document.querySelectorAll('.game-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const index = parseInt((e.currentTarget as HTMLElement).dataset.index || '0', 10);
        this.selectedGameIndex = index;
        this.renderDashboard();
      });
    });

    // Hero Play button
    document.getElementById('btn-play-hero')?.addEventListener('click', () => {
      this.openLaunchModal();
    });

    // Banner Join button (if roomCode present)
    document.getElementById('btn-banner-join')?.addEventListener('click', () => {
      if (this.roomCode) {
        this.joinOnlineMatch(this.roomCode);
      }
    });

    // Banner Dismiss
    document.getElementById('btn-banner-dismiss')?.addEventListener('click', () => {
      this.roomCode = null;
      window.history.replaceState({}, '', window.location.pathname);
      this.renderDashboard();
    });

    // Modal Close
    document.getElementById('btn-modal-close')?.addEventListener('click', () => {
      document.getElementById('modal-launch')?.classList.add('hidden');
    });

    // AI Difficulty select
    document.querySelectorAll('.ai-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const diff = (e.currentTarget as HTMLElement).dataset.diff as AIDifficulty;
        if (diff) {
          this.currentAIDifficulty = diff;
          document.querySelectorAll('.ai-btn').forEach(b => {
            const isSel = (b as HTMLElement).dataset.diff === diff;
            b.className = `ai-btn px-2 py-1.5 rounded-lg text-xs font-semibold ${isSel ? (diff === 'extreme' ? 'bg-rose-600 text-white' : 'bg-blue-600 text-white') : 'ps-btn-secondary'}`;
          });
        }
      });
    });

    // Start AI
    document.getElementById('btn-start-ai')?.addEventListener('click', () => {
      const currentGame = GAMES_REGISTRY[this.selectedGameIndex];
      this.launchGame(currentGame, 'ai');
    });

    // Host Online
    document.getElementById('btn-host-online')?.addEventListener('click', () => {
      const currentGame = GAMES_REGISTRY[this.selectedGameIndex];
      this.hostOnlineMatch(currentGame);
    });

    // Join Online
    document.getElementById('btn-join-online')?.addEventListener('click', () => {
      const input = document.getElementById('input-room-code') as HTMLInputElement;
      const code = input?.value.trim().toUpperCase();
      if (code && code.length >= 4) {
        this.joinOnlineMatch(code);
      } else {
        alert('Please enter a valid room code');
      }
    });
  }

  private openLaunchModal() {
    const modal = document.getElementById('modal-launch');
    modal?.classList.remove('hidden');
  }

  // -------------------------------------------------------------
  // GAME LAUNCH & ARENA MOUNTING
  // -------------------------------------------------------------

  private launchGame(gameDef: GameDefinition, mode: 'ai' | 'online', peer?: WebRTCPeer) {
    this.appContainer.innerHTML = `
      <div id="arena-container" class="w-full min-h-screen flex flex-col items-center justify-start">
        <!-- Game mounts here -->
      </div>
    `;

    const arena = document.getElementById('arena-container')!;
    this.activeGameInstance = gameDef.create(arena, {
      gameId: gameDef.id,
      mode,
      aiDifficulty: this.currentAIDifficulty,
      peer,
      theme: this.currentTheme,
      onExit: () => {
        this.peer?.cleanup();
        this.renderDashboard();
      }
    });
  }

  private async hostOnlineMatch(gameDef: GameDefinition) {
    this.renderWaitingRoom('host', gameDef);

    this.peer = new WebRTCPeer({
      onStatusChange: (status, message) => {
        const el = document.getElementById('net-status-text');
        if (el && message) el.textContent = message;
        if (status === 'connected') {
          this.launchGame(gameDef, 'online', this.peer!);
        }
      },
      onRoomCreated: (code) => {
        this.roomCode = code;
        const el = document.getElementById('display-room-code');
        if (el) el.textContent = code;
      }
    });

    try {
      await this.peer.hostRoom(gameDef.id);
    } catch (e: any) {
      alert(`Error hosting match: ${e.message}`);
      this.renderDashboard();
    }
  }

  private async joinOnlineMatch(code: string) {
    this.roomCode = code;
    this.renderWaitingRoom('guest');

    this.peer = new WebRTCPeer({
      onStatusChange: (status, message) => {
        const el = document.getElementById('net-status-text');
        if (el && message) el.textContent = message;
        if (status === 'connected') {
          const gameId = this.peer?.gameId || 'tetris';
          const gameDef = GAMES_REGISTRY.find(g => g.id === gameId) || GAMES_REGISTRY[0];
          this.launchGame(gameDef, 'online', this.peer!);
        }
      }
    });

    try {
      await this.peer.joinRoom(code);
    } catch (e: any) {
      alert(`Error joining match: ${e.message}`);
      this.renderDashboard();
    }
  }

  private renderWaitingRoom(role: 'host' | 'guest', gameDef?: GameDefinition) {
    const isDark = this.currentTheme === 'dark';
    const isHost = role === 'host';

    this.appContainer.innerHTML = `
      <div class="min-h-screen flex flex-col items-center justify-center p-4 w-full max-w-md">
        <div class="ps-card w-full rounded-3xl p-6 sm:p-8 text-center shadow-2xl border ${isDark ? 'border-gray-800' : 'border-gray-200'}">
          
          <div class="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-blue-600/10 text-blue-500">
            <svg class="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>

          <h3 class="text-xl font-extrabold tracking-tight mb-1">
            ${isHost ? `Waiting for Opponent (${gameDef?.title || 'Game'})` : 'Connecting to Match'}
          </h3>
          <p id="net-status-text" class="text-xs text-gray-500 mb-6 font-mono">
            ${isHost ? 'Generating room code...' : `Joining room ${this.roomCode}...`}
          </p>

          ${isHost ? `
            <div class="rounded-2xl p-4 mb-4 ${isDark ? 'bg-black/40' : 'bg-gray-100'} border ${isDark ? 'border-gray-800' : 'border-gray-200'}">
              <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">ROOM CODE</div>
              <div id="display-room-code" class="font-mono text-3xl font-black text-blue-500 tracking-widest select-all">
                ------
              </div>
            </div>

            <button id="btn-copy-link" class="ps-btn-secondary w-full py-2.5 rounded-xl text-xs font-semibold mb-3 flex items-center justify-center space-x-2">
              <span>📋 Copy Direct Share Link</span>
            </button>
          ` : ''}

          <button id="btn-cancel-waiting" class="w-full py-2 text-xs font-semibold text-gray-500 hover:text-gray-400">
            Cancel & Return to Hub
          </button>
        </div>
      </div>
    `;

    document.getElementById('btn-cancel-waiting')?.addEventListener('click', () => {
      this.peer?.cleanup();
      this.renderDashboard();
    });

    document.getElementById('btn-copy-link')?.addEventListener('click', () => {
      if (this.roomCode) {
        const url = `${window.location.origin}${window.location.pathname}?room=${this.roomCode}`;
        navigator.clipboard.writeText(url).then(() => {
          const btn = document.getElementById('btn-copy-link');
          if (btn) btn.innerHTML = '<span>✅ Link Copied to Clipboard!</span>';
          setTimeout(() => {
            if (btn) btn.innerHTML = '<span>📋 Copy Direct Share Link</span>';
          }, 2000);
        });
      }
    });
  }
}

// Bulletproof bootstrap function that works across regular & incognito browsers
function bootstrap() {
  try {
    new ConsoleDashboard();
  } catch (err) {
    console.error('Fatal initialization error:', err);
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = `
        <div style="padding: 24px; color: #ef4444; font-family: monospace; text-align: center;">
          <h2 style="font-size: 20px; font-weight: bold; margin-bottom: 8px;">Failed to initialize game hub</h2>
          <pre style="background: rgba(0,0,0,0.1); padding: 12px; border-radius: 8px; display: inline-block;">${err}</pre>
        </div>
      `;
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
