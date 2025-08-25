export default function MatchListSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="h-7 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
      </div>

      <div className="space-y-2">
        {[...Array(5)].map((_, idx) => (
          <div key={idx} className="flex items-center gap-3 p-3 border rounded">
            <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
            <div className="flex-1">
              <div className="h-5 w-3/4 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="h-4 w-1/2 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}