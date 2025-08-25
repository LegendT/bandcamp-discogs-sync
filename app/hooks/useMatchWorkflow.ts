'use client';

import { useState, useCallback, useMemo } from 'react';
import type { MatchResult } from '@/types/matching';

export function useMatchWorkflow() {
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [selectedMatches, setSelectedMatches] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processMatches = useCallback(async (purchases: any[], discogsToken?: string) => {
    setIsProcessing(true);
    setError(null);
    setSelectedMatches(new Set());

    try {
      // Process purchases one by one and collect results
      const allMatches: MatchResult[] = [];
      
      for (const purchase of purchases) {
        try {
          // Debug log to see the structure
          console.log('Processing purchase:', purchase);
          
          const headers: HeadersInit = { 'Content-Type': 'application/json' };
          if (discogsToken) {
            headers['x-discogs-token'] = discogsToken;
          }
          
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

          if (!matchResponse.ok) {
            const title = purchase.item_title || purchase.itemTitle || 'Unknown';
            console.error(`Failed to match ${title}`);
            // Add a no-match result for failed requests
            allMatches.push({
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
            });
            continue;
          }

          const matchData = await matchResponse.json();
          if (matchData.success && matchData.result) {
            // Ensure the result has the required structure
            const result = matchData.result;
            if (result.bandcampItem) {
              allMatches.push(result);
            } else {
              // Fallback if result doesn't have expected structure
              allMatches.push({
                bandcampItem: {
                  artist: purchase.artist || 'Unknown Artist',
                  itemTitle: purchase.item_title || purchase.itemTitle || 'Unknown Title',
                  itemUrl: purchase.item_url || purchase.itemUrl || '',
                  purchaseDate: purchase.purchase_date || purchase.purchaseDate || new Date().toISOString(),
                  format: purchase.format || 'Unknown'
                },
                discogsMatch: null,
                confidence: 0,
                reasoning: ['Invalid match result structure']
              });
            }
          } else {
            // API returned error or no result
            allMatches.push({
              bandcampItem: {
                artist: purchase.artist || 'Unknown Artist',
                itemTitle: purchase.item_title || purchase.itemTitle || 'Unknown Title',
                itemUrl: purchase.item_url || purchase.itemUrl || '',
                purchaseDate: purchase.purchase_date || purchase.purchaseDate || new Date().toISOString(),
                format: purchase.format || 'Unknown'
              },
              discogsMatch: null,
              confidence: 0,
              reasoning: [matchData.error || 'No match result returned']
            });
          }
        } catch (err) {
          const title = purchase.item_title || purchase.itemTitle || 'Unknown';
          console.error(`Error matching ${title}:`, err);
          // Add a no-match result for errors
          allMatches.push({
            bandcampItem: {
              artist: purchase.artist || 'Unknown Artist',
              itemTitle: purchase.item_title || purchase.itemTitle || 'Unknown Title',
              itemUrl: purchase.item_url || purchase.itemUrl || '',
              purchaseDate: purchase.purchase_date || purchase.purchaseDate || new Date().toISOString(),
              format: purchase.format || 'Unknown'
            },
            discogsMatch: null,
            confidence: 0,
            reasoning: ['Error during matching process']
          });
        }
      }

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
    matchStats,
    processMatches,
    toggleMatch,
    selectAll,
    selectNone,
    resetWorkflow,
    clearError: () => setError(null),
  };
}