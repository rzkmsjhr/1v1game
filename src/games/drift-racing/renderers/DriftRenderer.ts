import type {
  VehiclePhysicsState,
  VehicleRole,
  RunScoreBreakdown,
  CarModelType,
  RoundState
} from '../drift-types';
import { DriftTrack } from '../drift-track';
import { DRIFT_CONSTANTS } from '../drift-constants';

interface SmokeParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  decay: number;
}

export class DriftRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private track: DriftTrack;

  // Camera State (Car-Centric Top-Down Rotating View)
  private camX: number = 800;
  private camY: number = 500;
  private camAngle: number = 0;
  private camZoom: number = 1.0;

  // Screen & Viewport Scaling (DPI-proof)
  private dpr: number = 1;
  private cssWidth: number = 960;
  private cssHeight: number = 640;

  // Offscreen Pre-rendered Track Cache
  private trackCanvas: HTMLCanvasElement | null = null;
  private trackCanvasTheme: 'day' | 'night' | null = null;

  // Offscreen Skidmarks Canvas (drawn once upon tire slide, zero per-frame circle redraws!)
  private skidmarkCanvas: HTMLCanvasElement;
  private skidmarkCtx: CanvasRenderingContext2D;
  private readonly TRACK_ORIGIN_X = 200; // offsets MIN_X: -200
  private readonly TRACK_ORIGIN_Y = 200; // offsets MIN_Y: -200
  private readonly TRACK_CANVAS_W = 2000;
  private readonly TRACK_CANVAS_H = 1600;

  // Dynamic Smoke Particles
  private smokeParticles: SmokeParticle[] = [];

  constructor(canvas: HTMLCanvasElement, track: DriftTrack) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.track = track;

    this.skidmarkCanvas = document.createElement('canvas');
    this.skidmarkCanvas.width = this.TRACK_CANVAS_W;
    this.skidmarkCanvas.height = this.TRACK_CANVAS_H;
    this.skidmarkCtx = this.skidmarkCanvas.getContext('2d')!;
  }

  public isMobileDevice(): boolean {
    const minDim = Math.min(this.cssWidth, this.cssHeight);
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    return minDim < 600 || (hasTouch && minDim < 768);
  }

  public snapCamera(playerState: VehiclePhysicsState) {
    this.camX = playerState.x;
    this.camY = playerState.y;
    this.camAngle = playerState.angle;
    this.camZoom = 1.0;
  }

  public resize(width: number, height: number) {
    this.cssWidth = width;
    this.cssHeight = height;
    const isMobile = this.isMobileDevice();
    const rawDpr = window.devicePixelRatio || 1;
    // On mobile, cap DPR to 1.0 to avoid filling millions of pixels on Retina/OLED phones
    // On desktop, allow up to 1.5
    this.dpr = isMobile ? 1.0 : Math.min(rawDpr, 1.5);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  public clearSkidmarks() {
    this.skidmarkCtx.clearRect(0, 0, this.TRACK_CANVAS_W, this.TRACK_CANVAS_H);
    this.smokeParticles = [];
  }

  /**
   * Pre-renders the static Figure-8 track, borders, curbs, checkered line, and green zones
   * onto an offscreen canvas once. This eliminates hundreds of expensive stroke & fill calls per frame!
   */
  private buildTrackCanvas(isDay: boolean) {
    if (!this.trackCanvas) {
      this.trackCanvas = document.createElement('canvas');
      this.trackCanvas.width = this.TRACK_CANVAS_W;
      this.trackCanvas.height = this.TRACK_CANVAS_H;
    }
    const tCtx = this.trackCanvas.getContext('2d')!;
    tCtx.clearRect(0, 0, this.TRACK_CANVAS_W, this.TRACK_CANVAS_H);

    tCtx.save();
    // Offset world coordinates
    tCtx.translate(this.TRACK_ORIGIN_X, this.TRACK_ORIGIN_Y);

    // 1. Render Track Surface, Curbs, and Green Clipping Zones
    this.renderTrack(tCtx, isDay);

    // 2. Render Checkered Start / Finish Line & Starting Grids
    this.renderCheckeredStartFinish(tCtx);

    tCtx.restore();
    this.trackCanvasTheme = isDay ? 'day' : 'night';
  }

  /**
   * Main Render Pipeline
   */
  public render(
    playerState: VehiclePhysicsState,
    playerScore: RunScoreBreakdown,
    playerModel: CarModelType,
    enemyState: VehiclePhysicsState,
    enemyScore: RunScoreBreakdown,
    enemyModel: CarModelType,
    roundState: RoundState,
    isDay: boolean = true,
    playerRoofNum: number = 86,
    enemyRoofNum: number = 15
  ) {
    const ctx = this.ctx;
    const viewW = this.cssWidth;
    const viewH = this.cssHeight;

    // Pre-render static track to offscreen canvas if theme changed or not built
    const themeKey = isDay ? 'day' : 'night';
    if (this.trackCanvasTheme !== themeKey) {
      this.buildTrackCanvas(isDay);
    }

    // Reset and apply DPR scale so all drawing coordinates use CSS pixels consistently!
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // 1. Update Camera to Follow Player Car (Car-Centric Top-Down View)
    this.updateCamera(playerState);

    // 2. Clear Screen
    ctx.clearRect(0, 0, viewW, viewH);

    // Fill background off-track grass/run-off
    ctx.fillStyle = isDay ? '#94a3b8' : '#020617';
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.save();

    // Camera Transform:
    // Position car in lower-center of viewport (50% horizontal, 68% vertical) so road stretches ahead
    ctx.translate(viewW * 0.5, viewH * 0.68);
    // Rotate world inversely so car always points straight UP on screen, while circuit flows & rotates!
    ctx.rotate(-this.camAngle);
    ctx.scale(this.camZoom, this.camZoom);
    ctx.translate(-this.camX, -this.camY);

    // 3. Render Pre-rendered Track (1 single drawImage call!)
    ctx.drawImage(this.trackCanvas!, -this.TRACK_ORIGIN_X, -this.TRACK_ORIGIN_Y);

    // 4. Render Skidmarks (1 single drawImage call!)
    ctx.drawImage(this.skidmarkCanvas, -this.TRACK_ORIGIN_X, -this.TRACK_ORIGIN_Y);

    // 5. Emit & Render Dynamic Rear Tire Smoke
    this.emitSmoke(playerState, isDay);
    this.emitSmoke(enemyState, isDay);
    this.renderSmoke(ctx, isDay);

    // 6. Render Tether Line between Lead & Chase
    this.renderTandemTether(ctx, playerState, enemyState, roundState.playerRole);

    // 7. Render OEM Vehicles
    // Render Enemy Car
    this.renderOEMCar(ctx, enemyModel, enemyState, {
      roofNumber: enemyRoofNum,
      colorTheme: (enemyModel === 's15' ? '#1e3a8a' : '#ef4444'),
      isBraking: enemyState.brake,
      headlights: !isDay,
      isLightMode: isDay
    });

    // Render Player Car
    this.renderOEMCar(ctx, playerModel, playerState, {
      roofNumber: playerRoofNum,
      colorTheme: (playerModel === 'ae86' ? 'panda' : '#06b6d4'),
      isBraking: playerState.brake,
      headlights: !isDay,
      isLightMode: isDay
    });

    ctx.restore();

    // 9. Render On-Screen Live HUD
    this.renderHUD(ctx, viewW, viewH, playerState, playerScore, enemyState, enemyScore, roundState);
  }

  /**
   * Smoothly tracks player car position, heading angle, and dynamic zoom
   */
  private updateCamera(playerState: VehiclePhysicsState) {
    // 1. Position tracking (smooth lerp towards player position)
    this.camX += (playerState.x - this.camX) * 0.16;
    this.camY += (playerState.y - this.camY) * 0.16;

    // 2. Heading / Trajectory rotation tracking
    // Blend travel direction (velocity vector) with car heading for cinematic, steady drift camera!
    let targetAngle = playerState.angle;
    if (playerState.speed > 0.8) {
      const velAngle = Math.atan2(playerState.vx, -playerState.vy);
      let velDiff = velAngle - playerState.angle;
      while (velDiff > Math.PI) velDiff -= Math.PI * 2;
      while (velDiff < -Math.PI) velDiff += Math.PI * 2;
      // 65% follows track travel direction, 35% follows car nose
      targetAngle = playerState.angle + velDiff * 0.65;
    }

    let diff = targetAngle - this.camAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.camAngle += diff * 0.085; // Silky smooth, stable chase camera rotation!

    // 3. Dynamic speed-based zoom
    const targetZoom = 1.06 - Math.min(0.18, (playerState.speed / DRIFT_CONSTANTS.MAX_SPEED) * 0.16);
    this.camZoom += (targetZoom - this.camZoom) * 0.08;
  }

  /**
   * Renders the complete Figure-8 Track
   */
  private renderTrack(ctx: CanvasRenderingContext2D, isDay: boolean) {
    const pts = this.track.waypoints;

    // A. Main Asphalt Ribbon
    ctx.save();
    ctx.fillStyle = isDay ? '#cbd5e1' : '#0f172a';
    ctx.strokeStyle = isDay ? '#64748b' : '#1e293b';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Outer track surface
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const wp = pts[i];
      if (i === 0) ctx.moveTo(wp.x, wp.y);
      else ctx.lineTo(wp.x, wp.y);
    }
    ctx.closePath();
    ctx.lineWidth = DRIFT_CONSTANTS.TRACK_WIDTH + 8;
    ctx.stroke(); // Base border
    ctx.lineWidth = DRIFT_CONSTANTS.TRACK_WIDTH;
    ctx.strokeStyle = isDay ? '#e2e8f0' : '#1e293b';
    ctx.stroke(); // Asphalt fill
    ctx.restore();

    // B. High-Visibility Green Drift Clipping Zones
    for (const zone of this.track.clippingZones) {
      ctx.save();
      ctx.fillStyle = isDay ? 'rgba(16, 185, 129, 0.42)' : 'rgba(16, 185, 129, 0.55)';
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.5;

      ctx.beginPath();
      for (let i = 0; i < zone.polygon.length; i++) {
        const pt = zone.polygon[i];
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Outer Glowing Guide Line (skip glow on mobile — shadowBlur is expensive)
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 3.5;
      if (this.cssWidth >= 600) {
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 12;
      }
      ctx.beginPath();
      for (let i = 0; i < zone.outerEdge.length; i++) {
        const pt = zone.outerEdge[i];
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();

      // Zone Label
      if (zone.outerEdge.length > 0) {
        const midPt = zone.outerEdge[Math.floor(zone.outerEdge.length / 2)];
        ctx.save();
        ctx.font = '900 11px sans-serif';
        ctx.fillStyle = '#065f46';
        ctx.textAlign = 'center';
        ctx.fillText(zone.name.toUpperCase(), midPt.x, midPt.y - 8);
        ctx.restore();
      }

      ctx.restore();
    }

    // C. Red & White Striped Outer & Inner Curbs
    this.renderCurbs(ctx, this.track.outerWalls, isDay);
    this.renderCurbs(ctx, this.track.innerWalls, isDay);

  }

  private renderCurbs(ctx: CanvasRenderingContext2D, walls: any[], _isDay: boolean) {
    ctx.save();
    ctx.lineWidth = 5;

    // Red curbs in a single batched stroke
    ctx.strokeStyle = '#ef4444';
    ctx.beginPath();
    for (let i = 0; i < walls.length; i += 2) {
      if (i % 4 === 0) {
        ctx.moveTo(walls[i].p1.x, walls[i].p1.y);
        ctx.lineTo(walls[i].p2.x, walls[i].p2.y);
      }
    }
    ctx.stroke();

    // White curbs in a single batched stroke
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 0; i < walls.length; i += 2) {
      if (i % 4 !== 0) {
        ctx.moveTo(walls[i].p1.x, walls[i].p1.y);
        ctx.lineTo(walls[i].p2.x, walls[i].p2.y);
      }
    }
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Renders 2-row alternating black-and-white checkered Start/Finish line
   * and clearly marked starting grid boxes [ 1 ] and [ 2 ]
   */
  private renderCheckeredStartFinish(ctx: CanvasRenderingContext2D) {
    const line = this.track.startLine;
    const p1 = line.p1;
    const p2 = line.p2;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;

    // Heading vector along track
    const fwdX = Math.sin(line.angle);
    const fwdY = -Math.cos(line.angle);

    const cols = 8;
    const rows = 2;
    const rowH = 12;

    ctx.save();
    // 1. Alternating Checkered Flag Line across Track
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isWhite = (r + c) % 2 === 0;
        ctx.fillStyle = isWhite ? '#f8fafc' : '#0f172a';

        const t1 = c / cols;
        const t2 = (c + 1) / cols;

        const aX = p1.x + dx * t1 + fwdX * (r * rowH - rowH);
        const aY = p1.y + dy * t1 + fwdY * (r * rowH - rowH);

        const bX = p1.x + dx * t2 + fwdX * (r * rowH - rowH);
        const bY = p1.y + dy * t2 + fwdY * (r * rowH - rowH);

        const cX = p1.x + dx * t2 + fwdX * ((r + 1) * rowH - rowH);
        const cY = p1.y + dy * t2 + fwdY * ((r + 1) * rowH - rowH);

        const dX = p1.x + dx * t1 + fwdX * ((r + 1) * rowH - rowH);
        const dY = p1.y + dy * t1 + fwdY * ((r + 1) * rowH - rowH);

        ctx.beginPath();
        ctx.moveTo(aX, aY);
        ctx.lineTo(bX, bY);
        ctx.lineTo(cX, cY);
        ctx.lineTo(dX, dY);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Checkered line outline borders
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(p1.x - fwdX * rowH, p1.y - fwdY * rowH);
    ctx.lineTo(p2.x - fwdX * rowH, p2.y - fwdY * rowH);
    ctx.moveTo(p1.x + fwdX * rowH, p1.y + fwdY * rowH);
    ctx.lineTo(p2.x + fwdX * rowH, p2.y + fwdY * rowH);
    ctx.stroke();

    // START / FINISH asphalt lettering
    ctx.save();
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    ctx.translate(midX, midY);
    ctx.rotate(line.angle);
    ctx.font = '900 13px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FINISH  🏁  START', 0, -20);
    ctx.restore();

    // 2. Painted Grid Slots on Asphalt
    this.renderGridSlotBox(ctx, this.track.gridSlot1, '1  LEAD', '#38bdf8');
    this.renderGridSlotBox(ctx, this.track.gridSlot2, '2  CHASE', '#f43f5e');

    ctx.restore();
  }

  private renderGridSlotBox(
    ctx: CanvasRenderingContext2D,
    slot: { x: number; y: number; angle: number },
    label: string,
    accentColor: string
  ) {
    ctx.save();
    ctx.translate(slot.x, slot.y);
    ctx.rotate(slot.angle);

    // Box perimeter outline
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(-18, -34, 36, 68);

    // Front limit bar
    ctx.fillStyle = accentColor;
    ctx.fillRect(-18, -36, 36, 4);

    // Grid Slot Label
    ctx.font = '900 9px monospace';
    ctx.fillStyle = accentColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0);

    ctx.restore();
  }

  /**
   * Renders door-to-door proximity tether line between Lead and Chase
   */
  private renderTandemTether(ctx: CanvasRenderingContext2D, p1: VehiclePhysicsState, p2: VehiclePhysicsState, playerRole: VehicleRole) {
    const lead = (playerRole === 'lead' ? p1 : p2);
    const chase = (playerRole === 'chase' ? p1 : p2);

    const dist = Math.hypot(lead.x - chase.x, lead.y - chase.y);
    if (dist > DRIFT_CONSTANTS.PROXIMITY_OUT_OF_RANGE) return;

    ctx.save();
    let tetherColor = 'rgba(16, 185, 129, 0.6)'; // Green = Door-to-Door
    if (dist > DRIFT_CONSTANTS.PROXIMITY_POCKET) {
      tetherColor = 'rgba(245, 158, 11, 0.5)'; // Amber = Trailing
    }

    ctx.strokeStyle = tetherColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(lead.x, lead.y);
    ctx.lineTo(chase.x, chase.y);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Emits dynamic rear tire smoke and stamps skidmarks directly onto the offscreen skidmark canvas
   */
  private emitSmoke(car: VehiclePhysicsState, isDay: boolean) {
    const isMobile = this.isMobileDevice();

    // Stamp Skidmarks onto Offscreen Skidmark Canvas (instant 0-overhead stamp!)
    if (car.driftSlipAngle > DRIFT_CONSTANTS.DRIFT_INIT_ANGLE_DEG && car.speed > 0.32) {
      this.skidmarkCtx.fillStyle = isDay ? 'rgba(30, 41, 59, 0.15)' : 'rgba(2, 6, 23, 0.30)';
      this.skidmarkCtx.beginPath();
      this.skidmarkCtx.arc(car.tires[2].x + this.TRACK_ORIGIN_X, car.tires[2].y + this.TRACK_ORIGIN_Y, 2.5, 0, Math.PI * 2);
      if (!isMobile) {
        this.skidmarkCtx.arc(car.tires[3].x + this.TRACK_ORIGIN_X, car.tires[3].y + this.TRACK_ORIGIN_Y, 2.5, 0, Math.PI * 2);
      }
      this.skidmarkCtx.fill();
    }

    // Smoke Generation (billows with throttle commitment & drift angle)
    const isDrifting = (car.driftSlipAngle >= DRIFT_CONSTANTS.DRIFT_INIT_ANGLE_DEG);
    const hasThrottle = (car.throttle > 0.08);

    if (isDrifting && car.speed > 0.30 && hasThrottle) {
      const intensity = (car.driftSlipAngle / 35) + (car.throttle * 1.6);
      const maxSpawn = isMobile ? 1 : 4;
      const spawnCount = Math.min(maxSpawn, Math.ceil(intensity));

      for (let i = 0; i < spawnCount; i++) {
        const isLeft = (Math.random() > 0.5);
        const px = isLeft ? car.tires[2].x : car.tires[3].x;
        const py = isLeft ? car.tires[2].y : car.tires[3].y;

        this.smokeParticles.push({
          x: px + (Math.random() - 0.5) * 6,
          y: py + (Math.random() - 0.5) * 6,
          vx: -car.vx * 0.15 + (Math.random() - 0.5) * 0.9,
          vy: -car.vy * 0.15 + (Math.random() - 0.5) * 0.9,
          size: 4.5 + Math.random() * 5,
          alpha: 0.70,
          decay: isMobile ? 0.030 + Math.random() * 0.015 : 0.014 + Math.random() * 0.008
        });
      }
    }

    // Hard cap total smoke particles
    const smokeCap = isMobile ? 25 : 75;
    if (this.smokeParticles.length > smokeCap) {
      this.smokeParticles.splice(0, this.smokeParticles.length - smokeCap);
    }
  }

  private renderSmoke(ctx: CanvasRenderingContext2D, isDay: boolean) {
    if (this.smokeParticles.length === 0) return;
    ctx.save();
    for (let i = 0; i < this.smokeParticles.length; i++) {
      const p = this.smokeParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.size += 0.35;
      p.alpha -= p.decay;

      if (p.alpha > 0) {
        ctx.fillStyle = isDay 
          ? `rgba(241, 245, 249, ${Math.max(0, p.alpha * 0.8).toFixed(2)})` 
          : `rgba(203, 213, 225, ${Math.max(0, p.alpha * 0.65).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    this.smokeParticles = this.smokeParticles.filter(p => p.alpha > 0);
    ctx.restore();
  }

  /**
   * Procedural Authentic OEM Car Renderer
   * With Specular Outline for High Contrast on Dark/Black Paints!
   */
  private renderOEMCar(
    ctx: CanvasRenderingContext2D,
    carType: CarModelType,
    state: VehiclePhysicsState,
    options: {
      roofNumber: number;
      colorTheme: string;
      isBraking: boolean;
      headlights: boolean;
      isLightMode: boolean;
    }
  ) {
    const { roofNumber, colorTheme, isBraking, headlights, isLightMode } = options;

    ctx.save();
    ctx.translate(state.x, state.y);
    ctx.rotate(state.angle);

    // Ground Shadow (simple fill, no blur filter — blur murders mobile perf)
    ctx.save();
    ctx.fillStyle = isLightMode ? 'rgba(15, 23, 42, 0.30)' : 'rgba(0, 0, 0, 0.50)';
    ctx.beginPath();
    ctx.roundRect(-16, -34, 32, 68, 7);
    ctx.fill();
    ctx.restore();

    // Headlight Beams (for Night mode — skip on mobile, gradient is expensive)
    if (headlights && this.cssWidth >= 600) {
      ctx.save();
      const grad = ctx.createRadialGradient(0, -30, 8, 0, -85, 75);
      grad.addColorStop(0, 'rgba(254, 240, 138, 0.28)');
      grad.addColorStop(1, 'rgba(254, 240, 138, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-10, -28);
      ctx.lineTo(-32, -95);
      ctx.lineTo(32, -95);
      ctx.lineTo(10, -28);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Render 4 Tires (Tucked inside, articulate on steering)
    const tireW = 5.5;
    const tireL = 14;
    const frontY = (carType === 'ae86' ? -18.5 : -20.5);
    const rearY = (carType === 'ae86' ? 18.5 : 20.5);
    const halfTrack = (carType === 'ae86' ? 10.8 : 11.4);

    const drawTire = (tx: number, ty: number, steer: number) => {
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(steer);
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.roundRect(-tireW / 2, -tireL / 2, tireW, tireL, 2);
      ctx.fill();
      ctx.stroke();

      // Rolling tread animation (skip on mobile — clip+stroke per tire is expensive)
      if (this.cssWidth >= 600) {
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1;
        const offset = (state.wheelSpinAngle % 4);
        for (let py = -tireL / 2 - 4 + offset; py <= tireL / 2 + 4; py += 4) {
          ctx.beginPath();
          ctx.moveTo(-tireW / 2, py);
          ctx.lineTo(tireW / 2, py);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
    };

    drawTire(-halfTrack, rearY, 0);
    drawTire(halfTrack, rearY, 0);
    drawTire(-halfTrack, frontY, state.steerAngle);
    drawTire(halfTrack, frontY, state.steerAngle);

    // Chassis Suspension & Weight Transfer (Body Roll & Dive/Squat)
    // Under lateral G, chassis rolls & shifts laterally over the tires; under accel/brake, it squats/dives
    const rollOffset = -(state.bodyRoll || 0) * 26;
    const pitchOffset = -(state.bodyPitch || 0) * 22;
    const rollAngle = -(state.bodyRoll || 0) * 0.42;

    ctx.save();
    ctx.translate(rollOffset, pitchOffset);
    ctx.rotate(rollAngle);

    // Bodywork
    if (carType === 'ae86') {
      // TOYOTA AE86 TRUENO
      const isPanda = (colorTheme === 'panda');
      const mainPaint = (isPanda ? '#f8fafc' : colorTheme);
      const isDarkPaint = (mainPaint === '#0f172a' || mainPaint === '#18181b');

      ctx.save();
      // Lower Rocker / Bumper Band
      ctx.fillStyle = isPanda ? '#18181b' : mainPaint;
      ctx.strokeStyle = isDarkPaint ? 'rgba(148, 163, 184, 0.7)' : '#090d16';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.roundRect(-12.5, -31.5, 25, 63, 3);
      ctx.fill();
      ctx.stroke();

      // Upper Paint Body
      ctx.fillStyle = mainPaint;
      ctx.beginPath();
      ctx.rect(-11.7, -28.5, 23.4, 56.5);
      ctx.fill();

      // Specular Highlight Edge on Dark Paints
      if (isDarkPaint) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-11.5, -27); ctx.lineTo(-11.5, 27);
        ctx.moveTo(11.5, -27); ctx.lineTo(11.5, 27);
        ctx.stroke();
      }

      // Black Side Rub Strip
      ctx.fillStyle = isDarkPaint ? '#020617' : '#18181b';
      ctx.fillRect(-12.7, -26, 1.2, 53);
      ctx.fillRect(11.5, -26, 1.2, 53);

      // Pop-up Light Covers
      ctx.strokeStyle = isDarkPaint ? 'rgba(148, 163, 184, 0.6)' : '#475569';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(-9.5, -27.5, 7, 5.5);
      ctx.strokeRect(2.5, -27.5, 7, 5.5);

      // Glass Canopy
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(-9.5, -7); ctx.lineTo(9.5, -7);
      ctx.lineTo(8.5, 2); ctx.lineTo(-8.5, 2);
      ctx.closePath();
      ctx.fill();

      // Roof & Number Decal
      ctx.fillStyle = mainPaint;
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 0.8;
      ctx.fillRect(-8.5, 2, 17, 13);
      ctx.strokeRect(-8.5, 2, 17, 13);

      ctx.save();
      ctx.fillStyle = isPanda ? '#090d16' : '#ffffff';
      ctx.font = '900 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(roofNumber.toString(), 0, 8.5);
      ctx.restore();

      // Hatch Rear Glass
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(-8.5, 15); ctx.lineTo(8.5, 15);
      ctx.lineTo(7.5, 24); ctx.lineTo(-7.5, 24);
      ctx.closePath();
      ctx.fill();

      // Taillights
      ctx.save();
      ctx.fillStyle = isBraking ? '#ff1111' : '#dc2626';
      ctx.fillRect(-10, 28, 7.5, 2.5);
      ctx.fillRect(2.5, 28, 7.5, 2.5);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(-10, 28, 2.5, 2.5);
      ctx.fillRect(7.5, 28, 2.5, 2.5);
      ctx.restore();

      ctx.restore();

    } else {
      // NISSAN SILVIA S15 SPEC-R
      const mainPaint = (colorTheme === 'panda' ? '#1e3a8a' : colorTheme);
      const isDarkPaint = (mainPaint === '#0f172a' || mainPaint === '#18181b');

      ctx.save();
      ctx.fillStyle = mainPaint;
      ctx.strokeStyle = isDarkPaint ? 'rgba(148, 163, 184, 0.7)' : '#090d16';
      ctx.lineWidth = 1.0;

      // Slender S15 body contour
      ctx.beginPath();
      ctx.moveTo(0, -35);
      ctx.bezierCurveTo(6, -35, 11, -31, 12, -23);
      ctx.bezierCurveTo(11.2, -8, 11.2, 8, 12.8, 18);
      ctx.bezierCurveTo(13.0, 24, 11.5, 31, 8.5, 33.5);
      ctx.lineTo(-8.5, 33.5);
      ctx.bezierCurveTo(-11.5, 31, -13.0, 24, -12.8, 18);
      ctx.bezierCurveTo(-11.2, 8, -11.2, -8, -12, -23);
      ctx.bezierCurveTo(-11, -31, -6, -35, 0, -35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Specular Highlight Edge on Dark Paints
      if (isDarkPaint) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-11.5, -22); ctx.lineTo(-11.0, 18);
        ctx.moveTo(11.5, -22); ctx.lineTo(11.0, 18);
        ctx.stroke();
      }

      // Cat-Eye Headlights
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-11.5, -29); ctx.lineTo(-5.5, -31); ctx.lineTo(-6.5, -26); ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(11.5, -29); ctx.lineTo(5.5, -31); ctx.lineTo(6.5, -26); ctx.closePath();
      ctx.fill();

      // Glass Cockpit
      ctx.fillStyle = '#090d16';
      ctx.beginPath();
      ctx.moveTo(-9, -8); ctx.lineTo(9, -8);
      ctx.bezierCurveTo(8.5, 3, 8, 10, 7.5, 15);
      ctx.lineTo(-7.5, 15);
      ctx.bezierCurveTo(-8, 10, -8.5, 3, -9, -8);
      ctx.closePath();
      ctx.fill();

      // Roof & Number Decal
      ctx.fillStyle = mainPaint;
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.roundRect(-8, -1, 16, 13, 2.5);
      ctx.fill();
      ctx.stroke();

      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(roofNumber.toString(), 0, 5.5);
      ctx.restore();

      // OEM Pedestal Rear Wing
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-7.5, 24, 2, 4);
      ctx.fillRect(5.5, 24, 2, 4);
      ctx.fillStyle = mainPaint;
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(-10.5, 27, 21, 3.2, 1.2);
      ctx.fill();
      ctx.stroke();

      // S15 Taillights
      ctx.save();
      ctx.fillStyle = isBraking ? '#ff1111' : '#dc2626';
      ctx.beginPath();
      ctx.moveTo(-11.5, 29); ctx.lineTo(-6, 30.5); ctx.lineTo(-6, 32); ctx.lineTo(-11, 31); ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(11.5, 29); ctx.lineTo(6, 30.5); ctx.lineTo(6, 32); ctx.lineTo(11, 31); ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.restore();
    }

    ctx.restore(); // Restore suspension body roll & pitch transform
    ctx.restore(); // Restore car position & angle transform
  }

  /**
   * Renders the top duel HUD, angle meter, score breakdown, and alerts
   */
  private renderHUD(
    ctx: CanvasRenderingContext2D,
    viewW: number,
    viewH: number,
    p1: VehiclePhysicsState,
    p1Score: RunScoreBreakdown,
    p2: VehiclePhysicsState,
    p2Score: RunScoreBreakdown,
    roundState: RoundState
  ) {
    ctx.save();

    const isMobile = this.isMobileDevice();
    const isLandscape = viewW > viewH;
    const headerW = isMobile ? Math.min(viewW - 24, 330) : 380;
    const headerH = isMobile ? 40 : 48;
    const headerX = (viewW - headerW) / 2;
    const headerY = isMobile ? (isLandscape ? 10 : 48) : 10;

    // Top Match Header Panel
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(headerX, headerY, headerW, headerH, 14);
    ctx.fill();
    ctx.stroke();

    // Round Title
    let roundTitle = `ROUND ${roundState.currentRoundNumber}: TANDEM BATTLE`;
    if (roundState.roundType.includes('omt')) roundTitle = `OMT — ROUND ${roundState.currentRoundNumber}`;
    if (roundState.roundType.includes('solo')) roundTitle = `SUDDEN DEATH SOLO SPRINT`;

    ctx.font = isMobile ? '900 10px sans-serif' : '900 11px sans-serif';
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'center';
    ctx.fillText(roundTitle, viewW / 2, headerY + (isMobile ? 13 : 16));

    // Player Role vs Enemy Role
    ctx.font = isMobile ? '700 10px monospace' : '700 12px monospace';
    ctx.fillStyle = '#38bdf8';
    const colOffset = isMobile ? headerW * 0.25 : 85;
    ctx.fillText(`YOU: ${roundState.playerRole.toUpperCase()} (${p1Score.totalScore} pts)`, viewW / 2 - colOffset, headerY + (isMobile ? 29 : 35));

    ctx.fillStyle = '#f43f5e';
    ctx.fillText(`RIVAL: ${roundState.enemyRole.toUpperCase()} (${p2Score.totalScore} pts)`, viewW / 2 + colOffset, headerY + (isMobile ? 29 : 35));

    // Off-screen Rival Tracker Indicator
    const rdx = p2.x - this.camX;
    const rdy = p2.y - this.camY;
    const cos = Math.cos(-this.camAngle);
    const sin = Math.sin(-this.camAngle);
    const screenRotX = (rdx * cos - rdy * sin) * this.camZoom;
    const screenRotY = (rdx * sin + rdy * cos) * this.camZoom;
    const screenEnemyX = viewW * 0.5 + screenRotX;
    const screenEnemyY = viewH * 0.68 + screenRotY;

    const pad = 42;
    const isOffScreen = 
      screenEnemyX < pad || screenEnemyX > viewW - pad ||
      screenEnemyY < 65 || screenEnemyY > viewH - pad;

    if (isOffScreen) {
      const clampX = Math.max(pad, Math.min(viewW - pad, screenEnemyX));
      const clampY = Math.max(75, Math.min(viewH - pad, screenEnemyY));
      const arrowAngle = Math.atan2(screenEnemyY - clampY, screenEnemyX - clampX);
      const distMeters = Math.round(Math.hypot(rdx, rdy) / 10);

      ctx.save();
      ctx.translate(clampX, clampY);
      ctx.fillStyle = '#f43f5e';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;

      // Pointer chevron towards rival
      ctx.rotate(arrowAngle);
      ctx.beginPath();
      ctx.moveTo(10, -6);
      ctx.lineTo(20, 0);
      ctx.lineTo(10, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.rotate(-arrowAngle);

      // Distance Badge
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.font = '900 8.5px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = 0;
      ctx.fillText(`${distMeters}m`, 0, 0);
      ctx.restore();
    }

    // Player Telemetry: Drift Angle Meter, Clipping Zone Indicator & G-Force Meter
    const telemW = isMobile ? Math.min(viewW - 24, 320) : 350;
    const telemH = isMobile ? 36 : 48;
    const telemFinalX = isMobile ? (viewW - telemW) / 2 : 14;
    // On mobile, pin telemetry cleanly below the header panel so the track and cars are 100% unobstructed!
    // On desktop, keep at bottom-left (viewH - 66).
    const telemY = isMobile ? headerY + headerH + 6 : viewH - 66;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    ctx.roundRect(telemFinalX, telemY, telemW, telemH, isMobile ? 10 : 14);
    ctx.fill();
    ctx.stroke();

    ctx.font = isMobile ? '800 8px sans-serif' : '900 9.5px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText('DRIFT SLIP ANGLE', telemFinalX + (isMobile ? 10 : 12), isMobile ? telemY + 13 : telemY + 17);

    ctx.font = isMobile ? '900 14px monospace' : '900 16px monospace';
    ctx.fillStyle = p1.driftSlipAngle > 80 ? '#f43f5e' : (p1.driftSlipAngle > 40 ? '#f59e0b' : '#34d399');
    ctx.fillText(`${p1.driftSlipAngle}°`, telemFinalX + (isMobile ? 10 : 12), isMobile ? telemY + 28 : telemY + 37);

    // Green Clipping Zone Tire Dots (FL, FR, RL, RR)
    const tiresX = telemFinalX + (isMobile ? 110 : 135);
    ctx.font = isMobile ? '700 7.5px sans-serif' : '700 8px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('ZONE TIRES:', tiresX, isMobile ? telemY + 13 : telemY + 17);

    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = p1.tires[i].inZone ? '#10b981' : '#334155';
      ctx.beginPath();
      ctx.arc(tiresX + 5 + i * (isMobile ? 13 : 15), isMobile ? telemY + 24 : telemY + 31, isMobile ? 3.2 : 3.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Real-Time G-Force Crosshair Telemetry Meter
    const gMeterX = telemFinalX + telemW - (isMobile ? 44 : 52);
    const gMeterY = isMobile ? telemY + 18 : telemY + 24;
    const gRadius = isMobile ? 11 : 15;

    ctx.save();
    ctx.translate(gMeterX, gMeterY);

    // G-meter label
    ctx.font = '700 7px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText('G-METER', 0, -gRadius - 2);

    // Meter ring & crosshairs
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, gRadius, 0, Math.PI * 2);
    ctx.moveTo(-gRadius, 0); ctx.lineTo(gRadius, 0);
    ctx.moveTo(0, -gRadius); ctx.lineTo(0, gRadius);
    ctx.stroke();

    // G-Force Vector Dot
    const dotX = Math.max(-gRadius + 2, Math.min(gRadius - 2, (p1.lateralG || 0) * (isMobile ? 7 : 10)));
    const dotY = Math.max(-gRadius + 2, Math.min(gRadius - 2, (p1.bodyPitch || 0) * (isMobile ? 110 : 150)));
    ctx.fillStyle = Math.abs(p1.lateralG || 0) > 0.8 ? '#f43f5e' : (Math.abs(p1.lateralG || 0) > 0.4 ? '#f59e0b' : '#38bdf8');
    ctx.beginPath();
    ctx.arc(dotX, dotY, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Numeric G readout
    ctx.font = isMobile ? '900 9px monospace' : '900 10px monospace';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.abs(p1.lateralG || 0).toFixed(1)}G`, gMeterX + (isMobile ? 26 : 32), isMobile ? telemY + 22 : telemY + 28);

    // Fault Alert Banners
    if (p1Score.isZeroFault) {
      ctx.fillStyle = 'rgba(225, 29, 72, 0.9)';
      ctx.beginPath();
      ctx.roundRect(viewW / 2 - 150, telemY + telemH + 6, 300, 30, 10);
      ctx.fill();

      ctx.font = '900 11px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(`⚠️ ZERO FAULT: ${p1Score.faultReason || 'FAULT'}`, viewW / 2, telemY + telemH + 25);
    }

    // Anti-Stall 5s Countdown Warning
    if (p1.stationaryTimer > 1.2 && !p1Score.finished) {
      const remaining = Math.max(0, DRIFT_CONSTANTS.ANTI_STALL_SECONDS - p1.stationaryTimer).toFixed(1);
      const stallY = isMobile ? telemY + telemH + 6 : viewH - 85;
      ctx.fillStyle = 'rgba(234, 88, 12, 0.9)';
      ctx.beginPath();
      ctx.roundRect(viewW / 2 - 140, stallY, 280, 26, 8);
      ctx.fill();

      ctx.font = '900 10.5px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(`⏱️ ANTI-STALL WARNING: RESUME IN ${remaining}s OR DQ!`, viewW / 2, stallY + 17);
    }

    ctx.restore();
  }
}
