'use client';

import { useState } from 'react';
import FileUpload from './components/FileUpload';
import ConfirmDialog from './components/ConfirmDialog';
import MatchListSkeleton from './components/MatchListSkeleton';
import TokenInput from './components/TokenInput';
import VirtualMatchList from './components/VirtualMatchList';
import SyncResults from './components/SyncResults';
import { useDiscogsAuth } from './hooks/useDiscogsAuth';
import { useMatchWorkflow } from './hooks/useMatchWorkflow';
import { useSyncWorkflow } from './hooks/useSyncWorkflow';

export default function Home() {
  const { token, setToken, tokenValid, username, isValidating, validateToken, getActualToken } = useDiscogsAuth();
  const {
    matches,
    selectedMatches,
    selectedItems,
    isProcessing,
    error: matchError,
    matchStats,
    processMatches,
    toggleMatch,
    selectAll,
    selectNone,
    resetWorkflow,
  } = useMatchWorkflow();
  const { isSyncing, syncResults, error: syncError, syncToDiscogs, resetSync } = useSyncWorkflow();
  
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const error = matchError || syncError;

  const testToken = () => {
    validateToken();
  };

  const handleUploadComplete = async (data: {
    sessionId: string;
    purchases: any[];
    itemCount: number;
  }) => {
    resetSync();
    await processMatches(data.purchases);
  };


  const handleSyncClick = () => {
    if (!token || selectedMatches.size === 0) return;
    setShowConfirmDialog(true);
  };

  const handleSync = async () => {
    setShowConfirmDialog(false);
    const actualToken = getActualToken();
    if (actualToken) {
      await syncToDiscogs(actualToken, selectedItems);
    }
  };

  const handleReset = () => {
    resetWorkflow();
    resetSync();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b" role="banner">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">BC→DC Sync</h1>
          <p className="text-sm text-gray-600 mt-1">
            Sync Bandcamp purchases to your Discogs collection
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8" role="main" aria-label="Sync workflow">
        {/* Token Input */}
        <TokenInput
          token={token}
          setToken={setToken}
          tokenValid={tokenValid}
          username={username}
          isValidating={isValidating}
          onTest={testToken}
        />

        {/* Upload Section */}
        {tokenValid && !syncResults && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">2. Upload Bandcamp CSV</h2>
            <FileUpload 
              onUploadComplete={handleUploadComplete}
              onError={(err) => {
                // Clear any existing match error when new upload error occurs
                if (matchError) {
                  resetWorkflow(); // This clears the match error
                }
                // The FileUpload component will handle displaying the new error
              }}
            />
          </div>
        )}

        {/* Processing */}
        {isProcessing && (
          <div aria-live="polite" aria-busy="true">
            <MatchListSkeleton />
            <span className="sr-only">Processing matches, please wait</span>
          </div>
        )}

        {/* Match Selection */}
        {matches.length > 0 && !syncResults && !isProcessing && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">3. Select Items to Sync</h2>
              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-600">
                  {selectedMatches.size} of {matchStats.withMatches} selected
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={selectAll}
                    className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded"
                  >
                    Select All
                  </button>
                  <button
                    onClick={selectNone}
                    className="text-xs px-2 py-1 text-gray-600 hover:bg-gray-50 rounded"
                  >
                    Clear All
                  </button>
                </div>
              </div>
            </div>

            {/* Match Quality Summary */}
            {matchStats.total > 0 && (
              <div className="mb-4 p-3 bg-gray-50 rounded-md text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Match Quality:</span>
                  <div className="flex gap-4">
                    <span className="text-green-600">High: {matchStats.highConfidence}</span>
                    <span className="text-yellow-600">Medium: {matchStats.mediumConfidence}</span>
                    <span className="text-orange-600">Low: {matchStats.lowConfidence}</span>
                    <span className="text-red-600">No match: {matchStats.noMatches}</span>
                  </div>
                </div>
              </div>
            )}

            <VirtualMatchList
              matches={matches}
              selectedMatches={selectedMatches}
              onToggle={toggleMatch}
              height={384} // max-h-96 = 24rem = 384px
            />

            {selectedMatches.size > 20 && (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded" role="alert" aria-live="polite">
                <p className="text-sm text-yellow-800">
                  <span className="sr-only">Warning:</span>
                  <span aria-hidden="true">⚠️</span> Large batch detected. Only the first 20 items will be synced to avoid timeouts.
                  Discogs rate limits require ~1 second between adds.
                </p>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={handleSyncClick}
                disabled={selectedMatches.size === 0 || isSyncing}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 inline-flex items-center gap-2"
              >
                {isSyncing && (
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {isSyncing ? 'Syncing...' : `Sync ${Math.min(selectedMatches.size, 20)} Items`}
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Start Over
              </button>
            </div>
          </div>
        )}

        {/* Sync Results */}
        {syncResults && (
          <SyncResults
            results={syncResults.results}
            onReset={handleReset}
          />
        )}

        {/* Error Display */}
        {error && !syncResults && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md" role="alert">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
      </main>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={handleSync}
        title="Confirm Sync to Discogs"
        message="You're about to add these items to your Discogs collection. This action cannot be undone automatically."
        itemCount={Math.min(selectedMatches.size, 20)}
        confirmText="Yes, Sync Items"
        cancelText="Cancel"
      />
    </div>
  );
}