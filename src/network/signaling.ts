// Signaling client for Cloudflare Pages / Workers API

export interface RoomPollResponse {
  gameId?: string;
  gameVariant?: string;
  hostOffer?: RTCSessionDescriptionInit | null;
  hostIce?: RTCIceCandidateInit[];
  guestAnswer?: RTCSessionDescriptionInit | null;
  guestIce?: RTCIceCandidateInit[];
}

export class SignalingClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = window.location.origin;
  }

  public async createRoom(gameId: string, offer: RTCSessionDescriptionInit, ice: RTCIceCandidateInit[], gameVariant?: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/room/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, gameVariant, offer, ice })
    });

    if (!res.ok) {
      throw new Error(`Failed to create room: ${res.statusText}`);
    }

    const data = await res.json();
    return data.code;
  }

  public async joinRoom(code: string, answer: RTCSessionDescriptionInit, ice: RTCIceCandidateInit[]): Promise<{
    gameId: string;
    gameVariant?: string;
    hostOffer: RTCSessionDescriptionInit;
    hostIce: RTCIceCandidateInit[];
  }> {
    const res = await fetch(`${this.baseUrl}/api/room/${code}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer, ice })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to join room: ${res.statusText}`);
    }

    const data = await res.json();
    return {
      gameId: data.gameId || 'tetris',
      gameVariant: data.gameVariant,
      hostOffer: data.hostOffer,
      hostIce: data.hostIce || []
    };
  }

  public async sendIce(code: string, role: 'host' | 'guest', candidate: RTCIceCandidateInit): Promise<void> {
    await fetch(`${this.baseUrl}/api/room/${code}/ice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, candidate })
    }).catch(() => {});
  }

  public async pollRoom(code: string, role: 'host' | 'guest'): Promise<RoomPollResponse> {
    const res = await fetch(`${this.baseUrl}/api/room/${code}/poll?role=${role}`);
    if (!res.ok) {
      throw new Error('Room expired or invalid');
    }
    return await res.json();
  }

  public async expireRoom(code: string): Promise<void> {
    if (!code) return;
    const cleanCode = code.toUpperCase();
    const url = `${this.baseUrl}/api/room/${cleanCode}/expire`;
    try {
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(url);
      } else {
        await fetch(url, { method: 'POST', keepalive: true });
      }
    } catch {
      fetch(url, { method: 'POST' }).catch(() => {});
    }
  }

  public async getRoomInfo(code: string): Promise<{
    exists: boolean;
    isWaiting: boolean;
    expired?: boolean;
    gameId?: string;
    gameVariant?: string;
    error?: string;
  }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/room/${code.toUpperCase()}`);
      if (res.status === 410) {
        return { exists: false, isWaiting: false, expired: true };
      }
      if (!res.ok) return { exists: false, isWaiting: false };
      const data = await res.json();
      return {
        exists: !!data.exists,
        isWaiting: !!data.isWaiting,
        expired: !!data.expired,
        gameId: data.gameId,
        gameVariant: data.gameVariant
      };
    } catch {
      return { exists: false, isWaiting: false };
    }
  }
}
