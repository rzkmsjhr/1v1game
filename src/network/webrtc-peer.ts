import { SignalingClient } from './signaling';

export type NetworkMessage =
  | { type: 'TETRIS_SYNC_BOARD'; grid: (string | null)[][]; score: number; pendingGarbage: number; currentPiece?: any }
  | { type: 'TETRIS_PIECE_MOVE'; currentPiece: any; score: number }
  | { type: 'TETRIS_GARBAGE'; lines: number }
  | { type: 'TETRIS_START_SEED'; seed: number }
  | { type: 'TETRIS_REQUEST_SEED' }
  | { type: 'TETRIS_REMATCH_REQUEST' }
  | { type: 'TETRIS_REMATCH_ACCEPT'; seed?: number }
  | { type: 'OTHELLO_MOVE'; r: number; c: number; player: number }
  | { type: 'OTHELLO_DICE_ROLL'; value: number }
  | { type: 'OTHELLO_DICE_REROLL' }
  | { type: 'OTHELLO_COLOR_CHOICE'; chosenColor: 1 | 2; chooserRole: 'host' | 'guest' }
  | { type: 'OTHELLO_REMATCH_REQUEST' }
  | { type: 'OTHELLO_REMATCH_ACCEPT' }
  | { type: 'POOL_LAG_SHOT'; power: number }
  | { type: 'POOL_LAG_RESULT'; winner: 'player' | 'opponent' | 'tie'; reason: string }
  | { type: 'POOL_DECIDE_BREAK'; breaker: 'player' | 'opponent' }
  | { type: 'POOL_SHOT'; angle: number; power: number }
  | { type: 'POOL_AIM_MOVE'; angle: number; power: number }
  | { type: 'POOL_SYNC_TABLE'; balls: Array<{ id: number; x: number; y: number; isPotted: boolean; isSinking: boolean }>; currentTurn: 'player' | 'opponent'; playerGroup: any; opponentGroup: any; phase: any; winner?: any }
  | { type: 'POOL_MOVE_BALL'; x: number; y: number }
  | { type: 'POOL_PLACE_BALL'; x: number; y: number }
  | { type: 'POOL_REMATCH_REQUEST' }
  | { type: 'POOL_REMATCH_ACCEPT' }
  | { type: 'SNAKE_INIT_BOARD'; board: any }
  | { type: 'SNAKE_REQUEST_BOARD' }
  | { type: 'SNAKE_INITIAL_ROLL'; d1: number; d2: number; total: number }
  | { type: 'SNAKE_INITIAL_CHOICE'; choice: 'start_first' | 'start_second' }
  | { type: 'SNAKE_DICE_ROLL'; d1: number; d2: number; total: number; isDouble: boolean }
  | { type: 'SNAKE_MOVE_COMPLETE'; finalPos: number }
  | { type: 'SNAKE_REMATCH_REQUEST' }
  | { type: 'SNAKE_REMATCH_ACCEPT'; seed?: number }
  | { type: 'SLING_START'; seed: number }
  | { type: 'SLING_PUCK_CROSSED'; id: number; x: number; y: number; vx: number; vy: number; color?: 'black' | 'red' }
  | { type: 'SLING_BAND_PULL'; isStretched: boolean; isDragging?: boolean; puckId?: number; x?: number; y?: number }
  | { type: 'SLING_PUCK_LAUNCH'; puckId: number; x: number; y: number; vx: number; vy: number; power: number }
  | { type: 'SLING_PUCK_SYNC'; pucks: Array<{ id: number; x: number; y: number; vx: number; vy: number; color?: 'black' | 'red' }>; myPuckCount: number; oppPuckCount: number }
  | { type: 'SLING_SYNC_PUCKS'; myPuckCount: number; oppPuckCount: number }
  | { type: 'SLING_VICTORY'; winner: 'player' | 'opponent' }
  | { type: 'GAME_OVER'; didWin: boolean }
  | { type: 'PLAYER_LEAVE' }
  | { type: 'REMATCH_REQUEST' }
  | { type: 'REMATCH_ACCEPT'; seed?: number }
  | { type: 'RTC_PING'; timestamp: number }
  | { type: 'RTC_PONG'; timestamp: number }
  | { type: 'PEER_VISIBILITY'; isVisible: boolean }
  | { type: 'FIT_ROUND_START'; seed: number; roundNumber: number }
  | { type: 'FIT_PIECE_PLACED'; pieceId: string; trayR: number; trayC: number }
  | { type: 'FIT_PIECE_REMOVED'; pieceId: string }
  | { type: 'FIT_ROUND_CLAIM'; roundNumber: number; timestamp: number }
  | { type: 'FIT_REQUEST_SEED' }
  | { type: 'FIT_REMATCH_REQUEST' }
  | { type: 'FIT_REMATCH_ACCEPT'; seed?: number }
  | { type: 'DASH_READY'; seed: number }
  | { type: 'DASH_REQUEST_SEED' }
  | { type: 'DASH_ACTION'; action: 'MOVE_LEFT' | 'MOVE_RIGHT' | 'JUMP' | 'SLIDE'; lane: any; distance: number; timestamp: number }
  | { type: 'DASH_SYNC'; distance: number; speed: number; lane: any; currentX: number; jumpY: number; isJumping: boolean; isSliding: boolean; hearts: number; invulnerable: boolean; stumbling: boolean; isTurbo: boolean; hasShield: boolean; heldItem: any; timestamp?: number }
  | { type: 'DASH_ITEM_DROP'; itemType: 'SODA_SPILL'; z: number; lane: any }
  | { type: 'DASH_GAME_OVER'; loserId: 'player' | 'opponent'; finalDistance: number }
  | { type: 'DASH_REMATCH'; seed: number }
  | { type: 'DASH_REMATCH_REQUEST' }
  | { type: 'DASH_REMATCH_ACCEPT'; seed?: number }
  | { type: 'DASH_EVENT'; title: string; message: string; icon: string }
  | { type: 'SHEEP_DEPLOY'; laneIndex: number; size: 'small' | 'medium' | 'big' | 'giant'; id: string; timestamp: number }
  | { type: 'SHEEP_REMATCH' }
  | { type: 'SHEEP_REMATCH_REQUEST' }
  | { type: 'SHEEP_REMATCH_ACCEPT' }
  | {
      type: 'SHEEP_SYNC';
      lanes: Array<{
        index: number;
        status: 'active' | 'won_player' | 'won_opponent' | 'draw';
        clashY: number | null;
        sheep: Array<{
          id: string;
          size: 'small' | 'medium' | 'big' | 'giant';
          side: 'player' | 'opponent';
          y: number;
        }>;
      }>;
      playerScore: number;
      opponentScore: number;
      isSuddenDeath: boolean;
      winner: 'player' | 'opponent' | 'draw' | null;
      timestamp: number;
    }
  | { type: 'WATER_INIT'; seed: number }
  | { type: 'WATER_REQUEST_SEED' }
  | { type: 'WATER_PROGRESS'; score: number; completedColors: string[]; isWon: boolean }
  | { type: 'WATER_REMATCH'; seed: number }
  | { type: 'WATER_REMATCH_REQUEST' }
  | { type: 'WATER_REMATCH_ACCEPT'; seed?: number }
  | { type: 'WATER_POUR_TUBE'; color: string; srcIndex: number; dstIndex: number }
  | { type: 'WATER_POUR_BOWL'; color: string; count: number; newBowlCount: number; isCompleted: boolean; score: number }
  | {
      type: 'DRIFT_SYNC';
      x: number;
      y: number;
      angle: number;
      speed: number;
      slipAngle: number;
      score: number;
      throttle: number;
      steer: number;
      handbrake: boolean;
      roundScore: number;
      faults: string[];
      finished?: boolean;
      phase?: string;
      roundNum?: number;
      timestamp?: number;
    }
  | { type: 'DRIFT_ROUND_READY'; roundNum: number }
  | { type: 'DRIFT_ROUND_END'; roundNum: number; score: number; timeElapsed: number; dq: boolean }
  | { type: 'DRIFT_REMATCH'; seed: number }
  | { type: 'CUSTOM'; payload: any };

export type NetworkQuality = 'good' | 'moderate' | 'poor' | 'stalled';

export interface NetworkHealth {
  rtt: number; // in milliseconds
  status: NetworkQuality;
  isPeerVisible: boolean;
}

export interface WebRTCEvents {
  onStatusChange?: (status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error', message?: string) => void;
  onRoomCreated?: (roomCode: string) => void;
  onMessage?: (msg: NetworkMessage) => void;
  onHealthChange?: (health: NetworkHealth) => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

export class WebRTCPeer {
  public signaling: SignalingClient;
  private peer: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private processedIceKeys = new Set<string>();
  public role: 'host' | 'guest' | null = null;
  public roomCode: string | null = null;
  public gameId: string | null = null;
  public gameVariant: string | null = null;
  public isConnected: boolean = false;
  public currentRtt: number = 0;
  public networkQuality: NetworkQuality = 'good';
  public isPeerVisible: boolean = true;
  private lastPingSentTime: number = 0;
  private lastPongReceivedTime: number = 0;
  private heartbeatInterval: number | null = null;
  private watchdogInterval: number | null = null;
  private boundVisibilityHandler: (() => void) | null = null;
  private boundHostUnloadHandler: (() => void) | null = null;
  private pollingInterval: number | null = null;
  private earlyMessageQueue: NetworkMessage[] = [];
  private _events: WebRTCEvents;

  public get events(): WebRTCEvents {
    return this._events;
  }

  public set events(newEvents: WebRTCEvents) {
    this._events = newEvents;
    if (newEvents && newEvents.onMessage) {
      this.flushEarlyMessages();
    }
  }

  constructor(events: WebRTCEvents = {}) {
    this._events = events;
    this.signaling = new SignalingClient();
  }

  public async hostRoom(gameId: string, gameVariant?: string): Promise<string> {
    this.cleanup();
    this.role = 'host';
    this.gameId = gameId;
    this.gameVariant = gameVariant || null;
    this.events.onStatusChange?.('connecting', 'Creating game room...');

    this.peer = new RTCPeerConnection(RTC_CONFIG);
    const localIceCandidates: RTCIceCandidateInit[] = [];

    // Create reliable DataChannel
    this.dataChannel = this.peer.createDataChannel('game-1v1', {
      ordered: true
    });
    this.setupDataChannel(this.dataChannel);

    this.peer.onicecandidate = (event) => {
      if (event.candidate) {
        if (this.roomCode) {
          this.signaling.sendIce(this.roomCode, 'host', event.candidate.toJSON());
        } else {
          localIceCandidates.push(event.candidate.toJSON());
        }
      }
    };

    this.peer.onconnectionstatechange = () => {
      const state = this.peer?.connectionState;
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.isConnected = false;
        this.events.onStatusChange?.('disconnected', 'Opponent disconnected.');
      }
    };

    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);

    // Wait brief 400ms for initial candidates
    await new Promise(r => setTimeout(r, 400));

    this.roomCode = await this.signaling.createRoom(gameId, this.peer.localDescription!, localIceCandidates, gameVariant);
    this.events.onRoomCreated?.(this.roomCode);
    this.events.onStatusChange?.('connecting', `Room code: ${this.roomCode}`);

    // Immediately expire room if host abruptly unloads / navigates away while waiting
    this.boundHostUnloadHandler = () => {
      if (this.roomCode && !this.isConnected) {
        this.signaling.expireRoom(this.roomCode);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.boundHostUnloadHandler);
      window.addEventListener('pagehide', this.boundHostUnloadHandler);
    }

    this.startHostPolling();
    return this.roomCode;
  }

  public async joinRoom(code: string): Promise<string> {
    this.cleanup();
    this.role = 'guest';
    this.roomCode = code.toUpperCase();
    this.events.onStatusChange?.('connecting', `Connecting to room ${this.roomCode}...`);

    this.peer = new RTCPeerConnection(RTC_CONFIG);
    const localIceCandidates: RTCIceCandidateInit[] = [];

    this.peer.onconnectionstatechange = () => {
      const state = this.peer?.connectionState;
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.isConnected = false;
        this.events.onStatusChange?.('disconnected', 'Opponent disconnected.');
      }
    };

    this.peer.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.setupDataChannel(this.dataChannel);
    };

    this.peer.onicecandidate = (event) => {
      if (event.candidate) {
        if (this.roomCode) {
          this.signaling.sendIce(this.roomCode, 'guest', event.candidate.toJSON());
        } else {
          localIceCandidates.push(event.candidate.toJSON());
        }
      }
    };

    const initialPoll = await this.signaling.pollRoom(this.roomCode, 'guest');
    if (!initialPoll.hostOffer) {
      throw new Error('Host offer not ready');
    }

    this.gameId = initialPoll.gameId || 'tetris';
    this.gameVariant = initialPoll.gameVariant || null;

    await this.peer.setRemoteDescription(new RTCSessionDescription(initialPoll.hostOffer));

    if (initialPoll.hostIce) {
      for (const ice of initialPoll.hostIce) {
        await this.peer.addIceCandidate(new RTCIceCandidate(ice)).catch(() => {});
      }
    }

    const answer = await this.peer.createAnswer();
    await this.peer.setLocalDescription(answer);

    await new Promise(r => setTimeout(r, 300));

    await this.signaling.joinRoom(this.roomCode, this.peer.localDescription!, localIceCandidates);

    this.startGuestPolling();
    return this.gameId;
  }

  private startHostPolling() {
    this.stopPolling();
    let hasAnswered = false;

    this.pollingInterval = window.setInterval(async () => {
      if (!this.roomCode || this.isConnected) {
        this.stopPolling();
        return;
      }

      try {
        const poll = await this.signaling.pollRoom(this.roomCode, 'host');

        if (poll.guestAnswer && !hasAnswered && this.peer) {
          hasAnswered = true;
          await this.peer.setRemoteDescription(new RTCSessionDescription(poll.guestAnswer));
        }

        if (poll.guestIce && this.peer) {
          for (const ice of poll.guestIce) {
            const key = ice.candidate || JSON.stringify(ice);
            if (!this.processedIceKeys.has(key)) {
              this.processedIceKeys.add(key);
              await this.peer.addIceCandidate(new RTCIceCandidate(ice)).catch(() => {});
            }
          }
        }
      } catch (e: any) {
        console.warn('Host polling error:', e);
      }
    }, 250);
  }

  private startGuestPolling() {
    this.stopPolling();
    this.pollingInterval = window.setInterval(async () => {
      if (!this.roomCode || this.isConnected) {
        this.stopPolling();
        return;
      }

      try {
        const poll = await this.signaling.pollRoom(this.roomCode, 'guest');
        if (poll.hostIce && this.peer) {
          for (const ice of poll.hostIce) {
            const key = ice.candidate || JSON.stringify(ice);
            if (!this.processedIceKeys.has(key)) {
              this.processedIceKeys.add(key);
              await this.peer.addIceCandidate(new RTCIceCandidate(ice)).catch(() => {});
            }
          }
        }
      } catch (e: any) {
        console.warn('Guest polling error:', e);
      }
    }, 250);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.lastPongReceivedTime = performance.now();

    // 1. Regular ping every 1500ms
    this.heartbeatInterval = window.setInterval(() => {
      if (!this.isConnected || !this.dataChannel || this.dataChannel.readyState !== 'open') return;
      this.lastPingSentTime = performance.now();
      this.sendMessage({ type: 'RTC_PING', timestamp: this.lastPingSentTime });
    }, 1500);

    // 2. Watchdog every 1000ms checking for connection stalling & timeout
    this.watchdogInterval = window.setInterval(() => {
      if (!this.isConnected) return;
      const elapsedSincePong = performance.now() - this.lastPongReceivedTime;

      if (elapsedSincePong > 8000) {
        // Heartbeat timeout: connection silently dropped
        console.warn('[WebRTC] Heartbeat timeout (>8s). Disconnecting.');
        this.isConnected = false;
        this.stopHeartbeat();
        this.events.onStatusChange?.('disconnected', 'Connection lost (timeout).');
      } else if (elapsedSincePong > 3500) {
        if (this.networkQuality !== 'stalled') {
          this.networkQuality = 'stalled';
          this.notifyHealth();
        }
      }
    }, 1000);

    // 3. Tab visibility listener
    this.boundVisibilityHandler = () => {
      const isVisible = typeof document !== 'undefined' ? !document.hidden : true;
      if (this.isConnected) {
        this.sendMessage({ type: 'PEER_VISIBILITY', isVisible });
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.boundVisibilityHandler);
      // Immediately notify peer of current visibility
      this.sendMessage({ type: 'PEER_VISIBILITY', isVisible: !document.hidden });
    }
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.watchdogInterval !== null) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
    if (this.boundVisibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
      this.boundVisibilityHandler = null;
    }
  }

  public notifyHealth() {
    this.events.onHealthChange?.({
      rtt: this.currentRtt,
      status: this.networkQuality,
      isPeerVisible: this.isPeerVisible
    });
  }

  private setupDataChannel(dc: RTCDataChannel) {
    const handleOpen = () => {
      this.isConnected = true;
      this.stopPolling();
      if (this.boundHostUnloadHandler && typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', this.boundHostUnloadHandler);
        window.removeEventListener('pagehide', this.boundHostUnloadHandler);
        this.boundHostUnloadHandler = null;
      }
      this.flushEarlyMessages();
      this.startHeartbeat();
      this.notifyHealth();
      this.events.onStatusChange?.('connected', 'Opponent connected! Match starting.');
    };

    if (dc.readyState === 'open') {
      handleOpen();
    } else {
      dc.onopen = handleOpen;
    }

    dc.onclose = () => {
      this.isConnected = false;
      this.stopHeartbeat();
      this.events.onStatusChange?.('disconnected', 'Opponent disconnected.');
    };

    dc.onerror = (e) => {
      console.error('DataChannel error:', e);
      this.events.onStatusChange?.('error', 'Network channel error.');
    };

    dc.onmessage = (event) => {
      try {
        const msg: NetworkMessage = JSON.parse(event.data);

        // Core heartbeat & ping/pong protocol handling
        if (msg.type === 'RTC_PING') {
          this.sendMessage({ type: 'RTC_PONG', timestamp: msg.timestamp });
          return;
        }
        if (msg.type === 'RTC_PONG') {
          const now = performance.now();
          const rtt = Math.max(1, Math.round(now - msg.timestamp));
          // Exponential moving average for smooth display
          this.currentRtt = this.currentRtt === 0 ? rtt : Math.round(this.currentRtt * 0.6 + rtt * 0.4);
          this.lastPongReceivedTime = now;

          if (this.currentRtt < 120) {
            this.networkQuality = 'good';
          } else if (this.currentRtt < 260) {
            this.networkQuality = 'moderate';
          } else {
            this.networkQuality = 'poor';
          }
          this.notifyHealth();
          return;
        }
        if (msg.type === 'PEER_VISIBILITY') {
          this.isPeerVisible = msg.isVisible;
          this.notifyHealth();
          return;
        }

        // Any game packet is also confirmation of peer liveness
        this.lastPongReceivedTime = performance.now();
        if (this.networkQuality === 'stalled') {
          this.networkQuality = this.currentRtt < 120 ? 'good' : (this.currentRtt < 260 ? 'moderate' : 'poor');
          this.notifyHealth();
        }

        if (this.events.onMessage) {
          this.events.onMessage(msg);
        } else {
          this.earlyMessageQueue.push(msg);
        }
      } catch (e) {
        console.error('Failed to parse network message:', e);
      }
    };
  }

  public flushEarlyMessages() {
    if (this.events?.onMessage && this.earlyMessageQueue.length > 0) {
      const queue = [...this.earlyMessageQueue];
      this.earlyMessageQueue = [];
      for (const msg of queue) {
        try {
          this.events.onMessage(msg);
        } catch (e) {
          console.error('Error handling queued early message:', e);
        }
      }
    }
  }

  public sendMessage(msg: NetworkMessage) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(msg));
    }
  }

  private stopPolling() {
    if (this.pollingInterval !== null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  public async closeRoom(): Promise<void> {
    const code = this.roomCode;
    const wasHostWaiting = this.role === 'host' && !this.isConnected;
    this.cleanup();
    if (code && wasHostWaiting) {
      await this.signaling.expireRoom(code);
    }
  }

  public cleanup() {
    this.stopPolling();
    this.stopHeartbeat();
    if (this.boundHostUnloadHandler && typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.boundHostUnloadHandler);
      window.removeEventListener('pagehide', this.boundHostUnloadHandler);
      this.boundHostUnloadHandler = null;
    }
    const codeToExpire = (this.role === 'host' && !this.isConnected && this.roomCode) ? this.roomCode : null;
    this.earlyMessageQueue = [];
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.peer) {
      this.peer.close();
      this.peer = null;
    }
    this.isConnected = false;
    this.roomCode = null;
    this.role = null;
    this.gameVariant = null;
    this.processedIceKeys.clear();
    this.currentRtt = 0;
    this.networkQuality = 'good';
    this.isPeerVisible = true;
    if (codeToExpire) {
      this.signaling.expireRoom(codeToExpire);
    }
  }
}
