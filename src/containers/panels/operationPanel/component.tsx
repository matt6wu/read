import React from "react";
import "./operationPanel.css";
import Bookmark from "../../../models/Bookmark";
import { Trans } from "react-i18next";

import { OperationPanelProps, OperationPanelState } from "./interface";
import { ConfigService } from "../../../assets/lib/kookit-extra-browser.min";
import { withRouter } from "react-router-dom";
import toast from "react-hot-toast";
import { splitSentences } from "../../../utils/common";
import { HtmlMouseEvent } from "../../../utils/reader/mouseEvent";
import TTSUtil from "../../../utils/reader/ttsUtil";
import { isElectron } from "react-device-detect";
import { getIframeDoc } from "../../../utils/reader/docUtil";
import { handleExitFullScreen, handleFullScreen } from "../../../utils/common";
import DatabaseService from "../../../utils/storage/databaseService";
import BookLocation from "../../../models/BookLocation";
declare var window: any;
class OperationPanel extends React.Component<
  OperationPanelProps,
  OperationPanelState
> {
  timeStamp: number;
  speed: number;
  timer: any;
  currentAudio: HTMLAudioElement | null;
  audioCache: Map<number, Blob>;
  highlightedElements: Element[];

  constructor(props: OperationPanelProps) {
    super(props);
    this.state = {
      isBookmark: false,
      time: 0,
      currentPercentage: ConfigService.getObjectConfig(
        this.props.currentBook.key,
        "recordLocation",
        {}
      )
        ? ConfigService.getObjectConfig(
            this.props.currentBook.key,
            "recordLocation",
            {}
          ).percentage
        : 0,
      timeLeft: 0,
      isCustomTTSOn: false,
    };
    this.currentAudio = null;
    this.audioCache = new Map();
    this.highlightedElements = [];
    this.timeStamp = Date.now();
    this.speed = 30000;
  }

  componentDidMount() {
    this.props.htmlBook.rendition.on("page-changed", async () => {
      this.speed = Date.now() - this.timeStamp;
      this.timeStamp = Date.now();
      let pageProgress = await this.props.htmlBook.rendition.getProgress();
      this.setState({
        timeLeft:
          ((pageProgress.totalPage - pageProgress.currentPage) * this.speed) /
          1000,
      });
      this.handleDisplayBookmark();
      // HtmlMouseEvent(
      //   this.props.htmlBook.rendition,
      //   this.props.currentBook.key,
      //   this.props.readerMode,
      //   this.props.currentBook.format
      // );
    });
  }

  handleShortcut() {}
  handleScreen() {
    ConfigService.getReaderConfig("isFullscreen") !== "yes"
      ? handleFullScreen()
      : handleExitFullScreen();
    if (ConfigService.getReaderConfig("isFullscreen") === "yes") {
      ConfigService.setReaderConfig("isFullscreen", "no");
    } else {
      ConfigService.setReaderConfig("isFullscreen", "yes");
    }
  }
  async handleExit() {
    ConfigService.setReaderConfig("isFullscreen", "no");
    ConfigService.setItem("isFinshReading", "yes");
    this.props.handleReadingState(false);
    this.props.handleSearch(false);
    window.speechSynthesis && window.speechSynthesis.cancel();
    TTSUtil.pauseAudio();
    // Stop custom TTS audio
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    handleExitFullScreen();
    if (this.props.htmlBook) {
      this.props.handleHtmlBook(null);
    }
    if (isElectron) {
      if (ConfigService.getReaderConfig("isOpenInMain") === "yes") {
        window.require("electron").ipcRenderer.invoke("exit-tab", "ping");
      } else {
        window.close();
      }
    } else {
      window.close();
    }
  }
  handleAddBookmark = async () => {
    let bookKey = this.props.currentBook.key;
    let bookLocation: BookLocation = ConfigService.getObjectConfig(
      bookKey,
      "recordLocation",
      {}
    );
    let text = bookLocation.text;
    let chapter = bookLocation.chapterTitle;
    let percentage = bookLocation.percentage;

    let cfi = JSON.stringify(bookLocation);
    if (!text) {
      text = (await this.props.htmlBook.rendition.visibleText()).join(" ");
    }
    text = text
      .replace(/\s\s/g, "")
      .replace(/\r/g, "")
      .replace(/\n/g, "")
      .replace(/\t/g, "")
      .replace(/\f/g, "");

    let bookmark = new Bookmark(
      bookKey,
      cfi,
      text.substr(0, 200),
      percentage,
      chapter
    );
    await DatabaseService.saveRecord(bookmark, "bookmarks");
    this.props.handleFetchBookmarks();
    this.setState({ isBookmark: true });
    toast.success(this.props.t("Addition successful"));
    this.props.handleShowBookmark(true);
  };
  handleDisplayBookmark() {
    this.props.handleShowBookmark(false);
    let bookLocation: {
      text: string;
      count: string;
      chapterTitle: string;
      chapterDocIndex: string;
      chapterHref: string;
      percentage: string;
      cfi: string;
    } = ConfigService.getObjectConfig(
      this.props.currentBook.key,
      "recordLocation",
      {}
    );
    this.props.bookmarks.forEach((item) => {
      if (item.cfi === JSON.stringify(bookLocation)) {
        this.props.handleShowBookmark(true);
      }
    });
  }

  // Custom TTS functionality
  detectLanguage = (text: string): string => {
    const chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const englishCount = (text.match(/[a-zA-Z]/g) || []).length;
    return chineseCount > englishCount ? 'zh' : 'en';
  };

  // Smart TTS with chunking and auto page turn
  handleCustomTTS = async () => {
    console.log('🎵 [TOP TTS] Smart TTS button clicked, current state:', this.state.isCustomTTSOn);
    
    if (this.state.isCustomTTSOn) {
      // Stop TTS
      console.log('🛑 [TOP TTS] Stopping TTS...');
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio = null;
        console.log('⏸️ [TOP TTS] Audio stopped and cleared');
      }
      // Clear audio cache when stopping
      this.audioCache.clear();
      console.log('🗑️ [TOP TTS] Audio cache cleared');
      // Clear any text highlighting
      this.clearTextHighlight();
      this.setState({ isCustomTTSOn: false });
      console.log('✅ [TOP TTS] TTS stopped successfully');
      return;
    }

    // Clear cache and highlighting, then start Smart TTS with chunking
    this.audioCache.clear();
    this.clearTextHighlight();
    await this.startSmartTTS();
  };

  // New method for Smart TTS with chunking and auto page turn
  startSmartTTS = async () => {
    try {
      console.log('🚀 [TOP TTS] *** NEW CHUNKING VERSION *** Starting Smart TTS with chunking...');
      // Clear any existing highlights at start
      this.clearTextHighlight();
      this.setState({ isCustomTTSOn: true });
      
      // Get current visible text using audioText method (better for TTS)
      console.log('📖 [TOP TTS] Checking htmlBook and rendition...');
      
      if (!this.props.htmlBook || !this.props.htmlBook.rendition) {
        console.error('❌ [TOP TTS] Book not ready - htmlBook or rendition missing');
        toast.error(this.props.t("Book not ready for TTS"));
        this.setState({ isCustomTTSOn: false });
        return;
      }
      
      console.log('📄 [TOP TTS] Getting audio-optimized text...');
      const nodeTextList = (await this.props.htmlBook.rendition.audioText()).filter(
        (item: string) => item && item.trim()
      );
      console.log('📄 [TOP TTS] Raw node text list:', nodeTextList);
      
      // Use original sentences directly for exact DOM matching (like official TTS)
      const rawNodeList = nodeTextList.map((text) => splitSentences(text));
      let sentenceList = rawNodeList
        .flat()
        .filter((item) => item !== "img" && !item.startsWith("img"))
        .map(sentence => sentence.trim())
        .filter(sentence => sentence.length > 5); // Keep original sentences for exact DOM matching
      
      console.log('🎯 [TOP TTS] Using original sentences for exact DOM matching (first 10):', sentenceList.slice(0, 10));
      
      console.log('📄 [TOP TTS] Total sentences found:', sentenceList.length);
      console.log('📄 [TOP TTS] First few sentences:', sentenceList.slice(0, 3));
      
      if (sentenceList.length === 0) {
        console.log('📄 [TOP TTS] No text on current page, trying next page...');
        await this.props.htmlBook.rendition.next();
        // Recursively try again
        await this.startSmartTTS();
        return;
      }
      
      // Start processing sentences in chunks
      await this.processTTSChunks(sentenceList, 0);
      
    } catch (error) {
      console.error('💥 [TOP TTS] Smart TTS error:', error);
      this.setState({ isCustomTTSOn: false });
      toast.error(this.props.t("TTS service unavailable"));
    }
  };

  // Process TTS in manageable chunks with preloading
  processTTSChunks = async (sentenceList: string[], startIndex: number) => {
    if (!this.state.isCustomTTSOn) {
      console.log('🛑 [TOP TTS] TTS stopped by user, aborting chunk processing');
      return;
    }
    
    if (startIndex >= sentenceList.length) {
      console.log('📄 [TOP TTS] Finished all sentences, checking for page turn...');
      await this.checkAndTurnPage(sentenceList);
      return;
    }
    
    try {
      // Create current chunk
      const { chunk: currentChunk, nextIndex: currentNextIndex } = this.createChunk(sentenceList, startIndex);
      
      if (!currentChunk) {
        console.log('⏭️ [TOP TTS] Empty chunk, skipping to next...');
        await this.processTTSChunks(sentenceList, currentNextIndex);
        return;
      }
      
      console.log(`📝 [TOP TTS] Processing chunk ${Math.floor(startIndex/3) + 1}: "${currentChunk.substring(0, 100)}..."`);
      console.log(`📊 [TOP TTS] Chunk stats: ${currentChunk.length} characters`);
      
      // Highlight each original sentence in this chunk for exact DOM matching (like official TTS)
      this.highlightOriginalSentences(sentenceList, startIndex);
      
      // Check if we have this chunk cached
      let audioBlob: Blob | null = this.audioCache.get(startIndex) || null;
      
      if (!audioBlob) {
        // Generate audio for current chunk
        const language = this.detectLanguage(currentChunk);
        console.log('🌍 [TOP TTS] Detected language for chunk:', language);
        audioBlob = await this.generateTTSAudio(currentChunk, language);
      } else {
        console.log('⚡ [TOP TTS] Using cached audio for current chunk');
      }
      
      // Start preloading next chunk while current one plays
      this.preloadNextChunk(sentenceList, currentNextIndex);
      
      if (audioBlob) {
        await this.playTTSChunk(audioBlob, () => {
          // Add small delay before next chunk to prevent server overload
          setTimeout(() => {
            this.processTTSChunks(sentenceList, currentNextIndex);
          }, 500); // 500ms delay between chunks
        });
      } else {
        console.log('⏭️ [TOP TTS] Chunk failed, waiting before retry...');
        // Add delay even for failed chunks to avoid hammering server
        setTimeout(() => {
          this.processTTSChunks(sentenceList, currentNextIndex);
        }, 2000); // 2 second delay for failed requests
      }
      
    } catch (error) {
      console.error('❌ [TOP TTS] Error processing chunk:', error);
      // Continue with next chunk
      await this.processTTSChunks(sentenceList, startIndex + 1);
    }
  };

  // Helper function to create a chunk from sentences
  createChunk = (sentenceList: string[], startIndex: number): { chunk: string, nextIndex: number } => {
    let chunk = '';
    let chunkSentences = 0;
    let currentIndex = startIndex;
    
    // Keep adding sentences until we have a reasonable chunk
    while (currentIndex < sentenceList.length && chunk.length < 400) {
      const sentence = sentenceList[currentIndex].trim();
      if (sentence) {
        // Check if adding this sentence would make chunk too long
        const testChunk = chunk + sentence + ' ';
        if (testChunk.length > 500 && chunk.length > 100) {
          // If chunk is already substantial, stop here
          break;
        }
        chunk += sentence + ' ';
        chunkSentences++;
      }
      currentIndex++;
      
      // Don't make chunks too small unless we're at the end
      if (chunkSentences >= 3 && chunk.length >= 150) {
        break;
      }
    }
    
    return { chunk: chunk.trim(), nextIndex: currentIndex };
  };

  // Preload next chunk in background while current chunk plays
  preloadNextChunk = async (sentenceList: string[], nextStartIndex: number) => {
    if (nextStartIndex >= sentenceList.length) {
      console.log('📄 [TOP TTS] No next chunk to preload - at end of sentences');
      return;
    }
    
    // Check if already cached
    if (this.audioCache.has(nextStartIndex)) {
      console.log('⚡ [TOP TTS] Next chunk already cached');
      return;
    }
    
    try {
      console.log('🔄 [TOP TTS] Preloading next chunk in background...');
      
      const { chunk: nextChunk } = this.createChunk(sentenceList, nextStartIndex);
      
      if (nextChunk) {
        const language = this.detectLanguage(nextChunk);
        console.log(`🔄 [TOP TTS] Preloading ${language} chunk: "${nextChunk.substring(0, 50)}..."`);
        
        // Generate audio in background
        const audioBlob = await this.generateTTSAudio(nextChunk, language);
        
        if (audioBlob) {
          this.audioCache.set(nextStartIndex, audioBlob);
          console.log('✅ [TOP TTS] Next chunk preloaded and cached successfully');
        } else {
          console.log('❌ [TOP TTS] Failed to preload next chunk');
        }
      }
    } catch (error) {
      console.error('❌ [TOP TTS] Error preloading next chunk:', error);
    }
  };

  // Generate TTS audio for a text chunk
  generateTTSAudio = async (text: string, language: string): Promise<Blob | null> => {
    try {
      let response;
      
      if (language === 'zh') {
        console.log('🇨🇳 [TOP TTS] Using Chinese TTS API for chunk');
        response = await fetch('https://ttszh.mattwu.cc/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, speaker: 'ZH' })
        });
      } else {
        console.log('🇺🇸 [TOP TTS] Using English TTS API for chunk');
        response = await fetch(`https://tts.mattwu.cc/api/tts?text=${encodeURIComponent(text)}&speaker_id=p335`);
      }
      
      console.log(`📡 [TOP TTS] ${language.toUpperCase()} API response:`, response.status);
      
      if (!response.ok) {
        console.error(`❌ [TOP TTS] ${language.toUpperCase()} TTS API error:`, response.status);
        return null;
      }
      
      const audioBlob = await response.blob();
      console.log(`🎵 [TOP TTS] ${language.toUpperCase()} audio blob size:`, audioBlob.size);
      return audioBlob;
      
    } catch (error) {
      console.error('❌ [TOP TTS] Error generating TTS audio:', error);
      return null;
    }
  };

  // Play a TTS audio chunk
  playTTSChunk = async (audioBlob: Blob, onEnded: () => void): Promise<void> => {
    return new Promise((resolve, reject) => {
      console.log('🎧 [TOP TTS] Playing TTS chunk...');
      
      const audioUrl = URL.createObjectURL(audioBlob);
      this.currentAudio = new Audio(audioUrl);
      
      this.currentAudio.onended = () => {
        console.log('🏁 [TOP TTS] Chunk playback ended');
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
        resolve();
        onEnded();
      };
      
      this.currentAudio.onerror = (error) => {
        console.error('❌ [TOP TTS] Chunk playback error:', error);
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
        reject(error);
      };
      
      this.currentAudio.play().catch(reject);
    });
  };

  // Check if we need to turn page and continue TTS
  checkAndTurnPage = async (completedSentences: string[]) => {
    try {
      console.log('📄 [TOP TTS] Checking if page turn is needed...');
      
      // Get current visible text to check if we're at the end
      const visibleTexts = await this.props.htmlBook.rendition.visibleText();
      const lastVisibleText = visibleTexts[visibleTexts.length - 1];
      const lastVisibleSentences = splitSentences(lastVisibleText).filter(
        (item) => item !== "img" && !item.startsWith("img")
      );
      
      const lastSentenceRead = completedSentences[completedSentences.length - 1]?.trim();
      const lastSentenceOnPage = lastVisibleSentences[lastVisibleSentences.length - 1]?.trim();
      
      console.log('📄 [TOP TTS] Last sentence read:', lastSentenceRead?.substring(0, 50) + '...');
      console.log('📄 [TOP TTS] Last sentence on page:', lastSentenceOnPage?.substring(0, 50) + '...');
      
      // More robust comparison - check if we've read most of the visible content
      let shouldTurnPage = false;
      
      if (lastSentenceRead && lastSentenceOnPage) {
        // Method 1: Exact match
        if (lastSentenceRead === lastSentenceOnPage) {
          console.log('✅ [TOP TTS] Exact sentence match - turning page');
          shouldTurnPage = true;
        }
        // Method 2: Fuzzy match for similar sentences
        else if (lastSentenceRead.length > 20 && lastSentenceOnPage.length > 20) {
          const similarity = this.calculateSimilarity(lastSentenceRead, lastSentenceOnPage);
          console.log('📊 [TOP TTS] Sentence similarity:', similarity);
          if (similarity > 0.8) {
            console.log('✅ [TOP TTS] High similarity match - turning page');
            shouldTurnPage = true;
          }
        }
        
        // Method 3: Always check read percentage as fallback (independent of other checks)
        if (!shouldTurnPage) {
          const readSentencesCount = completedSentences.length;
          const visibleSentencesCount = lastVisibleSentences.length;
          const readPercentage = readSentencesCount / visibleSentencesCount;
          console.log('📊 [TOP TTS] Read percentage:', readPercentage, `(${readSentencesCount}/${visibleSentencesCount})`);
          if (readPercentage >= 0.9) {
            console.log('✅ [TOP TTS] Read percentage threshold met - turning page');
            shouldTurnPage = true;
          }
        }
        
        // Method 4: Check if we've read past the visible content (overflow detection)
        if (!shouldTurnPage) {
          // Get all visible text and check if we've read most of it
          const allVisibleText = visibleTexts.join(' ');
          const allCompletedText = completedSentences.join(' ');
          const textOverlap = this.calculateTextOverlap(allCompletedText, allVisibleText);
          console.log('📊 [TOP TTS] Text overlap percentage:', textOverlap);
          if (textOverlap >= 0.85) {
            console.log('✅ [TOP TTS] High text overlap - turning page');
            shouldTurnPage = true;
          }
        }
      }
      
      if (shouldTurnPage) {
        console.log('📖 [TOP TTS] Reached end of page, turning to next page...');
        
        // Store current page info to avoid repeating
        const currentPageInfo = await this.props.htmlBook.rendition.getPosition();
        console.log('📍 [TOP TTS] Current page before turn:', currentPageInfo);
        
        await this.props.htmlBook.rendition.next();
        
        // 🗑️ Clear cache when turning page to prevent old page content playback
        this.audioCache.clear();
        console.log('🗑️ [TOP TTS] Audio cache cleared after page turn to prevent old content playback');
        
        // Clear highlighting when turning page
        this.clearTextHighlight();
        console.log('🧼 [TOP TTS] Text highlighting cleared for new page');
        
        toast.success(this.props.t("Turning to next page..."));
        
        // Wait for page to load and verify we actually turned
        setTimeout(async () => {
          if (this.state.isCustomTTSOn) {
            try {
              const newPageInfo = await this.props.htmlBook.rendition.getPosition();
              console.log('📍 [TOP TTS] New page after turn:', newPageInfo);
              
              // Check if page actually changed by comparing content, not just position
              const newVisibleTexts = await this.props.htmlBook.rendition.visibleText();
              const newVisibleContent = newVisibleTexts.join(' ').substring(0, 200);
              const oldVisibleContent = visibleTexts.join(' ').substring(0, 200);
              
              console.log('📄 [TOP TTS] Old page content:', oldVisibleContent.substring(0, 80) + '...');
              console.log('📄 [TOP TTS] New page content:', newVisibleContent.substring(0, 80) + '...');
              
              // Compare actual content to detect real page change
              const contentChanged = newVisibleContent !== oldVisibleContent;
              
              // Also check if we have new content to read
              const newNodeTextList = (await this.props.htmlBook.rendition.audioText()).filter(
                (item: string) => item && item.trim()
              );
              const hasNewContent = newNodeTextList.length > 0;
              
              console.log('📊 [TOP TTS] Content changed:', contentChanged);
              console.log('📊 [TOP TTS] Has new content:', hasNewContent, `(${newNodeTextList.length} items)`);
              
              if (contentChanged && hasNewContent) {
                console.log('✅ [TOP TTS] Successfully turned page with new content, continuing TTS...');
                this.startSmartTTS();
              } else if (!hasNewContent) {
                console.log('📚 [TOP TTS] No more content to read - reached end of book');
                this.setState({ isCustomTTSOn: false });
                toast.success(this.props.t("TTS completed - end of book"));
              } else {
                console.log('🔄 [TOP TTS] Content unchanged, trying to continue anyway...');
                // Sometimes page turn is successful but content appears same
                // Try to continue anyway after a longer delay
                setTimeout(() => {
                  if (this.state.isCustomTTSOn) {
                    console.log('🔄 [TOP TTS] Retrying TTS after longer delay...');
                    this.startSmartTTS();
                  }
                }, 1000);
              }
            } catch (error) {
              console.error('❌ [TOP TTS] Error verifying page turn:', error);
              this.setState({ isCustomTTSOn: false });
            }
          }
        }, 800); // Longer delay to ensure page loads
      } else {
        console.log('🏁 [TOP TTS] Not at end of page yet, stopping TTS');
        // Clear highlighting when TTS completes
        this.clearTextHighlight();
        this.setState({ isCustomTTSOn: false });
        toast.success(this.props.t("TTS completed"));
      }
      
    } catch (error) {
      console.error('❌ [TOP TTS] Error checking page turn:', error);
      this.setState({ isCustomTTSOn: false });
    }
  };

  // Helper function to calculate string similarity
  calculateSimilarity = (str1: string, str2: string): number => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  };

  // Helper function to calculate text overlap percentage
  calculateTextOverlap = (readText: string, visibleText: string): number => {
    if (!readText || !visibleText) return 0;
    
    // Normalize texts for comparison
    const normalizeText = (text: string) => text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    const normalizedRead = normalizeText(readText);
    const normalizedVisible = normalizeText(visibleText);
    
    if (normalizedVisible.length === 0) return 0;
    
    // Calculate how much of the visible text we've covered
    const overlapLength = Math.min(normalizedRead.length, normalizedVisible.length);
    const commonSubstring = this.findLongestCommonSubstring(normalizedRead, normalizedVisible);
    
    return commonSubstring.length / normalizedVisible.length;
  };

  // Helper function to find longest common substring
  findLongestCommonSubstring = (str1: string, str2: string): string => {
    const matrix: number[][] = [];
    let maxLength = 0;
    let endPosition = 0;

    // Initialize matrix
    for (let i = 0; i <= str1.length; i++) {
      matrix[i] = [];
      for (let j = 0; j <= str2.length; j++) {
        matrix[i][j] = 0;
      }
    }

    // Fill matrix
    for (let i = 1; i <= str1.length; i++) {
      for (let j = 1; j <= str2.length; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1] + 1;
          if (matrix[i][j] > maxLength) {
            maxLength = matrix[i][j];
            endPosition = i;
          }
        }
      }
    }

    return str1.substring(endPosition - maxLength, endPosition);
  };

  // Helper function to calculate Levenshtein distance
  levenshteinDistance = (str1: string, str2: string): number => {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  };

  // Use official highlighting system (createOneNote) like the text selection toolbar
  highlightOriginalSentences = (sentenceList: string[], startIndex: number) => {
    try {
      // Clear previous highlights first (like official TTS)
      this.clearTextHighlight();
      
      console.log(`✨ [HIGHLIGHT] Using official createOneNote highlighting (like text selection toolbar)`);
      
      // Find which original sentences are in this chunk
      const { nextIndex } = this.createChunk(sentenceList, startIndex);
      const chunkSentences = sentenceList.slice(startIndex, nextIndex);
      
      console.log(`🎯 [HIGHLIGHT] Processing ${chunkSentences.length} sentences with official TTS method`);
      
      // Highlight each sentence individually using EXACT official TTS approach
      let highlightedCount = 0;
      for (let i = 0; i < chunkSentences.length; i++) {
        const currentText = chunkSentences[i].trim();
        
        if (currentText && currentText.length > 5) { // Must have content
          console.log(`🔍 [HIGHLIGHT] Official TTS approach for sentence ${i + 1}: "${currentText.substring(0, 60)}..."`);
          
          try {
            // EXACT replication of official TTS highlighting from lines 152-153 & 195-196
            if (this.props.htmlBook && this.props.htmlBook.rendition && this.props.htmlBook.rendition.highlightAudioNode) {
              // Use EXACT same style as official TTS component
              let style = "background: #f3a6a68c;";
              
              // Call highlightAudioNode exactly like official TTS does
              this.props.htmlBook.rendition.highlightAudioNode(currentText, style);
              
              // Store for cleanup (matching official approach)
              this.highlightedElements.push({ text: currentText, highlighted: true } as any);
              
              highlightedCount++;
              console.log(`✅ [HIGHLIGHT] Official TTS highlighting applied to sentence ${i + 1}`);
              
              // DEBUG: Check if DOM actually changed
              this.inspectHighlightDOM(currentText);
            } else {
              console.log(`⚠️ [HIGHLIGHT] highlightAudioNode method not available`);
            }
          } catch (sentenceError) {
            console.error(`❌ [HIGHLIGHT] Official TTS highlighting failed for sentence ${i + 1}:`, sentenceError);
          }
        }
      }
      
      console.log(`🎉 [HIGHLIGHT] Official TTS highlighting complete: ${highlightedCount}/${chunkSentences.length} sentences`);
      
    } catch (error) {
      console.error('❌ [HIGHLIGHT] Error in official TTS highlighting replication:', error);
      // Don't use fallback - we need to understand why official method fails
    }
  };

  // DEBUG: Inspect DOM to see if highlighting actually worked
  inspectHighlightDOM = (text: string) => {
    try {
      console.log(`🔍 [DOM DEBUG] Inspecting DOM for highlighted text: "${text.substring(0, 50)}..."`);
      
      // Get iframe documents like the original reader does
      const iframe = document.getElementById('kookit-iframe') as HTMLIFrameElement;
      if (!iframe || !iframe.contentDocument) {
        console.log('⚠️ [DOM DEBUG] Iframe or contentDocument not found');
        return;
      }
      
      const doc = iframe.contentDocument;
      
      // Search for elements with background styles
      const allElements = doc.querySelectorAll('*');
      let highlightedElements = 0;
      let backgroundElements = 0;
      
      for (let element of allElements) {
        const computedStyle = window.getComputedStyle(element);
        const inlineStyle = (element as HTMLElement).style.background || (element as HTMLElement).style.backgroundColor;
        
        if (inlineStyle || computedStyle.backgroundColor !== 'rgba(0, 0, 0, 0)') {
          backgroundElements++;
          
          if (inlineStyle && inlineStyle.includes('#f3a6a6')) {
            highlightedElements++;
            console.log(`🎨 [DOM DEBUG] Found TTS highlighted element:`, element);
            console.log(`🎨 [DOM DEBUG] Element text:`, element.textContent?.substring(0, 100));
            console.log(`🎨 [DOM DEBUG] Inline style:`, inlineStyle);
          }
        }
      }
      
      console.log(`📊 [DOM DEBUG] Summary: ${highlightedElements} TTS highlights, ${backgroundElements} total background elements`);
      
      // Also check for any audio-related classes or attributes
      const audioElements = doc.querySelectorAll('[class*="audio"], [class*="tts"], [class*="highlight"]');
      console.log(`🎵 [DOM DEBUG] Found ${audioElements.length} audio/tts/highlight related elements`);
      
    } catch (error) {
      console.error('❌ [DOM DEBUG] Error inspecting DOM:', error);
    }
  };

  // Highlight a single sentence using native method (for exact DOM matching)
  highlightSingleSentence = (sentenceText: string): boolean => {
    try {
      if (this.props.htmlBook && this.props.htmlBook.rendition && this.props.htmlBook.rendition.highlightAudioNode) {
        // Use official TTS color from original implementation
        const style = "background: #f3a6a68c !important; border-radius: 3px; padding: 2px; transition: background-color 0.2s ease;";
        
        // Store for cleanup
        this.highlightedElements.push({ text: sentenceText, highlighted: true } as any);
        
        this.props.htmlBook.rendition.highlightAudioNode(sentenceText, style);
        console.log(`✅ [HIGHLIGHT] Single sentence highlighted: "${sentenceText.substring(0, 30)}..."`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ [HIGHLIGHT] Error highlighting single sentence:', error);
      return false;
    }
  };

  // Original chunk highlighting method (fallback)
  highlightCurrentChunk = (chunkText: string) => {
    try {
      // Clear previous highlights
      this.clearTextHighlight();
      
      console.log(`✨ [HIGHLIGHT] Using native highlightAudioNode for: "${chunkText.substring(0, 80)}..."`);
      
      // Use Koodo Reader's native TTS highlighting method
      if (this.props.htmlBook && this.props.htmlBook.rendition && this.props.htmlBook.rendition.highlightAudioNode) {
        console.log(`🎨 [HIGHLIGHT] Using native TTS highlightAudioNode method`);
        this.useNativeTTSHighlight(chunkText);
      } else {
        console.log('⚠️ [HIGHLIGHT] Native highlightAudioNode method not available');
        
        // Fallback to basic highlighting if native method fails
        this.highlightTextFallback(chunkText);
      }
      
    } catch (error) {
      console.error('❌ [HIGHLIGHT] Error with native highlighting, trying fallback:', error);
      this.highlightTextFallback(chunkText);
    }
  };

  // Helper method for native TTS highlighting
  useNativeTTSHighlight = (chunkText: string) => {
    try {
      // Use official light blue color (#76BEE9) matching the note system
      const style = "background: #76BEE9 !important; border-radius: 3px; padding: 2px 4px; margin: -2px -4px; transition: background-color 0.2s ease;";
      
      // Store the highlighted text for cleanup
      this.highlightedElements.push({ text: chunkText, highlighted: true } as any);
      
      this.props.htmlBook.rendition.highlightAudioNode(chunkText, style);
      console.log(`✅ [HIGHLIGHT] TTS highlighting applied with official color`);
    } catch (error) {
      console.error('❌ [HIGHLIGHT] Native TTS highlighting failed:', error);
      this.highlightTextFallback(chunkText);
    }
  };

  // Fallback highlighting method using DOM manipulation
  highlightTextFallback = (chunkText: string) => {
    try {
      console.log(`🔄 [HIGHLIGHT] Using fallback highlighting for: "${chunkText.substring(0, 50)}..."`);
      
      // Get the iframe document
      const docs = getIframeDoc(this.props.currentBook.format || "EPUB");
      
      if (!docs || docs.length === 0) {
        console.log('⚠️ [HIGHLIGHT] No iframe document found');
        return;
      }
      
      const doc = docs[0];
      if (!doc) {
        console.log('⚠️ [HIGHLIGHT] No document content found');
        return;
      }
      
      // Inject CSS for highlighting if not already present
      this.injectHighlightCSS(doc);
      
      // Simple text search and highlight
      const walker = doc.createTreeWalker(
        doc.body || doc.documentElement,
        NodeFilter.SHOW_TEXT,
        null
      );
      
      const textNodes: Text[] = [];
      let node;
      while (node = walker.nextNode()) {
        if (node.textContent && node.textContent.trim().length > 0) {
          textNodes.push(node as Text);
        }
      }
      
      console.log(`🔍 [HIGHLIGHT] Found ${textNodes.length} text nodes for fallback highlighting`);
      
      // Try to find and highlight matching text
      const cleanChunkText = chunkText.trim().toLowerCase();
      let highlighted = false;
      
      for (const textNode of textNodes) {
        const nodeText = textNode.textContent?.trim().toLowerCase() || '';
        
        // Check if this text node contains part of our chunk
        if (nodeText.length > 10 && cleanChunkText.includes(nodeText.substring(0, 30))) {
          const parent = textNode.parentElement;
          if (parent) {
            parent.style.backgroundColor = '#ffff99';
            parent.style.borderRadius = '3px';
            parent.style.padding = '2px 4px';
            this.highlightedElements.push(parent);
            highlighted = true;
            console.log(`✨ [HIGHLIGHT] Fallback highlighted text node: "${nodeText.substring(0, 50)}..."`);
            break; // Only highlight the first match to avoid over-highlighting
          }
        }
      }
      
      if (!highlighted) {
        console.log('⚠️ [HIGHLIGHT] Fallback could not find matching text to highlight');
      }
      
    } catch (error) {
      console.error('❌ [HIGHLIGHT] Error in fallback highlighting:', error);
    }
  };

  // Clear text highlighting
  clearTextHighlight = () => {
    try {
      console.log(`🧼 [HIGHLIGHT] Clearing ${this.highlightedElements.length} highlighted elements`);
      
      // Clear any previous TTS highlighting first
      
      // Try to use native method to remove TTS highlighting
      if (this.props.htmlBook && this.props.htmlBook.rendition && this.props.htmlBook.rendition.removeAudioHighlight) {
        console.log('🧼 [HIGHLIGHT] Using native removeAudioHighlight method');
        this.props.htmlBook.rendition.removeAudioHighlight();
      }
      
      // Fallback: manually remove highlight classes/styles from DOM elements
      for (const element of this.highlightedElements) {
        if (element && typeof element === 'object' && 'classList' in element) {
          // DOM element - remove class
          (element as Element).classList.remove('tts-highlight');
        } else if (element && typeof element === 'object' && 'style' in element) {
          // DOM element with direct style - reset background
          const elem = element as HTMLElement;
          elem.style.backgroundColor = '';
          elem.style.borderRadius = '';
          elem.style.padding = '';
        }
      }
      
      // Clear the array
      this.highlightedElements = [];
      console.log('✅ [HIGHLIGHT] All highlights cleared successfully');
      
    } catch (error) {
      console.error('❌ [HIGHLIGHT] Error clearing highlights:', error);
    }
  };

  // Inject CSS for highlighting into the iframe document
  injectHighlightCSS = (doc: Document) => {
    try {
      // Check if CSS is already injected
      if (doc.getElementById('tts-highlight-styles')) {
        return;
      }
      
      // Create and inject CSS
      const style = doc.createElement('style');
      style.id = 'tts-highlight-styles';
      style.textContent = `
        .tts-highlight {
          background-color: #ffff99 !important;
          transition: background-color 0.3s ease !important;
          border-radius: 3px !important;
          padding: 2px 4px !important;
          margin: -2px -4px !important;
        }
        
        .tts-highlight * {
          background-color: transparent !important;
        }
      `;
      
      const head = doc.head || doc.getElementsByTagName('head')[0];
      if (head) {
        head.appendChild(style);
        console.log('✨ [HIGHLIGHT] CSS styles injected successfully');
      }
      
    } catch (error) {
      console.error('❌ [HIGHLIGHT] Error injecting CSS:', error);
    }
  };

  // Pause TTS functionality
  handlePauseTTS = () => {
    console.log('⏸️ [TOP TTS] Pause button clicked');
    console.log('⏸️ [TOP TTS] Current audio state:', {
      exists: !!this.currentAudio,
      paused: this.currentAudio?.paused,
      currentTime: this.currentAudio?.currentTime,
      duration: this.currentAudio?.duration
    });
    
    if (this.currentAudio && !this.currentAudio.paused) {
      console.log('⏸️ [TOP TTS] Pausing audio...');
      this.currentAudio.pause();
      console.log('⏸️ [TOP TTS] Audio paused at time:', this.currentAudio.currentTime);
      toast.success(this.props.t("TTS paused"));
    } else if (this.currentAudio && this.currentAudio.paused) {
      console.log('▶️ [TOP TTS] Resuming audio...');
      this.currentAudio.play().then(() => {
        console.log('▶️ [TOP TTS] Audio resumed successfully');
        toast.success(this.props.t("TTS resumed"));
      }).catch((error) => {
        console.error('❌ [TOP TTS] Resume failed:', error);
        toast.error(this.props.t("Resume failed"));
      });
    } else {
      console.log('❌ [TOP TTS] No audio to pause/resume');
      toast.error(this.props.t("No audio playing"));
    }
  };

  // Stop TTS functionality
  handleStopTTS = () => {
    console.log('🛑 [TOP TTS] Stop button clicked');
    console.log('🛑 [TOP TTS] Current audio state:', {
      exists: !!this.currentAudio,
      paused: this.currentAudio?.paused,
      currentTime: this.currentAudio?.currentTime,
      src: this.currentAudio?.src
    });
    
    if (this.currentAudio) {
      console.log('🛑 [TOP TTS] Stopping and clearing audio...');
      
      // Store the URL to revoke it
      const audioUrl = this.currentAudio.src;
      
      // Stop and clear the audio
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
      
      // Revoke the blob URL to free memory
      if (audioUrl && audioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(audioUrl);
        console.log('🗑️ [TOP TTS] Audio blob URL revoked:', audioUrl);
      }
      
      // Clear any text highlighting
      this.clearTextHighlight();
      
      // Update state
      this.setState({ isCustomTTSOn: false });
      
      console.log('✅ [TOP TTS] Audio stopped and cleared successfully');
      toast.success(this.props.t("TTS stopped"));
    } else {
      console.log('❌ [TOP TTS] No audio to stop');
      toast.error(this.props.t("No audio playing"));
    }
  };

  render() {
    return (
      <div className="book-operation-panel">
        <div className="book-opeartion-info">
          <span>
            <Trans
              i18nKey="Current reading time"
              count={Math.floor(
                Math.abs(Math.floor(this.props.currentDuration / 60))
              )}
            >
              Current reading time:
              {{
                count: Math.abs(Math.floor(this.props.currentDuration / 60)),
              }}
              min
            </Trans>
          </span>
          &nbsp;&nbsp;&nbsp;
          <span>
            <Trans
              i18nKey="Remaining reading time"
              count={Math.ceil(this.state.timeLeft / 60)}
            >
              Remaining reading time:
              {{
                count: `${Math.ceil(this.state.timeLeft / 60)}`,
              }}
              min
            </Trans>
          </span>
        </div>
        <div
          className="exit-reading-button"
          onClick={() => {
            this.handleExit();
          }}
        >
          <div className="operation-button-container">
            <div style={{ display: "flex", alignItems: "center" }}>
              <span className="icon-exit exit-reading-icon"></span>
              <span className="exit-reading-text">
                <Trans>Exit</Trans>
              </span>
            </div>
          </div>
        </div>
        <div
          className="add-bookmark-button"
          onClick={() => {
            this.handleAddBookmark();
          }}
        >
          <div className="operation-button-container">
            <div style={{ display: "flex", alignItems: "center" }}>
              <span className="icon-add add-bookmark-icon"></span>
              <span className="add-bookmark-text">
                <Trans>Bookmark</Trans>
              </span>
            </div>
          </div>
        </div>
        <div
          className="custom-tts-button"
          onClick={this.handleCustomTTS}
          style={{
            backgroundColor: this.state.isCustomTTSOn ? '#23aaf2' : 'transparent'
          }}
        >
          <div className="operation-button-container">
            <div style={{ display: "flex", alignItems: "center" }}>
              <span 
                className="icon-sound custom-tts-icon"
                style={{
                  color: this.state.isCustomTTSOn ? 'white' : 'inherit'
                }}
              ></span>
              <span 
                className="custom-tts-text"
                style={{
                  color: this.state.isCustomTTSOn ? 'white' : 'inherit'
                }}
              >
                <Trans>{this.state.isCustomTTSOn ? "Stop TTS" : "NEW Smart TTS"}</Trans>
              </span>
            </div>
          </div>
        </div>
        {/* Show pause and stop buttons only when TTS is active */}
        {this.state.isCustomTTSOn && (
          <>
            <div
              className="pause-tts-button"
              onClick={this.handlePauseTTS}
            >
              <div className="operation-button-container">
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span 
                    className={`${this.currentAudio && !this.currentAudio.paused ? 'icon-pause' : 'icon-play'} pause-tts-icon`}
                  ></span>
                  <span className="pause-tts-text">
                    <Trans>{this.currentAudio && !this.currentAudio.paused ? "Pause" : "Resume"}</Trans>
                  </span>
                </div>
              </div>
            </div>
            <div
              className="stop-tts-button"
              onClick={this.handleStopTTS}
            >
              <div className="operation-button-container">
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span className="icon-stop stop-tts-icon"></span>
                  <span className="stop-tts-text">
                    <Trans>Stop</Trans>
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
        <div
          className="enter-fullscreen-button"
          onClick={() => {
            if (isElectron) {
              this.handleScreen();
            } else {
              toast(
                this.props.t(
                  "Koodo Reader's web version are limited by the browser, for more powerful features, please download the desktop version."
                )
              );
            }
          }}
        >
          <div className="operation-button-container">
            <div style={{ display: "flex", alignItems: "center" }}>
              <span className="icon-fullscreen enter-fullscreen-icon"></span>
              <span className="enter-fullscreen-text">
                <Trans>Full screen</Trans>
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default withRouter(OperationPanel as any);
