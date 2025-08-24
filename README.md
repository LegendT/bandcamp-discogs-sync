# BC→DC Sync

Sync your Bandcamp purchases to your Discogs collection.

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/LegendT/bandcamp-discogs-sync.git
   cd bandcamp-discogs-sync
   ```
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env.local`
4. Add your [Discogs personal access token](https://www.discogs.com/settings/developers)
5. Run development server: `npm run dev`

## Development Commands

- `npm run dev` - Start development server on http://localhost:3000
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run type-check` - Check TypeScript types
- `npm run test` - Run Jest tests

## Project Structure

- `app/` - Next.js app router pages and components
  - `(dev)/` - Development-only routes (protected in production)
- `lib/` - Business logic
  - `bandcamp/` - Bandcamp CSV parser
  - `discogs/` - Discogs API client with rate limiting
  - `matching/` - Album matching engine (coming in Story 03)
  - `utils/` - Utility functions (logger, etc.)
- `types/` - TypeScript type definitions
- `test-data/` - Sample CSV files for testing
- `scripts/` - Development and testing scripts
- `tests/` - Jest integration tests
- `.env.local` - Local environment variables (create from .env.example)
- `eslint.config.mjs` - ESLint flat configuration
- `.nvmrc` - Node.js version specification (18.20.0)

## Git Workflow

- `main` - Production branch (protected)
- `develop` - Development branch (default)

## Testing

### Test Discogs Connection
Visit http://localhost:3000/(dev)/test-setup after starting the dev server to verify the Discogs API connection.
Note: Development routes are only available when NODE_ENV is not 'production'.

### Test Data Extraction
Run the test script to validate CSV parsing and Discogs search:
```bash
npx tsx scripts/test-extraction.ts
```

This will:
- Parse the sample CSV file in `test-data/`
- Search Discogs for each item
- Report match rate and any errors

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Axios (HTTP client)
- Zod (schema validation)
- Papa Parse (CSV parsing)
- p-throttle (API rate limiting)
- Jest & ts-jest (testing)
- Playwright (for future Bandcamp scraping)

## Current Features (MVP - Story 02 Complete)

- ✅ Bandcamp CSV parsing with duplicate detection
- ✅ Discogs API integration with rate limiting
- ✅ Data normalization for better matching
- ✅ Comprehensive error handling and reporting
- 🚧 Album matching engine (coming in Story 03)
- 🚧 Web UI for sync workflow (coming in Story 04)