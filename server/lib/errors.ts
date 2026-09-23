import type { ServiceError } from '../../shared/domain.js'

export class AppError extends Error {
  readonly status: number
  readonly code: string
  readonly retryable: boolean
  readonly details?: Record<string, unknown>

  constructor(
    status: number,
    code: string,
    message: string,
    options: { retryable?: boolean; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'AppError'
    this.status = status
    this.code = code
    this.retryable = options.retryable ?? false
    this.details = options.details
  }

  toServiceError(): ServiceError {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.details ? { details: this.details } : {}),
    }
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(404, 'NOT_FOUND', `${resource} '${id}' was not found`, { details: { resource, id } })
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(409, 'VERSION_CONFLICT', message, { details })
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(400, 'VALIDATION_ERROR', message, { details })
  }
}

export class IntegrationUnavailableError extends AppError {
  constructor(integration: string, message: string) {
    super(503, 'INTEGRATION_UNAVAILABLE', message, { retryable: false, details: { integration } })
  }
}

export function asAppError(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (error instanceof Error) {
    return new AppError(500, 'INTERNAL_ERROR', error.message, { cause: error })
  }
  return new AppError(500, 'INTERNAL_ERROR', 'An unknown error occurred')
}
