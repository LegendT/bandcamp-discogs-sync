import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/utils/logger';
import { parseBandcampCSVString } from '@/lib/bandcamp/parser';

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Request validation schema
const UploadRequestSchema = z.object({
  filename: z.string().endsWith('.csv', 'File must be a CSV'),
  content: z.string().min(1, 'File cannot be empty')
});

export async function POST(request: NextRequest) {
  try {
    // Check content length
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
      return NextResponse.json({
        success: false,
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
      }, { status: 413 });
    }
    
    // Parse multipart form data or JSON
    const contentType = request.headers.get('content-type') || '';
    let filename: string;
    let content: string;
    
    if (contentType.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await request.formData();
      const file = formData.get('file') as File;
      
      if (!file) {
        return NextResponse.json({
          success: false,
          error: 'No file provided'
        }, { status: 400 });
      }
      
      // Validate file
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({
          success: false,
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
        }, { status: 413 });
      }
      
      if (!file.name.toLowerCase().endsWith('.csv')) {
        return NextResponse.json({
          success: false,
          error: 'File must be a CSV'
        }, { status: 400 });
      }
      
      filename = file.name;
      content = await file.text();
      
    } else {
      // Handle JSON body
      const body = await request.json();
      const validated = UploadRequestSchema.parse(body);
      filename = validated.filename;
      content = validated.content;
    }
    
    // Sanitize filename
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9\-_.]/g, '_');
    
    logger.info('Processing CSV upload', {
      filename: sanitizedFilename,
      size: Buffer.byteLength(content)
    });
    
    // Parse CSV with progress tracking
    const parseResult = await parseBandcampCSVString(content, filename);
    
    logger.info('CSV parsed successfully', {
      totalPurchases: parseResult.purchases.length,
      errors: parseResult.summary.errors.length
    });
    
    // Return results
    return NextResponse.json({
      success: true,
      filename: sanitizedFilename,
      purchases: parseResult.purchases,
      summary: parseResult.summary
    });
    
  } catch (error) {
    logger.error('Upload API error', { error });
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      }, { status: 400 });
    }
    
    if (error instanceof Error) {
      return NextResponse.json({
        success: false,
        error: error.message
      }, { status: 500 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Failed to process CSV file'
    }, { status: 500 });
  }
}

// Configure route segment
export const runtime = 'nodejs';
export const maxDuration = 30; // 30 seconds timeout