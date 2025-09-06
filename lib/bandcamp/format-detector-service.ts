/**
 * Server-side format detection service using Playwright
 * Runs as a background job to avoid blocking API routes
 */

import { chromium, Browser, Page } from 'playwright';
import pLimit from 'p-limit';
import { BandcampItem } from './lightweight-scraper';
import logger from '@/lib/utils/logger';

export interface FormatDetectionResult {
  id: string;
  format: 'vinyl' | 'cd' | 'cassette' | 'digital' | 'unknown';
  formatType: 'physical' | 'digital' | 'both' | 'unknown';
  includesDigital: boolean;
  ownershipText: string | null;
  error?: string;
}

export interface FormatDetectionProgress {
  total: number;
  completed: number;
  current: string;
  results: FormatDetectionResult[];
}

export class FormatDetectorService {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private isInitialized = false;
  
  /**
   * Initialize browser instance
   */
  async initialize(cookies?: string): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      this.browser = await chromium.launch({
        headless: process.env.NODE_ENV === 'production',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        viewport: { width: 1280, height: 720 }
      });
      
      this.page = await context.newPage();
      
      // Set cookies if provided
      if (cookies) {
        await this.setCookies(cookies);
      }
      
      this.isInitialized = true;
      logger.info('Format detector service initialized');
    } catch (error) {
      logger.error('Failed to initialize format detector:', error);
      throw new Error('Failed to initialize browser for format detection');
    }
  }
  
  /**
   * Set cookies for authentication
   */
  private async setCookies(cookieString: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');
    
    const cookies = cookieString.split(';').map(c => {
      const [name, value] = c.trim().split('=');
      return {
        name,
        value,
        domain: '.bandcamp.com',
        path: '/'
      };
    });
    
    await this.page.context().addCookies(cookies);
  }
  
  /**
   * Detect formats for multiple items in parallel
   */
  async detectFormatsParallel(
    items: BandcampItem[],
    options: {
      concurrency?: number;
      onProgress?: (progress: FormatDetectionProgress) => void;
      cookies?: string;
    } = {}
  ): Promise<FormatDetectionResult[]> {
    const { concurrency = 3, onProgress, cookies } = options;
    
    // Initialize if needed
    if (!this.isInitialized) {
      await this.initialize(cookies);
    }
    
    const results: FormatDetectionResult[] = [];
    const limit = pLimit(concurrency);
    
    const progress: FormatDetectionProgress = {
      total: items.length,
      completed: 0,
      current: '',
      results: []
    };
    
    // Process items in parallel with concurrency limit
    const promises = items.map((item, index) =>
      limit(async () => {
        progress.current = item.title;
        
        try {
          const result = await this.detectSingleFormat(item);
          results[index] = result;
          progress.completed++;
          progress.results = results.filter(Boolean);
          
          if (onProgress) {
            onProgress(progress);
          }
          
          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 200));
          
          return result;
        } catch (error) {
          logger.error(`Failed to detect format for ${item.title}:`, error);
          const errorResult: FormatDetectionResult = {
            id: item.id,
            format: 'unknown',
            formatType: 'unknown',
            includesDigital: false,
            ownershipText: null,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
          
          results[index] = errorResult;
          progress.completed++;
          progress.results = results.filter(Boolean);
          
          if (onProgress) {
            onProgress(progress);
          }
          
          return errorResult;
        }
      })
    );
    
    await Promise.all(promises);
    
    return results;
  }
  
  /**
   * Detect format for a single item
   */
  private async detectSingleFormat(item: BandcampItem): Promise<FormatDetectionResult> {
    if (!this.page) throw new Error('Page not initialized');
    
    try {
      // Navigate to album page
      await this.page.goto(item.albumUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      
      // Wait for ownership indicator
      await this.page.waitForTimeout(500);
      
      // Check for ownership text
      const ownershipElement = await this.page.$('.you-own-this-txt');
      const ownershipText = ownershipElement 
        ? await ownershipElement.textContent()
        : null;
      
      if (!ownershipText) {
        // Not owned or not logged in
        return {
          id: item.id,
          format: 'unknown',
          formatType: 'unknown',
          includesDigital: false,
          ownershipText: null
        };
      }
      
      // Parse ownership text
      const { format, formatType, includesDigital } = this.parseOwnershipText(ownershipText);
      
      return {
        id: item.id,
        format,
        formatType,
        includesDigital,
        ownershipText
      };
      
    } catch (error) {
      logger.error(`Error detecting format for ${item.title}:`, error);
      throw error;
    }
  }
  
  /**
   * Parse ownership text to determine format
   */
  private parseOwnershipText(text: string): {
    format: 'vinyl' | 'cd' | 'cassette' | 'digital' | 'unknown';
    formatType: 'physical' | 'digital' | 'both' | 'unknown';
    includesDigital: boolean;
  } {
    const lower = text.toLowerCase();
    
    let format: 'vinyl' | 'cd' | 'cassette' | 'digital' | 'unknown' = 'unknown';
    let includesDigital = false;
    
    // Check for physical formats
    if (lower.includes('vinyl') || lower.includes(' lp') || lower.includes('record')) {
      format = 'vinyl';
    } else if (lower.includes('compact disc') || lower.includes(' cd')) {
      format = 'cd';
    } else if (lower.includes('cassette') || lower.includes('tape')) {
      format = 'cassette';
    } else if (lower.includes('digital')) {
      format = 'digital';
      includesDigital = true;
    }
    
    // Check if digital is included with physical
    if (format !== 'digital' && lower.includes('digital')) {
      includesDigital = true;
    }
    
    // Determine format type
    let formatType: 'physical' | 'digital' | 'both' | 'unknown';
    if (format === 'digital') {
      formatType = 'digital';
    } else if (format !== 'unknown' && includesDigital) {
      formatType = 'both';
    } else if (format !== 'unknown') {
      formatType = 'physical';
    } else {
      formatType = 'unknown';
    }
    
    return { format, formatType, includesDigital };
  }
  
  /**
   * Check if user is logged in
   */
  async checkLoginStatus(): Promise<boolean> {
    if (!this.page) throw new Error('Page not initialized');
    
    try {
      await this.page.goto('https://bandcamp.com', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      
      // Check for user menu or login button
      const userMenu = await this.page.$('.usermenu');
      const loginButton = await this.page.$('a[href*="login"]');
      
      return !!userMenu && !loginButton;
    } catch (error) {
      logger.error('Failed to check login status:', error);
      return false;
    }
  }
  
  /**
   * Clean up browser instance
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.isInitialized = false;
      logger.info('Format detector service cleaned up');
    }
  }
}

/**
 * Singleton instance for reuse across requests
 */
let serviceInstance: FormatDetectorService | null = null;

export function getFormatDetectorService(): FormatDetectorService {
  if (!serviceInstance) {
    serviceInstance = new FormatDetectorService();
  }
  return serviceInstance;
}

/**
 * Clean up service on process exit
 */
if (typeof process !== 'undefined') {
  process.on('SIGINT', async () => {
    if (serviceInstance) {
      await serviceInstance.cleanup();
    }
  });
  
  process.on('SIGTERM', async () => {
    if (serviceInstance) {
      await serviceInstance.cleanup();
    }
  });
}