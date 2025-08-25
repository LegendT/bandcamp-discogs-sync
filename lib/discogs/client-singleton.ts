import { DiscogsClient } from './client';

let instance: DiscogsClient | null = null;

/**
 * Get singleton instance of DiscogsClient
 * Ensures rate limiting is shared across the entire application
 */
export function getDiscogsClient(): DiscogsClient {
  if (!instance) {
    instance = new DiscogsClient();
  }
  return instance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetDiscogsClient(): void {
  instance = null;
}