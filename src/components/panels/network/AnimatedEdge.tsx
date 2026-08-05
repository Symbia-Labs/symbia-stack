/**
 * Animated Edge Component
 *
 * Custom React Flow edge with animated particles showing data flow direction.
 * Uses CSS animations for smooth, performant visuals.
 */

import { memo, type CSSProperties } from 'react';
import { BaseEdge, getSmoothStepPath, type Position } from '@xyflow/react';

// Spacing between parallel edges in pixels
const PARALLEL_EDGE_SPACING = 20;

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
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  data,
  markerEnd,
}: AnimatedEdgeProps) {
  // Apply parallel edge offset to spread overlapping edges
  const parallelOffsetIndex = data?.parallelOffset || 0;
  const parallelOffset = parallelOffsetIndex * PARALLEL_EDGE_SPACING;

  // Offset perpendicular to the main edge direction (vertical offset for LR layout)
  const offsetSourceY = sourceY + parallelOffset;
  const offsetTargetY = targetY + parallelOffset;

  // Vary the elbow offset so edges turn at different points
  // Base offset is 20, each parallel edge adds 15 to stagger the turns
  const elbowOffset = 20 + Math.abs(parallelOffsetIndex) * 15;

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY: offsetSourceY,
    sourcePosition,
    targetX,
    targetY: offsetTargetY,
    targetPosition,
    borderRadius: 0, // Sharp right-angle elbows
    offset: elbowOffset, // Stagger where edges make their first turn
  });

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
            x={(sourceX + targetX) / 2 - 14}
            y={(offsetSourceY + offsetTargetY) / 2 - 10}
            width={28}
            height={20}
            rx={10}
            fill="var(--surface-raised, #161b22)"
            stroke={strokeColor}
            strokeWidth={1}
          />
          <text
            x={(sourceX + targetX) / 2}
            y={(offsetSourceY + offsetTargetY) / 2 + 4}
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
