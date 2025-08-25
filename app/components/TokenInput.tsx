'use client';

import { useState } from 'react';
import { validateToken, maskToken } from '@/app/utils/token-security';

interface TokenInputProps {
  token: string;
  setToken: (token: string) => void;
  tokenValid: boolean | null;
  username: string;
  isValidating?: boolean;
  onTest: () => void;
}

export default function TokenInput({ 
  token, 
  setToken, 
  tokenValid, 
  username, 
  isValidating = false,
  onTest 
}: TokenInputProps) {
  const [inputError, setInputError] = useState<string | null>(null);

  const handleTokenChange = (value: string) => {
    const trimmed = value.trim();
    setInputError(null);
    
    if (trimmed && !validateToken(trimmed)) {
      setInputError('Token must be 40 alphanumeric characters');
    }
    
    setToken(trimmed);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
      <h2 className="text-lg font-semibold mb-4">1. Connect Your Discogs Account</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Personal Access Token
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => handleTokenChange(e.target.value)}
              placeholder="Paste your Discogs token here"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Discogs personal access token"
            />
            <button
              onClick={onTest}
              disabled={!token || isValidating}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 inline-flex items-center gap-2"
              aria-label={isValidating ? 'Validating token' : 'Test connection to Discogs'}
            >
              {isValidating && (
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {isValidating ? 'Validating...' : 'Test Connection'}
            </button>
          </div>
        </div>

        {inputError && (
          <div className="text-sm text-red-600" role="alert">
            {inputError}
          </div>
        )}
        
        {isValidating && (
          <div className="flex items-center gap-2 text-sm text-blue-600" role="status" aria-live="polite">
            <svg className="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Validating token, please wait...</span>
          </div>
        )}

        {!isValidating && tokenValid === true && (
          <div className="text-sm text-green-600" role="status">
            <span className="sr-only">Success:</span>
            <span aria-hidden="true">✅</span> Connected as: {username} (Token: {maskToken(token)})
          </div>
        )}
        {tokenValid === false && (
          <div className="text-sm text-red-600" role="alert">
            <span className="sr-only">Error:</span>
            <span aria-hidden="true">❌</span> Invalid token. Please check and try again.
          </div>
        )}

        <details className="text-sm text-gray-600">
          <summary className="cursor-pointer hover:text-gray-800">
            How to get a token
          </summary>
          <ol className="mt-2 space-y-1 list-decimal list-inside">
            <li>Go to <a href="https://www.discogs.com/settings/developers" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Discogs Developer Settings</a></li>
            <li>Click &quot;Generate new token&quot;</li>
            <li>Copy and paste it above</li>
          </ol>
        </details>
      </div>
    </div>
  );
}