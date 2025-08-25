import { NextRequest } from 'next/server';

interface RateLimitOptions {
  windowMs: number;  // Time window in milliseconds
  max: number;       // Max requests per window
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

// In-memory store for rate limiting (consider Redis for production)
const store: RateLimitStore = {};

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach(key => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
}, 60000); // Clean every minute

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max } = options;

  return {
    async check(request: NextRequest): Promise<{ success: boolean; remaining: number }> {
      // Get client identifier (IP address or fallback to a generic key)
      const forwarded = request.headers.get('x-forwarded-for');
      const ip = forwarded ? forwarded.split(',')[0] : 'unknown';
      const key = `rate-limit:${ip}`;
      
      const now = Date.now();
      const resetTime = now + windowMs;

      // Get or create rate limit entry
      if (!store[key] || store[key].resetTime < now) {
        store[key] = {
          count: 0,
          resetTime
        };
      }

      const entry = store[key];
      entry.count++;

      const remaining = Math.max(0, max - entry.count);
      const success = entry.count <= max;

      return {
        success,
        remaining
      };
    }
  };
}

// Pre-configured rate limiters for different endpoints
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100 // 100 requests per minute
});

export const uploadRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10 // 10 uploads per minute
});

export const matchRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200 // 200 match requests per minute (allows parallel processing)
});

export const syncRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20 // 20 sync operations per minute
});