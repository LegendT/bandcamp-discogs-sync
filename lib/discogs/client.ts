import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '@/lib/utils/logger';
import { DiscogsRelease, DiscogsSearchResult } from '@/types/discogs';
import { DiscogsSearchQuery } from '@/types/matching';
import { getDiscogsRateLimiter } from './rate-limiter';

const DISCOGS_BASE_URL = 'https://api.discogs.com';

export class DiscogsClient {
  private token: string;
  private client: AxiosInstance;
  private rateLimiter = getDiscogsRateLimiter();

  constructor(token?: string) {
    this.token = token || process.env.DISCOGS_USER_TOKEN || '';
    if (!this.token) {
      logger.warn('No Discogs token provided');
    }
    
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    this.client = axios.create({
      baseURL: DISCOGS_BASE_URL,
      headers: {
        'Authorization': `Discogs token=${this.token}`,
        'User-Agent': `BCDCSync/1.0 +${appUrl}`
      },
      timeout: 10000 // 10 second timeout
    });
  }

  async testConnection() {
    return this.rateLimiter.execute(async () => {
      try {
        // Test with identity endpoint (always available)
        const response = await this.client.get('/oauth/identity');
        return { 
          success: true, 
          username: response.data.username,
          message: 'Connected to Discogs API' 
        };
      } catch (error) {
        logger.error('Discogs connection failed:', error);
        const errorMessage = axios.isAxiosError(error) 
          ? error.response?.data?.message || error.message
          : 'Connection failed';
        return { 
          success: false, 
          error: errorMessage
        };
      }
    }, 'testConnection');
  }

  /**
   * Search for releases on Discogs
   * @param query - Search parameters (artist, title, optional format)
   * @returns Array of matching releases (first page only for MVP)
   */
  async searchReleases(query: DiscogsSearchQuery): Promise<DiscogsRelease[]> {
    return this.rateLimiter.execute(async () => {
      try {
        const params: Record<string, any> = {
          type: 'release',
          per_page: 20 // Reasonable limit for MVP
        };

        // Build search query
        if (query.artist && query.title) {
          // Search by both artist and title
          params.q = `${query.artist} ${query.title}`;
          params.artist = query.artist;
          params.release_title = query.title;
        } else if (query.artist) {
          params.artist = query.artist;
        } else if (query.title) {
          params.release_title = query.title;
        }

        // Add format filter if specified
        if (query.format && query.format !== 'Digital') {
          params.format = query.format;
        }

        // Log search without sensitive data
        logger.info(`Searching Discogs for: ${query.artist || 'any artist'} - ${query.title || 'any title'}`);
        
        const response = await this.client.get<DiscogsSearchResult>('/database/search', { params });
        
        return response.data.results || [];
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (error.response?.status === 429) {
            logger.error('Rate limit exceeded. Please try again later.');
            throw new Error('Rate limit exceeded');
          }
          if (error.response?.status === 401) {
            logger.error('Discogs authentication failed. Check your API token.');
            throw new Error('Authentication failed');
          }
          logger.error(`Discogs search failed: ${error.response?.data?.message || error.message}`);
          throw new Error(`Search failed: ${error.response?.data?.message || error.message}`);
        } else {
          logger.error('Discogs search failed:', error);
          throw error;
        }
      }
    }, `searchReleases: ${query.artist} - ${query.title}`);
  }

  /**
   * Add a release to user's collection
   * Requires valid user token with collection_write scope
   */
  async addToCollection(releaseId: number): Promise<{ success: boolean; error?: string }> {
    if (!this.token) {
      return { 
        success: false, 
        error: 'Discogs token not configured. Add DISCOGS_USER_TOKEN to your .env.local file.' 
      };
    }

    return this.rateLimiter.execute(async () => {
      try {
        // Get username first
        const identityResponse = await this.client.get('/oauth/identity');
        const username = identityResponse.data.username;

        // Add to collection (folder 1 is "All" folder)
        await this.client.post(
          `/users/${username}/collection/folders/1/releases/${releaseId}`,
          {}
        );

        logger.info(`Added release ${releaseId} to collection`);
        return { success: true };
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const message = error.response?.data?.message || error.message;
          logger.error(`Failed to add to collection: ${message}`);
          
          // Check for common errors
          if (error.response?.status === 401) {
            return { success: false, error: 'Invalid Discogs token. Please check your token.' };
          }
          if (error.response?.status === 404) {
            return { success: false, error: 'Release not found on Discogs.' };
          }
          if (error.response?.status === 422) {
            return { success: false, error: 'This release is already in your collection.' };
          }
          
          return { success: false, error: message };
        }
        return { success: false, error: 'Failed to add to collection' };
      }
    }, `addToCollection: ${releaseId}`);
  }
}