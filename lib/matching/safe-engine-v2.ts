import { BandcampPurchase } from '../../types/bandcamp';
import { DiscogsRelease } from '../../types/discogs';
import { logger } from '../utils/logger';
import { MatchingOptions, MatchingResponse } from './types';
import { matchAlbum } from './engine';
import { v4 as uuidv4 } from 'uuid';

export interface MatchError {
  type: 'invalid_data' | 'runtime_error' | 'timeout' | 'circuit_open';
  message: string;
  fallback: MatchingResponse | null;
  requestId?: string;
}

export type SafeMatchResult = MatchingResponse | MatchError;

// Circuit breaker state
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  lastFailure: 0,
  state: 'closed'
};

const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_TIMEOUT = 60000; // 1 minute
const CIRCUIT_HALF_OPEN_REQUESTS = 1;

// Metrics collection
const metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  timeouts: 0,
  validationErrors: 0
};

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
  
  return releases.every(release => {
    if (!release || typeof release !== 'object') return false;
    if (!release.id || typeof release.id !== 'number') return false;
    if (!release.title || typeof release.title !== 'string') return false;
    if (!release.artists_sort || typeof release.artists_sort !== 'string') return false;
    return true;
  });
}

/**
 * Check and update circuit breaker state
 */
function checkCircuitBreaker(): boolean {
  const now = Date.now();
  
  if (circuitBreaker.state === 'open') {
    // Check if enough time has passed to try again
    if (now - circuitBreaker.lastFailure > CIRCUIT_TIMEOUT) {
      circuitBreaker.state = 'half-open';
      circuitBreaker.failures = 0;
    } else {
      return false; // Circuit is still open
    }
  }
  
  return true; // Circuit is closed or half-open
}

/**
 * Record circuit breaker success
 */
function recordSuccess() {
  if (circuitBreaker.state === 'half-open') {
    circuitBreaker.state = 'closed';
    circuitBreaker.failures = 0;
  }
}

/**
 * Record circuit breaker failure
 */
function recordFailure() {
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();
  
  if (circuitBreaker.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    circuitBreaker.state = 'open';
    logger.warn('Circuit breaker opened due to repeated failures');
  }
}

/**
 * Safe wrapper around matchAlbum with comprehensive error handling
 */
export async function matchAlbumSafe(
  purchase: BandcampPurchase,
  releases: DiscogsRelease[],
  options: MatchingOptions = {}
): Promise<SafeMatchResult> {
  const requestId = uuidv4();
  const startTime = Date.now();
  
  metrics.totalRequests++;
  
  try {
    // Check circuit breaker
    if (!checkCircuitBreaker()) {
      metrics.failedRequests++;
      return {
        type: 'circuit_open',
        message: 'Service temporarily unavailable due to high error rate',
        fallback: null,
        requestId
      };
    }
    
    // Validate inputs
    if (!validatePurchase(purchase)) {
      metrics.validationErrors++;
      logger.warn('Invalid purchase data', { purchase, requestId });
      return {
        type: 'invalid_data',
        message: 'Missing or invalid required fields in purchase data',
        fallback: {
          bestMatch: null,
          alternatives: [],
          searchQuery: {
            artist: purchase?.artist || '',
            title: purchase?.itemTitle || '',
            format: purchase?.format || ''
          },
          status: 'no-match'
        },
        requestId
      };
    }
    
    if (!validateReleases(releases)) {
      metrics.validationErrors++;
      logger.warn('Invalid releases data', { 
        releaseCount: releases?.length,
        sample: releases?.[0],
        requestId
      });
      return {
        type: 'invalid_data',
        message: 'Invalid Discogs release data',
        fallback: {
          bestMatch: null,
          alternatives: [],
          searchQuery: {
            artist: purchase.artist,
            title: purchase.itemTitle,
            format: purchase.format
          },
          status: 'no-match'
        },
        requestId
      };
    }
    
    // Limit releases to prevent memory issues
    const maxReleases = 100;
    const limitedReleases = releases.slice(0, maxReleases);
    
    if (releases.length > maxReleases) {
      logger.info(`Limiting releases from ${releases.length} to ${maxReleases}`, { requestId });
    }
    
    // Set a timeout for the matching operation
    const timeoutMs = options.timeout || 5000;
    let timeoutId: NodeJS.Timeout;
    
    const timeoutPromise = new Promise<MatchError>((_, reject) => {
      timeoutId = setTimeout(() => {
        metrics.timeouts++;
        reject({
          type: 'timeout',
          message: `Matching operation timed out after ${timeoutMs}ms`,
          fallback: null,
          requestId
        });
      }, timeoutMs);
    });
    
    // Race between the actual operation and timeout
    const result = await Promise.race([
      matchAlbum(purchase, limitedReleases, options).then(res => {
        clearTimeout(timeoutId); // Clear timeout on success
        return res;
      }),
      timeoutPromise
    ]);
    
    // Record success
    recordSuccess();
    metrics.successfulRequests++;
    
    // Log performance metrics
    const duration = Date.now() - startTime;
    if (duration > 1000) {
      logger.warn('Slow matching operation', { duration, requestId });
    }
    
    return result;
    
  } catch (error: any) {
    metrics.failedRequests++;
    recordFailure();
    
    logger.error('Match operation failed', {
      error: error.message,
      stack: error.stack,
      purchase: {
        artist: purchase?.artist,
        title: purchase?.itemTitle
      },
      requestId,
      duration: Date.now() - startTime
    });
    
    // Check if it's already a MatchError
    if (error.type && error.message) {
      return { ...error, requestId };
    }
    
    // Return a runtime error
    return {
      type: 'runtime_error',
      message: error.message || 'Unknown error during matching',
      fallback: {
        bestMatch: null,
        alternatives: [],
        searchQuery: {
          artist: purchase?.artist || '',
          title: purchase?.itemTitle || '',
          format: purchase?.format || ''
        },
        status: 'no-match'
      },
      requestId
    };
  }
}

/**
 * Get current metrics
 */
export function getMetrics() {
  return {
    ...metrics,
    successRate: metrics.totalRequests > 0 
      ? (metrics.successfulRequests / metrics.totalRequests) * 100 
      : 0,
    circuitBreakerState: circuitBreaker.state
  };
}

/**
 * Reset metrics (for testing)
 */
export function resetMetrics() {
  metrics.totalRequests = 0;
  metrics.successfulRequests = 0;
  metrics.failedRequests = 0;
  metrics.timeouts = 0;
  metrics.validationErrors = 0;
  
  circuitBreaker.failures = 0;
  circuitBreaker.state = 'closed';
  circuitBreaker.lastFailure = 0;
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
  options: MatchingOptions & { concurrency?: number } = {}
): Promise<SafeMatchResult[]> {
  const results: SafeMatchResult[] = [];
  const concurrency = options.concurrency || 3; // Limit concurrent operations
  
  // Process in chunks to avoid overwhelming the system
  for (let i = 0; i < purchases.length; i += concurrency) {
    const chunk = purchases.slice(i, i + concurrency);
    const chunkPromises = chunk.map(async (purchase) => {
      try {
        const releases = await searchFunction(purchase);
        return await matchAlbumSafe(purchase, releases, options);
      } catch (error: any) {
        logger.error('Batch processing error for purchase', {
          error: error.message,
          artist: purchase.artist,
          title: purchase.itemTitle
        });
        
        return {
          type: 'runtime_error' as const,
          message: `Failed to process: ${error.message}`,
          fallback: {
            bestMatch: null,
            alternatives: [],
            searchQuery: {
              artist: purchase.artist,
              title: purchase.itemTitle,
              format: purchase.format
            },
            status: 'no-match' as const
          }
        };
      }
    });
    
    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
  }
  
  return results;
}