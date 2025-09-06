/**
 * Lightweight Bandcamp scraper using fetch instead of Playwright
 * Suitable for serverless environments
 */

import { z } from 'zod';

// Input validation schemas
const UsernameSchema = z.string()
  .min(1)
  .max(50)
  .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid username format');

export interface BandcampItem {
  id: string;
  type: 'album' | 'track' | 'package';
  bandId: string;
  bandName: string;
  title: string;
  albumUrl: string;
  artworkUrl: string;
  token?: string;
}

export interface LightweightCollectionData {
  username: string;
  items: BandcampItem[];
  scrapedAt: Date;
  hasMore: boolean;
  totalItems: number;
}

export class LightweightBandcampScraper {
  private readonly userAgent = 'Mozilla/5.0 (compatible; BC-DC-Sync/1.0)';
  private readonly baseUrl = 'https://bandcamp.com';
  
  /**
   * Scrape public collection using HTML parsing (no browser needed)
   */
  async scrapePublicCollection(
    username: string,
    options: {
      limit?: number;
      offset?: number;
      signal?: AbortSignal;
    } = {}
  ): Promise<LightweightCollectionData> {
    // Validate and sanitize username
    const validUsername = UsernameSchema.parse(username);
    
    const url = `${this.baseUrl}/${validUsername}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
        },
        signal: options.signal,
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`User "${validUsername}" not found on Bandcamp`);
        }
        throw new Error(`Failed to fetch collection: ${response.status}`);
      }
      
      const html = await response.text();
      const items = this.parseCollectionHTML(html, options.limit);
      
      return {
        username: validUsername,
        items,
        scrapedAt: new Date(),
        hasMore: items.length === (options.limit || 1000),
        totalItems: items.length,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error('Invalid username format');
      }
      throw error;
    }
  }
  
  /**
   * Parse collection items from HTML
   */
  private parseCollectionHTML(html: string, limit?: number): BandcampItem[] {
    const items: BandcampItem[] = [];
    
    // Extract collection data from embedded JSON
    const collectionDataMatch = html.match(/var CollectionData = ({.*?});/s);
    if (collectionDataMatch) {
      try {
        const data = JSON.parse(collectionDataMatch[1]);
        if (data.item_cache) {
          Object.values(data.item_cache).forEach((item: any) => {
            items.push(this.parseItemData(item));
          });
        }
      } catch (e) {
        console.warn('Failed to parse CollectionData JSON, falling back to HTML parsing');
      }
    }
    
    // Fallback: Parse HTML directly using regex (no DOM needed)
    if (items.length === 0) {
      const itemRegex = /data-itemid="(\d+)"[^>]*data-itemtype="([^"]+)"[^>]*data-bandid="(\d+)"[^>]*data-title="([^"]+)"/g;
      let match;
      
      while ((match = itemRegex.exec(html)) !== null && items.length < (limit || 1000)) {
        items.push({
          id: match[1],
          type: match[2] as 'album' | 'track' | 'package',
          bandId: match[3],
          bandName: '', // Will be filled from other data
          title: this.decodeHTMLEntities(match[4]),
          albumUrl: '',
          artworkUrl: '',
        });
      }
      
      // Extract artwork URLs
      const artRegex = /collection-item-art[^>]*src="([^"]+)"/g;
      let artMatch;
      let artIndex = 0;
      
      while ((artMatch = artRegex.exec(html)) !== null && artIndex < items.length) {
        items[artIndex].artworkUrl = artMatch[1];
        artIndex++;
      }
    }
    
    return items.slice(0, limit);
  }
  
  /**
   * Parse individual item data
   */
  private parseItemData(item: any): BandcampItem {
    return {
      id: String(item.item_id || item.id || ''),
      type: item.item_type || 'album',
      bandId: String(item.band_id || ''),
      bandName: item.band_name || item.artist || '',
      title: item.item_title || item.title || '',
      albumUrl: item.item_url || '',
      artworkUrl: item.item_art_url || item.art_url || '',
      token: item.token,
    };
  }
  
  /**
   * Decode HTML entities
   */
  private decodeHTMLEntities(text: string): string {
    const entities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&#x27;': "'",
      '&#x2F;': '/',
    };
    
    return text.replace(/&[#\w]+;/g, (entity) => entities[entity] || entity);
  }
  
  /**
   * Check ownership on a single album page (lightweight version)
   * NOTE: This will only work if cookies are provided
   */
  async checkOwnership(
    albumUrl: string,
    cookies?: string
  ): Promise<{
    owned: boolean;
    format?: string;
    ownershipText?: string;
  }> {
    try {
      const response = await fetch(albumUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Cookie': cookies || '',
        },
      });
      
      if (!response.ok) {
        return { owned: false };
      }
      
      const html = await response.text();
      
      // Look for ownership indicators in the HTML
      const ownershipMatch = html.match(/you-own-this[^>]*>([^<]+)</i);
      if (!ownershipMatch) {
        return { owned: false };
      }
      
      const ownershipText = this.decodeHTMLEntities(ownershipMatch[1]);
      const format = this.detectFormatFromText(ownershipText);
      
      return {
        owned: true,
        format,
        ownershipText,
      };
    } catch (error) {
      console.error('Error checking ownership:', error);
      return { owned: false };
    }
  }
  
  /**
   * Detect format from ownership text
   */
  private detectFormatFromText(text: string): string {
    const lower = text.toLowerCase();
    
    if (lower.includes('vinyl') || lower.includes('lp')) return 'vinyl';
    if (lower.includes('compact disc') || lower.includes(' cd')) return 'cd';
    if (lower.includes('cassette') || lower.includes('tape')) return 'cassette';
    if (lower.includes('digital')) return 'digital';
    
    return 'unknown';
  }
}

/**
 * Cache manager for Bandcamp data
 */
export class BandcampCacheManager {
  private static readonly CACHE_PREFIX = 'bc-cache-';
  private static readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour
  
  /**
   * Get cached collection
   */
  static getCachedCollection(username: string): LightweightCollectionData | null {
    if (typeof window === 'undefined') return null;
    
    try {
      const key = `${this.CACHE_PREFIX}${username}`;
      const cached = localStorage.getItem(key);
      
      if (!cached) return null;
      
      const data = JSON.parse(cached);
      const age = Date.now() - new Date(data.scrapedAt).getTime();
      
      if (age > this.CACHE_TTL) {
        localStorage.removeItem(key);
        return null;
      }
      
      return data;
    } catch {
      return null;
    }
  }
  
  /**
   * Save collection to cache
   */
  static cacheCollection(username: string, data: LightweightCollectionData): void {
    if (typeof window === 'undefined') return;
    
    try {
      const key = `${this.CACHE_PREFIX}${username}`;
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      // Handle quota exceeded
      this.clearOldestCache();
      try {
        const key = `${this.CACHE_PREFIX}${username}`;
        localStorage.setItem(key, JSON.stringify(data));
      } catch {
        console.warn('Failed to cache collection data');
      }
    }
  }
  
  /**
   * Clear oldest cache entries
   */
  private static clearOldestCache(): void {
    const cacheEntries: Array<{ key: string; age: number }> = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.CACHE_PREFIX)) {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          const age = Date.now() - new Date(data.scrapedAt).getTime();
          cacheEntries.push({ key, age });
        } catch {
          // Remove corrupted entries
          localStorage.removeItem(key!);
        }
      }
    }
    
    // Remove oldest 25%
    cacheEntries
      .sort((a, b) => b.age - a.age)
      .slice(0, Math.ceil(cacheEntries.length * 0.25))
      .forEach(entry => localStorage.removeItem(entry.key));
  }
}