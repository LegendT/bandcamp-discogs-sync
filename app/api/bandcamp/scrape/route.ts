import { NextRequest, NextResponse } from 'next/server';
import { BandcampScraper } from '@/lib/bandcamp/scraper';

export async function POST(request: NextRequest) {
  try {
    const { username, detectFormats = false } = await request.json();
    
    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }
    
    const scraper = new BandcampScraper();
    
    try {
      const collection = await scraper.scrapeCompleteCollection(username, detectFormats);
      
      return NextResponse.json(collection);
    } catch (error) {
      console.error('Scraping error:', error);
      
      // Check if it's a navigation/page not found error
      if (error instanceof Error && error.message.includes('navigation')) {
        return NextResponse.json(
          { error: `User "${username}" not found on Bandcamp` },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { error: 'Failed to scrape Bandcamp collection' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Request error:', error);
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
}