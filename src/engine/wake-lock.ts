/**
 * Screen Wake Lock Manager
 * Prevents mobile and desktop screens from dimming, sleeping, or locking when idle during active gameplay.
 *
 * - Primary strategy: Screen Wake Lock API (`navigator.wakeLock.request('screen')`)
 * - Fallback strategy: Silent inline looping HTML5 video fallback (for legacy browsers / iOS Safari restrictions)
 * - Automatic re-acquisition: Re-claims wake lock on visibility restoration (tab switch, device unlock)
 * - Gesture retry: Re-attempts acquisition on the user's first touch/tap if browser requires user activation
 */

// Minimal valid silent H.264 MP4 video data URI (playsinline, muted, loop)
const FALLBACK_VIDEO_URI =
  'data:video/mp4;base64,AAAAHGZ0eXBtcDQyAAAAAW1wNDJpc29tYXZjMQAAAAhmcmVlAAAEbW1kYXQAAAHkAA' +
  'AAAAAAAABmAGQAAACnAAAA/wAAAAP8AAAABAAAAAQAAAAEAAAAfAAAAHwAAAB8AAAAfAAAAHgAAAByAAAA' +
  'ZAAAAEwAAAAwAAAADwAAAAPAAAA/wAAAAP8AAAABAAAAAQAAAAEAAAAfAAAAHwAAAB8AAAAfAAAAHgAAABy' +
  'AAAAZAAAAEwAAAAwAAAADwAAAAPAAAA/wAAAAP8AAAABAAAAAQAAAAEAAAAfAAAAHwAAAB8AAAAfAAAAHgA' +
  'AAByAAAAZAAAAEwAAAAwAAAADwAAAA==';

class ScreenWakeLockManager {
  private sentinel: any = null;
  private isWanted: boolean = false;
  private fallbackVideo: HTMLVideoElement | null = null;
  private isListeningVisibility: boolean = false;
  private isListeningGesture: boolean = false;
  private reacquireTimer: number | null = null;

  private boundVisibilityChange = this.handleVisibilityChange.bind(this);
  private boundUserGesture = this.handleUserGesture.bind(this);

  /**
   * Check whether the native Screen Wake Lock API is supported by the current browser.
   */
  public isNativeSupported(): boolean {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  }

  /**
   * Check whether a wake lock or active fallback is currently engaged.
   */
  public isLocked(): boolean {
    if (this.sentinel && !this.sentinel.released) return true;
    if (this.fallbackVideo && !this.fallbackVideo.paused) return true;
    return false;
  }

  /**
   * Request that the screen stay awake during gameplay.
   */
  public async request(): Promise<boolean> {
    this.isWanted = true;
    this.setupVisibilityListener();

    // If native sentinel is already active and valid, nothing to do
    if (this.sentinel && !this.sentinel.released) {
      return true;
    }

    const nativeSuccess = await this.acquireNative();
    if (nativeSuccess) {
      this.stopFallbackVideo();
      this.removeGestureListener();
      return true;
    }

    // If native lock failed (or is not supported), try fallback video and register gesture retry
    this.setupGestureListener();
    this.startFallbackVideo();
    return false;
  }

  /**
   * Release the wake lock and allow the screen to sleep normally.
   */
  public async release(): Promise<void> {
    this.isWanted = false;
    this.clearReacquireTimer();
    this.removeGestureListener();
    this.stopFallbackVideo();

    if (this.sentinel) {
      try {
        await this.sentinel.release();
      } catch {
        // Ignored
      } finally {
        this.sentinel = null;
      }
    }
  }

  private async acquireNative(): Promise<boolean> {
    if (!this.isNativeSupported()) return false;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return false;
    }

    try {
      const lock = await (navigator as any).wakeLock.request('screen');
      this.sentinel = lock;

      lock.addEventListener('release', () => {
        if (this.sentinel === lock) {
          this.sentinel = null;
        }
        // If still wanted and page is visible, attempt to re-acquire with slight debounce
        if (this.isWanted && typeof document !== 'undefined' && document.visibilityState === 'visible') {
          this.scheduleReacquire();
        }
      });

      return true;
    } catch {
      return false;
    }
  }

  private scheduleReacquire(): void {
    if (this.reacquireTimer !== null) return;
    this.reacquireTimer = window.setTimeout(() => {
      this.reacquireTimer = null;
      if (this.isWanted && !this.sentinel) {
        this.acquireNative().then((success) => {
          if (!success) {
            this.startFallbackVideo();
            this.setupGestureListener();
          } else {
            this.stopFallbackVideo();
          }
        });
      }
    }, 1000);
  }

  private clearReacquireTimer(): void {
    if (this.reacquireTimer !== null) {
      clearTimeout(this.reacquireTimer);
      this.reacquireTimer = null;
    }
  }

  private handleVisibilityChange(): void {
    if (typeof document === 'undefined') return;

    if (document.visibilityState === 'visible' && this.isWanted) {
      // Re-acquire lock when returning to the tab/app
      this.acquireNative().then((success) => {
        if (!success) {
          this.startFallbackVideo();
          this.setupGestureListener();
        } else {
          this.stopFallbackVideo();
        }
      });
    }
  }

  private handleUserGesture(): void {
    if (!this.isWanted) return;

    // Retry native acquisition on user touch / click
    this.acquireNative().then((success) => {
      if (success) {
        this.stopFallbackVideo();
        this.removeGestureListener();
      } else {
        // In case video play was blocked before user interaction, resume video
        this.startFallbackVideo();
      }
    });
  }

  private setupVisibilityListener(): void {
    if (this.isListeningVisibility || typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', this.boundVisibilityChange);
    this.isListeningVisibility = true;
  }

  private setupGestureListener(): void {
    if (this.isListeningGesture || typeof window === 'undefined') return;
    window.addEventListener('pointerdown', this.boundUserGesture, { passive: true });
    window.addEventListener('touchstart', this.boundUserGesture, { passive: true });
    this.isListeningGesture = true;
  }

  private removeGestureListener(): void {
    if (!this.isListeningGesture || typeof window === 'undefined') return;
    window.removeEventListener('pointerdown', this.boundUserGesture);
    window.removeEventListener('touchstart', this.boundUserGesture);
    this.isListeningGesture = false;
  }

  private startFallbackVideo(): void {
    if (typeof document === 'undefined' || !document.body) return;

    if (!this.fallbackVideo) {
      const video = document.createElement('video');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.muted = true;
      video.loop = true;
      video.src = FALLBACK_VIDEO_URI;
      video.style.position = 'fixed';
      video.style.left = '-9999px';
      video.style.top = '-9999px';
      video.style.width = '1px';
      video.style.height = '1px';
      video.style.opacity = '0.001';
      video.style.pointerEvents = 'none';
      video.style.zIndex = '-9999';

      document.body.appendChild(video);
      this.fallbackVideo = video;
    }

    this.fallbackVideo.play().catch(() => {
      // Autoplay with video may require first user gesture; handled by boundUserGesture
    });
  }

  private stopFallbackVideo(): void {
    if (this.fallbackVideo) {
      try {
        this.fallbackVideo.pause();
        if (this.fallbackVideo.parentNode) {
          this.fallbackVideo.parentNode.removeChild(this.fallbackVideo);
        }
      } catch {
        // Ignored
      }
      this.fallbackVideo = null;
    }
  }
}

export const wakeLock = new ScreenWakeLockManager();
