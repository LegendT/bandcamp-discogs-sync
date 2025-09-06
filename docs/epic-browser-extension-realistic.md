# Epic: Browser Extension Format Detection - Realistic Version

## Executive Summary

A pragmatic approach to format detection using a browser extension that acknowledges real limitations and provides actual solutions.

## The Real Problem We're Solving

Chrome extensions **cannot access httpOnly cookies**, which is what Bandcamp uses for authentication. We need a different approach.

## The Actual Solution: DevTools Extension

### Why DevTools Extension Works

Regular extensions can't see httpOnly cookies, but DevTools extensions can access all network traffic, including:
- Request headers with cookies
- Response data
- Full session information

### Architecture That Actually Functions

```
┌────────────────────────────────────────────────────┐
│                 User's Browser                     │
│                                                    │
│  ┌──────────────┐    ┌────────────────────────┐  │
│  │   Bandcamp   │───▶│   DevTools Extension   │  │
│  │   Website    │    │  - Monitor network      │  │
│  │              │    │  - Capture headers      │  │
│  │              │    │  - Extract session      │  │
│  └──────────────┘    └────────────────────────┘  │
└────────────────────────────────────────────────────┘
                              │
                              ▼
                   ┌─────────────────────┐
                   │    Your Web App     │
                   │  - Store session    │
                   │  - Run detection    │
                   └─────────────────────┘
```

## Simplified Implementation

### Manifest (DevTools Extension)
```json
{
  "manifest_version": 3,
  "name": "BC-DC Sync Helper",
  "version": "0.1.0",
  "description": "Detect physical vs digital Bandcamp items",
  
  "devtools_page": "devtools.html",
  
  "permissions": [
    "storage",
    "tabs"
  ],
  
  "host_permissions": [
    "https://*.bandcamp.com/*",
    "http://localhost:3000/*",
    "https://app.bcdc-sync.com/*"
  ],
  
  "background": {
    "service_worker": "background.js"
  }
}
```

### DevTools Panel
```javascript
// devtools.js
chrome.devtools.panels.create(
  "BC-DC Sync",
  "icon.png",
  "panel.html",
  function(panel) {
    // Panel created
  }
);

// Listen to network traffic
chrome.devtools.network.onRequestFinished.addListener(
  function(request) {
    if (request.request.url.includes('bandcamp.com')) {
      // Get headers including cookies
      const cookies = request.request.headers.find(
        h => h.name.toLowerCase() === 'cookie'
      );
      
      if (cookies && cookies.value.includes('identity=')) {
        // Found session, send to background script
        chrome.runtime.sendMessage({
          type: 'session_found',
          cookies: cookies.value,
          url: request.request.url
        });
      }
    }
  }
);
```

## The Honest Alternative: Unpacked Extension

### Why Skip Chrome Web Store Initially

1. **Review takes 2-3 weeks**
2. **Often rejected for scraping-related functionality**
3. **Privacy policy requirements**
4. **100 early users can handle manual install**

### Distribution for Beta Users

```markdown
## How to Install BC-DC Sync Extension (Beta)

1. Download extension.zip from our website
2. Unzip to a folder
3. Open Chrome → Extensions → Developer Mode ON
4. Click "Load unpacked"
5. Select the folder
6. Done!
```

**This approach**:
- Ships immediately
- No review process
- Can iterate quickly
- Test with real users

## Realistic Database Schema (Simplified)

```sql
-- Just what we actually need
CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  cookie_string TEXT, -- Simple encrypted string
  valid_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE items (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  bandcamp_id VARCHAR(100),
  title TEXT,
  artist TEXT,
  url TEXT,
  
  -- Format (the whole point)
  format VARCHAR(20) DEFAULT 'unknown',
  is_physical BOOLEAN,
  
  -- Simple tracking
  checked_at TIMESTAMP,
  synced BOOLEAN DEFAULT false,
  
  UNIQUE(user_id, bandcamp_id)
);

-- That's it. No job queues, no complex encryption.
```

## Actual Detection Implementation

### Simple Worker Script
```javascript
// Just run this on a cron job
async function detectFormats() {
  // Get users with valid sessions
  const users = await db.query(`
    SELECT * FROM sessions 
    WHERE valid_until > NOW()
  `);
  
  for (const user of users) {
    // Get unchecked items
    const items = await db.query(`
      SELECT * FROM items 
      WHERE user_id = $1 
      AND format = 'unknown'
      LIMIT 20
    `, [user.user_id]);
    
    if (items.length === 0) continue;
    
    // Decrypt cookie
    const cookies = decrypt(user.cookie_string);
    
    // Launch browser
    const browser = await playwright.launch();
    const context = await browser.newContext();
    
    // Set cookies
    await context.addCookies(parseCookies(cookies));
    
    // Check each item
    for (const item of items) {
      try {
        const page = await context.newPage();
        await page.goto(item.url);
        
        // Look for ownership
        const ownership = await page.$eval(
          '.you-own-this-txt',
          el => el?.textContent
        ).catch(() => null);
        
        // Update database
        if (ownership) {
          const format = parseFormat(ownership);
          await db.query(`
            UPDATE items 
            SET format = $1, is_physical = $2, checked_at = NOW()
            WHERE id = $3
          `, [format.type, format.isPhysical, item.id]);
        }
        
        await page.close();
        await sleep(3000); // Rate limit
        
      } catch (error) {
        console.error(`Failed item ${item.id}:`, error);
      }
    }
    
    await browser.close();
  }
}

// Run every 30 minutes
setInterval(detectFormats, 30 * 60 * 1000);
```

## Real User Flow

### Option A: DevTools Extension (Power Users)
1. Install extension (unpacked)
2. Open DevTools (F12)
3. Click "BC-DC Sync" panel
4. Navigate Bandcamp normally
5. Extension captures session automatically
6. Close DevTools

### Option B: Copy Cookie (Fallback)
1. Open Bandcamp.com
2. Open DevTools → Application → Cookies
3. Find 'identity' cookie
4. Copy value
5. Paste in our app
6. We handle the rest

### Option C: Manual Classification (Always Works)
1. Import collection
2. See grid of albums
3. Click "Physical" or "Digital" buttons
4. Done in 2 minutes

## Realistic Timeline

### Week 1: Core Functionality
- Day 1: Basic extension structure
- Day 2: Cookie capture working
- Day 3: Backend storage
- Day 4: Detection script
- Day 5: Test with 5 users

### Week 2: Make It Usable
- Day 1: Improve extension UX
- Day 2: Manual classification UI
- Day 3: Progress indicators
- Day 4: Error handling
- Day 5: Test with 20 users

### Week 3: Production Ready
- Day 1: Documentation
- Day 2: Video tutorials
- Day 3: Support materials
- Day 4: Launch to 100 beta users
- Day 5: Gather feedback

*Chrome Web Store submission happens here, live in 3-4 weeks*

## Cost Reality

### Development
- 2 weeks (not 3): $8,000
- Simpler = fewer bugs

### Infrastructure
- Single VPS: $20/month
- Supabase: $25/month
- No complex queue systems

### Support
- Manual install = more support needed
- Budget 5 hours/week initially
- Create good video tutorials

## Critical Success Factors

### What Makes This Work

1. **Multiple Options**: DevTools, cookie copy, manual
2. **No Chrome Web Store dependency**: Ship immediately
3. **Simple architecture**: Less to break
4. **Clear fallbacks**: Always have manual option

### What We're NOT Doing

1. **No complex encryption schemes**
2. **No job queue systems**
3. **No real-time updates**
4. **No OAuth flows**
5. **No waiting for Chrome approval**

## Risk Mitigation

### Real Risks & Real Solutions

**Risk**: Users won't install unpacked extension
- **Solution**: Offer cookie copy method
- **Fallback**: Manual classification

**Risk**: DevTools is too technical
- **Solution**: Video walkthrough
- **Fallback**: Cookie copy method

**Risk**: Sessions expire
- **Solution**: Check validity before use
- **Fallback**: Prompt for refresh

**Risk**: Chrome blocks extension
- **Solution**: Already using unpacked
- **Fallback**: Other methods available

## The Bottom Line

This realistic approach:
- **Ships in 2 weeks**, not 3
- **Works immediately**, no store approval
- **Costs less** to build and run
- **Has fallbacks** for every failure mode
- **Actually serves users** instead of fighting technology

### The Uncomfortable Truth

The original epic was trying to build a "proper" solution that would take months and might not work. This approach:
- Acknowledges Chrome's limitations
- Provides multiple paths to success
- Ships something useful quickly
- Can improve over time

### Three Paths Based on User Type

1. **Tech-savvy** (20%): DevTools extension
2. **Intermediate** (50%): Cookie copy method
3. **Everyone** (100%): Manual classification

All three get to the same result: knowing which items are physical vs digital.

## Recommendation

1. **Build the manual classification UI first** (3 days)
   - This always works
   - Users can use it immediately
   - Gather data on formats

2. **Add cookie copy method** (2 days)
   - Simple to implement
   - Works for most users
   - No extension needed

3. **Create DevTools extension** (1 week)
   - For power users
   - Distribute as ZIP
   - Skip Chrome Web Store initially

4. **Submit to Chrome Web Store** (after validation)
   - Once you have 100 happy users
   - Have proven the concept
   - Can wait 3 weeks for approval

This way you're serving users from Day 3, not Week 4.