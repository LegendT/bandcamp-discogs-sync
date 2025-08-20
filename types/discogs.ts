export interface DiscogsRelease {
  id: number;
  title: string;
  artists_sort: string;
  year: number;
  resource_url: string;
  uri: string;
  // Add more fields as needed
}

export interface DiscogsSearchResult {
  results: DiscogsRelease[];
  pagination: {
    items: number;
    page: number;
    pages: number;
    per_page: number;
  };
}

export interface DiscogsError {
  message: string;
  status?: number;
}