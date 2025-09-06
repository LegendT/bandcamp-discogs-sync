/**
 * Rate limiting middleware for API routes
 * Prevents abuse and ensures fair usage
 */

import { NextRequest } from 'next/server';

interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly windowMs = 60000; // 1 minute window
  private readonly maxRequests = 10; // 10 requests per minute per IP
  
  /**
   * Check if request should be allowed
   */
  async check(request: NextRequest): Promise<RateLimitResult> {
    const ip = this.getClientIp(request);
    const now = Date.now();
    
    // Get existing requests for this IP
    const existingRequests = this.requests.get(ip) || [];
    
    // Filter out old requests outside the window
    const recentRequests = existingRequests.filter(
      timestamp => now - timestamp < this.windowMs
    );
    
    // Check if limit exceeded
    if (recentRequests.length >= this.maxRequests) {
      const oldestRequest = recentRequests[0];
      const retryAfter = Math.ceil((oldestRequest + this.windowMs - now) / 1000);
      
      return {
        allowed: false,
        retryAfter
      };
    }
    
    // Add current request
    recentRequests.push(now);
    this.requests.set(ip, recentRequests);
    
    // Clean up old IPs periodically
    this.cleanup();
    
    return { allowed: true };
  }
  
  /**
   * Get client IP from request
   */
  private getClientIp(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    
    if (realIp) {
      return realIp;
    }
    
    // Fallback to a default for local development
    return '127.0.0.1';
  }
  
  /**
   * Clean up old entries to prevent memory leak
   */
  private cleanup(): void {
    const now = Date.now();
    
    // Only cleanup every 100 requests
    if (Math.random() > 0.01) return;
    
    for (const [ip, requests] of this.requests.entries()) {
      const recentRequests = requests.filter(
        timestamp => now - timestamp < this.windowMs
      );
      
      if (recentRequests.length === 0) {
        this.requests.delete(ip);
      } else {
        this.requests.set(ip, recentRequests);
      }
    }
  }
  
  /**
   * Reset rate limits (for testing)
   */
  reset(): void {
    this.requests.clear();
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiter();

/**
 * Enhanced rate limiter for Discogs API
 * Respects Discogs-specific rate limit headers
 */
export class DiscogsRateLimiter {
  private lastRequestTime = 0;
  private remainingRequests = 60;
  private resetTime = 0;
  private minDelay = 1000; // Minimum 1 second between requests
  
  /**
   * Wait if necessary before making request
   */
  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    
    // Check if we need to wait for reset
    if (this.remainingRequests === 0 && this.resetTime > now) {
      const waitTime = this.resetTime - now;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.remainingRequests = 60; // Reset to default
    }
    
    // Enforce minimum delay between requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minDelay) {
      await new Promise(resolve => 
        setTimeout(resolve, this.minDelay - timeSinceLastRequest)
      );
    }
    
    this.lastRequestTime = Date.now();
  }
  
  /**
   * Update rate limit info from response headers
   */
  updateFromHeaders(headers: Headers): void {
    const remaining = headers.get('x-discogs-ratelimit-remaining');
    const reset = headers.get('x-discogs-ratelimit-reset');
    
    if (remaining) {
      this.remainingRequests = parseInt(remaining, 10);
    }
    
    if (reset) {
      this.resetTime = parseInt(reset, 10) * 1000; // Convert to milliseconds
    }
  }
}