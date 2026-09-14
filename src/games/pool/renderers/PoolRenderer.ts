import {
  TABLE_WIDTH,
  TABLE_HEIGHT,
  PLAY_X_MIN,
  PLAY_X_MAX,
  PLAY_Y_MIN,
  PLAY_Y_MAX,
  HEAD_STRING_X,
  CENTER_X,
  CENTER_Y,
  FOOT_SPOT_X,
  FOOT_SPOT_Y,
  POCKETS,
  BALL_DEFS
} from '../engine/pool-constants';
import { PoolEngine } from '../engine/pool-engine';
import { PoolBall, PoolPhysics, TrajectoryPreview } from '../engine/pool-physics';

export class PoolRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private renderScale: number = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.updateScale(1);
  }

  public updateScale(displayScale: number = 1) {
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    // On mobile devices, displayScale is often 0.35 - 0.5x.
    // Matching effective physical scale (displayScale * dpr) capped at 3.0 provides
    // razor-sharp retina resolution without GPU fill-rate exhaustion on mobile.
    const targetScale = Math.max(1.0, Math.min(3.0, displayScale * dpr));

    if (Math.abs(this.renderScale - targetScale) > 0.05) {
      this.renderScale = targetScale;
      const targetWidth = Math.round(TABLE_WIDTH * this.renderScale);
      const targetHeight = Math.round(TABLE_HEIGHT * this.renderScale);
      if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
        this.canvas.width = targetWidth;
        this.canvas.height = targetHeight;
      }
      this.canvas.style.width = `${TABLE_WIDTH}px`;
      this.canvas.style.height = `${TABLE_HEIGHT}px`;
    }
  }

  public render(
    engine: PoolEngine,
    cueAngle: number,
    cuePower: number,
    isAiming: boolean = false,
    isHumanTurn: boolean = true,
    opponentCue?: { angle: number; power: number } | null,
    alpha: number = 1.0
  ) {
    const ctx = this.ctx;
    // Clear full high-DPI canvas buffer
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    ctx.scale(this.renderScale, this.renderScale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 1. Render Table Frame, Rails, Cloth, and Pockets
    this.renderTableFrame(ctx);
    this.renderClothAndMarkers(ctx, engine);
    this.renderPockets(ctx);

    // 2. Render Aiming Guideline & Ghost Ball (player or opponent)
    const cue = engine.getCueBall();
    const isPlayerTurn = engine.currentTurn === 'player';
    const isOpponentTurn = engine.currentTurn === 'opponent';
    const activeAngle = isPlayerTurn ? cueAngle : (opponentCue ? opponentCue.angle : cueAngle);
    const activePower = isPlayerTurn ? cuePower : (opponentCue ? opponentCue.power : cuePower);

    if (
      cue &&
      !engine.isSimulating &&
      engine.phase === 'PLAYING' &&
      ((isHumanTurn && isPlayerTurn) || (isOpponentTurn && opponentCue))
    ) {
      const trajectory = PoolPhysics.calculateTrajectory(cue, activeAngle, engine.balls);
      this.renderAimingGuide(ctx, cue, trajectory);
    }

    // 3. Render Balls with sub-tick interpolation
    this.renderBalls(ctx, engine.balls, alpha, engine.isSimulating);

    // 4. Render Cue Stick (on active turns when settled)
    const shouldShowCue = cue && !engine.isSimulating && (
      (engine.phase === 'PLAYING' && (isPlayerTurn ? isHumanTurn : (opponentCue != null || !isHumanTurn))) ||
      (engine.phase === 'LAGGING' && !engine.playerLagShotDone && isHumanTurn)
    );

    if (shouldShowCue && cue) {
      this.renderCueStick(ctx, cue, activeAngle, activePower, isPlayerTurn ? isAiming : true);
    }

    // 5. Render Ball-in-hand indicator
    if (engine.phase === 'BALL_IN_HAND' && cue) {
      this.renderBallInHandGuide(ctx, cue, isPlayerTurn, engine.ballInHandKitchenOnly);
    }

    ctx.restore();
  }

  // -------------------------------------------------------------
  // TABLE RENDERING
  // -------------------------------------------------------------
  private renderTableFrame(ctx: CanvasRenderingContext2D) {
    // Outer wooden rail (rich mahogany / walnut finish)
    const woodGrad = ctx.createLinearGradient(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    woodGrad.addColorStop(0, '#1c130d');
    woodGrad.addColorStop(0.3, '#382214');
    woodGrad.addColorStop(0.7, '#2b1a10');
    woodGrad.addColorStop(1, '#180f0a');

    ctx.fillStyle = woodGrad;
    this.roundRect(ctx, 0, 0, TABLE_WIDTH, TABLE_HEIGHT, 22);
    ctx.fill();

    // Subtle gold trim between wood and cushions
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, 4, 4, TABLE_WIDTH - 8, TABLE_HEIGHT - 8, 18);
    ctx.stroke();

    // Sights / Diamond Markers on rails
    this.renderRailDiamonds(ctx);
  }

  private renderClothAndMarkers(ctx: CanvasRenderingContext2D, engine: PoolEngine) {
    // Playable cloth (luxurious tournament green baize with center ambient highlight)
    const clothGrad = ctx.createRadialGradient(
      CENTER_X, CENTER_Y, 40,
      CENTER_X, CENTER_Y, 460
    );
    clothGrad.addColorStop(0, '#0d8558');
    clothGrad.addColorStop(0.65, '#0a6c47');
    clothGrad.addColorStop(1, '#064e33');

    ctx.fillStyle = clothGrad;
    ctx.fillRect(PLAY_X_MIN, PLAY_Y_MIN, PLAY_X_MAX - PLAY_X_MIN, PLAY_Y_MAX - PLAY_Y_MIN);

    // Rail cushion shadows
    const shadowSize = 14;
    // Top shadow
    const topShadow = ctx.createLinearGradient(0, PLAY_Y_MIN, 0, PLAY_Y_MIN + shadowSize);
    topShadow.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
    topShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = topShadow;
    ctx.fillRect(PLAY_X_MIN, PLAY_Y_MIN, PLAY_X_MAX - PLAY_X_MIN, shadowSize);

    // Left shadow
    const leftShadow = ctx.createLinearGradient(PLAY_X_MIN, 0, PLAY_X_MIN + shadowSize, 0);
    leftShadow.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
    leftShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = leftShadow;
    ctx.fillRect(PLAY_X_MIN, PLAY_Y_MIN, shadowSize, PLAY_Y_MAX - PLAY_Y_MIN);

    // Bottom shadow
    const bottomShadow = ctx.createLinearGradient(0, PLAY_Y_MAX, 0, PLAY_Y_MAX - shadowSize);
    bottomShadow.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
    bottomShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = bottomShadow;
    ctx.fillRect(PLAY_X_MIN, PLAY_Y_MAX - shadowSize, PLAY_X_MAX - PLAY_X_MIN, shadowSize);

    // Right shadow
    const rightShadow = ctx.createLinearGradient(PLAY_X_MAX, 0, PLAY_X_MAX - shadowSize, 0);
    rightShadow.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
    rightShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = rightShadow;
    ctx.fillRect(PLAY_X_MAX - shadowSize, PLAY_Y_MIN, shadowSize, PLAY_Y_MAX - PLAY_Y_MIN);

    // Head String (Kitchen Line)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(HEAD_STRING_X, PLAY_Y_MIN);
    ctx.lineTo(HEAD_STRING_X, PLAY_Y_MAX);
    ctx.stroke();
    ctx.setLineDash([]);

    // Head Spot marker
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(HEAD_STRING_X, CENTER_Y, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Center Spot marker
    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Foot Spot marker (Rack placement)
    ctx.beginPath();
    ctx.arc(FOOT_SPOT_X, FOOT_SPOT_Y, 3, 0, Math.PI * 2);
    ctx.fill();

    // Lagging Phase Guidance
    if (engine.phase === 'LAGGING') {
      // Horizontal divider dividing Player zone from Opponent zone
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(PLAY_X_MIN, CENTER_Y);
      ctx.lineTo(PLAY_X_MAX, CENTER_Y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.save();
      ctx.font = '700 11px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Opponent & Player zone text
      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.fillText('OPPONENT ZONE', HEAD_STRING_X + 90, CENTER_Y - 40);
      ctx.fillText('PLAYER ZONE', HEAD_STRING_X + 90, CENTER_Y + 45);

      // Foot rail arrow
      ctx.fillStyle = 'rgba(250, 204, 21, 0.95)';
      ctx.fillText('⚡ BOUNCE OFF FOOT CUSHION ⚡', PLAY_X_MAX - 110, CENTER_Y - 6);
      ctx.restore();
    }
  }

  private renderRailDiamonds(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = 'rgba(245, 245, 245, 0.65)';
    const rY = 16;
    const bY = TABLE_HEIGHT - 16;
    const lX = 16;
    const rX = TABLE_WIDTH - 16;

    // Top and Bottom diamonds
    const numDivisions = 8;
    const stepX = (PLAY_X_MAX - PLAY_X_MIN) / numDivisions;
    for (let i = 1; i < numDivisions; i++) {
      const x = PLAY_X_MIN + i * stepX;
      if (Math.abs(x - CENTER_X) < 25) continue; // skip middle pocket
      this.drawDiamond(ctx, x, rY);
      this.drawDiamond(ctx, x, bY);
    }

    // Left and Right diamonds
    const stepY = (PLAY_Y_MAX - PLAY_Y_MIN) / 4;
    for (let i = 1; i < 4; i++) {
      const y = PLAY_Y_MIN + i * stepY;
      this.drawDiamond(ctx, lX, y);
      this.drawDiamond(ctx, rX, y);
    }
  }

  private drawDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    const s = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s);
    ctx.lineTo(cx + s, cy);
    ctx.lineTo(cx, cy + s);
    ctx.lineTo(cx - s, cy);
    ctx.closePath();
    ctx.fill();
  }

  private renderPockets(ctx: CanvasRenderingContext2D) {
    for (const p of POCKETS) {
      // Pocket drop hole (dark abyss)
      const holeGrad = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.radius);
      holeGrad.addColorStop(0, '#020408');
      holeGrad.addColorStop(0.8, '#080c14');
      holeGrad.addColorStop(1, '#111827');

      ctx.fillStyle = holeGrad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();

      // Brass / Metallic rim
      ctx.strokeStyle = '#927238';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }

  // -------------------------------------------------------------
  // BALL RENDERING
  // -------------------------------------------------------------
  private renderBalls(ctx: CanvasRenderingContext2D, balls: PoolBall[], alpha: number = 1.0, isSimulating: boolean = false) {
    // Sort balls so sinking balls render first (underneath)
    const sorted = [...balls].sort((a, _b) => (a.isSinking ? -1 : 1));

    for (const b of sorted) {
      if (b.isPotted) continue;

      const scale = b.isSinking ? Math.max(0.2, 1.0 - b.pottedAnimProgress * 0.75) : 1.0;
      const radius = b.radius * scale;
      const x = (isSimulating && b.prevX !== undefined)
        ? b.prevX + (b.x - b.prevX) * alpha
        : b.x;
      const y = (isSimulating && b.prevY !== undefined)
        ? b.prevY + (b.y - b.prevY) * alpha
        : b.y;

      const def = BALL_DEFS[b.id];
      if (!def) continue;

      ctx.save();

      // 1. Soft 3D Ambient Drop Shadow
      if (!b.isSinking) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(x + 2, y + 3, radius * 0.95, radius * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Base Sphere Fill with 3D Shading
      const sphereGrad = ctx.createRadialGradient(
        x - radius * 0.35, y - radius * 0.35, radius * 0.1,
        x, y, radius
      );

      if (def.type === 'cue') {
        sphereGrad.addColorStop(0, '#ffffff');
        sphereGrad.addColorStop(0.7, '#e2e8f0');
        sphereGrad.addColorStop(1, '#94a3b8');
        ctx.fillStyle = sphereGrad;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (def.type === 'solid' || def.type === '8ball') {
        sphereGrad.addColorStop(0, this.lightenColor(def.color, 45));
        sphereGrad.addColorStop(0.55, def.color);
        sphereGrad.addColorStop(1, this.darkenColor(def.color, 45));
        ctx.fillStyle = sphereGrad;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (def.type === 'stripe') {
        // White sphere background
        sphereGrad.addColorStop(0, '#ffffff');
        sphereGrad.addColorStop(0.7, '#f1f5f9');
        sphereGrad.addColorStop(1, '#cbd5e1');
        ctx.fillStyle = sphereGrad;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Thick colored middle stripe
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.clip();

        const stripeH = radius * 1.1;
        const stripeGrad = ctx.createLinearGradient(x, y - stripeH / 2, x, y + stripeH / 2);
        stripeGrad.addColorStop(0, this.lightenColor(def.color, 30));
        stripeGrad.addColorStop(0.5, def.color);
        stripeGrad.addColorStop(1, this.darkenColor(def.color, 30));
        ctx.fillStyle = stripeGrad;
        ctx.fillRect(x - radius, y - stripeH / 2, radius * 2, stripeH);
        ctx.restore();
      }

      // 3. Center Number Badge
      if (def.number > 0 && scale > 0.6) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.44, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        const fontSize = Math.max(7, Math.round(radius * 0.6));
        ctx.font = `800 ${fontSize}px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(def.number.toString(), x, y + 0.5);
      }

      // 4. Specular Glass Glint
      if (!b.isSinking) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.beginPath();
        ctx.ellipse(x - radius * 0.35, y - radius * 0.38, radius * 0.3, radius * 0.18, -Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // -------------------------------------------------------------
  // AIMING & GUIDELINE RENDERING
  // -------------------------------------------------------------
  private renderAimingGuide(
    ctx: CanvasRenderingContext2D,
    cue: PoolBall,
    trajectory: TrajectoryPreview
  ) {
    ctx.save();

    // 1. Cue ball path ray
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(cue.x, cue.y);
    ctx.lineTo(trajectory.ghostBallX, trajectory.ghostBallY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Ghost Ball at contact point
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.arc(trajectory.ghostBallX, trajectory.ghostBallY, cue.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 3. Target Ball Trajectory (if ball hit)
    if (trajectory.hitBallId !== null) {
      const arrowLen = 60;
      const targetEndX = trajectory.ghostBallX + trajectory.targetDirX * arrowLen;
      const targetEndY = trajectory.ghostBallY + trajectory.targetDirY * arrowLen;

      // Target arrow line
      ctx.strokeStyle = '#facc15'; // Bright yellow path
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(trajectory.ghostBallX, trajectory.ghostBallY);
      ctx.lineTo(targetEndX, targetEndY);
      ctx.stroke();

      // Cue Deflection line
      const cueDeflectLen = 40;
      const cueEndX = trajectory.ghostBallX + trajectory.cueDeflectX * cueDeflectLen;
      const cueEndY = trajectory.ghostBallY + trajectory.cueDeflectY * cueDeflectLen;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(trajectory.ghostBallX, trajectory.ghostBallY);
      ctx.lineTo(cueEndX, cueEndY);
      ctx.stroke();
    }

    ctx.restore();
  }

  // -------------------------------------------------------------
  // CUE STICK RENDERING
  // -------------------------------------------------------------
  private renderCueStick(
    ctx: CanvasRenderingContext2D,
    cue: PoolBall,
    angle: number,
    power: number,
    isAiming: boolean
  ) {
    ctx.save();
    ctx.translate(cue.x, cue.y);
    ctx.rotate(angle);

    // Pullback proportional to power (0px up to 55px)
    const pullBack = 8 + power * 50;
    const stickLen = 320;
    const startX = -cue.radius - pullBack;

    // Glowing tactile feedback when actively aiming or dragging stick
    if (isAiming) {
      ctx.shadowColor = 'rgba(56, 189, 248, 0.65)';
      ctx.shadowBlur = 10;
    }

    // 1. Leather Tip (Blue chalked tip)
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(startX - 4, -2, 4, 4);

    // 2. Brass Ferrule
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(startX - 12, -2.5, 8, 5);

    // 3. Maple Shaft (tapered)
    const shaftGrad = ctx.createLinearGradient(startX - 12, 0, startX - stickLen * 0.65, 0);
    shaftGrad.addColorStop(0, '#fef08a');
    shaftGrad.addColorStop(0.65, '#eab308');
    shaftGrad.addColorStop(1, '#854d0e');

    ctx.fillStyle = shaftGrad;
    ctx.beginPath();
    ctx.moveTo(startX - 12, -2.5);
    ctx.lineTo(startX - stickLen * 0.65, -4);
    ctx.lineTo(startX - stickLen * 0.65, 4);
    ctx.lineTo(startX - 12, 2.5);
    ctx.closePath();
    ctx.fill();

    // 4. Dark Wood Butt & Grip
    const buttGrad = ctx.createLinearGradient(startX - stickLen * 0.65, 0, startX - stickLen, 0);
    buttGrad.addColorStop(0, '#1c1917');
    buttGrad.addColorStop(0.5, '#44403c');
    buttGrad.addColorStop(1, '#0c0a09');

    ctx.fillStyle = buttGrad;
    ctx.beginPath();
    ctx.moveTo(startX - stickLen * 0.65, -4);
    ctx.lineTo(startX - stickLen, -5.5);
    ctx.lineTo(startX - stickLen, 5.5);
    ctx.lineTo(startX - stickLen * 0.65, 4);
    ctx.closePath();
    ctx.fill();

    // 5. Decorative Ring Inlays & Grip Rings
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    const ring1 = startX - stickLen * 0.66;
    ctx.beginPath();
    ctx.moveTo(ring1, -4.2);
    ctx.lineTo(ring1, 4.2);
    ctx.stroke();

    const ring2 = startX - stickLen * 0.90;
    ctx.beginPath();
    ctx.moveTo(ring2, -5.2);
    ctx.lineTo(ring2, 5.2);
    ctx.stroke();

    // Subtle tactile grip ribs
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    for (let rx = startX - stickLen * 0.72; rx >= startX - stickLen * 0.85; rx -= 7) {
      ctx.beginPath();
      ctx.moveTo(rx, -4.5);
      ctx.lineTo(rx, 4.5);
      ctx.stroke();
    }

    // Rubber bumper cap at butt end
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(startX - stickLen - 4, -4.5, 4, 9);

    ctx.restore();
  }

  private renderBallInHandGuide(ctx: CanvasRenderingContext2D, cue: PoolBall, isPlayer: boolean, isKitchenOnly: boolean = false) {
    ctx.save();

    if (isKitchenOnly) {
      // Highlight the legal kitchen zone (behind head string)
      const kitchenGrad = ctx.createLinearGradient(PLAY_X_MIN, 0, HEAD_STRING_X, 0);
      kitchenGrad.addColorStop(0, isPlayer ? 'rgba(56, 189, 248, 0.04)' : 'rgba(251, 191, 36, 0.03)');
      kitchenGrad.addColorStop(1, isPlayer ? 'rgba(56, 189, 248, 0.15)' : 'rgba(251, 191, 36, 0.12)');
      ctx.fillStyle = kitchenGrad;
      ctx.fillRect(PLAY_X_MIN, PLAY_Y_MIN, HEAD_STRING_X - PLAY_X_MIN, PLAY_Y_MAX - PLAY_Y_MIN);

      // Glowing dashed kitchen border (head string)
      ctx.strokeStyle = isPlayer ? 'rgba(56, 189, 248, 0.9)' : 'rgba(251, 191, 36, 0.9)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(HEAD_STRING_X, PLAY_Y_MIN);
      ctx.lineTo(HEAD_STRING_X, PLAY_Y_MAX);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const time = Date.now() * 0.005;
    const pulseRadius = cue.radius + 6 + Math.sin(time) * 3;

    ctx.strokeStyle = isPlayer ? '#38bdf8' : '#fbbf24';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(cue.x, cue.y, pulseRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = isPlayer ? 'rgba(56, 189, 248, 0.95)' : 'rgba(251, 191, 36, 0.95)';
    ctx.font = '700 11px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';

    let guideText = '';
    if (isKitchenOnly) {
      guideText = isPlayer ? 'BREAK IN HAND (Place behind line)' : 'OPPONENT BREAK PLACEMENT';
    } else {
      guideText = isPlayer ? 'BALL IN HAND (Drag or tap to place)' : 'OPPONENT BALL IN HAND';
    }

    ctx.fillText(
      guideText,
      cue.x,
      cue.y - 22
    );

    ctx.restore();
  }

  // -------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------
  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number
  ) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  private lightenColor(hex: string, amount: number): string {
    return this.adjustColor(hex, amount);
  }

  private darkenColor(hex: string, amount: number): string {
    return this.adjustColor(hex, -amount);
  }

  private adjustColor(hex: string, amount: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    let r = (num >> 16) + amount;
    let g = ((num >> 8) & 0x00ff) + amount;
    let b = (num & 0x0000ff) + amount;

    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));

    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }
}
