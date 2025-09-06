# Authentication Approaches for Bandcamp Session Capture

## The Core Challenge
We need to capture authenticated Bandcamp sessions to detect "You Own This" text on album pages. Here are the actual viable approaches:

## Approach 1: Browser Extension (Most Realistic)

### How It Works
```
1. User installs our Chrome/Firefox extension
2. User logs into Bandcamp normally in their browser
3. Extension captures session cookies
4. Extension sends encrypted session to our backend
5. Backend uses session for detection
```

### Implementation
```javascript
// Chrome Extension - content script
chrome.cookies.getAll({domain: ".bandcamp.com"}, function(cookies) {
  // Send to our backend
  fetch('https://api.bcdc-sync.com/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      cookies: cookies,
      timestamp: Date.now()
    })
  })
})
```

### Pros
- User logs in normally in their own browser
- No password handling by us
- Works with 2FA, CAPTCHAs
- Sessions last as long as user's normal sessions
- Can auto-refresh when user browses Bandcamp

### Cons
- Requires extension installation
- Need to publish to Chrome/Firefox stores
- Some users distrust extensions
- Mobile users can't use it

### Cost
- Development: 2 weeks
- Infrastructure: Standard backend only ($40/month)
- Maintenance: Low

## Approach 2: OAuth-Style Flow with Proxy (Creative Solution)

### How It Works
```
1. We provide a "Connect Bandcamp" button
2. Opens our proxy page with embedded iframe
3. User logs into Bandcamp in our controlled iframe
4. We capture session via proxy
5. Store encrypted session
```

### Implementation
```javascript
// Frontend
function connectBandcamp() {
  const popup = window.open(
    'https://app.bcdc-sync.com/auth/bandcamp',
    'BandcampAuth',
    'width=600,height=700'
  )
  
  window.addEventListener('message', (event) => {
    if (event.data.type === 'bandcamp_session_captured') {
      popup.close()
      startFormatDetection()
    }
  })
}

// Backend proxy (Next.js API route)
export default async function handler(req, res) {
  // Proxy Bandcamp login page
  const response = await fetch('https://bandcamp.com/login', {
    headers: req.headers
  })
  
  // Inject our session capture script
  let html = await response.text()
  html = html.replace('</body>', `
    <script>
      // Detect successful login
      if (document.querySelector('.user-menu')) {
        fetch('/api/capture-session', {
          method: 'POST',
          credentials: 'include'
        })
      }
    </script>
    </body>
  `)
  
  res.send(html)
}
```

### Pros
- No extension needed
- Works on all platforms
- Familiar OAuth-like flow
- We control the experience

### Cons
- Complex proxy setup
- Potential CORS issues
- Bandcamp might block proxy IPs
- Sessions tied to our IP, not user's

### Cost
- Development: 3 weeks
- Infrastructure: Proxy server ($60/month)
- Maintenance: Medium

## Approach 3: Desktop App with WebView (Most Reliable)

### How It Works
```
1. User downloads our Electron app
2. App shows Bandcamp login in WebView
3. App captures cookies from WebView
4. Sends to our backend
5. Can run detection locally or remotely
```

### Implementation
```javascript
// Electron main process
const { BrowserWindow, session } = require('electron')

async function captureBandcampSession() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })
  
  win.loadURL('https://bandcamp.com/login')
  
  // Wait for login
  win.webContents.on('did-navigate', async (event, url) => {
    if (url.includes('bandcamp.com') && !url.includes('login')) {
      // Login successful, get cookies
      const cookies = await session.defaultSession.cookies.get({
        domain: '.bandcamp.com'
      })
      
      // Send to backend
      await sendSessionToBackend(cookies)
      
      win.close()
    }
  })
}
```

### Pros
- Full control over browser environment
- Can run detection locally (no server costs)
- Works with all auth methods
- Most reliable session capture
- Could work offline

### Cons
- Requires app download
- Need to build for Mac/Windows/Linux
- Code signing certificates needed ($200/year)
- Larger development effort

### Cost
- Development: 4 weeks
- Infrastructure: Minimal if local ($20/month)
- Maintenance: High (OS updates)

## Approach 4: Mobile App with WebView (Future-Proof)

### How It Works
```
1. User downloads iOS/Android app
2. WebView for Bandcamp login
3. Capture session from WebView
4. Process locally or sync to backend
```

### Implementation
```swift
// iOS Swift example
import WebKit

class BandcampAuthViewController: UIViewController {
    @IBOutlet weak var webView: WKWebView!
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        // Load Bandcamp login
        let url = URL(string: "https://bandcamp.com/login")!
        webView.load(URLRequest(url: url))
        
        // Capture cookies after login
        webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { cookies in
            let bandcampCookies = cookies.filter { $0.domain.contains("bandcamp.com") }
            self.sendToBackend(cookies: bandcampCookies)
        }
    }
}
```

### Pros
- Massive mobile user base
- Native experience
- Can work offline
- Push notifications for completion

### Cons
- Need iOS and Android versions
- App store approval process
- $99/year Apple developer account
- Longest development time

### Cost
- Development: 6-8 weeks
- Infrastructure: Backend API ($40/month)
- Maintenance: High

## Approach 5: Hybrid - Password Vault Style (Controversial but Effective)

### How It Works
```
1. User provides Bandcamp username/password (encrypted)
2. We log in programmatically with Playwright
3. Handle 2FA via email/SMS forwarding
4. Maintain session on our servers
5. Run detection on demand
```

### Implementation
```javascript
// This is what users understand
async function connectBandcamp(username, password) {
  // Encrypt immediately
  const encrypted = await encryptCredentials(username, password)
  
  // Store encrypted (never plain text)
  await storeInVault(userId, encrypted)
  
  // Create session
  const browser = await playwright.launch()
  const page = await browser.newPage()
  
  await page.goto('https://bandcamp.com/login')
  await page.fill('#username', username)
  await page.fill('#password', password)
  await page.click('button[type="submit"]')
  
  // Handle 2FA if needed
  if (await page.isVisible('.two-factor-input')) {
    // Send notification to user
    const code = await requestTwoFactorCode(userId)
    await page.fill('.two-factor-input', code)
    await page.click('button[type="submit"]')
  }
  
  // Save session
  const cookies = await page.context().cookies()
  await saveSession(userId, cookies)
  
  await browser.close()
}
```

### Pros
- Simplest UX (username/password)
- We control everything
- Can auto-refresh sessions
- Works for all users

### Cons
- Trust issues (handling passwords)
- Security liability
- Complex 2FA handling
- Against Bandcamp ToS

### Cost
- Development: 3 weeks
- Infrastructure: Secure vault + workers ($100/month)
- Maintenance: High (security updates)
- Legal: Potential liability

## Recommendation: Start with Browser Extension

### Why Extension First:
1. **Fastest to build** (2 weeks)
2. **Lowest infrastructure cost** ($40/month)
3. **Most secure** (we never see passwords)
4. **Best user experience** for power users
5. **Proven pattern** (1Password, LastPass, etc.)

### Migration Path:
```
Phase 1: Browser Extension (Weeks 1-2)
- Chrome extension for 100 power users
- Prove the detection works
- Gather feedback

Phase 2: Desktop App (Weeks 3-6)
- Electron app for broader audience
- Include users without Chrome
- Add local processing option

Phase 3: Mobile App (Weeks 7-12)
- iOS/Android apps
- Reach mobile-only users
- Complete market coverage
```

## The Reality Check

### What Actually Matters:
- **100 users**: Extension is enough
- **500 users**: Need desktop app
- **1000+ users**: Need mobile solution

### Cost Comparison for 100 Users:
| Approach | Dev Time | Monthly Cost | Break-even Users |
|----------|----------|--------------|------------------|
| Extension | 2 weeks | $40 | 8 users |
| Proxy | 3 weeks | $60 | 12 users |
| Desktop | 4 weeks | $20 | 4 users |
| Mobile | 8 weeks | $40 | 8 users |
| Password | 3 weeks | $100 | 20 users |

## The Bottom Line

**For Option 2 to work**, you need:
1. A way to capture authenticated sessions
2. Infrastructure to run Playwright
3. User trust in your solution

**Browser extension** is the fastest path to market. It's not perfect, but it:
- Works today
- Costs the least
- Provides real value
- Can evolve into other approaches

Start there, learn what users actually want, then build the next solution based on real feedback rather than assumptions.