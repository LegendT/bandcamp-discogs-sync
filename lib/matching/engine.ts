import { BandcampPurchase } from '../../types/bandcamp';
import { DiscogsRelease } from '../../types/discogs';
import { logger } from '../utils/logger';
import { 
  MatchResult, 
  MatchingOptions, 
  MatchingResponse,
  StringNormalizationOptions 
} from './types';
import { getFormatBonus } from './formats';
import { calculateEditionAwareSimilarity } from './utils';

const ARTIST_WEIGHT = 0.6;
const TITLE_WEIGHT = 0.4;

const AUTO_MATCH_THRESHOLD = 95;
const REVIEW_THRESHOLD = 70;

const DEFAULT_OPTIONS: MatchingOptions = {
  includeAlternatives: true,
  maxAlternatives: 3,
  formatStrictness: 'loose',
  minConfidence: 0
};

// Cache for normalized strings to avoid repeated computation
const normalizeCache = new Map<string, string>();
const CACHE_MAX_SIZE = 1000;

export function normalizeString(
  str: string | undefined | null, 
  options: StringNormalizationOptions = {}
): string {
  // Handle undefined/null values
  if (!str) {
    return '';
  }
  
  // Create cache key
  const cacheKey = `${str}::${JSON.stringify(options)}`;
  
  // Check cache first
  const cached = normalizeCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  
  let normalized = str.trim();
  
  // Normalize Roman numerals to numbers (before lowercasing)
  const romanNumerals: Record<string, string> = {
    'XX': '20', 'XIX': '19', 'XVIII': '18', 'XVII': '17', 'XVI': '16',
    'XV': '15', 'XIV': '14', 'XIII': '13', 'XII': '12', 'XI': '11',
    'X': '10', 'IX': '9', 'VIII': '8', 'VII': '7', 'VI': '6',
    'V': '5', 'IV': '4', 'III': '3', 'II': '2', 'I': '1'
  };
  
  // Process from longest to shortest to avoid partial matches
  Object.entries(romanNumerals).forEach(([roman, arabic]) => {
    normalized = normalized.replace(new RegExp(`\\b${roman}\\b`, 'g'), arabic);
  });
  
  // Now lowercase
  normalized = normalized.toLowerCase();
  
  // Normalize Unicode characters to ASCII equivalents
  normalized = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe');
  
  // First, normalize special quotes and dashes
  normalized = normalized
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ');
  
  // Expand abbreviations before removing punctuation
  if (options.expandAbbreviations !== false) {
    normalized = normalized
      .replace(/\bfeat\.?\s/gi, 'featuring ')
      .replace(/&/g, ' and ')
      .replace(/\bvol\.?\s/gi, 'volume ')
      .replace(/\bpt\.?\s/gi, 'part ')
      .replace(/\bep\.?\s/gi, 'ep ');
  }
  
  // Remove all non-word characters except spaces and hyphens
  normalized = normalized.replace(/[^\w\s-]/g, '');
  
  // Remove hyphens to handle cases like "rock—roll" -> "rockroll"
  normalized = normalized.replace(/-/g, '');
  
  // Remove articles
  if (options.removeArticles !== false) {
    normalized = normalized.replace(/^(the|a|an)\s+/i, '');
  }
  
  // Clean up any multiple spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // Cache the result
  if (normalizeCache.size >= CACHE_MAX_SIZE) {
    // Clear cache if it gets too large (simple LRU)
    const firstKey = normalizeCache.keys().next().value;
    normalizeCache.delete(firstKey);
  }
  normalizeCache.set(cacheKey, normalized);
  
  return normalized;
}

export function calculateLevenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

export function calculateStringSimilarity(a: string, b: string): number {
  if (a === b) return 100;
  
  const normalizedA = normalizeString(a);
  const normalizedB = normalizeString(b);
  
  if (normalizedA === normalizedB) return 98;
  
  const distance = calculateLevenshteinDistance(normalizedA, normalizedB);
  const maxLength = Math.max(normalizedA.length, normalizedB.length);
  
  if (maxLength === 0) return 100;
  
  const similarity = ((maxLength - distance) / maxLength) * 100;
  return Math.max(0, Math.round(similarity));
}

export function calculateTokenSimilarity(a: string, b: string): number {
  const tokensA = normalizeString(a).split(' ').filter(t => t.length > 0);
  const tokensB = normalizeString(b).split(' ').filter(t => t.length > 0);
  
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  
  // Create frequency maps for O(n) matching instead of O(n²)
  const freqA = new Map<string, number>();
  const freqB = new Map<string, number>();
  
  // Count token frequencies
  tokensA.forEach(token => freqA.set(token, (freqA.get(token) || 0) + 1));
  tokensB.forEach(token => freqB.set(token, (freqB.get(token) || 0) + 1));
  
  // Calculate intersection
  let matchCount = 0;
  freqA.forEach((countA, token) => {
    const countB = freqB.get(token) || 0;
    matchCount += Math.min(countA, countB);
  });
  
  // Use Jaccard similarity coefficient
  const totalUnique = new Set([...tokensA, ...tokensB]).size;
  const similarity = totalUnique > 0 ? (matchCount / totalUnique) * 100 : 0;
  
  return Math.round(similarity);
}

export function calculateMatchConfidence(
  bandcampPurchase: BandcampPurchase,
  discogsRelease: DiscogsRelease,
  options: MatchingOptions = {}
): MatchResult {
  // Extract artist from title if artists_sort is not available
  // Discogs search results often return titles as "Artist - Album"
  let discogsArtist = discogsRelease.artists_sort;
  if (!discogsArtist && discogsRelease.title) {
    const titleParts = discogsRelease.title.split(' - ');
    if (titleParts.length >= 2) {
      discogsArtist = titleParts[0].trim();
    }
  }
  
  // If still no artist, use empty string to avoid errors
  if (!discogsArtist) {
    discogsArtist = '';
  }
  
  const artistSimilarity = Math.max(
    calculateStringSimilarity(bandcampPurchase.artist, discogsArtist),
    calculateTokenSimilarity(bandcampPurchase.artist, discogsArtist)
  );
  
  // Extract album title from Discogs title if it contains " - "
  let discogsTitle = discogsRelease.title;
  if (discogsRelease.title && discogsRelease.title.includes(' - ')) {
    const titleParts = discogsRelease.title.split(' - ');
    if (titleParts.length >= 2) {
      // Take everything after the first " - " as the album title
      discogsTitle = titleParts.slice(1).join(' - ').trim();
    }
  }
  
  const titleSimilarity = Math.max(
    calculateStringSimilarity(bandcampPurchase.itemTitle, discogsTitle),
    calculateTokenSimilarity(bandcampPurchase.itemTitle, discogsTitle),
    calculateEditionAwareSimilarity(
      bandcampPurchase.itemTitle, 
      discogsTitle,
      calculateStringSimilarity
    )
  );
  
  const baseScore = (artistSimilarity * ARTIST_WEIGHT) + (titleSimilarity * TITLE_WEIGHT);
  
  const formatBonus = options.formatStrictness === 'any' 
    ? 0 
    : getFormatBonus(bandcampPurchase.format, discogsRelease.formats);
  
  const confidence = Math.min(100, Math.max(0, Math.round(baseScore + formatBonus)));
  
  let matchType: 'exact' | 'normalized' | 'fuzzy';
  
  // Check if the original strings are exactly the same
  const exactArtistMatch = bandcampPurchase.artist === discogsArtist;
  const exactTitleMatch = bandcampPurchase.itemTitle === discogsTitle;
  
  if (exactArtistMatch && exactTitleMatch) {
    matchType = 'exact';
  } else if (artistSimilarity >= 98 && titleSimilarity >= 98) {
    matchType = 'normalized';
  } else {
    matchType = 'fuzzy';
  }
  
  return {
    confidence,
    release: discogsRelease,
    matchType,
    breakdown: {
      artistScore: Math.round(artistSimilarity),
      titleScore: Math.round(titleSimilarity),
      formatBonus
    }
  };
}

export function matchAlbum(
  bandcampPurchase: BandcampPurchase,
  discogsReleases: DiscogsRelease[],
  options: MatchingOptions = {}
): MatchingResponse {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  
  const startTime = process.env.NODE_ENV === 'development' ? performance.now() : 0;
  
  if (process.env.NODE_ENV === 'development') {
    logger.info(`Matching "${bandcampPurchase.artist} - ${bandcampPurchase.itemTitle}"`, {
      format: bandcampPurchase.format,
      releaseCount: discogsReleases.length
    });
  }
  
  const matches = discogsReleases
    .map(release => calculateMatchConfidence(bandcampPurchase, release, mergedOptions))
    .filter(match => match.confidence >= mergedOptions.minConfidence!)
    .sort((a, b) => b.confidence - a.confidence);
  
  if (process.env.NODE_ENV === 'development') {
    const elapsedTime = performance.now() - startTime;
    logger.debug(`Matching completed in ${elapsedTime.toFixed(2)}ms`);
  }
  
  const bestMatch = matches[0] || null;
  const alternatives = mergedOptions.includeAlternatives 
    ? matches.slice(1, mergedOptions.maxAlternatives! + 1)
    : [];
  
  let status: 'matched' | 'review' | 'no-match';
  if (!bestMatch || bestMatch.confidence < REVIEW_THRESHOLD) {
    status = 'no-match';
  } else if (bestMatch.confidence >= AUTO_MATCH_THRESHOLD) {
    status = 'matched';
  } else {
    status = 'review';
  }
  
  if (process.env.NODE_ENV === 'development') {
    logger.info(`Match result: ${status}`, {
      confidence: bestMatch?.confidence,
      matchType: bestMatch?.matchType,
      alternativeCount: alternatives.length
    });
  }
  
  return {
    bestMatch,
    alternatives,
    searchQuery: {
      artist: bandcampPurchase.artist,
      title: bandcampPurchase.itemTitle,
      format: bandcampPurchase.format
    },
    status
  };
}

export function handleVariousArtists(artist: string): string {
  const variousArtistsPatterns = [
    /^various$/i,
    /^various artists$/i,
    /^v\.a\.$/i,
    /^va$/i,
    /^compilation$/i
  ];
  
  for (const pattern of variousArtistsPatterns) {
    if (pattern.test(artist.trim())) {
      return 'Various Artists';
    }
  }
  
  return artist;
}

export function extractSplitArtists(artist: string): string[] {
  const separators = [' / ', ' & ', ' and ', ' feat. ', ' featuring ', ' with ', ' vs ', ' vs. '];
  
  let artists = [artist];
  for (const separator of separators) {
    const newArtists: string[] = [];
    for (const a of artists) {
      newArtists.push(...a.split(separator));
    }
    artists = newArtists;
  }
  
  return artists.map(a => a.trim()).filter(a => a.length > 0);
}