# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BC→DC Sync is a web application that automatically syncs Bandcamp purchases to Discogs collections. Built as a 14-day MVP sprint to validate market demand.

## Build and Development Commands

```bash
# Development
npm run dev          # Start Next.js dev server on http://localhost:3000

# Code Quality (non-blocking)
npm run lint         # Run ESLint (warnings allowed during MVP)
npm run format       # Run Prettier to format code
npm run type-check   # TypeScript type checking
npm run test         # Run Jest tests (79 tests total)

# Production
npm run build        # Build for production
npm run start        # Start production server
```

## Architecture Overview

**Tech Stack:**
- Next.js 15 (App Router)
- TypeScript (pragmatic usage, `any` warnings OK during MVP)
- Tailwind CSS (utility-first styling)
- Supabase (user data, MVP uses free tier)
- Playwright (Bandcamp data extraction)
- Discogs REST API (personal token for MVP, OAuth1 later)

**Project Structure:**
```
app/                 # Next.js App Router pages
  (dev)/            # Development-only routes
  api/              # API routes
  components/       # React components
lib/                # Business logic
  bandcamp/         # CSV parsing, data extraction
  discogs/          # API client, collection management
  matching/         # Album matching algorithm
    safe-engine.ts  # Production wrapper with circuit breaker
    engine.ts       # Core matching logic
  validation/       # Input validation schemas
  api/              # API middleware and utilities
  utils/            # Utility functions (logger, etc.)
types/              # TypeScript type definitions
```

## Testing Strategy

MVP Phase: Targeted testing
- Core matching algorithm (58 tests)
- Safe engine with circuit breaker (10 tests)
- Critical path coverage for production safety
- Add tests when fixing bugs

```bash
npm test                    # Run all tests
npm test matching          # Run matching tests only
npm test -- --coverage     # Check test coverage
```

## Code Style and Conventions

**Pragmatic MVP Approach:**
- ESLint catches real bugs (unused vars, React keys)
- Prettier formats on save (VSCode configured)
- Git workflow: commit to `develop`, merge to `main` when stable
- No git hooks blocking development
- Clear commit messages, no strict format

**Key Principles:**
1. Ship working code over perfect code
2. Use logger utility instead of direct console (logger.warn, logger.error)
3. TypeScript `any` is OK during prototyping
4. Fix ESLint errors before deploy, not before commit
5. Development routes in `(dev)` folder are automatically blocked in production

## Current Sprint Status

Following 14-day MVP sprint plan:
- Days 1-3: Technical foundation
- Days 4-7: Core MVP features
- Days 8-10: Beta user testing
- Days 11-14: Monetization and polish

See `/docs/bc-dc-sync-action-plan.md` for detailed sprint plan.

## Important Context

- CSV upload only for MVP (no Bandcamp scraping initially)
- $5/month subscription model via Stripe
- Privacy-first: no data persistence, no tracking
- Target: 10 beta users, 1 paying customer by day 14

## Production Patterns

**Error Handling:**
- Use `matchAlbumSafe` wrapper for all matching operations
- Circuit breaker pattern prevents cascading failures
- Always provide fallback responses for graceful degradation

**API Development:**
- Use Zod schemas for all input validation
- Apply rate limiting middleware to prevent abuse
- Include security headers (CSP, HSTS) on all responses
- Add request ID tracking for debugging

**Performance:**
- Enhanced rate limiter respects Discogs API headers
- LRU cache improves response times to <1ms
- Timeout protection prevents hanging requests