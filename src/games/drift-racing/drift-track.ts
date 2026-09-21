import type { Point2D, ClippingZone } from './drift-types';
import { DRIFT_CONSTANTS } from './drift-constants';

export interface TrackWaypoint {
  x: number;
  y: number;
  angle: number;       // Tangent direction
  nx: number;          // Normal vector X (perpendicular pointing outward)
  ny: number;          // Normal vector Y
  width: number;
  progress: number;    // 0 to 1
  isBridge?: boolean;  // Overpass bridge segment
}

export interface WallSegment {
  p1: Point2D;
  p2: Point2D;
  isInner: boolean;
}

export class DriftTrack {
  public waypoints: TrackWaypoint[] = [];
  public innerWalls: WallSegment[] = [];
  public outerWalls: WallSegment[] = [];
  public clippingZones: ClippingZone[] = [];
  public startLine: { p1: Point2D; p2: Point2D; angle: number };
  public finishLine: { p1: Point2D; p2: Point2D; angle: number };
  public bridgeOverpass: { p1: Point2D; p2: Point2D; width: number; height: number };

  constructor() {
    this.generateFigure8();
    this.generateWallsAndZones();

    // Start Line on Entry Straight of Loop 1
    const wpStart = this.waypoints[0];
    this.startLine = {
      p1: { x: wpStart.x - wpStart.nx * (wpStart.width / 2), y: wpStart.y - wpStart.ny * (wpStart.width / 2) },
      p2: { x: wpStart.x + wpStart.nx * (wpStart.width / 2), y: wpStart.y + wpStart.ny * (wpStart.width / 2) },
      angle: wpStart.angle
    };

    // Finish Line at the end of Loop 2 return straight
    const wpFinish = this.waypoints[this.waypoints.length - 1];
    this.finishLine = {
      p1: { x: wpFinish.x - wpFinish.nx * (wpFinish.width / 2), y: wpFinish.y - wpFinish.ny * (wpFinish.width / 2) },
      p2: { x: wpFinish.x + wpFinish.nx * (wpFinish.width / 2), y: wpFinish.y + wpFinish.ny * (wpFinish.width / 2) },
      angle: wpFinish.angle
    };

    this.bridgeOverpass = {
      p1: { x: 700, y: 460 },
      p2: { x: 900, y: 540 },
      width: 150,
      height: 120
    };
  }

  /**
   * Generates smooth parametric Figure "8" centerline waypoints
   * Center intersection is at (800, 500)
   */
  private generateFigure8() {
    const numPoints = 120;
    const centerX = 800;
    const centerY = 500;
    const radiusX = 520;
    const radiusY = 340;
    const width = DRIFT_CONSTANTS.TRACK_WIDTH;

    for (let i = 0; i < numPoints; i++) {
      const t = (i / numPoints) * Math.PI * 2;
      
      // Lemniscate / Figure-8 Parametric Equation
      // x(t) = centerX + radiusX * sin(t)
      // y(t) = centerY + radiusY * sin(t) * cos(t)
      const x = centerX + radiusX * Math.sin(t);
      const y = centerY + radiusY * Math.sin(t) * Math.cos(t) * 1.35;

      // Derivative for tangent vector dx/dt, dy/dt
      const dx = radiusX * Math.cos(t);
      const dy = radiusY * (Math.cos(t) * Math.cos(t) - Math.sin(t) * Math.sin(t)) * 1.35;

      const len = Math.hypot(dx, dy) || 1;
      const tx = dx / len;
      const ty = dy / len;

      // Normal vector (perpendicular to tangent, pointing right)
      const nx = -ty;
      const ny = tx;

      // Angle of travel (radians from up)
      const angle = Math.atan2(tx, -ty);

      // Overpass bridge segment is around t near Math.PI (crossing over)
      const isBridge = (t > Math.PI * 0.9 && t < Math.PI * 1.1);

      this.waypoints.push({
        x,
        y,
        angle,
        nx,
        ny,
        width,
        progress: i / numPoints,
        isBridge
      });
    }
  }

  private generateWallsAndZones() {
    const pts = this.waypoints;
    const n = pts.length;

    // Build Continuous Outer & Inner Wall segments
    for (let i = 0; i < n; i++) {
      const curr = pts[i];
      const next = pts[(i + 1) % n];

      // Outer edge
      const out1 = { x: curr.x + curr.nx * (curr.width / 2), y: curr.y + curr.ny * (curr.width / 2) };
      const out2 = { x: next.x + next.nx * (next.width / 2), y: next.y + next.ny * (next.width / 2) };
      this.outerWalls.push({ p1: out1, p2: out2, isInner: false });

      // Inner edge
      const in1 = { x: curr.x - curr.nx * (curr.width / 2), y: curr.y - curr.ny * (curr.width / 2) };
      const in2 = { x: next.x - next.nx * (next.width / 2), y: next.y - next.ny * (next.width / 2) };
      this.innerWalls.push({ p1: in1, p2: in2, isInner: true });
    }

    // --- High-Visibility Green Drift Clipping Zones ---
    // Zone 1: Outer Wall Sweeper of Loop 1 (Big entry drift zone)
    this.createZoneFromWaypoints('zone-1-entry', 'Outer Sweeper 1', 12, 28, 'outer', 42);

    // Zone 2: Inside Apex Clipping Point of Loop 1
    this.createZoneFromWaypoints('zone-2-apex', 'Inside Clip 1', 34, 45, 'inner', 38);

    // Zone 3: Transition Switch zone approaching the crossover
    this.createZoneFromWaypoints('zone-3-switch', 'Switch Zone', 52, 64, 'outer', 40);

    // Zone 4: Outer Wall Sweeper of Loop 2 (High-speed sweeper)
    this.createZoneFromWaypoints('zone-4-sweeper', 'Outer Sweeper 2', 72, 88, 'outer', 44);

    // Zone 5: Inside Apex Clipping Point of Loop 2
    this.createZoneFromWaypoints('zone-5-apex', 'Inside Clip 2', 94, 105, 'inner', 38);

    // Zone 6: Final Exit Clipping Zone before the Finish Line
    this.createZoneFromWaypoints('zone-6-exit', 'Final Exit Clip', 110, 118, 'outer', 42);
  }

  private createZoneFromWaypoints(
    id: string,
    name: string,
    startIdx: number,
    endIdx: number,
    side: 'outer' | 'inner',
    depth: number
  ) {
    const polygon: Point2D[] = [];
    const outerEdge: Point2D[] = [];
    const pts = this.waypoints;

    // Follow track edge
    const dir = (side === 'outer' ? 1 : -1);

    for (let i = startIdx; i <= endIdx; i++) {
      const wp = pts[i % pts.length];
      const edgeX = wp.x + wp.nx * (wp.width / 2) * dir;
      const edgeY = wp.y + wp.ny * (wp.width / 2) * dir;
      outerEdge.push({ x: edgeX, y: edgeY });
      polygon.push({ x: edgeX, y: edgeY });
    }

    // Return along inward offset depth
    for (let i = endIdx; i >= startIdx; i--) {
      const wp = pts[i % pts.length];
      const inX = wp.x + wp.nx * (wp.width / 2 - depth) * dir;
      const inY = wp.y + wp.ny * (wp.width / 2 - depth) * dir;
      polygon.push({ x: inX, y: inY });
    }

    this.clippingZones.push({
      id,
      name,
      polygon,
      outerEdge,
      zoneWeight: 1.0
    });
  }

  /**
   * Finds the closest waypoint progress to a given position (x, y)
   */
  public getClosestProgress(x: number, y: number): { progress: number; distance: number; waypointIndex: number } {
    let minDistSq = Infinity;
    let closestIdx = 0;

    for (let i = 0; i < this.waypoints.length; i++) {
      const wp = this.waypoints[i];
      const dSq = (wp.x - x) ** 2 + (wp.y - y) ** 2;
      if (dSq < minDistSq) {
        minDistSq = dSq;
        closestIdx = i;
      }
    }

    return {
      progress: this.waypoints[closestIdx].progress,
      distance: Math.sqrt(minDistSq),
      waypointIndex: closestIdx
    };
  }

  /**
   * Tests if a 2D point lies inside a polygon using ray-casting algorithm
   */
  public static isPointInPolygon(pt: Point2D, poly: Point2D[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;

      const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
        (pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi || 0.00001) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
}
