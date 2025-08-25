import { BandcampPurchase } from '../../types/bandcamp';
import { DiscogsRelease } from '../../types/discogs';
import { logger } from '../utils/logger';
import { MatchingOptions, MatchingResponse } from './types';
import { matchAlbum } from './engine';

export interface MatchError {
  type: 'invalid_data' | 'runtime_error' | 'timeout';
  message: string;
  fallback: MatchingResponse | null;
}

export type SafeMatchResult = MatchingResponse | MatchError;

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
  
  return true;
}

/**
 * Validates that Discogs releases have required fields
 */
function validateReleases(releases: any[]): releases is DiscogsRelease[] {
  if (!Array.isArray(releases)) {
    return false;
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
 * Safe wrapper around matchAlbum with comprehensive error handling
 */
export async function matchAlbumSafe(
  purchase: BandcampPurchase,
  releases: DiscogsRelease[],
  options: MatchingOptions = {}
): Promise<SafeMatchResult> {
  try {
    // Validate inputs
    if (!validatePurchase(purchase)) {
      logger.warn('Invalid purchase data', { purchase });
      return {
        type: 'invalid_data',
        message: 'Missing or invalid required fields in purchase data',
        fallback: {
          bestMatch: null,
          alternatives: [],
          searchQuery: {
            artist: (purchase as any)?.artist || '',
            title: (purchase as any)?.itemTitle || '',
            format: (purchase as any)?.format || ''
          },
          status: 'no-match'
        }
      };
    }
    
    if (!validateReleases(releases)) {
      logger.warn('Invalid releases data', { 
        releaseCount: Array.isArray(releases) ? (releases as any[]).length : 'not-array',
        sample: Array.isArray(releases) ? (releases as any[])[0] : null
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
        }
      };
    }
    
    // Limit releases to prevent memory issues
    const maxReleases = 100;
    const limitedReleases = releases.slice(0, maxReleases);
    
    if (releases.length > maxReleases) {
      logger.info(`Limiting releases from ${releases.length} to ${maxReleases}`);
    }
    
    // Set a timeout for the matching operation
    const timeoutMs = 5000; // 5 seconds
    const timeoutPromise = new Promise<MatchError>((_, reject) => {
      setTimeout(() => {
        reject({
          type: 'timeout',
          message: `Matching operation timed out after ${timeoutMs}ms`,
          fallback: null
        });
      }, timeoutMs);
    });
    
    // Race between the actual operation and timeout
    const result = await Promise.race([
      Promise.resolve(matchAlbum(purchase, limitedReleases, options)),
      timeoutPromise
    ]);
    
    return result;
    
  } catch (error: any) {
    logger.error('Match operation failed', {
      error: error.message,
      stack: error.stack,
      purchase: {
        artist: purchase?.artist,
        title: purchase?.itemTitle
      }
    });
    
    // Check if it's already a MatchError
    if (error.type && error.message) {
      return error;
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
      }
    };
  }
}

/**
 * Type guard to check if result is an error
 */
export function isMatchError(result: SafeMatchResult): result is MatchError {
  return 'type' in result && 'message' in result;
}

/**
 * Batch processing with error isolation
 */
export async function matchAlbumBatch(
  purchases: BandcampPurchase[],
  searchFunction: (purchase: BandcampPurchase) => Promise<DiscogsRelease[]>,
  options: MatchingOptions = {}
): Promise<SafeMatchResult[]> {
  const results: SafeMatchResult[] = [];
  
  for (const purchase of purchases) {
    try {
      const releases = await searchFunction(purchase);
      const result = await matchAlbumSafe(purchase, releases, options);
      results.push(result);
    } catch (error: any) {
      logger.error('Batch processing error for purchase', {
        error: error.message,
        artist: purchase.artist,
        title: purchase.itemTitle
      });
      
      results.push({
        type: 'runtime_error',
        message: `Failed to process: ${error.message}`,
        fallback: {
          bestMatch: null,
          alternatives: [],
          searchQuery: {
            artist: purchase.artist,
            title: purchase.itemTitle,
            format: purchase.format
          },
          status: 'no-match'
        }
      });
    }
  }
  
  return results;
}