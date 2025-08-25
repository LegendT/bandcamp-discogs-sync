'use client';

import { useState, useCallback, useMemo } from 'react';
import type { MatchResult } from '@/types/matching';

export function useMatchWorkflow() {
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [selectedMatches, setSelectedMatches] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processMatches = useCallback(async (purchases: any[]) => {
    setIsProcessing(true);
    setError(null);
    setSelectedMatches(new Set());

    try {
      const matchResponse = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchases }),
      });

      if (!matchResponse.ok) {
        throw new Error('Failed to process matches');
      }

      const matchResult = await matchResponse.json();
      setMatches(matchResult.matches);

      // Pre-select high confidence matches
      const preSelected = new Set<number>();
      matchResult.matches.forEach((match: MatchResult, index: number) => {
        if (match.confidence >= 0.8 && match.discogsMatch) {
          preSelected.add(index);
        }
      });
      setSelectedMatches(preSelected);

      return matchResult.matches;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const toggleMatch = useCallback((index: number) => {
    setSelectedMatches((prev) => {
      const newSelected = new Set(prev);
      if (newSelected.has(index)) {
        newSelected.delete(index);
      } else {
        newSelected.add(index);
      }
      return newSelected;
    });
  }, []);

  const selectAll = useCallback(() => {
    const allSelectable = new Set<number>();
    matches.forEach((match, index) => {
      if (match.discogsMatch) {
        allSelectable.add(index);
      }
    });
    setSelectedMatches(allSelectable);
  }, [matches]);

  const selectNone = useCallback(() => {
    setSelectedMatches(new Set());
  }, []);

  const resetWorkflow = useCallback(() => {
    setMatches([]);
    setSelectedMatches(new Set());
    setError(null);
  }, []);

  const selectedItems = useMemo(() => {
    return Array.from(selectedMatches)
      .map(idx => matches[idx])
      .filter(match => match.discogsMatch);
  }, [selectedMatches, matches]);

  const matchStats = useMemo(() => {
    const withMatches = matches.filter(m => m.discogsMatch);
    const noMatches = matches.filter(m => !m.discogsMatch);
    
    const highConfidence = withMatches.filter(m => m.confidence >= 0.8).length;
    const mediumConfidence = withMatches.filter(m => m.confidence >= 0.6 && m.confidence < 0.8).length;
    const lowConfidence = withMatches.filter(m => m.confidence < 0.6).length;

    return {
      total: matches.length,
      withMatches: withMatches.length,
      highConfidence,
      mediumConfidence,
      lowConfidence,
      noMatches: noMatches.length,
    };
  }, [matches]);

  return {
    matches,
    selectedMatches,
    selectedItems,
    isProcessing,
    error,
    matchStats,
    processMatches,
    toggleMatch,
    selectAll,
    selectNone,
    resetWorkflow,
    clearError: () => setError(null),
  };
}