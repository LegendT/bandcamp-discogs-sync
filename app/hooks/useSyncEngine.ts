'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { SyncEngine, SyncSession, SyncEvent, SyncConfig } from '@/lib/sync/sync-engine';
import type { MatchResult } from '@/types/matching';

interface SyncEngineState {
  session: SyncSession | null;
  isRunning: boolean;
  isPaused: boolean;
  canCancel: boolean;
  canPause: boolean;
  canResume: boolean;
  canRetry: boolean;
  progress: {
    processed: number;
    successful: number;
    failed: number;
    total: number;
    percentage: number;
    estimatedTimeRemaining?: number;
    currentBatch?: number;
    totalBatches?: number;
  } | null;
  recentEvents: SyncEvent[];
  error: string | null;
}

const DEFAULT_CONFIG: SyncConfig = {
  batchSize: 20,
  maxConcurrency: 3,
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 30000,
  rateLimitPerMinute: 60,
  circuitBreakerThreshold: 5,
  enableTelemetry: true,
  enablePersistence: true
};

export function useSyncEngine(config: Partial<SyncConfig> = {}) {
  const engineRef = useRef<SyncEngine | null>(null);
  const [state, setState] = useState<SyncEngineState>({
    session: null,
    isRunning: false,
    isPaused: false,
    canCancel: false,
    canPause: false,
    canResume: false,
    canRetry: false,
    progress: null,
    recentEvents: [],
    error: null
  });
  
  // Initialize engine with memoized config
  const finalConfig = useMemo(() => ({
    ...DEFAULT_CONFIG,
    ...config
  }), [config]);
  
  useEffect(() => {
    const engine = new SyncEngine(finalConfig);
    engineRef.current = engine;
    
    // Subscribe to engine events
    const handleEvent = (event: SyncEvent) => {
      setState(prev => {
        const newState = { ...prev };
        
        // Update recent events (keep last 10)
        newState.recentEvents = [...prev.recentEvents, event].slice(-10);
        
        // Update progress based on event type
        switch (event.type) {
          case 'SYNC_INITIATED':
            newState.progress = {
              processed: 0,
              successful: 0,
              failed: 0,
              total: event.totalItems,
              percentage: 0
            };
            newState.isRunning = true;
            newState.canPause = true;
            newState.canCancel = true;
            break;
            
          case 'BATCH_COMPLETED':
            if (newState.progress) {
              newState.progress.processed += event.successful + event.failed;
              newState.progress.successful += event.successful;
              newState.progress.failed += event.failed;
              newState.progress.percentage = Math.round(
                (newState.progress.processed / newState.progress.total) * 100
              );
            }
            break;
            
          case 'SYNC_COMPLETED':
            newState.isRunning = false;
            newState.canPause = false;
            newState.canCancel = false;
            newState.canRetry = event.summary.retryableFailures > 0;
            if (newState.progress) {
              newState.progress.percentage = 100;
            }
            break;
            
          case 'SYNC_PAUSED':
            newState.isRunning = false;
            newState.isPaused = true;
            newState.canPause = false;
            newState.canResume = true;
            break;
            
          case 'SYNC_RESUMED':
            newState.isRunning = true;
            newState.isPaused = false;
            newState.canPause = true;
            newState.canResume = false;
            break;
            
          case 'SYNC_CANCELLED':
            newState.isRunning = false;
            newState.isPaused = false;
            newState.canPause = false;
            newState.canCancel = false;
            newState.canResume = false;
            break;
            
          case 'RATE_LIMITED':
            // Could show a notification about rate limiting
            break;
            
          case 'CIRCUIT_OPENED':
            newState.error = 'Too many failures. Sync paused for safety.';
            break;
        }
        
        return newState;
      });
    };
    
    const handleCircuitStateChange = (circuitState: string) => {
      console.log('Circuit breaker state:', circuitState);
      if (circuitState === 'OPEN') {
        setState(prev => ({
          ...prev,
          error: 'Service temporarily unavailable. Will retry automatically.'
        }));
      }
    };
    
    const handleRetry = (data: { batchId: string; attempt: number; error: any }) => {
      console.log(`Retrying batch ${data.batchId}, attempt ${data.attempt}`);
    };
    
    engine.on('sync-event', handleEvent);
    engine.on('circuit-state-changed', handleCircuitStateChange);
    engine.on('retry', handleRetry);
    
    return () => {
      engine.off('sync-event', handleEvent);
      engine.off('circuit-state-changed', handleCircuitStateChange);
      engine.off('retry', handleRetry);
      engineRef.current = null;
    };
  }, [finalConfig]);
  
  // Start a new sync session
  const startSync = useCallback(async (items: MatchResult[]) => {
    if (!engineRef.current) {
      throw new Error('Sync engine not initialized');
    }
    
    setState(prev => ({ ...prev, error: null }));
    
    try {
      // Create session
      const session = await engineRef.current.createSession(items);
      setState(prev => ({ ...prev, session }));
      
      // Start sync
      await engineRef.current.startSync(session.id);
      
      // Update final state
      const finalSession = engineRef.current.getSession(session.id);
      setState(prev => ({
        ...prev,
        session: finalSession || null
      }));
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        error: error.message || 'Sync failed',
        isRunning: false
      }));
      throw error;
    }
  }, []);
  
  // Pause the current sync
  const pauseSync = useCallback(async () => {
    if (!engineRef.current || !state.session) return;
    
    try {
      await engineRef.current.pauseSync(state.session.id);
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        error: error.message
      }));
    }
  }, [state.session]);
  
  // Resume a paused sync
  const resumeSync = useCallback(async () => {
    if (!engineRef.current || !state.session) return;
    
    try {
      await engineRef.current.resumeSync(state.session.id);
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        error: error.message
      }));
    }
  }, [state.session]);
  
  // Cancel the current sync
  const cancelSync = useCallback(async () => {
    if (!engineRef.current || !state.session) return;
    
    try {
      await engineRef.current.cancelSync(state.session.id);
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        error: error.message
      }));
    }
  }, [state.session]);
  
  // Retry failed items from the last sync
  const retryFailed = useCallback(async () => {
    if (!state.session?.summary) return;
    
    // Extract failed items from session events
    const failedItems = state.session.events
      .filter(e => e.type === 'ITEM_FAILED')
      .map((e: any) => e.originalItem)
      .filter(Boolean);
    
    if (failedItems.length > 0) {
      await startSync(failedItems);
    }
  }, [state.session, startSync]);
  
  // Reset the sync state
  const reset = useCallback(() => {
    setState({
      session: null,
      isRunning: false,
      isPaused: false,
      canCancel: false,
      canPause: false,
      canResume: false,
      canRetry: false,
      progress: null,
      recentEvents: [],
      error: null
    });
  }, []);
  
  // Get system health metrics
  const getHealthMetrics = useCallback(() => {
    if (!engineRef.current) return null;
    
    return {
      circuitBreaker: engineRef.current.getCircuitBreakerState(),
      rateLimiter: engineRef.current.getRateLimiterState(),
      sessions: engineRef.current.getAllSessions().length
    };
  }, []);
  
  return {
    // State
    session: state.session,
    isRunning: state.isRunning,
    isPaused: state.isPaused,
    progress: state.progress,
    recentEvents: state.recentEvents,
    error: state.error,
    
    // Capabilities
    canCancel: state.canCancel,
    canPause: state.canPause,
    canResume: state.canResume,
    canRetry: state.canRetry,
    
    // Actions
    startSync,
    pauseSync,
    resumeSync,
    cancelSync,
    retryFailed,
    reset,
    
    // Monitoring
    getHealthMetrics
  };
}

// Example usage in a component
export function SyncUI() {
  const {
    isRunning,
    isPaused,
    progress,
    error,
    canCancel,
    canPause,
    canResume,
    startSync,
    pauseSync,
    resumeSync,
    cancelSync
  } = useSyncEngine({
    batchSize: 20,
    maxRetries: 5
  });
  
  const handleSync = async (items: MatchResult[]) => {
    try {
      await startSync(items);
    } catch (error) {
      console.error('Sync failed:', error);
    }
  };
  
  return (
    <div>
      {progress && (
        <div>
          <div>Progress: {progress.percentage}%</div>
          <div>Successful: {progress.successful}</div>
          <div>Failed: {progress.failed}</div>
          <div>Total: {progress.total}</div>
        </div>
      )}
      
      {error && <div className="error">{error}</div>}
      
      <div>
        {canPause && <button onClick={pauseSync}>Pause</button>}
        {canResume && <button onClick={resumeSync}>Resume</button>}
        {canCancel && <button onClick={cancelSync}>Cancel</button>}
      </div>
    </div>
  );
}