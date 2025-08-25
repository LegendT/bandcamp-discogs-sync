'use client';

import React from 'react';
import { logger } from '@/lib/utils/logger';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
  lastErrorTime: number;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private resetTimeoutId: NodeJS.Timeout | null = null;
  private isMounted: boolean = false; // Start as false, set true in componentDidMount

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorCount: 0,
      lastErrorTime: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const now = Date.now();
    return { 
      hasError: true, 
      error,
      lastErrorTime: now
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const { errorCount, lastErrorTime } = this.state;
    const now = Date.now();
    
    // Track error frequency
    const timeSinceLastError = now - lastErrorTime;
    const isRepeatedError = timeSinceLastError < 1000; // Within 1 second
    
    // Clear any existing timeout before setting new state
    this.clearAutoResetTimeout();
    
    this.setState(prevState => ({
      errorCount: isRepeatedError ? prevState.errorCount + 1 : 1
    }));

    // Log the error
    logger.error('Error caught by boundary:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorCount: this.state.errorCount + 1,
      isRepeated: isRepeatedError
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Auto-reset after 10 seconds if not a repeated error (reduced from 30s)
    if (!isRepeatedError && this.state.errorCount < 3) {
      this.scheduleAutoReset();
    }
  }

  componentDidMount() {
    this.isMounted = true;
  }

  componentWillUnmount() {
    this.isMounted = false;
    this.clearAutoResetTimeout();
  }

  private clearAutoResetTimeout = () => {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
      this.resetTimeoutId = null;
    }
  };

  scheduleAutoReset = () => {
    this.clearAutoResetTimeout();
    
    this.resetTimeoutId = setTimeout(() => {
      // Only reset if component is still mounted and timeout wasn't cleared
      if (this.isMounted && this.resetTimeoutId) {
        this.reset();
      }
    }, 10000); // Reduced to 10 seconds for better UX
  };

  reset = () => {
    this.clearAutoResetTimeout();
    
    this.setState({ 
      hasError: false, 
      error: null,
      errorCount: 0,
      lastErrorTime: 0
    });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }

      const { error, errorCount } = this.state;
      const isNetworkError = error.message.toLowerCase().includes('network') || 
                           error.message.toLowerCase().includes('fetch');
      const isChunkError = error.message.toLowerCase().includes('chunk') ||
                          error.message.toLowerCase().includes('loading');

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-md p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <svg
                className="w-8 h-8 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {isNetworkError ? 'Connection Problem' : 
                   isChunkError ? 'Loading Error' : 
                   'Something went wrong'}
                </h2>
                {errorCount > 2 && (
                  <p className="text-sm text-red-600">Multiple errors detected</p>
                )}
              </div>
            </div>
            
            <p className="text-gray-600 mb-4">
              {isNetworkError ? 
                'Please check your internet connection and try again.' :
               isChunkError ? 
                'The application failed to load properly. Please refresh the page.' :
               errorCount > 2 ?
                'The application is experiencing issues. Please refresh the page or try again later.' :
                'We encountered an unexpected error. This will auto-recover in 10 seconds.'}
            </p>
            
            {this.state.error && (
              <details className="mb-4">
                <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
                  Technical details
                </summary>
                <div className="mt-2 space-y-1">
                  <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto">
                    {this.state.error.message}
                  </pre>
                  {process.env.NODE_ENV === 'development' && (
                    <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
                      {this.state.error.stack}
                    </pre>
                  )}
                </div>
              </details>
            )}
            
            <div className="flex gap-2">
              {errorCount <= 2 && (
                <button
                  onClick={this.reset}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Try Again
                </button>
              )}
              <button
                onClick={() => window.location.reload()}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                Refresh Page
              </button>
              {isNetworkError && (
                <button
                  onClick={() => window.location.href = '/'}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Go Home
                </button>
              )}
            </div>

            {errorCount <= 2 && !isChunkError && (
              <p className="mt-4 text-xs text-gray-500 text-center">
                Auto-recovery in 10 seconds...
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}