// Signaling client for Cloudflare Pages / Workers API

export interface RoomPollResponse {
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

  public async createRoom(offer: RTCSessionDescriptionInit, ice: RTCIceCandidateInit[]): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/room/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offer, ice })
    });

    if (!res.ok) {
      throw new Error(`Failed to create room: ${res.statusText}`);
    }

    const data = await res.json();
    return data.code;
  }

  public async joinRoom(code: string, answer: RTCSessionDescriptionInit, ice: RTCIceCandidateInit[]): Promise<{
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

  public async checkRoom(code: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/room/${code}`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
