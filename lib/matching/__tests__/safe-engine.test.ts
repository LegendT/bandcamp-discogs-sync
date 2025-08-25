import { matchAlbumSafe, isMatchError, matchAlbumBatch } from '../safe-engine';
import { BandcampPurchase } from '../../../types/bandcamp';
import { DiscogsRelease } from '../../../types/discogs';
import * as engine from '../engine';

// Mock the logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('matchAlbumSafe', () => {
  const validPurchase: BandcampPurchase = {
    artist: 'Test Artist',
    itemTitle: 'Test Album',
    itemUrl: 'https://test.bandcamp.com',
    purchaseDate: new Date(),
    format: 'Digital',
    rawFormat: 'Digital'
  };

  const validRelease: DiscogsRelease = {
    id: 123,
    title: 'Test Album',
    artists_sort: 'Test Artist',
    year: 2024,
    resource_url: 'https://api.discogs.com/releases/123',
    uri: '/releases/123'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle valid inputs successfully', async () => {
    const result = await matchAlbumSafe(validPurchase, [validRelease]);
    
    expect(isMatchError(result)).toBe(false);
    if (!isMatchError(result)) {
      expect(result.status).toBeDefined();
      expect(result.searchQuery).toBeDefined();
    }
  });

  it('should handle missing purchase fields', async () => {
    const invalidPurchase = { artist: 'Test' } as any;
    const result = await matchAlbumSafe(invalidPurchase, [validRelease]);
    
    expect(isMatchError(result)).toBe(true);
    if (isMatchError(result)) {
      expect(result.type).toBe('invalid_data');
      expect(result.message).toContain('Missing or invalid required fields');
      expect(result.fallback).toBeDefined();
    }
  });

  it('should handle extremely long strings', async () => {
    const longPurchase = {
      ...validPurchase,
      artist: 'A'.repeat(1000)
    };
    
    const result = await matchAlbumSafe(longPurchase, [validRelease]);
    
    expect(isMatchError(result)).toBe(true);
    if (isMatchError(result)) {
      expect(result.type).toBe('invalid_data');
    }
  });

  it('should handle invalid release data', async () => {
    const invalidReleases = [{ title: 'Test' }] as any;
    const result = await matchAlbumSafe(validPurchase, invalidReleases);
    
    expect(isMatchError(result)).toBe(true);
    if (isMatchError(result)) {
      expect(result.type).toBe('invalid_data');
      expect(result.message).toContain('Invalid Discogs release data');
    }
  });

  it('should limit releases to prevent memory issues', async () => {
    const manyReleases = Array(200).fill(validRelease);
    const result = await matchAlbumSafe(validPurchase, manyReleases);
    
    expect(isMatchError(result)).toBe(false);
    // The actual limiting is done internally
  });

  it('should handle null/undefined inputs gracefully', async () => {
    const result1 = await matchAlbumSafe(null as any, [validRelease]);
    expect(isMatchError(result1)).toBe(true);
    
    const result2 = await matchAlbumSafe(validPurchase, null as any);
    expect(isMatchError(result2)).toBe(true);
  });

  it('should handle runtime errors from matching engine', async () => {
    // Mock matchAlbum to throw an error
    jest.spyOn(engine, 'matchAlbum').mockImplementation(() => {
      throw new Error('Test error');
    });
    
    const result = await matchAlbumSafe(validPurchase, [validRelease]);
    
    expect(isMatchError(result)).toBe(true);
    if (isMatchError(result)) {
      expect(result.type).toBe('runtime_error');
      expect(result.message).toContain('Test error');
      expect(result.fallback).toBeDefined();
    }
  });
});

describe('matchAlbumBatch', () => {
  const purchases: BandcampPurchase[] = [
    {
      artist: 'Artist 1',
      itemTitle: 'Album 1',
      itemUrl: 'https://test1.bandcamp.com',
      purchaseDate: new Date(),
      format: 'Digital',
      rawFormat: 'Digital'
    },
    {
      artist: 'Artist 2',
      itemTitle: 'Album 2',
      itemUrl: 'https://test2.bandcamp.com',
      purchaseDate: new Date(),
      format: 'Vinyl',
      rawFormat: '12" Vinyl'
    }
  ];

  const mockSearchFunction = jest.fn().mockResolvedValue([
    {
      id: 1,
      title: 'Album 1',
      artists_sort: 'Artist 1',
      year: 2024,
      resource_url: 'https://api.discogs.com/releases/1',
      uri: '/releases/1'
    }
  ]);

  it('should process multiple purchases', async () => {
    const results = await matchAlbumBatch(purchases, mockSearchFunction);
    
    expect(results).toHaveLength(2);
    expect(mockSearchFunction).toHaveBeenCalledTimes(2);
  });

  it('should isolate errors to individual purchases', async () => {
    // Make search fail for second purchase
    mockSearchFunction
      .mockResolvedValueOnce([{ id: 1, title: 'Album 1', artists_sort: 'Artist 1' }])
      .mockRejectedValueOnce(new Error('Search failed'));
    
    const results = await matchAlbumBatch(purchases, mockSearchFunction);
    
    expect(results).toHaveLength(2);
    expect(isMatchError(results[1])).toBe(true);
    if (isMatchError(results[1])) {
      expect(results[1].type).toBe('runtime_error');
      expect(results[1].message).toContain('Failed to process');
    }
  });
});