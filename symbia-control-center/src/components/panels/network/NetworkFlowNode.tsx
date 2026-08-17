/**
 * NetworkFlowNode Component
 *
 * Custom React Flow node for network topology visualization.
 * Displays network nodes with type-based styling and status indicators.
 * Supports activity animations when nodes send/receive events.
 */

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NetworkFlowNodeData } from './networkFlowUtils';

interface NetworkFlowNodeProps {
  data: NetworkFlowNodeData;
  selected?: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  service: 'Service',
  assistant: 'Assistant',
  sandbox: 'Sandbox',
  bridge: 'Bridge',
  integration: 'Integration',
  client: 'Client',
};

function NetworkFlowNodeComponent({ data, selected }: NetworkFlowNodeProps) {
  const { networkNode, color, icon, label, isStale, isConnected, capabilityCount, isActive, activityLevel, traffic } = data;

  /**
   * A node must be visible even when nothing is known about it.
   *
   * `borderColor` was set straight from `data.color`, and the card's fill came
   * from the class `bg-surface-elevated` — which has never existed. The
   * surface scale is base / raised / overlay / sunken / highlight; `elevated`
   * lives only in the `scc` namespace. So the fill was `rgba(0,0,0,0)` on
   * every node ever rendered, and the only thing making a node visible was its
   * inline border colour.
   *
   * Measured 9 Aug 2026 on a stack whose nodes carried no `color`: ten nodes
   * present in the DOM, correctly positioned, correctly sized, and completely
   * invisible — the graph drew edges across empty space and looked like a
   * rendering bug. Two independent failures, and either one alone would have
   * kept the cards on screen.
   *
   * A node with no declared colour now draws in a neutral one rather than
   * vanishing. Absent metadata is not absence of a service.
   */
  const strokeColor = color || 'var(--border-default, #30363d)';

  // Activity level affects glow intensity (0-1 scale)
  const glowIntensity = activityLevel || 0;
  const hasRecentActivity = isActive || glowIntensity > 0;

  return (
    <div
      className={`
        w-[180px] bg-surface-raised border-2 rounded-lg shadow-lg
        transition-all duration-200
        ${selected ? 'ring-2 ring-offset-2 ring-offset-surface-base' : ''}
        ${isStale ? 'opacity-60' : ''}
        ${hasRecentActivity ? 'network-node-active' : ''}
      `}
      style={{
        borderColor: isStale ? '#f59e0b' : strokeColor,
        // Glow only when there IS a colour to glow with. Appending an alpha
        // suffix to `undefined` produced the string "undefined30", which is
        // not a colour and silently dropped the shadow.
        boxShadow: isConnected && !isStale && color
          ? hasRecentActivity
            ? `0 0 ${20 + glowIntensity * 20}px ${color}${Math.round(48 + glowIntensity * 32).toString(16)}`
            : `0 0 20px ${color}30`
          : undefined,
        transform: hasRecentActivity ? `scale(${1 + glowIntensity * 0.03})` : undefined,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b"
        style={{
          borderColor: `${color}30`,
          backgroundColor: `${color}10`,
        }}
      >
        {/* Status indicator */}
        <div
          className={`
            w-2 h-2 rounded-full shrink-0
            ${isStale
              ? 'bg-amber-500'
              : isConnected
              ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
              : 'bg-text-muted'
            }
          `}
        />
        <span className="text-lg">{icon}</span>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-sm font-semibold text-text-primary truncate">{label}</span>
          <span
            className="text-[10px] uppercase tracking-wider"
            style={{ color }}
          >
            {TYPE_LABELS[networkNode.type] || networkNode.type}
          </span>
        </div>
      </div>

      {/* Observed traffic, last 60s.
          This is the only part of this graph that is a MEASUREMENT. The edges
          are declared contracts — three of them on a stack serving thousands
          of requests — so without this the picture shows an intended topology
          and nothing about what is happening in it.

          "Not checked" is rendered as such rather than as zeros: a service
          that received no requests and a service whose relay is down look
          identical from here, and printing 0 req would state the first when
          only the second is known. */}
      <div className="px-3 py-1.5 border-b" style={{ borderColor: `${color}20` }}>
        {traffic ? (
          <div className="flex items-center gap-2 text-[10px] tabular-nums">
            <span className="text-text-secondary">{traffic.requests} req/{traffic.windowSec}s</span>
            <span
              className={
                traffic.errorRate > 0.05
                  ? 'text-red-400'
                  : traffic.errorRate > 0
                    ? 'text-amber-400'
                    : 'text-emerald-400/70'
              }
            >
              {(traffic.errorRate * 100).toFixed(traffic.errorRate ? 1 : 0)}% err
            </span>
            <span className="ml-auto text-text-muted">
              {traffic.p95Ms === null ? 'p95 —' : `p95 ${traffic.p95Ms}ms`}
            </span>
          </div>
        ) : (
          <div className="text-[10px] text-text-muted italic">no traffic observed</div>
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {/* Capabilities preview */}
        {capabilityCount > 0 && (
          <div className="flex flex-wrap gap-1">
            {networkNode.capabilities.slice(0, 2).map((cap) => (
              <span
                key={cap}
                className="text-[9px] px-1.5 py-0.5 bg-surface-highlight rounded text-text-secondary truncate max-w-[70px]"
              >
                {cap}
              </span>
            ))}
            {capabilityCount > 2 && (
              <span className="text-[9px] px-1.5 py-0.5 text-text-muted">
                +{capabilityCount - 2}
              </span>
            )}
          </div>
        )}
        {capabilityCount === 0 && (
          <span className="text-[10px] text-text-muted italic">No capabilities</span>
        )}
      </div>

      {/*
        FOUR CONNECTION POINTS, ONE PER FACE.

        There used to be two: a target on the left and a source on the right.
        Every wire therefore had to leave rightwards and arrive leftwards
        regardless of where the other node was, which is what turned a mesh
        into parallel corridors. The fix was never to stop attaching wires to
        connection points — it was to stop having only two.

        Each face carries an overlapping source and target handle so a call can
        arrive at or leave from any side, plus one visible dot. Eight handles
        would be eight dots; the handles are transparent and the dot beneath is
        what a reader sees.
      */}
      {(['top', 'right', 'bottom', 'left'] as const).map((side) => {
        const pos = {
          top: Position.Top,
          right: Position.Right,
          bottom: Position.Bottom,
          left: Position.Left,
        }[side];
        return (
          <div key={side}>
            <Handle
              type="target"
              id={`t-${side}`}
              position={pos}
              style={{ opacity: 0, width: 12, height: 12, border: 'none' }}
            />
            <Handle
              type="source"
              id={`s-${side}`}
              position={pos}
              style={{ opacity: 0, width: 12, height: 12, border: 'none' }}
            />
            <span
              className="absolute rounded-full pointer-events-none"
              style={{
                width: 8,
                height: 8,
                backgroundColor: strokeColor,
                ...(side === 'top' ? { top: -4, left: 'calc(50% - 4px)' } : {}),
                ...(side === 'bottom' ? { bottom: -4, left: 'calc(50% - 4px)' } : {}),
                ...(side === 'left' ? { left: -4, top: 'calc(50% - 4px)' } : {}),
                ...(side === 'right' ? { right: -4, top: 'calc(50% - 4px)' } : {}),
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export const NetworkFlowNode = memo(NetworkFlowNodeComponent);
