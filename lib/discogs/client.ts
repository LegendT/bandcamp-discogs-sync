import axios from 'axios';

const DISCOGS_BASE_URL = 'https://api.discogs.com';

export class DiscogsClient {
  private token: string;
  private client;

  constructor() {
    this.token = process.env.DISCOGS_USER_TOKEN || '';
    if (!this.token) {
      console.warn('DISCOGS_USER_TOKEN not set in environment');
    }
    
    this.client = axios.create({
      baseURL: DISCOGS_BASE_URL,
      headers: {
        'Authorization': `Discogs token=${this.token}`,
        'User-Agent': 'BCDCSync/1.0 +http://localhost:3000'
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
      return { 
        success: false, 
        error: error.response?.data?.message || 'Connection failed' 
      };
    }
  }

  // TODO: Add search method in next story
}