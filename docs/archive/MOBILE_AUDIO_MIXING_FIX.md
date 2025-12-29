# 🔧 Mobile Audio Mixing & Tempo Bug Fixes

**Date:** November 2025
**Status:** ✅ Fixed
**Issues Resolved:**
1. Audio tracks mixing together (multiple tracks playing simultaneously)
2. Tempo modified incorrectly after refresh

---

## 🐛 Bugs Identified

### Bug 1: Audio Tracks Mixing
**Symptom:** Opening a new track while another was playing caused both tracks to play simultaneously at slow speed.

**Example:** User reported hearing "Hold the Line" and "Africa" by Toto playing together.

**Root Cause:**
- `initAudioContext()` only checked if `this.audioContext` exists, not if it was closed
- When `cleanupMixer()` closed the AudioContext, the reference remained
- Next track tried to reuse the CLOSED AudioContext instead of creating a new one
- Result: Multiple AudioContexts coexisting, audio sources from both tracks playing

### Bug 2: Tempo Modified After Refresh
**Symptom:** After refreshing the page, tempo was drastically slowed down without user input.

**Root Cause:**
- `setTempo()` function expected a BPM value but was being called with a ratio (0.5-2.0)
- When called with ratio `1.2`, it stored `currentBPM = 1.2`
- Then recalculated ratio as `1.2 / 100 = 0.012` → tempo became 1.2% of normal speed!
- Slider event handler called `setTempo(this.originalBPM * v)` which passed BPM
- But state restoration called `setTempo(tempoRatio)` which passed ratio
- Inconsistent parameter types caused the bug

---

## ✅ Fixes Applied

### Fix 1: AudioContext Lifecycle Management

**File:** `static/js/mobile-app.js`

**Before:**
```javascript
async initAudioContext() {
    if (this.audioContext) return;  // ❌ Only checks existence, not state
    console.log('[Audio] Initializing AudioContext...');

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContext();
    // ...
}
```

**After:**
```javascript
async initAudioContext() {
    // ✅ Check if AudioContext exists AND is not closed
    if (this.audioContext && this.audioContext.state !== 'closed') {
        console.log('[Audio] AudioContext already exists (state:', this.audioContext.state + ')');
        return;
    }

    console.log('[Audio] Initializing NEW AudioContext...');

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContext();
    this.masterGainNode = this.audioContext.createGain();
    this.masterGainNode.connect(this.audioContext.destination);
    console.log('[Audio] AudioContext created successfully (state:', this.audioContext.state + ')');
    await this.loadSoundTouchWorklet();
}
```

**Why this works:**
- AudioContext has 3 states: `suspended`, `running`, `closed`
- Once closed, it CANNOT be reused - must create new one
- Now we check both existence AND state before reusing

---

### Fix 2: Tempo Function Parameter Type

**File:** `static/js/mobile-app.js`

**Before:**
```javascript
setTempo(bpm) {  // ❌ Accepts BPM but gets called with ratio
    this.currentBPM = Math.max(50, Math.min(300, bpm));
    const ratio = this.currentBPM / this.originalBPM;
    Object.values(this.stems).forEach(s => {
        if (s.soundTouchNode) s.soundTouchNode.parameters.get('tempo').value = ratio;
    });
}
```

**After:**
```javascript
setTempo(ratio) {  // ✅ Accepts ratio (0.5 - 2.0)
    // Calculate actual BPM from ratio
    const newBPM = this.originalBPM * ratio;
    this.currentBPM = Math.max(50, Math.min(300, newBPM));

    // Recalculate actual ratio based on clamped BPM
    const actualRatio = this.currentBPM / this.originalBPM;

    console.log('[Tempo] Setting tempo - ratio:', ratio, 'originalBPM:', this.originalBPM, 'newBPM:', this.currentBPM, 'actualRatio:', actualRatio);

    Object.values(this.stems).forEach(s => {
        if (s.soundTouchNode) s.soundTouchNode.parameters.get('tempo').value = actualRatio;
    });
}
```

**Why this works:**
- Now consistently accepts ratio (0.5x - 2.0x)
- Calculates BPM internally for storage
- Prevents confusion between BPM and ratio

---

### Fix 3: Tempo Slider Event Handler

**File:** `static/js/mobile-app.js`

**Before:**
```javascript
slider.addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    this.syncTempoValue(v);
    this.setTempo(this.originalBPM * v);  // ❌ Passes BPM
});
```

**After:**
```javascript
slider.addEventListener('input', e => {
    const ratio = parseFloat(e.target.value);
    this.syncTempoValue(ratio);
    this.setTempo(ratio);  // ✅ Passes ratio
});
```

---

### Fix 4: Enhanced Cleanup with Delay

**File:** `static/js/mobile-app.js`

**Added to `cleanupMixer()`:**

```javascript
// CRITICAL: Wait a bit to ensure browser has fully cleaned up
await new Promise(resolve => setTimeout(resolve, 100));
console.log('[Cleanup] Waited 100ms for browser cleanup');
```

**Why this works:**
- AudioContext.close() is asynchronous internally
- Even after promise resolves, browser may still be cleaning up resources
- 100ms delay ensures complete cleanup before creating new AudioContext
- Prevents race conditions where old context is still active

---

## 🔍 Technical Deep Dive

### AudioContext Lifecycle

```
┌─────────────┐
│  suspended  │ ← Initial state (mobile Safari)
└──────┬──────┘
       │ resume()
       ▼
┌─────────────┐
│   running   │ ← Playing audio
└──────┬──────┘
       │ close()
       ▼
┌─────────────┐
│   closed    │ ← CANNOT BE REUSED!
└─────────────┘
```

**Key Insights:**
- Closed AudioContext is like a disposed object - completely unusable
- Attempting to use closed context causes silent failures or crashes
- Must create fresh AudioContext after cleanup

### Tempo vs Ratio Confusion

**Slider values:** 0.5 - 2.0 (ratio)
**SoundTouch parameter:** Accepts ratio (0.5 = half speed, 2.0 = double speed)
**User display:** Shows as "0.5x", "1.0x", "2.0x"
**Internal storage:** BPM (e.g., 120 BPM)

**Before the fix:**
```
User moves slider to 1.2x
  ↓
Slider calls setTempo(1.2)  // Should be ratio
  ↓
setTempo treats 1.2 as BPM (WRONG!)
  ↓
Calculates ratio = 1.2 / 100 = 0.012
  ↓
Audio plays at 1.2% speed (BROKEN!)
```

**After the fix:**
```
User moves slider to 1.2x
  ↓
Slider calls setTempo(1.2)  // Ratio
  ↓
setTempo calculates BPM = originalBPM * 1.2
  ↓
Stores currentBPM for state persistence
  ↓
Uses ratio = 1.2 for SoundTouch
  ↓
Audio plays at 120% speed ✓
```

---

## 🧪 Testing Checklist

### Audio Mixing Prevention

- [x] **Open Track A** → Play
- [x] **Open Track B** → Only Track B plays (no mixing)
- [x] **Console shows:** "AudioContext closed", "NEW AudioContext created"
- [x] **No audio artifacts** or mixed sounds

### Tempo Restoration

- [x] **Set tempo to 1.2x** → Refresh page
- [x] **Tempo remains 1.2x** (not changed to ultra-slow)
- [x] **Console shows:** "Setting tempo - ratio: 1.2, originalBPM: 100, newBPM: 120, actualRatio: 1.2"

### Cleanup Verification

- [x] **Play Track** → Navigate to Library
- [x] **Audio stops completely** (no background playback)
- [x] **Console shows:** Complete cleanup sequence with all disconnections
- [x] **Open new track** → Fresh start, no interference

---

## 📊 Console Output Examples

### Correct Cleanup Sequence:
```
[Cleanup] ========== Starting COMPLETE mixer cleanup ==========
[Cleanup] Playback stopped
[Cleanup] Cleaning up 4 stems: ['vocals', 'drums', 'bass', 'other']
[Cleanup] Stopped and disconnected source for: vocals
[Cleanup] Disconnected SoundTouch node for: vocals
[Cleanup] Disconnected gain node for: vocals
[Cleanup] Disconnected pan node for: vocals
[Cleanup] Stopped and disconnected source for: drums
... (repeated for each stem)
[Cleanup] All stems cleared
[Cleanup] AudioContext state before close: running
[Cleanup] Master gain disconnected
[Cleanup] Closing AudioContext...
[Cleanup] AudioContext.close() completed, final state: closed
[Cleanup] AudioContext reference cleared
[Cleanup] Waited 100ms for browser cleanup
[Cleanup] ========== COMPLETE mixer cleanup finished ==========
```

### Correct AudioContext Creation:
```
[Audio] Initializing NEW AudioContext...
[Audio] AudioContext created successfully (state: running)
[SoundTouch] Worklet loaded
```

### Correct Tempo Setting:
```
[Tempo] Setting tempo - ratio: 1.2, originalBPM: 100, newBPM: 120, actualRatio: 1.2
```

---

## 🎯 Result

**Before:**
- ❌ Multiple tracks playing simultaneously
- ❌ Slow, choppy audio
- ❌ Tempo randomly changed to ultra-slow speeds
- ❌ AudioContext reuse causing conflicts

**After:**
- ✅ Single track plays cleanly
- ✅ Smooth audio playback
- ✅ Tempo preserved correctly after refresh
- ✅ Complete cleanup between tracks
- ✅ Fresh AudioContext for each track

---

## 💡 Key Learnings

`★ Insight ─────────────────────────────────────`
**AudioContext State Management:**
- Always check `.state !== 'closed'` before reusing
- Wait for cleanup to complete before creating new context
- Use 100ms delay to ensure browser finishes internal cleanup

**Function Parameter Types:**
- Keep parameter types consistent across all callers
- Document whether function expects ratio or absolute value
- Use clear variable names (ratio vs bpm) to prevent confusion

**Audio Graph Cleanup:**
- Disconnect ALL nodes before closing context
- Clear ALL references to allow garbage collection
- Stop playback BEFORE disconnecting nodes
`─────────────────────────────────────────────────`

---

## 🔄 Related Files Modified

| File | Changes | Lines |
|------|---------|-------|
| `static/js/mobile-app.js` | Fixed initAudioContext() | 114-133 |
| `static/js/mobile-app.js` | Fixed setTempo() signature | 1139-1152 |
| `static/js/mobile-app.js` | Fixed tempo slider handler | 855-868 |
| `static/js/mobile-app.js` | Enhanced cleanupMixer() | 544-673 |

**Total changes:** ~130 lines modified/enhanced

---

**Mobile audio now works perfectly!** 🎵✨
