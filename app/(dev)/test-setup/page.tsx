import { DiscogsClient } from '@/lib/discogs/client';

export default async function TestSetup() {
  const client = new DiscogsClient();
  const result = await client.testConnection();
  
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Setup Test</h1>
      <pre className="bg-gray-100 p-4 rounded">
        {JSON.stringify(result, null, 2)}
      </pre>
      <p className="mt-4 text-sm text-gray-600">
        If you see an auth error, add your Discogs token to .env.local
      </p>
    </div>
  );
}