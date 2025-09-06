import { useState, useCallback } from 'react';
import { ProcessedItem } from '@/lib/bandcamp/scraper';
import { BandcampCollectionStore } from '@/lib/bandcamp/collection-store';

interface UseBandcampImportOptions {
  onImportComplete?: (items: ProcessedItem[]) => void;
  persistData?: boolean;
}

export function useBandcampImport(options: UseBandcampImportOptions = {}) {
  const [isImporting, setIsImporting] = useState(false);
  const [importedItems, setImportedItems] = useState<ProcessedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const store = new BandcampCollectionStore({
    persist: options.persistData ?? true,
    storage: 'local'
  });

  const importFromBandcamp = useCallback(async (username: string) => {
    setIsImporting(true);
    setError(null);
    
    try {
      // Check for cached data first
      const cached = await store.loadCollection(username);
      if (cached && cached.items.length > 0) {
        setImportedItems(cached.items);
        if (options.onImportComplete) {
          options.onImportComplete(cached.items);
        }
        return cached.items;
      }
      
      // Scrape new data
      const response = await fetch('/api/bandcamp/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, detectFormats: false })
      });
      
      if (!response.ok) {
        throw new Error('Failed to import from Bandcamp');
      }
      
      const collection = await response.json();
      await store.saveCollection(username, collection);
      
      setImportedItems(collection.items);
      if (options.onImportComplete) {
        options.onImportComplete(collection.items);
      }
      
      return collection.items;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      setError(message);
      throw err;
    } finally {
      setIsImporting(false);
    }
  }, [store, options]);

  const markItemSynced = useCallback(async (
    itemId: string,
    discogsReleaseId: string
  ) => {
    await store.trackSync(itemId, discogsReleaseId, 'success');
    
    // Update local state
    setImportedItems(prev => prev.map(item => 
      item.id === itemId 
        ? { ...item, syncedToDiscogs: true, discogsReleaseId }
        : item
    ));
  }, [store]);

  const updateItemFormat = useCallback(async (
    username: string,
    itemId: string,
    format: ProcessedItem['format']
  ) => {
    const formatType = format === 'digital' ? 'digital' : 
                       format === 'unknown' ? 'unknown' : 'physical';
    
    await store.updateItemFormat(username, itemId, format, formatType);
    
    // Update local state
    setImportedItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, format, formatType } : item
    ));
  }, [store]);

  const getPhysicalItems = useCallback(() => {
    return importedItems.filter(item => 
      item.formatType === 'physical' || item.formatType === 'both'
    );
  }, [importedItems]);

  const getDigitalItems = useCallback(() => {
    return importedItems.filter(item => 
      item.formatType === 'digital'
    );
  }, [importedItems]);

  const getUnsyncedItems = useCallback(() => {
    return importedItems.filter(item => !item.syncedToDiscogs);
  }, [importedItems]);

  const clearImportedData = useCallback(async (username?: string) => {
    if (username) {
      await store.clearCollection(username);
    }
    setImportedItems([]);
    setError(null);
  }, [store]);

  return {
    // State
    isImporting,
    importedItems,
    error,
    
    // Actions
    importFromBandcamp,
    markItemSynced,
    updateItemFormat,
    clearImportedData,
    
    // Getters
    getPhysicalItems,
    getDigitalItems,
    getUnsyncedItems,
    
    // Stats
    stats: {
      total: importedItems.length,
      physical: getPhysicalItems().length,
      digital: getDigitalItems().length,
      unknown: importedItems.filter(i => !i.formatType || i.formatType === 'unknown').length,
      synced: importedItems.filter(i => i.syncedToDiscogs).length
    }
  };
}