import { BandcampPurchase } from './bandcamp';
import { DiscogsRelease } from './discogs';

export interface MatchCandidate {
  bandcampItem: BandcampPurchase;
  discogsRelease: DiscogsRelease;
  confidence: number; // 0-100
  matchReason: string;
}

export interface DiscogsSearchQuery {
  artist: string;
  title: string;
  format?: string;
}