# Refined Implementation Plan for BC→DC Sync Matching Engine

## Current Reality Check

### What We Have
- ✅ Basic string matching that works for happy path
- ✅ Performance optimizations (caching, better algorithms)
- ✅ Some edge case handling (editions, Roman numerals)
- ✅ Good test coverage for core functionality

### What We're Missing (Critical for MVP)
- ❌ Error handling and recovery
- ❌ API rate limit management
- ❌ Input validation
- ❌ Batch processing
- ❌ Production monitoring

## Revised MVP Requirements

### Phase 0: Critical Fixes (Before Launch)

#### 1. Error Handling (2 hours)
```typescript
// Wrap all public functions with error handling
export function matchAlbumSafe(
  purchase: BandcampPurchase,
  releases: DiscogsRelease[],
  options: MatchingOptions = {}
): Result<MatchingResponse, MatchError> {
  try {
    // Validate inputs
    const validationResult = validateInputs(purchase, releases);
    if (!validationResult.success) {
      return { success: false, error: validationResult.error };
    }
    
    // Perform matching with timeout
    const result = withTimeout(
      () => matchAlbum(purchase, releases, options),
      5000 // 5 second timeout
    );
    
    return { success: true, data: result };
  } catch (error) {
    logger.error('Match failed:', error);
    return {
      success: false,
      error: {
        type: 'runtime_error',
        message: 'Matching failed',
        retryable: true
      }
    };
  }
}
```

#### 2. Rate Limit Protection (1 hour)
```typescript
// Simple in-memory rate limiter for MVP
class SimpleRateLimiter {
  private requests: number[] = [];
  private readonly maxRequests = 50; // Leave buffer for Discogs 60/min
  private readonly windowMs = 60000;
  
  canRequest(): boolean {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      return false;
    }
    
    this.requests.push(now);
    return true;
  }
  
  timeUntilNextRequest(): number {
    if (this.canRequest()) return 0;
    const oldestRequest = Math.min(...this.requests);
    return this.windowMs - (Date.now() - oldestRequest);
  }
}
```

#### 3. Input Validation (1 hour)
```typescript
// Basic validation without external dependencies
export function validatePurchase(purchase: any): ValidationResult {
  const errors: string[] = [];
  
  // Required fields
  if (!purchase?.artist || typeof purchase.artist !== 'string') {
    errors.push('Artist is required and must be a string');
  }
  if (!purchase?.itemTitle || typeof purchase.itemTitle !== 'string') {
    errors.push('Title is required and must be a string');
  }
  
  // Length limits
  if (purchase?.artist?.length > 200) {
    errors.push('Artist name too long (max 200 characters)');
  }
  if (purchase?.itemTitle?.length > 300) {
    errors.push('Title too long (max 300 characters)');
  }
  
  // Format validation
  const validFormats = ['Digital', 'Vinyl', 'CD', 'Cassette', 'Other'];
  if (purchase?.format && !validFormats.includes(purchase.format)) {
    errors.push(`Invalid format. Must be one of: ${validFormats.join(', ')}`);
  }
  
  return errors.length > 0 
    ? { valid: false, errors }
    : { valid: true };
}
```

### Phase 1: MVP Enhancements (Week 1)

#### 1. Batch Processing (4 hours)
```typescript
// Simple batch processor without external queues
export async function batchMatchAlbums(
  purchases: BandcampPurchase[],
  searchFn: (purchase: BandcampPurchase) => Promise<DiscogsRelease[]>,
  options: {
    concurrency?: number;
    onProgress?: (progress: number) => void;
    onError?: (error: Error, purchase: BandcampPurchase) => void;
  } = {}
): Promise<Map<string, MatchingResponse>> {
  const { concurrency = 3, onProgress, onError } = options;
  const results = new Map<string, MatchingResponse>();
  
  // Process in chunks to respect rate limits
  const chunks = chunkArray(purchases, concurrency);
  let completed = 0;
  
  for (const chunk of chunks) {
    const chunkPromises = chunk.map(async purchase => {
      try {
        // Wait for rate limit
        while (!rateLimiter.canRequest()) {
          await sleep(1000);
        }
        
        // Search and match
        const releases = await searchFn(purchase);
        const result = matchAlbumSafe(purchase, releases);
        
        results.set(purchase.itemUrl, result);
      } catch (error) {
        onError?.(error, purchase);
        results.set(purchase.itemUrl, {
          status: 'error',
          error: error.message
        });
      } finally {
        completed++;
        onProgress?.(completed / purchases.length * 100);
      }
    });
    
    await Promise.all(chunkPromises);
    
    // Pause between chunks to avoid rate limits
    await sleep(2000);
  }
  
  return results;
}
```

#### 2. Persistent Cache (2 hours)
```typescript
// Simple file-based cache for MVP (no Redis dependency)
import { promises as fs } from 'fs';
import path from 'path';

class FileCache {
  private memoryCache = new Map<string, any>();
  private cacheDir: string;
  
  constructor(cacheDir = '.cache/matching') {
    this.cacheDir = cacheDir;
    this.ensureCacheDir();
  }
  
  private async ensureCacheDir() {
    await fs.mkdir(this.cacheDir, { recursive: true });
  }
  
  private getCacheKey(key: string): string {
    // Create safe filename from key
    return crypto
      .createHash('md5')
      .update(key)
      .digest('hex')
      .substring(0, 16);
  }
  
  async get(key: string): Promise<any | null> {
    // Check memory first
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key);
    }
    
    // Check file
    try {
      const filename = path.join(this.cacheDir, this.getCacheKey(key));
      const data = await fs.readFile(filename, 'utf8');
      const parsed = JSON.parse(data);
      
      // Check expiry
      if (parsed.expiry > Date.now()) {
        this.memoryCache.set(key, parsed.value);
        return parsed.value;
      }
    } catch {
      // Cache miss
    }
    
    return null;
  }
  
  async set(key: string, value: any, ttlMs = 3600000): Promise<void> {
    const data = {
      value,
      expiry: Date.now() + ttlMs
    };
    
    // Memory cache
    this.memoryCache.set(key, value);
    
    // File cache
    const filename = path.join(this.cacheDir, this.getCacheKey(key));
    await fs.writeFile(filename, JSON.stringify(data));
    
    // Prevent memory bloat
    if (this.memoryCache.size > 500) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }
  }
}
```

#### 3. Basic Monitoring (2 hours)
```typescript
// Simple metrics without external dependencies
class MatchingMetrics {
  private metrics = {
    totalMatches: 0,
    successfulMatches: 0,
    failedMatches: 0,
    avgConfidence: 0,
    avgLatency: 0,
    cacheHits: 0,
    cacheMisses: 0
  };
  
  private latencies: number[] = [];
  private confidences: number[] = [];
  
  recordMatch(result: MatchingResponse, latencyMs: number) {
    this.metrics.totalMatches++;
    
    if (result.status === 'matched' || result.status === 'review') {
      this.metrics.successfulMatches++;
      if (result.bestMatch) {
        this.confidences.push(result.bestMatch.confidence);
      }
    } else {
      this.metrics.failedMatches++;
    }
    
    this.latencies.push(latencyMs);
    
    // Keep only recent data
    if (this.latencies.length > 1000) {
      this.latencies.shift();
    }
    if (this.confidences.length > 1000) {
      this.confidences.shift();
    }
    
    // Update averages
    this.metrics.avgLatency = this.average(this.latencies);
    this.metrics.avgConfidence = this.average(this.confidences);
  }
  
  recordCacheHit(hit: boolean) {
    if (hit) {
      this.metrics.cacheHits++;
    } else {
      this.metrics.cacheMisses++;
    }
  }
  
  getMetrics() {
    return {
      ...this.metrics,
      successRate: (this.metrics.successfulMatches / this.metrics.totalMatches * 100).toFixed(2) + '%',
      cacheHitRate: (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) * 100).toFixed(2) + '%',
      p95Latency: this.percentile(this.latencies, 0.95)
    };
  }
  
  private average(arr: number[]): number {
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }
  
  private percentile(arr: number[], p: number): number {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index];
  }
}

// Global instance
export const matchingMetrics = new MatchingMetrics();
```

### Phase 2: Production Readiness (Week 2)

#### 1. Health Checks
```typescript
export async function healthCheck(): Promise<HealthStatus> {
  const checks = {
    cache: false,
    rateLimit: false,
    performance: false
  };
  
  try {
    // Test cache
    await cache.set('health_check', 'ok', 1000);
    const cached = await cache.get('health_check');
    checks.cache = cached === 'ok';
    
    // Test rate limiter
    checks.rateLimit = rateLimiter.canRequest();
    
    // Test performance
    const start = performance.now();
    normalizeString('Test String');
    checks.performance = (performance.now() - start) < 10;
    
    const allHealthy = Object.values(checks).every(v => v);
    
    return {
      status: allHealthy ? 'healthy' : 'degraded',
      checks,
      metrics: matchingMetrics.getMetrics()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      checks,
      error: error.message
    };
  }
}
```

#### 2. Graceful Degradation
```typescript
export function matchWithFallback(
  purchase: BandcampPurchase,
  releases: DiscogsRelease[],
  options: MatchingOptions = {}
): MatchingResponse {
  try {
    // Try full matching
    return matchAlbum(purchase, releases, options);
  } catch (error) {
    logger.warn('Full match failed, trying basic match', error);
    
    try {
      // Fallback to basic string comparison
      const basicMatches = releases.map(release => ({
        release,
        confidence: calculateStringSimilarity(
          `${purchase.artist} ${purchase.itemTitle}`,
          `${release.artists_sort} ${release.title}`
        )
      }));
      
      const best = basicMatches.sort((a, b) => b.confidence - a.confidence)[0];
      
      return {
        bestMatch: best ? {
          ...best,
          matchType: 'fuzzy' as const,
          breakdown: {
            artistScore: 0,
            titleScore: 0,
            formatBonus: 0
          }
        } : null,
        alternatives: [],
        searchQuery: {
          artist: purchase.artist,
          title: purchase.itemTitle
        },
        status: best && best.confidence > 70 ? 'review' : 'no-match'
      };
    } catch {
      // Ultimate fallback
      return {
        bestMatch: null,
        alternatives: [],
        searchQuery: {
          artist: purchase.artist,
          title: purchase.itemTitle
        },
        status: 'no-match'
      };
    }
  }
}
```

## Realistic Timeline

### Week 1 (40 hours)
- Day 1: Critical error handling and validation (8 hours)
- Day 2: Rate limiting and basic batch processing (8 hours)
- Day 3: Persistent cache implementation (8 hours)
- Day 4: Monitoring and metrics (8 hours)
- Day 5: Testing and bug fixes (8 hours)

### Week 2 (40 hours)
- Day 1-2: Production deployment prep (16 hours)
- Day 3-4: Performance testing and optimization (16 hours)
- Day 5: Documentation and handoff (8 hours)

## Success Criteria

### Must Have (MVP)
- ✅ Handles errors gracefully without crashing
- ✅ Respects Discogs rate limits
- ✅ Validates and sanitizes input
- ✅ Provides basic metrics
- ✅ Persists cache across restarts

### Nice to Have (Post-MVP)
- ⏳ Redis cache for multi-instance
- ⏳ Proper job queue (BullMQ)
- ⏳ OpenTelemetry instrumentation
- ⏳ Machine learning pipeline
- ⏳ Multi-language support

## Risk Mitigation

### Technical Risks
1. **Discogs API Changes**: Abstract API calls behind interface
2. **Performance Degradation**: Implement circuit breakers
3. **Memory Leaks**: Add memory monitoring and limits

### Business Risks
1. **Low Match Accuracy**: Add feedback mechanism in v1.1
2. **User Frustration**: Clear messaging about beta status
3. **Scale Issues**: Document scaling path upfront

## Conclusion

This refined plan focuses on what's actually needed for a working MVP:
1. **Reliability** over features
2. **Simple solutions** over complex architectures
3. **Gradual improvement** over perfection

The matching engine with these additions will be production-ready for an MVP serving up to 1,000 users. Scaling beyond that will require the Phase 2 improvements outlined in the strategic roadmap.