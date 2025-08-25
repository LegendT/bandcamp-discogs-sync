import { MatchingOptions } from './types';

/**
 * Predefined matching configuration presets for different use cases
 */

export const MatchingPresets = {
  /**
   * Default preset - balanced accuracy and performance
   */
  default: {
    includeAlternatives: true,
    maxAlternatives: 3,
    formatStrictness: 'loose',
    minConfidence: 0
  } as MatchingOptions,

  /**
   * Strict preset - high precision, may miss some matches
   */
  strict: {
    includeAlternatives: true,
    maxAlternatives: 5,
    formatStrictness: 'strict',
    minConfidence: 80
  } as MatchingOptions,

  /**
   * Fuzzy preset - high recall, may have false positives
   */
  fuzzy: {
    includeAlternatives: true,
    maxAlternatives: 10,
    formatStrictness: 'any',
    minConfidence: 50
  } as MatchingOptions,

  /**
   * Fast preset - optimized for speed
   */
  fast: {
    includeAlternatives: false,
    maxAlternatives: 0,
    formatStrictness: 'any',
    minConfidence: 70
  } as MatchingOptions,

  /**
   * Compilation preset - optimized for Various Artists releases
   */
  compilation: {
    includeAlternatives: true,
    maxAlternatives: 5,
    formatStrictness: 'any',
    minConfidence: 60
  } as MatchingOptions,

  /**
   * Vinyl preset - strict format matching for vinyl collectors
   */
  vinyl: {
    includeAlternatives: true,
    maxAlternatives: 3,
    formatStrictness: 'strict',
    minConfidence: 70
  } as MatchingOptions,

  /**
   * Digital preset - format-agnostic for digital purchases
   */
  digital: {
    includeAlternatives: true,
    maxAlternatives: 3,
    formatStrictness: 'any',
    minConfidence: 0
  } as MatchingOptions
};

/**
 * Get preset by name with fallback to default
 */
export function getPreset(name: keyof typeof MatchingPresets): MatchingOptions {
  return MatchingPresets[name] || MatchingPresets.default;
}

/**
 * Merge custom options with a preset
 */
export function mergeWithPreset(
  presetName: keyof typeof MatchingPresets,
  customOptions: Partial<MatchingOptions>
): MatchingOptions {
  const preset = getPreset(presetName);
  return { ...preset, ...customOptions };
}

/**
 * Determine best preset based on purchase characteristics
 */
export function suggestPreset(purchase: {
  artist: string;
  format: string;
  itemTitle: string;
}): keyof typeof MatchingPresets {
  // Check for Various Artists
  if (purchase.artist.toLowerCase().includes('various')) {
    return 'compilation';
  }
  
  // Check format
  if (purchase.format === 'Vinyl') {
    return 'vinyl';
  } else if (purchase.format === 'Digital') {
    return 'digital';
  }
  
  // Check for special editions
  if (purchase.itemTitle.match(/\(.*edition.*\)/i)) {
    return 'strict';
  }
  
  // Default
  return 'default';
}

/**
 * Configuration for different matching scenarios
 */
export interface MatchingScenario {
  name: string;
  description: string;
  preset: keyof typeof MatchingPresets;
  customOptions?: Partial<MatchingOptions>;
  strategies?: {
    useEditionMatching?: boolean;
    useCatalogNumbers?: boolean;
    useMultiPass?: boolean;
  };
}

export const MatchingScenarios: Record<string, MatchingScenario> = {
  /**
   * First-time sync - be more permissive
   */
  initialSync: {
    name: 'Initial Sync',
    description: 'First-time collection sync, prioritize finding matches',
    preset: 'fuzzy',
    strategies: {
      useEditionMatching: true,
      useMultiPass: true
    }
  },

  /**
   * Daily sync - balance accuracy and speed
   */
  dailySync: {
    name: 'Daily Sync',
    description: 'Regular sync updates, balance speed and accuracy',
    preset: 'default',
    strategies: {
      useEditionMatching: false,
      useMultiPass: false
    }
  },

  /**
   * Manual review - provide many options
   */
  manualReview: {
    name: 'Manual Review',
    description: 'User reviewing matches, show many alternatives',
    preset: 'fuzzy',
    customOptions: {
      maxAlternatives: 20,
      minConfidence: 30
    },
    strategies: {
      useEditionMatching: true,
      useCatalogNumbers: true,
      useMultiPass: true
    }
  },

  /**
   * Collector mode - high precision for serious collectors
   */
  collector: {
    name: 'Collector Mode',
    description: 'High precision matching for serious collectors',
    preset: 'strict',
    customOptions: {
      minConfidence: 85
    },
    strategies: {
      useEditionMatching: true,
      useCatalogNumbers: true,
      useMultiPass: true
    }
  },

  /**
   * API mode - fast matching for API responses
   */
  api: {
    name: 'API Mode',
    description: 'Fast matching optimized for API response times',
    preset: 'fast',
    customOptions: {
      minConfidence: 75
    },
    strategies: {
      useEditionMatching: false,
      useCatalogNumbers: false,
      useMultiPass: false
    }
  }
};

/**
 * Get scenario configuration
 */
export function getScenario(name: keyof typeof MatchingScenarios): MatchingScenario {
  return MatchingScenarios[name] || MatchingScenarios.dailySync;
}

/**
 * Build complete matching options from scenario
 */
export function buildOptionsFromScenario(scenarioName: keyof typeof MatchingScenarios): {
  options: MatchingOptions;
  strategies: MatchingScenario['strategies'];
} {
  const scenario = getScenario(scenarioName);
  const preset = getPreset(scenario.preset);
  const options = { ...preset, ...scenario.customOptions };
  
  return {
    options,
    strategies: scenario.strategies || {}
  };
}