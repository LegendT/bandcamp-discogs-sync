import { describe, test, expect } from '@jest/globals';
import { parseBandcampCSVString } from '@/lib/bandcamp/parser';

describe('Bandcamp CSV Parser', () => {
  describe('parseBandcampCSVString', () => {
    test('should parse valid CSV with all fields', async () => {
      const csv = `artist,item_title,item_url,purchase_date,format
"Radiohead","In Rainbows","https://radiohead.bandcamp.com/album/in-rainbows","2024-01-15","Digital Album"
"Boards of Canada","Music Has The Right to Children","https://boardsofcanada.bandcamp.com/album/music","2023-12-20","Vinyl LP"`;

      const result = await parseBandcampCSVString(csv, 'test.csv');
      
      expect(result.purchases).toHaveLength(2);
      expect(result.summary.successfulRows).toBe(2);
      expect(result.summary.skippedRows).toBe(0);
      
      const first = result.purchases[0];
      expect(first.artist).toBe('Radiohead');
      expect(first.itemTitle).toBe('In Rainbows');
      expect(first.format).toBe('Digital');
      expect(first.purchaseDate).toBeInstanceOf(Date);
    });

    test('should normalize artist names correctly', async () => {
      const csv = `artist,item_title,item_url,purchase_date,format
"The Beatles","Abbey Road","https://test.com/1","2024-01-01","CD"
"  Björk  ","Homogenic","https://test.com/2","2024-01-01","Digital Album"`;

      const result = await parseBandcampCSVString(csv);
      
      expect(result.purchases[0].artist).toBe('Beatles'); // "The" removed
      expect(result.purchases[1].artist).toBe('Björk'); // Trimmed
    });

    test('should handle CSV injection attempts', async () => {
      const csv = `artist,item_title,item_url,purchase_date,format
"=cmd|'/c calc'!A1","Malicious Album","https://test.com/1","2024-01-01","CD"
"+1234567890","Phone Number Album","https://test.com/2","2024-01-01","CD"
"@SUM(A1:A10)","Formula Album","https://test.com/3","2024-01-01","CD"`;

      const result = await parseBandcampCSVString(csv);
      
      // Check that dangerous prefixes are sanitized
      expect(result.purchases[0].artist).toMatch(/^'/); // Should be prefixed with '
      expect(result.purchases[1].artist).toMatch(/^'/);
      expect(result.purchases[2].artist).toMatch(/^'/);
    });

    test('should skip invalid rows and report errors', async () => {
      const csv = `artist,item_title,item_url,purchase_date,format
"Valid Artist","Valid Album","https://test.com/1","2024-01-01","CD"
"","Missing Title","https://test.com/2","2024-01-01","CD"
"Artist","Title","not-a-url","2024-01-01","CD"
"Artist","Title","https://test.com/3","invalid-date","CD"`;

      const result = await parseBandcampCSVString(csv);
      
      expect(result.purchases).toHaveLength(1);
      expect(result.summary.skippedRows).toBe(3);
      expect(result.summary.errors.length).toBe(3);
    });

    test('should handle various format types', async () => {
      const csv = `artist,item_title,item_url,purchase_date,format
"A1","T1","https://test.com/1","2024-01-01","Digital Album"
"A2","T2","https://test.com/2","2024-01-01","Vinyl LP"
"A3","T3","https://test.com/3","2024-01-01","Compact Disc"
"A4","T4","https://test.com/4","2024-01-01","Cassette Tape"
"A5","T5","https://test.com/5","2024-01-01","8-Track"`;

      const result = await parseBandcampCSVString(csv);
      
      expect(result.purchases[0].format).toBe('Digital');
      expect(result.purchases[1].format).toBe('Vinyl');
      expect(result.purchases[2].format).toBe('CD');
      expect(result.purchases[3].format).toBe('Cassette');
      expect(result.purchases[4].format).toBe('Other');
    });

    test('should remove edition markers from album titles', async () => {
      const csv = `artist,item_title,item_url,purchase_date,format
"Artist","Album [Deluxe Edition]","https://test.com/1","2024-01-01","CD"
"Artist","Album (Remastered)","https://test.com/2","2024-01-01","CD"
"Artist","Album [20th Anniversary Special Edition]","https://test.com/3","2024-01-01","CD"`;

      const result = await parseBandcampCSVString(csv);
      
      expect(result.purchases[0].itemTitle).toBe('Album');
      expect(result.purchases[1].itemTitle).toBe('Album');
      expect(result.purchases[2].itemTitle).toBe('Album');
      
      // Original titles should be preserved
      expect(result.purchases[0].originalTitle).toBe('Album [Deluxe Edition]');
    });

    test('should handle duplicate URLs', async () => {
      const csv = `artist,item_title,item_url,purchase_date,format
"Artist1","Album1","https://test.com/same","2024-01-01","CD"
"Artist2","Album2","https://test.com/same","2024-01-02","CD"
"Artist3","Album3","https://test.com/different","2024-01-03","CD"`;

      const result = await parseBandcampCSVString(csv);
      
      expect(result.purchases).toHaveLength(2);
      expect(result.summary.duplicatesRemoved).toBe(1);
    });

    test('should reject files that are too large', async () => {
      const largeContent = 'a'.repeat(11 * 1024 * 1024); // 11MB
      
      await expect(parseBandcampCSVString(largeContent)).rejects
        .toThrow('File too large');
    });

    test('should reject non-CSV files by filename', async () => {
      const content = 'some content';
      
      await expect(parseBandcampCSVString(content, 'file.txt')).rejects
        .toThrow('Invalid file type');
    });

    test('should handle empty CSV', async () => {
      const csv = `artist,item_title,item_url,purchase_date,format`;
      
      await expect(parseBandcampCSVString(csv)).rejects
        .toThrow('No valid purchases found');
    });

    test('should track progress correctly', async () => {
      const csv = `artist,item_title,item_url,purchase_date,format
"A1","T1","https://test.com/1","2024-01-01","CD"
"A2","T2","https://test.com/2","2024-01-01","CD"
"A3","T3","https://test.com/3","2024-01-01","CD"
"A4","T4","https://test.com/4","2024-01-01","CD"
"A5","T5","https://test.com/5","2024-01-01","CD"`;

      const progressUpdates: number[] = [];
      await parseBandcampCSVString(csv, undefined, (percent) => {
        progressUpdates.push(percent);
      });
      
      expect(progressUpdates).toContain(100);
      expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
    });
  });
});