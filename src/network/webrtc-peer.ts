import { SignalingClient } from './signaling';

export type NetworkMessage =
  | { type: 'SYNC_BOARD'; grid: (string | null)[][]; score: number; pendingGarbage: number }
  | { type: 'GARBAGE_ATTACK'; lines: number }
  | { type: 'GAME_OVER'; didWin: boolean }
  | { type: 'REMATCH_REQUEST' }
  | { type: 'REMATCH_ACCEPT' }
  | { type: 'PING'; time: number }
  | { type: 'PONG'; time: number };

export interface WebRTCEvents {
  onStatusChange?: (status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error', message?: string) => void;
  onRoomCreated?: (roomCode: string) => void;
  onMessage?: (msg: NetworkMessage) => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

export class WebRTCPeer {
  private signaling: SignalingClient;
  private peer: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  public role: 'host' | 'guest' | null = null;
  public roomCode: string | null = null;
  public isConnected: boolean = false;
  private pollingInterval: number | null = null;
  private events: WebRTCEvents;

  constructor(events: WebRTCEvents = {}) {
    this.events = events;
    this.signaling = new SignalingClient();
  }

  public async hostRoom(): Promise<string> {
    this.cleanup();
    this.role = 'host';
    this.events.onStatusChange?.('connecting', 'Generating room offer...');

    this.peer = new RTCPeerConnection(RTC_CONFIG);
    const localIceCandidates: RTCIceCandidateInit[] = [];

    // Create reliable DataChannel
    this.dataChannel = this.peer.createDataChannel('tetris-1v1', {
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

    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);

    // Wait a brief 400ms to gather local host ICE candidates before posting offer
    await new Promise(r => setTimeout(r, 400));

    this.roomCode = await this.signaling.createRoom(this.peer.localDescription!, localIceCandidates);
    this.events.onRoomCreated?.(this.roomCode);
    this.events.onStatusChange?.('connecting', `Waiting for opponent to join room: ${this.roomCode}`);

    // Poll for guest response
    this.startHostPolling();
    return this.roomCode;
  }

  public async joinRoom(code: string): Promise<void> {
    this.cleanup();
    this.role = 'guest';
    this.roomCode = code.toUpperCase();
    this.events.onStatusChange?.('connecting', `Connecting to room ${this.roomCode}...`);

    this.peer = new RTCPeerConnection(RTC_CONFIG);
    const localIceCandidates: RTCIceCandidateInit[] = [];

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

    // First fetch host's offer from poll
    const initialPoll = await this.signaling.pollRoom(this.roomCode, 'guest');
    if (!initialPoll.hostOffer) {
      throw new Error('Host offer not ready');
    }

    await this.peer.setRemoteDescription(new RTCSessionDescription(initialPoll.hostOffer));

    // Add any existing host ICE candidates
    if (initialPoll.hostIce) {
      for (const ice of initialPoll.hostIce) {
        await this.peer.addIceCandidate(new RTCIceCandidate(ice)).catch(() => {});
      }
    }

    // Create answer
    const answer = await this.peer.createAnswer();
    await this.peer.setLocalDescription(answer);

    // Wait a brief 300ms to gather candidates
    await new Promise(r => setTimeout(r, 300));

    // Send answer to host
    await this.signaling.joinRoom(this.roomCode, this.peer.localDescription!, localIceCandidates);

    // Guest polls for any additional host ICE candidates until connected
    this.startGuestPolling();
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
            await this.peer.addIceCandidate(new RTCIceCandidate(ice)).catch(() => {});
          }
        }
      } catch (e: any) {
        console.warn('Host polling error:', e);
      }
    }, 1000);
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
            await this.peer.addIceCandidate(new RTCIceCandidate(ice)).catch(() => {});
          }
        }
      } catch (e: any) {
        console.warn('Guest polling error:', e);
      }
    }, 1000);
  }

  private setupDataChannel(dc: RTCDataChannel) {
    dc.onopen = () => {
      this.isConnected = true;
      this.stopPolling();
      this.events.onStatusChange?.('connected', 'Opponent connected! Match starting.');
    };

    dc.onclose = () => {
      this.isConnected = false;
      this.events.onStatusChange?.('disconnected', 'Opponent disconnected.');
    };

    dc.onerror = (e) => {
      console.error('DataChannel error:', e);
      this.events.onStatusChange?.('error', 'Network channel error.');
    };

    dc.onmessage = (event) => {
      try {
        const msg: NetworkMessage = JSON.parse(event.data);
        this.events.onMessage?.(msg);
      } catch (e) {
        console.error('Failed to parse network message:', e);
      }
    };
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

  public cleanup() {
    this.stopPolling();
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
  }
}
