export type HttpSafeErrorCode =
  | "INVALID_REQUEST"
  | "PRODUCT_NOT_FOUND"
  | "INSUFFICIENT_STOCK"
  | "IDEMPOTENCY_CONFLICT"
  | "ORDER_NOT_FOUND"
  | "CATALOG_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  public constructor(
    public readonly code: HttpSafeErrorCode,
    message: string,
    public readonly httpStatus: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export interface ErrorEnvelope {
  readonly code: HttpSafeErrorCode;
  readonly message: string;
  readonly requestId: string;
  readonly details?: unknown;
}

export function toErrorEnvelope(error: AppError, requestId: string): ErrorEnvelope {
  return {
    code: error.code,
    message: error.message,
    requestId,
    ...(error.details === undefined ? {} : { details: error.details }),
  };
}
