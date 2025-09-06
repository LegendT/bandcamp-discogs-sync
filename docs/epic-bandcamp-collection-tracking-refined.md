# Epic: Bandcamp Collection Tracking & Format Classification (Refined)

## Epic Summary
Store Bandcamp collection data persistently and differentiate between physical (Vinyl/CD/Cassette) and digital formats using pragmatic, achievable methods.

## Problem Statement
Currently, users must re-scrape their entire Bandcamp collection every session, and we can't differentiate between physical and digital purchases. This wastes time and prevents accurate Discogs matching.

## Core Features (Just These Two)

### Feature 1: Persistent Collection Storage
Store scraped Bandcamp data in a database so users don't lose their collection between sessions.

### Feature 2: Format Classification
Identify whether items are physical or digital, with understanding that perfect detection isn't possible.

## Realistic Technical Approach

### What We CAN Do:
1. **Public Scraping**: Get basic collection data without login (title, artist, artwork)
2. **Logged-in Detection**: When user provides session, check their OWN items for formats
3. **Smart Defaults**: Use heuristics for format guessing when detection fails
4. **Manual Override**: Let users correct our guesses

### What We CANNOT Do:
1. Detect formats for other people's collections
2. Maintain permanent Bandcamp sessions
3. Guarantee 100% format accuracy
4. Bypass Bandcamp's rate limiting

## Simplified Data Model

```sql
-- Single table for collections
CREATE TABLE bandcamp_collections (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  username VARCHAR(100) NOT NULL,
  item_count INTEGER DEFAULT 0,
  last_scraped TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Single table for items (the main focus)
CREATE TABLE bandcamp_items (
  id SERIAL PRIMARY KEY,
  collection_id INTEGER REFERENCES bandcamp_collections(id) ON DELETE CASCADE,
  
  -- Bandcamp data
  bandcamp_id VARCHAR(100) NOT NULL,
  title VARCHAR(500) NOT NULL,
  artist VARCHAR(500) NOT NULL,
  album_url TEXT,
  artwork_url TEXT,
  
  -- Format classification (the key feature)
  format VARCHAR(20) DEFAULT 'unknown', -- vinyl, cd, cassette, digital, unknown
  is_physical BOOLEAN DEFAULT NULL, -- true, false, or null for unknown
  format_source VARCHAR(20) DEFAULT 'none', -- detected, manual, guessed
  
  -- Sync tracking
  synced_to_discogs BOOLEAN DEFAULT FALSE,
  discogs_id VARCHAR(50),
  last_sync_attempt TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(collection_id, bandcamp_id)
);

-- Simple index for performance
CREATE INDEX idx_bandcamp_items_collection ON bandcamp_items(collection_id);
CREATE INDEX idx_bandcamp_items_format ON bandcamp_items(is_physical);
```

## Pragmatic Implementation Plan

### Phase 1: Basic Storage (Week 1)
**Goal**: Stop losing data between sessions

1. **Scrape & Store**:
   ```
   - Scrape public collection
   - Save to database
   - Display from database on next visit
   ```

2. **Incremental Updates**:
   ```
   - Check if item exists (by bandcamp_id)
   - Update if changed
   - Insert if new
   - Mark missing items (simple flag, not soft delete)
   ```

### Phase 2: Format Detection (Week 2)
**Goal**: Best-effort format identification

1. **Logged-in Detection** (When Possible):
   ```
   If user provides Bandcamp cookies:
     - Try to visit album pages
     - Look for "You Own This"
     - Parse format from text
     - Mark format_source='detected'
   ```

2. **Fallback Strategies**:
   ```
   If no login or detection fails:
     - Check if title contains "[Vinyl]" or "(CD)"
     - Check common patterns in album titles
     - Default to 'unknown'
     - Mark format_source='guessed'
   ```

3. **Manual Correction**:
   ```
   - Simple UI checkbox: "This is physical media"
   - Dropdown for specific format
   - Mark format_source='manual'
   - Manual entries never get overwritten
   ```

### Phase 3: Smart Sync (Week 3)
**Goal**: Use format data to improve Discogs matching

1. **Sync Logic**:
   ```
   - Physical items → Search Discogs Vinyl/CD
   - Digital items → Search Discogs Digital/File
   - Unknown items → Search all formats
   ```

2. **Tracking**:
   ```
   - Mark synced_to_discogs=true
   - Store discogs_id for reference
   - Show sync status in UI
   ```

## Realistic User Flow

```
1. First Use:
   User enters username → Scrape public data → Save to DB → Show collection

2. Format Enhancement (Optional):
   User clicks "Detect Formats" → 
   Prompt: "Please log into Bandcamp in another tab" →
   User provides session cookie (or clicks "Skip") →
   Try detection for 10 items as test →
   If successful, continue with rest →
   If fails, explain why and offer manual option

3. Manual Cleanup:
   Show list with format badges →
   User clicks incorrect items →
   Quick correction modal →
   Save to DB with format_source='manual'

4. Discogs Sync:
   Filter by physical/digital/unknown →
   Select items to sync →
   Use format to improve matching →
   Track what's been synced
```

## Key Design Decisions

### Why This Approach Works:

1. **No Password Storage**: We never ask for or store Bandcamp passwords
2. **Session Optional**: App works without login, enhanced with it
3. **Graceful Degradation**: Format detection failure doesn't break anything
4. **User Control**: Manual corrections always win
5. **Simple Schema**: Two tables, basic columns, no over-engineering

### What We're NOT Doing:

1. **No Complex History**: Just current state, not every change
2. **No Audit Logs**: Add later if needed
3. **No Soft Deletes**: Items are either there or not
4. **No Confidence Scores**: Binary decision - we know or we don't
5. **No Background Jobs**: Initially synchronous, add queues if needed

## Success Metrics

### Must Have (Week 3):
- Collections persist between sessions
- Basic format detection works for logged-in users
- Manual format correction works
- Can filter by physical/digital

### Nice to Have (Future):
- Batch format updates
- Format statistics dashboard
- Export to CSV
- Duplicate detection

## Risk Mitigation

### Real Risks & Solutions:

1. **Bandcamp Changes HTML**
   - Solution: Manual correction always available
   - Monitor for breaks, quick fixes

2. **Session Expires During Scrape**
   - Solution: Process in small batches
   - Save progress frequently
   - Clear error messages

3. **Rate Limiting**
   - Solution: Add delays between requests
   - Respect 429 responses
   - Resume from last successful item

4. **Large Collections (5000+ items)**
   - Solution: Paginate UI display
   - Process in chunks
   - Show progress bar

## Implementation Checklist

### Week 1 - Storage:
- [ ] Create database tables
- [ ] Build save/update logic
- [ ] Display from database
- [ ] Test with 1000+ items

### Week 2 - Format Detection:
- [ ] Build session cookie input
- [ ] Implement "You Own This" parser
- [ ] Add manual correction UI
- [ ] Test with various formats

### Week 3 - Integration:
- [ ] Connect format data to matching
- [ ] Track sync status
- [ ] Build filter UI
- [ ] Test end-to-end flow

## Future Considerations (Not Now)

After we prove this works:
- Background job queue for large collections
- Bandcamp API integration (if they ever provide one)
- Machine learning for format prediction
- Collection value estimates

## Summary

This refined approach focuses on pragmatic solutions that can actually be built in 3 weeks. We're honest about limitations (can't detect formats without login, can't maintain permanent sessions) while providing real value (persistent storage, best-effort format detection, manual overrides).

The key insight: **Perfect is the enemy of good**. A simple system that correctly identifies 70% of formats with manual correction is better than a complex system that promises 100% but fails to deliver.