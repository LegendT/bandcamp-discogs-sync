import { describe, test, expect } from '@jest/globals';
import { parseBandcampCSV } from '@/lib/bandcamp/parser';
import { getDiscogsClient } from '@/lib/discogs/client-singleton';
import { DiscogsSearchQuery } from '@/types/matching';
import * as fs from 'fs';
import * as path from 'path';

describe('Data Extraction Pipeline', () => {
  test('should successfully parse CSV and search Discogs', async () => {
    // Skip test if no Discogs token is set
    if (!process.env.DISCOGS_USER_TOKEN) {
      console.warn('Skipping integration test - DISCOGS_USER_TOKEN not set');
      return;
    }

    // Load test CSV
    const csvPath = path.join(process.cwd(), 'test-data', 'bandcamp-test.csv');
    const csvBuffer = fs.readFileSync(csvPath);
    const csvFile = new File([csvBuffer], 'bandcamp-test.csv', { type: 'text/csv' });
    
    // Parse CSV
    const parseResult = await parseBandcampCSV(csvFile);
    expect(parseResult).toBeDefined();
    expect(parseResult.purchases).toBeDefined();
    expect(parseResult.purchases.length).toBeGreaterThan(0);
    expect(parseResult.summary).toBeDefined();
    expect(parseResult.summary.formatBreakdown).toBeDefined();
    
    // Verify parsed data structure
    const firstPurchase = parseResult.purchases[0];
    expect(firstPurchase).toHaveProperty('artist');
    expect(firstPurchase).toHaveProperty('itemTitle');
    expect(firstPurchase).toHaveProperty('format');
    expect(firstPurchase).toHaveProperty('purchaseDate');
    expect(firstPurchase.purchaseDate).toBeInstanceOf(Date);
    
    // Test Discogs search with first item
    const client = getDiscogsClient();
    const query: DiscogsSearchQuery = {
      artist: firstPurchase.artist,
      title: firstPurchase.itemTitle
    };
    
    const results = await client.searchReleases(query);
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    
    // If we got results, verify structure
    if (results.length > 0) {
      expect(results[0]).toHaveProperty('id');
      expect(results[0]).toHaveProperty('title');
      expect(results[0]).toHaveProperty('artists_sort');
    }
    
    // Test that we can search for multiple items without rate limit errors
    const searchPromises = parseResult.purchases.slice(0, 3).map(async (purchase) => {
      const q: DiscogsSearchQuery = {
        artist: purchase.artist,
        title: purchase.itemTitle
      };
      return client.searchReleases(q);
    });
    
    const allResults = await Promise.all(searchPromises);
    expect(allResults).toHaveLength(3);
    allResults.forEach(result => {
      expect(Array.isArray(result)).toBe(true);
    });
  }, 30000); // 30 second timeout for integration test
});