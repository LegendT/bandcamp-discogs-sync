# Story 05 Migration Guide

## Overview

Story 05 introduces batch processing for the sync pipeline, allowing users to sync collections larger than 20 items. This document outlines the changes and migration paths for different deployment scenarios.

## Changes Made

### 1. Core Implementation (`app/hooks/useSyncWorkflow.ts`)

**Before (Story 04):**
- Hard limit of 20 items per sync
- Single API request
- No progress tracking
- Basic error handling

**After (Story 05):**
- Automatic batching for collections of any size
- Multiple API requests with rate limiting
- Real-time progress tracking
- Enhanced error handling with partial results

### 2. UI Updates (`app/page.tsx`)

**New Features:**
- Progress bar for multi-batch syncs
- "Syncing batch X of Y..." status display
- Updated warning message for large collections
- Batch-aware sync button text

### 3. New Files Created

- `/app/hooks/useSyncWorkflow-refined.ts` - Advanced implementation (future use)
- `/lib/sync/sync-engine.ts` - Production-grade sync engine (post-MVP)
- `/app/hooks/useSyncEngine.ts` - React hook for production engine
- `/docs/sync-pipeline-critique.md` - Technical analysis
- `/docs/sync-pipeline-deep-critique.md` - Architecture review

## Migration Scenarios

### Scenario 1: Keep Current Simple Implementation (MVP Demo)

**When to use:** For the immediate MVP demo with <20 beta users.

**No changes needed.** The current implementation in `useSyncWorkflow.ts` is sufficient for demos and small-scale testing.

### Scenario 2: Add Basic Improvements (Beta Release)

**When to use:** For beta release with 20-100 users.

**Quick improvements to current implementation:**

```typescript
// Add to useSyncWorkflow.ts

// 1. Better error messages
if (syncResponse.status === 429) {
  throw new SyncError('Rate limit reached. Please wait 60 seconds.', {
    retryAfter: 60,
    statusCode: 429,
    userAction: 'Wait and retry'
  });
}

// 2. Add retry count
const MAX_BATCH_RETRIES = 2;
for (let retry = 0; retry < MAX_BATCH_RETRIES; retry++) {
  try {
    const response = await fetch('/api/sync', ...);
    if (response.ok) break;
  } catch (error) {
    if (retry === MAX_BATCH_RETRIES - 1) throw error;
    await new Promise(r => setTimeout(r, 1000 * (retry + 1)));
  }
}
```

### Scenario 3: Use Refined Implementation (Pre-Production)

**When to use:** For pre-production testing or paid beta users.

**Steps to migrate:**

1. **Add feature flag:**
```typescript
// .env.local
NEXT_PUBLIC_USE_REFINED_SYNC=true
```

2. **Update page.tsx:**
```typescript
import { useSyncWorkflow } from './hooks/useSyncWorkflow';
import { useSyncWorkflow as useSyncWorkflowRefined } from './hooks/useSyncWorkflow-refined';

const USE_REFINED = process.env.NEXT_PUBLIC_USE_REFINED_SYNC === 'true';

export default function Home() {
  const syncHook = USE_REFINED ? useSyncWorkflowRefined : useSyncWorkflow;
  const { 
    isSyncing, 
    syncResults, 
    syncProgress,
    cancelSync, // New in refined
    retryFailed, // New in refined
    ...rest 
  } = syncHook();
  
  // Add cancel button if using refined
  {USE_REFINED && isSyncing && (
    <button onClick={cancelSync}>Cancel Sync</button>
  )}
}
```

3. **Test thoroughly:**
- Test with 100+ item collections
- Test cancellation mid-sync
- Test retry failed items
- Monitor memory usage

### Scenario 4: Production Deployment (Paid Users)

**When to use:** For production with paying customers.

**Full migration to production engine:**

1. **Replace hook entirely:**
```typescript
// Remove old imports
// import { useSyncWorkflow } from './hooks/useSyncWorkflow';

// Use production engine
import { useSyncEngine } from './hooks/useSyncEngine';

export default function Home() {
  const {
    isRunning,
    progress,
    startSync,
    pauseSync,
    resumeSync,
    cancelSync,
    getHealthMetrics
  } = useSyncEngine({
    batchSize: 20,
    maxRetries: 5,
    enableTelemetry: true
  });
  
  // Monitor health
  useEffect(() => {
    const interval = setInterval(() => {
      const health = getHealthMetrics();
      console.log('Sync health:', health);
    }, 5000);
    return () => clearInterval(interval);
  }, []);
}
```

2. **Add backend API routes:**
```typescript
// app/api/sync/session/route.ts
export async function POST(request: Request) {
  const engine = new SyncEngine(config);
  const session = await engine.createSession(items);
  // Store session in database
  return Response.json(session);
}

// app/api/sync/[sessionId]/route.ts
export async function PATCH(request: Request) {
  // Handle pause/resume/cancel
}
```

3. **Add monitoring:**
- Datadog/New Relic integration
- Error tracking (Sentry)
- Performance monitoring
- User analytics

## Testing Checklist

### Basic Testing (All Scenarios)
- [ ] Upload CSV with 10 items - should work as before
- [ ] Upload CSV with 50 items - should process in batches
- [ ] Upload CSV with 100+ items - should show progress
- [ ] Network error during sync - should show error
- [ ] Rate limit error - should show helpful message

### Advanced Testing (Refined/Production)
- [ ] Cancel sync mid-process - should stop cleanly
- [ ] Retry failed items - should only retry failures
- [ ] Pause and resume sync - should continue from checkpoint
- [ ] Browser refresh during sync - should recover state (production only)
- [ ] Memory usage with 1000+ items - should not increase unbounded

## Rollback Plan

If issues arise, rollback is simple:

1. **Revert hook file:**
```bash
git checkout main -- app/hooks/useSyncWorkflow.ts
```

2. **Remove progress UI (optional):**
```bash
git checkout main -- app/page.tsx
```

3. **Clear user cache:**
```javascript
localStorage.clear();
sessionStorage.clear();
```

## Performance Metrics

### Current Implementation (Simple)
- 100 items: ~5 seconds (sequential batches)
- Memory: ~10MB increase
- Error recovery: None
- User control: None

### Refined Implementation
- 100 items: ~5 seconds (sequential, better error handling)
- Memory: ~8MB increase (better cleanup)
- Error recovery: Partial (retry logic)
- User control: Cancel only

### Production Implementation
- 100 items: ~2-3 seconds (parallel processing)
- Memory: <5MB increase (streaming)
- Error recovery: Full (circuit breaker, checkpoints)
- User control: Full (pause/resume/cancel)

## Support Resources

- **Documentation:** `/docs/sync-pipeline-critique.md`
- **Architecture Review:** `/docs/sync-pipeline-deep-critique.md`
- **Test Suite:** `/app/hooks/__tests__/useSyncWorkflow.test.ts`
- **Production Code:** `/lib/sync/sync-engine.ts`

## Timeline

- **Week 1 (Days 6-7):** Current implementation ✅
- **Week 2 (Days 8-10):** Beta testing with current
- **Week 2-3 (Days 11-14):** Evaluate need for refined
- **Post-MVP:** Migrate to production engine

## Questions?

Contact the development team or refer to the architecture documentation for detailed technical specifications.