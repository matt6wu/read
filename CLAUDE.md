# Claude Code Development Log - Koodo Reader TTS Enhancement

## 🎯 Project Overview
Enhancement of Koodo Reader with Smart TTS (Text-to-Speech) functionality that intelligently processes ebook content with automatic page turning and external TTS API integration.

## ✅ Successfully Implemented Features

### 🎵 Smart TTS Chunking System
- **Intelligent Text Processing**: Breaks long pages into optimal chunks (200-500 characters, 3-4 sentences each)
- **Smart Sentence Merging**: Reconstructs sentence fragments that were incorrectly split by the original `splitSentences()` utility
- **Sequential Processing**: Processes chunks one-by-one to prevent TTS server overload
- **Language Detection**: Automatically detects Chinese vs English and routes to appropriate TTS APIs
  - Chinese: `https://ttszh.mattwu.cc/tts` (POST with JSON)
  - English: `https://tts.mattwu.cc/api/tts` (GET with query params)

### 🎛️ User Interface Controls
- **Top Operation Panel**: Blue "NEW Smart TTS" button with conditional pause/stop buttons
- **Sidebar Panel**: Smart TTS toggle switch (alternative interface)
- **Visual Feedback**: Button text changes, loading states, toast notifications
- **Always Visible Panel**: Modified reader to show operation panel by default instead of hover-triggered

### 🔄 Audio Management
- **Sequential Playback**: Plays audio chunks one after another with proper cleanup
- **Pause/Resume**: Working pause functionality that can resume from exact position
- **Stop Control**: Complete stop with memory cleanup (blob URL revocation)
- **Error Handling**: Graceful handling of API failures, network issues, and audio playback problems

### 📊 Comprehensive Logging System
- **Chunking Process**: Detailed logs for sentence splitting, merging, and chunk creation
- **API Calls**: Request/response logging for both Chinese and English TTS services
- **Audio States**: Playback status, timing, and error tracking
- **Page Navigation**: Logs for page turn detection and navigation

## 🚧 Current Known Issues

### 1. **PDF View Sync Issue** ⚠️
**Problem**: TTS correctly detects when to turn pages and continues reading on new pages, but the PDF visual display remains stuck on the previous page.

**What Works**:
- ✅ TTS reads content from new page correctly
- ✅ `rendition.next()` is called successfully
- ✅ Audio continues with new page content
- ✅ Page turn detection logic works (`checkAndTurnPage()` method)

**What Doesn't Work**:
- ❌ PDF viewer doesn't visually update to show the new page
- ❌ User sees old page while hearing new page content
- ❌ Visual and audio are out of sync

**Investigation Needed**:
- Check if `rendition.next()` actually triggers visual page update
- Verify if there's a separate method needed for visual page rendering
- Investigate if there's a delay needed for visual updates
- Look into PDF.js rendering pipeline and how it syncs with the underlying book model

**Technical Details**:
```typescript
// This works for TTS content but not visual update:
await this.props.htmlBook.rendition.next();

// Location: checkAndTurnPage method (lines 365-403)
// File: src/containers/panels/operationPanel/component.tsx
```

### 2. **Development Cache Issues** (Resolved) ✅
**Problem**: Cloudflare was heavily caching the application, preventing new code from loading.
**Solution**: PM2 restart cleared cache. Added cache-busting techniques.

## 🔧 Technical Architecture

### Smart TTS Flow
1. **Text Extraction**: `htmlBook.rendition.audioText()` → Raw text nodes
2. **Sentence Processing**: `splitSentences()` → Smart fragment merging
3. **Chunking**: Group sentences into optimal chunks (200-500 chars)
4. **Language Detection**: Chinese vs English character analysis
5. **API Processing**: Route to appropriate TTS service
6. **Sequential Playback**: Play chunks with continuation logic
7. **Page Detection**: Compare last read vs last visible sentence
8. **Auto Navigation**: `rendition.next()` + recursive TTS continuation

### Key Methods
- `startSmartTTS()`: Main entry point for TTS processing
- `processTTSChunks()`: Recursive chunk processing with continuation
- `generateTTSAudio()`: API calls to external TTS services
- `playTTSChunk()`: Audio playback with proper cleanup
- `checkAndTurnPage()`: Page boundary detection and navigation

### File Locations
- **Main TTS Logic**: `src/containers/panels/operationPanel/component.tsx`
- **Sidebar TTS**: `src/components/readerSettings/settingSwitch/component.tsx`
- **CSS Styling**: `src/containers/panels/operationPanel/operationPanel.css`
- **Reader Panel Control**: `src/pages/reader/component.tsx` (always visible top panel)

## 🎛️ User Experience

### Current Workflow
1. User loads ebook in Koodo Reader
2. Clicks "NEW Smart TTS" button in top operation panel
3. System automatically:
   - Extracts and processes text into optimal chunks
   - Makes sequential TTS API calls
   - Plays audio chunks seamlessly
   - Detects end of page and turns automatically
   - Continues reading on new pages
4. User can pause/resume or stop at any time

### Performance Characteristics
- **Chunk Size**: 200-500 characters (optimal for TTS APIs)
- **API Calls**: Sequential (prevents server overload)
- **Memory Management**: Proper blob URL cleanup
- **Error Recovery**: Continues processing even if individual chunks fail

## 🔍 Next Steps

### High Priority
1. **Fix PDF View Sync**: Investigate why visual page doesn't update when `rendition.next()` is called
2. **Test Auto Page Turn**: Verify complete flow works end-to-end with visual sync

### Medium Priority
1. **Performance Optimization**: Consider parallel processing for next chunk while current plays
2. **User Settings**: Allow customization of chunk size and TTS service URLs
3. **Progress Indicator**: Show reading progress and estimated time remaining

### Low Priority
1. **Additional TTS Services**: Support for more TTS providers
2. **Voice Selection**: Allow users to choose different voices/speakers
3. **Reading Speed Control**: Adjustable playback speed

## 📝 Development Notes

### PM2 Configuration
- Service name: `koodo-reader`
- Port: 6300 (via PM2 proxy)
- Domain: `https://read.mattwu.cc`
- Restart command: `pm2 restart koodo-reader`

### Git Branch
- Working branch: `mod`
- Latest commit: Smart TTS chunking optimization
- Push command: `git push origin mod`

### Testing Process
1. Load test ebook (English content recommended)
2. Open browser console for detailed logging
3. Click "NEW Smart TTS" button
4. Monitor chunk processing logs
5. Verify audio playback and page navigation
6. Test pause/resume functionality

---

*Last updated: July 23, 2025*
*Development environment: Ubuntu server with PM2*
*Primary developer: Claude Code AI*