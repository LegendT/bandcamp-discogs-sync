/**
 * Custom error classes for better error handling
 */

export class BaseError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public retryable: boolean = false,
    public details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      retryable: this.retryable,
      details: this.details
    };
  }
}

export class ValidationError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, false, details);
  }
}

export class AuthenticationError extends BaseError {
  constructor(message = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401, false);
  }
}

export class RateLimitError extends BaseError {
  constructor(retryAfter: number) {
    super(
      `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
      'RATE_LIMIT_ERROR',
      429,
      true,
      { retryAfter }
    );
  }
}

export class DiscogsAPIError extends BaseError {
  constructor(message: string, statusCode: number, details?: any) {
    super(
      message,
      'DISCOGS_API_ERROR',
      statusCode,
      statusCode >= 500 || statusCode === 429,
      details
    );
  }
}

export class FileUploadError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 'FILE_UPLOAD_ERROR', 400, false, details);
  }
}

export class MatchingError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 'MATCHING_ERROR', 422, false, details);
  }
}

export class SyncError extends BaseError {
  constructor(message: string, details?: any) {
    super(message, 'SYNC_ERROR', 500, true, details);
  }
}

/**
 * User-friendly error messages
 */
export const ErrorMessages = {
  GENERIC: 'Something went wrong. Please try again.',
  NETWORK: 'Unable to connect. Please check your internet connection.',
  TOKEN_INVALID: 'Your Discogs token is invalid. Please check and try again.',
  TOKEN_EXPIRED: 'Your session has expired. Please enter your token again.',
  FILE_TOO_LARGE: 'File is too large. Maximum size is 10MB.',
  FILE_INVALID_FORMAT: 'Invalid file format. Please upload a CSV file.',
  FILE_EMPTY: 'The uploaded file is empty.',
  NO_MATCHES_FOUND: 'No matches found. Try adjusting your search criteria.',
  SYNC_FAILED: 'Failed to sync items to Discogs. Please try again.',
  RATE_LIMIT: 'Too many requests. Please wait a moment and try again.',
  DISCOGS_UNAVAILABLE: 'Discogs is currently unavailable. Please try again later.'
};

/**
 * Get user-friendly error message
 */
export function getUserMessage(error: any): string {
  if (error instanceof BaseError) {
    return error.message;
  }
  
  if (error?.code) {
    switch (error.code) {
      case 'ECONNREFUSED':
      case 'ENOTFOUND':
      case 'ETIMEDOUT':
        return ErrorMessages.NETWORK;
      case 'RATE_LIMIT_ERROR':
        return ErrorMessages.RATE_LIMIT;
      default:
        return error.message || ErrorMessages.GENERIC;
    }
  }
  
  if (error?.message) {
    // Check for common error patterns
    if (error.message.includes('token')) {
      return ErrorMessages.TOKEN_INVALID;
    }
    if (error.message.includes('rate')) {
      return ErrorMessages.RATE_LIMIT;
    }
    if (error.message.includes('network')) {
      return ErrorMessages.NETWORK;
    }
    return error.message;
  }
  
  return ErrorMessages.GENERIC;
}