# BC→DC Sync

Sync your Bandcamp purchases to your Discogs collection.

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local`
3. Add your [Discogs personal access token](https://www.discogs.com/settings/developers)
4. Run development server: `npm run dev`

## Development Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run type-check` - Check TypeScript types

## Project Structure

- `app/` - Next.js app router pages and components
- `lib/` - Business logic (Discogs API, Bandcamp parsing, matching)
- `types/` - TypeScript type definitions