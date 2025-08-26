'use client';

import { useState, useCallback, useRef } from 'react';
import type { MatchResult } from '@/types/matching';
import { SyncError, getUserMessage } from '@/lib/errors';
import { logger } from '@/lib/utils/logger';

interface SyncResultItem {
  releaseId: number;
  title: string;
  artist: string;
  bandcampItem: {
    itemTitle: string;
    itemUrl: string;
  };
}

interface FailedSyncItem {
  item: string;
  error: string;
  retryable: boolean;
  originalMatch: MatchResult;
  batchNumber?: number;
}

interface SyncResult {
  results: {
    successful: SyncResultItem[];
    failed: FailedSyncItem[];
    total: number;
  };
  message: string;
  canRetryFailed: boolean;
}

interface SyncProgress {
  itemsProcessed: number;
  itemsSuccessful: number;
  itemsFailed: number;
  itemsSkipped: number;
  total: number;
  currentBatch: number;
  totalBatches: number;
  currentStatus: 'preparing' | 'processing' | 'waiting' | 'retrying' | 'complete' | 'cancelled';
  estimatedTimeRemaining?: number;
}

export function useSyncWorkflow() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<SyncResult | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Cancellation support
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isCancelled, setIsCancelled] = useState(false);
  
  // Performance tracking
  const startTimeRef = useRef<number | null>(null);

  const syncToDiscogs = useCallback(async (token: string, items: MatchResult[]) => {
    // Reset state
    setIsSyncing(true);
    setError(null);
    setSyncProgress(null);
    setIsCancelled(false);
    setSyncResults(null);
    
    // Initialize abort controller for cancellation
    abortControllerRef.current = new AbortController();
    startTimeRef.current = Date.now();
    
    // Early validation
    if (!items || items.length === 0) {
      setSyncResults({
        results: { successful: [], failed: [], total: 0 },
        message: 'No items to sync',
        canRetryFailed: false
      });
      setIsSyncing(false);
      return;
    }
    
    // Constants
    const BATCH_SIZE = 20;
    const MAX_RETRIES = 3;
    const BASE_DELAY = 1000; // 1 second base delay
    const totalBatches = Math.ceil(items.length / BATCH_SIZE);
    
    // Results tracking
    const allSuccessful: SyncResultItem[] = [];
    const allFailed: FailedSyncItem[] = [];
    const allSkipped: MatchResult[] = [];
    
    try {
      // Process in batches
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        // Check for cancellation
        if (abortControllerRef.current?.signal.aborted || isCancelled) {
          logger.info('Sync cancelled by user', { 
            processed: allSuccessful.length + allFailed.length,
            remaining: items.length - (allSuccessful.length + allFailed.length)
          });
          break;
        }
        
        const startIdx = batchIndex * BATCH_SIZE;
        const batch = items.slice(startIdx, startIdx + BATCH_SIZE);
        const currentBatch = batchIndex + 1;
        
        // Update progress - preparing batch
        setSyncProgress({
          itemsProcessed: allSuccessful.length + allFailed.length,
          itemsSuccessful: allSuccessful.length,
          itemsFailed: allFailed.length,
          itemsSkipped: allSkipped.length,
          total: items.length,
          currentBatch,
          totalBatches,
          currentStatus: 'processing',
          estimatedTimeRemaining: calculateEstimatedTime(
            startTimeRef.current!,
            allSuccessful.length + allFailed.length,
            items.length
          )
        });
        
        // Retry logic for each batch
        let retryCount = 0;
        let batchProcessed = false;
        
        while (retryCount < MAX_RETRIES && !batchProcessed) {
          try {
            const payload = { matches: batch };
            
            const syncResponse = await fetch('/api/sync', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'X-Discogs-Token': token
              },
              body: JSON.stringify(payload),
              signal: abortControllerRef.current?.signal
            });
            
            const syncData = await syncResponse.json();
            
            if (!syncResponse.ok) {
              // Handle rate limiting with retry
              if (syncResponse.status === 429) {
                retryCount++;
                
                if (retryCount < MAX_RETRIES) {
                  const retryAfter = parseInt(
                    syncResponse.headers.get('retry-after') || 
                    syncResponse.headers.get('x-ratelimit-reset') || 
                    '60'
                  );
                  
                  // Update progress to show waiting
                  setSyncProgress(prev => prev ? {
                    ...prev,
                    currentStatus: 'retrying'
                  } : null);
                  
                  // Exponential backoff with jitter
                  const delay = Math.min(
                    retryAfter * 1000 || (BASE_DELAY * Math.pow(2, retryCount) + Math.random() * 1000),
                    30000 // Max 30 seconds
                  );
                  
                  logger.warn(`Rate limited, retrying batch ${currentBatch} in ${delay}ms`, {
                    retryCount,
                    batchNumber: currentBatch
                  });
                  
                  await new Promise(r => setTimeout(r, delay));
                  continue; // Retry the batch
                } else {
                  // Max retries exceeded for rate limit
                  const batchFailures: FailedSyncItem[] = batch.map(item => ({
                    item: `${item.bandcampItem.artist} - ${item.bandcampItem.itemTitle}`,
                    error: 'Rate limit exceeded - please try again later',
                    retryable: true,
                    originalMatch: item,
                    batchNumber: currentBatch
                  }));
                  allFailed.push(...batchFailures);
                  batchProcessed = true;
                }
              } else if (syncResponse.status === 401) {
                // Token invalid - stop entire process
                throw new SyncError('Invalid or expired Discogs token. Please re-enter your token.', {
                  statusCode: 401
                });
              } else {
                // Other errors - mark batch as failed but continue
                const batchFailures: FailedSyncItem[] = batch.map(item => ({
                  item: `${item.bandcampItem.artist} - ${item.bandcampItem.itemTitle}`,
                  error: syncData.error || `Server error (${syncResponse.status})`,
                  retryable: syncResponse.status >= 500,
                  originalMatch: item,
                  batchNumber: currentBatch
                }));
                allFailed.push(...batchFailures);
                batchProcessed = true;
              }
            } else {
              // Success - process results
              if (syncData.results?.successful) {
                allSuccessful.push(...syncData.results.successful);
              }
              if (syncData.results?.failed) {
                const detailedFailures: FailedSyncItem[] = syncData.results.failed.map((f: any) => ({
                  item: f.item || 'Unknown item',
                  error: f.error || 'Unknown error',
                  retryable: true,
                  originalMatch: batch.find(b => 
                    b.bandcampItem.itemTitle === f.item || 
                    b.discogsMatch?.id === f.releaseId
                  ) || batch[0],
                  batchNumber: currentBatch
                }));
                allFailed.push(...detailedFailures);
              }
              batchProcessed = true;
            }
          } catch (err: any) {
            // Network or other errors
            if (err.name === 'AbortError') {
              // Sync was cancelled
              break;
            }
            
            retryCount++;
            
            if (retryCount < MAX_RETRIES) {
              logger.warn(`Network error on batch ${currentBatch}, retrying...`, {
                error: err.message,
                retryCount
              });
              
              // Wait before retry with exponential backoff
              await new Promise(r => setTimeout(r, BASE_DELAY * Math.pow(2, retryCount)));
              continue;
            } else {
              // Max retries exceeded - mark batch as failed
              const batchFailures: FailedSyncItem[] = batch.map(item => ({
                item: `${item.bandcampItem.artist} - ${item.bandcampItem.itemTitle}`,
                error: 'Network error - please check your connection',
                retryable: true,
                originalMatch: item,
                batchNumber: currentBatch
              }));
              allFailed.push(...batchFailures);
              batchProcessed = true;
            }
          }
        }
        
        // Update progress after batch
        setSyncProgress({
          itemsProcessed: allSuccessful.length + allFailed.length,
          itemsSuccessful: allSuccessful.length,
          itemsFailed: allFailed.length,
          itemsSkipped: allSkipped.length,
          total: items.length,
          currentBatch,
          totalBatches,
          currentStatus: batchIndex < totalBatches - 1 ? 'waiting' : 'complete',
          estimatedTimeRemaining: calculateEstimatedTime(
            startTimeRef.current!,
            allSuccessful.length + allFailed.length,
            items.length
          )
        });
        
        // Delay between batches (except for last batch)
        if (batchIndex < totalBatches - 1 && !abortControllerRef.current?.signal.aborted) {
          // Adaptive delay based on success rate
          const successRate = allSuccessful.length / (allSuccessful.length + allFailed.length);
          const delay = successRate > 0.9 ? 500 : 1000; // Faster if high success rate
          await new Promise(r => setTimeout(r, delay));
        }
      }
      
      // Prepare final results
      const wasC ancelled = abortControllerRef.current?.signal.aborted || isCancelled;
      const finalResults: SyncResult = {
        results: {
          successful: allSuccessful,
          failed: allFailed,
          total: items.length
        },
        message: generateResultMessage(allSuccessful.length, allFailed.length, items.length, wasCancelled),
        canRetryFailed: allFailed.some(f => f.retryable)
      };
      
      setSyncResults(finalResults);
      
      // Clear progress after a short delay to show completion
      setTimeout(() => setSyncProgress(null), 2000);
      
      return finalResults;
      
    } catch (err) {
      const errorMessage = getUserMessage(err);
      setError(errorMessage);
      logger.error('Sync failed', { error: err });
      
      // Create partial results if any items were processed
      if (allSuccessful.length > 0 || allFailed.length > 0) {
        setSyncResults({
          results: {
            successful: allSuccessful,
            failed: allFailed,
            total: items.length
          },
          message: `Partial sync: ${allSuccessful.length} succeeded, ${allFailed.length} failed, ${items.length - allSuccessful.length - allFailed.length} not processed`,
          canRetryFailed: true
        });
      }
      
      setSyncProgress(null);
      throw err;
    } finally {
      setIsSyncing(false);
      abortControllerRef.current = null;
      startTimeRef.current = null;
    }
  }, [isCancelled]);

  const cancelSync = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsCancelled(true);
      logger.info('User cancelled sync operation');
    }
  }, []);

  const retryFailed = useCallback(async (token: string) => {
    if (!syncResults?.results.failed || syncResults.results.failed.length === 0) {
      return;
    }
    
    // Extract retryable items
    const retryableItems = syncResults.results.failed
      .filter(f => f.retryable && f.originalMatch)
      .map(f => f.originalMatch);
    
    if (retryableItems.length === 0) {
      setError('No retryable items found');
      return;
    }
    
    // Clear previous results and retry
    setSyncResults(null);
    return syncToDiscogs(token, retryableItems);
  }, [syncResults, syncToDiscogs]);

  const resetSync = useCallback(() => {
    setSyncResults(null);
    setError(null);
    setSyncProgress(null);
    setIsCancelled(false);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  return {
    isSyncing,
    syncResults,
    syncProgress,
    error,
    syncToDiscogs,
    cancelSync,
    retryFailed,
    resetSync,
    canCancel: isSyncing && !isCancelled,
    canRetry: syncResults?.canRetryFailed || false
  };
}

// Helper functions
function calculateEstimatedTime(startTime: number, processed: number, total: number): number | undefined {
  if (processed === 0) return undefined;
  
  const elapsed = Date.now() - startTime;
  const averagePerItem = elapsed / processed;
  const remaining = total - processed;
  const estimatedMs = remaining * averagePerItem;
  
  return Math.round(estimatedMs / 1000); // Return in seconds
}

function generateResultMessage(
  successful: number, 
  failed: number, 
  total: number, 
  cancelled: boolean
): string {
  if (cancelled) {
    return `Sync cancelled. ${successful} of ${successful + failed} items synced successfully.`;
  }
  
  if (failed === 0) {
    return `Successfully synced all ${successful} items!`;
  }
  
  if (successful === 0) {
    return `Sync failed. Unable to sync any items. Please check your connection and try again.`;
  }
  
  return `Synced ${successful} of ${total} items. ${failed} items failed to sync.`;
}