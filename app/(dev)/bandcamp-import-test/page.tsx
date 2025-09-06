'use client';

import { useState } from 'react';
import BandcampImporter from '@/app/components/BandcampImporter';
import { ProcessedItem } from '@/lib/bandcamp/scraper';
import { useBandcampImport } from '@/app/hooks/useBandcampImport';

export default function BandcampImportTestPage() {
  const [importedItems, setImportedItems] = useState<ProcessedItem[]>([]);
  const {
    markItemSynced,
    stats,
    getPhysicalItems,
    getDigitalItems,
    getUnsyncedItems
  } = useBandcampImport({
    onImportComplete: (items) => setImportedItems(items)
  });

  const handleSyncToDiscogs = async (item: ProcessedItem) => {
    // This would integrate with your existing Discogs sync logic
    console.log('Syncing to Discogs:', item);
    
    // Simulate sync
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mark as synced
    await markItemSynced(item.id, 'discogs-release-' + item.id);
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Bandcamp Import Test</h1>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Import Collection</h2>
        <BandcampImporter 
          onItemsImported={(items) => {
            setImportedItems(items);
            console.log('Imported items:', items);
          }}
        />
      </div>

      {importedItems.length > 0 && (
        <div className="space-y-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Import Summary</h3>
            <div className="grid grid-cols-5 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Total:</span> {stats.total}
              </div>
              <div>
                <span className="text-gray-600">Physical:</span> {stats.physical}
              </div>
              <div>
                <span className="text-gray-600">Digital:</span> {stats.digital}
              </div>
              <div>
                <span className="text-gray-600">Unknown:</span> {stats.unknown}
              </div>
              <div>
                <span className="text-gray-600">Synced:</span> {stats.synced}
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Filter Options</h3>
            <div className="flex gap-2">
              <button
                onClick={() => console.log('Physical items:', getPhysicalItems())}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded"
              >
                Show Physical Only
              </button>
              <button
                onClick={() => console.log('Digital items:', getDigitalItems())}
                className="px-3 py-1 bg-green-100 text-green-700 rounded"
              >
                Show Digital Only
              </button>
              <button
                onClick={() => console.log('Unsynced items:', getUnsyncedItems())}
                className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded"
              >
                Show Unsynced
              </button>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Actions</h3>
            <p className="text-sm text-gray-600 mb-2">
              Click items to sync them to Discogs (simulated)
            </p>
            <div className="grid gap-2 max-h-96 overflow-y-auto">
              {importedItems.slice(0, 10).map((item) => (
                <div
                  key={item.id}
                  className="p-2 border rounded hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleSyncToDiscogs(item)}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-medium">{item.title}</div>
                      <div className="text-sm text-gray-600">
                        {item.bandName} • {item.format || 'Unknown format'}
                      </div>
                    </div>
                    <div className="text-sm">
                      {item.syncedToDiscogs ? '✅ Synced' : '⏳ Not synced'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}