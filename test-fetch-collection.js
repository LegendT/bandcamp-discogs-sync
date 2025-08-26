// Quick test to see what we can get from the page
const https = require('https');

const username = 'heidiac';
const url = `https://bandcamp.com/${username}`;

https.get(url, (res) => {
  let html = '';
  res.on('data', chunk => html += chunk);
  res.on('end', () => {
    // Try to find collection data
    
    // Method 1: Look for fan_data in pagedata
    const pagedataMatch = html.match(/id="pagedata"[^>]*data-blob="([^"]+)"/);
    if (pagedataMatch) {
      try {
        const decoded = pagedataMatch[1].replace(/&quot;/g, '"');
        const data = JSON.parse(decoded);
        
        if (data.fan_data) {
          console.log('Fan data found:', {
            fan_id: data.fan_data.fan_id,
            name: data.fan_data.name,
            username: data.fan_data.username
          });
        }
        
        if (data.item_cache) {
          console.log('Item cache found');
          
          if (data.item_cache.collection) {
            const items = Object.values(data.item_cache.collection);
            console.log(`\nFound ${items.length} collection items:`);
            items.slice(0, 5).forEach(item => {
              console.log(`  - ${item.band_name}: ${item.album_title}`);
            });
          }
        }
        
        if (data.collection_data) {
          console.log('\nCollection data:', {
            item_count: data.collection_data.item_count,
            last_token: data.collection_data.last_token
          });
        }
        
      } catch (e) {
        console.log('Failed to parse pagedata:', e.message);
      }
    }
    
    // Method 2: Look for collection items in HTML
    const collectionRegex = /<a[^>]+class="item-link"[^>]*>[\s\S]*?<div[^>]+class="collection-item-title"[^>]*>([^<]+)<[\s\S]*?<div[^>]+class="collection-item-artist"[^>]*>[^<]*<a[^>]*>([^<]+)</g;
    let match;
    const htmlItems = [];
    
    while ((match = collectionRegex.exec(html)) !== null && htmlItems.length < 10) {
      htmlItems.push({
        album: match[1].trim(),
        artist: match[2].trim()
      });
    }
    
    if (htmlItems.length > 0) {
      console.log(`\nFound ${htmlItems.length} items via HTML parsing:`);
      htmlItems.forEach(item => {
        console.log(`  - ${item.artist}: ${item.album}`);
      });
    } else {
      // Try simpler pattern
      const titleRegex = /class="collection-item-title"[^>]*>([^<]+)</g;
      const artistRegex = /class="collection-item-artist"[^>]*>[\s\S]*?<a[^>]*>([^<]+)</g;
      
      const titles = [];
      const artists = [];
      
      while ((match = titleRegex.exec(html)) !== null && titles.length < 10) {
        titles.push(match[1].trim());
      }
      
      while ((match = artistRegex.exec(html)) !== null && artists.length < 10) {
        artists.push(match[1].trim());
      }
      
      if (titles.length > 0) {
        console.log(`\nFound ${titles.length} titles and ${artists.length} artists:`);
        for (let i = 0; i < Math.min(titles.length, artists.length); i++) {
          console.log(`  - ${artists[i] || 'Unknown'}: ${titles[i]}`);
        }
      }
    }
  });
});