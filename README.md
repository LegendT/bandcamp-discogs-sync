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

## Project Structure

- `app/` - Next.js app router pages and components
- `lib/` - Business logic (Discogs API, Bandcamp parsing, matching)
- `types/` - TypeScript type definitions
- `.env.local` - Local environment variables (create from .env.example)

## Git Workflow

- `main` - Production branch (protected)
- `develop` - Development branch (default)

## Testing the Setup

Visit http://localhost:3000/(dev)/test-setup after starting the dev server to verify the Discogs API connection.
Note: Development routes are only available when NODE_ENV is not 'production'.

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Axios (HTTP client)
- Zod (schema validation)
- Playwright (for future Bandcamp scraping)