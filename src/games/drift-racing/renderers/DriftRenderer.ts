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

interface SkidmarkSegment {
  x: number;
  y: number;
  alpha: number;
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

  // Particles & Skidmarks
  private smokeParticles: SmokeParticle[] = [];
  private skidmarks: SkidmarkSegment[] = [];

  constructor(canvas: HTMLCanvasElement, track: DriftTrack) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.track = track;
  }

  public snapCamera(playerState: VehiclePhysicsState) {
    this.camX = playerState.x;
    this.camY = playerState.y;
    this.camAngle = playerState.angle;
    this.camZoom = 1.0;
  }

  public resize(width: number, height: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
  }

  public clearSkidmarks() {
    this.skidmarks = [];
    this.smokeParticles = [];
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
    const viewW = this.canvas.width / (window.devicePixelRatio || 1);
    const viewH = this.canvas.height / (window.devicePixelRatio || 1);

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

    // 3. Render Track Surface, Curbs, and Green Clipping Zones
    this.renderTrack(ctx, isDay);

    // 4. Render Checkered Start / Finish Line & Starting Grids
    this.renderCheckeredStartFinish(ctx);

    // 5. Render Tire Skidmarks
    this.renderSkidmarks(ctx, isDay);

    // 6. Emit & Render Dynamic Rear Tire Smoke
    this.updateAndRenderSmoke(ctx, playerState, isDay);
    this.updateAndRenderSmoke(ctx, enemyState, isDay);

    // 7. Render Tether Line between Lead & Chase
    this.renderTandemTether(ctx, playerState, enemyState, roundState.playerRole);

    // 8. Render OEM Vehicles
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

      // Outer Glowing Guide Line
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 12;
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
    for (let i = 0; i < walls.length; i += 2) {
      const seg = walls[i];
      ctx.strokeStyle = (i % 4 === 0) ? '#ef4444' : '#ffffff';
      ctx.beginPath();
      ctx.moveTo(seg.p1.x, seg.p1.y);
      ctx.lineTo(seg.p2.x, seg.p2.y);
      ctx.stroke();
    }
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
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 4;
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
   * Emits & renders dynamic rear tire smoke scaling with throttle & drift angle
   */
  private updateAndRenderSmoke(ctx: CanvasRenderingContext2D, car: VehiclePhysicsState, isDay: boolean) {
    // Deposit Skidmarks
    if (car.driftSlipAngle > DRIFT_CONSTANTS.DRIFT_INIT_ANGLE_DEG && car.speed > 0.8) {
      this.skidmarks.push({ x: car.tires[2].x, y: car.tires[2].y, alpha: isDay ? 0.35 : 0.6 });
      this.skidmarks.push({ x: car.tires[3].x, y: car.tires[3].y, alpha: isDay ? 0.35 : 0.6 });
    }
    if (this.skidmarks.length > 600) this.skidmarks.splice(0, 50);

    // Smoke Generation (billows with throttle commitment & drift angle)
    const isDrifting = (car.driftSlipAngle >= DRIFT_CONSTANTS.DRIFT_INIT_ANGLE_DEG);
    const hasThrottle = (car.throttle > 0.08);

    if (isDrifting && car.speed > 0.75 && hasThrottle) {
      const intensity = (car.driftSlipAngle / 35) + (car.throttle * 1.6);
      const spawnCount = Math.min(5, Math.ceil(intensity));

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
          decay: 0.012 + Math.random() * 0.008
        });
      }
    }

    // Render & update particles
    ctx.save();
    for (let i = 0; i < this.smokeParticles.length; i++) {
      const p = this.smokeParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.size += 0.35;
      p.alpha -= p.decay;

      if (p.alpha > 0) {
        ctx.fillStyle = isDay 
          ? `rgba(241, 245, 249, ${Math.max(0, p.alpha * 0.8)})` 
          : `rgba(203, 213, 225, ${Math.max(0, p.alpha * 0.65)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    this.smokeParticles = this.smokeParticles.filter(p => p.alpha > 0);
    ctx.restore();
  }

  private renderSkidmarks(ctx: CanvasRenderingContext2D, isDay: boolean) {
    ctx.save();
    ctx.fillStyle = isDay ? '#334155' : '#020617';
    for (const sm of this.skidmarks) {
      ctx.globalAlpha = sm.alpha;
      ctx.beginPath();
      ctx.arc(sm.x, sm.y, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
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

    // Ground Shadow
    ctx.save();
    ctx.fillStyle = isLightMode ? 'rgba(15, 23, 42, 0.45)' : 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.roundRect(-14, -32, 28, 64, 5);
    ctx.filter = 'blur(4px)';
    ctx.fill();
    ctx.restore();

    // Headlight Beams (for Night mode)
    if (headlights) {
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

      // Rolling tread animation
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
      ctx.restore();
    };

    drawTire(-halfTrack, rearY, 0);
    drawTire(halfTrack, rearY, 0);
    drawTire(-halfTrack, frontY, state.steerAngle);
    drawTire(halfTrack, frontY, state.steerAngle);

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

    ctx.restore();
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

    // Top Match Header Panel
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(viewW / 2 - 190, 10, 380, 48, 16);
    ctx.fill();
    ctx.stroke();

    // Round Title
    let roundTitle = `ROUND ${roundState.currentRoundNumber}: TANDEM BATTLE`;
    if (roundState.roundType.includes('omt')) roundTitle = `ONE MORE TIME (OMT) — ROUND ${roundState.currentRoundNumber}`;
    if (roundState.roundType.includes('solo')) roundTitle = `SUDDEN DEATH SOLO SPRINT`;

    ctx.font = '900 11px sans-serif';
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'center';
    ctx.fillText(roundTitle, viewW / 2, 26);

    // Player Role vs Enemy Role
    ctx.font = '700 12px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`YOU: ${roundState.playerRole.toUpperCase()} (${p1Score.totalScore} pts)`, viewW / 2 - 85, 45);

    ctx.fillStyle = '#f43f5e';
    ctx.fillText(`RIVAL: ${roundState.enemyRole.toUpperCase()} (${p2Score.totalScore} pts)`, viewW / 2 + 85, 45);

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

      // Outer Glow
      ctx.shadowColor = 'rgba(244, 63, 94, 0.6)';
      ctx.shadowBlur = 8;

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

    // Bottom Player Telemetry: Drift Angle Meter & Clipping Zone Indicator
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.beginPath();
    ctx.roundRect(14, viewH - 66, 256, 54, 14);
    ctx.fill();
    ctx.stroke();

    ctx.font = '900 10px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText('DRIFT SLIP ANGLE', 24, viewH - 46);

    ctx.font = '900 18px monospace';
    ctx.fillStyle = p1.driftSlipAngle > 80 ? '#f43f5e' : (p1.driftSlipAngle > 40 ? '#f59e0b' : '#34d399');
    ctx.fillText(`${p1.driftSlipAngle}°`, 24, viewH - 24);

    // Green Clipping Zone Tire Dots (FL, FR, RL, RR)
    ctx.font = '700 9px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('ZONE TIRES:', 150, viewH - 46);

    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = p1.tires[i].inZone ? '#10b981' : '#334155';
      ctx.beginPath();
      ctx.arc(158 + i * 20, viewH - 26, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fault Alert Banners
    if (p1Score.isZeroFault) {
      ctx.fillStyle = 'rgba(225, 29, 72, 0.9)';
      ctx.beginPath();
      ctx.roundRect(viewW / 2 - 160, 68, 320, 32, 10);
      ctx.fill();

      ctx.font = '900 12px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(`⚠️ ZERO FAULT: ${p1Score.faultReason || 'FAULT'}`, viewW / 2, 88);
    }

    // Anti-Stall 5s Countdown Warning
    if (p1.stationaryTimer > 1.2 && !p1Score.finished) {
      const remaining = Math.max(0, DRIFT_CONSTANTS.ANTI_STALL_SECONDS - p1.stationaryTimer).toFixed(1);
      ctx.fillStyle = 'rgba(234, 88, 12, 0.9)';
      ctx.beginPath();
      ctx.roundRect(viewW / 2 - 140, viewH - 85, 280, 28, 8);
      ctx.fill();

      ctx.font = '900 11px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(`⏱️ ANTI-STALL WARNING: RESUME IN ${remaining}s OR DQ!`, viewW / 2, viewH - 67);
    }

    ctx.restore();
  }
}
