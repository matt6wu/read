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
    if (this.state.isSmartTTSOn) {
      // Stop TTS
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio = null;
      }
      this.setState({ isSmartTTSOn: false });
      return;
    }

    try {
      // Start TTS
      this.setState({ isSmartTTSOn: true });
      
      // Get current visible text
      if (!this.props.htmlBook || !this.props.htmlBook.rendition) {
        toast.error(this.props.t("Book not ready for TTS"));
        this.setState({ isSmartTTSOn: false });
        return;
      }
      
      const visibleTexts = await this.props.htmlBook.rendition.visibleText();
      const text = visibleTexts.join(' ').trim();
      
      if (!text) {
        toast.error(this.props.t("No text to read"));
        this.setState({ isSmartTTSOn: false });
        return;
      }

      // Detect language and choose API
      const language = this.detectLanguage(text);
      let cleanText = text.replace(/[\r\n\t\f]/g, ' ').replace(/\s+/g, ' ').trim();
      
      // Limit text length to prevent server crashes (max 1000 characters)
      if (cleanText.length > 1000) {
        cleanText = cleanText.substring(0, 1000) + '...';
        toast.success(this.props.t("Text truncated to prevent server overload"));
      }
      
      let audioBlob;
      
      if (language === 'zh') {
        // Chinese TTS API - External URL
        const response = await fetch('https://ttszh.mattwu.cc/tts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: cleanText,
            speaker: 'ZH'
          })
        });
        
        if (!response.ok) {
          throw new Error(`Chinese TTS API error: ${response.status}`);
        }
        
        audioBlob = await response.blob();
      } else {
        // English TTS API - External URL
        const response = await fetch(`https://tts.mattwu.cc/api/tts?text=${encodeURIComponent(cleanText)}&speaker_id=p335`);
        
        if (!response.ok) {
          throw new Error(`English TTS API error: ${response.status}`);
        }
        
        audioBlob = await response.blob();
      }

      // Play audio
      const audioUrl = URL.createObjectURL(audioBlob);
      this.currentAudio = new Audio(audioUrl);
      
      this.currentAudio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
        this.setState({ isSmartTTSOn: false });
      };
      
      this.currentAudio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
        this.setState({ isSmartTTSOn: false });
        toast.error(this.props.t("Audio playback failed"));
      };
      
      try {
        await this.currentAudio.play();
        toast.success(this.props.t(`${language === 'zh' ? 'Chinese' : 'English'} TTS started`));
      } catch (playError) {
        console.error('Audio play failed:', playError);
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
      console.error('Smart TTS error:', error);
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
