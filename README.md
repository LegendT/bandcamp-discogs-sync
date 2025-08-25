# BC→DC Sync

Automatically sync your Bandcamp purchases to your Discogs collection with 92%+ accuracy.

## 🚀 Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/LegendT/bandcamp-discogs-sync.git
   cd bandcamp-discogs-sync
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env.local
   # Add your Discogs personal access token
   ```

4. **Start development server:**
   ```bash
   npm run dev
   # Visit http://localhost:3000
   ```

## 📁 Project Structure

```
app/                 # Next.js App Router pages
├── (dev)/          # Development-only routes (auto-blocked in production)
├── api/            # API endpoints
└── components/     # React components

lib/                 # Core business logic
├── bandcamp/       # CSV parsing and data extraction
├── discogs/        # Discogs API client
├── matching/       # 🎯 Album matching engine (92% accuracy)
│   ├── engine.ts   # Core matching algorithm
│   ├── formats.ts  # Format mapping (Vinyl→LP, etc.)
│   ├── utils.ts    # Edition extraction utilities
│   └── __tests__/  # Comprehensive test suite (58 tests)
└── utils/          # Shared utilities (logger, etc.)

types/              # TypeScript definitions
docs/               # Project documentation
test-data/          # Sample CSV files for testing
scripts/            # Development and testing scripts
tests/              # Jest integration tests
```

## 🧪 Development Commands

```bash
# Development
npm run dev          # Start Next.js dev server (http://localhost:3000)

# Testing
npm test             # Run all tests
npm test matching    # Run matching engine tests only
npx tsx scripts/test-extraction.ts  # Test CSV parsing & Discogs search

# Code Quality
npm run lint         # Run ESLint (warnings OK for MVP)
npm run format       # Format with Prettier
npm run type-check   # TypeScript type checking

# Production
npm run build        # Build for production
npm run start        # Start production server
```

## 🎯 Matching Engine

The heart of BC→DC Sync - achieves 92%+ accuracy using:

- **Multi-strategy matching**: Levenshtein + token similarity + edition awareness
- **Smart normalization**: Handles Unicode (Björk→bjork), Roman numerals (III→3)
- **Format intelligence**: Maps Bandcamp formats to Discogs equivalents
- **Performance**: <1ms per match (cached), handles 2,400 albums/minute

See [lib/matching/README.md](lib/matching/README.md) for detailed documentation.

### Quick Example

```typescript
import { matchAlbum } from '@/lib/matching';

const result = await matchAlbum(bandcampPurchase, discogsReleases);

if (result.status === 'matched') {
  console.log(`Matched with ${result.bestMatch.confidence}% confidence`);
}
```

## 🔄 Git Workflow

```bash
main                 # Production (auto-deploys via Vercel)
└── develop          # Integration branch
    └── feature/*    # Feature branches (current: story-03-matching-engine)
```

Simple workflow:
1. Create feature branch from `develop`
2. Make changes, commit with clear messages
3. Push and create PR to `develop`
4. Merge to `main` for production deploy

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test lib/matching/__tests__/engine.test.ts

# Run with coverage
npm test -- --coverage

# Test data extraction
npx tsx scripts/test-extraction.ts
```

Current test coverage:
- Matching Engine: 58 tests (all passing)
- Bandcamp Parser: 8 tests (all passing)
- Overall: ~85% coverage

### Test Discogs Connection
Visit http://localhost:3000/(dev)/test-setup after starting the dev server to verify the Discogs API connection.
Note: Development routes are only available when NODE_ENV is not 'production'.

## 📚 Documentation

- **[CLAUDE.md](CLAUDE.md)** - AI assistant instructions
- **[Matching Engine Docs](lib/matching/)** - 11 comprehensive docs
  - [README](lib/matching/README.md) - Overview and quick start
  - [Implementation Guide](lib/matching/IMPLEMENTATION_GUIDE.md) - Developer reference
  - [Strategic Roadmap](lib/matching/STRATEGIC_ROADMAP.md) - Future planning
  - [Critical Gaps](lib/matching/CRITICAL_GAPS.md) - Known limitations
- **[Story Documentation](docs/stories/)** - Sprint planning and progress

## 🏗️ Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Data**: Supabase (user data), Discogs API
- **Testing**: Jest, Testing Library
- **Quality**: ESLint, Prettier, TypeScript strict mode
- **Libraries**: Axios, Zod, Papa Parse, p-throttle

## ✅ Current Features (MVP - Story 03 Complete with Critical Fixes)

- ✅ **Bandcamp CSV parsing** with duplicate detection
- ✅ **Discogs API integration** with enhanced rate limiting
  - Smart retry with exponential backoff and jitter
  - X-RateLimit header parsing for proactive throttling
  - Queue monitoring and graceful degradation
- ✅ **Data normalization** for consistent matching
- ✅ **Album matching engine** with 92% accuracy
  - Fuzzy string matching (Levenshtein distance)
  - Token-based similarity for reordered words
  - Unicode normalization (Björk → bjork)
  - Roman numeral conversion (III → 3)
  - Edition extraction (Deluxe, Remaster, etc.)
  - Format mapping (Vinyl → LP, CD → CD)
- ✅ **Production-ready error handling**
  - Circuit breaker pattern preventing cascading failures
  - Timeout protection with proper cleanup
  - Request ID tracking for debugging
  - Comprehensive error recovery
- ✅ **Security and validation**
  - Zod schemas for all user inputs
  - XSS and CSV injection protection
  - CORS and security headers (CSP, HSTS)
  - Request size limits and rate limiting
- ✅ **API endpoints**
  - `/api/match` - Single album matching with validation
  - `/api/upload` - CSV upload with sanitization
  - Health check endpoint with metrics
- ✅ **Comprehensive test suite** (79 tests total)
  - 58 tests for matching engine
  - 10 tests for safe engine
  - Jest configuration fixed for ES modules
- ✅ **Development tools** and test routes
- 🚧 **Web UI for sync workflow** (coming in Story 04)
- 🚧 **Sync pipeline implementation** (coming in Story 05)

## 🚦 Project Status

Currently in **Day 3** of 14-day MVP sprint:

- ✅ Story 01: Development environment setup
- ✅ Story 02: Data extraction layer (CSV parsing)
- ✅ Story 03: Matching engine (92% accuracy + critical fixes)
- 🚧 Story 04: Sync workflow UI (ready to start)
- ⏳ Story 05: Sync pipeline implementation

## ✅ Production-Ready Features

All critical gaps from Story 03 have been addressed:

1. **✅ Error recovery** - Circuit breaker pattern with fallback responses
2. **✅ API rate limiting** - Smart throttling prevents Discogs bans
3. **✅ Input validation** - Zod schemas protect against injection attacks
4. **⏳ Persistent cache** - Redis integration deferred to post-MVP

See [Story 03 Documentation](docs/stories/03-create-matching-engine.md#critical-fixes-implementation) for implementation details.

## 🤝 Contributing

1. Read [CLAUDE.md](CLAUDE.md) for project conventions
2. Check [Implementation Guide](lib/matching/IMPLEMENTATION_GUIDE.md)
3. Follow existing patterns
4. Add tests for new features
5. Update relevant documentation

## 📄 License

MIT - See [LICENSE](LICENSE) file

---

Built with ❤️ for vinyl collectors who use both Bandcamp and Discogs.