import { NextRequest, NextResponse } from 'next/server';
import { getDiscogsClient } from '@/lib/discogs/client-singleton';
import { syncSchema } from '@/lib/validation/schemas-final';
import { applyMiddleware } from '@/lib/api/middleware';
import { logger } from '@/lib/utils/logger';
import { syncRateLimit } from '@/lib/api/rate-limit';
import type { MatchResult } from '@/types/matching';

async function handler(request: NextRequest) {
  try {
    // Check rate limit
    const { success, remaining } = await syncRateLimit.check(request);
    if (!success) {
      return NextResponse.json(
        { error: 'Too many sync requests. Please try again later.' },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Remaining': remaining.toString(),
            'Retry-After': '60'
          }
        }
      );
    }

    // Get token from header
    const token = request.headers.get('X-Discogs-Token');
    
    if (!token) {
      return NextResponse.json(
        { 
          error: 'No Discogs token provided',
          message: 'Please enter your Discogs personal access token'
        },
        { status: 401 }
      );
    }

    // Parse and validate request
    const body = await request.json();
    
    const validated = syncSchema.safeParse(body);
    
    if (!validated.success) {
      logger.error('Sync validation failed:', validated.error.flatten());
      return NextResponse.json(
        { error: 'Invalid request data', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const { matches } = validated.data;
    const results = {
      successful: [] as any[],
      failed: [] as { item: string; error: string }[],
      total: matches.length
    };

    // Create client with user-provided token
    const client = getDiscogsClient(token);
    
    // Test connection first
    const testResult = await client.testConnection();
    if (!testResult.success) {
      return NextResponse.json(
        { 
          error: 'Invalid Discogs token',
          message: testResult.error
        },
        { status: 401 }
      );
    }

    // If no matches provided, just return connection info (for token test)
    if (matches.length === 0) {
      return NextResponse.json({
        connected: true,
        username: testResult.username,
        message: 'Token validated successfully'
      });
    }

    // Process each match
    for (const match of matches) {
      try {
        if (!match.discogsMatch) {
          results.failed.push({
            item: match.bandcampItem.itemTitle,
            error: 'No Discogs match found'
          });
          continue;
        }

        // Actually add to collection!
        const result = await client.addToCollection(match.discogsMatch.id);
        
        if (result.success) {
          results.successful.push({
            releaseId: match.discogsMatch.id,
            title: match.discogsMatch.title,
            artist: match.bandcampItem.artist
          });
        } else {
          results.failed.push({
            item: match.bandcampItem.itemTitle,
            error: result.error || 'Failed to add to collection'
          });
        }
        
      } catch (error) {
        logger.error('Failed to sync item:', error);
        results.failed.push({
          item: match.bandcampItem.itemTitle,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      results,
      message: `Synced ${results.successful.length} of ${results.total} items`
    });

  } catch (error) {
    logger.error('Sync endpoint error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const POST = applyMiddleware(handler);