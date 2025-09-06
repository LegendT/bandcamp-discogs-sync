import { NextRequest, NextResponse } from 'next/server';
import { getFormatDetectorService } from '@/lib/bandcamp/format-detector-service';
import { z } from 'zod';
import { rateLimiter } from '@/lib/api/rate-limiter';
import { authenticateRequest } from '@/lib/api/auth-middleware';
import logger from '@/lib/utils/logger';

// Input validation schema
const DetectFormatsSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    title: z.string(),
    albumUrl: z.string().url(),
    bandName: z.string().optional(),
    bandId: z.string().optional(),
    artworkUrl: z.string().optional(),
  })).min(1).max(100),
  cookies: z.string().optional(),
  concurrency: z.number().min(1).max(5).default(3),
});

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResult = await rateLimiter.check(request);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter) } }
      );
    }
    
    // Authenticate request (optional)
    const auth = await authenticateRequest(request, { required: false });
    
    // Validate input
    const body = await request.json();
    const validationResult = DetectFormatsSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validationResult.error.errors },
        { status: 400 }
      );
    }
    
    const { items, cookies, concurrency } = validationResult.data;
    
    // Get format detector service
    const detector = getFormatDetectorService();
    
    // Set up SSE for progress updates
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    
    // Start format detection in background
    (async () => {
      try {
        await detector.initialize(cookies);
        
        const results = await detector.detectFormatsParallel(items, {
          concurrency,
          cookies,
          onProgress: async (progress) => {
            const data = JSON.stringify({
              type: 'progress',
              ...progress
            });
            
            await writer.write(
              encoder.encode(`data: ${data}\n\n`)
            );
          }
        });
        
        // Send final results
        const data = JSON.stringify({
          type: 'complete',
          results
        });
        
        await writer.write(
          encoder.encode(`data: ${data}\n\n`)
        );
        
        await writer.close();
      } catch (error) {
        logger.error('Format detection error:', error);
        
        const data = JSON.stringify({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        await writer.write(
          encoder.encode(`data: ${data}\n\n`)
        );
        
        await writer.close();
      }
    })();
    
    // Return SSE response
    return new NextResponse(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
    
  } catch (error) {
    logger.error('Error in format detection:', error);
    return NextResponse.json(
      { error: 'Failed to start format detection' },
      { status: 500 }
    );
  }
}