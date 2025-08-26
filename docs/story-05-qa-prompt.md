# QA Testing Prompt - Story 05: Enhanced Sync Pipeline

## Copy this entire prompt to start a new QA testing session:

---

I need you to act as a QA Engineer testing Story 05 (Enhanced Sync Pipeline) of the BC→DC Sync application. This is a Next.js/TypeScript web app that syncs Bandcamp music purchases to Discogs collections.

## Your Testing Context

**What's New in Story 05:**
- Batch processing for collections >20 items (prevents timeouts)
- Visual progress tracking during sync
- Automatic chunking with rate limit protection
- Error resilience with partial results

**Repository:** https://github.com/LegendT/bandcamp-discogs-sync
**Branch:** `feature/story-05-sync-pipeline`
**Key Files:** 
- Implementation: `/app/hooks/useSyncWorkflow.ts`
- UI Updates: `/app/page.tsx`
- Tests: `/app/hooks/__tests__/useSyncWorkflow.test.ts`

## Setup Instructions

```bash
# Setup
git clone https://github.com/LegendT/bandcamp-discogs-sync.git
cd bandcamp-discogs-sync
git checkout feature/story-05-sync-pipeline
npm install
npm run dev

# Access app at http://localhost:3001
```

## Test Scenarios Priority Order

### 1. CRITICAL - Regression Test (Existing Features)
Test that collections ≤20 items still work exactly as before:
- Upload small CSV (10-20 items)
- Verify single batch processing
- No progress bar should appear
- All Story 04 features working

### 2. CRITICAL - Core New Feature
Test batch processing with 40-60 items:
- Upload medium CSV
- Verify progress bar appears
- Check "Syncing batch X of Y..." updates
- Confirm all items process successfully

### 3. HIGH - Large Collection Handling
Test with 100+ items:
- No browser timeout/freeze
- Smooth progress updates
- Accurate final counts
- Verify ~500ms delay between batches

### 4. HIGH - Error Resilience
Test partial failures don't stop sync:
- Include problematic items in CSV
- Verify sync continues despite failures
- Check failed items are reported correctly

### 5. MEDIUM - Edge Cases
- Exact batch boundaries (20, 40, 60 items)
- Page refresh during sync
- Network interruption handling
- Rate limit (429) responses

## Key Validation Points

**Progress Tracking:**
- Progress bar only shows for >20 items
- Batch numbers accurate (e.g., "batch 2 of 5")
- Item counts correct (e.g., "21-40 of 100")
- Smooth updates without jumps

**Performance Benchmarks:**
- 20 items: 2-3 seconds
- 50 items: 4-6 seconds  
- 100 items: 8-12 seconds
- No memory leaks or browser lag

**Error Handling:**
- Individual item failures don't stop batch
- Clear error messages
- Accurate success/failure counts
- No console errors

## Test Data Required

1. **Discogs Token:** Get from https://www.discogs.com/settings/developers
2. **CSV Files:** 
   - Small: `/test-data/simple-test.csv`
   - Medium: Create 50-item CSV
   - Large: Create 100+ item CSV

## Bug Report Format

```markdown
**Issue:** [Title]
**Severity:** P0/P1/P2
**Steps:** 
1. [Reproducible steps]
**Expected:** [What should happen]
**Actual:** [What happened]
**Data:** CSV size, batch number, console errors
**Evidence:** [Screenshots/video]
```

## Expected Limitations (Not Bugs)

- No cancel button during sync
- No retry for failed items
- Progress lost on page refresh
- Sequential batch processing only
- Fixed 20-item batch size

## Success Criteria

Story 05 passes QA when:
- ✅ 100-item collections sync without timeout
- ✅ Progress indicators accurate
- ✅ No regression in Story 04 features  
- ✅ Error handling works correctly
- ✅ Performance within benchmarks
- ✅ All automated tests pass (`npm test`)

## Quick Commands

```bash
npm test                 # Run all tests
npm run type-check      # TypeScript validation
npm run lint            # Code quality check
npm run build           # Production build test
```

**Focus Areas:** Test the batch processing thoroughly with various collection sizes. Ensure progress tracking is accurate and no regressions were introduced. The implementation should handle large collections gracefully even if not perfectly optimized.

**Note:** This is an MVP implementation. A production-grade version exists at `/app/hooks/useSyncWorkflow-refined.ts` but is NOT active. Test only the current implementation.

---

*End of QA prompt. Copy everything above to begin testing Story 05.*