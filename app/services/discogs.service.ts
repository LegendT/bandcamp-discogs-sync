import type { MatchResult } from '@/types/matching';

export class DiscogsService {
  private baseUrl = '/api';

  async validateToken(token: string): Promise<{ valid: boolean; username?: string }> {
    const response = await fetch(`${this.baseUrl}/sync`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Discogs-Token': token
      },
      body: JSON.stringify({ matches: [] }),
    });

    if (response.ok) {
      const data = await response.json();
      return { valid: true, username: data.username || 'Connected' };
    }
    
    return { valid: false };
  }

  async processMatches(purchases: any[]): Promise<MatchResult[]> {
    const response = await fetch(`${this.baseUrl}/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchases }),
    });

    if (!response.ok) {
      throw new Error('Failed to process matches');
    }

    const result = await response.json();
    return result.matches;
  }

  async syncToCollection(token: string, matches: MatchResult[]): Promise<{
    results: { successful: any[]; failed: any[] };
    message: string;
  }> {
    const response = await fetch(`${this.baseUrl}/sync`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Discogs-Token': token
      },
      body: JSON.stringify({ matches: matches.slice(0, 20) }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Sync failed');
    }

    return data;
  }

  async uploadCSV(file: File): Promise<{
    sessionId: string;
    purchases: any[];
    itemCount: number;
  }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.baseUrl}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }

    return response.json();
  }
}

// Singleton instance
export const discogsService = new DiscogsService();