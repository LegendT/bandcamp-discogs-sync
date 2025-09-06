# BC→DC Sync Project Context Handoff - v0.1.0

## Project Overview
BC→DC Sync is a web application that automatically syncs Bandcamp purchases to Discogs collections with 92%+ accuracy. Version 0.1.0 (MVP) was released on August 26, 2025.

**GitHub Repository**: https://github.com/LegendT/bandcamp-discogs-sync
**Latest Release**: v0.1.0 - https://github.com/LegendT/bandcamp-discogs-sync/releases/tag/v0.1.0

## Current State Summary

### ✅ Completed Features (v0.1.0)
1. **Bandcamp Collection Import**
   - Automatic import via username (no authentication required)
   - Full pagination support (loads entire collections, tested with 52+ items)
   - Fallback importer when main library fails
   - Alternative CSV upload option

2. **Discogs Integration**
   - Token-based authentication (user provides token in UI)
   - Smart album matching with 92%+ accuracy
   - Batch processing (20 items per batch)
   - Rate limiting protection

3. **Matching Engine**
   - Multi-strategy matching (Levenshtein + token similarity)
   - Format intelligence (Vinyl→LP, CD→CD)
   - Unicode normalization (Björk→bjork)
   - <1ms per match with caching

4. **User Interface**
   - Clean 3-step workflow
   - Confidence indicators (High/Medium/Low)
   - Auto-selection of high confidence matches (>80%)
   - Real-time progress tracking

### 🔧 Technical Architecture

```
Tech Stack:
- Framework: Next.js 15 (App Router)
- Language: TypeScript
- Styling: Tailwind CSS
- Testing: Jest (104 tests, 85% coverage)
- APIs: Discogs REST API, Bandcamp public data

Key Files:
- /lib/bandcamp/collector.ts - Main Bandcamp import logic
- /lib/bandcamp/simple-importer.ts - Fallback HTML parser with pagination
- /lib/matching/engine.ts - Core matching algorithm
- /lib/discogs/client.ts - Discogs API integration
- /app/api/import-collection/route.ts - Import endpoint
- /app/api/sync/route.ts - Sync to Discogs endpoint
```

### 🚨 Critical Information

1. **Bandcamp Import Approach**
   - Bandcamp has NO CSV export functionality
   - We use public collection pages (no authentication)
   - Pagination via Bandcamp's API: `/api/fancollection/1/collection_items`
   - Terminology: We use "import/collect" instead of "scrape" throughout

2. **Rate Limiting**
   - Discogs: 60 requests/minute
   - Batch size: Fixed at 20 items
   - 500ms delay between batches

3. **Known Limitations**
   - Sync cannot be cancelled once started
   - No retry mechanism for failed items
   - Progress updates every 20 items (not individual)
   - Maximum ~52 items per import (pagination limit)

### 📂 Project Structure

```
app/
├── api/
│   ├── import-collection/  # Bandcamp import endpoint
│   ├── match/             # Album matching endpoint
│   ├── sync/              # Discogs sync endpoint
│   └── upload/            # CSV upload endpoint
├── components/
│   ├── DataImport.tsx     # Dual import UI (auto/CSV)
│   ├── MatchWorkflow.tsx  # Main workflow component
│   └── SyncProgress.tsx   # Progress tracking UI
lib/
├── bandcamp/
│   ├── collector.ts       # BandcampCollector class
│   └── simple-importer.ts # SimpleBandcampImporter (fallback)
├── discogs/
│   └── client.ts          # Discogs API client
├── matching/
│   ├── engine.ts          # Core matching logic
│   └── safe-engine.ts     # Production wrapper with circuit breaker
```

### 🔄 Recent Changes (Pre-Release)

1. **Terminology Refactoring** (August 26)
   - Renamed all "scrape" references to "import/collect"
   - API route: `/api/scrape` → `/api/import-collection`
   - Classes: `BandcampScraper` → `BandcampCollector`
   - Functions: `scrapeCollection()` → `fetchCollection()`

2. **Pagination Implementation**
   - Added full pagination support in SimpleBandcampImporter
   - Extracts fan_id and uses token-based pagination
   - Successfully loads all 52 items from test collection

3. **Repository Cleanup for v0.1.0**
   - Moved test files to `/scripts/development/`
   - Added MIT LICENSE
   - Created RELEASE.md with comprehensive notes
   - Updated README with badges and release info

### 🎯 Next Steps (Post-v0.1.0)

**Immediate Priorities:**
1. User authentication system (Story 09)
2. Payment processing with Stripe (Story 10)
3. Beta user program launch (Story 07)

**Technical Improvements:**
1. Implement retry mechanism for failed sync items
2. Add configurable batch sizes
3. Improve pagination to handle collections >52 items
4. Add export functionality for matched data
5. Implement persistent cache with Redis

**Known Issues to Address:**
1. Password field warning in console (cosmetic)
2. Webpack cache warnings in dev mode
3. Progress bar jumps (updates every 20 items)

### 💻 Development Commands

```bash
# Install and run
npm install
npm run dev          # Starts on http://localhost:3000

# Testing
npm test            # Run all tests
npm test matching   # Run matching tests only

# Code quality
npm run lint        # ESLint
npm run type-check  # TypeScript checking
npm run build       # Production build
```

### 🔑 Environment Requirements

- Node.js 18+
- No .env file needed (tokens via UI)
- Discogs token: User obtains from https://www.discogs.com/settings/developers
- Bandcamp username: Public collections only

### 📝 Important Context Files

1. **CLAUDE.md** - AI assistant instructions and project conventions
2. **RELEASE.md** - v0.1.0 release notes
3. **README.md** - Project documentation
4. **CHANGELOG.md** - Development history

### 🏷️ Git Information

- **Main branch**: `main` (production)
- **Latest tag**: `v0.1.0`
- **Last commit**: Repository cleanup and release preparation
- **PR #9**: Bandcamp import feature (merged)

### 🚀 Deployment Status

- Development environment working
- Ready for beta deployment
- No production deployment yet
- Vercel configuration pending

## Handoff Instructions

When continuing development:

1. **Check current branch**: Ensure you're on `main` or create a new feature branch
2. **Run the app**: `npm install && npm run dev`
3. **Test with username**: "heidiac" has 52 items for testing
4. **Review CLAUDE.md**: Contains coding conventions and guidelines
5. **Check open issues**: https://github.com/LegendT/bandcamp-discogs-sync/issues

## Key Technical Decisions

1. **Why no authentication?** MVP validates concept first
2. **Why fixed batch size?** Respects Discogs rate limits reliably
3. **Why "import" not "scrape"?** More professional terminology
4. **Why pagination limit?** Bandcamp's API complexity increases beyond ~52 items

## Success Metrics (Target)

- 10 beta users by day 14
- 1 paying customer ($5/month)
- <3 second import time for 50 items
- 92%+ matching accuracy maintained

---

**Project initiated**: August 2025
**MVP completed**: August 26, 2025 (Day 6 of 14-day sprint)
**Version**: 0.1.0
**Status**: Ready for beta testing