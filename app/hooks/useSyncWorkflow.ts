'use client';

import { useState, useCallback } from 'react';
import type { MatchResult } from '@/types/matching';

interface SyncResult {
  results: {
    successful: any[];
    failed: any[];
  };
  message: string;
}

export function useSyncWorkflow() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const syncToDiscogs = useCallback(async (token: string, items: MatchResult[]) => {
    setIsSyncing(true);
    setError(null);

    try {
      const payload = { matches: items.slice(0, 20) };
      console.log('Sync payload:', JSON.stringify(payload, null, 2));
      
      const syncResponse = await fetch('/api/sync', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Discogs-Token': token
        },
        body: JSON.stringify(payload), // Limit to 20
      });

      const syncData = await syncResponse.json();
      
      if (!syncResponse.ok) {
        throw new Error(syncData.error || 'Sync failed');
      }

      setSyncResults(syncData);
      return syncData;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync failed';
      setError(errorMessage);
      throw err;
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const resetSync = useCallback(() => {
    setSyncResults(null);
    setError(null);
  }, []);

  return {
    isSyncing,
    syncResults,
    error,
    syncToDiscogs,
    resetSync,
  };
}