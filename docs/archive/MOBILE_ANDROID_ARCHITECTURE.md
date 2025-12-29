# Architecture Mobile Android - StemTube

## Document de Référence pour l'Implémentation

Date: 2025-11-07
Branch: `fix-mobile-properly`

---

## 🎯 Objectif

Créer une interface mobile **Android-first** qui réutilise **exactement** l'architecture desktop existante :
- Mêmes APIs backend (aucune modification serveur)
- Même moteur audio (SoundTouch AudioWorklet)
- Même logique métier
- Interface UI adaptée pour mobile (touch-friendly, responsive)

---

## 📱 Structure Frontend Mobile

### Navigation Principale (Bottom Nav)

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
- File upload button (gestionnaire Android)
- Download button on each result
- Upload progress indicator

**APIs utilisées:**
```javascript
GET  /api/search?q=${query}&count=10
POST /api/upload-file (FormData)
POST /api/downloads (add YouTube video)
```

#### 2. 📚 LIBRARY Tab (2 sous-onglets)
**Template:** `<div id="mobileLibraryPage">`

##### 📂 My Library
- Liste des downloads/extractions utilisateur
- Card per item avec:
  - Thumbnail
  - Title
  - Status: "Extract Stems" ou "✓ Stems Available"
  - Bouton **"Mix"** si extracted
  - Menu: Download, Delete

**APIs utilisées:**
```javascript
GET    /api/downloads (list user items)
POST   /api/extractions (start extraction)
DELETE /api/downloads/${id}
```

##### 🌍 Global Library
- Liste des items partagés
- Card per item avec:
  - Thumbnail
  - Title
  - Bouton **"Add to My Library"**

**APIs utilisées:**
```javascript
GET  /api/library
POST /api/library/${id}/add-download
POST /api/library/${id}/add-extraction
```

#### 3. 🎚️ MIXER Tab (3 onglets internes)
**Template:** `<div id="mobileMixerPage">`

**Structure:**
```
┌─────────────────────────────────────┐
│  ← Back         Song Title          │
├─────────────────────────────────────┤
│  [Mix]  [Chords]  [Lyrics]          │
├─────────────────────────────────────┤
│                                     │
│      [ONGLET CONTENT]               │
│                                     │
├─────────────────────────────────────┤
│  ▶️ | ⏸️ | ⏹️  [====] 1:23 / 3:45  │
│  Tempo: [====] 120  Pitch: [====] 0 │
└─────────────────────────────────────┘
```

##### 🎚️ Mix Tab
**Content:**
- **Waveform globale unique** (canvas)
- **Liste stems chargés dynamiquement**
  - Nom du stem (vocals, drums, bass, other, guitar, piano)
  - Volume slider (0-100%)
  - Pan slider (-100 à +100)
  - Bouton Solo
  - Bouton Mute

**API utilisée:**
```javascript
GET /api/extractions/${id}
  → stems_paths: {vocals: "path", drums: "path", ...}

GET /api/extracted_stems/${id}/${stem_name}
  → streaming audio file
```

##### 🎵 Chords Tab
**Content:**
- Horizontal scrolling timeline
- Chord boxes avec timestamps
- Playhead rouge synchronisé
- Measure bars (barres de mesure)

**Données:**
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
- Bouton **"Generate Lyrics"** / **"Regenerate"**
- Scrolling lyrics container
- Auto-scroll avec ligne active highlightée
- Word-level timing (karaoke)

**API utilisée:**
```javascript
POST /api/extractions/${id}/lyrics/generate
  → returns lyrics_data

extraction.lyrics_data = [
  {start: 0.5, end: 2.1, text: "Hello world"},
  ...
]
```

##### 🎮 Barre de Contrôle (commune aux 3 onglets)
**Position:** Fixed bottom (au-dessus du bottom nav)

**Controls:**
- **Play/Pause/Stop** buttons
- **Progress bar** (draggable)
- **Time display** (current / total)
- **Tempo slider** (-50% à +100%) → SoundTouch
- **Pitch slider** (-6 à +6 semitones) → SoundTouch

---

## 🔊 Architecture Audio Android

### Technologies
- **Web Audio API** (natif Chrome Android)
- **SoundTouch AudioWorklet** (timestretch/pitchshift professionnel)
- **Pas de playbackRate** (trop basique)

### Flux Audio par Stem

```
AudioBuffer (decoded audio file)
    ↓
BufferSourceNode (createBufferSource)
    ↓
SoundTouchWorkletNode (tempo + pitch indépendants)
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

### Code Pattern Desktop à Réutiliser

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

### Contrôles Audio

#### Tempo (timestretch)
```javascript
// Change tempo WITHOUT changing pitch
const tempoRatio = newBPM / originalBPM; // e.g., 1.2 = +20% faster
stems.forEach(stem => {
  stem.soundTouchNode.parameters.get('tempo').value = tempoRatio;
});
```

#### Pitch (pitchshift)
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

## 📁 Fichiers à Modifier

### mobile-app.js - Structure Cible

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

## 🔄 Fichiers Desktop à Réutiliser (Sans Modification)

### Backend APIs (aucun changement)
- `app.py` - toutes les routes `/api/*`
- `core/downloads_db.py` - logique database
- `core/stems_extractor.py` - extraction Demucs
- `core/lyrics_detector.py` - transcription Whisper
- `core/madmom_chord_detector.py` - détection accords

### Frontend Assets (réutilisation directe)
- `static/wasm/soundtouch-worklet.js` - AudioWorklet
- `static/wasm/soundtouch.js` - Librairie SoundTouch
- Pattern `SimplePitchTempoController` pour tempo/pitch
- Pattern `AudioEngine.setupAudioNodes()` pour stems

---

## 🎨 Mobile UI Simplifications

### Différences Desktop → Mobile

| Feature | Desktop | Mobile Android |
|---------|---------|----------------|
| Layout | 2 colonnes split | 1 colonne stack |
| Navigation | Tabs top | Bottom nav |
| Waveforms | Multiple par stem | 1 globale unique |
| Mixer controls | Faders horizontaux | Sliders verticaux touch |
| Chord timeline | Large display | Scrollable horizontal |
| Lyrics | Side panel | Full-screen tab |
| Tempo/Pitch | Boutons +/- | Sliders + boutons |
| File upload | Drag & drop | File picker Android |

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

## ✅ Checklist Implémentation

### Phase 1: Audio Engine Core
- [ ] Créer `initAudioContext()` avec masterGainNode
- [ ] Charger SoundTouch worklet
- [ ] Implémenter `loadStem(name, url)`
- [ ] Créer `createAudioNodesForStem()` avec chain complète
- [ ] Tester chargement 4 stems

### Phase 2: Playback Controls
- [ ] Implémenter `play()` - démarrer tous les stems synchronisés
- [ ] Implémenter `pause()` - stopper tous les stems
- [ ] Implémenter `stop()` - reset position
- [ ] Implémenter `seek(time)` - seek synchronisé
- [ ] Tester playback basique

### Phase 3: Tempo/Pitch
- [ ] Connecter slider Tempo à `soundTouchNode.parameters.get('tempo')`
- [ ] Connecter slider Pitch à `soundTouchNode.parameters.get('pitch')`
- [ ] Calculer ratios correctement (BPM, semitones)
- [ ] Tester changements en temps réel

### Phase 4: Stem Controls
- [ ] Implémenter Volume slider → `gainNode.gain.value`
- [ ] Implémenter Pan slider → `panNode.pan.value`
- [ ] Implémenter Mute button
- [ ] Implémenter Solo button (logique hasSolo)
- [ ] Tester tous contrôles

### Phase 5: Search/Upload
- [ ] Réparer YouTube search (async/await)
- [ ] Afficher résultats correctement
- [ ] Implémenter file upload Android
- [ ] Tester download et upload

### Phase 6: Libraries
- [ ] Configurer My Library display
- [ ] Configurer Global Library display
- [ ] Bouton "Extract Stems" fonctionnel
- [ ] Bouton "Mix" ouvre mixer
- [ ] Tester add to library

### Phase 7: Chords Tab
- [ ] Afficher chord timeline
- [ ] Scroll horizontal
- [ ] Playhead synchronisé
- [ ] Click chord → seek
- [ ] Tester affichage

### Phase 8: Lyrics Tab
- [ ] Bouton Generate Lyrics → API
- [ ] Afficher lyrics avec timestamps
- [ ] Highlight ligne active
- [ ] Auto-scroll
- [ ] Tester karaoke

### Phase 9: Polish & Test
- [ ] Barre contrôle visible sur 3 onglets mixer
- [ ] Transitions fluides
- [ ] Loading indicators
- [ ] Error handling
- [ ] Test complet sur Android device

---

## 🐛 Debugging Tips

### Console Logging
```javascript
console.log('[MobileApp] Event:', eventName, data);
console.log('[Audio] Stem loaded:', stemName, buffer.duration);
console.log('[SoundTouch] Tempo:', tempoRatio, 'Pitch:', pitchRatio);
```

### Chrome DevTools (USB Debugging)
1. Enable Developer Options sur Android
2. Enable USB Debugging
3. Connect via USB
4. Chrome → `chrome://inspect`
5. Inspect mobile page

### Common Issues
- **No sound**: Check `audioContext.state` (suspended?)
- **Desync stems**: Check all `source.start()` called with same offset
- **Worklet error**: Check HTTPS or localhost (security requirement)
- **API 404**: Check extraction ID and stem names

---

## 📊 Performance Targets

- **Load time**: < 3s pour charger 4 stems
- **Playback latency**: < 50ms pour play/pause
- **Seek latency**: < 100ms
- **UI responsiveness**: 60 FPS scroll/animations
- **Memory**: < 200MB pour 4 stems (4min song)

---

## 🚀 Prochaines Étapes Après Android

1. **iOS Compatibility Layer**
   - Détecter iOS vs Android
   - Fallback si SoundTouch non disponible
   - Tester sur Safari iOS

2. **Progressive Web App**
   - Service Worker
   - Offline support
   - Add to Home Screen

3. **Optimisations**
   - Lazy loading stems
   - Waveform caching
   - Chord/Lyrics preloading

---

**Document maintenu à jour pendant développement**
**Cocher les items au fur et à mesure** ✅
