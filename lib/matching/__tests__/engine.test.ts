import { 
  normalizeString, 
  calculateLevenshteinDistance,
  calculateStringSimilarity,
  calculateTokenSimilarity,
  calculateMatchConfidence,
  matchAlbum,
  handleVariousArtists,
  extractSplitArtists
} from '../engine';
import { BandcampPurchase } from '../../../types/bandcamp';
import { DiscogsRelease } from '../../../types/discogs';

describe('normalizeString', () => {
  it('should convert to lowercase and trim', () => {
    expect(normalizeString('  HELLO WORLD  ')).toBe('hello world');
  });

  it('should normalize special characters', () => {
    expect(normalizeString('Björk')).toBe('bjork');
    expect(normalizeString('café')).toBe('cafe');
  });

  it('should handle punctuation variations', () => {
    expect(normalizeString("it's")).toBe('its');
    expect(normalizeString('rock—roll')).toBe('rockroll');
  });

  it('should remove articles when option is enabled', () => {
    expect(normalizeString('The Beatles')).toBe('beatles');
    expect(normalizeString('A Tribe Called Quest')).toBe('tribe called quest');
  });

  it('should expand abbreviations', () => {
    expect(normalizeString('feat. Test')).toBe('featuring test');
    expect(normalizeString('Rock&Roll')).toBe('rock and roll');
    expect(normalizeString('Vol. 1')).toBe('volume 1');
  });
});

describe('calculateLevenshteinDistance', () => {
  it('should return 0 for identical strings', () => {
    expect(calculateLevenshteinDistance('test', 'test')).toBe(0);
  });

  it('should calculate correct distance', () => {
    expect(calculateLevenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(calculateLevenshteinDistance('saturday', 'sunday')).toBe(3);
  });
});

describe('calculateStringSimilarity', () => {
  it('should return 100 for identical strings', () => {
    expect(calculateStringSimilarity('test', 'test')).toBe(100);
  });

  it('should return high score for normalized matches', () => {
    expect(calculateStringSimilarity('The Beatles', 'Beatles')).toBeGreaterThan(95);
  });

  it('should handle punctuation differences', () => {
    const score = calculateStringSimilarity(
      'Godspeed You! Black Emperor',
      'Godspeed You Black Emperor'
    );
    expect(score).toBeGreaterThan(90);
  });
});

describe('calculateTokenSimilarity', () => {
  it('should match all tokens in same order', () => {
    expect(calculateTokenSimilarity('The Dark Side', 'The Dark Side')).toBe(100);
  });

  it('should handle partial matches', () => {
    const score = calculateTokenSimilarity('The Dark Side of the Moon', 'Dark Side Moon');
    expect(score).toBeGreaterThan(50);
  });
});

describe('calculateMatchConfidence', () => {
  const mockBandcampPurchase: BandcampPurchase = {
    artist: 'Radiohead',
    itemTitle: 'OK Computer',
    itemUrl: 'https://radiohead.bandcamp.com/album/ok-computer',
    purchaseDate: new Date('2024-01-01'),
    format: 'Digital',
    rawFormat: 'Digital',
  };

  const mockDiscogsRelease: DiscogsRelease = {
    id: 123456,
    title: 'OK Computer',
    artists_sort: 'Radiohead',
    year: 1997,
    resource_url: 'https://api.discogs.com/releases/123456',
    uri: '/releases/123456'
  };

  it('should return exact match with 100 confidence', () => {
    const result = calculateMatchConfidence(mockBandcampPurchase, mockDiscogsRelease);
    expect(result.confidence).toBeGreaterThan(95);
    expect(result.matchType).toBe('exact');
  });

  it('should handle normalized matches', () => {
    const purchase = { ...mockBandcampPurchase, itemTitle: 'OK Computer!' };
    const result = calculateMatchConfidence(purchase, mockDiscogsRelease);
    expect(result.confidence).toBeGreaterThan(90);
    expect(result.matchType).toBe('normalized');
  });

  it('should apply format bonus correctly', () => {
    const vinylPurchase = { ...mockBandcampPurchase, format: 'Vinyl' as const };
    const vinylRelease = { 
      ...mockDiscogsRelease, 
      formats: [{ name: 'LP', qty: '1', descriptions: ['Album'] }]
    };
    const result = calculateMatchConfidence(vinylPurchase, vinylRelease);
    expect(result.breakdown.formatBonus).toBe(5);
  });
});

describe('matchAlbum', () => {
  const mockPurchase: BandcampPurchase = {
    artist: 'Björk',
    itemTitle: 'Homogenic',
    itemUrl: 'https://bjork.bandcamp.com/album/homogenic',
    purchaseDate: new Date('2024-01-01'),
    format: 'CD',
    rawFormat: 'Compact Disc',
  };

  const mockReleases: DiscogsRelease[] = [
    {
      id: 1,
      title: 'Homogenic',
      artists_sort: 'Björk',
      year: 1997,
      resource_url: 'https://api.discogs.com/releases/1',
      uri: '/releases/1'
    },
    {
      id: 2,
      title: 'Homogenic (Remixes)',
      artists_sort: 'Björk',
      year: 1998,
      resource_url: 'https://api.discogs.com/releases/2',
      uri: '/releases/2'
    },
    {
      id: 3,
      title: 'Post',
      artists_sort: 'Björk',
      year: 1995,
      resource_url: 'https://api.discogs.com/releases/3',
      uri: '/releases/3'
    }
  ];

  it('should match exact album', () => {
    const result = matchAlbum(mockPurchase, mockReleases);
    expect(result.status).toBe('matched');
    expect(result.bestMatch?.release.id).toBe(1);
    expect(result.bestMatch?.confidence).toBeGreaterThanOrEqual(95);
  });

  it('should return alternatives', () => {
    const result = matchAlbum(mockPurchase, mockReleases);
    expect(result.alternatives.length).toBeGreaterThan(0);
    expect(result.alternatives[0].release.id).toBe(2);
  });

  it('should handle no matches', () => {
    const noMatchPurchase = { ...mockPurchase, artist: 'Unknown Artist', itemTitle: 'Unknown Album' };
    const result = matchAlbum(noMatchPurchase, mockReleases);
    expect(result.status).toBe('no-match');
    expect(result.bestMatch?.confidence || 0).toBeLessThan(70);
  });

  it('should respect minConfidence option', () => {
    const result = matchAlbum(mockPurchase, mockReleases, { minConfidence: 50 });
    expect(result.bestMatch).not.toBeNull();
    expect(result.alternatives.every(alt => alt.confidence >= 50)).toBe(true);
  });

  it('should complete matching within 100ms', () => {
    const startTime = performance.now();
    matchAlbum(mockPurchase, mockReleases);
    const elapsedTime = performance.now() - startTime;
    expect(elapsedTime).toBeLessThan(100);
  });
});

describe('handleVariousArtists', () => {
  it('should normalize various artists variations', () => {
    expect(handleVariousArtists('Various')).toBe('Various Artists');
    expect(handleVariousArtists('various artists')).toBe('Various Artists');
    expect(handleVariousArtists('V.A.')).toBe('Various Artists');
    expect(handleVariousArtists('VA')).toBe('Various Artists');
    expect(handleVariousArtists('Compilation')).toBe('Various Artists');
  });

  it('should not change other artist names', () => {
    expect(handleVariousArtists('The Beatles')).toBe('The Beatles');
    expect(handleVariousArtists('VA Band')).toBe('VA Band');
  });
});

describe('extractSplitArtists', () => {
  it('should extract artists separated by slash', () => {
    const artists = extractSplitArtists('Artist1 / Artist2');
    expect(artists).toEqual(['Artist1', 'Artist2']);
  });

  it('should handle multiple separators', () => {
    const artists = extractSplitArtists('Artist1 feat. Artist2 & Artist3');
    expect(artists).toEqual(['Artist1', 'Artist2', 'Artist3']);
  });

  it('should handle single artist', () => {
    const artists = extractSplitArtists('Single Artist');
    expect(artists).toEqual(['Single Artist']);
  });
});

describe('Edge cases', () => {
  const mockReleases: DiscogsRelease[] = [
    {
      id: 1,
      title: 'F♯ A♯ ∞',
      artists_sort: 'Godspeed You! Black Emperor',
      year: 1997,
      resource_url: 'https://api.discogs.com/releases/1',
      uri: '/releases/1'
    }
  ];

  it('should handle special characters in titles', () => {
    const purchase: BandcampPurchase = {
      artist: 'Godspeed You Black Emperor',
      itemTitle: 'F# A# Infinity',
      itemUrl: 'https://example.com',
      purchaseDate: new Date(),
      format: 'Vinyl',
      rawFormat: '12" Vinyl',
    };

    const result = matchAlbum(purchase, mockReleases);
    expect(result.status).toBe('review');
    expect(result.bestMatch).not.toBeNull();
  });

  it('should handle compilations', () => {
    const compilation: BandcampPurchase = {
      artist: 'Various Artists',
      itemTitle: 'Summer Compilation 2024',
      itemUrl: 'https://example.com',
      purchaseDate: new Date(),
      format: 'Digital',
      rawFormat: 'Digital',
    };

    const result = matchAlbum(compilation, []);
    expect(result.searchQuery.artist).toBe('Various Artists');
  });
});