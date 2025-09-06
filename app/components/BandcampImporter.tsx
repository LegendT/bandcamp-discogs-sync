'use client';

import { useState, useEffect } from 'react';
import { ProcessedItem, CollectionData } from '@/lib/bandcamp/scraper';
import { BandcampCollectionStore } from '@/lib/bandcamp/collection-store';
import { CheckCircle, Circle, AlertCircle, Loader2, Music, Disc, Download } from 'lucide-react';

type ImportStep = 'username' | 'scraping' | 'login-prompt' | 'detecting' | 'complete';

interface BandcampImporterProps {
  onItemsImported?: (items: ProcessedItem[]) => void;
}

export default function BandcampImporter({ onItemsImported }: BandcampImporterProps) {
  const [step, setStep] = useState<ImportStep>('username');
  const [username, setUsername] = useState('');
  const [collection, setCollection] = useState<CollectionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [store] = useState(() => new BandcampCollectionStore({ persist: true, storage: 'local' }));
  const [stats, setStats] = useState({ total: 0, physical: 0, digital: 0, unknown: 0, synced: 0 });

  useEffect(() => {
    if (collection) {
      updateStats();
    }
  }, [collection]);

  const updateStats = async () => {
    if (!username) return;
    const newStats = await store.getStats(username);
    setStats(newStats);
  };

  const handleUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    // Check if we have cached data
    const cached = await store.loadCollection(username);
    if (cached && cached.items.length > 0) {
      const useCache = confirm(
        `Found ${cached.items.length} cached items for ${username}. Use cached data?`
      );
      if (useCache) {
        setCollection(cached);
        setStep('complete');
        if (onItemsImported) onItemsImported(cached.items);
        return;
      }
    }

    // Start scraping
    setStep('scraping');
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/bandcamp/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, detectFormats: false })
      });

      if (!response.ok) {
        throw new Error('Failed to scrape Bandcamp collection');
      }

      const data: CollectionData = await response.json();
      await store.saveCollection(username, data);
      setCollection(data);

      // Ask about format detection
      setStep('login-prompt');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStep('username');
    } finally {
      setLoading(false);
    }
  };

  const handleFormatDetection = async (detect: boolean) => {
    if (!detect || !collection) {
      setStep('complete');
      if (onItemsImported && collection) onItemsImported(collection.items);
      return;
    }

    setStep('detecting');
    setLoading(true);
    setProgress({ current: 0, total: collection.items.length });

    try {
      const response = await fetch('/api/bandcamp/detect-formats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username, 
          items: collection.items 
        })
      });

      if (!response.ok) {
        throw new Error('Failed to detect formats');
      }

      // Stream progress updates
      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                const update = JSON.parse(line);
                if (update.type === 'progress') {
                  setProgress(update.data);
                } else if (update.type === 'complete') {
                  const updatedCollection = update.data as CollectionData;
                  await store.saveCollection(username, updatedCollection);
                  setCollection(updatedCollection);
                }
              } catch (e) {
                console.error('Error parsing update:', e);
              }
            }
          }
        }
      }

      setStep('complete');
      if (onItemsImported && collection) onItemsImported(collection.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleFormatUpdate = async (itemId: string, format: ProcessedItem['format']) => {
    if (!collection) return;

    const formatType = format === 'digital' ? 'digital' : 
                       format === 'unknown' ? 'unknown' : 'physical';

    await store.updateItemFormat(username, itemId, format, formatType);
    
    // Update local state
    const updatedCollection = {
      ...collection,
      items: collection.items.map(item => 
        item.id === itemId ? { ...item, format, formatType } : item
      )
    };
    setCollection(updatedCollection);
    updateStats();
  };

  const getFormatIcon = (format: ProcessedItem['format']) => {
    switch (format) {
      case 'vinyl':
        return <Disc className="w-4 h-4" />;
      case 'cd':
        return <Music className="w-4 h-4" />;
      case 'digital':
        return <Download className="w-4 h-4" />;
      default:
        return <Circle className="w-4 h-4" />;
    }
  };

  const getFormatColor = (formatType: ProcessedItem['formatType']) => {
    switch (formatType) {
      case 'physical':
        return 'text-blue-600 bg-blue-50';
      case 'digital':
        return 'text-green-600 bg-green-50';
      case 'both':
        return 'text-purple-600 bg-purple-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Username Input */}
      {step === 'username' && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Import Bandcamp Collection</h2>
          <form onSubmit={handleUsernameSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium mb-2">
                Bandcamp Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your Bandcamp username"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
              <p className="mt-2 text-sm text-gray-600">
                Your public profile URL: bandcamp.com/[username]
              </p>
            </div>
            {error && (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading || !username.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Import Collection
            </button>
          </form>
        </div>
      )}

      {/* Scraping Progress */}
      {step === 'scraping' && (
        <div className="space-y-4 text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-blue-600" />
          <h3 className="text-xl font-semibold">Scraping Collection...</h3>
          <p className="text-gray-600">
            Fetching your collection from Bandcamp
          </p>
        </div>
      )}

      {/* Login Prompt */}
      {step === 'login-prompt' && collection && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Format Detection (Optional)</h3>
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm mb-3">
              To automatically detect physical vs digital formats, you need to be logged into Bandcamp.
            </p>
            <p className="text-sm font-medium">
              Found {collection.items.length} items in your collection.
            </p>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => window.open('https://bandcamp.com/login', '_blank')}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              Open Bandcamp Login
            </button>
            <button
              onClick={() => handleFormatDetection(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              I'm Logged In - Detect Formats
            </button>
            <button
              onClick={() => handleFormatDetection(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Skip Format Detection
            </button>
          </div>
        </div>
      )}

      {/* Format Detection Progress */}
      {step === 'detecting' && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Detecting Formats...</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Processing items</span>
              <span>{progress.current} / {progress.total}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Complete - Show Collection */}
      {step === 'complete' && collection && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold">Collection Imported</h3>
            <button
              onClick={() => {
                setStep('username');
                setCollection(null);
              }}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Import Different Collection
            </button>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-4 gap-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-sm text-gray-600">Total Items</div>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{stats.physical}</div>
              <div className="text-sm text-gray-600">Physical</div>
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{stats.digital}</div>
              <div className="text-sm text-gray-600">Digital</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-600">{stats.unknown}</div>
              <div className="text-sm text-gray-600">Unknown</div>
            </div>
          </div>

          {/* Collection Items */}
          <div className="space-y-2">
            {collection.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 p-3 bg-white border rounded-lg hover:shadow-sm"
              >
                {/* Album Art */}
                {item.artworkUrl && (
                  <img
                    src={item.artworkUrl}
                    alt={item.title}
                    className="w-16 h-16 rounded object-cover"
                  />
                )}

                {/* Item Info */}
                <div className="flex-1">
                  <div className="font-medium">{item.title}</div>
                  {item.bandName && (
                    <div className="text-sm text-gray-600">{item.bandName}</div>
                  )}
                </div>

                {/* Format Selector */}
                <div className="flex items-center gap-2">
                  <select
                    value={item.format || 'unknown'}
                    onChange={(e) => handleFormatUpdate(item.id, e.target.value as ProcessedItem['format'])}
                    className={`px-3 py-1 rounded-lg text-sm font-medium ${getFormatColor(item.formatType)}`}
                  >
                    <option value="unknown">Unknown</option>
                    <option value="vinyl">Vinyl</option>
                    <option value="cd">CD</option>
                    <option value="cassette">Cassette</option>
                    <option value="digital">Digital</option>
                  </select>
                  {getFormatIcon(item.format)}
                </div>

                {/* Sync Status */}
                <div>
                  {store.isSynced(item.id) ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}