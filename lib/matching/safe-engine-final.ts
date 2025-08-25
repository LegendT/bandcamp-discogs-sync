import { BandcampPurchase } from '../../types/bandcamp';
import { DiscogsRelease } from '../../types/discogs';
import { logger } from '../utils/logger';
import { MatchingOptions, MatchingResponse } from './types';
import { matchAlbum } from './engine';
import { randomUUID } from 'crypto';

export interface MatchError {
  type: 'invalid_data' | 'runtime_error' | 'timeout' | 'circuit_open';
  message: string;
  fallback: MatchingResponse | null;
  requestId?: string;
}

export type SafeMatchResult = MatchingResponse | MatchError;

// Circuit breaker configuration
interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenRequests: number;
}

// Circuit breaker implementation as a class to avoid global state
export class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private halfOpenAttempts = 0;
  
  constructor(private config: CircuitBreakerConfig) {}
  
  isOpen(): boolean {
    if (this.state === 'open') {
      const now = Date.now();
      if (now - this.lastFailure > this.config.resetTimeout) {
        this.state = 'half-open';
        this.halfOpenAttempts = 0;
        return false;
      }
      return true;
    }
    
    if (this.state === 'half-open') {
      return this.halfOpenAttempts >= this.config.halfOpenRequests;
    }
    
    return false;
  }
  
  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.state = 'closed';
      this.failures = 0;
      this.halfOpenAttempts = 0;
    }
  }
  
  recordFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
    
    if (this.state === 'half-open') {
      this.halfOpenAttempts++;
    }
    
    if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
      logger.warn('Circuit breaker opened', {
        failures: this.failures,
        threshold: this.config.failureThreshold
      });
    }
  }
  
  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailure: this.lastFailure
    };
  }
}

// Metrics collector as a class
export class MetricsCollector {
  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private timeouts = 0;
  private validationErrors = 0;
  private readonly startTime = Date.now();
  
  recordRequest() { this.totalRequests++; }
  recordSuccess() { this.successfulRequests++; }
  recordFailure() { this.failedRequests++; }
  recordTimeout() { this.timeouts++; }
  recordValidationError() { this.validationErrors++; }
  
  getMetrics() {
    const uptime = Date.now() - this.startTime;
    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      timeouts: this.timeouts,
      validationErrors: this.validationErrors,
      successRate: this.totalRequests > 0 
        ? (this.successfulRequests / this.totalRequests) * 100 
        : 0,
      uptimeMs: uptime
    };
  }
  
  reset() {
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.timeouts = 0;
    this.validationErrors = 0;
  }
}

// Create instances (can be injected for testing)
const defaultCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 60000,
  halfOpenRequests: 1
});

const defaultMetrics = new MetricsCollector();

/**
 * Validates that a Bandcamp purchase has required fields
 */
function validatePurchase(purchase: any): purchase is BandcampPurchase {
  if (!purchase || typeof purchase !== 'object') {
    return false;
  }
  
  const requiredFields = ['artist', 'itemTitle', 'format'];
  for (const field of requiredFields) {
    if (!purchase[field] || typeof purchase[field] !== 'string') {
      return false;
    }
  }
  
  // Check string lengths to prevent DoS
  const maxFieldLength = 500;
  if (purchase.artist.length > maxFieldLength || 
      purchase.itemTitle.length > maxFieldLength) {
    return false;
  }
  
  // Validate format is one of expected values
  const validFormats = ['Digital', 'Vinyl', 'CD', 'Cassette', 'Other'];
  if (!validFormats.includes(purchase.format)) {
    return false;
  }
  
  // Validate date if present
  if (purchase.purchaseDate && !(purchase.purchaseDate instanceof Date)) {
    return false;
  }
  
  return true;
}

/**
 * Validates that Discogs releases have required fields
 */
function validateReleases(releases: any[]): releases is DiscogsRelease[] {
  if (!Array.isArray(releases)) {
    return false;
  }
  
  // Empty array is valid
  if (releases.length === 0) {
    return true;
  }
  
  // Limit array size to prevent DoS
  if (releases.length > 1000) {
    return false;
  }
  
  return releases.every(release => {
    if (!release || typeof release !== 'object') return false;
    if (typeof release.id !== 'number') return false;
    if (typeof release.title !== 'string' || release.title.length > 500) return false;
    if (typeof release.artists_sort !== 'string' || release.artists_sort.length > 500) return false;
    return true;
  });
}

/**
 * Safe wrapper around matchAlbum with comprehensive error handling
 */
export async function matchAlbumSafe(
  purchase: BandcampPurchase,
  releases: DiscogsRelease[],
  options: MatchingOptions & { 
    circuitBreaker?: CircuitBreaker;
    metrics?: MetricsCollector;
    timeout?: number;
  } = {}
): Promise<SafeMatchResult> {
  const circuitBreaker = options.circuitBreaker || defaultCircuitBreaker;
  const metrics = options.metrics || defaultMetrics;
  const requestId = randomUUID();
  const startTime = Date.now();
  
  metrics.recordRequest();
  
  try {
    // Check circuit breaker
    if (circuitBreaker.isOpen()) {
      metrics.recordFailure();
      return {
        type: 'circuit_open',
        message: 'Service temporarily unavailable due to high error rate',
        fallback: null,
        requestId
      };
    }
    
    // Validate inputs
    if (!validatePurchase(purchase)) {
      metrics.recordValidationError();
      logger.warn('Invalid purchase data', { 
        purchase: purchase ? {
          artist: (purchase as any).artist?.substring(0, 50),
          title: (purchase as any).itemTitle?.substring(0, 50)
        } : null, 
        requestId 
      });
      return {
        type: 'invalid_data',
        message: 'Missing or invalid required fields in purchase data',
        fallback: createFallbackResponse(purchase),
        requestId
      };
    }
    
    if (!validateReleases(releases)) {
      metrics.recordValidationError();
      logger.warn('Invalid releases data', { 
        releaseCount: Array.isArray(releases) ? (releases as any[]).length : 'not-array',
        requestId
      });
      return {
        type: 'invalid_data',
        message: 'Invalid Discogs release data',
        fallback: createFallbackResponse(purchase),
        requestId
      };
    }
    
    // Limit releases to prevent memory issues
    const maxReleases = 100;
    const limitedReleases = releases.slice(0, maxReleases);
    
    if (releases.length > maxReleases) {
      logger.info('Limited releases for processing', { 
        original: releases.length, 
        limited: maxReleases, 
        requestId 
      });
    }
    
    // Create abort controller for timeout
    const abortController = new AbortController();
    const timeoutMs = options.timeout || 5000;
    
    const timeoutId = setTimeout(() => {
      abortController.abort();
      metrics.recordTimeout();
    }, timeoutMs);
    
    try {
      // Execute matching with timeout
      const result = await Promise.race([
        matchAlbum(purchase, limitedReleases, options),
        new Promise<never>((_, reject) => {
          abortController.signal.addEventListener('abort', () => {
            reject(new Error(`Operation timed out after ${timeoutMs}ms`));
          });
        })
      ]);
      
      clearTimeout(timeoutId);
      
      // Record success
      circuitBreaker.recordSuccess();
      metrics.recordSuccess();
      
      // Log slow operations
      const duration = Date.now() - startTime;
      if (duration > 1000) {
        logger.warn('Slow matching operation', { duration, requestId });
      }
      
      return result;
      
    } catch (timeoutError) {
      clearTimeout(timeoutId);
      throw timeoutError;
    }
    
  } catch (error: any) {
    metrics.recordFailure();
    circuitBreaker.recordFailure();
    
    const duration = Date.now() - startTime;
    logger.error('Match operation failed', {
      error: {
        message: error.message,
        name: error.name,
        code: error.code
      },
      purchase: {
        artist: purchase?.artist?.substring(0, 50),
        title: purchase?.itemTitle?.substring(0, 50)
      },
      requestId,
      duration
    });
    
    // Check if it's a timeout
    if (error.message?.includes('timed out')) {
      return {
        type: 'timeout',
        message: error.message,
        fallback: createFallbackResponse(purchase),
        requestId
      };
    }
    
    // Return a runtime error
    return {
      type: 'runtime_error',
      message: error.message || 'Unknown error during matching',
      fallback: createFallbackResponse(purchase),
      requestId
    };
  }
}

/**
 * Create a fallback response
 */
function createFallbackResponse(purchase?: BandcampPurchase): MatchingResponse {
  return {
    bestMatch: null,
    alternatives: [],
    searchQuery: {
      artist: purchase?.artist || '',
      title: purchase?.itemTitle || '',
      format: purchase?.format || ''
    },
    status: 'no-match'
  };
}

/**
 * Type guard to check if result is an error
 */
export function isMatchError(result: SafeMatchResult): result is MatchError {
  return 'type' in result && 'message' in result;
}

/**
 * Batch processing with error isolation and concurrency control
 */
export async function matchAlbumBatch(
  purchases: BandcampPurchase[],
  searchFunction: (purchase: BandcampPurchase) => Promise<DiscogsRelease[]>,
  options: MatchingOptions & { 
    concurrency?: number;
    circuitBreaker?: CircuitBreaker;
    metrics?: MetricsCollector;
  } = {}
): Promise<SafeMatchResult[]> {
  const concurrency = Math.max(1, Math.min(options.concurrency || 3, 10)); // Limit 1-10
  const results: SafeMatchResult[] = [];
  
  // Validate batch size
  if (purchases.length > 1000) {
    throw new Error('Batch size exceeds maximum of 1000 items');
  }
  
  // Process in chunks to control concurrency
  for (let i = 0; i < purchases.length; i += concurrency) {
    const chunk = purchases.slice(i, i + concurrency);
    const chunkPromises = chunk.map(async (purchase) => {
      try {
        const releases = await searchFunction(purchase);
        return await matchAlbumSafe(purchase, releases, options);
      } catch (error: any) {
        logger.error('Batch processing error', {
          error: error.message,
          artist: purchase.artist?.substring(0, 50),
          title: purchase.itemTitle?.substring(0, 50)
        });
        
        return {
          type: 'runtime_error' as const,
          message: `Failed to process: ${error.message}`,
          fallback: createFallbackResponse(purchase),
          requestId: randomUUID()
        };
      }
    });
    
    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
    
    // Add small delay between chunks to prevent overwhelming the system
    if (i + concurrency < purchases.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}

// Export instances for external access
export function getDefaultMetrics() {
  return defaultMetrics.getMetrics();
}

export function getCircuitBreakerState() {
  return defaultCircuitBreaker.getState();
}

export function resetMetrics() {
  defaultMetrics.reset();
}