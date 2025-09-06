/**
 * Retry utility with exponential backoff
 * Provides resilient error recovery for network operations
 */

import logger from './logger';

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  retryableErrors?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2,
  retryableErrors: (error) => {
    // Retry on network errors and specific HTTP status codes
    if (error.name === 'NetworkError' || error.name === 'TimeoutError') {
      return true;
    }
    
    if (error.message.includes('429') || error.message.includes('rate limit')) {
      return true;
    }
    
    if (error.message.includes('503') || error.message.includes('service unavailable')) {
      return true;
    }
    
    return false;
  },
  onRetry: (attempt, error) => {
    logger.warn(`Retry attempt ${attempt}:`, error.message);
  }
};

/**
 * Execute function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if error is retryable
      if (!opts.retryableErrors(lastError)) {
        throw lastError;
      }
      
      // Don't retry on last attempt
      if (attempt === opts.maxAttempts) {
        throw lastError;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelay * Math.pow(opts.backoffFactor, attempt - 1),
        opts.maxDelay
      );
      
      // Call retry callback
      opts.onRetry(attempt, lastError);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error('Retry failed');
}

/**
 * Circuit breaker for preventing cascading failures
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private readonly threshold: number = 5,
    private readonly timeout: number = 60000,
    private readonly resetTimeout: number = 30000
  ) {}
  
  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check circuit state
    if (this.state === 'open') {
      const now = Date.now();
      if (now - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
        logger.info('Circuit breaker entering half-open state');
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
    
    try {
      const result = await fn();
      
      // Reset on success
      if (this.state === 'half-open') {
        this.reset();
        logger.info('Circuit breaker reset to closed state');
      }
      
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }
  
  /**
   * Record a failure
   */
  private recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'open';
      logger.error(`Circuit breaker opened after ${this.failures} failures`);
      
      // Auto-reset after timeout
      setTimeout(() => {
        this.state = 'half-open';
        logger.info('Circuit breaker auto-reset to half-open');
      }, this.resetTimeout);
    }
  }
  
  /**
   * Reset circuit breaker
   */
  private reset(): void {
    this.failures = 0;
    this.lastFailureTime = 0;
    this.state = 'closed';
  }
  
  /**
   * Get current state
   */
  getState(): string {
    return this.state;
  }
}

/**
 * Batch processor with error recovery
 */
export class BatchProcessor<T, R> {
  constructor(
    private readonly processFn: (items: T[]) => Promise<R[]>,
    private readonly batchSize: number = 10,
    private readonly options: RetryOptions = {}
  ) {}
  
  /**
   * Process items in batches with retry logic
   */
  async processAll(
    items: T[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<R[]> {
    const results: R[] = [];
    const batches = this.createBatches(items);
    let completed = 0;
    
    for (const batch of batches) {
      try {
        const batchResults = await withRetry(
          () => this.processFn(batch),
          this.options
        );
        
        results.push(...batchResults);
        completed += batch.length;
        
        if (onProgress) {
          onProgress(completed, items.length);
        }
      } catch (error) {
        logger.error(`Batch processing failed:`, error);
        
        // Try processing items individually
        for (const item of batch) {
          try {
            const result = await withRetry(
              () => this.processFn([item]),
              { ...this.options, maxAttempts: 2 }
            );
            
            results.push(...result);
            completed++;
            
            if (onProgress) {
              onProgress(completed, items.length);
            }
          } catch (itemError) {
            logger.error(`Failed to process item:`, itemError);
            // Continue with next item
          }
        }
      }
    }
    
    return results;
  }
  
  /**
   * Create batches from items
   */
  private createBatches(items: T[]): T[][] {
    const batches: T[][] = [];
    
    for (let i = 0; i < items.length; i += this.batchSize) {
      batches.push(items.slice(i, i + this.batchSize));
    }
    
    return batches;
  }
}