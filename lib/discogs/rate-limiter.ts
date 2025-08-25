import pThrottle from 'p-throttle';
import { logger } from '@/lib/utils/logger';

export interface RateLimiterOptions {
  limit: number;
  interval: number;
  maxRetries?: number;
  retryDelay?: number;
}

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  used: number;
  resetTime: Date;
}

/**
 * Enhanced rate limiter for Discogs API with monitoring and retry logic
 */
export class DiscogsRateLimiter {
  private throttle: ReturnType<typeof pThrottle>;
  private requestCount: number = 0;
  private windowStart: number = Date.now();
  private options: Required<RateLimiterOptions>;
  
  constructor(options: RateLimiterOptions) {
    this.options = {
      maxRetries: 3,
      retryDelay: 1000,
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
   * Execute a function with rate limiting and retry logic
   */
  async execute<T>(fn: () => Promise<T>, context?: string): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        // Check if we should reset the window
        this.checkWindow();
        
        // Execute with throttling
        const result = await this.throttle(async () => {
          this.requestCount++;
          
          // Log rate limit status periodically
          if (this.requestCount % 10 === 0) {
            const info = this.getRateLimitInfo();
            logger.debug('Rate limit status', {
              used: info.used,
              remaining: info.remaining,
              resetTime: info.resetTime.toISOString()
            });
          }
          
          return await fn();
        })();
        
        return result;
        
      } catch (error: any) {
        lastError = error;
        
        // Check if it's a rate limit error
        if (error.response?.status === 429) {
          const retryAfter = this.parseRetryAfter(error.response.headers['retry-after']);
          const waitTime = retryAfter || (this.options.retryDelay * attempt);
          
          logger.warn(`Rate limit hit. Waiting ${waitTime}ms before retry ${attempt}/${this.options.maxRetries}`, {
            context,
            attempt
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
      resetTime
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
}

// Singleton instance for the application
let rateLimiterInstance: DiscogsRateLimiter | null = null;

export function getDiscogsRateLimiter(): DiscogsRateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new DiscogsRateLimiter({
      limit: 60,          // Discogs allows 60 requests per minute
      interval: 60 * 1000 // 1 minute in milliseconds
    });
  }
  return rateLimiterInstance;
}