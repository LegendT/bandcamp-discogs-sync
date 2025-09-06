import { NextRequest, NextResponse } from 'next/server';
import { LightweightBandcampScraper, BandcampCacheManager } from '@/lib/bandcamp/lightweight-scraper';
import { BandcampCollectionStore } from '@/lib/bandcamp/collection-store';
import { z } from 'zod';
import { rateLimiter } from '@/lib/api/rate-limiter';
import { authenticateRequest } from '@/lib/api/auth-middleware';
import logger from '@/lib/utils/logger';

// Input validation schema
const ScrapeRequestSchema = z.object({
  username: z.string().min(1).max(50),
  useCache: z.boolean().default(true),
  limit: z.number().min(1).max(1000).optional(),
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
    
    // Authenticate request (optional for public data)
    const auth = await authenticateRequest(request, { required: false });
    
    // Validate input
    const body = await request.json();
    const validationResult = ScrapeRequestSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validationResult.error.errors },
        { status: 400 }
      );
    }
    
    const { username, useCache, limit } = validationResult.data;
    
    // Check cache first
    if (useCache && typeof window !== 'undefined') {
      const cached = BandcampCacheManager.getCachedCollection(username);
      if (cached) {
        logger.info(`Returning cached collection for ${username}`);
        return NextResponse.json({
          collection: cached,
          cached: true
        });
      }
    }
    
    // Create scraper instance
    const scraper = new LightweightBandcampScraper();
    const store = new BandcampCollectionStore();
    
    // Set up abort controller for timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      // Scrape the public collection
      logger.info(`Scraping collection for user: ${username}`);
      const collectionData = await scraper.scrapePublicCollection(username, {
        limit,
        signal: controller.signal
      });
      
      if (collectionData.items.length === 0) {
        return NextResponse.json(
          { error: 'No items found in collection' },
          { status: 404 }
        );
      }
      
      // Process items for storage
      const processedItems = collectionData.items.map(item => ({
        ...item,
        format: 'unknown' as const,
        formatType: 'unknown' as const,
        includesDigital: false,
        syncedToDiscogs: false,
        ownershipText: null
      }));
      
      // Save to store if authenticated
      if (auth.authenticated && auth.userId) {
        await store.saveCollection(username, {
          username,
          items: processedItems,
          lastUpdated: new Date(),
        });
      }
      
      logger.info(`Successfully scraped ${collectionData.items.length} items for ${username}`);
      
      return NextResponse.json({
        collection: {
          ...collectionData,
          items: processedItems,
          message: 'Use format detection endpoint to identify physical/digital items'
        },
        cached: false
      });
      
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid username format' },
        { status: 400 }
      );
    }
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        logger.error('Scraping timeout');
        return NextResponse.json(
          { error: 'Request timeout. Collection may be too large.' },
          { status: 408 }
        );
      }
      
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: error.message },
          { status: 404 }
        );
      }
    }
    
    logger.error('Error scraping Bandcamp collection:', error);
    return NextResponse.json(
      { error: 'Failed to scrape collection. Please try again.' },
      { status: 500 }
    );
  }
}