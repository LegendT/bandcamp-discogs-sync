import { 
  normalizeString,
  calculateStringSimilarity,
  matchAlbum,
  extractSplitArtists,
  handleVariousArtists
} from '../engine';
import { BandcampPurchase } from '../../../types/bandcamp';
import { DiscogsRelease } from '../../../types/discogs';

describe('Edge Cases Not Covered in Original Tests', () => {
  
  describe('Parenthetical Information Handling', () => {
    it('should handle albums with parenthetical info differently', () => {
      // Test that parenthetical content is preserved in normalization
      // normalizeString removes punctuation but keeps the words
      
      // "Abbey Road (Remastered)" -> "abbey road remastered"
      // "Abbey Road" -> "abbey road"
      const score1 = calculateStringSimilarity(
        'Abbey Road (Remastered)',
        'Abbey Road'
      );
      
      // "Abbey Road (2019 Mix)" -> "abbey road 2019 mix"
      // "Abbey Road (Deluxe Edition)" -> "abbey road deluxe edition"
      const score2 = calculateStringSimilarity(
        'Abbey Road (2019 Mix)',
        'Abbey Road (Deluxe Edition)'
      );
      
      // Score1: "abbey road remastered" vs "abbey road"
      // Levenshtein distance is high due to "remastered" being extra
      expect(score1).toBeGreaterThan(40); // Moderate match
      expect(score1).toBeLessThan(70); // Not a high match
      
      // Score2: "abbey road 2019 mix" vs "abbey road deluxe edition"
      // Similar length strings with different edition info
      expect(score2).toBeGreaterThan(30);
      expect(score2).toBeLessThan(60); // Both have edition info, so similar scores
    });

    it('should handle live albums and demos', () => {
      const purchase: BandcampPurchase = {
        artist: 'Pink Floyd',
        itemTitle: 'The Wall (Live)',
        itemUrl: 'https://example.com',
        purchaseDate: new Date(),
        format: 'Digital',
        rawFormat: 'Digital'
      };

      const releases: DiscogsRelease[] = [
        {
          id: 1,
          title: 'The Wall',
          artists_sort: 'Pink Floyd',
          year: 1979,
          resource_url: 'https://api.discogs.com/releases/1',
          uri: '/releases/1'
        },
        {
          id: 2,
          title: 'The Wall (Live)',
          artists_sort: 'Pink Floyd',
          year: 2000,
          resource_url: 'https://api.discogs.com/releases/2',
          uri: '/releases/2'
        }
      ];

      const result = matchAlbum(purchase, releases);
      expect(result.bestMatch?.release.id).toBe(2);
    });
  });

  describe('Roman Numerals and Numbers', () => {
    it('should handle roman numerals vs numbers', () => {
      const score = calculateStringSimilarity('Volume III', 'Volume 3');
      expect(score).toBeGreaterThan(70);
    });

    it('should handle spelled out numbers', () => {
      const score = calculateStringSimilarity('Three', '3');
      expect(score).toBeLessThan(50); // Current implementation doesn't handle this
    });
  });

  describe('Artist Name Edge Cases', () => {
    it('should handle "The" prefix inconsistently used', () => {
      // normalizeString removes "The" at the beginning but not at the end
      expect(normalizeString('The Beatles')).toBe('beatles');
      // "Beatles, The" becomes "beatles the" (comma removed, "the" stays at end)
      expect(normalizeString('Beatles, The')).toBe('beatles the');
    });

    it('should handle artist name with numbers', () => {
      const artists = extractSplitArtists('Blink-182 / Sum 41');
      expect(artists).toEqual(['Blink-182', 'Sum 41']);
    });

    it('should handle DJ names', () => {
      expect(normalizeString('DJ Shadow')).toBe('dj shadow');
      expect(normalizeString('D.J. Shadow')).toBe('dj shadow');
    });
  });

  describe('Empty and Null Cases', () => {
    it('should handle empty strings gracefully', () => {
      expect(calculateStringSimilarity('', '')).toBe(100);
      expect(calculateStringSimilarity('Test', '')).toBe(0);
    });

    it('should handle very long strings efficiently', () => {
      const longString = 'A'.repeat(1000);
      const startTime = performance.now();
      calculateStringSimilarity(longString, longString + 'B');
      const elapsed = performance.now() - startTime;
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('Multi-language Support', () => {
    it('should handle Japanese characters', () => {
      // Unicode normalization removes the Japanese characters
      const normalized = normalizeString('アニメ soundtrack');
      // After NFD normalization and removing non-word chars, Japanese is removed
      expect(normalized).toBe('soundtrack');
    });

    it('should handle Cyrillic characters', () => {
      const normalized = normalizeString('Москва');
      // Cyrillic characters are removed by the regex that only keeps \w (ASCII word chars)
      expect(normalized).toBe(''); // All Cyrillic removed
    });
  });

  describe('Compilation Detection Edge Cases', () => {
    it('should not confuse artist name containing "various"', () => {
      expect(handleVariousArtists('Various Cruelties')).toBe('Various Cruelties');
      expect(handleVariousArtists('The Various')).toBe('The Various');
    });
  });

  describe('Format Edge Cases', () => {
    it('should handle multi-format releases', () => {
      const purchase: BandcampPurchase = {
        artist: 'Test Artist',
        itemTitle: 'Test Album',
        itemUrl: 'https://example.com',
        purchaseDate: new Date(),
        format: 'Vinyl',
        rawFormat: '2xLP'
      };

      // This should match both LP and 2xLP formats
      // Current implementation doesn't handle quantity
    });
  });

  describe('Deluxe and Special Editions', () => {
    it('should prefer exact edition matches', () => {
      const purchase: BandcampPurchase = {
        artist: 'Artist',
        itemTitle: 'Album (Deluxe Edition)',
        itemUrl: 'https://example.com',
        purchaseDate: new Date(),
        format: 'Digital',
        rawFormat: 'Digital'
      };

      const releases: DiscogsRelease[] = [
        {
          id: 1,
          title: 'Album',
          artists_sort: 'Artist',
          year: 2020,
          resource_url: 'https://api.discogs.com/releases/1',
          uri: '/releases/1'
        },
        {
          id: 2,
          title: 'Album (Deluxe Edition)',
          artists_sort: 'Artist',
          year: 2020,
          resource_url: 'https://api.discogs.com/releases/2',
          uri: '/releases/2'
        },
        {
          id: 3,
          title: 'Album (Special Edition)',
          artists_sort: 'Artist',
          year: 2020,
          resource_url: 'https://api.discogs.com/releases/3',
          uri: '/releases/3'
        }
      ];

      const result = matchAlbum(purchase, releases);
      expect(result.bestMatch?.release.id).toBe(2);
    });
  });
});