# Epic: Automated Format Detection - The Real Implementation

## Executive Summary
If we're doing automated detection, we need to accept the technical complexity and do it properly. Half-measures will fail.

## The Only Viable Approach: Embedded Browser Session

### Why This Is The Only Way:
- Bandcamp shows "You Own This" ONLY when logged into YOUR account
- We need to maintain a persistent session
- Cookie copying is unrealistic for normal users
- We must control the entire auth flow

## Technical Architecture

### Core Components

```
1. Embedded Browser (Playwright/Puppeteer)
   - Runs server-side
   - Maintains session per user
   - Handles login flow programmatically

2. Session Vault (Redis + Encryption)
   - Stores encrypted session cookies
   - 30-day expiry with refresh
   - Per-user isolation

3. Queue System (BullMQ)
   - Prevents rate limiting
   - Handles retries
   - Processes collections async

4. Database (PostgreSQL)
   - Stores results
   - Tracks detection status
   - Maintains user corrections
```

## The Real User Flow

### Initial Setup (One-Time)
```
1. User clicks "Connect Bandcamp"
2. We open embedded browser window
3. User logs into Bandcamp normally
4. We capture and encrypt session
5. Test detection on 5 items
6. Store session if successful
```

### Automated Detection Flow
```
1. User triggers collection import
2. Job added to queue
3. Worker process:
   - Loads user's session
   - Scrapes public collection first
   - Visits each album page
   - Extracts "You Own This" text
   - Parses format
   - Saves to database
4. User notified when complete
```

## Database Schema (Realistic)

```sql
-- User sessions (encrypted)
CREATE TABLE bandcamp_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  encrypted_cookies TEXT NOT NULL,
  session_valid BOOLEAN DEFAULT true,
  last_validated TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Collection items with detection
CREATE TABLE bandcamp_items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  bandcamp_id VARCHAR(100) NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album_url TEXT NOT NULL,
  
  -- Detection results
  ownership_text TEXT, -- Raw "You own this" text
  detected_format VARCHAR(20), -- vinyl, cd, cassette, digital
  is_physical BOOLEAN,
  detection_status VARCHAR(20), -- pending, detected, failed, manual
  detection_attempts INTEGER DEFAULT 0,
  last_detection_attempt TIMESTAMP,
  
  -- User corrections
  user_format VARCHAR(20),
  user_corrected_at TIMESTAMP,
  
  -- Sync tracking
  synced_to_discogs BOOLEAN DEFAULT false,
  discogs_id VARCHAR(50),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id, bandcamp_id)
);

-- Detection job queue
CREATE TABLE detection_jobs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  total_items INTEGER,
  processed_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Critical Implementation Details

### Session Management
```javascript
class BandcampSessionManager {
  // Store encrypted cookies in Redis
  async saveSession(userId, cookies) {
    const encrypted = await encrypt(cookies, getUserKey(userId))
    await redis.set(`session:${userId}`, encrypted, 'EX', 30 * 24 * 60 * 60)
  }
  
  // Test if session still works
  async validateSession(userId) {
    const browser = await playwright.launch()
    const context = await browser.newContext()
    
    // Load cookies
    const cookies = await this.getSession(userId)
    await context.addCookies(cookies)
    
    // Test by visiting profile
    const page = await context.newPage()
    await page.goto('https://bandcamp.com/settings')
    
    // Check if still logged in
    const isValid = await page.$('.user-menu') !== null
    
    await browser.close()
    return isValid
  }
  
  // Refresh if needed
  async refreshSession(userId) {
    if (!await this.validateSession(userId)) {
      // Mark as invalid, user must re-auth
      await db.query('UPDATE bandcamp_sessions SET session_valid = false WHERE user_id = $1', [userId])
      throw new Error('Session expired, please log in again')
    }
  }
}
```

### Rate Limit Management
```javascript
class RateLimitedScraper {
  constructor() {
    this.requestQueue = new PQueue({ 
      concurrency: 1,
      interval: 2000, // 2 seconds between requests
      intervalCap: 1  // 1 request per 2 seconds
    })
  }
  
  async detectFormat(item, session) {
    return this.requestQueue.add(async () => {
      // Add jitter to prevent pattern detection
      await sleep(Math.random() * 1000 + 1000)
      
      const result = await this.scrapeWithRetry(item, session, 3)
      return result
    })
  }
  
  async scrapeWithRetry(item, session, attempts) {
    try {
      return await this.scrapeItem(item, session)
    } catch (error) {
      if (error.message.includes('429') && attempts > 0) {
        // Exponential backoff
        await sleep(Math.pow(2, 4 - attempts) * 5000)
        return this.scrapeWithRetry(item, session, attempts - 1)
      }
      throw error
    }
  }
}
```

### Format Parser (The Actual Logic)
```javascript
function parseOwnershipText(text) {
  if (!text) return { format: 'unknown', isPhysical: null }
  
  const lower = text.toLowerCase()
  
  // Physical formats (order matters - check specific before generic)
  if (lower.includes('vinyl') || lower.includes(' lp')) {
    return { format: 'vinyl', isPhysical: true }
  }
  if (lower.includes('compact disc') || lower.includes(' cd ')) {
    return { format: 'cd', isPhysical: true }
  }
  if (lower.includes('cassette') || lower.includes('tape')) {
    return { format: 'cassette', isPhysical: true }
  }
  
  // Digital only
  if (lower.includes('digital') && !lower.includes('vinyl') && !lower.includes('cd')) {
    return { format: 'digital', isPhysical: false }
  }
  
  // Combination (physical + digital)
  if (lower.includes('+') || lower.includes('and digital')) {
    // Extract primary format
    if (lower.includes('vinyl')) return { format: 'vinyl', isPhysical: true }
    if (lower.includes('cd')) return { format: 'cd', isPhysical: true }
    if (lower.includes('cassette')) return { format: 'cassette', isPhysical: true }
  }
  
  return { format: 'unknown', isPhysical: null }
}
```

## Queue Processing

```javascript
// BullMQ job processor
async function processDetectionJob(job) {
  const { userId, items } = job.data
  
  // Get user session
  const session = await sessionManager.getSession(userId)
  if (!session) {
    throw new Error('No valid session')
  }
  
  // Initialize browser
  const browser = await playwright.launch({ headless: true })
  const context = await browser.newContext()
  await context.addCookies(session)
  
  try {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      
      // Update progress
      await job.updateProgress((i / items.length) * 100)
      
      // Detect format
      const page = await context.newPage()
      await page.goto(item.album_url, { waitUntil: 'networkidle' })
      
      // Look for ownership text
      const ownershipElement = await page.$('.ownership-text, .you-own-this')
      const ownershipText = ownershipElement ? await ownershipElement.textContent() : null
      
      // Parse and save
      const { format, isPhysical } = parseOwnershipText(ownershipText)
      
      await db.query(`
        UPDATE bandcamp_items 
        SET ownership_text = $1, 
            detected_format = $2,
            is_physical = $3,
            detection_status = $4,
            last_detection_attempt = NOW()
        WHERE id = $5
      `, [ownershipText, format, isPhysical, format === 'unknown' ? 'failed' : 'detected', item.id])
      
      await page.close()
      
      // Rate limit protection
      await sleep(2000 + Math.random() * 1000)
    }
  } finally {
    await browser.close()
  }
}
```

## Deployment Requirements

### Infrastructure
- **Server**: Minimum 2GB RAM for Playwright
- **Redis**: For session storage and queue
- **PostgreSQL**: For persistent data
- **Background Workers**: Separate process for queue processing

### Security
- **Encryption**: AES-256 for session cookies
- **Isolation**: Each user's browser context is isolated
- **Audit**: Log all detection attempts
- **Compliance**: Clear data retention policy

### Monitoring
- Queue depth and processing time
- Session validity rate
- Detection success rate
- Rate limit hits

## Cost Analysis

### Per User:
- Storage: ~1MB for cookies + collection data
- Processing: ~5 minutes CPU time per 100 items
- Bandwidth: ~50MB per full collection scan

### At Scale (1000 users):
- Server: $100/month (DigitalOcean/AWS)
- Redis: $20/month
- PostgreSQL: $20/month
- Total: ~$140/month infrastructure

## Success Criteria

### Week 1: Session Management
- [ ] Users can authenticate via embedded browser
- [ ] Sessions persist for 30 days
- [ ] Session validation works

### Week 2: Detection Pipeline
- [ ] Queue processes collections
- [ ] Format detection achieves 95% accuracy
- [ ] Rate limiting prevents bans

### Week 3: Production Readiness
- [ ] Handle 100 concurrent users
- [ ] Error recovery works
- [ ] Manual override UI complete

## The Bottom Line

This is what real automated detection requires:
1. **Complex session management** with encryption
2. **Queue-based processing** to prevent rate limits
3. **Embedded browser** automation (Playwright)
4. **Significant infrastructure** (not serverless)
5. **3-4 weeks** of solid development

If this seems like too much, we should reconsider manual classification. But if we're committed to automation, this is the minimum viable approach that will actually work in production.

The alternative is shipping something that breaks after 10 users.