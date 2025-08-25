import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { 
  matchAlbumSafe, 
  isMatchError, 
  getDefaultMetrics,
  getCircuitBreakerState 
} from '@/lib/matching/safe-engine-final';
import { discogsClient } from '@/lib/discogs/client-singleton';
import { 
  validateBandcampPurchase,
  validateWithDetails,
  SearchQuerySchema,
  MatchingOptionsSchema,
  ApiRequestMetadataSchema,
  ValidationError 
} from '@/lib/validation/schemas-final';
import {
  withRateLimit,
  withRequestId,
  withLogging,
  withSecurityHeaders,
  getCorsHeaders,
  getClientIp
} from '@/lib/api/middleware';
import { z } from 'zod';

// Request body schema
const MatchRequestSchema = z.object({
  purchase: z.object({
    artist: z.string().min(1).max(300),
    itemTitle: z.string().min(1).max(500),
    itemUrl: z.string().min(1).max(2000),
    purchaseDate: z.string().min(1),
    format: z.string().min(1).max(100),
    rawFormat: z.string().min(1).max(100)
  }),
  options: MatchingOptionsSchema.optional(),
  metadata: ApiRequestMetadataSchema.optional()
}).strict(); // Don't allow extra fields

// Request size limit (1MB)
const MAX_REQUEST_SIZE = 1024 * 1024;

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request)
  });
}

/**
 * POST handler for matching requests
 */
export async function POST(request: NextRequest) {
  // Apply rate limiting by IP
  return withRateLimit(request, async (request) => {
    // Add request ID and logging
    return withRequestId(request, async (request, requestId) => {
      const startTime = Date.now();
      
      try {
        // Check request size
        const contentLength = request.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > MAX_REQUEST_SIZE) {
          return createErrorResponse('Request too large', 413, requestId);
        }
        
        // Parse and validate request
        let body: any;
        try {
          body = await request.json();
        } catch (error) {
          return createErrorResponse('Invalid JSON', 400, requestId);
        }
        
        // Validate request structure
        const validatedRequest = validateWithDetails(
          MatchRequestSchema,
          body,
          'Invalid request format'
        );
        
        // Transform and validate purchase data
        const purchase = validateBandcampPurchase({
          ...validatedRequest.purchase,
          purchaseDate: new Date(validatedRequest.purchase.purchaseDate)
        });
        
        // Validate search query
        const searchQuery = validateWithDetails(SearchQuerySchema, {
          artist: purchase.artist,
          title: purchase.itemTitle,
          format: purchase.format !== 'Digital' ? purchase.format : undefined
        });
        
        // Log the matching request
        logger.info('Match request received', {
          requestId,
          artist: searchQuery.artist?.substring(0, 50),
          title: searchQuery.title?.substring(0, 50),
          format: searchQuery.format,
          ip: getClientIp(request),
          metadata: validatedRequest.metadata
        });
        
        // Search Discogs with error handling
        let releases;
        try {
          releases = await discogsClient.searchReleases(searchQuery);
        } catch (error: any) {
          logger.error('Discogs search failed', {
            requestId,
            error: error.message
          });
          
          // Return a more specific error
          if (error.message?.includes('Authentication')) {
            return createErrorResponse('Discogs authentication failed', 503, requestId);
          }
          if (error.message?.includes('Rate limit')) {
            return createErrorResponse('Discogs rate limit exceeded', 503, requestId);
          }
          
          return createErrorResponse('Failed to search Discogs', 503, requestId);
        }
        
        // Perform matching
        const matchResult = await matchAlbumSafe(
          purchase,
          releases,
          validatedRequest.options || {}
        );
        
        // Handle match errors
        if (isMatchError(matchResult)) {
          logger.warn('Match error occurred', {
            requestId,
            errorType: matchResult.type,
            message: matchResult.message
          });
          
          const statusCode = 
            matchResult.type === 'timeout' ? 504 :
            matchResult.type === 'circuit_open' ? 503 :
            matchResult.type === 'invalid_data' ? 400 : 500;
          
          return createErrorResponse(
            matchResult.message,
            statusCode,
            requestId,
            {
              errorType: matchResult.type,
              fallback: matchResult.fallback
            }
          );
        }
        
        // Success!
        const duration = Date.now() - startTime;
        logger.info('Match completed successfully', {
          requestId,
          duration,
          status: matchResult.status,
          confidence: matchResult.bestMatch?.confidence,
          alternatives: matchResult.alternatives.length
        });
        
        // Create success response
        const response = NextResponse.json({
          success: true,
          data: matchResult,
          metadata: {
            requestId,
            duration,
            timestamp: new Date().toISOString()
          }
        }, {
          status: 200,
          headers: {
            ...getCorsHeaders(request),
            'Cache-Control': 'private, max-age=300', // Cache for 5 minutes
            'X-Request-ID': requestId,
            'X-Response-Time': `${duration}ms`
          }
        });
        
        return withSecurityHeaders(response);
        
      } catch (error: any) {
        const duration = Date.now() - startTime;
        
        // Log the error
        logger.error('Unexpected error in match endpoint', {
          requestId,
          duration,
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack
          }
        });
        
        // Handle validation errors specially
        if (error instanceof ValidationError) {
          return createErrorResponse(
            error.message,
            400,
            requestId,
            { fieldErrors: error.fieldErrors }
          );
        }
        
        if (error instanceof z.ZodError) {
          return createErrorResponse(
            'Validation failed',
            400,
            requestId,
            { 
              fieldErrors: error.errors.map(e => ({
                field: e.path.join('.'),
                message: e.message
              }))
            }
          );
        }
        
        // Generic error response
        return createErrorResponse(
          'Internal server error',
          500,
          requestId
        );
      }
    });
  }, {
    windowMs: 60000, // 1 minute
    maxRequests: 30, // 30 requests per minute per IP
    keyGenerator: (req) => getClientIp(req)
  });
}

/**
 * GET handler for health check
 */
export async function GET(request: NextRequest) {
  const metrics = getDefaultMetrics();
  const circuitBreaker = getCircuitBreakerState();
  
  // Determine health status
  const isHealthy = 
    metrics.successRate > 50 && 
    circuitBreaker.state !== 'open' &&
    metrics.totalRequests > 0;
  
  const status = isHealthy ? 'healthy' : 
    circuitBreaker.state === 'open' ? 'degraded' :
    metrics.totalRequests === 0 ? 'warming' : 'unhealthy';
  
  const response = NextResponse.json({
    status,
    metrics,
    circuitBreaker,
    timestamp: new Date().toISOString(),
    uptime: metrics.uptimeMs
  }, {
    status: isHealthy ? 200 : 503,
    headers: {
      ...getCorsHeaders(request),
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
  
  return withSecurityHeaders(response);
}

/**
 * Create a standardized error response
 */
function createErrorResponse(
  message: string,
  status: number,
  requestId: string,
  details?: any
): NextResponse {
  const response = NextResponse.json({
    success: false,
    error: {
      message,
      requestId,
      timestamp: new Date().toISOString(),
      ...details
    }
  }, {
    status,
    headers: {
      'X-Request-ID': requestId,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
  
  return withSecurityHeaders(response);
}