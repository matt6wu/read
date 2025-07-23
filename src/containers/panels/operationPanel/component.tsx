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
      this.setState({ isCustomTTSOn: false });
      console.log('✅ [TOP TTS] TTS stopped successfully');
      return;
    }

    // Start Smart TTS with chunking
    await this.startSmartTTS();
  };

  // New method for Smart TTS with chunking and auto page turn
  startSmartTTS = async () => {
    try {
      console.log('🚀 [TOP TTS] *** NEW CHUNKING VERSION *** Starting Smart TTS with chunking...');
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
      
      // Split into sentences using existing utility, then clean and merge fragments
      const rawNodeList = nodeTextList.map((text) => splitSentences(text));
      let rawSentences = rawNodeList
        .flat()
        .filter((item) => item !== "img" && !item.startsWith("img"))
        .map(sentence => sentence.trim())
        .filter(sentence => sentence.length > 0);
      
      // Smart sentence merging - combine fragments that were split incorrectly
      let sentenceList: string[] = [];
      let currentSentence = '';
      
      for (let i = 0; i < rawSentences.length; i++) {
        const fragment = rawSentences[i];
        
        // Skip very short fragments that are just spaces or single characters
        if (fragment.length <= 1 || fragment === ' ') {
          continue;
        }
        
        currentSentence += fragment;
        
        // Check if this looks like end of sentence
        const endsWithPunctuation = /[.!?。！？]$/.test(fragment);
        const nextFragmentStartsCapital = i + 1 < rawSentences.length && 
          /^[A-Z\u4e00-\u9fff]/.test(rawSentences[i + 1]);
        
        // If reasonable length and ends properly, or if very long, finish sentence
        if ((endsWithPunctuation && currentSentence.length > 10) || 
            currentSentence.length > 200) {
          if (currentSentence.trim().length > 5) {
            sentenceList.push(currentSentence.trim());
          }
          currentSentence = '';
        } else if (!endsWithPunctuation && currentSentence.length > 5) {
          // Add space if not ending with punctuation
          currentSentence += ' ';
        }
      }
      
      // Add final sentence if exists
      if (currentSentence.trim().length > 5) {
        sentenceList.push(currentSentence.trim());
      }
      
      console.log('🧹 [TOP TTS] Smart merged sentences (first 10):', sentenceList.slice(0, 10));
      
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

  // Process TTS in manageable chunks
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
      // Create chunk of sentences (aim for ~200-500 characters or complete sentences)
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
      
      chunk = chunk.trim();
      console.log(`📝 [TOP TTS] Processing chunk ${Math.floor(startIndex/3) + 1}: "${chunk.substring(0, 100)}..."`);
      console.log(`📊 [TOP TTS] Chunk stats: ${chunkSentences} sentences, ${chunk.length} characters`);
      
      if (!chunk) {
        console.log('⏭️ [TOP TTS] Empty chunk, skipping to next...');
        await this.processTTSChunks(sentenceList, currentIndex);
        return;
      }
      
      // Detect language and process chunk
      const language = this.detectLanguage(chunk);
      console.log('🌍 [TOP TTS] Detected language for chunk:', language);
      
      const audioBlob = await this.generateTTSAudio(chunk, language);
      
      if (audioBlob) {
        await this.playTTSChunk(audioBlob, () => {
          // Add small delay before next chunk to prevent server overload
          setTimeout(() => {
            this.processTTSChunks(sentenceList, currentIndex);
          }, 500); // 500ms delay between chunks
        });
      } else {
        console.log('⏭️ [TOP TTS] Chunk failed, waiting before retry...');
        // Add delay even for failed chunks to avoid hammering server
        setTimeout(() => {
          this.processTTSChunks(sentenceList, currentIndex);
        }, 2000); // 2 second delay for failed requests
      }
      
    } catch (error) {
      console.error('❌ [TOP TTS] Error processing chunk:', error);
      // Continue with next chunk
      await this.processTTSChunks(sentenceList, startIndex + 1);
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
      
      const lastSentenceRead = completedSentences[completedSentences.length - 1];
      const lastSentenceOnPage = lastVisibleSentences[lastVisibleSentences.length - 1];
      
      console.log('📄 [TOP TTS] Last sentence read:', lastSentenceRead?.substring(0, 50) + '...');
      console.log('📄 [TOP TTS] Last sentence on page:', lastSentenceOnPage?.substring(0, 50) + '...');
      
      if (lastSentenceRead === lastSentenceOnPage) {
        console.log('📖 [TOP TTS] Reached end of page, turning to next page...');
        await this.props.htmlBook.rendition.next();
        toast.success(this.props.t("Turning to next page..."));
        
        // Continue TTS on next page
        setTimeout(() => {
          if (this.state.isCustomTTSOn) {
            this.startSmartTTS();
          }
        }, 500); // Small delay to let page load
      } else {
        console.log('🏁 [TOP TTS] Finished reading current visible content');
        this.setState({ isCustomTTSOn: false });
        toast.success(this.props.t("TTS completed"));
      }
      
    } catch (error) {
      console.error('❌ [TOP TTS] Error checking page turn:', error);
      this.setState({ isCustomTTSOn: false });
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
