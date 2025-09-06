# Epic: Format Detection for 100-500 Users - Pragmatic Implementation

## Executive Summary
A robust yet pragmatic approach to automated format detection that works reliably for our initial user base without over-engineering.

## Core Principle
Build for 100 users today with clear upgrade paths to 1000+ users tomorrow.

## Simplified Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Next.js App   │────▶│  API Routes  │────▶│   PostgreSQL    │
│   (Vercel)      │     │  (Serverless)│     │   (Supabase)    │
└─────────────────┘     └──────────────┘     └─────────────────┘
                               │
                               ▼
                    ┌──────────────────┐
                    │  Queue (Simple)  │
                    │  (Supabase Edge) │
                    └──────────────────┘
                               │
                               ▼
                    ┌──────────────────┐
                    │  Worker Process  │
                    │  (Single VPS)    │
                    │   - Playwright   │
                    │   - 2 browsers   │
                    └──────────────────┘
```

## Why This Works for 100-500 Users

### Math That Matters
- **100 users** × **200 items average** = 20,000 items total
- **Detection rate**: 30 items/minute = 11 hours to process all
- **Daily new items**: ~500 items = 17 minutes processing
- **Peak concurrent sessions**: 5-10 users = manageable load

### Cost Efficiency
- **Infrastructure**: $40/month (single VPS + Supabase)
- **Per user cost**: $0.40/month at 100 users
- **Break-even**: 8 paying users at £5/month

## Core Database Schema (Just What We Need)

```sql
-- Users table (managed by Supabase Auth)
-- We'll reference auth.users.id

-- Bandcamp sessions (simplified)
CREATE TABLE bandcamp_sessions (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_cookies TEXT NOT NULL,
  is_valid BOOLEAN DEFAULT true,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- Collection items (the main table)
CREATE TABLE bandcamp_items (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Bandcamp data
  bandcamp_id VARCHAR(100) NOT NULL,
  bandcamp_url TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  
  -- Format detection
  format VARCHAR(20) DEFAULT 'unknown', -- vinyl, cd, cassette, digital, unknown
  is_physical BOOLEAN,
  ownership_text TEXT,
  detected_at TIMESTAMP,
  detection_method VARCHAR(20), -- auto, manual
  
  -- User corrections
  user_format VARCHAR(20),
  user_corrected_at TIMESTAMP,
  
  -- Sync status
  synced_to_discogs BOOLEAN DEFAULT false,
  discogs_id VARCHAR(50),
  last_sync_attempt TIMESTAMP,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id, bandcamp_id),
  INDEX idx_user_items (user_id, created_at DESC),
  INDEX idx_sync_status (user_id, synced_to_discogs)
);

-- Simple job queue
CREATE TABLE detection_queue (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
  items_count INTEGER NOT NULL,
  processed_count INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_queue_status (status, created_at)
);

-- Rate limit tracking (simple)
CREATE TABLE rate_limits (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  requests_today INTEGER DEFAULT 0,
  last_request_at TIMESTAMP,
  rate_limited_until TIMESTAMP,
  created_at DATE DEFAULT CURRENT_DATE,
  
  UNIQUE(user_id, created_at)
);
```

## Pragmatic Implementation Approach

### Phase 1: Manual Session Setup (Week 1)
**Goal**: Get sessions working reliably

```javascript
// Simple session capture flow
1. User clicks "Connect Bandcamp Account"
2. Open new tab to Bandcamp login
3. User logs in normally
4. User copies cookie from browser DevTools (we provide instructions)
5. User pastes cookie into our form
6. We validate and encrypt the session
7. Test detection on 5 items
```

**Why this works**: Power users (early adopters) can handle this. We'll automate later.

### Phase 2: Basic Detection Worker (Week 2)
**Goal**: Reliable format detection without complexity

```javascript
class SimpleFormatDetector {
  constructor() {
    this.browser = null
    this.maxRetries = 3
    this.delayBetweenRequests = 3000 // 3 seconds
  }
  
  async initialize() {
    this.browser = await playwright.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
  }
  
  async detectFormats(userId, items) {
    const session = await this.getSession(userId)
    if (!session) {
      throw new Error('No valid session')
    }
    
    const context = await this.browser.newContext()
    await context.addCookies(JSON.parse(session.cookies))
    
    const results = []
    
    for (const item of items) {
      try {
        // Rate limiting - simple delay
        await this.delay(this.delayBetweenRequests)
        
        const page = await context.newPage()
        await page.goto(item.bandcamp_url, { 
          waitUntil: 'networkidle',
          timeout: 30000 
        })
        
        // Look for ownership text
        const ownershipText = await this.extractOwnershipText(page)
        const format = this.parseFormat(ownershipText)
        
        results.push({
          itemId: item.id,
          format: format.type,
          isPhysical: format.isPhysical,
          ownershipText
        })
        
        await page.close()
        
      } catch (error) {
        console.error(`Failed to detect format for ${item.id}:`, error)
        results.push({
          itemId: item.id,
          format: 'unknown',
          isPhysical: null,
          error: error.message
        })
      }
    }
    
    await context.close()
    return results
  }
  
  async extractOwnershipText(page) {
    // Try multiple selectors
    const selectors = [
      '.you-own-this-txt',
      '.ownership-text',
      '[class*="ownership"]'
    ]
    
    for (const selector of selectors) {
      try {
        const element = await page.$(selector)
        if (element) {
          return await element.textContent()
        }
      } catch (e) {
        continue
      }
    }
    
    return null
  }
  
  parseFormat(text) {
    if (!text) {
      return { type: 'unknown', isPhysical: null }
    }
    
    const lower = text.toLowerCase()
    
    if (lower.includes('vinyl') || lower.includes(' lp')) {
      return { type: 'vinyl', isPhysical: true }
    }
    
    if (lower.includes('compact disc') || lower.includes(' cd')) {
      return { type: 'cd', isPhysical: true }
    }
    
    if (lower.includes('cassette')) {
      return { type: 'cassette', isPhysical: true }
    }
    
    if (lower.includes('digital')) {
      return { type: 'digital', isPhysical: false }
    }
    
    return { type: 'unknown', isPhysical: null }
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
```

### Phase 3: Simple Queue System (Week 3)
**Goal**: Process jobs without complexity

```javascript
// Simple polling-based queue processor
class QueueProcessor {
  async run() {
    while (true) {
      try {
        // Get next pending job
        const job = await db.query(`
          SELECT * FROM detection_queue 
          WHERE status = 'pending' 
          ORDER BY created_at 
          LIMIT 1
        `)
        
        if (job.rows.length === 0) {
          // No jobs, wait 30 seconds
          await this.delay(30000)
          continue
        }
        
        const currentJob = job.rows[0]
        
        // Mark as processing
        await db.query(`
          UPDATE detection_queue 
          SET status = 'processing', started_at = NOW() 
          WHERE id = $1
        `, [currentJob.id])
        
        // Get items for this user
        const items = await db.query(`
          SELECT * FROM bandcamp_items 
          WHERE user_id = $1 AND format = 'unknown'
          LIMIT 50
        `, [currentJob.user_id])
        
        // Process formats
        const detector = new SimpleFormatDetector()
        await detector.initialize()
        
        const results = await detector.detectFormats(
          currentJob.user_id, 
          items.rows
        )
        
        // Save results
        for (const result of results) {
          await db.query(`
            UPDATE bandcamp_items 
            SET format = $1, is_physical = $2, ownership_text = $3,
                detected_at = NOW(), detection_method = 'auto'
            WHERE id = $4
          `, [result.format, result.isPhysical, result.ownershipText, result.itemId])
        }
        
        // Mark job complete
        await db.query(`
          UPDATE detection_queue 
          SET status = 'completed', 
              completed_at = NOW(),
              processed_count = $1
          WHERE id = $2
        `, [results.length, currentJob.id])
        
        await detector.cleanup()
        
      } catch (error) {
        console.error('Queue processing error:', error)
        await this.delay(60000) // Wait 1 minute on error
      }
    }
  }
}
```

### Phase 4: User Interface (Week 4)
**Goal**: Simple, clear UI for format management

```typescript
// Main collection view with format badges
interface CollectionViewProps {
  items: BandcampItem[]
  onFormatCorrection: (itemId: string, format: string) => void
}

export function CollectionView({ items, onFormatCorrection }: CollectionViewProps) {
  const physicalItems = items.filter(i => i.is_physical === true)
  const digitalItems = items.filter(i => i.is_physical === false)
  const unknownItems = items.filter(i => i.is_physical === null)
  
  return (
    <div>
      <div className="stats">
        <div>Physical: {physicalItems.length}</div>
        <div>Digital: {digitalItems.length}</div>
        <div>Unknown: {unknownItems.length}</div>
      </div>
      
      <div className="actions">
        <button onClick={startDetection}>
          Detect Formats ({unknownItems.length} remaining)
        </button>
      </div>
      
      <div className="items">
        {items.map(item => (
          <div key={item.id} className="item">
            <img src={item.artwork_url} />
            <div>{item.title}</div>
            <div>{item.artist}</div>
            <FormatBadge 
              format={item.format}
              onClick={() => showCorrectionModal(item)}
            />
            <SyncStatus synced={item.synced_to_discogs} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

## Deployment Strategy

### Single VPS Setup
```bash
# Simple deployment on a $20/month VPS (DigitalOcean/Linode)

# 1. Install dependencies
apt-get update
apt-get install -y nodejs npm postgresql nginx

# 2. Install Playwright browsers
npx playwright install-deps
npx playwright install chromium

# 3. Setup systemd service for worker
cat > /etc/systemd/system/format-detector.service << EOF
[Unit]
Description=Format Detection Worker
After=network.target

[Service]
Type=simple
User=bcdc
WorkingDirectory=/opt/bcdc-worker
ExecStart=/usr/bin/node worker.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# 4. Start service
systemctl enable format-detector
systemctl start format-detector
```

### Monitoring (Simple)
```javascript
// Basic health check endpoint
app.get('/health', async (req, res) => {
  const checks = {
    database: await checkDatabase(),
    worker: await checkWorker(),
    sessions: await checkSessions()
  }
  
  const healthy = Object.values(checks).every(v => v === true)
  res.status(healthy ? 200 : 503).json(checks)
})

// Uptime monitoring with UptimeRobot (free)
// Alert on Slack when down
```

## Rate Limiting Strategy

### Simple but Effective
```javascript
class RateLimiter {
  constructor() {
    this.baseDelay = 3000 // 3 seconds
    this.maxRequestsPerDay = 1000 // Per user
  }
  
  async checkLimit(userId) {
    const today = new Date().toISOString().split('T')[0]
    
    const result = await db.query(`
      INSERT INTO rate_limits (user_id, requests_today, last_request_at, created_at)
      VALUES ($1, 1, NOW(), $2)
      ON CONFLICT (user_id, created_at)
      DO UPDATE SET 
        requests_today = rate_limits.requests_today + 1,
        last_request_at = NOW()
      RETURNING requests_today
    `, [userId, today])
    
    if (result.rows[0].requests_today > this.maxRequestsPerDay) {
      throw new Error('Daily rate limit exceeded')
    }
    
    // Simple delay between requests
    await new Promise(resolve => setTimeout(resolve, this.baseDelay))
  }
}
```

## Success Metrics for 100-500 Users

### Must Have (Month 1)
- ✅ 95% of sessions stay valid for 30 days
- ✅ Format detection accuracy > 90% when logged in
- ✅ Process 100 items in < 10 minutes
- ✅ Zero data loss
- ✅ < $50/month infrastructure cost

### Nice to Have (Month 2)
- Session auto-refresh
- Batch selection UI
- Export to CSV
- Format statistics

### Future (Month 3+)
- Automated session capture
- Parallel processing
- Machine learning predictions

## Migration Path to Scale

When we hit 500+ users, upgrade to:

1. **Infrastructure** ($40 → $150/month)
   - 2 VPS workers instead of 1
   - Dedicated Redis for queue
   - PostgreSQL with read replica

2. **Code Changes** (1 week)
   - Add browser pooling
   - Implement proper job queue (BullMQ)
   - Add circuit breakers

3. **Monitoring** (2 days)
   - Add Grafana dashboard
   - Implement Sentry error tracking
   - Set up PagerDuty alerts

## Risk Mitigation

### What Could Go Wrong & Solutions

1. **Bandcamp blocks our IP**
   - Solution: Rotate between 2-3 VPS providers
   - Backup: Manual format entry

2. **Sessions expire unexpectedly**
   - Solution: Validate before each job
   - Backup: Prompt user to re-authenticate

3. **Worker crashes**
   - Solution: Systemd auto-restart
   - Backup: Manual restart via SSH

4. **Database fills up**
   - Solution: 50GB disk, auto-cleanup old data
   - Backup: Daily backups to S3

## Implementation Timeline

### Week 1: Foundation
- [ ] Set up VPS with Playwright
- [ ] Create database schema
- [ ] Build session management
- [ ] Test with 5 users

### Week 2: Detection
- [ ] Build format detector
- [ ] Test detection accuracy
- [ ] Handle edge cases
- [ ] Process 100 items successfully

### Week 3: Queue & Processing
- [ ] Implement simple queue
- [ ] Add rate limiting
- [ ] Test with 20 users
- [ ] Monitor performance

### Week 4: Polish & Launch
- [ ] Build correction UI
- [ ] Add monitoring
- [ ] Document setup
- [ ] Launch to 100 beta users

## Total Investment

### Development
- 4 weeks × 1 developer = 160 hours
- At $100/hour = $16,000

### Infrastructure (Annual)
- VPS: $20/month × 12 = $240
- Supabase: $25/month × 12 = $300
- Monitoring: Free tier
- **Total: $540/year**

### Break-even
- Need 9 paying users at £5/month
- Achievable in first month

## The Bottom Line

This approach:
- **Works reliably** for 100-500 users
- **Costs < $50/month** to operate
- **Ships in 4 weeks** with one developer
- **Scales clearly** when needed
- **Fails gracefully** when issues occur

It's not perfect, but it's **good enough to start making money**. Once we have revenue and user feedback, we can invest in the full production system.