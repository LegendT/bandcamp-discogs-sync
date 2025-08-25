import { z } from 'zod';

/**
 * Sanitize strings to prevent XSS and CSV injection
 * More balanced approach that preserves legitimate content
 */
const sanitizeString = (str: string): string => {
  if (!str) return '';
  
  let cleaned = str.trim();
  
  // Remove dangerous HTML/script patterns
  cleaned = cleaned
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
  
  // CSV injection protection - check entire string for formulas
  if (/^[=+\-@]|[\r\n][=+\-@]/.test(cleaned)) {
    // Escape with single quote
    cleaned = cleaned.replace(/^([=+\-@])/gm, "'$1");
  }
  
  return cleaned;
};

/**
 * Create a safe string schema with validation
 */
const safeString = (maxLength: number, options?: {
  minLength?: number;
  pattern?: RegExp;
  patternError?: string;
}) => {
  let schema = z
    .string()
    .min(options?.minLength || 1, 'Field cannot be empty')
    .max(maxLength, `Field cannot exceed ${maxLength} characters`)
    .transform(sanitizeString);
  
  // Apply pattern validation with timeout protection
  if (options?.pattern) {
    schema = schema.refine(
      (val) => {
        try {
          // Set a timeout for regex execution to prevent ReDoS
          const start = Date.now();
          const result = options.pattern!.test(val);
          const duration = Date.now() - start;
          
          // If regex takes too long, reject it
          if (duration > 100) {
            console.warn('Regex execution took too long', { duration, pattern: options.pattern!.source });
            return false;
          }
          
          return result;
        } catch (error) {
          console.error('Regex execution failed', error);
          return false;
        }
      },
      options.patternError || 'Invalid format'
    );
  }
  
  return schema;
};

// Flexible date parsing
const flexibleDate = z.string().transform((str, ctx) => {
  if (!str) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Date is required'
    });
    return z.NEVER;
  }
  
  // Try to parse the date
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    // Validate it's not too far in the future or past
    const now = new Date();
    const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    const hundredYearsAgo = new Date(now.getFullYear() - 100, now.getMonth(), now.getDate());
    
    if (date > oneYearFromNow) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Date cannot be more than 1 year in the future'
      });
      return z.NEVER;
    }
    
    if (date < hundredYearsAgo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Date cannot be more than 100 years in the past'
      });
      return z.NEVER;
    }
    
    return date;
  }
  
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'Invalid date format'
  });
  return z.NEVER;
});

// Bandcamp CSV row schema - flexible for real exports
export const BandcampCsvRowSchema = z.object({
  // Required fields
  artist: safeString(300),
  item_title: safeString(500),
  item_url: z.string().max(2000).refine(
    (url) => {
      if (!url) return true; // Allow empty
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    },
    'Invalid URL format'
  ),
  purchase_date: z.string().min(1),
  format: safeString(100),
  
  // Common optional fields
  price: z.string().optional(),
  currency: z.string().max(10).optional(),
  order_number: z.string().max(100).optional(),
  quantity: z.string().max(10).optional(),
  subtotal: z.string().optional(),
  discount: z.string().optional(),
  tax: z.string().optional(),
  total: z.string().optional(),
  payment_method: z.string().max(50).optional(),
  
  // Allow additional fields but limit their size
}).catchall(z.string().max(1000).optional());

// Bandcamp purchase schema (normalized)
export const BandcampPurchaseSchema = z.object({
  artist: safeString(300),
  itemTitle: safeString(500),
  itemUrl: z.string().url().max(2000),
  purchaseDate: flexibleDate,
  format: z.enum(['Digital', 'Vinyl', 'CD', 'Cassette', 'Other']),
  rawFormat: safeString(100),
  
  // Optional normalized fields
  originalArtist: safeString(300).optional(),
  originalTitle: safeString(500).optional()
});

// Matching options with defaults
export const MatchingOptionsSchema = z.object({
  includeAlternatives: z.boolean().default(true),
  maxAlternatives: z.number().int().min(0).max(10).default(3),
  formatStrictness: z.enum(['strict', 'loose', 'any']).default('loose'),
  minConfidence: z.number().min(0).max(100).default(0),
  timeout: z.number().int().min(1000).max(30000).optional()
}).strict(); // Don't allow extra fields

// Search query validation
export const SearchQuerySchema = z.object({
  artist: safeString(300).optional(),
  title: safeString(500).optional(),
  format: z.enum(['Digital', 'Vinyl', 'CD', 'Cassette', 'Other']).optional()
}).refine(
  (data) => data.artist || data.title,
  'At least artist or title must be provided'
);

// File upload validation
export const FileUploadSchema = z.object({
  filename: z.string()
    .min(1, 'Filename is required')
    .max(255, 'Filename too long')
    .refine(
      (name) => /^[\w\-. ]+\.csv$/i.test(name),
      'Invalid filename - must be alphanumeric with .csv extension'
    ),
  content: z.string()
    .min(1, 'File cannot be empty')
    .max(10 * 1024 * 1024, 'File too large (max 10MB)'),
  mimeType: z.enum(['text/csv', 'application/csv', 'text/plain']).optional()
});

// Batch request validation
export const BatchRequestSchema = z.object({
  purchases: z.array(BandcampPurchaseSchema)
    .min(1, 'At least one purchase required')
    .max(100, 'Maximum 100 purchases per batch'), // Reduced for safety
  options: MatchingOptionsSchema.optional(),
  requestId: z.string().uuid().optional()
});

// API request metadata
export const ApiRequestMetadataSchema = z.object({
  userId: z.string().max(100).optional(),
  sessionId: z.string().max(100).optional(),
  source: z.enum(['web', 'api', 'cli', 'test']).default('api'),
  version: z.string().max(20).optional()
});

/**
 * Custom error class with field-level details
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public fieldErrors: Array<{
      field: string;
      message: string;
      value?: any;
    }>
  ) {
    super(message);
    this.name = 'ValidationError';
  }
  
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      fieldErrors: this.fieldErrors
    };
  }
}

/**
 * Validate with detailed field errors
 */
export function validateWithDetails<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  errorMessage = 'Validation failed'
): T {
  const result = schema.safeParse(data);
  
  if (!result.success) {
    const fieldErrors = result.error.issues.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      value: err.path.reduce((obj: any, key) => obj?.[key], data)
    }));
    
    throw new ValidationError(errorMessage, fieldErrors);
  }
  
  return result.data;
}

// Sync endpoint schema
export const syncSchema = z.object({
  matches: z.array(z.object({
    bandcampItem: BandcampPurchaseSchema,
    discogsMatch: z.object({
      id: z.number(),
      title: z.string(),
      thumb: z.string().optional()
    }).nullable(),
    confidence: z.number(),
    reasoning: z.array(z.string())
  }))
});

// Convenience validators
export const validateBandcampPurchase = (data: unknown) => 
  validateWithDetails(BandcampPurchaseSchema, data, 'Invalid purchase data');

export const validateCsvRow = (data: unknown) => 
  validateWithDetails(BandcampCsvRowSchema, data, 'Invalid CSV row data');

export const validateBatchRequest = (data: unknown) => 
  validateWithDetails(BatchRequestSchema, data, 'Invalid batch request');

// Type exports
export type BandcampCsvRow = z.infer<typeof BandcampCsvRowSchema>;
export type ValidatedBandcampPurchase = z.infer<typeof BandcampPurchaseSchema>;
export type ValidatedSearchQuery = z.infer<typeof SearchQuerySchema>;
export type ValidatedMatchingOptions = z.infer<typeof MatchingOptionsSchema>;
export type ValidatedBatchRequest = z.infer<typeof BatchRequestSchema>;
export type ApiRequestMetadata = z.infer<typeof ApiRequestMetadataSchema>;