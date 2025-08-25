import { FormatMapping } from './types';
import { PurchaseFormat } from '../../types/bandcamp';

export const discogsFormatMap: FormatMapping = {
  'Vinyl': [
    'LP', 'Album', '12"', '10"', '7"', 'Single', 'EP', 'Mini-Album',
    'Maxi-Single', 'Flexi-disc', 'Picture Disc', 'Test Pressing',
    'White Label', 'Promo', 'Reissue', 'Repress', 'Compilation'
  ],
  'CD': [
    'CD', 'CDr', 'CD-ROM', 'HDCD', 'MiniCD', 'CD+DVD', 'CD+Blu-ray',
    'Enhanced', 'Single', 'EP', 'Album', 'Compilation', 'Box Set'
  ],
  'Cassette': [
    'Cassette', 'Cass', 'Mixtape', 'Demo', 'Promo', 'Album',
    'Single', 'EP', 'Compilation'
  ],
  'Digital': [
    'File', 'MP3', 'FLAC', 'WAV', 'AIFF', 'AAC', 'OGG', 'WMA',
    'Digital', 'Download', 'Streaming'
  ],
  'Other': [
    'DVD', 'Blu-ray', 'VHS', 'Betamax', 'Laserdisc', 'MiniDisc',
    '8-Track', 'Reel-To-Reel', 'DAT', 'DCC', 'SACD', 'DVD-Audio'
  ]
};

export const bandcampToDiscogsFormat: Record<PurchaseFormat, string[]> = {
  'Digital': discogsFormatMap['Digital'],
  'Vinyl': discogsFormatMap['Vinyl'],
  'CD': discogsFormatMap['CD'],
  'Cassette': discogsFormatMap['Cassette'],
  'Other': discogsFormatMap['Other']
};

export function getDiscogsFormatsForBandcamp(bandcampFormat: PurchaseFormat): string[] {
  return bandcampToDiscogsFormat[bandcampFormat] || [];
}

export function formatMatchesDiscogs(
  bandcampFormat: PurchaseFormat,
  discogsFormat: string
): boolean {
  const allowedFormats = getDiscogsFormatsForBandcamp(bandcampFormat);
  
  if (bandcampFormat === 'Digital') {
    return true;
  }
  
  return allowedFormats.some(format => 
    discogsFormat.toLowerCase().includes(format.toLowerCase())
  );
}

export function getFormatBonus(
  bandcampFormat: PurchaseFormat,
  discogsFormats?: Array<{ name: string; qty?: string; descriptions?: string[] }>
): number {
  // Digital purchases are format-agnostic
  if (bandcampFormat === 'Digital') {
    return 0;
  }
  
  // If no format data available, no bonus/penalty
  if (!discogsFormats || discogsFormats.length === 0) {
    return 0;
  }
  
  // Check if any Discogs format matches the Bandcamp format
  const hasMatch = discogsFormats.some(format => 
    formatMatchesDiscogs(bandcampFormat, format.name)
  );
  
  return hasMatch ? 5 : -5;
}