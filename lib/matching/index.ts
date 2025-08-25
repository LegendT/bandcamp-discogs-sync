export {
  matchAlbum,
  calculateMatchConfidence,
  normalizeString,
  calculateStringSimilarity,
  calculateTokenSimilarity,
  handleVariousArtists,
  extractSplitArtists
} from './engine';

export {
  getDiscogsFormatsForBandcamp,
  formatMatchesDiscogs,
  getFormatBonus
} from './formats';

export {
  extractEditionInfo,
  calculateEditionAwareSimilarity
} from './utils';

export type {
  MatchResult,
  MatchingOptions,
  MatchingResponse,
  StringNormalizationOptions,
  FormatMapping
} from './types';

export type {
  EditionInfo
} from './utils';