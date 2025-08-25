'use client';

import { memo } from 'react';
import type { MatchResult } from '@/types/matching';

interface MatchItemProps {
  match: MatchResult;
  index: number;
  isSelected: boolean;
  onToggle: (index: number) => void;
}

function MatchItem({ match, index, isSelected, onToggle }: MatchItemProps) {
  const confidenceColor = 
    match.confidence >= 0.8 ? 'text-green-600' : 
    match.confidence >= 0.6 ? 'text-yellow-600' : 
    'text-orange-600';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (match.discogsMatch) {
        onToggle(index);
      }
    }
  };

  return (
    <div 
      className={`flex items-center gap-3 p-3 border rounded ${
        !match.discogsMatch ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50 focus-within:ring-2 focus-within:ring-blue-500'
      }`}
      tabIndex={match.discogsMatch ? 0 : -1}
      onKeyDown={handleKeyDown}
      role="listitem"
    >
      {match.discogsMatch && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(index)}
          className="h-4 w-4 text-blue-600 rounded"
          aria-label={`Select ${match.bandcampItem.artist} - ${match.bandcampItem.itemTitle}`}
        />
      )}
      
      <div className="flex-1">
        <div className="font-medium">
          {match.bandcampItem.artist} - {match.bandcampItem.itemTitle}
        </div>
        {match.discogsMatch ? (
          <div className="text-sm text-gray-600">
            → {match.discogsMatch.title} 
            <span className={`ml-2 ${confidenceColor}`} aria-label={`${Math.round(match.confidence * 100)}% confidence match`}>
              ({Math.round(match.confidence * 100)}% match)
            </span>
          </div>
        ) : (
          <div className="text-sm text-red-600">No match found</div>
        )}
      </div>
    </div>
  );
}

export default memo(MatchItem, (prevProps, nextProps) => {
  return prevProps.isSelected === nextProps.isSelected &&
         prevProps.match.bandcampItem.itemTitle === nextProps.match.bandcampItem.itemTitle &&
         prevProps.match.confidence === nextProps.match.confidence;
});