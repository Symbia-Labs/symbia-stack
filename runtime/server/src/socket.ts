/**
 * WebSocket Handlers
 *
 * Real-time communication for execution events.
 */

import type { Server as SocketServer, Socket } from 'socket.io';
import type { GraphExecutor } from './executor/index.js';

export function createSocketHandlers(executor: GraphExecutor) {
  return function setupSocketHandlers(io: SocketServer): void {
  // Subscribe to executor events and broadcast to connected clients
  executor.on('execution:started', (execution) => {
    io.to(`execution:${execution.id}`).emit('execution:started', {
      executionId: execution.id,
      graphId: execution.graphId,
      state: execution.state,
      startedAt: execution.startedAt?.toISOString(),
    });
  });

  executor.on('execution:paused', (execution) => {
    io.to(`execution:${execution.id}`).emit('execution:paused', {
      executionId: execution.id,
      state: execution.state,
    });
  });

  executor.on('execution:resumed', (execution) => {
    io.to(`execution:${execution.id}`).emit('execution:resumed', {
      executionId: execution.id,
      state: execution.state,
    });
  });

  executor.on('execution:completed', (execution) => {
    io.to(`execution:${execution.id}`).emit('execution:completed', {
      executionId: execution.id,
      state: execution.state,
      metrics: execution.metrics,
      completedAt: execution.completedAt?.toISOString(),
    });
  });

  executor.on('execution:failed', (execution, error) => {
    io.to(`execution:${execution.id}`).emit('execution:failed', {
      executionId: execution.id,
      state: execution.state,
      error: {
        message: error.message,
        stack: error.stack,
      },
    });
  });

  executor.on('port:emit', (message) => {
    io.to(`execution:${message.executionId}`).emit('port:emit', {
      executionId: message.executionId,
      sourceNode: message.sourceNodeId,
      sourcePort: message.sourcePort,
      targetNode: message.targetNodeId,
      targetPort: message.targetPort,
      value: message.value,
      timestamp: message.timestamp,
      sequence: message.sequence,
    });
  });

  executor.on('metrics:update', (executionId, metrics) => {
    io.to(`execution:${executionId}`).emit('metrics:update', {
      executionId,
      metrics,
    });
  });

  // Handle client connections
  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Join execution room to receive events
    socket.on('execution:subscribe', (data: { executionId: string }) => {
      const { executionId } = data;
      const execution = executor.getExecution(executionId);

      if (!execution) {
        socket.emit('error', { message: 'Execution not found', executionId });
        return;
      }

      socket.join(`execution:${executionId}`);
      console.log(`[Socket] ${socket.id} subscribed to execution ${executionId}`);

      // Send current state
      socket.emit('execution:state', {
        executionId: execution.id,
        graphId: execution.graphId,
        state: execution.state,
        metrics: execution.metrics,
        startedAt: execution.startedAt?.toISOString(),
      });
    });

    // Leave execution room
    socket.on('execution:unsubscribe', (data: { executionId: string }) => {
      const { executionId } = data;
      socket.leave(`execution:${executionId}`);
      console.log(`[Socket] ${socket.id} unsubscribed from execution ${executionId}`);
    });

    // Start execution
    socket.on('execution:start', async (data: { graphId: string }) => {
      try {
        const execution = await executor.startExecution(data.graphId);

        // Auto-subscribe to the new execution
        socket.join(`execution:${execution.id}`);

        socket.emit('execution:started', {
          executionId: execution.id,
          graphId: execution.graphId,
          state: execution.state,
          startedAt: execution.startedAt?.toISOString(),
        });
      } catch (error) {
        socket.emit('error', {
          message: error instanceof Error ? error.message : 'Failed to start execution',
          graphId: data.graphId,
        });
      }
    });

    // Pause execution
    socket.on('execution:pause', async (data: { executionId: string }) => {
      try {
        await executor.pauseExecution(data.executionId);
      } catch (error) {
        socket.emit('error', {
          message: error instanceof Error ? error.message : 'Failed to pause execution',
          executionId: data.executionId,
        });
      }
    });

    // Resume execution
    socket.on('execution:resume', async (data: { executionId: string }) => {
      try {
        await executor.resumeExecution(data.executionId);
      } catch (error) {
        socket.emit('error', {
          message: error instanceof Error ? error.message : 'Failed to resume execution',
          executionId: data.executionId,
        });
      }
    });

    // Stop execution
    socket.on('execution:stop', async (data: { executionId: string }) => {
      try {
        await executor.stopExecution(data.executionId);
      } catch (error) {
        socket.emit('error', {
          message: error instanceof Error ? error.message : 'Failed to stop execution',
          executionId: data.executionId,
        });
      }
    });

    // Inject message
    socket.on('execution:inject', async (data: {
      executionId: string;
      nodeId: string;
      port: string;
      value: unknown;
    }) => {
      try {
        await executor.injectMessage(
          data.executionId,
          data.nodeId,
          data.port,
          data.value
        );

        socket.emit('execution:injected', {
          executionId: data.executionId,
          nodeId: data.nodeId,
          port: data.port,
        });
      } catch (error) {
        socket.emit('error', {
          message: error instanceof Error ? error.message : 'Failed to inject message',
          executionId: data.executionId,
        });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });
  };
}
