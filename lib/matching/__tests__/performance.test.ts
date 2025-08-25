import { 
  normalizeString,
  calculateLevenshteinDistance,
  calculateStringSimilarity,
  matchAlbum
} from '../engine';
import { BandcampPurchase } from '../../../types/bandcamp';
import { DiscogsRelease } from '../../../types/discogs';

describe('Performance Benchmarks', () => {
  
  describe('String Operations Performance', () => {
    it('should normalize 1000 strings in under 100ms', () => {
      const strings = Array(1000).fill(0).map((_, i) => 
        `Test Artist ${i} feat. Another Artist & Friends - Special Edition`
      );
      
      const startTime = performance.now();
      strings.forEach(s => normalizeString(s));
      const elapsed = performance.now() - startTime;
      
      expect(elapsed).toBeLessThan(100);
      // Performance test completed: normalized 1000 strings in ${elapsed.toFixed(2)}ms
    });

    it('should calculate similarity for 100 string pairs in under 50ms', () => {
      const pairs = Array(100).fill(0).map((_, i) => ({
        a: `Artist Name ${i}`,
        b: `Artist Name ${i + 1}`
      }));
      
      const startTime = performance.now();
      pairs.forEach(p => calculateStringSimilarity(p.a, p.b));
      const elapsed = performance.now() - startTime;
      
      expect(elapsed).toBeLessThan(50);
      // Performance test completed: calculated 100 similarities in ${elapsed.toFixed(2)}ms
    });
  });

  describe('Batch Matching Performance', () => {
    it('should match 100 albums against 50 releases each in under 1 second', () => {
      const purchases: BandcampPurchase[] = Array(100).fill(0).map((_, i) => ({
        artist: `Artist ${i % 10}`,
        itemTitle: `Album ${i}`,
        itemUrl: `https://example.com/${i}`,
        purchaseDate: new Date(),
        format: 'Digital',
        rawFormat: 'Digital'
      }));

      const releases: DiscogsRelease[] = Array(50).fill(0).map((_, i) => ({
        id: i,
        title: `Album ${i * 2}`,
        artists_sort: `Artist ${i % 10}`,
        year: 2020 + (i % 5),
        resource_url: `https://api.discogs.com/releases/${i}`,
        uri: `/releases/${i}`
      }));

      const startTime = performance.now();
      purchases.forEach(p => matchAlbum(p, releases));
      const elapsed = performance.now() - startTime;
      
      expect(elapsed).toBeLessThan(1000);
      // Performance test completed: matched 100 albums in ${elapsed.toFixed(2)}ms (${(elapsed/100).toFixed(2)}ms per album)
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory when processing large batches', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Process 1000 normalizations
      for (let i = 0; i < 1000; i++) {
        normalizeString(`Test String ${i} with some special characters: café, naïve, résumé`);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB
      
      // Performance test completed: memory increase ${memoryIncrease.toFixed(2)}MB
      expect(memoryIncrease).toBeLessThan(10); // Should not increase by more than 10MB
    });
  });

  describe('Worst Case Scenarios', () => {
    it('should handle very different long strings efficiently', () => {
      const a = 'A'.repeat(100) + 'B'.repeat(100);
      const b = 'C'.repeat(100) + 'D'.repeat(100);
      
      const startTime = performance.now();
      calculateLevenshteinDistance(a, b);
      const elapsed = performance.now() - startTime;
      
      expect(elapsed).toBeLessThan(10);
      // Performance test completed: Levenshtein for 200-char strings in ${elapsed.toFixed(2)}ms
    });

    it('should handle pathological token matching cases', () => {
      // Many repeated words
      const a = Array(50).fill('word').join(' ');
      const b = Array(50).fill('word').join(' ') + ' different';
      
      const startTime = performance.now();
      calculateStringSimilarity(a, b);
      const elapsed = performance.now() - startTime;
      
      expect(elapsed).toBeLessThan(20);
    });
  });
});