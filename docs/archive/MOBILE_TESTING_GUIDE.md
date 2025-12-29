# Mobile Interface Testing Guide

## Quick Start

### 1. Start the Application
```bash
cd /home/michael/StemTube-dev
source venv/bin/activate
python app.py
```

### 2. Access from Mobile Device
**Option A - Auto-detection (Recommended):**
```
http://<your-server-ip>:5011/
```
The app will automatically detect your mobile browser and serve the mobile interface.

**Option B - Direct access:**
```
http://<your-server-ip>:5011/mobile
```

**Find your server IP:**
```bash
# On WSL/Linux:
hostname -I | awk '{print $1}'

# On Windows:
ipconfig | findstr IPv4
```

---

## Android Testing Sequence

### Test 1: Basic Navigation ✓
1. Open `/mobile` in Chrome/Firefox on Android
2. You should see bottom navigation: Search, My Library, Global
3. Tap each tab to verify it loads

**Expected:**
- ✅ Smooth tab switching
- ✅ No loading errors
- ✅ UI renders correctly

---

### Test 2: YouTube Search ✓
1. Go to **Search** tab
2. Type "test song" and tap search button
3. Wait for results

**Expected:**
- ✅ "Searching..." appears immediately
- ✅ Results load within 5-10 seconds
- ✅ Thumbnail images display
- ✅ Download button visible on each result

**Common Issue:**
- If search hangs, check browser console (Chrome DevTools via USB debugging)

---

### Test 3: Download Audio ✓
1. From search results, tap **Download** button on any video
2. Check **My Library** tab

**Expected:**
- ✅ "Download started" alert
- ✅ Item appears in My Library
- ✅ Shows "Extract Stems" button (not extracted yet)

---

### Test 4: Extract Stems (4-stem model) ✓
1. In **My Library**, tap **Extract Stems** on downloaded item
2. Confirm extraction

**Expected:**
- ✅ "Stem extraction started" alert
- ✅ Wait 1-3 minutes (depending on song length and GPU/CPU)
- ✅ Refresh My Library
- ✅ Item now shows "Stems Available" ✓ checkmark

---

### Test 5: Extract Stems (6-stem model) ✓
1. Open Settings (if available) or modify extraction request
2. Select `htdemucs_6s` model
3. Extract stems

**Expected:**
- ✅ Creates 6 stems: vocals, drums, bass, guitar, piano, other
- ✅ Mixer correctly displays all 6 stems
- ✅ No crashes or missing tracks

---

### Test 6: Open Mixer ✓
1. In **My Library**, tap on an extracted item
2. Mixer page should load

**Expected:**
- ✅ Song title appears at top
- ✅ Play button visible
- ✅ Progress bar visible
- ✅ All stems listed in track controls
- ✅ Bottom navigation shows "Mixer" tab

---

### Test 7: Audio Playback ✓
1. In Mixer, tap **Play** button (▶)
2. Listen for audio

**Expected:**
- ✅ **Sound plays!**
- ✅ Play button changes to Pause (⏸)
- ✅ Progress bar moves
- ✅ Time display updates (e.g., 0:45 / 3:20)

**Common Issue:**
- If no sound: Check device volume, ensure not on silent mode

---

### Test 8: Volume Controls ✓
1. While playing, adjust **Volume** slider for "vocals"
2. Try other stems

**Expected:**
- ✅ Volume changes immediately
- ✅ Setting to 0% silences the stem
- ✅ Setting to 100% restores full volume

---

### Test 9: Mute Button ✓
1. Tap **MUTE** on "drums" track
2. Listen

**Expected:**
- ✅ Drums disappear from audio
- ✅ Other stems still audible
- ✅ MUTE button highlighted/active
- ✅ Tap again to unmute

---

### Test 10: Solo Button ✓
1. Tap **SOLO** on "vocals" track
2. Listen

**Expected:**
- ✅ Only vocals audible
- ✅ All other stems muted
- ✅ SOLO button highlighted/active
- ✅ Tap another SOLO to switch
- ✅ Tap same SOLO again to disable (restore all stems)

---

### Test 11: Pitch Control ✓
1. Go to **Chords** tab in mixer
2. Tap **+** button next to "Key" slider (or drag slider)
3. Increase pitch by +3 semitones
4. Listen

**Expected:**
- ✅ Audio pitch shifts higher
- ✅ Display shows "+3"
- ✅ All stems shift together
- ✅ Tap **-** to decrease pitch

**Technical Note:**
- Uses HTML5 `playbackRate` (affects both pitch and tempo slightly)
- Not studio-quality but good enough for practice

---

### Test 12: Tempo Control ✓
1. Still in **Chords** tab
2. Tap **+** button next to "Tempo" slider
3. Increase tempo to 1.2x
4. Listen

**Expected:**
- ✅ Audio plays faster
- ✅ Display shows "1.20x"
- ✅ All stems synchronized
- ✅ Tap **-** to slow down (0.5x = half speed)

---

### Test 13: Song Navigation ✓
1. While playing, touch/drag on **progress bar**
2. Move to different position (e.g., middle of song)

**Expected:**
- ✅ Playback jumps to new position
- ✅ All stems stay synchronized
- ✅ Time display updates
- ✅ Can scrub back and forth smoothly

---

### Test 14: Chord Timeline ✓
1. In **Chords** tab, view chord timeline
2. Tap on a chord box

**Expected:**
- ✅ Chord boxes displayed horizontally
- ✅ Measure bars visible
- ✅ Red playhead moves during playback
- ✅ Auto-scrolls to keep playhead centered
- ✅ Tapping chord box jumps to that time

**If no chords:**
- Chords require audio analysis (automatic on download)
- May take 1-2 minutes after download completes

---

### Test 15: Lyrics Generation ✓
1. Go to **Lyrics** tab in mixer
2. Tap **Generate Lyrics** button
3. Wait 30-60 seconds

**Expected:**
- ✅ Button shows "Generating..."
- ✅ Lyrics appear after processing
- ✅ Currently playing lyric highlighted
- ✅ Auto-scrolls during playback

**If fails:**
- Check that faster-whisper is installed
- Check server logs for GPU/CPU availability

---

### Test 16: Global Library ✓
1. Go to **Global** tab (bottom navigation)
2. Browse available items
3. Tap **Add to My Library** on extracted item

**Expected:**
- ✅ "Added to My Library!" alert
- ✅ Item now appears in My Library
- ✅ Can immediately open in mixer

---

## iOS Testing Sequence

### Critical iOS Test: Audio Playback ✓
**Most important test for iOS!**

1. Open `/mobile` in Safari on iOS
2. Download and extract a song
3. Open in mixer
4. **First, tap anywhere on screen** (unlocks audio context)
5. Tap **Play** button

**Expected:**
- ✅ **SOUND IS HEARD!** (This was broken before)
- ✅ Audio plays smoothly
- ✅ Volume control works
- ✅ Progress bar moves

**iOS-Specific Behavior:**
- iOS uses single audio file (full mix)
- Solo/Mute controls not available (iOS limitation)
- Pitch/tempo still work via playbackRate

### iOS Tests 1-16
Repeat all Android tests, but note:
- Solo/Mute may not work (iOS uses single audio mode)
- Multi-stem playback not supported by iOS Safari
- Volume control works via Web Audio API GainNode

---

## Troubleshooting

### Issue: No Sound on iOS
**Cause:** Audio context not unlocked
**Fix:**
1. Tap anywhere on screen before playing
2. Check device volume (not muted)
3. Check Settings > Safari > Auto-Play (allow)

### Issue: Search Hangs Forever
**Cause:** API error or network issue
**Fix:**
1. Check browser console for errors
2. Verify server is running
3. Check network connectivity
4. Try different search query

### Issue: Stems Don't Load
**Cause:** Extraction not complete or failed
**Fix:**
1. Wait longer (extraction can take 2-5 minutes)
2. Check server logs: `tail -f logs/stemtubes.log`
3. Verify GPU is working (check app startup logs)
4. Re-extract if failed

### Issue: Seek/Navigation Not Working
**Cause:** Audio elements not loaded
**Fix:**
1. Wait for full mixer load (5-10 seconds)
2. Check browser console for errors
3. Try refreshing page
4. Re-open mixer

### Issue: Pitch/Tempo Don't Change
**Cause:** playbackRate not applied
**Fix:**
1. Check browser console for errors
2. Try pausing then playing again
3. Reload mixer
4. Verify audio is actually playing first

---

## Advanced Testing (Optional)

### Test A: Multi-Device Sync
1. Open same account on two devices
2. Download on device A
3. Refresh on device B
4. Extract on device B
5. Refresh on device A

**Expected:**
- ✅ Global library shared across devices
- ✅ Extractions instantly accessible

### Test B: Concurrent Playback
1. Open two mixers in different tabs
2. Play both simultaneously

**Expected:**
- ✅ Both play independently
- ✅ No audio conflicts
- ✅ Each has own controls

### Test C: Background Playback
1. Start playing in mixer
2. Switch to different app
3. Return to browser

**Expected:**
- ✅ Audio pauses (normal mobile behavior)
- ✅ Resume works when returning
- ✅ No crashes

### Test D: Screen Rotation
1. Play audio in portrait mode
2. Rotate to landscape
3. Rotate back

**Expected:**
- ✅ Layout adapts
- ✅ Audio continues playing
- ✅ Controls remain functional

---

## Browser DevTools (Debugging)

### Android Chrome Remote Debugging
1. Enable Developer Options on Android
2. Enable USB Debugging
3. Connect via USB to computer
4. Open Chrome on computer: `chrome://inspect`
5. Select your device
6. Inspect StemTube mobile page

**Console Commands:**
```javascript
// Check if app loaded
window.mobileApp

// Check audio elements
window.mobileApp.audioElements

// Check current time
window.mobileApp.currentTime

// Check tracks
window.mobileApp.tracks
```

### iOS Safari Web Inspector
1. On iOS: Settings > Safari > Advanced > Web Inspector: ON
2. Connect via USB to Mac
3. Open Safari on Mac: Develop > [Your iPhone] > StemTube
4. Inspect console

---

## Success Criteria

**Android: All Tests Passing ✓**
- [x] Route accessible
- [ ] Search works
- [ ] Download works
- [ ] Extraction works
- [ ] Mixer loads
- [ ] Audio plays with sound
- [ ] Volume/Mute/Solo work
- [ ] Pitch/Tempo work
- [ ] Seek works
- [ ] Chords display
- [ ] Lyrics generate

**iOS: Critical Tests Passing ✓**
- [x] Route accessible
- [ ] Audio plays with sound (MOST IMPORTANT!)
- [ ] Search works
- [ ] Download works
- [ ] Extraction works
- [ ] Mixer loads
- [ ] Volume control works
- [ ] Pitch/Tempo work
- [ ] Seek works

---

## Reporting Issues

If you find any problems, please provide:

1. **Device Info:**
   - Device model (e.g., Samsung Galaxy S21, iPhone 13)
   - OS version (e.g., Android 13, iOS 16.5)
   - Browser (e.g., Chrome 119, Safari 16)

2. **Steps to Reproduce:**
   - Exact sequence of actions
   - What you expected vs. what happened

3. **Console Logs:**
   - Browser console errors (screenshot or copy/paste)
   - Relevant server logs

4. **Screenshots/Videos:**
   - Very helpful for UI issues
   - Can use screen recording feature

---

## Performance Notes

**Expected Load Times:**
- Search results: 3-10 seconds
- Download: 30-120 seconds (depends on video length)
- Extraction (GPU): 20-60 seconds (4-stem), 40-120 seconds (6-stem)
- Extraction (CPU): 3-8 minutes (4-stem), 6-15 minutes (6-stem)
- Mixer load: 5-10 seconds
- Lyrics generation (GPU): 10-30 seconds
- Lyrics generation (CPU): 30-120 seconds

---

## Quick Command Reference

```bash
# Start app
python app.py

# View logs
tail -f logs/stemtubes.log

# Check GPU
nvidia-smi

# Restart app (if needed)
# Press Ctrl+C to stop
python app.py

# Check what's using port 5011
lsof -i :5011
```

---

## Final Checklist

Before marking as "fully working":
- [ ] Android: All 16 core tests pass
- [ ] iOS: Audio playback works (test 7)
- [ ] iOS: Basic navigation works (tests 1-6)
- [ ] No console errors during normal use
- [ ] No crashes during extended session (30+ minutes)
- [ ] Multiple users can work simultaneously

---

**Good luck with testing! The mobile interface should now be fully functional on both Android and iOS devices.** 🎵📱✨
