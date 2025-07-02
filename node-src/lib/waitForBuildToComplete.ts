import { Logger } from '@cli/log';
import type { IncomingMessage } from 'http';
import WebSocket from 'ws';
import { z } from 'zod';

const NORMAL_CLOSURE_STATUS_CODE = 1000; // https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code
const CONNECTION_FAILED_STATUS_CODE = 1006; // https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code
const BUILD_COMPLETE_CLOSURE_MESSAGE = 'Build complete';

interface Arguments {
  notifyServiceUrl: string;
  buildId: string;
  progressMessageCallback?: (message: BuildProgressMessage) => void;
  log: Logger;
  headers?: Record<string, string>;
}

const BuildProgressMessageSchema = z.object({
  completedAt: z.number().positive().optional(),
  inProgressCount: z.number().min(0),
  status: z.string(),
});

/**
 * Represents a build progress message received from the notify service.
 */
export type BuildProgressMessage = z.infer<typeof BuildProgressMessageSchema>;

/**
 * Error thrown when there's a problem with the notify service.
 */
export class NotifyServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly reason?: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'NotifyServiceError';
  }
}

/**
 * Error thrown when a connection to the notify service cannot be established.
 */
export class NotifyConnectionError extends NotifyServiceError {
  constructor(message: string, statusCode?: number, reason?: string, originalError?: Error) {
    super(message, statusCode, reason, originalError);
    this.name = 'NotifyConnectionError';
  }
}

/**
 * Error thrown when the notify service fails to send a build progress message within the configured timeout interval.
 */
export class NotifyServiceMessageTimeoutError extends NotifyServiceError {
  constructor(message: string, statusCode?: number, reason?: string, originalError?: Error) {
    super(message, statusCode, reason, originalError);
    this.name = 'NotifyServiceMessageTimeoutError';
  }
}

/**
 * Error thrown when there's an authentication or authorization problem with the notify service.
 */
export class NotifyServiceAuthenticationError extends NotifyServiceError {
  constructor(message: string, statusCode: number, reason?: string, originalError?: Error) {
    super(message, statusCode, reason, originalError);
    this.name = 'NotifyServiceAuthenticationError';
  }
}

/**
 * Waits for a build to complete by establishing a WebSocket connection to the notify service
 * and listening for progress messages until the build is finished.
 *
 * @param arguments - Configuration object
 * @param arguments.notifyServiceUrl - The base URL of the notify service
 * @param arguments.buildId - The unique identifier of the build to monitor
 * @param arguments.progressMessageCallback - Optional callback function to handle progress messages
 * @param arguments.log - Logger instance for debug output
 * @param arguments.headers - Headers to add to the notify service handshake request
 *
 * @returns Promise that resolves when the build completes
 *
 * @throws {NotifyConnectionError} When a connection to the notify service cannot be established
 * @throws {NotifyServiceError} When the notify service connection closes unexpectedly, when the message from
 * the notify server fails to parse, or when the progressMessageCallback throws an error
 * @throws {NotifyServiceMessageTimeoutError} When the notify service closes the websocket connection due to no
 * messages being sent for an extended period of time.
 * @throws {NotifyServiceAuthenticationError} When there is an error authenticating with the notify service.
 */
export default async function waitForBuildToComplete({
  notifyServiceUrl,
  buildId,
  progressMessageCallback,
  log,
  headers,
}: Arguments): Promise<void> {
  const url = `${notifyServiceUrl}/build/${buildId}`;
  const subscriber = new WebSocket(url, {
    handshakeTimeout: 4000,
    headers,
  });
  return await new Promise((resolve, reject) => {
    subscriber.on('open', () => {
      log.debug(`notify service handshake successful at ${url}`);
    });

    subscriber.on('unexpected-response', (_request, response: IncomingMessage) => {
      const statusCode = response.statusCode;
      log.debug(`notify service unexpected response: ${statusCode}`);

      switch (statusCode) {
        case 400:
          reject(new NotifyServiceAuthenticationError('Invalid build ID', statusCode));
          break;
        case 401:
          reject(new NotifyServiceAuthenticationError('Unauthorized request', statusCode));
          break;
        case 403:
          reject(new NotifyServiceAuthenticationError('Access denied to build', statusCode));
          break;
        case 404:
          reject(new NotifyServiceAuthenticationError('Build not found', statusCode));
          break;
        default:
          reject(new NotifyServiceError('Unexpected response from notify service', statusCode));
      }
    });

    subscriber.on('close', (code: number, reason: Buffer) => {
      const reasonString = reason.toString();

      log.debug(`notify service connection closed with code ${code}: ${reasonString}`);

      if (code === NORMAL_CLOSURE_STATUS_CODE && reasonString === BUILD_COMPLETE_CLOSURE_MESSAGE) {
        // the promise should be resolved in the message handler in this scenario, but just to be safe,
        // we'll resolve again so callers aren't left hanging
        resolve();
      }

      // The notify service sends a 408 Request Timeout response, but it has a normal closure status code (1000),
      // so we need to inspect the message
      if (reason.toString().includes('408 Request Timeout')) {
        reject(
          new NotifyServiceMessageTimeoutError(
            'Timed out waiting for message from notify service',
            408,
            reason.toString()
          )
        );
      }

      // the websocket might have been suddenly terminated, in which case, the error handler doesn't run,
      // so we need to check the error status code here
      if (code === CONNECTION_FAILED_STATUS_CODE) {
        reject(
          new NotifyConnectionError('Failed to connect to notify service', code, reasonString)
        );
      }

      reject(
        new NotifyServiceError('Notify service connection closed unexpectedly', code, reasonString)
      );
    });

    subscriber.on('error', (error) => {
      // Check if this is a connection error
      const errorCode = (error as any).code; // code attribute may be present: https://github.com/websockets/ws/blob/HEAD/doc/ws.md#event-error-1
      if (
        errorCode === 'ECONNREFUSED' ||
        errorCode === 'ENOTFOUND' ||
        errorCode === 'ETIMEDOUT' ||
        errorCode === 'HPE_INVALID_CONSTANT' ||
        (error.message && error.message.includes('Opening handshake has timed out'))
      ) {
        reject(
          new NotifyConnectionError(
            'Failed to connect to notify service',
            errorCode,
            undefined,
            error
          )
        );
      }
      reject(new NotifyServiceError('Notify service error occurred', errorCode, undefined, error));
    });

    subscriber.on('message', (message: WebSocket.Data) => {
      try {
        log.debug(`notify service message: ${message}`);
        const parsedMessage = BuildProgressMessageSchema.parse(JSON.parse(message.toString()));
        if (progressMessageCallback) {
          progressMessageCallback(parsedMessage);
        }
        if (parsedMessage.completedAt) {
          log.debug('notify service: build complete');
          subscriber.close(NORMAL_CLOSURE_STATUS_CODE, BUILD_COMPLETE_CLOSURE_MESSAGE);
          resolve();
        }
      } catch (error) {
        reject(
          new NotifyServiceError(
            'Unexpected error handling notify service message',
            undefined,
            undefined,
            error
          )
        );
      }
    });
  });
}
