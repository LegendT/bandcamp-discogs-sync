import pThrottle from 'p-throttle';
import { logger } from '@/lib/utils/logger';

export interface RateLimiterOptions {
  limit: number;
  interval: number;
  maxRetries?: number;
  retryDelay?: number;
  enableJitter?: boolean;
}

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  used: number;
  resetTime: Date;
  queueSize: number;
}

/**
 * Enhanced rate limiter for Discogs API with monitoring, retry logic, and jitter
 */
export class DiscogsRateLimiter {
  private throttle: ReturnType<typeof pThrottle>;
  private requestCount: number = 0;
  private windowStart: number = Date.now();
  private options: Required<RateLimiterOptions>;
  private requestQueue: Array<() => void> = [];
  
  // Track rate limit from API responses
  private apiRateLimit: {
    limit: number;
    remaining: number;
    reset: number;
  } | null = null;
  
  constructor(options: RateLimiterOptions) {
    this.options = {
      maxRetries: 3,
      retryDelay: 1000,
      enableJitter: true,
      ...options
    };
    
    // Create throttle with conservative limit (80% of actual limit)
    const safeLimit = Math.floor(options.limit * 0.8);
    this.throttle = pThrottle({
      limit: safeLimit,
      interval: options.interval
    });
    
    logger.info(`Rate limiter initialized: ${safeLimit} requests per ${options.interval}ms`);
  }
  
  /**
   * Update rate limit info from API response headers
   */
  updateFromHeaders(headers: Record<string, string>) {
    const limit = headers['x-discogs-ratelimit-limit'];
    const remaining = headers['x-discogs-ratelimit-remaining'];
    const reset = headers['x-discogs-ratelimit-reset'];
    
    if (limit && remaining && reset) {
      this.apiRateLimit = {
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        reset: parseInt(reset, 10) * 1000 // Convert to milliseconds
      };
      
      // If we're running low on API quota, slow down
      if (this.apiRateLimit.remaining < 10) {
        logger.warn('Low on API rate limit quota', {
          remaining: this.apiRateLimit.remaining,
          resetTime: new Date(this.apiRateLimit.reset).toISOString()
        });
      }
    }
  }
  
  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(attempt: number): number {
    const baseDelay = this.options.retryDelay * Math.pow(2, attempt - 1);
    
    if (!this.options.enableJitter) {
      return baseDelay;
    }
    
    // Add random jitter (±25% of base delay)
    const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1);
    return Math.round(baseDelay + jitter);
  }
  
  /**
   * Execute a function with rate limiting and retry logic
   */
  async execute<T>(fn: () => Promise<T>, context?: string): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        // Check if we should wait based on API rate limit info
        if (this.apiRateLimit && this.apiRateLimit.remaining <= 5) {
          const waitTime = Math.max(0, this.apiRateLimit.reset - Date.now());
          if (waitTime > 0) {
            logger.info(`Waiting for API rate limit reset`, {
              waitTime,
              context
            });
            await this.wait(waitTime);
          }
        }
        
        // Check if we should reset the window
        this.checkWindow();
        
        // Add to queue size for monitoring
        this.requestQueue.push(() => {});
        
        // Execute with throttling
        const result = await this.throttle(async () => {
          this.requestQueue.pop();
          this.requestCount++;
          
          // Log rate limit status periodically
          if (this.requestCount % 10 === 0) {
            const info = this.getRateLimitInfo();
            logger.debug('Rate limit status', {
              used: info.used,
              remaining: info.remaining,
              resetTime: info.resetTime.toISOString(),
              queueSize: info.queueSize,
              apiRemaining: this.apiRateLimit?.remaining
            });
          }
          
          try {
            const response = await fn();
            
            // Extract rate limit headers if available
            if (response && typeof response === 'object' && 'headers' in response) {
              this.updateFromHeaders(response.headers as any);
            }
            
            return response;
          } catch (error: any) {
            // If it's an axios response, extract headers
            if (error.response?.headers) {
              this.updateFromHeaders(error.response.headers);
            }
            throw error;
          }
        })();
        
        return result;
        
      } catch (error: any) {
        lastError = error;
        
        // Check if it's a rate limit error
        if (error.response?.status === 429) {
          const retryAfter = this.parseRetryAfter(error.response.headers['retry-after']);
          const jitteredDelay = this.calculateRetryDelay(attempt);
          const waitTime = retryAfter || jitteredDelay;
          
          logger.warn(`Rate limit hit. Waiting ${waitTime}ms before retry ${attempt}/${this.options.maxRetries}`, {
            context,
            attempt,
            hasJitter: this.options.enableJitter
          });
          
          await this.wait(waitTime);
          continue;
        }
        
        // For other errors, don't retry
        throw error;
      }
    }
    
    // All retries exhausted
    throw new Error(
      `Rate limit retry exhausted after ${this.options.maxRetries} attempts: ${lastError?.message}`
    );
  }
  
  /**
   * Get current rate limit information
   */
  getRateLimitInfo(): RateLimitInfo {
    const elapsed = Date.now() - this.windowStart;
    const remaining = Math.max(0, this.options.limit - this.requestCount);
    const resetTime = new Date(this.windowStart + this.options.interval);
    
    return {
      remaining,
      limit: this.options.limit,
      used: this.requestCount,
      resetTime,
      queueSize: this.requestQueue.length
    };
  }
  
  /**
   * Reset rate limit counters if window has passed
   */
  private checkWindow(): void {
    const now = Date.now();
    if (now - this.windowStart >= this.options.interval) {
      this.windowStart = now;
      this.requestCount = 0;
      logger.debug('Rate limit window reset');
    }
  }
  
  /**
   * Parse retry-after header (can be seconds or HTTP date)
   */
  private parseRetryAfter(retryAfter?: string): number | null {
    if (!retryAfter) return null;
    
    // If it's a number, it's seconds
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }
    
    // Otherwise, try to parse as date
    const date = new Date(retryAfter);
    if (!isNaN(date.getTime())) {
      return Math.max(0, date.getTime() - Date.now());
    }
    
    return null;
  }
  
  /**
   * Wait for specified milliseconds
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Emergency brake - pause all requests
   */
  async pause(duration: number): Promise<void> {
    logger.warn(`Rate limiter paused for ${duration}ms`);
    await this.wait(duration);
  }
  
  /**
   * Get queue status for monitoring
   */
  getQueueStatus() {
    return {
      queueSize: this.requestQueue.length,
      isThrottled: this.requestCount >= Math.floor(this.options.limit * 0.8),
      apiQuotaLow: this.apiRateLimit ? this.apiRateLimit.remaining < 10 : false
    };
  }
}

// Singleton instance for the application
let rateLimiterInstance: DiscogsRateLimiter | null = null;

export function getDiscogsRateLimiter(): DiscogsRateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new DiscogsRateLimiter({
      limit: 60,          // Discogs allows 60 requests per minute
      interval: 60 * 1000, // 1 minute in milliseconds
      enableJitter: true   // Prevent thundering herd
    });
  }
  return rateLimiterInstance;
}