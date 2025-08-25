/**
 * Simple in-memory rate limiter for API endpoints
 * For production, use Redis-based rate limiting
 */

interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
  message?: string;
}

export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private options: Required<RateLimiterOptions>;
  
  constructor(options: RateLimiterOptions) {
    this.options = {
      message: 'Too many requests',
      ...options
    };
    
    // Clean up old entries periodically
    setInterval(() => this.cleanup(), this.options.windowMs);
  }
  
  async check(identifier: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;
    
    // Get existing requests for this identifier
    let timestamps = this.requests.get(identifier) || [];
    
    // Remove old requests outside the window
    timestamps = timestamps.filter(ts => ts > windowStart);
    
    // Check if limit exceeded
    if (timestamps.length >= this.options.maxRequests) {
      const oldestRequest = Math.min(...timestamps);
      const retryAfter = Math.ceil((oldestRequest + this.options.windowMs - now) / 1000);
      
      return {
        allowed: false,
        limit: this.options.maxRequests,
        remaining: 0,
        reset: oldestRequest + this.options.windowMs,
        retryAfter,
        message: this.options.message
      };
    }
    
    // Add current request
    timestamps.push(now);
    this.requests.set(identifier, timestamps);
    
    return {
      allowed: true,
      limit: this.options.maxRequests,
      remaining: this.options.maxRequests - timestamps.length,
      reset: now + this.options.windowMs
    };
  }
  
  /**
   * Clean up old entries to prevent memory leak
   */
  private cleanup() {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;
    
    for (const [identifier, timestamps] of this.requests.entries()) {
      const validTimestamps = timestamps.filter(ts => ts > windowStart);
      
      if (validTimestamps.length === 0) {
        this.requests.delete(identifier);
      } else {
        this.requests.set(identifier, validTimestamps);
      }
    }
  }
  
  /**
   * Reset rate limit for a specific identifier
   */
  reset(identifier: string) {
    this.requests.delete(identifier);
  }
  
  /**
   * Get current state for monitoring
   */
  getState() {
    return {
      identifiers: this.requests.size,
      totalRequests: Array.from(this.requests.values()).reduce((sum, ts) => sum + ts.length, 0)
    };
  }
}