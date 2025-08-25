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
// Note: This resets on each serverless function cold start
const store: RateLimitStore = {};

// Clean up expired entries on each check to prevent memory leaks
function cleanupExpired() {
  const now = Date.now();
  Object.keys(store).forEach(key => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
}

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max } = options;

  return {
    async check(request: NextRequest): Promise<{ success: boolean; remaining: number }> {
      // Skip rate limiting in development mode for easier testing
      if (process.env.NODE_ENV === 'development') {
        return { success: true, remaining: max };
      }
      
      // Clean up old entries
      cleanupExpired();
      
      // Get client identifier - use multiple headers for better detection
      const forwarded = request.headers.get('x-forwarded-for');
      const realIp = request.headers.get('x-real-ip');
      const cfConnectingIp = request.headers.get('cf-connecting-ip');
      
      // Try to get a unique identifier, fallback to a random session ID for development
      const ip = forwarded?.split(',')[0] || realIp || cfConnectingIp || 
                 `dev-${Math.random().toString(36).substring(7)}`;
      
      const key = `rate-limit:${ip}`;
      
      const now = Date.now();

      // Get or create rate limit entry
      if (!store[key] || store[key].resetTime < now) {
        store[key] = {
          count: 0,
          resetTime: now + windowMs
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
// More generous limits for development
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100 // 100 requests per minute
});

export const uploadRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20 // 20 uploads per minute (increased from 10)
});

export const matchRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300 // 300 match requests per minute (increased for parallel processing)
});

export const syncRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50 // 50 sync operations per minute (increased from 20)
});