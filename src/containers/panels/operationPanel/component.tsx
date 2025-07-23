import React from "react";
import "./operationPanel.css";
import Bookmark from "../../../models/Bookmark";
import { Trans } from "react-i18next";

import { OperationPanelProps, OperationPanelState } from "./interface";
import { ConfigService } from "../../../assets/lib/kookit-extra-browser.min";
import { withRouter } from "react-router-dom";
import toast from "react-hot-toast";
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

  handleCustomTTS = async () => {
    console.log('🎵 [TOP TTS] Custom TTS button clicked, current state:', this.state.isCustomTTSOn);
    
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

    try {
      // Start TTS
      console.log('🚀 [TOP TTS] Starting TTS...');
      this.setState({ isCustomTTSOn: true });
      
      // Get current visible text
      console.log('📖 [TOP TTS] Checking htmlBook and rendition...');
      console.log('📖 [TOP TTS] htmlBook:', this.props.htmlBook);
      console.log('📖 [TOP TTS] rendition:', this.props.htmlBook?.rendition);
      console.log('📖 [TOP TTS] Props available:', Object.keys(this.props));
      
      if (!this.props.htmlBook || !this.props.htmlBook.rendition) {
        console.error('❌ [TOP TTS] Book not ready - htmlBook or rendition missing');
        toast.error(this.props.t("Book not ready for TTS"));
        this.setState({ isCustomTTSOn: false });
        return;
      }
      
      console.log('📄 [TOP TTS] Getting visible text...');
      console.log('📄 [TOP TTS] rendition.visibleText method exists:', typeof this.props.htmlBook.rendition.visibleText);
      
      const visibleTexts = await this.props.htmlBook.rendition.visibleText();
      console.log('📄 [TOP TTS] Raw visible texts type:', typeof visibleTexts);
      console.log('📄 [TOP TTS] Raw visible texts array:', Array.isArray(visibleTexts));
      console.log('📄 [TOP TTS] Raw visible texts:', visibleTexts);
      
      const text = visibleTexts.join(' ').trim();
      console.log('📄 [TOP TTS] Joined text length:', text.length);
      console.log('📄 [TOP TTS] Text preview (first 200 chars):', text.substring(0, 200));
      
      if (!text) {
        console.error('❌ [TOP TTS] No text found');
        toast.error(this.props.t("No text to read"));
        this.setState({ isCustomTTSOn: false });
        return;
      }

      // Detect language and choose API
      const language = this.detectLanguage(text);
      console.log('🌍 [TOP TTS] Detected language:', language);
      console.log('🌍 [TOP TTS] Language detection details:', {
        chineseCount: (text.match(/[\u4e00-\u9fff]/g) || []).length,
        englishCount: (text.match(/[a-zA-Z]/g) || []).length
      });
      
      let cleanText = text.replace(/[\r\n\t\f]/g, ' ').replace(/\s+/g, ' ').trim();
      console.log('🧹 [TOP TTS] Cleaned text length:', cleanText.length);
      
      // Limit text length to prevent server crashes (max 1000 characters)
      if (cleanText.length > 1000) {
        console.log('✂️ [TOP TTS] Text length before truncation:', cleanText.length);
        cleanText = cleanText.substring(0, 1000) + '...';
        console.log('✂️ [TOP TTS] Text truncated to prevent server overload, new length:', cleanText.length);
        toast.success(this.props.t("Text truncated to prevent server overload"));
      }
      
      console.log('📝 [TOP TTS] Final text to send (first 100 chars):', cleanText.substring(0, 100) + '...');
      
      let audioBlob;
      
      if (language === 'zh') {
        // Chinese TTS API
        console.log('🇨🇳 [TOP TTS] Using Chinese TTS API');
        const requestBody = {
          text: cleanText,
          speaker: 'ZH'
        };
        console.log('📡 [TOP TTS] Chinese API request body:', requestBody);
        console.log('📡 [TOP TTS] Chinese API URL: https://ttszh.mattwu.cc/tts');
        
        const response = await fetch('https://ttszh.mattwu.cc/tts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        });
        
        console.log('📡 [TOP TTS] Chinese API response status:', response.status);
        console.log('📡 [TOP TTS] Chinese API response statusText:', response.statusText);
        console.log('📡 [TOP TTS] Chinese API response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
          console.error('❌ [TOP TTS] Chinese TTS API error:', response.status, response.statusText);
          const errorText = await response.text();
          console.error('❌ [TOP TTS] Chinese API error body:', errorText);
          throw new Error(`Chinese TTS API error: ${response.status}`);
        }
        
        audioBlob = await response.blob();
        console.log('🎵 [TOP TTS] Chinese audio blob size:', audioBlob.size);
        console.log('🎵 [TOP TTS] Chinese audio blob type:', audioBlob.type);
      } else {
        // English TTS API
        console.log('🇺🇸 [TOP TTS] Using English TTS API');
        const apiUrl = `https://tts.mattwu.cc/api/tts?text=${encodeURIComponent(cleanText)}&speaker_id=p335`;
        console.log('📡 [TOP TTS] English API URL:', apiUrl);
        console.log('📡 [TOP TTS] English API encoded text length:', encodeURIComponent(cleanText).length);
        
        const response = await fetch(apiUrl);
        
        console.log('📡 [TOP TTS] English API response status:', response.status);
        console.log('📡 [TOP TTS] English API response statusText:', response.statusText);
        console.log('📡 [TOP TTS] English API response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
          console.error('❌ [TOP TTS] English TTS API error:', response.status, response.statusText);
          const errorText = await response.text();
          console.error('❌ [TOP TTS] English API error body:', errorText);
          throw new Error(`English TTS API error: ${response.status}`);
        }
        
        audioBlob = await response.blob();
        console.log('🎵 [TOP TTS] English audio blob size:', audioBlob.size);
        console.log('🎵 [TOP TTS] English audio blob type:', audioBlob.type);
      }

      // Play audio
      console.log('🎧 [TOP TTS] Creating audio object...');
      const audioUrl = URL.createObjectURL(audioBlob);
      console.log('🎧 [TOP TTS] Audio URL created:', audioUrl);
      
      this.currentAudio = new Audio(audioUrl);
      console.log('🎧 [TOP TTS] Audio object created');
      console.log('🎧 [TOP TTS] Audio readyState:', this.currentAudio.readyState);
      console.log('🎧 [TOP TTS] Audio networkState:', this.currentAudio.networkState);
      
      this.currentAudio.onended = () => {
        console.log('🏁 [TOP TTS] Audio playback ended');
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
        this.setState({ isCustomTTSOn: false });
      };
      
      this.currentAudio.onerror = (errorEvent) => {
        console.error('❌ [TOP TTS] Audio error event:', errorEvent);
        console.error('❌ [TOP TTS] Audio error details:', this.currentAudio?.error);
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
        this.setState({ isCustomTTSOn: false });
        toast.error(this.props.t("Audio playback failed"));
      };
      
      this.currentAudio.onloadstart = () => {
        console.log('📥 [TOP TTS] Audio load started');
      };
      
      this.currentAudio.oncanplaythrough = () => {
        console.log('✅ [TOP TTS] Audio can play through');
      };
      
      try {
        console.log('▶️ [TOP TTS] Starting audio playback...');
        console.log('▶️ [TOP TTS] Audio duration:', this.currentAudio.duration);
        console.log('▶️ [TOP TTS] Audio src:', this.currentAudio.src);
        
        await this.currentAudio.play();
        console.log('✅ [TOP TTS] Audio playback started successfully');
        console.log('✅ [TOP TTS] Audio current time:', this.currentAudio.currentTime);
        console.log('✅ [TOP TTS] Audio paused:', this.currentAudio.paused);
        
        toast.success(this.props.t(`${language === 'zh' ? 'Chinese' : 'English'} TTS started`));
      } catch (playError) {
        console.error('❌ [TOP TTS] Audio play failed:', playError);
        console.error('❌ [TOP TTS] Play error details:', {
          name: playError.name,
          message: playError.message,
          stack: playError.stack
        });
        console.error('❌ [TOP TTS] Audio state during error:', {
          readyState: this.currentAudio?.readyState,
          networkState: this.currentAudio?.networkState,
          error: this.currentAudio?.error
        });
        
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
        this.setState({ isCustomTTSOn: false });
        
        if (playError.name === 'NotAllowedError') {
          console.log('🔒 [TOP TTS] NotAllowedError - user interaction required');
          toast.error(this.props.t("Please click the button to enable audio playback"));
        } else {
          toast.error(this.props.t("Audio playback failed"));
        }
        return;
      }
      
    } catch (error) {
      console.error('💥 [TOP TTS] Custom TTS error:', error);
      console.error('💥 [TOP TTS] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      this.setState({ isCustomTTSOn: false });
      toast.error(this.props.t("TTS service unavailable"));
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
                <Trans>{this.state.isCustomTTSOn ? "Stop TTS" : "Smart TTS"}</Trans>
              </span>
            </div>
          </div>
        </div>
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
