export default function TokenInputSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="h-7 w-64 bg-gray-200 rounded animate-pulse mb-4" />
      
      <div className="space-y-4">
        <div>
          <div className="h-4 w-32 bg-gray-200 rounded animate-pulse mb-2" />
          <div className="flex gap-2">
            <div className="flex-1 h-10 bg-gray-200 rounded animate-pulse" />
            <div className="h-10 w-32 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
        
        <div className="h-20 w-full bg-gray-100 rounded animate-pulse" />
      </div>
    </div>
  );
}