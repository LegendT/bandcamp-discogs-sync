import { BandcampPurchase } from '../../types/bandcamp';
import { DiscogsRelease } from '../../types/discogs';
import { logger } from '../utils/logger';
import { normalizeString, calculateStringSimilarity } from './engine';

/**
 * Advanced matching strategies for specific scenarios
 */

/**
 * Extract edition information from album titles
 */
export function extractEditionInfo(title: string): {
  baseTitle: string;
  edition: string | null;
  year: number | null;
} {
  // Common edition patterns
  const editionPatterns = [
    /\(((?:deluxe|special|limited|expanded|collector'?s?|anniversary|remastered|remix|live|demo|acoustic|unplugged)\s*(?:edition|version|release)?)\)/i,
    /\[((?:deluxe|special|limited|expanded|collector'?s?|anniversary|remastered|remix|live|demo|acoustic|unplugged)\s*(?:edition|version|release)?)\]/i,
    /\(((?:\d{4})\s*(?:remaster|mix|version|edition))\)/i,
    /\[((?:\d{4})\s*(?:remaster|mix|version|edition))\]/i,
  ];
  
  let baseTitle = title;
  let edition: string | null = null;
  let year: number | null = null;
  
  for (const pattern of editionPatterns) {
    const match = title.match(pattern);
    if (match) {
      edition = match[1].trim();
      baseTitle = title.replace(pattern, '').trim();
      
      // Extract year if present
      const yearMatch = edition.match(/(\d{4})/);
      if (yearMatch) {
        year = parseInt(yearMatch[1], 10);
      }
      break;
    }
  }
  
  // Clean up extra spaces
  baseTitle = baseTitle.replace(/\s+/g, ' ').trim();
  
  return { baseTitle, edition, year };
}

/**
 * Calculate similarity with edition awareness
 */
export function calculateEditionAwareSimilarity(
  title1: string,
  title2: string
): number {
  const info1 = extractEditionInfo(title1);
  const info2 = extractEditionInfo(title2);
  
  // Base title similarity is most important
  const baseSimilarity = calculateStringSimilarity(info1.baseTitle, info2.baseTitle);
  
  // Edition similarity (if both have editions)
  let editionBonus = 0;
  if (info1.edition && info2.edition) {
    const editionSimilarity = calculateStringSimilarity(info1.edition, info2.edition);
    editionBonus = editionSimilarity * 0.1; // 10% weight for edition match
  } else if (!info1.edition && !info2.edition) {
    editionBonus = 5; // Small bonus for both being standard editions
  }
  
  return Math.min(100, baseSimilarity + editionBonus);
}

/**
 * Handle roman numerals conversion
 */
export function normalizeRomanNumerals(text: string): string {
  const romanMap: Record<string, string> = {
    'I': '1', 'II': '2', 'III': '3', 'IV': '4', 'V': '5',
    'VI': '6', 'VII': '7', 'VIII': '8', 'IX': '9', 'X': '10',
    'XI': '11', 'XII': '12', 'XIII': '13', 'XIV': '14', 'XV': '15',
    'XVI': '16', 'XVII': '17', 'XVIII': '18', 'XIX': '19', 'XX': '20'
  };
  
  // Match roman numerals at word boundaries
  return text.replace(/\b([IVX]+)\b/g, (match) => {
    return romanMap[match] || match;
  });
}

/**
 * Handle number word conversion
 */
export function normalizeNumberWords(text: string): string {
  const numberMap: Record<string, string> = {
    'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
    'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
    'ten': '10', 'eleven': '11', 'twelve': '12', 'thirteen': '13',
    'fourteen': '14', 'fifteen': '15', 'sixteen': '16', 'seventeen': '17',
    'eighteen': '18', 'nineteen': '19', 'twenty': '20',
    'first': '1st', 'second': '2nd', 'third': '3rd', 'fourth': '4th',
    'fifth': '5th', 'sixth': '6th', 'seventh': '7th', 'eighth': '8th',
    'ninth': '9th', 'tenth': '10th'
  };
  
  const pattern = new RegExp(`\\b(${Object.keys(numberMap).join('|')})\\b`, 'gi');
  return text.replace(pattern, (match) => numberMap[match.toLowerCase()] || match);
}

/**
 * Enhanced normalization with all strategies
 */
export function normalizeWithStrategies(text: string): string {
  let normalized = text;
  
  // Apply strategies in order
  normalized = normalizeRomanNumerals(normalized);
  normalized = normalizeNumberWords(normalized);
  normalized = normalizeString(normalized);
  
  return normalized;
}

/**
 * Smart artist name comparison that handles common variations
 */
export function compareArtistNames(artist1: string, artist2: string): number {
  // Direct comparison first
  const directScore = calculateStringSimilarity(artist1, artist2);
  if (directScore >= 95) return directScore;
  
  // Handle "Last, First" vs "First Last" format
  const commaMatch1 = artist1.match(/^(.+),\s*(.+)$/);
  const commaMatch2 = artist2.match(/^(.+),\s*(.+)$/);
  
  if (commaMatch1 && !commaMatch2) {
    const reordered = `${commaMatch1[2]} ${commaMatch1[1]}`;
    const reorderedScore = calculateStringSimilarity(reordered, artist2);
    if (reorderedScore > directScore) return reorderedScore;
  } else if (!commaMatch1 && commaMatch2) {
    const reordered = `${commaMatch2[2]} ${commaMatch2[1]}`;
    const reorderedScore = calculateStringSimilarity(artist1, reordered);
    if (reorderedScore > directScore) return reorderedScore;
  }
  
  // Handle "DJ" variations
  const dj1 = artist1.replace(/\bD\.?J\.?\s+/i, 'DJ ');
  const dj2 = artist2.replace(/\bD\.?J\.?\s+/i, 'DJ ');
  if (dj1 !== artist1 || dj2 !== artist2) {
    const djScore = calculateStringSimilarity(dj1, dj2);
    if (djScore > directScore) return djScore;
  }
  
  return directScore;
}

/**
 * Multi-pass matching algorithm
 */
export function multiPassMatch(
  purchase: BandcampPurchase,
  release: DiscogsRelease
): {
  confidence: number;
  strategy: string;
  details: Record<string, any>;
} {
  const strategies = [];
  
  // Strategy 1: Direct match
  const directArtist = calculateStringSimilarity(purchase.artist, release.artists_sort);
  const directTitle = calculateStringSimilarity(purchase.itemTitle, release.title);
  strategies.push({
    name: 'direct',
    artistScore: directArtist,
    titleScore: directTitle,
    combined: (directArtist * 0.6) + (directTitle * 0.4)
  });
  
  // Strategy 2: Edition-aware match
  const editionTitle = calculateEditionAwareSimilarity(purchase.itemTitle, release.title);
  strategies.push({
    name: 'edition-aware',
    artistScore: directArtist,
    titleScore: editionTitle,
    combined: (directArtist * 0.6) + (editionTitle * 0.4)
  });
  
  // Strategy 3: Smart artist + normalized title
  const smartArtist = compareArtistNames(purchase.artist, release.artists_sort);
  const normalizedTitle = calculateStringSimilarity(
    normalizeWithStrategies(purchase.itemTitle),
    normalizeWithStrategies(release.title)
  );
  strategies.push({
    name: 'smart-normalized',
    artistScore: smartArtist,
    titleScore: normalizedTitle,
    combined: (smartArtist * 0.6) + (normalizedTitle * 0.4)
  });
  
  // Find best strategy
  const bestStrategy = strategies.reduce((best, current) => 
    current.combined > best.combined ? current : best
  );
  
  logger.debug('Multi-pass matching strategies', {
    purchase: `${purchase.artist} - ${purchase.itemTitle}`,
    release: `${release.artists_sort} - ${release.title}`,
    strategies: strategies.map(s => ({ name: s.name, score: s.combined.toFixed(2) })),
    best: bestStrategy.name
  });
  
  return {
    confidence: Math.round(bestStrategy.combined),
    strategy: bestStrategy.name,
    details: bestStrategy
  };
}

/**
 * Catalog number matching for high precision
 */
export function extractCatalogNumber(text: string): string | null {
  // Common catalog number patterns
  const patterns = [
    /\b([A-Z]{2,5}[-\s]?\d{3,6})\b/, // ABC-1234 or ABC 1234
    /\b([A-Z]+\d+[A-Z]*)\b/, // ABC123 or ABC123D
    /\[([A-Z0-9-]+)\]/, // [CAT-123]
    /cat\.?\s*#?\s*([A-Z0-9-]+)/i, // cat# ABC-123
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].toUpperCase().replace(/\s+/g, '-');
    }
  }
  
  return null;
}

/**
 * Create a composite matching score using multiple strategies
 */
export function calculateCompositeScore(
  purchase: BandcampPurchase,
  release: DiscogsRelease,
  options: {
    useEditionMatching?: boolean;
    useCatalogNumbers?: boolean;
    useMultiPass?: boolean;
  } = {}
): number {
  if (options.useMultiPass) {
    const result = multiPassMatch(purchase, release);
    return result.confidence;
  }
  
  let score = 0;
  let weights = 0;
  
  // Basic matching (always used)
  const basicArtist = calculateStringSimilarity(purchase.artist, release.artists_sort);
  const basicTitle = calculateStringSimilarity(purchase.itemTitle, release.title);
  score += (basicArtist * 0.6) + (basicTitle * 0.4);
  weights += 1;
  
  // Edition matching
  if (options.useEditionMatching) {
    const editionScore = calculateEditionAwareSimilarity(purchase.itemTitle, release.title);
    score += editionScore * 0.3;
    weights += 0.3;
  }
  
  // Catalog number matching (if available)
  if (options.useCatalogNumbers) {
    const purchaseCat = extractCatalogNumber(purchase.itemTitle) || 
                       extractCatalogNumber(purchase.itemUrl);
    const releaseCat = extractCatalogNumber(release.title) || 
                       extractCatalogNumber(release.uri);
    
    if (purchaseCat && releaseCat) {
      const catScore = purchaseCat === releaseCat ? 100 : 0;
      score += catScore * 0.2;
      weights += 0.2;
    }
  }
  
  return Math.round(score / weights);
}