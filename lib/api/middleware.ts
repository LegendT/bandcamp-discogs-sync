import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { RateLimiter } from './rate-limiter';
import { randomUUID } from 'crypto';

// Security headers
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
};

// CORS configuration
interface CorsOptions {
  origin: string | string[] | ((origin: string) => boolean);
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
  maxAge?: number;
}

const defaultCorsOptions: CorsOptions = {
  origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  methods: ['GET', 'POST', 'OPTIONS'],
  headers: ['Content-Type', 'Authorization', 'X-Request-ID'],
  credentials: true,
  maxAge: 86400
};

/**
 * Get CORS headers based on request origin
 */
export function getCorsHeaders(request: NextRequest, options: CorsOptions = defaultCorsOptions) {
  const origin = request.headers.get('origin') || '';
  let allowOrigin = '';
  
  if (typeof options.origin === 'string') {
    allowOrigin = options.origin;
  } else if (Array.isArray(options.origin)) {
    if (options.origin.includes(origin)) {
      allowOrigin = origin;
    }
  } else if (typeof options.origin === 'function') {
    if (options.origin(origin)) {
      allowOrigin = origin;
    }
  }
  
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': allowOrigin || '*',
    'Access-Control-Allow-Methods': options.methods?.join(', ') || 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': options.headers?.join(', ') || 'Content-Type',
    'Access-Control-Max-Age': String(options.maxAge || 86400),
    'Vary': 'Origin'
  };
  
  if (options.credentials) {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  
  return headers;
}

/**
 * Extract client IP from request headers
 * Note: This can be spoofed, so don't rely on it for security
 */
export function getClientIp(request: NextRequest): string {
  // Vercel and many proxies use these headers
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // Take the first IP in the chain
    return forwardedFor.split(',')[0].trim();
  }
  
  // Cloudflare
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp) {
    return cfConnectingIp;
  }
  
  // Fallback headers
  return request.headers.get('x-real-ip') || 
         request.headers.get('x-client-ip') ||
         'unknown';
}

/**
 * Rate limiting middleware
 */
export async function withRateLimit(
  request: NextRequest,
  handler: (request: NextRequest) => Promise<NextResponse>,
  options: {
    windowMs?: number;
    maxRequests?: number;
    keyGenerator?: (request: NextRequest) => string;
  } = {}
): Promise<NextResponse> {
  const rateLimiter = new RateLimiter({
    windowMs: options.windowMs || 60000, // 1 minute
    maxRequests: options.maxRequests || 60 // 60 requests per minute
  });
  
  // Generate rate limit key
  const key = options.keyGenerator ? 
    options.keyGenerator(request) : 
    getClientIp(request);
  
  const rateLimitResult = await rateLimiter.check(key);
  
  if (!rateLimitResult.allowed) {
    logger.warn('Rate limit exceeded', {
      key,
      limit: rateLimitResult.limit,
      window: options.windowMs
    });
    
    return NextResponse.json({
      error: 'Too many requests',
      retryAfter: rateLimitResult.retryAfter
    }, {
      status: 429,
      headers: {
        'Retry-After': String(rateLimitResult.retryAfter),
        'X-RateLimit-Limit': String(rateLimitResult.limit),
        'X-RateLimit-Remaining': String(rateLimitResult.remaining),
        'X-RateLimit-Reset': new Date(rateLimitResult.reset).toISOString()
      }
    });
  }
  
  // Add rate limit headers to response
  const response = await handler(request);
  response.headers.set('X-RateLimit-Limit', String(rateLimitResult.limit));
  response.headers.set('X-RateLimit-Remaining', String(rateLimitResult.remaining));
  response.headers.set('X-RateLimit-Reset', new Date(rateLimitResult.reset).toISOString());
  
  return response;
}

/**
 * Request ID middleware
 */
export function withRequestId(
  request: NextRequest,
  handler: (request: NextRequest, requestId: string) => Promise<NextResponse>
): Promise<NextResponse> {
  const requestId = request.headers.get('X-Request-ID') || randomUUID();
  return handler(request, requestId);
}

/**
 * Logging middleware
 */
export async function withLogging(
  request: NextRequest,
  handler: (request: NextRequest) => Promise<NextResponse>,
  options: {
    logBody?: boolean;
    maxBodySize?: number;
  } = {}
): Promise<NextResponse> {
  const startTime = Date.now();
  const requestId = request.headers.get('X-Request-ID') || randomUUID();
  
  // Log request
  const logData: any = {
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers.entries()),
    ip: getClientIp(request),
    requestId
  };
  
  if (options.logBody && request.body) {
    try {
      const body = await request.text();
      if (body.length <= (options.maxBodySize || 1000)) {
        logData.body = body;
      } else {
        logData.bodySize = body.length;
        logData.bodyTruncated = true;
      }
      // Re-create request with body
      request = new NextRequest(request.url, {
        method: request.method,
        headers: request.headers,
        body
      });
    } catch (error) {
      logData.bodyError = 'Failed to read body';
    }
  }
  
  logger.info('API request', logData);
  
  try {
    const response = await handler(request);
    const duration = Date.now() - startTime;
    
    // Log response
    logger.info('API response', {
      requestId,
      status: response.status,
      duration,
      headers: Object.fromEntries(response.headers.entries())
    });
    
    // Add timing header
    response.headers.set('X-Response-Time', `${duration}ms`);
    response.headers.set('X-Request-ID', requestId);
    
    return response;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    logger.error('API error', {
      requestId,
      error: error.message,
      stack: error.stack,
      duration
    });
    
    throw error;
  }
}

/**
 * Apply security headers
 */
export function withSecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

/**
 * Compose multiple middleware functions
 */
export function compose(...middlewares: Array<(request: NextRequest) => Promise<NextResponse>>) {
  return async (request: NextRequest): Promise<NextResponse> => {
    let result = request;
    
    for (const middleware of middlewares) {
      result = await middleware(result);
      // If middleware returns a response, stop processing
      if (result instanceof NextResponse) {
        return result;
      }
    }
    
    return result as any;
  };
}