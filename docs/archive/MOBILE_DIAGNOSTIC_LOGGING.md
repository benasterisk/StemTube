# 🔍 Mobile Diagnostic Logging System

**Date:** November 2025
**Purpose:** Complete diagnostic logging for mobile interface debugging
**Status:** ✅ Implemented

---

## 🎯 What Was Added

### 1. **Backend Logging Integration** ✅

All mobile browser console logs are now sent to the backend and written to log files.

**System:**
- Intercepts `console.log()`, `console.error()`, `console.warn()`
- Log batching (send every 2 seconds)
- Endpoint: `POST /api/logs/browser`
- Silent fail if logging breaks (does not crash the app)

**Code added:**
```javascript
setupBrowserLogging() {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args) => {
        originalLog.apply(console, args);
        this.sendLogToBackend('info', args.join(' '));
    };
    // ... same for error and warn
}

sendLogToBackend(level, message) {
    if (!this.logQueue) this.logQueue = [];
    this.logQueue.push({ level, message, timestamp: Date.now() });

    if (!this.logTimer) {
        this.logTimer = setTimeout(() => {
            fetch('/api/logs/browser', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ logs: this.logQueue })
            }).catch(() => {});
            this.logQueue = [];
            this.logTimer = null;
        }, 2000);
    }
}
```

---

### 2. **Comprehensive Stem Loading Logs** ✅

Each step of stem loading is now logged in detail.

#### **loadMixerData() - Master Control**
```
[LoadMixer] Starting with data: {...}
[LoadMixer] BPM set to: 128
[LoadMixer] Stems paths: {vocals: "...", drums: "...", ...}
[LoadMixer] Loading 4 stems: ['vocals', 'drums', 'bass', 'other']
[LoadMixer] Cleared tracks container
[LoadMixer] Loaded stems: ['vocals', 'drums', 'bass', 'other']
[LoadMixer] Stems detail: {vocals: {...}, ...}
[LoadMixer] Duration set to: 245.5
[LoadMixer] Rendering waveform...
[LoadMixer] Loaded 45 chords
[LoadMixer] No lyrics data
[LoadMixer] Complete!
```

#### **loadStem() - Individual Stem Loading**
```
[LoadStem] Starting: vocals path: vocals.mp3
[LoadStem] Fetching: /api/extracted_stems/<id>/vocals
[LoadStem] vocals response status: 200
[LoadStem] vocals downloading audio data...
[LoadStem] vocals downloaded 5242880 bytes
[LoadStem] vocals decoding audio...
[LoadStem] vocals decoded! Duration: 245.5 channels: 2
[LoadStem] vocals creating audio nodes...
[LoadStem] vocals creating track control...
[LoadStem] vocals COMPLETE ✓
```

**Error Cases:**
```
[LoadStem] vocals 404 Not Found - skipping
[LoadStem] vocals FAILED: Error: HTTP 500
[LoadStem] vocals Error stack: <stack trace>
```

#### **createAudioNodesForStem() - Audio Graph Setup**
```
[CreateNodes] vocals creating audio nodes...
[CreateNodes] vocals workletLoaded: true
[CreateNodes] vocals created GainNode
[CreateNodes] vocals created StereoPannerNode
[CreateNodes] vocals creating SoundTouch AudioWorkletNode...
[CreateNodes] vocals SoundTouch created and configured (tempo: 1 pitch: 1)
[CreateNodes] vocals connected audio graph
[CreateNodes] vocals stem object created and stored
```

**Without SoundTouch:**
```
[CreateNodes] vocals SoundTouch worklet not loaded, using direct connection
```

**SoundTouch Error:**
```
[CreateNodes] vocals SoundTouch creation failed: DOMException: ...
```

---

## 📊 What You Can Diagnose Now

### **Problem:** Stems not loading

**Check logs for:**
1. `[LoadMixer] No stems paths found!` → Backend didn't return stems data
2. `[LoadMixer] Tracks container not found!` → HTML element missing
3. `[LoadStem] <name> 404 Not Found` → Stem files don't exist on server
4. `[LoadStem] <name> FAILED: HTTP 500` → Server error fetching stem
5. `[LoadStem] <name> downloaded 0 bytes` → Empty file
6. `[LoadStem] <name> decoding audio...` (hangs) → Audio decoding stuck
7. `[LoadMixer] No valid durations found!` → All stems failed to load
8. `[CreateNodes] <name> SoundTouch creation failed` → AudioWorklet issue

### **Problem:** No audio playback

**Check logs for:**
1. `[Play] AudioContext not initialized` → Context never created
2. `[Play] Failed to resume AudioContext` → Mobile autoplay blocked
3. `[Play] No stems loaded` → Load failed before play
4. `[StartStem] Skipping <name> - no buffer` → Stem didn't finish loading
5. `[StartStem] <name> started at offset X.XXs` → Should appear for each stem

### **Problem:** No waveform

**Check logs for:**
1. `[Waveform] Canvas not found` → HTML element missing
2. `[Waveform] No audio buffers available` → Stems didn't load
3. `[Waveform] Rendered: 375x120` → Success!

### **Problem:** Chords/Lyrics not working

**Check logs for:**
1. `[Lyrics] No extraction ID` → Mixer not opened properly
2. `[Lyrics] Button not found` → HTML element missing
3. `[Lyrics] Response status: 500` → Backend error
4. `[Lyrics] Parsed 45 lyrics segments` → Success!

---

## 🧪 How to Use This System

### **On Android Device:**

1. **Launch the app:**
   ```bash
   cd /home/michael/StemTube-dev
   source venv/bin/activate
   python app.py
   ```

2. **Find your WSL IP:**
   ```bash
   hostname -I | awk '{print $1}'
   ```

3. **On Android, navigate to:**
   ```
   http://<your-ip>:5011/mobile
   ```

4. **Perform the action that's failing** (e.g., open mixer, click play)

5. **Wait 2-3 seconds** for logs to batch and send to backend

6. **Check backend logs:**
   ```bash
   tail -f /home/michael/StemTube-dev/logs/stemtube.log | grep Browser
   ```

   Or check via admin interface:
   ```
   http://<your-ip>:5011/admin
   → Logs section
   → View latest log file
   ```

### **Alternative: Chrome DevTools (if you have USB cable)**

1. **On PC, open Chrome and navigate to:**
   ```
   chrome://inspect
   ```

2. **Enable USB debugging on Android**

3. **Connect Android to PC via USB**

4. **Find your device in chrome://inspect and click "Inspect"**

5. **Open Console tab to see live logs**

---

## 🔍 Log Patterns to Look For

### **Successful Stem Load Pattern:**
```
[LoadMixer] Loading 4 stems: ['vocals', 'drums', 'bass', 'other']
[LoadStem] Starting: vocals path: vocals.mp3
[LoadStem] vocals response status: 200
[LoadStem] vocals downloaded 5242880 bytes
[LoadStem] vocals decoded! Duration: 245.5 channels: 2
[CreateNodes] vocals created GainNode
[CreateNodes] vocals created StereoPannerNode
[CreateNodes] vocals SoundTouch created and configured
[CreateNodes] vocals connected audio graph
[LoadStem] vocals COMPLETE ✓
[LoadStem] Starting: drums path: drums.mp3
...
[LoadMixer] Loaded stems: ['vocals', 'drums', 'bass', 'other']
[LoadMixer] Duration set to: 245.5
[Waveform] Rendered: 375x120
```

### **Failed Load Pattern (404):**
```
[LoadMixer] Loading 4 stems: ['vocals', 'drums', 'bass', 'other']
[LoadStem] Starting: vocals path: vocals.mp3
[LoadStem] Fetching: /api/extracted_stems/<id>/vocals
[LoadStem] vocals response status: 404
[LoadStem] vocals 404 Not Found - skipping
[LoadStem] Starting: drums path: drums.mp3
[LoadStem] drums response status: 404
...
[LoadMixer] Loaded stems: []
[LoadMixer] No valid durations found!
[Waveform] No audio buffers available
```

### **AudioContext Suspended Pattern:**
```
[Play] Starting playback, AudioContext state: suspended
[Play] AudioContext resumed
[Play] Starting 4 stems
[StartStem] vocals → SoundTouch → Gain → Pan → Master
[StartStem] vocals started at offset 0.00s
```

---

## 📝 Common Issues and Solutions

| Log Message | Problem | Solution |
|-------------|---------|----------|
| `[LoadStem] 404 Not Found - skipping` | Stem files missing | Re-extract stems or check file paths |
| `[CreateNodes] SoundTouch creation failed` | AudioWorklet not loading | Check `/static/wasm/soundtouch-worklet.js` exists |
| `[Play] Failed to resume AudioContext` | Mobile autoplay policy | User gesture required (already done, but check) |
| `[Waveform] Canvas not found` | HTML element missing | Check `mobileWaveformCanvas` ID exists |
| `[LoadMixer] Tracks container not found!` | HTML element missing | Check `mobileTracksContainer` ID exists |
| `[LoadStem] downloaded 0 bytes` | Empty file on server | Check actual file on disk |
| `[Lyrics] Response status: 500` | Backend error | Check backend logs for Python errors |

---

## 🎯 Next Steps

**Now that logging is in place:**

1. **Test on Android device**
2. **Watch the logs** (either in backend or Chrome DevTools)
3. **Identify exactly where the stem loading fails**
4. **Report back with the specific log messages**

Example report format:
```
I opened mixer and here's what I see in logs:

[LoadMixer] Starting with data: {...}
[LoadMixer] Loading 4 stems: ['vocals', 'drums', 'bass', 'other']
[LoadStem] Starting: vocals path: vocals.mp3
[LoadStem] vocals response status: 404
[LoadStem] vocals 404 Not Found - skipping

All 4 stems return 404. The extraction was successful in desktop.
```

With this information, I can pinpoint the exact issue and fix it.

---

## 📊 Statistics

| Component | Logs Added | Code Lines |
|-----------|------------|------------|
| Backend logging system | 3 log levels | ~50 lines |
| loadMixerData() | 12 checkpoints | ~15 lines |
| loadStem() | 10 checkpoints | ~20 lines |
| createAudioNodesForStem() | 8 checkpoints | ~15 lines |

**Total:** ~100 lines of diagnostic code
**Coverage:** Every critical operation now logged

---

**Ready for systematic debugging!** 🚀🔍

The logging system will capture everything happening in the mobile interface and send it to the backend. You can now see exactly where things are failing.

**Next step:** Test on Android and check the logs to see where stems are failing to load.
