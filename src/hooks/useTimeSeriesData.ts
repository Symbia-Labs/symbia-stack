/**
 * useTimeSeriesData Hook
 *
 * Manages time-synced data for real-time charts.
 * Provides a rolling 60-second window that updates every second.
 * All charts share the same timeline for consistency.
 */
import { useState, useEffect, useRef } from 'react';

// Number of seconds to show in the timeline
const TIMELINE_WINDOW_SECONDS = 60;
// Update interval in milliseconds
const UPDATE_INTERVAL_MS = 1000;

export interface TimeSeriesPoint {
  timestamp: number;
  [key: string]: number | string | undefined;
}

export interface TimeSeriesConfig<T> {
  /** Function to aggregate raw data into a single point for the current second */
  aggregator: (rawData: T[], secondTimestamp: number) => Record<string, number>;
  /** Default values when no data is available */
  defaultValues: Record<string, number>;
}

interface TimeSeriesState {
  /** Current timeline (60 timestamps, one per second) */
  timeline: number[];
  /** Current second timestamp (floor to second) */
  currentSecond: number;
}

/**
 * Creates a rolling 60-second timeline
 */
function createTimeline(currentSecond: number): number[] {
  const timeline: number[] = [];
  for (let i = TIMELINE_WINDOW_SECONDS - 1; i >= 0; i--) {
    timeline.push(currentSecond - i * 1000);
  }
  return timeline;
}

/**
 * Hook for managing synchronized time-series data across multiple charts.
 *
 * @param rawData - Array of raw data points with timestamps
 * @param config - Configuration for aggregation and defaults
 * @returns Standardized time-series data for charts
 */
export function useTimeSeriesData<T extends { timestamp: number }>(
  rawData: T[],
  config: TimeSeriesConfig<T>
): TimeSeriesPoint[] {
  const [state, setState] = useState<TimeSeriesState>(() => {
    const now = Math.floor(Date.now() / 1000) * 1000;
    return {
      timeline: createTimeline(now),
      currentSecond: now,
    };
  });

  // Keep track of aggregated data per second
  const aggregatedDataRef = useRef<Map<number, Record<string, number>>>(new Map());

  // Keep track of last known values for carry-forward
  const lastValuesRef = useRef<Record<string, number>>(config.defaultValues);

  // Update timeline every second
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000) * 1000;
      setState((prev) => {
        if (now !== prev.currentSecond) {
          return {
            timeline: createTimeline(now),
            currentSecond: now,
          };
        }
        return prev;
      });
    }, UPDATE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  // Aggregate raw data when it changes
  useEffect(() => {
    if (rawData.length === 0) return;

    // Group raw data by second
    const dataBySecond = new Map<number, T[]>();
    rawData.forEach((point) => {
      const second = Math.floor(point.timestamp / 1000) * 1000;
      const existing = dataBySecond.get(second) || [];
      existing.push(point);
      dataBySecond.set(second, existing);
    });

    // Aggregate each second's data
    dataBySecond.forEach((points, second) => {
      const aggregated = config.aggregator(points, second);
      aggregatedDataRef.current.set(second, aggregated);
      // Update last known values
      Object.assign(lastValuesRef.current, aggregated);
    });

    // Clean up old data (older than timeline window + buffer)
    const cutoff = state.currentSecond - (TIMELINE_WINDOW_SECONDS + 10) * 1000;
    for (const key of aggregatedDataRef.current.keys()) {
      if (key < cutoff) {
        aggregatedDataRef.current.delete(key);
      }
    }
  }, [rawData, config, state.currentSecond]);

  // Build the time series data for charts
  const timeSeriesData: TimeSeriesPoint[] = state.timeline.map((timestamp) => {
    const aggregated = aggregatedDataRef.current.get(timestamp);
    if (aggregated) {
      return { timestamp, ...aggregated };
    }
    // Use default values (or zeros) when no data
    return { timestamp, ...config.defaultValues };
  });

  return timeSeriesData;
}

/**
 * Hook for latency time-series data
 */
export function useLatencyTimeSeries(
  rawData: Array<{ timestamp: number; latency: number }>
): TimeSeriesPoint[] {
  return useTimeSeriesData(rawData, {
    aggregator: (points) => {
      if (points.length === 0) return { latency: 0, count: 0 };
      const sum = points.reduce((acc, p) => acc + p.latency, 0);
      return {
        latency: Math.round(sum / points.length),
        count: points.length,
      };
    },
    defaultValues: { latency: 0, count: 0 },
  });
}

/**
 * Hook for throughput time-series data
 */
export function useThroughputTimeSeries(
  rawData: Array<{ timestamp: number; statusCode: number }>
): TimeSeriesPoint[] {
  return useTimeSeriesData(rawData, {
    aggregator: (points) => {
      const success = points.filter((p) => p.statusCode < 400).length;
      const errors = points.filter((p) => p.statusCode >= 400).length;
      return { successCount: success, errorCount: errors };
    },
    defaultValues: { successCount: 0, errorCount: 0 },
  });
}

/**
 * Get the shared timeline for all charts (60 seconds, updates every second)
 */
export function useSharedTimeline(): { timeline: number[]; currentSecond: number } {
  const [state, setState] = useState<{ timeline: number[]; currentSecond: number }>(() => {
    const now = Math.floor(Date.now() / 1000) * 1000;
    return {
      timeline: createTimeline(now),
      currentSecond: now,
    };
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000) * 1000;
      setState((prev) => {
        if (now !== prev.currentSecond) {
          return {
            timeline: createTimeline(now),
            currentSecond: now,
          };
        }
        return prev;
      });
    }, UPDATE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  return state;
}
