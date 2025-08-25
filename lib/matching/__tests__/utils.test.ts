import { extractEditionInfo, calculateEditionAwareSimilarity } from '../utils';

describe('extractEditionInfo', () => {
  it('should extract deluxe edition in parentheses', () => {
    const result = extractEditionInfo('Abbey Road (Deluxe Edition)');
    expect(result.baseTitle).toBe('Abbey Road');
    expect(result.edition).toBe('Deluxe Edition');
    expect(result.year).toBeNull();
  });

  it('should extract remastered with year', () => {
    const result = extractEditionInfo('The Wall (2011 Remastered)');
    expect(result.baseTitle).toBe('The Wall');
    expect(result.edition).toBe('2011 Remastered');
    expect(result.year).toBe(2011);
  });

  it('should extract edition in brackets', () => {
    const result = extractEditionInfo('Dark Side of the Moon [Special Edition]');
    expect(result.baseTitle).toBe('Dark Side of the Moon');
    expect(result.edition).toBe('Special Edition');
  });

  it('should extract edition after dash', () => {
    const result = extractEditionInfo('OK Computer - Collector\'s Edition');
    expect(result.baseTitle).toBe('OK Computer');
    expect(result.edition).toBe('Collector\'s Edition');
  });

  it('should handle albums without editions', () => {
    const result = extractEditionInfo('Pet Sounds');
    expect(result.baseTitle).toBe('Pet Sounds');
    expect(result.edition).toBeNull();
    expect(result.year).toBeNull();
  });

  it('should handle multiple edition indicators', () => {
    const result = extractEditionInfo('Thriller (25th Anniversary Deluxe Edition)');
    expect(result.baseTitle).toBe('Thriller');
    expect(result.edition).toBe('25th Anniversary Deluxe Edition');
  });

  it('should clean up trailing punctuation', () => {
    const result = extractEditionInfo('The Beatles - ');
    expect(result.baseTitle).toBe('The Beatles');
  });
});

describe('calculateEditionAwareSimilarity', () => {
  const mockCalculateSimilarity = (a: string, b: string) => {
    if (a === b) return 100;
    if (a.toLowerCase() === b.toLowerCase()) return 95;
    // For the test case, "OK Computer" vs "OK Computer" (after edition extraction)
    if ((a === 'OK Computer' && b === 'OK Computer') || 
        (b === 'OK Computer' && a === 'OK Computer')) return 100;
    return 50;
  };

  it('should give high score for same base with different editions', () => {
    const score = calculateEditionAwareSimilarity(
      'Abbey Road (Deluxe Edition)',
      'Abbey Road (2019 Mix)',
      mockCalculateSimilarity
    );
    expect(score).toBeGreaterThan(90); // Base match is 100, different editions
  });

  it('should give bonus for matching editions', () => {
    const score = calculateEditionAwareSimilarity(
      'The Wall (Remastered)',
      'The Wall (Remastered)',
      mockCalculateSimilarity
    );
    expect(score).toBe(110); // 100 base + 10 for matching editions (100% * 0.1)
  });

  it('should give bonus for both being standard editions', () => {
    const score = calculateEditionAwareSimilarity(
      'Pet Sounds',
      'Pet Sounds',
      mockCalculateSimilarity
    );
    expect(score).toBe(105); // 100 base + 5 for both standard
  });

  it('should penalize when only one has edition', () => {
    const score = calculateEditionAwareSimilarity(
      'OK Computer',
      'OK Computer (OKNOTOK 1997 2017)',
      mockCalculateSimilarity
    );
    expect(score).toBe(98); // 100 base (same base title) - 2 penalty
  });
});