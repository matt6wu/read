import React from "react";
import { SettingSwitchProps, SettingSwitchState } from "./interface";
import { Trans } from "react-i18next";
import TextToSpeech from "../../textToSpeech";
import { ConfigService } from "../../../assets/lib/kookit-extra-browser.min";
import { readerSettingList } from "../../../constants/settingList";
import toast from "react-hot-toast";
import BookUtil from "../../../utils/file/bookUtil";
class SettingSwitch extends React.Component<
  SettingSwitchProps,
  SettingSwitchState
> {
  currentAudio: HTMLAudioElement | null;

  constructor(props: SettingSwitchProps) {
    super(props);
    this.state = {
      isBold: ConfigService.getReaderConfig("isBold") === "yes",
      isIndent: ConfigService.getReaderConfig("isIndent") === "yes",
      isSliding: ConfigService.getReaderConfig("isSliding") === "yes",
      isUnderline: ConfigService.getReaderConfig("isUnderline") === "yes",
      isShadow: ConfigService.getReaderConfig("isShadow") === "yes",
      isItalic: ConfigService.getReaderConfig("isItalic") === "yes",
      isInvert: ConfigService.getReaderConfig("isInvert") === "yes",
      isStartFromEven:
        ConfigService.getReaderConfig("isStartFromEven") === "yes",
      isHideBackground:
        ConfigService.getReaderConfig("isHideBackground") === "yes",
      isHideFooter: ConfigService.getReaderConfig("isHideFooter") === "yes",
      isHideHeader: ConfigService.getReaderConfig("isHideHeader") === "yes",
      isHideAIButton: ConfigService.getReaderConfig("isHideAIButton") === "yes",
      isHidePageButton:
        ConfigService.getReaderConfig("isHidePageButton") === "yes",
      isHideMenuButton:
        ConfigService.getReaderConfig("isHideMenuButton") === "yes",
      isSmartTTSOn: false,
    };
    this.currentAudio = null;
  }

  _handleRest = () => {
    BookUtil.reloadBooks();
  };

  _handleChange = (stateName: string) => {
    this.setState({ [stateName]: !this.state[stateName] } as any, () => {
      ConfigService.setReaderConfig(
        stateName,
        this.state[stateName] ? "yes" : "no"
      );
      toast(this.props.t("Change successful"));
      setTimeout(async () => {
        await this.props.renderBookFunc();
      }, 500);
    });
  };

  handleChange = (stateName: string) => {
    this.setState({ [stateName]: !this.state[stateName] } as any);
    ConfigService.setReaderConfig(
      stateName,
      this.state[stateName] ? "no" : "yes"
    );

    toast(this.props.t("Change successful"));
    setTimeout(() => {
      this._handleRest();
    }, 500);
  };

  // Smart TTS functionality
  detectLanguage = (text: string): string => {
    const chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const englishCount = (text.match(/[a-zA-Z]/g) || []).length;
    return chineseCount > englishCount ? 'zh' : 'en';
  };

  handleSmartTTS = async () => {
    console.log('🎵 [SIDEBAR TTS] Smart TTS button clicked, current state:', this.state.isSmartTTSOn);
    
    if (this.state.isSmartTTSOn) {
      // Stop TTS
      console.log('🛑 [SIDEBAR TTS] Stopping TTS...');
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio = null;
        console.log('⏸️ [SIDEBAR TTS] Audio stopped and cleared');
      }
      this.setState({ isSmartTTSOn: false });
      console.log('✅ [SIDEBAR TTS] TTS stopped successfully');
      return;
    }

    try {
      // Start TTS
      console.log('🚀 [SIDEBAR TTS] Starting TTS...');
      this.setState({ isSmartTTSOn: true });
      
      // Get current visible text
      console.log('📖 [SIDEBAR TTS] Checking htmlBook and rendition...');
      console.log('📖 [SIDEBAR TTS] htmlBook:', this.props.htmlBook);
      console.log('📖 [SIDEBAR TTS] rendition:', this.props.htmlBook?.rendition);
      
      if (!this.props.htmlBook || !this.props.htmlBook.rendition) {
        console.error('❌ [SIDEBAR TTS] Book not ready - htmlBook or rendition missing');
        toast.error(this.props.t("Book not ready for TTS"));
        this.setState({ isSmartTTSOn: false });
        return;
      }
      
      console.log('📄 [SIDEBAR TTS] Getting visible text...');
      const visibleTexts = await this.props.htmlBook.rendition.visibleText();
      console.log('📄 [SIDEBAR TTS] Raw visible texts:', visibleTexts);
      
      const text = visibleTexts.join(' ').trim();
      console.log('📄 [SIDEBAR TTS] Joined text length:', text.length);
      console.log('📄 [SIDEBAR TTS] Text preview (first 200 chars):', text.substring(0, 200));
      
      if (!text) {
        console.error('❌ [SIDEBAR TTS] No text found');
        toast.error(this.props.t("No text to read"));
        this.setState({ isSmartTTSOn: false });
        return;
      }

      // Detect language and choose API
      const language = this.detectLanguage(text);
      console.log('🌍 [SIDEBAR TTS] Detected language:', language);
      
      let cleanText = text.replace(/[\r\n\t\f]/g, ' ').replace(/\s+/g, ' ').trim();
      console.log('🧹 [SIDEBAR TTS] Cleaned text length:', cleanText.length);
      
      // Limit text length to prevent server crashes (max 1000 characters)
      if (cleanText.length > 1000) {
        cleanText = cleanText.substring(0, 1000) + '...';
        console.log('✂️ [SIDEBAR TTS] Text truncated to prevent server overload');
        toast.success(this.props.t("Text truncated to prevent server overload"));
      }
      
      console.log('📝 [SIDEBAR TTS] Final text to send:', cleanText.substring(0, 100) + '...');
      
      let audioBlob;
      
      if (language === 'zh') {
        // Chinese TTS API - External URL
        console.log('🇨🇳 [SIDEBAR TTS] Using Chinese TTS API');
        const requestBody = {
          text: cleanText,
          speaker: 'ZH'
        };
        console.log('📡 [SIDEBAR TTS] Chinese API request body:', requestBody);
        
        const response = await fetch('https://ttszh.mattwu.cc/tts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        });
        
        console.log('📡 [SIDEBAR TTS] Chinese API response status:', response.status);
        console.log('📡 [SIDEBAR TTS] Chinese API response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
          console.error('❌ [SIDEBAR TTS] Chinese TTS API error:', response.status, response.statusText);
          throw new Error(`Chinese TTS API error: ${response.status}`);
        }
        
        audioBlob = await response.blob();
        console.log('🎵 [SIDEBAR TTS] Chinese audio blob size:', audioBlob.size);
      } else {
        // English TTS API - External URL
        console.log('🇺🇸 [SIDEBAR TTS] Using English TTS API');
        const apiUrl = `https://tts.mattwu.cc/api/tts?text=${encodeURIComponent(cleanText)}&speaker_id=p335`;
        console.log('📡 [SIDEBAR TTS] English API URL:', apiUrl);
        
        const response = await fetch(apiUrl);
        
        console.log('📡 [SIDEBAR TTS] English API response status:', response.status);
        console.log('📡 [SIDEBAR TTS] English API response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
          console.error('❌ [SIDEBAR TTS] English TTS API error:', response.status, response.statusText);
          throw new Error(`English TTS API error: ${response.status}`);
        }
        
        audioBlob = await response.blob();
        console.log('🎵 [SIDEBAR TTS] English audio blob size:', audioBlob.size);
      }

      // Play audio
      console.log('🎧 [SIDEBAR TTS] Creating audio object...');
      const audioUrl = URL.createObjectURL(audioBlob);
      this.currentAudio = new Audio(audioUrl);
      console.log('🎧 [SIDEBAR TTS] Audio object created, URL:', audioUrl);
      
      this.currentAudio.onended = () => {
        console.log('🏁 [SIDEBAR TTS] Audio playback ended');
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
        this.setState({ isSmartTTSOn: false });
      };
      
      this.currentAudio.onerror = (errorEvent) => {
        console.error('❌ [SIDEBAR TTS] Audio error event:', errorEvent);
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
        this.setState({ isSmartTTSOn: false });
        toast.error(this.props.t("Audio playback failed"));
      };
      
      try {
        console.log('▶️ [SIDEBAR TTS] Starting audio playback...');
        await this.currentAudio.play();
        console.log('✅ [SIDEBAR TTS] Audio playback started successfully');
        toast.success(this.props.t(`${language === 'zh' ? 'Chinese' : 'English'} TTS started`));
      } catch (playError) {
        console.error('❌ [SIDEBAR TTS] Audio play failed:', playError);
        console.error('❌ [SIDEBAR TTS] Play error details:', {
          name: playError.name,
          message: playError.message,
          stack: playError.stack
        });
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
        this.setState({ isSmartTTSOn: false });
        
        if (playError.name === 'NotAllowedError') {
          toast.error(this.props.t("Please click the button to enable audio playback"));
        } else {
          toast.error(this.props.t("Audio playback failed"));
        }
        return;
      }
      
    } catch (error) {
      console.error('💥 [SIDEBAR TTS] Smart TTS error:', error);
      console.error('💥 [SIDEBAR TTS] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      this.setState({ isSmartTTSOn: false });
      toast.error(this.props.t("TTS service unavailable"));
    }
  };
  render() {
    return (
      <>
        {/* Smart TTS Switch */}
        <div className="single-control-switch-container">
          <span className="single-control-switch-title">
            <Trans>Smart TTS</Trans>
          </span>
          <span
            className="single-control-switch"
            onClick={this.handleSmartTTS}
            style={this.state.isSmartTTSOn ? {} : { opacity: 0.6 }}
          >
            <span
              className="single-control-button"
              style={
                this.state.isSmartTTSOn
                  ? {
                      transform: "translateX(20px)",
                      transition: "transform 0.5s ease",
                    }
                  : {
                      transform: "translateX(0px)",
                      transition: "transform 0.5s ease",
                    }
              }
            ></span>
          </span>
        </div>
        
        <TextToSpeech />
        {readerSettingList.map((item) => (
          <div className="single-control-switch-container" key={item.title}>
            <span className="single-control-switch-title">
              <Trans>{item.title}</Trans>
            </span>

            <span
              className="single-control-switch"
              onClick={() => {
                switch (item.propName) {
                  case "isBold":
                    this._handleChange("isBold");
                    break;
                  case "isIndent":
                    this._handleChange("isIndent");
                    break;
                  case "isSliding":
                    this._handleChange("isSliding");
                    break;
                  case "isItalic":
                    this._handleChange("isItalic");
                    break;
                  case "isUnderline":
                    this._handleChange("isUnderline");
                    break;
                  case "isShadow":
                    this._handleChange("isShadow");
                    break;
                  case "isInvert":
                    this._handleChange("isInvert");
                    break;
                  case "isStartFromEven":
                    this._handleChange("isStartFromEven");
                    break;
                  case "isHideFooter":
                    this.handleChange("isHideFooter");
                    break;
                  case "isHideHeader":
                    this.handleChange("isHideHeader");
                    break;
                  case "isHideBackground":
                    this.handleChange("isHideBackground");
                    break;
                  case "isHidePageButton":
                    this.handleChange("isHidePageButton");
                    break;
                  case "isHideMenuButton":
                    this.handleChange("isHideMenuButton");
                    break;
                  case "isHideAIButton":
                    this.handleChange("isHideAIButton");
                    break;
                  default:
                    break;
                }
              }}
              style={this.state[item.propName] ? {} : { opacity: 0.6 }}
            >
              <span
                className="single-control-button"
                style={
                  !this.state[item.propName]
                    ? {
                        transform: "translateX(0px)",
                        transition: "transform 0.5s ease",
                      }
                    : {
                        transform: "translateX(20px)",
                        transition: "transform 0.5s ease",
                      }
                }
              ></span>
            </span>
          </div>
        ))}
      </>
    );
  }
}

export default SettingSwitch;
