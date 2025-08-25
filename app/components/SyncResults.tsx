'use client';

interface SyncResultsProps {
  results: {
    successful: Array<{
      artist: string;
      title: string;
    }>;
    failed: Array<{
      item: string;
      error: string;
    }>;
  };
  onReset: () => void;
}

export default function SyncResults({ results, onReset }: SyncResultsProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold mb-4">Sync Complete</h2>
      
      <div className="space-y-4">
        {results.successful?.length > 0 && (
          <div>
            <h3 className="font-medium text-green-800 mb-2">
              <span className="sr-only">Success:</span>
              <span aria-hidden="true">✅</span> Successfully Added ({results.successful.length})
            </h3>
            <ul className="text-sm space-y-1" role="list">
              {results.successful.map((item, idx) => (
                <li key={idx} className="text-gray-700">
                  • {item.artist} - {item.title}
                </li>
              ))}
            </ul>
          </div>
        )}

        {results.failed?.length > 0 && (
          <div>
            <h3 className="font-medium text-red-800 mb-2">
              <span className="sr-only">Error:</span>
              <span aria-hidden="true">❌</span> Failed ({results.failed.length})
            </h3>
            <ul className="text-sm space-y-1" role="list">
              {results.failed.map((item, idx) => (
                <li key={idx} className="text-gray-700">
                  • {item.item}: {item.error}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <button
        onClick={onReset}
        className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        aria-label="Start over with a new CSV upload"
      >
        Upload Another CSV
      </button>
    </div>
  );
}