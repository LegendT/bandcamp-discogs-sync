import { parseBandcampCSV } from '@/lib/bandcamp/parser';
import { getDiscogsClient } from '@/lib/discogs/client-singleton';
import { DiscogsSearchQuery } from '@/types/matching';
import { logger } from '@/lib/utils/logger';
import * as fs from 'fs';
import * as path from 'path';

async function testDataExtraction() {
  logger.info('Starting data extraction test...\n');
  
  // Load test CSV
  const csvPath = path.join(process.cwd(), 'test-data', 'bandcamp-test.csv');
  const csvBuffer = fs.readFileSync(csvPath);
  const csvFile = new File([csvBuffer], 'bandcamp-test.csv', { type: 'text/csv' });
  
  // Parse CSV
  logger.info('=== CSV Parsing ===');
  let parseResult;
  try {
    parseResult = await parseBandcampCSV(csvFile, (percent) => {
      process.stdout.write(`\rParsing progress: ${percent}%`);
    });
    process.stdout.write('\n\n');
    logger.info(`Successfully parsed ${parseResult.purchases.length} purchases`);
    logger.info(`Format breakdown: ${JSON.stringify(parseResult.summary.formatBreakdown)}`);
    if (parseResult.summary.dateRange) {
      logger.info(`Date range: ${parseResult.summary.dateRange.earliest.toISOString().split('T')[0]} to ${parseResult.summary.dateRange.latest.toISOString().split('T')[0]}`);
    }
  } catch (error) {
    logger.error('Failed to parse CSV:', error);
    process.exit(1);
  }
  
  const purchases = parseResult.purchases;
  
  // Test Discogs search
  logger.info('\n=== Discogs Search Test ===');
  const client = getDiscogsClient();
  
  // Test connection first
  const connectionTest = await client.testConnection();
  if (!connectionTest.success) {
    logger.error('Failed to connect to Discogs:', connectionTest.error);
    process.exit(1);
  }
  logger.info(`Connected as: ${connectionTest.username}`);
  
  // Search for each purchase
  let matchCount = 0;
  logger.info('\nSearching for matches...\n');
  
  for (const purchase of purchases) {
    const query: DiscogsSearchQuery = {
      artist: purchase.artist,
      title: purchase.itemTitle,
      format: purchase.format === 'Digital' ? undefined : purchase.format
    };
    
    try {
      const results = await client.searchReleases(query);
      
      if (results.length > 0) {
        matchCount++;
        logger.info(`✓ Found ${results.length} matches for: ${purchase.artist} - ${purchase.itemTitle}`);
        logger.info(`  Top match: ${results[0].artists_sort} - ${results[0].title} (${results[0].year || 'Unknown year'})`);
        
        // Show original if different
        if (purchase.originalArtist || purchase.originalTitle) {
          logger.info(`  Original: ${purchase.originalArtist || purchase.artist} - ${purchase.originalTitle || purchase.itemTitle}`);
        }
      } else {
        logger.warn(`✗ No matches for: ${purchase.artist} - ${purchase.itemTitle}`);
        if (purchase.originalArtist || purchase.originalTitle) {
          logger.warn(`  Original: ${purchase.originalArtist || purchase.artist} - ${purchase.originalTitle || purchase.itemTitle}`);
        }
      }
    } catch (error) {
      logger.error(`Error searching for ${purchase.artist} - ${purchase.itemTitle}:`, error);
    }
    
    // Small delay to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Summary
  logger.info('\n=== Test Summary ===');
  logger.info(`Total purchases: ${purchases.length}`);
  logger.info(`Successful matches: ${matchCount}`);
  logger.info(`Match rate: ${Math.round((matchCount / purchases.length) * 100)}%`);
  
  if (matchCount / purchases.length >= 0.6) {
    logger.info('\n✅ Test PASSED - Match rate meets MVP target (60%)');
  } else {
    logger.warn('\n⚠️  Test WARNING - Match rate below MVP target (60%)');
  }
}

// Run the test
testDataExtraction().catch(error => {
  logger.error('Test failed:', error);
  process.exit(1);
});