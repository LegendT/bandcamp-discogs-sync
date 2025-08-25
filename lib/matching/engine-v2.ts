import { BandcampPurchase } from '../../types/bandcamp';
import { DiscogsRelease } from '../../types/discogs';
import { logger } from '../utils/logger';
import { 
  MatchResult, 
  MatchingOptions, 
  MatchingResponse,
  StringNormalizationOptions 
} from './types';
import { formatMatchesDiscogs } from './formats';

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

export function normalizeString(
  str: string, 
  options: StringNormalizationOptions = {}
): string {
  const cacheKey = `${str}::${JSON.stringify(options)}`;
  const cached = normalizeCache.get(cacheKey);
  if (cached) return cached;
  
  let normalized = str.toLowerCase().trim();
  
  // Normalize Unicode characters to ASCII equivalents
  normalized = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ß/g, 'ss')
    .replace(/ñ/g, 'n')
    .replace(/ł/g, 'l')
    .replace(/đ/g, 'd');
  
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
      .replace(/\bft\.?\s/gi, 'featuring ')
      .replace(/&/g, ' and ')
      .replace(/\bvol\.?\s/gi, 'volume ')
      .replace(/\bpt\.?\s/gi, 'part ')
      .replace(/\bep\.?\s/gi, 'ep ')
      .replace(/\bno\.?\s/gi, 'number ');
  }
  
  // Remove all non-word characters except spaces and hyphens
  normalized = normalized.replace(/[^\w\s-]/g, '');
  
  // Remove hyphens to handle cases like "rock—roll" -> "rockroll"
  normalized = normalized.replace(/-/g, ' ');
  
  // Remove articles
  if (options.removeArticles !== false) {
    normalized = normalized.replace(/^(the|a|an)\s+/i, '');
  }
  
  // Clean up any multiple spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // Cache the result
  if (normalizeCache.size > 1000) {
    // Clear cache if it gets too large
    normalizeCache.clear();
  }
  normalizeCache.set(cacheKey, normalized);
  
  return normalized;
}

export function calculateLevenshteinDistance(a: string, b: string): number {
  // Early exit for identical strings
  if (a === b) return 0;
  
  // Early exit for empty strings
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  
  // Use single array instead of matrix for better memory efficiency
  let previousRow = Array(b.length + 1);
  let currentRow = Array(b.length + 1);
  
  // Initialize first row
  for (let j = 0; j <= b.length; j++) {
    previousRow[j] = j;
  }
  
  for (let i = 1; i <= a.length; i++) {
    currentRow[0] = i;
    
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currentRow[j] = Math.min(
        previousRow[j] + 1,     // deletion
        currentRow[j - 1] + 1,   // insertion
        previousRow[j - 1] + cost // substitution
      );
    }
    
    // Swap rows
    [previousRow, currentRow] = [currentRow, previousRow];
  }
  
  return previousRow[b.length];
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
  
  // Create frequency maps for more efficient matching
  const freqA = new Map<string, number>();
  const freqB = new Map<string, number>();
  
  tokensA.forEach(token => freqA.set(token, (freqA.get(token) || 0) + 1));
  tokensB.forEach(token => freqB.set(token, (freqB.get(token) || 0) + 1));
  
  let matchCount = 0;
  let totalTokens = 0;
  
  // Count matches based on minimum frequency
  freqA.forEach((count, token) => {
    const countB = freqB.get(token) || 0;
    matchCount += Math.min(count, countB);
    totalTokens += count;
  });
  
  freqB.forEach((count, token) => {
    if (!freqA.has(token)) {
      totalTokens += count;
    }
  });
  
  const similarity = totalTokens > 0 ? (matchCount * 2 / totalTokens) * 100 : 0;
  return Math.round(similarity);
}

export function getFormatBonus(
  bandcampFormat: string,
  discogsFormats?: Array<{ name: string }>,
  strictness: 'strict' | 'loose' | 'any' = 'loose'
): number {
  if (strictness === 'any' || !discogsFormats || discogsFormats.length === 0) {
    return 0;
  }
  
  // Digital purchases are format-agnostic
  if (bandcampFormat === 'Digital') {
    return 0;
  }
  
  // Check if any Discogs format matches the Bandcamp format
  const hasMatch = discogsFormats.some(format => 
    formatMatchesDiscogs(bandcampFormat as any, format.name)
  );
  
  // Scale bonus based on confidence and strictness
  if (strictness === 'strict') {
    return hasMatch ? 10 : -10;
  } else {
    return hasMatch ? 5 : -2;
  }
}

export function calculateYearBonus(
  bandcampPurchase: BandcampPurchase,
  discogsRelease: DiscogsRelease
): number {
  // If we don't have year info, no bonus
  if (!discogsRelease.year) return 0;
  
  const purchaseYear = bandcampPurchase.purchaseDate.getFullYear();
  const releaseYear = discogsRelease.year;
  
  // Prefer newer releases when purchase is recent
  if (purchaseYear - releaseYear <= 2) {
    return 2; // Small bonus for recent releases
  } else if (releaseYear > purchaseYear) {
    return -5; // Penalty for releases after purchase date
  }
  
  return 0;
}

export function calculateMatchConfidence(
  bandcampPurchase: BandcampPurchase,
  discogsRelease: DiscogsRelease,
  options: MatchingOptions = {}
): MatchResult {
  const artistSimilarity = Math.max(
    calculateStringSimilarity(bandcampPurchase.artist, discogsRelease.artists_sort),
    calculateTokenSimilarity(bandcampPurchase.artist, discogsRelease.artists_sort)
  );
  
  const titleSimilarity = Math.max(
    calculateStringSimilarity(bandcampPurchase.itemTitle, discogsRelease.title),
    calculateTokenSimilarity(bandcampPurchase.itemTitle, discogsRelease.title)
  );
  
  const baseScore = (artistSimilarity * ARTIST_WEIGHT) + (titleSimilarity * TITLE_WEIGHT);
  
  const formatBonus = getFormatBonus(
    bandcampPurchase.format,
    discogsRelease.formats,
    options.formatStrictness
  );
  
  const yearBonus = calculateYearBonus(bandcampPurchase, discogsRelease);
  
  const confidence = Math.min(100, Math.max(0, Math.round(baseScore + formatBonus + yearBonus)));
  
  let matchType: 'exact' | 'normalized' | 'fuzzy';
  
  // Check if the original strings are exactly the same
  const exactArtistMatch = bandcampPurchase.artist === discogsRelease.artists_sort;
  const exactTitleMatch = bandcampPurchase.itemTitle === discogsRelease.title;
  
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
      formatBonus: Math.round(formatBonus + yearBonus)
    }
  };
}

export function matchAlbum(
  bandcampPurchase: BandcampPurchase,
  discogsReleases: DiscogsRelease[],
  options: MatchingOptions = {}
): MatchingResponse {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  
  const startTime = performance.now();
  
  logger.info(`Matching "${bandcampPurchase.artist} - ${bandcampPurchase.itemTitle}"`, {
    format: bandcampPurchase.format,
    releaseCount: discogsReleases.length
  });
  
  // Pre-process artist for Various Artists
  const processedPurchase = {
    ...bandcampPurchase,
    artist: handleVariousArtists(bandcampPurchase.artist)
  };
  
  const matches = discogsReleases
    .map(release => calculateMatchConfidence(processedPurchase, release, mergedOptions))
    .filter(match => match.confidence >= mergedOptions.minConfidence!)
    .sort((a, b) => {
      // Sort by confidence first
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }
      // Then prefer exact matches
      if (a.matchType !== b.matchType) {
        const typeOrder = { exact: 3, normalized: 2, fuzzy: 1 };
        return typeOrder[b.matchType] - typeOrder[a.matchType];
      }
      // Finally, prefer newer releases
      return (b.release.year || 0) - (a.release.year || 0);
    });
  
  const elapsedTime = performance.now() - startTime;
  logger.debug(`Matching completed in ${elapsedTime.toFixed(2)}ms`);
  
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
  
  logger.info(`Match result: ${status}`, {
    confidence: bestMatch?.confidence,
    matchType: bestMatch?.matchType,
    alternativeCount: alternatives.length
  });
  
  return {
    bestMatch,
    alternatives,
    searchQuery: {
      artist: processedPurchase.artist,
      title: processedPurchase.itemTitle,
      format: processedPurchase.format
    },
    status
  };
}

export function handleVariousArtists(artist: string): string {
  const normalized = artist.trim().toLowerCase();
  
  const variousArtistsPatterns = [
    'various',
    'various artists',
    'v.a.',
    'va',
    'compilation',
    'various artist',
    'varios artistas',
    'artisti vari',
    'verschiedene'
  ];
  
  if (variousArtistsPatterns.includes(normalized)) {
    return 'Various Artists';
  }
  
  return artist;
}

export function extractSplitArtists(artist: string): string[] {
  // More sophisticated split handling
  const patterns = [
    { separator: /\s+\/\s+/, weight: 1.0 },    // " / "
    { separator: /\s+\&\s+/, weight: 0.9 },    // " & "
    { separator: /\s+and\s+/i, weight: 0.8 },  // " and "
    { separator: /\s+feat\.?\s+/i, weight: 0.7 }, // " feat "
    { separator: /\s+featuring\s+/i, weight: 0.7 }, // " featuring "
    { separator: /\s+with\s+/i, weight: 0.6 }, // " with "
    { separator: /\s+vs\.?\s+/i, weight: 0.5 }, // " vs "
    { separator: /,\s+/, weight: 0.4 }         // ", "
  ];
  
  let currentArtists = [artist];
  
  for (const { separator } of patterns) {
    const newArtists: string[] = [];
    for (const a of currentArtists) {
      const parts = a.split(separator);
      newArtists.push(...parts);
    }
    currentArtists = newArtists;
  }
  
  return currentArtists
    .map(a => a.trim())
    .filter(a => a.length > 0)
    .filter((a, index, self) => self.indexOf(a) === index); // Remove duplicates
}