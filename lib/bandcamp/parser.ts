import Papa from 'papaparse';
import { z } from 'zod';
import { BandcampPurchase, BandcampCSVRow, PurchaseFormat } from '@/types/bandcamp';
import { ParseResult, ParseError } from '@/types/parser';
import { logger } from '@/lib/utils/logger';

// File size limit: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Zod schema for CSV row validation
const BandcampCSVRowSchema = z.object({
  artist: z.string().min(1),
  item_title: z.string().min(1),
  item_url: z.string().url(),
  purchase_date: z.string(),
  format: z.string()
});

/**
 * Parse Bandcamp CSV export file from string content
 * @param content - The CSV content as string
 * @param filename - Optional filename for validation
 * @param onProgress - Optional progress callback (0-100)
 * @returns Array of parsed and normalized Bandcamp purchases
 */
export async function parseBandcampCSVString(
  content: string,
  filename?: string,
  onProgress?: (percent: number) => void
): Promise<ParseResult> {
  // Validate size
  const size = Buffer.byteLength(content);
  if (size > MAX_FILE_SIZE) {
    throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  if (filename && !filename.toLowerCase().endsWith('.csv')) {
    throw new Error('Invalid file type. Please provide a CSV file.');
  }

  return parseBandcampContent(content, size, onProgress);
}

/**
 * Parse Bandcamp CSV export file
 * @param file - The CSV file to parse
 * @param onProgress - Optional progress callback (0-100)
 * @returns Array of parsed and normalized Bandcamp purchases
 */
export async function parseBandcampCSV(
  file: File,
  onProgress?: (percent: number) => void
): Promise<ParseResult> {
  // Validate file
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  if (!file.name.toLowerCase().endsWith('.csv')) {
    throw new Error('Invalid file type. Please upload a CSV file.');
  }

  // Read file content
  const content = await file.text();
  return parseBandcampContent(content, file.size, onProgress);
}

/**
 * Internal function to parse CSV content
 */
function parseBandcampContent(
  content: string,
  totalSize: number,
  onProgress?: (percent: number) => void
): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const purchases: BandcampPurchase[] = [];
    const seenUrls = new Set<string>(); // Track duplicates
    const errors: ParseError[] = [];
    const formatBreakdown: Record<string, number> = {};
    let rowCount = 0;
    let skippedRows = 0;
    let duplicateCount = 0;
    let lastProgress = 0;
    let earliestDate: Date | null = null;
    let latestDate: Date | null = null;

    Papa.parse<BandcampCSVRow>(content, {
      header: true,
      skipEmptyLines: true,
      delimiter: '', // Auto-detect delimiter
      encoding: 'UTF-8',
      complete: (results) => {
        if (purchases.length === 0) {
          reject(new Error('No valid purchases found in CSV'));
        } else {
          const result: ParseResult = {
            purchases,
            summary: {
              totalRows: rowCount,
              successfulRows: purchases.length,
              skippedRows,
              duplicatesRemoved: duplicateCount,
              errors: errors.slice(0, 100), // Limit errors to first 100
              formatBreakdown,
              dateRange: earliestDate && latestDate ? {
                earliest: earliestDate,
                latest: latestDate
              } : undefined
            }
          };
          
          logger.info(`Parsed ${purchases.length} purchases (${skippedRows} rows skipped, ${duplicateCount} duplicates removed)`);
          if (errors.length > 0) {
            logger.warn(`Parse errors: ${errors.length} total, showing first 5:`, errors.slice(0, 5));
          }
          
          // Final progress update
          if (onProgress) {
            onProgress(100);
          }
          
          resolve(result);
        }
      },
      error: (error) => {
        logger.error('CSV parsing error:', error);
        reject(new Error(`Failed to parse CSV: ${error.message}`));
      },
      step: (row, parser) => {
        rowCount++;
        
        try {
          // Validate row data
          const validatedRow = BandcampCSVRowSchema.parse(row.data);
          
          // Check for duplicates
          if (seenUrls.has(validatedRow.item_url)) {
            skippedRows++;
            duplicateCount++;
            errors.push({ row: rowCount, error: 'Duplicate purchase URL', data: validatedRow });
            return;
          }
          
          // Parse and normalize the purchase
          const normalizedArtist = normalizeArtistName(validatedRow.artist);
          const normalizedTitle = normalizeAlbumTitle(validatedRow.item_title);
          const purchaseDate = parseDate(validatedRow.purchase_date);
          const format = parseFormat(validatedRow.format);
          
          const purchase: BandcampPurchase = {
            artist: normalizedArtist,
            itemTitle: normalizedTitle,
            itemUrl: validatedRow.item_url,
            purchaseDate,
            format,
            rawFormat: validatedRow.format,
            originalArtist: validatedRow.artist !== normalizedArtist ? validatedRow.artist : undefined,
            originalTitle: validatedRow.item_title !== normalizedTitle ? validatedRow.item_title : undefined
          };
          
          // Update stats
          purchases.push(purchase);
          seenUrls.add(validatedRow.item_url);
          formatBreakdown[format] = (formatBreakdown[format] || 0) + 1;
          
          // Track date range
          if (!earliestDate || purchaseDate < earliestDate) {
            earliestDate = purchaseDate;
          }
          if (!latestDate || purchaseDate > latestDate) {
            latestDate = purchaseDate;
          }
          
          // Update progress based on processed rows (estimate)
          if (onProgress && rowCount % 5 === 0) {
            // Estimate progress (can't know total rows during streaming)
            const estimatedPercent = Math.min(90, rowCount); // Cap at 90% during parsing
            if (estimatedPercent - lastProgress >= 5) {
              onProgress(estimatedPercent);
              lastProgress = estimatedPercent;
            }
          }
        } catch (error) {
          skippedRows++;
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          errors.push({ row: rowCount, error: errorMsg });
          logger.warn(`Skipped row ${rowCount}: ${errorMsg}`);
        }
      }
    });
  });
}

/**
 * Sanitize CSV field to prevent injection attacks
 */
function sanitizeCSVField(value: string): string {
  if (!value || typeof value !== 'string') return '';
  
  // Prevent CSV injection by escaping formula triggers
  const trimmed = value.trim();
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    // Prefix with single quote to prevent formula execution
    return `'${trimmed}`;
  }
  return trimmed;
}

/**
 * Normalize artist name for better matching
 */
function normalizeArtistName(artist: string): string {
  if (!artist || typeof artist !== 'string') return '';
  
  // First sanitize for CSV injection
  const safe = sanitizeCSVField(artist);
  
  return safe
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/^The\s+/i, '') // Remove leading "The"
    .replace(/[^\w\s\-\.\'&,\u00C0-\u017F]/g, '') // Remove special chars except common ones and accented chars
    .trim();
}

/**
 * Normalize album title for better matching
 */
function normalizeAlbumTitle(title: string): string {
  if (!title || typeof title !== 'string') return '';
  
  // First sanitize for CSV injection
  const safe = sanitizeCSVField(title);
  
  // Preserve original title but clean it up
  const cleaned = safe
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[^\w\s\-\.\'&,\(\)\[\]]/g, ''); // Keep only safe chars
  
  // Only remove specific edition markers, not all parenthetical content
  const withoutEditions = cleaned
    .replace(/\s*\[(.*?(Deluxe|Expanded|Remastered|Special|Limited|Bonus|Anniversary|Edition|Explicit).*?)\]/gi, '')
    .replace(/\s*\((.*?(Deluxe|Expanded|Remastered|Special|Limited|Bonus|Anniversary|Edition|Explicit).*?)\)/gi, '');
  
  return withoutEditions.trim() || safe.trim(); // Fallback to sanitized if normalization fails
}

/**
 * Parse date string to Date object
 */
function parseDate(dateStr: string): Date {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`);
  }
  return date;
}

/**
 * Parse format string to normalized format enum
 */
function parseFormat(format: string): PurchaseFormat {
  if (!format || typeof format !== 'string') return 'Other';
  
  const normalized = format.toLowerCase().trim();
  
  // Digital formats
  if (normalized.includes('digital') || 
      normalized.includes('download') || 
      normalized.includes('streaming') ||
      normalized === 'flac' || 
      normalized === 'mp3' ||
      normalized === 'wav') {
    return 'Digital';
  }
  
  // Vinyl formats
  if (normalized.includes('vinyl') || 
      normalized.includes('lp') ||
      normalized.includes('12"') || 
      normalized.includes('7"') ||
      normalized.includes('10"') ||
      normalized.includes('record')) {
    return 'Vinyl';
  }
  
  // CD formats
  if (normalized.includes('cd') || 
      normalized.includes('compact disc') ||
      normalized.includes('compact disk')) {
    return 'CD';
  }
  
  // Cassette formats
  if (normalized.includes('cassette') || 
      normalized.includes('tape') ||
      normalized.includes('cs')) {
    return 'Cassette';
  }
  
  return 'Other';
}