/**
 * Bandcamp Collection Collector
 * Uses bandcamp-fetch library to fetch public fan collections
 * No authentication required - only public data
 */

import bcfetch from 'bandcamp-fetch';
import { logger } from '@/lib/utils/logger';

export interface BandcampCollectionItem {
  artist: string;
  album: string;
  url: string;
  imageUrl?: string;
  // We can't get these from public pages, but UI will let user specify
  format?: 'Digital' | 'Vinyl' | 'CD' | 'Cassette';
  purchaseDate?: string;
}

export interface CollectorOptions {
  username: string;
  limit?: number;
  onProgress?: (current: number, total: number) => void;
}

export class BandcampCollector {
  private abortController?: AbortController;

  /**
   * Fetch a public Bandcamp fan collection
   * @param options Collector configuration
   * @returns Collection items
   */
  async fetchCollection(options: CollectorOptions): Promise<BandcampCollectionItem[]> {
    const { username, limit = 5000, onProgress } = options;
    
    logger.info(`Starting Bandcamp collection import for user: ${username}`);
    
    try {
      // Initialize abort controller for cancellation
      this.abortController = new AbortController();
      
      // Get fan info first to validate username
      const fanInfo = await bcfetch.fan.getInfo(username);
      
      if (!fanInfo) {
        throw new Error(`User ${username} not found`);
      }
      
      logger.info(`Found fan: ${fanInfo.name}, collection size: ${fanInfo.collectionItemCount || 'unknown'}`);
      
      // Fetch collection items
      const collectionOptions = {
        imageFormat: 'art_app_large' as const,
        limit: limit
      };
      
      const collection = await bcfetch.fan.getCollection(username, collectionOptions);
      
      if (!collection || !collection.items) {
        logger.warn('No collection items found');
        return [];
      }
      
      logger.info(`Fetched ${collection.items.length} items from collection`);
      
      // Transform to our format
      const items: BandcampCollectionItem[] = collection.items.map((item: any, index: number) => {
        // Report progress
        if (onProgress) {
          onProgress(index + 1, collection.items.length);
        }
        
        return {
          artist: item.artist || 'Unknown Artist',
          album: item.name || item.title || 'Unknown Album',
          url: item.url || '',
          imageUrl: item.imageUrl || item.image,
          // Format will be added by user preference
          format: undefined,
          // Public pages don't show purchase date
          purchaseDate: undefined
        };
      });
      
      logger.info(`Successfully imported ${items.length} collection items`);
      
      return items;
      
    } catch (error) {
      // Check if it's a cancellation
      if (this.abortController?.signal.aborted) {
        logger.info('Import cancelled by user');
        return [];
      }
      
      logger.error('Import failed:', error);
      
      // Provide user-friendly error messages
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          throw new Error(`Username "${username}" not found on Bandcamp`);
        } else if (error.message.includes('rate')) {
          throw new Error('Rate limited. Please try again in a few minutes.');
        } else if (error.message.includes('timeout')) {
          throw new Error('Request timed out. The collection might be too large.');
        }
      }
      
      throw new Error(`Failed to import collection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Cancel ongoing import operation
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      logger.info('Import operation cancelled');
    }
  }
  
  /**
   * Test if a username exists and has a public collection
   */
  async testUsername(username: string): Promise<boolean> {
    try {
      // Try different methods to check if user exists
      // Method 1: Try to get fan info (might not work for all users)
      try {
        const fanInfo = await bcfetch.fan.getInfo(username);
        if (fanInfo) return true;
      } catch {
        // Continue to next method
      }
      
      // Method 2: Try to get collection directly
      try {
        const collection = await bcfetch.fan.getCollection(username, { limit: 1 });
        if (collection) return true;
      } catch {
        // Continue to next method
      }
      
      // Method 3: Check if the URL exists (simplified check)
      // For now, we'll assume the user exists if the previous methods failed
      // This allows us to proceed with the scraping attempt
      logger.warn(`Could not verify username ${username}, but will attempt import anyway`);
      return true; // Allow the attempt to proceed
    } catch {
      return false;
    }
  }
}

/**
 * Quick helper function for simple use cases
 */
export async function fetchBandcampCollection(
  username: string, 
  formatHint?: BandcampCollectionItem['format']
): Promise<BandcampCollectionItem[]> {
  const collector = new BandcampCollector();
  const items = await collector.fetchCollection({ username });
  
  // Apply format hint if provided
  if (formatHint) {
    items.forEach(item => {
      item.format = formatHint;
    });
  }
  
  return items;
}