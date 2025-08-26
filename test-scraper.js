const bcfetch = require('bandcamp-fetch');

async function testScraper() {
  console.log('Testing Bandcamp scraper...\n');
  
  // Test with a known public collection
  const testUsers = ['bandcamp', 'andrew-huang', 'ohnoitsalex'];
  
  for (const username of testUsers) {
    try {
      console.log(`Testing username: ${username}`);
      
      // Try to get fan info
      const fanInfo = await bcfetch.fan.getInfo(username);
      
      if (fanInfo) {
        console.log(`✓ Found user: ${fanInfo.name}`);
        console.log(`  Collection size: ${fanInfo.collectionItemCount || 'unknown'}`);
        
        // Get first few items
        const collection = await bcfetch.fan.getCollection(username, { limit: 3 });
        
        if (collection && collection.items) {
          console.log(`  Sample items:`);
          collection.items.slice(0, 3).forEach(item => {
            console.log(`    - ${item.artist}: ${item.name || item.title}`);
          });
        }
        console.log('');
        break; // Found a working username
      }
    } catch (error) {
      console.log(`✗ Failed for ${username}: ${error.message}\n`);
    }
  }
  
  console.log('Test complete!');
}

testScraper().catch(console.error);