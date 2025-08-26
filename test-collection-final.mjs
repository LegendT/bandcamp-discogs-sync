import bcfetch from 'bandcamp-fetch';

console.log('Testing real Bandcamp collections...\n');

// Let's test with a page we know exists
const testUrl = 'https://bandcamp.com/discover';

// First, let's see if we can discover some fans through the discover page
try {
  console.log('1. Getting some albums from discover...');
  const discoverResults = await bcfetch.discovery.discover({
    genre: 'all',
    sortBy: 'best-selling'
  });
  
  if (discoverResults && discoverResults.items) {
    console.log(`   Found ${discoverResults.items.length} albums\n`);
  }
  
  // Now let's try to access a collection
  // Based on the library code, we need to provide just the username part
  console.log('2. Testing fan collection methods...');
  
  // Common test usernames that might exist
  const testUsernames = [
    'user',  
    'test',
    'music',
    'fan'
  ];
  
  for (const username of testUsernames) {
    try {
      console.log(`   Trying username: ${username}`);
      
      // The getInfo method seems to be for logged-in users
      // Let's go straight to getCollection
      const collection = await bcfetch.fan.getCollection({
        fanUrl: `https://bandcamp.com/${username}`,
        itemType: 'collection'
      });
      
      if (collection && collection.items && collection.items.length > 0) {
        console.log(`   ✓ SUCCESS! Found collection for: ${username}`);
        console.log(`   Items: ${collection.items.length}`);
        collection.items.slice(0, 3).forEach((item, i) => {
          console.log(`     ${i+1}. ${item.artist} - ${item.name}`);
        });
        break;
      }
    } catch (error) {
      // Silent fail, try next
    }
  }
  
  // If none of the above work, let's try the wishlist approach
  console.log('\n3. Alternative approach - get wishlist:');
  
  try {
    const wishlist = await bcfetch.fan.getWishlist({
      fanUrl: 'https://bandcamp.com/user',
      itemType: 'album'
    });
    
    if (wishlist) {
      console.log('   Wishlist result:', wishlist);
    }
  } catch (error) {
    console.log('   Wishlist error:', error.message);
  }
  
  // Let's check what the actual method signatures are
  console.log('\n4. Checking available fan methods:');
  console.log('   Methods on bcfetch.fan:', Object.getOwnPropertyNames(bcfetch.fan));
  
} catch (error) {
  console.error('Error:', error);
}