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

interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  decay: number;
  color: string;
}

interface FloatingScoreText {
  text: string;
  x: number;
  y: number;
  color: string;
  lifetime: number;
  maxLifetime: number;
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

  // Screen & Viewport Scaling (Crisp Retina DPI)
  private dpr: number = 1;
  private cssWidth: number = 960;
  private cssHeight: number = 640;

  // Particle & Skidmark Buffers (batched in single draw calls, zero heavy offscreen canvases!)
  private smokeParticles: SmokeParticle[] = [];
  private sparkParticles: SparkParticle[] = [];
  private floatingTexts: FloatingScoreText[] = [];
  private skidmarks: { x: number; y: number }[] = [];

  // Live HUD Contact Penalty Alert Banner
  public contactAlert: { text: string; color: string; expires: number } | null = null;

  // Precompiled GPU Vector Paths (zero CPU path loops during animation frames!)
  private trackPath: Path2D = new Path2D();
  private redCurbsPath: Path2D = new Path2D();
  private whiteCurbsPath: Path2D = new Path2D();
  private zonePaths: { poly: Path2D; edge: Path2D; chars: { char: string; x: number; y: number; angle: number }[]; name: string }[] = [];
  private checkeredWhitePath: Path2D = new Path2D();
  private checkeredDarkPath: Path2D = new Path2D();
  private checkeredBorderPath: Path2D = new Path2D();

  // Font state cache (avoids 600 CSS font string parses/second on mobile)
  private currentFont: string = '';
  private setFont(ctx: CanvasRenderingContext2D, font: string) {
    if (this.currentFont !== font) {
      ctx.font = font;
      this.currentFont = font;
    }
  }

  // Preallocated interpolated vehicle states for zero-alloc render loop
  private interpPlayerState: VehiclePhysicsState | null = null;
  private interpEnemyState: VehiclePhysicsState | null = null;

  private getInterpolatedState(source: VehiclePhysicsState, target: VehiclePhysicsState, alpha: number): VehiclePhysicsState {
    Object.assign(target, source);

    if (alpha >= 0.999 || (source.prevX === source.x && source.prevY === source.y)) {
      return target;
    }

    target.x = source.prevX + (source.x - source.prevX) * alpha;
    target.y = source.prevY + (source.y - source.prevY) * alpha;

    let angleDiff = source.angle - source.prevAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    target.angle = source.prevAngle + angleDiff * alpha;

    return target;
  }

  constructor(canvas: HTMLCanvasElement, track: DriftTrack) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.track = track;
    this.buildCompiledPaths();
  }

  private buildCompiledPaths() {
    const pts = this.track.waypoints;

    // 1. Asphalt Ribbon Path (120 waypoints compiled once into GPU memory)
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) this.trackPath.moveTo(pts[i].x, pts[i].y);
      else this.trackPath.lineTo(pts[i].x, pts[i].y);
    }
    this.trackPath.closePath();

    // 2. Curbs Paths (batched red and white segments compiled once)
    const walls = this.track.allWalls;
    for (let i = 0; i < walls.length; i++) {
      const seg = walls[i];
      const targetPath = (Math.floor(i / 2) % 2 === 0) ? this.redCurbsPath : this.whiteCurbsPath;
      targetPath.moveTo(seg.p1.x, seg.p1.y);
      targetPath.lineTo(seg.p2.x, seg.p2.y);
    }

    // 3. Clipping Zone Paths & Precompiled Curved Centerline Text
    for (let i = 0; i < this.track.clippingZones.length; i++) {
      const zone = this.track.clippingZones[i];
      const poly = new Path2D();
      for (let j = 0; j < zone.polygon.length; j++) {
        const pt = zone.polygon[j];
        if (j === 0) poly.moveTo(pt.x, pt.y);
        else poly.lineTo(pt.x, pt.y);
      }
      poly.closePath();

      const edge = new Path2D();
      for (let j = 0; j < zone.outerEdge.length; j++) {
        const pt = zone.outerEdge[j];
        if (j === 0) edge.moveTo(pt.x, pt.y);
        else edge.lineTo(pt.x, pt.y);
      }

      // Precalculate curved text characters placed along the exact ribbon centerline
      const chars: { char: string; x: number; y: number; angle: number }[] = [];
      const curve = zone.centerCurve;
      if (curve && curve.length >= 2) {
        const dists: number[] = [0];
        for (let j = 0; j < curve.length - 1; j++) {
          const segLen = Math.hypot(curve[j + 1].x - curve[j].x, curve[j + 1].y - curve[j].y);
          dists.push(dists[j] + segLen);
        }
        const totalCurveLen = dists[dists.length - 1];

        const text = zone.name.toUpperCase();
        const letterSpacing = 2.5;
        const charMetrics: { char: string; width: number }[] = [];
        let textWidth = 0;

        this.setFont(this.ctx, '900 10.5px sans-serif');
        for (let k = 0; k < text.length; k++) {
          const ch = text[k];
          const w = ch === ' ' ? 5.5 : Math.max(this.ctx.measureText(ch).width, 5.0);
          charMetrics.push({ char: ch, width: w });
          textWidth += w + (k < text.length - 1 ? letterSpacing : 0);
        }

        const startOffset = Math.max(0, (totalCurveLen - textWidth) / 2);
        let curDist = startOffset;

        for (let k = 0; k < charMetrics.length; k++) {
          const { char: ch, width: w } = charMetrics[k];
          const s = curDist + w / 2;
          curDist += w + letterSpacing;

          if (ch === ' ') continue;

          let segIdx = 0;
          while (segIdx < curve.length - 2 && dists[segIdx + 1] < s) {
            segIdx++;
          }
          const segLen = dists[segIdx + 1] - dists[segIdx];
          const t = segLen > 0 ? (s - dists[segIdx]) / segLen : 0;
          const p0 = curve[segIdx];
          const p1 = curve[segIdx + 1];

          const cx = p0.x + (p1.x - p0.x) * t;
          const cy = p0.y + (p1.y - p0.y) * t;
          const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);

          chars.push({ char: ch, x: cx, y: cy, angle });
        }
      }

      this.zonePaths.push({
        poly,
        edge,
        chars,
        name: zone.name.toUpperCase()
      });
    }

    // 4. Precompiled Checkered Start / Finish Line (compiled once into GPU memory)
    const line = this.track.startLine;
    const p1 = line.p1;
    const p2 = line.p2;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const fwdX = Math.sin(line.angle);
    const fwdY = -Math.cos(line.angle);
    const cols = 8;
    const rows = 2;
    const rowH = 12;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const isWhite = (r + c) % 2 === 0;
        const targetPath = isWhite ? this.checkeredWhitePath : this.checkeredDarkPath;
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

        targetPath.moveTo(aX, aY);
        targetPath.lineTo(bX, bY);
        targetPath.lineTo(cX, cY);
        targetPath.lineTo(dX, dY);
        targetPath.closePath();
      }
    }

    this.checkeredBorderPath.moveTo(p1.x - fwdX * rowH, p1.y - fwdY * rowH);
    this.checkeredBorderPath.lineTo(p2.x - fwdX * rowH, p2.y - fwdY * rowH);
    this.checkeredBorderPath.moveTo(p1.x + fwdX * rowH, p1.y + fwdY * rowH);
    this.checkeredBorderPath.lineTo(p2.x + fwdX * rowH, p2.y + fwdY * rowH);
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
    const rawDpr = window.devicePixelRatio || 1;
    // Crisp Retina resolution (never downsampled to 1.0 which causes blurry graphics on mobile!)
    this.dpr = Math.min(rawDpr, 2.0);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  public clearSkidmarks() {
    this.skidmarks = [];
    this.smokeParticles = [];
    this.sparkParticles = [];
    this.floatingTexts = [];
    this.contactAlert = null;
  }

  public emitSparks(contactX: number, contactY: number, normX: number, normY: number) {
    const isMobile = this.isMobileDevice();
    const count = isMobile ? 8 : 14;
    for (let i = 0; i < count; i++) {
      const angle = Math.atan2(normY, normX) + (Math.random() - 0.5) * 2.0;
      const speed = 1.8 + Math.random() * 3.6;
      this.sparkParticles.push({
        x: contactX + (Math.random() - 0.5) * 6,
        y: contactY + (Math.random() - 0.5) * 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 1.6 + Math.random() * 2.2,
        alpha: 1.0,
        decay: 0.05 + Math.random() * 0.04,
        color: Math.random() > 0.35 ? '#fbbf24' : '#ef4444'
      });
    }
    if (this.sparkParticles.length > 35) {
      this.sparkParticles.splice(0, 15);
    }
  }

  public addFloatingText(text: string, x: number, y: number, color: string = '#f43f5e') {
    this.floatingTexts.push({
      text,
      x,
      y,
      color,
      lifetime: 1.25,
      maxLifetime: 1.25
    });
    if (this.floatingTexts.length > 6) {
      this.floatingTexts.shift();
    }
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
    enemyRoofNum: number = 15,
    alpha: number = 1.0
  ) {
    const ctx = this.ctx;
    const viewW = this.cssWidth;
    const viewH = this.cssHeight;

    // Reset font cache for the frame
    this.currentFont = '';

    // Initialize or get interpolated car states for buttery 60/90/120Hz display refresh
    if (!this.interpPlayerState) this.interpPlayerState = { ...playerState };
    if (!this.interpEnemyState) this.interpEnemyState = { ...enemyState };
    const renderPlayer = this.getInterpolatedState(playerState, this.interpPlayerState, alpha);
    const renderEnemy = this.getInterpolatedState(enemyState, this.interpEnemyState, alpha);

    // Reset and apply DPR scale so all drawing coordinates use CSS pixels consistently!
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // 1. Update Camera to Follow Interpolated Player Car (Car-Centric Top-Down View)
    this.updateCamera(renderPlayer);

    // 2. Clear Screen (single fillRect completely overwrites canvas buffer without slow clearRect)
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

    // 3. Render Track Surface & Green Clipping Zones directly
    this.renderTrack(ctx, isDay);

    // 4. Render Checkered Start / Finish Line & Starting Grids directly
    this.renderCheckeredStartFinish(ctx);

    // 5. Render Tire Skidmarks (batched in 1 single fill call!)
    this.renderSkidmarks(ctx, isDay);

    // 6. Emit & Render Dynamic Rear Tire Smoke (batched in 1 single fill call!)
    this.emitSmoke(playerState);
    this.emitSmoke(enemyState);
    this.renderSmoke(ctx, isDay);

    // 7. Render Tether Line between Lead & Chase
    this.renderTandemTether(ctx, renderPlayer, renderEnemy, roundState.playerRole);

    // 8. Render OEM Vehicles
    // Render Enemy Car
    this.renderOEMCar(ctx, enemyModel, renderEnemy, {
      roofNumber: enemyRoofNum,
      colorTheme: (enemyModel === 's15' ? '#1e3a8a' : '#ef4444'),
      isBraking: renderEnemy.brake,
      headlights: !isDay,
      isLightMode: isDay
    });

    // Render Player Car
    this.renderOEMCar(ctx, playerModel, renderPlayer, {
      roofNumber: playerRoofNum,
      colorTheme: (playerModel === 'ae86' ? 'panda' : '#06b6d4'),
      isBraking: renderPlayer.brake,
      headlights: !isDay,
      isLightMode: isDay
    });

    // 9. Render Collision Sparks & Floating Points
    this.renderSparks(ctx);
    this.renderFloatingTexts(ctx);

    ctx.restore();

    // 10. Render On-Screen Live HUD
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
   * Renders the complete Figure-8 Track using precompiled GPU Path2D objects (lightning fast!)
   */
  private renderTrack(ctx: CanvasRenderingContext2D, isDay: boolean) {
    // A. Main Asphalt Ribbon (Precompiled 120-waypoint path, stroked in microseconds)
    ctx.save();
    ctx.lineWidth = DRIFT_CONSTANTS.TRACK_WIDTH + 8;
    ctx.strokeStyle = isDay ? '#64748b' : '#1e293b';
    ctx.stroke(this.trackPath);

    ctx.lineWidth = DRIFT_CONSTANTS.TRACK_WIDTH;
    ctx.strokeStyle = isDay ? '#e2e8f0' : '#1e293b';
    ctx.stroke(this.trackPath);
    ctx.restore();

    // B. High-Visibility Green Drift Clipping Zones (Precompiled paths)
    for (let i = 0; i < this.zonePaths.length; i++) {
      const z = this.zonePaths[i];
      ctx.save();
      ctx.fillStyle = isDay ? 'rgba(16, 185, 129, 0.42)' : 'rgba(16, 185, 129, 0.55)';
      ctx.fill(z.poly);

      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.5;
      ctx.stroke(z.poly);

      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 3.5;
      ctx.stroke(z.edge);

      // Precompiled curved text: centered inside the green ribbon, following track arc
      this.setFont(ctx, '900 10.5px sans-serif');
      ctx.fillStyle = isDay ? '#064e3b' : '#ecfdf5';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let c = 0; c < z.chars.length; c++) {
        const ch = z.chars[c];
        ctx.save();
        ctx.translate(ch.x, ch.y);
        ctx.rotate(ch.angle);
        ctx.fillText(ch.char, 0, 0);
        ctx.restore();
      }
      ctx.restore();
    }

    // C. Red & White Striped Outer & Inner Curbs (Precompiled GPU paths)
    ctx.save();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#ef4444';
    ctx.stroke(this.redCurbsPath);
    ctx.strokeStyle = '#ffffff';
    ctx.stroke(this.whiteCurbsPath);
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

    ctx.save();
    // 1. Alternating Checkered Flag Line across Track (Precompiled Path2D)
    ctx.fillStyle = '#f8fafc';
    ctx.fill(this.checkeredWhitePath);
    ctx.fillStyle = '#0f172a';
    ctx.fill(this.checkeredDarkPath);

    // Checkered line outline borders
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2.5;
    ctx.stroke(this.checkeredBorderPath);

    // START / FINISH asphalt lettering
    ctx.save();
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    ctx.translate(midX, midY);
    ctx.rotate(line.angle);
    this.setFont(ctx, '900 13px monospace');
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
    this.setFont(ctx, '900 9px monospace');
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
   * Emits dynamic rear tire smoke and records skidmarks
   */
  private emitSmoke(car: VehiclePhysicsState) {
    const isMobile = this.isMobileDevice();

    // Record Skidmarks
    if (car.driftSlipAngle > DRIFT_CONSTANTS.DRIFT_INIT_ANGLE_DEG && car.speed > 0.32) {
      this.skidmarks.push({ x: car.tires[2].x, y: car.tires[2].y });
      if (!isMobile) {
        this.skidmarks.push({ x: car.tires[3].x, y: car.tires[3].y });
      }
      const maxSkid = isMobile ? 80 : 200;
      if (this.skidmarks.length > maxSkid) {
        this.skidmarks.splice(0, 25);
      }
    }

    // Smoke Generation (billows with throttle commitment & drift angle)
    const isDrifting = (car.driftSlipAngle >= DRIFT_CONSTANTS.DRIFT_INIT_ANGLE_DEG);
    const hasThrottle = (car.throttle > 0.08);

    if (isDrifting && car.speed > 0.30 && hasThrottle) {
      const intensity = (car.driftSlipAngle / 35) + (car.throttle * 1.6);
      const maxSpawn = isMobile ? 1 : 3;
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
          decay: isMobile ? 0.035 + Math.random() * 0.015 : 0.015 + Math.random() * 0.010
        });
      }
    }

    // Hard cap total smoke particles
    const smokeCap = isMobile ? 25 : 60;
    if (this.smokeParticles.length > smokeCap) {
      this.smokeParticles.splice(0, this.smokeParticles.length - smokeCap);
    }
  }

  /**
   * Renders tire skidmarks batched into 1 single path (0 texture overhead, 0 stutter)
   */
  private renderSkidmarks(ctx: CanvasRenderingContext2D, isDay: boolean) {
    if (this.skidmarks.length === 0) return;
    ctx.save();
    ctx.fillStyle = isDay ? 'rgba(51, 65, 85, 0.28)' : 'rgba(2, 6, 23, 0.45)';
    ctx.beginPath();
    for (let i = 0; i < this.skidmarks.length; i++) {
      const sm = this.skidmarks[i];
      ctx.moveTo(sm.x + 2.5, sm.y);
      ctx.arc(sm.x, sm.y, 2.5, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
  }

  /**
   * Renders tire smoke particles batched into 1 single path (0 stutter)
   */
  private renderSmoke(ctx: CanvasRenderingContext2D, isDay: boolean) {
    if (this.smokeParticles.length === 0) return;
    ctx.save();
    ctx.fillStyle = isDay ? 'rgba(241, 245, 249, 0.42)' : 'rgba(203, 213, 225, 0.35)';
    ctx.beginPath();
    for (let i = 0; i < this.smokeParticles.length; i++) {
      const p = this.smokeParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.size += 0.35;
      p.alpha -= p.decay;

      if (p.alpha > 0) {
        ctx.moveTo(p.x + p.size, p.y);
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      }
    }
    ctx.fill();
    this.smokeParticles = this.smokeParticles.filter(p => p.alpha > 0);
    ctx.restore();
  }

  /**
   * Renders collision spark particles
   */
  private renderSparks(ctx: CanvasRenderingContext2D) {
    if (this.sparkParticles.length === 0) return;
    for (let i = this.sparkParticles.length - 1; i >= 0; i--) {
      const p = this.sparkParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.93;
      p.vy *= 0.93;
      p.alpha -= p.decay;
      if (p.alpha <= 0) {
        this.sparkParticles.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * Renders floating combat score/penalty notifications over the cars
   */
  private renderFloatingTexts(ctx: CanvasRenderingContext2D) {
    if (this.floatingTexts.length === 0) return;
    const dt = 1 / 60;
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const f = this.floatingTexts[i];
      f.lifetime -= dt;
      if (f.lifetime <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      const progress = 1 - f.lifetime / f.maxLifetime;
      const curY = f.y - progress * 35; // floats up by 35px
      const alpha = Math.min(1.0, f.lifetime * 2.0);

      ctx.save();
      ctx.translate(f.x, curY);
      // Keep text upright on screen despite rotating camera!
      ctx.rotate(this.camAngle);
      ctx.globalAlpha = alpha;
      this.setFont(ctx, '900 13px sans-serif');
      ctx.fillStyle = f.color;
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 6;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
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
      this.setFont(ctx, '900 10px monospace');
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
      this.setFont(ctx, '900 10px monospace');
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

    this.setFont(ctx, isMobile ? '900 10px sans-serif' : '900 11px sans-serif');
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'center';
    ctx.fillText(roundTitle, viewW / 2, headerY + (isMobile ? 13 : 16));

    // Player Role vs Enemy Role
    this.setFont(ctx, isMobile ? '700 10px monospace' : '700 12px monospace');
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

      this.setFont(ctx, '900 8.5px monospace');
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

    this.setFont(ctx, isMobile ? '800 8px sans-serif' : '900 9.5px sans-serif');
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText('DRIFT SLIP ANGLE', telemFinalX + (isMobile ? 10 : 12), isMobile ? telemY + 13 : telemY + 17);

    this.setFont(ctx, isMobile ? '900 14px monospace' : '900 16px monospace');
    ctx.fillStyle = p1.driftSlipAngle > 80 ? '#f43f5e' : (p1.driftSlipAngle > 40 ? '#f59e0b' : '#34d399');
    ctx.fillText(`${p1.driftSlipAngle}°`, telemFinalX + (isMobile ? 10 : 12), isMobile ? telemY + 28 : telemY + 37);

    // Green Clipping Zone Tire Dots (FL, FR, RL, RR)
    const tiresX = telemFinalX + (isMobile ? 110 : 135);
    this.setFont(ctx, isMobile ? '700 7.5px sans-serif' : '700 8px sans-serif');
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
    this.setFont(ctx, '700 7px sans-serif');
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
    this.setFont(ctx, isMobile ? '900 9px monospace' : '900 10px monospace');
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.abs(p1.lateralG || 0).toFixed(1)}G`, gMeterX + (isMobile ? 26 : 32), isMobile ? telemY + 22 : telemY + 28);

    // Fault Alert Banners
    if (p1Score.isZeroFault) {
      ctx.fillStyle = 'rgba(225, 29, 72, 0.9)';
      ctx.beginPath();
      ctx.roundRect(viewW / 2 - 150, telemY + telemH + 6, 300, 30, 10);
      ctx.fill();

      this.setFont(ctx, '900 11px sans-serif');
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

      this.setFont(ctx, '900 10.5px sans-serif');
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(`⏱️ ANTI-STALL WARNING: RESUME IN ${remaining}s OR DQ!`, viewW / 2, stallY + 17);
    }

    // Real-Time Contact Penalty Banner
    if (this.contactAlert && Date.now() < this.contactAlert.expires) {
      const alertW = isMobile ? Math.min(viewW - 24, 300) : 340;
      const alertH = 26;
      const alertX = (viewW - alertW) / 2;
      const alertY = telemY + telemH + (p1Score.isZeroFault ? 38 : 6);

      ctx.fillStyle = this.contactAlert.color;
      ctx.beginPath();
      ctx.roundRect(alertX, alertY, alertW, alertH, 8);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      this.setFont(ctx, '900 11px sans-serif');
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(this.contactAlert.text, viewW / 2, alertY + 17);
    }

    ctx.restore();
  }
}
