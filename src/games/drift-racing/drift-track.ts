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
}

export interface WallSegment {
  p1: Point2D;
  p2: Point2D;
  isInner: boolean;
  nxIn: number;        // Inward normal X (pointing into drivable track ribbon)
  nyIn: number;        // Inward normal Y
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export class DriftTrack {
  public waypoints: TrackWaypoint[] = [];
  public innerWalls: WallSegment[] = [];
  public outerWalls: WallSegment[] = [];
  public allWalls: WallSegment[] = [];
  public clippingZones: ClippingZone[] = [];
  public startLine: { p1: Point2D; p2: Point2D; angle: number };
  public finishLine: { p1: Point2D; p2: Point2D; angle: number };
  public gridSlot1: { x: number; y: number; angle: number }; // Lead car starting grid
  public gridSlot2: { x: number; y: number; angle: number }; // Chase car starting grid

  constructor() {
    this.generateFigure8();
    this.generateWallsAndZones();
    this.allWalls = [...this.outerWalls, ...this.innerWalls];

    // Checkered Start / Finish Line on Straightaway (wp 10)
    const wp10 = this.waypoints[10];
    this.startLine = {
      p1: { x: wp10.x - wp10.nx * (wp10.width / 2), y: wp10.y - wp10.ny * (wp10.width / 2) },
      p2: { x: wp10.x + wp10.nx * (wp10.width / 2), y: wp10.y + wp10.ny * (wp10.width / 2) },
      angle: wp10.angle
    };
    this.finishLine = this.startLine; // Start is also the Finish line!

    // Starting Grids with ~91px spacing between Lead and Chase
    // Grid 1: Lead car in slot [ 1 ] just behind checkered start line
    const wp9 = this.waypoints[9];
    this.gridSlot1 = {
      x: wp9.x,
      y: wp9.y,
      angle: wp9.angle
    };

    // Grid 2: Chase car in slot [ 2 ] ~91px behind Lead car on straightaway
    const wp6 = this.waypoints[6];
    this.gridSlot2 = {
      x: wp6.x,
      y: wp6.y,
      angle: wp6.angle
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

      this.waypoints.push({
        x,
        y,
        angle,
        nx,
        ny,
        width,
        progress: i / numPoints
      });
    }
  }

  private generateWallsAndZones() {
    const pts = this.waypoints;
    const halfW = DRIFT_CONSTANTS.TRACK_WIDTH / 2; // 70px

    // Line intersection helper to find exact apex vertices where track boundaries meet
    const lineIntersect = (p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D): Point2D => {
      const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
      if (Math.abs(d) < 1e-6) return { x: (p1.x + p3.x) / 2, y: (p1.y + p3.y) / 2 };
      const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / d;
      return {
        x: p1.x + t * (p2.x - p1.x),
        y: p1.y + t * (p2.y - p1.y)
      };
    };

    // Calculate the 4 exact geometric apexes around the Figure-8 intersection
    // 1. Top Waist Apex: wp 117-118 left edge (-nx) meets wp 58-59 right edge (+nx)
    const topApex = lineIntersect(
      { x: pts[117].x - pts[117].nx * halfW, y: pts[117].y - pts[117].ny * halfW },
      { x: pts[118].x - pts[118].nx * halfW, y: pts[118].y - pts[118].ny * halfW },
      { x: pts[58].x + pts[58].nx * halfW, y: pts[58].y + pts[58].ny * halfW },
      { x: pts[59].x + pts[59].nx * halfW, y: pts[59].y + pts[59].ny * halfW }
    );

    // 2. Bottom Waist Apex: wp 1-2 right edge (+nx) meets wp 61-62 left edge (-nx)
    const bottomApex = lineIntersect(
      { x: pts[1].x + pts[1].nx * halfW, y: pts[1].y + pts[1].ny * halfW },
      { x: pts[2].x + pts[2].nx * halfW, y: pts[2].y + pts[2].ny * halfW },
      { x: pts[61].x - pts[61].nx * halfW, y: pts[61].y - pts[61].ny * halfW },
      { x: pts[62].x - pts[62].nx * halfW, y: pts[62].y - pts[62].ny * halfW }
    );

    // 3. Right Inner Eye Apex: wp 0-1 left edge (-nx) meets wp 59-60 left edge (-nx)
    const rightEyeApex = lineIntersect(
      { x: pts[0].x - pts[0].nx * halfW, y: pts[0].y - pts[0].ny * halfW },
      { x: pts[1].x - pts[1].nx * halfW, y: pts[1].y - pts[1].ny * halfW },
      { x: pts[59].x - pts[59].nx * halfW, y: pts[59].y - pts[59].ny * halfW },
      { x: pts[60].x - pts[60].nx * halfW, y: pts[60].y - pts[60].ny * halfW }
    );

    // 4. Left Inner Eye Apex: wp 118-119 right edge (+nx) meets wp 60-61 right edge (+nx)
    const leftEyeApex = lineIntersect(
      { x: pts[118].x + pts[118].nx * halfW, y: pts[118].y + pts[118].ny * halfW },
      { x: pts[119].x + pts[119].nx * halfW, y: pts[119].y + pts[119].ny * halfW },
      { x: pts[60].x + pts[60].nx * halfW, y: pts[60].y + pts[60].ny * halfW },
      { x: pts[61].x + pts[61].nx * halfW, y: pts[61].y + pts[61].ny * halfW }
    );

    // Build the 3 completely closed, continuous boundary loops with ZERO gaps
    // A. Outer Perimeter: Hourglass boundary connecting bottom apex, right lobe, top apex, left lobe
    const outerPoly: Point2D[] = [bottomApex];
    for (let i = 2; i <= 58; i++) {
      outerPoly.push({ x: pts[i].x + pts[i].nx * halfW, y: pts[i].y + pts[i].ny * halfW });
    }
    outerPoly.push(topApex);
    for (let i = 118; i >= 62; i--) {
      outerPoly.push({ x: pts[i].x - pts[i].nx * halfW, y: pts[i].y - pts[i].ny * halfW });
    }

    // B. Right Inner Eye Boundary: Closed loop encircling inside of right lobe
    const rightEyePoly: Point2D[] = [rightEyeApex];
    for (let i = 2; i <= 58; i++) {
      rightEyePoly.push({ x: pts[i].x - pts[i].nx * halfW, y: pts[i].y - pts[i].ny * halfW });
    }

    // C. Left Inner Eye Boundary: Closed loop encircling inside of left lobe
    const leftEyePoly: Point2D[] = [leftEyeApex];
    for (let i = 62; i <= 118; i++) {
      leftEyePoly.push({ x: pts[i].x + pts[i].nx * halfW, y: pts[i].y + pts[i].ny * halfW });
    }

    // Helper to generate wall segments with deterministic inward normal vectors
    const buildWallSegments = (poly: Point2D[], isInner: boolean): WallSegment[] => {
      const segs: WallSegment[] = [];
      const m = poly.length;
      for (let i = 0; i < m; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % m];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy) || 1;
        const n1x = -dy / len, n1y = dx / len;
        const n2x = dy / len, n2y = -dx / len;
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const d1 = this.getClosestTrackPoint(mx + n1x * 5, my + n1y * 5).dist;
        const d2 = this.getClosestTrackPoint(mx + n2x * 5, my + n2y * 5).dist;
        const inNorm = d1 < d2 ? { nx: n1x, ny: n1y } : { nx: n2x, ny: n2y };
        segs.push({
          p1,
          p2,
          isInner,
          nxIn: inNorm.nx,
          nyIn: inNorm.ny,
          minX: Math.min(p1.x, p2.x),
          maxX: Math.max(p1.x, p2.x),
          minY: Math.min(p1.y, p2.y),
          maxY: Math.max(p1.y, p2.y)
        });
      }
      return segs;
    };

    this.outerWalls = buildWallSegments(outerPoly, false);
    this.innerWalls = [
      ...buildWallSegments(rightEyePoly, true),
      ...buildWallSegments(leftEyePoly, true)
    ];

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
    const centerCurve: Point2D[] = [];
    const pts = this.waypoints;

    // Follow track edge
    const dir = (side === 'outer' ? 1 : -1);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (let i = startIdx; i <= endIdx; i++) {
      const wp = pts[i % pts.length];
      const edgeX = wp.x + wp.nx * (wp.width / 2) * dir;
      const edgeY = wp.y + wp.ny * (wp.width / 2) * dir;
      outerEdge.push({ x: edgeX, y: edgeY });
      polygon.push({ x: edgeX, y: edgeY });

      // Ribbon midline (equidistant from outer edge and track asphalt edge)
      const midDist = (wp.width / 2 - depth / 2) * dir;
      centerCurve.push({
        x: wp.x + wp.nx * midDist,
        y: wp.y + wp.ny * midDist
      });

      if (edgeX < minX) minX = edgeX;
      if (edgeX > maxX) maxX = edgeX;
      if (edgeY < minY) minY = edgeY;
      if (edgeY > maxY) maxY = edgeY;
    }

    // Return along inward offset depth
    for (let i = endIdx; i >= startIdx; i--) {
      const wp = pts[i % pts.length];
      const inX = wp.x + wp.nx * (wp.width / 2 - depth) * dir;
      const inY = wp.y + wp.ny * (wp.width / 2 - depth) * dir;
      polygon.push({ x: inX, y: inY });
      if (inX < minX) minX = inX;
      if (inX > maxX) maxX = inX;
      if (inY < minY) minY = inY;
      if (inY > maxY) maxY = inY;
    }

    this.clippingZones.push({
      id,
      name,
      polygon,
      outerEdge,
      centerCurve,
      zoneWeight: 1.0,
      minX,
      maxX,
      minY,
      maxY
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
   * High-precision distance to continuous Figure-8 centerline ribbon
   * Returns exact projected point (cx, cy) and Euclidean distance.
   */
  public getClosestTrackPoint(x: number, y: number): { dist: number; cx: number; cy: number; waypointIndex: number } {
    let minDSq = Infinity;
    let bestCx = x;
    let bestCy = y;
    let bestIdx = 0;
    const pts = this.waypoints;
    const n = pts.length;

    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      if (l2 === 0) continue;

      let t = ((x - a.x) * dx + (y - a.y) * dy) / l2;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + t * dx;
      const py = a.y + t * dy;
      const dSq = (x - px) * (x - px) + (y - py) * (y - py);
      if (dSq < minDSq) {
        minDSq = dSq;
        bestCx = px;
        bestCy = py;
        bestIdx = i;
      }
    }

    return {
      dist: Math.sqrt(minDSq),
      cx: bestCx,
      cy: bestCy,
      waypointIndex: bestIdx
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
