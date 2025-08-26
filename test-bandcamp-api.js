const BandcampFetch = require('bandcamp-fetch');

async function testAPI() {
  const bcfetch = BandcampFetch.default();
  
  console.log('Testing Bandcamp API...\n');
  
  try {
    // Test search
    console.log('1. Testing search...');
    const searchParams = {
      query: 'Radiohead OK Computer',
      page: 1,
      itemType: 'album'
    };
    
    const searchResults = await bcfetch.search(searchParams);
    if (searchResults && searchResults.items && searchResults.items.length > 0) {
      console.log(`   Found ${searchResults.items.length} results`);
      const firstResult = searchResults.items[0];
      console.log(`   First result: ${firstResult.artist} - ${firstResult.name}`);
      console.log(`   URL: ${firstResult.url}\n`);
    }
    
    // Test discovery (this should work)
    console.log('2. Testing discovery API...');
    const discover = await bcfetch.discovery.discover({
      genre: 'electronic',
      subgenre: 'ambient'
    });
    
    if (discover && discover.items) {
      console.log(`   Found ${discover.items.length} electronic/ambient albums\n`);
    }
    
    // Test getting a specific album
    console.log('3. Testing album fetch...');
    const albumInfo = await bcfetch.album.getInfo('https://radiohead.bandcamp.com/album/ok-computer');
    if (albumInfo) {
      console.log(`   Album: ${albumInfo.name}`);
      console.log(`   Artist: ${albumInfo.artist.name}`);
      console.log(`   Release date: ${albumInfo.releaseDate}`);
      console.log(`   Tracks: ${albumInfo.tracks ? albumInfo.tracks.length : 0}\n`);
    }
    
    // Test fan collections - this is what we need!
    console.log('4. Testing fan collection access...');
    
    // These are test usernames - we need to find valid ones
    const testUsernames = ['supporterofthearts', 'collectorperson', 'vinylhead'];
    
    for (const username of testUsernames) {
      try {
        const url = `https://bandcamp.com/${username}`;
        console.log(`   Trying ${url}...`);
        
        // First check if we can get collection count
        const fanData = await bcfetch.fan.getInfo(username);
        
        if (fanData) {
          console.log(`   ✓ Found fan: ${fanData.name}`);
          console.log(`     Location: ${fanData.location || 'Unknown'}`);
          
          // Now try to get their collection
          const collection = await bcfetch.fan.getCollection(username, { limit: 3 });
          if (collection && collection.items) {
            console.log(`     Collection items: ${collection.items.length}`);
            collection.items.forEach(item => {
              console.log(`       - ${item.artist}: ${item.name}`);
            });
            break; // Success!
          }
        }
      } catch (err) {
        console.log(`   ✗ ${username}: ${err.message}`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testAPI();