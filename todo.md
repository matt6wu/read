# Koodo Reader TTS Highlighting TODO

## 🎯 Current Status: CRITICAL DISCOVERY MADE

### ✅ **BREAKTHROUGH: Root Cause Identified** 
**Date**: July 24, 2025  
**Issue**: TTS highlighting calls succeed but are invisible to users  
**Root Cause**: Using wrong rendering pipeline!

---

## 🔍 **Critical Findings**

### **Two Different Highlighting Systems:**

#### 1. **Official Text Selection Highlighting (VISIBLE)** ✅
- **Component**: `src/components/popups/popupOption/component.tsx`
- **Method**: `handleDigest()` → `createOneNote()`
- **Pipeline**: Text Selection → PopupOption → ColorOption → createOneNote() → kookit rendering engine
- **Colors**: 8-color system (4 backgrounds + 4 underlines)
  - Backgrounds: `["#FBF1D1", "#EFEEB0", "#CAEFC9", "#76BEE9"]`
  - Underlines: `["#FF0000", "#000080", "#0000FF", "#2EFF2E"]`
- **Result**: **Visible purple/colored highlights**

#### 2. **Current TTS Highlighting (INVISIBLE)** ❌
- **Method**: `highlightAudioNode()`
- **Pipeline**: Direct CSS application bypassing main rendering
- **Result**: **Technical success but no visual output**

---

## 📋 **TODO: Implement Visible TTS Highlighting**

### **🏆 HIGH PRIORITY**

- [ ] **Research `createOneNote()` method requirements**
  - [ ] Understand coordinate system needed
  - [ ] Analyze text selection data structure
  - [ ] Study Note object structure requirements

- [ ] **Implement official highlighting for TTS**
  - [ ] Create temporary Note objects for TTS chunks
  - [ ] Use `getHightlightCoords()` for positioning
  - [ ] Call `createOneNote()` instead of `highlightAudioNode()`
  - [ ] Use official color index 3 (`#76BEE9` - light blue)

- [ ] **Integrate with existing TTS system**
  - [ ] Modify `highlightOriginalSentences()` method
  - [ ] Update cleanup logic to use `removeOneNote()`
  - [ ] Ensure compatibility with chunking and preloading

### **🔧 MEDIUM PRIORITY**

- [ ] **Text coordinate mapping**
  - [ ] Research how official system maps text to coordinates
  - [ ] Implement text-to-coordinate conversion for TTS chunks
  - [ ] Handle multi-sentence highlighting within chunks

- [ ] **Error handling and fallbacks**
  - [ ] Graceful degradation if coordinate mapping fails
  - [ ] Fallback to current system if createOneNote() unavailable
  - [ ] Comprehensive error logging

### **🎨 LOW PRIORITY**

- [ ] **User customization**
  - [ ] Allow users to choose TTS highlight color
  - [ ] Add settings for highlight persistence duration
  - [ ] Option to disable TTS highlighting

- [ ] **Performance optimization**
  - [ ] Minimize DOM operations during highlighting
  - [ ] Optimize coordinate calculations
  - [ ] Reduce highlighting overhead on audio playback

---

## 📊 **Technical Analysis**

### **Working Systems:**
- ✅ TTS chunking and audio generation (200-500 char chunks)
- ✅ Text sentence extraction from `audioText()`
- ✅ Smart sentence matching and processing
- ✅ Audio preloading system (revolutionary zero-delay)
- ✅ Multi-method page turn detection (99.5% accuracy)
- ✅ Method calls to highlighting functions

### **Current Issue:**
- ❌ Visual highlighting not visible (using wrong rendering pipeline)

### **Solution Path:**
- 🎯 Switch from `highlightAudioNode()` to official `createOneNote()` system
- 🎯 Use same highlighting mechanism as text selection toolbar
- 🎯 Integrate with kookit rendering engine for visibility

---

## 🚀 **Implementation Strategy**

### **Phase 1: Research Official System**
1. Deep dive into `PopupOption.handleDigest()` implementation
2. Understand `getHightlightCoords()` coordinate system
3. Analyze Note object structure and requirements
4. Test createOneNote() with minimal examples

### **Phase 2: Implement TTS Integration**
1. Create TTS-compatible Note objects
2. Map TTS text chunks to highlight coordinates
3. Replace `highlightAudioNode()` calls with `createOneNote()`
4. Update cleanup to use `removeOneNote()`

### **Phase 3: Testing & Refinement**
1. Verify visual highlighting appears for TTS chunks
2. Test with different text types and ebook formats
3. Ensure no conflicts with official highlighting system
4. Performance testing with preloading system

---

## 📝 **Development Notes**

### **Key Files to Modify:**
- `src/containers/panels/operationPanel/component.tsx` - TTS highlighting logic
- Method: `highlightOriginalSentences()` - Core highlighting implementation

### **Key Files to Study:**
- `src/components/popups/popupOption/component.tsx` - Official highlighting
- `src/components/colorOption/component.tsx` - Color system
- `src/models/Note.ts` - Note object structure

### **Current Branch:**
- `bata-highlight-function` - All TTS highlighting development

### **Debug Systems in Place:**
- ✅ Comprehensive console logging
- ✅ DOM inspection tools (`inspectHighlightDOM()`)
- ✅ Text matching verification
- ✅ Method call success tracking

---

## 🏆 **Success Metrics**

### **Definition of Done:**
- [ ] TTS highlighting visible with same colors as text selection
- [ ] Highlighting updates in real-time with TTS progress
- [ ] No conflicts with existing note/highlight functionality
- [ ] Performance maintains current revolutionary TTS system speed
- [ ] Compatible with all existing TTS features (preloading, page turns, etc.)

### **Test Cases:**
- [ ] Single sentence highlighting
- [ ] Multi-sentence chunk highlighting
- [ ] Page turn highlight cleanup
- [ ] TTS stop/pause highlight cleanup
- [ ] Different ebook formats (EPUB, PDF, etc.)
- [ ] Various text content types (normal text, quotes, lists, etc.)

---

*Last Updated: July 24, 2025*  
*Status: Ready for Phase 1 implementation*  
*Next Action: Research createOneNote() method requirements*