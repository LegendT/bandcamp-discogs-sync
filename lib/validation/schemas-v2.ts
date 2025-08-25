import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize strings while preserving legitimate characters
 * This is more nuanced than aggressive stripping
 */
const sanitizeString = (str: string): string => {
  // Use DOMPurify for proper sanitization that preserves legitimate content
  const cleaned = DOMPurify.sanitize(str, { 
    ALLOWED_TAGS: [], // No HTML tags
    ALLOWED_ATTR: [], // No attributes
    KEEP_CONTENT: true // Keep text content
  });
  
  // Additional protection against CSV injection
  if (/^[=+\-@\t\r]/.test(cleaned.trim())) {
    // Prefix with single quote to prevent formula execution
    return `'${cleaned.trim()}`;
  }
  
  return cleaned.trim();
};

/**
 * Create a safe string schema with configurable options
 */
const safeString = (maxLength: number, options?: {
  preserveUnicode?: boolean;
  allowPunctuation?: boolean;
  pattern?: RegExp;
}) => {
  let schema = z
    .string()
    .min(1, 'Field cannot be empty')
    .max(maxLength, `Field cannot exceed ${maxLength} characters`)
    .transform(sanitizeString);
  
  // Only apply strict validation if explicitly requested
  if (options?.pattern) {
    schema = schema.refine(
      (val) => options.pattern!.test(val),
      'Invalid format'
    );
  }
  
  return schema;
};

// Bandcamp CSV row schema with flexibility for real-world data
export const BandcampCsvRowSchema = z.object({
  // Required fields with sensible validation
  artist: safeString(300, { preserveUnicode: true }),
  item_title: safeString(500, { preserveUnicode: true }),
  item_url: z.string().url('Invalid URL format').or(z.string().length(0)), // Allow empty
  purchase_date: z.string(), // Be flexible with date formats
  format: safeString(100),
  
  // Optional fields that might exist in exports
  price: z.string().optional(),
  currency: z.string().optional(),
  order_number: z.string().optional(),
  quantity: z.string().optional(),
  subtotal: z.string().optional(),
  // Be flexible for unknown fields
}).passthrough(); // Allow extra fields

// Date parsing with multiple format support
const flexibleDate = z.string().transform((str, ctx) => {
  // Try multiple date formats
  const formats = [
    /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
    /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
    /^\d{2}-\d{2}-\d{4}$/, // DD-MM-YYYY
  ];
  
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date;
  }
  
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'Invalid date format'
  });
  return z.NEVER;
});

// Bandcamp purchase schema (transformed)
export const BandcampPurchaseSchema = z.object({
  artist: safeString(300, { preserveUnicode: true }),
  itemTitle: safeString(500, { preserveUnicode: true }),
  itemUrl: z.string().url(),
  purchaseDate: flexibleDate,
  format: z.enum(['Digital', 'Vinyl', 'CD', 'Cassette', 'Other']),
  rawFormat: safeString(100)
});

// Matching options schema with validation
export const MatchingOptionsSchema = z.object({
  includeAlternatives: z.boolean().optional().default(true),
  maxAlternatives: z.number().min(0).max(10).optional().default(3),
  formatStrictness: z.enum(['strict', 'loose', 'any']).optional().default('loose'),
  minConfidence: z.number().min(0).max(100).optional().default(0),
  timeout: z.number().min(1000).max(30000).optional() // 1-30 seconds
});

// API search query schema with better validation
export const SearchQuerySchema = z.object({
  artist: safeString(300, { preserveUnicode: true }).optional(),
  title: safeString(500, { preserveUnicode: true }).optional(),
  format: z.enum(['Digital', 'Vinyl', 'CD', 'Cassette', 'Other', '']).optional()
}).refine(
  (data) => data.artist || data.title,
  'At least artist or title must be provided'
);

// CSV upload schema with better file validation
export const CsvUploadSchema = z.object({
  file: z.instanceof(File)
    .refine((file) => file.size > 0, 'File cannot be empty')
    .refine((file) => file.size <= 10 * 1024 * 1024, 'File size must be less than 10MB')
    .refine((file) => {
      const validTypes = ['text/csv', 'application/csv', 'text/plain'];
      return validTypes.includes(file.type) || file.name.toLowerCase().endsWith('.csv');
    }, 'File must be CSV format')
});

// Batch processing request schema
export const BatchProcessingSchema = z.object({
  purchases: z.array(BandcampPurchaseSchema)
    .min(1, 'At least one purchase required')
    .max(1000, 'Maximum 1000 purchases per batch'),
  options: MatchingOptionsSchema.optional()
});

// Request metadata schema for tracking
export const RequestMetadataSchema = z.object({
  requestId: z.string().uuid().optional(),
  userId: z.string().optional(),
  source: z.enum(['web', 'api', 'cli']).optional(),
  timestamp: z.date().optional()
});

/**
 * Validate and sanitize Bandcamp purchase data with detailed errors
 */
export function validateBandcampPurchase(data: unknown) {
  const result = BandcampPurchaseSchema.safeParse(data);
  
  if (!result.success) {
    const fieldErrors = result.error.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message
    }));
    
    throw new ValidationError('Invalid purchase data', fieldErrors);
  }
  
  return result.data;
}

/**
 * Validate CSV row data with detailed errors
 */
export function validateCsvRow(data: unknown) {
  const result = BandcampCsvRowSchema.safeParse(data);
  
  if (!result.success) {
    const fieldErrors = result.error.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message
    }));
    
    throw new ValidationError('Invalid CSV data', fieldErrors);
  }
  
  return result.data;
}

/**
 * Custom validation error for better error handling
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public fieldErrors: Array<{ field: string; message: string }>
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Type exports
 */
export type BandcampCsvRow = z.infer<typeof BandcampCsvRowSchema>;
export type ValidatedBandcampPurchase = z.infer<typeof BandcampPurchaseSchema>;
export type ValidatedSearchQuery = z.infer<typeof SearchQuerySchema>;
export type ValidatedMatchingOptions = z.infer<typeof MatchingOptionsSchema>;
export type RequestMetadata = z.infer<typeof RequestMetadataSchema>;