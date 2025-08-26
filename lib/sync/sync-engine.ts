/**
 * Production-grade sync engine with proper architecture
 * This demonstrates how the sync system SHOULD be built
 */

import { EventEmitter } from 'events';
import type { MatchResult } from '@/types/matching';

// Domain Events
export type SyncEvent = 
  | { type: 'SYNC_INITIATED'; sessionId: string; totalItems: number; timestamp: number }
  | { type: 'BATCH_QUEUED'; batchId: string; sessionId: string; items: string[] }
  | { type: 'BATCH_STARTED'; batchId: string; attemptNumber: number }
  | { type: 'BATCH_PROGRESS'; batchId: string; processed: number; total: number }
  | { type: 'BATCH_COMPLETED'; batchId: string; successful: number; failed: number }
  | { type: 'BATCH_FAILED'; batchId: string; error: Error; retryable: boolean }
  | { type: 'ITEM_SYNCED'; itemId: string; releaseId: number }
  | { type: 'ITEM_FAILED'; itemId: string; error: string; retryable: boolean }
  | { type: 'SYNC_PAUSED'; sessionId: string; reason: string }
  | { type: 'SYNC_RESUMED'; sessionId: string }
  | { type: 'SYNC_CANCELLED'; sessionId: string; reason: string }
  | { type: 'SYNC_COMPLETED'; sessionId: string; summary: SyncSummary }
  | { type: 'RATE_LIMITED'; retryAfter: number }
  | { type: 'CIRCUIT_OPENED'; reason: string }
  | { type: 'CIRCUIT_CLOSED' };

export interface SyncSummary {
  totalItems: number;
  successfulItems: number;
  failedItems: number;
  skippedItems: number;
  duration: number;
  averageTimePerItem: number;
  retryableFailures: number;
}

export interface SyncConfig {
  batchSize: number;
  maxConcurrency: number;
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
  rateLimitPerMinute: number;
  circuitBreakerThreshold: number;
  enableTelemetry: boolean;
  enablePersistence: boolean;
}

export interface SyncSession {
  id: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  items: MatchResult[];
  config: SyncConfig;
  startedAt?: number;
  completedAt?: number;
  summary?: SyncSummary;
  events: SyncEvent[];
  checkpoints: SyncCheckpoint[];
}

export interface SyncCheckpoint {
  batchId: string;
  processedItems: string[];
  timestamp: number;
}

// Circuit Breaker Implementation
export class CircuitBreaker {
  private failures = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  
  constructor(
    private threshold: number = 5,
    private timeout: number = 60000,
    private onStateChange?: (state: string) => void
  ) {}
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastFailureTime;
      
      if (elapsed > this.timeout) {
        this.setState('HALF_OPEN');
      } else {
        throw new Error(`Circuit breaker OPEN. Retry after ${this.timeout - elapsed}ms`);
      }
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }
  
  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 3) {
        this.setState('CLOSED');
        this.reset();
      }
    } else {
      this.failures = Math.max(0, this.failures - 1);
    }
  }
  
  private onFailure(error: unknown): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;
    
    if (this.failures >= this.threshold) {
      this.setState('OPEN');
    }
  }
  
  private setState(state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'): void {
    this.state = state;
    this.onStateChange?.(state);
  }
  
  private reset(): void {
    this.failures = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }
  
  getState() {
    return {
      state: this.state,
      failures: this.failures,
      threshold: this.threshold
    };
  }
}

// Rate Limiter with Token Bucket Algorithm
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  
  constructor(
    private capacity: number,
    private refillRate: number,
    private interval: number = 60000
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }
  
  async acquire(count: number = 1): Promise<void> {
    this.refill();
    
    if (this.tokens >= count) {
      this.tokens -= count;
      return;
    }
    
    const waitTime = ((count - this.tokens) / this.refillRate) * this.interval;
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    return this.acquire(count);
  }
  
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = (elapsed / this.interval) * this.refillRate;
    
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
  
  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}

// Retry Manager with Exponential Backoff
export class RetryManager {
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    options: {
      maxAttempts?: number;
      baseDelay?: number;
      maxDelay?: number;
      backoffFactor?: number;
      shouldRetry?: (error: any, attempt: number) => boolean;
      onRetry?: (error: any, attempt: number) => void;
    } = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      baseDelay = 1000,
      maxDelay = 30000,
      backoffFactor = 2,
      shouldRetry = this.defaultShouldRetry,
      onRetry
    } = options;
    
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        
        if (attempt === maxAttempts || !shouldRetry(error, attempt)) {
          throw error;
        }
        
        onRetry?.(error, attempt);
        
        const jitter = Math.random() * 1000;
        const delay = Math.min(
          baseDelay * Math.pow(backoffFactor, attempt - 1) + jitter,
          maxDelay
        );
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }
  
  private defaultShouldRetry(error: any): boolean {
    // Retry on network errors and 5xx status codes
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      return true;
    }
    
    if (error.status >= 500 || error.status === 429) {
      return true;
    }
    
    return false;
  }
}

// Main Sync Engine
export class SyncEngine extends EventEmitter {
  private circuitBreaker: CircuitBreaker;
  private rateLimiter: RateLimiter;
  private retryManager: RetryManager;
  private sessions: Map<string, SyncSession> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  
  constructor(private config: SyncConfig) {
    super();
    
    this.circuitBreaker = new CircuitBreaker(
      config.circuitBreakerThreshold,
      60000,
      (state) => this.emit('circuit-state-changed', state)
    );
    
    this.rateLimiter = new RateLimiter(
      config.rateLimitPerMinute,
      config.rateLimitPerMinute,
      60000
    );
    
    this.retryManager = new RetryManager();
  }
  
  async createSession(items: MatchResult[]): Promise<SyncSession> {
    const sessionId = this.generateSessionId();
    
    const session: SyncSession = {
      id: sessionId,
      status: 'pending',
      items: this.deduplicateItems(items),
      config: this.config,
      events: [],
      checkpoints: []
    };
    
    this.sessions.set(sessionId, session);
    
    const event: SyncEvent = {
      type: 'SYNC_INITIATED',
      sessionId,
      totalItems: session.items.length,
      timestamp: Date.now()
    };
    
    this.recordEvent(session, event);
    
    return session;
  }
  
  async startSync(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    
    if (session.status !== 'pending' && session.status !== 'paused') {
      throw new Error(`Cannot start sync in ${session.status} state`);
    }
    
    session.status = 'running';
    session.startedAt = Date.now();
    
    const controller = new AbortController();
    this.abortControllers.set(sessionId, controller);
    
    try {
      await this.processSyncSession(session, controller.signal);
      
      session.status = 'completed';
      session.completedAt = Date.now();
      
      const summary = this.calculateSummary(session);
      session.summary = summary;
      
      this.recordEvent(session, {
        type: 'SYNC_COMPLETED',
        sessionId,
        summary
      });
    } catch (error: any) {
      if (error.name === 'AbortError') {
        session.status = 'cancelled';
        this.recordEvent(session, {
          type: 'SYNC_CANCELLED',
          sessionId,
          reason: 'User cancelled'
        });
      } else {
        session.status = 'failed';
        throw error;
      }
    } finally {
      this.abortControllers.delete(sessionId);
      
      if (this.config.enablePersistence) {
        await this.persistSession(session);
      }
    }
  }
  
  async pauseSync(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    
    if (session.status !== 'running') {
      throw new Error(`Cannot pause sync in ${session.status} state`);
    }
    
    const controller = this.abortControllers.get(sessionId);
    controller?.abort();
    
    session.status = 'paused';
    
    this.recordEvent(session, {
      type: 'SYNC_PAUSED',
      sessionId,
      reason: 'User paused'
    });
  }
  
  async resumeSync(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    
    if (session.status !== 'paused') {
      throw new Error(`Cannot resume sync in ${session.status} state`);
    }
    
    await this.startSync(sessionId);
  }
  
  async cancelSync(sessionId: string): Promise<void> {
    const controller = this.abortControllers.get(sessionId);
    controller?.abort();
  }
  
  private async processSyncSession(
    session: SyncSession,
    signal: AbortSignal
  ): Promise<void> {
    const batches = this.createBatches(session.items, this.config.batchSize);
    const processedItems = new Set(this.getProcessedItems(session));
    
    for (const batch of batches) {
      if (signal.aborted) break;
      
      // Skip already processed items
      const unprocessedBatch = batch.filter(item => 
        !processedItems.has(this.getItemId(item))
      );
      
      if (unprocessedBatch.length === 0) continue;
      
      const batchId = this.generateBatchId();
      
      this.recordEvent(session, {
        type: 'BATCH_QUEUED',
        batchId,
        sessionId: session.id,
        items: unprocessedBatch.map(this.getItemId)
      });
      
      await this.processBatch(session, batchId, unprocessedBatch, signal);
      
      // Record checkpoint for recovery
      const checkpoint: SyncCheckpoint = {
        batchId,
        processedItems: unprocessedBatch.map(this.getItemId),
        timestamp: Date.now()
      };
      
      session.checkpoints.push(checkpoint);
      
      // Persist checkpoint for recovery
      if (this.config.enablePersistence) {
        await this.persistCheckpoint(session.id, checkpoint);
      }
    }
  }
  
  private async processBatch(
    session: SyncSession,
    batchId: string,
    items: MatchResult[],
    signal: AbortSignal
  ): Promise<void> {
    await this.rateLimiter.acquire();
    
    await this.circuitBreaker.execute(async () => {
      await this.retryManager.executeWithRetry(
        async () => {
          if (signal.aborted) throw new Error('Aborted');
          
          this.recordEvent(session, {
            type: 'BATCH_STARTED',
            batchId,
            attemptNumber: 1
          });
          
          // Simulate API call - Replace with actual implementation
          const result = await this.syncBatchToDiscogs(items);
          
          this.recordEvent(session, {
            type: 'BATCH_COMPLETED',
            batchId,
            successful: result.successful.length,
            failed: result.failed.length
          });
          
          return result;
        },
        {
          maxAttempts: this.config.maxRetries,
          onRetry: (error, attempt) => {
            this.emit('retry', { batchId, attempt, error });
          }
        }
      );
    });
  }
  
  private async syncBatchToDiscogs(items: MatchResult[]): Promise<any> {
    // This would be the actual API call
    // For now, return mock success
    return {
      successful: items,
      failed: []
    };
  }
  
  private createBatches<T>(items: T[], size: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      batches.push(items.slice(i, Math.min(i + size, items.length)));
    }
    return batches;
  }
  
  private deduplicateItems(items: MatchResult[]): MatchResult[] {
    const seen = new Set<string>();
    return items.filter(item => {
      const id = this.getItemId(item);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  
  private getItemId(item: MatchResult): string {
    return `${item.bandcampItem.itemUrl}-${item.discogsMatch?.id}`;
  }
  
  private getProcessedItems(session: SyncSession): string[] {
    return session.checkpoints.flatMap(cp => cp.processedItems);
  }
  
  private recordEvent(session: SyncSession, event: SyncEvent): void {
    session.events.push(event);
    this.emit('sync-event', event);
  }
  
  private calculateSummary(session: SyncSession): SyncSummary {
    const duration = (session.completedAt || Date.now()) - (session.startedAt || 0);
    const successfulItems = session.events.filter(e => e.type === 'ITEM_SYNCED').length;
    const failedItems = session.events.filter(e => e.type === 'ITEM_FAILED').length;
    
    return {
      totalItems: session.items.length,
      successfulItems,
      failedItems,
      skippedItems: session.items.length - successfulItems - failedItems,
      duration,
      averageTimePerItem: duration / (successfulItems + failedItems) || 0,
      retryableFailures: session.events.filter(
        e => e.type === 'ITEM_FAILED' && (e as any).retryable
      ).length
    };
  }
  
  private async persistSession(session: SyncSession): Promise<void> {
    // Implement IndexedDB persistence
    // This would store the session for recovery
  }
  
  private async persistCheckpoint(sessionId: string, checkpoint: SyncCheckpoint): Promise<void> {
    // Implement checkpoint persistence
  }
  
  private generateSessionId(): string {
    return `sync_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
  
  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
  
  // Public API for monitoring
  getSession(sessionId: string): SyncSession | undefined {
    return this.sessions.get(sessionId);
  }
  
  getAllSessions(): SyncSession[] {
    return Array.from(this.sessions.values());
  }
  
  getCircuitBreakerState() {
    return this.circuitBreaker.getState();
  }
  
  getRateLimiterState() {
    return {
      availableTokens: this.rateLimiter.getAvailableTokens(),
      capacity: this.config.rateLimitPerMinute
    };
  }
}