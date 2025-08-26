const bcfetch = require('bandcamp-fetch');

async function testSimple() {
  try {
    // Try searching for something first
    console.log('Testing Bandcamp search...');
    const searchResults = await bcfetch.search({ query: 'radiohead', page: 1, itemType: 'album' });
    
    if (searchResults && searchResults.items) {
      console.log(`Found ${searchResults.items.length} albums for "radiohead"`);
      searchResults.items.slice(0, 3).forEach(item => {
        console.log(`  - ${item.artist}: ${item.name}`);
      });
    }
    
    // Try getting album info
    console.log('\nTesting album fetch...');
    const albumUrl = 'https://radiohead.bandcamp.com/album/ok-computer';
    const album = await bcfetch.album.getInfo(albumUrl);
    
    if (album) {
      console.log(`Album: ${album.name}`);
      console.log(`Artist: ${album.artist.name}`);
      console.log(`Tracks: ${album.tracks ? album.tracks.length : 0}`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testSimple();