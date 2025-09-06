import { NextRequest, NextResponse } from 'next/server';
import { BandcampScraper, BandcampItem, ProcessedItem } from '@/lib/bandcamp/scraper';

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  // Create a stream to send progress updates
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { username, items } = await request.json();
        
        if (!username || !items || !Array.isArray(items)) {
          controller.enqueue(
            encoder.encode(JSON.stringify({ 
              type: 'error', 
              data: 'Invalid request data' 
            }) + '\n')
          );
          controller.close();
          return;
        }
        
        const scraper = new BandcampScraper();
        await scraper.initialize();
        
        try {
          // Check login status first
          const isLoggedIn = await scraper.checkLoginStatus();
          
          if (!isLoggedIn) {
            controller.enqueue(
              encoder.encode(JSON.stringify({ 
                type: 'warning', 
                data: 'Not logged in - format detection will be limited' 
              }) + '\n')
            );
          }
          
          const processedItems: ProcessedItem[] = [];
          const total = items.length;
          
          // Process each item
          for (let i = 0; i < items.length; i++) {
            const item = items[i] as BandcampItem;
            
            // Send progress update
            controller.enqueue(
              encoder.encode(JSON.stringify({ 
                type: 'progress', 
                data: { current: i + 1, total } 
              }) + '\n')
            );
            
            // Detect format for this item
            const [processed] = await scraper.detectFormats([item]);
            processedItems.push(processed);
            
            // Small delay to avoid rate limiting
            if (i < items.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
          
          // Send complete update
          controller.enqueue(
            encoder.encode(JSON.stringify({ 
              type: 'complete', 
              data: {
                username,
                items: processedItems,
                scrapedAt: new Date(),
                formatDetectionComplete: true
              }
            }) + '\n')
          );
          
        } finally {
          await scraper.cleanup();
        }
        
      } catch (error) {
        console.error('Format detection error:', error);
        controller.enqueue(
          encoder.encode(JSON.stringify({ 
            type: 'error', 
            data: error instanceof Error ? error.message : 'Unknown error' 
          }) + '\n')
        );
      } finally {
        controller.close();
      }
    }
  });
  
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}