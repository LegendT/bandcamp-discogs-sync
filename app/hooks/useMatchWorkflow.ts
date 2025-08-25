'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import type { MatchResult } from '@/types/matching';

const SESSION_KEY = 'bc-dc-sync-matches';
const SESSION_SELECTED_KEY = 'bc-dc-sync-selected';

export function useMatchWorkflow() {
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [selectedMatches, setSelectedMatches] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // Load matches from session storage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedMatches = sessionStorage.getItem(SESSION_KEY);
      const savedSelected = sessionStorage.getItem(SESSION_SELECTED_KEY);
      
      if (savedMatches) {
        try {
          const parsed = JSON.parse(savedMatches);
          setMatches(parsed);
        } catch (e) {
          // Invalid data, clear it
          sessionStorage.removeItem(SESSION_KEY);
        }
      }
      
      if (savedSelected) {
        try {
          const parsed = JSON.parse(savedSelected);
          setSelectedMatches(new Set(parsed));
        } catch (e) {
          // Invalid data, clear it
          sessionStorage.removeItem(SESSION_SELECTED_KEY);
        }
      }
    }
  }, []);

  // Save matches to session storage when they change
  useEffect(() => {
    if (typeof window !== 'undefined' && matches.length > 0) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(matches));
    }
  }, [matches]);

  // Save selected matches to session storage when they change
  useEffect(() => {
    if (typeof window !== 'undefined' && selectedMatches.size > 0) {
      sessionStorage.setItem(SESSION_SELECTED_KEY, JSON.stringify(Array.from(selectedMatches)));
    }
  }, [selectedMatches]);

  const processMatches = useCallback(async (purchases: any[], discogsToken?: string) => {
    setIsProcessing(true);
    setError(null);
    setSelectedMatches(new Set());
    setProgress({ current: 0, total: purchases.length });

    try {
      // Process all purchases in parallel for better performance
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (discogsToken) {
        headers['x-discogs-token'] = discogsToken;
      }

      // Create all match promises
      const matchPromises = purchases.map(async (purchase, index) => {
        try {
          const matchResponse = await fetch('/api/match', {
            method: 'POST',
            headers,
            body: JSON.stringify({ 
              purchase: {
                artist: purchase.artist,
                itemTitle: purchase.item_title || purchase.itemTitle,
                itemUrl: purchase.item_url || purchase.itemUrl,
                purchaseDate: purchase.purchase_date || purchase.purchaseDate,
                format: purchase.format,
                rawFormat: purchase.raw_format || purchase.rawFormat || purchase.format || ''
              }
            }),
          });

          // Update progress
          setProgress(prev => ({ ...prev, current: prev.current + 1 }));

          if (!matchResponse.ok) {
            // Return a no-match result for failed requests
            return {
              bandcampItem: {
                artist: purchase.artist || 'Unknown Artist',
                itemTitle: purchase.item_title || purchase.itemTitle || 'Unknown Title',
                itemUrl: purchase.item_url || purchase.itemUrl || '',
                purchaseDate: purchase.purchase_date || purchase.purchaseDate || new Date().toISOString(),
                format: purchase.format || 'Unknown'
              },
              discogsMatch: null,
              confidence: 0,
              reasoning: ['Failed to fetch matches from API']
            };
          }

          const matchData = await matchResponse.json();
          if (matchData.success && matchData.result) {
            const result = matchData.result;
            if (result.bandcampItem) {
              return result;
            }
          }
          
          // Fallback for invalid response structure
          return {
            bandcampItem: {
              artist: purchase.artist || 'Unknown Artist',
              itemTitle: purchase.item_title || purchase.itemTitle || 'Unknown Title',
              itemUrl: purchase.item_url || purchase.itemUrl || '',
              purchaseDate: purchase.purchase_date || purchase.purchaseDate || new Date().toISOString(),
              format: purchase.format || 'Unknown'
            },
            discogsMatch: null,
            confidence: 0,
            reasoning: [matchData?.error || 'No match found']
          };
        } catch (err) {
          // Update progress even on error
          setProgress(prev => ({ ...prev, current: prev.current + 1 }));
          
          // Return a no-match result for errors
          return {
            bandcampItem: {
              artist: purchase.artist || 'Unknown Artist',
              itemTitle: purchase.item_title || purchase.itemTitle || 'Unknown Title',
              itemUrl: purchase.item_url || purchase.itemUrl || '',
              purchaseDate: purchase.purchase_date || purchase.purchaseDate || new Date().toISOString(),
              format: purchase.format || 'Unknown'
            },
            discogsMatch: null,
            confidence: 0,
            reasoning: ['Error processing match']
          };
        }
      });

      // Wait for all matches to complete
      const allMatches = await Promise.all(matchPromises);

      setMatches(allMatches);

      // Pre-select high confidence matches
      const preSelected = new Set<number>();
      allMatches.forEach((match: MatchResult, index: number) => {
        if (match.confidence >= 80 && match.discogsMatch) {
          preSelected.add(index);
        }
      });
      setSelectedMatches(preSelected);

      return allMatches;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      throw err;
    } finally {
      setIsProcessing(false);
      setProgress({ current: 0, total: 0 });
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
    setProgress({ current: 0, total: 0 });
    
    // Clear session storage
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_SELECTED_KEY);
    }
  }, []);

  const selectedItems = useMemo(() => {
    return Array.from(selectedMatches)
      .map(idx => matches[idx])
      .filter(match => match.discogsMatch);
  }, [selectedMatches, matches]);

  const matchStats = useMemo(() => {
    const withMatches = matches.filter(m => m.discogsMatch);
    const noMatches = matches.filter(m => !m.discogsMatch);
    
    const highConfidence = withMatches.filter(m => m.confidence >= 80).length;
    const mediumConfidence = withMatches.filter(m => m.confidence >= 60 && m.confidence < 80).length;
    const lowConfidence = withMatches.filter(m => m.confidence < 60).length;

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
    progress,
    matchStats,
    processMatches,
    toggleMatch,
    selectAll,
    selectNone,
    resetWorkflow,
    clearError: () => setError(null),
  };
}