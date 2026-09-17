import type { SheepSize, SheepSide } from '../sheep-types';
import { SHEEP_MODELS } from '../sheep-types';

export type SheepFacing = 'showcase' | 'front' | 'top' | 'top_up' | 'top_down' | 'top_east' | 'up' | 'down';
export type SheepView = 'front' | 'top';

export interface RenderSheepOptions {
  x: number;
  y: number;
  size: SheepSize;
  side: SheepSide;
  facing?: SheepFacing;
  view?: SheepView;                   // 'front' for front-facing portrait, 'top' for bird's-eye top view
  walkCycle?: number;                 // Animation angle in radians
  isPushing?: boolean;                // Clashing / headbutting state
  pushStrain?: number;                // 0 to 1 vibration strain
  scale?: number;                     // Multiplier scale
  rotation?: number;                  // Custom rotation in radians (used in top view)
}

export class SheepRenderer {
  /**
   * Main render function for a single sheep
   */
  public static renderSheep(ctx: CanvasRenderingContext2D, options: RenderSheepOptions) {
    const {
      x,
      y,
      size,
      side,
      facing = 'showcase',
      view,
      walkCycle = 0,
      isPushing = false,
      pushStrain = 0,
      scale = 1,
      rotation
    } = options;

    const isPlayer = side === 'player';

    // Team Color Palette
    const teamColors = isPlayer
      ? {
          primary: '#3b82f6',     // Bright Blue
          secondary: '#60a5fa',   // Sky Blue
          dark: '#1d4ed8',        // Royal Navy
          ring: '#93c5fd',        // Ice Blue
          woolTint: '#f8fafc',    // Pure White-Ice Wool
          woolShadow: '#cbd5e1'   // Cool Shadow
        }
      : {
          primary: '#ef4444',     // Crimson Red
          secondary: '#f87171',   // Coral Red
          dark: '#b91c1c',        // Deep Blood Red
          ring: '#fca5a5',        // Soft Rose
          woolTint: '#fff1f2',    // Warm Rose-White Wool
          woolShadow: '#fecdd3'   // Warm Shadow
        };

    const isTopView = view === 'top' || facing === 'top' || facing === 'top_up' || facing === 'top_down' || facing === 'top_east';

    if (isTopView) {
      this.renderTopViewSheep(ctx, {
        x,
        y,
        size,
        side,
        facing,
        walkCycle,
        isPushing,
        pushStrain,
        scale,
        rotation,
        teamColors
      });
    } else {
      this.renderFrontViewSheep(ctx, {
        x,
        y,
        size,
        side,
        facing,
        walkCycle,
        isPushing,
        pushStrain,
        scale,
        teamColors
      });
    }
  }

  // =========================================================================
  // TOP VIEW (BIRD'S-EYE VIEW FOR ALL SIZES)
  // =========================================================================
  private static renderTopViewSheep(
    ctx: CanvasRenderingContext2D,
    opts: {
      x: number;
      y: number;
      size: SheepSize;
      side: SheepSide;
      facing: SheepFacing;
      walkCycle: number;
      isPushing: boolean;
      pushStrain: number;
      scale: number;
      rotation?: number;
      teamColors: any;
    }
  ) {
    const { x, y, size, facing, walkCycle, isPushing, scale, rotation, teamColors } = opts;
    const def = SHEEP_MODELS[size];
    const r = def.radius * scale;

    // Determine angle (0 = facing North/Up, PI = South/Down, PI/2 = East/Right)
    let angle = 0;
    if (rotation !== undefined) {
      angle = rotation;
    } else if (facing === 'top_down' || facing === 'down') {
      angle = Math.PI;
    } else if (facing === 'top_east') {
      angle = Math.PI / 2;
    }

    // REQUIREMENT: "for the sheep animation when walking, i want it like 'lungs breathing' movement of each sheep, but stop turn to static when they already colliding."
    // When walking: rhythmic lungs-breathing expansion & contraction (chest/flank expands like inhaling air)
    // When colliding: ALL animation turns completely static (breathScale = 1.0, strides = 0, wag = 0, bob = 0)
    const breathRate = 0.85;
    const breathPhase = isPushing ? 0 : Math.sin(walkCycle * breathRate);
    const breathScaleX = isPushing ? 1.0 : (1.0 + breathPhase * 0.085);
    const breathScaleY = isPushing ? 1.0 : (1.0 + breathPhase * 0.045);

    const legPhase = isPushing ? 0 : Math.sin(walkCycle);
    const bob = isPushing ? 0 : Math.sin(walkCycle * breathRate) * (1.2 * scale);

    ctx.save();
    ctx.translate(x, y + bob);
    ctx.rotate(angle);

    // 1. Ground Drop Shadow (Elongated oval expanding with lung breath)
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.05 * breathScaleX, r * 1.25 * breathScaleY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Four Hooves (Trotting gait when walking, firmly static braced stance when colliding)
    this.renderTopHooves(ctx, r, legPhase, isPushing);

    // 3. Fluffy Tail (At the rear: y > 0, wagging when walking, static when colliding)
    this.renderTopTail(ctx, r, isPushing ? 0 : walkCycle, teamColors);

    // 4. Main Fluffy Wool Body (Breathing expansion when walking, static when colliding)
    ctx.save();
    ctx.scale(breathScaleX, breathScaleY);
    this.renderTopWoolBody(ctx, r, size, teamColors);
    ctx.restore();

    // 5. Head, Ears, Snout, and Horns (At the front: y < 0)
    this.renderTopHead(ctx, r, size, teamColors, isPushing, breathPhase);

    ctx.restore();
  }

  private static renderTopHooves(
    ctx: CanvasRenderingContext2D,
    r: number,
    legPhase: number,
    isPushing: boolean
  ) {
    ctx.fillStyle = '#1e293b';

    const hoofW = r * 0.22;
    const hoofH = r * 0.32;
    // Dynamic trotting stride when marching, rock-solid static braced hooves when colliding
    const stride1 = isPushing ? 0 : legPhase * (r * 0.20);
    const stride2 = isPushing ? 0 : -stride1;

    // Front Left Hoof
    ctx.beginPath();
    ctx.roundRect(-r * 0.65, -r * 0.52 + stride1, hoofW, hoofH, hoofW * 0.4);
    ctx.roundRect(r * 0.65 - hoofW, -r * 0.52 + stride2, hoofW, hoofH, hoofW * 0.4);
    ctx.roundRect(-r * 0.60, r * 0.50 + stride2, hoofW, hoofH, hoofW * 0.4);
    ctx.roundRect(r * 0.60 - hoofW, r * 0.50 + stride1, hoofW, hoofH, hoofW * 0.4);
    ctx.fill();
  }

  private static renderTopTail(
    ctx: CanvasRenderingContext2D,
    r: number,
    walkCycle: number,
    colors: any
  ) {
    const wagX = Math.sin(walkCycle * 4) * (r * 0.12);
    const tailY = r * 0.96;

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = colors.woolShadow;
    ctx.lineWidth = Math.max(1, r * 0.035);

    ctx.beginPath();
    ctx.arc(wagX, tailY, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  private static renderTopWoolBody(
    ctx: CanvasRenderingContext2D,
    r: number,
    size: SheepSize,
    colors: any
  ) {
    const puffCount = size === 'small' ? 8 : size === 'medium' ? 10 : size === 'big' ? 12 : 16;
    const puffRadius = size === 'small' ? r * 0.42 : size === 'medium' ? r * 0.38 : size === 'big' ? r * 0.35 : r * 0.32;

    // 1. Shaded base ellipse
    ctx.fillStyle = colors.woolShadow;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.90, r * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Perimeter puffs forming the cloud perimeter - BATCHED into a single path!
    ctx.fillStyle = colors.woolTint;
    ctx.strokeStyle = colors.woolShadow;
    ctx.lineWidth = Math.max(1, r * 0.04);

    ctx.beginPath();
    for (let i = 0; i < puffCount; i++) {
      const a = (i / puffCount) * Math.PI * 2;
      const px = Math.cos(a) * (r * 0.72);
      const py = Math.sin(a) * (r * 0.86);
      ctx.moveTo(px + puffRadius, py);
      ctx.arc(px, py, puffRadius, 0, Math.PI * 2);
    }
    // Also include dense center dome in single draw call
    ctx.moveTo(r * 0.75, 0);
    ctx.ellipse(0, 0, r * 0.75, r * 0.88, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 3. Wool Swirls on the back - BATCHED into single stroke!
    ctx.strokeStyle = colors.woolShadow;
    ctx.lineWidth = Math.max(1.2, r * 0.045);
    ctx.lineCap = 'round';

    const swirls = size === 'small'
      ? [{ x: -r * 0.22, y: -r * 0.1 }, { x: r * 0.22, y: r * 0.15 }]
      : size === 'medium'
      ? [{ x: -r * 0.28, y: -r * 0.2 }, { x: r * 0.28, y: -r * 0.2 }, { x: 0, y: r * 0.25 }]
      : size === 'big'
      ? [{ x: -r * 0.32, y: -r * 0.25 }, { x: r * 0.32, y: -r * 0.25 }, { x: -r * 0.22, y: r * 0.22 }, { x: r * 0.22, y: r * 0.22 }]
      : [{ x: -r * 0.35, y: -r * 0.3 }, { x: r * 0.35, y: -r * 0.3 }, { x: 0, y: 0 }, { x: -r * 0.28, y: r * 0.3 }, { x: r * 0.28, y: r * 0.3 }];

    ctx.beginPath();
    for (const sw of swirls) {
      const swR = r * 0.14;
      ctx.moveTo(sw.x + swR, sw.y);
      ctx.arc(sw.x, sw.y, swR, 0, Math.PI * 1.4);
    }
    ctx.stroke();
  }

  private static renderTopHead(
    ctx: CanvasRenderingContext2D,
    r: number,
    size: SheepSize,
    colors: any,
    isPushing: boolean,
    breathPhase: number = 0
  ) {
    ctx.save();

    // In top view, head extends forward at y < 0
    let headCenterY = -r * 0.76;
    if (isPushing) {
      headCenterY -= r * 0.1;
    } else {
      headCenterY += breathPhase * (r * 0.025);
    }

    ctx.translate(0, headCenterY);

    const headW = r * 0.54;
    const headH = r * 0.72;
    const skinTone = size === 'small' ? '#ffe4e6' : size === 'medium' ? '#fcd34d' : size === 'big' ? '#cbd5e1' : '#94a3b8';
    const darkSkin = size === 'small' ? '#f43f5e' : size === 'medium' ? '#b45309' : size === 'big' ? '#475569' : '#334155';

    // A. HORNS (Top-Down Curl)
    this.renderTopHorns(ctx, r, size, colors);

    // B. EARS (Protruding outward left and right)
    this.renderTopEars(ctx, r, size, skinTone);

    // C. HEAD / SNOUT OVAL (Seen from above)
    ctx.fillStyle = skinTone;
    ctx.strokeStyle = darkSkin;
    ctx.lineWidth = Math.max(1, r * 0.035);

    ctx.beginPath();
    // Tapered snout pointing forward
    ctx.moveTo(-headW * 0.45, headH * 0.35);
    ctx.lineTo(-headW * 0.45, -headH * 0.1);
    ctx.quadraticCurveTo(-headW * 0.35, -headH * 0.55, 0, -headH * 0.55);
    ctx.quadraticCurveTo(headW * 0.35, -headH * 0.55, headW * 0.45, -headH * 0.1);
    ctx.lineTo(headW * 0.45, headH * 0.35);
    ctx.quadraticCurveTo(0, headH * 0.55, -headW * 0.45, headH * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Snout Tip & Nostrils (at the top tip -headH * 0.55)
    ctx.fillStyle = size === 'small' ? '#fb7185' : '#78350f';
    ctx.beginPath();
    if (size === 'small') {
      ctx.arc(0, -headH * 0.46, headW * 0.15, 0, Math.PI * 2);
    } else {
      ctx.ellipse(0, -headH * 0.46, headW * 0.20, headH * 0.08, 0, 0, Math.PI * 2);
    }
    ctx.fill();

    // Two small nostril dots
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(-headW * 0.08, -headH * 0.46, 1.2, 0, Math.PI * 2);
    ctx.arc(headW * 0.08, -headH * 0.46, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // EYES from Top View (peeking on the lateral sides of the head)
    this.renderTopEyes(ctx, r, size, headW, headH);

    // Forehead Wool Tuft
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = colors.woolShadow;
    ctx.lineWidth = Math.max(1, r * 0.035);

    ctx.beginPath();
    ctx.arc(0, -headH * 0.05, headW * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-headW * 0.25, 0, headW * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(headW * 0.25, 0, headW * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Armor / Equipment (Top View)
    this.renderTopArmor(ctx, r, size, headW, headH, colors);

    ctx.restore();
  }

  private static renderTopEyes(
    ctx: CanvasRenderingContext2D,
    r: number,
    size: SheepSize,
    headW: number,
    headH: number
  ) {
    const eyeX = headW * 0.44;
    const eyeY = -headH * 0.25;

    for (const s of [-1, 1]) {
      const ex = s * eyeX;

      if (size === 'giant') {
        // Glowing fiery warrior eye
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(ex, eyeY, r * 0.11, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#000000';
        ctx.fillRect(ex - 1, eyeY - r * 0.08, 2, r * 0.16);
      } else {
        const eyeR = size === 'small' ? r * 0.13 : r * 0.10;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeR, 0, Math.PI * 2);
        ctx.fill();

        // Sparkle
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ex - s * 1, eyeY - 1, eyeR * 0.38, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private static renderTopEars(
    ctx: CanvasRenderingContext2D,
    r: number,
    size: SheepSize,
    skinTone: string
  ) {
    const earW = r * 0.46;
    const earH = r * 0.22;

    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * (r * 0.35), 0);
      ctx.rotate(s * (size === 'small' ? 0.4 : 0.25));

      // Outer Ear
      ctx.fillStyle = skinTone;
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = Math.max(1, r * 0.03);
      ctx.beginPath();
      ctx.ellipse(0, 0, earW, earH, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Pink Inner Ear
      ctx.fillStyle = '#fda4af';
      ctx.beginPath();
      ctx.ellipse(0, 0, earW * 0.65, earH * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  private static renderTopHorns(
    ctx: CanvasRenderingContext2D,
    r: number,
    size: SheepSize,
    colors: any
  ) {
    if (size === 'small') {
      // Bandana knot visible from top
      ctx.fillStyle = colors.primary;
      ctx.beginPath();
      ctx.arc(0, r * 0.28, r * 0.14, 0, Math.PI * 2);
      ctx.fill();

      // Bandana fluttering tails
      ctx.beginPath();
      ctx.moveTo(-4, r * 0.32);
      ctx.lineTo(-r * 0.24, r * 0.48);
      ctx.lineTo(0, r * 0.38);
      ctx.lineTo(r * 0.24, r * 0.48);
      ctx.lineTo(4, r * 0.32);
      ctx.closePath();
      ctx.fill();
      return;
    }

    if (size === 'medium') {
      // Curved ram horns curling from crown around ears forward
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(s * (r * 0.28), -r * 0.08);

        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = r * 0.18;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.28, s === 1 ? -Math.PI * 0.7 : -Math.PI * 0.3, s === 1 ? Math.PI * 0.4 : Math.PI * 0.6, s === -1);
        ctx.stroke();

        // Highlight spine
        ctx.strokeStyle = '#fde68a';
        ctx.lineWidth = r * 0.05;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.28, s === 1 ? -Math.PI * 0.6 : -Math.PI * 0.4, s === 1 ? Math.PI * 0.2 : Math.PI * 0.4, s === -1);
        ctx.stroke();

        ctx.restore();
      }
    } else if (size === 'big') {
      // Thick spiral battering horns with ribbed segments
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(s * (r * 0.34), -r * 0.12);

        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = r * 0.26;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.38, s === 1 ? -Math.PI * 0.8 : -Math.PI * 0.2, s === 1 ? Math.PI * 0.5 : Math.PI * 0.5, s === -1);
        ctx.stroke();

        // Bright ridge
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = r * 0.07;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.38, s === 1 ? -Math.PI * 0.65 : -Math.PI * 0.35, s === 1 ? Math.PI * 0.3 : Math.PI * 0.3, s === -1);
        ctx.stroke();

        // Ribbed Segments
        ctx.strokeStyle = '#292524';
        ctx.lineWidth = 1.8;
        for (let seg = 0; seg < 4; seg++) {
          const a = -0.5 + (seg / 4) * 1.4;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.25 * s, Math.sin(a) * r * 0.25);
          ctx.lineTo(Math.cos(a) * r * 0.52 * s, Math.sin(a) * r * 0.52);
          ctx.stroke();
        }

        ctx.restore();
      }
    } else {
      // Giant Mammoth Horns: Massive double-swept horns spreading beyond shoulders
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(s * (r * 0.40), -r * 0.15);

        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = r * 0.35;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.52, s === 1 ? -Math.PI * 0.85 : -Math.PI * 0.15, s === 1 ? Math.PI * 0.65 : Math.PI * 0.35, s === -1);
        ctx.stroke();

        // Warm amber midtone ridge
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = r * 0.12;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.52, s === 1 ? -Math.PI * 0.75 : -Math.PI * 0.25, s === 1 ? Math.PI * 0.5 : Math.PI * 0.25, s === -1);
        ctx.stroke();

        // Golden Tip
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(s * r * 0.42, r * 0.32, r * 0.14, 0, Math.PI * 2);
        ctx.fill();

        // Battle Ridges
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.lineWidth = 2.2;
        for (let seg = 0; seg < 6; seg++) {
          const a = -0.6 + (seg / 6) * 1.6;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.35 * s, Math.sin(a) * r * 0.35);
          ctx.lineTo(Math.cos(a) * r * 0.70 * s, Math.sin(a) * r * 0.70);
          ctx.stroke();
        }

        ctx.restore();
      }
    }
  }

  private static renderTopArmor(
    ctx: CanvasRenderingContext2D,
    r: number,
    size: SheepSize,
    headW: number,
    headH: number,
    colors: any
  ) {
    if (size === 'big') {
      // Iron Headplate (Top view: band across snout ridge)
      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.roundRect(-headW * 0.36, -headH * 0.38, headW * 0.72, headH * 0.20, 3);
      ctx.fill();
      ctx.stroke();

      // Steel Rivets
      ctx.fillStyle = '#e2e8f0';
      [-headW * 0.22, 0, headW * 0.22].forEach(rvX => {
        ctx.beginPath();
        ctx.arc(rvX, -headH * 0.28, 1.8, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (size === 'giant') {
      // Golden Crown War Plate & Gem (High performance solid fill with gold sheen)
      ctx.fillStyle = '#ca8a04';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.8;

      ctx.beginPath();
      ctx.roundRect(-headW * 0.42, -headH * 0.40, headW * 0.84, headH * 0.25, 4);
      ctx.fill();
      ctx.stroke();

      // Gold top highlight
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(-headW * 0.35, -headH * 0.38, headW * 0.70, 2);

      // Glowing Center Crest Gem
      ctx.fillStyle = colors.primary;
      ctx.beginPath();
      ctx.arc(0, -headH * 0.28, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }


  // =========================================================================
  // FRONT VIEW (3/4 FRONT VIEW AS USER PREVIOUSLY APPROVED)
  // =========================================================================
  private static renderFrontViewSheep(
    ctx: CanvasRenderingContext2D,
    opts: {
      x: number;
      y: number;
      size: SheepSize;
      side: SheepSide;
      facing: SheepFacing;
      walkCycle: number;
      isPushing: boolean;
      pushStrain: number;
      scale: number;
      teamColors: any;
    }
  ) {
    const { x, y, size, facing, walkCycle, isPushing, pushStrain, scale, teamColors } = opts;
    const def = SHEEP_MODELS[size];
    const r = def.radius * scale;

    const breathRate = 0.85;
    const breathPhase = isPushing ? 0 : Math.sin(walkCycle * breathRate);
    const breathScaleX = isPushing ? 1.0 : (1.0 + breathPhase * 0.08);
    const breathScaleY = isPushing ? 1.0 : (1.0 + breathPhase * 0.045);

    const legPhase = isPushing ? 0 : Math.sin(walkCycle);
    const bob = isPushing ? 0 : Math.sin(walkCycle * breathRate) * (1.5 * scale);

    ctx.save();
    ctx.translate(x, y + bob);

    // 1. Soft Ground Drop Shadow
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
    ctx.beginPath();
    const shadowStretch = isPushing ? 1.2 : (1 + Math.abs(legPhase) * 0.1) * breathScaleX;
    ctx.ellipse(0, r * 0.85, r * 1.05 * shadowStretch, r * 0.45 * breathScaleY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Animated Legs / Hooves (dynamic stride when marching, static stance when colliding)
    this.renderFrontHooves(ctx, r, legPhase, isPushing);

    // 3. Fluffy Wool Cloud Body (lungs breathing expansion when walking, static when pushing)
    ctx.save();
    ctx.scale(breathScaleX, breathScaleY);
    this.renderFrontWoolBody(ctx, r, size, teamColors);
    ctx.restore();

    // 4. Little Fluffy Tail (static when pushing)
    this.renderFrontTail(ctx, r, isPushing ? 0 : walkCycle, teamColors);

    // 5. Head, Horns, Face, and Armor
    this.renderFrontHead(ctx, r, size, teamColors, isPushing);

    // 6. Push Sparks / Strain VFX (if headbutting)
    if (isPushing) {
      this.renderFrontPushEffects(ctx, r, pushStrain, facing);
    }

    ctx.restore();
  }

  private static renderFrontHooves(
    ctx: CanvasRenderingContext2D,
    r: number,
    legPhase: number,
    isPushing: boolean
  ) {
    ctx.save();
    ctx.fillStyle = '#1e293b';

    const hoofW = r * 0.22;
    const hoofH = r * 0.32;
    const swing = isPushing ? 0 : legPhase * (r * 0.25);

    // Front Left Hoof
    ctx.beginPath();
    ctx.roundRect(-r * 0.6 + swing, r * 0.55, hoofW, hoofH, hoofW * 0.4);
    ctx.fill();

    // Front Right Hoof
    ctx.beginPath();
    ctx.roundRect(r * 0.6 - hoofW - swing, r * 0.55, hoofW, hoofH, hoofW * 0.4);
    ctx.fill();

    // Back Hooves
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(-r * 0.35 - swing * 0.8, r * 0.48, hoofW * 0.9, hoofH * 0.8, hoofW * 0.4);
    ctx.fill();

    ctx.beginPath();
    ctx.roundRect(r * 0.35 - hoofW * 0.9 + swing * 0.8, r * 0.48, hoofW * 0.9, hoofH * 0.8, hoofW * 0.4);
    ctx.fill();

    ctx.restore();
  }

  private static renderFrontWoolBody(
    ctx: CanvasRenderingContext2D,
    r: number,
    size: SheepSize,
    colors: any
  ) {
    ctx.save();

    const puffCount = size === 'small' ? 7 : size === 'medium' ? 9 : size === 'big' ? 11 : 14;
    const puffRadius = size === 'small' ? r * 0.42 : size === 'medium' ? r * 0.38 : size === 'big' ? r * 0.35 : r * 0.32;

    ctx.fillStyle = colors.woolShadow;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.95, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = colors.woolTint;
    ctx.strokeStyle = colors.woolShadow;
    ctx.lineWidth = Math.max(1, r * 0.04);

    ctx.beginPath();
    for (let i = 0; i < puffCount; i++) {
      const angle = (i / puffCount) * Math.PI * 2;
      const dist = r * 0.72;
      const px = Math.cos(angle) * dist;
      const py = Math.sin(angle) * (dist * 0.85);

      ctx.moveTo(px + puffRadius, py);
      ctx.arc(px, py, puffRadius, 0, Math.PI * 2);
    }
    ctx.moveTo(r * 0.75, 0);
    ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  private static renderFrontTail(
    ctx: CanvasRenderingContext2D,
    r: number,
    walkCycle: number,
    colors: any
  ) {
    ctx.save();
    const wag = Math.sin(walkCycle * 3) * (r * 0.12);
    const tailY = r * 0.68;

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = colors.woolShadow;
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    ctx.arc(wag, tailY, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  private static renderFrontHead(
    ctx: CanvasRenderingContext2D,
    r: number,
    size: SheepSize,
    colors: any,
    isPushing: boolean
  ) {
    ctx.save();

    let headY = -r * 0.25;
    if (isPushing) {
      headY += r * 0.12;
    }

    ctx.translate(0, headY);

    const headW = r * 0.58;
    const headH = r * 0.68;
    const skinTone = size === 'small' ? '#ffe4e6' : size === 'medium' ? '#fcd34d' : size === 'big' ? '#cbd5e1' : '#94a3b8';
    const darkSkin = size === 'small' ? '#f43f5e' : size === 'medium' ? '#b45309' : size === 'big' ? '#475569' : '#334155';

    // A. HORNS
    this.renderFrontHorns(ctx, r, size);

    // B. EARS
    this.renderFrontEars(ctx, r, size, skinTone);

    // C. HEAD SHAPE
    ctx.fillStyle = skinTone;
    ctx.strokeStyle = darkSkin;
    ctx.lineWidth = Math.max(1, r * 0.035);

    ctx.beginPath();
    ctx.ellipse(0, 0, headW * 0.85, headH * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Muzzle / Snout Base
    ctx.fillStyle = size === 'small' ? '#fecdd3' : '#fef3c7';
    ctx.beginPath();
    ctx.ellipse(0, headH * 0.32, headW * 0.52, headH * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();

    // Nose & Nostrils
    ctx.fillStyle = size === 'small' ? '#fb7185' : '#78350f';
    ctx.beginPath();
    if (size === 'small') {
      ctx.arc(0, headH * 0.22, headW * 0.14, 0, Math.PI * 2);
    } else {
      ctx.ellipse(0, headH * 0.22, headW * 0.18, headH * 0.1, 0, 0, Math.PI * 2);
    }
    ctx.fill();

    // Mouth
    ctx.strokeStyle = size === 'small' ? '#e11d48' : '#78350f';
    ctx.lineWidth = Math.max(1, r * 0.04);
    ctx.beginPath();
    ctx.moveTo(-headW * 0.14, headH * 0.42);
    ctx.quadraticCurveTo(0, headH * 0.52, headW * 0.14, headH * 0.42);
    ctx.stroke();

    // EYES
    this.renderFrontEyes(ctx, r, size, headW, headH, isPushing);

    // Pink Blush on Lamb
    if (size === 'small') {
      ctx.fillStyle = 'rgba(244, 63, 94, 0.45)';
      ctx.beginPath();
      ctx.arc(-headW * 0.52, headH * 0.25, r * 0.13, 0, Math.PI * 2);
      ctx.arc(headW * 0.52, headH * 0.25, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }

    // Forehead Tuft
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = colors.woolShadow;
    ctx.lineWidth = Math.max(1, r * 0.035);

    ctx.beginPath();
    ctx.arc(0, -headH * 0.55, headW * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-headW * 0.28, -headH * 0.45, headW * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(headW * 0.28, -headH * 0.45, headW * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Armor
    this.renderFrontArmor(ctx, r, size, headW, headH, colors);

    ctx.restore();
  }

  private static renderFrontEyes(
    ctx: CanvasRenderingContext2D,
    r: number,
    size: SheepSize,
    headW: number,
    headH: number,
    isPushing: boolean
  ) {
    ctx.save();
    const eyeOffsetX = headW * 0.38;
    const eyeOffsetY = -headH * 0.05;

    if (size === 'small') {
      const eyeR = r * 0.18;
      for (const side of [-1, 1]) {
        const ex = side * eyeOffsetX;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(ex, eyeOffsetY, eyeR, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ex - eyeR * 0.3, eyeOffsetY - eyeR * 0.3, eyeR * 0.42, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(ex + eyeR * 0.3, eyeOffsetY + eyeR * 0.3, eyeR * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (size === 'medium') {
      const eyeR = r * 0.14;
      for (const side of [-1, 1]) {
        const ex = side * eyeOffsetX;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(ex, eyeOffsetY, eyeR, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ex - eyeR * 0.25, eyeOffsetY - eyeR * 0.25, eyeR * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (size === 'big') {
      for (const side of [-1, 1]) {
        const ex = side * eyeOffsetX;
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = Math.max(1.8, r * 0.05);
        ctx.beginPath();
        ctx.moveTo(ex - side * r * 0.15, eyeOffsetY - r * 0.18);
        ctx.lineTo(ex + side * r * 0.12, eyeOffsetY - r * 0.08);
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.ellipse(ex, eyeOffsetY, r * 0.12, r * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ex, eyeOffsetY - 1, r * 0.04, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      for (const side of [-1, 1]) {
        const ex = side * eyeOffsetX;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.moveTo(ex - side * r * 0.2, eyeOffsetY - r * 0.2);
        ctx.lineTo(ex + side * r * 0.15, eyeOffsetY - r * 0.08);
        ctx.lineTo(ex - side * r * 0.05, eyeOffsetY - r * 0.02);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = isPushing ? '#ef4444' : '#f59e0b';
        ctx.beginPath();
        ctx.ellipse(ex, eyeOffsetY, r * 0.13, r * 0.08, side * 0.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#000000';
        ctx.fillRect(ex - 1, eyeOffsetY - r * 0.07, 2, r * 0.14);
      }
    }
    ctx.restore();
  }

  private static renderFrontEars(
    ctx: CanvasRenderingContext2D,
    r: number,
    size: SheepSize,
    skinTone: string
  ) {
    ctx.save();
    const earW = r * 0.42;
    const earH = r * 0.22;

    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * (r * 0.45), -r * 0.1);
      ctx.rotate(side * (size === 'small' ? 0.35 : 0.15));

      ctx.fillStyle = skinTone;
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = Math.max(1, r * 0.03);
      ctx.beginPath();
      ctx.ellipse(0, 0, earW, earH, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fda4af';
      ctx.beginPath();
      ctx.ellipse(0, 0, earW * 0.65, earH * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
    ctx.restore();
  }

  private static renderFrontHorns(
    ctx: CanvasRenderingContext2D,
    r: number,
    size: SheepSize
  ) {
    if (size === 'small') {
      ctx.save();
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(-r * 0.3, -r * 0.42, r * 0.09, 0, Math.PI * 2);
      ctx.arc(r * 0.3, -r * 0.42, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();

    if (size === 'medium') {
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * (r * 0.38), -r * 0.38);
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = r * 0.18;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(side * r * 0.05, 0, r * 0.26, side === 1 ? -Math.PI * 0.4 : Math.PI * 0.8, side === 1 ? Math.PI * 0.6 : -Math.PI * 0.2, side === -1);
        ctx.stroke();
        ctx.restore();
      }
    } else if (size === 'big') {
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * (r * 0.46), -r * 0.44);
        const hornGrad = ctx.createLinearGradient(0, -r * 0.3, 0, r * 0.3);
        hornGrad.addColorStop(0, '#78350f');
        hornGrad.addColorStop(0.5, '#b45309');
        hornGrad.addColorStop(1, '#f59e0b');
        ctx.strokeStyle = hornGrad;
        ctx.lineWidth = r * 0.28;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.36, side === 1 ? -Math.PI * 0.6 : -Math.PI * 0.4, side === 1 ? Math.PI * 0.7 : Math.PI * 0.3, side === -1);
        ctx.stroke();
        ctx.restore();
      }
    } else {
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * (r * 0.52), -r * 0.48);
        const megaGrad = ctx.createLinearGradient(0, -r * 0.5, 0, r * 0.5);
        megaGrad.addColorStop(0, '#1c1917');
        megaGrad.addColorStop(0.4, '#78350f');
        megaGrad.addColorStop(0.8, '#d97706');
        megaGrad.addColorStop(1, '#fbbf24');
        ctx.strokeStyle = megaGrad;
        ctx.lineWidth = r * 0.38;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.48, side === 1 ? -Math.PI * 0.8 : -Math.PI * 0.2, side === 1 ? Math.PI * 0.85 : Math.PI * 0.15, side === -1);
        ctx.stroke();
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(side * r * 0.4, r * 0.42, r * 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.restore();
  }

  private static renderFrontArmor(
    ctx: CanvasRenderingContext2D,
    r: number,
    size: SheepSize,
    headW: number,
    headH: number,
    colors: any
  ) {
    if (size === 'small') {
      ctx.fillStyle = colors.primary;
      ctx.beginPath();
      ctx.roundRect(-headW * 0.4, -headH * 0.32, headW * 0.8, headH * 0.18, 3);
      ctx.fill();
    } else if (size === 'big') {
      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-headW * 0.38, -headH * 0.36, headW * 0.76, headH * 0.24, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#e2e8f0';
      [-headW * 0.24, 0, headW * 0.24].forEach(rvX => {
        ctx.beginPath();
        ctx.arc(rvX, -headH * 0.24, 2, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (size === 'giant') {
      const goldGrad = ctx.createLinearGradient(-headW * 0.4, 0, headW * 0.4, 0);
      goldGrad.addColorStop(0, '#b45309');
      goldGrad.addColorStop(0.5, '#fde047');
      goldGrad.addColorStop(1, '#b45309');

      ctx.fillStyle = goldGrad;
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-headW * 0.45, -headH * 0.38);
      ctx.lineTo(headW * 0.45, -headH * 0.38);
      ctx.lineTo(headW * 0.25, -headH * 0.12);
      ctx.lineTo(-headW * 0.25, -headH * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = colors.primary;
      ctx.beginPath();
      ctx.arc(0, -headH * 0.25, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private static renderFrontPushEffects(
    ctx: CanvasRenderingContext2D,
    r: number,
    strain: number,
    facing: SheepFacing
  ) {
    ctx.save();
    const clashY = facing === 'up' ? -r * 0.95 : facing === 'down' ? r * 0.85 : 0;

    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, clashY, r * 0.25 * (0.8 + strain * 0.5), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(-r * 0.7, r * 0.5, r * 0.18, 0, Math.PI * 2);
    ctx.arc(r * 0.7, r * 0.5, r * 0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
