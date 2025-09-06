import { ProcessedItem, CollectionData } from './scraper';

export interface SyncRecord {
  itemId: string;
  discogsReleaseId: string;
  syncedAt: Date;
  syncStatus: 'success' | 'failed' | 'pending';
  errorMessage?: string;
}

export interface StorageOptions {
  persist: boolean;
  storage: 'session' | 'local' | 'memory';
}

/**
 * Manages Bandcamp collection data and sync tracking
 * Supports session, local, and in-memory storage
 */
export class BandcampCollectionStore {
  private memoryCache = new Map<string, CollectionData>();
  private syncRecords = new Map<string, SyncRecord>();
  private options: StorageOptions;

  constructor(options: StorageOptions = { persist: false, storage: 'session' }) {
    this.options = options;
    this.loadSyncRecords();
  }

  /**
   * Save collection data
   */
  async saveCollection(username: string, data: CollectionData): Promise<void> {
    // Always save to memory cache
    this.memoryCache.set(username, data);
    
    // Persist based on options
    const storageKey = `bc-collection-${username}`;
    const serialized = JSON.stringify(data);
    
    switch (this.options.storage) {
      case 'session':
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(storageKey, serialized);
        }
        break;
      case 'local':
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(storageKey, serialized);
        }
        break;
      case 'memory':
        // Already saved to memory cache
        break;
    }
  }

  /**
   * Load collection data
   */
  async loadCollection(username: string): Promise<CollectionData | null> {
    // Check memory cache first
    if (this.memoryCache.has(username)) {
      return this.memoryCache.get(username)!;
    }
    
    // Try to load from storage
    const storageKey = `bc-collection-${username}`;
    let serialized: string | null = null;
    
    switch (this.options.storage) {
      case 'session':
        if (typeof sessionStorage !== 'undefined') {
          serialized = sessionStorage.getItem(storageKey);
        }
        break;
      case 'local':
        if (typeof localStorage !== 'undefined') {
          serialized = localStorage.getItem(storageKey);
        }
        break;
    }
    
    if (serialized) {
      try {
        const data = JSON.parse(serialized);
        // Convert date strings back to Date objects
        data.scrapedAt = new Date(data.scrapedAt);
        this.memoryCache.set(username, data);
        return data;
      } catch (error) {
        console.error('Error parsing stored collection:', error);
      }
    }
    
    return null;
  }

  /**
   * Update a single item's format
   */
  async updateItemFormat(
    username: string, 
    itemId: string, 
    format: ProcessedItem['format'],
    formatType: ProcessedItem['formatType']
  ): Promise<void> {
    const collection = await this.loadCollection(username);
    if (!collection) return;
    
    const item = collection.items.find(i => i.id === itemId);
    if (item) {
      item.format = format;
      item.formatType = formatType;
      await this.saveCollection(username, collection);
    }
  }

  /**
   * Track sync status for an item
   */
  async trackSync(
    itemId: string, 
    discogsReleaseId: string, 
    status: SyncRecord['syncStatus'] = 'success',
    errorMessage?: string
  ): Promise<void> {
    const record: SyncRecord = {
      itemId,
      discogsReleaseId,
      syncedAt: new Date(),
      syncStatus: status,
      errorMessage
    };
    
    this.syncRecords.set(itemId, record);
    this.saveSyncRecords();
  }

  /**
   * Check if an item has been synced
   */
  isSynced(itemId: string): boolean {
    const record = this.syncRecords.get(itemId);
    return record?.syncStatus === 'success';
  }

  /**
   * Get sync record for an item
   */
  getSyncRecord(itemId: string): SyncRecord | undefined {
    return this.syncRecords.get(itemId);
  }

  /**
   * Get all sync records
   */
  getAllSyncRecords(): SyncRecord[] {
    return Array.from(this.syncRecords.values());
  }

  /**
   * Mark items as synced in the collection
   */
  async updateSyncStatus(username: string): Promise<void> {
    const collection = await this.loadCollection(username);
    if (!collection) return;
    
    collection.items.forEach(item => {
      const syncRecord = this.getSyncRecord(item.id);
      if (syncRecord) {
        item.syncedToDiscogs = syncRecord.syncStatus === 'success';
        item.discogsReleaseId = syncRecord.discogsReleaseId;
      }
    });
    
    await this.saveCollection(username, collection);
  }

  /**
   * Get collection statistics
   */
  async getStats(username: string): Promise<{
    total: number;
    physical: number;
    digital: number;
    unknown: number;
    synced: number;
  }> {
    const collection = await this.loadCollection(username);
    if (!collection) {
      return { total: 0, physical: 0, digital: 0, unknown: 0, synced: 0 };
    }
    
    return {
      total: collection.items.length,
      physical: collection.items.filter(i => i.formatType === 'physical' || i.formatType === 'both').length,
      digital: collection.items.filter(i => i.formatType === 'digital').length,
      unknown: collection.items.filter(i => i.formatType === 'unknown' || !i.formatType).length,
      synced: collection.items.filter(i => this.isSynced(i.id)).length
    };
  }

  /**
   * Clear all data for a user
   */
  async clearCollection(username: string): Promise<void> {
    this.memoryCache.delete(username);
    
    const storageKey = `bc-collection-${username}`;
    
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(storageKey);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(storageKey);
    }
  }

  /**
   * Load sync records from storage
   */
  private loadSyncRecords(): void {
    if (typeof localStorage === 'undefined') return;
    
    const serialized = localStorage.getItem('bc-sync-records');
    if (serialized) {
      try {
        const records = JSON.parse(serialized);
        Object.entries(records).forEach(([id, record]: [string, any]) => {
          record.syncedAt = new Date(record.syncedAt);
          this.syncRecords.set(id, record);
        });
      } catch (error) {
        console.error('Error loading sync records:', error);
      }
    }
  }

  /**
   * Save sync records to storage
   */
  private saveSyncRecords(): void {
    if (typeof localStorage === 'undefined') return;
    
    const records: Record<string, SyncRecord> = {};
    this.syncRecords.forEach((record, id) => {
      records[id] = record;
    });
    
    localStorage.setItem('bc-sync-records', JSON.stringify(records));
  }

  /**
   * Get items filtered by format type
   */
  async getItemsByFormat(
    username: string, 
    formatType: 'physical' | 'digital' | 'both' | 'unknown'
  ): Promise<ProcessedItem[]> {
    const collection = await this.loadCollection(username);
    if (!collection) return [];
    
    return collection.items.filter(item => item.formatType === formatType);
  }

  /**
   * Get unsynced items
   */
  async getUnsyncedItems(username: string): Promise<ProcessedItem[]> {
    const collection = await this.loadCollection(username);
    if (!collection) return [];
    
    return collection.items.filter(item => !this.isSynced(item.id));
  }
}