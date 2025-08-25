# Critical Gaps in Matching Engine Implementation

## 1. Error Handling & Resilience

### Current State: No Error Recovery
The engine will crash on:
- Malformed Discogs data (missing required fields)
- Invalid Unicode sequences
- Circular references in objects
- Stack overflow on extremely long strings

### Required Implementation:
```typescript
export function matchAlbumSafe(
  purchase: BandcampPurchase,
  releases: DiscogsRelease[],
  options: MatchingOptions = {}
): MatchingResponse | MatchError {
  try {
    // Validate inputs
    if (!purchase?.artist || !purchase?.itemTitle) {
      return {
        type: 'invalid_data',
        message: 'Missing required fields',
        fallback: null
      };
    }
    
    // Sanitize strings to prevent DOS
    if (purchase.artist.length > 500 || purchase.itemTitle.length > 500) {
      return {
        type: 'invalid_data',
        message: 'Input too long',
        fallback: null
      };
    }
    
    // Limit release count to prevent memory issues
    const limitedReleases = releases.slice(0, 100);
    
    return matchAlbum(purchase, limitedReleases, options);
  } catch (error) {
    logger.error('Match failed:', error);
    return {
      type: 'runtime_error',
      message: error.message,
      fallback: null
    };
  }
}
```

## 2. Discogs API Rate Limiting

### Current State: No Rate Limit Handling
- Discogs allows 60 requests/minute for authenticated users
- Current implementation could hit limits with 100+ albums

### Required Implementation:
```typescript
import pLimit from 'p-limit';

const discogsLimiter = pLimit(1); // 1 concurrent request
const requestQueue: Array<() => Promise<any>> = [];

export async function searchDiscogsWithRateLimit(
  query: DiscogsSearchQuery
): Promise<DiscogsSearchResult> {
  return discogsLimiter(async () => {
    // Wait if we're approaching rate limit
    await enforceRateLimit();
    
    try {
      return await discogsClient.search(query);
    } catch (error) {
      if (error.status === 429) {
        // Rate limited - wait and retry
        await wait(60000); // Wait 1 minute
        return searchDiscogsWithRateLimit(query);
      }
      throw error;
    }
  });
}
```

## 3. Cache Persistence

### Current State: Memory-Only Cache
- Cache is lost on server restart
- No sharing between workers
- Memory leak potential with unbounded growth

### Required Implementation:
```typescript
import Redis from 'ioredis';

class PersistentMatchCache {
  private memoryCache: Map<string, string>;
  private redis: Redis;
  
  constructor() {
    this.memoryCache = new Map();
    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      keyPrefix: 'match_cache:',
      ttl: 3600 // 1 hour
    });
  }
  
  async get(key: string): Promise<string | null> {
    // Check memory first
    const memResult = this.memoryCache.get(key);
    if (memResult) return memResult;
    
    // Check Redis
    const redisResult = await this.redis.get(key);
    if (redisResult) {
      // Populate memory cache
      this.memoryCache.set(key, redisResult);
    }
    
    return redisResult;
  }
  
  async set(key: string, value: string): Promise<void> {
    this.memoryCache.set(key, value);
    await this.redis.setex(key, 3600, value);
    
    // Prevent memory leak
    if (this.memoryCache.size > 1000) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }
  }
}
```

## 4. Batch Processing Queue

### Current State: Sequential Processing
- No queue system
- No progress tracking
- No failure recovery

### Required Implementation:
```typescript
import Bull from 'bull';

const matchQueue = new Bull('match-queue', {
  redis: process.env.REDIS_URL,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  }
});

matchQueue.process('match-album', async (job) => {
  const { purchase, sessionId } = job.data;
  
  // Update progress
  await job.progress(10);
  
  // Search Discogs
  const releases = await searchDiscogsWithRateLimit({
    artist: purchase.artist,
    title: purchase.itemTitle
  });
  
  await job.progress(50);
  
  // Perform matching
  const result = matchAlbumSafe(purchase, releases);
  
  await job.progress(90);
  
  // Store result
  await storeMatchResult(sessionId, purchase.id, result);
  
  await job.progress(100);
  
  return result;
});

// Monitor queue health
matchQueue.on('failed', (job, err) => {
  logger.error(`Match job ${job.id} failed:`, err);
});

matchQueue.on('stalled', (job) => {
  logger.warn(`Match job ${job.id} stalled`);
});
```

## 5. Input Validation & Sanitization

### Current State: No Validation
- Accepts any input without validation
- No protection against malicious input
- No handling of encoding issues

### Required Implementation:
```typescript
import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';

const BandcampPurchaseSchema = z.object({
  artist: z.string().min(1).max(200),
  itemTitle: z.string().min(1).max(300),
  itemUrl: z.string().url(),
  purchaseDate: z.date(),
  format: z.enum(['Digital', 'Vinyl', 'CD', 'Cassette', 'Other']),
  rawFormat: z.string().max(100)
});

export function validateAndSanitizePurchase(
  input: unknown
): BandcampPurchase | ValidationError {
  try {
    // Validate structure
    const validated = BandcampPurchaseSchema.parse(input);
    
    // Sanitize strings
    return {
      ...validated,
      artist: DOMPurify.sanitize(validated.artist, { ALLOWED_TAGS: [] }),
      itemTitle: DOMPurify.sanitize(validated.itemTitle, { ALLOWED_TAGS: [] }),
      rawFormat: DOMPurify.sanitize(validated.rawFormat, { ALLOWED_TAGS: [] })
    };
  } catch (error) {
    return {
      type: 'validation_error',
      errors: error.errors
    };
  }
}
```

## 6. Real-World Edge Cases

### Currently Unhandled:
1. **Multi-disc releases**: "CD1", "Disc 2", etc.
2. **Catalog numbers in titles**: "[CAT001]", "(WARP001)"
3. **Featuring artists in title**: "Album (feat. Artist)"
4. **Year in title**: "Album (1999)" vs "Album"
5. **Live recordings**: "Album (Live at Venue)"
6. **Region variants**: "Album [Japan Edition]"

### Required Implementation:
```typescript
export function preprocessTitle(title: string): {
  cleanTitle: string;
  metadata: {
    disc?: number;
    catalogNumber?: string;
    featuredArtists?: string[];
    year?: number;
    venue?: string;
    region?: string;
  };
} {
  let cleanTitle = title;
  const metadata: any = {};
  
  // Extract disc number
  const discMatch = title.match(/\b(?:CD|Disc|Disk)\s*(\d+)\b/i);
  if (discMatch) {
    metadata.disc = parseInt(discMatch[1]);
    cleanTitle = cleanTitle.replace(discMatch[0], '').trim();
  }
  
  // Extract catalog number
  const catalogMatch = title.match(/\[([A-Z]{2,5}[-\s]?\d{3,6})\]/);
  if (catalogMatch) {
    metadata.catalogNumber = catalogMatch[1];
    cleanTitle = cleanTitle.replace(catalogMatch[0], '').trim();
  }
  
  // Extract featured artists
  const featMatch = title.match(/\(feat\.\s*([^)]+)\)/i);
  if (featMatch) {
    metadata.featuredArtists = featMatch[1].split(/[,&]/).map(a => a.trim());
    cleanTitle = cleanTitle.replace(featMatch[0], '').trim();
  }
  
  // Extract year
  const yearMatch = title.match(/\((\d{4})\)/);
  if (yearMatch) {
    metadata.year = parseInt(yearMatch[1]);
    cleanTitle = cleanTitle.replace(yearMatch[0], '').trim();
  }
  
  // Extract venue
  const venueMatch = title.match(/\(Live (?:at|from) ([^)]+)\)/i);
  if (venueMatch) {
    metadata.venue = venueMatch[1];
    cleanTitle = cleanTitle.replace(venueMatch[0], '').trim();
  }
  
  // Extract region
  const regionMatch = title.match(/\[(Japan|UK|EU|US|German|French)\s*(?:Edition|Release|Version)?\]/i);
  if (regionMatch) {
    metadata.region = regionMatch[1];
    cleanTitle = cleanTitle.replace(regionMatch[0], '').trim();
  }
  
  return { cleanTitle, metadata };
}
```

## 7. Performance Monitoring

### Current State: Basic Timing Only
- No real performance monitoring
- No alerting on degradation
- No capacity planning data

### Required Implementation:
```typescript
import { metrics } from '@opentelemetry/api-metrics';

const meter = metrics.getMeter('matching-engine', '1.0.0');

const matchLatency = meter.createHistogram('match_latency_ms', {
  description: 'Latency of match operations in milliseconds'
});

const matchCounter = meter.createCounter('match_total', {
  description: 'Total number of match operations'
});

const cacheHitRate = meter.createObservableGauge('cache_hit_rate', {
  description: 'Cache hit rate percentage'
});

export function instrumentedMatch(
  purchase: BandcampPurchase,
  releases: DiscogsRelease[],
  options: MatchingOptions = {}
): MatchingResponse {
  const startTime = performance.now();
  const labels = { format: purchase.format };
  
  try {
    const result = matchAlbum(purchase, releases, options);
    
    matchLatency.record(performance.now() - startTime, labels);
    matchCounter.add(1, { ...labels, status: result.status });
    
    return result;
  } catch (error) {
    matchCounter.add(1, { ...labels, status: 'error' });
    throw error;
  }
}
```

## Summary

These critical gaps must be addressed before the matching engine can be considered production-ready for anything beyond a small MVP. The current implementation is fragile and will not scale reliably beyond a few hundred users.