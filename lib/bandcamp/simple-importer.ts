/**
 * Simple Bandcamp importer that works with public HTML pages
 * Fallback when bandcamp-fetch library fails
 */

import { logger } from '@/lib/utils/logger';

export interface SimpleCollectionItem {
  artist: string;
  album: string;
  url: string;
  imageUrl?: string;
  format?: 'Digital' | 'Vinyl' | 'CD' | 'Cassette';
}

export class SimpleBandcampImporter {
  /**
   * Fetch collection from public Bandcamp page with pagination support
   */
  async fetchCollection(username: string, formatHint?: string): Promise<SimpleCollectionItem[]> {
    logger.info(`Simple importer: Fetching collection for ${username}`);
    
    try {
      // Fetch the public collection page
      const url = `https://bandcamp.com/${username}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch collection page: ${response.status}`);
      }
      
      const html = await response.text();
      
      // Parse initial collection items and metadata from HTML
      const { items: initialItems, fanId, lastToken, totalCount } = this.parseInitialData(html);
      
      // If we have all items already, return them
      if (initialItems.length >= totalCount || !fanId || !lastToken) {
        logger.info(`Simple importer: Found all ${initialItems.length} items from initial page`);
        
        // Apply format hint if provided
        if (formatHint) {
          initialItems.forEach(item => {
            item.format = formatHint as any;
          });
        }
        
        return initialItems;
      }
      
      // Load additional items via pagination
      logger.info(`Simple importer: Loading additional items (${initialItems.length}/${totalCount}`);
      const allItems = [...initialItems];
      let currentToken = lastToken;
      
      while (allItems.length < totalCount && currentToken) {
        const moreItems = await this.loadMoreItems(fanId, currentToken);
        
        if (!moreItems || moreItems.items.length === 0) {
          break;
        }
        
        allItems.push(...moreItems.items);
        currentToken = moreItems.lastToken;
        
        logger.info(`Simple importer: Loaded ${allItems.length}/${totalCount} items`);
        
        // Safety limit to prevent infinite loops
        if (allItems.length > 5000) {
          logger.warn('Simple importer: Reached safety limit of 5000 items');
          break;
        }
      }
      
      // Apply format hint if provided
      if (formatHint) {
        allItems.forEach(item => {
          item.format = formatHint as any;
        });
      }
      
      logger.info(`Simple importer: Found ${allItems.length} items total`);
      
      return allItems;
    } catch (error) {
      logger.error('Simple importer failed:', error);
      throw new Error(`Failed to fetch collection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Parse initial data including items and pagination metadata
   */
  private parseInitialData(html: string): { 
    items: SimpleCollectionItem[]; 
    fanId?: number; 
    lastToken?: string;
    totalCount: number;
  } {
    const items: SimpleCollectionItem[] = [];
    let fanId: number | undefined;
    let lastToken: string | undefined;
    let totalCount = 0;
    
    try {
      // Look for collection data in the page
      const dataMatch = html.match(/id="pagedata"[^>]*data-blob="([^"]+)"/);
      
      if (dataMatch) {
        const encodedData = dataMatch[1];
        const decodedData = encodedData.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        const data = JSON.parse(decodedData);
        
        // Extract fan ID for pagination
        if (data.fan_data?.fan_id) {
          fanId = data.fan_data.fan_id;
        }
        
        // Extract pagination token
        if (data.collection_data?.last_token) {
          lastToken = data.collection_data.last_token;
        }
        
        // Extract total item count
        if (data.collection_data?.item_count) {
          totalCount = data.collection_data.item_count;
        }
        
        // Extract collection items from item_cache
        if (data.item_cache?.collection) {
          Object.values(data.item_cache.collection).forEach((item: any) => {
            const albumTitle = item.album_title || item.title || item.item_title || 'Unknown Album';
            const bandName = item.band_name || item.artist || item.band;
            
            if (bandName) {
              items.push({
                artist: bandName,
                album: albumTitle,
                url: item.item_url || item.url || '',
                imageUrl: item.item_art_url || (item.item_art_id ? `https://f4.bcbits.com/img/a${item.item_art_id}_2.jpg` : undefined)
              });
            }
          });
        }
      }
    } catch (error) {
      logger.error('Error parsing initial data:', error);
    }
    
    return { items, fanId, lastToken, totalCount };
  }
  
  /**
   * Load more items using Bandcamp's pagination API
   */
  private async loadMoreItems(fanId: number, olderThanToken: string): Promise<{ 
    items: SimpleCollectionItem[]; 
    lastToken?: string;
  } | null> {
    try {
      const response = await fetch('https://bandcamp.com/api/fancollection/1/collection_items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fan_id: fanId,
          older_than_token: olderThanToken
        })
      });
      
      if (!response.ok) {
        logger.warn(`Failed to load more items: ${response.status}`);
        return null;
      }
      
      const data = await response.json();
      const items: SimpleCollectionItem[] = [];
      
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          const albumTitle = item.album_title || item.item_title || 'Unknown Album';
          const bandName = item.band_name || item.artist || 'Unknown Artist';
          
          items.push({
            artist: bandName,
            album: albumTitle,
            url: item.item_url || '',
            imageUrl: item.item_art_url || item.item_art?.url || undefined
          });
        });
      }
      
      // Get the last item's token for next pagination
      let lastToken: string | undefined;
      if (data.items && data.items.length > 0) {
        const lastItem = data.items[data.items.length - 1];
        if (lastItem.token) {
          lastToken = lastItem.token;
        }
      }
      
      return { items, lastToken };
    } catch (error) {
      logger.error('Error loading more items:', error);
      return null;
    }
  }
  
  /**
   * Parse collection items from HTML (legacy method kept for reference)
   */
  private parseCollectionFromHTML(html: string): SimpleCollectionItem[] {
    const items: SimpleCollectionItem[] = [];
    
    try {
      // Look for collection data in the page
      // Bandcamp embeds collection data as JSON in the page
      const dataMatch = html.match(/id="pagedata"[^>]*data-blob="([^"]+)"/);
      
      if (dataMatch) {
        const encodedData = dataMatch[1];
        const decodedData = encodedData.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        const data = JSON.parse(decodedData);
        
        // Extract collection items from item_cache
        if (data && data.item_cache && data.item_cache.collection) {
          Object.values(data.item_cache.collection).forEach((item: any) => {
            // Handle different item structures - album_title might be missing for singles/tracks
            const albumTitle = item.album_title || item.title || item.item_title || 'Unknown Album';
            const bandName = item.band_name || item.artist || item.band;
            
            // Log to debug what fields are available
            if (!item.album_title && item.title) {
              logger.info(`Using title field for item: ${item.title}`);
            }
            
            if (bandName) {  // Only require band name, album can be unknown
              items.push({
                artist: bandName,
                album: albumTitle,
                url: item.item_url || item.url || '',
                imageUrl: item.item_art_url || (item.item_art_id ? `https://f4.bcbits.com/img/a${item.item_art_id}_2.jpg` : undefined)
              });
            }
          });
        }
        
      }
      
      // Fallback: Try to parse collection items from HTML structure
      if (items.length === 0) {
        // Look for collection-item-container elements
        const collectionItemRegex = /<li[^>]+class="collection-item-container"[^>]*>([\s\S]*?)<\/li>/g;
        let match;
        
        while ((match = collectionItemRegex.exec(html)) !== null) {
          const itemHtml = match[1];
          
          // Extract album title
          const titleMatch = itemHtml.match(/class="collection-item-title"[^>]*>([^<]+)</);
          const artistMatch = itemHtml.match(/class="collection-item-artist"[^>]*>by\s*([^<]+)</);
          const urlMatch = itemHtml.match(/href="([^"]+)"/);
          
          if (titleMatch && artistMatch) {
            items.push({
              artist: artistMatch[1].trim(),
              album: titleMatch[1].trim(),
              url: urlMatch ? urlMatch[1] : '',
              imageUrl: undefined
            });
          }
        }
      }
      
      // Another fallback: Look for collection grid items
      if (items.length === 0) {
        const gridItemRegex = /<a[^>]+class="[^"]*collection-item-link[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
        let match;
        
        while ((match = gridItemRegex.exec(html)) !== null) {
          const itemHtml = match[1];
          const urlMatch = match[0].match(/href="([^"]+)"/);
          
          // Try to extract title from various possible locations
          const titleMatch = itemHtml.match(/title="([^"]+)"|alt="([^"]+)"/);
          
          if (titleMatch) {
            const fullTitle = titleMatch[1] || titleMatch[2];
            // Try to split into artist and album
            const parts = fullTitle.split(' - ');
            
            if (parts.length >= 2) {
              items.push({
                artist: parts[0].trim(),
                album: parts.slice(1).join(' - ').trim(),
                url: urlMatch ? urlMatch[1] : '',
                imageUrl: undefined
              });
            }
          }
        }
      }
      
    } catch (error) {
      logger.error('Error parsing HTML:', error);
    }
    
    return items;
  }
}

/**
 * Simple helper function
 */
export async function simpleImportCollection(username: string, formatHint?: string): Promise<SimpleCollectionItem[]> {
  const importer = new SimpleBandcampImporter();
  return importer.fetchCollection(username, formatHint);
}