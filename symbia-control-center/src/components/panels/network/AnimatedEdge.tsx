/**
 * Animated Edge Component
 *
 * Custom React Flow edge with animated particles showing data flow direction.
 * Uses CSS animations for smooth, performant visuals.
 */

import { memo, type CSSProperties } from 'react';
import { BaseEdge, useInternalNode, type Position } from '@xyflow/react';
import { boundaryPoint, bowedMidpoint, bowedPath, centreOf, type Rect } from './floatingGeometry';

/**
 * How far apart parallel edges bow, and how much curve every edge gets.
 *
 * The base bow is not decoration. It separates the two directions of a
 * bidirectional pair — the perpendicular flips with the direction of travel,
 * so A→B and B→A curve to opposite sides instead of lying on top of each
 * other as one line.
 */
const BASE_BOW = 18;
const PARALLEL_BOW_STEP = 26;

export interface AnimatedEdgeData extends Record<string, unknown> {
  isEventTraffic?: boolean;
  isContract?: boolean;
  isMesh?: boolean;
  isClientConnection?: boolean;
  eventCount?: number;
  latencyStats?: { avg: number; min: number; max: number };
  recentActivity?: boolean;
  // Parallel edge offset (assigned by networkFlowUtils)
  parallelOffset?: number;
  parallelCount?: number;
}

interface AnimatedEdgeProps {
  id: string;
  source: string;
  target: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  style?: CSSProperties;
  data?: AnimatedEdgeData;
  markerEnd?: string;
}

function AnimatedEdgeComponent({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  data,
  markerEnd,
}: AnimatedEdgeProps) {
  // FLOATING GEOMETRY. The endpoints are computed from where the nodes
  // actually are, not from the handle React Flow picked. See
  // floatingGeometry.ts: a fixed handle makes every wire leave the right face
  // and enter the left one, so a call to a node sitting directly above still
  // routes out, around and back — which is how ten peer-to-peer calls came to
  // share four rectilinear corridors and read as a backplane.
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  const rectOf = (n: typeof sourceNode): Rect | null =>
    n && n.measured?.width && n.measured?.height
      ? {
          x: n.internals.positionAbsolute.x,
          y: n.internals.positionAbsolute.y,
          width: n.measured.width,
          height: n.measured.height,
        }
      : null;

  const sRect = rectOf(sourceNode);
  const tRect = rectOf(targetNode);

  // Bow grows with the parallel index so stacked edges fan out. Sign is kept
  // from the index so edges alternate sides rather than all bending one way.
  const parallelOffsetIndex = data?.parallelOffset || 0;
  const bow = BASE_BOW + parallelOffsetIndex * PARALLEL_BOW_STEP;

  // Falls back to React Flow's handle coordinates when a node has not been
  // measured yet — on the first frame, before layout. Straight and honest
  // rather than absent: a missing measurement is not a reason to drop an edge.
  const a = sRect && tRect ? boundaryPoint(sRect, centreOf(tRect)) : { x: sourceX, y: sourceY };
  const b = sRect && tRect ? boundaryPoint(tRect, centreOf(sRect)) : { x: targetX, y: targetY };

  const edgePath = bowedPath(a, b, bow);
  const mid = bowedMidpoint(a, b, bow);

  // Determine edge type and styling
  const isActive = data?.isEventTraffic || data?.recentActivity;
  const isContract = data?.isContract;
  const isMesh = data?.isMesh;
  const isClient = data?.isClientConnection;
  const eventCount = data?.eventCount || 0;

  // Base stroke color - use CSS custom property syntax for theme support
  // Falls back to a neutral color if CSS var is not resolved
  let strokeColor = (style?.stroke as string) || 'var(--border-default, #30363d)';
  let strokeWidth = Number(style?.strokeWidth) || 2;
  let strokeDasharray = style?.strokeDasharray as string | undefined;

  // Adjust for traffic volume - active edges get green styling
  // Contract edges use the subtle styling from their style prop
  if (isActive && eventCount > 0) {
    strokeColor = 'var(--success, #3fb950)';
    strokeWidth = Math.min(2 + Math.log2(eventCount + 1) * 1.5, 6);
    strokeDasharray = '6 4'; // Dashed line for active traffic
  } else if (isContract) {
    // Keep the subtle styling from style prop (don't override)
  } else if (isMesh) {
    strokeColor = 'var(--border-muted, #21262d)';
    strokeDasharray = '4 4';
  } else if (isClient) {
    strokeColor = 'var(--text-secondary, #8b949e)';
    strokeDasharray = '3 3';
  }

  // Calculate animation speed based on activity level
  const animationDuration = isActive
    ? Math.max(0.8, 2 - Math.log2(eventCount + 1) * 0.3)
    : 3;

  return (
    <g className="react-flow__edge-group">
      {/* Glow effect for active edges */}
      {isActive && (
        <path
          d={edgePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth + 4}
          strokeOpacity={0.2}
          className="edge-glow"
          style={{
            filter: 'blur(4px)',
          }}
        />
      )}

      {/* Base edge path */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray,
        }}
      />

      {/* Animated particles only for edges with actual event traffic */}
      {isActive && !isMesh && !isClient && (
        <>
          <circle r={isActive ? 4 : 3} fill={strokeColor} className="edge-particle">
            <animateMotion
              dur={`${animationDuration}s`}
              repeatCount="indefinite"
              path={edgePath}
            />
          </circle>
          {/* Second particle offset for busy connections */}
          {eventCount > 5 && (
            <circle r={3} fill={strokeColor} className="edge-particle" opacity={0.7}>
              <animateMotion
                dur={`${animationDuration}s`}
                repeatCount="indefinite"
                path={edgePath}
                begin={`${animationDuration / 2}s`}
              />
            </circle>
          )}
          {/* Third particle for very busy connections */}
          {eventCount > 15 && (
            <circle r={2.5} fill={strokeColor} className="edge-particle" opacity={0.5}>
              <animateMotion
                dur={`${animationDuration}s`}
                repeatCount="indefinite"
                path={edgePath}
                begin={`${animationDuration / 3}s`}
              />
            </circle>
          )}
        </>
      )}

      {/* Event count badge for traffic edges */}
      {isActive && eventCount > 0 && (
        <g className="traffic-badge">
          <rect
            x={mid.x - 14}
            y={mid.y - 10}
            width={28}
            height={20}
            rx={10}
            fill="var(--surface-raised, #161b22)"
            stroke={strokeColor}
            strokeWidth={1}
          />
          <text
            x={mid.x}
            y={mid.y + 4}
            textAnchor="middle"
            className="text-[10px] font-medium"
            style={{ pointerEvents: 'none', fill: 'var(--text-secondary, #8b949e)' }}
          >
            {eventCount}
          </text>
        </g>
      )}
    </g>
  );
}

export const AnimatedEdge = memo(AnimatedEdgeComponent);
