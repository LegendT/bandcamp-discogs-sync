'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle, Loader2, ExternalLink, RefreshCw } from 'lucide-react';
import { ProcessedItem } from '@/lib/bandcamp/scraper';

interface BandcampImporterRefinedProps {
  onItemsImported?: (items: ProcessedItem[]) => void;
}

type ImportStep = 'username' | 'scraping' | 'format-detection' | 'complete';

export default function BandcampImporterRefined({ onItemsImported }: BandcampImporterRefinedProps) {
  const [step, setStep] = useState<ImportStep>('username');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collectionItems, setCollectionItems] = useState<ProcessedItem[]>([]);
  const [formatProgress, setFormatProgress] = useState<{
    current: number;
    total: number;
    item: string;
  } | null>(null);
  const [detectedFormats, setDetectedFormats] = useState(false);

  const handleScrapeCollection = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/bandcamp/scrape-lightweight', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          // Add dev token for authenticated features
          'Authorization': 'Bearer dev_token_test'
        },
        body: JSON.stringify({ 
          username,
          useCache: true
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to scrape collection');
      }

      if (data.collection.items.length === 0) {
        throw new Error('No items found in collection');
      }

      setCollectionItems(data.collection.items);
      setStep('format-detection');
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDetectFormats = async () => {
    setLoading(true);
    setError(null);
    setFormatProgress({ current: 0, total: collectionItems.length, item: '' });

    try {
      // Use SSE for progress updates
      const response = await fetch('/api/bandcamp/detect-formats-service', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev_token_test'
        },
        body: JSON.stringify({
          items: collectionItems.map(item => ({
            id: item.id,
            title: item.title,
            albumUrl: item.albumUrl || `https://bandcamp.com/album/${item.id}`,
            bandName: item.bandName,
            bandId: item.bandId,
            artworkUrl: item.artworkUrl,
          })),
          concurrency: 3
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start format detection');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'progress') {
                setFormatProgress({
                  current: data.completed,
                  total: data.total,
                  item: data.current
                });
              } else if (data.type === 'complete') {
                // Update items with detected formats
                const updatedItems = collectionItems.map(item => {
                  const result = data.results.find((r: any) => r.id === item.id);
                  if (result) {
                    return {
                      ...item,
                      format: result.format,
                      formatType: result.formatType,
                      includesDigital: result.includesDigital,
                      ownershipText: result.ownershipText
                    };
                  }
                  return item;
                });
                
                setCollectionItems(updatedItems);
                setDetectedFormats(true);
                setStep('complete');
                
                if (onItemsImported) {
                  onItemsImported(updatedItems);
                }
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Format detection failed');
    } finally {
      setLoading(false);
      setFormatProgress(null);
    }
  };

  const handleSkipFormatDetection = () => {
    setStep('complete');
    if (onItemsImported) {
      onItemsImported(collectionItems);
    }
  };

  const handleRetry = () => {
    setStep('username');
    setError(null);
    setCollectionItems([]);
    setDetectedFormats(false);
  };

  const getStats = () => {
    const physical = collectionItems.filter(i => 
      i.formatType === 'physical' || i.formatType === 'both'
    ).length;
    const digital = collectionItems.filter(i => 
      i.formatType === 'digital'
    ).length;
    const unknown = collectionItems.filter(i => 
      i.formatType === 'unknown'
    ).length;
    
    return { physical, digital, unknown, total: collectionItems.length };
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-sm">
      {/* Progress Steps */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className={`flex-1 h-2 rounded-full mr-2 ${
            step === 'username' ? 'bg-blue-200' : 'bg-green-500'
          }`} />
          <div className={`flex-1 h-2 rounded-full mr-2 ${
            ['scraping', 'format-detection', 'complete'].includes(step) 
              ? step === 'scraping' ? 'bg-blue-200' : 'bg-green-500'
              : 'bg-gray-200'
          }`} />
          <div className={`flex-1 h-2 rounded-full mr-2 ${
            ['format-detection', 'complete'].includes(step)
              ? step === 'format-detection' ? 'bg-blue-200' : 'bg-green-500'
              : 'bg-gray-200'
          }`} />
          <div className={`flex-1 h-2 rounded-full ${
            step === 'complete' ? 'bg-green-500' : 'bg-gray-200'
          }`} />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-600">
          <span>Username</span>
          <span>Scraping</span>
          <span>Formats</span>
          <span>Complete</span>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md flex items-start">
          <AlertCircle className="h-5 w-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-700">{error}</p>
            <button
              onClick={handleRetry}
              className="mt-2 text-sm text-red-600 hover:text-red-800 flex items-center"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Step Content */}
      {step === 'username' && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Import Bandcamp Collection</h3>
          <p className="text-gray-600 mb-4">
            Enter your Bandcamp username to import your collection. We'll extract all public information about your albums.
          </p>
          <div className="space-y-4">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter Bandcamp username"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
            <div className="flex gap-2">
              <button
                onClick={handleScrapeCollection}
                disabled={!username || loading}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin h-5 w-5 mr-2" />
                    Scraping...
                  </>
                ) : (
                  'Import Collection'
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Try "markt" for a test collection
            </p>
          </div>
        </div>
      )}

      {step === 'format-detection' && (
        <div>
          <h3 className="text-lg font-semibold mb-4">Format Detection</h3>
          <div className="space-y-4">
            {!detectedFormats && !loading && (
              <>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm text-blue-700 mb-2">
                    Found {collectionItems.length} items in your collection!
                  </p>
                  <p className="text-xs text-blue-600">
                    To detect physical vs digital formats, you need to be logged into Bandcamp.
                    This step is optional but recommended for accurate categorization.
                  </p>
                </div>
                
                <div className="flex gap-2">
                  <a
                    href="https://bandcamp.com/login"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 flex items-center justify-center"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open Bandcamp Login
                  </a>
                  <button
                    onClick={handleDetectFormats}
                    disabled={loading}
                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center"
                  >
                    Detect Formats
                  </button>
                </div>
                
                <button
                  onClick={handleSkipFormatDetection}
                  className="w-full text-gray-600 hover:text-gray-800 text-sm"
                >
                  Skip format detection →
                </button>
              </>
            )}
            
            {loading && formatProgress && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span>Detecting formats...</span>
                  <span>{formatProgress.current} / {formatProgress.total}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(formatProgress.current / formatProgress.total) * 100}%` }}
                  />
                </div>
                {formatProgress.item && (
                  <p className="text-xs text-gray-600 truncate">
                    Checking: {formatProgress.item}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {step === 'complete' && (
        <div>
          <div className="text-center mb-6">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <h3 className="text-lg font-semibold">Import Complete!</h3>
            <p className="text-gray-600 mt-1">
              Successfully imported {collectionItems.length} items
            </p>
          </div>
          
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <h4 className="font-medium mb-2">Collection Summary</h4>
            <div className="grid grid-cols-4 gap-2 text-sm">
              <div>
                <span className="text-gray-600">Total:</span>
                <p className="font-semibold">{getStats().total}</p>
              </div>
              <div>
                <span className="text-gray-600">Physical:</span>
                <p className="font-semibold">{getStats().physical}</p>
              </div>
              <div>
                <span className="text-gray-600">Digital:</span>
                <p className="font-semibold">{getStats().digital}</p>
              </div>
              <div>
                <span className="text-gray-600">Unknown:</span>
                <p className="font-semibold">{getStats().unknown}</p>
              </div>
            </div>
          </div>
          
          <div className="text-center">
            <button
              onClick={handleRetry}
              className="text-blue-600 hover:text-blue-800 text-sm flex items-center justify-center mx-auto"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Import another collection
            </button>
          </div>
        </div>
      )}
    </div>
  );
}