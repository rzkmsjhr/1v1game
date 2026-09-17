import type { SheepFightState } from '../sheep-types';
import { SHEEP_CONSTANTS } from '../sheep-constants';
import { SheepRenderer } from './SheepRenderer';

export class SheepFightRenderer {
  private ctx: CanvasRenderingContext2D;
  private animTimer: number = 0;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  public render(state: SheepFightState, dt: number = 0.016) {
    this.animTimer += dt;
    const ctx = this.ctx;
    const w = SHEEP_CONSTANTS.VIEWPORT_WIDTH;
    const h = SHEEP_CONSTANTS.VIEWPORT_HEIGHT;

    ctx.save();
    ctx.fillStyle = '#064e3b';
    ctx.fillRect(0, 0, w, h);

    // 1. Draw 5 Pasture Lanes (Requirement 1: Alternating dark/light green grass, thin dirt separators)
    this.renderPastureLanes();

    // 2. Draw Start Spaces (Deployment Zones) & Clearance Indicators
    this.renderStartSpaces(state);

    // 3. Draw All Active Sheep
    this.renderSheepEntities(state);

    // 4. Draw Clash Sparks & Live Strength Badges
    this.renderClashEffectsAndBadges(state);

    // 5. Draw Lane Completed / Draw Barricades
    this.renderLaneOverlays(state);

    // 6. Draw Goal Headers & Sudden Death Alert
    this.renderFieldHeaders(state);

    ctx.restore();
  }

  /**
   * REQUIREMENT 1: 5 lanes, all green grass view, 1 lane dark green, 1 lane light green,
   * separated with thin line of dirt color
   */
  private renderPastureLanes() {
    const ctx = this.ctx;
    const numLanes = SHEEP_CONSTANTS.NUM_LANES;
    const laneW = (SHEEP_CONSTANTS.VIEWPORT_WIDTH - 2 * SHEEP_CONSTANTS.LANE_MARGIN_X) / numLanes;
    const topY = SHEEP_CONSTANTS.LANE_TOP_Y;
    const bottomY = SHEEP_CONSTANTS.LANE_BOTTOM_Y;
    const laneH = bottomY - topY;

    // Background base
    ctx.fillStyle = '#064e3b';
    ctx.fillRect(0, 0, SHEEP_CONSTANTS.VIEWPORT_WIDTH, SHEEP_CONSTANTS.VIEWPORT_HEIGHT);

    for (let i = 0; i < numLanes; i++) {
      const lx = SHEEP_CONSTANTS.LANE_MARGIN_X + i * laneW;
      const isDark = (i % 2 === 0);

      // Grass base color
      ctx.fillStyle = isDark ? SHEEP_CONSTANTS.COLORS.DARK_GRASS : SHEEP_CONSTANTS.COLORS.LIGHT_GRASS;
      ctx.fillRect(lx, topY, laneW, laneH);

      // Subtle mowed grass striping texture
      ctx.fillStyle = isDark ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.05)';
      const stripeH = 30;
      for (let sy = topY; sy < bottomY; sy += stripeH * 2) {
        ctx.fillRect(lx, sy, laneW, stripeH);
      }

      // Thin Dirt Separators between lanes
      if (i > 0) {
        ctx.fillStyle = SHEEP_CONSTANTS.COLORS.DIRT_SEPARATOR;
        ctx.fillRect(lx - 2, topY, 4, laneH);

        // Highlight line on dirt
        ctx.fillStyle = SHEEP_CONSTANTS.COLORS.DIRT_HIGHLIGHT;
        ctx.fillRect(lx - 0.5, topY, 1, laneH);
      }
    }

    // Outer Borders
    ctx.strokeStyle = SHEEP_CONSTANTS.COLORS.DIRT_SEPARATOR;
    ctx.lineWidth = 3;
    ctx.strokeRect(SHEEP_CONSTANTS.LANE_MARGIN_X, topY, numLanes * laneW, laneH);

    // Center Midfield Line (Dotted white)
    const midY = (topY + bottomY) / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(SHEEP_CONSTANTS.LANE_MARGIN_X, midY);
    ctx.lineTo(SHEEP_CONSTANTS.VIEWPORT_WIDTH - SHEEP_CONSTANTS.LANE_MARGIN_X, midY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /**
   * REQUIREMENT 3: Deployment "Start" space visualization
   */
  private renderStartSpaces(state: SheepFightState) {
    const ctx = this.ctx;
    const numLanes = SHEEP_CONSTANTS.NUM_LANES;
    const laneW = (SHEEP_CONSTANTS.VIEWPORT_WIDTH - 2 * SHEEP_CONSTANTS.LANE_MARGIN_X) / numLanes;
    const topY = SHEEP_CONSTANTS.LANE_TOP_Y;
    const bottomY = SHEEP_CONSTANTS.LANE_BOTTOM_Y;
    const depth = SHEEP_CONSTANTS.START_SPACE_DEPTH;

    for (let i = 0; i < numLanes; i++) {
      const lane = state.lanes[i];
      const lx = SHEEP_CONSTANTS.LANE_MARGIN_X + i * laneW;
      const cx = lx + laneW / 2;

      if (lane.status !== 'active') continue;

      // 1. Player Start Space (Bottom)
      const pStartY = bottomY - depth;
      if (lane.isPlayerStartBlocked) {
        // Red locked / occupied indicator
        ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
        ctx.fillRect(lx + 2, pStartY, laneW - 4, depth);

        // Lock icon
        ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
        ctx.font = '14px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔒 BLOCKED', cx, pStartY + depth / 2);
      } else {
        // Clear & Ready: Gentle pulsing guide
        const pulse = (Math.sin(this.animTimer * 4) + 1) * 0.5;
        ctx.fillStyle = `rgba(56, 189, 248, ${0.08 + pulse * 0.08})`;
        ctx.fillRect(lx + 2, pStartY, laneW - 4, depth);

        // Subtle chevron arrow pointing UP into battle
        ctx.strokeStyle = `rgba(56, 189, 248, ${0.4 + pulse * 0.4})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 12, pStartY + depth * 0.65);
        ctx.lineTo(cx, pStartY + depth * 0.35);
        ctx.lineTo(cx + 12, pStartY + depth * 0.65);
        ctx.stroke();
      }

      // Dotted boundary line for player start space
      ctx.strokeStyle = lane.isPlayerStartBlocked ? 'rgba(239, 68, 68, 0.4)' : 'rgba(56, 189, 248, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(lx, pStartY);
      ctx.lineTo(lx + laneW, pStartY);
      ctx.stroke();
      ctx.setLineDash([]);

      // 2. Opponent Start Space (Top)
      const oStartY = topY;
      if (lane.isOpponentStartBlocked) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
        ctx.fillRect(lx + 2, oStartY, laneW - 4, depth);
      }

      // Dotted boundary line for opponent start space
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(lx, oStartY + depth);
      ctx.lineTo(lx + laneW, oStartY + depth);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /**
   * Renders all active sheep entities in top-down perspective
   */
  private renderSheepEntities(state: SheepFightState) {
    const ctx = this.ctx;
    const numLanes = SHEEP_CONSTANTS.NUM_LANES;
    const laneW = (SHEEP_CONSTANTS.VIEWPORT_WIDTH - 2 * SHEEP_CONSTANTS.LANE_MARGIN_X) / numLanes;

    for (let i = 0; i < numLanes; i++) {
      const lane = state.lanes[i];
      const cx = SHEEP_CONSTANTS.LANE_MARGIN_X + i * laneW + laneW / 2;

      // Draw all sheep in lane
      for (const s of lane.sheep) {
        SheepRenderer.renderSheep(ctx, {
          x: cx,
          y: s.y,
          size: s.size,
          side: s.side,
          view: 'top',
          facing: s.side === 'player' ? 'top_up' : 'top_down',
          walkCycle: s.walkCycle,
          isPushing: s.isPushing,
          pushStrain: s.pushStrain,
          scale: 1.0
        });
      }
    }
  }

  /**
   * Renders clashing headbutt sparks, dust, and dynamic force badges
   */
  private renderClashEffectsAndBadges(state: SheepFightState) {
    const ctx = this.ctx;
    const numLanes = SHEEP_CONSTANTS.NUM_LANES;
    const laneW = (SHEEP_CONSTANTS.VIEWPORT_WIDTH - 2 * SHEEP_CONSTANTS.LANE_MARGIN_X) / numLanes;

    for (let i = 0; i < numLanes; i++) {
      const lane = state.lanes[i];
      if (lane.status !== 'active' || lane.clashY === null) continue;

      const cx = SHEEP_CONSTANTS.LANE_MARGIN_X + i * laneW + laneW / 2;
      const cy = lane.clashY;

      // 1. Clash Sparks & Starburst
      ctx.save();
      const sparkCount = 8;
      const radius = 12 + Math.sin(this.animTimer * 8) * 3;

      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      for (let s = 0; s < sparkCount; s++) {
        const a = (s / sparkCount) * Math.PI * 2 + this.animTimer * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 3, cy + Math.sin(a) * 3);
        ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
        ctx.stroke();
      }
      ctx.restore();

      // 2. Dynamic Live Tug-of-War Strength Pill Badge
      ctx.save();
      const fP = lane.playerStrength;
      const fO = lane.opponentStrength;
      const badgeW = 64;
      const badgeH = 18;
      const badgeX = cx - badgeW / 2;
      // Position badge floating just above clash
      const badgeY = cy - 28;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = fP > fO ? '#3b82f6' : fO > fP ? '#ef4444' : '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 9);
      ctx.fill();
      ctx.stroke();

      ctx.font = 'bold 9.5px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Player force (Blue)
      ctx.fillStyle = '#60a5fa';
      ctx.fillText(`${fP}x`, badgeX + 15, badgeY + badgeH / 2);

      // VS indicator
      ctx.fillStyle = '#94a3b8';
      ctx.font = '8px system-ui';
      ctx.fillText('vs', cx, badgeY + badgeH / 2);

      // Opponent force (Red)
      ctx.font = 'bold 9.5px monospace';
      ctx.fillStyle = '#f87171';
      ctx.fillText(`${fO}x`, badgeX + badgeW - 15, badgeY + badgeH / 2);

      ctx.restore();
    }
  }

  /**
   * REQUIREMENT 3 & 4: Barricades for DRAW lanes and victory flags for won lanes
   */
  private renderLaneOverlays(state: SheepFightState) {
    const ctx = this.ctx;
    const numLanes = SHEEP_CONSTANTS.NUM_LANES;
    const laneW = (SHEEP_CONSTANTS.VIEWPORT_WIDTH - 2 * SHEEP_CONSTANTS.LANE_MARGIN_X) / numLanes;
    const topY = SHEEP_CONSTANTS.LANE_TOP_Y;
    const bottomY = SHEEP_CONSTANTS.LANE_BOTTOM_Y;
    const laneH = bottomY - topY;

    for (let i = 0; i < numLanes; i++) {
      const lane = state.lanes[i];
      if (lane.status === 'active') continue;

      const lx = SHEEP_CONSTANTS.LANE_MARGIN_X + i * laneW;
      const cx = lx + laneW / 2;
      const cy = (topY + bottomY) / 2;

      if (lane.status === 'draw') {
        // REQUIREMENT 3: "when the line is full with sheep from both sides... considered draw. put another sheep is disabled"
        ctx.save();
        // Darkened locked lane tint
        ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
        ctx.fillRect(lx, topY, laneW, laneH);

        // Wooden Crossed Barricades
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(lx + 8, cy - 50);
        ctx.lineTo(lx + laneW - 8, cy + 50);
        ctx.moveTo(lx + laneW - 8, cy - 50);
        ctx.lineTo(lx + 8, cy + 50);
        ctx.stroke();

        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(lx + 8, cy - 50);
        ctx.lineTo(lx + laneW - 8, cy + 50);
        ctx.moveTo(lx + laneW - 8, cy - 50);
        ctx.lineTo(lx + 8, cy + 50);
        ctx.stroke();

        // Stamped DRAW Plaque
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(cx - 40, cy - 14, 80, 28, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fde68a';
        ctx.font = '900 12px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔒 DRAW', cx, cy);
        ctx.restore();
      } else if (lane.status === 'won_player') {
        // Won by Player (Blue Victory Pennant)
        ctx.save();
        ctx.fillStyle = 'rgba(59, 130, 246, 0.25)';
        ctx.fillRect(lx, topY, laneW, laneH);

        ctx.fillStyle = '#1d4ed8';
        ctx.strokeStyle = '#93c5fd';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(cx - 42, cy - 14, 84, 28, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 11px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('👑 PLAYER', cx, cy);
        ctx.restore();
      } else if (lane.status === 'won_opponent') {
        // Won by Opponent (Red Victory Pennant)
        ctx.save();
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.fillRect(lx, topY, laneW, laneH);

        ctx.fillStyle = '#b91c1c';
        ctx.strokeStyle = '#fca5a5';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(cx - 44, cy - 14, 88, 28, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 11px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💀 OPPONENT', cx, cy);
        ctx.restore();
      }
    }
  }

  /**
   * Renders Field Headers: Goal lines, scores, and Sudden Death alert
   */
  private renderFieldHeaders(state: SheepFightState) {
    const ctx = this.ctx;
    const w = SHEEP_CONSTANTS.VIEWPORT_WIDTH;

    // 1. Top Opponent Goal Bar
    ctx.fillStyle = SHEEP_CONSTANTS.COLORS.OPPONENT_GOAL;
    ctx.fillRect(0, 0, w, SHEEP_CONSTANTS.LANE_TOP_Y);
    ctx.fillStyle = SHEEP_CONSTANTS.COLORS.OPPONENT_GOAL_LINE;
    ctx.fillRect(0, SHEEP_CONSTANTS.LANE_TOP_Y - 3, w, 3);

    // Opponent Goal text
    ctx.fillStyle = '#fca5a5';
    ctx.font = '900 11px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔴 OPPONENT GOAL LINE', w / 2, 22);

    // 2. Bottom Player Goal Bar
    ctx.fillStyle = SHEEP_CONSTANTS.COLORS.PLAYER_GOAL;
    ctx.fillRect(0, SHEEP_CONSTANTS.LANE_BOTTOM_Y, w, SHEEP_CONSTANTS.VIEWPORT_HEIGHT - SHEEP_CONSTANTS.LANE_BOTTOM_Y);
    ctx.fillStyle = SHEEP_CONSTANTS.COLORS.PLAYER_GOAL_LINE;
    ctx.fillRect(0, SHEEP_CONSTANTS.LANE_BOTTOM_Y, w, 3);

    ctx.fillStyle = '#93c5fd';
    ctx.font = '900 11px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔵 PLAYER GOAL LINE (DEFEND THIS)', w / 2, SHEEP_CONSTANTS.LANE_BOTTOM_Y + 22);

    // 3. REQUIREMENT 4: SUDDEN DEATH ALERT BANNER
    if (state.isSuddenDeath && state.winner === null) {
      ctx.save();
      const pulse = (Math.sin(this.animTimer * 8) + 1) * 0.5;
      const bannerW = 380;
      const bannerH = 34;
      const bx = w / 2 - bannerW / 2;
      const by = (SHEEP_CONSTANTS.LANE_TOP_Y + SHEEP_CONSTANTS.LANE_BOTTOM_Y) / 2 - bannerH / 2;

      ctx.fillStyle = `rgba(225, 29, 72, ${0.85 + pulse * 0.15})`;
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(bx, by, bannerW, bannerH, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 13px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡ SUDDEN DEATH! NEXT LANE WON WINS MATCH ⚡', w / 2, by + bannerH / 2);
      ctx.restore();
    }
  }
}
