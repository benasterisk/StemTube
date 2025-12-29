# 🔄 CONTINUATION - StemTube Mobile Interface

**Date**: 2025-01-05
**Context**: Windows -> Ubuntu WSL migration
**Goal**: Finish mobile interface with 4 synchronized independent stems

---

## 🚨 CURRENT ISSUE

**JavaScript syntax error** in `static/js/mobile-app.js` line 63

```javascript
// ERROR LINE 60-63
initSocket() {
    this.socket = io();
    this.socket.on('connect', () => {
        console.log('[Socket] Connected');
    })  // <- MISSING });

// Calculate effective volume based on mute/solo
getEffectiveVolume(stemName) {  // <- LINE 63: function outside class
```

**Cause**: Python script `fix-mobile-stems.py` inserted `getEffectiveVolume()` in the wrong place (inside constructor instead of after `applyMixerState()`).

---

## ✅ WHAT IS ALREADY DONE

### 1. **Functional Fixes (5/6 done)**

| Fix | Status | Details |
|------------|--------|---------|
| ✅ Volume/Pan iOS | **DONE** | Web Audio API + GainNode/StereoPanner |
| ✅ Solo/Mute buttons | **DONE** | "MUTE"/"SOLO" text + full logic |
| ✅ Timeline Chords | **DONE** | Horizontal grid + measure bars + playhead |
| ✅ Lyrics Generation | **DONE** | Button wired to API `/api/extractions/<id>/lyrics/generate` |
| ⚠️ **4-stem loading** | **95%** | Code written, syntax error to fix |
| ⏳ Pitch/Tempo | **70%** | SoundTouch integrated, sliders connected |

### 2. **Implemented Architecture**

**New objects in constructor**:
```javascript
this.stemBuffers = {};    // { vocals: {buffer, duration}, ... }
this.stemGains = {};      // { vocals: GainNode, ... }
this.stemPans = {};       // { vocals: StereoPannerNode, ... }
this.stemSources = {};    // { vocals: AudioBufferSourceNode, ... }
this.playbackStartTime = 0;
```

**New functions**:
- ✅ `loadStemsForIOS()` - Loads 4 stems via `fetch()` + `decodeAudioData()`
- ✅ `playPlayback()` - Starts all stems at EXACTLY the same time
- ✅ `pausePlayback()` - Stops all sources
- ✅ `startTimeUpdate()` - Uses `audioContext.currentTime` for sync
- ⚠️ `getEffectiveVolume()` - **MOVE IT** (wrong placement)

---

## 🔧 TASKS TO COMPLETE (Ubuntu)

### ✅ **TASK 1: Fix syntax error (5 min)**

**File**: `static/js/mobile-app.js`

#### Step 1.1: Close `initSocket()` properly

```bash
# Around lines ~60-70, search:
grep -n "initSocket()" static/js/mobile-app.js

# Fix (add missing }); after socket.on):
```

**BEFORE** (line 60-63):
```javascript
initSocket() {
    this.socket = io();
    this.socket.on('connect', () => {
        console.log('[Socket] Connected');
    })  // <- ERROR: missing });
```

**AFTER**:
```javascript
initSocket() {
    this.socket = io();
    this.socket.on('connect', () => {
        console.log('[Socket] Connected');
    });  // <- FIXED

    this.socket.on('download_complete', (data) => {
        console.log('[Socket] Download complete:', data);
        this.loadLibrary();
    });

    this.socket.on('extraction_complete', (data) => {
        console.log('[Socket] Extraction complete:', data);
        this.loadLibrary();
    });
}
```

#### Step 1.2: Remove mis-placed `getEffectiveVolume()`

```bash
# Find where it is wrongly placed (line ~63-78)
grep -n "getEffectiveVolume" static/js/mobile-app.js

# Delete lines ~63-78
# Use an editor to remove this section
```

#### Step 1.3: Add `getEffectiveVolume()` to the RIGHT place

```bash
# Find applyMixerState() (line ~650-660)
grep -n "applyMixerState()" static/js/mobile-app.js
```

**Add AFTER `applyMixerState()}` (around line 660):**

```javascript
applyMixerState() {
    Object.keys(this.tracks).forEach(stemName => {
        if (this.stemGains[stemName]) {
            const effectiveVolume = this.getEffectiveVolume(stemName);
            this.stemGains[stemName].gain.value = effectiveVolume;
        }
    });
}

// <- ADD HERE
getEffectiveVolume(stemName) {
    const track = this.tracks[stemName];
    if (!track) return 0;

    // Check if muted
    if (track.muted) return 0;

    // Check solo logic
    const hasSolo = Object.values(this.tracks).some(t => t.solo);
    if (hasSolo && !track.solo) return 0;

    return track.volume;
}
```

#### Step 1.4: Verify syntax

```bash
node --check static/js/mobile-app.js
# Should return: (nothing) = success
```

---

### ✅ **TASK 2: Initialize variables in constructor (3 min)**

**File**: `static/js/mobile-app.js`

```bash
grep -n "constructor()" static/js/mobile-app.js
```

**Verify these variables EXIST** (lines ~30-35):

```javascript
// Pitch/Tempo control state
this.currentPitchSemitones = 0;
this.currentTempo = 1.0;
this.soundTouchNode = null;
this.useFallbackPitchTempo = false;

// Stem buffers and nodes
this.stemBuffers = {};
this.stemGains = {};
this.stemPans = {};
this.stemSources = {};
this.playbackStartTime = 0;
```

**If missing**, add after `this.animationFrame = null;` (line ~30).

---

### ✅ **TASK 3: Test stem loading (10 min)**

```bash
cd /home/michael/StemTube-dev
source venv/bin/activate
python app.py
```

**On mobile** (`http://localhost:5011/mobile`):

1. **Open browser console** (Chrome/Safari DevTools)
2. **Click an item** with "Stems Available"
3. **Check console**:

```javascript
// ✅ SHOULD SHOW:
[Mixer] Loading 4 separate stems with Web Audio API
[Mixer] Parsed stems_paths: {vocals: "...", drums: "...", ...}
[Mixer] Loading vocals from /api/stream-audio?file_path=...
[Mixer] ✓ vocals loaded: 234.50s
[Mixer] ✓ drums loaded: 234.50s
[Mixer] ✓ bass loaded: 234.50s
[Mixer] ✓ other loaded: 234.50s
[Mixer] All stems loaded, duration: 234.50s
```

**If errors**:
- ❌ `Failed to load`: verify stem paths in DB (`stems_paths` JSON)
- ❌ `No stems paths found`: item has no extracted stems
- ❌ `AudioContext suspended`: tap screen once (iOS)

---

### ✅ **TASK 4: Test playback sync (10 min)**

**Test 1: Basic playback**

1. **Click Play**
2. **Check console**:

```javascript
// ✅ SHOULD SHOW:
[Audio] Playing from 0.00s
```

3. **Listen** - All 4 stems must play **perfectly synchronized**

**Test 2: Pause/Resume**

1. **Pause** after 10 seconds
2. **Resume** - Should resume at the exact same spot
3. **Console**:

```javascript
[Audio] Paused
[Audio] Playing from 10.23s  // <- exact position
```

**Test 3: Seek (progress bar)**

1. **Click** progress bar at 50%
2. **Play** - All stems must start in sync at 50%

---

### ✅ **TASK 5: Test independent controls (15 min)**

#### Independent volume test

**For EACH stem** (vocals, drums, bass, other):

1. **Set Volume slider to 50%**
2. **Console should show**:
   ```javascript
   [Audio] vocals volume: 0.50 (effective: 0.50)
   ```
3. **Verify audio** - Only that stem gets quieter

#### Mute test

1. **Click "MUTE"** on vocals
2. **Console**:
   ```javascript
   [Audio] vocals volume: 1.00 (effective: 0.00)
   ```
3. **Verify** - Vocals muted, other stems still play

#### Solo test

1. **Click "SOLO"** on drums
2. **Console**:
   ```javascript
   [Audio] vocals volume: 1.00 (effective: 0.00)
   [Audio] drums volume: 1.00 (effective: 1.00)
   [Audio] bass volume: 1.00 (effective: 0.00)
   [Audio] other volume: 1.00 (effective: 0.00)
   ```
3. **Verify** - Only drums audible

#### Pan test

1. **Set Pan slider to -100** (left) for vocals
2. **Console**:
   ```javascript
   [Audio] vocals pan: -1.00
   ```
3. **Verify on headphones** - Vocals on left only

---

### ⏳ **TASK 6: Finish Pitch/Tempo (optional - 20 min)**

**Current state**: Sliders connected, SoundTouch loaded, but may not work without AudioWorklet.

#### Pitch test

1. **Set Key slider to +3**
2. **Console should show**:
   ```javascript
   [Audio] Pitch shift: 3 semitones (ratio: 1.189)
   // OR if fallback:
   [Audio] AudioWorklet not supported, using playbackRate fallback
   [Audio] Fallback pitch via playbackRate: 1.189
   ```

#### If AudioWorklet is not supported

**Simple alternative** - Use `playbackRate` (changes pitch AND tempo together):

```javascript
// In applyPitchShift() - around line ~1230
applyPitchShift(semitones) {
    const pitchRatio = Math.pow(2, semitones / 12);

    // Simple fallback
    if (this.audioElement) {
        this.audioElement.playbackRate = pitchRatio * (this.currentTempo || 1.0);
    }
}
```

---

## 📝 USEFUL COMMANDS (Ubuntu)

### File editing

```bash
cd /home/michael/StemTube-dev

# Check syntax
node --check static/js/mobile-app.js

# Find a function
grep -n "function_name" static/js/mobile-app.js

# View specific lines
sed -n '60,80p' static/js/mobile-app.js

# Backup before changes
cp static/js/mobile-app.js static/js/mobile-app.js.backup-$(date +%Y%m%d-%H%M)
```

### Test app

```bash
# Activate venv
source venv/bin/activate

# Start app
python app.py

# Test on mobile
# http://localhost:5011/mobile
```

### Mobile console debugging

**Chrome Android**:
1. PC: `chrome://inspect`
2. Connect USB
3. Inspect device

**Safari iOS**:
1. iPhone: Settings -> Safari -> Advanced -> Web Inspector
2. Mac: Safari -> Develop -> [iPhone] -> localhost

---

## 🐛 KNOWN ISSUES & FIXES

### Issue 1: "No audio available"

**Cause**: `stems_paths` not parsed or empty

**Fix**:
```javascript
// Check in loadStemsForIOS around line ~500
console.log('[DEBUG] stems_paths raw:', data.stems_paths);
console.log('[DEBUG] stems_paths parsed:', stemsPaths);
```

### Issue 2: "Failed to decode audio data"

**Cause**: Corrupted stem file or unsupported format

**Fix**:
```bash
# Verify stem files exist
ls -lh "core/downloads/*/stems/*.mp3"

# Test a stem manually
ffmpeg -i core/downloads/.../vocals.mp3 -t 5 test.mp3
```

### Issue 3: Stem desync

**Cause**: Using `HTMLAudioElement.play()` instead of `AudioBufferSourceNode.start()`

**Fix**: Code already corrected, verify `playPlayback()` uses:
```javascript
sourceNode.start(when, offset);  // ✅ Correct
// NOT:
audio.play();  // ❌ Desync
```

### Issue 4: "AudioContext suspended"

**Cause**: iOS blocks audio without user interaction

**Fix**: Tap screen once, `unlockAudio()` triggers automatically

---

## 📊 FINAL CHECKLIST

### Syntax & Code

- [ ] `node --check static/js/mobile-app.js` -> OK
- [ ] `getEffectiveVolume()` placed after `applyMixerState()`
- [ ] `initSocket()` closed with `});`
- [ ] Variables `stemBuffers`, `stemGains`, `stemPans` initialized in constructor

### Functionality

- [ ] Console: "All stems loaded, duration: XXs"
- [ ] Play -> Synchronized playback of 4 stems
- [ ] Pause -> Clean stop
- [ ] Resume -> Resume at correct position
- [ ] Seek -> Timeline navigation

### Independent Controls

- [ ] Volume vocals -> Only vocals change
- [ ] Mute drums -> Only drums muted
- [ ] Solo bass -> Only bass audible
- [ ] Pan other -> Stereo panning works

### Interface

- [ ] Timeline Chords with red playhead
- [ ] "MUTE" / "SOLO" buttons (text, not icons)
- [ ] Generate Lyrics works
- [ ] Mix/Chords/Lyrics tabs switch

### Multi-platform

- [ ] **Android**: Everything works
- [ ] **iOS**: Everything works (after screen tap)
- [ ] **Desktop mobile view**: Everything works

---

## 🎯 PRIORITIES

### **PRIORITY 1 (CRITICAL)** - Fix syntax

-> Task 1 (5 min) - Without this, nothing works

### **PRIORITY 2 (IMPORTANT)** - Test loading

-> Tasks 3-4 (20 min) - Verify stems load and play

### **PRIORITY 3 (IMPORTANT)** - Test controls

-> Task 5 (15 min) - Verify independent Volume/Mute/Solo/Pan

### **PRIORITY 4 (OPTIONAL)** - Pitch/Tempo

-> Task 6 (20 min) - Can be done later

---

## 💾 MODIFIED FILES

```
static/js/mobile-app.js          <- Main (syntax error line 63)
static/css/mobile-style.css      <- OK (timeline, buttons)
templates/mobile-index.html      <- OK
fix-mobile-stems.py              <- Python script (already run)
```

## 📚 AVAILABLE BACKUPS

```
static/js/mobile-app.js.backup   <- Before Python script
```

---

## 🚀 QUICK START (Ubuntu)

```bash
# 1. Open VSCode or vim
code /home/michael/StemTube-dev/static/js/mobile-app.js

# 2. Fix line ~60-70 (close initSocket)
# 3. Remove getEffectiveVolume lines ~63-78
# 4. Add getEffectiveVolume after applyMixerState (~660)

# 5. Verify
node --check static/js/mobile-app.js

# 6. Test
source venv/bin/activate
python app.py
# -> http://localhost:5011/mobile
```

---

## 📞 EXTRA HELP

If stuck, check:

1. **Browser console** - all JS errors appear there
2. **Python console** - server errors (404, 500)
3. **This file** - all steps documented

**Full reference files**:
- `CLAUDE.md` - complete desktop architecture
- `MOBILE_SETUP.md` - mobile docs (if it exists)
- This file - work continuation

---

**Good luck! 🎵**

_Last updated: 2025-01-05 - Conversation saved from Windows -> Ubuntu WSL_
