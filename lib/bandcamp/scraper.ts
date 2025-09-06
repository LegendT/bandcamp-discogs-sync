import { chromium, Browser, Page } from 'playwright';

export interface BandcampItem {
  id: string;
  type: 'album' | 'track' | 'package';
  bandId: string;
  bandName?: string;
  title: string;
  albumUrl?: string;
  artworkUrl?: string;
  itemUrl?: string;
}

export interface ProcessedItem extends BandcampItem {
  format?: 'vinyl' | 'cd' | 'cassette' | 'digital' | 'unknown';
  formatType?: 'physical' | 'digital' | 'both' | 'unknown';
  includesDigital?: boolean;
  owned?: boolean;
  ownershipText?: string;
  syncedToDiscogs?: boolean;
  discogsReleaseId?: string;
}

export interface CollectionData {
  username: string;
  items: ProcessedItem[];
  scrapedAt: Date;
  formatDetectionComplete: boolean;
}

export class BandcampScraper {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async initialize() {
    this.browser = await chromium.launch({ 
      headless: process.env.NODE_ENV === 'production' 
    });
    this.page = await this.browser.newPage();
  }

  async cleanup() {
    if (this.page) await this.page.close();
    if (this.browser) await this.browser.close();
  }

  /**
   * Scrape public collection from bandcamp.com/username
   */
  async scrapePublicCollection(username: string): Promise<BandcampItem[]> {
    if (!this.page) throw new Error('Scraper not initialized');
    
    const url = `https://bandcamp.com/${username}`;
    await this.page.goto(url, { waitUntil: 'networkidle' });
    
    // Wait for collection items to load
    await this.page.waitForSelector('.collection-item-container', { timeout: 10000 });
    
    // Extract all collection items
    const items = await this.page.evaluate(() => {
      const containers = Array.from(document.querySelectorAll('.collection-item-container'));
      
      return containers.map(container => {
        const id = container.getAttribute('data-itemid') || '';
        const type = container.getAttribute('data-itemtype') as 'album' | 'track' | 'package' || 'album';
        const bandId = container.getAttribute('data-bandid') || '';
        const title = container.getAttribute('data-title') || '';
        
        // Get artwork URL
        const img = container.querySelector('.collection-item-art') as HTMLImageElement;
        const artworkUrl = img?.src || '';
        
        // Get band name from the item details
        const bandNameEl = container.querySelector('.collection-item-artist');
        const bandName = bandNameEl?.textContent?.trim() || '';
        
        // Try to get the album URL from the link
        const linkEl = container.querySelector('a.item-link') as HTMLAnchorElement;
        const itemUrl = linkEl?.href || '';
        
        return {
          id,
          type,
          bandId,
          bandName,
          title,
          artworkUrl,
          itemUrl
        };
      });
    });
    
    return items;
  }

  /**
   * Check if user is logged in by looking for account menu
   */
  async checkLoginStatus(): Promise<boolean> {
    if (!this.page) throw new Error('Scraper not initialized');
    
    try {
      // Check for user menu which only appears when logged in
      await this.page.waitForSelector('.usermenu', { timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Visit each album page to detect ownership and format
   * Requires being logged in as the collection owner
   */
  async detectFormats(items: BandcampItem[]): Promise<ProcessedItem[]> {
    if (!this.page) throw new Error('Scraper not initialized');
    
    const processedItems: ProcessedItem[] = [];
    
    for (const item of items) {
      if (!item.itemUrl) {
        processedItems.push({
          ...item,
          format: 'unknown',
          formatType: 'unknown',
          owned: false
        });
        continue;
      }
      
      try {
        await this.page.goto(item.itemUrl, { waitUntil: 'networkidle' });
        
        // Look for ownership indicators
        const ownershipData = await this.page.evaluate(() => {
          // Check for "you own this" section
          const ownershipEl = document.querySelector('.buyItem.ownership');
          
          if (!ownershipEl) {
            return { owned: false, text: null };
          }
          
          // Get the ownership text
          const text = ownershipEl.textContent || '';
          
          // Also check for format in the purchase info
          const purchaseInfo = document.querySelector('.purchaseInfo');
          const purchaseText = purchaseInfo?.textContent || '';
          
          return {
            owned: true,
            text: text + ' ' + purchaseText
          };
        });
        
        const format = this.parseOwnershipText(ownershipData.text);
        
        processedItems.push({
          ...item,
          ...format,
          owned: ownershipData.owned,
          ownershipText: ownershipData.text || undefined
        });
        
        // Add small delay to avoid rate limiting
        await this.page.waitForTimeout(500);
        
      } catch (error) {
        console.error(`Error processing item ${item.id}:`, error);
        processedItems.push({
          ...item,
          format: 'unknown',
          formatType: 'unknown',
          owned: false
        });
      }
    }
    
    return processedItems;
  }

  /**
   * Parse ownership text to determine format
   */
  private parseOwnershipText(text: string | null): {
    format: 'vinyl' | 'cd' | 'cassette' | 'digital' | 'unknown';
    formatType: 'physical' | 'digital' | 'both' | 'unknown';
    includesDigital?: boolean;
  } {
    if (!text) {
      return { format: 'unknown', formatType: 'unknown' };
    }
    
    const lower = text.toLowerCase();
    
    // Check for physical formats
    if (lower.includes('vinyl') || lower.includes('lp') || lower.includes('record')) {
      const includesDigital = lower.includes('+') || lower.includes('digital');
      return {
        format: 'vinyl',
        formatType: includesDigital ? 'both' : 'physical',
        includesDigital
      };
    }
    
    if (lower.includes('compact disc') || lower.includes(' cd ') || lower.includes('cd)')) {
      const includesDigital = lower.includes('+') || lower.includes('digital');
      return {
        format: 'cd',
        formatType: includesDigital ? 'both' : 'physical',
        includesDigital
      };
    }
    
    if (lower.includes('cassette') || lower.includes('tape')) {
      const includesDigital = lower.includes('+') || lower.includes('digital');
      return {
        format: 'cassette',
        formatType: includesDigital ? 'both' : 'physical',
        includesDigital
      };
    }
    
    // Check for digital only
    if (lower.includes('digital') || lower.includes('download') || lower.includes('streaming')) {
      return {
        format: 'digital',
        formatType: 'digital',
        includesDigital: true
      };
    }
    
    // Unknown format
    return { format: 'unknown', formatType: 'unknown' };
  }

  /**
   * Complete flow: scrape collection and detect formats
   */
  async scrapeCompleteCollection(username: string, detectFormats = false): Promise<CollectionData> {
    await this.initialize();
    
    try {
      // Step 1: Get public collection
      console.log(`Scraping collection for ${username}...`);
      const items = await this.scrapePublicCollection(username);
      console.log(`Found ${items.length} items`);
      
      let processedItems: ProcessedItem[];
      let formatDetectionComplete = false;
      
      if (detectFormats) {
        // Step 2: Check login status
        const isLoggedIn = await this.checkLoginStatus();
        
        if (!isLoggedIn) {
          console.warn('Not logged in - cannot detect formats. Items will be marked as unknown.');
          processedItems = items.map(item => ({
            ...item,
            format: 'unknown',
            formatType: 'unknown',
            owned: false
          }));
        } else {
          // Step 3: Detect formats for each item
          console.log('Detecting formats (this may take a while)...');
          processedItems = await this.detectFormats(items);
          formatDetectionComplete = true;
        }
      } else {
        // Skip format detection
        processedItems = items.map(item => ({
          ...item,
          format: 'unknown',
          formatType: 'unknown'
        }));
      }
      
      return {
        username,
        items: processedItems,
        scrapedAt: new Date(),
        formatDetectionComplete
      };
      
    } finally {
      await this.cleanup();
    }
  }
}