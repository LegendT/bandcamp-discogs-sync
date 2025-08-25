import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/utils/logger';
import { matchAlbumSafe, isMatchError, getMetrics } from '@/lib/matching/safe-engine-v2';
import { discogsClient } from '@/lib/discogs/client-singleton';
import { 
  validateBandcampPurchase, 
  SearchQuerySchema,
  RequestMetadataSchema,
  ValidationError 
} from '@/lib/validation/schemas-v2';
import { RateLimiter } from '@/lib/api/rate-limiter';
import { v4 as uuidv4 } from 'uuid';

// API rate limiter (separate from Discogs rate limiter)
const apiRateLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30, // 30 requests per minute per IP
  message: 'Too many requests, please try again later'
});

// Request schema
const MatchRequestSchema = z.object({
  purchase: z.object({
    artist: z.string(),
    itemTitle: z.string(),
    itemUrl: z.string(),
    purchaseDate: z.string(),
    format: z.string(),
    rawFormat: z.string()
  }),
  options: z.object({
    includeAlternatives: z.boolean().optional(),
    maxAlternatives: z.number().optional(),
    formatStrictness: z.enum(['strict', 'loose', 'any']).optional(),
    minConfidence: z.number().optional(),
    timeout: z.number().optional()
  }).optional(),
  metadata: RequestMetadataSchema.optional()
});

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Request-ID',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('X-Request-ID') || uuidv4();
  const startTime = Date.now();
  
  // Get client IP for rate limiting
  const ip = request.headers.get('x-forwarded-for') || 
             request.headers.get('x-real-ip') || 
             'unknown';
  
  try {
    // Check API rate limit
    const rateLimitResult = await apiRateLimiter.check(ip);
    if (!rateLimitResult.allowed) {
      logger.warn('API rate limit exceeded', { ip, requestId });
      return NextResponse.json({
        success: false,
        error: rateLimitResult.message,
        retryAfter: rateLimitResult.retryAfter
      }, { 
        status: 429,
        headers: {
          ...corsHeaders,
          'Retry-After': String(rateLimitResult.retryAfter),
          'X-RateLimit-Limit': String(rateLimitResult.limit),
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          'X-RateLimit-Reset': new Date(rateLimitResult.reset).toISOString(),
          'X-Request-ID': requestId
        }
      });
    }
    
    // Parse and validate request body
    const body = await request.json();
    const validated = MatchRequestSchema.parse(body);
    
    // Transform and validate purchase data
    const purchase = validateBandcampPurchase({
      ...validated.purchase,
      purchaseDate: new Date(validated.purchase.purchaseDate)
    });
    
    // Build search query
    const searchQuery = SearchQuerySchema.parse({
      artist: purchase.artist,
      title: purchase.itemTitle,
      format: purchase.format !== 'Digital' ? purchase.format : undefined
    });
    
    logger.info('Matching request', {
      artist: searchQuery.artist,
      title: searchQuery.title,
      format: searchQuery.format,
      requestId,
      metadata: validated.metadata
    });
    
    // Search Discogs
    const releases = await discogsClient.searchReleases(searchQuery);
    
    // Perform matching with timeout
    const result = await matchAlbumSafe(
      purchase, 
      releases, 
      {
        ...validated.options,
        timeout: validated.options?.timeout || 5000
      }
    );
    
    // Handle errors
    if (isMatchError(result)) {
      logger.warn('Match error', {
        type: result.type,
        message: result.message,
        requestId: result.requestId,
        duration: Date.now() - startTime
      });
      
      // Different status codes for different error types
      const statusCode = result.type === 'timeout' ? 504 : 
                        result.type === 'circuit_open' ? 503 : 400;
      
      return NextResponse.json({
        success: false,
        error: result.message,
        errorType: result.type,
        fallback: result.fallback,
        requestId: result.requestId
      }, { 
        status: statusCode,
        headers: {
          ...corsHeaders,
          'X-Request-ID': requestId,
          'X-Response-Time': String(Date.now() - startTime)
        }
      });
    }
    
    // Success response
    logger.info('Match successful', {
      requestId,
      status: result.status,
      confidence: result.bestMatch?.confidence,
      duration: Date.now() - startTime
    });
    
    return NextResponse.json({
      success: true,
      result,
      metrics: getMetrics(),
      requestId
    }, {
      headers: {
        ...corsHeaders,
        'X-Request-ID': requestId,
        'X-Response-Time': String(Date.now() - startTime),
        'Cache-Control': 'private, max-age=300' // Cache for 5 minutes
      }
    });
    
  } catch (error) {
    logger.error('Match API error', { 
      error,
      requestId,
      duration: Date.now() - startTime
    });
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
        requestId
      }, { 
        status: 400,
        headers: {
          ...corsHeaders,
          'X-Request-ID': requestId
        }
      });
    }
    
    if (error instanceof ValidationError) {
      return NextResponse.json({
        success: false,
        error: error.message,
        fieldErrors: error.fieldErrors,
        requestId
      }, { 
        status: 400,
        headers: {
          ...corsHeaders,
          'X-Request-ID': requestId
        }
      });
    }
    
    if (error instanceof Error) {
      return NextResponse.json({
        success: false,
        error: error.message,
        requestId
      }, { 
        status: 500,
        headers: {
          ...corsHeaders,
          'X-Request-ID': requestId
        }
      });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Unknown error occurred',
      requestId
    }, { 
      status: 500,
      headers: {
        ...corsHeaders,
        'X-Request-ID': requestId
      }
    });
  }
}

// Health check endpoint
export async function GET() {
  const metrics = getMetrics();
  const healthy = metrics.successRate > 50 && metrics.circuitBreakerState !== 'open';
  
  return NextResponse.json({
    status: healthy ? 'healthy' : 'degraded',
    metrics,
    timestamp: new Date().toISOString()
  }, {
    status: healthy ? 200 : 503,
    headers: {
      ...corsHeaders,
      'Cache-Control': 'no-cache'
    }
  });
}