import { z } from 'zod';

// Sanitize strings by removing potential XSS/injection characters
const sanitizeString = (str: string): string => {
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/<[^>]+>/g, '') // Remove HTML tags
    .replace(/[<>'"]/g, '') // Remove potentially dangerous characters
    .trim();
};

// Custom Zod refinement for safe strings
const safeString = (maxLength: number) => z
  .string()
  .min(1, 'Field cannot be empty')
  .max(maxLength, `Field cannot exceed ${maxLength} characters`)
  .transform(sanitizeString)
  .refine(
    (val) => !/<script|<iframe|javascript:|on\w+=/i.test(val),
    'Invalid characters detected'
  );

// Bandcamp CSV row schema
export const BandcampCsvRowSchema = z.object({
  artist: safeString(200),
  item_title: safeString(300),
  item_url: z.string().url('Invalid URL format'),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
  format: safeString(100),
  // Optional fields
  price: z.string().optional(),
  currency: z.string().optional(),
  order_number: z.string().optional()
});

// Bandcamp purchase schema (transformed)
export const BandcampPurchaseSchema = z.object({
  artist: safeString(200),
  itemTitle: safeString(300),
  itemUrl: z.string().url(),
  purchaseDate: z.date(),
  format: z.enum(['Digital', 'Vinyl', 'CD', 'Cassette', 'Other']),
  rawFormat: safeString(100)
});

// Matching options schema
export const MatchingOptionsSchema = z.object({
  includeAlternatives: z.boolean().optional(),
  maxAlternatives: z.number().min(0).max(10).optional(),
  formatStrictness: z.enum(['strict', 'loose', 'any']).optional(),
  minConfidence: z.number().min(0).max(100).optional()
});

// API search query schema
export const SearchQuerySchema = z.object({
  artist: safeString(200).optional(),
  title: safeString(300).optional(),
  format: safeString(50).optional()
}).refine(
  (data) => data.artist || data.title,
  'At least artist or title must be provided'
);

// CSV upload schema
export const CsvUploadSchema = z.object({
  file: z.instanceof(File)
    .refine((file) => file.size <= 10 * 1024 * 1024, 'File size must be less than 10MB')
    .refine((file) => file.type === 'text/csv' || file.name.endsWith('.csv'), 'File must be CSV format')
});

// Batch processing request schema
export const BatchProcessingSchema = z.object({
  purchases: z.array(BandcampPurchaseSchema).min(1).max(1000),
  options: MatchingOptionsSchema.optional()
});

/**
 * Validate and sanitize Bandcamp purchase data
 */
export function validateBandcampPurchase(data: unknown) {
  try {
    return BandcampPurchaseSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      throw new Error(`Validation failed: ${issues.join(', ')}`);
    }
    throw error;
  }
}

/**
 * Validate CSV row data
 */
export function validateCsvRow(data: unknown) {
  try {
    return BandcampCsvRowSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      throw new Error(`Invalid CSV data: ${issues.join(', ')}`);
    }
    throw error;
  }
}

/**
 * Type guards
 */
export type BandcampCsvRow = z.infer<typeof BandcampCsvRowSchema>;
export type ValidatedBandcampPurchase = z.infer<typeof BandcampPurchaseSchema>;
export type ValidatedSearchQuery = z.infer<typeof SearchQuerySchema>;
export type ValidatedMatchingOptions = z.infer<typeof MatchingOptionsSchema>;