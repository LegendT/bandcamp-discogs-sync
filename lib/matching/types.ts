import { BandcampPurchase } from '../../types/bandcamp';
import { DiscogsRelease } from '../../types/discogs';

export interface MatchResult {
  confidence: number;
  release: DiscogsRelease;
  matchType: 'exact' | 'normalized' | 'fuzzy';
  breakdown: {
    artistScore: number;
    titleScore: number;
    formatBonus: number;
  };
}

export interface MatchingOptions {
  includeAlternatives?: boolean;
  maxAlternatives?: number;
  formatStrictness?: 'strict' | 'loose' | 'any';
  minConfidence?: number;
}

export interface MatchingResponse {
  bestMatch: MatchResult | null;
  alternatives: MatchResult[];
  searchQuery: {
    artist: string;
    title: string;
    format?: string;
  };
  status: 'matched' | 'review' | 'no-match';
}

export interface StringNormalizationOptions {
  removeArticles?: boolean;
  expandAbbreviations?: boolean;
  normalizeSpecialChars?: boolean;
}

export type FormatMapping = {
  [key: string]: string[];
};