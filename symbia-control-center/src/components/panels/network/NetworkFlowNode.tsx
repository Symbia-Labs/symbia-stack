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
  const { networkNode, color, icon, label, isStale, isConnected, capabilityCount, isActive, activityLevel } = data;

  // Activity level affects glow intensity (0-1 scale)
  const glowIntensity = activityLevel || 0;
  const hasRecentActivity = isActive || glowIntensity > 0;

  return (
    <div
      className={`
        w-[180px] bg-surface-elevated border-2 rounded-lg shadow-lg
        transition-all duration-200
        ${selected ? 'ring-2 ring-offset-2 ring-offset-surface-base' : ''}
        ${isStale ? 'opacity-60' : ''}
        ${hasRecentActivity ? 'network-node-active' : ''}
      `}
      style={{
        borderColor: isStale ? '#f59e0b' : color,
        boxShadow: isConnected && !isStale
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

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !border-2"
        style={{
          backgroundColor: color,
          borderColor: `${color}80`,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !border-2"
        style={{
          backgroundColor: color,
          borderColor: `${color}80`,
        }}
      />
    </div>
  );
}

export const NetworkFlowNode = memo(NetworkFlowNodeComponent);
