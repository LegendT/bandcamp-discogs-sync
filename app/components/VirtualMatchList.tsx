'use client';

import { FixedSizeList as List } from 'react-window';
import { memo, useCallback, useMemo } from 'react';
import MatchItem from './MatchItem';
import type { MatchResult } from '@/types/matching';

interface VirtualMatchListProps {
  matches: MatchResult[];
  selectedMatches: Set<number>;
  onToggle: (index: number) => void;
  height?: number;
}

function VirtualMatchList({ 
  matches, 
  selectedMatches, 
  onToggle,
  height = 400 
}: VirtualMatchListProps) {
  
  // Optimized Row component using itemData pattern
  const Row = useCallback(({ index, style, data }: { 
    index: number; 
    style: React.CSSProperties; 
    data: { matches: MatchResult[]; selectedMatches: Set<number>; onToggle: (index: number) => void; }
  }) => {
    const { matches, selectedMatches, onToggle } = data;
    return (
      <div style={style}>
        <MatchItem
          match={matches[index]}
          index={index}
          isSelected={selectedMatches.has(index)}
          onToggle={onToggle}
        />
      </div>
    );
  }, []); // No dependencies - data comes from itemData prop

  // Memoize itemData to prevent object recreation on every render
  const itemData = useMemo(() => ({
    matches,
    selectedMatches,
    onToggle
  }), [matches, selectedMatches, onToggle]);

  if (matches.length === 0) {
    return <div className="text-center py-4 text-gray-500">No matches to display</div>;
  }

  // Use virtual scrolling for lists with more than 20 items
  if (matches.length > 20) {
    return (
      <List
        height={height}
        itemCount={matches.length}
        itemSize={80} // Approximate height of each MatchItem
        width="100%"
        className="scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100"
        itemData={itemData} // Use memoized data object
      >
        {Row}
      </List>
    );
  }

  // For smaller lists, render normally
  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {matches.map((match, idx) => (
        <MatchItem
          key={idx}
          match={match}
          index={idx}
          isSelected={selectedMatches.has(idx)}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

export default memo(VirtualMatchList);