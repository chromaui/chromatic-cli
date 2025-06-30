import { createServer } from 'http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';

import TestLogger from './testLogger';
import waitForBuildToComplete, {
  NotifyConnectionError,
  NotifyServiceAuthenticationError,
  NotifyServiceError,
  NotifyServiceMessageTimeoutError,
} from './waitForBuildToComplete';

describe('waitForBuildToComplete', () => {
  let server: WebSocketServer;
  let testUrl: string;
  let log: TestLogger;

  beforeAll(async () => {
    server = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => {
      server.on('listening', () => {
        testUrl = `ws://localhost:${(server.address() as any).port}`;
        resolve();
      });
    });
  });

  afterAll(() => {
    server?.close();
  });

  beforeEach(() => {
    log = new TestLogger();
    server.removeAllListeners('connection');
  });

  it('successfully connects and logs handshake success', async () => {
    server.on('connection', (ws) => {
      // Send completion message immediately so waitForBuildComplete resolves
      ws.send(
        JSON.stringify({
          completedAt: Date.now(),
          inProgressCount: 0,
          status: 'PASSED',
        })
      );
    });

    await waitForBuildToComplete({
      notifyServiceUrl: testUrl,
      buildId: 'test-build',
      log,
    });

    expect(log.entries).toContain(
      `notify service handshake successful at ${testUrl}/build/test-build`
    );
  });

  it('handles connection timeout/failure', async () => {
    const badUrl = 'ws://localhost:9999';

    await expect(
      waitForBuildToComplete({
        notifyServiceUrl: badUrl,
        buildId: 'test-build',
        log,
      })
    ).rejects.toThrow(NotifyConnectionError);
  });

  it('processes valid progress messages and calls callback', async () => {
    const progressCallback = vi.fn();
    const testMessage = {
      completedAt: undefined,
      inProgressCount: 5,
      status: 'IN_PROGRESS',
    };

    server.on('connection', (ws) => {
      ws.send(JSON.stringify(testMessage));
      // Send completion after progress message
      setTimeout(() => {
        ws.send(
          JSON.stringify({
            completedAt: Date.now(),
            inProgressCount: 0,
            status: 'PASSED',
          })
        );
      }, 10);
    });

    await waitForBuildToComplete({
      notifyServiceUrl: testUrl,
      buildId: 'test-build',
      progressMessageCallback: progressCallback,
      log,
    });

    expect(progressCallback).toHaveBeenCalledWith(testMessage);
    expect(progressCallback).toHaveBeenCalledTimes(2); // progress + completion
  });

  it('resolves when receiving completedAt message', async () => {
    const completionTime = Date.now();

    server.on('connection', (ws) => {
      ws.send(
        JSON.stringify({
          completedAt: completionTime,
          inProgressCount: 0,
          status: 'PASSED',
        })
      );
    });

    await waitForBuildToComplete({
      notifyServiceUrl: testUrl,
      buildId: 'test-build',
      log,
    });

    expect(log.entries).toContain('notify service: build complete');
  });

  it('throws NotifyServiceError for invalid JSON', async () => {
    server.on('connection', (ws) => {
      ws.send('invalid json');
    });

    await expect(
      waitForBuildToComplete({
        notifyServiceUrl: testUrl,
        buildId: 'test-build',
        log,
      })
    ).rejects.toThrow(NotifyServiceError);
  });

  it('throws NotifyServiceError for schema validation failures', async () => {
    server.on('connection', (ws) => {
      ws.send(
        JSON.stringify({
          wrongField: 'value',
        })
      );
    });

    await expect(
      waitForBuildToComplete({
        notifyServiceUrl: testUrl,
        buildId: 'test-build',
        log,
      })
    ).rejects.toThrow(NotifyServiceError);
  });

  it('throws NotifyServiceError when progress callback throws', async () => {
    const errorCallback = vi.fn().mockImplementation(() => {
      throw new Error('Callback error');
    });

    server.on('connection', (ws) => {
      ws.send(
        JSON.stringify({
          inProgressCount: 0,
          status: 'IN_PROGRESS',
        })
      );
    });

    await expect(
      waitForBuildToComplete({
        notifyServiceUrl: testUrl,
        buildId: 'test-build',
        progressMessageCallback: errorCallback,
        log,
      })
    ).rejects.toThrow(NotifyServiceError);
  });

  it('throws NotifyServiceError on WebSocket error', async () => {
    server.on('connection', (ws) => {
      // Force an error by closing the connection abruptly
      ws.terminate();
    });

    await expect(
      waitForBuildToComplete({
        notifyServiceUrl: testUrl,
        buildId: 'test-build',
        log,
      })
    ).rejects.toThrow(NotifyServiceError);
  });

  it('throws NotifyConnectionError on code 1006', async () => {
    server.on('connection', (ws) => {
      // Terminate the connection abruptly to simulate code 1006
      ws.terminate();
    });

    await expect(
      waitForBuildToComplete({
        notifyServiceUrl: testUrl,
        buildId: 'test-build',
        log,
      })
    ).rejects.toThrow(NotifyConnectionError);
  });

  it('throws NotifyServiceError on other unexpected close codes', async () => {
    server.on('connection', (ws) => {
      // Close with abnormal code (1001 - Going Away, https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code)
      ws.close(1001, 'Going away');
    });

    await expect(
      waitForBuildToComplete({
        notifyServiceUrl: testUrl,
        buildId: 'test-build',
        log,
      })
    ).rejects.toThrow(NotifyServiceError);
  });

  it('logs progress messages', async () => {
    const testMessage = {
      completedAt: Date.now(),
      inProgressCount: 0,
      status: 'PASSED',
    };

    server.on('connection', (ws) => {
      ws.send(JSON.stringify(testMessage));
    });

    await waitForBuildToComplete({
      notifyServiceUrl: testUrl,
      buildId: 'test-build',
      log,
    });

    expect(log.entries).toContain(`notify service message: ${JSON.stringify(testMessage)}`);
  });

  it('throws NotifyServiceMessageTimeoutError on 408 request timeout', async () => {
    server.on('connection', (ws) => {
      // Close with normal status code but 408 Request Timeout message, like the notify service
      ws.close(1000, '408 Request Timeout');
    });

    await expect(
      waitForBuildToComplete({
        notifyServiceUrl: testUrl,
        buildId: 'test-build',
        log,
      })
    ).rejects.toThrow(NotifyServiceMessageTimeoutError);
  });

  it('sends headers in WebSocket handshake', async () => {
    const customHeaders = {
      Authorization: 'Bearer test-token',
      'X-Custom-Header': 'custom-value',
    };

    let receivedHeaders: any;
    server.on('connection', (ws, request) => {
      receivedHeaders = request.headers;
      // Send completion message so the test resolves
      ws.send(
        JSON.stringify({
          completedAt: Date.now(),
          inProgressCount: 0,
          status: 'PASSED',
        })
      );
    });

    await waitForBuildToComplete({
      notifyServiceUrl: testUrl,
      buildId: 'test-build',
      headers: customHeaders,
      log,
    });

    expect(receivedHeaders.authorization).toBe('Bearer test-token');
    expect(receivedHeaders['x-custom-header']).toBe('custom-value');
  });

  it('throws NotifyServiceAuthenticationError for 400 status code', async () => {
    const httpServer = createServer();

    httpServer.on('upgrade', (_request, socket, _head) => {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });

    const port = (httpServer.address() as any).port;
    const errorUrl = `ws://localhost:${port}`;

    try {
      const error = await waitForBuildToComplete({
        notifyServiceUrl: errorUrl,
        buildId: 'test-build',
        log,
      }).catch((error_) => error_);

      expect(error).toBeInstanceOf(NotifyServiceAuthenticationError);
      expect(error.message).toBe('Invalid build ID');
      expect(error.statusCode).toBe(400);
    } finally {
      httpServer.close();
    }
  });

  it('throws NotifyServiceAuthenticationError for 401 status code', async () => {
    const httpServer = createServer();

    httpServer.on('upgrade', (_request, socket, _head) => {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });

    const port = (httpServer.address() as any).port;
    const errorUrl = `ws://localhost:${port}`;

    try {
      const error = await waitForBuildToComplete({
        notifyServiceUrl: errorUrl,
        buildId: 'test-build',
        log,
      }).catch((error_) => error_);

      expect(error).toBeInstanceOf(NotifyServiceAuthenticationError);
      expect(error.message).toBe('Unauthorized request');
      expect(error.statusCode).toBe(401);
    } finally {
      httpServer.close();
    }
  });

  it('throws NotifyServiceAuthenticationError for 403 status code', async () => {
    const httpServer = createServer();

    httpServer.on('upgrade', (_request, socket, _head) => {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });

    const port = (httpServer.address() as any).port;
    const errorUrl = `ws://localhost:${port}`;

    try {
      const error = await waitForBuildToComplete({
        notifyServiceUrl: errorUrl,
        buildId: 'test-build',
        log,
      }).catch((error_) => error_);

      expect(error).toBeInstanceOf(NotifyServiceAuthenticationError);
      expect(error.message).toBe('Access denied to build');
      expect(error.statusCode).toBe(403);
    } finally {
      httpServer.close();
    }
  });

  it('throws NotifyServiceAuthenticationError for 404 status code', async () => {
    const httpServer = createServer();

    httpServer.on('upgrade', (_request, socket, _head) => {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });

    const port = (httpServer.address() as any).port;
    const errorUrl = `ws://localhost:${port}`;

    try {
      const error = await waitForBuildToComplete({
        notifyServiceUrl: errorUrl,
        buildId: 'test-build',
        log,
      }).catch((error_) => error_);

      expect(error).toBeInstanceOf(NotifyServiceAuthenticationError);
      expect(error.message).toBe('Build not found');
      expect(error.statusCode).toBe(404);
    } finally {
      httpServer.close();
    }
  });

  it('throws NotifyServiceError for other status codes in unexpected-response', async () => {
    const httpServer = createServer();

    httpServer.on('upgrade', (_request, socket, _head) => {
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });

    const port = (httpServer.address() as any).port;
    const errorUrl = `ws://localhost:${port}`;

    try {
      const error = await waitForBuildToComplete({
        notifyServiceUrl: errorUrl,
        buildId: 'test-build',
        log,
      }).catch((error_) => error_);

      expect(error).toBeInstanceOf(NotifyServiceError);
      expect(error.message).toBe('Unexpected response from notify service');
      expect(error.statusCode).toBe(500);
    } finally {
      httpServer.close();
    }
  });
});
