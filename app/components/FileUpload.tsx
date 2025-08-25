'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

interface FileUploadProps {
  onUploadComplete: (data: { 
    sessionId: string; 
    purchases: any[]; 
    itemCount: number 
  }) => void;
  onError: (error: string) => void;
}

export default function FileUpload({ onUploadComplete, onError }: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    const file = acceptedFiles[0];
    if (!file.name.endsWith('.csv')) {
      onError('Please upload a valid Bandcamp CSV file');
      return;
    }

    setFileName(file.name);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const data = await response.json();
      onUploadComplete(data);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Upload failed');
      setFileName(null);
    } finally {
      setIsUploading(false);
    }
  }, [onUploadComplete, onError]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
    disabled: isUploading,
  });

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors duration-200
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />
        
        <svg
          className="mx-auto h-12 w-12 text-gray-400 mb-4"
          stroke="currentColor"
          fill="none"
          viewBox="0 0 48 48"
        >
          <path
            d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {isUploading ? (
          <div>
            <p className="text-sm text-gray-600 mb-2">Uploading...</p>
            <div className="w-32 h-2 bg-gray-200 rounded-full mx-auto">
              <div className="h-full bg-blue-500 rounded-full animate-pulse" />
            </div>
          </div>
        ) : isDragActive ? (
          <p className="text-sm text-gray-600">Drop your CSV file here</p>
        ) : fileName ? (
          <div>
            <p className="text-sm text-gray-900 font-medium">{fileName}</p>
            <p className="text-xs text-gray-500 mt-1">Click or drag to replace</p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-600">
              Drag and drop your Bandcamp CSV file here, or click to browse
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Export your purchase history from Bandcamp settings
            </p>
          </div>
        )}
      </div>
    </div>
  );
}