import type { WebRTCPeer } from '../network/webrtc-peer';

export type AIDifficulty = 'easy' | 'medium' | 'hard' | 'extreme';
export type AppTheme = 'dark' | 'light';

export interface GameSession {
  gameId: string;
  mode: 'ai' | 'online';
  aiDifficulty?: AIDifficulty;
  peer?: WebRTCPeer;
  theme: AppTheme;
  onExit: () => void;
}

export interface GameInstance {
  destroy(): void;
  setTheme(theme: AppTheme): void;
}

export interface GameDefinition {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  genre: string;
  badge: string;
  bannerGradient: string;
  accentColor: string;
  iconSvg: string;
  supportsAI: boolean;
  isComingSoon?: boolean;
  create(container: HTMLElement, session: GameSession): GameInstance;
}
