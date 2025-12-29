# Mobile Android Architecture - StemTube

## Reference Document for Implementation

Date: 2025-11-07
Branch: `fix-mobile-properly`

---

## 🎯 Goal

Build an **Android-first** mobile interface that reuses the **exact** desktop architecture:
- Same backend APIs (no server changes)
- Same audio engine (SoundTouch AudioWorklet)
- Same business logic
- Mobile-friendly UI (touch, responsive)

---

## 📱 Mobile Frontend Structure

### Main Navigation (Bottom Nav)

```
┌─────────────────────────────────────┐
│         StemTube Mobile             │
├─────────────────────────────────────┤
│                                     │
│         [CONTENT AREA]              │
│                                     │
├─────────────────────────────────────┤
│  [🔍]    [📚]    [🎚️]    [⚙️]     │
│ Search  Library  Mixer  Settings    │
└─────────────────────────────────────┘
```

#### 1. 🔍 SEARCH/UPLOAD Tab
**Template:** `<div id="mobileSearchPage">`

**Features:**
- YouTube search bar + results grid
- File upload button (Android picker)
- Download button on each result
- Upload progress indicator

**APIs used:**
```javascript
GET  /api/search?q=${query}&count=10
POST /api/upload-file (FormData)
POST /api/downloads (add YouTube video)
```

#### 2. 📚 LIBRARY Tab (2 sub-tabs)
**Template:** `<div id="mobileLibraryPage">`

##### 📂 My Library
- User downloads/extractions list
- Card per item with:
  - Thumbnail
  - Title
  - Status: "Extract Stems" or "✓ Stems Available"
  - **Mix** button if extracted
  - Menu: Download, Delete

**APIs used:**
```javascript
GET    /api/downloads (list user items)
POST   /api/extractions (start extraction)
DELETE /api/downloads/${id}
```

##### 🌍 Global Library
- Shared items list
- Card per item with:
  - Thumbnail
  - Title
  - **Add to My Library** button

**APIs used:**
```javascript
GET  /api/library
POST /api/library/${id}/add-download
POST /api/library/${id}/add-extraction
```

#### 3. 🎚️ MIXER Tab (3 internal tabs)
**Template:** `<div id="mobileMixerPage">`

**Structure:**
```
┌─────────────────────────────────────┐
│  ← Back         Song Title          │
├─────────────────────────────────────┤
│  [Mix]  [Chords]  [Lyrics]          │
├─────────────────────────────────────┤
│                                     │
│      [TAB CONTENT]                  │
│                                     │
├─────────────────────────────────────┤
│  ▶️ | ⏸️ | ⏹️  [====] 1:23 / 3:45  │
│  Tempo: [====] 120  Pitch: [====] 0 │
└─────────────────────────────────────┘
```

##### 🎚️ Mix Tab
**Content:**
- **Single global waveform** (canvas)
- **Dynamically loaded stems list**
  - Stem name (vocals, drums, bass, other, guitar, piano)
  - Volume slider (0-100%)
  - Pan slider (-100 to +100)
  - Solo button
  - Mute button

**APIs used:**
```javascript
GET /api/extractions/${id}
  -> stems_paths: {vocals: "path", drums: "path", ...}

GET /api/extracted_stems/${id}/${stem_name}
  -> streaming audio file
```

##### 🎵 Chords Tab
**Content:**
- Horizontal scrolling timeline
- Chord boxes with timestamps
- Red synchronized playhead
- Measure bars

**Data:**
```javascript
extraction.chords_data = [
  {timestamp: 0.5, chord: "Am"},
  {timestamp: 2.3, chord: "F"},
  ...
]
extraction.detected_bpm = 120
```

##### 🎤 Lyrics Tab
**Content:**
- **"Generate Lyrics"** / **"Regenerate"** button
- Scrolling lyrics container
- Auto-scroll with highlighted active line
- Word-level timing (karaoke)

**APIs used:**
```javascript
POST /api/extractions/${id}/lyrics/generate
  -> returns lyrics_data

extraction.lyrics_data = [
  {start: 0.5, end: 2.1, text: "Hello world"},
  ...
]
```

##### 🎮 Control Bar (shared across 3 tabs)
**Position:** Fixed bottom (above bottom nav)

**Controls:**
- **Play/Pause/Stop** buttons
- **Progress bar** (draggable)
- **Time display** (current / total)
- **Tempo slider** (-50% to +100%) -> SoundTouch
- **Pitch slider** (-6 to +6 semitones) -> SoundTouch

---

## 🔊 Android Audio Architecture

### Technologies
- **Web Audio API** (native Chrome Android)
- **SoundTouch AudioWorklet** (pro time-stretch/pitch-shift)
- **No playbackRate** (too basic)

### Per-Stem Audio Flow

```
AudioBuffer (decoded audio file)
    ↓
BufferSourceNode (createBufferSource)
    ↓
SoundTouchWorkletNode (independent tempo + pitch)
    ↓  parameters: {tempo: 1.0, pitch: 0, rate: 1.0}
    ↓
GainNode (volume control)
    ↓  gain.value = 0-1
    ↓
StereoPannerNode (pan control)
    ↓  pan.value = -1 to +1
    ↓
MasterGainNode (master volume)
    ↓
AudioContext.destination (speakers)
```

### Desktop Code Pattern to Reuse

```javascript
// 1. Init AudioContext
const AudioContext = window.AudioContext || window.webkitAudioContext;
this.audioContext = new AudioContext();
this.masterGainNode = this.audioContext.createGain();
this.masterGainNode.connect(this.audioContext.destination);

// 2. Load SoundTouch Worklet
await this.audioContext.audioWorklet.addModule('/static/wasm/soundtouch-worklet.js');

// 3. Load stem audio file
const response = await fetch(`/api/extracted_stems/${extractionId}/${stemName}`);
const arrayBuffer = await response.arrayBuffer();
const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

// 4. Create nodes per stem
const source = this.audioContext.createBufferSource();
source.buffer = audioBuffer;

const soundTouchNode = new AudioWorkletNode(this.audioContext, 'soundtouch-processor');
soundTouchNode.parameters.get('tempo').value = 1.0;  // tempo ratio
soundTouchNode.parameters.get('pitch').value = 1.0;  // pitch ratio
soundTouchNode.parameters.get('rate').value = 1.0;   // always 1.0

const gainNode = this.audioContext.createGain();
gainNode.gain.value = 1.0;

const panNode = this.audioContext.createStereoPanner();
panNode.pan.value = 0;

// 5. Connect chain
source.connect(soundTouchNode);
soundTouchNode.connect(gainNode);
gainNode.connect(panNode);
panNode.connect(this.masterGainNode);

// 6. Store references
stems[stemName] = {
  source,
  soundTouchNode,
  gainNode,
  panNode,
  buffer: audioBuffer,
  volume: 1.0,
  pan: 0,
  muted: false,
  solo: false
};

// 7. Start playback
source.start(0, currentTime);
```

### Audio Controls

#### Tempo (time-stretch)
```javascript
// Change tempo WITHOUT changing pitch
const tempoRatio = newBPM / originalBPM; // e.g., 1.2 = +20% faster
stems.forEach(stem => {
  stem.soundTouchNode.parameters.get('tempo').value = tempoRatio;
});
```

#### Pitch (pitch-shift)
```javascript
// Change pitch WITHOUT changing tempo
const pitchRatio = Math.pow(2, semitones / 12); // e.g., +2 semitones
stems.forEach(stem => {
  stem.soundTouchNode.parameters.get('pitch').value = pitchRatio;
});
```

#### Volume
```javascript
stem.gainNode.gain.value = volume; // 0.0 to 1.0
```

#### Pan
```javascript
stem.panNode.pan.value = pan; // -1.0 (left) to +1.0 (right)
```

#### Mute
```javascript
stem.muted = true;
stem.gainNode.gain.value = 0;
```

#### Solo
```javascript
// If ANY stem is solo, mute all non-solo stems
const hasSolo = Object.values(stems).some(s => s.solo);
stems.forEach(stem => {
  if (hasSolo && !stem.solo) {
    stem.gainNode.gain.value = 0;
  } else if (!stem.muted) {
    stem.gainNode.gain.value = stem.volume;
  }
});
```

---

## 📁 Files to Edit

### mobile-app.js - Target Structure

```javascript
class MobileApp {
  constructor() {
    // Audio Engine
    this.audioContext = null;
    this.masterGainNode = null;
    this.stems = {}; // stemName -> {source, soundTouchNode, gainNode, panNode, ...}
    this.workletLoaded = false;

    // Playback state
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 0;
    this.startTime = 0;

    // Tempo/Pitch
    this.originalBPM = 120;
    this.currentBPM = 120;
    this.currentPitchShift = 0; // semitones

    // Current extraction
    this.currentExtractionId = null;
    this.currentExtractionData = null;

    // UI state
    this.currentPage = 'search';
    this.currentMixerTab = 'mix';

    this.init();
  }

  async init() {
    // 1. Init Socket.IO
    this.initSocket();

    // 2. Setup navigation
    this.setupNavigation();

    // 3. Setup audio context (on first user interaction)
    document.addEventListener('touchstart', () => this.initAudioContext(), {once: true});

    // 4. Load initial data
    await this.loadLibrary();
  }

  async initAudioContext() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContext();
    this.masterGainNode = this.audioContext.createGain();
    this.masterGainNode.connect(this.audioContext.destination);

    // Load SoundTouch worklet
    await this.loadSoundTouchWorklet();
  }

  async loadSoundTouchWorklet() {
    try {
      await this.audioContext.audioWorklet.addModule('/static/wasm/soundtouch-worklet.js');
      this.workletLoaded = true;
      console.log('[MobileApp] SoundTouch worklet loaded');
    } catch (error) {
      console.error('[MobileApp] Failed to load SoundTouch:', error);
      this.workletLoaded = false;
    }
  }

  // === SEARCH/UPLOAD ===
  async performSearch(query) { ... }
  async uploadFile(file) { ... }
  async downloadVideo(videoId) { ... }

  // === LIBRARIES ===
  async loadLibrary() { ... }
  async loadGlobalLibrary() { ... }
  async extractStems(item) { ... }
  async addToMyLibrary(item) { ... }

  // === MIXER ===
  async openMixer(item) { ... }
  async loadMixerData(extractionId) { ... }
  async loadStem(stemName, url) { ... }
  createAudioNodesForStem(stemName, audioBuffer) { ... }

  // === PLAYBACK ===
  play() { ... }
  pause() { ... }
  stop() { ... }
  seek(time) { ... }

  // === CONTROLS ===
  setTempo(bpm) { ... }
  setPitch(semitones) { ... }
  setVolume(stemName, volume) { ... }
  setPan(stemName, pan) { ... }
  toggleMute(stemName) { ... }
  toggleSolo(stemName) { ... }

  // === CHORDS ===
  displayChords(chordsData) { ... }
  syncChordPlayhead() { ... }

  // === LYRICS ===
  async generateLyrics() { ... }
  displayLyrics(lyricsData) { ... }
  syncLyricsHighlight() { ... }
}
```

---

## 🔄 Desktop Files to Reuse (No Changes)

### Backend APIs (no change)
- `app.py` - all `/api/*` routes
- `core/downloads_db.py` - database logic
- `core/stems_extractor.py` - Demucs extraction
- `core/lyrics_detector.py` - Whisper transcription
- `core/madmom_chord_detector.py` - chord detection

### Frontend Assets (direct reuse)
- `static/wasm/soundtouch-worklet.js` - AudioWorklet
- `static/wasm/soundtouch.js` - SoundTouch library
- `SimplePitchTempoController` pattern for tempo/pitch
- `AudioEngine.setupAudioNodes()` pattern for stems

---

## 🎨 Mobile UI Simplifications

### Desktop -> Mobile differences

| Feature | Desktop | Mobile Android |
|---------|---------|----------------|
| Layout | 2-column split | 1-column stack |
| Navigation | Top tabs | Bottom nav |
| Waveforms | Multiple per stem | 1 global waveform |
| Mixer controls | Horizontal faders | Touch vertical sliders |
| Chord timeline | Large display | Scrollable horizontal |
| Lyrics | Side panel | Full-screen tab |
| Tempo/Pitch | +/- buttons | Sliders + buttons |
| File upload | Drag & drop | Android file picker |

### Touch Events vs Mouse

```javascript
// Desktop
element.addEventListener('click', handler);
element.addEventListener('mousedown', handler);

// Mobile
element.addEventListener('touchstart', handler);
element.addEventListener('touchmove', handler);
element.addEventListener('touchend', handler);
```

---

## ✅ Implementation Checklist

### Phase 1: Audio Engine Core
- [ ] Create `initAudioContext()` with masterGainNode
- [ ] Load SoundTouch worklet
- [ ] Implement `loadStem(name, url)`
- [ ] Create `createAudioNodesForStem()` with full chain
- [ ] Test loading 4 stems

### Phase 2: Playback Controls
- [ ] Implement `play()` - start all stems in sync
- [ ] Implement `pause()` - stop all stems
- [ ] Implement `stop()` - reset position
- [ ] Implement `seek(time)` - synchronized seek
- [ ] Test basic playback

### Phase 3: Tempo/Pitch
- [ ] Wire Tempo slider to `soundTouchNode.parameters.get('tempo')`
- [ ] Wire Pitch slider to `soundTouchNode.parameters.get('pitch')`
- [ ] Calculate ratios correctly (BPM, semitones)
- [ ] Test real-time changes

### Phase 4: Stem Controls
- [ ] Implement Volume slider -> `gainNode.gain.value`
- [ ] Implement Pan slider -> `panNode.pan.value`
- [ ] Implement Mute button
- [ ] Implement Solo button (hasSolo logic)
- [ ] Test all controls

### Phase 5: Search/Upload
- [ ] Fix YouTube search (async/await)
- [ ] Render results correctly
- [ ] Implement Android file upload
- [ ] Test download and upload

### Phase 6: Libraries
- [ ] Configure My Library display
- [ ] Configure Global Library display
- [ ] "Extract Stems" button works
- [ ] "Mix" button opens mixer
- [ ] Test add to library

### Phase 7: Chords Tab
- [ ] Render chord timeline
- [ ] Horizontal scroll
- [ ] Synchronized playhead
- [ ] Click chord -> seek
- [ ] Test display

### Phase 8: Lyrics Tab
- [ ] Generate Lyrics button -> API
- [ ] Render lyrics with timestamps
- [ ] Highlight active line
- [ ] Auto-scroll
- [ ] Test karaoke

### Phase 9: Polish & Test
- [ ] Control bar visible on all 3 mixer tabs
- [ ] Smooth transitions
- [ ] Loading indicators
- [ ] Error handling
- [ ] Full test on Android device

---

## 🐛 Debugging Tips

### Console Logging
```javascript
console.log('[MobileApp] Event:', eventName, data);
console.log('[Audio] Stem loaded:', stemName, buffer.duration);
console.log('[SoundTouch] Tempo:', tempoRatio, 'Pitch:', pitchRatio);
```

### Chrome DevTools (USB Debugging)
1. Enable Developer Options on Android
2. Enable USB Debugging
3. Connect via USB
4. Chrome -> `chrome://inspect`
5. Inspect the mobile page

### Common Issues
- **No sound**: Check `audioContext.state` (suspended?)
- **Desync stems**: Ensure all `source.start()` use the same offset
- **Worklet error**: Check HTTPS or localhost (security requirement)
- **API 404**: Verify extraction ID and stem names

---

## 📊 Performance Targets

- **Load time**: < 3s to load 4 stems
- **Playback latency**: < 50ms for play/pause
- **Seek latency**: < 100ms
- **UI responsiveness**: 60 FPS scroll/animations
- **Memory**: < 200MB for 4 stems (4 min song)

---

## 🚀 Next Steps After Android

1. **iOS Compatibility Layer**
   - Detect iOS vs Android
   - Fallback if SoundTouch unavailable
   - Test on iOS Safari

2. **Progressive Web App**
   - Service Worker
   - Offline support
   - Add to Home Screen

3. **Optimizations**
   - Lazy load stems
   - Waveform caching
   - Preload chords/lyrics

---

**Document kept up to date during development**
**Check items as you progress** ✅
