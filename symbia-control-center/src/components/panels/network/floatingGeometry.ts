/**
 * Floating edge geometry — where a wire meets a node in a mesh.
 *
 * THE PROBLEM THIS SOLVES. React Flow attaches an edge to a fixed handle, so
 * with an LR layout every wire leaves the right face and arrives at the left
 * face regardless of where the other node actually is. A node sitting directly
 * above its caller still gets a wire that exits right, runs out, turns, comes
 * back across, and enters from the left. Ten of those share the same corridors
 * and the picture reads as a backplane: parallel rectilinear runs you cannot
 * trace end to end.
 *
 * A mesh is not a backplane. Peers call peers, in every direction, and the
 * geometry should say so.
 *
 * WHAT A FLOATING EDGE DOES. The endpoint is not a handle — it is the point
 * where the line between the two node centres crosses the node's boundary. A
 * wire to something above leaves the top. A wire to something left leaves the
 * left. Direction is legible from the stub alone, before you follow it
 * anywhere, and edges stop sharing corridors because they no longer have to
 * route around the node they started on.
 *
 * This is geometry, not styling: the same edges, drawn where they actually go.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export function centreOf(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/**
 * Where the ray from `rect`'s centre towards `towards` leaves the rectangle.
 *
 * Scales the direction vector until it touches whichever face it reaches
 * first. `Math.max` of the two normalised components picks that face without
 * branching on which quadrant the target is in — the usual four-case version
 * of this is where sign errors live.
 *
 * Degenerate case: two nodes at the same point have no direction between them.
 * Returns the centre rather than dividing by zero, so a wire collapses to a
 * dot instead of flying off to infinity. It cannot be drawn meaningfully and
 * should not pretend otherwise.
 */
export function boundaryPoint(rect: Rect, towards: Point): Point {
  const c = centreOf(rect);
  const dx = towards.x - c.x;
  const dy = towards.y - c.y;
  if (dx === 0 && dy === 0) return c;

  const halfW = rect.width / 2;
  const halfH = rect.height / 2;
  const scale = 1 / Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);

  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

/**
 * A gently bowed path between two points.
 *
 * `bow` displaces the midpoint PERPENDICULAR to the line, which is what makes
 * this work in a mesh. The previous parallel-edge separation added a fixed
 * vertical offset — correct only while every edge ran horizontally, and
 * actively wrong for a wire running vertically, where a vertical offset moves
 * the line along itself and separates nothing.
 *
 * A small constant bow on every edge also separates the two directions of a
 * bidirectional pair: A→B bows one way, B→A the other, because the
 * perpendicular flips with the direction of travel. Two calls between the same
 * services stop being one line.
 */
export function bowedPath(a: Point, b: Point, bow: number): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return `M ${a.x},${a.y} L ${b.x},${b.y}`;
  if (bow === 0) return `M ${a.x},${a.y} L ${b.x},${b.y}`;

  // Unit perpendicular to the direction of travel.
  const px = -dy / len;
  const py = dx / len;

  const mx = (a.x + b.x) / 2 + px * bow;
  const my = (a.y + b.y) / 2 + py * bow;

  return `M ${a.x},${a.y} Q ${mx},${my} ${b.x},${b.y}`;
}

/** Midpoint of a bowed path, for placing a label on the line rather than beside it. */
export function bowedMidpoint(a: Point, b: Point, bow: number): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return a;
  const px = -dy / len;
  const py = dx / len;
  // Quadratic bezier at t=0.5 sits halfway between the chord and the control
  // point, so the visual midpoint is bow/2 off the straight line, not bow.
  return {
    x: (a.x + b.x) / 2 + (px * bow) / 2,
    y: (a.y + b.y) / 2 + (py * bow) / 2,
  };
}

export type Side = 'top' | 'right' | 'bottom' | 'left';

/**
 * Which face of `rect` looks towards `towards`, and the point on it.
 *
 * WHY THIS REPLACED A FREE BOUNDARY INTERSECTION. Attaching a wire anywhere
 * along the edge of a card is geometrically tidy and semantically vague: the
 * wire lands on a blank stretch of border rather than on a connection point.
 * These nodes DO have connection points, and a reader should be able to see
 * which one a call arrived at.
 *
 * The original problem was never that edges attached to handles. It was that
 * there were only two handles — a target on the left face and a source on the
 * right — so every wire had to leave rightwards and arrive leftwards no matter
 * where the other node was, and the picture became parallel corridors.
 *
 * Four faces, one connection point each, and each edge uses the pair that face
 * one another. Wires land on a visible dot AND run at their natural angle.
 *
 * The comparison is on the NORMALISED delta so the choice respects the card's
 * shape: these are 180x130, so a target 100px right and 100px up is reached
 * through the top face, not the right one. Comparing raw dx and dy would pick
 * the wrong face for any node that is not square.
 */
export function facingSide(rect: Rect, towards: Point): Side {
  const c = centreOf(rect);
  const dx = (towards.x - c.x) / (rect.width / 2 || 1);
  const dy = (towards.y - c.y) / (rect.height / 2 || 1);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

/** The connection point on a given face — where that side's handle sits. */
export function sideAnchor(rect: Rect, side: Side): Point {
  const c = centreOf(rect);
  switch (side) {
    case 'top':
      return { x: c.x, y: rect.y };
    case 'bottom':
      return { x: c.x, y: rect.y + rect.height };
    case 'left':
      return { x: rect.x, y: c.y };
    case 'right':
      return { x: rect.x + rect.width, y: c.y };
  }
}
