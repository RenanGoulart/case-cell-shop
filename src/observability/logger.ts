import pino, { type Logger } from "pino";

export interface HttpLogContext {
  readonly requestId: string;
  readonly correlationId?: string;
  readonly orderId?: string;
}

export interface WorkerLogContext {
  readonly correlationId: string;
  readonly orderId?: string;
  readonly attemptNumber?: number;
}

export function createLogger(level = "info"): Logger {
  return pino({
    level,
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export function httpLogger(logger: Logger, context: HttpLogContext): Logger {
  return logger.child(context);
}

export function workerLogger(logger: Logger, context: WorkerLogContext): Logger {
  return logger.child(context);
}
