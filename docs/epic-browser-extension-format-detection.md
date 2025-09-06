# Epic: Browser Extension-Based Format Detection

## Executive Summary

Implement automated format detection for Bandcamp collections using a Chrome browser extension to capture authenticated sessions, enabling detection of physical vs digital items for 100-500 users with minimal infrastructure.

## Business Objectives

### Primary Goals
- **Enable Format Detection**: Accurately identify physical (Vinyl/CD/Cassette) vs digital items
- **Persistent Storage**: Maintain complete collection records in our database
- **User Trust**: Secure, transparent session handling without password storage
- **Quick to Market**: Ship working solution in 3 weeks

### Success Metrics
- **Adoption**: 50% of users install extension within first month
- **Detection Accuracy**: 95% correct format identification when session valid
- **Processing Speed**: Complete 200-item collection in <10 minutes
- **Retention**: 80% of extension users remain active after 30 days

## Solution Architecture

### System Components

```
┌────────────────────────────────────────────────────────┐
│                    User's Browser                      │
│  ┌──────────────┐         ┌─────────────────────┐    │
│  │   Bandcamp   │────────▶│  Chrome Extension  │    │
│  │   Website    │         │  - Capture session │    │
│  │  (logged in) │         │  - Send to backend │    │
│  └──────────────┘         └─────────────────────┘    │
└────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────┐
                    │      Next.js App            │
                    │  - User authentication      │
                    │  - Collection management    │
                    │  - Manual corrections       │
                    └─────────────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────┐
                    │    Supabase Backend         │
                    │  - PostgreSQL database      │
                    │  - Session storage          │
                    │  - Collection data          │
                    └─────────────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────┐
                    │   Detection Worker (VPS)    │
                    │  - Playwright instance      │
                    │  - Format detection         │
                    │  - Queue processing         │
                    └─────────────────────────────┘
```

## Database Schema

```sql
-- Extension registration
CREATE TABLE extension_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  link_code VARCHAR(8) UNIQUE NOT NULL,
  extension_token TEXT UNIQUE,
  linked_at TIMESTAMP,
  last_seen TIMESTAMP,
  extension_version VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_link_code (link_code),
  INDEX idx_user_active (user_id, is_active)
);

-- Captured sessions from extension
CREATE TABLE bandcamp_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Encrypted session data
  encrypted_cookies TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  encryption_tag TEXT NOT NULL,
  
  -- Session metadata
  captured_at TIMESTAMP NOT NULL,
  captured_from_extension BOOLEAN DEFAULT true,
  extension_version VARCHAR(20),
  
  -- Session health
  is_valid BOOLEAN DEFAULT true,
  last_validated TIMESTAMP,
  last_used TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  
  -- Usage tracking
  detection_runs INTEGER DEFAULT 0,
  items_detected INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_user_valid (user_id, is_valid),
  INDEX idx_expires (expires_at)
);

-- Main collection storage
CREATE TABLE bandcamp_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Bandcamp data
  bandcamp_id VARCHAR(100) NOT NULL,
  bandcamp_url TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album_art_url TEXT,
  purchase_date DATE,
  
  -- Format detection results
  format VARCHAR(20) DEFAULT 'unknown', -- vinyl, cd, cassette, digital, unknown
  format_source VARCHAR(20) DEFAULT 'none', -- detected, manual, imported
  is_physical BOOLEAN,
  includes_digital BOOLEAN DEFAULT false,
  ownership_text TEXT,
  detected_at TIMESTAMP,
  detection_confidence DECIMAL(3,2),
  
  -- User corrections
  user_format VARCHAR(20),
  user_corrected_at TIMESTAMP,
  correction_note TEXT,
  
  -- Sync status
  synced_to_discogs BOOLEAN DEFAULT false,
  discogs_release_id VARCHAR(50),
  discogs_instance_id VARCHAR(50),
  last_sync_attempt TIMESTAMP,
  sync_error TEXT,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_seen_in_collection TIMESTAMP DEFAULT NOW(),
  removed_from_collection BOOLEAN DEFAULT false,
  
  UNIQUE(user_id, bandcamp_id),
  INDEX idx_user_format (user_id, format),
  INDEX idx_sync_status (user_id, synced_to_discogs),
  INDEX idx_detection (user_id, format_source)
);

-- Detection jobs
CREATE TABLE detection_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES bandcamp_sessions(id),
  
  -- Job configuration
  status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
  priority INTEGER DEFAULT 0,
  
  -- Progress tracking
  total_items INTEGER NOT NULL,
  processed_items INTEGER DEFAULT 0,
  detected_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  
  -- Timing
  queued_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  estimated_completion TIMESTAMP,
  
  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  INDEX idx_status_priority (status, priority DESC, queued_at)
);
```

## Chrome Extension Implementation

### Manifest Configuration
```json
{
  "manifest_version": 3,
  "name": "BC→DC Sync Collection Manager",
  "version": "1.0.0",
  "description": "Connect your Bandcamp collection to BC→DC Sync for automatic format detection",
  
  "permissions": [
    "cookies",
    "storage",
    "tabs",
    "activeTab"
  ],
  
  "host_permissions": [
    "https://*.bandcamp.com/*",
    "https://app.bcdc-sync.com/*",
    "http://localhost:3000/*"
  ],
  
  "background": {
    "service_worker": "src/background.js",
    "type": "module"
  },
  
  "action": {
    "default_popup": "src/popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  
  "options_page": "src/options.html",
  
  "content_scripts": [
    {
      "matches": ["https://*.bandcamp.com/*"],
      "js": ["src/content.js"],
      "run_at": "document_idle"
    }
  ],
  
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

### Extension Core Logic
```javascript
// src/background.js - Main service worker
import { API_URL, STORAGE_KEYS } from './config.js';

// Initialize on install
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Open onboarding page
    chrome.tabs.create({
      url: 'src/onboarding.html'
    });
  }
});

// Handle session capture
async function captureSession() {
  try {
    // Get Bandcamp cookies
    const cookies = await chrome.cookies.getAll({
      domain: '.bandcamp.com'
    });
    
    // Check if user is logged in
    const identityCookie = cookies.find(c => c.name === 'identity');
    if (!identityCookie) {
      throw new Error('Not logged into Bandcamp');
    }
    
    // Get stored API token
    const { apiToken } = await chrome.storage.sync.get(STORAGE_KEYS.API_TOKEN);
    if (!apiToken) {
      throw new Error('Extension not linked to BC→DC account');
    }
    
    // Send to backend
    const response = await fetch(`${API_URL}/api/extension/session`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'X-Extension-Version': chrome.runtime.getManifest().version
      },
      body: JSON.stringify({
        cookies: cookies.map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          expires: c.expirationDate,
          httpOnly: c.httpOnly,
          secure: c.secure,
          sameSite: c.sameSite
        })),
        capturedAt: Date.now(),
        url: 'https://bandcamp.com'
      })
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Update badge to show success
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
    
    // Clear badge after 3 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 3000);
    
    return result;
    
  } catch (error) {
    console.error('Session capture failed:', error);
    
    // Show error badge
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    
    throw error;
  }
}

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'capture_session') {
    captureSession()
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'check_status') {
    checkStatus()
      .then(status => sendResponse({ success: true, data: status }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});
```

### Popup Interface
```html
<!-- src/popup.html -->
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="container">
    <header>
      <img src="../icons/icon-48.png" alt="BC→DC Sync">
      <h1>BC→DC Sync</h1>
    </header>
    
    <div id="status-container" class="status">
      <div class="loading">Checking status...</div>
    </div>
    
    <div id="actions" class="actions hidden">
      <button id="capture-btn" class="btn-primary">
        <span class="icon">🔄</span>
        Capture Session
      </button>
      
      <button id="open-app" class="btn-secondary">
        <span class="icon">🌐</span>
        Open BC→DC Sync
      </button>
    </div>
    
    <footer>
      <a href="#" id="settings-link">Settings</a>
      <span class="separator">•</span>
      <a href="#" id="help-link">Help</a>
    </footer>
  </div>
  
  <script src="popup.js" type="module"></script>
</body>
</html>
```

## Backend Integration

### API Endpoints

```typescript
// app/api/extension/link/route.ts
export async function POST(request: Request) {
  const { linkCode } = await request.json();
  
  // Validate link code
  const link = await db.query.extension_links.findFirst({
    where: and(
      eq(extension_links.link_code, linkCode),
      gt(extension_links.created_at, new Date(Date.now() - 15 * 60 * 1000)) // 15 min expiry
    )
  });
  
  if (!link) {
    return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
  }
  
  // Generate API token for extension
  const token = generateSecureToken();
  
  await db.update(extension_links)
    .set({
      extension_token: token,
      linked_at: new Date()
    })
    .where(eq(extension_links.id, link.id));
  
  return NextResponse.json({ token });
}

// app/api/extension/session/route.ts
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  
  // Validate extension token
  const link = await db.query.extension_links.findFirst({
    where: and(
      eq(extension_links.extension_token, token),
      eq(extension_links.is_active, true)
    )
  });
  
  if (!link) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { cookies, capturedAt } = await request.json();
  
  // Encrypt session
  const encrypted = await encryptCookies(cookies, link.user_id);
  
  // Calculate expiry (Bandcamp sessions typically last 30 days)
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  
  // Store session
  const session = await db.insert(bandcamp_sessions).values({
    user_id: link.user_id,
    encrypted_cookies: encrypted.data,
    encryption_iv: encrypted.iv,
    encryption_tag: encrypted.tag,
    captured_at: new Date(capturedAt),
    captured_from_extension: true,
    extension_version: request.headers.get('X-Extension-Version'),
    expires_at: expiresAt
  }).returning();
  
  // Queue format detection
  await queueDetectionJob(link.user_id, session[0].id);
  
  return NextResponse.json({
    success: true,
    sessionId: session[0].id,
    expiresAt
  });
}
```

### Detection Worker

```typescript
// lib/detection/worker.ts
export class DetectionWorker {
  private browser: Browser | null = null;
  private isProcessing = false;
  
  async start() {
    // Initialize Playwright
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    // Start processing loop
    this.processLoop();
  }
  
  private async processLoop() {
    while (true) {
      try {
        // Get next job
        const job = await this.getNextJob();
        
        if (!job) {
          // No jobs, wait 30 seconds
          await this.delay(30000);
          continue;
        }
        
        this.isProcessing = true;
        await this.processJob(job);
        this.isProcessing = false;
        
      } catch (error) {
        console.error('Processing error:', error);
        await this.delay(5000);
      }
    }
  }
  
  private async processJob(job: DetectionJob) {
    // Update job status
    await db.update(detection_jobs)
      .set({ 
        status: 'processing',
        started_at: new Date()
      })
      .where(eq(detection_jobs.id, job.id));
    
    try {
      // Get session
      const session = await db.query.bandcamp_sessions.findFirst({
        where: eq(bandcamp_sessions.id, job.session_id)
      });
      
      if (!session || !session.is_valid) {
        throw new Error('Invalid session');
      }
      
      // Decrypt cookies
      const cookies = await decryptCookies(
        session.encrypted_cookies,
        session.encryption_iv,
        session.encryption_tag,
        job.user_id
      );
      
      // Create browser context with cookies
      const context = await this.browser!.newContext();
      await context.addCookies(cookies);
      
      // Get unprocessed items
      const items = await db.query.bandcamp_items.findMany({
        where: and(
          eq(bandcamp_items.user_id, job.user_id),
          eq(bandcamp_items.format, 'unknown')
        ),
        limit: 50
      });
      
      // Process each item
      let detected = 0;
      let failed = 0;
      
      for (const item of items) {
        try {
          const format = await this.detectItemFormat(context, item);
          
          await db.update(bandcamp_items)
            .set({
              format: format.type,
              is_physical: format.isPhysical,
              includes_digital: format.includesDigital,
              ownership_text: format.ownershipText,
              detected_at: new Date(),
              format_source: 'detected',
              detection_confidence: format.confidence
            })
            .where(eq(bandcamp_items.id, item.id));
          
          detected++;
          
        } catch (error) {
          console.error(`Failed to detect ${item.id}:`, error);
          failed++;
        }
        
        // Rate limiting
        await this.delay(2000 + Math.random() * 1000);
        
        // Update progress
        await db.update(detection_jobs)
          .set({
            processed_items: db.sql`processed_items + 1`,
            detected_items: detected,
            failed_items: failed
          })
          .where(eq(detection_jobs.id, job.id));
      }
      
      await context.close();
      
      // Complete job
      await db.update(detection_jobs)
        .set({
          status: 'completed',
          completed_at: new Date()
        })
        .where(eq(detection_jobs.id, job.id));
      
    } catch (error) {
      // Mark job as failed
      await db.update(detection_jobs)
        .set({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date()
        })
        .where(eq(detection_jobs.id, job.id));
    }
  }
  
  private async detectItemFormat(context: BrowserContext, item: BandcampItem) {
    const page = await context.newPage();
    
    try {
      await page.goto(item.bandcamp_url, {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      
      // Look for ownership text
      const ownershipText = await page.$eval(
        '.you-own-this-txt, .ownership-text, [class*="ownership"]',
        el => el?.textContent?.trim()
      ).catch(() => null);
      
      if (!ownershipText) {
        return {
          type: 'unknown',
          isPhysical: null,
          includesDigital: false,
          ownershipText: null,
          confidence: 0
        };
      }
      
      // Parse format
      const format = this.parseOwnershipText(ownershipText);
      
      return {
        ...format,
        ownershipText,
        confidence: 0.95
      };
      
    } finally {
      await page.close();
    }
  }
  
  private parseOwnershipText(text: string) {
    const lower = text.toLowerCase();
    
    // Vinyl detection
    if (lower.includes('vinyl') || lower.includes(' lp')) {
      const includesDigital = lower.includes('digital') || lower.includes('+');
      return {
        type: 'vinyl',
        isPhysical: true,
        includesDigital
      };
    }
    
    // CD detection
    if (lower.includes('compact disc') || lower.includes(' cd')) {
      const includesDigital = lower.includes('digital') || lower.includes('+');
      return {
        type: 'cd',
        isPhysical: true,
        includesDigital
      };
    }
    
    // Cassette detection
    if (lower.includes('cassette') || lower.includes('tape')) {
      const includesDigital = lower.includes('digital') || lower.includes('+');
      return {
        type: 'cassette',
        isPhysical: true,
        includesDigital
      };
    }
    
    // Digital only
    if (lower.includes('digital')) {
      return {
        type: 'digital',
        isPhysical: false,
        includesDigital: true
      };
    }
    
    return {
      type: 'unknown',
      isPhysical: null,
      includesDigital: false
    };
  }
}
```

## User Journey

### Initial Setup (One-time, 5 minutes)

1. **Install Extension**
   - User visits Chrome Web Store
   - Clicks "Add to Chrome"
   - Extension installed

2. **Link to BC→DC Account**
   - Extension opens onboarding page
   - User logs into BC→DC account
   - Gets 8-character link code
   - Enters code in extension
   - Extension receives API token

3. **First Session Capture**
   - User logs into Bandcamp normally
   - Clicks extension icon
   - Clicks "Capture Session"
   - Session sent to backend
   - Detection begins automatically

### Ongoing Usage

1. **Collection Import**
   - User clicks "Import Collection" in app
   - Public data scraped (no auth needed)
   - Items saved to database

2. **Format Detection**
   - User clicks extension icon
   - Session captured and sent
   - Backend queues detection job
   - Worker processes items
   - Results appear in app

3. **Manual Corrections**
   - User views collection in app
   - Clicks incorrect format badges
   - Selects correct format
   - Database updated

## Implementation Timeline

### Week 1: Extension Development
**Goal**: Working extension that captures sessions

- Day 1-2: Extension structure and manifest
- Day 3: Session capture logic
- Day 4: Backend API integration
- Day 5: Testing and refinement

**Deliverables**:
- Chrome extension (.crx file)
- Link/unlink functionality
- Session capture working

### Week 2: Backend Integration
**Goal**: Complete detection pipeline

- Day 1-2: Database schema and APIs
- Day 3: Detection worker setup
- Day 4: Queue processing
- Day 5: Error handling

**Deliverables**:
- Session storage working
- Detection processing items
- Results in database

### Week 3: Polish and Launch
**Goal**: Production-ready system

- Day 1: UI for collection management
- Day 2: Manual correction interface
- Day 3: Chrome Web Store submission
- Day 4: Documentation and help
- Day 5: Beta user onboarding

**Deliverables**:
- Published extension
- Complete user flow
- 10 beta users testing

## Success Criteria

### Technical Requirements
- [ ] Extension captures valid sessions
- [ ] Sessions work for 30 days
- [ ] Detection accuracy >95%
- [ ] Process 200 items in <10 minutes
- [ ] Manual corrections persist

### User Experience
- [ ] Installation takes <2 minutes
- [ ] Linking account is clear
- [ ] Detection progress visible
- [ ] Errors handled gracefully
- [ ] Help documentation complete

### Business Metrics
- [ ] 50% of users install extension
- [ ] 80% successfully capture session
- [ ] <5% need support help
- [ ] 90% detection accuracy
- [ ] 70% user satisfaction

## Risk Mitigation

### Technical Risks

**Risk**: Chrome blocks extension
- **Mitigation**: Follow all Chrome Web Store policies
- **Backup**: Distribute as unpacked extension

**Risk**: Sessions expire unexpectedly
- **Mitigation**: Validate before each use
- **Backup**: Prompt user to recapture

**Risk**: Bandcamp changes HTML
- **Mitigation**: Multiple selector fallbacks
- **Backup**: Manual format entry

### User Experience Risks

**Risk**: Users don't trust extension
- **Mitigation**: Clear privacy policy, open source
- **Backup**: Offer manual alternative

**Risk**: Installation too complex
- **Mitigation**: Video tutorial, step-by-step guide
- **Backup**: Offer setup assistance

## Cost Analysis

### Development Costs
- Extension development: 1 week = $4,000
- Backend integration: 1 week = $4,000
- Polish and launch: 1 week = $4,000
- **Total development**: $12,000

### Ongoing Costs (Monthly)
- VPS for worker: $20
- Supabase: $25
- Monitoring: Free tier
- **Total monthly**: $45

### Break-even Analysis
- At £5/month subscription
- Need 9 users to cover infrastructure
- Need 200 users to recover development in 1 year

## Future Enhancements

### Phase 2 (Month 2-3)
- Firefox extension
- Bulk operations
- Collection statistics
- Export functionality

### Phase 3 (Month 4-6)
- Safari extension
- Mobile companion app
- API for developers
- Advanced analytics

## Conclusion

This browser extension approach provides a robust, user-friendly solution for format detection that:
- **Works reliably** with current technology
- **Respects user privacy** (no password storage)
- **Scales efficiently** to 500+ users
- **Ships quickly** (3 weeks)
- **Costs minimally** ($45/month)

The extension model is proven (password managers, ad blockers) and understood by users, making adoption straightforward while maintaining complete control over data in our application.