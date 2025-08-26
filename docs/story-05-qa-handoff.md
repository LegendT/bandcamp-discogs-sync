# QA Handoff Prompt - Story 05: Enhanced Sync Pipeline

## Context for QA Engineer

You are testing Story 05 of the BC→DC Sync application, which adds batch processing capabilities to handle large music collections. This feature allows users to sync more than 20 items from Bandcamp to Discogs without browser timeouts.

## Project Overview

**Application:** BC→DC Sync - A web app that syncs Bandcamp purchases to Discogs collections
**Current Sprint:** Day 6-7 of 14-day MVP
**Story 05 Focus:** Enhanced sync pipeline with batch processing and progress tracking
**Tech Stack:** Next.js, TypeScript, React, Discogs API

## What Was Built

### Core Features Implemented:
1. **Batch Processing**
   - Automatically splits collections >20 items into batches
   - Processes batches sequentially with 500ms delay
   - Prevents browser timeouts on large collections

2. **Progress Tracking**
   - Visual progress bar during multi-batch syncs
   - "Syncing batch X of Y..." status messages
   - Real-time item count updates

3. **Error Resilience**
   - Continues processing even if individual items fail
   - Aggregates results across all batches
   - Shows detailed success/failure counts

## Test Environment Setup

### Prerequisites:
```bash
# 1. Clone repository
git clone https://github.com/LegendT/bandcamp-discogs-sync.git
cd bandcamp-discogs-sync

# 2. Switch to feature branch
git checkout feature/story-05-sync-pipeline

# 3. Install dependencies
npm install

# 4. Start development server
npm run dev
# Application runs on http://localhost:3001 (or 3000)
```

### Required Test Data:
1. **Discogs Personal Access Token**
   - Get from: https://www.discogs.com/settings/developers
   - Click "Generate new token"
   - Save for testing

2. **Test CSV Files**
   - Small (10 items): `/test-data/simple-test.csv`
   - Medium (50 items): Create from your Bandcamp collection
   - Large (100+ items): Combine multiple CSV exports

## Critical Test Scenarios

### Test Case 1: Small Batch (Regression Test)
**Priority:** P0 - Must not break existing functionality
```
Steps:
1. Upload CSV with 10-20 items
2. Review matches
3. Select all items
4. Click Sync

Expected:
- Single batch processing (no progress bar)
- All items sync successfully
- Same behavior as Story 04
```

### Test Case 2: Medium Collection (2-3 Batches)
**Priority:** P0 - Core new functionality
```
Steps:
1. Upload CSV with 40-60 items
2. Select all matched items
3. Click Sync

Expected:
- Progress bar appears
- Shows "Syncing batch 1 of 3..."
- Updates after each batch completes
- Final results show total synced
```

### Test Case 3: Large Collection (5+ Batches)
**Priority:** P1 - Stress testing
```
Steps:
1. Upload CSV with 100+ items
2. Select all items
3. Start sync

Expected:
- Smooth progress updates
- No browser timeout/freeze
- Accurate final counts
- ~500ms delay between batches
```

### Test Case 4: Error Handling
**Priority:** P1 - Resilience testing
```
Steps:
1. Upload CSV with known problematic items
2. Include items already in collection
3. Start sync

Expected:
- Sync continues despite failures
- Shows X successful, Y failed
- Error items listed in results
```

### Test Case 5: Progress Accuracy
**Priority:** P2 - UI/UX validation
```
Steps:
1. Upload 50 items
2. Watch progress carefully

Verify:
- Progress bar matches actual progress
- Batch numbers are correct
- "Syncing items 21-40 of 50" is accurate
- No jumps or stutters in progress
```

## Edge Cases to Test

### Critical Edge Cases:
1. **Exact batch boundary (exactly 20, 40, 60 items)**
   - Should process cleanly without remainder batch

2. **Cancel page during sync**
   - Refresh browser mid-sync
   - Check no duplicate adds to Discogs

3. **Rate limiting**
   - Sync 100+ items rapidly
   - Should handle 429 errors gracefully

4. **Network interruption**
   - Disable network mid-sync
   - Should show appropriate error

### UI/UX Validation:
- [ ] Progress bar visible only for >20 items
- [ ] Warning message shows for large selections
- [ ] Button text updates during sync
- [ ] Results summary is accurate
- [ ] No console errors during operation

## Performance Benchmarks

Expected performance for different collection sizes:

| Items | Batches | Expected Time | Max Acceptable |
|-------|---------|---------------|----------------|
| 20    | 1       | 2-3 seconds   | 5 seconds      |
| 50    | 3       | 4-6 seconds   | 10 seconds     |
| 100   | 5       | 8-12 seconds  | 20 seconds     |
| 200   | 10      | 15-20 seconds | 40 seconds     |

## Regression Testing

Ensure Story 04 features still work:
- [ ] Token validation ("Test Connection")
- [ ] CSV upload and parsing
- [ ] Match quality indicators
- [ ] Checkbox selection (individual and bulk)
- [ ] High-confidence pre-selection
- [ ] Basic 20-item sync

## Known Limitations (Not Bugs)

These are expected behaviors in the MVP:
1. **No cancel button** - User cannot stop sync once started
2. **No retry for failed items** - Manual re-sync required
3. **Sequential processing** - Batches process one at a time
4. **No persistence** - Progress lost on page refresh
5. **Fixed batch size** - Always 20 items per batch

## Bug Report Template

If you find issues, please report with:

```markdown
**Bug Title:** [Brief description]

**Severity:** P0/P1/P2/P3

**Steps to Reproduce:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happens]

**Test Data:**
- CSV file size: [X items]
- Batch number when failed: [X of Y]
- Browser: [Chrome/Firefox/Safari]
- Console errors: [Any errors]

**Screenshots/Video:**
[Attach if applicable]
```

## Testing Checklist

### Functional Testing:
- [ ] Small batch (≤20 items) works as before
- [ ] Medium batch (21-60 items) shows progress
- [ ] Large batch (61-100 items) completes without timeout
- [ ] Very large batch (100+ items) handles gracefully
- [ ] Progress bar updates smoothly
- [ ] Batch status text is accurate
- [ ] Final results match actual synced items
- [ ] Error handling doesn't stop entire sync

### Performance Testing:
- [ ] No memory leaks during large syncs
- [ ] Browser remains responsive
- [ ] Progress updates don't cause lag
- [ ] 500ms delay between batches observed

### Error Scenarios:
- [ ] Rate limit (429) handled gracefully
- [ ] Network timeout shows error
- [ ] Invalid token detected before sync
- [ ] Partial batch failures handled

### UI/UX Testing:
- [ ] Progress indicator only shows for >20 items
- [ ] Warning message for large batches
- [ ] Clear status during sync
- [ ] Results summary is clear
- [ ] No UI glitches during updates

## Commands for QA

```bash
# Run automated tests
npm test

# Check specific sync tests
npm test useSyncWorkflow

# Type checking
npm run type-check

# Linting
npm run lint

# Build verification
npm run build
```

## Definition of Done

Story 05 is complete when:
- ✅ Can sync 100-item collection successfully
- ✅ Progress indicator shows during multi-batch sync
- ✅ Results summary accurate for all scenarios
- ✅ No regression in Story 04 features
- ✅ All automated tests passing
- ✅ No console errors in browser
- ✅ Performance within acceptable ranges

## Support Contacts

**Technical Issues:** Check `/docs/sync-pipeline-critique.md`
**Implementation Details:** See `/docs/story-05-migration-guide.md`
**Code Location:** `/app/hooks/useSyncWorkflow.ts`
**Test File:** `/app/hooks/__tests__/useSyncWorkflow.test.ts`

## Notes for QA

This is an MVP implementation optimized for simplicity. A more robust production version exists at `/app/hooks/useSyncWorkflow-refined.ts` but is not active. Focus testing on the current simple implementation that will be used for the beta launch.

The goal is to ensure users can successfully sync large collections without timeouts, even if the UX isn't perfect. Error resilience and basic progress tracking are the key features to validate.

---

*QA Handoff prepared for Story 05 - Enhanced Sync Pipeline*
*Sprint Day 6-7 - Ready for testing*