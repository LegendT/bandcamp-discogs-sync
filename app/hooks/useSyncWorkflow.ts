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

interface SyncProgress {
  current: number;
  total: number;
  currentBatch: number;
  totalBatches: number;
}

export function useSyncWorkflow() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);

  const syncToDiscogs = useCallback(async (token: string, items: MatchResult[]) => {
    setIsSyncing(true);
    setError(null);
    setSyncProgress(null);
    
    try {
      // Batching with progress tracking
      const BATCH_SIZE = 20;
      const totalBatches = Math.ceil(items.length / BATCH_SIZE);
      let allSuccessful: any[] = [];
      let allFailed: any[] = [];
      
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const currentBatch = Math.floor(i / BATCH_SIZE) + 1;
        const batch = items.slice(i, i + BATCH_SIZE);
        const batchEnd = Math.min(i + BATCH_SIZE, items.length);
        
        // Update progress before processing batch
        setSyncProgress({
          current: i,
          total: items.length,
          currentBatch,
          totalBatches
        });
        
        const payload = { matches: batch };
        
        const syncResponse = await fetch('/api/sync', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Discogs-Token': token
          },
          body: JSON.stringify(payload),
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
            syncData.error || 'Failed to sync items to Discogs.',
            { statusCode: syncResponse.status }
          );
        }
        
        allSuccessful.push(...syncData.results.successful);
        allFailed.push(...syncData.results.failed);
        
        // Update progress after batch completion
        setSyncProgress({
          current: batchEnd,
          total: items.length,
          currentBatch,
          totalBatches
        });
        
        // Small delay between batches to respect rate limits
        if (i + BATCH_SIZE < items.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
      
      // Clear progress when done
      setSyncProgress(null);
      
      // Construct final results in expected format
      const finalResults = {
        results: {
          successful: allSuccessful,
          failed: allFailed,
          total: items.length
        },
        message: `Synced ${allSuccessful.length} of ${items.length} items`
      };
      
      setSyncResults(finalResults);
      return finalResults; // Maintain return contract
      
    } catch (err) {
      const errorMessage = getUserMessage(err);
      setError(errorMessage);
      setSyncProgress(null); // Clear progress on error
      throw err; // Maintain error contract
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const resetSync = useCallback(() => {
    setSyncResults(null);
    setError(null);
    setSyncProgress(null);
  }, []);

  return {
    isSyncing,
    syncResults,
    syncProgress,
    error,
    syncToDiscogs,
    resetSync,
  };
}