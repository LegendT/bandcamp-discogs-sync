export default function DevLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Only show in development
  if (process.env.NODE_ENV === 'production') {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-red-600">
          Development routes are not available in production
        </h1>
      </div>
    );
  }

  return (
    <>
      <div className="bg-yellow-100 border-b border-yellow-300 p-2 text-center text-sm">
        ⚠️ Development Mode - These routes are not available in production
      </div>
      {children}
    </>
  );
}