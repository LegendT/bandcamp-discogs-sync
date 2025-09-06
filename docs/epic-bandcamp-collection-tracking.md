# Epic: Bandcamp Collection Tracking & Format Classification

## Epic Summary
Implement persistent storage of Bandcamp collection data with accurate classification of physical (Vinyl/CD/Cassette) versus digital formats, enabling users to maintain a complete record of their collections with sync tracking.

## Core Features

### Feature 1: Persistent Bandcamp Collection Storage
**Objective**: Keep a running record of all Bandcamp collection information in the application database

**Requirements**:
- Store complete collection data after each scrape
- Track changes over time (items added/removed)
- Maintain history of all collection states
- Support incremental updates without losing data

### Feature 2: Physical vs Digital Format Classification
**Objective**: Accurately differentiate between physical and digital items in the collection

**Requirements**:
- Detect format from "You Own This" text when user is logged in
- Store format classification (Vinyl, CD, Cassette, Digital)
- Allow manual correction of misclassified items
- Track which items have been verified vs unverified

## User Stories

### Collection Recording
- **As a user**, I want my entire Bandcamp collection stored in the app so I don't need to re-scrape each time
- **As a user**, I want to see my collection history showing when items were added
- **As a user**, I want the app to remember which items I've already synced to Discogs

### Format Classification
- **As a collector**, I want to know which items are physical vs digital without checking Bandcamp each time
- **As a user**, I want to correct format classifications when the automatic detection is wrong
- **As a vinyl collector**, I want to filter my collection to show only physical media

## Data Model

### Core Tables

```sql
-- Bandcamp collections table
CREATE TABLE bandcamp_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  username VARCHAR(255) NOT NULL,
  last_scraped_at TIMESTAMP NOT NULL,
  total_items INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Individual collection items
CREATE TABLE bandcamp_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES bandcamp_collections(id),
  bandcamp_id VARCHAR(255) NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album_url TEXT,
  artwork_url TEXT,
  
  -- Format classification
  format VARCHAR(50), -- 'vinyl', 'cd', 'cassette', 'digital', 'unknown'
  format_type VARCHAR(50), -- 'physical', 'digital', 'both', 'unknown'
  includes_digital BOOLEAN DEFAULT FALSE,
  ownership_text TEXT, -- Raw "You Own This" text
  format_confidence DECIMAL(3,2), -- 0.00 to 1.00
  format_verified BOOLEAN DEFAULT FALSE,
  format_corrected_by_user BOOLEAN DEFAULT FALSE,
  
  -- Sync tracking
  synced_to_discogs BOOLEAN DEFAULT FALSE,
  discogs_release_id VARCHAR(255),
  sync_date TIMESTAMP,
  sync_status VARCHAR(50), -- 'pending', 'synced', 'failed', 'skipped'
  
  -- Metadata
  first_seen_at TIMESTAMP DEFAULT NOW(),
  last_seen_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP, -- Soft delete when item disappears
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(collection_id, bandcamp_id)
);

-- Track user corrections
CREATE TABLE format_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES bandcamp_items(id),
  original_format VARCHAR(50),
  corrected_format VARCHAR(50),
  correction_reason TEXT,
  corrected_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Sync history
CREATE TABLE sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES bandcamp_items(id),
  action VARCHAR(50), -- 'added_to_discogs', 'updated', 'removed'
  discogs_data JSONB,
  success BOOLEAN,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Technical Architecture

### Scraping & Detection Flow

```
1. Initial Scrape (Public Data)
   ├── Fetch collection from bandcamp.com/username
   ├── Extract: ID, Title, Artist, Album URL, Artwork
   ├── Store in bandcamp_items with format='unknown'
   └── Mark items for format detection

2. Format Detection (Requires Login)
   ├── Check if user has active Bandcamp session
   ├── For each unverified item:
   │   ├── Navigate to album URL
   │   ├── Look for "You Own This" section
   │   ├── Extract ownership text (e.g., "You own this album on Vinyl LP")
   │   ├── Parse format from text
   │   └── Update bandcamp_items with format data
   └── Mark items as format_verified=true

3. Incremental Updates
   ├── Compare new scrape with existing data
   ├── Mark missing items as deleted (soft delete)
   ├── Add new items
   └── Preserve user corrections and sync status
```

### Format Detection Logic

```
Parse "You Own This" text:
- Contains "Vinyl" or "LP" → format='vinyl', format_type='physical'
- Contains "Compact Disc" or "CD" → format='cd', format_type='physical'  
- Contains "Cassette" → format='cassette', format_type='physical'
- Contains "Digital" only → format='digital', format_type='digital'
- Contains physical + "Digital" → format_type='both', includes_digital=true
- No "You Own This" → format='unknown' (not owned or not logged in)
```

### Data Persistence Strategy

1. **After Each Scrape**:
   - Create new bandcamp_collections entry
   - Upsert items (update existing, insert new)
   - Track first_seen_at and last_seen_at
   - Preserve sync_status and user corrections

2. **Change Detection**:
   - Items present in previous scrape but not current → soft delete
   - New items not in previous scrape → mark as new
   - Format changes → log in format_corrections table

3. **User Corrections**:
   - Allow manual format override
   - Store in format_corrections for audit trail
   - Set format_corrected_by_user=true
   - Corrections persist across re-scrapes

## Implementation Approach

### Phase 1: Database Setup (Week 1)
- Create Supabase tables with proper indexes
- Set up row-level security policies
- Create database functions for upserts
- Add triggers for updated_at timestamps

### Phase 2: Collection Storage (Week 2)
- Modify scraper to save to database
- Implement incremental sync logic
- Add soft delete for missing items
- Create collection comparison logic

### Phase 3: Format Detection (Week 3)
- Implement logged-in scraping with Playwright
- Parse "You Own This" ownership text
- Store format classifications
- Add confidence scoring based on text clarity

### Phase 4: User Interface (Week 4)
- Collection view with format filters
- Manual correction interface
- Sync status indicators
- Collection statistics dashboard

## Success Criteria

1. **Data Persistence**
   - 100% of scraped data stored in database
   - Collection history maintained across sessions
   - No data loss during incremental updates

2. **Format Accuracy**
   - 95%+ accuracy for format detection when logged in
   - All user corrections preserved
   - Clear indication of verified vs unverified formats

3. **Performance**
   - <5 seconds to load 1000-item collection from database
   - Incremental sync only processes changed items
   - Format detection processes 10 items/second

## Risk Mitigation

### Technical Risks
- **Session Expiry**: Store session status, prompt user to re-login
- **Format Text Changes**: Use flexible parsing, store raw text for reprocessing
- **Data Conflicts**: User corrections always take precedence
- **Large Collections**: Implement pagination and batch processing

### Data Integrity
- **Duplicate Prevention**: Unique constraints on bandcamp_id
- **Audit Trail**: All changes logged with timestamps
- **Backup Strategy**: Regular database backups
- **Data Validation**: Check data consistency before/after operations

## Future Enhancements
- Machine learning for format prediction
- Bulk correction tools
- Collection value tracking
- Format upgrade detection (bought vinyl after digital)
- Wishlist vs owned differentiation