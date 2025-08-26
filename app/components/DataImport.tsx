'use client';

import { useState } from 'react';
import FileUpload from './FileUpload';

interface DataImportProps {
  onImportComplete: (data: { 
    sessionId: string; 
    purchases: any[]; 
    itemCount: number 
  }) => void;
  onError: (error: string) => void;
}

export default function DataImport({ onImportComplete, onError }: DataImportProps) {
  const [importMethod, setImportMethod] = useState<'none' | 'auto' | 'csv'>('none');
  const [isLoading, setIsLoading] = useState(false);
  
  // Auto-import state
  const [username, setUsername] = useState('');
  const [formatPreference, setFormatPreference] = useState<string>('Digital');
  const [importProgress, setImportProgress] = useState<string>('');

  const handleAutoImport = async () => {
    if (!username.trim()) {
      onError('Please enter a Bandcamp username');
      return;
    }

    setIsLoading(true);
    setImportProgress('Connecting to Bandcamp...');

    try {
      const response = await fetch('/api/import-collection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username.trim(),
          formatHint: formatPreference,
          limit: 1000 // Start with reasonable limit
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        if (response.status === 429) {
          throw new Error('Bandcamp is rate limiting. Please try again in a minute.');
        } else if (response.status === 404) {
          throw new Error(`Username "${username}" not found on Bandcamp`);
        }
        throw new Error(error.message || 'Import failed');
      }

      const data = await response.json();
      
      setImportProgress(`Found ${data.itemCount} items!`);
      
      // Generate a session ID for consistency with CSV upload
      const sessionId = `import-${Date.now()}`;
      
      onImportComplete({
        sessionId,
        purchases: data.purchases,
        itemCount: data.itemCount
      });
      
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to import collection');
      setImportProgress('');
    } finally {
      setIsLoading(false);
    }
  };

  if (importMethod === 'none') {
    return (
      <div className="w-full max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">Import Your Bandcamp Collection</h2>
          <p className="text-gray-600">Choose how to import your music collection</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Automatic Import Option - RECOMMENDED */}
          <button
            onClick={() => setImportMethod('auto')}
            className="p-6 border-2 border-green-200 rounded-lg hover:border-green-400 hover:bg-green-50 transition-all text-left relative"
          >
            <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
              RECOMMENDED
            </div>
            <div className="flex items-center mb-4">
              <svg className="w-8 h-8 text-green-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <h3 className="text-lg font-semibold">Automatic Import</h3>
            </div>
            <p className="text-gray-600 text-sm mb-3">
              Enter your Bandcamp username and we'll automatically import your collection
            </p>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>✓ No manual export needed</li>
              <li>✓ Works with public collections</li>
              <li>✓ Import in seconds</li>
            </ul>
          </button>

          {/* CSV Option - LEGACY */}
          <button
            onClick={() => setImportMethod('csv')}
            className="p-6 border-2 border-gray-200 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all text-left"
          >
            <div className="flex items-center mb-4">
              <svg className="w-8 h-8 text-gray-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <h3 className="text-lg font-semibold">Upload CSV</h3>
            </div>
            <p className="text-gray-600 text-sm mb-3">
              Have a CSV export? Upload it directly
            </p>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>• Requires manual export</li>
              <li>• Full control over data</li>
              <li>• Offline option</li>
            </ul>
          </button>
        </div>
      </div>
    );
  }

  if (importMethod === 'auto') {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <button
          onClick={() => setImportMethod('none')}
          className="mb-4 text-sm text-gray-600 hover:text-gray-900"
        >
          ← Back to import options
        </button>

        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">Import from Bandcamp</h3>
          
          <div className="space-y-4">
            {/* Username Input */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Bandcamp Username
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your-username"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
              <p className="text-xs text-gray-500 mt-1">
                Your username from bandcamp.com/username
              </p>
            </div>

            {/* Format Preference */}
            <div>
              <label htmlFor="format" className="block text-sm font-medium text-gray-700 mb-1">
                Default Format (you can change per item later)
              </label>
              <select
                id="format"
                value={formatPreference}
                onChange={(e) => setFormatPreference(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              >
                <option value="Digital">Digital</option>
                <option value="Vinyl">Vinyl</option>
                <option value="CD">CD</option>
                <option value="Cassette">Cassette</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                We'll use this for all items (Bandcamp doesn't show format publicly)
              </p>
            </div>

            {/* Progress Message */}
            {importProgress && (
              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <p className="text-sm text-blue-700">{importProgress}</p>
              </div>
            )}

            {/* Import Button */}
            <button
              onClick={handleAutoImport}
              disabled={isLoading || !username.trim()}
              className={`
                w-full py-3 px-4 rounded-md font-medium transition-colors
                ${isLoading || !username.trim()
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
                }
              `}
            >
              {isLoading ? 'Importing Collection...' : 'Import Collection'}
            </button>
          </div>

          {/* Privacy Note */}
          <div className="mt-4 p-3 bg-gray-50 rounded text-xs text-gray-600">
            <p className="font-semibold mb-1">Privacy Note:</p>
            <p>We only access publicly visible collection data. No login required.</p>
          </div>
        </div>
      </div>
    );
  }

  if (importMethod === 'csv') {
    return (
      <div className="w-full">
        <button
          onClick={() => setImportMethod('none')}
          className="mb-4 text-sm text-gray-600 hover:text-gray-900"
        >
          ← Back to import options
        </button>
        
        <FileUpload onUploadComplete={onImportComplete} onError={onError} />
      </div>
    );
  }

  return null;
}