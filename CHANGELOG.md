# Changelog

## [Story 04 Enhanced - Bandcamp Scraping] - 2025-08-26

### Added
- **Bandcamp Web Scraping**: Automatic collection import via username
  - `SimpleBandcampScraper` class with full pagination support
  - Loads complete collections (tested with 52+ items)
  - No authentication required - uses public collection data
  - Fallback mechanism when bandcamp-fetch library fails
- **Dual Import Methods**: Users can choose automatic scraping or CSV upload
- **Enhanced DataImport Component**: 
  - Recommended scraping method with clear UI
  - Format preference selection for imports
  - Progress feedback during scraping
- **New API Endpoint**: `/api/scrape` for Bandcamp collection scraping
  - Proper field mapping (album → itemTitle)
  - Error handling with user-friendly messages
  - Rate limiting protection

### Fixed
- Field mapping between scraper output and expected BandcampPurchase interface
- Handling of missing album titles in Bandcamp data
- API route export syntax for Next.js App Router

### Technical Details
- Implemented pagination using Bandcamp's collection API
- Added fan_id extraction and token-based pagination
- Safety limit of 5000 items to prevent infinite loops
- Proper HTML entity decoding in pagedata parsing

## [Story 04 Complete] - 2025-08-25

### Added
- Full end-to-end sync workflow from CSV upload to Discogs collection
- Confirmation dialog for sync operations
- Match quality indicators (High/Medium/Low)
- Auto-selection of high confidence matches (>80%)
- Success feedback showing synced items

### Fixed
- **Critical**: Matching engine now handles missing `artists_sort` field from Discogs API
- **Critical**: Fixed confidence score display (was showing 9700% instead of 97%)
- **API**: Discogs search now uses less restrictive query parameters for better results
- **API**: Sync validation schema now accepts flexible data formats
- **UI**: ConfirmDialog modal positioning and visibility
- **UI**: ErrorBoundary component property naming conflict
- **Data**: CSV date format handling (YYYY-MM-DD format)
- **Data**: Field name mapping between snake_case and camelCase

### Changed
- Matching engine extracts artist from "Artist - Album" format when needed
- Confidence scores now use 0-100 scale consistently
- Development server defaults to port 3001 when 3000 is in use
- API processes matches individually instead of batch for better error handling

### Technical Details
- Fixed `normalizeString` function to handle undefined/null values
- Updated sync schema to accept both string and number for year field
- Added proper error logging to API routes for debugging
- Simplified ConfirmDialog positioning with flexbox centering

### Testing Completed
- ✅ CSV upload and parsing
- ✅ Discogs API authentication
- ✅ Album matching with 97-100% accuracy
- ✅ Selection controls (Select All, Clear All, individual)
- ✅ Sync to Discogs collection
- ✅ Error handling and recovery

### Known Issues
- Password field warning in console (cosmetic, doesn't affect functionality)
- Dev server shows webpack cache warnings (development only)

### Next Steps
- Story 05: Enhanced sync pipeline
- Story 06: Deploy beta version
- Story 07: Launch beta program