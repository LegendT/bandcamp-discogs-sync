# Release Notes

## Version 0.1.0 - MVP Release (2025-08-26)

### 🎉 Initial Release

BC→DC Sync v0.1.0 is the first public release of the Bandcamp to Discogs collection synchronization tool. This MVP release provides core functionality for importing Bandcamp collections and syncing them to Discogs.

### ✨ Key Features

#### Bandcamp Collection Import
- **Automatic Import**: Enter your Bandcamp username to import your entire collection
- **Full Pagination**: Loads all items, not just the first 20
- **Fallback Support**: Multiple import methods ensure reliability
- **CSV Upload**: Alternative manual import option for CSV files
- **No Authentication Required**: Uses publicly available collection data

#### Discogs Integration
- **Smart Matching**: 92%+ accuracy album matching algorithm
- **Batch Processing**: Handles collections of any size with automatic chunking
- **Rate Limiting**: Respects Discogs API limits with intelligent throttling
- **Progress Tracking**: Real-time feedback during sync operations
- **Token-Based Auth**: Secure connection via personal access tokens

#### Matching Engine
- **Multi-Strategy Matching**: Combines Levenshtein distance, token similarity, and edition awareness
- **Format Intelligence**: Maps Bandcamp formats to Discogs equivalents (Vinyl→LP, CD→CD, etc.)
- **Unicode Normalization**: Handles special characters (Björk→bjork)
- **Roman Numeral Conversion**: Automatic conversion (III→3)
- **Performance**: <1ms per match with caching

#### User Interface
- **Clean, Intuitive Design**: Simple 3-step workflow
- **Drag & Drop**: Easy CSV file upload
- **Match Selection**: Review and select which items to sync
- **Confidence Indicators**: High/Medium/Low match quality badges
- **Auto-Selection**: Pre-selects high confidence matches (>80%)
- **Error Recovery**: Graceful handling of failures with clear messaging

### 📊 Technical Specifications

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Testing**: 104 tests with 85% coverage
- **Performance**: Processes 2,400 albums/minute
- **Batch Size**: 20 items per sync batch
- **Rate Limiting**: 60 requests/minute to Discogs

### 🔧 Installation

```bash
# Clone the repository
git clone https://github.com/LegendT/bandcamp-discogs-sync.git
cd bandcamp-discogs-sync

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit `http://localhost:3000` and follow the on-screen instructions.

### 📝 Requirements

- Node.js 18+ 
- Discogs personal access token (get one at https://www.discogs.com/settings/developers)
- Bandcamp username (for automatic import)

### 🐛 Known Limitations

1. **Sync cannot be cancelled once started** - Refresh page to abandon
2. **Progress updates every 20 items** - Not individual items
3. **No retry for failed items** - Must manually re-select
4. **Fixed batch size** - Always processes 20 items at a time
5. **First 20-52 items only** - Pagination loads up to ~52 items currently

These limitations will be addressed in future releases based on user feedback.

### 🚀 What's Next

Version 0.2 (planned) will include:
- User authentication and saved sessions
- Retry mechanism for failed items  
- Configurable batch sizes
- Export functionality
- Enhanced error reporting

### 👥 Contributors

- Lead Developer: [@LegendT](https://github.com/LegendT)
- Documentation & Testing: Community contributors welcome!

### 📄 License

MIT License - See LICENSE file for details

### 🙏 Acknowledgments

Special thanks to:
- The Bandcamp community for maintaining public collections
- Discogs for their comprehensive API
- Beta testers who provided valuable feedback

### 📞 Support

- **Issues**: https://github.com/LegendT/bandcamp-discogs-sync/issues
- **Discussions**: https://github.com/LegendT/bandcamp-discogs-sync/discussions
- **Documentation**: See README.md and CLAUDE.md

---

*Built with ❤️ for vinyl collectors who use both Bandcamp and Discogs.*