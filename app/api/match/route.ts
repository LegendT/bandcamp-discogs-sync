import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/utils/logger';
import { matchAlbumSafe, isMatchError } from '@/lib/matching';
import { getDiscogsClient } from '@/lib/discogs/client-singleton';
import { validateBandcampPurchase, SearchQuerySchema } from '@/lib/validation/schemas';
import type { DiscogsSearchQuery } from '@/types/matching';

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
    minConfidence: z.number().optional()
  }).optional()
});

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validated = MatchRequestSchema.parse(body);
    
    // Transform and validate purchase data
    const purchaseData = {
      ...validated.purchase,
      purchaseDate: new Date(validated.purchase.purchaseDate),
      artist: validated.purchase.artist || 'Unknown Artist',
      itemTitle: validated.purchase.itemTitle || 'Unknown Title',
      itemUrl: validated.purchase.itemUrl || '',
      rawFormat: validated.purchase.rawFormat || validated.purchase.format || ''
    };
    const purchase = validateBandcampPurchase(purchaseData);
    
    // Search Discogs
    const searchQueryValidated = SearchQuerySchema.parse({
      artist: purchase.artist,
      title: purchase.itemTitle,
      format: purchase.format !== 'Digital' ? purchase.format : undefined
    });
    
    // Ensure required fields for type safety
    const searchQuery: DiscogsSearchQuery = {
      artist: searchQueryValidated.artist || 'Unknown',
      title: searchQueryValidated.title || 'Unknown',
      format: searchQueryValidated.format
    };
    
    logger.info('Matching request', {
      artist: searchQuery.artist,
      title: searchQuery.title,
      format: searchQuery.format
    });
    
    const discogsClient = getDiscogsClient();
    const releases = await discogsClient.searchReleases(searchQuery);
    
    // Perform matching
    const result = await matchAlbumSafe(purchase, releases, validated.options);
    
    // Handle errors
    if (isMatchError(result)) {
      logger.warn('Match error', {
        type: result.type,
        message: result.message
      });
      
      return NextResponse.json({
        success: false,
        error: result.message,
        fallback: result.fallback
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: true,
      result
    });
    
  } catch (error) {
    logger.error('Match API error', { error });
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.issues
      }, { status: 400 });
    }
    
    if (error instanceof Error) {
      return NextResponse.json({
        success: false,
        error: error.message
      }, { status: 500 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Unknown error occurred'
    }, { status: 500 });
  }
}