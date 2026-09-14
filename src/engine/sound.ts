// Web Audio API Synthesizer for 8-bit / Arcade Sound FX
// Zero external audio assets required - instant, reliable, zero latency!

class SoundManager {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private getContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public toggleMute(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  public playMove() {
    const ctx = this.getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }

  public playRotate() {
    const ctx = this.getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.06);

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  }

  public playHardDrop() {
    const ctx = this.getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  }

  public playHold() {
    const ctx = this.getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(420, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  }

  public playLineClear(lines: number) {
    const ctx = this.getContext();
    if (!ctx) return;

    if (lines >= 4) {
      // Tetris! Majestic synth chord
      this.playTetrisFanfare();
      return;
    }

    const freqs = [350, 440, 554, 659];
    const now = ctx.currentTime;
    for (let i = 0; i <= lines; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freqs[i % freqs.length], now + i * 0.06);

      gain.gain.setValueAtTime(0.15, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.15);
    }
  }

  public playTetrisFanfare() {
    const ctx = this.getContext();
    if (!ctx) return;

    const chords = [
      [523.25, 659.25, 783.99], // C Major
      [587.33, 739.99, 880.00], // D Major
      [659.25, 830.61, 987.77], // E Major
      [1046.50, 1318.51, 1567.98] // High C octave
    ];

    const now = ctx.currentTime;
    chords.forEach((chord, step) => {
      chord.forEach(freq => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + step * 0.08);

        gain.gain.setValueAtTime(0.08, now + step * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + step * 0.08 + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + step * 0.08);
        osc.stop(now + step * 0.08 + 0.25);
      });
    });
  }

  public playGarbageAlert() {
    const ctx = this.getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(440, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  }

  public playGameOver() {
    const ctx = this.getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(350, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.8);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  }

  public playWin() {
    const ctx = this.getContext();
    if (!ctx) return;
    const notes = [440, 554.37, 659.25, 880];
    const now = ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.12);

      gain.gain.setValueAtTime(0.18, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.3);
    });
  }

  public playCountdownTick(isFinal: boolean = false) {
    const ctx = this.getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isFinal ? 880 : 440, ctx.currentTime);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (isFinal ? 0.3 : 0.15));

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (isFinal ? 0.3 : 0.15));
  }

  public playDiceRoll() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const clickTime = now + i * 0.05 + (Math.random() * 0.02);
      const freq = 400 + Math.random() * 300;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, clickTime);
      osc.frequency.exponentialRampToValueAtTime(150, clickTime + 0.03);

      gain.gain.setValueAtTime(0.12, clickTime);
      gain.gain.exponentialRampToValueAtTime(0.001, clickTime + 0.03);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(clickTime);
      osc.stop(clickTime + 0.03);
    }
  }

  public playCueHit(power: number = 0.5) {
    const ctx = this.getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const vol = Math.min(0.25, Math.max(0.04, power * 0.22));

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.04);

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  public playBallHit(speedRatio: number = 0.5) {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = Math.min(0.28, Math.max(0.03, speedRatio * 0.25));

    // High resin clack
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400 + Math.random() * 200, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.025);

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.025);
  }

  public playCushionBounce(speedRatio: number = 0.5) {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vol = Math.min(0.18, Math.max(0.03, speedRatio * 0.16));

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.05);

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  public playPocketDrop() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.08);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playStep() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(360, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.045);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
  }

  public playLadderClimb() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = [330, 392, 523, 659, 784]; // E4, G4, C5, E5, G5
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const noteTime = now + idx * 0.06;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.14, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(noteTime);
      osc.stop(noteTime + 0.09);
    });
  }

  public playSnakeSlide() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(580, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.35);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  public playFanfare() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [
      { f: 523.25, t: 0.00, d: 0.12 }, // C5
      { f: 659.25, t: 0.13, d: 0.12 }, // E5
      { f: 783.99, t: 0.26, d: 0.15 }, // G5
      { f: 1046.5, t: 0.42, d: 0.40 }, // C6
    ];

    notes.forEach(n => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + n.t;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, startTime);

      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + n.d);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + n.d);
    });
  }

  public playSlingSnap(power: number = 0.5) {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    const startFreq = 220 + Math.min(1.0, power) * 200;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.09);

    const volume = 0.12 + Math.min(1.0, power) * 0.15;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  public playPuckClack(speed: number = 0.5) {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const freq = 450 + Math.random() * 120;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.04);

    const volume = Math.min(0.25, 0.05 + Math.min(1.0, speed) * 0.15);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  public playGatePass() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [
      { f: 659.25, t: 0.00, d: 0.08 }, // E5
      { f: 987.77, t: 0.07, d: 0.15 }, // B5
    ];

    notes.forEach(n => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + n.t;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.f, startTime);

      gain.gain.setValueAtTime(0.18, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + n.d);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + n.d);
    });
  }
}

export const sounds = new SoundManager();
