# Bandcamp Scraping & Format Detection Implementation

## Overview

This implementation provides automated Bandcamp collection scraping with format detection (physical vs digital) using Playwright. It uses the "You own this" indicator on album pages to determine ownership and format information.

## Key Features

- **Public Collection Scraping**: Extract all items from any public Bandcamp profile
- **Format Detection**: Identify vinyl, CD, cassette, and digital formats
- **Persistent Storage**: Cache scraped data locally to avoid re-scraping
- **Sync Tracking**: Track which items have been synced to Discogs
- **Manual Corrections**: Allow users to manually correct format classifications

## Architecture

### Components

1. **BandcampScraper** (`lib/bandcamp/scraper.ts`)
   - Uses Playwright for browser automation
   - Two-phase approach: public scraping + format detection
   - Handles pagination for large collections

2. **BandcampCollectionStore** (`lib/bandcamp/collection-store.ts`)
   - Manages data persistence (session/local/memory storage)
   - Tracks sync status with Discogs
   - Provides filtering and statistics

3. **BandcampImporter** (`app/components/BandcampImporter.tsx`)
   - React component for the import UI
   - Progressive workflow: username → scraping → format detection
   - Visual feedback with progress indicators

4. **API Routes**
   - `/api/bandcamp/scrape`: Initial collection scraping
   - `/api/bandcamp/detect-formats`: Format detection with progress streaming

## How It Works

### Phase 1: Public Collection Scraping
1. User enters their Bandcamp username
2. System navigates to `bandcamp.com/[username]`
3. Extracts all collection items (album art, titles, IDs)
4. No login required - works with public data

### Phase 2: Format Detection (Optional)
1. User must be logged into Bandcamp
2. System visits each album page individually
3. Looks for "You own this" section
4. Parses ownership text to determine format:
   - "Vinyl LP" → Physical (Vinyl)
   - "Compact Disc" → Physical (CD)
   - "Digital Album" → Digital
   - "Vinyl + Digital" → Both

### Data Storage

```typescript
interface ProcessedItem {
  id: string;
  title: string;
  bandName: string;
  format: 'vinyl' | 'cd' | 'cassette' | 'digital' | 'unknown';
  formatType: 'physical' | 'digital' | 'both' | 'unknown';
  includesDigital: boolean;
  syncedToDiscogs: boolean;
  discogsReleaseId?: string;
}
```

## Usage

### Basic Import

```tsx
import BandcampImporter from '@/app/components/BandcampImporter';

function MyComponent() {
  return (
    <BandcampImporter 
      onItemsImported={(items) => {
        console.log('Imported:', items);
        // Process items for Discogs sync
      }}
    />
  );
}
```

### Using the Hook

```tsx
import { useBandcampImport } from '@/app/hooks/useBandcampImport';

function MyComponent() {
  const {
    importFromBandcamp,
    markItemSynced,
    getPhysicalItems,
    getDigitalItems,
    stats
  } = useBandcampImport();

  const handleImport = async () => {
    const items = await importFromBandcamp('username');
    const physicalOnly = getPhysicalItems();
    // Sync physical items to Discogs...
  };
}
```

### Direct API Usage

```typescript
// Scrape collection
const response = await fetch('/api/bandcamp/scrape', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    username: 'markt',
    detectFormats: false 
  })
});

const collection = await response.json();
```

## Configuration

### Environment Variables

```bash
# Optional - defaults to headless in production
PLAYWRIGHT_HEADLESS=true
```

### Storage Options

```typescript
const store = new BandcampCollectionStore({
  persist: true,           // Save data between sessions
  storage: 'local'         // 'session' | 'local' | 'memory'
});
```

## Testing

Visit the test page at `/bandcamp-import-test` (development only) to try the importer.

### Test with Public Profiles

- `markt` - Small collection (7 items)
- `legendarytone` - Larger collection

## Limitations & Considerations

1. **Format Detection Requires Login**
   - User must be logged into Bandcamp
   - Only works for items they own
   - Cannot detect formats for other users' collections

2. **Rate Limiting**
   - 500ms delay between album page visits
   - Respects Bandcamp's server load

3. **Performance**
   - Large collections may take several minutes
   - Progress indicators show current status
   - Data is cached to avoid re-scraping

4. **Accuracy**
   - Relies on Bandcamp's ownership text
   - Some formats may not be detected
   - Users can manually correct classifications

## Error Handling

- **User Not Found**: Returns 404 with clear message
- **Not Logged In**: Marks all formats as "unknown"
- **Network Errors**: Retries with exponential backoff
- **Partial Failures**: Continues processing other items

## Security

- **No Credential Storage**: Never stores Bandcamp passwords
- **Session Isolation**: Each scraping session is isolated
- **Public Data Only**: Only accesses publicly visible information
- **User Control**: Users must explicitly authorize format detection

## Future Enhancements

1. **Batch Format Detection**: Process multiple items in parallel
2. **Incremental Updates**: Only fetch new items since last sync
3. **Background Processing**: Move scraping to background job queue
4. **Format Confidence Scores**: ML-based format prediction
5. **Direct Bandcamp API**: If/when Bandcamp provides one

## Troubleshooting

### "User not found"
- Check the username is correct
- Ensure the profile is public

### Formats showing as "unknown"
- User must be logged into Bandcamp
- Click "Open Bandcamp Login" and sign in
- Retry format detection

### Slow performance
- Large collections take time
- Consider skipping format detection initially
- Use cached data when available

### Missing items
- Check Bandcamp profile privacy settings
- Some items may be hidden or restricted
- Wishlist items are not included