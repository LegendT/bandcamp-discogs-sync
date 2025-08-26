import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BandcampCollector } from '@/lib/bandcamp/collector';
import { SimpleBandcampImporter } from '@/lib/bandcamp/simple-importer';
import { logger } from '@/lib/utils/logger';
// Request schema
const importRequestSchema = z.object({
  username: z.string().min(1).max(100),
  formatHint: z.enum(['Digital', 'Vinyl', 'CD', 'Cassette']).optional(),
  limit: z.number().min(1).max(5000).optional()
});

async function handler(req: NextRequest) {
  if (req.method !== 'POST') {
    return NextResponse.json(
      { error: 'Method not allowed' },
      { status: 405 }
    );
  }

  try {
    // Parse and validate request
    const body = await req.json();
    const { username, formatHint, limit } = importRequestSchema.parse(body);
    
    logger.info(`Import request for Bandcamp user: ${username}`);
    
    // Create collector instance
    const collector = new BandcampCollector();
    
    // Test if username exists first
    const userExists = await collector.testUsername(username);
    
    if (!userExists) {
      return NextResponse.json(
        { 
          error: 'User not found',
          message: `No Bandcamp user found with username: ${username}`
        },
        { status: 404 }
      );
    }
    
    // Try to import collection with bandcamp-fetch first
    let items: any[] = [];
    
    try {
      items = await collector.fetchCollection({
        username,
        limit: limit || 1000,
        onProgress: (current, total) => {
          if (current % 10 === 0) {
            logger.info(`Import progress: ${current}/${total}`);
          }
        }
      });
    } catch (bcfetchError) {
      // If bandcamp-fetch fails, try simple importer
      logger.warn('bandcamp-fetch failed, trying simple importer');
      const simpleImporter = new SimpleBandcampImporter();
      items = await simpleImporter.fetchCollection(username, formatHint);
    }
    
    // Apply format hint if provided
    if (formatHint) {
      items.forEach(item => {
        item.format = formatHint;
      });
    }
    
    logger.info(`Successfully imported ${items.length} items for ${username}`);
    
    // Transform to match our BandcampPurchase interface
    const purchases = items.map(item => ({
      artist: item.artist,
      itemTitle: item.album,  // Map album to itemTitle to match expected interface
      itemUrl: item.url,
      format: item.format || 'Digital',  // Default to Digital if not specified
      rawFormat: item.format || 'Digital',
      purchaseDate: new Date().toISOString(),
      // Keep these for backward compatibility
      album: item.album,
      url: item.url,
      imageUrl: item.imageUrl,
      price: 0 // Public pages don't show price
    }));
    
    return NextResponse.json({
      success: true,
      username,
      itemCount: items.length,
      purchases,
      message: `Successfully imported ${items.length} items from ${username}'s collection`
    });
    
  } catch (error) {
    logger.error('Import failed:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }
    
    // Handle specific scraper errors
    if (error instanceof Error) {
      if (error.message.includes('Rate limited')) {
        return NextResponse.json(
          { 
            error: 'Rate limited',
            message: 'Bandcamp is rate limiting requests. Please try again in a few minutes.',
            retryAfter: 60
          },
          { status: 429 }
        );
      } else if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'User not found', message: error.message },
          { status: 404 }
        );
      } else if (error.message.includes('timeout')) {
        return NextResponse.json(
          { error: 'Timeout', message: error.message },
          { status: 408 }
        );
      }
    }
    
    return NextResponse.json(
      { 
        error: 'Import failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}

// Export the POST handler for Next.js App Router
export const POST = handler;