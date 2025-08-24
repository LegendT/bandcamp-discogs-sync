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

    Papa.parse<BandcampCSVRow>(file, {
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
          
          // Update progress with throttling
          if (onProgress && row.meta?.cursor) {
            const percent = Math.round((row.meta.cursor / file.size) * 100);
            if (percent - lastProgress >= 5) { // Only update every 5%
              onProgress(percent);
              lastProgress = percent;
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
 * Normalize artist name for better matching
 */
function normalizeArtistName(artist: string): string {
  if (!artist || typeof artist !== 'string') return '';
  
  return artist
    .trim()
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/^The\s+/i, '') // Remove leading "The"
    .replace(/[^\w\s\-\.\'&,]/g, '') // Remove special chars except common ones
    .trim();
}

/**
 * Normalize album title for better matching
 */
function normalizeAlbumTitle(title: string): string {
  if (!title || typeof title !== 'string') return '';
  
  // Preserve original title but clean it up
  const cleaned = title
    .trim()
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[^\w\s\-\.\'&,\(\)\[\]]/g, ''); // Keep only safe chars
  
  // Only remove specific edition markers, not all parenthetical content
  const withoutEditions = cleaned
    .replace(/\s*\[(Deluxe|Expanded|Remastered|Special|Limited|Bonus|Anniversary|Edition|Explicit)+.*?\]/gi, '')
    .replace(/\s*\((Deluxe|Expanded|Remastered|Special|Limited|Bonus|Anniversary|Edition|Explicit)+.*?\)/gi, '');
  
  return withoutEditions.trim() || title.trim(); // Fallback to original if normalization fails
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