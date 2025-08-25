'use client';

import { useState, useCallback } from 'react';
import type { MatchResult } from '@/types/matching';
import { SyncError, getUserMessage } from '@/lib/errors';

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
        if (syncResponse.status === 429) {
          throw new SyncError('Too many sync requests. Please wait a moment and try again.', {
            retryAfter: 60,
            statusCode: 429
          });
        }
        throw new SyncError(
          syncData.error || 'Failed to sync items to Discogs. Please check your token and try again.',
          { statusCode: syncResponse.status }
        );
      }

      setSyncResults(syncData);
      return syncData;
    } catch (err) {
      const errorMessage = getUserMessage(err);
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