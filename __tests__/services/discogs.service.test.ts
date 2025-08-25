import { DiscogsService } from '@/app/services/discogs.service';

// Mock fetch globally
global.fetch = jest.fn();

describe('DiscogsService', () => {
  let service: DiscogsService;
  
  beforeEach(() => {
    service = new DiscogsService();
    jest.clearAllMocks();
  });

  describe('validateToken', () => {
    it('should return valid=true with username when token is valid', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ username: 'testuser' })
      });

      const result = await service.validateToken('valid-token');
      
      expect(result).toEqual({ valid: true, username: 'testuser' });
      expect(fetch).toHaveBeenCalledWith('/api/sync', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Discogs-Token': 'valid-token'
        },
        body: JSON.stringify({ matches: [] })
      });
    });

    it('should return valid=false when token is invalid', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401
      });

      const result = await service.validateToken('invalid-token');
      
      expect(result).toEqual({ valid: false });
    });
  });

  describe('processMatches', () => {
    it('should return matches from API', async () => {
      const mockMatches = [
        {
          bandcampItem: { 
            artist: 'Test', 
            itemTitle: 'Album',
            itemUrl: 'https://test.bandcamp.com/album/test',
            purchaseDate: new Date('2024-01-01'),
            format: 'Digital' as const,
            rawFormat: 'Digital'
          },
          discogsMatch: { 
            id: 123, 
            title: 'Test - Album', 
            artists_sort: 'Test',
            year: 2024,
            resource_url: 'https://api.discogs.com/releases/123',
            uri: '/Test-Album/release/123'
          },
          confidence: 0.9,
          reasoning: ['exact match']
        }
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ matches: mockMatches })
      });

      const result = await service.processMatches([{ artist: 'Test', title: 'Album' }]);
      
      expect(result).toEqual(mockMatches);
      expect(fetch).toHaveBeenCalledWith('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchases: [{ artist: 'Test', title: 'Album' }] })
      });
    });

    it('should throw error when API fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500
      });

      await expect(service.processMatches([])).rejects.toThrow('Failed to process matches');
    });
  });

  describe('syncToCollection', () => {
    it('should sync matches to collection', async () => {
      const mockMatches = [
        {
          bandcampItem: { 
            artist: 'Test', 
            itemTitle: 'Album',
            itemUrl: 'https://test.bandcamp.com/album/test',
            purchaseDate: new Date('2024-01-01'),
            format: 'Digital' as const,
            rawFormat: 'Digital'
          },
          discogsMatch: { 
            id: 123, 
            title: 'Test - Album', 
            artists_sort: 'Test',
            year: 2024,
            resource_url: 'https://api.discogs.com/releases/123',
            uri: '/Test-Album/release/123'
          },
          confidence: 0.9,
          reasoning: []
        }
      ];

      const mockResponse = {
        results: {
          successful: [{ releaseId: 123, title: 'Test - Album', artist: 'Test' }],
          failed: []
        },
        message: 'Synced 1 of 1 items'
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await service.syncToCollection('token123', mockMatches);
      
      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith('/api/sync', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Discogs-Token': 'token123'
        },
        body: JSON.stringify({ matches: mockMatches })
      });
    });

    it('should limit to 20 items', async () => {
      const mockMatches = Array(30).fill({
        bandcampItem: { 
          artist: 'Test', 
          itemTitle: 'Album',
          itemUrl: 'https://test.bandcamp.com/album/test',
          purchaseDate: new Date('2024-01-01'),
          format: 'Digital' as const,
          rawFormat: 'Digital'
        },
        discogsMatch: { 
          id: 123, 
          title: 'Test - Album', 
          artists_sort: 'Test',
          year: 2024,
          resource_url: 'https://api.discogs.com/releases/123',
          uri: '/Test-Album/release/123'
        },
        confidence: 0.9,
        reasoning: []
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: { successful: [], failed: [] } })
      });

      await service.syncToCollection('token123', mockMatches);
      
      const sentBody = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body);
      expect(sentBody.matches).toHaveLength(20);
    });
  });

  describe('uploadCSV', () => {
    it('should upload CSV file successfully', async () => {
      const mockFile = new File(['csv content'], 'test.csv', { type: 'text/csv' });
      const mockResponse = {
        sessionId: 'session123',
        purchases: [{ artist: 'Test', itemTitle: 'Album' }],
        itemCount: 1
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await service.uploadCSV(mockFile);
      
      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith('/api/upload', {
        method: 'POST',
        body: expect.any(FormData)
      });
    });

    it('should throw error with message from API', async () => {
      const mockFile = new File([''], 'empty.csv', { type: 'text/csv' });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'File is empty' })
      });

      await expect(service.uploadCSV(mockFile)).rejects.toThrow('File is empty');
    });
  });
});