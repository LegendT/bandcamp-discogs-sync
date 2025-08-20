import axios, { AxiosInstance, AxiosError } from 'axios';

const DISCOGS_BASE_URL = 'https://api.discogs.com';

export class DiscogsClient {
  private token: string;
  private client: AxiosInstance;

  constructor() {
    this.token = process.env.DISCOGS_USER_TOKEN || '';
    if (!this.token) {
      console.warn('DISCOGS_USER_TOKEN not set in environment');
    }
    
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    this.client = axios.create({
      baseURL: DISCOGS_BASE_URL,
      headers: {
        'Authorization': `Discogs token=${this.token}`,
        'User-Agent': `BCDCSync/1.0 +${appUrl}`
      }
    });
  }

  async testConnection() {
    try {
      // Test with identity endpoint (always available)
      const response = await this.client.get('/oauth/identity');
      return { 
        success: true, 
        username: response.data.username,
        message: 'Connected to Discogs API' 
      };
    } catch (error) {
      console.error('Discogs connection failed:', error);
      const errorMessage = axios.isAxiosError(error) 
        ? error.response?.data?.message || error.message
        : 'Connection failed';
      return { 
        success: false, 
        error: errorMessage
      };
    }
  }

  // TODO: Add search method in next story
}