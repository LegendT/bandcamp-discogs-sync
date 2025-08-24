export type PurchaseFormat = 'Digital' | 'Vinyl' | 'CD' | 'Cassette' | 'Other';

export interface BandcampPurchase {
  artist: string;
  itemTitle: string;
  itemUrl: string;
  purchaseDate: Date;
  format: PurchaseFormat;
  rawFormat: string; // Keep original for debugging
  originalTitle?: string; // Store original title before normalization
  originalArtist?: string; // Store original artist before normalization
}

export interface BandcampCSVRow {
  artist: string;
  item_title: string;
  item_url: string;
  purchase_date: string;
  format: string;
}