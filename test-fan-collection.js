import bcfetch from 'bandcamp-fetch';

async function testFanCollection() {
  console.log('Testing Bandcamp fan collection...\n');
  
  try {
    // Search for an album first to verify the API works
    console.log('1. Testing search to verify API...');
    const searchResults = await bcfetch.search({
      query: 'Radiohead',
      page: 1,
      itemType: 'album'
    });
    
    if (searchResults && searchResults.items && searchResults.items.length > 0) {
      console.log(`   ✓ Search works! Found ${searchResults.items.length} results\n`);
    }
    
    // Now test fan collection
    // The username needs to be from the URL pattern: https://bandcamp.com/[username]
    console.log('2. Testing fan collection fetch...');
    
    // We need to find a valid fan page
    // Let's try to get a fan from search results
    const testFanUrl = 'https://bandcamp.com/antipartyparty';  // Example fan page
    const username = 'antipartyparty';  // Extract username from URL
    
    console.log(`   Attempting to fetch fan: ${username}`);
    
    try {
      const fanInfo = await bcfetch.fan.getInfo(username);
      console.log('   Fan info:', fanInfo);
      
      const collection = await bcfetch.fan.getCollection(username, { 
        limit: 5 
      });
      
      if (collection && collection.items) {
        console.log(`   ✓ Success! Found ${collection.items.length} items in collection:`);
        collection.items.forEach((item, i) => {
          console.log(`     ${i + 1}. ${item.artist} - ${item.name}`);
        });
      }
    } catch (fanError) {
      console.log(`   ✗ Error fetching fan: ${fanError.message}`);
      
      // Let's try a different approach - get fan page HTML directly
      console.log('\n3. Alternative: Trying to parse fan page directly...');
      
      // The issue might be that we need the full Bandcamp URL
      const fullUrl = `https://bandcamp.com/${username}`;
      console.log(`   URL: ${fullUrl}`);
      
      // Try different username formats
      const variations = [username, fullUrl, `${username}.bandcamp.com`];
      
      for (const variant of variations) {
        try {
          console.log(`   Trying variant: ${variant}`);
          const result = await bcfetch.fan.getCollection(variant, { limit: 2 });
          if (result) {
            console.log(`   ✓ Success with variant: ${variant}`);
            break;
          }
        } catch (e) {
          console.log(`   ✗ Failed: ${e.message}`);
        }
      }
    }
    
  } catch (error) {
    console.error('Main error:', error);
  }
}

testFanCollection().catch(console.error);