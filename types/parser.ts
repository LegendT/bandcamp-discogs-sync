import { BandcampPurchase } from './bandcamp';

export interface ParseError {
  row: number;
  error: string;
  data?: any;
}

export interface ParseResult {
  purchases: BandcampPurchase[];
  summary: {
    totalRows: number;
    successfulRows: number;
    skippedRows: number;
    duplicatesRemoved: number;
    errors: ParseError[];
    formatBreakdown: Record<string, number>;
    dateRange?: {
      earliest: Date;
      latest: Date;
    };
  };
}